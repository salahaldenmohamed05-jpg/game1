/**
 * Redis Configuration
 * ====================
 * إعداد Redis للتخزين المؤقت والإشعارات الفورية
 */

const logger = require('../utils/logger');

let redisClient = null;
const inMemoryCache = new Map();

async function setupRedis() {
  try {
    const { createClient } = require('redis');
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 3) return false; // Stop retrying after 3 attempts
          return Math.min(retries * 100, 3000);
        },
      },
    });

    redisClient.on('error', () => {}); // Silent - we handle gracefully
    redisClient.on('connect', () => logger.info('✅ Redis connected'));

    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.warn('Redis unavailable, using in-memory cache');
    redisClient = null;
    throw error;
  }
}

/**
 * Get value from cache (Redis or in-memory fallback)
 */
async function getCache(key) {
  try {
    if (redisClient) {
      const val = await redisClient.get(key);
      return val ? JSON.parse(val) : null;
    }
    return inMemoryCache.get(key) || null;
  } catch {
    return null;
  }
}

/**
 * Set value in cache with TTL (seconds)
 */
async function setCache(key, value, ttlSeconds = 300) {
  try {
    if (redisClient) {
      await redisClient.setEx(key, ttlSeconds, JSON.stringify(value));
    } else {
      inMemoryCache.set(key, value);
      setTimeout(() => inMemoryCache.delete(key), ttlSeconds * 1000);
    }
  } catch (err) {
    logger.error('Cache set error:', err);
  }
}

/**
 * Delete cache key
 */
async function deleteCache(key) {
  try {
    if (redisClient) {
      await redisClient.del(key);
    } else {
      inMemoryCache.delete(key);
    }
  } catch (err) {
    logger.error('Cache delete error:', err);
  }
}

module.exports = { setupRedis, getCache, setCache, deleteCache };
