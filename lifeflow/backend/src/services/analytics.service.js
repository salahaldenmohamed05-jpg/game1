/**
 * Analytics Service v1.0 — LifeFlow Single Source of Truth (Phase O)
 * =====================================================================
 * ALL analytics calculations happen HERE. No frontend math. No duplicates.
 *
 * Consumers:
 *   - GET /api/v1/analytics/overview     → AnalyticsView "Overview" tab
 *   - GET /api/v1/analytics/performance  → AnalyticsView "Performance" tab
 *   - GET /api/v1/analytics/summary      → Dashboard summary card
 *   - GET /api/v1/analytics/unified      → Full unified analytics (all tabs)
 *   - Decision Engine (signalsUsed)      → reads same data via getAnalyticsSnapshot
 *   - Assistant (context)                → reads same data via getAnalyticsSnapshot
 *
 * Rules:
 *   1. Every calculation uses timezone-aware date boundaries
 *   2. Task "today" = tasks due today OR in_progress OR overdue (not just due_date match)
 *   3. Habit "today total" = active habits scheduled for today, not habitLogs.length
 *   4. One formula per metric — no duplicates across controllers
 *   5. All rates are 0–100 integers, all scores are 0–100 integers
 *   6. Raw counts always accompany computed rates
 */

'use strict';

const moment = require('moment-timezone');
const { Op }  = require('sequelize');
const logger  = require('../utils/logger');

// ─── Lazy model loaders (avoid circular deps) ──────────────────────────────
function getModels() {
  const Task               = require('../models/task.model');
  const { Habit, HabitLog } = require('../models/habit.model');
  const MoodEntry          = require('../models/mood.model');
  const ProductivityScore  = require('../models/productivity_score.model');
  return { Task, Habit, HabitLog, MoodEntry, ProductivityScore };
}

function getIntelligence() {
  try { return require('./intelligence.service'); } catch { return null; }
}

function getDecisionEngine() {
  try { return require('./unified.decision.service'); } catch { return null; }
}

