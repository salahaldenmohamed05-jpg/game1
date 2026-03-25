/**
 * Adaptive Intelligence Routes — Phase 10-14
 * =============================================
 * Behavior Model, Pattern Learning, Life Simulation,
 * Adaptive Recommendations, Copilot, Goals, Optimization,
 * Global Insights, Benchmarks, Life OS Integrations.
 */

'use strict';

const router = require('express').Router();
const { protect }        = require('../middleware/auth.middleware');
const { requireFeature } = require('../middleware/subscription.middleware');
const logger             = require('../utils/logger');

// Services
const behaviorModelService       = require('../services/behavior.model.service');
const patternLearningService     = require('../services/pattern.learning.service');
const lifeSimulationService      = require('../services/life.simulation.service');
const adaptiveRecService         = require('../services/adaptive.recommendation.service');
const aiCoachService             = require('../services/ai.coach.service');
const goalEngineService          = require('../services/goal.engine.service');
const globalPatternsService      = require('../services/global.patterns.service');
const lifeContextService         = require('../services/life.context.detector.service');
// Phase 11
const conversationEngine         = require('../services/conversation.engine.service');
const dailyPlanGenerator         = require('../services/daily.plan.generator.service');
// Phase 12
const lifeOptimizer              = require('../services/life.optimizer.service');
const scheduleAdjustment         = require('../services/schedule.adjustment.service');
// Phase 13
const benchmarkService           = require('../services/benchmark.service');
// Phase 14
const integrationManager         = require('../services/integration.manager.service');

router.use(protect);

const tz  = (req) => req.user?.timezone || 'Africa/Cairo';
const uid = (req) => req.user.id;

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 10 — Adaptive Life Model
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/adaptive/behavior-profile
 * Returns the user's behavioral model (productivity, focus windows, stress triggers).
 */
router.get('/behavior-profile', requireFeature('behavioral_flags'), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const profile = await behaviorModelService.buildBehaviorModel(uid(req), tz(req), parseInt(days));
    res.json({ success: true, data: { model: profile, ...profile } });
  } catch (err) {
    logger.error('behavior-profile error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في بناء النموذج السلوكي' });
  }
});

/**
 * GET /api/v1/adaptive/patterns
 * Returns detected behavioral patterns with confidence scores.
 */
router.get('/patterns', requireFeature('behavioral_flags'), async (req, res) => {
  try {
    const { days = 60 } = req.query;
    const patterns = await patternLearningService.detectPatterns(uid(req), tz(req), parseInt(days));
    res.json({ success: true, data: patterns });
  } catch (err) {
    logger.error('patterns error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في اكتشاف الأنماط السلوكية' });
  }
});

/**
 * GET /api/v1/adaptive/simulate-life
 * Simulates future life outcomes using behavioral patterns.
 * Query: sleep_change, task_change, exercise_change, workload_change, window (days)
 */
router.get('/simulate-life', requireFeature('advanced_insights'), async (req, res) => {
  try {
    const {
      sleep_change    = 0,
      task_change     = 0,
      exercise_change = 0,
      workload_change = 0,
      window          = 14,
      template,
    } = req.query;

    let scenario;
    if (template) {
      const templates = lifeSimulationService.getScenarioTemplates();
      const tmpl = templates.find(t => t.id === template);
      scenario = tmpl ? tmpl.scenario : {};
    } else {
      scenario = {
        sleep_change:    parseFloat(sleep_change),
        task_change:     parseFloat(task_change),
        exercise_change: parseFloat(exercise_change),
        workload_change: parseFloat(workload_change),
      };
    }

    const result = await lifeSimulationService.simulateLife(uid(req), scenario, tz(req), parseInt(window));
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('simulate-life error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في محاكاة الحياة' });
  }
});

/**
 * GET /api/v1/adaptive/simulate-life/templates
 * Returns pre-built simulation scenario templates.
 */
router.get('/simulate-life/templates', async (req, res) => {
  try {
    res.json({ success: true, data: lifeSimulationService.getScenarioTemplates() });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب القوالب' });
  }
});

/**
 * GET /api/v1/adaptive/predictions
 * Returns the latest life predictions/simulations for this user.
 */
