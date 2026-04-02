/**
 * LifeFlow Backend - Main Entry Point
 * ====================================
 * مدخل رئيسي للـ Backend
 * يشغّل Express server مع كل الـ middleware والـ routes
 */

require('dotenv').config({ override: true }); // override any sandbox env vars with .env values
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const { Server } = require('socket.io');

// Import configurations
const { connectDB } = require('./config/database');
const { setupRedis } = require('./config/redis');
const logger = require('./utils/logger');
const { handleError, registerProcessHandlers } = require('./utils/errorHandler');
const { authLimiter, aiLimiter, aiStrictLimiter, writeLimiter, searchLimiter, exportLimiter, globalLimiter } = require('./middleware/rateLimiter');
const { cacheMiddleware, getCacheStats } = require('./config/redis');

// Register process-level error handlers (uncaughtException, unhandledRejection)
registerProcessHandlers();

// Import routes
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const taskRoutes = require('./routes/task.routes');
const habitRoutes = require('./routes/habit.routes');
const moodRoutes = require('./routes/mood.routes');
const insightRoutes = require('./routes/insight.routes');
const notificationRoutes = require('./routes/notification.routes');
const calendarRoutes = require('./routes/calendar.routes');
const voiceRoutes = require('./routes/voice.routes');
const aiRoutes = require('./routes/ai.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const performanceRoutes = require('./routes/performance.routes');
const subscriptionRoutes = require('./routes/subscription.routes');
const intelligenceRoutes = require('./routes/intelligence.routes');
const adaptiveRoutes     = require('./routes/adaptive.routes');
const aiCentralRoutes    = require('./routes/ai.central.routes');
const assistantRoutes    = require('./routes/assistant.routes');
const chatRoutes         = require('./routes/chat.routes');        // Phase 16: chat sessions
const { router: logsRoutes } = require('./routes/logs.routes');
const profileRoutes      = require('./routes/profile.routes');   // Profile & Settings system
const decisionRoutes     = require('./routes/decision.routes');  // Phase K: Core Brain Decision Engine
const analyticsRoutes    = require('./routes/analytics.routes'); // Phase O: Single Source of Truth Analytics
const userModelRoutes    = require('./routes/user-model.routes'); // Phase P: Persistent Per-User Intelligence
const engineRoutes       = require('./routes/engine.routes');     // Execution Engine: Life Execution System
const vaRoutes           = require('./routes/va.routes');          // Full Adaptive VA: Presence + Follow-up + Communication
const searchRoutes       = require('./routes/search.routes');      // Global Search
const exportRoutes       = require('./routes/export.routes');      // Data Export (CSV/JSON/PDF)

// Import scheduler
const { initScheduler } = require('./services/scheduler.service');
const { initProactiveMonitor } = require('./services/proactive.monitor.service');

const app = express();
const server = http.createServer(app);

// ============================================
// Socket.IO - Real-time notifications
// ============================================
const io = new Server(server, {
  cors: {
    origin: true, // Allow all origins in demo mode
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Store io instance globally for use in services
app.set('io', io);

io.on('connection', (socket) => {
  logger.info(`🔌 Client connected: ${socket.id}`);

  // Join user's personal room for targeted notifications
  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
    logger.info(`User ${userId} joined their room`);
  });

  socket.on('disconnect', () => {
    logger.info(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ============================================
// Middleware
// ============================================
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));

app.use(cors({
  origin: true, // Allow all origins in demo mode
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ── Global Rate Limiter (lenient — 300 req/min) ────────────────────────────
app.use(globalLimiter);

// Ensure UTF-8 charset on all JSON responses
app.use((req, res, next) => {
  const originalJson = res.json.bind(res);
  res.json = (data) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return originalJson(data);
  };
  next();
});

// ============================================
// API Routes
// ============================================
const API = '/api/v1';

// ── Rate limiters per tier ──────────────────────────────────────────────────
app.use(`${API}/auth`, authLimiter, authRoutes);
app.use(`${API}/users`, userRoutes);
app.use(`${API}/tasks`, taskRoutes);
app.use(`${API}/habits`, habitRoutes);
app.use(`${API}/mood`, moodRoutes);
app.use(`${API}/insights`, insightRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/calendar`, calendarRoutes);
app.use(`${API}/voice`, voiceRoutes);
app.use(`${API}/ai/v2`,        aiStrictLimiter, aiCentralRoutes);  // Centralized AI layer (Gemini/Groq) — strict rate limit
app.use(`${API}/ai`, aiLimiter, aiRoutes);
app.use(`${API}/dashboard`, cacheMiddleware(60, 'dashboard'), dashboardRoutes); // Cache 60s
app.use(`${API}/performance`, cacheMiddleware(120, 'perf'), performanceRoutes); // Cache 2min
app.use(`${API}/subscription`, subscriptionRoutes);
app.use(`${API}/intelligence`, cacheMiddleware(120, 'intel'), intelligenceRoutes); // Cache 2min
app.use(`${API}/adaptive`,     adaptiveRoutes);
app.use(`${API}/assistant`,    aiLimiter, assistantRoutes);  // New: AI Personal Assistant
app.use(`${API}/chat`,         aiLimiter, chatRoutes);        // Phase 16: Persistent chat sessions
app.use(`${API}/logs`,         logsRoutes);        // Error & activity logging
app.use(`${API}/profile-settings`, profileRoutes);   // Profile & Settings core system
app.use(`${API}/decision`,         decisionRoutes);   // Phase K: Core Brain Decision Engine
app.use(`${API}/analytics`,        cacheMiddleware(180, 'analytics'), analyticsRoutes); // Cache 3min
app.use(`${API}/user-model`,       userModelRoutes);   // Phase P: Persistent Per-User Intelligence
app.use(`${API}/engine`,           engineRoutes);       // Execution Engine: Life Execution System
app.use(`${API}/va`,               vaRoutes);             // Full Adaptive VA: Presence + Communication + Follow-up
app.use(`${API}/search`,           searchLimiter, searchRoutes);     // Global Search
app.use(`${API}/export`,           exportLimiter, exportRoutes);     // Data Export

// ============================================
// Health Check
// ============================================
const healthHandler = (req, res) => {
  let aiStatus = { healthy: false, error: 'AI module not loaded' };
  try {
    const aiClient = require('./services/ai/ai.client');
    aiStatus = aiClient.getAIStatus();
  } catch (e) {
    logger.warn('[HEALTH] AI status unavailable:', e.message);
    aiStatus = { healthy: false, error: e.message };
  }
  let cacheStatus = {};
  try { cacheStatus = getCacheStats(); } catch {}
  
  res.json({
    status: 'ok',
    app: 'LifeFlow API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    timezone: process.env.DEFAULT_TIMEZONE || 'Africa/Cairo',
    ai: aiStatus,
    cache: cacheStatus,
    uptime: Math.round(process.uptime()),
    memory: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
  });
};
app.get('/health', healthHandler);
app.get('/api/v1/health', healthHandler);

// Root
app.get('/', (req, res) => {
  res.json({
    message: '🌟 مرحباً بك في LifeFlow API - مساعدك الشخصي والمهني',
    version: '1.0.0',
    docs: `${req.protocol}://${req.get('host')}/api/v1/docs`,
  });
});

// ============================================
// Error Handler (Phase A — structured error middleware)
// ============================================
app.use(handleError);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    errorCode: 'NOT_FOUND',
    message: 'المسار غير موجود',
  });
});

