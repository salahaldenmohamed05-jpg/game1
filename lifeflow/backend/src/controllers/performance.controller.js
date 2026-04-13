/**
 * AI Performance Engine Controller
 * ==================================
 * REST endpoints for productivity scores, energy profiling,
 * procrastination flags, and coaching.
 */

const performanceService    = require('../services/performance.service');
const weeklyAuditService    = require('../services/weekly-audit.service');
const procrastinationService = require('../services/procrastination.service');
const energyService         = require('../services/energy.service');
const coachingService       = require('../services/coaching.service');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// PERFORMANCE SCORES
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/performance/today */
const getTodayScore = async (req, res) => {
  try {
    const userId   = req.user.id;
    const timezone = req.user.timezone || 'Africa/Cairo';
    const score    = await performanceService.computeDailyScore(userId, null, timezone);
    res.json({ success: true, data: score });
  } catch (error) {
    logger.error('getTodayScore error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في حساب الدرجة' });
  }
};

/** GET /api/v1/performance/history?days=30 */
const getScoreHistory = async (req, res) => {
  try {
    const days    = parseInt(req.query.days) || 30;
    const history = await performanceService.getScoreHistory(req.user.id, days);
    res.json({ success: true, data: history });
  } catch (error) {
    logger.error('getScoreHistory error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في استرداد السجل' });
  }
};

