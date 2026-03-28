/**
 * Error Handler Utility — Phase A Stabilization
 * ================================================
 * Central error handling for the entire application.
 *
 * Provides:
 *   1. asyncHandler  — wraps Express route handlers, catches promise rejections
 *   2. safeService   — wraps async service calls with logging (replaces empty catches)
 *   3. AppError      — custom error class with status codes
 *   4. handleError   — global Express error middleware
 *   5. safeRequire   — safe module require with logging (replaces try/catch(_){})
 */

'use strict';

const logger = require('./logger');

// ─── Custom Error Class ──────────────────────────────────────────────────────
class AppError extends Error {
  constructor(message, statusCode = 500, errorCode = 'INTERNAL_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.errorCode  = errorCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── Async Route Handler Wrapper ─────────────────────────────────────────────
// Wraps an async Express handler so any thrown or rejected error is passed to next()
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ─── Safe Service Call Wrapper ───────────────────────────────────────────────
// Replaces empty catch blocks in services.
// Logs the error with context, returns fallback value.
//
// Usage:
//   const result = await safeService('buildProfile', () => buildProfile(userId), {});
//
function safeService(label, asyncFn, fallback = null) {
  return Promise.resolve()
    .then(() => asyncFn())
    .catch((err) => {
      logger.warn(`[SAFE-SERVICE] ${label} failed: ${err.message}`, {
        service: label,
        error: err.message,
        stack: err.stack?.split('\n').slice(0, 3).join(' | '),
      });
      return fallback;
    });
}

// ─── Safe Require ────────────────────────────────────────────────────────────
// Replaces: try { return require(...) } catch(_) { return null; }
// Logs a debug message on failure instead of silently swallowing.
//
// Usage:
//   const orchestrator = safeRequire('../services/orchestrator.service', 'orchestrator');
//
function safeRequire(modulePath, label = '') {
  try {
    return require(modulePath);
  } catch (err) {
    logger.debug(`[SAFE-REQUIRE] ${label || modulePath} not available: ${err.message}`);
    return null;
  }
}

// ─── Safe Model Loader ──────────────────────────────────────────────────────
// Loads a Sequelize model safely, logging on failure.
// Handles modules that export { Model } vs plain Model.
//
// Usage:
//   const models = {};
//   safeModelLoad(models, 'Task', '../models/task.model');
//   safeModelLoad(models, 'Habit', '../models/habit.model', 'Habit'); // destructured
//
function safeModelLoad(target, key, modulePath, namedExport = null) {
  try {
    const mod = require(modulePath);
    target[key] = namedExport ? mod[namedExport] : mod;
  } catch (err) {
    logger.debug(`[SAFE-MODEL] ${key} model not loaded: ${err.message}`);
  }
}

// ─── Global Express Error Middleware ─────────────────────────────────────────
function handleError(err, req, res, _next) {
  // Determine status
  const statusCode = err.statusCode || err.status || 500;
  const errorCode  = err.errorCode  || 'INTERNAL_ERROR';

  // Always log the full error
  const logEntry = {
    errorCode,
    statusCode,
    message: err.message,
    url:     req.originalUrl,
    method:  req.method,
    userId:  req.user?.id || 'anonymous',
    ip:      req.ip,
  };

  if (statusCode >= 500) {
    logger.error('[ERROR-HANDLER] Server error', { ...logEntry, stack: err.stack });
  } else {
    logger.warn('[ERROR-HANDLER] Client error', logEntry);
  }

  // Send structured response
  res.status(statusCode).json({
    success:   false,
    errorCode,
    message:   err.isOperational
      ? err.message
      : 'حدث خطأ في الخادم، يرجى المحاولة لاحقاً',
    ...(process.env.NODE_ENV === 'development' && {
      stack:    err.stack,
      original: err.message,
    }),
  });
}

// ─── Unhandled Rejection / Exception Handlers ────────────────────────────────
function registerProcessHandlers() {
  process.on('uncaughtException', (err) => {
    logger.error('[FATAL] Uncaught Exception:', {
      message: err.message,
      stack: err.stack,
    });
    // Give logger time to flush
    setTimeout(() => process.exit(1), 1000);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('[FATAL] Unhandled Promise Rejection:', {
      message: reason?.message || String(reason),
      stack: reason?.stack,
    });
  });
}

module.exports = {
  AppError,
  asyncHandler,
  safeService,
  safeRequire,
  safeModelLoad,
  handleError,
  registerProcessHandlers,
};
