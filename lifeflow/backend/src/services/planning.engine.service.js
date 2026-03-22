/**
 * Planning Engine Service — محرك التخطيط الذكي
 * ================================================
 * Phase 15: Adaptive Planning Layer
 *
 * Generates daily and weekly adaptive plans based on:
 *  - User energy score and predicted energy curve
 *  - Pending tasks (priority, due dates)
 *  - Habits schedule
 *  - Learning insights (optimal hours, success patterns)
 *  - Decision engine integration
 *
 * Outputs structured timeline with:
 *  - focus_blocks  : high-priority work sessions (energy >= 60)
 *  - low_energy_blocks : light tasks/habits (energy < 50)
 *  - habit_slots   : daily habit windows
 *  - suggestions   : personalized Arabic recommendations
 *
 * Caching: 10-minute TTL per userId (heavy computation avoided on repeat calls)
 */

'use strict';

const moment  = require('moment-timezone');
const logger  = require('../utils/logger');
const learning = require('./learning.engine.service');

// ─── Constants ────────────────────────────────────────────────────────────────
const PLAN_CACHE_TTL_MS  = 10 * 60 * 1000;   // 10 minutes
const FOCUS_BLOCK_MINS   = 90;   // default focus session length
const SHORT_BLOCK_MINS   = 30;   // short task block
const BREAK_MINS         = 15;   // break between blocks

// ─── Cache ────────────────────────────────────────────────────────────────────
const planCache = new Map(); // userId_date → { plan, ts }

function getCachedPlan(userId, dateKey) {
  const key  = `${userId}_${dateKey}`;
  const cached = planCache.get(key);
  if (cached && Date.now() - cached.ts < PLAN_CACHE_TTL_MS) {
    return cached.plan;
  }
  return null;
}

function setCachedPlan(userId, dateKey, plan) {
  planCache.set(`${userId}_${dateKey}`, { plan, ts: Date.now() });
}

// ─── Energy Curve Predictor ───────────────────────────────────────────────────
/**
 * Generate a simple energy curve for a day (0-23 hours).
 * Based on typical circadian rhythm, adjusted by current energy score.
 *
 * @param {number} currentEnergy  - current energy 0-100
 * @param {string} wakeUpTime     - e.g. '07:00'
 * @param {string} sleepTime      - e.g. '23:00'
 * @returns {number[]} energy level per hour (0-23)
 */
function predictEnergyCurve(currentEnergy = 60, wakeUpTime = '07:00', sleepTime = '23:00') {
  const wakeHour  = parseInt(wakeUpTime.split(':')[0], 10);
  const sleepHour = parseInt(sleepTime.split(':')[0], 10);

  const base = new Array(24).fill(0);
  const scale = currentEnergy / 70;   // normalize to 70 as baseline

  for (let h = 0; h < 24; h++) {
    if (h < wakeHour || h >= sleepHour) {
      base[h] = 5;  // sleeping
      continue;
    }

    const awakeHours = h - wakeHour;

    // Typical pattern: rise in morning, peak mid-morning, dip after lunch, second peak afternoon
    if (awakeHours < 1)          base[h] = 40;  // just woke up
    else if (awakeHours < 2)     base[h] = 60;
    else if (awakeHours < 4)     base[h] = 80;  // morning peak
    else if (awakeHours < 5)     base[h] = 85;  // peak
    else if (awakeHours < 6)     base[h] = 75;
    else if (awakeHours < 7)     base[h] = 60;  // post-lunch dip
    else if (awakeHours < 8)     base[h] = 50;  // afternoon slump
    else if (awakeHours < 9)     base[h] = 65;  // afternoon recovery
    else if (awakeHours < 11)    base[h] = 70;  // afternoon peak
    else if (awakeHours < 13)    base[h] = 55;  // winding down
    else                         base[h] = 35;  // evening low
  }

  return base.map(v => Math.min(100, Math.round(v * scale)));
}

// ─── Model Loader ─────────────────────────────────────────────────────────────
function getModels() {
  const models = {};
  try { models.Task  = require('../models/task.model');  } catch (_) {}
  try { models.Habit = require('../models/habit.model'); } catch (_) {}
  return models;
}

// ─── Daily Plan Generator ─────────────────────────────────────────────────────
/**
 * Generate a structured daily plan for a user.
 *
 * @param {string} userId
 * @param {object} ctx  - user context from orchestrator
 * @param {number} ctx.energy
 * @param {number} ctx.mood
 * @param {object} ctx.user         - user record (wake_up_time, sleep_time, timezone)
 * @param {Array}  ctx.tasks        - pending tasks array
 * @param {Array}  ctx.urgentTasks
 * @param {Array}  ctx.overdueTasks
 * @param {Array}  ctx.habits
 * @param {string} ctx.timezone
 *
 * @returns {object} DailyPlan
 */
