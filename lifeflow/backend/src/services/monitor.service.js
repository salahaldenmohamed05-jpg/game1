/**
 * Monitor Service — خدمة المراقبة الذاتية الاستباقية
 * =====================================================
 * Runs periodic checks and sends proactive Arabic notifications:
 * - Energy score drop
 * - Mood drop / no mood logged
 * - Overdue tasks accumulation
 * - Habit streak breaks
 * - Burnout risk detection
 * - Positive reinforcement on milestones
 */

'use strict';

const moment = require('moment-timezone');
const logger  = require('../utils/logger');
const { chat } = require('../ai/ai.service');

// Check cooldown: 2 hours per user per check type
const COOLDOWN_MS   = 2 * 60 * 60 * 1000;
const lastChecks    = new Map(); // key: `${userId}_${checkType}`, value: timestamp

function isCooledDown(userId, checkType) {
  const key  = `${userId}_${checkType}`;
  const last = lastChecks.get(key) || 0;
  return Date.now() - last > COOLDOWN_MS;
}

function markChecked(userId, checkType) {
  lastChecks.set(`${userId}_${checkType}`, Date.now());
}

// ─── Model Loader ─────────────────────────────────────────────────────────────
function getModels() {
  const User    = require('../models/user.model');
  const Task    = require('../models/task.model');
  const { Habit } = require('../models/habit.model');
  const MoodEntry = require('../models/mood.model');

  let HabitLog, EnergyLog, ProductivityScore, Notification;
  try { HabitLog = require('../models/habit_log.model'); } catch (_e) { logger.debug(`[MONITOR_SERVICE] Model load failed: ${_e.message}`); }
  try { EnergyLog = require('../models/energy_log.model'); } catch (_e) { logger.debug(`[MONITOR_SERVICE] Model load failed: ${_e.message}`); }
  try { ProductivityScore = require('../models/productivity_score.model'); } catch (_e) { logger.debug(`[MONITOR_SERVICE] Model load failed: ${_e.message}`); }
  try { Notification = require('../models/notification.model'); } catch (_e) { logger.debug(`[MONITOR_SERVICE] Model load failed: ${_e.message}`); }

  return { User, Task, Habit, MoodEntry, HabitLog, EnergyLog, ProductivityScore, Notification };
}

// ─── AI Message Generator ─────────────────────────────────────────────────────
async function generateProactiveMessage(type, data) {
  const PROMPTS = {
    energy_drop:
      `أنت مساعد حياة ودود. المستخدم ${data.name} لديه مستوى طاقة منخفض (${data.energy}/100) اليوم وعنده ${data.pendingTasks} مهمة معلقة. اكتب رسالة تشجيعية قصيرة (جملتان) بالعربية، واقترح إجراءً واحداً عملياً. لا تذكر الأرقام بشكل ممل.`,
    mood_drop:
      `المستخدم ${data.name} مزاجه انخفض هذا الأسبوع. متوسط المزاج: ${data.avgMood}/10. اكتب رسالة تعاطف قصيرة (جملتان) بالعربية واسأله كيف يشعر الآن. كن لطيفاً وإنسانياً.`,
    no_mood_logged:
      `المستخدم ${data.name} لم يسجل مزاجه اليوم (الساعة ${data.hour}:00). اكتب تذكيراً لطيفاً (جملة واحدة) بالعربية يشجعه على تسجيل مزاجه.`,
    overdue_tasks:
      `المستخدم ${data.name} لديه ${data.count} مهام متأخرة أبرزها: ${data.titles}. اكتب رسالة تحفيزية قصيرة (جملتان) بالعربية تشجعه على معالجتها، ولا تكن تهديدية.`,
    habit_streak_break:
      `المستخدم ${data.name} كسر سلسلة عادة "${data.habitName}" (${data.streak} يوم). اكتب رسالة تشجيعية قصيرة (جملتان) بالعربية تحفّزه على العودة للعادة غداً.`,
    burnout_risk:
      `المستخدم ${data.name} لديه مؤشرات على الاحتراق الوظيفي: إنتاجية ${data.productivity}/100، مهام متأخرة كثيرة، مزاج منخفض. اكتب رسالة رعاية قصيرة (3 جمل) بالعربية وأقترح أشياء ثلاثة للراحة.`,
    milestone:
      `المستخدم ${data.name} أنجز ${data.completed} مهمة هذا الأسبوع! اكتب رسالة احتفالية قصيرة (جملتان) بالعربية وشجّعه على الاستمرار.`,
    daily_summary:
      `المستخدم ${data.name}: أنجز ${data.completedToday} مهمة اليوم، طاقته ${data.energy}/100، مزاجه ${data.mood}/10. اكتب ملخصاً تشجيعياً ليومه (3 جمل) بالعربية مع نصيحة بسيطة للغد.`,
  };

  const prompt = PROMPTS[type];
  if (!prompt) return null;

  const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '';
  const hasRealKey = apiKey && apiKey !== 'demo-key' && !apiKey.startsWith('your-') && apiKey.length > 20;

  if (hasRealKey) {
    try {
      return await chat('أنت مساعد حياة شخصي يتحدث بالعربية.', prompt, { temperature: 0.75, maxTokens: 200 });
    } catch (_e) { logger.debug(`[MONITOR_SERVICE] Non-critical operation failed: ${_e.message}`); }
  }

  // Fallback messages
  const fallbacks = {
    energy_drop    : `طاقتك منخفضة قليلاً اليوم يا ${data.name} 💙 خذ استراحة قصيرة واشرب ماءً، ثم ابدأ بمهمة صغيرة.`,
    mood_drop      : `لاحظت أن مزاجك انخفض هذه الأيام يا ${data.name} 💙 كيف تشعر الآن؟ أنا هنا إذا أردت الحديث.`,
    no_mood_logged : `لم تسجل مزاجك بعد اليوم يا ${data.name} 😊 كيف حالك؟`,
    overdue_tasks  : `لديك ${data.count} مهام تنتظرك يا ${data.name} 💪 ابدأ بالأصغر وستشعر بإنجاز رائع!`,
    habit_streak_break: `لا بأس يا ${data.name}، الكمال لله 🌟 ابدأ من جديد غداً بعادة "${data.habitName}"!`,
    burnout_risk   : `انتبه لنفسك يا ${data.name} 💙 استرح، خذ نفساً عميقاً، وتذكر أن راحتك أهم من أي مهمة.`,
    milestone      : `رائع يا ${data.name}! 🎉 أنجزت ${data.completed} مهمة هذا الأسبوع. استمر!`,
    daily_summary  : `يوم جيد يا ${data.name}! أنجزت ${data.completedToday} مهمة اليوم 🌟 استعد لغد أفضل.`,
  };
  return fallbacks[type] || null;
}

