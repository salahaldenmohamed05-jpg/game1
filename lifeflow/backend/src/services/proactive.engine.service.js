/**
 * Proactive Engine Service — محرك الاستباقية
 * =============================================
 * Runs periodic checks every few hours.
 * Checks:
 *  1. Energy score drop (< 50)
 *  2. Stress increase / mood drop
 *  3. Overdue tasks accumulation
 *  4. Habit streak breaks
 *  5. Burnout risk (combined signals)
 *  6. Positive milestones (celebrate wins)
 *
 * Limits:
 *  - Max 3 notifications per user per day
 *  - Cooldown per check type: 2 hours
 *  - Respects user preferences (adaptive)
 *
 * Sends: proactive Arabic suggestion messages
 */

'use strict';

const moment = require('moment-timezone');
const logger  = require('../utils/logger');

// ─── Rate Limiting ────────────────────────────────────────────────────────────
const MAX_DAILY_NOTIFICATIONS = 3;
const COOLDOWN_MS = 2 * 60 * 60 * 1000;  // 2 hours per check type

// In-memory tracking
const notifCounts = new Map();  // userId_date → count
const cooldowns   = new Map();  // userId_checkType → timestamp

function getDailyCount(userId) {
  const date = new Date().toISOString().slice(0, 10);
  return notifCounts.get(`${userId}_${date}`) || 0;
}

function incrementDailyCount(userId) {
  const date = new Date().toISOString().slice(0, 10);
  const key  = `${userId}_${date}`;
  notifCounts.set(key, (notifCounts.get(key) || 0) + 1);
}

function isCooledDown(userId, checkType) {
  const key  = `${userId}_${checkType}`;
  const last = cooldowns.get(key) || 0;
  return Date.now() - last > COOLDOWN_MS;
}

function markChecked(userId, checkType) {
  cooldowns.set(`${userId}_${checkType}`, Date.now());
}

// ─── Model Loader ─────────────────────────────────────────────────────────────
function getModels() {
  const models = {};
  try { models.Task = require('../models/task.model'); } catch (_e) { logger.debug(`[PROACTIVE_ENGINE_SERVICE] Model load failed: ${_e.message}`); }
  try { models.Habit = require('../models/habit.model').Habit; } catch (_e) { logger.debug(`[PROACTIVE_ENGINE_SERVICE] Model load failed: ${_e.message}`); }
  try { models.MoodEntry = require('../models/mood.model'); } catch (_e) { logger.debug(`[PROACTIVE_ENGINE_SERVICE] Model load failed: ${_e.message}`); }
  try { models.HabitLog = require('../models/habit_log.model'); } catch (_e) { logger.debug(`[PROACTIVE_ENGINE_SERVICE] Model load failed: ${_e.message}`); }
  try { models.ProductivityScore = require('../models/productivity_score.model'); } catch (_e) { logger.debug(`[PROACTIVE_ENGINE_SERVICE] Model load failed: ${_e.message}`); }
  try { models.EnergyLog = require('../models/energy_log.model'); } catch (_e) { logger.debug(`[PROACTIVE_ENGINE_SERVICE] Model load failed: ${_e.message}`); }
  return models;
}

