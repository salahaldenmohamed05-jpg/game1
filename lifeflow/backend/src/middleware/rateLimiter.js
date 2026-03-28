/**
 * Rate Limiter Middleware — Phase A Stabilization
 * ==================================================
 * Protects API endpoints from abuse using express-rate-limit.
 *
 * Tiers:
 *   - authLimiter    : Strict — /auth endpoints (login, register, demo)
 *   - aiLimiter      : Medium — /assistant, /ai, /chat endpoints
 *   - writeLimiter   : Medium — POST/PUT/PATCH/DELETE on data endpoints
 *   - globalLimiter  : Lenient — fallback for all routes
 */

'use strict';

const rateLimit = require('express-rate-limit');
const logger    = require('../utils/logger');

// ── Shared error response ──────────────────────────────────────────────────
const createRateLimitHandler = (tier) => (req, res) => {
  logger.warn(`[RATE-LIMIT] ${tier} limit exceeded`, {
    tier,
    ip:     req.ip,
    url:    req.originalUrl,
    userId: req.user?.id || 'anonymous',
  });
  res.status(429).json({
    success:   false,
    errorCode: 'RATE_LIMIT_EXCEEDED',
    message:   'لقد تجاوزت الحد المسموح للطلبات. يرجى المحاولة لاحقاً.',
    retryAfter: res.getHeader('Retry-After'),
  });
};

// ── Key extractor (prefer user ID, fallback to IP) ──────────────────────────
const keyGenerator = (req) => {
  return req.user?.id || req.ip;
};

// ── Auth Limiter (strict) ───────────────────────────────────────────────────
// 15 requests per 15 minutes per IP — protects against brute-force
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  max:      15,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: createRateLimitHandler('auth'),
});

// ── AI/Assistant Limiter (medium) ───────────────────────────────────────────
// 60 requests per minute per user — protects AI API costs
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max:      60,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: createRateLimitHandler('ai'),
});

// ── Write Operations Limiter (medium) ───────────────────────────────────────
// 100 writes per minute per user — prevents mass create/update/delete
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max:      100,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders:   false,
  skip: (req) => req.method === 'GET',  // only limit writes
  handler: createRateLimitHandler('write'),
});

// ── Global Limiter (lenient) ────────────────────────────────────────────────
// 300 requests per minute per IP — general DoS protection
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max:      300,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: createRateLimitHandler('global'),
});

module.exports = {
  authLimiter,
  aiLimiter,
  writeLimiter,
  globalLimiter,
};
