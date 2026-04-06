/**
 * Firebase Cloud Messaging (FCM) Service — Phase 7: Production Notifications
 * =============================================================================
 * Production-grade push notification delivery via Firebase Cloud Messaging.
 * 
 * Features:
 *   1. Device token registration on login
 *   2. Rich notifications with action buttons (complete, skip, start)
 *   3. Deep-link support for notification actions
 *   4. Notification types: morning_kickoff, task_nudge, streak_warning,
 *      energy_intervention, end_of_day, habit_reminder, comeback
 *   5. Badge count management
 *   6. Automatic token cleanup for expired tokens
 *   7. Multi-device support (up to 10 per user)
 *   8. Fallback to Socket.IO when FCM unavailable
 * 
 * Dependencies: firebase-admin, Redis persistence layer
 */

'use strict';

const logger = require('../utils/logger');
const redis = require('./redis.persistence.service');

// ── Firebase Admin SDK (lazy-loaded) ─────────────────────────────────────────
let firebaseAdmin = null;
let firebaseMessaging = null;
let fcmInitialized = false;

function initFCM() {
  if (fcmInitialized) return !!firebaseMessaging;
  
  try {
    const admin = require('firebase-admin');
    
    // Check for service account credentials
    const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    
    if (serviceAccount) {
      const creds = JSON.parse(serviceAccount);
      admin.initializeApp({
        credential: admin.credential.cert(creds),
        projectId: creds.project_id || projectId,
      });
    } else if (projectId) {
      // Use application default credentials
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId,
      });
    } else {
      logger.warn('[FCM] No Firebase credentials configured — using Socket.IO fallback');
      fcmInitialized = true;
      return false;
    }
    
    firebaseAdmin = admin;
    firebaseMessaging = admin.messaging();
    fcmInitialized = true;
    logger.info('✅ Firebase Cloud Messaging initialized');
    return true;
  } catch (err) {
    logger.warn(`[FCM] Firebase init failed: ${err.message} — using Socket.IO fallback`);
    fcmInitialized = true;
    return false;
  }
}

// ── Notification Templates ───────────────────────────────────────────────────