// ─── AI Message Generator (lazy import) ──────────────────────────────────────
async function generateMessage(type, data) {
  const STATIC_MESSAGES = {
    energy_drop: (d) =>
      `يا ${d.name}، لاحظت أن طاقتك منخفضة قليلاً اليوم ⚡\nخذ استراحة 10 دقائق وتناول شيئاً تحبه. جسمك يستحق ذلك 💙`,

    mood_drop: (d) =>
      `مرحباً ${d.name} 💙\nيبدو أن مزاجك تراجع قليلاً هذا الأسبوع. أنا هنا معك.\nما الذي يضغط عليك؟ أخبرني كي أساعدك.`,

    no_mood_logged: (d) =>
      `مرحباً ${d.name}! لم تسجل مزاجك اليوم بعد 🌤️\nكيف حالك؟ سجّل مزاجك الآن حتى أتابع معك.`,

    overdue_tasks: (d) =>
      `يا ${d.name}، لديك ${d.count} مهمة متأخرة 📋\nأبرزها: ${d.titles}\nهل تريد أن أساعدك في إعادة جدولتها؟`,

    habit_streak_break: (d) =>
      `يا ${d.name}، لم تكمل عادة "${d.habitName}" اليوم 🔄\nلا بأس! كل يوم هو فرصة جديدة. ابدأ غداً وستعود للمسار. 💪`,

    burnout_risk: (d) =>
      `يا ${d.name}، ألاحظ بعض مؤشرات الإرهاق لديك 🌿\nإنتاجيتك ${d.productivity}/100 ومزاجك منخفض.\nأنصحك بـ: ١) نوم كافٍ ٢) تقليل المهام لغداً ٣) نشاط تحبه ولو 15 دقيقة.`,

    milestone: (d) =>
      `🎉 ${d.name}! أنجزت ${d.completed} مهمة هذا الأسبوع!\nهذا إنجاز رائع — استمر على هذا المستوى. أنت تسير بشكل ممتاز! ⭐`,

    daily_summary: (d) =>
      `مساء الخير ${d.name} 🌙\nملخص يومك: أنجزت ${d.completedToday} مهمة ✅، طاقتك ${d.energy}/100، مزاجك ${d.mood || '—'}/10.\n${d.completedToday > 0 ? 'يوم ممتاز!' : 'غداً فرصة أفضل 💪'}`,
  };

  // Try to use AI for more personalized messages
  try {
    const { chat } = require('../ai/ai.service');
    const apiKey   = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '';
    const hasKey   = apiKey && apiKey.length > 20 && !apiKey.startsWith('your-');

    if (hasKey) {
      const PROMPTS = {
        energy_drop:
          `المستخدم ${data.name} طاقته منخفضة (${data.energy}/100) وعنده ${data.pendingTasks} مهمة معلقة. اكتب رسالة تشجيعية قصيرة (جملتان) بالعربية مع اقتراح عملي واحد.`,
        mood_drop:
          `المستخدم ${data.name} مزاجه انخفض. متوسط المزاج: ${data.avgMood}/10. اكتب رسالة تعاطف قصيرة (جملتان) بالعربية واسأله كيف يشعر.`,
        overdue_tasks:
          `المستخدم ${data.name} لديه ${data.count} مهام متأخرة: ${data.titles}. اكتب رسالة تحفيزية قصيرة (جملتان) بالعربية تشجعه على معالجتها.`,
        burnout_risk:
          `المستخدم ${data.name} لديه مؤشرات إرهاق: إنتاجية ${data.productivity}/100، مزاج منخفض. اكتب رسالة رعاية (3 جمل) بالعربية وأقترح 3 أشياء للراحة.`,
        milestone:
          `المستخدم ${data.name} أنجز ${data.completed} مهمة هذا الأسبوع! اكتب رسالة احتفالية قصيرة (جملتان) بالعربية.`,
      };

      if (PROMPTS[type]) {
        const msg = await chat('أنت مساعد حياة شخصي يتحدث بالعربية بشكل طبيعي.', PROMPTS[type], {
          temperature: 0.75,
          maxTokens  : 200,
        });
        if (msg && msg.length > 10) return msg;
      }
    }
  } catch (aiErr) {
    logger.debug('[PROACTIVE-ENGINE] AI message generation failed, using static:', aiErr.message);
  }

  // Fall back to static messages
  const fn = STATIC_MESSAGES[type];
  return fn ? fn(data) : null;
}

// ─── Individual Checks ────────────────────────────────────────────────────────

