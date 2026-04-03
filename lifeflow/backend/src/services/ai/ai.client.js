/**
 * AI Client — Centralized LLM Communication Layer (v3)
 * ======================================================
 * Handles all outbound requests to Gemini and Groq APIs.
 * Features:
 *   - API key validation at call time (never stale)
 *   - 15-second timeout per request
 *   - Full debug logging: request payload, response, errors
 *   - Safe response parsing: response?.choices?.[0]?.message?.content
 *   - Multi-model Groq fallback: llama-3.3-70b → llama-3.1-8b-instant → gemma2-9b-it
 *   - Rate-limit resilience: retries with faster models before giving up
 *   - Provider retry order: Gemini → Groq (3 models) → intelligent local fallback
 *   - 10-minute in-memory cache (via ai.cache.js)
 *   - Prompt sanitization (PII removal)
 *   - Throws on ALL-PROVIDERS-FAILED so callers can detect and handle
 */

'use strict';

const https  = require('https');
const http   = require('http');
const logger = require('../../utils/logger');
const cache  = require('./ai.cache');
const { DEFAULT_FALLBACK, validateResponse, safeParseJSON, sanitizeAIText, sanitizeAIResponse } = require('./ai.error.handler');

// ─── Constants ────────────────────────────────────────────────────────────────
const REQUEST_TIMEOUT_MS = 15_000;  // 15 seconds hard limit
const GEMINI_BASE        = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_BASE          = 'https://api.groq.com/openai/v1/chat/completions';

// Groq model fallback chain — sorted by speed (fastest last to use as last resort)
// llama-3.1-8b-instant has much higher rate limits than llama-3.3-70b
const GROQ_MODEL_CHAIN = [
  'llama-3.3-70b-versatile',   // best quality
  'llama-3.1-8b-instant',      // faster, higher rate limits
  'gemma2-9b-it',              // smallest, rarely rate limited
];

// ─── AI Status Tracking ─────────────────────────────────────────────────────
const _aiStatus = {
  gemini:  { available: false, lastError: null, lastErrorTime: null, successCount: 0, failCount: 0 },
  groq:    { available: false, lastError: null, lastErrorTime: null, successCount: 0, failCount: 0 },
  lastCall: null,
  lastFailureReport: null,
  totalCalls: 0,
  totalFailures: 0,
};

function recordSuccess(provider) {
  _aiStatus[provider].available = true;
  _aiStatus[provider].successCount++;
  _aiStatus[provider].lastError = null;
  _aiStatus.lastCall = new Date().toISOString();
  _aiStatus.totalCalls++;
}

function recordFailure(provider, error) {
  _aiStatus[provider].failCount++;
  _aiStatus[provider].lastError = error;
  _aiStatus[provider].lastErrorTime = new Date().toISOString();
  _aiStatus.lastCall = new Date().toISOString();
  _aiStatus.totalCalls++;
  _aiStatus.totalFailures++;
  if (error.includes('KEY_MISSING')) _aiStatus[provider].available = false;

  // Classify error type for observability
  let errorCategory = 'unknown';
  if (error.includes('KEY_MISSING') || error.includes('NO_API_KEYS')) errorCategory = 'missing_api_key';
  else if (error.includes('RATE_LIMIT') || error.includes('429')) errorCategory = 'rate_limit';
  else if (error.includes('TIMEOUT') || error.includes('timeout')) errorCategory = 'timeout';
  else if (error.includes('PARSE_FAIL')) errorCategory = 'parse_failure';
  else if (error.includes('HTTP')) errorCategory = 'http_error';

  logger.warn(`[AI-STATUS] Provider ${provider} failure`, {
    provider,
    errorCategory,
    error,
    successCount: _aiStatus[provider].successCount,
    failCount: _aiStatus[provider].failCount,
  });
}

