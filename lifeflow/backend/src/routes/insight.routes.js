/**
 * Insight Routes
 * Phase 15: Added /metrics, /learning, /plan, /plan/weekly, /explain endpoints
 */
const express = require('express');
const router = express.Router();
const insightController = require('../controllers/insight.controller');
const { protect } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

router.use(protect);

router.get('/', insightController.getInsights);
router.get('/daily', insightController.getDailySummary);
router.get('/weekly', insightController.getWeeklyReport);
router.get('/behavior', insightController.getBehaviorAnalysis);
router.get('/productivity-tips', insightController.getProductivityTips);

// POST /insights/generate — used by frontend aiAPI.generateInsight
// Delegates to daily summary generator (idempotent)
router.post('/generate', insightController.getDailySummary);

// ─── Phase 15: New Endpoints ──────────────────────────────────────────────────

/**
 * GET /api/v1/insights/metrics
 * Returns comprehensive AI + productivity metrics for the authenticated user.
 * Cached 5 minutes.
 */
router.get('/metrics', async (req, res) => {
  try {
    const metricsService = require('../services/metrics.service');
    const timezone = req.user?.timezone || 'Africa/Cairo';
    const metrics = await metricsService.getUserMetrics(req.user.id, timezone);
    res.json({ success: true, metrics });
  } catch (err) {
    logger.error('[ROUTE /insights/metrics]', err.message);
    res.status(500).json({ success: false, error: 'تعذّر تحميل المقاييس' });
  }
});

/**
 * GET /api/v1/insights/learning
 * Returns the user's self-learning profile (success rates, optimal hours, failure patterns).
 */
router.get('/learning', async (req, res) => {
  try {
    const learningEngine = require('../services/learning.engine.service');
    const profile = learningEngine.getUserLearningProfile(req.user.id);
    res.json({ success: true, profile });
  } catch (err) {
    logger.error('[ROUTE /insights/learning]', err.message);
    res.status(500).json({ success: false, error: 'تعذّر تحميل ملف التعلم' });
  }
});

/**
 * GET /api/v1/insights/plan
 * Returns today's adaptive daily plan (energy blocks, focus windows, habit slots).
 */
router.get('/plan', async (req, res) => {
  try {
    const planningEngine = require('../services/planning.engine.service');
    const conversationService = require('../services/conversation.service');

    const timezone = req.user?.timezone || 'Africa/Cairo';
    let ctx = {};
    try {
      ctx = await conversationService.buildUserContext(req.user.id, timezone);
    } catch (_) {}

    const plan = await planningEngine.generateDailyPlan(req.user.id, { ...ctx, timezone });
    res.json({ success: true, plan });
  } catch (err) {
    logger.error('[ROUTE /insights/plan]', err.message);
    res.status(500).json({ success: false, error: 'تعذّر إنشاء الخطة اليومية' });
  }
});

/**
 * GET /api/v1/insights/plan/weekly
 * Returns this week's adaptive plan with workload distribution.
 */
router.get('/plan/weekly', async (req, res) => {
  try {
    const planningEngine = require('../services/planning.engine.service');
    const timezone = req.user?.timezone || 'Africa/Cairo';
    const plan = await planningEngine.generateWeeklyPlan(req.user.id, { timezone });
    res.json({ success: true, plan });
  } catch (err) {
    logger.error('[ROUTE /insights/plan/weekly]', err.message);
    res.status(500).json({ success: false, error: 'تعذّر إنشاء الخطة الأسبوعية' });
  }
});

/**
 * POST /api/v1/insights/explain
 * Returns explainable reasoning for a given action + context.
 * Body: { action, energy, mood, priority, risk, overdueCount }
 */
router.post('/explain', async (req, res) => {
  try {
    const explainability = require('../services/explainability.service');
    const { action = 'complete_task', energy, mood, priority, risk, overdueCount } = req.body;

    const explanation = explainability.explainDecision({
      action,
      userId      : req.user.id,
      energy      : energy ?? 60,
      mood        : mood   ?? 5,
      priority    : priority || 'medium',
      risk        : risk    || 'low',
      overdueCount: overdueCount || 0,
    });

    res.json({ success: true, explanation });
  } catch (err) {
    logger.error('[ROUTE /insights/explain]', err.message);
    res.status(500).json({ success: false, error: 'تعذّر إنشاء التفسير' });
  }
});

module.exports = router;

