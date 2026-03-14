/**
 * LifeFlow Backend - Main Entry Point
 * ====================================
 * مدخل رئيسي للـ Backend
 * يشغّل Express server مع كل الـ middleware والـ routes
 */

require('dotenv').config();
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

// Import scheduler
const { initScheduler } = require('./services/scheduler.service');

const app = express();
const server = http.createServer(app);

// ============================================
// Socket.IO - Real-time notifications
// ============================================
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
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

// ============================================
// API Routes
// ============================================
const API = '/api/v1';

app.use(`${API}/auth`, authRoutes);
app.use(`${API}/users`, userRoutes);
app.use(`${API}/tasks`, taskRoutes);
app.use(`${API}/habits`, habitRoutes);
app.use(`${API}/mood`, moodRoutes);
app.use(`${API}/insights`, insightRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/calendar`, calendarRoutes);
app.use(`${API}/voice`, voiceRoutes);
app.use(`${API}/ai`, aiRoutes);
app.use(`${API}/dashboard`, dashboardRoutes);
app.use(`${API}/performance`, performanceRoutes);
app.use(`${API}/subscription`, subscriptionRoutes);
app.use(`${API}/intelligence`, intelligenceRoutes);

// ============================================
// Health Check
// ============================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'LifeFlow API',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    timezone: process.env.DEFAULT_TIMEZONE,
  });
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: '🌟 مرحباً بك في LifeFlow API - مساعدك الشخصي والمهني',
    version: '1.0.0',
    docs: `${req.protocol}://${req.get('host')}/api/v1/docs`,
  });
});

// ============================================
// Error Handler
// ============================================
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'حدث خطأ في الخادم، يرجى المحاولة لاحقاً',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
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

    // Start HTTP server
    server.listen(PORT, () => {
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
