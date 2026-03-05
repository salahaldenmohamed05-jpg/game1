/**
 * Subscription Routes
 * ====================
 */

const router  = require('express').Router();
const ctrl    = require('../controllers/subscription.controller');
const { protect } = require('../middleware/auth.middleware');
const express = require('express');

// ── Public ────────────────────────────────────────────────────────────────
router.get('/plans', ctrl.getPlans);

// ── Stripe webhook — MUST use raw body before protect ────────────────────
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  ctrl.handleWebhook
);

// ── Protected ─────────────────────────────────────────────────────────────
router.use(protect);

router.get('/status',           ctrl.getStatus);
router.post('/trial',           ctrl.startTrial);
router.post('/create',          ctrl.createSubscription);
router.post('/cancel',          ctrl.cancelSubscription);

module.exports = router;
