/**
 * UserModel Routes — Phase P: Persistent Evolving User Brain
 * =============================================================
 * GET  /api/v1/user-model              → Full user model snapshot
 * GET  /api/v1/user-model/modifiers    → Decision modifiers (what DE uses)
 * GET  /api/v1/user-model/compact      → Compact output format
 * POST /api/v1/user-model/refresh      → Force full refresh from all sources
 * POST /api/v1/user-model/event        → Manual event injection (for testing)
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth.middleware');
const logger  = require('../utils/logger');

router.use(protect);

function getUserModelService() {
  try { return require('../services/user.model.service'); } catch (e) { return null; }
}

// ─── GET /user-model — Full snapshot ────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const svc = getUserModelService();
    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const snapshot = await svc.getUserModelSnapshot(req.user.id);
    res.json({ success: true, data: snapshot });
  } catch (e) {
    logger.error('[USER_MODEL_ROUTE] / error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── GET /user-model/modifiers — Decision Engine modifiers ──────────────────
router.get('/modifiers', async (req, res) => {
  try {
    const svc = getUserModelService();
    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const modifiers = await svc.getDecisionModifiers(req.user.id);
    res.json({ success: true, data: modifiers });
  } catch (e) {
    logger.error('[USER_MODEL_ROUTE] /modifiers error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── GET /user-model/compact — Required output format ───────────────────────
router.get('/compact', async (req, res) => {
  try {
    const svc = getUserModelService();
    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const model = await svc.getOrCreateModel(req.user.id);
    const output = svc.formatForOutput(model, 'system');
    res.json({ success: true, data: output });
  } catch (e) {
    logger.error('[USER_MODEL_ROUTE] /compact error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── POST /user-model/refresh — Force full recalculation ────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const svc = getUserModelService();
    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const timezone = req.user.timezone || 'Africa/Cairo';
    const result = await svc.refreshFromSources(req.user.id, timezone);
    const snapshot = await svc.getUserModelSnapshot(req.user.id);

    res.json({ success: true, data: { ...result, snapshot } });
  } catch (e) {
    logger.error('[USER_MODEL_ROUTE] /refresh error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── POST /user-model/event — Manual event injection ────────────────────────
router.post('/event', async (req, res) => {
  try {
    const svc = getUserModelService();
    if (!svc) return res.status(503).json({ success: false, message: 'UserModel service not available' });

    const { event_type, payload = {} } = req.body;
    if (!event_type) {
      return res.status(400).json({ success: false, message: 'event_type مطلوب (task_completed, task_missed, decision_feedback, habit_completed, habit_missed)' });
    }

    let result;
    switch (event_type) {
      case 'task_completed':
        result = await svc.onTaskCompleted(req.user.id, payload);
        break;
      case 'task_missed':
        result = await svc.onTaskMissed(req.user.id, payload);
        break;
      case 'decision_feedback':
        result = await svc.onDecisionFeedback(req.user.id, payload);
        break;
      case 'habit_completed':
        result = await svc.onHabitCompleted(req.user.id, payload);
        break;
      case 'habit_missed':
        result = await svc.onHabitMissed(req.user.id, payload);
        break;
      default:
        return res.status(400).json({ success: false, message: `Unknown event_type: ${event_type}` });
    }

    res.json({ success: true, data: result });
  } catch (e) {
    logger.error('[USER_MODEL_ROUTE] /event error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
