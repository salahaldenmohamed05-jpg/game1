/**
 * Intelligence Routes
 * ====================
 * Endpoints for Life Score, Timeline, and Prediction Engine
 * All routes require authentication + trial/premium plan
 */

const router  = require('express').Router();
const { protect }       = require('../middleware/auth.middleware');
const { requireFeature } = require('../middleware/subscription.middleware');

const lifeScoreService  = require('../services/lifescore.service');
const timelineService   = require('../services/timeline.service');
const predictionService = require('../services/prediction.service');
const logger = require('../utils/logger');

router.use(protect);

// ─── Life Score ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/intelligence/life-score
 * Returns the holistic Life Score with dimension breakdown.
 */
router.get('/life-score', requireFeature('performance_scores'), async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const score = await lifeScoreService.computeLifeScore(
      req.user.id,
      req.user.timezone || 'Africa/Cairo',
      parseInt(days),
    );
    res.json({ success: true, data: score });
  } catch (err) {
    logger.error('life-score error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في حساب نقاط الحياة' });
  }
});

/**
 * GET /api/v1/intelligence/life-score/history
 * Returns life score history (last N days)
 */
router.get('/life-score/history', requireFeature('performance_scores'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const history = await lifeScoreService.getLifeScoreHistory(
      req.user.id,
      parseInt(days),
      req.user.timezone || 'Africa/Cairo',
    );
    res.json({ success: true, data: history });
  } catch (err) {
    logger.error('life-score history error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في استرداد السجل' });
  }
});

// ─── Timeline ────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/intelligence/timeline
 * Returns unified chronological timeline of all user activities.
 * Query params: days (default 30), types (comma-separated: task,habit,mood,insight,audit)
 */
router.get('/timeline', async (req, res) => {
  try {
    const { days = 30, types } = req.query;
    const typeFilter = types ? types.split(',').map(t => t.trim()) : null;
    const timeline = await timelineService.buildTimeline(
      req.user.id,
      req.user.timezone || 'Africa/Cairo',
      parseInt(days),
      typeFilter,
    );
    res.json({ success: true, data: timeline });
  } catch (err) {
    logger.error('timeline error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في بناء الجدول الزمني' });
  }
});

// ─── Predictions ──────────────────────────────────────────────────────────────

/**
 * GET /api/v1/intelligence/predict/task/:id
 * Predict completion probability for a specific task.
 */
router.get('/predict/task/:id', requireFeature('procrastination'), async (req, res) => {
  try {
    const prediction = await predictionService.predictTaskCompletion(req.params.id, req.user.id);
    if (!prediction) return res.status(404).json({ success: false, message: 'المهمة غير موجودة' });
    res.json({ success: true, data: prediction });
  } catch (err) {
    logger.error('predict task error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في التنبؤ' });
  }
});

/**
 * GET /api/v1/intelligence/predict/habit/:id
 * Predict streak sustainability for a specific habit.
 */
router.get('/predict/habit/:id', requireFeature('procrastination'), async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const prediction = await predictionService.predictHabitStreak(req.params.id, req.user.id, parseInt(days));
    if (!prediction) return res.status(404).json({ success: false, message: 'العادة غير موجودة' });
    res.json({ success: true, data: prediction });
  } catch (err) {
    logger.error('predict habit error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في التنبؤ' });
  }
});

/**
 * GET /api/v1/intelligence/predict/mood
 * 7-day mood trend forecast.
 */
router.get('/predict/mood', requireFeature('advanced_insights'), async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const forecast = await predictionService.forecastMoodTrend(
      req.user.id,
      req.user.timezone || 'Africa/Cairo',
      parseInt(days),
    );
    res.json({ success: true, data: forecast });
  } catch (err) {
    logger.error('predict mood error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في تنبؤ المزاج' });
  }
});

/**
 * GET /api/v1/intelligence/burnout-risk
 * Comprehensive burnout risk assessment.
 */
router.get('/burnout-risk', requireFeature('coaching_mode'), async (req, res) => {
  try {
    const assessment = await predictionService.assessBurnoutRisk(
      req.user.id,
      req.user.timezone || 'Africa/Cairo',
    );
    res.json({ success: true, data: assessment });
  } catch (err) {
    logger.error('burnout risk error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في تقييم الإجهاد' });
  }
});

/**
 * GET /api/v1/intelligence/trajectory
 * 2-week life score trajectory projection.
 */
router.get('/trajectory', requireFeature('performance_scores'), async (req, res) => {
  try {
    const trajectory = await predictionService.projectLifeTrajectory(
      req.user.id,
      req.user.timezone || 'Africa/Cairo',
    );
    res.json({ success: true, data: trajectory });
  } catch (err) {
    logger.error('trajectory error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في التنبؤ بالمسار' });
  }
});

module.exports = router;