async function generateDailyPlan(userId, ctx = {}) {
  const timezone   = ctx.timezone || ctx.user?.timezone || 'Africa/Cairo';
  const now        = moment().tz(timezone);
  const dateKey    = now.format('YYYY-MM-DD');

  // Check cache
  const cached = getCachedPlan(userId, dateKey);
  if (cached) {
    logger.debug(`[PLANNING] Returning cached daily plan for ${userId}`);
    return cached;
  }

  const energy     = ctx.energy  || 55;
  const mood       = ctx.mood    || 5;
  const wakeUpTime = ctx.user?.wake_up_time  || '07:00';
  const sleepTime  = ctx.user?.sleep_time    || '23:00';
  const currentHour = now.hour();

  // Get learning insights for this user
  const learningProfile = learning.getUserLearningProfile(userId);
  const optimalHours    = learningProfile.stats.optimalHours || [];

  // Energy curve for today
  const energyCurve = predictEnergyCurve(energy, wakeUpTime, sleepTime);

  // Load tasks if not provided
  let tasks       = ctx.tasks       || [];
  let urgentTasks = ctx.urgentTasks || [];
  let overdueTasks = ctx.overdueTasks || [];
  let habits      = ctx.habits      || [];

  if (tasks.length === 0) {
    try {
      const { Task, Habit } = getModels();
      if (Task) {
        const { Op } = require('sequelize');
        const allTasks = await Task.findAll({
          where: { user_id: userId, status: { [Op.in]: ['pending', 'in_progress'] } },
          order: [['due_date', 'ASC'], ['priority', 'ASC']],
          limit: 20,
          raw: true,
        });
        tasks       = allTasks;
        urgentTasks = allTasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
        overdueTasks = allTasks.filter(t => {
          if (!t.due_date) return false;
          try {
            const dStr = String(t.due_date).replace(' ', 'T').split('T')[0];
            return moment.tz(dStr, 'YYYY-MM-DD', timezone).isBefore(now, 'day');
          } catch (_) { return false; }
        });
      }
      if (Habit) {
        habits = await Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true, limit: 10 });
      }
    } catch (err) {
      logger.warn('[PLANNING] Could not load tasks/habits:', err.message);
    }
  }

  // ── Build timeline blocks ─────────────────────────────────────────────────
  const focusBlocks     = [];
  const lowEnergyBlocks = [];
  const habitSlots      = [];
  const suggestions     = [];

  // Identify high-energy windows (remaining hours today)
  for (let h = currentHour + 1; h < 24 && focusBlocks.length < 3; h++) {
    if (energyCurve[h] >= 65 || optimalHours.includes(h)) {
      focusBlocks.push({
        hour       : h,
        label      : `${h}:00 – ${h + 1}:30`,
        energy     : energyCurve[h],
        durationMins: FOCUS_BLOCK_MINS,
        type       : 'focus',
        optimal    : optimalHours.includes(h),
      });
      h++;  // skip next hour (occupied by this block)
    }
  }

  // Identify low-energy windows for light tasks
  for (let h = currentHour + 1; h < 24 && lowEnergyBlocks.length < 2; h++) {
    if (energyCurve[h] < 50 && energyCurve[h] > 10) {
      lowEnergyBlocks.push({
        hour       : h,
        label      : `${h}:00 – ${h}:30`,
        energy     : energyCurve[h],
        durationMins: SHORT_BLOCK_MINS,
        type       : 'light',
      });
    }
  }

  // Assign tasks to focus blocks
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sortedTasks   = [...tasks].sort((a, b) =>
    (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2)
  );

  focusBlocks.forEach((block, i) => {
    block.tasks = sortedTasks.slice(i * 2, i * 2 + 2).map(t => ({
      id      : t.id,
      title   : t.title,
      priority: t.priority,
    }));
  });

  // Assign light tasks to low-energy blocks
  const lightTasks = tasks.filter(t => t.priority === 'low' || t.priority === 'medium');
  lowEnergyBlocks.forEach((block, i) => {
    block.tasks = lightTasks.slice(i * 2, i * 2 + 2).map(t => ({
      id      : t.id,
      title   : t.title,
      priority: t.priority,
    }));
  });

  // Habit slots (morning + evening)
  const morningHabit  = parseInt(wakeUpTime.split(':')[0], 10) + 1;
  const eveningHabit  = parseInt(sleepTime.split(':')[0], 10) - 1;

  if (habits.length > 0) {
    habitSlots.push({
      hour        : morningHabit,
      label       : `${morningHabit}:00`,
      type        : 'habit_morning',
      habits      : habits.filter(h => h.time_of_day === 'morning' || !h.time_of_day).slice(0, 3),
      durationMins: 20,
    });

    const eveningHabits = habits.filter(h => h.time_of_day === 'evening' || h.time_of_day === 'night');
    if (eveningHabits.length > 0) {
      habitSlots.push({
        hour        : eveningHabit,
        label       : `${eveningHabit}:00`,
        type        : 'habit_evening',
        habits      : eveningHabits.slice(0, 3),
        durationMins: 20,
      });
    }
  }

  // ── Generate Arabic suggestions ───────────────────────────────────────────
  if (energy < 40) {
    suggestions.push({
      type: 'energy_low',
      text: 'طاقتك منخفضة اليوم — ركّز على المهام السهلة وخذ استراحات متكررة ☕',
    });
  }

  if (overdueTasks.length > 0) {
    suggestions.push({
      type: 'overdue_warning',
      text: `لديك ${overdueTasks.length} مهمة متأخرة — ابدأ بأصغرها لتشعر بالإنجاز 💪`,
    });
  }

  if (focusBlocks.length > 0) {
    suggestions.push({
      type: 'focus_reminder',
      text: `أفضل وقت للتركيز اليوم: ${focusBlocks[0].label} (طاقة ${focusBlocks[0].energy}٪) 🎯`,
    });
  }

  if (learningProfile.stats.optimalHours.length > 0) {
    const bestHour = learningProfile.stats.optimalHours[0];
    if (bestHour > currentHour) {
      suggestions.push({
        type: 'learned_optimal',
        text: `بناءً على سجلك، أداؤك الأفضل عادةً الساعة ${bestHour}:00 — حاول جدولة أهم مهمة قبلها 📊`,
      });
    }
  }

  if (mood < 5) {
    suggestions.push({
      type: 'mood_support',
      text: 'مزاجك أقل من المعتاد — ابدأ بشيء صغير وسهل لرفع همتك 🌟',
    });
  }

  // ── Build final plan ──────────────────────────────────────────────────────
  const plan = {
    type       : 'daily',
    date       : dateKey,
    userId,
    currentHour,
    energy,
    mood,
    energyCurve: energyCurve.slice(currentHour, currentHour + 12), // next 12 hours
    timeline   : {
      focusBlocks,
      lowEnergyBlocks,
      habitSlots,
    },
    taskSummary: {
      total  : tasks.length,
      urgent : urgentTasks.length,
      overdue: overdueTasks.length,
    },
    learningInsights: learningProfile.insights.slice(0, 3),
    suggestions,
    generatedAt: now.toISOString(),
  };

  setCachedPlan(userId, dateKey, plan);
  logger.info(`[PLANNING] Daily plan generated for ${userId}: ${focusBlocks.length} focus blocks, ${suggestions.length} suggestions`);

  return plan;
}

