/**
 * AI Error Handler — معالج أخطاء الذكاء الاصطناعي
 * ==================================================
 * Provides safe, consistent error handling for all AI calls.
 * Features:
 *  - Categorized error types (timeout, rate-limit, key-missing, parse-fail, network)
 *  - Arabic fallback message always returned (never undefined/null)
 *  - Fallback flag for client-side display
 *  - Full error logging with context
 */

'use strict';

const logger = require('../../utils/logger');

// ─── Error Categories ─────────────────────────────────────────────────────────
const ERROR_TYPES = {
  TIMEOUT      : 'AI_TIMEOUT',
  RATE_LIMIT   : 'AI_RATE_LIMIT',
  KEY_MISSING  : 'AI_KEY_MISSING',
  PARSE_FAIL   : 'AI_PARSE_FAIL',
  NETWORK      : 'AI_NETWORK',
  NO_PROVIDER  : 'AI_NO_PROVIDER',
  UNKNOWN      : 'AI_UNKNOWN',
};

// ─── Default Fallback Reply ───────────────────────────────────────────────────
const DEFAULT_FALLBACK = 'حصل مشكلة مؤقتة، حاول تاني بعد شوية 🙏';

// ─── Context-Aware Fallback Replies ──────────────────────────────────────────
const FALLBACK_REPLIES = {
  AI_TIMEOUT    : 'استغرق الرد وقتاً أطول من المعتاد. حاول مجدداً بعد لحظة 🔄',
  AI_RATE_LIMIT : 'نحن نعالج طلبات كثيرة الآن. حاول بعد دقيقة قليلة ⏳',
  AI_KEY_MISSING: 'خدمة الذكاء الاصطناعي غير متاحة حالياً. تحقق من الإعدادات ⚙️',
  AI_PARSE_FAIL : 'تعذّر معالجة الرد. حاول مجدداً 🔄',
  AI_NETWORK    : 'مشكلة في الاتصال. تحقق من الشبكة وحاول مجدداً 🌐',
  AI_NO_PROVIDER: 'لا يوجد مزود ذكاء اصطناعي متاح حالياً 🔧',
  AI_UNKNOWN    : DEFAULT_FALLBACK,
};

// ─── Error Classifier ─────────────────────────────────────────────────────────
function classifyError(error) {
  const msg = error?.message || '';

  if (msg.includes('AI_TIMEOUT') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET')) {
    return ERROR_TYPES.TIMEOUT;
  }
  if (msg.includes('RATE_LIMIT') || msg.includes('429')) {
    return ERROR_TYPES.RATE_LIMIT;
  }
  if (msg.includes('KEY_MISSING') || msg.includes('401') || msg.includes('403')) {
    return ERROR_TYPES.KEY_MISSING;
  }
  if (msg.includes('PARSE') || msg.includes('JSON')) {
    return ERROR_TYPES.PARSE_FAIL;
  }
  if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('network')) {
    return ERROR_TYPES.NETWORK;
  }
  if (msg.includes('NO_PROVIDER') || msg.includes('ALL_PROVIDERS_FAILED')) {
    return ERROR_TYPES.NO_PROVIDER;
  }
  return ERROR_TYPES.UNKNOWN;
}

// ─── Safe Execute Wrapper ─────────────────────────────────────────────────────
/**
 * Safely executes an AI call, returns a normalized result.
 * Always returns { reply, is_fallback, error_type? }
 *
 * @param {Function} aiCallFn  - async function that returns a string reply
 * @param {object}   context   - optional context for better fallback customization
 * @param {string}   context.userName
 * @param {string}   context.intentCategory
 */
async function safeExecute(aiCallFn, context = {}) {
  try {
    const reply = await aiCallFn();

    // Validate reply is a non-empty string
    if (!reply || typeof reply !== 'string' || reply.trim().length === 0) {
      logger.warn('[AI-ERROR-HANDLER] Empty reply from AI, using fallback');
      return { reply: DEFAULT_FALLBACK, is_fallback: true, error_type: 'EMPTY_REPLY' };
    }

    return { reply: reply.trim(), is_fallback: false };
  } catch (error) {
    const errorType = classifyError(error);
    const fallbackReply = buildContextualFallback(errorType, context);

    logger.error('[AI-ERROR-HANDLER] AI call failed', {
      error_type  : errorType,
      message     : error.message,
      user        : context.userName || 'unknown',
      intent      : context.intentCategory || 'unknown',
    });

    return {
      reply      : fallbackReply,
      is_fallback: true,
      error_type : errorType,
      error_msg  : error.message,
    };
  }
}

// ─── Contextual Fallback Builder ──────────────────────────────────────────────
function buildContextualFallback(errorType, context = {}) {
  const base = FALLBACK_REPLIES[errorType] || DEFAULT_FALLBACK;
  const name = context.userName;

  // Personalize if we have user name
  if (name && name !== 'صديقي') {
    return `${base.replace('🙏', '')} يا ${name} 🙏`;
  }
  return base;
}

// ─── Response Validator ───────────────────────────────────────────────────────
/**
 * Validates and sanitizes AI response string.
 * Returns the sanitized string or the fallback.
 */
function validateResponse(response, fallback = DEFAULT_FALLBACK) {
  if (!response) return fallback;
  if (typeof response !== 'string') {
    // If it's an object with reply/text field
    if (response?.reply) return String(response.reply).trim() || fallback;
    if (response?.text)  return String(response.text).trim()  || fallback;
    if (response?.raw)   return String(response.raw).trim()   || fallback;
    return fallback;
  }
  const trimmed = response.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

// ─── Safe JSON Parse ──────────────────────────────────────────────────────────
/**
 * Safely parse JSON with multiple fallback strategies.
 */
function safeParseJSON(raw, fallback = null) {
  if (!raw || typeof raw !== 'string') return fallback;

  // Direct parse
  try { return JSON.parse(raw); } catch (_) {}

  // Try extracting JSON block
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
  }

  // Try extracting JSON array
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch (_) {}
  }

  logger.warn('[AI-ERROR-HANDLER] All JSON parse strategies failed');
  return fallback;
}

module.exports = {
  safeExecute,
  validateResponse,
  safeParseJSON,
  classifyError,
  buildContextualFallback,
  DEFAULT_FALLBACK,
  ERROR_TYPES,
};
