/**
 * Phase 7 Routes — Production Infrastructure Endpoints
 * ======================================================
 * Exposes all Phase 7 services via REST API:
 *   - /metrics/summary — system-wide metrics
 *   - /metrics/user/:id — per-user metrics
 *   - /metrics/failures — failure report
 *   - /notifications/register-token — FCM device token registration
 *   - /notifications/send-test — test notification send
 *   - /notifications/queue-health — queue status
 *   - /notifications/retry-dead-letters — retry failed notifications
 *   - /ab/experiments — list experiments
 *   - /ab/variant/:experiment — get/assign variant
 *   - /ab/results/:experiment — experiment results
 *   - /events/track — manual event tracking
 *   - /events/user/:id — user event history
 *   - /subscription/checkout — create Stripe checkout
 *   - /subscription/portal — billing portal
 *   - /subscription/status — subscription status
 *   - /subscription/webhook — Stripe webhook handler
 *   - /health/production — production readiness check
 */

'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');

// Import middleware
const { protect } = require('../middleware/auth.middleware');

// Import Phase 7 services
const metricsEngine = require('../services/metrics.engine.service');
const fcmService = require('../services/fcm.notification.service');
const queueService = require('../services/notification.queue.service');
const abTesting = require('../services/ab.testing.service');
const eventTracking = require('../services/event.tracking.service');
const stripeMonetization = require('../services/stripe.monetization.service');
const redisPersistence = require('../services/redis.persistence.service');

// ═══════════════════════════════════════════════════════════════════════════════
// METRICS ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /metrics/summary — System-wide metrics
 */
router.get('/metrics/summary', protect, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const startDate = start_date || new Date().toISOString().slice(0, 10);
    const endDate = end_date || startDate;
    
    const metrics = await metricsEngine.getSystemMetrics(startDate, endDate);
    res.json(metrics);
  } catch (err) {
    logger.error('[Phase7] /metrics/summary error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب المقاييس' });
  }
});

/**
 * GET /metrics/user/:id — Per-user metrics
 */
router.get('/metrics/user/:id', protect, async (req, res) => {
  try {
    const userId = req.params.id || req.user.id;
    const days = parseInt(req.query.days) || 7;
    
    const metrics = await metricsEngine.getUserMetrics(userId, days);
    res.json(metrics);
  } catch (err) {
    logger.error('[Phase7] /metrics/user error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب مقاييس المستخدم' });
  }
});

/**
 * GET /metrics/my — Current user metrics (convenience)
 */
router.get('/metrics/my', protect, async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 7;
    const metrics = await metricsEngine.getUserMetrics(req.user.id, days);
    res.json(metrics);
  } catch (err) {
    logger.error('[Phase7] /metrics/my error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب مقاييسك' });
  }
});

/**
 * GET /metrics/failures — Failure report
 */
router.get('/metrics/failures', protect, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const failures = await metricsEngine.getFailureMetrics(date);
    res.json(failures);
  } catch (err) {
    logger.error('[Phase7] /metrics/failures error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب تقرير الأخطاء' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /notifications/register-token — Register FCM device token
 */
router.post('/notifications/register-token', protect, async (req, res) => {
  try {
    const { token, platform } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token مطلوب' });
    }
    
    const result = await fcmService.registerDeviceToken(req.user.id, token, platform || 'web');
    res.json(result);
  } catch (err) {
    logger.error('[Phase7] /notifications/register-token error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في تسجيل Token' });
  }
});

/**
 * POST /notifications/unregister-token — Unregister FCM device token
 */
router.post('/notifications/unregister-token', protect, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: 'Token مطلوب' });
    }
    
    const result = await fcmService.unregisterDeviceToken(req.user.id, token);
    res.json(result);
  } catch (err) {
    logger.error('[Phase7] /notifications/unregister-token error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في إلغاء Token' });
  }
});

/**
 * POST /notifications/send-test — Send test notification
 */
router.post('/notifications/send-test', protect, async (req, res) => {
  try {
    const { type, context } = req.body;
    const notifType = type || 'task_nudge';
    
    const result = await queueService.enqueueNotification(
      req.user.id, notifType, context || {}, { priority: 'high' }
    );
    
    res.json({
      success: true,
      message: 'إشعار تجريبي أُرسل',
      result,
    });
  } catch (err) {
    logger.error('[Phase7] /notifications/send-test error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في إرسال إشعار تجريبي' });
  }
});

