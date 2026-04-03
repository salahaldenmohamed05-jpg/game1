/**
 * Dashboard Routes v2.0 — Behavior-Aware
 * =========================================
 * GET /dashboard             — main dashboard data
 * GET /dashboard/stats       — alias
 * GET /dashboard/overview    — alias
 * GET /dashboard/today-flow  — unified: nextAction + summary + lifeFeed + burnout + behavior
 */
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { protect } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

router.use(protect);
router.get('/', dashboardController.getDashboard);
router.get('/stats', dashboardController.getDashboard);
router.get('/overview', dashboardController.getDashboard);

/**
 * GET /dashboard/today-flow
 * Phase L: Behavior-aware unified endpoint.
 * Returns: { nextAction, lifeFeed, burnoutStatus, decision, behaviorState }
 */
router.get('/today-flow', async (req, res) => {
  const userId   = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  const safeCall = async (label, fn) => {
    try { return await fn(); }
    catch (e) { logger.debug(`[today-flow] ${label} failed: ${String(e.message).slice(0, 150)}`); return null; }
  };

  const [decisionResult, lifeFeedResult, burnoutResult] = await Promise.allSettled([
    // Primary: Core Brain unified decision v2
    safeCall('unified-decision', async () => {
      let svc;
      try { svc = require('../services/unified.decision.service'); } catch { return null; }
      if (!svc?.getUnifiedDecision) return null;
      return await svc.getUnifiedDecision(userId, { timezone });
    }),
    // Life Feed
    safeCall('life-feed', async () => {
      let svc;
      try { svc = require('../services/life.feed.service'); } catch { return null; }
      if (!svc?.getLifeFeed) return null;
      return await svc.getLifeFeed(userId, { timezone });
    }),
    // Burnout from Intelligence signals
    safeCall('burnout', async () => {
      let svc;
      try { svc = require('../services/intelligence.service'); } catch { return null; }
      if (!svc?.getIntelligenceSignals) return null;
      const signals = await svc.getIntelligenceSignals(userId, { timezone });
      const risk = signals.burnout_risk?.value || 0;
      const riskLevel = risk >= 0.65 ? 'high' : risk >= 0.4 ? 'medium' : 'low';
      return {
        burnout_risk: risk,
        risk_level: riskLevel,
        risk_percent: Math.round(risk * 100),
        energy_level: signals.energy_level?.value || 50,
        focus_score: signals.focus_score?.value || 50,
        overwhelm_index: signals.overwhelm_index?.value || 0,
        momentum_state: signals.momentum_state?.value || 'starting',
      };
    }),
  ]);

  const decision    = decisionResult.status === 'fulfilled' ? decisionResult.value : null;
  const lifeFeed    = lifeFeedResult.status === 'fulfilled' ? lifeFeedResult.value : null;
  const burnoutData = burnoutResult.status === 'fulfilled' ? burnoutResult.value : null;

  // Build nextAction from unified decision (backward-compatible shape)
  let nextAction = null;
  let goalContext = null;
  if (decision?.currentFocus) {
    const focus = decision.currentFocus;
    nextAction = {
      action:     focus.action || 'review_plan',
      task_id:    focus.id || null,
      title:      focus.title || 'راجع خطتك',
      task_title: focus.title || null,
      message:    focus.message || decision.why?.join(' — ') || '',
      reason:     decision.why || [],
      explanation: decision.why || [],
      confidence: decision.confidence || 70,
      urgency:    focus.priority === 'urgent' ? 'critical' : focus.priority === 'high' ? 'high' : 'medium',
      energy_match: true,
      ml_driven:  true,
      suggestions: decision.alternatives?.slice(0, 3).map(a => a.title) || [],
      // v2: proactive data
      next_steps: focus.next_steps || [],
      signalsUsed: decision.signalsUsed,
      alternatives: decision.alternatives,
      behaviorState: decision.behaviorState,
      source: 'unified_decision_engine',
    };
    // Extract goal context from the focus
    goalContext = focus.goal_context || null;
  }

  // Fetch goal context separately if not from decision
  if (!goalContext) {
    try {
      const goalEngine = require('../services/goal.engine.service');
      if (goalEngine?.getGoalContext) {
        const gctx = await goalEngine.getGoalContext(userId, timezone);
        if (gctx.activeGoals?.length > 0) {
          goalContext = {
            activeGoals: gctx.activeGoals.slice(0, 3),
            summary: gctx.summary,
            suggestions: (gctx.goalSuggestions || []).slice(0, 2),
          };
        }
      }
    } catch (_) {}
  }

  res.json({
    success: true,
    data: {
      nextAction,
      lifeFeed:      lifeFeed?.feed || lifeFeed || [],
      burnoutStatus: burnoutData,
      goalContext,
      decision: decision ? {
        currentFocus: decision.currentFocus,
        why: decision.why,
        confidence: decision.confidence,
        signalsUsed: decision.signalsUsed,
        alternatives: decision.alternatives,
        rules_applied: decision.rules_applied,
        behaviorState: decision.behaviorState,
      } : null,
      generated_at:  new Date().toISOString(),
    },
  });
});

module.exports = router;