function getAIStatus() {
  const geminiKey = getGeminiKey();
  const groqKey = getGroqKey();
  return {
    gemini: { keyPresent: !!geminiKey, ..._aiStatus.gemini },
    groq:   { keyPresent: !!groqKey,   ..._aiStatus.groq },
    lastCall: _aiStatus.lastCall,
    healthy: !!geminiKey || !!groqKey,
    totalCalls: _aiStatus.totalCalls,
    totalFailures: _aiStatus.totalFailures,
    failureRate: _aiStatus.totalCalls > 0
      ? parseFloat((_aiStatus.totalFailures / _aiStatus.totalCalls * 100).toFixed(1))
      : 0,
    lastFailureReport: _aiStatus.lastFailureReport,
    keySummary: {
      gemini: geminiKey ? 'configured' : 'MISSING',
      groq: groqKey ? 'configured' : 'MISSING',
      anyAvailable: !!(geminiKey || groqKey),
    },
  };
}

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
// Arabic enforcement suffix appended to system prompts
// Enforces: Arabic-only output, natural conversational tone, no CJK characters
const ARABIC_ENFORCEMENT = `

هام جداً:
١. أجب فقط باللغة العربية. لا تستخدم أي لغة أخرى. لا تكتب أحرفاً صينية أو يابانية أو كورية.
٢. استخدم أسلوباً طبيعياً في الكلام كأنك تتحدث مع صديق. لا تكن رسمياً أكثر من اللازم.
٣. استخدم جمل قصيرة وواضحة. تجنب الجمل الطويلة المعقدة.
٤. يمكنك استخدام العامية المصرية الخفيفة أحياناً لتكون أكثر قرباً (مثل: "يلا نبدأ"، "تمام"، "أيوه").
٥. أضف التشكيل على الكلمات المهمة عند الإمكان لتسهيل القراءة الصوتية.
٦. استخدم فقط الحروف العربية والأرقام وعلامات الترقيم العربية (، ؟ !) والإيموجي.`;

function sanitizePrompt(text, isSystem = false) {
  if (typeof text !== 'string') return '';
  let cleaned = text
    .replace(/\b[\w.+-]+@[\w-]+\.[a-z]{2,}\b/gi, '[EMAIL]')
    .replace(/\b\d{10,}\b/g, '[NUMBER]')
    .replace(/\s{3,}/g, '  ')
    .trim()
    .slice(0, 4000);
  // Enforce Arabic on system prompts
  if (isSystem && !cleaned.includes('أجب فقط باللغة العربية')) {
    cleaned += ARABIC_ENFORCEMENT;
  }
  return cleaned;
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
  const cleanSys  = sanitizePrompt(systemPrompt, true);
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
    return sanitizeAIResponse(safeParseJSON(text) || { raw: text });
  }
  return sanitizeAIText(text);
}

// ─── Groq Client (single model) ──────────────────────────────────────────────
async function callGroqModel(apiKey, model, systemPrompt, userPrompt, opts = {}) {
  const cleanSys  = sanitizePrompt(systemPrompt, true);
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
    logger.warn(`[AI-CLIENT] Groq rate limit (429) for model: ${model}`);
    throw new Error('RATE_LIMIT');
  }
  if (statusCode !== 200) {
    logger.error('[AI-CLIENT] Groq error', { statusCode, model, body: raw.slice(0, 300) });
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
    return sanitizeAIResponse(safeParseJSON(content) || { raw: content });
  }
  return sanitizeAIText(content);
}

// ─── Groq Client with Multi-Model Fallback ───────────────────────────────────
async function callGroq(systemPrompt, userPrompt, opts = {}) {
  const apiKey = getGroqKey();
  if (!apiKey) throw new Error('GROQ_KEY_MISSING');

  // Use explicitly requested model, or try the full model chain
  if (opts.model) {
    return callGroqModel(apiKey, opts.model, systemPrompt, userPrompt, opts);
  }

  // Try each model in the chain
  const preferredModel = process.env.OPENAI_MODEL || GROQ_MODEL_CHAIN[0];
  const modelChain = [
    preferredModel,
    ...GROQ_MODEL_CHAIN.filter(m => m !== preferredModel),
  ];

  let lastError;
  for (const model of modelChain) {
    try {
      const result = await callGroqModel(apiKey, model, systemPrompt, userPrompt, opts);
      if (model !== modelChain[0]) {
        logger.info(`[AI-CLIENT] Groq fallback model succeeded: ${model}`);
      }
      return result;
    } catch (err) {
      logger.warn(`[AI-CLIENT] Groq model ${model} failed: ${err.message}`);
      lastError = err;
      // Only retry on rate limit — other errors don't benefit from different model
      if (!err.message.includes('RATE_LIMIT') && !err.message.includes('429')) {
        throw err;
      }
      // Brief pause before trying next model
      await new Promise(r => setTimeout(r, 200));
    }
  }

  throw lastError || new Error('GROQ_ALL_MODELS_FAILED');
}