// ─── Weekly Plan Generator ─────────────────────────────────────────────────────
/**
 * Generate a structured weekly plan overview.
 *
 * @param {string} userId
 * @param {object} ctx
 * @returns {object} WeeklyPlan
 */
async function generateWeeklyPlan(userId, ctx = {}) {
  const timezone = ctx.timezone || ctx.user?.timezone || 'Africa/Cairo';
  const now      = moment().tz(timezone);
  const weekKey  = `week_${now.isoWeek()}_${now.year()}`;

  const cached = getCachedPlan(userId, weekKey);
  if (cached) return cached;

  const learningProfile = learning.getUserLearningProfile(userId);

  // Load tasks for this week
  let weekTasks = [];
  try {
    const { Task } = getModels();
    if (Task) {
      const { Op } = require('sequelize');
      const weekStart = now.clone().startOf('isoWeek').toDate();
      const weekEnd   = now.clone().endOf('isoWeek').toDate();

      weekTasks = await Task.findAll({
        where: {
          user_id : userId,
          due_date: { [Op.between]: [weekStart, weekEnd] },
          status  : { [Op.in]: ['pending', 'in_progress', 'completed'] },
        },
        order: [['due_date', 'ASC']],
        raw  : true,
      });
    }
  } catch (err) {
    logger.warn('[PLANNING] Weekly plan: could not load tasks:', err.message);
  }

  // Group tasks by day
  const tasksByDay = {};
  for (let i = 0; i < 7; i++) {
    const d = now.clone().startOf('isoWeek').add(i, 'days');
    tasksByDay[d.format('YYYY-MM-DD')] = [];
  }
  for (const t of weekTasks) {
    const d = moment.tz(String(t.due_date).replace(' ', 'T').split('T')[0], 'YYYY-MM-DD', timezone).format('YYYY-MM-DD');
    if (tasksByDay[d]) tasksByDay[d].push(t);
  }

  // Compute workload per day
  const days = Object.entries(tasksByDay).map(([date, tasks]) => {
    const pendingTasks    = tasks.filter(t => t.status !== 'completed');
    const completedTasks  = tasks.filter(t => t.status === 'completed');
    const workloadScore   = Math.min(100, pendingTasks.length * 15 + completedTasks.length * 5);
    return {
      date,
      dayName        : moment(date, 'YYYY-MM-DD').locale('ar').format('dddd'),
      totalTasks     : tasks.length,
      pending        : pendingTasks.length,
      completed      : completedTasks.length,
      workloadScore,
      workloadLabel  : workloadScore > 70 ? 'مرهق' : workloadScore > 40 ? 'متوسط' : 'خفيف',
      tasks          : pendingTasks.slice(0, 5).map(t => ({ title: t.title, priority: t.priority })),
    };
  });

  // Detect overloaded days and suggest redistribution
  const overloadedDays = days.filter(d => d.workloadScore > 70);
  const lightDays      = days.filter(d => d.workloadScore < 30 && d.date >= now.format('YYYY-MM-DD'));
  const weeklySuggestions = [];

  if (overloadedDays.length > 0 && lightDays.length > 0) {
    weeklySuggestions.push({
      type: 'rebalance',
      text: `يوم ${overloadedDays[0].dayName} مُحمَّل جداً — فكّر في نقل بعض مهامه ليوم ${lightDays[0].dayName} 📅`,
    });
  }

  if (learningProfile.stats.optimalHours.length > 0) {
    weeklySuggestions.push({
      type: 'weekly_optimal',
      text: `جدوِل مهامك الكبيرة في الأيام الأولى من الأسبوع وقت الساعة ${learningProfile.stats.optimalHours[0]}:00 للحصول على أفضل أداء 🏆`,
    });
  }

  const completedThisWeek = weekTasks.filter(t => t.status === 'completed').length;
  if (completedThisWeek > 0) {
    weeklySuggestions.push({
      type: 'weekly_achievement',
      text: `أنجزت ${completedThisWeek} مهمة هذا الأسبوع — رائع! استمر في هذا الإيقاع 🌟`,
    });
  }

  const plan = {
    type          : 'weekly',
    week          : weekKey,
    userId,
    days,
    summary       : {
      totalTasks    : weekTasks.length,
      completedTasks: weekTasks.filter(t => t.status === 'completed').length,
      pendingTasks  : weekTasks.filter(t => t.status !== 'completed').length,
      overloadedDays: overloadedDays.length,
      lightDays     : lightDays.length,
    },
    learningInsights: learningProfile.insights.slice(0, 2),
    suggestions     : weeklySuggestions,
    generatedAt     : now.toISOString(),
  };

  setCachedPlan(userId, weekKey, plan);
  logger.info(`[PLANNING] Weekly plan generated for ${userId}: ${days.length} days, ${weeklySuggestions.length} suggestions`);

  return plan;
}

