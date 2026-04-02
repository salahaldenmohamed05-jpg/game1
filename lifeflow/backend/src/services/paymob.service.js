/**
 * Paymob Payment Gateway Service
 * ================================
 * Egyptian payment gateway supporting:
 *   - Card payments (Visa/Mastercard)
 *   - Fawry cash payments
 *   - Electronic wallets (Vodafone Cash, Orange, Etisalat, etc.)
 *
 * Flow:
 *   1. Authenticate → get auth_token
 *   2. Create order → get order_id
 *   3. Generate payment_key → iframe/redirect
 *   4. Webhook callback → confirm payment
 *
 * Docs: https://docs.paymob.com
 */

'use strict';

const logger = require('../utils/logger');

// ─── Configuration ──────────────────────────────────────────────────────────
const PAYMOB_API_KEY    = process.env.PAYMOB_API_KEY    || '';
const PAYMOB_IFRAME_ID  = process.env.PAYMOB_IFRAME_ID  || '';
const PAYMOB_HMAC       = process.env.PAYMOB_HMAC_SECRET || '';

// Integration IDs for each payment method
const INTEGRATION_IDS = {
  card:   parseInt(process.env.PAYMOB_CARD_INTEGRATION_ID)   || 0,
  fawry:  parseInt(process.env.PAYMOB_FAWRY_INTEGRATION_ID)  || 0,
  wallet: parseInt(process.env.PAYMOB_WALLET_INTEGRATION_ID) || 0,
};

const PAYMOB_BASE = 'https://accept.paymob.com/api';
const CURRENCY = 'EGP';

// Plan pricing in EGP cents (piasters)
const PLAN_PRICING = {
  premium: {
    monthly: {
      amount_cents: 14999, // 149.99 EGP
      label_ar: 'اشتراك شهري - بريميوم',
      label_en: 'Premium Monthly',
    },
    yearly: {
      amount_cents: 119999, // 1199.99 EGP (save ~33%)
      label_ar: 'اشتراك سنوي - بريميوم',
      label_en: 'Premium Yearly',
    },
  },
};

