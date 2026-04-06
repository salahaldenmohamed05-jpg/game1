/**
 * Event Tracking Pipeline — Phase 7: Production Analytics
 * ==========================================================
 * Centralized event tracking system that logs ALL user actions.
 * 
 * Tracked Events:
 *   - notification_sent / notification_opened / action_taken_from_notification
 *   - block_completed / block_skipped
 *   - habit_checked
 *   - day_started / day_completed
 *   - task_created / task_completed / task_rescheduled
 *   - streak_broken / streak_milestone
 *   - subscription_created / subscription_cancelled
 *   - device_token_registered
 *   - ab_variant_assigned
 *   - error_occurred
 * 
 * Each event includes: timestamp, user_id, event_type, context, ab_variant
 */

'use strict';

const logger = require('../utils/logger');
const redis = require('./redis.persistence.service');

// ── Event Type Registry ──────────────────────────────────────────────────────
const EVENT_TYPES = {
  // Notification lifecycle
  NOTIFICATION_SENT:     'notification_sent',
  NOTIFICATION_OPENED:   'notification_opened',
  NOTIFICATION_ACTIONED: 'action_taken_from_notification',
  NOTIFICATION_DISMISSED:'notification_dismissed',
  
  // Block lifecycle
  BLOCK_COMPLETED:       'block_completed',
  BLOCK_SKIPPED:         'block_skipped',
  
  // Habit lifecycle
  HABIT_CHECKED:         'habit_checked',
  HABIT_MISSED:          'habit_missed',
  
  // Day lifecycle
  DAY_STARTED:           'day_started',
  DAY_COMPLETED:         'day_completed',
  
  // Task lifecycle
  TASK_CREATED:          'task_created',
  TASK_COMPLETED:        'task_completed',
  TASK_RESCHEDULED:      'task_rescheduled',
  
  // Streak events
  STREAK_BROKEN:         'streak_broken',
  STREAK_MILESTONE:      'streak_milestone',
  
  // Subscription events
  SUBSCRIPTION_CREATED:  'subscription_created',
  SUBSCRIPTION_CANCELLED:'subscription_cancelled',
  SUBSCRIPTION_RENEWED:  'subscription_renewed',
  
  // System events
  DEVICE_TOKEN_REGISTERED: 'device_token_registered',
  AB_VARIANT_ASSIGNED:   'ab_variant_assigned',
  ERROR_OCCURRED:        'error_occurred',
  
  // Engagement
  APP_OPENED:            'app_opened',
  SESSION_START:         'session_start',
  SESSION_END:           'session_end',
};

// ── Metric mappings (event → metric counter) ─────────────────────────────────
const EVENT_TO_METRIC = {
  [EVENT_TYPES.NOTIFICATION_SENT]:     'notifications_sent',
  [EVENT_TYPES.NOTIFICATION_OPENED]:   'notifications_opened',
  [EVENT_TYPES.NOTIFICATION_ACTIONED]: 'notifications_actioned',
  [EVENT_TYPES.BLOCK_COMPLETED]:       'blocks_completed',
  [EVENT_TYPES.BLOCK_SKIPPED]:         'blocks_skipped',
  [EVENT_TYPES.HABIT_CHECKED]:         'habits_checked',
  [EVENT_TYPES.DAY_STARTED]:           'days_started',
  [EVENT_TYPES.DAY_COMPLETED]:         'days_completed',
};

// ═══════════════════════════════════════════════════════════════════════════════
// CORE TRACKING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Track an event with full context
 * This is the single entry point for ALL event tracking.
 * 
 * @param {string} userId - User ID
 * @param {string} eventType - Event type from EVENT_TYPES
 * @param {Object} context - Additional context (notification_type, block_id, etc.)
 * @returns {Promise<boolean>} success
 */