async function checkEnergyDrop(userId, name, timezone) {
  if (!isCooledDown(userId, 'energy_drop')) return null;

  const { EnergyLog } = getModels();
  if (!EnergyLog) return null;

  try {
    const latest = await EnergyLog.findOne({
      where : { user_id: userId },
      order : [['log_date', 'DESC']],
      raw   : true,
    });

    const energy = latest?.energy_score ?? 55;
    if (energy >= 50) return null;

    const { Task } = getModels();
    const pendingTasks = Task
      ? await Task.count({ where: { user_id: userId, status: 'pending' } })
      : 0;

    markChecked(userId, 'energy_drop');
    const msg = await generateMessage('energy_drop', { name, energy, pendingTasks });

    return {
      type    : 'energy_drop',
      priority: 'medium',
      message : msg,
      data    : { energy, pendingTasks },
    };
  } catch (err) {
    logger.debug('[PROACTIVE-ENGINE] checkEnergyDrop error:', err.message);
    return null;
  }
}

async function checkMoodDrop(userId, name, timezone) {
  if (!isCooledDown(userId, 'mood_drop')) return null;

  const { MoodEntry } = getModels();
  if (!MoodEntry) return null;

  try {
    const { Op } = require('sequelize');
    const since  = moment().tz(timezone).subtract(7, 'days').format('YYYY-MM-DD');
    const today  = moment().tz(timezone).format('YYYY-MM-DD');

    const moods = await MoodEntry.findAll({
      where: { user_id: userId, entry_date: { [Op.gte]: since } },
      raw  : true,
      order: [['entry_date', 'ASC']],
    });

    if (moods.length < 3) {
      // Check if no mood logged today
      const todayMood = moods.find(m => m.entry_date === today);
      if (!todayMood && isCooledDown(userId, 'no_mood')) {
        markChecked(userId, 'no_mood');
        const hour = moment().tz(timezone).hour();
        if (hour >= 10 && hour <= 20) {
          const msg = await generateMessage('no_mood_logged', { name, hour });
          return { type: 'no_mood_logged', priority: 'low', message: msg };
        }
      }
      return null;
    }

    const avgMood = moods.reduce((s, m) => s + m.mood_score, 0) / moods.length;
    if (avgMood >= 5.5) return null;

    // Check trend: is it getting worse?
    const recent = moods.slice(-3);
    const recentAvg = recent.reduce((s, m) => s + m.mood_score, 0) / recent.length;
    if (recentAvg >= 5.5) return null;

    markChecked(userId, 'mood_drop');
    const msg = await generateMessage('mood_drop', { name, avgMood: Math.round(avgMood * 10) / 10 });

    return {
      type    : 'mood_drop',
      priority: 'high',
      message : msg,
      data    : { avgMood: Math.round(avgMood * 10) / 10 },
    };
  } catch (err) {
    logger.debug('[PROACTIVE-ENGINE] checkMoodDrop error:', err.message);
    return null;
  }
}

async function checkOverdueTasks(userId, name, timezone) {
  if (!isCooledDown(userId, 'overdue_tasks')) return null;

  const { Task } = getModels();
  if (!Task) return null;

  try {
    const { Op } = require('sequelize');
    const today  = moment().tz(timezone).format('YYYY-MM-DD');

    const overdue = await Task.findAll({
      where: {
        user_id : userId,
        status  : { [Op.in]: ['pending', 'in_progress'] },
        due_date: { [Op.lt]: today },
      },
      limit: 5,
      raw  : true,
    });

    if (overdue.length < 2) return null;

    markChecked(userId, 'overdue_tasks');
    const titles = overdue.slice(0, 3).map(t => t.title).join('، ');
    const msg    = await generateMessage('overdue_tasks', { name, count: overdue.length, titles });

    return {
      type    : 'overdue_tasks',
      priority: 'high',
      message : msg,
      data    : { count: overdue.length, task_ids: overdue.map(t => t.id), titles },
    };
  } catch (err) {
    logger.debug('[PROACTIVE-ENGINE] checkOverdueTasks error:', err.message);
    return null;
  }
}