// ─── Save Notification ────────────────────────────────────────────────────────
async function saveNotification(userId, type, title, message, io) {
  try {
    const { Notification } = getModels();
    if (!Notification) return;

    const notif = await Notification.create({
      user_id  : userId,
      type     : type,
      title    : title,
      message  : message,
      is_read  : false,
      priority : ['burnout_risk', 'overdue_tasks', 'energy_drop'].includes(type) ? 'high' : 'medium',
    });

    // Push via Socket.IO if available
    if (io) {
      io.to(`user_${userId}`).emit('notification', {
        id      : notif.id,
        type,
        title,
        message,
        timestamp: new Date().toISOString(),
      });
    }

    logger.info(`[MONITOR] Saved notification for user ${userId}: ${type}`);
  } catch (err) {
    logger.warn('[MONITOR] Could not save notification:', err.message);
  }
}

// ─── Individual Checks ────────────────────────────────────────────────────────

async function checkEnergyDrop(user, io) {
  if (!isCooledDown(user.id, 'energy_drop')) return null;

  try {
    const { EnergyLog, Task } = getModels();
    if (!EnergyLog) return null;
    const { Op } = require('sequelize');

    const logs = await EnergyLog.findAll({
      where: { user_id: user.id },
      order: [['log_date', 'DESC']],
      limit: 2,
      raw  : true,
    });

    if (logs.length < 1) return null;
    const energy = logs[0].energy_score || 55;
    if (energy >= 50) return null; // Not low enough

    const pendingTasks = await Task.count({ where: { user_id: user.id, status: 'pending' } });
    const msg = await generateProactiveMessage('energy_drop', {
      name: user.name?.split(' ')[0] || 'صديقي',
      energy,
      pendingTasks,
    });

    if (msg) {
      markChecked(user.id, 'energy_drop');
      await saveNotification(user.id, 'energy_drop', '⚡ طاقتك منخفضة اليوم', msg, io);
      return { type: 'energy_drop', message: msg };
    }
  } catch (err) {
    logger.warn('[MONITOR] checkEnergyDrop error:', err.message);
  }
  return null;
}

