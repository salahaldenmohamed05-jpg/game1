/**
 * AI Cache — طبقة التخزين المؤقت
 * =================================
 * 10-minute in-memory response cache with LRU eviction.
 * Features:
 *  - Per-provider caching
 *  - TTL-based expiry (default: 10 min)
 *  - Max entries limit with LRU eviction
 *  - Cache statistics
 *  - Sensitive message bypass (no caching for personal data)
 */

'use strict';

const logger = require('../../utils/logger');

// ─── Config ───────────────────────────────────────────────────────────────────
const DEFAULT_TTL_MS = 10 * 60 * 1000;   // 10 minutes
const MAX_ENTRIES    = 200;               // max cached items
const PRUNE_INTERVAL = 5 * 60 * 1000;    // prune every 5 min

// ─── Internal Store ───────────────────────────────────────────────────────────
// Map: cacheKey → { value, expiresAt, accessCount, createdAt }
const store = new Map();

let stats = { hits: 0, misses: 0, sets: 0, evictions: 0 };

// ─── Pruning ──────────────────────────────────────────────────────────────────
function pruneExpired() {
  const now = Date.now();
  let pruned = 0;
  for (const [key, entry] of store.entries()) {
    if (now > entry.expiresAt) {
      store.delete(key);
      pruned++;
    }
  }
  if (pruned > 0) {
    logger.debug(`[AI-CACHE] Pruned ${pruned} expired entries. Size: ${store.size}`);
  }
}

setInterval(pruneExpired, PRUNE_INTERVAL);

// ─── LRU Eviction ────────────────────────────────────────────────────────────
function evictLRU() {
  // Find oldest accessed entry and remove it
  let oldestKey = null;
  let oldestTime = Infinity;

  for (const [key, entry] of store.entries()) {
    if (entry.lastAccessed < oldestTime) {
      oldestTime = entry.lastAccessed;
      oldestKey  = key;
    }
  }

  if (oldestKey) {
    store.delete(oldestKey);
    stats.evictions++;
    logger.debug('[AI-CACHE] LRU eviction performed');
  }
}

// ─── Cache Key Builder ────────────────────────────────────────────────────────
/**
 * Build a deterministic cache key from provider + prompts.
 * Truncates long prompts to avoid huge keys.
 */
function buildKey(provider, systemPrompt, userPrompt) {
  const sys  = (systemPrompt || '').slice(0, 120);
  const user = (userPrompt   || '').slice(0, 200);
  return `${provider}::${sys}::${user}`;
}

// ─── Should Bypass Cache ─────────────────────────────────────────────────────
/**
 * Some messages should never be cached (private context, time-sensitive).
 */
function shouldBypass(userPrompt = '') {
  const lower = userPrompt.toLowerCase();
  // Time-sensitive or personal: don't cache
  const bypass = [
    'الآن', 'اليوم', 'الساعة', 'حالاً', 'الآن',
    'مزاجي', 'طاقتي', 'energy', 'mood',
    'سجّل', 'احذف', 'أضف', 'ضيف', 'اعمل',
    'password', 'كلمة مرور',
  ];
  return bypass.some(w => lower.includes(w));
}

// ─── Public API ───────────────────────────────────────────────────────────────
function get(provider, systemPrompt, userPrompt) {
  const key   = buildKey(provider, systemPrompt, userPrompt);
  const entry = store.get(key);

  if (!entry) { stats.misses++; return null; }
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    stats.misses++;
    return null;
  }

  entry.accessCount++;
  entry.lastAccessed = Date.now();
  stats.hits++;
  logger.debug('[AI-CACHE] Cache HIT', { provider, key: key.slice(0, 60) });
  return entry.value;
}

function set(provider, systemPrompt, userPrompt, value, ttlMs = DEFAULT_TTL_MS) {
  if (shouldBypass(userPrompt)) {
    logger.debug('[AI-CACHE] Bypass for time-sensitive/personal prompt');
    return;
  }

  // Evict if at capacity
  if (store.size >= MAX_ENTRIES) evictLRU();

  const key = buildKey(provider, systemPrompt, userPrompt);
  store.set(key, {
    value,
    expiresAt   : Date.now() + ttlMs,
    createdAt   : Date.now(),
    lastAccessed: Date.now(),
    accessCount : 0,
  });
  stats.sets++;
  logger.debug('[AI-CACHE] Cache SET', { provider, key: key.slice(0, 60) });
}

function invalidate(provider, systemPrompt, userPrompt) {
  const key = buildKey(provider, systemPrompt, userPrompt);
  const deleted = store.delete(key);
  logger.debug('[AI-CACHE] Cache INVALIDATE', { deleted });
  return deleted;
}

function clear() {
  const size = store.size;
  store.clear();
  logger.info(`[AI-CACHE] Cache cleared (${size} entries removed)`);
}

function getStats() {
  const hitRate = stats.hits + stats.misses > 0
    ? ((stats.hits / (stats.hits + stats.misses)) * 100).toFixed(1)
    : 0;
  return {
    ...stats,
    current_size: store.size,
    max_entries : MAX_ENTRIES,
    hit_rate    : `${hitRate}%`,
    ttl_minutes : DEFAULT_TTL_MS / 60000,
  };
}

module.exports = { get, set, invalidate, clear, getStats, buildKey, shouldBypass };
