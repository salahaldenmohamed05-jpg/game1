/**
 * Notification Queue Service — Phase 7: Retry & Queue System
 * =============================================================
 * Uses Bull (backed by Redis) for reliable notification delivery.
 * 
 * Features:
 *   1. Automatic retry for failed notifications (3 attempts, exponential backoff)
 *   2. Dead-letter queue for permanently failed notifications
 *   3. Priority queue (high/normal/low)
 *   4. Scheduled notifications (delayed jobs)
 *   5. Rate limiting per user
 *   6. Queue health monitoring
 *   7. Graceful fallback to direct send if queue unavailable
 * 
 * Architecture:
 *   Producer → Bull Queue → Worker → FCM/Socket.IO → Success/Retry/Dead-letter
 */

'use strict';

const logger = require('../utils/logger');
const redis = require('./redis.persistence.service');

// ── Queue Configuration ──────────────────────────────────────────────────────
let notificationQueue = null;
let deadLetterQueue = null;
let queueInitialized = false;
let queueStats = { processed: 0, failed: 0, retried: 0, deadLetter: 0 };

/**
 * Initialize the notification queue
 */
async function initQueue() {
  if (queueInitialized) return !!notificationQueue;

  try {
    const redisUrl = process.env.REDIS_URL;

    if (!redisUrl) {
      logger.warn('[Queue] No REDIS_URL — notification queue disabled, using direct send');
      queueInitialized = true;
      return false;
    }

    // Test Redis connectivity first before creating queue
    const net = require('net');
    const url = new URL(redisUrl);
    const host = url.hostname || '127.0.0.1';
    const port = parseInt(url.port) || 6379;

    const isReachable = await new Promise((resolve) => {
      const sock = new net.Socket();
      sock.setTimeout(2000);
      sock.on('connect', () => { sock.destroy(); resolve(true); });
      sock.on('timeout', () => { sock.destroy(); resolve(false); });
      sock.on('error', () => { sock.destroy(); resolve(false); });
      sock.connect(port, host);
    });

    if (!isReachable) {
      logger.warn(`[Queue] Redis at ${host}:${port} not reachable — using direct send fallback`);
      queueInitialized = true;
      return false;
    }

    const { Queue, Worker } = require('bullmq');
    // Parse Redis URL for connection config
    const connection = { url: redisUrl };

    // Main notification queue
    notificationQueue = new Queue('lifeflow-notifications', {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 }, // 5s, 10s, 20s
        removeOnComplete: { count: 1000 }, // Keep last 1000 completed
        removeOnFail: { count: 500 },
      },
    });

    // Dead-letter queue for permanently failed
    deadLetterQueue = new Queue('lifeflow-notifications-dead', {
      connection,
      defaultJobOptions: {
        removeOnComplete: { count: 5000 },
      },
    });

    // Worker processes notifications
    const worker = new Worker('lifeflow-notifications', async (job) => {
      return processNotificationJob(job);
    }, {
      connection,
      concurrency: 5, // Process 5 notifications at a time
      limiter: {
        max: 100,
        duration: 60000, // Max 100 per minute
      },
    });

    // Worker event handlers
    worker.on('completed', (job) => {
      queueStats.processed++;
      logger.debug(`[Queue] Job ${job.id} completed: ${job.data.type} for user ${job.data.userId}`);
    });

    worker.on('failed', async (job, err) => {
      queueStats.failed++;
      logger.error(`[Queue] Job ${job?.id} failed (attempt ${job?.attemptsMade}): ${err.message}`);
      
      // If all retries exhausted, move to dead-letter
      if (job && job.attemptsMade >= (job.opts?.attempts || 3)) {
        queueStats.deadLetter++;
        try {
          await deadLetterQueue.add('dead-notification', {
            ...job.data,
            originalJobId: job.id,
            failedAt: new Date().toISOString(),
            error: err.message,
            attempts: job.attemptsMade,
          });
          logger.warn(`[Queue] Job ${job.id} moved to dead-letter queue`);
        } catch (dlErr) {
          logger.error(`[Queue] Dead-letter failed:`, dlErr.message);
        }
        
        // Log failure to Redis
        await redis.logFailure('notification_permanent_failure', {
          userId: job.data.userId,
          type: job.data.type,
          error: err.message,
          attempts: job.attemptsMade,
        });
      } else {
        queueStats.retried++;
      }
    });

    worker.on('error', (err) => {
      logger.error(`[Queue] Worker error:`, err.message);
    });

    queueInitialized = true;
    logger.info('✅ Notification queue initialized (Bull/Redis)');
    return true;
  } catch (err) {
    logger.warn(`[Queue] Init failed: ${err.message} — using direct send fallback`);
    queueInitialized = true;
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// JOB PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Process a notification job from the queue
 */
async function processNotificationJob(job) {
  const { userId, type, context, priority } = job.data;
  
  // Lazy-load FCM to avoid circular deps
  const fcm = require('./fcm.notification.service');
  
  // Check if we can still send (rate limits may have changed)
  const canSend = await redis.canSendNotification(userId, type);
  if (!canSend) {
    logger.debug(`[Queue] Rate limited — skipping ${type} for ${userId}`);
    return { skipped: true, reason: 'rate_limited' };
  }
  
  // Get the IO instance (stored globally)
  let ioInstance = null;
  try {
    // This will be set by the main app
    ioInstance = global.__lifeflow_io || null;
  } catch (_) {}
  
  const result = await fcm.sendPushNotification(userId, type, context, ioInstance);
  
  if (!result.success) {
    throw new Error(`Notification delivery failed: ${result.error || 'unknown'}`);
  }
  
  return result;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCER: ENQUEUE NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enqueue a notification for reliable delivery
 * Falls back to direct send if queue unavailable
 */
async function enqueueNotification(userId, type, context = {}, options = {}) {
  const priority = options.priority || 'normal';
  const delay = options.delay || 0; // ms delay before processing
  
  // If queue is available, use it
  if (notificationQueue) {
    try {
      const job = await notificationQueue.add(`notify-${type}`, {
        userId,
        type,
        context,
        priority,
        enqueuedAt: new Date().toISOString(),
      }, {
        priority: priority === 'high' ? 1 : priority === 'low' ? 3 : 2,
        delay,
      });
      
      logger.debug(`[Queue] Enqueued ${type} for ${userId} (job: ${job.id})`);
      return { success: true, queued: true, jobId: job.id };
    } catch (err) {
      logger.error(`[Queue] Enqueue failed, falling back to direct:`, err.message);
      // Fall through to direct send
    }
  }
  
  // Direct send fallback
  try {
    const fcm = require('./fcm.notification.service');
    let ioInstance = global.__lifeflow_io || null;
    const result = await fcm.sendPushNotification(userId, type, context, ioInstance);
    return { success: result.success, queued: false, direct: true, channel: result.channel };
  } catch (err) {
    logger.error(`[Queue] Direct send also failed:`, err.message);
    await redis.logFailure('notification_total_failure', { userId, type, error: err.message });
    return { success: false, error: err.message };
  }
}

/**
 * Enqueue batch notifications
 */
async function enqueueBatch(notifications) {
  const results = { queued: 0, directSent: 0, failed: 0 };
  
  for (const notif of notifications) {
    try {
      const result = await enqueueNotification(
        notif.userId, notif.type, notif.context, notif.options
      );
      if (result.queued) results.queued++;
      else if (result.success) results.directSent++;
      else results.failed++;
    } catch (err) {
      results.failed++;
    }
  }
  
  return results;
}

/**
 * Enqueue a delayed notification (e.g., schedule for later)
 */
async function scheduleNotification(userId, type, context, delayMs) {
  return enqueueNotification(userId, type, context, { delay: delayMs });
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUEUE HEALTH & MONITORING
// ═══════════════════════════════════════════════════════════════════════════════

async function getQueueHealth() {
  const health = {
    initialized: queueInitialized,
    queueAvailable: !!notificationQueue,
    stats: { ...queueStats },
  };
  
  if (notificationQueue) {
    try {
      const waiting = await notificationQueue.getWaitingCount();
      const active = await notificationQueue.getActiveCount();
      const delayed = await notificationQueue.getDelayedCount();
      const failed = await notificationQueue.getFailedCount();
      
      health.queue = { waiting, active, delayed, failed };
    } catch (err) {
      health.queue = { error: err.message };
    }
  }
  
  if (deadLetterQueue) {
    try {
      const dlWaiting = await deadLetterQueue.getWaitingCount();
      health.deadLetter = { count: dlWaiting };
    } catch (err) {
      health.deadLetter = { error: err.message };
    }
  }
  
  return health;
}

/**
 * Retry all dead-letter notifications
 */
async function retryDeadLetters() {
  if (!deadLetterQueue || !notificationQueue) {
    return { success: false, error: 'Queues not available' };
  }
  
  try {
    const deadJobs = await deadLetterQueue.getWaiting(0, 100);
    let retried = 0;
    
    for (const job of deadJobs) {
      try {
        await notificationQueue.add(`retry-${job.data.type}`, job.data, {
          attempts: 1, // Single retry attempt for dead-letters
        });
        await job.remove();
        retried++;
      } catch (err) {
        logger.error(`[Queue] Dead-letter retry failed:`, err.message);
      }
    }
    
    return { success: true, retried, total: deadJobs.length };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = {
  initQueue,
  enqueueNotification,
  enqueueBatch,
  scheduleNotification,
  getQueueHealth,
  retryDeadLetters,
};
