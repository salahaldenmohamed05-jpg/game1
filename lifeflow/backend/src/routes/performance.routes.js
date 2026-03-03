/**
 * Performance Routes
 * ==================
 * All AI Performance Engine endpoints (Premium)
 */

const router  = require('express').Router();
const ctrl    = require('../controllers/performance.controller');
const { protect }                = require('../middleware/auth.middleware');
const {
  requirePerformanceScores,
  requireWeeklyAudit,
  requireProcrastination,
  requireEnergyMapping,
  requireCoaching,
  requireBehavioralFlags,
} = require('../middleware/subscription.middleware');

// All routes require authentication
router.use(protect);

// ── Dashboard (all premium in one call) ───────────────────────────────────
router.get('/dashboard',              requirePerformanceScores, ctrl.getPerformanceDashboard);

// ── Productivity Scores ───────────────────────────────────────────────────
router.get('/today',                  requirePerformanceScores, ctrl.getTodayScore);
router.get('/history',                requirePerformanceScores, ctrl.getScoreHistory);
router.get('/weekly-trend',           requirePerformanceScores, ctrl.getWeeklyTrend);
router.post('/compute',               requirePerformanceScores, ctrl.computeTodayScore);

// ── Weekly Life Audit ─────────────────────────────────────────────────────
// Alias routes for frontend compatibility
router.get('/weekly-audit',           requireWeeklyAudit,       ctrl.getLatestWeeklyAudit);
router.get('/weekly-audit/latest',    requireWeeklyAudit,       ctrl.getLatestWeeklyAudit);
router.get('/weekly-audit/history',   requireWeeklyAudit,       ctrl.getAuditHistory);
router.post('/weekly-audit/generate', requireWeeklyAudit,       ctrl.generateWeeklyAudit);

// ── Procrastination Flags ─────────────────────────────────────────────────
// Alias routes for frontend compatibility
router.get('/procrastination-flags',  requireBehavioralFlags,   ctrl.getBehavioralFlags);
router.get('/flags',                  requireBehavioralFlags,   ctrl.getBehavioralFlags);
router.post('/flags/scan',            requireProcrastination,   ctrl.scanForFlags);
router.patch('/procrastination-flags/:id/resolve', requireBehavioralFlags, ctrl.resolveFlag);
router.patch('/flags/:id/resolve',    requireBehavioralFlags,   ctrl.resolveFlag);
router.patch('/flags/:id/dismiss',    requireBehavioralFlags,   ctrl.dismissFlag);

// ── Energy Mapping ────────────────────────────────────────────────────────
// Alias routes for frontend compatibility
router.get('/energy-profile',         requireEnergyMapping,     ctrl.getEnergyProfile);
router.get('/energy',                 requireEnergyMapping,     ctrl.getEnergyProfile);
router.post('/energy/rebuild',        requireEnergyMapping,     ctrl.rebuildEnergyProfile);

// ── Smart Coaching ────────────────────────────────────────────────────────
// Alias routes for frontend compatibility
router.get('/coaching',               requireCoaching,          ctrl.getDailyCoaching);
router.get('/coaching/daily',         requireCoaching,          ctrl.getDailyCoaching);
router.post('/coaching/nudge',        requireCoaching,          ctrl.getBehaviorNudge);

module.exports = router;
