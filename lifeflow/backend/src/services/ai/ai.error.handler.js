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
const DEFAULT_FALLBACK = 'حصل مشكلة بسيطة، جرّب تاني كمان شوية 🙏';

// ─── Context-Aware Fallback Replies ──────────────────────────────────────────
const FALLBACK_REPLIES = {
  AI_TIMEOUT    : 'الرد اتأخر شوية — جرّب تاني 🔄',
  AI_RATE_LIMIT : 'في ضغط دلوقتي، جرّب بعد دقيقة ⏳',
  AI_KEY_MISSING: 'في مشكلة في الإعدادات — كلّم الدعم ⚙️',
  AI_PARSE_FAIL : 'حاجة غلط حصلت — جرّب تاني 🔄',
  AI_NETWORK    : 'في مشكلة في الاتصال — شيّك النت وجرّب تاني 🌐',
  AI_NO_PROVIDER: 'الخدمة مش متاحة دلوقتي 🔧',
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

    return { reply: sanitizeAIText(reply.trim()), is_fallback: false };
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

// ─── Text Sanitizer — removes garbled/broken characters from AI output ───────
/**
 * sanitizeAIText(text)
 * Cleans AI-generated text to remove:
 *   - Unicode replacement characters (U+FFFD → �)
 *   - Orphan combining marks without base characters
 *   - Non-printable control characters (except newlines/tabs)
 *   - Chinese/CJK characters that appear due to model hallucination
 *   - Double question marks "??" that replace dropped characters
 *   - Excessive whitespace
 * Preserves: Arabic, Latin, digits, punctuation, emojis, common symbols.
 */
function sanitizeAIText(text) {
  if (!text || typeof text !== 'string') return text;

  let cleaned = text
    // 1. Remove Unicode replacement character
    .replace(/\uFFFD/g, '')
    // 2. Remove CJK Unified Ideographs (Chinese/Japanese/Korean characters — hallucination)
    .replace(/[\u4E00-\u9FFF\u3400-\u4DBF\u2E80-\u2EFF\u3000-\u303F\u31C0-\u31EF\uF900-\uFAFF]/g, '')
    // 2b. Remove CJK Compatibility Ideographs & Extension ranges
    .replace(/[\u{20000}-\u{2A6DF}\u{2A700}-\u{2EBEF}\u{30000}-\u{3134F}]/gu, '')
    // 3. Remove orphan "??" that replace dropped Arabic letters (but keep single ?)
    .replace(/(?<=[\u0600-\u06FF\u0750-\u077F])\?{2,}(?=[\u0600-\u06FF\u0750-\u077F]|\s|$)/g, '')
    .replace(/(?<=^|\s)\?{2,}(?=[\u0600-\u06FF\u0750-\u077F])/g, '')
    // 3b. Remove standalone "??" sequences (not inside code/URL)
    .replace(/(?<!\w)\?{2,}(?!\w)/g, '')
    // 4. Remove non-printable control chars (keep \n, \t, \r)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // 5. Remove zero-width characters that break Arabic rendering
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    // 5b. Remove orphan combining marks without a base character
    .replace(/(^|[\s\n])([\u0300-\u036F\u0610-\u061A\u064B-\u065F\u0670]+)/g, '$1')
    // 6. Collapse excessive whitespace
    .replace(/ {3,}/g, '  ')
    .replace(/\n{4,}/g, '\n\n\n')
    // 7. Remove broken half-characters (isolated surrogate pairs)
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/g, '')
    .replace(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .trim();

  return cleaned;
}

/**
 * Deep-sanitize an object's string values recursively.
 * Used on full AI response objects to clean all text fields.
 */
function sanitizeAIResponse(obj) {
  if (!obj) return obj;
  if (typeof obj === 'string') return sanitizeAIText(obj);
  if (Array.isArray(obj)) return obj.map(sanitizeAIResponse);
  if (typeof obj === 'object') {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = sanitizeAIResponse(value);
    }
    return result;
  }
  return obj;
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
    if (response?.reply) return sanitizeAIText(String(response.reply).trim()) || fallback;
    if (response?.text)  return sanitizeAIText(String(response.text).trim())  || fallback;
    if (response?.raw)   return sanitizeAIText(String(response.raw).trim())   || fallback;
    return fallback;
  }
  const trimmed = sanitizeAIText(response.trim());
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
  sanitizeAIText,
  sanitizeAIResponse,
  DEFAULT_FALLBACK,
  ERROR_TYPES,
};
