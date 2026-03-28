/**
 * Dashboard Routes
 * ==================
 * GET /dashboard             — main dashboard data
 * GET /dashboard/stats       — alias
 * GET /dashboard/overview    — alias
 * GET /dashboard/today-flow  — unified endpoint: nextAction + summary + lifeFeed + burnout
 */
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { protect } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

router.use(protect);
router.get('/', dashboardController.getDashboard);

// GET /dashboard/stats — alias used by frontend dashboardAPI.getQuickStats
router.get('/stats', dashboardController.getDashboard);

// GET /dashboard/overview — alias
router.get('/overview', dashboardController.getDashboard);

/**
 * GET /dashboard/today-flow
 * Unified endpoint — replaces 4 separate API calls with ONE.
 * Returns: { dashboard, nextAction, lifeFeed, burnoutStatus }
 * Frontend calls this once, gets everything for DashboardHome.
 */
router.get('/today-flow', async (req, res) => {
  const userId   = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  // Collect results — each sub-call is fail-safe
  const results = {
    nextAction:    null,
    lifeFeed:      null,
    burnoutStatus: null,
  };

  // Helper: safely call a lazy-loaded service
  const safeCall = async (label, fn) => {
    try { return await fn(); }
    catch (e) { logger.debug(`[today-flow] ${label} failed: ${e.message}`); return null; }
  };

  // Run all sub-calls in parallel
  const [nextAction, lifeFeed, burnoutStatus] = await Promise.allSettled([
    // Next Action
    safeCall('next-action', async () => {
      let svc;
      try { svc = require('../services/next.action.service'); } catch { return null; }
      if (!svc?.getNextBestAction) return null;
      const action = await svc.getNextBestAction(userId, { timezone });
      // Enrich with task data if available
      if (action?.task_id) {
        try {
          const Task = require('../models/task.model');
          const t = await Task.findOne({ where: { id: action.task_id, user_id: userId } });
          if (t) action.task_title = t.title;
        } catch {}
      }
      return action;
    }),
    // Life Feed
    safeCall('life-feed', async () => {
      let svc;
      try { svc = require('../services/life.feed.service'); } catch { return null; }
      if (!svc?.getLifeFeed) return null;
      return await svc.getLifeFeed(userId, { timezone });
    }),
    // Burnout Status
    safeCall('burnout', async () => {
      let svc;
      try { svc = require('../services/burnout.service'); } catch { return null; }
      if (!svc?.getBurnoutStatus) return null;
      return await svc.getBurnoutStatus(userId, { timezone });
    }),
  ]);

  results.nextAction    = nextAction.status === 'fulfilled'    ? nextAction.value    : null;
  results.lifeFeed      = lifeFeed.status === 'fulfilled'      ? lifeFeed.value      : null;
  results.burnoutStatus = burnoutStatus.status === 'fulfilled' ? burnoutStatus.value  : null;

  res.json({
    success: true,
    data: {
      nextAction:    results.nextAction,
      lifeFeed:      results.lifeFeed?.feed || results.lifeFeed || [],
      burnoutStatus: results.burnoutStatus,
      generated_at:  new Date().toISOString(),
    },
  });
});

module.exports = router;
