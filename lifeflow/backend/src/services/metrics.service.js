/**
 * Metrics Service — خدمة المقاييس والإحصاءات
 * =============================================
 * Phase 15: AI Performance Metrics Layer
 *
 * Tracks and exposes:
 *  - Task completion rate (today, 7-day, 30-day)
 *  - Suggestion acceptance rate (from adaptive behavior)
 *  - Burnout events count (from proactive engine)
 *  - AI intervention success rate (decisions that led to task completion)
 *  - Energy trend (average over past 7 days)
 *  - Mood trend
 *  - Habit streak health
 *  - Learning profile summary
 *
 * Exposed via: GET /api/v1/insights/metrics
 * Caching: 5-minute TTL per userId (heavy DB queries)
 * Performance: lazy-loading, non-blocking, individual try/catch per metric
 */

'use strict';

const moment = require('moment-timezone');
const logger  = require('../utils/logger');

// ─── Cache ────────────────────────────────────────────────────────────────────
const METRICS_CACHE_TTL = 5 * 60 * 1000;   // 5 minutes
const metricsCache = new Map();  // userId → { metrics, ts }

function getCachedMetrics(userId) {
  const cached = metricsCache.get(userId);
  if (cached && Date.now() - cached.ts < METRICS_CACHE_TTL) {
    return cached.metrics;
  }
  return null;
}

function setCachedMetrics(userId, metrics) {
  metricsCache.set(userId, { metrics, ts: Date.now() });
}

// ─── Model Loader ─────────────────────────────────────────────────────────────
function getModels() {
  const m = {};
  try { m.Task = require('../models/task.model'); } catch (_e) { logger.debug(`[METRICS_SERVICE] Model load failed: ${_e.message}`); }
  try { m.Habit = require('../models/habit.model').Habit; } catch (_e) { logger.debug(`[METRICS_SERVICE] Model load failed: ${_e.message}`); }
  try { m.MoodEntry = require('../models/mood.model'); } catch (_e) { logger.debug(`[METRICS_SERVICE] Model load failed: ${_e.message}`); }
  try { m.EnergyLog = require('../models/energy_log.model'); } catch (_e) { logger.debug(`[METRICS_SERVICE] Model load failed: ${_e.message}`); }
  try { m.ProductivityScore = require('../models/productivity_score.model'); } catch (_e) { logger.debug(`[METRICS_SERVICE] Model load failed: ${_e.message}`); }
  return m;
}

// ─── Lazy Service Loader ──────────────────────────────────────────────────────
function getLearning() {
  try { return require('./learning.engine.service'); } catch (_e) { logger.debug(`[METRICS_SERVICE] Module './learning.engine.service' not available: ${_e.message}`); return null; }
}
function getAdaptiveBehavior() {
  try { return require('./adaptive.behavior.service'); } catch (_e) { logger.debug(`[METRICS_SERVICE] Module './adaptive.behavior.service' not available: ${_e.message}`); return null; }
}
function getDecisionEngine() {
  try { return require('./decision.engine.service'); } catch (_e) { logger.debug(`[METRICS_SERVICE] Module './decision.engine.service' not available: ${_e.message}`); return null; }
}

// ─── Task Completion Metrics ──────────────────────────────────────────────────
async function getTaskMetrics(userId, timezone) {
  const { Task } = getModels();
  if (!Task) return null;

  try {
    const { Op } = require('sequelize');
    const now      = moment().tz(timezone);
    const today    = now.startOf('day').toDate();
    const sevenDaysAgo = now.clone().subtract(7, 'days').startOf('day').toDate();
    const thirtyDaysAgo = now.clone().subtract(30, 'days').startOf('day').toDate();

    // Today's tasks
    const [todayAll, todayDone] = await Promise.all([
      Task.count({ where: { user_id: userId, due_date: { [Op.gte]: today } } }),
      Task.count({ where: { user_id: userId, status: 'completed', completed_at: { [Op.gte]: today } } }),
    ]);

    // 7-day tasks
    const [week7All, week7Done] = await Promise.all([
      Task.count({ where: { user_id: userId, due_date: { [Op.between]: [sevenDaysAgo, new Date()] } } }),
      Task.count({ where: { user_id: userId, status: 'completed', completed_at: { [Op.between]: [sevenDaysAgo, new Date()] } } }),
    ]);

    // 30-day tasks
    const [month30All, month30Done] = await Promise.all([
      Task.count({ where: { user_id: userId, due_date: { [Op.between]: [thirtyDaysAgo, new Date()] } } }),
      Task.count({ where: { user_id: userId, status: 'completed', completed_at: { [Op.between]: [thirtyDaysAgo, new Date()] } } }),
    ]);

    // Overdue count
    const overdueCount = await Task.count({
      where: {
        user_id : userId,
        status  : { [Op.in]: ['pending', 'in_progress'] },
        due_date: { [Op.lt]: today },
      },
    });

    const safeRate = (done, total) => total > 0 ? Math.round((done / total) * 100) : 0;

    return {
      today     : { total: todayAll,   completed: todayDone,   rate: safeRate(todayDone,  todayAll) },
      week7     : { total: week7All,   completed: week7Done,   rate: safeRate(week7Done,  week7All) },
      month30   : { total: month30All, completed: month30Done, rate: safeRate(month30Done, month30All) },
      overdue   : overdueCount,
    };
  } catch (err) {
    logger.warn('[METRICS] Task metrics error:', err.message);
    return null;
  }
}

