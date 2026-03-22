/**
 * Proactive Monitor Service — LifeFlow AI Companion
 * ====================================================
 * يراقب التطبيق المستخدمين تلقائياً ويرسل رسائل ذكية بدون فتح التطبيق.
 *
 * Features:
 *  - Real-time AI monitoring via cron + Socket.IO
 *  - Detects: low energy, overdue tasks, missed habits, mood drops, burnout risk
 *  - Sends AI-generated personalized Arabic messages
 *  - Asks proactive questions to engage users
 *  - Smart cooldown: no spam (min 2h between messages per user)
 *  - All via WebSocket + Notification DB (no FCM required)
 */

'use strict';

const cron    = require('node-cron');
const moment  = require('moment-timezone');
const { Op }  = require('sequelize');
const logger  = require('../utils/logger');
const { chat } = require('../ai/ai.service');

// ─── Cooldown tracker (in-memory) ────────────────────────────────────────────
const lastNotified = new Map(); // userId → timestamp
const COOLDOWN_MS  = 2 * 60 * 60 * 1000; // 2 hours

function canNotify(userId) {
  const last = lastNotified.get(userId) || 0;
  return Date.now() - last > COOLDOWN_MS;
}
function markNotified(userId) {
  lastNotified.set(userId, Date.now());
}

// ─── Lazy model loader ────────────────────────────────────────────────────────
function getModels() {
  const User              = require('../models/user.model');
  const Task              = require('../models/task.model');
  const { Habit, HabitLog } = require('../models/habit.model');
  const MoodEntry         = require('../models/mood.model');
  const EnergyLog         = require('../models/energy_log.model');
  const ProductivityScore = require('../models/productivity_score.model');
  const { Notification }  = require('../models/insight.model');
  return { User, Task, Habit, HabitLog, MoodEntry, EnergyLog, ProductivityScore, Notification };
}

let ioRef = null;

// ─── Emit notification to user ────────────────────────────────────────────────
async function sendToUser(userId, title, body, type = 'ai_proactive', data = {}) {
  try {
    const { Notification } = getModels();
    const notif = await Notification.create({
      user_id: userId,
      type,
      title,
      body,
      data,
      sent_at: new Date(),
      is_sent: true,
    });
    ioRef?.to(`user_${userId}`).emit('notification', {
      id: notif.id, type, title, body, data, createdAt: notif.createdAt,
    });
    ioRef?.to(`user_${userId}`).emit('proactive_message', { title, body, type, data });
    markNotified(userId);
    logger.info(`[PROACTIVE] Sent to ${userId}: ${title}`);
  } catch (err) {
    logger.error('[PROACTIVE] sendToUser error:', err.message);
  }
}

// ─── AI message generator ─────────────────────────────────────────────────────
async function generateAIMessage(context, messageType) {
  const systemPrompts = {
    overdue_tasks: `أنت مساعد LifeFlow المهتم. المستخدم ${context.name} لديه ${context.count} مهام متأخرة.
أرسل رسالة دافئة ومشجعة (2-3 جمل) تحثه على إنجاز أهم مهمة الآن. لا تكن قاسياً.
أعد نصاً عربياً فقط بدون JSON.`,

    mood_check: `أنت مساعد LifeFlow اللطيف. المستخدم ${context.name} لم يسجّل مزاجه اليوم.
أرسل رسالة لطيفة وقصيرة (جملتان) تسأله كيف يشعر وتشجعه على تسجيل مزاجه.
أعد نصاً عربياً فقط بدون JSON.`,

    energy_drop: `أنت مساعد LifeFlow المهتم. المستخدم ${context.name} طاقته منخفضة (${context.energy}/100) اليوم.
أرسل رسالة تعاطفية وعملية (2-3 جمل) تقترح كيف يرفع طاقته الآن.
أعد نصاً عربياً فقط بدون JSON.`,

    habit_reminder: `أنت مساعد LifeFlow المشجع. المستخدم ${context.name} لم يكمل عادة "${context.habitName}" اليوم.
أرسل تذكيراً تحفيزياً وقصيراً (جملتان) يشجعه على إكمالها الآن.
أعد نصاً عربياً فقط بدون JSON.`,

    burnout_alert: `أنت مساعد LifeFlow المتعاطف. المستخدم ${context.name} يظهر علامات إجهاد: إنتاجيته ${context.score}/100 ومزاجه منخفض.
أرسل رسالة دافئة (2-3 جمل) تقترح الراحة واهتمام النفس.
أعد نصاً عربياً فقط بدون JSON.`,

    morning_check: `أنت مساعد LifeFlow الصباحي. المستخدم ${context.name} لديه ${context.taskCount} مهام اليوم.
أرسل تحية صباحية مشجعة وشخصية (2-3 جمل) مع اقتراح لأهم شيء يبدأ به.
أعد نصاً عربياً فقط بدون JSON.`,

    evening_review: `أنت مساعد LifeFlow المسائي. المستخدم ${context.name} أكمل ${context.done}/${context.total} مهام اليوم.
أرسل ملخصاً مسائياً تحفيزياً (2-3 جمل) يشجعه ويذكره بإنجازاته.
أعد نصاً عربياً فقط بدون JSON.`,

    idle_check: `أنت مساعد LifeFlow الحريص. المستخدم ${context.name} لم يستخدم التطبيق منذ ${context.days} أيام.
أرسل رسالة ودية وقصيرة (جملتان) تشجعه على العودة وتذكّره بهدف واحد.
أعد نصاً عربياً فقط بدون JSON.`,
  };

  const sysPrompt = systemPrompts[messageType];
  if (!sysPrompt) return null;

  try {
    const msg = await chat(sysPrompt, `بيانات المستخدم: ${JSON.stringify(context)}`, {
      type: 'proactive',
      maxTokens: 150,
      temperature: 0.8,
    });
    return typeof msg === 'string' ? msg : null;
  } catch (e) {
    logger.warn('[PROACTIVE] AI generation failed:', e.message);
    return null;
  }
}

