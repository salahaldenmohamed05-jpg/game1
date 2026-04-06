/**
 * Stripe Monetization Service V2 — Phase 7: Production Monetization
 * ===================================================================
 * Full Stripe integration with subscription management, webhooks,
 * and feature gating for Pro tier.
 * 
 * Pro Features ($4.99/mo):
 *   - Adaptive Intelligence V2
 *   - Weekly Narrative
 *   - Advanced Notifications (8/day vs 3/day)
 *   - Unlimited habits
 *   - AI-powered planning
 *   - Priority support
 * 
 * Free Tier:
 *   - 3 notifications/day
 *   - 5 habits max
 *   - 20 tasks max
 *   - 7-day analytics
 */

'use strict';

const logger = require('../utils/logger');
const redis = require('./redis.persistence.service');
const { getCache, setCache, deleteCache } = require('../config/redis');
const { trackEvent, EVENT_TYPES } = require('./event.tracking.service');

// ── Stripe Client (lazy-loaded) ─────────────────────────────────────────────
let _stripe = null;

function getStripe() {
  if (!_stripe) {
    try {
      const Stripe = require('stripe');
      const key = process.env.STRIPE_SECRET_KEY;
      if (!key) {
        logger.warn('[Stripe] STRIPE_SECRET_KEY not set — monetization in demo mode');
        return null;
      }
      _stripe = new Stripe(key, { apiVersion: '2024-12-18.acacia' });
    } catch (err) {
      logger.warn(`[Stripe] Init failed: ${err.message}`);
      return null;
    }
  }
  return _stripe;
}

// ── Plan Configuration ───────────────────────────────────────────────────────
const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    limits: {
      notifications_daily: 3,
      habits_max: 5,
      tasks_max: 20,
      analytics_days: 7,
      adaptive_intelligence: false,
      weekly_narrative: false,
      advanced_notifications: false,
      ai_planning: false,
    },
  },
  pro: {
    name: 'Pro',
    price_monthly: 4.99,
    price_annual: 49.99,
    stripe_price_monthly: process.env.STRIPE_PRICE_MONTHLY || 'price_pro_monthly',
    stripe_price_annual: process.env.STRIPE_PRICE_ANNUAL || 'price_pro_annual',
    limits: {
      notifications_daily: 8,
      habits_max: -1, // unlimited
      tasks_max: -1,  // unlimited
      analytics_days: 90,
      adaptive_intelligence: true,
      weekly_narrative: true,
      advanced_notifications: true,
      ai_planning: true,
    },
  },
};

// ── Pro feature list ─────────────────────────────────────────────────────────
const PRO_FEATURES = [
  'adaptive_intelligence',
  'weekly_narrative',
  'advanced_notifications',
  'ai_planning',
  'cross_day_intelligence',
  'behavioral_insights',
  'export_data',
  'priority_support',
];

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Create a checkout session for subscription
 */
