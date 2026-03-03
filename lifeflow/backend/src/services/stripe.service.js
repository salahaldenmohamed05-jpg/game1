/**
 * Stripe Subscription Service
 * ============================
 * Handles:
 * - Creating Stripe customers & subscriptions
 * - Managing subscription status
 * - Processing webhooks
 * - Trial management
 * - Payment intent creation
 */

const logger = require('../utils/logger');

const getModels = () => ({
  User:         require('../models/user.model'),
  Subscription: require('../models/subscription.model').Subscription,
  PaymentEvent: require('../models/subscription.model').PaymentEvent,
});

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE CLIENT (lazy-loaded)
// ─────────────────────────────────────────────────────────────────────────────

let _stripe = null;
function getStripe() {
  if (!_stripe) {
    const Stripe = require('stripe');
    const key    = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY not configured');
    _stripe = Stripe(key, { apiVersion: '2023-10-16' });
  }
  return _stripe;
}

// ─────────────────────────────────────────────────────────────────────────────
// PRICE IDs (set in environment)
// ─────────────────────────────────────────────────────────────────────────────
const PRICE_IDS = {
  premium_monthly: process.env.STRIPE_PRICE_MONTHLY || 'price_monthly_placeholder',
  premium_annual:  process.env.STRIPE_PRICE_ANNUAL  || 'price_annual_placeholder',
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE / GET STRIPE CUSTOMER
// ─────────────────────────────────────────────────────────────────────────────

async function ensureStripeCustomer(user) {
  const stripe = getStripe();
  const { Subscription } = getModels();

  // Check if already has customer ID
  const existing = await Subscription.findOne({ where: { user_id: user.id } });
  if (existing?.stripe_customer_id) return existing.stripe_customer_id;

  // Create new customer
  const customer = await stripe.customers.create({
    email: user.email,
    name:  user.name,
    metadata: { user_id: user.id, app: 'lifeflow' },
  });

  logger.info(`Stripe customer created: ${customer.id} for user ${user.id}`);
  return customer.id;
}

// ─────────────────────────────────────────────────────────────────────────────
// START SUBSCRIPTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Create a Stripe subscription with a 7-day trial.
 * @param {string} userId
 * @param {'monthly'|'annual'} billingCycle
 * @param {string} paymentMethodId  Stripe payment method ID
 */
async function createSubscription(userId, billingCycle = 'monthly', paymentMethodId = null) {
  const stripe = getStripe();
  const { User, Subscription } = getModels();

  const user = await User.findByPk(userId);
  if (!user) throw new Error('User not found');

  const customerId = await ensureStripeCustomer(user);
  const priceId    = PRICE_IDS[`premium_${billingCycle}`];

  // Attach payment method if provided
  if (paymentMethodId) {
    await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    await stripe.customers.update(customerId, {
      invoice_settings: { default_payment_method: paymentMethodId },
    });
  }

  // Create subscription with trial
  const subscription = await stripe.subscriptions.create({
    customer:         customerId,
    items:            [{ price: priceId }],
    trial_period_days: 7,
    expand:           ['latest_invoice.payment_intent'],
    metadata: { user_id: userId },
  });

  // Save to DB
  await Subscription.upsert({
    user_id:               userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id:    customerId,
    stripe_price_id:       priceId,
    stripe_payment_method: paymentMethodId,
    plan:          'premium',
    billing_cycle: billingCycle,
    amount_cents:  subscription.items.data[0]?.price?.unit_amount || 0,
    currency:      subscription.currency,
    status:        subscription.status,
    current_period_start: new Date(subscription.current_period_start * 1000),
    current_period_end:   new Date(subscription.current_period_end   * 1000),
  });

  // Update user plan
  await user.update({
    subscription_plan:  'premium',
    trial_ends_at:      new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    subscription_status: 'trialing',
  });

  logger.info(`Subscription created: ${subscription.id} for user ${userId}`);
  return {
    subscription_id: subscription.id,
    status:          subscription.status,
    trial_end:       subscription.trial_end
      ? new Date(subscription.trial_end * 1000).toISOString()
      : null,
    client_secret:   subscription.latest_invoice?.payment_intent?.client_secret || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL SUBSCRIPTION
// ─────────────────────────────────────────────────────────────────────────────

async function cancelSubscription(userId, immediately = false) {
  const stripe = getStripe();
  const { User, Subscription } = getModels();

  const sub = await Subscription.findOne({ where: { user_id: userId } });
  if (!sub?.stripe_subscription_id) throw new Error('No active subscription found');

  let cancelled;
  if (immediately) {
    cancelled = await stripe.subscriptions.cancel(sub.stripe_subscription_id);
  } else {
    cancelled = await stripe.subscriptions.update(sub.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
  }

  await sub.update({
    status:               cancelled.status,
    cancel_at_period_end: cancelled.cancel_at_period_end,
    cancelled_at:         immediately ? new Date() : null,
  });

  if (immediately) {
    const user = await User.findByPk(userId);
    await user?.update({ subscription_plan: 'free', subscription_status: 'cancelled' });
  }

  return {
    cancelled:       true,
    immediately,
    period_end:      cancelled.current_period_end
      ? new Date(cancelled.current_period_end * 1000).toISOString()
      : null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK HANDLER
// ─────────────────────────────────────────────────────────────────────────────

async function handleWebhook(rawBody, signature) {
  const stripe  = getStripe();
  const secret  = process.env.STRIPE_WEBHOOK_SECRET;
  const { User, Subscription, PaymentEvent } = getModels();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    logger.error('Stripe webhook signature error:', err.message);
    throw new Error(`Webhook signature invalid: ${err.message}`);
  }

  // Idempotency check
  const existing = await PaymentEvent.findOne({ where: { stripe_event_id: event.id } });
  if (existing?.processed) {
    logger.info(`Webhook already processed: ${event.id}`);
    return { received: true, already_processed: true };
  }

  // Log event
  const eventRecord = await PaymentEvent.upsert({
    stripe_event_id: event.id,
    event_type:      event.type,
    payload:         event.data.object,
    processed:       false,
  });

  // Handle event types
  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub    = event.data.object;
        const userId = sub.metadata?.user_id;
        if (userId) {
          await syncSubscriptionStatus(userId, sub);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub    = event.data.object;
        const userId = sub.metadata?.user_id;
        if (userId) {
          await Subscription.update(
            { status: 'cancelled', cancelled_at: new Date() },
            { where: { stripe_subscription_id: sub.id } }
          );
          const user = await User.findByPk(userId);
          await user?.update({ subscription_plan: 'free', subscription_status: 'cancelled' });
          logger.info(`Subscription cancelled for user ${userId}`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subId   = invoice.subscription;
        if (subId) {
          const sub = await Subscription.findOne({ where: { stripe_subscription_id: subId } });
          if (sub) {
            const userId = sub.user_id;
            await sub.update({ status: 'active' });
            const user = await User.findByPk(userId);
            await user?.update({ subscription_status: 'active', subscription_plan: 'premium' });
            logger.info(`Payment succeeded for user ${userId}`);
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subId   = invoice.subscription;
        if (subId) {
          const sub = await Subscription.findOne({ where: { stripe_subscription_id: subId } });
          if (sub) {
            await sub.update({ status: 'past_due' });
            const user = await User.findByPk(sub.user_id);
            await user?.update({ subscription_status: 'past_due' });
            logger.warn(`Payment failed for subscription ${subId}`);
          }
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        // 3 days before trial ends — send reminder
        const sub    = event.data.object;
        const userId = sub.metadata?.user_id;
        logger.info(`Trial ending soon for user ${userId}`);
        // TODO: send email/push notification
        break;
      }

      default:
        logger.debug(`Unhandled Stripe event: ${event.type}`);
    }

    // Mark as processed
    await PaymentEvent.update(
      { processed: true, processed_at: new Date(), user_id: event.data.object?.metadata?.user_id },
      { where: { stripe_event_id: event.id } }
    );

  } catch (handlerError) {
    logger.error(`Webhook handler error (${event.type}):`, handlerError.message);
    throw handlerError;
  }

  return { received: true, event_type: event.type };
}

// ─────────────────────────────────────────────────────────────────────────────
// SYNC SUBSCRIPTION STATUS
// ─────────────────────────────────────────────────────────────────────────────

async function syncSubscriptionStatus(userId, stripeSubscription) {
  const { User, Subscription } = getModels();

  const statusMap = {
    active:     { plan: 'premium', status: 'active'   },
    trialing:   { plan: 'premium', status: 'trialing' },
    past_due:   { plan: 'premium', status: 'past_due' },
    cancelled:  { plan: 'free',    status: 'cancelled'},
    unpaid:     { plan: 'free',    status: 'unpaid'   },
    incomplete: { plan: 'free',    status: 'incomplete'},
  };

  const mapped = statusMap[stripeSubscription.status] || { plan: 'free', status: stripeSubscription.status };

  await Subscription.update(
    {
      status:               stripeSubscription.status,
      current_period_start: new Date(stripeSubscription.current_period_start * 1000),
      current_period_end:   new Date(stripeSubscription.current_period_end   * 1000),
      cancel_at_period_end: stripeSubscription.cancel_at_period_end,
    },
    { where: { stripe_subscription_id: stripeSubscription.id } }
  );

  const user = await User.findByPk(userId);
  if (user) {
    await user.update({
      subscription_plan:   mapped.plan,
      subscription_status: mapped.status,
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET SUBSCRIPTION STATUS
// ─────────────────────────────────────────────────────────────────────────────

async function getSubscriptionStatus(userId) {
  const { User, Subscription } = getModels();
  const user = await User.findByPk(userId);
  const sub  = await Subscription.findOne({
    where: { user_id: userId },
    order: [['createdAt', 'DESC']],
  });

  return {
    plan:            user?.subscription_plan  || 'free',
    status:          user?.subscription_status || 'inactive',
    is_premium:      user?.isPremium()         || false,
    trial_days:      user?.trialDaysRemaining() || 0,
    subscription:    sub ? {
      id:             sub.stripe_subscription_id,
      billing_cycle:  sub.billing_cycle,
      amount_cents:   sub.amount_cents,
      currency:       sub.currency,
      period_end:     sub.current_period_end,
      cancel_at_period_end: sub.cancel_at_period_end,
    } : null,
    prices: {
      monthly: { cents: 999, label: '$9.99 / شهر', id: PRICE_IDS.premium_monthly },
      annual:  { cents: 7999, label: '$79.99 / سنة', id: PRICE_IDS.premium_annual, savings: '33%' },
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// START 7-DAY TRIAL (no payment required)
// ─────────────────────────────────────────────────────────────────────────────

async function startFreeTrial(userId) {
  const { User } = getModels();
  const user = await User.findByPk(userId);
  if (!user) throw new Error('User not found');

  if (user.subscription_plan !== 'free') {
    throw new Error('Trial only available for free plan users');
  }

  const trialEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await user.update({
    subscription_plan:   'premium',
    subscription_status: 'trialing',
    trial_ends_at:       trialEnd,
  });

  logger.info(`7-day trial started for user ${userId}, ends ${trialEnd.toISOString()}`);
  return {
    trial_started:  true,
    trial_ends_at:  trialEnd.toISOString(),
    days_remaining: 7,
  };
}

module.exports = {
  createSubscription,
  cancelSubscription,
  handleWebhook,
  getSubscriptionStatus,
  startFreeTrial,
  ensureStripeCustomer,
};