// Fallback messages
const FALLBACKS = {
  overdue_tasks: (ctx) => `${ctx.name}، لديك ${ctx.count} مهام متأخرة 📋 ابدأ بأهم واحدة الآن، خطوة صغيرة تُحدث فرقاً كبيراً!`,
  mood_check: (ctx) => `${ctx.name}، كيف حالك اليوم؟ 😊 سجّل مزاجك الآن حتى نتابع رفاهيتك معاً.`,
  energy_drop: (ctx) => `${ctx.name}، طاقتك تحتاج دعماً 💧 جرّب شرب كوب ماء وأخذ استراحة قصيرة 5 دقائق.`,
  habit_reminder: (ctx) => `${ctx.name}، تذكّر عادة "${ctx.habitName}" اليوم! ⚡ ثلاث دقائق كافية للبدء.`,
  burnout_alert: (ctx) => `${ctx.name}، جسمك وعقلك يستحقان الراحة 🌿 خذ استراحة اليوم، الغد سيكون أفضل.`,
  morning_check: (ctx) => `صباح النور ${ctx.name}! ☀️ لديك ${ctx.taskCount} مهام اليوم. ابدأ بأهمها وستشعر بالإنجاز!`,
  evening_review: (ctx) => `مساء الخير ${ctx.name}! 🌙 أنجزت ${ctx.done}/${ctx.total} مهام اليوم. كل خطوة تحتسب!`,
  idle_check: (ctx) => `${ctx.name}، نفتقدك في LifeFlow! 💙 عُد لمتابعة أهدافك، نحن هنا لدعمك.`,
};

async function buildMessage(messageType, context) {
  const aiMsg = await generateAIMessage(context, messageType);
  return aiMsg || FALLBACKS[messageType]?.(context) || 'LifeFlow يتابعك ويهتم بك 💙';
}

// ─── Monitor functions ────────────────────────────────────────────────────────

/**
 * Check overdue tasks every 2 hours
 */
async function checkOverdueTasks() {
  try {
    const { User, Task } = getModels();
    const users = await User.findAll({ where: { is_active: true, notifications_enabled: true }, raw: true });
    const today = moment().tz('Africa/Cairo').format('YYYY-MM-DD');
    const hour  = moment().tz('Africa/Cairo').hour();
    if (hour < 9 || hour > 22) return; // Only during active hours

    for (const user of users) {
      if (!canNotify(user.id)) continue;
      const overdueTasks = await Task.findAll({
        where: {
          user_id: user.id,
          status: 'pending',
          due_date: { [Op.lt]: today },
        },
        limit: 5, raw: true,
      });

      if (overdueTasks.length >= 2) {
        const ctx = { name: user.name.split(' ')[0], count: overdueTasks.length, topTask: overdueTasks[0]?.title };
        const body = await buildMessage('overdue_tasks', ctx);
        await sendToUser(user.id, `⏰ ${overdueTasks.length} مهام تحتاج اهتمامك`, body, 'overdue_reminder', { tasks: overdueTasks.slice(0,3).map(t => t.title) });
      }
    }
  } catch (err) {
    logger.error('[PROACTIVE] checkOverdueTasks error:', err.message);
  }
}

