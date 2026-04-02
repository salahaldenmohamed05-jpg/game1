/**
 * Analytics Routes v1.0 — Single Source of Truth (Phase O)
 * ==========================================================
 * All analytics endpoints consume analytics.service.js exclusively.
 * No calculation happens in the route — service computes, route returns.
 *
 * GET /api/v1/analytics/summary      → Dashboard summary card
 * GET /api/v1/analytics/overview     → AnalyticsView Overview tab
 * GET /api/v1/analytics/unified      → Full unified analytics (all tabs + signals + decision)
 * GET /api/v1/analytics/snapshot     → Lightweight snapshot for internal use
 */

'use strict';

const router  = require('express').Router();
const { protect } = require('../middleware/auth.middleware');
const analytics   = require('../services/analytics.service');
const logger      = require('../utils/logger');

router.use(protect);

// ─── Dashboard Summary ─────────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const tz = req.user.timezone || 'Africa/Cairo';
    const summary = await analytics.getAnalyticsSummary(req.user.id, tz);
    res.json({ success: true, data: summary });
  } catch (e) {
    logger.error('[ANALYTICS /summary]', e.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب الملخص' });
  }
});

// ─── Overview Tab ───────────────────────────────────────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const tz = req.user.timezone || 'Africa/Cairo';
    const overview = await analytics.getAnalyticsOverview(req.user.id, tz);
    res.json({ success: true, data: overview });
  } catch (e) {
    logger.error('[ANALYTICS /overview]', e.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب نظرة عامة' });
  }
});

// ─── Unified Analytics ──────────────────────────────────────────────────────
router.get('/unified', async (req, res) => {
  try {
    const tz = req.user.timezone || 'Africa/Cairo';
    const result = await analytics.getUnifiedAnalytics(req.user.id, tz);
    res.json({ success: true, data: result });
  } catch (e) {
    logger.error('[ANALYTICS /unified]', e.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب التحليلات الموحدة' });
  }
});

// ─── Snapshot (internal lightweight) ────────────────────────────────────────
router.get('/snapshot', async (req, res) => {
  try {
    const tz = req.user.timezone || 'Africa/Cairo';
    const snapshot = await analytics.getAnalyticsSnapshot(req.user.id, tz);
    res.json({ success: true, data: snapshot });
  } catch (e) {
    logger.error('[ANALYTICS /snapshot]', e.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

module.exports = router;