async function checkMoodDrop(user, timezone, io) {
  if (!isCooledDown(user.id, 'mood_drop')) return null;

  try {
    const { MoodEntry } = getModels();
    const { Op } = require('sequelize');
    const since7 = moment.tz(timezone).subtract(7, 'days').format('YYYY-MM-DD');
    const today  = moment.tz(timezone).format('YYYY-MM-DD');
    const hour   = moment.tz(timezone).hour();

    const entries = await MoodEntry.findAll({
      where: { user_id: user.id, entry_date: { [Op.gte]: since7 } },
      raw  : true,
      order: [['entry_date', 'DESC']],
    });

    if (entries.length === 0) {
      // No mood logged today reminder (after 2pm)
      if (hour >= 14 && isCooledDown(user.id, 'no_mood_today')) {
        const noMoodToday = !entries.find(e => e.entry_date === today);
        if (noMoodToday) {
          const msg = await generateProactiveMessage('no_mood_logged', {
            name: user.name?.split(' ')[0] || 'صديقي',
            hour,
          });
          if (msg) {
            markChecked(user.id, 'no_mood_today');
            await saveNotification(user.id, 'mood_reminder', '💭 سجّل مزاجك اليوم', msg, io);
            return { type: 'mood_reminder', message: msg };
          }
        }
      }
      return null;
    }

    const avgMood = entries.reduce((s, e) => s + (e.mood_score || 5), 0) / entries.length;
    if (avgMood >= 5) return null; // Mood is okay

    const msg = await generateProactiveMessage('mood_drop', {
      name: user.name?.split(' ')[0] || 'صديقي',
      avgMood: Math.round(avgMood * 10) / 10,
    });

    if (msg) {
      markChecked(user.id, 'mood_drop');
      await saveNotification(user.id, 'mood_drop', '💙 كيف حالك؟', msg, io);
      return { type: 'mood_drop', message: msg };
    }
  } catch (err) {
    logger.warn('[MONITOR] checkMoodDrop error:', err.message);
  }
  return null;
}

async function checkOverdueTasks(user, timezone, io) {
  if (!isCooledDown(user.id, 'overdue')) return null;

  try {
    const { Task } = getModels();
    const { Op }   = require('sequelize');
    const today    = moment.tz(timezone).format('YYYY-MM-DD');

    const overdue = await Task.findAll({
      where: { user_id: user.id, status: 'pending', due_date: { [Op.lt]: today } },
      limit: 5,
      raw  : true,
    });

    if (overdue.length < 2) return null; // Only alert for 2+ overdue tasks

    const msg = await generateProactiveMessage('overdue_tasks', {
      name  : user.name?.split(' ')[0] || 'صديقي',
      count : overdue.length,
      titles: overdue.slice(0,2).map(t => t.title).join('، '),
    });

    if (msg) {
      markChecked(user.id, 'overdue');
      await saveNotification(user.id, 'overdue_tasks', `⚠️ لديك ${overdue.length} مهام متأخرة`, msg, io);
      return { type: 'overdue_tasks', message: msg };
    }
  } catch (err) {
    logger.warn('[MONITOR] checkOverdueTasks error:', err.message);
  }
  return null;
}

async function checkHabitStreaks(user, timezone, io) {
  if (!isCooledDown(user.id, 'habit_streak')) return null;

  try {
    const { Habit, HabitLog } = getModels();
    if (!HabitLog) return null;
    const { Op } = require('sequelize');

    const yesterday = moment.tz(timezone).subtract(1, 'day').format('YYYY-MM-DD');
    const habits    = await Habit.findAll({
      where: { user_id: user.id, is_active: true, current_streak: { [Op.gte]: 3 } },
      limit: 5,
      raw  : true,
    });

    for (const habit of habits) {
      // Check if habit was NOT done yesterday (streak might be breaking)
      const log = await HabitLog.findOne({
        where: { habit_id: habit.id, log_date: yesterday },
        raw  : true,
      });

      if (!log && habit.current_streak >= 3) {
        const msg = await generateProactiveMessage('habit_streak_break', {
          name      : user.name?.split(' ')[0] || 'صديقي',
          habitName : habit.name_ar || habit.name,
          streak    : habit.current_streak,
        });

        if (msg) {
          markChecked(user.id, 'habit_streak');
          await saveNotification(user.id, 'habit_reminder', `🔥 سلسلة عادة "${habit.name_ar || habit.name}"`, msg, io);
          return { type: 'habit_streak_break', message: msg };
        }
      }
    }
  } catch (err) {
    logger.warn('[MONITOR] checkHabitStreaks error:', err.message);
  }
  return null;
}