/**
 * Daily mood check-in reminder at 2 PM and 7 PM
 */
async function checkMoodCheckIn() {
  try {
    const { User, MoodEntry } = getModels();
    const users = await User.findAll({ where: { is_active: true, notifications_enabled: true }, raw: true });

    for (const user of users) {
      if (!canNotify(user.id)) continue;
      const tz    = user.timezone || 'Africa/Cairo';
      const today = moment().tz(tz).format('YYYY-MM-DD');
      const entry = await MoodEntry.findOne({ where: { user_id: user.id, entry_date: today } });

      if (!entry) {
        const ctx  = { name: user.name.split(' ')[0] };
        const body = await buildMessage('mood_check', ctx);
        await sendToUser(user.id, '💭 كيف مزاجك اليوم؟', body, 'mood_prompt', { action: 'open_mood' });
      }
    }
  } catch (err) {
    logger.error('[PROACTIVE] checkMoodCheckIn error:', err.message);
  }
}

/**
 * Check energy drop and send recovery suggestions
 */
async function checkEnergyLevels() {
  try {
    const { User, EnergyLog } = getModels();
    const users = await User.findAll({ where: { is_active: true, notifications_enabled: true }, raw: true });
    const today = moment().tz('Africa/Cairo').format('YYYY-MM-DD');
    const hour  = moment().tz('Africa/Cairo').hour();
    if (hour < 10 || hour > 18) return;

    for (const user of users) {
      if (!canNotify(user.id)) continue;
      const energyLog = await EnergyLog.findOne({
        where: { user_id: user.id, log_date: today },
        order: [['log_date', 'DESC']],
      });

      const energy = energyLog?.energy_score || null;
      if (energy !== null && energy < 35) {
        const ctx  = { name: user.name.split(' ')[0], energy };
        const body = await buildMessage('energy_drop', ctx);
        await sendToUser(user.id, '⚡ طاقتك منخفضة — وقت الراحة', body, 'energy_alert', { energy_score: energy });
      }
    }
  } catch (err) {
    logger.error('[PROACTIVE] checkEnergyLevels error:', err.message);
  }
}

/**
 * Send habit reminders for uncompleted habits (11 AM & 5 PM)
 */
async function checkHabitReminders() {
  try {
    const { User, Habit, HabitLog } = getModels();
    const users = await User.findAll({ where: { is_active: true, notifications_enabled: true }, raw: true });
    const tz    = 'Africa/Cairo';
    const today = moment().tz(tz).format('YYYY-MM-DD');
    const hour  = moment().tz(tz).hour();
    if (hour < 10 || hour > 20) return;

    for (const user of users) {
      if (!canNotify(user.id)) continue;
      const habits = await Habit.findAll({
        where: { user_id: user.id, is_active: true },
        raw: true, limit: 10,
      });
      if (!habits.length) continue;

      const completedToday = await HabitLog.findAll({
        where: { user_id: user.id, log_date: today, completed: true },
        raw: true,
      });
      const completedIds = new Set(completedToday.map(l => l.habit_id));
      const pendingHabits = habits.filter(h => !completedIds.has(h.id));

      if (pendingHabits.length >= 2) {
        const habitName = pendingHabits[0]?.name || 'عادتك اليومية';
        const ctx  = { name: user.name.split(' ')[0], habitName, count: pendingHabits.length };
        const body = await buildMessage('habit_reminder', ctx);
        await sendToUser(user.id, `🎯 ${pendingHabits.length} عادات في انتظارك`, body, 'habit_reminder', {
          pending_habits: pendingHabits.slice(0,3).map(h => h.name),
        });
      }
    }
  } catch (err) {
    logger.error('[PROACTIVE] checkHabitReminders error:', err.message);
  }
}

/**
 * Detect burnout risk (low productivity + low mood)
 */