// ─── Energy Trend ─────────────────────────────────────────────────────────────
async function getEnergyTrend(userId, timezone) {
  const { EnergyLog } = getModels();
  if (!EnergyLog) return null;

  try {
    const { Op } = require('sequelize');
    const sevenDaysAgo = moment().tz(timezone).subtract(7, 'days').toDate();

    const logs = await EnergyLog.findAll({
      where  : { user_id: userId, created_at: { [Op.gte]: sevenDaysAgo } },
      order  : [['created_at', 'ASC']],
      raw    : true,
      limit  : 50,
    });

    if (logs.length === 0) return null;

    const scores = logs.map(l => l.score || l.energy_score || 0).filter(s => s > 0);
    const avg    = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const trend  = scores.length >= 3
      ? (scores[scores.length - 1] > scores[0] ? 'improving' : scores[scores.length - 1] < scores[0] ? 'declining' : 'stable')
      : 'unknown';

    return { average: avg, trend, dataPoints: scores.length, latestScore: scores[scores.length - 1] };
  } catch (err) {
    logger.warn('[METRICS] Energy trend error:', err.message);
    return null;
  }
}

// ─── Mood Trend ───────────────────────────────────────────────────────────────
async function getMetricsMoodTrend(userId, timezone) {
  const { MoodEntry } = getModels();
  if (!MoodEntry) return null;

  try {
    const { Op } = require('sequelize');
    const sevenDaysAgo = moment().tz(timezone).subtract(7, 'days').toDate();

    const entries = await MoodEntry.findAll({
      where : { user_id: userId, createdAt: { [Op.gte]: sevenDaysAgo } },
      order : [['createdAt', 'ASC']],
      raw   : true,
      limit : 30,
    });

    if (entries.length === 0) return null;

    const scores = entries.map(e => e.mood_score || e.score || e.rating || 5).filter(s => s > 0);
    const avg    = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
    const trend  = scores.length >= 3
      ? (scores[scores.length - 1] > scores[0] ? 'improving' : scores[scores.length - 1] < scores[0] ? 'declining' : 'stable')
      : 'unknown';

    return { average: avg, trend, dataPoints: scores.length, latestScore: scores[scores.length - 1] };
  } catch (err) {
    logger.warn('[METRICS] Mood trend error:', err.message);
    return null;
  }
}

// ─── Habit Health ─────────────────────────────────────────────────────────────
async function getHabitHealth(userId) {
  const { Habit } = getModels();
  if (!Habit) return null;

  try {
    const habits = await Habit.findAll({
      where  : { user_id: userId, is_active: true },
      raw    : true,
      limit  : 20,
    });

    if (habits.length === 0) return null;

    const streaks = habits.map(h => h.current_streak || 0);
    const avgStreak = streaks.length > 0 ? Math.round(streaks.reduce((a, b) => a + b, 0) / streaks.length) : 0;
    const longestStreak = Math.max(...streaks);
    const activeHabits  = habits.filter(h => (h.current_streak || 0) > 0).length;

    return {
      total         : habits.length,
      active        : activeHabits,
      averageStreak : avgStreak,
      longestStreak,
      healthScore   : Math.round((activeHabits / habits.length) * 100),
    };
  } catch (err) {
    logger.warn('[METRICS] Habit health error:', err.message);
    return null;
  }
}

// ─── AI Metrics (from learning + decision engines) ───────────────────────────
function getAIMetrics(userId) {
  const ai = { interventions: null, successRate: null, suggestionAcceptRate: null, learningDataPoints: null };

  // Decision log
  const decisionEngine = getDecisionEngine();
  if (decisionEngine) {
    try {
      const log = decisionEngine.getDecisionLog(userId, 100);
      const executed    = log.filter(d => d.status === 'executed' || d.status === 'confirmed_and_executed').length;
      const failed      = log.filter(d => d.status === 'failed').length;
      ai.interventions  = log.length;
      ai.successRate    = executed + failed > 0 ? Math.round((executed / (executed + failed)) * 100) : null;
    } catch (_e) { logger.debug(`[METRICS_SERVICE] Non-critical operation failed: ${_e.message}`); }
  }

  // Learning engine
  const learning = getLearning();
  if (learning) {
    try {
      const stats = learning.getLearningStats(userId);
      ai.suggestionAcceptRate = stats.suggestionAcceptRate;
      ai.learningDataPoints   = stats.totalRecords;
    } catch (_e) { logger.debug(`[METRICS_SERVICE] Non-critical operation failed: ${_e.message}`); }
  }

  // Adaptive behavior
  const adaptive = getAdaptiveBehavior();
  if (adaptive) {
    try {
      const profile = adaptive.getBehaviorProfile ? adaptive.getBehaviorProfile(userId) : null;
      if (profile) {
        ai.suggestionRate     = profile.suggestionRate;
        ai.engagementScore    = profile.engagementScore;
      }
    } catch (_e) { logger.debug(`[METRICS_SERVICE] Non-critical operation failed: ${_e.message}`); }
  }

  return ai;
}