async function trackEvent(userId, eventType, context = {}) {
  try {
    // 1. Validate event type
    if (!Object.values(EVENT_TYPES).includes(eventType)) {
      logger.warn(`[Tracker] Unknown event type: ${eventType}`);
    }

    // 2. Enrich with A/B variant if assigned
    let abVariant = null;
    try {
      const variant = await redis.getABVariant(userId);
      if (variant) abVariant = variant;
    } catch (_) {}

    // 3. Build enriched event
    const event = {
      type: eventType,
      timestamp: new Date().toISOString(),
      user_id: userId,
      ab_variant: abVariant?.variant || null,
      ab_experiment: abVariant?.experiment || null,
      ...context,
    };

    // 4. Log to Redis
    await redis.logEvent(userId, eventType, event);

    // 5. Update daily metrics if mapped
    const metricName = EVENT_TO_METRIC[eventType];
    if (metricName) {
      await redis.incrementMetric(metricName, userId);
    }

    // 6. Update user activity timestamp
    await redis.trackUserActivity(userId);

    // 7. Update behavioral profile for specific events
    await updateBehavioralData(userId, eventType, context);

    logger.debug(`[Tracker] ${eventType} for user ${userId}`);
    return true;
  } catch (err) {
    logger.error(`[Tracker] Failed to track ${eventType} for ${userId}:`, err.message);
    // Never silently fail — log the failure
    try {
      await redis.logFailure('event_tracking', { userId, eventType, error: err.message });
    } catch (_) {}
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEHAVIORAL DATA UPDATES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Update long-term behavioral profile based on events
 */
async function updateBehavioralData(userId, eventType, context) {
  try {
    switch (eventType) {
      case EVENT_TYPES.BLOCK_COMPLETED: {
        const profile = await redis.getBehavioralProfile(userId);
        profile.totalDaysTracked = (profile.totalDaysTracked || 0);
        const completions = profile.completions || 0;
        profile.completions = completions + 1;
        profile.avgCompletionRate = profile.completions / Math.max(profile.totalDaysTracked, 1);
        
        // Track energy trends by hour
        const hour = new Date().getHours();
        if (!profile.energyTrends) profile.energyTrends = {};
        profile.energyTrends[hour] = (profile.energyTrends[hour] || 0) + 1;
        
        await redis.updateBehavioralProfile(userId, profile);
        break;
      }
      
      case EVENT_TYPES.BLOCK_SKIPPED: {
        const profile = await redis.getBehavioralProfile(userId);
        if (!profile.skipPatterns) profile.skipPatterns = {};
        const reason = context.reason || 'unknown';
        profile.skipPatterns[reason] = (profile.skipPatterns[reason] || 0) + 1;
        
        // Track procrastination triggers
        if (!profile.procrastinationTriggers) profile.procrastinationTriggers = [];
        if (context.block_type) {
          profile.procrastinationTriggers.push({
            type: context.block_type,
            reason,
            time: new Date().toISOString(),
          });
          // Keep last 100 triggers
          if (profile.procrastinationTriggers.length > 100) {
            profile.procrastinationTriggers = profile.procrastinationTriggers.slice(-100);
          }
        }
        await redis.updateBehavioralProfile(userId, profile);
        break;
      }
      
      case EVENT_TYPES.HABIT_CHECKED: {
        const profile = await redis.getBehavioralProfile(userId);
        if (!profile.habitConsistency) profile.habitConsistency = {};
        const habitId = context.habit_id || 'unknown';
        if (!profile.habitConsistency[habitId]) {
          profile.habitConsistency[habitId] = { checks: 0, misses: 0, longestStreak: 0 };
        }
        profile.habitConsistency[habitId].checks++;
        await redis.updateBehavioralProfile(userId, profile);
        break;
      }
      
      case EVENT_TYPES.DAY_COMPLETED: {
        const profile = await redis.getBehavioralProfile(userId);
        profile.totalDaysTracked = (profile.totalDaysTracked || 0) + 1;
        
        // Store streak history
        if (!profile.streakHistory) profile.streakHistory = [];
        profile.streakHistory.push({
          date: new Date().toISOString().slice(0, 10),
          completionRate: context.completion_rate || 0,
          score: context.score || 0,
        });
        // Keep last 365 days
        if (profile.streakHistory.length > 365) {
          profile.streakHistory = profile.streakHistory.slice(-365);
        }
        await redis.updateBehavioralProfile(userId, profile);
        break;
      }
    }
  } catch (err) {
    logger.error(`[Tracker] Behavioral update failed:`, err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUERY FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get events for a user in a date range
 */
async function getUserEvents(userId, startDate, endDate) {
  return redis.getEventsRange(userId, startDate, endDate);
}

/**
 * Get events for a specific date
 */
async function getDayEvents(userId, date) {
  return redis.getEvents(userId, date);
}

/**
 * Count events of a specific type for a user on a date
 */
async function countEvents(userId, eventType, date) {
  const events = await redis.getEvents(userId, date || new Date().toISOString().slice(0, 10));
  return events.filter(e => e.type === eventType).length;
}

// ═══════════════════════════════════════════════════════════════════════════════
// EXPRESS MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Express middleware that tracks API calls
 * Attach to routes: app.use('/api', trackingMiddleware)
 */
function trackingMiddleware(req, res, next) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = req.user?.id;
    
    if (userId && res.statusCode < 400) {
      // Track specific actions based on route
      const path = req.path;
      const method = req.method;
      
      if (method === 'POST' && path.includes('/complete-block')) {
        trackEvent(userId, EVENT_TYPES.BLOCK_COMPLETED, { duration, block_id: req.body?.block_id });
      } else if (method === 'POST' && path.includes('/skip-block')) {
        trackEvent(userId, EVENT_TYPES.BLOCK_SKIPPED, { 
          duration, block_id: req.body?.block_id, reason: req.body?.reason 
        });
      } else if (method === 'POST' && (path.includes('/check-habit') || path.includes('/check-in') || path.includes('/checkin'))) {
        trackEvent(userId, EVENT_TYPES.HABIT_CHECKED, { duration, habit_id: req.params?.id || req.body?.habit_id });
      } else if (method === 'POST' && path.includes('/start-day')) {
        trackEvent(userId, EVENT_TYPES.DAY_STARTED, { duration });
      } else if (method === 'POST' && path.includes('/end-day')) {
        trackEvent(userId, EVENT_TYPES.DAY_COMPLETED, { 
          duration, completion_rate: req.body?.completion_rate 
        });
      }
    }
  });
  
  next();
}

module.exports = {
  trackEvent,
  getUserEvents,
  getDayEvents,
  countEvents,
  trackingMiddleware,
  EVENT_TYPES,
};