async function checkBurnoutRisk() {
  try {
    const { User, ProductivityScore, MoodEntry } = getModels();
    const users = await User.findAll({ where: { is_active: true, notifications_enabled: true }, raw: true });
    const since5 = moment().tz('Africa/Cairo').subtract(5, 'days').format('YYYY-MM-DD');

    for (const user of users) {
      if (!canNotify(user.id)) continue;
      const tz = user.timezone || 'Africa/Cairo';

      const [scores, moods] = await Promise.all([
        ProductivityScore.findAll({ where: { user_id: user.id, score_date: { [Op.gte]: since5 } }, raw: true }),
        MoodEntry.findAll({ where: { user_id: user.id, entry_date: { [Op.gte]: since5 } }, raw: true }),
      ]);

      if (scores.length < 2 || moods.length < 2) continue;

      const avgScore = scores.reduce((s, r) => s + (r.overall_score || 50), 0) / scores.length;
      const avgMood  = moods.reduce((s, m) => s + (m.mood_score || 5), 0) / moods.length;

      if (avgScore < 35 && avgMood < 4) {
        const ctx  = { name: user.name.split(' ')[0], score: Math.round(avgScore), mood: avgMood.toFixed(1) };
        const body = await buildMessage('burnout_alert', ctx);
        await sendToUser(user.id, '🌿 أنت تستحق الراحة', body, 'burnout_alert', {
          avg_productivity: Math.round(avgScore),
          avg_mood: avgMood.toFixed(1),
        });
      }
    }
  } catch (err) {
    logger.error('[PROACTIVE] checkBurnoutRisk error:', err.message);
  }
}

/**
 * Morning AI briefing (7:30 AM)
 */
async function sendMorningAIBriefing() {
  try {
    const { User, Task } = getModels();
    const users = await User.findAll({ where: { is_active: true, notifications_enabled: true }, raw: true });
    const today = moment().tz('Africa/Cairo').format('YYYY-MM-DD');

    for (const user of users) {
      const tz       = user.timezone || 'Africa/Cairo';
      const todayTz  = moment().tz(tz).format('YYYY-MM-DD');
      const tasks    = await Task.findAll({
        where: { user_id: user.id, status: 'pending', due_date: todayTz },
        raw: true, limit: 5,
      });

      const ctx  = { name: user.name.split(' ')[0], taskCount: tasks.length, topTask: tasks[0]?.title };
      const body = await buildMessage('morning_check', ctx);
      await sendToUser(user.id, `☀️ صباح الخير ${user.name.split(' ')[0]}!`, body, 'morning_briefing', {
        task_count: tasks.length, tasks: tasks.slice(0,3).map(t => t.title),
      });
    }
  } catch (err) {
    logger.error('[PROACTIVE] sendMorningAIBriefing error:', err.message);
  }
}

/**
 * Evening review (9 PM)
 */
async function sendEveningAIReview() {
  try {
    const { User, Task } = getModels();
    const users = await User.findAll({ where: { is_active: true, notifications_enabled: true }, raw: true });

    for (const user of users) {
      const tz      = user.timezone || 'Africa/Cairo';
      const todayTz = moment().tz(tz).format('YYYY-MM-DD');
      const [done, total] = await Promise.all([
        Task.count({ where: { user_id: user.id, status: 'completed', due_date: todayTz } }),
        Task.count({ where: { user_id: user.id, due_date: todayTz } }),
      ]);

      if (total === 0) continue;

      const ctx  = { name: user.name.split(' ')[0], done, total };
      const body = await buildMessage('evening_review', ctx);
      await sendToUser(user.id, `🌙 مراجعة يومك`, body, 'evening_review', { done, total });
    }
  } catch (err) {
    logger.error('[PROACTIVE] sendEveningAIReview error:', err.message);
  }
}

/**
 * Detect idle users (no activity for 2+ days)
 */
async function checkIdleUsers() {
  try {
    const { User } = getModels();
    const twoDaysAgo = moment().subtract(2, 'days').toDate();
    const users = await User.findAll({
      where: {
        is_active: true,
        notifications_enabled: true,
        last_active: { [Op.lt]: twoDaysAgo },
      },
      raw: true,
    });

    for (const user of users) {
      if (!canNotify(user.id)) continue;
      const days = moment().diff(moment(user.last_active), 'days');
      const ctx  = { name: user.name.split(' ')[0], days };
      const body = await buildMessage('idle_check', ctx);
      await sendToUser(user.id, '💙 نفتقدك في LifeFlow', body, 'idle_check', { days_inactive: days });
    }
  } catch (err) {
    logger.error('[PROACTIVE] checkIdleUsers error:', err.message);
  }
}

// ─── Proactive question feature ──────────────────────────────────────────────
/**
 * Ask users a personalized AI-generated question daily
 */