async function checkBurnoutRisk(user, timezone, io) {
  if (!isCooledDown(user.id, 'burnout')) return null;

  try {
    const { Task, MoodEntry, ProductivityScore } = getModels();
    const { Op } = require('sequelize');
    const since7 = moment.tz(timezone).subtract(7, 'days').format('YYYY-MM-DD');
    const today  = moment.tz(timezone).format('YYYY-MM-DD');

    const [overdue, moodEntries, scores] = await Promise.all([
      Task.count({ where: { user_id: user.id, status: 'pending', due_date: { [Op.lt]: today } } }),
      MoodEntry.findAll({ where: { user_id: user.id, entry_date: { [Op.gte]: since7 } }, raw: true }),
      ProductivityScore
        ? ProductivityScore.findAll({ where: { user_id: user.id, score_date: { [Op.gte]: since7 } }, raw: true })
        : Promise.resolve([]),
    ]);

    const avgMood  = moodEntries.length > 0
      ? moodEntries.reduce((s, e) => s + (e.mood_score || 5), 0) / moodEntries.length : 5;
    const avgProd  = scores.length > 0
      ? scores.reduce((s, r) => s + (r.overall_score || 50), 0) / scores.length : 50;

    // Burnout criteria: low mood + low productivity + many overdue tasks
    const isBurnoutRisk = avgMood < 4.5 && avgProd < 45 && overdue >= 3;
    if (!isBurnoutRisk) return null;

    const msg = await generateProactiveMessage('burnout_risk', {
      name       : user.name?.split(' ')[0] || 'صديقي',
      productivity: Math.round(avgProd),
    });

    if (msg) {
      markChecked(user.id, 'burnout');
      await saveNotification(user.id, 'burnout_risk', '🚨 تنبيه: خطر الاحتراق', msg, io);
      return { type: 'burnout_risk', message: msg };
    }
  } catch (err) {
    logger.warn('[MONITOR] checkBurnoutRisk error:', err.message);
  }
  return null;
}

async function checkMilestone(user, timezone, io) {
  if (!isCooledDown(user.id, 'milestone')) return null;

  try {
    const { Task } = getModels();
    const { Op }   = require('sequelize');
    const since7   = moment.tz(timezone).subtract(7, 'days').startOf('day').toDate();

    const completed = await Task.count({
      where: { user_id: user.id, status: 'completed', completed_at: { [Op.gte]: since7 } },
    });

    // Celebrate at 5, 10, 20... tasks completed this week
    const milestones = [5, 10, 15, 20, 25, 30];
    if (!milestones.includes(completed)) return null;

    const msg = await generateProactiveMessage('milestone', {
      name     : user.name?.split(' ')[0] || 'صديقي',
      completed,
    });

    if (msg) {
      markChecked(user.id, 'milestone');
      await saveNotification(user.id, 'milestone', `🎉 إنجاز! ${completed} مهمة هذا الأسبوع`, msg, io);
      return { type: 'milestone', message: msg };
    }
  } catch (err) {
    logger.warn('[MONITOR] checkMilestone error:', err.message);
  }
  return null;
}

// ─── Run All Checks for One User ─────────────────────────────────────────────
async function runChecksForUser(user, timezone, io) {
  const results = await Promise.allSettled([
    checkEnergyDrop(user, io),
    checkMoodDrop(user, timezone, io),
    checkOverdueTasks(user, timezone, io),
    checkHabitStreaks(user, timezone, io),
    checkBurnoutRisk(user, timezone, io),
    checkMilestone(user, timezone, io),
  ]);

  const alerts = results
    .filter(r => r.status === 'fulfilled' && r.value)
    .map(r => r.value);

  if (alerts.length > 0) {
    logger.info(`[MONITOR] ${alerts.length} proactive alerts generated for user ${user.id}`);
  }
  return alerts;
}

// ─── Main Monitor Scan ────────────────────────────────────────────────────────
async function runMonitorScan(io = null) {
  logger.info('[MONITOR] Starting proactive monitor scan...');

  try {
    const { User } = getModels();
    const users    = await User.findAll({
      where: { is_verified: true },
      attributes: ['id', 'name', 'email', 'timezone'],
      limit: 100,
      raw  : true,
    });

    let totalAlerts = 0;
    for (const user of users) {
      const tz     = user.timezone || 'Africa/Cairo';
      const alerts = await runChecksForUser(user, tz, io);
      totalAlerts += alerts.length;
    }

    logger.info(`[MONITOR] Scan complete. ${totalAlerts} alerts for ${users.length} users.`);
  } catch (err) {
    logger.error('[MONITOR] Monitor scan error:', err.message);
  }
}

// ─── Get Proactive Messages for User (API endpoint) ──────────────────────────
async function getProactiveMessages(userId, timezone = 'Africa/Cairo') {
  try {
    const { User } = getModels();
    const user = await User.findByPk(userId, { raw: true });
    if (!user) return [];

    const alerts = await runChecksForUser(user, timezone, null);
    return alerts.map(a => ({
      type      : a.type,
      message   : a.message,
      priority  : ['burnout_risk', 'overdue_tasks', 'energy_drop'].includes(a.type) ? 'high' : 'medium',
      timestamp : new Date().toISOString(),
    }));
  } catch (err) {
    logger.error('[MONITOR] getProactiveMessages error:', err.message);
    return [];
  }
}

module.exports = {
  runMonitorScan,
  runChecksForUser,
  getProactiveMessages,
  generateProactiveMessage,
};
