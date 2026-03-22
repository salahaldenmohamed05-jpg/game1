/**
 * Centralized AI API Routes — /api/v1/ai/v2/*
 * ============================================
 * New AI layer backed by Gemini / Groq.
 * Does NOT modify existing /api/v1/ai/* endpoints.
 *
 * Routes:
 *   GET  /api/v1/ai/v2/status   → provider health check
 *   POST /api/v1/ai/v2/coach    → coaching insight
 *   POST /api/v1/ai/v2/insight  → behavior insight
 *   POST /api/v1/ai/v2/planner  → daily plan
 */

'use strict';

const express = require('express');
const router  = express.Router();

const { protect }         = require('../middleware/auth.middleware');
const { getStatus }       = require('../services/ai/ai.provider.selector');
const { getCoachResponse }   = require('../services/ai/ai.coach.service');
const { getBehaviorInsights } = require('../services/ai/ai.insight.service');
const { getDailyPlan }       = require('../services/ai/ai.planner.service');
const logger = require('../utils/logger');

// ─── Helper: safe async wrapper ───────────────────────────────────────────────
function wrap(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      logger.error('[AI-ROUTES] Unhandled error:', err.message);
      res.status(500).json({
        success : false,
        message : 'خطأ داخلي في خدمة الذكاء الاصطناعي',
        data    : null,
      });
    }
  };
}

// ─── GET /status ──────────────────────────────────────────────────────────────
router.get('/status', wrap(async (req, res) => {
  const status = getStatus();
  res.json({ success: true, data: status });
}));

// ─── All routes below require auth ────────────────────────────────────────────
router.use(protect);

// ─── POST /coach ──────────────────────────────────────────────────────────────
router.post('/coach', wrap(async (req, res) => {
  const {
    energy_score  = 55,
    life_score    = 50,
    tasks_overdue = 0,
    mood_trend    = 'stable',
  } = req.body;

  logger.info('[AI-ROUTES] /coach called', { userId: req.user?.id });

  const result = await getCoachResponse({
    energy_score,
    life_score,
    tasks_overdue,
    mood_trend,
    user_name: req.user?.name || 'المستخدم',
  });

  res.json({ success: true, data: result });
}));

// ─── POST /insight ────────────────────────────────────────────────────────────
router.post('/insight', wrap(async (req, res) => {
  const {
    habit_streaks   = [],
    timeline_events = [],
    mood_history    = [],
    energy_data     = [],
    period_days     = 7,
  } = req.body;

  logger.info('[AI-ROUTES] /insight called', { userId: req.user?.id });

  const result = await getBehaviorInsights({
    habit_streaks,
    timeline_events,
    mood_history,
    energy_data,
    period_days,
  });

  res.json({ success: true, data: result });
}));

// ─── POST /planner ────────────────────────────────────────────────────────────
router.post('/planner', wrap(async (req, res) => {
  const {
    tasks              = [],
    energy_predictions = {},
    focus_windows      = [],
    habits             = [],
    date,
  } = req.body;

  logger.info('[AI-ROUTES] /planner called', { userId: req.user?.id });

  const result = await getDailyPlan({
    tasks,
    energy_predictions,
    focus_windows,
    habits,
    date,
  });

  res.json({ success: true, data: result });
}));

module.exports = router;