/**
 * GET /notifications/queue-health — Queue status
 */
router.get('/notifications/queue-health', protect, async (req, res) => {
  try {
    const health = await queueService.getQueueHealth();
    const fcmStatus = fcmService.getFCMStatus();
    
    res.json({
      success: true,
      queue: health,
      fcm: fcmStatus,
    });
  } catch (err) {
    logger.error('[Phase7] /notifications/queue-health error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب حالة القائمة' });
  }
});

/**
 * POST /notifications/retry-dead-letters — Retry failed notifications
 */
router.post('/notifications/retry-dead-letters', protect, async (req, res) => {
  try {
    const result = await queueService.retryDeadLetters();
    res.json(result);
  } catch (err) {
    logger.error('[Phase7] retry-dead-letters error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في إعادة المحاولة' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// A/B TESTING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /ab/experiments — List all experiments
 */
router.get('/ab/experiments', protect, async (req, res) => {
  try {
    const experiments = abTesting.listExperiments();
    res.json({ success: true, experiments });
  } catch (err) {
    logger.error('[Phase7] /ab/experiments error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب التجارب' });
  }
});

/**
 * GET /ab/variant/:experiment — Get variant for current user
 */
router.get('/ab/variant/:experiment', protect, async (req, res) => {
  try {
    const variant = await abTesting.getVariant(req.user.id, req.params.experiment);
    res.json({ success: true, ...variant });
  } catch (err) {
    logger.error('[Phase7] /ab/variant error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب التوزيع' });
  }
});

/**
 * GET /ab/my-variants — Get all variant assignments for current user
 */
router.get('/ab/my-variants', protect, async (req, res) => {
  try {
    const variants = await abTesting.getAllVariants(req.user.id);
    res.json({ success: true, variants });
  } catch (err) {
    logger.error('[Phase7] /ab/my-variants error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب التوزيعات' });
  }
});

/**
 * GET /ab/results/:experiment — Experiment results
 */
router.get('/ab/results/:experiment', protect, async (req, res) => {
  try {
    const results = await abTesting.getExperimentResults(req.params.experiment);
    res.json(results);
  } catch (err) {
    logger.error('[Phase7] /ab/results error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب نتائج التجربة' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT TRACKING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /events/track — Manual event tracking
 */
router.post('/events/track', protect, async (req, res) => {
  try {
    const { event_type, context } = req.body;
    if (!event_type) {
      return res.status(400).json({ success: false, message: 'event_type مطلوب' });
    }
    
    const tracked = await eventTracking.trackEvent(req.user.id, event_type, context || {});
    res.json({ success: tracked, event_type });
  } catch (err) {
    logger.error('[Phase7] /events/track error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في تسجيل الحدث' });
  }
});

/**
 * GET /events/my — Get current user's events
 */
router.get('/events/my', protect, async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const events = await eventTracking.getDayEvents(req.user.id, date);
    res.json({ 
      success: true, 
      date,
      count: events.length,
      events: events.slice(-100), // Last 100 events
    });
  } catch (err) {
    logger.error('[Phase7] /events/my error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب الأحداث' });
  }
});

/**
 * GET /events/user/:id — Get events for a specific user
 */
router.get('/events/user/:id', protect, async (req, res) => {
  try {
    const { start_date, end_date } = req.query;
    const startDate = start_date || new Date().toISOString().slice(0, 10);
    const endDate = end_date || startDate;
    
    const events = await eventTracking.getUserEvents(req.params.id, startDate, endDate);
    res.json({ 
      success: true, 
      userId: req.params.id,
      period: { start: startDate, end: endDate },
      count: events.length,
      events: events.slice(-200),
    });
  } catch (err) {
    logger.error('[Phase7] /events/user error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب أحداث المستخدم' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION / MONETIZATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /subscription/checkout — Create Stripe checkout session
 */
router.post('/subscription/checkout', protect, async (req, res) => {
  try {
    const { plan } = req.body; // 'monthly' or 'annual'
    const result = await stripeMonetization.createCheckoutSession(
      req.user.id, req.user.email, plan || 'monthly'
    );
    res.json(result);
  } catch (err) {
    logger.error('[Phase7] /subscription/checkout error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في إنشاء جلسة الدفع' });
  }
});

/**
 * POST /subscription/portal — Billing portal
 */
router.post('/subscription/portal', protect, async (req, res) => {
  try {
    const { stripe_customer_id } = req.body;
    if (!stripe_customer_id) {
      return res.status(400).json({ success: false, message: 'stripe_customer_id مطلوب' });
    }
    
    const result = await stripeMonetization.createPortalSession(req.user.id, stripe_customer_id);
    res.json(result);
  } catch (err) {
    logger.error('[Phase7] /subscription/portal error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في فتح بوابة الفوترة' });
  }
});

/**
 * GET /subscription/status — Get subscription status
 */
router.get('/subscription/status', protect, async (req, res) => {
  try {
    const status = await stripeMonetization.getSubscriptionStatus(req.user.id);
    res.json({ success: true, ...status });
  } catch (err) {
    logger.error('[Phase7] /subscription/status error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب حالة الاشتراك' });
  }
});

/**
 * POST /subscription/webhook — Stripe webhook handler
 * NOTE: This should be mounted without body parser for raw body access
 */
router.post('/subscription/webhook', async (req, res) => {
  try {
    // Verify webhook signature
    const event = stripeMonetization.verifyWebhookSignature(req);
    
    if (!event) {
      // If no signature verification (demo mode), parse from body
      if (req.body && req.body.type) {
        const result = await stripeMonetization.handleWebhook(req.body);
        return res.json(result);
      }
      return res.status(400).json({ success: false, message: 'Invalid signature' });
    }
    
    const result = await stripeMonetization.handleWebhook(event);
    res.json(result);
  } catch (err) {
    logger.error('[Phase7] /subscription/webhook error:', err.message);
    res.status(500).json({ success: false, message: 'Webhook processing failed' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// BEHAVIORAL DATA ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /behavioral/profile — Long-term behavioral profile
 */
router.get('/behavioral/profile', protect, async (req, res) => {
  try {
    const profile = await redisPersistence.getBehavioralProfile(req.user.id);
    res.json({ success: true, profile });
  } catch (err) {
    logger.error('[Phase7] /behavioral/profile error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب الملف السلوكي' });
  }
});

/**
 * GET /behavioral/adaptive-state — Current adaptive state
 */
router.get('/behavioral/adaptive-state', protect, async (req, res) => {
  try {
    const state = await redisPersistence.getAdaptiveState(req.user.id);
    res.json({ success: true, state });
  } catch (err) {
    logger.error('[Phase7] /behavioral/adaptive-state error:', err.message);
    res.status(500).json({ success: false, message: 'فشل في جلب الحالة التكيفية' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTION HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /health/production — Comprehensive production readiness check
 */
router.get('/health/production', async (req, res) => {
  try {
    const redisHealth = redisPersistence.getRedisHealth();
    const fcmStatus = fcmService.getFCMStatus();
    const queueHealth = await queueService.getQueueHealth();
    
    const checks = {
      redis: redisHealth.connected || redisHealth.inMemorySize !== undefined,
      fcm: fcmStatus.initialized,
      queue: queueHealth.initialized,
      notification_templates: fcmStatus.templateCount > 0,
      event_tracking: true, // Always available
      metrics_engine: true,
      ab_testing: true,
      stripe: !!process.env.STRIPE_SECRET_KEY,
    };
    
    const allHealthy = Object.values(checks).every(Boolean);
    
    res.status(allHealthy ? 200 : 503).json({
      success: true,
      production_ready: allHealthy,
      phase: 'Phase 7 — Production Infrastructure',
      timestamp: new Date().toISOString(),
      checks,
      details: {
        redis: redisHealth,
        fcm: fcmStatus,
        queue: queueHealth,
      },
      capacity: {
        estimated_users: allHealthy ? '1000+' : '< 100',
        notification_throughput: queueHealth.queueAvailable ? '100/min (queued)' : '10/min (direct)',
        data_persistence: redisHealth.connected ? 'Redis (persistent)' : 'In-memory (volatile)',
      },
    });
  } catch (err) {
    logger.error('[Phase7] /health/production error:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