// ─── Intelligent Local Fallback ───────────────────────────────────────────────
// When ALL providers fail (rate limit, etc.), generate a meaningful response
// based on user's message intent instead of a generic error message.
// opts can include: intentCategory, mode, userName, tasks
function buildIntelligentFallback(userPrompt, opts = {}) {
  if (!userPrompt || typeof userPrompt !== 'string') return DEFAULT_FALLBACK;

  const msg    = userPrompt.toLowerCase();
  const intent = opts.intentCategory || '';
  const mode   = opts.mode || '';
  const name   = opts.userName ? opts.userName.split(' ')[0] : 'صديقي';
  const tasks  = Array.isArray(opts.tasks) ? opts.tasks : [];
  const hasTasks = tasks.length > 0;

  // Detect English
  const isEnglish = /^[a-zA-Z0-9\s.,!?'"@#$%&*()\-+=:;/\\<>{}[\]|~`]+$/.test(userPrompt.trim());

  if (isEnglish) {
    const eName = opts.userName ? opts.userName.split(' ')[0] : 'friend';
    if (intent === 'task_action' || msg.includes('task') || msg.includes('start') || msg.includes('priority')) {
      if (hasTasks) return `${eName}, your top priority right now is "${tasks[0].title}". Start with that and we'll handle the rest.`;
      return `${eName}, I don't see any tasks logged. Tell me what you need to do and we'll organize it.`;
    }
    if (mode === 'companion' || msg.includes('tired') || msg.includes('stressed') || msg.includes('sad')) {
      return `${eName}, it's okay to feel tired — take a 5 minute break, drink some water, and we'll start with something light 💙`;
    }
    if (msg.includes('plan') || msg.includes('schedule') || msg.includes('organize')) {
      if (hasTasks) return `${eName}, let's organize your day — you have ${tasks.length} tasks. Start with "${tasks[0].title}" while your energy is high.`;
      return `${eName}, let's plan your day. Tell me what tasks you have and I'll prioritize them.`;
    }
    if (msg.includes('mood') || msg.includes('feeling') || msg.includes('status') || msg.includes('how am i')) {
      return `${eName}, how are you really doing? Rate your energy 1-10 and tell me how you feel, and I'll help you better.`;
    }
    return `${eName}, what do you need — tasks, planning, advice, or just a chat? I'm here 👋`;
  }

  // Task/priority management
  if (
    intent === 'task_action' ||
    msg.includes('مهمة') || msg.includes('مهام') ||
    msg.includes('ترتيب') || msg.includes('أبدأ') || msg.includes('ابدأ') ||
    msg.includes('أولوية')
  ) {
    if (hasTasks) {
      return `${name}، أهم حاجة دلوقتي هي "${tasks[0].title}". ابدأ فيها وبعدين نشوف الباقي.`;
    }
    return `${name}، مش شايف مهام مسجّلة عندك. قولّي إيه اللي محتاج تعمله وهنرتبه مع بعض.`;
  }

  // Fatigue/emotional support
  if (
    mode === 'companion' ||
    intent === 'advice' ||
    msg.includes('تعبان') || msg.includes('تعب') ||
    msg.includes('مش قادر') || msg.includes('مرهق') ||
    msg.includes('ضغط') || msg.includes('توتر') ||
    msg.includes('حزين') || msg.includes('زهقت')
  ) {
    return `${name}، عادي تتعب — ده مش ضعف. اشرب مية، خد 5 دقايق راحة، وبعدين نشوف مهمة واحدة بس خفيفة نبدأ بيها 💙`;
  }

  // Planning/organizing the day
  if (
    msg.includes('رتب يومي') || msg.includes('نظم يومي') ||
    msg.includes('خطة') || msg.includes('جدول') ||
    msg.includes('plan') || msg.includes('schedule')
  ) {
    if (hasTasks) {
      return `${name}، يلا ننظم يومك — عندك ${tasks.length} مهمة. الأهم: "${tasks[0].title}". ابدأ بيها الصبح وطاقتك عالية.`;
    }
    return `${name}، يلا ننظم يومك. قولّي إيه المهام اللي عندك وهرتبهملك حسب الأولوية.`;
  }

  // Questions about mood/feelings/status
  if (
    msg.includes('حالي') || msg.includes('مزاج') ||
    msg.includes('شعور') || msg.includes('احساس') ||
    msg.includes('وضعي') || msg.includes('إزيك') || msg.includes('ازيك')
  ) {
    return `${name}، إزيك فعلاً؟ قولّي طاقتك كام من 10 ومزاجك عامل إزاي، وهقدر أساعدك أحسن.`;
  }

  // Generic
  return `${name}، قولّي إيه اللي محتاجه — مهام، تنظيم، نصيحة، أو حتى مجرد كلام. أنا معاك 👋`;
}

// ─── Unified Send with Provider Retry: Gemini → Groq → Intelligent Fallback ──
/**
 * sendPrompt(provider, systemPrompt, userPrompt, opts)
 *
 * Retry order:
 *   1. Requested provider
 *   2. Other provider (auto-fallback)
 *   3. Intelligent context-aware local response (not generic error)
 *
 * IMPORTANT: When all providers fail due to rate limit, throws RATE_LIMIT_ALL
 * error so the caller can mark is_fallback = true properly.
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
  let allRateLimited = true;

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

      recordSuccess(p);
      logger.info(`[AI-CLIENT] Success with provider: ${p}`);
      return validated;

    } catch (err) {
      recordFailure(p, err.message);
      logger.warn(`[AI-CLIENT] Provider ${p} failed: ${err.message}`);
      lastError = err;

      // Track if this is a non-rate-limit error
      if (!err.message.includes('RATE_LIMIT') && !err.message.includes('429')) {
        allRateLimited = false;
      }
    }
  }

  // All providers failed — STRUCTURED FAILURE REPORT
  const errorType = allRateLimited ? 'RATE_LIMIT_ALL' : 'ALL_PROVIDERS_FAILED';
  const failureReport = {
    errorType,
    providers_tried: providerOrder,
    lastError: lastError?.message,
    gemini_key_present: !!getGeminiKey(),
    groq_key_present: !!getGroqKey(),
    fallback_used: true,
    timestamp: new Date().toISOString(),
    promptPreview: (userPrompt || '').slice(0, 80),
  };
  _aiStatus.lastFailureReport = failureReport;
  logger.error(`[AI-CLIENT] ⚠️ ALL PROVIDERS FAILED`, failureReport);

  // For JSON mode, return a structured fallback but mark it
  if (opts.jsonMode) {
    return { reply: DEFAULT_FALLBACK, is_fallback: true, _rate_limited: true };
  }

  // Throw so the caller (safeExecute / orchestrator) can properly set is_fallback = true
  // and use intelligent fallback logic
  throw new Error(errorType);
}

// ─── Simple Chat Function (string in → string out) ────────────────────────────
/**
 * chat(systemPrompt, userMessage, opts) → string
 * Convenience wrapper used by most services.
 * Always returns a non-empty string.
 *
 * IMPORTANT: When all providers fail (rate limit), throws RATE_LIMIT_ALL error
 * so callers (safeExecute, orchestrator) can properly set is_fallback = true.
 * This prevents silently returning a generic error as if it were a real AI response.
 */
async function chat(systemPrompt, userMessage, opts = {}) {
  const geminiKey = getGeminiKey();
  const groqKey   = getGroqKey();

  // Determine starting provider (prefer Groq — faster & cheaper)
  const provider = groqKey ? 'groq' : geminiKey ? 'gemini' : null;

  if (!provider) {
    logger.error('[AI-CLIENT] 🔴 NO VALID API KEYS — All AI features disabled', {
      gemini_key_present: !!geminiKey,
      groq_key_present: !!groqKey,
      env_keys_checked: ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY'],
      timestamp: new Date().toISOString(),
    });
    throw new Error('NO_API_KEYS');
  }

  // Will throw RATE_LIMIT_ALL or ALL_PROVIDERS_FAILED if everything fails
  const result = await sendPrompt(provider, systemPrompt, userMessage, opts);

  // Ensure always string
  if (typeof result === 'string') return result;
  if (result?.reply && !result?.is_fallback) return result.reply;
  if (result?.raw)   return result.raw;

  // Should not reach here normally
  throw new Error('ALL_PROVIDERS_FAILED');
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
      await callGroqModel(getGroqKey(), GROQ_MODEL_CHAIN[0], sys, user, { maxTokens: 20, temperature: 0, jsonMode: true });
    }
    return Date.now() - start;
  } catch (err) {
    logger.debug(`[AI-CLIENT] Latency probe failed for ${provider}: ${err.message}`);
    return Infinity;
  }
}

// ─── Startup Key Validation ──────────────────────────────────────────────────
// Log API key availability once on module load for immediate visibility
(function startupCheck() {
  const gemini = !!getGeminiKey();
  const groq   = !!getGroqKey();
  if (!gemini && !groq) {
    logger.error('[AI-CLIENT] 🔴 STARTUP: No valid AI API keys found. AI features will be unavailable.', {
      checked: ['GEMINI_API_KEY', 'GROQ_API_KEY', 'OPENAI_API_KEY'],
    });
  } else {
    logger.info('[AI-CLIENT] ✅ STARTUP: AI keys validated', {
      gemini: gemini ? 'OK' : 'MISSING',
      groq: groq ? 'OK' : 'MISSING',
    });
  }
})();

module.exports = {
  sendPrompt,
  chat,
  measureLatency,
  callGemini,
  callGroq,
  isValidKey,
  getGeminiKey,
  getGroqKey,
  getAIStatus,
  buildIntelligentFallback,
  GROQ_MODEL_CHAIN,
};
