/**
 * Learning Engine Service — محرك التعلم الذاتي
 * ================================================
 * Phase 15: Self-Learning AI Layer
 *
 * Tracks AI decisions, user responses, and task outcomes.
 * Computes:
 *  - Success rates per action type
 *  - Optimal execution times (hour of day when tasks succeed)
 *  - Failure patterns (which actions fail and why)
 *  - User preference patterns (accepted vs rejected suggestions)
 *  - Energy/mood correlation with productivity
 *
 * Storage: In-memory (ring-buffer, per-user, TTL 24h)
 * Exports: getUserLearningProfile(userId), recordOutcome(), recordDecision()
 */

'use strict';

const logger = require('../utils/logger');

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_RECORDS_PER_USER  = 500;   // ring-buffer limit
const LEARNING_TTL_MS       = 24 * 60 * 60 * 1000;   // 24 hours
const MIN_SAMPLES_FOR_STATS = 3;     // minimum records before computing stats

// ─── Storage ──────────────────────────────────────────────────────────────────
// LearningStats: userId → { records[], lastUpdated, stats(lazy) }
const learningStore = new Map();

// ─── Internal Helpers ─────────────────────────────────────────────────────────

function getStore(userId) {
  let store = learningStore.get(userId);
  if (!store) {
    store = {
      records    : [],   // ring buffer of outcome records
      lastUpdated: Date.now(),
      _statsCache: null,
      _statsDirty: true,
    };
    learningStore.set(userId, store);
  }
  return store;
}

function pruneOldRecords(store) {
  const cutoff = Date.now() - LEARNING_TTL_MS;
  store.records = store.records.filter(r => r.ts > cutoff);
  if (store.records.length > MAX_RECORDS_PER_USER) {
    store.records = store.records.slice(-MAX_RECORDS_PER_USER);
  }
}

function hourBucket(ts) {
  return new Date(ts).getHours();  // 0-23
}

function dayBucket(ts) {
  return new Date(ts).getDay();    // 0=Sun … 6=Sat
}

// ─── Record Decision ──────────────────────────────────────────────────────────
/**
 * Record an AI decision event (before outcome is known).
 *
 * @param {string} userId
 * @param {object} decision
 * @param {string} decision.action        - action type e.g. 'create_task'
 * @param {string} decision.risk          - 'low' | 'medium' | 'high'
 * @param {number} [decision.energy]      - energy level 0-100
 * @param {number} [decision.mood]        - mood 1-10
 * @param {string} [decision.mode]        - 'companion' | 'manager' | 'hybrid'
 * @param {string} [decision.intent]      - detected intent
 */
function recordDecision(userId, decision) {
  const store = getStore(userId);

  const record = {
    type      : 'decision',
    action    : decision.action || 'unknown',
    risk      : decision.risk || 'low',
    energy    : decision.energy || null,
    mood      : decision.mood || null,
    mode      : decision.mode || 'hybrid',
    intent    : decision.intent || null,
    hour      : hourBucket(Date.now()),
    day       : dayBucket(Date.now()),
    ts        : Date.now(),
    outcome   : null,   // filled in later via recordOutcome
  };

  store.records.push(record);
  store._statsDirty = true;
  store.lastUpdated = Date.now();

  pruneOldRecords(store);

  logger.debug(`[LEARNING] Decision recorded for ${userId}: ${record.action}`);
  return record;
}

// ─── Record Outcome ───────────────────────────────────────────────────────────
/**
 * Record the outcome of a previous decision or any user action.
 *
 * @param {string} userId
 * @param {object} outcome
 * @param {string} outcome.action         - matching action type
 * @param {boolean} outcome.success       - did it succeed?
 * @param {string} [outcome.failReason]   - reason for failure
 * @param {number} [outcome.energy]       - energy at time of outcome
 * @param {number} [outcome.mood]         - mood at time of outcome
 * @param {string} [outcome.suggestionType] - suggestion type if from proactive
 * @param {string} [outcome.userResponse] - 'accepted' | 'rejected' | 'ignored'
 */