// ─── Helper: HTTP fetch wrapper ─────────────────────────────────────────────
async function paymobFetch(endpoint, body = null, method = 'POST') {
  const url = `${PAYMOB_BASE}${endpoint}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    logger.error(`[PAYMOB] API error ${response.status}: ${errorText}`);
    throw new Error(`Paymob API error: ${response.status}`);
  }
  return response.json();
}

// ─── Step 1: Authenticate ───────────────────────────────────────────────────
let _cachedToken = null;
let _tokenExpiry = 0;

async function authenticate() {
  // Cache token for 50 minutes (Paymob tokens last 60min)
  if (_cachedToken && Date.now() < _tokenExpiry) {
    return _cachedToken;
  }

  if (!PAYMOB_API_KEY) {
    throw new Error('PAYMOB_API_KEY not configured');
  }

  const data = await paymobFetch('/auth/tokens', { api_key: PAYMOB_API_KEY });
  _cachedToken = data.token;
  _tokenExpiry = Date.now() + 50 * 60 * 1000;
  logger.info('[PAYMOB] Authenticated successfully');
  return _cachedToken;
}

// ─── Step 2: Create Order ───────────────────────────────────────────────────
async function createOrder(authToken, { amountCents, merchantOrderId, items = [] }) {
  const data = await paymobFetch('/ecommerce/orders', {
    auth_token: authToken,
    delivery_needed: false,
    amount_cents: amountCents,
    currency: CURRENCY,
    merchant_order_id: merchantOrderId,
    items: items.length > 0 ? items : [{
      name: 'LifeFlow Premium Subscription',
      amount_cents: amountCents,
      quantity: 1,
      description: 'اشتراك LifeFlow بريميوم',
    }],
  });

  logger.info(`[PAYMOB] Order created: ${data.id}`);
  return data;
}

// ─── Step 3: Generate Payment Key ───────────────────────────────────────────
async function generatePaymentKey(authToken, {
  orderId,
  amountCents,
  integrationId,
  billingData = {},
  lockOrderWhenPaid = true,
}) {
  const billing = {
    apartment:      billingData.apartment   || 'N/A',
    email:          billingData.email       || 'user@lifeflow.app',
    floor:          billingData.floor       || 'N/A',
    first_name:     billingData.first_name  || 'LifeFlow',
    street:         billingData.street      || 'N/A',
    building:       billingData.building    || 'N/A',
    phone_number:   billingData.phone       || '+201000000000',
    shipping_method: 'N/A',
    postal_code:    billingData.postal_code || '00000',
    city:           billingData.city        || 'Cairo',
    country:        billingData.country     || 'EG',
    last_name:      billingData.last_name   || 'User',
    state:          billingData.state       || 'Cairo',
  };

  const data = await paymobFetch('/acceptance/payment_keys', {
    auth_token: authToken,
    amount_cents: amountCents,
    expiration: 3600, // 1 hour
    order_id: orderId,
    billing_data: billing,
    currency: CURRENCY,
    integration_id: integrationId,
    lock_order_when_paid: lockOrderWhenPaid,
  });

  logger.info(`[PAYMOB] Payment key generated for order ${orderId}`);
  return data.token;
}

// ─── Paymob Service Exports ────────────────────────────────────────────────
const PaymobService = {

  /**
   * Check if Paymob is configured
   */
  isConfigured() {
    return !!PAYMOB_API_KEY && (INTEGRATION_IDS.card > 0 || INTEGRATION_IDS.fawry > 0 || INTEGRATION_IDS.wallet > 0);
  },

  /**
   * Get available payment methods
   */
  getPaymentMethods() {
    const methods = [];
    if (INTEGRATION_IDS.card > 0) {
      methods.push({
        id: 'card',
        name_ar: 'بطاقة ائتمان / خصم',
        name_en: 'Credit/Debit Card',
        icon: '💳',
        description_ar: 'ادفع بفيزا أو ماستركارد',
        supported_brands: ['Visa', 'Mastercard'],
      });
    }
    if (INTEGRATION_IDS.fawry > 0) {
      methods.push({
        id: 'fawry',
        name_ar: 'فوري',
        name_en: 'Fawry',
        icon: '🏪',
        description_ar: 'ادفع كاش من أي فرع فوري',
        description_en: 'Pay cash at any Fawry outlet',
      });
    }
    if (INTEGRATION_IDS.wallet > 0) {
      methods.push({
        id: 'wallet',
        name_ar: 'محفظة إلكترونية',
        name_en: 'Mobile Wallet',
        icon: '📱',
        description_ar: 'فودافون كاش، أورنج، اتصالات',
        supported_wallets: ['Vodafone Cash', 'Orange Money', 'Etisalat Cash', 'WE Pay', 'CIB'],
      });
    }

    // Always add demo mode
    methods.push({
      id: 'demo',
      name_ar: 'تجربة مجانية',
      name_en: 'Free Trial',
      icon: '🎁',
      description_ar: 'جرّب البريميوم مجانًا لمدة 7 أيام',
    });

    return methods;
  },

  /**
   * Get plan pricing
   */
  getPlanPricing(plan = 'premium', cycle = 'monthly') {
    const pricing = PLAN_PRICING[plan]?.[cycle];
    if (!pricing) return null;
    return {
      ...pricing,
      currency: CURRENCY,
      display_price: (pricing.amount_cents / 100).toFixed(2),
    };
  },

  /**
   * Initiate payment flow
   * @param {Object} params
   * @param {string} params.userId - User ID
   * @param {string} params.plan - Plan name (premium)
   * @param {string} params.billingCycle - monthly/yearly
   * @param {string} params.paymentMethod - card/fawry/wallet
   * @param {Object} params.billingData - User billing info
   * @param {string} params.callbackUrl - Frontend callback URL
   * @returns {Object} Payment initiation response
   */
  async initiatePayment({ userId, plan, billingCycle, paymentMethod, billingData, callbackUrl }) {
    // Validate payment method
    if (!['card', 'fawry', 'wallet', 'demo'].includes(paymentMethod)) {
      throw new Error('طريقة الدفع غير مدعومة');
    }

    // Demo mode — instant activation
    if (paymentMethod === 'demo') {
      return {
        method: 'demo',
        status: 'completed',
        message: 'تم تفعيل الاشتراك التجريبي',
      };
    }

    // Get pricing
    const pricing = PLAN_PRICING[plan]?.[billingCycle];
    if (!pricing) throw new Error('الخطة أو دورة الفوترة غير صالحة');

    const integrationId = INTEGRATION_IDS[paymentMethod];
    if (!integrationId) throw new Error(`طريقة الدفع ${paymentMethod} غير مفعّلة — يرجى تهيئة Integration ID`);

    // Authenticate
    const authToken = await authenticate();

    // Create merchant order ID
    const merchantOrderId = `LF_${userId.slice(0, 8)}_${plan}_${billingCycle}_${Date.now()}`;

    // Create order
    const order = await createOrder(authToken, {
      amountCents: pricing.amount_cents,
      merchantOrderId,
    });

    // Generate payment key
    const paymentKey = await generatePaymentKey(authToken, {
      orderId: order.id,
      amountCents: pricing.amount_cents,
      integrationId,
      billingData,
    });

    // Build response based on payment method
    let result = {
      method: paymentMethod,
      order_id: order.id,
      merchant_order_id: merchantOrderId,
      amount: pricing.amount_cents / 100,
      currency: CURRENCY,
      plan,
      billing_cycle: billingCycle,
    };

    if (paymentMethod === 'card') {
      // Card: redirect to Paymob iframe
      const iframeId = PAYMOB_IFRAME_ID || 'default';
      result.payment_url = `https://accept.paymob.com/api/acceptance/iframes/${iframeId}?payment_token=${paymentKey}`;
      result.type = 'redirect';
      result.message_ar = 'سيتم تحويلك لصفحة الدفع الآمنة';
    } else if (paymentMethod === 'fawry') {
      // Fawry: show reference number
      result.payment_key = paymentKey;
      result.type = 'reference';
      result.fawry_ref = order.id.toString(); // Paymob provides the fawry reference
      result.message_ar = 'استخدم رقم المرجع للدفع في أي فرع فوري';
      result.expiry = '48 ساعة';
    } else if (paymentMethod === 'wallet') {
      // Wallet: redirect to wallet payment
      result.payment_key = paymentKey;
      result.type = 'wallet_redirect';
      result.wallet_url = `https://accept.paymob.com/api/acceptance/payments/pay`;
      result.message_ar = 'سيتم تحويلك للدفع عبر محفظتك الإلكترونية';
    }

    logger.info(`[PAYMOB] Payment initiated: ${paymentMethod} | Order: ${order.id} | User: ${userId}`);
    return result;
  },

  /**
   * Handle Paymob webhook/callback
   * Verifies HMAC signature and processes payment result
   */
  async handleCallback(payload) {
    try {
      const { obj } = payload;
      if (!obj) {
        logger.warn('[PAYMOB] Webhook received without obj');
        return { success: false, message: 'Invalid payload' };
      }

      // Verify HMAC if configured
      if (PAYMOB_HMAC && payload.hmac) {
        const isValid = verifyHMAC(payload);
        if (!isValid) {
          logger.error('[PAYMOB] HMAC verification failed');
          return { success: false, message: 'HMAC verification failed' };
        }
      }

      const orderId = obj.order?.id || obj.order;
      const transactionId = obj.id;
      const isSuccess = obj.success === true;
      const isPending = obj.pending === true;
      const amountCents = obj.amount_cents;
      const merchantOrderId = obj.order?.merchant_order_id || '';

      logger.info(`[PAYMOB] Callback: tx=${transactionId} order=${orderId} success=${isSuccess} pending=${isPending}`);

      // Parse merchant order ID to get user info
      // Format: LF_{userId8}_{plan}_{cycle}_{timestamp}
      const parts = merchantOrderId.split('_');
      const userIdPrefix = parts[1] || '';
      const plan = parts[2] || 'premium';
      const billingCycle = parts[3] || 'monthly';

      return {
        success: isSuccess,
        pending: isPending,
        transaction_id: transactionId,
        order_id: orderId,
        merchant_order_id: merchantOrderId,
        amount: amountCents / 100,
        currency: CURRENCY,
        user_id_prefix: userIdPrefix,
        plan,
        billing_cycle: billingCycle,
        payment_method: obj.source_data?.type || 'unknown',
        payment_subtype: obj.source_data?.sub_type || '',
      };
    } catch (err) {
      logger.error('[PAYMOB] Callback processing error:', err.message);
      return { success: false, message: err.message };
    }
  },

  /**
   * Verify transaction status
   */
  async verifyTransaction(transactionId) {
    try {
      const authToken = await authenticate();
      const data = await paymobFetch(`/acceptance/transactions/${transactionId}`, null, 'GET');
      return {
        success: data.success === true,
        pending: data.pending === true,
        amount: data.amount_cents / 100,
        currency: CURRENCY,
        order_id: data.order?.id,
        transaction_id: data.id,
      };
    } catch (err) {
      logger.error(`[PAYMOB] Verify transaction ${transactionId} failed:`, err.message);
      throw err;
    }
  },
};

// ─── HMAC Verification ──────────────────────────────────────────────────────
function verifyHMAC(payload) {
  try {
    const crypto = require('crypto');
    const obj = payload.obj || {};

    // Paymob HMAC verification fields (sorted alphabetically)
    const hmacFields = [
      obj.amount_cents, obj.created_at, obj.currency, obj.error_occured,
      obj.has_parent_transaction, obj.id, obj.integration_id, obj.is_3d_secure,
      obj.is_auth, obj.is_capture, obj.is_refunded, obj.is_standalone_payment,
      obj.is_voided, obj.order?.id, obj.owner, obj.pending,
      obj.source_data?.pan, obj.source_data?.sub_type, obj.source_data?.type,
      obj.success,
    ].join('');

    const computed = crypto
      .createHmac('sha512', PAYMOB_HMAC)
      .update(hmacFields)
      .digest('hex');

    return computed === payload.hmac;
  } catch (e) {
    logger.error('[PAYMOB] HMAC compute error:', e.message);
    return false;
  }
}

module.exports = PaymobService;