async function sendDailyQuestion() {
  try {
    const { User, MoodEntry, EnergyLog } = getModels();
    const hour = moment().tz('Africa/Cairo').hour();
    if (hour !== 12 && hour !== 13) return; // Only at noon

    const users = await User.findAll({ where: { is_active: true, notifications_enabled: true }, raw: true });
    const today = moment().tz('Africa/Cairo').format('YYYY-MM-DD');

    const questions = [
      'ما هو الشيء الواحد الذي لو أنجزته اليوم ستشعر بالرضا؟',
      'كيف تصف تركيزك الآن من 1 إلى 10؟',
      'هل أخذت استراحة كافية اليوم؟',
      'ما الذي يشغل تفكيرك أكثر شيء الآن؟',
      'هل عادتك الأهم اليوم في الطريق الصحيح؟',
      'ما الذي تتمنى لو أنجزته قبل نهاية اليوم؟',
      'كيف مزاجك الآن؟ سجّله في التطبيق وأخبرنا!',
    ];

    for (const user of users) {
      if (!canNotify(user.id)) continue;
      const q = questions[Math.floor(Math.random() * questions.length)];
      await sendToUser(
        user.id,
        `🤔 سؤال اليوم`,
        q,
        'daily_question',
        { question: q, action: 'open_copilot' }
      );
    }
  } catch (err) {
    logger.error('[PROACTIVE] sendDailyQuestion error:', err.message);
  }
}

// ─── Initialize proactive monitoring ─────────────────────────────────────────
function initProactiveMonitor(io) {
  ioRef = io;
  logger.info('🤖 Initializing Proactive AI Monitor...');

  // Morning AI briefing — 7:30 AM
  cron.schedule('30 7 * * *', sendMorningAIBriefing, { timezone: 'Africa/Cairo' });

  // Mood check-in reminders — 2 PM and 7 PM
  cron.schedule('0 14,19 * * *', checkMoodCheckIn, { timezone: 'Africa/Cairo' });

  // Energy check — every 2 hours during work hours
  cron.schedule('0 10,12,14,16,18 * * *', checkEnergyLevels, { timezone: 'Africa/Cairo' });

  // Habit reminders — 11 AM and 5 PM
  cron.schedule('0 11,17 * * *', checkHabitReminders, { timezone: 'Africa/Cairo' });

  // Overdue tasks check — 10 AM, 1 PM, 4 PM
  cron.schedule('0 10,13,16 * * *', checkOverdueTasks, { timezone: 'Africa/Cairo' });

  // Burnout risk analysis — 6 PM
  cron.schedule('0 18 * * *', checkBurnoutRisk, { timezone: 'Africa/Cairo' });

  // Evening review — 9 PM
  cron.schedule('0 21 * * *', sendEveningAIReview, { timezone: 'Africa/Cairo' });

  // Daily question — noon
  cron.schedule('0 12 * * *', sendDailyQuestion, { timezone: 'Africa/Cairo' });

  // Idle user check — weekly (Sunday 10 AM)
  cron.schedule('0 10 * * 0', checkIdleUsers, { timezone: 'Africa/Cairo' });

  logger.info('✅ Proactive AI Monitor initialized — watching all users');
}

// ─── Manual trigger (for testing) ────────────────────────────────────────────
async function triggerNow(userId, type) {
  const { User, Task, MoodEntry, EnergyLog } = getModels();
  const user = await User.findByPk(userId, { raw: true });
  if (!user) return { error: 'User not found' };

  const tz    = user.timezone || 'Africa/Cairo';
  const today = moment().tz(tz).format('YYYY-MM-DD');
  const name  = user.name.split(' ')[0];

  const contextBuilders = {
    morning_check: async () => {
      const tasks = await Task.findAll({ where: { user_id: userId, status: 'pending', due_date: today }, raw: true, limit: 5 });
      return { name, taskCount: tasks.length, topTask: tasks[0]?.title };
    },
    mood_check: async () => ({ name }),
    overdue_tasks: async () => {
      const tasks = await Task.findAll({ where: { user_id: userId, status: 'pending', due_date: { [Op.lt]: today } }, raw: true, limit: 5 });
      return { name, count: tasks.length, topTask: tasks[0]?.title };
    },
    energy_drop: async () => {
      const log = await EnergyLog.findOne({ where: { user_id: userId }, order: [['log_date', 'DESC']] });
      return { name, energy: log?.energy_score || 50 };
    },
  };

  const ctx = await (contextBuilders[type] || contextBuilders.morning_check)();
  const body = await buildMessage(type || 'morning_check', ctx);
  await sendToUser(userId, `🤖 رسالة استباقية`, body, type || 'morning_check', ctx);
  return { sent: true, body };
}

module.exports = { initProactiveMonitor, triggerNow, sendToUser };