function recordOutcome(userId, outcome) {
  const store = getStore(userId);

  const record = {
    type           : 'outcome',
    action         : outcome.action || 'unknown',
    success        : outcome.success === true,
    failReason     : outcome.failReason || null,
    energy         : outcome.energy || null,
    mood           : outcome.mood || null,
    suggestionType : outcome.suggestionType || null,
    userResponse   : outcome.userResponse || null,
    hour           : hourBucket(Date.now()),
    day            : dayBucket(Date.now()),
    ts             : Date.now(),
  };

  store.records.push(record);
  store._statsDirty = true;
  store.lastUpdated = Date.now();

  pruneOldRecords(store);

  // Try to link to the most recent matching decision record
  const matchingDecision = store.records
    .filter(r => r.type === 'decision' && r.action === outcome.action && r.outcome === null)
    .pop();
  if (matchingDecision) {
    matchingDecision.outcome = outcome.success ? 'success' : 'failure';
  }

  logger.debug(`[LEARNING] Outcome recorded for ${userId}: ${record.action} → ${record.success ? '✓' : '✗'}`);
  return record;
}

// ─── Compute Stats ────────────────────────────────────────────────────────────

function computeStats(store) {
  if (!store._statsDirty && store._statsCache) {
    return store._statsCache;
  }

  const records  = store.records;
  const outcomes = records.filter(r => r.type === 'outcome');

  // ── 1. Success rate per action ──────────────────────────────────────────────
  const actionStats = {};
  for (const r of outcomes) {
    if (!actionStats[r.action]) {
      actionStats[r.action] = { total: 0, success: 0, failures: [] };
    }
    actionStats[r.action].total++;
    if (r.success) {
      actionStats[r.action].success++;
    } else if (r.failReason) {
      actionStats[r.action].failures.push(r.failReason);
    }
  }

  const successRates = {};
  for (const [action, s] of Object.entries(actionStats)) {
    successRates[action] = s.total >= MIN_SAMPLES_FOR_STATS
      ? Math.round((s.success / s.total) * 100)
      : null;   // not enough data
  }

  // ── 2. Optimal hours (hours where success rate is highest) ─────────────────
  const hourSuccess = new Array(24).fill(0).map(() => ({ success: 0, total: 0 }));
  for (const r of outcomes) {
    if (r.hour != null) {
      hourSuccess[r.hour].total++;
      if (r.success) hourSuccess[r.hour].success++;
    }
  }

  const optimalHours = hourSuccess
    .map((h, i) => ({ hour: i, rate: h.total >= MIN_SAMPLES_FOR_STATS ? h.success / h.total : -1 }))
    .filter(h => h.rate >= 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 4)
    .map(h => h.hour);

  // ── 3. Failure patterns ─────────────────────────────────────────────────────
  const failureCounts = {};
  for (const r of outcomes.filter(r => !r.success && r.failReason)) {
    failureCounts[r.failReason] = (failureCounts[r.failReason] || 0) + 1;
  }

  const failurePatterns = Object.entries(failureCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  // ── 4. Suggestion acceptance rate ──────────────────────────────────────────
  const suggestionRecords = outcomes.filter(r => r.suggestionType && r.userResponse);
  const acceptedSuggestions = suggestionRecords.filter(r => r.userResponse === 'accepted').length;
  const suggestionAcceptRate = suggestionRecords.length >= MIN_SAMPLES_FOR_STATS
    ? Math.round((acceptedSuggestions / suggestionRecords.length) * 100)
    : null;

  // ── 5. Energy/mood correlation with task success ────────────────────────────
  const withEnergy  = outcomes.filter(r => r.energy != null && r.action === 'complete_task');
  let energyCorrelation = null;
  if (withEnergy.length >= MIN_SAMPLES_FOR_STATS) {
    const highEnergy = withEnergy.filter(r => r.energy >= 60);
    const lowEnergy  = withEnergy.filter(r => r.energy < 60);
    const highRate   = highEnergy.length > 0 ? highEnergy.filter(r => r.success).length / highEnergy.length : null;
    const lowRate    = lowEnergy.length  > 0 ? lowEnergy.filter(r => r.success).length  / lowEnergy.length  : null;

    if (highRate !== null && lowRate !== null) {
      energyCorrelation = {
        highEnergySuccessRate: Math.round(highRate * 100),
        lowEnergySuccessRate : Math.round(lowRate  * 100),
        recommendation: highRate > lowRate + 0.2
          ? 'schedule_important_tasks_when_high_energy'
          : 'energy_not_a_strong_predictor',
      };
    }
  }

  // ── 6. Most successful action type ─────────────────────────────────────────
  let bestAction = null;
  let bestRate   = -1;
  for (const [action, rate] of Object.entries(successRates)) {
    if (rate !== null && rate > bestRate) {
      bestRate   = rate;
      bestAction = action;
    }
  }

  // ── 7. Preferred suggestion types ──────────────────────────────────────────
  const suggestionTypes = {};
  for (const r of suggestionRecords) {
    if (!suggestionTypes[r.suggestionType]) {
      suggestionTypes[r.suggestionType] = { accepted: 0, total: 0 };
    }
    suggestionTypes[r.suggestionType].total++;
    if (r.userResponse === 'accepted') {
      suggestionTypes[r.suggestionType].accepted++;
    }
  }

  const preferredSuggestions = Object.entries(suggestionTypes)
    .filter(([, s]) => s.total >= 2)
    .sort((a, b) => (b[1].accepted / b[1].total) - (a[1].accepted / a[1].total))
    .slice(0, 3)
    .map(([type]) => type);

  const stats = {
    totalRecords         : records.length,
    totalOutcomes        : outcomes.length,
    successRates,
    optimalHours,
    failurePatterns,
    suggestionAcceptRate,
    energyCorrelation,
    bestAction,
    preferredSuggestions,
    computedAt           : Date.now(),
  };

  store._statsCache = stats;
  store._statsDirty = false;

  return stats;
}

// ─── Public: getUserLearningProfile ──────────────────────────────────────────
/**
 * Returns a full learning profile for a user.
 * This is the main export used by decision engine, proactive engine, etc.
 *
 * @param {string} userId
 * @returns {object} LearningProfile
 */
function getUserLearningProfile(userId) {
  const store = getStore(userId);
  const stats = computeStats(store);

  // Derive actionable insights
  const insights = [];

  if (stats.optimalHours.length > 0) {
    insights.push({
      type       : 'optimal_hours',
      description: `أفضل أوقات الإنجاز: ${stats.optimalHours.map(h => `${h}:00`).join(', ')}`,
      data       : stats.optimalHours,
    });
  }

  if (stats.suggestionAcceptRate !== null) {
    if (stats.suggestionAcceptRate < 30) {
      insights.push({
        type       : 'low_suggestion_acceptance',
        description: `معدل قبول الاقتراحات منخفض (${stats.suggestionAcceptRate}٪) — سيتم تقليل التدخل`,
        data       : { rate: stats.suggestionAcceptRate },
      });
    } else if (stats.suggestionAcceptRate > 70) {
      insights.push({
        type       : 'high_suggestion_acceptance',
        description: `المستخدم يتفاعل بشكل إيجابي مع الاقتراحات (${stats.suggestionAcceptRate}٪)`,
        data       : { rate: stats.suggestionAcceptRate },
      });
    }
  }

  if (stats.energyCorrelation?.recommendation === 'schedule_important_tasks_when_high_energy') {
    insights.push({
      type       : 'energy_task_correlation',
      description: 'الإنجاز أعلى عند مستوى طاقة مرتفع — يُفضَّل جدولة المهام المهمة حين الطاقة ≥ 60',
      data       : stats.energyCorrelation,
    });
  }

  if (stats.failurePatterns.length > 0) {
    insights.push({
      type       : 'failure_patterns',
      description: `أكثر أسباب الفشل: ${stats.failurePatterns[0].reason}`,
      data       : stats.failurePatterns,
    });
  }

  return {
    userId,
    stats,
    insights,
    summary: {
      overallSuccessRate: _computeOverallSuccess(stats.successRates),
      preferredSuggestions: stats.preferredSuggestions,
      optimalHours        : stats.optimalHours,
      suggestionAcceptRate: stats.suggestionAcceptRate,
    },
    generatedAt: new Date().toISOString(),
  };
}

function _computeOverallSuccess(successRates) {
  const rates = Object.values(successRates).filter(r => r !== null);
  if (rates.length === 0) return null;
  return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
}

// ─── Lightweight getter for quick access ─────────────────────────────────────
/**
 * Get just the stats object (cheaper than full profile).
 * @param {string} userId
 */
function getLearningStats(userId) {
  const store = getStore(userId);
  return computeStats(store);
}

/**
 * Get the success rate for a specific action type.
 * Returns null if insufficient data.
 * @param {string} userId
 * @param {string} action
 */
function getActionSuccessRate(userId, action) {
  const stats = getLearningStats(userId);
  return stats.successRates[action] ?? null;
}

/**
 * Get the best time to schedule an action based on past success patterns.
 * Returns null if insufficient data.
 * @param {string} userId
 */
function getOptimalHour(userId) {
  const stats = getLearningStats(userId);
  return stats.optimalHours?.[0] ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Part B — Lightweight ML Functions (No TensorFlow)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * calculateSuccessRate(logs, filterFn)
 * Pure function: given an array of outcome logs and an optional filter,
 * return 0-1 success rate.
 *
 * @param {Array}    logs      - array of outcome records
 * @param {Function} [filterFn] - optional predicate to filter logs first
 * @returns {number} 0-1 success rate, or -1 if no data
 */
function calculateSuccessRate(logs, filterFn) {
  const filtered = filterFn ? logs.filter(filterFn) : logs;
  if (filtered.length === 0) return -1;
  const successes = filtered.filter(r => r.success === true).length;
  return parseFloat((successes / filtered.length).toFixed(3));
}

/**
 * calculateMorningSuccessRate(userId)
 * Returns success rate for tasks completed in morning hours (6–12).
 */
function calculateMorningSuccessRate(userId) {
  const store = getStore(userId);
  const outcomes = store.records.filter(r => r.type === 'outcome');
  return calculateSuccessRate(outcomes, r => r.hour >= 6 && r.hour <= 12);
}

/**
 * calculateEveningSuccessRate(userId)
 * Returns success rate for tasks completed in evening hours (18–23).
 */
function calculateEveningSuccessRate(userId) {
  const store = getStore(userId);
  const outcomes = store.records.filter(r => r.type === 'outcome');
  return calculateSuccessRate(outcomes, r => r.hour >= 18 && r.hour <= 23);
}

/**
 * scoreDecision(priority, daysUntilDue, energyMatch, historicalSuccess)
 * Formula: score = priority×0.3 + deadline×0.2 + energy_match×0.2 + historical_success×0.3
 *
 * @param {string} priority          - 'urgent'|'high'|'medium'|'low'
 * @param {number} daysUntilDue      - days remaining (0 = today, negative = overdue)
 * @param {number} energyMatch       - 0-1 how well current energy matches task demands
 * @param {number} historicalSuccess - 0-1 historical success rate for this action type
 * @returns {number} score 0-100
 */
function scoreDecision(priority, daysUntilDue, energyMatch, historicalSuccess) {
  const priorityMap = { urgent: 1.0, high: 0.85, medium: 0.6, low: 0.35 };
  const pScore  = priorityMap[priority] || 0.6;

  // deadline score: overdue=1.0, today=0.9, 1 day=0.7, 7+ days=0.2
  let dScore;
  if (daysUntilDue === null || daysUntilDue === undefined) dScore = 0.5;
  else if (daysUntilDue <= 0)  dScore = 1.0;
  else if (daysUntilDue <= 1)  dScore = 0.9;
  else if (daysUntilDue <= 3)  dScore = 0.75;
  else if (daysUntilDue <= 7)  dScore = 0.55;
  else                          dScore = 0.2;

  const eMatch  = Math.max(0, Math.min(1, energyMatch || 0.5));
  const hScore  = historicalSuccess >= 0 ? Math.max(0, Math.min(1, historicalSuccess)) : 0.5;

  const raw = (pScore * 0.3) + (dScore * 0.2) + (eMatch * 0.2) + (hScore * 0.3);
  return Math.round(raw * 100);
}

/**
 * predictTaskCompletion(task, context, userId)
 * Returns probability 0-1 based on similar past outcomes.
 *
 * @param {object} task            - { priority, due_date, action? }
 * @param {object} context         - { energy, mood, hour }
 * @param {string} userId
 * @returns {number} probability 0-1
 */
function predictTaskCompletion(task, context, userId) {
  const store = getStore(userId);
  const outcomes = store.records.filter(r => r.type === 'outcome');

  if (outcomes.length < MIN_SAMPLES_FOR_STATS) {
    // Insufficient data — use heuristic baseline
    const priorityBase = { urgent: 0.82, high: 0.72, medium: 0.58, low: 0.44 };
    return priorityBase[task.priority] || 0.60;
  }

  // Find "similar" past records (matching action type and/or hour band)
  const actionType = task.action || 'complete_task';
  const hour       = context.hour != null ? context.hour : new Date().getHours();
  const energy     = context.energy || 55;

  const similarLogs = outcomes.filter(r => {
    const sameAction = r.action === actionType;
    const sameHourBand = Math.abs((r.hour || 0) - hour) <= 2;
    const similarEnergy = r.energy ? Math.abs(r.energy - energy) <= 20 : true;
    return sameAction || (sameHourBand && similarEnergy);
  });

  // Base probability from similar logs
  const baseRate = calculateSuccessRate(
    similarLogs.length >= MIN_SAMPLES_FOR_STATS ? similarLogs : outcomes
  );

  // Adjust by priority, energy, mood
  const priorityBonus = { urgent: 0.12, high: 0.07, medium: 0, low: -0.07 };
  const energyBonus   = energy >= 70 ? 0.08 : energy < 35 ? -0.12 : 0;
  const moodBonus     = (context.mood || 5) >= 7 ? 0.05 : (context.mood || 5) < 4 ? -0.07 : 0;

  const adjusted = (baseRate >= 0 ? baseRate : 0.60)
    + (priorityBonus[task.priority] || 0)
    + energyBonus
    + moodBonus;

  return parseFloat(Math.max(0.05, Math.min(0.97, adjusted)).toFixed(3));
}

/**
 * detectBurnoutRisk(userId, context)
 * Burnout = low_mood_days×0.4 + overdue_tasks×0.3 + low_completion×0.3
 *
 * @param {string} userId
 * @param {object} context  - { mood, overdueCount, recentMoods }
 * @returns {number} burnout risk 0-1
 */
function detectBurnoutRisk(userId, context = {}) {
  const store = getStore(userId);
  const outcomes = store.records.filter(r => r.type === 'outcome');

  // Low mood days component
  const moodEntries = [...outcomes, ...store.records.filter(r => r.mood != null)];
  const recentMoods = (context.recentMoods || []).length > 0
    ? context.recentMoods
    : moodEntries.filter(r => {
        const dayMs = 7 * 24 * 60 * 60 * 1000;
        return r.ts && r.ts > Date.now() - dayMs && r.mood != null;
      }).map(r => r.mood);

  const totalMoodDays = recentMoods.length;
  const lowMoodDays   = recentMoods.filter(m => m <= 4).length;
  const moodFactor    = totalMoodDays > 0 ? lowMoodDays / Math.min(totalMoodDays, 7) : 0.3;

  // Current mood from context
  const currentMood = context.mood || 5;
  const currentMoodFactor = currentMood <= 4 ? 1 : currentMood <= 6 ? 0.4 : 0;

  // Overdue tasks component
  const overdueCount = context.overdueCount || 0;
  const overdueFactor = overdueCount === 0 ? 0
    : overdueCount <= 2 ? 0.3
    : overdueCount <= 5 ? 0.6
    : 1.0;

  // Low completion rate component
  const completionRate = calculateSuccessRate(outcomes, r => r.action === 'complete_task');
  const completionFactor = completionRate < 0 ? 0.3
    : completionRate < 0.35 ? 0.9
    : completionRate < 0.55 ? 0.5
    : 0.1;

  // Combined formula
  const moodWeight       = (moodFactor * 0.5 + currentMoodFactor * 0.5);
  const burnout = (moodWeight * 0.4) + (overdueFactor * 0.3) + (completionFactor * 0.3);

  return parseFloat(Math.min(1, Math.max(0, burnout)).toFixed(3));
}

/**
 * getMLPredictions(userId, context)
 * Returns the full ML prediction bundle for use in decision/prediction engines.
 *
 * @param {string} userId
 * @param {object} context - { energy, mood, overdueCount, hour, recentMoods }
 * @returns {object} { task_completion_probability, burnout_risk, focus_score, best_focus_hours, confidence }
 */
function getMLPredictions(userId, context = {}) {
  const store = getStore(userId);
  const stats = computeStats(store);

  const hour   = context.hour != null ? context.hour : new Date().getHours();
  const energy = context.energy || 55;
  const mood   = context.mood   || 5;

  // Task completion probability for a generic task
  const completionProb = predictTaskCompletion(
    { priority: 'medium', action: 'complete_task' },
    { energy, mood, hour },
    userId
  );

  // Burnout risk
  const burnoutRisk = detectBurnoutRisk(userId, context);

  // Focus score: energy(0.4) + mood(0.2) + time-of-day(0.2) + historical(0.2)
  const energyScore   = Math.round(energy * 0.4);
  const moodScore     = Math.round(((mood / 10) * 100) * 0.2);
  const hourScore     = stats.optimalHours.includes(hour) ? 20 : 10;
  const histScore     = stats.optimalHours.length > 0 ? 20 : 10;
  const focusScore    = Math.min(100, energyScore + moodScore + hourScore + histScore);

  // Best focus hours from learning data, fallback to morning peak
  const bestFocusHours = stats.optimalHours.length > 0
    ? stats.optimalHours.slice(0, 3)
    : [9, 10, 11];

  // Data confidence based on record count
  const recordCount = store.records.length;
  const confidence  = recordCount >= 50 ? 'high'
    : recordCount >= 20 ? 'medium'
    : recordCount >= MIN_SAMPLES_FOR_STATS ? 'low'
    : 'insufficient';

  return {
    task_completion_probability: completionProb,
    burnout_risk               : burnoutRisk,
    focus_score                : focusScore,
    best_focus_hours           : bestFocusHours,
    success_rates              : stats.successRates,
    failure_patterns           : stats.failurePatterns,
    confidence,
    data_points                : recordCount,
    computed_at                : new Date().toISOString(),
  };
}

// ─── Utility: Seed test data (dev only) ──────────────────────────────────────
function _seedTestData(userId) {
  for (let i = 0; i < 20; i++) {
    const hour = Math.floor(Math.random() * 24);
    const success = hour >= 8 && hour <= 12 ? Math.random() > 0.2 : Math.random() > 0.5;
    recordOutcome(userId, {
      action    : ['create_task', 'complete_task', 'reschedule_task'][i % 3],
      success,
      energy    : 40 + Math.floor(Math.random() * 60),
      mood      : 3 + Math.floor(Math.random() * 7),
      userResponse: success ? 'accepted' : 'ignored',
      suggestionType: ['overdue_tasks', 'energy_drop', 'habit_streak'][i % 3],
    });
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  // Core recording
  recordDecision,
  recordOutcome,
  // Profiles & stats
  getUserLearningProfile,
  getLearningStats,
  getActionSuccessRate,
  getOptimalHour,
  // Part B — ML Functions
  calculateSuccessRate,
  calculateMorningSuccessRate,
  calculateEveningSuccessRate,
  scoreDecision,
  predictTaskCompletion,
  detectBurnoutRisk,
  getMLPredictions,
  // Dev helpers
  _seedTestData,
};
