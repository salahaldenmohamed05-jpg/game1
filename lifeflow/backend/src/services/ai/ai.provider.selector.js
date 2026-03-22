/**
 * AI Provider Selector
 * =====================
 * Tests Gemini and Groq latency at startup, picks the fastest,
 * and auto-falls back to the other on runtime failure.
 *
 * Usage:
 *   const { getProvider, getStatus } = require('./ai.provider.selector');
 *   const provider = getProvider();   // 'gemini' | 'groq' | null
 */

'use strict';

const logger = require('../../utils/logger');
const { measureLatency, sendPrompt } = require('./ai.client');

// ─── State ────────────────────────────────────────────────────────────────────
let activeProvider   = null;   // 'gemini' | 'groq' | null
let fallbackProvider = null;   // the other one
let selectorReady    = false;
let lastCheck        = null;

const PROVIDERS = ['gemini', 'groq'];

// ─── Key availability checks ─────────────────────────────────────────────────
function isKeySet(provider) {
  if (provider === 'gemini') {
    const k = process.env.GEMINI_API_KEY;
    return k && k !== 'your-gemini-key' && k.length > 10;
  }
  if (provider === 'groq') {
    const k = process.env.GROQ_API_KEY;
    return k && k !== 'your-groq-key' && k.length > 10;
  }
  return false;
}

// ─── Latency race ─────────────────────────────────────────────────────────────
async function selectBestProvider() {
  const available = PROVIDERS.filter(isKeySet);

  if (available.length === 0) {
    logger.warn('[AI-SELECTOR] No valid API keys found — AI layer in fallback mode');
    activeProvider   = null;
    fallbackProvider = null;
    selectorReady    = true;
    lastCheck        = new Date().toISOString();
    return;
  }

  if (available.length === 1) {
    activeProvider   = available[0];
    fallbackProvider = null;
    selectorReady    = true;
    lastCheck        = new Date().toISOString();
    logger.info(`[AI-SELECTOR] Single provider available: ${activeProvider}`);
    return;
  }

  // Both keys present — race latency
  logger.info('[AI-SELECTOR] Testing latency for both providers…');
  const results = await Promise.all(
    available.map(async (p) => ({ provider: p, ms: await measureLatency(p) }))
  );

  results.sort((a, b) => a.ms - b.ms);
  logger.info('[AI-SELECTOR] Latency results:', results);

  const winner = results[0];
  const loser  = results[1];

  if (winner.ms === Infinity) {
    // Both failed
    activeProvider   = null;
    fallbackProvider = null;
    logger.warn('[AI-SELECTOR] Both providers unreachable — fallback mode');
  } else if (loser.ms === Infinity) {
    activeProvider   = winner.provider;
    fallbackProvider = null;
    logger.info(`[AI-SELECTOR] Only ${activeProvider} reachable`);
  } else {
    activeProvider   = winner.provider;
    fallbackProvider = loser.provider;
    logger.info(`[AI-SELECTOR] Active: ${activeProvider} (${winner.ms}ms), Fallback: ${fallbackProvider} (${loser.ms}ms)`);
  }

  selectorReady = true;
  lastCheck     = new Date().toISOString();
}

// Re-test every 30 minutes
setInterval(selectBestProvider, 30 * 60 * 1000);

// Run after a 2-second delay so dotenv.config({override:true}) finishes first
setTimeout(() => {
  selectBestProvider().catch((e) => logger.error('[AI-SELECTOR] Init error:', e.message));
}, 2000);

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the currently active provider name or null.
 */
function getProvider() {
  return activeProvider;
}

/**
 * Returns status object for /ai/status endpoint.
 */
function getStatus() {
  return {
    status   : activeProvider ? 'online' : 'unavailable',
    provider : activeProvider || 'none',
    fallback : fallbackProvider || 'none',
    ready    : selectorReady,
    lastCheck,
    keys     : {
      gemini : isKeySet('gemini'),
      groq   : isKeySet('groq'),
    },
  };
}

/**
 * sendWithFallback(systemPrompt, userPrompt, opts)
 * Tries active provider first; if it fails, tries fallback.
 * Returns { result, provider } or throws if both fail.
 */
async function sendWithFallback(systemPrompt, userPrompt, opts = {}) {
  if (!activeProvider) throw new Error('NO_PROVIDER');

  const providers = [activeProvider];
  if (fallbackProvider) providers.push(fallbackProvider);

  let lastError;
  for (const p of providers) {
    try {
      const result = await sendPrompt(p, systemPrompt, userPrompt, opts);
      return { result, provider: p };
    } catch (err) {
      logger.warn(`[AI-SELECTOR] Provider ${p} failed: ${err.message}`);
      lastError = err;
    }
  }
  throw lastError || new Error('ALL_PROVIDERS_FAILED');
}

module.exports = { getProvider, getStatus, sendWithFallback, selectBestProvider };
