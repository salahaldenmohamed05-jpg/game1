/**
 * UserModelService v1.0 — Persistent Per-User Intelligence (Long-Term Brain)
 * =============================================================================
 * Phase P: Builds and continuously updates a per-user model from REAL data.
 *
 * Data Sources (no faking):
 *   1. analytics.service.js    → task/habit/mood raw metrics
 *   2. learning.engine.service → success rates, optimal hours, failure patterns
 *   3. decision outcomes       → which decisions were accepted/ignored/rejected
 *   4. task lifecycle          → completion speed, delays, reschedules
 *   5. habit logs              → streaks, consistency, drop-off patterns
 *
 * Update Triggers:
 *   - onTaskCompleted(userId, task)      → after PATCH /tasks/:id/complete
 *   - onTaskMissed(userId, task)         → detected by scheduler or analytics
 *   - onDecisionFeedback(userId, fb)     → after POST /decision/feedback
 *   - onHabitLogged(userId, log)         → after habit completion
 *   - rebuildFullModel(userId)           → periodic full recomputation
 *
 * Consumers:
 *   - UnifiedDecisionService  → per-user scoring modifiers
 *   - coaching/nudge systems  → push_intensity, nudge_style
 *   - adaptive difficulty     → task_size, max_load, warmup needs
 *
 * Rules:
 *   - NO static assumptions — everything computed from data
 *   - NO fake personalization — cold_start returns neutral defaults
 *   - ALL profiles update incrementally after each event
 */

'use strict';

const logger = require('../utils/logger');

// ─── Lazy loaders ──────────────────────────────────────────────────────────
function getUserModelDB() {
  try { return require('../models/user_model.model'); } catch (e) { logger.debug('[USER_MODEL] Model not available:', e.message); return null; }
}
function getAnalytics() {
  try { return require('./analytics.service'); } catch (e) { return null; }
}
function getLearning() {
  try { return require('./learning.engine.service'); } catch (e) { return null; }
}
function getTaskModel() {
  try { return require('../models/task.model'); } catch (e) { return null; }
}
function getHabitModels() {
  try { return require('../models/habit.model'); } catch (e) { return {}; }
}
function getMoodModel() {
  try { return require('../models/mood.model'); } catch (e) { return null; }
}

// ─── In-memory cache (avoids DB read on every decision) ────────────────────
const modelCache = new Map(); // userId → { model, loadedAt }
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Constants ─────────────────────────────────────────────────────────────
const CONFIDENCE_THRESHOLDS = {
  cold_start: 0,
  low: 10,
  medium: 30,
  high: 75,
  mature: 150,
};

// ════════════════════════════════════════════════════════════════════════════
// CORE: Get or Create User Model
// ════════════════════════════════════════════════════════════════════════════

async function getOrCreateModel(userId) {
  // Check cache first
  const cached = modelCache.get(userId);
  if (cached && (Date.now() - cached.loadedAt) < CACHE_TTL_MS) {
    return cached.model;
  }

  const UserModelDB = getUserModelDB();
  if (!UserModelDB) {
    return createDefaultModel(userId);
  }

  try {
    let model = await UserModelDB.findOne({ where: { user_id: userId } });
    if (!model) {
      model = await UserModelDB.create({
        user_id: userId,
        behavior_profile: getDefaultBehaviorProfile(),
        performance_profile: getDefaultPerformanceProfile(),
        habit_profile: getDefaultHabitProfile(),
        adaptation_profile: getDefaultAdaptationProfile(),
        feedback_loop: getDefaultFeedbackLoop(),
        confidence: 'cold_start',
        total_events: 0,
        data_points: 0,
      });
      logger.info(`[USER_MODEL] Created new model for user ${userId}`);
    }

    const plain = model.toJSON ? model.toJSON() : model;
    // Normalize: ensure both old/new column names are present
    plain.total_events = plain.total_events || plain.data_points || 0;
    plain.data_points = plain.data_points || plain.total_events || 0;
    plain.confidence = plain.confidence || computeConfidence(plain.total_events);
    modelCache.set(userId, { model: plain, loadedAt: Date.now() });
    return plain;
  } catch (e) {
    logger.warn('[USER_MODEL] DB access failed, using defaults:', e.message);
    return createDefaultModel(userId);
  }
}

