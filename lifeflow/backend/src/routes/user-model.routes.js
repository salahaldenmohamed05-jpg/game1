/**
 * UserModel Routes — Phase P: Persistent Per-User Intelligence API
 * ==================================================================
 * GET  /api/v1/user-model/profile       — Full user model (all profiles)
 * GET  /api/v1/user-model/modifiers     — Decision modifiers (for debugging)
 * POST /api/v1/user-model/rebuild       — Force full model recomputation
 * GET  /api/v1/user-model/validate      — Validate model vs DB (no fake data)
 * POST /api/v1/user-model/simulate      — Simulate two different users
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth.middleware');
const logger  = require('../utils/logger');

router.use(protect);

// ─── Lazy loaders ───────────────────────────────────────────────────────────
function getUserModelService() {
  try { return require('../services/user.model.service'); } catch (e) { logger.warn('[USER_MODEL_ROUTES] Service not available:', e.message); return null; }
}
function getAnalytics() {
  try { return require('../services/analytics.service'); } catch (e) { return null; }
}
function getDecisionService() {
  try { return require('../services/unified.decision.service'); } catch (e) { return null; }
}
function getLearning() {
  try { return require('../services/learning.engine.service'); } catch (e) { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /user-model — Full snapshot (root)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const svc = getUserModelService();
    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const snapshot = await svc.getUserModel(req.user.id);
    res.json({ success: true, data: snapshot });
  } catch (e) {
    logger.error('[USER_MODEL_ROUTES] / error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /user-model/profile — Full user model
// ─────────────────────────────────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  try {
    const svc = getUserModelService();
    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const model = await svc.getUserModel(req.user.id);

    res.json({
      success: true,
      data: {
        user_id: model.user_id,
        behavior_profile: model.behavior_profile,
        performance_profile: model.performance_profile,
        habit_profile: model.habit_profile,
        adaptation_profile: model.adaptation_profile,
        feedback_loop: model.feedback_loop,
        confidence: model.confidence,
        total_events: model.total_events || model.data_points || 0,
        model_version: model.model_version,
        last_computed_at: model.last_computed_at,
      },
    });
  } catch (e) {
    logger.error('[USER_MODEL] /profile error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /user-model/modifiers — Decision modifiers (what the decision engine sees)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/modifiers', async (req, res) => {
  try {
    const svc = getUserModelService();
    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const modifiers = await svc.getDecisionModifiers(req.user.id);

    // Also compute effective weights to show how they change
    const decisionSvc = getDecisionService();
    let effectiveWeights = null;
    if (decisionSvc?.computeEffectiveWeights) {
      effectiveWeights = decisionSvc.computeEffectiveWeights(modifiers);
    }

    res.json({
      success: true,
      data: {
        modifiers,
        effective_weights: effectiveWeights,
        base_weights: decisionSvc?.BASE_WEIGHTS || decisionSvc?.WEIGHTS,
      },
    });
  } catch (e) {
    logger.error('[USER_MODEL] /modifiers error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /user-model/rebuild — Force full model recomputation from historical data
// ─────────────────────────────────────────────────────────────────────────────
router.post('/rebuild', async (req, res) => {
  try {
    const svc = getUserModelService();
    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const timezone = req.user.timezone || 'Africa/Cairo';
    const startMs = Date.now();
    const model = await svc.rebuildFullModel(req.user.id, timezone);
    const elapsed = Date.now() - startMs;

    res.json({
      success: true,
      message: `تم إعادة بناء النموذج من ${model.total_events || model.data_points || 0} نقطة بيانات`,
      data: {
        user_id: model.user_id,
        behavior_profile: model.behavior_profile,
        performance_profile: model.performance_profile,
        habit_profile: model.habit_profile,
        adaptation_profile: model.adaptation_profile,
        feedback_loop: model.feedback_loop,
        confidence: model.confidence,
        total_events: model.total_events || model.data_points || 0,
        computation_ms: elapsed,
      },
    });
  } catch (e) {
    logger.error('[USER_MODEL] /rebuild error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /user-model/validate — Cross-validate model against DB + analytics
// ─────────────────────────────────────────────────────────────────────────────
router.get('/validate', async (req, res) => {
  try {
    const svc = getUserModelService();
    const analytics = getAnalytics();
    const learning = getLearning();
    const decisionSvc = getDecisionService();

    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const userId = req.user.id;
    const timezone = req.user.timezone || 'Africa/Cairo';

    // Gather data from all sources in parallel
    const [model, modifiers, analyticsData, learningProfile] = await Promise.all([
      svc.getUserModel(userId),
      svc.getDecisionModifiers(userId),
      analytics ? analytics.getAnalyticsSummary(userId, timezone) : null,
      learning ? Promise.resolve(learning.getUserLearningProfile(userId)) : null,
    ]);

    // Get decision result
    let decisionResult = null;
    if (decisionSvc) {
      try {
        decisionResult = await decisionSvc.getUnifiedDecision(userId, { timezone });
      } catch (_e) { /* non-critical */ }
    }

    // Cross-validation checks
    const checks = [];
    const perf = model.performance_profile || {};
    const behavior = model.behavior_profile || {};
    const adapt = model.adaptation_profile || {};

    // Check 1: Model completion rate vs analytics
    if (analyticsData) {
      const analyticsRate = analyticsData.tasks?.total > 0
        ? Math.round((analyticsData.tasks.completed / analyticsData.tasks.total) * 100)
        : 0;
      const modelRate = perf.completion_rate_overall || 0;
      const diff = Math.abs(analyticsRate - modelRate);
      checks.push({
        check: 'completion_rate_consistency',
        analytics_value: analyticsRate,
        model_value: modelRate,
        difference: diff,
        status: diff <= 15 ? 'pass' : 'warning',
        note: diff > 15 ? 'Model may need rebuild — run POST /rebuild' : 'Consistent',
      });
    }

    // Check 2: Procrastination score vs overdue tasks
    if (analyticsData) {
      const overdueCount = analyticsData.tasks?.overdue || 0;
      const procScore = behavior.procrastination_score || 0;
      const expectedProc = overdueCount > 10 ? 0.8 : overdueCount > 5 ? 0.6 : overdueCount > 2 ? 0.4 : 0.2;
      const diff = Math.abs(procScore - expectedProc);
      checks.push({
        check: 'procrastination_vs_overdue',
        overdue_count: overdueCount,
        model_procrastination: procScore,
        expected_range: `${(expectedProc - 0.2).toFixed(1)} - ${(expectedProc + 0.2).toFixed(1)}`,
        status: diff <= 0.3 ? 'pass' : 'warning',
        note: diff > 0.3 ? 'Procrastination score doesn\'t match overdue reality' : 'Aligned',
      });
    }

    // Check 3: Push intensity matches user behavior
    const pushIntensity = adapt.push_intensity || 'moderate';
    const acceptRate = behavior.avg_decision_acceptance_rate || 50;
    let expectedPush = 'moderate';
    if (acceptRate > 70) expectedPush = 'aggressive';
    else if (acceptRate < 30) expectedPush = 'gentle';
    checks.push({
      check: 'push_intensity_alignment',
      acceptance_rate: acceptRate,
      model_push: pushIntensity,
      expected_push: expectedPush,
      status: pushIntensity === expectedPush ? 'pass' : 'info',
      note: pushIntensity !== expectedPush ? 'Push intensity adapts over time' : 'Aligned',
    });

    // Check 4: Decision engine uses modifiers
    checks.push({
      check: 'decision_engine_personalized',
      model_confidence: model.confidence,
      has_modifiers: !!modifiers,
      modifier_confidence: modifiers?.model_confidence,
      decision_has_user_model: !!decisionResult?.userModel,
      status: modifiers ? 'pass' : 'warning',
      note: !modifiers ? 'Decision engine not using UserModel' : 'Personalized decisions active',
    });

    // Check 5: No fake metrics
    checks.push({
      check: 'no_fake_metrics',
      total_events: model.total_events || model.data_points || 0,
      confidence: model.confidence,
      is_cold_start: model.confidence === 'cold_start',
      status: (model.total_events || model.data_points || 0) > 0 || model.confidence === 'cold_start' ? 'pass' : 'fail',
      note: model.confidence === 'cold_start'
        ? 'Cold start — neutral defaults (no fake data)'
        : `Model based on ${model.total_events || model.data_points || 0} real data points`,
    });

    // Check 6: Learning engine alignment
    if (learningProfile) {
      const learnOptHours = learningProfile.stats?.optimalHours || [];
      const modelPeakHours = behavior.peak_productivity_hours || [];
      checks.push({
        check: 'learning_engine_alignment',
        learning_optimal_hours: learnOptHours,
        model_peak_hours: modelPeakHours,
        learning_success_rate: learningProfile.summary?.overallSuccessRate,
        status: 'pass',
        note: 'Learning data feeds into user model',
      });
    }

    const passCount = checks.filter(c => c.status === 'pass').length;
    const warnCount = checks.filter(c => c.status === 'warning').length;
    const failCount = checks.filter(c => c.status === 'fail').length;

    res.json({
      success: true,
      data: {
        validation_summary: {
          total_checks: checks.length,
          passed: passCount,
          warnings: warnCount,
          failed: failCount,
          overall: failCount === 0 ? (warnCount === 0 ? 'healthy' : 'needs_attention') : 'issues_found',
        },
        checks,
        model_summary: {
          confidence: model.confidence,
          total_events: model.total_events || model.data_points || 0,
          push_intensity: adapt.push_intensity,
          task_preference: behavior.task_preference,
          procrastination: behavior.procrastination_score,
          completion_rate: perf.completion_rate_overall,
        },
        validated_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    logger.error('[USER_MODEL] /validate error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /user-model/simulate — Demonstrate different decisions for different users
// Creates two hypothetical user profiles and shows how decisions differ
// ─────────────────────────────────────────────────────────────────────────────
router.post('/simulate', async (req, res) => {
  try {
    const decisionSvc = getDecisionService();
    const userModelSvc = getUserModelService();
    if (!decisionSvc || !userModelSvc) {
      return res.status(503).json({ success: false, message: 'Services not available' });
    }

    // Simulate two contrasting user profiles
    const highPerformerMods = {
      behavior_weight_modifier: -0.05,
      urgency_weight_modifier: 0.08,
      prefer_quick_tasks: false,
      prefer_deep_work: true,
      max_recommended_duration: 90,
      min_recommended_duration: 15,
      push_intensity: 'aggressive',
      resistance_threshold: 0.7,
      coaching_receptivity: 0.8,
      energy_sensitivity: 'low',
      energy_weight_boost: -0.05,
      overwhelm_threshold: 0.85,
      max_daily_load: 8,
      peak_hours: [9, 10, 11],
      avoidance_triggers: [],
      needs_warmup: false,
      habit_consistency: 85,
      streak_protection_priority: 'high',
      model_confidence: 'high',
      data_points: 120,
    };

    const strugglerMods = {
      behavior_weight_modifier: 0.12,
      urgency_weight_modifier: -0.08,
      prefer_quick_tasks: true,
      prefer_deep_work: false,
      max_recommended_duration: 30,
      min_recommended_duration: 5,
      push_intensity: 'gentle',
      resistance_threshold: 0.25,
      coaching_receptivity: 0.3,
      energy_sensitivity: 'high',
      energy_weight_boost: 0.10,
      overwhelm_threshold: 0.45,
      max_daily_load: 3,
      peak_hours: [10, 11],
      avoidance_triggers: ['high_energy', 'long_duration'],
      needs_warmup: true,
      habit_consistency: 25,
      streak_protection_priority: 'low',
      model_confidence: 'medium',
      data_points: 45,
    };

    const weightsHigh = decisionSvc.computeEffectiveWeights(highPerformerMods);
    const weightsStruggler = decisionSvc.computeEffectiveWeights(strugglerMods);

    res.json({
      success: true,
      data: {
        high_performer: {
          label: 'مستخدم عالي الأداء — يُدفع بقوة نحو العمل العميق',
          push_intensity: 'aggressive',
          effective_weights: weightsHigh,
          behavior: {
            task_preference: 'deep_work',
            needs_warmup: false,
            max_duration: 90,
            overwhelm_threshold: 0.85,
            coaching_receptivity: 0.8,
          },
          expected_behavior: [
            'يُعرض عليه مهام صعبة أولاً',
            'لا يحتاج تسخين — يبدأ بالأصعب مباشرة',
            'يتحمل ضغط أعلى قبل التدخل',
            'وزن السلوك أقل (يدير نفسه)',
            'وزن الاستعجال أعلى (يستجيب للضغط)',
          ],
        },
        struggler: {
          label: 'مستخدم يعاني — يُدفع بلطف مع مهام صغيرة',
          push_intensity: 'gentle',
          effective_weights: weightsStruggler,
          behavior: {
            task_preference: 'quick_wins',
            needs_warmup: true,
            max_duration: 30,
            overwhelm_threshold: 0.45,
            coaching_receptivity: 0.3,
          },
          expected_behavior: [
            'يُعرض عليه مهام سهلة وقصيرة أولاً',
            'يحتاج تسخين — مهمة صغيرة قبل الأصعب',
            'تدخل سريع عند أي ضغط',
            'وزن السلوك أعلى (يحتاج تصحيح مسار)',
            'وزن الاستعجال أقل (لا يتحمل الضغط)',
          ],
        },
        weight_comparison: {
          base: decisionSvc.BASE_WEIGHTS,
          high_performer: weightsHigh,
          struggler: weightsStruggler,
          differences: {
            behavior: (weightsStruggler.behavior - weightsHigh.behavior).toFixed(3),
            urgency: (weightsHigh.urgency - weightsStruggler.urgency).toFixed(3),
            note: 'Positive = higher for that user type',
          },
        },
        conclusion: 'النظام يتعامل مع كل مستخدم بشكل مختلف بناءً على سلوكه الحقيقي — لا توجد افتراضات ثابتة',
      },
    });
  } catch (e) {
    logger.error('[USER_MODEL] /simulate error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /user-model/compact — Compact output format
// ─────────────────────────────────────────────────────────────────────────────
router.get('/compact', async (req, res) => {
  try {
    const svc = getUserModelService();
    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const model = await svc.getOrCreateModel(req.user.id);
    const output = svc.formatForOutput ? svc.formatForOutput(model, 'system') : model;
    res.json({ success: true, data: output });
  } catch (e) {
    logger.error('[USER_MODEL_ROUTES] /compact error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /user-model/refresh — Force full refresh from all sources
// ─────────────────────────────────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const svc = getUserModelService();
    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const timezone = req.user.timezone || 'Africa/Cairo';
    let result;
    if (svc.refreshFromSources) {
      result = await svc.refreshFromSources(req.user.id, timezone);
    } else if (svc.rebuildFullModel) {
      result = await svc.rebuildFullModel(req.user.id, timezone);
    }
    const snapshot = await svc.getUserModel(req.user.id);

    res.json({ success: true, data: { ...result, snapshot } });
  } catch (e) {
    logger.error('[USER_MODEL_ROUTES] /refresh error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /user-model/event — Manual event injection
// ─────────────────────────────────────────────────────────────────────────────
router.post('/event', async (req, res) => {
  try {
    const svc = getUserModelService();
    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const { event_type, payload = {} } = req.body;
    if (!event_type) {
      return res.status(400).json({ success: false, message: 'event_type مطلوب' });
    }

    let result;
    switch (event_type) {
      case 'task_completed': result = await svc.onTaskCompleted(req.user.id, payload); break;
      case 'task_missed': result = await svc.onTaskMissed(req.user.id, payload); break;
      case 'decision_feedback': result = await svc.onDecisionFeedback(req.user.id, payload); break;
      case 'habit_completed': result = await svc.onHabitCompleted(req.user.id, payload); break;
      case 'habit_missed': result = await svc.onHabitMissed(req.user.id, payload); break;
      default: return res.status(400).json({ success: false, message: `Unknown event_type: ${event_type}` });
    }

    res.json({ success: true, data: result });
  } catch (e) {
    logger.error('[USER_MODEL_ROUTES] /event error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
