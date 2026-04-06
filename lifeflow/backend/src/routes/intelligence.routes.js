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
const energyService     = require('../services/energy.service');
const coachingService   = require('../services/coaching.service');
const dayPlannerService = require('../services/dayplanner.service');
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
    // HARDENED: Graceful fallback if service method is unavailable
    if (!lifeScoreService?.getLifeScoreHistory) {
      return res.json({ success: true, data: { history: [], message: 'سجل النقاط غير متاح حالياً' } });
    }
    const history = await lifeScoreService.getLifeScoreHistory(
      req.user.id,
      parseInt(days),
      req.user.timezone || 'Africa/Cairo',
    );
    res.json({ success: true, data: history || { history: [] } });
  } catch (err) {
    logger.error('life-score history error:', err.message);
    // HARDENED: Return empty data instead of 500
    res.json({ success: true, data: { history: [], message: 'لا يوجد سجل بعد' } });
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
    const timeline = await timelineService.getTimeline(
      req.user.id,
      req.user.timezone || 'Africa/Cairo',
      parseInt(days),
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
    const prediction = await predictionService.predictTaskCompletion(req.user.id, req.params.id);
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
    const prediction = await predictionService.predictHabitStreak(req.user.id, req.params.id, req.user.timezone || 'Africa/Cairo');
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
    const forecast = await predictionService.predictMoodTrend(
      req.user.id,
      req.user.timezone || 'Africa/Cairo',
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
    const assessment = await predictionService.predictBurnoutRisk(
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
    const trajectory = await predictionService.getLifeTrajectory(
      req.user.id,
      req.user.timezone || 'Africa/Cairo',
    );
    res.json({ success: true, data: trajectory });
  } catch (err) {
    logger.error('trajectory error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في التنبؤ بالمسار' });
  }
});

// ─── Phase 9: Energy Score ────────────────────────────────────────────────────

/**
 * GET /api/v1/intelligence/energy
 * Daily energy score: sleep, mood, habit rate, task load, stress signals.
 * Returns energy_score (0-100), level, focus_windows, low_energy_periods, tips.
 */
router.get('/energy', requireFeature('energy_mapping'), async (req, res) => {
  try {
    const data = await energyService.computeDailyEnergyScore(
      req.user.id,
      req.user.timezone || 'Africa/Cairo',
    );
    // Auto-persist daily energy log
    try {
      const EnergyLog = require('../models/energy_log.model');
      const today = new Date().toISOString().slice(0, 10);
      await EnergyLog.upsert({
        user_id:         req.user.id,
        log_date:        today,
        energy_score:    data.energy_score,
        level:           data.level,
        sleep_score:     data.breakdown.sleep_score,
        mood_score:      data.breakdown.mood_score,
        habit_score:     data.breakdown.habit_score,
        task_load_score: data.breakdown.task_load_score,
        stress_score:    data.breakdown.stress_score,
        mood_raw:        data.breakdown.mood_raw,
        habit_rate:      data.breakdown.habit_rate / 100,
        pending_urgent:  data.breakdown.pending_urgent,
        active_flags:    data.breakdown.active_flags,
      });
    } catch (persistErr) {
      logger.warn('energy log persist failed:', persistErr.message);
    }
    res.json({ success: true, data });
  } catch (err) {
    logger.error('energy score error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في حساب نقاط الطاقة' });
  }
});

/**
 * GET /api/v1/intelligence/focus-windows
 * Returns today's high-energy focus windows for deep work.
 */
router.get('/focus-windows', requireFeature('energy_mapping'), async (req, res) => {
  try {
    const windows = await dayPlannerService.getFocusWindowsForUser(
      req.user.id,
      req.user.timezone || 'Africa/Cairo',
    );
    res.json({ success: true, data: { focus_windows: windows } });
  } catch (err) {
    logger.error('focus-windows error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في استرداد نوافذ التركيز' });
  }
});

// ─── Phase 9: AI Life Coach ───────────────────────────────────────────────────

/**
 * GET /api/v1/intelligence/coach
 * Comprehensive AI life-coach insights:
 *   behavior analysis, burnout warning, habit recommendations, action plan.
 */
router.get('/coach', requireFeature('coaching_mode'), async (req, res) => {
  try {
    const insights = await coachingService.getCoachInsights(
      req.user.id,
      req.user.timezone || 'Africa/Cairo',
    );
    // Auto-persist coach session snapshot
    try {
      const CoachSession = require('../models/coach_session.model');
      const today = new Date().toISOString().slice(0, 10);
      await CoachSession.create({
        user_id:              req.user.id,
        session_date:         today,
        avg_score_14d:        insights.summary.avg_score_14d,
        score_trend:          insights.summary.score_trend,
        avg_mood_14d:         insights.summary.avg_mood_14d,
        task_completion_rate: insights.summary.task_completion_rate,
        burnout_risk:         insights.burnout_warning.risk_level,
        burnout_score:        insights.burnout_warning.risk_score,
        recommendations:      insights.recommendations,
        highlights:           insights.highlights,
        action_plan:          insights.action_plan,
        life_balance:         insights.life_balance,
      });
    } catch (persistErr) {
      logger.warn('coach session persist failed:', persistErr.message);
    }
    res.json({ success: true, data: insights });
  } catch (err) {
    logger.error('coach insights error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في تحليل المدرب الذكي' });
  }
});

// ─── Phase 9: Day Planner ─────────────────────────────────────────────────────

/**
 * POST /api/v1/intelligence/plan-day
 * Build an optimised daily schedule.
 * Body (optional): { date: 'YYYY-MM-DD' }
 * Returns: schedule[], focus_windows[], break_suggestions[], warnings[], stats
 */
router.post('/plan-day', requireFeature('energy_mapping'), async (req, res) => {
  try {
    const { date } = req.body || {};
    const plan = await dayPlannerService.buildDayPlan(
      req.user.id,
      req.user.timezone || 'Africa/Cairo',
      date || null,
    );
    res.json({ success: true, data: plan });
  } catch (err) {
    logger.error('plan-day error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في بناء خطة اليوم' });
  }
});

module.exports = router;
