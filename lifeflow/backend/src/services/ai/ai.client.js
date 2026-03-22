/**
 * AI Client — Centralized LLM Communication Layer (v2)
 * ======================================================
 * Handles all outbound requests to Gemini and Groq APIs.
 * Features:
 *   - API key validation at call time (never stale)
 *   - 10-second timeout per request with AbortController
 *   - Full debug logging: request payload, response, errors
 *   - Safe response parsing: response?.choices?.[0]?.message?.content
 *   - Fallback reply: "حصل مشكلة مؤقتة، حاول تاني بعد شوية 🙏"
 *   - Provider retry order: Gemini → Groq → static fallback
 *   - 10-minute in-memory cache (via ai.cache.js)
 *   - Prompt sanitization (PII removal)
 */

'use strict';

const https  = require('https');
const http   = require('http');
const logger = require('../../utils/logger');
const cache  = require('./ai.cache');
const { DEFAULT_FALLBACK, validateResponse, safeParseJSON } = require('./ai.error.handler');

// ─── Constants ────────────────────────────────────────────────────────────────
const REQUEST_TIMEOUT_MS = 15_000;  // 15 seconds hard limit (Phase 0 fix)
const GEMINI_BASE        = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_BASE          = 'https://api.groq.com/openai/v1/chat/completions';

// ─── Key Validators ───────────────────────────────────────────────────────────
function isValidKey(key) {
  return key
    && typeof key === 'string'
    && key.length > 15
    && !key.startsWith('your-')
    && key !== 'demo-key'
    && key !== 'sk-placeholder';
}

function getGeminiKey() {
  const k = process.env.GEMINI_API_KEY;
  if (!isValidKey(k)) {
    logger.debug('[AI-CLIENT] GEMINI_API_KEY missing or invalid');
    return null;
  }
  return k;
}

function getGroqKey() {
  const k = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
  if (!isValidKey(k)) {
    logger.debug('[AI-CLIENT] GROQ_API_KEY missing or invalid');
    return null;
  }
  return k;
}

// ─── Prompt Sanitizer ────────────────────────────────────────────────────────
function sanitizePrompt(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b\d{10,}\b/g, '[NUMBER]')
    .replace(/\s{3,}/g, '  ')
    .trim()
    .slice(0, 4000);
}

// ─── HTTP POST with Timeout ───────────────────────────────────────────────────
function httpPost(urlStr, headers, bodyStr, timeoutMs = REQUEST_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const url    = new URL(urlStr);
    const lib    = url.protocol === 'https:' ? https : http;
    const options = {
      hostname: url.hostname,
      port    : url.port || (url.protocol === 'https:' ? 443 : 80),
      path    : url.pathname + url.search,
      method  : 'POST',
      headers : {
        'Content-Type'  : 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
        ...headers,
      },
    };

    logger.debug('[AI-CLIENT] HTTP POST', {
      host   : url.hostname,
      path   : url.pathname.slice(0, 60),
      bodyLen: bodyStr.length,
    });

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        logger.debug('[AI-CLIENT] HTTP Response', {
          status : res.statusCode,
          bodyLen: data.length,
        });
        resolve({ statusCode: res.statusCode, body: data });
      });
    });

    req.setTimeout(timeoutMs, () => {
      logger.warn('[AI-CLIENT] Request timeout after', timeoutMs, 'ms');
      req.destroy(new Error('AI_TIMEOUT'));
    });

    req.on('error', (err) => {
      logger.error('[AI-CLIENT] Request error:', err.message);
      reject(err);
    });

    req.write(bodyStr);
    req.end();
  });
}

// ─── Gemini Client ────────────────────────────────────────────────────────────
async function callGemini(systemPrompt, userPrompt, opts = {}) {
  const apiKey = getGeminiKey();
  if (!apiKey) throw new Error('GEMINI_KEY_MISSING');

  const model     = opts.model || process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url       = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
  const cleanSys  = sanitizePrompt(systemPrompt);
  const cleanUser = sanitizePrompt(userPrompt);
  const fullPrompt = `${cleanSys}\n\n${cleanUser}`;

  const payload = {
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: {
      temperature    : opts.temperature ?? 0.7,
      maxOutputTokens: opts.maxTokens   ?? 800,
    },
  };

  // Only request JSON mime type if json mode asked
  if (opts.jsonMode) {
    payload.generationConfig.responseMimeType = 'application/json';
  }

  const bodyStr = JSON.stringify(payload);
  logger.debug('[AI-CLIENT] Gemini request', { model, promptLen: fullPrompt.length, jsonMode: !!opts.jsonMode });

  const { statusCode, body: raw } = await httpPost(url, {}, bodyStr);

  if (statusCode === 429) {
    logger.warn('[AI-CLIENT] Gemini rate limit (429)');
    throw new Error('RATE_LIMIT');
  }
  if (statusCode === 400) {
    logger.warn('[AI-CLIENT] Gemini bad request (400):', raw.slice(0, 200));
    throw new Error(`Gemini HTTP 400`);
  }
  if (statusCode !== 200) {
    logger.error('[AI-CLIENT] Gemini error', { statusCode, body: raw.slice(0, 300) });
    throw new Error(`Gemini HTTP ${statusCode}`);
  }

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    logger.error('[AI-CLIENT] Gemini JSON parse error:', e.message);
    throw new Error('AI_PARSE_FAIL');
  }

  const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    logger.warn('[AI-CLIENT] Gemini empty text response', { raw: raw.slice(0, 200) });
    throw new Error('AI_PARSE_FAIL');
  }

  logger.debug('[AI-CLIENT] Gemini response OK', { chars: text.length });

  if (opts.jsonMode) {
    return safeParseJSON(text) || { raw: text };
  }
  return text;
}

