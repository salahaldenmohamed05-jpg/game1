/**
 * Subscription Controller
 * ========================
 * Handles plan management, Stripe checkout, and billing portal.
 */

const stripeService = require('../services/stripe.service');
const logger        = require('../utils/logger');

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
// CREATE SUBSCRIPTION (paid)
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
// STRIPE WEBHOOK (raw body — no JSON parsing)
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
        price_monthly:  9.99,
        price_annual:   79.99,
        currency: 'USD',
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
    },
  });
};

module.exports = {
  getStatus,
  startTrial,
  createSubscription,
  cancelSubscription,
  handleWebhook,
  getPlans,
};