// ─── Quick Suggestion for Decision Engine ────────────────────────────────────
/**
 * Get a planning-aware suggestion for a given action.
 * Used by decision engine to add planning context.
 *
 * @param {string} userId
 * @param {string} action
 * @param {object} context  - { energy, hour }
 * @returns {object} { shouldProceed, optimalTime, suggestion }
 */
function getPlanningRecommendation(userId, action, context = {}) {
  const { energy = 60, hour = new Date().getHours() } = context;
  const stats  = learning.getLearningStats(userId);
  const optimalHours = stats.optimalHours || [];

  let shouldProceed = true;
  let optimalTime   = null;
  let suggestion    = null;

  // Warn if low energy for high-effort actions
  if (['create_task', 'complete_task'].includes(action) && energy < 35) {
    shouldProceed = false;
    suggestion    = 'طاقتك منخفضة الآن — هل تريد تأجيل هذا لوقت أفضل؟';
  }

  // Suggest optimal time if not in optimal window
  if (optimalHours.length > 0 && !optimalHours.includes(hour)) {
    optimalTime = optimalHours[0];
    if (!suggestion) {
      suggestion = `أداؤك التاريخي أفضل الساعة ${optimalTime}:00 — يمكنك التنفيذ الآن أو الجدولة لذلك الوقت`;
    }
  }

  return { shouldProceed, optimalTime, suggestion };
}

// ─── Cache Stats ─────────────────────────────────────────────────────────────
function getCacheStats() {
  return {
    cachedPlans: planCache.size,
    plans: Array.from(planCache.keys()),
  };
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  generateDailyPlan,
  generateWeeklyPlan,
  getPlanningRecommendation,
  predictEnergyCurve,
  getCacheStats,
};