const NOTIFICATION_TEMPLATES = {
  morning_kickoff: {
    title: '🌅 صباح الخير! يومك جاهز',
    body: (ctx) => `عندك ${ctx.taskCount || 0} مهام و ${ctx.habitCount || 0} عادات اليوم. يلا نبدأ! 💪`,
    actions: [
      { action: 'start_day', title: 'ابدأ يومك', icon: '🚀' },
      { action: 'view_plan', title: 'شوف الخطة', icon: '📋' },
    ],
    deep_link: '/daily-flow',
    priority: 'high',
    ttl: 3600,
  },
  task_nudge: {
    title: '📌 تذكير بالمهمة',
    body: (ctx) => ctx.taskTitle 
      ? `"${ctx.taskTitle}" لسه مستنياك. خلّيها اليوم! ⏰`
      : 'عندك مهام مستنية — خلص واحدة دلوقتي 🎯',
    actions: [
      { action: 'complete_task', title: 'خلصتها ✅', icon: '✅' },
      { action: 'skip_task', title: 'تأجيل', icon: '⏭️' },
    ],
    deep_link: '/tasks',
    priority: 'high',
    ttl: 1800,
  },
  streak_warning: {
    title: '🔥 سلسلتك في خطر!',
    body: (ctx) => ctx.streakDays
      ? `${ctx.streakDays} يوم متتالي هتضيع لو ما كملت النهاردة! 💪`
      : 'سلسلتك هتنقطع لو ما عملت حاجة النهاردة ⚠️',
    actions: [
      { action: 'check_habit', title: 'سجّل الآن', icon: '✅' },
      { action: 'view_streak', title: 'شوف السلسلة', icon: '🔥' },
    ],
    deep_link: '/habits',
    priority: 'high',
    ttl: 7200,
  },
  energy_intervention: {
    title: '🧘 طاقتك محتاجة استراحة',
    body: (ctx) => ctx.skipCount
      ? `لاحظنا ${ctx.skipCount} تخطيات — خذ برك وارجع أقوى 💆`
      : 'خذ 5 دقايق راحة — التعب مش ضعف 🌿',
    actions: [
      { action: 'take_break', title: 'خذ استراحة 🧘', icon: '🧘' },
      { action: 'easy_task', title: 'حاجة خفيفة', icon: '🎈' },
    ],
    deep_link: '/daily-flow',
    priority: 'normal',
    ttl: 3600,
  },
  end_of_day: {
    title: '🌙 وقت التأمل اليومي',
    body: (ctx) => ctx.completionRate
      ? `أنجزت ${ctx.completionRate}% من خطتك النهاردة! ${ctx.completionRate >= 80 ? '🏆' : '🌟'}`
      : 'يومك خلص — تعال شوف إنجازاتك 📊',
    actions: [
      { action: 'end_day', title: 'أنهِ اليوم', icon: '🌙' },
      { action: 'view_stats', title: 'شوف الإحصائيات', icon: '📊' },
    ],
    deep_link: '/daily-flow',
    priority: 'normal',
    ttl: 7200,
  },
  habit_reminder: {
    title: '💪 وقت العادة',
    body: (ctx) => ctx.habitName
      ? `حان وقت "${ctx.habitName}" — ${ctx.streak ? `سلسلة ${ctx.streak} يوم 🔥` : 'ابدأ سلسلة جديدة!'}`
      : 'عندك عادات مستنياك — سجّلها دلوقتي 🎯',
    actions: [
      { action: 'check_habit', title: 'سجّلتها ✅', icon: '✅' },
      { action: 'skip_habit', title: 'مش النهاردة', icon: '⏭️' },
    ],
    deep_link: '/habits',
    priority: 'normal',
    ttl: 3600,
  },
  comeback: {
    title: '👋 وحشتنا!',
    body: (ctx) => ctx.absentDays
      ? `غبت ${ctx.absentDays} أيام — رجعتك تفرحنا! يلا نبدأ بسيط 🌱`
      : 'رجعت! يلا نبدأ يوم جديد 🌅',
    actions: [
      { action: 'start_day', title: 'ابدأ من جديد 🚀', icon: '🚀' },
    ],
    deep_link: '/daily-flow',
    priority: 'high',
    ttl: 86400,
  },
  procrastination: {
    title: '🧠 لاحظنا حاجة...',
    body: (ctx) => ctx.taskTitle
      ? `"${ctx.taskTitle}" متأجلة — جرب تبدأ بأصغر جزء منها 🪜`
      : 'في مهام بتتأجل — خلينا نقسمها لحاجات صغيرة 🎯',
    actions: [
      { action: 'start_small', title: 'أبدأ بصغيرة', icon: '🪜' },
      { action: 'reschedule', title: 'أجّلها', icon: '📅' },
    ],
    deep_link: '/tasks',
    priority: 'normal',
    ttl: 3600,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CORE SEND FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Send a push notification to a user via FCM
 * Falls back to Socket.IO if FCM unavailable
 * 
 * @param {string} userId - Target user ID
 * @param {string} type - Notification type key
 * @param {Object} context - Template context variables
 * @param {Object} [ioInstance] - Socket.IO instance for fallback
 * @returns {Object} { success, channel, details }
 */
async function sendPushNotification(userId, type, context = {}, ioInstance = null) {
  const template = NOTIFICATION_TEMPLATES[type];
  if (!template) {
    logger.error(`[FCM] Unknown notification type: ${type}`);
    await redis.logFailure('unknown_type', { userId, type });
    return { success: false, error: 'unknown_type' };
  }

  // Check rate limits
  const canSend = await redis.canSendNotification(userId, type);
  if (!canSend) {
    logger.debug(`[FCM] Rate limited for user ${userId}, type ${type}`);
    return { success: false, error: 'rate_limited' };
  }

  const title = template.title;
  const body = typeof template.body === 'function' ? template.body(context) : template.body;
  const notifPayload = {
    title,
    body,
    type,
    actions: template.actions,
    deep_link: template.deep_link,
    timestamp: new Date().toISOString(),
    context,
  };

  let fcmSuccess = false;
  let socketSuccess = false;

  // Attempt FCM delivery
  if (initFCM() && firebaseMessaging) {
    try {
      const tokens = await redis.getDeviceTokens(userId);
      if (tokens.length > 0) {
        const tokenStrings = tokens.map(t => t.token);
        
        const message = {
          notification: { title, body },
          data: {
            type,
            deep_link: template.deep_link || '/',
            actions: JSON.stringify(template.actions || []),
            context: JSON.stringify(context),
            timestamp: new Date().toISOString(),
          },
          android: {
            priority: template.priority === 'high' ? 'high' : 'normal',
            ttl: (template.ttl || 3600) * 1000,
            notification: {
              channelId: 'lifeflow-notifications',
              sound: 'default',
              clickAction: 'OPEN_ACTIVITY',
            },
          },
          webpush: {
            headers: { TTL: String(template.ttl || 3600) },
            notification: {
              badge: '/icons/badge-72x72.png',
              icon: '/icons/icon-192x192.png',
              actions: (template.actions || []).map(a => ({
                action: a.action,
                title: a.title,
              })),
              data: { deep_link: template.deep_link || '/' },
              requireInteraction: template.priority === 'high',
              lang: 'ar',
              dir: 'rtl',
            },
          },
        };

        // Send to multiple tokens
        const response = await firebaseMessaging.sendEachForMulticast({
          tokens: tokenStrings,
          ...message,
        });

        // Clean up failed tokens
        if (response.failureCount > 0) {
          const failedTokens = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              const errorCode = resp.error?.code;
              if (errorCode === 'messaging/invalid-registration-token' ||
                  errorCode === 'messaging/registration-token-not-registered') {
                failedTokens.push(tokenStrings[idx]);
              }
            }
          });
          // Remove invalid tokens
          for (const token of failedTokens) {
            await redis.removeDeviceToken(userId, token);
            logger.info(`[FCM] Removed invalid token for user ${userId}`);
          }
        }

        fcmSuccess = response.successCount > 0;
        logger.info(`[FCM] Sent to ${userId}: ${response.successCount}/${tokenStrings.length} success`);
      }
    } catch (err) {
      logger.error(`[FCM] Send failed for ${userId}:`, err.message);
      await redis.logFailure('fcm_send', { userId, type, error: err.message });
    }
  }

  // Fallback to Socket.IO
  if (ioInstance) {
    try {
      ioInstance.to(`user_${userId}`).emit('push_notification', notifPayload);
      ioInstance.to(`user_${userId}`).emit('notification', notifPayload);
      socketSuccess = true;
      logger.debug(`[Socket.IO] Notification sent to user_${userId}`);
    } catch (err) {
      logger.error(`[Socket.IO] Send failed for ${userId}:`, err.message);
      await redis.logFailure('socketio_send', { userId, type, error: err.message });
    }
  }

  const success = fcmSuccess || socketSuccess;
  
  if (success) {
    // Track notification sent
    await redis.incrementNotificationCount(userId, type);
    await redis.logEvent(userId, 'notification_sent', { type, channel: fcmSuccess ? 'fcm' : 'socketio' });
    await redis.incrementMetric('notifications_sent', userId);
  } else {
    await redis.logFailure('delivery_failed', { userId, type, fcm: !!firebaseMessaging, socket: !!ioInstance });
  }

  return {
    success,
    channel: fcmSuccess ? 'fcm' : socketSuccess ? 'socketio' : 'none',
    details: { fcmSuccess, socketSuccess, type, userId },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Register a device token for a user (call on login)
 */
async function registerDeviceToken(userId, token, platform = 'web') {
  try {
    const tokens = await redis.addDeviceToken(userId, token, platform);
    await redis.logEvent(userId, 'device_token_registered', { platform, tokenCount: tokens.length });
    logger.info(`[FCM] Device token registered for user ${userId} (${platform})`);
    return { success: true, tokenCount: tokens.length };
  } catch (err) {
    logger.error(`[FCM] Token registration failed:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Unregister a device token (call on logout)
 */
async function unregisterDeviceToken(userId, token) {
  try {
    await redis.removeDeviceToken(userId, token);
    await redis.logEvent(userId, 'device_token_removed', {});
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BATCH SEND (for scheduler)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Send notifications to multiple users
 */
async function sendBatchNotifications(userIds, type, contextFn, ioInstance) {
  const results = { sent: 0, failed: 0, rateLimit: 0 };
  
  for (const userId of userIds) {
    try {
      const context = typeof contextFn === 'function' ? await contextFn(userId) : contextFn;
      const result = await sendPushNotification(userId, type, context, ioInstance);
      
      if (result.success) results.sent++;
      else if (result.error === 'rate_limited') results.rateLimit++;
      else results.failed++;
    } catch (err) {
      results.failed++;
      logger.error(`[FCM Batch] Failed for ${userId}:`, err.message);
    }
  }

  logger.info(`[FCM Batch] ${type}: sent=${results.sent}, failed=${results.failed}, rateLimited=${results.rateLimit}`);
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// FCM STATUS
// ═══════════════════════════════════════════════════════════════════════════════

function getFCMStatus() {
  return {
    initialized: fcmInitialized,
    fcmAvailable: !!firebaseMessaging,
    fallback: !firebaseMessaging ? 'socketio' : 'none',
    templates: Object.keys(NOTIFICATION_TEMPLATES),
    templateCount: Object.keys(NOTIFICATION_TEMPLATES).length,
  };
}

module.exports = {
  initFCM,
  sendPushNotification,
  sendBatchNotifications,
  registerDeviceToken,
  unregisterDeviceToken,
  getFCMStatus,
  NOTIFICATION_TEMPLATES,
};
