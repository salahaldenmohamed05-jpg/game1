/**
 * AI Safe Executor — المنفذ الآمن للذكاء الاصطناعي
 * ===================================================
 * The single entry-point for ALL AI calls in LifeFlow.
 *
 * Guarantees:
 *  ✅ Never crashes — always returns { reply, is_fallback }
 *  ✅ 15-second hard timeout via Promise.race
 *  ✅ Validates response is a non-empty string
 *  ✅ Classifies errors: TIMEOUT / RATE_LIMIT / PARSE_FAIL / KEY_MISSING / UNKNOWN
 *  ✅ Full debug logging: input, provider, response time, fallback used
 *  ✅ Arabic contextual fallback messages
 *
 * Usage:
 *   const { safeAIExecute } = require('./ai.safe.executor');
 *   const result = await safeAIExecute(() => aiClient.chat(sys, msg));
 *   // result = { reply: string, is_fallback: bool, error_type?, elapsed_ms }
 */

'use strict';

const logger = require('../../utils/logger');

// ─── Config ───────────────────────────────────────────────────────────────────
const AI_TIMEOUT_MS    = 15_000;   // 15 seconds hard limit
const FALLBACK_DEFAULT = 'حصلت مشكلة مؤقتة، حاول تاني بعد شوية 🙏';

// ─── Arabic Fallbacks by Error Type ──────────────────────────────────────────
const FALLBACKS = {
  TIMEOUT    : 'استغرق الرد وقتاً أطول من المعتاد — حاول مجدداً بعد لحظة 🔄',
  RATE_LIMIT : 'نعالج طلبات كثيرة الآن — حاول بعد دقيقة ⏳',
  KEY_MISSING: 'خدمة الذكاء الاصطناعي غير مفعّلة حالياً ⚙️',
  PARSE_FAIL : 'تعذّر قراءة الرد — حاول مجدداً 🔄',
  NETWORK    : 'مشكلة في الاتصال — تحقق من الشبكة 🌐',
  UNKNOWN    : FALLBACK_DEFAULT,
};

// ─── Error Classifier ─────────────────────────────────────────────────────────
function classifyError(err) {
  const msg = (err?.message || '').toUpperCase();
  if (msg.includes('TIMEOUT') || msg.includes('ETIMEDOUT') || msg.includes('ECONNRESET'))
    return 'TIMEOUT';
  if (msg.includes('429') || msg.includes('RATE') || msg.includes('QUOTA'))
    return 'RATE_LIMIT';
  if (msg.includes('401') || msg.includes('403') || msg.includes('KEY'))
    return 'KEY_MISSING';
  if (msg.includes('JSON') || msg.includes('PARSE') || msg.includes('INVALID'))
    return 'PARSE_FAIL';
  if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED') || msg.includes('NETWORK'))
    return 'NETWORK';
  return 'UNKNOWN';
}

// ─── Response Validator ───────────────────────────────────────────────────────
function isValidReply(value) {
  if (!value) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  // Handle object responses with reply/text/content fields
  if (typeof value === 'object') {
    return !!(value.reply || value.text || value.content || value.message);
  }
  return false;
}

function extractReply(value) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return (value.reply || value.text || value.content || value.message || '').trim();
  }
  return '';
}

// ─── Core Safe Executor ───────────────────────────────────────────────────────
/**
 * Safely execute an AI function with full protection.
 *
 * @param {Function} fn           - async function that returns AI reply (string or object)
 * @param {object}   [options]
 * @param {string}   [options.fallback]     - custom fallback message
 * @param {number}   [options.timeoutMs]    - custom timeout (default 15000)
 * @param {string}   [options.context]      - label for logging (e.g., 'orchestrator', 'planner')
 * @param {string}   [options.userId]       - user ID for logging
 * @param {string}   [options.userName]     - user name for personalized fallback
 *
 * @returns {Promise<{reply: string, is_fallback: boolean, error_type?: string, elapsed_ms: number}>}
 */
