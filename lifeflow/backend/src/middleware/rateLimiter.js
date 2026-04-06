/**
 * Rate Limiter Middleware — Enhanced with AI-specific tiers
 * ===========================================================
 * Protects API endpoints from abuse using express-rate-limit.
 *
 * Tiers:
 *   - authLimiter        : Strict — /auth endpoints (login, register, demo)
 *   - aiLimiter          : Medium — /assistant, /ai, /chat endpoints  
 *   - aiStrictLimiter    : Strict — Groq/Gemini direct calls (prevents 429)
 *   - writeLimiter       : Medium — POST/PUT/PATCH/DELETE on data endpoints
 *   - globalLimiter      : Lenient — fallback for all routes
 *   - searchLimiter      : Medium — /search endpoints
 *   - exportLimiter      : Strict — /export endpoints (expensive operations)
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
  
  const messages = {
    auth:        'لقد تجاوزت حد محاولات تسجيل الدخول. يرجى المحاولة بعد 15 دقيقة.',
    ai:          'لقد تجاوزت حد استخدام المساعد الذكي. يرجى المحاولة بعد دقيقة.',
    ai_strict:   'تم تجاوز حد طلبات الذكاء الاصطناعي. يرجى الانتظار 30 ثانية.',
    write:       'كثرة العمليات. يرجى الانتظار قليلاً.',
    search:      'كثرة عمليات البحث. يرجى الانتظار قليلاً.',
    export:      'يمكنك تصدير البيانات مرة كل 5 دقائق.',
    global:      'لقد تجاوزت الحد المسموح للطلبات. يرجى المحاولة لاحقاً.',
  };

  res.status(429).json({
    success:    false,
    errorCode:  'RATE_LIMIT_EXCEEDED',
    message:    messages[tier] || messages.global,
    retryAfter: res.getHeader('Retry-After'),
    tier,
  });
};

// ── Key extractor (prefer user ID, fallback to IP) ──────────────────────────
const keyGenerator = (req) => {
  return req.user?.id || req.ip;
};

// ── Auth Limiter (strict in production, relaxed in demo) ────────────────────
// Production: 15 requests per 15 minutes per IP — protects against brute-force
// Demo mode: 200 requests per 15 minutes — allows QA testing
const isDemoMode = global.__LIFEFLOW_DEMO_MODE || process.env.NODE_ENV !== 'production';
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      isDemoMode ? 200 : 15,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: createRateLimitHandler('auth'),
});

// ── AI/Assistant Limiter (medium) ───────────────────────────────────────────
// 30 requests per minute per user (reduced from 60 to prevent upstream 429s)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      30,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: createRateLimitHandler('ai'),
});

// ── AI Strict Limiter — for Groq/Gemini proxy endpoints ─────────────────────
// 10 requests per 30 seconds per user — prevents hitting Groq/Gemini 429 limits
const aiStrictLimiter = rateLimit({
  windowMs: 30 * 1000,
  max:      10,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: createRateLimitHandler('ai_strict'),
});

// ── Write Operations Limiter (medium) ───────────────────────────────────────
// 60 writes per minute per user — prevents mass create/update/delete
const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      60,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders:   false,
  skip: (req) => req.method === 'GET',
  handler: createRateLimitHandler('write'),
});

// ── Search Limiter ──────────────────────────────────────────────────────────
// 30 searches per minute per user
const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      30,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: createRateLimitHandler('search'),
});

// ── Export Limiter (strict) ─────────────────────────────────────────────────
// 3 exports per 5 minutes — expensive operations
const exportLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max:      3,
  keyGenerator,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: createRateLimitHandler('export'),
});

// ── Global Limiter (lenient) ────────────────────────────────────────────────
// 500 requests per minute per IP in demo, 200 in production — general DoS protection
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max:      isDemoMode ? 500 : 200,
  standardHeaders: true,
  legacyHeaders:   false,
  handler: createRateLimitHandler('global'),
});

module.exports = {
  authLimiter,
  aiLimiter,
  aiStrictLimiter,
  writeLimiter,
  searchLimiter,
  exportLimiter,
  globalLimiter,
};
