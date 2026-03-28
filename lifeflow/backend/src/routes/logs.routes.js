/**
 * Logs Routes — سجلات الأخطاء والأنشطة
 * =========================================
 * POST /api/v1/logs/client-error  — تسجيل خطأ من المتصفح
 * GET  /api/v1/logs/recent        — عرض آخر سجلات الـ API (للمطورين)
 * GET  /api/v1/logs/client-errors — عرض أخطاء العميل الأخيرة
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// In-memory circular buffer for client errors (max 100)
const clientErrors = [];
const MAX_CLIENT_ERRORS = 100;

/**
 * POST /logs/client-error
 * Receives a JS error from the browser and stores it
 */
router.post('/client-error', (req, res) => {
  const { message, stack, componentStack, url, timestamp } = req.body;
  const entry = {
    id: Date.now(),
    timestamp: timestamp || new Date().toISOString(),
    message: message || 'Unknown error',
    stack: stack?.slice(0, 500) || '',
    componentStack: componentStack?.slice(0, 500) || '',
    url: url || '',
    userAgent: req.headers['user-agent'] || '',
    ip: req.ip || '',
  };
  clientErrors.unshift(entry);
  if (clientErrors.length > MAX_CLIENT_ERRORS) clientErrors.length = MAX_CLIENT_ERRORS;
  logger.error(`[CLIENT-ERROR] ${entry.message} | url=${entry.url}`);
  res.json({ success: true });
});

/**
 * GET /logs/client-errors
 * Returns recent client-side errors for debugging
 */
router.get('/client-errors', protect, (req, res) => {
  res.json({ success: true, data: { errors: clientErrors.slice(0, 50), total: clientErrors.length } });
});

/**
 * GET /logs/recent
 * Returns last N lines from the backend log file
 */
router.get('/recent', protect, (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  try {
    // Try to read PM2 log or winston log
    const logPaths = [
      path.join(__dirname, '../../logs/combined.log'),
      path.join(process.env.HOME || '/home/user', '.pm2/logs/lifeflow-api-out.log'),
      path.join(process.env.HOME || '/home/user', '.pm2/logs/lifeflow-api-error.log'),
    ];

    let lines = [];
    for (const logPath of logPaths) {
      try {
        if (fs.existsSync(logPath)) {
          const content = fs.readFileSync(logPath, 'utf-8');
          const fileLines = content.split('\n').filter(Boolean).slice(-limit);
          lines = lines.concat(fileLines.map(l => ({ source: path.basename(logPath), line: l })));
        }
      } catch (_e) { logger.debug(`[LOGS_ROUTES] Non-critical operation failed: ${_e.message}`); }
    }

    // Sort by content (approximate time ordering)
    lines = lines.slice(-limit).reverse();

    res.json({
      success: true,
      data: {
        logs: lines,
        total: lines.length,
        timestamp: new Date().toISOString(),
      }
    });
  } catch (e) {
    res.json({ success: true, data: { logs: [], total: 0, error: e.message } });
  }
});

/**
 * GET /logs/health
 * Quick health check for logging system
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      client_errors: clientErrors.length,
      uptime_seconds: Math.floor(process.uptime()),
      memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      node_version: process.version,
    }
  });
});

module.exports = { router, clientErrors };