async function safeAIExecute(fn, options = {}) {
  const {
    fallback    = FALLBACK_DEFAULT,
    timeoutMs   = AI_TIMEOUT_MS,
    context     = 'ai',
    userId      = 'unknown',
    userName    = null,
  } = options;

  const startMs = Date.now();

  // Build the timeout race
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('TIMEOUT: AI call exceeded ' + timeoutMs + 'ms')), timeoutMs)
  );

  try {
    // Race: AI call vs timeout
    const result = await Promise.race([fn(), timeoutPromise]);

    const elapsed = Date.now() - startMs;

    // Validate response
    if (!isValidReply(result)) {
      logger.warn(`[SAFE-EXEC] Empty/invalid response from AI`, {
        context,
        userId,
        elapsed_ms: elapsed,
        resultType: typeof result,
      });
      return {
        reply      : fallback,
        is_fallback: true,
        error_type : 'INVALID_RESPONSE',
        elapsed_ms : elapsed,
      };
    }

    const reply = extractReply(result);

    logger.debug(`[SAFE-EXEC] ✅ AI response received`, {
      context,
      userId,
      elapsed_ms : elapsed,
      replyLength: reply.length,
    });

    return {
      reply,
      is_fallback: false,
      elapsed_ms : elapsed,
    };

  } catch (error) {
    const elapsed   = Date.now() - startMs;
    const errorType = classifyError(error);
    let replyText   = FALLBACKS[errorType] || fallback;

    // Personalize if we have the user's name
    if (userName && userName !== 'صديقي' && errorType !== 'KEY_MISSING') {
      replyText = replyText.replace(/🙏$/, '') + ` يا ${userName} 🙏`;
    }

    logger.error(`[SAFE-EXEC] ❌ AI call failed`, {
      context,
      userId,
      error_type : errorType,
      message    : error.message,
      elapsed_ms : elapsed,
    });

    return {
      reply      : replyText,
      is_fallback: true,
      error_type : errorType,
      error_msg  : error.message,
      elapsed_ms : elapsed,
    };
  }
}

// ─── Batch Executor ───────────────────────────────────────────────────────────
/**
 * Execute multiple AI calls safely in parallel.
 * Any failure returns a fallback — never throws.
 *
 * @param {Array<{key: string, fn: Function, fallback?: string}>} calls
 * @returns {Promise<Record<string, {reply, is_fallback}>>}
 */
async function safeAIBatch(calls, options = {}) {
  const results = await Promise.allSettled(
    calls.map(c => safeAIExecute(c.fn, { ...options, fallback: c.fallback }))
  );

  const output = {};
  calls.forEach((c, i) => {
    const r = results[i];
    output[c.key] = r.status === 'fulfilled'
      ? r.value
      : { reply: c.fallback || FALLBACK_DEFAULT, is_fallback: true };
  });
  return output;
}

// ─── JSON-Safe AI Execute ─────────────────────────────────────────────────────
/**
 * Like safeAIExecute but expects JSON response.
 * Automatically parses JSON with multiple fallback strategies.
 *
 * @returns {Promise<{data: object|null, is_fallback: boolean, raw: string}>}
 */
async function safeAIExecuteJSON(fn, fallbackData = null, options = {}) {
  const result = await safeAIExecute(fn, options);

  if (result.is_fallback) {
    return { data: fallbackData, is_fallback: true, raw: result.reply };
  }

  // Try to parse JSON
  const raw = result.reply;

  // Direct parse
  try { return { data: JSON.parse(raw), is_fallback: false, raw }; } catch (_) {}

  // Extract JSON block
  const match = raw.match(/\{[\s\S]*\}/);
  if (match) {
    try { return { data: JSON.parse(match[0]), is_fallback: false, raw }; } catch (_) {}
  }

  // Array block
  const arrMatch = raw.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return { data: JSON.parse(arrMatch[0]), is_fallback: false, raw }; } catch (_) {}
  }

  logger.warn('[SAFE-EXEC] Could not parse JSON from AI response', { raw: raw.slice(0, 100) });
  return { data: fallbackData, is_fallback: true, raw, error_type: 'PARSE_FAIL' };
}

module.exports = {
  safeAIExecute,
  safeAIBatch,
  safeAIExecuteJSON,
  classifyError,
  isValidReply,
  extractReply,
  FALLBACK_DEFAULT,
  FALLBACKS,
  AI_TIMEOUT_MS,
};