// ============================================
// Start Server
// ============================================
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    // Connect to database
    await connectDB();
    logger.info('✅ Database connected successfully');

    // Setup Redis (optional - graceful fallback)
    try {
      await setupRedis();
      logger.info('✅ Redis connected successfully');
    } catch (redisErr) {
      logger.warn('⚠️  Redis not available, using in-memory fallback');
    }

    // Initialize cron job scheduler
    initScheduler(io);
    logger.info('✅ Scheduler initialized');
    // Start AI proactive monitoring
    initProactiveMonitor(io);
    logger.info('✅ Proactive AI monitor started');

    // Start HTTP server with EADDRINUSE protection
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.warn(`⚠️ Port ${PORT} is already in use. Attempting to recover...`);
        // Try to kill the existing process and retry after 2 seconds
        setTimeout(() => {
          server.close();
          server.listen(PORT, '0.0.0.0');
        }, 2000);
      } else {
        logger.error('❌ Server error:', err);
        process.exit(1);
      }
    });

    server.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 LifeFlow server running on port ${PORT}`);
      logger.info(`🌐 API: http://localhost:${PORT}/api/v1`);
      logger.info(`🏥 Health: http://localhost:${PORT}/health`);
    });
  } catch (error) {
    logger.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = { app, server, io };
