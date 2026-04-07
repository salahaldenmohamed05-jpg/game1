/**
 * LifeFlow Backend - Main Entry Point
 * ====================================
 * مدخل رئيسي للـ Backend
 * يشغّل Express server مع كل الـ middleware والـ routes
 */

require('dotenv').config({ override: true }); // override any sandbox env vars with .env values

// ── Safe Demo Mode ─────────────────────────────────────────────────────────
// When DEMO_MODE=true (or when Stripe/Redis/FCM are unavailable), the system
// runs in safe demo mode: disabled Stripe charges, mock FCM, in-memory fallback
// for Redis, and never crashes on missing external services.
const DEMO_MODE = process.env.DEMO_MODE === 'true' ||
  process.env.NODE_ENV !== 'production' ||
  !process.env.STRIPE_SECRET_KEY ||
  !process.env.REDIS_URL;
global.__LIFEFLOW_DEMO_MODE = DEMO_MODE;

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
const dailyFlowRoutes    = require('./routes/daily-flow.routes');  // Phase 4: Daily Execution Flow
const phase6Routes       = require('./routes/phase6.routes');      // Phase 6: External Execution Layer
const phase7Routes       = require('./routes/phase7.routes');      // Phase 7: Production Infrastructure
const brainRoutes        = require('./routes/brain.routes');       // Phase 12: Real-Time Cognitive Brain

// Import scheduler
const { initScheduler } = require('./services/scheduler.service');
const { initProactiveMonitor } = require('./services/proactive.monitor.service');
const { initQueue } = require('./services/notification.queue.service');
const { trackingMiddleware } = require('./services/event.tracking.service');

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

  // Phase 12.6: Frontend requests immediate brain state on connect
  // This triggers INITIAL_LOAD recompute and pushes the result via brain:update
  socket.on('brain:request_initial', async (data) => {
    const userId = data?.userId;
    logger.info(`[Brain][Socket] brain:request_initial received. userId=${userId}, socketId=${socket.id}`);
    if (!userId) {
      logger.warn(`[Brain][Socket] brain:request_initial: no userId, ignoring`);
      return;
    }
    try {
      const startMs = Date.now();
      const brainService = require('./services/brain.service');
      const state = await brainService.getBrainState(userId);
      const elapsed = Date.now() - startMs;
      // Push directly to this socket (not broadcast — just the requesting client)
      socket.emit('brain:update', { userId, brainState: state });
      logger.info(`[Brain][Socket] Pushed initial state to socket ${socket.id} for user ${userId} in ${elapsed}ms. Decision: "${state?.currentDecision?.taskTitle || state?.currentDecision?.type || 'null'}"`);
    } catch (err) {
      logger.error(`[Brain][Socket] brain:request_initial error for user ${userId}: ${err.message}`);
    }
  });

  // Phase 15: Trigger Engine — intervention feedback from frontend
  socket.on('intervention:dismiss', (data) => {
    const { userId, interventionId } = data || {};
    if (!userId) return;
    try {
      const triggerEngine = require('./services/triggerEngine');
      triggerEngine.recordInterventionDismissal(userId, interventionId);
      triggerEngine.recordActivity(userId, 'intervention_dismissed');
      logger.debug(`[TriggerEngine][Socket] Intervention dismissed by user ${userId}: ${interventionId}`);
    } catch (err) {
      logger.warn(`[TriggerEngine][Socket] dismiss error: ${err.message}`);
    }
  });

  socket.on('intervention:engage', (data) => {
    const { userId, interventionId } = data || {};
    if (!userId) return;
    try {
      const triggerEngine = require('./services/triggerEngine');
      triggerEngine.recordInterventionEngagement(userId, interventionId);
      triggerEngine.recordActivity(userId, 'intervention_engaged');
      logger.debug(`[TriggerEngine][Socket] Intervention engaged by user ${userId}: ${interventionId}`);
    } catch (err) {
      logger.warn(`[TriggerEngine][Socket] engage error: ${err.message}`);
    }
  });

  // Phase 15: User activity report (keeps trigger engine aware of user presence)
  socket.on('user:activity', (data) => {
    const { userId, type } = data || {};
    if (!userId) return;
    try {
      const triggerEngine = require('./services/triggerEngine');
      triggerEngine.recordActivity(userId, type || 'ui_interaction');
    } catch {}
  });

  socket.on('disconnect', () => {
    logger.info(`🔌 Client disconnected: ${socket.id}`);
  });
});

// ============================================
// Middleware
// ============================================
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
}));
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

// ── Phase 7: Event tracking middleware (BEFORE routes so it attaches res.on('finish') listeners) ──
app.use(`${API}`, trackingMiddleware);

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
app.use(`${API}/dashboard`, dashboardRoutes); // Cache moved inside routes (after auth)
app.use(`${API}/performance`, performanceRoutes);
app.use(`${API}/subscription`, subscriptionRoutes);
app.use(`${API}/intelligence`, intelligenceRoutes);
app.use(`${API}/adaptive`,     adaptiveRoutes);
app.use(`${API}/assistant`,    aiLimiter, assistantRoutes);  // New: AI Personal Assistant
app.use(`${API}/chat`,         aiLimiter, chatRoutes);        // Phase 16: Persistent chat sessions
app.use(`${API}/logs`,         logsRoutes);        // Error & activity logging
app.use(`${API}/profile-settings`, profileRoutes);   // Profile & Settings core system
app.use(`${API}/decision`,         decisionRoutes);   // Phase K: Core Brain Decision Engine
app.use(`${API}/analytics`,        analyticsRoutes); // Cache moved inside routes (after auth)
app.use(`${API}/user-model`,       userModelRoutes);   // Phase P: Persistent Per-User Intelligence
app.use(`${API}/engine`,           engineRoutes);       // Execution Engine: Life Execution System
app.use(`${API}/va`,               vaRoutes);             // Full Adaptive VA: Presence + Communication + Follow-up
app.use(`${API}/search`,           searchLimiter, searchRoutes);     // Global Search
app.use(`${API}/export`,           exportLimiter, exportRoutes);     // Data Export
app.use(`${API}/daily-flow`,       writeLimiter, dailyFlowRoutes);    // Phase 4: Daily Execution Flow (rate limited)
app.use(`${API}/phase6`,           phase6Routes);                    // Phase 6: External Execution Layer
app.use(`${API}/phase7`,           phase7Routes);                    // Phase 7: Production Infrastructure
app.use(`${API}/brain`,            brainRoutes);                     // Phase 12: Real-Time Cognitive Brain

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
    demo_mode: global.__LIFEFLOW_DEMO_MODE || false,
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

    // Phase 7: Initialize notification queue
    try {
      global.__lifeflow_io = io; // Make io available globally for queue workers
      await initQueue();
      logger.info('✅ Notification queue initialized');
    } catch (queueErr) {
      logger.warn('⚠️  Notification queue not available, using direct send:', queueErr.message);
    }

    // Phase 12: Initialize Brain Service with Socket.IO
    try {
      const brainService = require('./services/brain.service');
      brainService.init(io);
      logger.info('✅ Brain service initialized');
    } catch (brainErr) {
      logger.warn('⚠️  Brain service not available:', brainErr.message);
    }

    // Phase 15: Initialize Trigger Engine (Proactive Intervention System)
    try {
      const triggerEngine = require('./services/triggerEngine');
      triggerEngine.init(io);
      logger.info('✅ Trigger Engine initialized');
    } catch (triggerErr) {
      logger.warn('⚠️  Trigger Engine not available:', triggerErr.message);
    }

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