async function checkHabitStreaks(userId, name, timezone) {
  if (!isCooledDown(userId, 'habit_streak')) return null;

  const { Habit, HabitLog } = getModels();
  if (!Habit || !HabitLog) return null;

  try {
    const { Op } = require('sequelize');
    const yesterday = moment().tz(timezone).subtract(1, 'day').format('YYYY-MM-DD');

    const habits = await Habit.findAll({
      where: { user_id: userId, is_active: true, current_streak: { [Op.gte]: 2 } },
      raw  : true,
      limit: 5,
    });

    for (const habit of habits) {
      // Check if yesterday was missed
      const logged = await HabitLog.findOne({
        where: { habit_id: habit.id, log_date: yesterday },
        raw  : true,
      });

      if (!logged) {
        markChecked(userId, 'habit_streak');
        const msg = await generateMessage('habit_streak_break', {
          name,
          habitName: habit.name,
          streak   : habit.current_streak,
        });

        return {
          type    : 'habit_streak_break',
          priority: 'medium',
          message : msg,
          data    : { habitName: habit.name, streak: habit.current_streak, habitId: habit.id },
        };
      }
    }

    return null;
  } catch (err) {
    logger.debug('[PROACTIVE-ENGINE] checkHabitStreaks error:', err.message);
    return null;
  }
}

async function checkBurnoutRisk(userId, name, timezone) {
  if (!isCooledDown(userId, 'burnout')) return null;

  const { Task, MoodEntry, ProductivityScore } = getModels();
  if (!Task) return null;

  try {
    const { Op } = require('sequelize');
    const today = moment().tz(timezone).format('YYYY-MM-DD');
    const since7 = moment().tz(timezone).subtract(7, 'days').format('YYYY-MM-DD');

    const [overdue, productivity, recentMoods] = await Promise.all([
      Task.count({
        where: {
          user_id : userId,
          status  : { [Op.in]: ['pending', 'in_progress'] },
          due_date: { [Op.lt]: today },
        },
      }),
      ProductivityScore
        ? ProductivityScore.findAll({
            where: { user_id: userId, score_date: { [Op.gte]: since7 } },
            raw  : true,
          })
        : [],
      MoodEntry
        ? MoodEntry.findAll({
            where: { user_id: userId, entry_date: { [Op.gte]: since7 } },
            raw  : true,
          })
        : [],
    ]);

    const avgProd = productivity.length
      ? productivity.reduce((s, r) => s + (r.overall_score || 50), 0) / productivity.length
      : 50;

    const avgMood = recentMoods.length
      ? recentMoods.reduce((s, m) => s + m.mood_score, 0) / recentMoods.length
      : 5;

    // Burnout risk: overdue > 4 AND productivity < 45 AND mood < 5
    const burnoutScore = (overdue > 4 ? 1 : 0) + (avgProd < 45 ? 1 : 0) + (avgMood < 4.5 ? 1 : 0);
    if (burnoutScore < 2) return null;

    markChecked(userId, 'burnout');
    const msg = await generateMessage('burnout_risk', {
      name,
      productivity: Math.round(avgProd),
      avgMood     : Math.round(avgMood * 10) / 10,
    });

    return {
      type    : 'burnout_risk',
      priority: 'high',
      message : msg,
      data    : { avgProd: Math.round(avgProd), avgMood: Math.round(avgMood * 10) / 10, overdue },
    };
  } catch (err) {
    logger.debug('[PROACTIVE-ENGINE] checkBurnoutRisk error:', err.message);
    return null;
  }
}

async function checkMilestone(userId, name, timezone) {
  if (!isCooledDown(userId, 'milestone')) return null;

  const { Task } = getModels();
  if (!Task) return null;

  try {
    const { Op } = require('sequelize');
    const since7 = moment().tz(timezone).subtract(7, 'days').toDate();

    const completed = await Task.count({
      where: {
        user_id     : userId,
        status      : 'completed',
        completed_at: { [Op.gte]: since7 },
      },
    });

    if (completed < 5) return null;  // Need at least 5 completions in a week

    markChecked(userId, 'milestone');
    const msg = await generateMessage('milestone', { name, completed });

    return {
      type    : 'milestone',
      priority: 'low',
      message : msg,
      data    : { completed },
    };
  } catch (err) {
    logger.debug('[PROACTIVE-ENGINE] checkMilestone error:', err.message);
    return null;
  }
}