// ─── Burnout Events Counter ───────────────────────────────────────────────────
// Burnout events are tracked in decision log as 'burnout_risk' entries
function getBurnoutEvents(userId) {
  const decisionEngine = getDecisionEngine();
  if (!decisionEngine) return 0;
  try {
    const log = decisionEngine.getDecisionLog(userId, 100);
    return log.filter(d => d.action === 'burnout_risk' || d.checkType === 'burnout_risk').length;
  } catch (_) { return 0; }
}

// ─── Main: Get Full Metrics ───────────────────────────────────────────────────
/**
 * Get comprehensive metrics for a user.
 * Caches results for 5 minutes.
 *
 * @param {string} userId
 * @param {string} timezone
 * @returns {object} MetricsReport
 */
async function getUserMetrics(userId, timezone = 'Africa/Cairo') {
  // Check cache
  const cached = getCachedMetrics(userId);
  if (cached) {
    logger.debug(`[METRICS] Returning cached metrics for ${userId}`);
    return cached;
  }

  logger.info(`[METRICS] Computing metrics for ${userId}`);

  // Run all metrics in parallel (non-blocking, each has its own error handling)
  const [taskMetrics, energyTrend, moodTrend, habitHealth] = await Promise.all([
    getTaskMetrics(userId, timezone),
    getEnergyTrend(userId, timezone),
    getMetricsMoodTrend(userId, timezone),
    getHabitHealth(userId),
  ]);

  const aiMetrics    = getAIMetrics(userId);
  const burnoutEvents = getBurnoutEvents(userId);

  // Compute overall health score
  let healthScore = 60;  // baseline
  if (taskMetrics?.week7?.rate != null) healthScore = taskMetrics.week7.rate;
  if (energyTrend?.average != null) healthScore = Math.round((healthScore + energyTrend.average) / 2);
  if (moodTrend?.average != null)   healthScore = Math.round((healthScore + (moodTrend.average / 10) * 100) / 2);

  // Generate summary in Arabic
  const summary = [];
  if (taskMetrics?.week7?.rate >= 70) summary.push(`أنجزت ${taskMetrics.week7.rate}٪ من مهام الأسبوع 💪`);
  if (taskMetrics?.overdue > 0)       summary.push(`${taskMetrics.overdue} مهمة متأخرة تحتاج اهتماماً ⏰`);
  if (energyTrend?.trend === 'improving') summary.push('طاقتك في تحسن مستمر ✅');
  if (energyTrend?.trend === 'declining') summary.push('طاقتك في انخفاض — راقب نومك وراحتك ⚠️');
  if (habitHealth?.healthScore >= 70) summary.push(`عاداتك صحية (${habitHealth.healthScore}٪ نشطة) 🌟`);
  if (burnoutEvents > 0)              summary.push(`سُجِّل ${burnoutEvents} حدث إجهاد خلال الفترة الأخيرة`);

  const metrics = {
    userId,
    timestamp     : new Date().toISOString(),
    healthScore   : Math.min(100, Math.round(healthScore)),
    tasks         : taskMetrics,
    energy        : energyTrend,
    mood          : moodTrend,
    habits        : habitHealth,
    ai            : aiMetrics,
    burnoutEvents,
    summary,
  };

  setCachedMetrics(userId, metrics);
  return metrics;
}

// ─── Track AI Intervention ────────────────────────────────────────────────────
/**
 * Record that an AI intervention was made (for success tracking).
 * Called by proactive engine and orchestrator.
 *
 * @param {string} userId
 * @param {string} type    - 'suggestion' | 'notification' | 'decision'
 * @param {boolean} accepted - was it accepted?
 */
const interventionLog = new Map();  // userId → [{type, accepted, ts}]

function recordIntervention(userId, type, accepted) {
  let log = interventionLog.get(userId) || [];
  log.push({ type, accepted, ts: Date.now() });
  if (log.length > 200) log = log.slice(-200);
  interventionLog.set(userId, log);

  // Also feed learning engine
  const learning = getLearning();
  if (learning) {
    try {
      learning.recordOutcome(userId, {
        action       : 'ai_intervention',
        success      : accepted,
        suggestionType: type,
        userResponse : accepted ? 'accepted' : 'ignored',
      });
    } catch (_e) { logger.debug(`[METRICS_SERVICE] Non-critical operation failed: ${_e.message}`); }
  }
}

// ─── Cache Invalidation ───────────────────────────────────────────────────────
function invalidateCache(userId) {
  metricsCache.delete(userId);
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  getUserMetrics,
  recordIntervention,
  invalidateCache,
  // individual metric getters (for use in other services)
  getTaskMetrics,
  getEnergyTrend,
  getMoodTrend: getMetricsMoodTrend,
  getHabitHealth,
  getAIMetrics,
};