// ─── Groq Client ─────────────────────────────────────────────────────────────
async function callGroq(systemPrompt, userPrompt, opts = {}) {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error('GROQ_KEY_MISSING');

  const model   = opts.model || process.env.OPENAI_MODEL || 'llama-3.3-70b-versatile';
  const cleanSys  = sanitizePrompt(systemPrompt);
  const cleanUser = sanitizePrompt(userPrompt);

  const payload = {
    model,
    messages: [
      { role: 'system', content: cleanSys  },
      { role: 'user',   content: cleanUser },
    ],
    temperature: opts.temperature ?? 0.7,
    max_tokens : opts.maxTokens   ?? 800,
  };

  // JSON mode: force json_object response format
  if (opts.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const bodyStr = JSON.stringify(payload);
  logger.debug('[AI-CLIENT] Groq request', { model, sysLen: cleanSys.length, userLen: cleanUser.length });

  const { statusCode, body: raw } = await httpPost(
    GROQ_BASE,
    { Authorization: `Bearer ${apiKey}` },
    bodyStr
  );

  if (statusCode === 429) {
    logger.warn('[AI-CLIENT] Groq rate limit (429)');
    throw new Error('RATE_LIMIT');
  }
  if (statusCode !== 200) {
    logger.error('[AI-CLIENT] Groq error', { statusCode, body: raw.slice(0, 300) });
    throw new Error(`Groq HTTP ${statusCode}`);
  }

  let parsed;
  try { parsed = JSON.parse(raw); }
  catch (e) {
    logger.error('[AI-CLIENT] Groq JSON parse error:', e.message);
    throw new Error('AI_PARSE_FAIL');
  }

  // Safe response parsing
  const content = parsed?.choices?.[0]?.message?.content;
  if (!content) {
    logger.warn('[AI-CLIENT] Groq empty content', { raw: raw.slice(0, 200) });
    throw new Error('AI_PARSE_FAIL');
  }

  logger.debug('[AI-CLIENT] Groq response OK', { chars: content.length, model });

  if (opts.jsonMode) {
    return safeParseJSON(content) || { raw: content };
  }
  return content;
}

// ─── Unified Send with Provider Retry: Gemini → Groq → Fallback ──────────────
/**
 * sendPrompt(provider, systemPrompt, userPrompt, opts)
 *
 * Retry order:
 *   1. Requested provider
 *   2. Other provider (auto-fallback)
 *   3. Static Arabic fallback string
 *
 * Always returns a string (never throws to caller).
 */
async function sendPrompt(provider, systemPrompt, userPrompt, opts = {}) {
  // Check cache first
  const cached = cache.get(provider, systemPrompt, userPrompt);
  if (cached !== null) {
    logger.debug('[AI-CLIENT] Cache hit, skipping API call');
    return cached;
  }

  const providerOrder = provider === 'gemini'
    ? ['gemini', 'groq']
    : ['groq', 'gemini'];

  let lastError;

  for (const p of providerOrder) {
    try {
      logger.debug(`[AI-CLIENT] Trying provider: ${p}`);
      let result;

      if (p === 'gemini') {
        result = await callGemini(systemPrompt, userPrompt, opts);
      } else {
        result = await callGroq(systemPrompt, userPrompt, opts);
      }

      // Validate result
      const validated = validateResponse(result, null);
      if (validated === null) {
        logger.warn(`[AI-CLIENT] Provider ${p} returned empty/invalid response`);
        continue;
      }

      // Cache successful result
      cache.set(p, systemPrompt, userPrompt, validated);

      logger.info(`[AI-CLIENT] Success with provider: ${p}`);
      return validated;

    } catch (err) {
      logger.warn(`[AI-CLIENT] Provider ${p} failed: ${err.message}`);
      lastError = err;
      // Continue to next provider
    }
  }

  // All providers failed — return static Arabic fallback
  logger.error('[AI-CLIENT] All providers failed, using static fallback', {
    lastError: lastError?.message,
  });

  // Return JSON fallback if json mode
  if (opts.jsonMode) {
    return { reply: DEFAULT_FALLBACK, is_fallback: true };
  }
  return DEFAULT_FALLBACK;
}

// ─── Simple Chat Function (string in → string out) ────────────────────────────
/**
 * chat(systemPrompt, userMessage, opts) → string
 * Convenience wrapper used by most services.
 * Always returns a non-empty string.
 */
async function chat(systemPrompt, userMessage, opts = {}) {
  const geminiKey = getGeminiKey();
  const groqKey   = getGroqKey();

  // Determine starting provider
  const provider = geminiKey ? 'gemini' : groqKey ? 'groq' : null;

  if (!provider) {
    logger.warn('[AI-CLIENT] No valid API keys — returning fallback');
    return DEFAULT_FALLBACK;
  }

  const result = await sendPrompt(provider, systemPrompt, userMessage, opts);

  // Ensure always string
  if (typeof result === 'string') return result;
  if (result?.reply) return result.reply;
  if (result?.raw)   return result.raw;
  return DEFAULT_FALLBACK;
}

// ─── Latency Probe ────────────────────────────────────────────────────────────
async function measureLatency(provider) {
  const start = Date.now();
  try {
    const sys  = 'Reply with JSON: {"ok":true}';
    const user = 'ping';
    if (provider === 'gemini') {
      await callGemini(sys, user, { maxTokens: 20, temperature: 0, jsonMode: true });
    } else {
      await callGroq(sys, user, { maxTokens: 20, temperature: 0, jsonMode: true });
    }
    return Date.now() - start;
  } catch {
    return Infinity;
  }
}

module.exports = {
  sendPrompt,
  chat,
  measureLatency,
  callGemini,
  callGroq,
  isValidKey,
  getGeminiKey,
  getGroqKey,
};
