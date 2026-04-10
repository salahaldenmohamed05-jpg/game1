/**
 * Brain Routes — Phase 12.5: Self-Adjusting Cognitive Brain API
 * ==============================================================
 * Endpoints:
 *   GET  /brain/state           — Current brain state for authenticated user
 *   POST /brain/recompute       — Force recompute (for testing/manual trigger)
 *   POST /brain/reject          — User rejected the current decision
 *   POST /brain/activity        — Report user activity (resets inactivity)
 *   GET  /brain/memory          — Get decision memory (debug)
 *   GET  /brain/signals         — Get adaptive signals (debug)
 *   GET  /brain/eventlog        — Get recent event log (debug)
 */

'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

router.use(protect);

// Lazy loaders
function getBrain() {
  try { return require('../services/brain.service'); } catch (e) { return null; }
}
function getEventBus() {
  try { return require('../core/eventBus'); } catch (e) { return null; }
}

// ─── GET /brain/state — Current brain state ─────────────────────────────────
router.get('/state', async (req, res) => {
  const startMs = Date.now();
  logger.info(`[Brain Route] GET /state called. userId=${req.user?.id}`);
  try {
    const brain = getBrain();
    if (!brain) {
      logger.error('[Brain Route] GET /state: brain service not available');
      return res.status(503).json({ success: false, message: 'Brain service not available' });
    }

    const state = await brain.getBrainState(req.user.id);

    // Phase 13+: Inject aiMode into brain state so UI can display it
    let aiMode = 'data_only';
    try {
      const orchestrator = require('../services/aiOrchestrator.service');
      const orchStatus   = orchestrator.getOrchestratorStatus();
      aiMode = orchStatus.aiMode || 'data_only';
      if (state && typeof state === 'object') {
        state.aiMode = aiMode;
        state.aiStatus = {
          mode:     aiMode,
          gemini:   orchStatus.gemini,
          groq:     orchStatus.groq,
          local:    true,
        };
      }
    } catch (_oe) { /* orchestrator optional */ }

    const elapsed = Date.now() - startMs;
    logger.info(`[Brain Route] GET /state completed in ${elapsed}ms aiMode=${aiMode}. Decision: "${state?.currentDecision?.taskTitle || state?.currentDecision?.type || 'null'}"`);
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error(`[Brain Route] /state error (${Date.now() - startMs}ms): ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /brain/recompute — Force recompute ────────────────────────────────
router.post('/recompute', async (req, res) => {
  try {
    const brain = getBrain();
    if (!brain) return res.status(503).json({ success: false, message: 'Brain service not available' });

    const triggerEvent = req.body.triggerEvent || { type: 'MANUAL_RECOMPUTE' };
    const state = await brain.recompute(req.user.id, triggerEvent);
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error('[Brain Route] /recompute error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /brain/reject — User rejected current decision ────────────────────
router.post('/reject', async (req, res) => {
  try {
    const eventBus = getEventBus();
    if (!eventBus) return res.status(503).json({ success: false, message: 'EventBus not available' });

    const { taskId, reason } = req.body;
    eventBus.emit(eventBus.EVENT_TYPES.DECISION_REJECTED, {
      userId: req.user.id,
      taskId,
      reason: reason || 'user_rejected',
    });

    // Wait a tick for recompute to finish (non-blocking)
    await new Promise(resolve => setTimeout(resolve, 50));

    const brain = getBrain();
    const newState = brain ? await brain.getBrainState(req.user.id) : null;

    res.json({
      success: true,
      message: 'Decision rejected — brain recomputed',
      data: newState,
    });
  } catch (err) {
    logger.error('[Brain Route] /reject error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── POST /brain/activity — Report user activity (resets inactivity) ────────
router.post('/activity', async (req, res) => {
  try {
    const brain = getBrain();
    if (!brain) return res.status(503).json({ success: false, message: 'Brain service not available' });

    // Recompute with ENERGY_UPDATED event to reset inactivity timer
    const state = await brain.recompute(req.user.id, { type: 'ENERGY_UPDATED' });
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error('[Brain Route] /activity error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /brain/memory — Decision memory (debug) ────────────────────────────
router.get('/memory', async (req, res) => {
  try {
    const brain = getBrain();
    if (!brain) return res.status(503).json({ success: false, message: 'Brain service not available' });

    const memory = brain.getMemory(req.user.id);
    res.json({ success: true, data: memory });
  } catch (err) {
    logger.error('[Brain Route] /memory error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /brain/signals — Adaptive signals (debug) ──────────────────────────
router.get('/signals', async (req, res) => {
  try {
    const brain = getBrain();
    if (!brain) return res.status(503).json({ success: false, message: 'Brain service not available' });

    const signals = brain.getSignals(req.user.id);
    res.json({ success: true, data: signals });
  } catch (err) {
    logger.error('[Brain Route] /signals error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── GET /brain/eventlog — Recent event log (debug) ─────────────────────────
router.get('/eventlog', async (req, res) => {
  try {
    const eventBus = getEventBus();
    if (!eventBus) return res.status(503).json({ success: false, message: 'EventBus not available' });

    const limit = parseInt(req.query.limit) || 20;
    res.json({ success: true, data: { log: eventBus.getLog(limit), stats: eventBus.getStats() } });
  } catch (err) {
    logger.error('[Brain Route] /eventlog error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