// ─── Main: Get Proactive Messages ────────────────────────────────────────────
/**
 * Run all checks for a user and return relevant alerts.
 * Respects max 3 notifications/day limit.
 *
 * @param {string} userId
 * @param {string} timezone
 * @returns {Array} alerts
 */
async function getProactiveMessages(userId, timezone = 'Africa/Cairo') {
  const alerts = [];

  // Phase 15: lazy-load explainability
  let explainability = null;
  try { explainability = require('./explainability.service'); } catch (_e) { logger.debug(`[PROACTIVE_ENGINE_SERVICE] Model load failed: ${_e.message}`); }

  try {
    // Get user name
    let name = 'صديقي';
    try {
      const User = require('../models/user.model');
      const user = await User.findByPk(userId, { raw: true });
      name = user?.name?.split(' ')[0] || 'صديقي';
    } catch (_e) { logger.debug(`[PROACTIVE_ENGINE_SERVICE] Non-critical operation failed: ${_e.message}`); }

    const dailyCount = getDailyCount(userId);
    if (dailyCount >= MAX_DAILY_NOTIFICATIONS) {
      logger.debug(`[PROACTIVE-ENGINE] Daily limit reached for user=${userId}`);
      return [];
    }

    const remaining = MAX_DAILY_NOTIFICATIONS - dailyCount;

    // Run checks in priority order
    const checks = [
      () => checkBurnoutRisk(userId, name, timezone),
      () => checkMoodDrop(userId, name, timezone),
      () => checkEnergyDrop(userId, name, timezone),
      () => checkOverdueTasks(userId, name, timezone),
      () => checkHabitStreaks(userId, name, timezone),
      () => checkMilestone(userId, name, timezone),
    ];

    for (const check of checks) {
      if (alerts.length >= remaining) break;

      try {
        const alert = await check();
        if (alert) {
          // Phase 15: Enrich alert with explainability (confidence + why)
          if (explainability && alert.type) {
            try {
              const explained = explainability.explainProactiveNotification(
                alert.type,
                alert.data || {},
                userId
              );
              alert.confidence = explained.confidence;
              alert.why        = explained.why;
            } catch (_e) { logger.debug(`[PROACTIVE_ENGINE_SERVICE] Non-critical operation failed: ${_e.message}`); }
          }

          alerts.push(alert);
          incrementDailyCount(userId);
        }
      } catch (err) {
        logger.debug('[PROACTIVE-ENGINE] Check error:', err.message);
      }
    }

    logger.info(`[PROACTIVE-ENGINE] Generated ${alerts.length} alerts for user=${userId}`);
    return alerts;

  } catch (err) {
    logger.error('[PROACTIVE-ENGINE] getProactiveMessages error:', err.message);
    return [];
  }
}

// ─── Scheduled Runner ─────────────────────────────────────────────────────────
// Called by the main server scheduler
let isRunning = false;

async function runForAllUsers() {
  if (isRunning) return;
  isRunning = true;

  try {
    const User = require('../models/user.model');
    const users = await User.findAll({
      where     : { is_active: true },
      attributes: ['id', 'name', 'timezone'],
      limit     : 500,
      raw       : true,
    });

    logger.info(`[PROACTIVE-ENGINE] Running for ${users.length} users`);

    for (const user of users) {
      try {
        await getProactiveMessages(user.id, user.timezone || 'Africa/Cairo');
      } catch (userErr) {
        logger.debug(`[PROACTIVE-ENGINE] Error for user=${user.id}:`, userErr.message);
      }
    }
  } catch (err) {
    logger.error('[PROACTIVE-ENGINE] runForAllUsers error:', err.message);
  } finally {
    isRunning = false;
  }
}

// Export
module.exports = {
  getProactiveMessages,
  runForAllUsers,
  checkEnergyDrop,
  checkMoodDrop,
  checkOverdueTasks,
  checkHabitStreaks,
  checkBurnoutRisk,
  checkMilestone,
};