async function createCheckoutSession(userId, email, plan = 'monthly') {
  const stripe = getStripe();
  if (!stripe) {
    return { 
      success: false, 
      demo: true, 
      message: 'Stripe not configured — demo mode',
      upgrade_url: null,
    };
  }

  try {
    const priceId = plan === 'annual' 
      ? PLANS.pro.stripe_price_annual 
      : PLANS.pro.stripe_price_monthly;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/subscription/cancel`,
      metadata: { user_id: String(userId), plan },
      subscription_data: {
        metadata: { user_id: String(userId) },
        trial_period_days: 7, // 7-day free trial
      },
    });

    await trackEvent(userId, 'checkout_session_created', { plan, sessionId: session.id });
    
    return { 
      success: true, 
      sessionId: session.id, 
      url: session.url,
    };
  } catch (err) {
    logger.error('[Stripe] Checkout session creation failed:', err.message);
    await redis.logFailure('stripe_checkout', { userId, plan, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Create a billing portal session for managing subscription
 */
async function createPortalSession(userId, stripeCustomerId) {
  const stripe = getStripe();
  if (!stripe) return { success: false, demo: true };

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/settings`,
    });

    return { success: true, url: session.url };
  } catch (err) {
    logger.error('[Stripe] Portal session failed:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get subscription status for a user
 */
async function getSubscriptionStatus(userId) {
  // Check Redis cache first
  const cached = await getCache(`subscription:${userId}`);
  if (cached) return cached;

  // Default to free
  const status = {
    userId,
    plan: 'free',
    status: 'active',
    limits: PLANS.free.limits,
    trial: false,
    trialEnds: null,
    proFeatures: false,
    renewDate: null,
  };

  try {
    const User = require('../models/user.model');
    const user = await User.findByPk(userId, { raw: true });
    
    if (user) {
      const effectivePlan = user.subscription_plan || 'free';
      const isPro = effectivePlan === 'premium' || effectivePlan === 'pro';
      
      status.plan = isPro ? 'pro' : 'free';
      status.limits = isPro ? PLANS.pro.limits : PLANS.free.limits;
      status.proFeatures = isPro;
      status.trial = user.trial_active || false;
      status.trialEnds = user.trial_ends_at || null;
    }
  } catch (err) {
    logger.error('[Stripe] Status check failed:', err.message);
  }

  // Cache for 5 minutes
  await setCache(`subscription:${userId}`, status, 300);
  return status;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOK HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process Stripe webhook events
 */
async function handleWebhook(event) {
  const type = event.type;
  const data = event.data.object;
  
  logger.info(`[Stripe] Webhook: ${type}`);

  try {
    switch (type) {
      case 'checkout.session.completed': {
        const userId = data.metadata?.user_id;
        if (userId) {
          await activateSubscription(userId, data);
          await trackEvent(userId, EVENT_TYPES.SUBSCRIPTION_CREATED, { 
            plan: 'pro', sessionId: data.id 
          });
        }
        break;
      }
      
      case 'customer.subscription.updated': {
        const userId = data.metadata?.user_id;
        if (userId) {
          await syncSubscriptionStatus(userId, data);
        }
        break;
      }
      
      case 'customer.subscription.deleted': {
        const userId = data.metadata?.user_id;
        if (userId) {
          await deactivateSubscription(userId);
          await trackEvent(userId, EVENT_TYPES.SUBSCRIPTION_CANCELLED, { plan: 'free' });
        }
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const userId = data.subscription_details?.metadata?.user_id || 
                       data.metadata?.user_id;
        if (userId) {
          await trackEvent(userId, EVENT_TYPES.SUBSCRIPTION_RENEWED, {});
          logger.info(`[Stripe] Payment succeeded for user ${userId}`);
        }
        break;
      }
      
      case 'invoice.payment_failed': {
        const userId = data.metadata?.user_id;
        if (userId) {
          logger.warn(`[Stripe] Payment failed for user ${userId}`);
          await redis.logFailure('stripe_payment', { userId, invoiceId: data.id });
        }
        break;
      }
    }

    return { success: true, type };
  } catch (err) {
    logger.error(`[Stripe] Webhook handler error:`, err.message);
    await redis.logFailure('stripe_webhook', { type, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Activate Pro subscription for a user
 */
async function activateSubscription(userId, sessionData) {
  try {
    const User = require('../models/user.model');
    await User.update(
      { 
        subscription_plan: 'premium',
        stripe_customer_id: sessionData.customer,
        stripe_subscription_id: sessionData.subscription,
      },
      { where: { id: userId } }
    );
    
    // Clear cache
    await deleteCache(`subscription:${userId}`);
    logger.info(`[Stripe] Pro activated for user ${userId}`);
  } catch (err) {
    logger.error(`[Stripe] Activation failed for ${userId}:`, err.message);
  }
}

/**
 * Sync subscription status from Stripe
 */
async function syncSubscriptionStatus(userId, subData) {
  try {
    const User = require('../models/user.model');
    const isActive = subData.status === 'active' || subData.status === 'trialing';
    
    await User.update(
      {
        subscription_plan: isActive ? 'premium' : 'free',
        trial_active: subData.status === 'trialing',
      },
      { where: { id: userId } }
    );
    
    await deleteCache(`subscription:${userId}`);
    logger.info(`[Stripe] Synced status for user ${userId}: ${subData.status}`);
  } catch (err) {
    logger.error(`[Stripe] Sync failed for ${userId}:`, err.message);
  }
}

/**
 * Deactivate subscription (downgrade to free)
 */
async function deactivateSubscription(userId) {
  try {
    const User = require('../models/user.model');
    await User.update(
      { subscription_plan: 'free', trial_active: false },
      { where: { id: userId } }
    );
    
    await deleteCache(`subscription:${userId}`);
    logger.info(`[Stripe] Subscription deactivated for user ${userId}`);
  } catch (err) {
    logger.error(`[Stripe] Deactivation failed for ${userId}:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// REQUIRE PRO MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Express middleware: Block access if user is not on Pro plan
 */
function requirePro(req, res, next) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'غير مصرح' });
      }

      const status = await getSubscriptionStatus(userId);
      
      if (!status.proFeatures) {
        return res.status(403).json({
          success: false,
          code: 'PRO_REQUIRED',
          message: 'هذه الميزة متاحة فقط لمشتركي Pro 🌟',
          current_plan: status.plan,
          upgrade: {
            monthly_price: PLANS.pro.price_monthly,
            annual_price: PLANS.pro.price_annual,
            trial_days: 7,
            features: PRO_FEATURES,
          },
        });
      }

      req.subscription = status;
      next();
    } catch (err) {
      logger.error('[requirePro] Error:', err.message);
      next(); // Don't block on error — fail open
    }
  };
}

/**
 * Middleware: Enforce feature-specific limits
 */
function enforceLimits(feature) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id;
      if (!userId) return next();

      const status = await getSubscriptionStatus(userId);
      const limit = status.limits[feature];
      
      if (limit === false) {
        return res.status(403).json({
          success: false,
          code: 'PRO_FEATURE',
          message: `هذه الميزة تحتاج اشتراك Pro`,
          feature,
        });
      }
      
      req.featureLimit = limit;
      req.subscription = status;
      next();
    } catch (err) {
      next();
    }
  };
}

/**
 * Verify Stripe webhook signature
 */
function verifyWebhookSignature(req) {
  const stripe = getStripe();
  if (!stripe) return null;

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  
  if (!sig || !webhookSecret) return null;

  try {
    return stripe.webhooks.constructEvent(req.rawBody || req.body, sig, webhookSecret);
  } catch (err) {
    logger.error('[Stripe] Webhook signature verification failed:', err.message);
    return null;
  }
}

module.exports = {
  createCheckoutSession,
  createPortalSession,
  getSubscriptionStatus,
  handleWebhook,
  verifyWebhookSignature,
  requirePro: requirePro(),
  enforceLimits,
  PLANS,
  PRO_FEATURES,
};