/** GET /api/v1/performance/weekly-trend?weeks=4 */
const getWeeklyTrend = async (req, res) => {
  try {
    const weeks  = parseInt(req.query.weeks) || 4;
    const trend  = await performanceService.getWeeklyTrend(req.user.id, weeks);
    res.json({ success: true, data: trend });
  } catch (error) {
    logger.error('getWeeklyTrend error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في استرداد الاتجاه' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY AUDIT
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/performance/weekly-audit/latest */
const getLatestWeeklyAudit = async (req, res) => {
  try {
    const audit = await weeklyAuditService.getLatestAudit(req.user.id);
    if (!audit) {
      // Try to generate one on-demand
      const newAudit = await weeklyAuditService.generateWeeklyAudit(
        req.user.id, null, req.user.timezone
      );
      return res.json({ success: true, data: newAudit, generated: true });
    }
    res.json({ success: true, data: audit });
  } catch (error) {
    logger.error('getLatestWeeklyAudit error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في استرداد التدقيق الأسبوعي' });
  }
};

/** GET /api/v1/performance/weekly-audit/history */
const getAuditHistory = async (req, res) => {
  try {
    const limit   = parseInt(req.query.limit) || 8;
    const history = await weeklyAuditService.getAuditHistory(req.user.id, limit);
    res.json({ success: true, data: history });
  } catch (error) {
    logger.error('getAuditHistory error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في استرداد السجل' });
  }
};

/** POST /api/v1/performance/weekly-audit/generate */
const generateWeeklyAudit = async (req, res) => {
  try {
    const { week_start } = req.body;
    const audit = await weeklyAuditService.generateWeeklyAudit(
      req.user.id, week_start, req.user.timezone
    );
    res.json({ success: true, data: audit });
  } catch (error) {
    logger.error('generateWeeklyAudit error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في توليد التدقيق' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PROCRASTINATION FLAGS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/performance/flags */
const getBehavioralFlags = async (req, res) => {
  try {
    const flags = await procrastinationService.getActiveFlags(req.user.id);
    res.json({ success: true, data: flags, count: flags.length });
  } catch (error) {
    logger.error('getBehavioralFlags error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في استرداد التنبيهات' });
  }
};

/** POST /api/v1/performance/flags/scan */
const scanForFlags = async (req, res) => {
  try {
    const flags = await procrastinationService.detectProcrastination(
      req.user.id, req.user.timezone
    );
    res.json({ success: true, data: flags, count: flags.length });
  } catch (error) {
    logger.error('scanForFlags error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في المسح' });
  }
};

/** PATCH /api/v1/performance/flags/:id/resolve */
const resolveFlag = async (req, res) => {
  try {
    const flag = await procrastinationService.resolveFlag(req.params.id, req.user.id);
    res.json({ success: true, data: flag });
  } catch (error) {
    logger.error('resolveFlag error:', error.message);
    res.status(404).json({ success: false, message: 'التنبيه غير موجود' });
  }
};

/** PATCH /api/v1/performance/flags/:id/dismiss */
const dismissFlag = async (req, res) => {
  try {
    const flag = await procrastinationService.dismissFlag(req.params.id, req.user.id);
    res.json({ success: true, data: flag });
  } catch (error) {
    logger.error('dismissFlag error:', error.message);
    res.status(404).json({ success: false, message: 'التنبيه غير موجود' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// ENERGY MAPPING
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/performance/energy */
const getEnergyProfile = async (req, res) => {
  try {
    const insights = await energyService.getEnergyInsights(req.user.id);
    res.json({ success: true, data: insights });
  } catch (error) {
    logger.error('getEnergyProfile error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في استرداد خريطة الطاقة' });
  }
};

/** POST /api/v1/performance/energy/rebuild */
const rebuildEnergyProfile = async (req, res) => {
  try {
    const { days_back = 90 } = req.body;
    const profile = await energyService.buildEnergyProfile(
      req.user.id, req.user.timezone, days_back
    );
    res.json({ success: true, data: profile });
  } catch (error) {
    logger.error('rebuildEnergyProfile error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في بناء الملف الطاقي' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// SMART COACHING
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/performance/coaching/daily */
const getDailyCoaching = async (req, res) => {
  try {
    const coaching = await coachingService.getDailyCoaching(
      req.user.id, req.user.timezone
    );
    res.json({ success: true, data: coaching });
  } catch (error) {
    logger.error('getDailyCoaching error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في التوليد' });
  }
};

/** POST /api/v1/performance/coaching/nudge */
const getBehaviorNudge = async (req, res) => {
  try {
    const { event_type, event_data } = req.body;
    const nudge = await coachingService.getBehaviorNudge(req.user.id, event_type, event_data);
    if (!nudge) return res.status(404).json({ success: false, message: 'نوع الحدث غير معروف' });
    res.json({ success: true, data: nudge });
  } catch (error) {
    logger.error('getBehaviorNudge error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في التوليد' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// FULL DASHBOARD (aggregate)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/performance/dashboard */
const getPerformanceDashboard = async (req, res) => {
  const userId   = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  // Resilient: each sub-call is independent; failures return null rather than crashing
  const safe = (fn) => fn().catch(err => { logger.warn('Dashboard sub-call failed:', err.message); return null; });

  const [todayScore, history7d, flags, energyInsights, latestAudit, coaching] = await Promise.all([
    safe(() => performanceService.computeDailyScore(userId, null, timezone)),
    safe(() => performanceService.getScoreHistory(userId, 7)),
    safe(() => procrastinationService.getActiveFlags(userId, 10)),
    safe(() => energyService.getEnergyInsights(userId)),
    safe(() => weeklyAuditService.getLatestAudit(userId)),
    safe(() => coachingService.getDailyCoaching(userId, timezone)),
  ]);

  res.json({
    success: true,
    data: {
      today_score:    todayScore,
      history_7d:     history7d    || [],
      active_flags:   flags        || [],
      energy_profile: energyInsights || null,
      weekly_audit:   latestAudit  || null,
      coaching:       coaching     || null,
    },
  });
};


const computeTodayScore = async (req, res) => {
  try {
    const perfService = require('../services/performance.service');
    const score = await perfService.computeDailyScore(req.user.id);
    res.json({ success: true, message: 'تم حساب الدرجة بنجاح', data: score });
  } catch (error) {
    logger.error('computeTodayScore error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في حساب الدرجة' });
  }
};

module.exports = {
  getTodayScore,
  getScoreHistory,
  getWeeklyTrend,
  getLatestWeeklyAudit,
  getAuditHistory,
  generateWeeklyAudit,
  getBehavioralFlags,
  scanForFlags,
  resolveFlag,
  dismissFlag,
  getEnergyProfile,
  rebuildEnergyProfile,
  getDailyCoaching,
  getBehaviorNudge,
  getPerformanceDashboard,
  computeTodayScore,
};
