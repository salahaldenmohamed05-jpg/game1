/**
 * Subscription Routes
 * ====================
 * Supports both Stripe and Paymob payment gateways.
 * Paymob: Card, Fawry, Electronic Wallets (Egypt)
 */

const router  = require('express').Router();
const ctrl    = require('../controllers/subscription.controller');
const { protect } = require('../middleware/auth.middleware');
const express = require('express');

// ── Public ────────────────────────────────────────────────────────────────
router.get('/plans', ctrl.getPlans);

// ── Stripe webhook — raw body before protect ─────────────────────────────
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  ctrl.handleWebhook
);

// ── Paymob webhook — JSON body, public (verified by HMAC) ────────────────
router.post('/paymob/callback', ctrl.handlePaymobCallback);

// ── Protected ─────────────────────────────────────────────────────────────
router.use(protect);

router.get('/status',              ctrl.getStatus);
router.post('/trial',              ctrl.startTrial);
router.post('/create',             ctrl.createSubscription);
router.post('/cancel',             ctrl.cancelSubscription);

// ── Paymob Payment Routes (protected) ────────────────────────────────────
router.get('/paymob/methods',      ctrl.getPaymobMethods);
router.post('/paymob/initiate',    ctrl.initiatePaymobPayment);
router.get('/paymob/verify/:txId', ctrl.verifyPaymobTransaction);

module.exports = router;
