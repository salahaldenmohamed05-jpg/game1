/**
 * Redis Configuration — Enhanced with LRU fallback
 * ==================================================
 * - Auto-connects to Redis if REDIS_URL is set
 * - Falls back to in-memory LRU cache with size limits
 * - Supports pattern deletion for cache invalidation
 * - Cache statistics for monitoring
 */

const logger = require('../utils/logger');

let redisClient = null;
let isRedisConnected = false;

// ── Enhanced In-Memory LRU Cache ──────────────────────────────────────
const MAX_CACHE_SIZE = 5000;
const inMemoryCache = new Map();
const cacheTTLs = new Map(); // key → expiry timestamp
let cacheHits = 0;
let cacheMisses = 0;

function evictExpired() {
  const now = Date.now();
  for (const [key, expiry] of cacheTTLs) {
    if (expiry <= now) {
      inMemoryCache.delete(key);
      cacheTTLs.delete(key);
    }
  }
}

function evictLRU() {
  // Remove oldest entries if cache exceeds max size
  if (inMemoryCache.size > MAX_CACHE_SIZE) {
    const keysToRemove = inMemoryCache.size - MAX_CACHE_SIZE + 100; // remove 100 extra
    let removed = 0;
    for (const key of inMemoryCache.keys()) {
      if (removed >= keysToRemove) break;
      inMemoryCache.delete(key);
      cacheTTLs.delete(key);
      removed++;
    }
  }
}

// Periodic cleanup every 60 seconds
setInterval(() => {
  evictExpired();
  evictLRU();
}, 60000);

// ── Redis Setup ──────────────────────────────────────────────────────
async function setupRedis() {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    logger.info('⚡ No REDIS_URL set — using enhanced in-memory LRU cache (max 5000 keys)');
    return null;
  }

  try {
    const { createClient } = require('redis');
    redisClient = createClient({
      url: redisUrl,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 5) {
            logger.warn('⚠️ Redis: max reconnection attempts reached, falling back to in-memory');
            isRedisConnected = false;
            return false;
          }
          return Math.min(retries * 200, 5000);
        },
        connectTimeout: 5000,
      },
    });

    redisClient.on('error', (err) => {
      if (isRedisConnected) {
        logger.warn('⚠️ Redis connection error:', err.message);
        isRedisConnected = false;
      }
    });

    redisClient.on('connect', () => {
      isRedisConnected = true;
      logger.info('✅ Redis connected');
    });

    redisClient.on('reconnecting', () => {
      logger.info('🔄 Redis reconnecting...');
    });

    await redisClient.connect();
    isRedisConnected = true;
    return redisClient;
  } catch (error) {
    logger.warn('⚠️ Redis unavailable, using enhanced in-memory LRU cache:', error.message);
    redisClient = null;
    isRedisConnected = false;
    // Don't throw — allow server to start without Redis
  }
}

/**
 * Get value from cache (Redis or in-memory fallback)
 */
async function getCache(key) {
  try {
    if (isRedisConnected && redisClient) {
      const val = await redisClient.get(key);
      if (val) {
        cacheHits++;
        return JSON.parse(val);
      }
      cacheMisses++;
      return null;
    }

    // In-memory fallback
    const ttl = cacheTTLs.get(key);
    if (ttl && ttl <= Date.now()) {
      inMemoryCache.delete(key);
      cacheTTLs.delete(key);
      cacheMisses++;
      return null;
    }

    const val = inMemoryCache.get(key);
    if (val !== undefined) {
      cacheHits++;
      // Move to end for LRU behavior
      inMemoryCache.delete(key);
      inMemoryCache.set(key, val);
      return val;
    }
    cacheMisses++;
    return null;
  } catch {
    cacheMisses++;
    return null;
  }
}

/**
 * Set value in cache with TTL (seconds)
 */
async function setCache(key, value, ttlSeconds = 300) {
  try {
    if (isRedisConnected && redisClient) {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
    } else {
      evictLRU(); // Ensure space
      inMemoryCache.set(key, value);
      cacheTTLs.set(key, Date.now() + (ttlSeconds * 1000));
    }
  } catch (err) {
    // Fallback to in-memory on Redis error
    inMemoryCache.set(key, value);
    cacheTTLs.set(key, Date.now() + (ttlSeconds * 1000));
  }
}

/**
 * Delete cache key(s) — supports pattern with wildcard '*'
 */
async function deleteCache(key) {
  try {
    if (isRedisConnected && redisClient) {
      if (key.includes('*')) {
        // Pattern deletion
        const keys = await redisClient.keys(key);
        if (keys.length > 0) {
          await redisClient.del(keys);
        }
      } else {
        await redisClient.del(key);
      }
    } else {
      if (key.includes('*')) {
        const pattern = new RegExp('^' + key.replace(/\*/g, '.*') + '$');
        for (const k of inMemoryCache.keys()) {
          if (pattern.test(k)) {
            inMemoryCache.delete(k);
            cacheTTLs.delete(k);
          }
        }
      } else {
        inMemoryCache.delete(key);
        cacheTTLs.delete(key);
      }
    }
  } catch (err) {
    // Silent — cache deletion failure is non-critical
  }
}

/**
 * Cache statistics for monitoring
 */
function getCacheStats() {
  return {
    backend: isRedisConnected ? 'redis' : 'in-memory-lru',
    redis_connected: isRedisConnected,
    in_memory_size: inMemoryCache.size,
    max_size: MAX_CACHE_SIZE,
    hits: cacheHits,
    misses: cacheMisses,
    hit_rate: cacheHits + cacheMisses > 0
      ? ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(1) + '%'
      : 'N/A',
  };
}

/**
 * Cache middleware — caches GET request responses
 */
function cacheMiddleware(ttlSeconds = 120, keyPrefix = 'api') {
  return async (req, res, next) => {
    if (req.method !== 'GET') return next();

    const userId = req.user?.id || 'anon';
    const cacheKey = `${keyPrefix}:${userId}:${req.originalUrl}`;

    try {
      const cached = await getCache(cacheKey);
      if (cached) {
        res.setHeader('X-Cache', 'HIT');
        res.setHeader('X-Cache-Backend', isRedisConnected ? 'redis' : 'memory');
        return res.json(cached);
      }
    } catch {}

    // Monkey-patch res.json to cache response
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300 && body?.success !== false) {
        setCache(cacheKey, body, ttlSeconds).catch(() => {});
      }
      res.setHeader('X-Cache', 'MISS');
      return originalJson(body);
    };

    next();
  };
}

module.exports = { setupRedis, getCache, setCache, deleteCache, getCacheStats, cacheMiddleware };