// ─── Scoring Weights (single definition) ────────────────────────────────────
const WEIGHTS = {
  productivity: {
    task_completion:  0.40,
    habit_completion: 0.25,
    on_time_rate:     0.20,
    mood_factor:      0.15,
  },
  overall: {
    productivity: 0.40,
    focus:        0.35,
    consistency:  0.25,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// CORE: Timezone-Aware Data Fetcher
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch all raw analytics data for a user on a given date.
 * This is the SINGLE data-gathering function — everything downstream uses this.
 */
async function fetchAnalyticsData(userId, dateStr, timezone = 'Africa/Cairo') {
  const { Task, Habit, HabitLog, MoodEntry, ProductivityScore } = getModels();

  const tz      = timezone || 'Africa/Cairo';
  const today   = dateStr || moment().tz(tz).format('YYYY-MM-DD');
  const dayStart = `${today}T00:00:00`;
  const dayEnd   = `${today}T23:59:59`;
  const nowTz    = moment().tz(tz);

  // ── Fetch everything in parallel ────────────────────────────────────────
  const [allTasks, activeHabits, todayHabitLogs, todayMoods, weekTasks] = await Promise.all([
    // ALL non-deleted tasks (for proper rate calculation)
    Task.findAll({
      where: { user_id: userId },
      order: [['due_date', 'ASC']],
      raw: true,
    }),

    // Active habits (this is the REAL total, not log count)
    Habit.findAll({
      where: { user_id: userId, is_active: true },
    }),

    // Today's habit logs
    HabitLog.findAll({
      where: { user_id: userId, log_date: today },
    }),

    // Today's mood entries
    MoodEntry.findAll({
      where: { user_id: userId, entry_date: today },
    }),

    // This week's tasks (for week progress)
    Task.findAll({
      where: {
        user_id: userId,
        due_date: { [Op.gte]: nowTz.clone().startOf('isoWeek').format('YYYY-MM-DD') },
      },
    }),
  ]);

  // ── Categorize tasks using timezone-aware logic ──────────────────────────
  // "Today tasks" = due today OR currently in_progress
  const todayTasks = allTasks.filter(t => {
    if (t.status === 'in_progress') return true;
    const dueRaw = t.due_date;
    if (!dueRaw) return false;
    const dueStr = typeof dueRaw === 'string' ? dueRaw.split('T')[0].split(' ')[0]
      : (dueRaw instanceof Date && !isNaN(dueRaw)) ? moment(dueRaw).tz(tz).format('YYYY-MM-DD')
      : null;
    return dueStr === today;
  });

  // Overdue = pending/in_progress with due_date before today
  const overdueTasks = allTasks.filter(t => {
    if (t.status === 'completed') return false;
    const dueRaw = t.due_date;
    if (!dueRaw) return false;
    const dueStr = typeof dueRaw === 'string' ? dueRaw.split('T')[0].split(' ')[0]
      : (dueRaw instanceof Date && !isNaN(dueRaw)) ? moment(dueRaw).tz(tz).format('YYYY-MM-DD')
      : null;
    return dueStr && dueStr < today;
  });

  // All pending/in_progress
  const pendingTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');

  // Completed today
  const completedToday = allTasks.filter(t => {
    if (t.status !== 'completed') return false;
    if (!t.completed_at) return false;
    const cStr = moment(t.completed_at).tz(tz).format('YYYY-MM-DD');
    return cStr === today;
  });

  // Habit log map
  const habitLogMap = {};
  todayHabitLogs.forEach(l => { habitLogMap[l.habit_id] = l; });

  // Determine which habits are "due today" based on frequency
  const todayDayIndex = nowTz.day(); // 0=Sun
  const habitsScheduledToday = activeHabits.filter(h => {
    const freq = h.frequency || h.frequency_type || 'daily';
    if (freq === 'daily') return true;
    const customDays = h.custom_days;
    if (Array.isArray(customDays) && customDays.length > 0) {
      return customDays.includes(todayDayIndex);
    }
    const freqConfig = h.frequency_config;
    if (freqConfig?.days && Array.isArray(freqConfig.days)) {
      return freqConfig.days.includes(todayDayIndex);
    }
    return true; // default: treat as daily
  });

  const completedHabitsToday = todayHabitLogs.filter(l => l.completed).length;

  return {
    // Raw data
    allTasks,
    todayTasks,
    overdueTasks,
    pendingTasks,
    completedToday,
    weekTasks,
    activeHabits,
    habitsScheduledToday,
    todayHabitLogs,
    completedHabitsToday,
    habitLogMap,
    todayMoods,
    // Context
    today,
    timezone: tz,
    nowTz,
    hour: nowTz.hour(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// METRIC CALCULATORS (pure functions — no DB access)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Task completion rate for a date range.
 * Rate = completed / (completed + pending + in_progress) for tasks in range.
 */
function calcTaskCompletionRate(tasks) {
  if (tasks.length === 0) return { rate: 0, completed: 0, total: 0 };
  const completed = tasks.filter(t => t.status === 'completed').length;
  return {
    rate: Math.round((completed / tasks.length) * 100),
    completed,
    total: tasks.length,
  };
}

/**
 * Habit completion rate for today.
 * total = habits scheduled for today (not log count)
 * completed = logs where completed=true
 */
function calcHabitCompletionRate(scheduledCount, completedCount) {
  if (scheduledCount === 0) return { rate: 0, completed: 0, total: 0 };
  return {
    rate: Math.round((completedCount / scheduledCount) * 100),
    completed: completedCount,
    total: scheduledCount,
  };
}

/**
 * On-time rate: of completed tasks, how many were completed before/on due date?
 */
function calcOnTimeRate(completedTasks, tz) {
  const withDue = completedTasks.filter(t => t.due_date && t.completed_at);
  if (withDue.length === 0) return { rate: 0, on_time: 0, total: 0 };
  const onTime = withDue.filter(t => {
    const dueDate = moment(t.due_date).tz(tz).endOf('day');
    const completedAt = moment(t.completed_at).tz(tz);
    return completedAt.isSameOrBefore(dueDate);
  }).length;
  return {
    rate: Math.round((onTime / withDue.length) * 100),
    on_time: onTime,
    total: withDue.length,
  };
}

/**
 * Average mood for a set of mood entries (0–10).
 */
function calcMoodAverage(moodEntries) {
  if (moodEntries.length === 0) return null;
  const sum = moodEntries.reduce((s, m) => s + (m.mood_score || 5), 0);
  return Math.round((sum / moodEntries.length) * 10) / 10;
}

/**
 * Unified productivity score (0–100).
 * Single formula used everywhere.
 */
function calcProductivityScore(data) {
  const { todayTasks, completedToday, habitsScheduledToday, completedHabitsToday, todayMoods, overdueTasks, timezone } = data;

  const allRelevant = [...todayTasks, ...overdueTasks];
  const taskRate  = allRelevant.length > 0 ? completedToday.length / allRelevant.length : 0;
  const habitRate = habitsScheduledToday.length > 0 ? completedHabitsToday / habitsScheduledToday.length : 0;
  const onTime    = calcOnTimeRate(completedToday, timezone);
  const moodAvg   = calcMoodAverage(todayMoods);
  const moodFactor = moodAvg !== null ? moodAvg / 10 : 0.5;

  const score = Math.round(
    (taskRate   * WEIGHTS.productivity.task_completion +
     habitRate  * WEIGHTS.productivity.habit_completion +
     (onTime.rate / 100) * WEIGHTS.productivity.on_time_rate +
     moodFactor * WEIGHTS.productivity.mood_factor) * 100
  );

  return Math.min(100, Math.max(0, score));
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API: Analytics Endpoints
// ═══════════════════════════════════════════════════════════════════════════

/**
 * getAnalyticsSummary — Dashboard summary card data.
 * Replaces dashboard.controller.js calculateScore + summary block.
 */
async function getAnalyticsSummary(userId, timezone = 'Africa/Cairo') {
  const data = await fetchAnalyticsData(userId, null, timezone);

  const taskCompletion  = calcTaskCompletionRate([...data.todayTasks, ...data.overdueTasks]);
  const habitCompletion = calcHabitCompletionRate(
    data.habitsScheduledToday.length, data.completedHabitsToday
  );
  const moodAvg = calcMoodAverage(data.todayMoods);
  const productivityScore = calcProductivityScore(data);

  const overdueTzAware = data.overdueTasks.length;

  return {
    productivity_score: productivityScore,
    tasks: {
      total:           data.allTasks.length,
      completed:       data.allTasks.filter(t => t.status === 'completed').length,
      completed_today: data.completedToday.length,
      pending:         data.pendingTasks.length,
      overdue:         overdueTzAware,
    },
    habits: {
      total:      data.habitsScheduledToday.length,
      completed:  data.completedHabitsToday,
      pending:    data.habitsScheduledToday.length - data.completedHabitsToday,
      percentage: habitCompletion.rate,
    },
    mood: data.todayMoods.length > 0 ? {
      score:         data.todayMoods[data.todayMoods.length - 1].mood_score,
      average:       moodAvg,
      has_checked_in: true,
    } : {
      has_checked_in: false,
      prompt:        'كيف كان مزاجك اليوم؟',
    },
    week_progress: {
      total:     data.weekTasks.length,
      completed: data.weekTasks.filter(t => t.status === 'completed').length,
    },
    date: data.today,
  };
}

/**
 * getAnalyticsOverview — Full overview tab data.
 * Used by GET /api/v1/analytics/overview
 */
async function getAnalyticsOverview(userId, timezone = 'Africa/Cairo') {
  const data = await fetchAnalyticsData(userId, null, timezone);

  const taskCompletion  = calcTaskCompletionRate([...data.todayTasks, ...data.overdueTasks]);
  const habitCompletion = calcHabitCompletionRate(
    data.habitsScheduledToday.length, data.completedHabitsToday
  );
  const moodAvg = calcMoodAverage(data.todayMoods);
  const onTime  = calcOnTimeRate(data.completedToday, data.timezone);
  const productivityScore = calcProductivityScore(data);

  return {
    productivity_score: productivityScore,
    task_completion: taskCompletion,
    habit_completion: habitCompletion,
    on_time: onTime,
    mood: {
      average:    moodAvg,
      count:      data.todayMoods.length,
      has_data:   data.todayMoods.length > 0,
    },
    overdue: {
      count: data.overdueTasks.length,
      tasks: data.overdueTasks.slice(0, 5).map(t => ({
        id: t.id, title: t.title, priority: t.priority,
        due_date: t.due_date ? moment(t.due_date).tz(timezone).format('YYYY-MM-DD') : null,
        days_overdue: t.due_date ? Math.floor((new Date(data.today) - new Date(moment(t.due_date).tz(timezone).format('YYYY-MM-DD'))) / 86400000) : 0,
      })),
    },
    date: data.today,
  };
}

/**
 * getAnalyticsSnapshot — Lightweight snapshot for Decision Engine + Assistant.
 * No DB queries of its own — just reshapes data from fetchAnalyticsData.
 */
async function getAnalyticsSnapshot(userId, timezone = 'Africa/Cairo') {
  const data = await fetchAnalyticsData(userId, null, timezone);
  const productivityScore = calcProductivityScore(data);

  return {
    productivity_score: productivityScore,
    tasks_pending:     data.pendingTasks.length,
    tasks_overdue:     data.overdueTasks.length,
    tasks_completed_today: data.completedToday.length,
    habits_total:      data.habitsScheduledToday.length,
    habits_done_today: data.completedHabitsToday,
    mood_today:        calcMoodAverage(data.todayMoods),
    date:              data.today,
  };
}

/**
 * getDailyInsightData — Accurate data block for the daily summary insight.
 * Replaces the broken insight.controller.js calculation.
 */
async function getDailyInsightData(userId, timezone = 'Africa/Cairo') {
  const data = await fetchAnalyticsData(userId, null, timezone);
  const productivityScore = calcProductivityScore(data);

  return {
    tasks: {
      total:     data.todayTasks.length + data.overdueTasks.length,
      completed: data.completedToday.length,
      pending:   data.pendingTasks.length,
      overdue:   data.overdueTasks.length,
    },
    habits: {
      total:     data.habitsScheduledToday.length,
      completed: data.completedHabitsToday,
    },
    mood:    calcMoodAverage(data.todayMoods),
    productivity_score: productivityScore,
  };
}

/**
 * getUnifiedAnalytics — Full analytics payload combining all data.
 * Used by GET /api/v1/analytics/unified
 */
async function getUnifiedAnalytics(userId, timezone = 'Africa/Cairo') {
  const startMs = Date.now();
  const data = await fetchAnalyticsData(userId, null, timezone);

  const overview = {
    productivity_score: calcProductivityScore(data),
    task_completion: calcTaskCompletionRate([...data.todayTasks, ...data.overdueTasks]),
    habit_completion: calcHabitCompletionRate(data.habitsScheduledToday.length, data.completedHabitsToday),
    on_time: calcOnTimeRate(data.completedToday, data.timezone),
    mood_average: calcMoodAverage(data.todayMoods),
    overdue_count: data.overdueTasks.length,
    pending_count: data.pendingTasks.length,
  };

  // Fetch intelligence signals for behavioral context
  let signals = null;
  const intelligence = getIntelligence();
  if (intelligence) {
    try {
      const rawSignals = await intelligence.getIntelligenceSignals(userId, { timezone });
      signals = intelligence.summarizeSignals(rawSignals);
    } catch (e) {
      logger.debug('[ANALYTICS] Intelligence signals failed:', e.message);
    }
  }

  // Fetch decision context
  let decision = null;
  const decisionEngine = getDecisionEngine();
  if (decisionEngine) {
    try {
      const decResult = await decisionEngine.getUnifiedDecision(userId, { timezone });
      decision = {
        currentFocus: decResult.currentFocus?.title,
        behaviorState: decResult.behaviorState?.state,
        confidence: decResult.confidence,
        why: decResult.why,
      };
    } catch (e) {
      logger.debug('[ANALYTICS] Decision engine failed:', e.message);
    }
  }

  return {
    overview,
    signals,
    decision,
    week_progress: {
      total: data.weekTasks.length,
      completed: data.weekTasks.filter(t => t.status === 'completed').length,
    },
    data_quality: {
      has_tasks:  data.allTasks.length > 0,
      has_habits: data.activeHabits.length > 0,
      has_mood:   data.todayMoods.length > 0,
      overdue_ratio: data.pendingTasks.length > 0
        ? Math.round((data.overdueTasks.length / data.pendingTasks.length) * 100)
        : 0,
    },
    meta: {
      date: data.today,
      timezone,
      computation_ms: Date.now() - startMs,
      version: '1.0',
    },
  };
}

module.exports = {
  // Core data fetcher
  fetchAnalyticsData,
  // Metric calculators (pure functions — testable)
  calcTaskCompletionRate,
  calcHabitCompletionRate,
  calcOnTimeRate,
  calcMoodAverage,
  calcProductivityScore,
  // API-level endpoints
  getAnalyticsSummary,
  getAnalyticsOverview,
  getAnalyticsSnapshot,
  getDailyInsightData,
  getUnifiedAnalytics,
  // Constants
  WEIGHTS,
};
