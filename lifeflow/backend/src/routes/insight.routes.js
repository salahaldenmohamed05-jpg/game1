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
// Handles all insight types: daily_summary, weekly_review, behavior, productivity, mood
router.post('/generate', async (req, res) => {
  const { type = 'daily_summary' } = req.body;
  try {
    // Route by type
    if (type === 'weekly_review' || type === 'weekly_report') {
      return insightController.getWeeklyReport(req, res);
    }
    if (type === 'behavior') {
      return insightController.getBehaviorAnalysis(req, res);
    }
    if (type === 'productivity') {
      return insightController.getProductivityTips(req, res);
    }
    if (type === 'mood') {
      // Generate a mood-based insight
      const moment   = require('moment-timezone');
      const { Insight } = require('../models/insight.model');
      const MoodEntry   = require('../models/mood.model');
      const timezone = req.user.timezone || 'Africa/Cairo';
      const today    = moment().tz(timezone).format('YYYY-MM-DD');
      const weekAgo  = moment().tz(timezone).subtract(7, 'days').format('YYYY-MM-DD');

      let existing = await Insight.findOne({
        where: { user_id: req.user.id, type: 'mood_analysis',
          period_start: { [require('sequelize').Op.gte]: weekAgo } },
      });
      if (!existing) {
        const moodEntries = await MoodEntry.findAll({
          where: { user_id: req.user.id,
            entry_date: { [require('sequelize').Op.between]: [weekAgo, today] },
          },
          order: [['entry_date', 'DESC']],
        });
        const avgMood = moodEntries.length
          ? (moodEntries.reduce((s, e) => s + (e.mood_score || 5), 0) / moodEntries.length).toFixed(1)
          : 5;
        existing = await Insight.create({
          id: require('uuid').v4(),
          user_id    : req.user.id,
          type       : 'mood_analysis',
          title      : 'تحليل المزاج الأسبوعي',
          content    : `متوسط مزاجك خلال الأسبوع الماضي: ${avgMood}/10. ${parseFloat(avgMood) >= 7 ? 'أنت في حالة نفسية ممتازة 🌟' : parseFloat(avgMood) >= 5 ? 'مزاجك معتدل، حاول الاهتمام أكثر بالراحة.' : 'انتبه لصحتك النفسية، خذ استراحة.'}`,
          data       : { entries: moodEntries.length, average: avgMood, trend: moodEntries.slice(0, 5).map(e => ({ date: e.entry_date, score: e.mood_score })) },
          recommendations: ['مارس التأمل يومياً', 'احتفل بإنجازاتك الصغيرة', 'حافظ على النوم المنتظم'],
          period_start: weekAgo,
          period_end  : today,
        });
      }
      return res.json({ success: true, data: existing });
    }
    // Default: daily summary
    return insightController.getDailySummary(req, res);
  } catch (e) {
    logger.error('[POST /insights/generate] error:', e.message);
    res.status(500).json({ success: false, message: 'فشل في إنشاء الرؤية' });
  }
});

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
    } catch (_e) { logger.debug(`[INSIGHT_ROUTES] Non-critical operation failed: ${_e.message}`); }

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