router.get('/predictions', requireFeature('advanced_insights'), async (req, res) => {
  try {
    // Default simulation with no scenario changes
    const result = await lifeSimulationService.simulateLife(uid(req), {}, tz(req), 14);
    // Phase 16: expose top-level ML fields for easier consumption
    const baseline = result.baseline || {};
    res.json({
      success: true,
      data: {
        ...result,
        // Promote key ML fields to top level
        burnout_risk                 : baseline.burnout_risk ?? result.burnout_risk ?? 'low',
        task_completion_probability  : baseline.task_completion ?? result.task_completion_probability ?? 0,
        task_completion              : baseline.task_completion ?? result.task_completion ?? 0,
        productivity_score           : baseline.productivity_score ?? result.productivity_score ?? 0,
        mood_score                   : baseline.mood_score ?? result.mood_score ?? 0,
        energy_score                 : baseline.energy_score ?? result.energy_score ?? 0,
      },
    });
  } catch (err) {
    logger.error('predictions error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في التنبؤات' });
  }
});

/**
 * GET /api/v1/adaptive/adaptive-recommendations
 * Returns ranked intelligent life recommendations based on learned patterns.
 */
router.get('/adaptive-recommendations', async (req, res) => {
  try {
    const recs = await adaptiveRecService.getAdaptiveRecommendations(uid(req), tz(req));
    res.json({ success: true, data: recs });
  } catch (err) {
    logger.error('adaptive-recommendations error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في توليد التوصيات' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 11 — AI Life Copilot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/copilot/suggestions
 * Returns proactive AI suggestions based on current user context.
 */
router.get('/copilot/suggestions', async (req, res) => {
  try {
    const suggestions = await aiCoachService.getCopilotSuggestions(uid(req), tz(req));
    res.json({ success: true, data: suggestions });
  } catch (err) {
    logger.error('copilot suggestions error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في المساعد الذكي' });
  }
});

/**
 * POST /api/v1/copilot/chat
 * Answers a life productivity question from the user.
 * Body: { question: string } OR { message: string }
 */
router.post('/copilot/chat', async (req, res) => {
  try {
    const userMsg = (req.body?.message || req.body?.question || '').trim();
    if (!userMsg || userMsg.length < 2) {
      return res.status(400).json({ success: false, message: 'يرجى إرسال سؤال صالح' });
    }
    // Use conversation engine (real AI) instead of aiCoachService
    const response = await conversationEngine.processMessage(uid(req), userMsg, tz(req));
    res.json({ success: true, data: response });
  } catch (err) {
    logger.error('copilot chat error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في الإجابة على السؤال' });
  }
});

/**
 * GET /api/v1/copilot/daily-plan
 * Alias to intelligence plan-day for copilot access.
 */
router.get('/copilot/daily-plan', async (req, res) => {
  try {
    const dayPlannerService = require('../services/dayplanner.service');
    const plan = await dayPlannerService.buildDayPlan(uid(req), tz(req), null);
    res.json({ success: true, data: plan });
  } catch (err) {
    logger.error('copilot daily-plan error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في بناء خطة اليوم' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 12 — Goals & Life Optimization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/goals
 * Returns all user goals with progress.
 */
router.get('/goals', async (req, res) => {
  try {
    const result = await goalEngineService.getUserGoals(uid(req), tz(req));
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('get goals error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب الأهداف' });
  }
});

/**
 * POST /api/v1/goals
 * Creates a new goal.
 * Body: { title, description?, category?, target_date?, milestones?, tags? }
 */
router.post('/goals', async (req, res) => {
  try {
    const { title } = req.body || {};
    if (!title || typeof title !== 'string' || title.trim().length < 2) {
      return res.status(400).json({ success: false, message: 'يرجى تحديد عنوان الهدف' });
    }
    const goal = await goalEngineService.createGoal(uid(req), { ...req.body, title: title.trim() }, tz(req));
    res.status(201).json({ success: true, data: goal });
  } catch (err) {
    logger.error('create goal error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء الهدف' });
  }
});

/**
 * PATCH /api/v1/goals/:id/progress
 * Updates goal progress (0-100).
 * Body: { progress, note? }
 */
router.patch('/goals/:id/progress', async (req, res) => {
  try {
    const { progress, note } = req.body || {};
    if (progress === undefined || isNaN(progress)) {
      return res.status(400).json({ success: false, message: 'يرجى تحديد نسبة التقدم (0-100)' });
    }
    const goal = await goalEngineService.updateGoalProgress(req.params.id, uid(req), parseInt(progress), note);
    if (!goal) return res.status(404).json({ success: false, message: 'الهدف غير موجود' });
    res.json({ success: true, data: goal });
  } catch (err) {
    logger.error('update goal progress error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في تحديث تقدم الهدف' });
  }
});

/**
 * GET /api/v1/optimization
 * Returns life optimization analysis and action plan.
 */
router.get('/optimization', requireFeature('performance_scores'), async (req, res) => {
  try {
    const result = await goalEngineService.getLifeOptimization(uid(req), tz(req));
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('optimization error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في تحليل التحسين' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 13 — Global Intelligence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/global-insights
 * Returns platform-wide behavioral patterns and productivity research.
 */
router.get('/global-insights', async (req, res) => {
  try {
    const insights = await globalPatternsService.getGlobalInsights();
    res.json({ success: true, data: insights });
  } catch (err) {
    logger.error('global-insights error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب الرؤى العالمية' });
  }
});

/**
 * GET /api/v1/benchmark
 * Compares user metrics against global averages.
 */
router.get('/benchmark', async (req, res) => {
  try {
    const result = await benchmarkService.getUserBenchmarkReport(uid(req), tz(req));
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('benchmark error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في المقارنة المرجعية' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 11 — AI Life Copilot
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: POST /copilot/chat is already defined above (line ~177) — no duplicate needed here

/**
 * GET /api/v1/adaptive/copilot/history
 * Returns the conversation history for the current session.
 */
router.get('/copilot/history', async (req, res) => {
  try {
    const history = conversationEngine.getConversationHistory(uid(req));
    res.json({ success: true, data: history });
  } catch (err) {
    logger.error('copilot history error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب سجل المحادثة' });
  }
});

/**
 * DELETE /api/v1/adaptive/copilot/clear
 * Clears the conversation session.
 */
router.delete('/copilot/clear', async (req, res) => {
  try {
    const result = conversationEngine.clearConversation(uid(req));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في مسح المحادثة' });
  }
});

/**
 * GET /api/v1/adaptive/copilot/suggestions
 * Returns proactive AI suggestions based on current state.
 */
router.get('/copilot/suggestions', async (req, res) => {
  try {
    const suggestions = await aiCoachService.getCopilotSuggestions(uid(req), tz(req));
    res.json({ success: true, data: suggestions });
  } catch (err) {
    logger.error('copilot suggestions error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب الاقتراحات' });
  }
});

/**
 * POST /api/v1/adaptive/generate-plan
 * Generates an AI-driven adaptive daily plan.
 * Body: { date? }
 */
router.post('/generate-plan', async (req, res) => {
  try {
    const { date } = req.body || {};
    const plan = await dailyPlanGenerator.generateAdaptivePlan(uid(req), tz(req), date || null);
    res.json({ success: true, data: plan });
  } catch (err) {
    logger.error('generate plan error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في توليد الخطة اليومية' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 12 — Life Optimization
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/adaptive/optimize
 * Returns a full life optimization report with dimension scores and recommendations.
 */
router.get('/optimize', async (req, res) => {
  try {
    const report = await lifeOptimizer.getLifeOptimizationReport(uid(req), tz(req));
    res.json({ success: true, data: report });
  } catch (err) {
    logger.error('optimize error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في تحسين الحياة' });
  }
});

/**
 * GET /api/v1/adaptive/adjust-schedule
 * Suggests real-time schedule adjustments based on current energy and mood.
 * Query: energy?, mood?
 */
router.get('/adjust-schedule', async (req, res) => {
  try {
    const { energy, mood } = req.query;
    const context = { energy: energy ? parseInt(energy) : undefined, mood: mood ? parseFloat(mood) : undefined };
    const result = await scheduleAdjustment.suggestAdjustments(uid(req), [], context, tz(req));
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('adjust-schedule error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في تعديل الجدول' });
  }
});

/**
 * GET /api/v1/adaptive/reschedule/:taskId
 * Suggests the best time to reschedule a specific task.
 */
router.get('/reschedule/:taskId', async (req, res) => {
  try {
    const result = await scheduleAdjustment.getSmartRescheduleSuggestion(uid(req), req.params.taskId, tz(req));
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('reschedule error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'خطأ في اقتراح إعادة الجدولة' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 13 — Global Intelligence (enhanced)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/adaptive/my-benchmark
 * Returns user's benchmark comparison against global averages.
 */
router.get('/my-benchmark', async (req, res) => {
  try {
    const report = await benchmarkService.getUserBenchmarkReport(uid(req), tz(req));
    res.json({ success: true, data: report });
  } catch (err) {
    logger.error('my-benchmark error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في المقارنة المرجعية' });
  }
});

/**
 * GET /api/v1/adaptive/global-trends
 * Returns global productivity and well-being trends.
 */
router.get('/global-trends', async (req, res) => {
  try {
    const trends = benchmarkService.getGlobalTrends();
    res.json({ success: true, data: trends });
  } catch (err) {
    logger.error('global-trends error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب الاتجاهات العالمية' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 14 — Life OS Integration (enhanced)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/adaptive/integrations
 * GET /api/v1/adaptive/integrations/catalog
 * Returns the full integration catalog.
 */
router.get('/integrations', async (req, res) => {
  try {
    const catalog = integrationManager.getAvailableIntegrations();
    res.json({ success: true, data: catalog });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب قائمة التكاملات' });
  }
});

router.get('/integrations/catalog', async (req, res) => {
  try {
    const catalog = integrationManager.getAvailableIntegrations();
    res.json({ success: true, data: catalog });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب قائمة التكاملات' });
  }
});

/**
 * POST /api/v1/adaptive/integrations/connect
 * Connects an external integration.
 */
router.post('/integrations/connect', async (req, res) => {
  try {
    const { integration_type, access_token, display_name } = req.body || {};
    if (!integration_type) return res.status(400).json({ success: false, message: 'يرجى تحديد نوع التكامل' });
    const result = await integrationManager.connectIntegration(uid(req), integration_type, access_token, display_name);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('connect integration error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'خطأ في ربط التكامل' });
  }
});

/**
 * DELETE /api/v1/adaptive/integrations/disconnect/:type
 * Disconnects an integration.
 */
router.delete('/integrations/disconnect/:type', async (req, res) => {
  try {
    const result = await integrationManager.disconnectIntegration(uid(req), req.params.type);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'خطأ في إلغاء ربط التكامل' });
  }
});

/**
 * GET /api/v1/adaptive/integrations/status
 * Returns status of all integrations.
 */
router.get('/integrations/status', async (req, res) => {
  try {
    const status = await integrationManager.getConnectionStatus(uid(req));
    res.json({ success: true, data: status });
  } catch (err) {
    logger.error('integration status error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب حالة التكاملات' });
  }
});

/**
 * POST /api/v1/adaptive/integrations/sync
 * Syncs external data.
 */
router.post('/integrations/sync', async (req, res) => {
  try {
    const { integration_type, events = [] } = req.body || {};
    if (!integration_type) return res.status(400).json({ success: false, message: 'يرجى تحديد نوع التكامل' });
    const result = await integrationManager.syncIntegrationData(uid(req), integration_type, events);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('sync integration error:', err.message);
    res.status(500).json({ success: false, message: err.message || 'خطأ في مزامنة البيانات' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// CONVENIENCE ALIASES — Clean URL shortcuts for Phase 11-14 endpoints
// ─────────────────────────────────────────────────────────────────────────────

/** GET /adaptive/recommendations  → alias for /adaptive-recommendations */
router.get('/recommendations', async (req, res) => {
  try {
    const recs = await adaptiveRecService.getAdaptiveRecommendations(uid(req), tz(req));
    res.json({ success: true, data: recs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'خطأ في التوصيات' });
  }
});

/** GET /adaptive/ai-coach  → alias for /copilot/suggestions */
router.get('/ai-coach', async (req, res) => {
  try {
    const data = await aiCoachService.getCopilotSuggestions(uid(req), tz(req));
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'خطأ في المساعد الذكي' });
  }
});

/** POST /adaptive/conversation  → alias for /copilot/chat */
router.post('/conversation', async (req, res) => {
  try {
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ success: false, message: 'يرجى إدخال رسالة' });
    const result = await conversationEngine.processMessage(uid(req), message, tz(req));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'خطأ في المحادثة' });
  }
});

/** GET /adaptive/daily-plan  → alias for /copilot/daily-plan */
router.get('/daily-plan', async (req, res) => {
  try {
    const plan = await dailyPlanGenerator.generateAdaptivePlan(uid(req), tz(req));
    res.json({ success: true, data: plan });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'خطأ في توليد الخطة اليومية' });
  }
});

/** GET /adaptive/life-optimizer  → alias for /optimization */
router.get('/life-optimizer', async (req, res) => {
  try {
    const report = await lifeOptimizer.getLifeOptimizationReport(uid(req), tz(req));
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'خطأ في التحسين' });
  }
});

/** GET /adaptive/schedule-adjustment  → alias for /adjust-schedule */
router.get('/schedule-adjustment', async (req, res) => {
  try {
    const result = await scheduleAdjustment.suggestAdjustments(uid(req), tz(req));
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'خطأ في ضبط الجدول' });
  }
});

/** GET /adaptive/integrations/available  → alias for /integrations/catalog */
router.get('/integrations/available', async (req, res) => {
  try {
    const catalog = integrationManager.getAvailableIntegrations();
    res.json({ success: true, data: catalog });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ في جلب قائمة التكاملات' });
  }
});

/** GET /adaptive/context/today  → life context detection */
router.get('/context/today', async (req, res) => {
  try {
    const context = await lifeContextService.detectTodayContext(uid(req), tz(req));
    res.json({ success: true, data: context });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || 'خطأ في تحليل سياق اليوم' });
  }
});

module.exports = router;
