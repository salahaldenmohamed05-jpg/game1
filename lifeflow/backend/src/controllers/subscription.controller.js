/**
 * Subscription Controller
 * ========================
 * Handles plan management, Stripe + Paymob payments, and billing.
 * Paymob supports: Card, Fawry, Electronic Wallets (Egypt)
 */

const stripeService = require('../services/stripe.service');
const paymobService = require('../services/paymob.service');
const logger        = require('../utils/logger');

// ── DB Models (lazy) ─────────────────────────────────────────────────────
function getSubscriptionModel() {
  try { return require('../models/subscription.model'); } catch { return null; }
}
function getUserModel() {
  try { return require('../models/user.model'); } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET STATUS
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/subscription/status */
const getStatus = async (req, res) => {
  try {
    const status = await stripeService.getSubscriptionStatus(req.user.id);
    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('getStatus error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في استرداد الحالة' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// START FREE TRIAL
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/v1/subscription/trial */
const startTrial = async (req, res) => {
  try {
    const result = await stripeService.startFreeTrial(req.user.id);
    res.json({ success: true, data: result, message: 'تم تفعيل التجربة المجانية لـ 7 أيام!' });
  } catch (error) {
    logger.error('startTrial error:', error.message);
    const msg = error.message.includes('free plan')
      ? 'التجربة متاحة للمستخدمين الجدد فقط'
      : 'خطأ في تفعيل التجربة';
    res.status(400).json({ success: false, message: msg });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CREATE SUBSCRIPTION (Stripe)
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/v1/subscription/create */
const createSubscription = async (req, res) => {
  try {
    const { billing_cycle = 'monthly', payment_method_id } = req.body;

    if (!['monthly', 'annual'].includes(billing_cycle)) {
      return res.status(400).json({ success: false, message: 'billing_cycle يجب أن يكون monthly أو annual' });
    }

    const result = await stripeService.createSubscription(
      req.user.id, billing_cycle, payment_method_id
    );

    res.json({
      success: true,
      data:    result,
      message: 'تم إنشاء الاشتراك بنجاح!',
    });
  } catch (error) {
    logger.error('createSubscription error:', error.message);
    if (error.type === 'StripeCardError') {
      return res.status(400).json({ success: false, message: 'خطأ في بيانات البطاقة' });
    }
    if (error.message.includes('STRIPE_SECRET_KEY')) {
      return res.status(503).json({ success: false, message: 'خدمة الدفع غير مفعّلة في البيئة الحالية' });
    }
    res.status(500).json({ success: false, message: 'خطأ في إنشاء الاشتراك' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CANCEL SUBSCRIPTION
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/v1/subscription/cancel */
const cancelSubscription = async (req, res) => {
  try {
    const { immediately = false } = req.body;
    const result = await stripeService.cancelSubscription(req.user.id, immediately);
    res.json({
      success: true,
      data:    result,
      message: immediately
        ? 'تم إلغاء الاشتراك فوراً'
        : 'سيتم إلغاء الاشتراك في نهاية الفترة الحالية',
    });
  } catch (error) {
    logger.error('cancelSubscription error:', error.message);
    if (error.message.includes('No active subscription')) {
      return res.status(404).json({ success: false, message: 'لا يوجد اشتراك نشط' });
    }
    res.status(500).json({ success: false, message: 'خطأ في إلغاء الاشتراك' });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// STRIPE WEBHOOK
// ─────────────────────────────────────────────────────────────────────────────

/** POST /api/v1/subscription/webhook */
const handleWebhook = async (req, res) => {
  const signature = req.headers['stripe-signature'];
  if (!signature) {
    return res.status(400).json({ error: 'Missing stripe-signature header' });
  }

  try {
    const result = await stripeService.handleWebhook(req.body, signature);
    res.json(result);
  } catch (error) {
    logger.error('Webhook error:', error.message);
    res.status(400).json({ error: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// PLANS INFO (public)
// ─────────────────────────────────────────────────────────────────────────────

/** GET /api/v1/subscription/plans */
const getPlans = async (req, res) => {
  const paymobMethods = paymobService.getPaymentMethods();
  const hasPaymob = paymobService.isConfigured();

  res.json({
    success: true,
    data: {
      free: {
        name:    'مجاني',
        price:   0,
        features: [
          'إدارة المهام الأساسية',
          'تتبع العادات (3 عادات)',
          'تسجيل المزاج اليومي',
          'تذكيرات أساسية',
          'ملخص أسبوعي بسيط',
          'دردشة ذكاء اصطناعي (10 رسائل/يوم)',
        ],
        limitations: [
          'لا تحليل الأداء',
          'لا تدقيق أسبوعي',
          'لا كشف مماطلة',
          'لا خريطة طاقة',
        ],
      },
      premium: {
        name:  'مميز',
        pricing: {
          monthly_price_egp: 149.99,
          yearly_price_egp: 1199.99,
          monthly_price_usd: 9.99,
          yearly_price_usd: 79.99,
          yearly_save_percent: 33,
          currency: 'EGP',
        },
        trial_days: 7,
        features: [
          'كل ميزات الخطة المجانية',
          '✨ محرك الأداء الذكي (درجات إنتاجية، تركيز، اتساق)',
          '📊 التدقيق الأسبوعي للحياة',
          '🚩 كشف المماطلة والتأجيل',
          '⚡ خريطة الطاقة الشخصية',
          '🎯 وضع التدريب الذكي',
          'رؤى متقدمة وتقارير مفصلة',
          'مهام وعادات غير محدودة',
          'دردشة ذكاء اصطناعي غير محدودة',
          'تصدير البيانات',
        ],
      },
      payment_gateways: {
        paymob: {
          enabled: hasPaymob,
          methods: paymobMethods,
          supported_countries: ['EG'],
        },
        stripe: {
          enabled: !!process.env.STRIPE_SECRET_KEY,
          methods: ['card'],
          supported_countries: ['US', 'EU', 'UK', 'worldwide'],
        },
      },
    },
  });
};

// ═════════════════════════════════════════════════════════════════════════════
// PAYMOB PAYMENT ENDPOINTS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/v1/subscription/paymob/methods
 * Returns available Paymob payment methods
 */
const getPaymobMethods = async (req, res) => {
  try {
    const methods = paymobService.getPaymentMethods();
    const premiumMonthly = paymobService.getPlanPricing('premium', 'monthly');
    const premiumYearly  = paymobService.getPlanPricing('premium', 'yearly');

    res.json({
      success: true,
      data: {
        methods,
        pricing: {
          premium: {
            monthly: premiumMonthly,
            yearly: premiumYearly,
          },
        },
        configured: paymobService.isConfigured(),
      },
    });
  } catch (error) {
    logger.error('getPaymobMethods error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في تحميل طرق الدفع' });
  }
};

/**
 * POST /api/v1/subscription/paymob/initiate
 * Start a Paymob payment flow
 * Body: { plan, billing_cycle, payment_method, phone?, billing_data? }
 */
const initiatePaymobPayment = async (req, res) => {
  try {
    const { plan = 'premium', billing_cycle = 'monthly', payment_method, phone, billing_data } = req.body;

    if (!payment_method) {
      return res.status(400).json({ success: false, message: 'يرجى اختيار طريقة الدفع' });
    }

    // For demo/trial mode
    if (payment_method === 'demo') {
      try {
        const result = await stripeService.startFreeTrial(req.user.id);
        return res.json({
          success: true,
          data: { method: 'demo', ...result },
          message: 'تم تفعيل التجربة المجانية لـ 7 أيام! 🎉',
        });
      } catch (trialErr) {
        return res.status(400).json({
          success: false,
          message: trialErr.message.includes('free plan')
            ? 'التجربة متاحة للمستخدمين الجدد فقط'
            : 'خطأ في تفعيل التجربة',
        });
      }
    }

    // Build billing data
    const userBilling = {
      email: req.user.email,
      first_name: req.user.name?.split(' ')[0] || 'User',
      last_name: req.user.name?.split(' ').slice(1).join(' ') || 'LifeFlow',
      phone: phone || billing_data?.phone || '+201000000000',
      ...billing_data,
    };

    // Get callback URL
    const callbackUrl = `${req.protocol}://${req.get('host')}/api/v1/subscription/paymob/callback`;

    const result = await paymobService.initiatePayment({
      userId: req.user.id,
      plan,
      billingCycle: billing_cycle,
      paymentMethod: payment_method,
      billingData: userBilling,
      callbackUrl,
    });

    res.json({
      success: true,
      data: result,
      message: result.message_ar || 'تم بدء عملية الدفع',
    });
  } catch (error) {
    logger.error('initiatePaymobPayment error:', error.message);
    
    if (error.message.includes('PAYMOB_API_KEY')) {
      return res.status(503).json({
        success: false,
        message: 'بوابة الدفع Paymob غير مفعّلة — يرجى تهيئة المفاتيح',
        setup_required: true,
      });
    }
    
    res.status(500).json({ success: false, message: error.message || 'خطأ في بدء الدفع' });
  }
};

/**
 * POST /api/v1/subscription/paymob/callback
 * Paymob payment webhook (public, HMAC-verified)
 */
const handlePaymobCallback = async (req, res) => {
  try {
    const result = await paymobService.handleCallback(req.body);

    if (result.success) {
      // Activate subscription for user
      try {
        const User = getUserModel();
        const Subscription = getSubscriptionModel();

        if (User && result.user_id_prefix) {
          // Find user by ID prefix
          const { Op } = require('sequelize');
          const user = await User.findOne({
            where: { id: { [Op.like]: `${result.user_id_prefix}%` } },
          });

          if (user) {
            // Update user subscription
            user.subscription_plan = result.plan || 'premium';
            user.subscription_status = 'active';
            user.subscription_start = new Date();
            
            const durationMonths = result.billing_cycle === 'yearly' ? 12 : 1;
            const endDate = new Date();
            endDate.setMonth(endDate.getMonth() + durationMonths);
            user.subscription_end = endDate;
            
            await user.save();
            logger.info(`[PAYMOB] Subscription activated for user ${user.id}`);
          }
        }
      } catch (dbErr) {
        logger.error('[PAYMOB] DB update after payment:', dbErr.message);
      }
    }

    res.json({ success: true, received: true });
  } catch (error) {
    logger.error('handlePaymobCallback error:', error.message);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/v1/subscription/paymob/verify/:txId
 * Verify a Paymob transaction status
 */
const verifyPaymobTransaction = async (req, res) => {
  try {
    const { txId } = req.params;
    if (!txId) return res.status(400).json({ success: false, message: 'Transaction ID مطلوب' });

    const result = await paymobService.verifyTransaction(txId);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('verifyPaymobTransaction error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في التحقق من المعاملة' });
  }
};

module.exports = {
  getStatus,
  startTrial,
  createSubscription,
  cancelSubscription,
  handleWebhook,
  getPlans,
  // Paymob
  getPaymobMethods,
  initiatePaymobPayment,
  handlePaymobCallback,
  verifyPaymobTransaction,
};