function createDefaultModel(userId) {
  return {
    user_id: userId,
    behavior_profile: getDefaultBehaviorProfile(),
    performance_profile: getDefaultPerformanceProfile(),
    habit_profile: getDefaultHabitProfile(),
    adaptation_profile: getDefaultAdaptationProfile(),
    feedback_loop: getDefaultFeedbackLoop(),
    confidence: 'cold_start',
    total_events: 0,
    data_points: 0,
    model_version: 1,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// DEFAULT PROFILES — Neutral starting point (not assumptions)
// ════════════════════════════════════════════════════════════════════════════

function getDefaultBehaviorProfile() {
  return {
    procrastination_pattern: 'unknown',
    procrastination_score: 0.5,
    peak_productivity_hours: [],
    burnout_tendency: 'unknown',
    burnout_score: 0.3,
    task_preference: 'balanced',
    avoidance_triggers: [],
    momentum_pattern: 'unknown',
    response_to_pressure: 'neutral',
    fake_productivity_tendency: 0,
    avg_decision_acceptance_rate: 50,
    avg_suggestion_acceptance_rate: 50,
  };
}

function getDefaultPerformanceProfile() {
  return {
    completion_rate_overall: 50,
    completion_rate_by_priority: {},
    completion_rate_by_category: {},
    completion_rate_by_energy: {},
    avg_task_delay_hours: 0,
    on_time_rate: 50,
    avg_productivity_score: 50,
    best_day_of_week: null,
    worst_day_of_week: null,
    avg_tasks_per_day: 0,
    avg_completion_time_minutes: 0,
    overdue_tendency: 0.3,
  };
}

function getDefaultHabitProfile() {
  return {
    consistency_score: 50,
    streak_behavior: 'unknown',
    longest_streak: 0,
    avg_streak_length: 0,
    streak_break_pattern: 'unknown',
    best_habit_time: null,
    habit_completion_by_category: {},
    habit_drop_off_day: null,
  };
}

function getDefaultAdaptationProfile() {
  return {
    optimal_task_size_minutes: 30,
    max_daily_load: 5,
    push_intensity: 'moderate',
    resistance_threshold: 0.5,
    preferred_nudge_style: 'encouraging',
    learning_speed: 'moderate',
    task_size_comfort_zone: { min: 10, max: 60 },
    energy_sensitivity: 'moderate',
    needs_warmup: false,
    best_break_interval_minutes: 50,
    overwhelm_threshold: 0.7,
    coaching_receptivity: 0.5,
  };
}

function getDefaultFeedbackLoop() {
  return {
    decisions_presented: 0,
    decisions_accepted: 0,
    decisions_ignored: 0,
    decisions_rejected: 0,
    tasks_completed: 0,
    tasks_missed: 0,
    tasks_rescheduled: 0,
    suggestions_accepted: 0,
    suggestions_ignored: 0,
    total_feedback_events: 0,
    last_feedback_at: null,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// INCREMENTAL UPDATE: onTaskCompleted
// ════════════════════════════════════════════════════════════════════════════

async function onTaskCompleted(userId, taskData) {
  try {
    const model = await getOrCreateModel(userId);
    const perf = { ...model.performance_profile };
    const behavior = { ...model.behavior_profile };
    const adaptation = { ...model.adaptation_profile };
    const feedback = { ...model.feedback_loop };

    // Update completion counter
    feedback.tasks_completed = (feedback.tasks_completed || 0) + 1;
    feedback.total_feedback_events = (feedback.total_feedback_events || 0) + 1;
    feedback.last_feedback_at = new Date().toISOString();

    // Update completion rate with exponential moving average (EMA)
    const alpha = 0.1; // smoothing factor — recent events weigh 10%
    perf.completion_rate_overall = ema(perf.completion_rate_overall || 50, 100, alpha);

    // Update by priority
    if (taskData.priority) {
      if (!perf.completion_rate_by_priority) perf.completion_rate_by_priority = {};
      const prev = perf.completion_rate_by_priority[taskData.priority] || 50;
      perf.completion_rate_by_priority[taskData.priority] = ema(prev, 100, alpha);
    }

    // Update by category
    if (taskData.category) {
      if (!perf.completion_rate_by_category) perf.completion_rate_by_category = {};
      const prev = perf.completion_rate_by_category[taskData.category] || 50;
      perf.completion_rate_by_category[taskData.category] = ema(prev, 100, alpha);
    }

    // Track task delay if due date exists
    if (taskData.due_date && taskData.completed_at) {
      const dueMs = new Date(taskData.due_date).getTime();
      const completedMs = new Date(taskData.completed_at).getTime();
      const delayHours = Math.max(0, (completedMs - dueMs) / (1000 * 60 * 60));
      perf.avg_task_delay_hours = ema(perf.avg_task_delay_hours || 0, delayHours, 0.15);

      // On-time check
      const wasOnTime = completedMs <= dueMs + (24 * 60 * 60 * 1000); // within 1 day
      perf.on_time_rate = ema(perf.on_time_rate || 50, wasOnTime ? 100 : 0, alpha);

      // Overdue tendency
      const wasOverdue = completedMs > dueMs;
      perf.overdue_tendency = ema(perf.overdue_tendency || 0.3, wasOverdue ? 1 : 0, alpha);
    }

    // Track completion time if available
    if (taskData.actual_duration) {
      perf.avg_completion_time_minutes = ema(
        perf.avg_completion_time_minutes || 30,
        taskData.actual_duration,
        0.15
      );

      // Update optimal task size based on successful completions
      const dur = taskData.actual_duration;
      adaptation.optimal_task_size_minutes = ema(
        adaptation.optimal_task_size_minutes || 30, dur, 0.1
      );

      // Update comfort zone bounds
      const zone = adaptation.task_size_comfort_zone || { min: 10, max: 60 };
      if (dur < zone.min) zone.min = Math.round(ema(zone.min, dur, 0.2));
      if (dur > zone.max) zone.max = Math.round(ema(zone.max, dur, 0.2));
      adaptation.task_size_comfort_zone = zone;
    }

    // Reduce procrastination score on successful completion
    behavior.procrastination_score = ema(behavior.procrastination_score || 0.5, 0, 0.08);

    // Detect momentum pattern
    const recentCompletions = feedback.tasks_completed || 0;
    const totalEvents = feedback.total_feedback_events || 1;
    const completionRatio = recentCompletions / totalEvents;
    if (completionRatio > 0.7) behavior.momentum_pattern = 'fast_starter';
    else if (completionRatio > 0.4) behavior.momentum_pattern = 'consistent';
    else behavior.momentum_pattern = 'slow_starter';

    // ── Adaptive Difficulty: adjust based on streaks ────────────────────
    adjustDifficulty(adaptation, feedback, 'success');

    const dataPoints = (model.total_events || 0) + 1;

    await persistModel(userId, {
      performance_profile: perf,
      behavior_profile: behavior,
      adaptation_profile: adaptation,
      feedback_loop: feedback,
      total_events: dataPoints,
      confidence: computeConfidence(dataPoints),
    });

    logger.debug(`[USER_MODEL] Task completed update for ${userId}, total_events=${dataPoints}`);
  } catch (e) {
    logger.warn('[USER_MODEL] onTaskCompleted failed (non-fatal):', e.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// INCREMENTAL UPDATE: onTaskMissed
// ════════════════════════════════════════════════════════════════════════════

async function onTaskMissed(userId, taskData) {
  try {
    const model = await getOrCreateModel(userId);
    const perf = { ...model.performance_profile };
    const behavior = { ...model.behavior_profile };
    const adaptation = { ...model.adaptation_profile };
    const feedback = { ...model.feedback_loop };

    const alpha = 0.1;

    feedback.tasks_missed = (feedback.tasks_missed || 0) + 1;
    feedback.total_feedback_events = (feedback.total_feedback_events || 0) + 1;
    feedback.last_feedback_at = new Date().toISOString();

    // Lower completion rate
    perf.completion_rate_overall = ema(perf.completion_rate_overall || 50, 0, alpha);

    // Update by priority
    if (taskData.priority) {
      if (!perf.completion_rate_by_priority) perf.completion_rate_by_priority = {};
      const prev = perf.completion_rate_by_priority[taskData.priority] || 50;
      perf.completion_rate_by_priority[taskData.priority] = ema(prev, 0, alpha);
    }

    // Update by category
    if (taskData.category) {
      if (!perf.completion_rate_by_category) perf.completion_rate_by_category = {};
      const prev = perf.completion_rate_by_category[taskData.category] || 50;
      perf.completion_rate_by_category[taskData.category] = ema(prev, 0, alpha);
    }

    // Increase procrastination score
    behavior.procrastination_score = ema(behavior.procrastination_score || 0.5, 1, 0.12);
    perf.overdue_tendency = ema(perf.overdue_tendency || 0.3, 1, alpha);

    // Detect avoidance triggers
    if (taskData.energy_required === 'high') {
      addUnique(behavior, 'avoidance_triggers', 'high_energy');
    }
    if (taskData.estimated_duration && taskData.estimated_duration > 60) {
      addUnique(behavior, 'avoidance_triggers', 'long_duration');
    }

    // Adjust adaptation: if tasks keep being missed, lower expectations
    const missRate = (feedback.tasks_missed || 0) / Math.max(1, feedback.total_feedback_events);
    if (missRate > 0.5) {
      adaptation.push_intensity = 'gentle';
      adaptation.max_daily_load = Math.max(2, (adaptation.max_daily_load || 5) - 1);
      adaptation.needs_warmup = true;
    }

    // Classify burnout tendency
    if (behavior.procrastination_score > 0.7 && perf.overdue_tendency > 0.6) {
      behavior.burnout_tendency = 'high';
    } else if (behavior.procrastination_score > 0.4) {
      behavior.burnout_tendency = 'moderate';
    } else {
      behavior.burnout_tendency = 'low';
    }

    // ── Adaptive Difficulty: lower on miss ──────────────────────────────
    adjustDifficulty(adaptation, feedback, 'failure');

    const dataPoints = (model.total_events || 0) + 1;

    await persistModel(userId, {
      performance_profile: perf,
      behavior_profile: behavior,
      adaptation_profile: adaptation,
      feedback_loop: feedback,
      total_events: dataPoints,
      confidence: computeConfidence(dataPoints),
    });

    logger.debug(`[USER_MODEL] Task missed update for ${userId}, procrastination=${behavior.procrastination_score.toFixed(2)}`);
  } catch (e) {
    logger.warn('[USER_MODEL] onTaskMissed failed (non-fatal):', e.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// INCREMENTAL UPDATE: onDecisionFeedback
// ════════════════════════════════════════════════════════════════════════════

async function onDecisionFeedback(userId, feedbackData) {
  try {
    const model = await getOrCreateModel(userId);
    const behavior = { ...model.behavior_profile };
    const adaptation = { ...model.adaptation_profile };
    const feedback = { ...model.feedback_loop };

    const { action, response } = feedbackData; // response: 'accepted' | 'ignored' | 'rejected'

    feedback.decisions_presented = (feedback.decisions_presented || 0) + 1;
    feedback.total_feedback_events = (feedback.total_feedback_events || 0) + 1;
    feedback.last_feedback_at = new Date().toISOString();

    if (response === 'accepted') {
      feedback.decisions_accepted = (feedback.decisions_accepted || 0) + 1;
    } else if (response === 'ignored') {
      feedback.decisions_ignored = (feedback.decisions_ignored || 0) + 1;
    } else if (response === 'rejected') {
      feedback.decisions_rejected = (feedback.decisions_rejected || 0) + 1;
    }

    // Compute acceptance rate from actual counters
    const total = feedback.decisions_presented || 1;
    behavior.avg_decision_acceptance_rate = Math.round(
      ((feedback.decisions_accepted || 0) / total) * 100
    );

    // Adapt push intensity based on acceptance rate
    const acceptRate = behavior.avg_decision_acceptance_rate;
    if (acceptRate > 70) {
      // User accepts most decisions — can push harder
      adaptation.push_intensity = 'aggressive';
      adaptation.resistance_threshold = Math.min(0.8, (adaptation.resistance_threshold || 0.5) + 0.02);
      adaptation.coaching_receptivity = Math.min(1, (adaptation.coaching_receptivity || 0.5) + 0.03);
    } else if (acceptRate < 30) {
      // User rejects most decisions — back off
      adaptation.push_intensity = 'gentle';
      adaptation.resistance_threshold = Math.max(0.2, (adaptation.resistance_threshold || 0.5) - 0.02);
      adaptation.coaching_receptivity = Math.max(0.1, (adaptation.coaching_receptivity || 0.5) - 0.03);
      adaptation.preferred_nudge_style = 'encouraging';
    } else {
      adaptation.push_intensity = 'moderate';
    }

    // Track what types of decisions are rejected
    if (response === 'rejected' && action) {
      addUnique(behavior, 'avoidance_triggers', `rejected_${action}`);
    }

    // Classify task preference from feedback patterns
    if (feedbackData.task_type) {
      if (feedbackData.task_type === 'quick' && response === 'accepted') {
        behavior.task_preference = behavior.task_preference === 'deep_work' ? 'balanced' : 'quick_wins';
      } else if (feedbackData.task_type === 'deep' && response === 'accepted') {
        behavior.task_preference = behavior.task_preference === 'quick_wins' ? 'balanced' : 'deep_work';
      }
    }

    const dataPoints = (model.total_events || 0) + 1;

    await persistModel(userId, {
      behavior_profile: behavior,
      adaptation_profile: adaptation,
      feedback_loop: feedback,
      total_events: dataPoints,
      confidence: computeConfidence(dataPoints),
    });

    logger.debug(`[USER_MODEL] Decision feedback for ${userId}: ${response}, acceptance_rate=${acceptRate}%`);
  } catch (e) {
    logger.warn('[USER_MODEL] onDecisionFeedback failed (non-fatal):', e.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// INCREMENTAL UPDATE: onHabitLogged
// ════════════════════════════════════════════════════════════════════════════

async function onHabitLogged(userId, logData) {
  try {
    const model = await getOrCreateModel(userId);
    const habit = { ...model.habit_profile };
    const feedback = { ...model.feedback_loop };

    feedback.total_feedback_events = (feedback.total_feedback_events || 0) + 1;
    feedback.last_feedback_at = new Date().toISOString();

    if (logData.completed) {
      habit.consistency_score = ema(habit.consistency_score || 50, 100, 0.08);

      // Track best habit time
      if (logData.log_time) {
        const hour = typeof logData.log_time === 'string'
          ? parseInt(logData.log_time.split(':')[0])
          : new Date(logData.log_time).getHours();
        habit.best_habit_time = `${String(hour).padStart(2, '0')}:00`;
      }

      // Track streak
      if (logData.current_streak) {
        if (logData.current_streak > (habit.longest_streak || 0)) {
          habit.longest_streak = logData.current_streak;
        }
        habit.avg_streak_length = ema(habit.avg_streak_length || 0, logData.current_streak, 0.15);

        // Classify streak behavior
        if (habit.avg_streak_length > 7) habit.streak_behavior = 'builder';
        else if (habit.avg_streak_length > 3) habit.streak_behavior = 'irregular';
        else habit.streak_behavior = 'breaker';
      }

      // Track by category
      if (logData.category) {
        if (!habit.habit_completion_by_category) habit.habit_completion_by_category = {};
        const prev = habit.habit_completion_by_category[logData.category] || 50;
        habit.habit_completion_by_category[logData.category] = ema(prev, 100, 0.1);
      }
    } else {
      // Habit skipped
      habit.consistency_score = ema(habit.consistency_score || 50, 0, 0.08);

      // Track drop-off day
      const dayOfWeek = new Date().getDay();
      habit.habit_drop_off_day = dayOfWeek;

      // Detect streak break pattern
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        habit.streak_break_pattern = 'weekends';
      }
    }

    const dataPoints = (model.total_events || 0) + 1;

    await persistModel(userId, {
      habit_profile: habit,
      feedback_loop: feedback,
      total_events: dataPoints,
      confidence: computeConfidence(dataPoints),
    });

    logger.debug(`[USER_MODEL] Habit logged for ${userId}, consistency=${habit.consistency_score.toFixed(1)}`);
  } catch (e) {
    logger.warn('[USER_MODEL] onHabitLogged failed (non-fatal):', e.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FULL REBUILD: Recomputes entire model from historical data
// ════════════════════════════════════════════════════════════════════════════

async function rebuildFullModel(userId, timezone = 'Africa/Cairo') {
  const startMs = Date.now();

  try {
    const analytics = getAnalytics();
    const learning = getLearning();
    const Task = getTaskModel();
    const { Habit, HabitLog } = getHabitModels();
    const { Op } = require('sequelize');

    if (!Task) {
      logger.warn('[USER_MODEL] Task model not available, skipping rebuild');
      return await getOrCreateModel(userId);
    }

    // ── Fetch all historical data ──────────────────────────────────────────
    const [allTasks, activeHabits, allHabitLogs] = await Promise.all([
      Task.findAll({ where: { user_id: userId }, raw: true }),
      Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
      HabitLog ? HabitLog.findAll({
        where: { user_id: userId },
        order: [['log_date', 'DESC']],
        limit: 500,
        raw: true,
      }) : [],
    ]);

    // ── Compute Performance Profile ─────────────────────────────────────────
    const completedTasks = allTasks.filter(t => t.status === 'completed');
    const pendingTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
    const totalTasks = allTasks.length;

    const perf = getDefaultPerformanceProfile();

    // Overall completion rate (from real data)
    perf.completion_rate_overall = totalTasks > 0
      ? Math.round((completedTasks.length / totalTasks) * 100)
      : 50;

    // By priority
    for (const p of ['urgent', 'high', 'medium', 'low']) {
      const byP = allTasks.filter(t => t.priority === p);
      const compByP = byP.filter(t => t.status === 'completed');
      if (byP.length >= 2) {
        perf.completion_rate_by_priority[p] = Math.round((compByP.length / byP.length) * 100);
      }
    }

    // By category
    const categories = [...new Set(allTasks.map(t => t.category).filter(Boolean))];
    for (const cat of categories) {
      const byCat = allTasks.filter(t => t.category === cat);
      const compByCat = byCat.filter(t => t.status === 'completed');
      if (byCat.length >= 2) {
        perf.completion_rate_by_category[cat] = Math.round((compByCat.length / byCat.length) * 100);
      }
    }

    // By energy
    for (const e of ['low', 'medium', 'high']) {
      const byE = allTasks.filter(t => t.energy_required === e);
      const compByE = byE.filter(t => t.status === 'completed');
      if (byE.length >= 2) {
        perf.completion_rate_by_energy[e] = Math.round((compByE.length / byE.length) * 100);
      }
    }

    // Task delay
    const withBothDates = completedTasks.filter(t => t.due_date && t.completed_at);
    if (withBothDates.length > 0) {
      const totalDelay = withBothDates.reduce((sum, t) => {
        const delay = Math.max(0, (new Date(t.completed_at).getTime() - new Date(t.due_date).getTime()) / 3600000);
        return sum + delay;
      }, 0);
      perf.avg_task_delay_hours = Math.round((totalDelay / withBothDates.length) * 10) / 10;

      const onTime = withBothDates.filter(t =>
        new Date(t.completed_at).getTime() <= new Date(t.due_date).getTime() + 86400000
      ).length;
      perf.on_time_rate = Math.round((onTime / withBothDates.length) * 100);
    }

    // Avg completion time
    const withDuration = completedTasks.filter(t => t.actual_duration);
    if (withDuration.length > 0) {
      perf.avg_completion_time_minutes = Math.round(
        withDuration.reduce((s, t) => s + t.actual_duration, 0) / withDuration.length
      );
    }

    // Best/worst day of week
    const dayCompletions = new Array(7).fill(0);
    const dayTotals = new Array(7).fill(0);
    for (const t of completedTasks) {
      if (t.completed_at) {
        const day = new Date(t.completed_at).getDay();
        dayCompletions[day]++;
      }
    }
    for (const t of allTasks) {
      if (t.due_date) {
        const day = new Date(t.due_date).getDay();
        dayTotals[day]++;
      }
    }
    const dayRates = dayCompletions.map((c, i) => dayTotals[i] > 0 ? c / dayTotals[i] : 0);
    perf.best_day_of_week = dayRates.indexOf(Math.max(...dayRates));
    perf.worst_day_of_week = dayRates.indexOf(Math.min(...dayRates.filter(r => r >= 0)));

    // Avg tasks per day
    if (completedTasks.length > 0) {
      const uniqueDays = new Set(completedTasks
        .filter(t => t.completed_at)
        .map(t => new Date(t.completed_at).toISOString().split('T')[0])
      );
      perf.avg_tasks_per_day = uniqueDays.size > 0
        ? Math.round((completedTasks.length / uniqueDays.size) * 10) / 10
        : 0;
    }

    // Overdue tendency
    const now = new Date();
    const overdueCount = pendingTasks.filter(t => t.due_date && new Date(t.due_date) < now).length;
    perf.overdue_tendency = pendingTasks.length > 0
      ? Math.round((overdueCount / pendingTasks.length) * 100) / 100
      : 0;

    // ── Compute Behavior Profile ────────────────────────────────────────────
    const behavior = getDefaultBehaviorProfile();

    // From learning engine
    if (learning) {
      const profile = learning.getUserLearningProfile(userId);
      if (profile) {
        behavior.peak_productivity_hours = profile.stats?.optimalHours || [];
        behavior.avg_suggestion_acceptance_rate = profile.stats?.suggestionAcceptRate || 50;

        // Classify procrastination from failure patterns
        const failPatterns = profile.stats?.failurePatterns || [];
        const procrastFails = failPatterns.filter(f =>
          f.reason?.includes('procrastinat') || f.reason?.includes('delay') || f.reason?.includes('missed')
        );
        behavior.procrastination_score = procrastFails.length > 2 ? 0.8
          : procrastFails.length > 0 ? 0.5 : 0.2;
      }
    }

    // Procrastination pattern from task data
    const rescheduleCount = allTasks.filter(t => (t.reschedule_count || 0) > 0).length;
    const rescheduleRate = totalTasks > 0 ? rescheduleCount / totalTasks : 0;
    behavior.procrastination_pattern = rescheduleRate > 0.3 ? 'chronic'
      : rescheduleRate > 0.1 ? 'situational' : 'minimal';

    // Burnout tendency
    const lowEnergyTasks = allTasks.filter(t => t.energy_required === 'high' && t.status !== 'completed').length;
    behavior.burnout_tendency = lowEnergyTasks > 5 ? 'high'
      : lowEnergyTasks > 2 ? 'moderate' : 'low';
    behavior.burnout_score = perf.overdue_tendency * 0.5 + (behavior.procrastination_score || 0) * 0.5;

    // Task preference
    const avgDuration = perf.avg_completion_time_minutes || 30;
    behavior.task_preference = avgDuration <= 15 ? 'quick_wins'
      : avgDuration >= 45 ? 'deep_work' : 'balanced';

    // Response to pressure (from overdue completion)
    const overdueCompleted = completedTasks.filter(t => {
      if (!t.due_date || !t.completed_at) return false;
      return new Date(t.completed_at) > new Date(t.due_date);
    }).length;
    const overdueCompletionRate = overdueCompleted > 0 && overdueCount > 0
      ? overdueCompleted / (overdueCompleted + overdueCount) : 0.5;
    behavior.response_to_pressure = overdueCompletionRate > 0.7 ? 'thrives'
      : overdueCompletionRate < 0.3 ? 'crumbles' : 'neutral';

    // Fake productivity: completing lots of low tasks while high tasks stay pending
    const lowCompleted = completedTasks.filter(t => t.priority === 'low').length;
    const highPending = pendingTasks.filter(t => t.priority === 'high' || t.priority === 'urgent').length;
    behavior.fake_productivity_tendency = highPending > 3 && lowCompleted > highPending
      ? Math.min(1, lowCompleted / (highPending + lowCompleted)) : 0;

    // ── Compute Habit Profile ───────────────────────────────────────────────
    const habitP = getDefaultHabitProfile();

    if (allHabitLogs.length > 0) {
      const completedLogs = allHabitLogs.filter(l => l.completed);
      habitP.consistency_score = Math.round((completedLogs.length / allHabitLogs.length) * 100);

      // Longest streak from active habits
      if (activeHabits.length > 0) {
        const maxStreak = Math.max(...activeHabits.map(h => h.current_streak || 0));
        habitP.longest_streak = maxStreak;
        const avgStreak = activeHabits.reduce((s, h) => s + (h.current_streak || 0), 0) / activeHabits.length;
        habitP.avg_streak_length = Math.round(avgStreak * 10) / 10;

        habitP.streak_behavior = avgStreak > 7 ? 'builder'
          : avgStreak > 3 ? 'irregular' : 'breaker';
      }

      // Habit drop-off day
      const skipsByDay = new Array(7).fill(0);
      allHabitLogs.filter(l => !l.completed).forEach(l => {
        if (l.log_date) {
          const day = new Date(l.log_date).getDay();
          skipsByDay[day]++;
        }
      });
      const maxSkipDay = skipsByDay.indexOf(Math.max(...skipsByDay));
      habitP.habit_drop_off_day = maxSkipDay;
      habitP.streak_break_pattern = (maxSkipDay === 0 || maxSkipDay === 6) ? 'weekends' : 'random';
    }

    // ── Compute Adaptation Profile ─────────────────────────────────────────
    const adapt = getDefaultAdaptationProfile();

    // Optimal task size from successful completions
    if (withDuration.length > 0) {
      const durations = withDuration.map(t => t.actual_duration);
      durations.sort((a, b) => a - b);
      adapt.optimal_task_size_minutes = Math.round(median(durations));
      adapt.task_size_comfort_zone = {
        min: Math.round(percentile(durations, 25)),
        max: Math.round(percentile(durations, 75)),
      };
    }

    // Max daily load before overwhelm
    if (perf.avg_tasks_per_day > 0) {
      adapt.max_daily_load = Math.max(2, Math.min(10, Math.ceil(perf.avg_tasks_per_day * 1.2)));
    }

    // Push intensity based on performance
    if (perf.completion_rate_overall > 70 && behavior.procrastination_score < 0.3) {
      adapt.push_intensity = 'aggressive';
      adapt.preferred_nudge_style = 'challenging';
      adapt.resistance_threshold = 0.7;
    } else if (perf.completion_rate_overall < 35 || behavior.procrastination_score > 0.6) {
      adapt.push_intensity = 'gentle';
      adapt.preferred_nudge_style = 'encouraging';
      adapt.resistance_threshold = 0.3;
    } else {
      adapt.push_intensity = 'moderate';
      adapt.preferred_nudge_style = 'direct';
      adapt.resistance_threshold = 0.5;
    }

    // Needs warmup: if user often starts with avoidance behavior
    adapt.needs_warmup = behavior.procrastination_pattern === 'chronic' || behavior.momentum_pattern === 'slow_starter';

    // Energy sensitivity
    const highEnergyRate = perf.completion_rate_by_energy?.high || 50;
    const lowEnergyRate = perf.completion_rate_by_energy?.low || 50;
    adapt.energy_sensitivity = (highEnergyRate - lowEnergyRate) > 30 ? 'high'
      : (highEnergyRate - lowEnergyRate) > 10 ? 'moderate' : 'low';

    // Learning speed from data points
    const dataPoints = totalTasks + allHabitLogs.length;
    adapt.learning_speed = dataPoints > 100 ? 'fast' : dataPoints > 30 ? 'moderate' : 'slow';

    // Coaching receptivity from suggestion acceptance
    adapt.coaching_receptivity = (behavior.avg_suggestion_acceptance_rate || 50) / 100;

    // Overwhelm threshold
    adapt.overwhelm_threshold = adapt.push_intensity === 'aggressive' ? 0.8
      : adapt.push_intensity === 'gentle' ? 0.5 : 0.65;

    // Adaptive difficulty level from historical performance
    const overallRate = perf.completion_rate_overall || 50;
    if (overallRate >= 75 && behavior.procrastination_score < 0.3) {
      adapt.difficulty_level = { current: 'challenging', auto_adjusted: true, last_change: new Date().toISOString(), reason: 'High completion rate + low procrastination', consecutive_successes: 0, consecutive_failures: 0 };
    } else if (overallRate >= 55) {
      adapt.difficulty_level = { current: 'normal', auto_adjusted: false, last_change: null, reason: 'Average performance', consecutive_successes: 0, consecutive_failures: 0 };
    } else if (overallRate < 35) {
      adapt.difficulty_level = { current: 'easy', auto_adjusted: true, last_change: new Date().toISOString(), reason: 'Low completion rate — reduced expectations', consecutive_successes: 0, consecutive_failures: 0 };
    } else {
      adapt.difficulty_level = { current: 'normal', auto_adjusted: false, last_change: null, reason: null, consecutive_successes: 0, consecutive_failures: 0 };
    }

    // ── Compute Feedback Stats ─────────────────────────────────────────────
    const existing = await getOrCreateModel(userId);
    const feedbackStats = existing.feedback_loop || getDefaultFeedbackLoop();
    feedbackStats.tasks_completed = completedTasks.length;
    feedbackStats.tasks_missed = overdueCount;
    feedbackStats.tasks_rescheduled = rescheduleCount;

    // ── Persist ─────────────────────────────────────────────────────────────
    await persistModel(userId, {
      behavior_profile: behavior,
      performance_profile: perf,
      habit_profile: habitP,
      adaptation_profile: adapt,
      feedback_loop: feedbackStats,
      total_events: dataPoints,
      confidence: computeConfidence(dataPoints),
      last_computed_at: new Date(),
    });

    const elapsed = Date.now() - startMs;
    logger.info(`[USER_MODEL] Full rebuild for ${userId}: ${dataPoints} total_events, confidence=${computeConfidence(dataPoints)}, ${elapsed}ms`);

    // Invalidate cache to force fresh read
    modelCache.delete(userId);

    return await getOrCreateModel(userId);
  } catch (e) {
    logger.error('[USER_MODEL] rebuildFullModel error:', e.message);
    return await getOrCreateModel(userId);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC API: Get Decision Modifiers (consumed by UnifiedDecisionService)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Returns per-user modifiers that alter how the DecisionService scores tasks.
 * These are NOT static — they come from the continuously-updated user model.
 */
async function getDecisionModifiers(userId) {
  const model = await getOrCreateModel(userId);

  const behavior = model.behavior_profile || {};
  const perf = model.performance_profile || {};
  const adapt = model.adaptation_profile || {};
  const habit = model.habit_profile || {};
  const totalEvents = model.total_events || model.data_points || 0;
  const confidence = model.confidence || computeConfidence(totalEvents);

  // ── Compute task-scoring modifiers from real user data ───────────────
  // These are consumed directly by scoreTask() in UnifiedDecisionService

  // Quick-win boost: procrastinators benefit from easy starts
  // Note: cold-start default procrastination_score=0.5 must NOT trigger a boost
  const quick_win_boost = behavior.procrastination_score > 0.6 ? 15
    : behavior.procrastination_score > 0.5 ? 8
    : behavior.task_preference === 'quick_wins' ? 10
    : 0;

  // Deep-work penalty: procrastinators penalized on hard tasks (less push)
  const deep_work_penalty = behavior.procrastination_score > 0.7 ? -12
    : behavior.procrastination_score > 0.55 ? -6
    : adapt.push_intensity === 'gentle' ? -8
    : 0;

  // Long-task penalty: burnout-prone users penalized on long tasks
  const long_task_penalty = behavior.burnout_score > 0.6 ? -10
    : behavior.burnout_tendency === 'high' ? -8
    : perf.overdue_tendency > 0.5 ? -5
    : 0;

  // Peak-hour bonus: users with known peak hours get a boost during those times
  const currentHour = new Date().getHours();
  const peakHours = Array.isArray(behavior.peak_productivity_hours)
    ? behavior.peak_productivity_hours
    : behavior.peak_productivity_hours?.hours || [];
  const is_peak_hour = peakHours.includes(currentHour);
  const peak_hour_bonus = is_peak_hour ? 12 : 0;

  // Success boost: high performers get harder tasks boosted
  const completionRate = perf.completion_rate_overall || 50;
  const success_boost = completionRate > 75 ? 10
    : completionRate > 60 ? 5
    : 0;

  // Suggestion dampening: users who ignore/reject suggestions get lower urgency
  const acceptRate = behavior.avg_decision_acceptance_rate || 50;
  const suggestion_dampen = acceptRate < 25 ? 0.75
    : acceptRate < 40 ? 0.85
    : acceptRate > 80 ? 1.1
    : 1.0;

  // Break boost: burnout-prone users get break suggestions boosted
  const break_boost = behavior.burnout_score > 0.5 ? 15
    : behavior.burnout_tendency === 'high' ? 10
    : 0;

  // Difficulty level from adaptation_profile
  const difficultyLevel = adapt.difficulty_level?.current || adapt.difficulty_level || 'normal';

  return {
    // Weight adjustments for scoring
    behavior_weight_modifier: computeBehaviorWeightModifier(behavior),
    urgency_weight_modifier: computeUrgencyWeightModifier(perf, behavior),

    // ── Per-task scoring modifiers (consumed by scoreTask) ──────────────
    quick_win_boost,
    deep_work_penalty,
    long_task_penalty,
    peak_hour_bonus,
    is_peak_hour,
    success_boost,
    suggestion_dampen,
    break_boost,

    // Task selection modifiers
    prefer_quick_tasks: behavior.task_preference === 'quick_wins' || adapt.needs_warmup,
    prefer_deep_work: behavior.task_preference === 'deep_work' && behavior.procrastination_score < 0.4,
    max_recommended_duration: adapt.task_size_comfort_zone?.max || 60,
    min_recommended_duration: adapt.task_size_comfort_zone?.min || 5,

    // Push intensity
    push_intensity: adapt.push_intensity || 'moderate',
    resistance_threshold: adapt.resistance_threshold || 0.5,
    coaching_receptivity: adapt.coaching_receptivity || 0.5,

    // Energy sensitivity
    energy_sensitivity: adapt.energy_sensitivity || 'moderate',
    energy_weight_boost: adapt.energy_sensitivity === 'high' ? 0.15
      : adapt.energy_sensitivity === 'low' ? -0.05 : 0,

    // Overwhelm protection
    overwhelm_threshold: adapt.overwhelm_threshold || 0.7,
    max_daily_load: adapt.max_daily_load || 5,

    // Adaptive difficulty
    difficulty_level: difficultyLevel,
    optimal_duration: adapt.optimal_task_size_minutes || 30,

    // User's known patterns
    peak_hours: peakHours,
    avoidance_triggers: behavior.avoidance_triggers || [],
    needs_warmup: adapt.needs_warmup || false,

    // Habit-awareness
    habit_consistency: habit.consistency_score || 50,
    streak_protection_priority: habit.streak_behavior === 'builder' ? 'high'
      : habit.streak_behavior === 'irregular' ? 'medium' : 'low',

    // Confidence (how much to trust these modifiers)
    model_confidence: confidence,
    total_events: totalEvents,

    // Raw profiles for advanced consumers
    _raw: {
      behavior_profile: behavior,
      performance_profile: perf,
      habit_profile: habit,
      adaptation_profile: adapt,
    },
  };
}

function computeBehaviorWeightModifier(behavior) {
  // For users with known procrastination: increase behavior weight
  if (behavior.procrastination_score > 0.6) return 0.10; // add 10% to behavior weight
  if (behavior.procrastination_score < 0.2) return -0.05; // reduce behavior weight (user self-manages)
  return 0;
}

function computeUrgencyWeightModifier(perf, behavior) {
  // For users who respond well to pressure: increase urgency weight
  if (behavior.response_to_pressure === 'thrives') return 0.08;
  // For users who crumble under pressure: decrease urgency weight
  if (behavior.response_to_pressure === 'crumbles') return -0.08;
  return 0;
}

// ════════════════════════════════════════════════════════════════════════════
// PUBLIC API: Get Full User Model (for display/debugging)
// ════════════════════════════════════════════════════════════════════════════

async function getUserModel(userId) {
  return await getOrCreateModel(userId);
}

// ════════════════════════════════════════════════════════════════════════════
// VALIDATION: Compare Two Users
// ════════════════════════════════════════════════════════════════════════════

async function compareUsers(userIdA, userIdB) {
  const [modelA, modelB] = await Promise.all([
    getOrCreateModel(userIdA),
    getOrCreateModel(userIdB),
  ]);

  const [modsA, modsB] = await Promise.all([
    getDecisionModifiers(userIdA),
    getDecisionModifiers(userIdB),
  ]);

  const buildUserSummary = (model, mods, id) => ({
    id,
    confidence: mods.model_confidence,
    total_events: mods.total_events,
    push_intensity: mods.push_intensity,
    difficulty_level: mods.difficulty_level,
    task_preference: model.behavior_profile?.task_preference,
    procrastination: model.behavior_profile?.procrastination_score,
    completion_rate: model.performance_profile?.completion_rate_overall,
    energy_sensitivity: mods.energy_sensitivity,
    needs_warmup: mods.needs_warmup,
    overwhelm_threshold: mods.overwhelm_threshold,
    behavior_weight_modifier: mods.behavior_weight_modifier,
    urgency_weight_modifier: mods.urgency_weight_modifier,
    // Scoring modifiers that directly change task scores
    scoring_modifiers: {
      quick_win_boost: mods.quick_win_boost,
      deep_work_penalty: mods.deep_work_penalty,
      long_task_penalty: mods.long_task_penalty,
      peak_hour_bonus: mods.peak_hour_bonus,
      success_boost: mods.success_boost,
      suggestion_dampen: mods.suggestion_dampen,
      break_boost: mods.break_boost,
    },
  });

  const userA = buildUserSummary(modelA, modsA, userIdA);
  const userB = buildUserSummary(modelB, modsB, userIdB);

  // Count actual differences
  const diffFields = [
    'push_intensity', 'difficulty_level', 'task_preference', 'energy_sensitivity',
    'needs_warmup', 'overwhelm_threshold', 'behavior_weight_modifier',
  ];
  const diffs = diffFields.filter(f => userA[f] !== userB[f]);

  const scoringDiffFields = Object.keys(userA.scoring_modifiers);
  const scoringDiffs = scoringDiffFields.filter(f =>
    userA.scoring_modifiers[f] !== userB.scoring_modifiers[f]
  );

  return {
    user_a: userA,
    user_b: userB,
    differences: {
      profile_differences: diffs.map(f => ({ field: f, user_a: userA[f], user_b: userB[f] })),
      scoring_differences: scoringDiffs.map(f => ({
        field: f,
        user_a: userA.scoring_modifiers[f],
        user_b: userB.scoring_modifiers[f],
        impact: describeModifierImpact(f, userA.scoring_modifiers[f], userB.scoring_modifiers[f]),
      })),
      total_profile_differences: diffs.length,
      total_scoring_differences: scoringDiffs.length,
      users_are_different: diffs.length > 0 || scoringDiffs.length > 0,
    },
  };
}

function describeModifierImpact(field, valA, valB) {
  const descriptions = {
    quick_win_boost: 'How much quick/easy tasks are boosted in scoring',
    deep_work_penalty: 'How much hard/long tasks are penalized for this user',
    long_task_penalty: 'Penalty on tasks over 45min (burnout protection)',
    peak_hour_bonus: 'Bonus when current time matches peak productivity hours',
    success_boost: 'Bonus for high performers on deep-work tasks',
    suggestion_dampen: 'Multiplier on urgency (< 1.0 = dampened, > 1.0 = amplified)',
    break_boost: 'How strongly break suggestions are boosted',
  };
  return descriptions[field] || field;
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

function ema(prev, newVal, alpha) {
  // Exponential Moving Average — smoothly blends old and new
  return Math.round((prev * (1 - alpha) + newVal * alpha) * 100) / 100;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function addUnique(obj, field, value) {
  if (!Array.isArray(obj[field])) obj[field] = [];
  if (!obj[field].includes(value)) obj[field].push(value);
}

function computeConfidence(dataPoints) {
  if (dataPoints >= CONFIDENCE_THRESHOLDS.mature) return 'mature';
  if (dataPoints >= CONFIDENCE_THRESHOLDS.high) return 'high';
  if (dataPoints >= CONFIDENCE_THRESHOLDS.medium) return 'medium';
  if (dataPoints >= CONFIDENCE_THRESHOLDS.low) return 'low';
  return 'cold_start';
}

/**
 * Adaptive Difficulty Engine
 * Adjusts task size, intensity, and expectations based on recent outcomes.
 * Called after each task_completed (success) or task_missed (failure).
 *
 * Difficulty levels: easy → normal → challenging → hard
 * Transitions are conservative to avoid oscillation.
 */
const DIFFICULTY_LEVELS = ['easy', 'normal', 'challenging', 'hard'];

function adjustDifficulty(adaptation, feedback, outcome) {
  if (!adaptation.difficulty_level || typeof adaptation.difficulty_level === 'string') {
    adaptation.difficulty_level = {
      current: adaptation.difficulty_level || 'normal',
      auto_adjusted: false,
      last_change: null,
      reason: null,
      consecutive_successes: 0,
      consecutive_failures: 0,
    };
  }

  const diff = adaptation.difficulty_level;
  const currentIdx = DIFFICULTY_LEVELS.indexOf(diff.current);

  if (outcome === 'success') {
    diff.consecutive_successes = (diff.consecutive_successes || 0) + 1;
    diff.consecutive_failures = 0;

    // After 5 consecutive successes: increase difficulty
    if (diff.consecutive_successes >= 5 && currentIdx < DIFFICULTY_LEVELS.length - 1) {
      diff.current = DIFFICULTY_LEVELS[currentIdx + 1];
      diff.auto_adjusted = true;
      diff.last_change = new Date().toISOString();
      diff.reason = `${diff.consecutive_successes} consecutive completions → increased difficulty`;
      diff.consecutive_successes = 0;

      // Scale up task expectations with difficulty
      const scaleFactors = { normal: 1.0, challenging: 1.15, hard: 1.3 };
      const scale = scaleFactors[diff.current] || 1.0;
      adaptation.optimal_task_size_minutes = Math.round((adaptation.optimal_task_size_minutes || 30) * scale);
      adaptation.max_daily_load = Math.min(12, Math.ceil((adaptation.max_daily_load || 5) * scale));
    }
  } else if (outcome === 'failure') {
    diff.consecutive_failures = (diff.consecutive_failures || 0) + 1;
    diff.consecutive_successes = 0;

    // After 3 consecutive failures: decrease difficulty
    if (diff.consecutive_failures >= 3 && currentIdx > 0) {
      diff.current = DIFFICULTY_LEVELS[currentIdx - 1];
      diff.auto_adjusted = true;
      diff.last_change = new Date().toISOString();
      diff.reason = `${diff.consecutive_failures} consecutive misses → decreased difficulty`;
      diff.consecutive_failures = 0;

      // Scale down task expectations
      const scaleDown = { normal: 1.0, easy: 0.8 };
      const scale = scaleDown[diff.current] || 0.85;
      adaptation.optimal_task_size_minutes = Math.max(10, Math.round((adaptation.optimal_task_size_minutes || 30) * scale));
      adaptation.max_daily_load = Math.max(2, Math.floor((adaptation.max_daily_load || 5) * scale));

      // Also lower push intensity when difficulty drops
      if (diff.current === 'easy') {
        adaptation.push_intensity = 'gentle';
        adaptation.needs_warmup = true;
      }
    }
  }
}

async function persistModel(userId, updates) {
  const UserModelDB = getUserModelDB();
  if (!UserModelDB) return;

  try {
    // Ensure both old and new column names are synced
    if (updates.total_events !== undefined) {
      updates.data_points = updates.total_events;
    }
    if (updates.confidence !== undefined) {
      // confidence already written directly
    }
    // last_event metadata
    updates.last_event_at = new Date();

    const [affectedRows] = await UserModelDB.update(updates, {
      where: { user_id: userId },
    });
    if (affectedRows === 0) {
      // Model doesn't exist yet — create it
      await UserModelDB.create({
        user_id: userId,
        ...updates,
      });
    }
    // Invalidate cache
    modelCache.delete(userId);
  } catch (e) {
    logger.warn('[USER_MODEL] persistModel failed:', e.message);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EXPORTS
// ════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Core model access
  getUserModel,
  getOrCreateModel,
  getDecisionModifiers,

  // Incremental updates (event-driven)
  onTaskCompleted,
  onTaskMissed,
  onDecisionFeedback,
  onHabitLogged,

  // Full rebuild
  rebuildFullModel,

  // Validation
  compareUsers,

  // Adaptive difficulty
  adjustDifficulty,

  // Defaults (for testing)
  getDefaultBehaviorProfile,
  getDefaultPerformanceProfile,
  getDefaultHabitProfile,
  getDefaultAdaptationProfile,
  getDefaultFeedbackLoop,

  // Helpers (for testing)
  computeConfidence,
  CONFIDENCE_THRESHOLDS,
};
