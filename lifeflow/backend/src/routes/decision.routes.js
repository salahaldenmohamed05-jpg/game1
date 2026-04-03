/**
 * Decision Routes v2.0 — LifeFlow Behavior-Aware Core Brain API
 * ================================================================
 * Phase L — Behavior-Aware Intelligence
 *
 * GET  /api/v1/decision/next       — What should I do now? (behavior-aware)
 * GET  /api/v1/decision/signals    — Raw ML intelligence signals (v2: 9 signals)
 * GET  /api/v1/decision/debug      — Full debug view of decision scoring
 * POST /api/v1/decision/feedback   — Record user feedback on decision
 */

const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth.middleware');
const logger  = require('../utils/logger');

router.use(protect);

// ─── Lazy loaders ───────────────────────────────────────────────────────────
function getDecisionService() {
  try { return require('../services/unified.decision.service'); } catch (e) { logger.warn('[DECISION_ROUTES] Service not available:', String(e.message).slice(0, 100)); return null; }
}
function getIntelligence() {
  try { return require('../services/intelligence.service'); } catch (e) { logger.warn('[DECISION_ROUTES] Intelligence not available:', String(e.message).slice(0, 100)); return null; }
}
function getLLMOrchestrator() {
  try { return require('../services/llm.orchestrator.service'); } catch (e) { return null; }
}
function getLearning() {
  try { return require('../services/learning.engine.service'); } catch (e) { return null; }
}
function getUserModelService() {
  try { return require('../services/user.model.service'); } catch (e) { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /decision/next
// v2: Behavior-aware, proactive, with next_steps and coaching
// ─────────────────────────────────────────────────────────────────────────────
router.get('/next', async (req, res) => {
  const userId   = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';
  const energy   = req.query.energy ? parseInt(req.query.energy) : undefined;
  const mood     = req.query.mood ? parseFloat(req.query.mood) : undefined;
  const explain  = req.query.explain === 'true';

  try {
    const svc = getDecisionService();
    if (!svc) {
      return res.status(503).json({ success: false, message: 'Decision service not available' });
    }

    const decision = await svc.getUnifiedDecision(userId, {
      timezone, energy, mood,
      include_explanation: explain,
    });

    // Generate coaching message
    let coaching = null;
    const llm = getLLMOrchestrator();
    if (llm) {
      try {
        coaching = await llm.generateCoaching(decision.signalsUsed);
      } catch (_e) { /* non-critical */ }
    }

    // Format signals for user display
    let signalsSummary = [];
    if (llm) {
      signalsSummary = llm.formatSignalsForUser(decision.signalsUsed);
    }

    logger.info(`[DECISION] /next: user=${userId} focus=${decision.currentFocus?.action} behavior=${decision.behaviorState?.state} confidence=${decision.confidence}%`);

    res.json({
      success: true,
      data: {
        currentFocus: decision.currentFocus,
        why: decision.why,
        signalsUsed: decision.signalsUsed,
        signalsSummary,
        alternatives: decision.alternatives,
        confidence: decision.confidence,
        coaching,
        explanation: decision.explanation,
        rules_applied: decision.rules_applied,
        // v2: behavioral context
        behaviorState: decision.behaviorState,
        generated_at: decision.generated_at,
      },
    });
  } catch (e) {
    logger.error('[DECISION] /next error:', String(e.message).slice(0, 200));
    res.json({
      success: true,
      data: {
        currentFocus: {
          type: 'task',
          action: 'review_plan',
          title: '📋 راجع خطتك',
          message: 'تحقق من مهامك وابدأ بالأهم',
          next_steps: ['افتح قائمة المهام', 'اختر أول مهمة وابدأ'],
        },
        why: ['⚠️ خطأ مؤقت في محرك القرارات'],
        signalsUsed: {},
        alternatives: [],
        confidence: 40,
        generated_at: new Date().toISOString(),
      },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /decision/signals — v2: includes momentum_state + overwhelm_index
// ─────────────────────────────────────────────────────────────────────────────
router.get('/signals', async (req, res) => {
  const userId   = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';
  const energy   = req.query.energy ? parseInt(req.query.energy) : undefined;
  const mood     = req.query.mood ? parseFloat(req.query.mood) : undefined;

  try {
    const intelligence = getIntelligence();
    if (!intelligence) {
      return res.status(503).json({ success: false, message: 'Intelligence service not available' });
    }

    const signals = await intelligence.getIntelligenceSignals(userId, {
      timezone, energy, mood,
    });

    res.json({
      success: true,
      data: {
        signals: {
          completion_probability: signals.completion_probability,
          procrastination_risk: signals.procrastination_risk,
          energy_level: signals.energy_level,
          focus_score: signals.focus_score,
          burnout_risk: signals.burnout_risk,
          habit_strength: signals.habit_strength,
          optimal_task_type: signals.optimal_task_type,
          // v2 signals
          momentum_state: signals.momentum_state,
          overwhelm_index: signals.overwhelm_index,
        },
        meta: signals._meta,
      },
    });
  } catch (e) {
    logger.error('[DECISION] /signals error:', String(e.message).slice(0, 200));
    res.status(500).json({ success: false, message: String(e.message).slice(0, 200) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /decision/debug — v2: full behavior-aware debug
// ─────────────────────────────────────────────────────────────────────────────
router.get('/debug', async (req, res) => {
  const userId   = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    const svc = getDecisionService();
    if (!svc) {
      return res.status(503).json({ success: false, message: 'Decision service not available' });
    }

    const decision = await svc.getUnifiedDecision(userId, { timezone });

    res.json({
      success: true,
      data: {
        decision: {
          currentFocus: decision.currentFocus,
          confidence: decision.confidence,
          why: decision.why,
          rules_applied: decision.rules_applied,
        },
        behaviorState: decision.behaviorState,
        scoring: decision.debug,
        signals: decision.signalsUsed,
        weights: svc.WEIGHTS,
        generated_at: decision.generated_at,
      },
    });
  } catch (e) {
    logger.error('[DECISION] /debug error:', String(e.message).slice(0, 200));
    res.status(500).json({ success: false, message: String(e.message).slice(0, 200) });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /decision/feedback — Record user feedback
// ─────────────────────────────────────────────────────────────────────────────
router.post('/feedback', async (req, res) => {
  const { action, feedback = 'accepted', task_id, suggested_task_id, time_to_start_ms } = req.body;
  const userId = req.user.id;

  if (!action) {
    return res.status(400).json({ success: false, message: 'action مطلوب' });
  }

  try {
    // Record in Learning Engine
    const learning = getLearning();
    if (learning) {
      learning.recordOutcome(userId, {
        action,
        success: feedback === 'accepted',
        userResponse: feedback,
        suggestionType: 'unified_decision',
      });
    }

    // Record in Adaptive Behavior
    try {
      const adaptive = require('../services/adaptive.behavior.service');
      if (adaptive) adaptive.recordInteraction(userId, action, feedback);
    } catch (_e) { /* non-critical */ }

    // Record in persistent UserModel (Phase P — feedback loop)
    const userModelSvc = getUserModelService();
    if (userModelSvc) {
      userModelSvc.onDecisionFeedback(userId, {
        action,
        response: feedback,
        task_id,
        suggested_task_id,
        time_to_start_ms,
      }).catch(_e => { /* non-critical */ });
    }

    logger.info(`[DECISION] feedback: user=${userId} action=${action} feedback=${feedback}`);

    res.json({
      success: true,
      data: { recorded: true, action, feedback },
    });
  } catch (e) {
    logger.error('[DECISION] /feedback error:', String(e.message).slice(0, 200));
    res.status(500).json({ success: false, message: String(e.message).slice(0, 200) });
  }
});

module.exports = router;
