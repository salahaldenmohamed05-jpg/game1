/**
 * Redis Persistence Layer — Phase 7: Production Infrastructure
 * ==============================================================
 * Replaces ALL in-memory Maps with Redis-backed state management.
 * Provides atomic operations, TTL-based expiry, and crash-safe persistence.
 * 
 * Key Schema:
 *   adaptive:{userId}          → BehaviorState (24h TTL, auto-reset daily)
 *   notifications:{userId}     → NotificationState (24h TTL)
 *   notifications:cooldown:{userId}:{category} → cooldown marker (90min TTL)
 *   skip_history:{userId}      → SkipHistory (7d TTL)
 *   absence:{userId}           → lastActiveDate (30d TTL)
 *   events:{userId}:{date}     → daily event log (30d TTL)
 *   metrics:{date}             → daily aggregated metrics (90d TTL)
 *   ab:{userId}                → A/B variant assignment (90d TTL)
 *   behavioral:{userId}        → long-term behavioral profile (365d TTL)
 *   device_tokens:{userId}     → FCM device tokens (no TTL)
 *   queue:failures             → failed notification log (30d TTL)
 * 
 * Graceful Fallback: If Redis is unavailable, falls back to in-memory Maps
 * with the same interface — zero code changes needed in consumers.
 */

'use strict';

const logger = require('../utils/logger');
const { getCache, setCache, deleteCache, getCacheStats } = require('../config/redis');

// ── TTL Constants (seconds) ──────────────────────────────────────────────────
const TTL = {
  ADAPTIVE_STATE:     24 * 60 * 60,      // 24 hours
  NOTIFICATION_STATE: 24 * 60 * 60,      // 24 hours
  COOLDOWN:           90 * 60,            // 90 minutes
  SKIP_HISTORY:       7 * 24 * 60 * 60,  // 7 days
  ABSENCE:            30 * 24 * 60 * 60, // 30 days
  EVENTS:             30 * 24 * 60 * 60, // 30 days
  METRICS:            90 * 24 * 60 * 60, // 90 days
  AB_VARIANT:         90 * 24 * 60 * 60, // 90 days
  BEHAVIORAL:         365 * 24 * 60 * 60,// 365 days
  DEVICE_TOKENS:      365 * 24 * 60 * 60,// 365 days
  QUEUE_FAILURE:      30 * 24 * 60 * 60, // 30 days
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1. ADAPTIVE STATE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_ADAPTIVE_STATE = {
  dailySkips: 0,
  dailyCompletes: 0,
  consecutiveSkips: 0,
  skipCategories: [],
  skipReasons: [],
  energyLevel: 'high',
  procrastinationDetected: false,
  burnoutRisk: false,
  intensityLevel: 3,
  lastActionTime: null,
  totalXPToday: 0,
  date: null,
};

/**
 * Get adaptive behavior state for a user
 * Auto-resets if the date has changed (new day)
 */
async function getAdaptiveState(userId) {
  const key = `adaptive:${userId}`;
  try {
    let state = await getCache(key);
    const today = new Date().toISOString().slice(0, 10);

    if (!state || state.date !== today) {
      state = { ...DEFAULT_ADAPTIVE_STATE, date: today };
      await setCache(key, state, TTL.ADAPTIVE_STATE);
      logger.debug(`[Redis] Adaptive state initialized for user ${userId}`);
    }
    return state;
  } catch (err) {
    logger.error(`[Redis] getAdaptiveState failed for ${userId}:`, err.message);
    return { ...DEFAULT_ADAPTIVE_STATE, date: new Date().toISOString().slice(0, 10) };
  }
}

/**
 * Update adaptive state atomically
 */
async function setAdaptiveState(userId, state) {
  const key = `adaptive:${userId}`;
  try {
    await setCache(key, state, TTL.ADAPTIVE_STATE);
    return true;
  } catch (err) {
    logger.error(`[Redis] setAdaptiveState failed for ${userId}:`, err.message);
    return false;
  }
}

/**
 * Update a single field in adaptive state
 */
async function updateAdaptiveField(userId, field, value) {
  const state = await getAdaptiveState(userId);
  state[field] = value;
  return setAdaptiveState(userId, state);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. NOTIFICATION STATE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_NOTIFICATION_STATE = {
  dailyCount: 0,
  lastSentTime: null,
  date: null,
  sentCategories: [],
};

/**
 * Get notification state for a user
 */
async function getNotificationState(userId) {
  const key = `notifications:${userId}`;
  try {
    let state = await getCache(key);
    const today = new Date().toISOString().slice(0, 10);

    if (!state || state.date !== today) {
      state = { ...DEFAULT_NOTIFICATION_STATE, date: today };
      await setCache(key, state, TTL.NOTIFICATION_STATE);
    }
    return state;
  } catch (err) {
    logger.error(`[Redis] getNotificationState failed for ${userId}:`, err.message);
    return { ...DEFAULT_NOTIFICATION_STATE, date: new Date().toISOString().slice(0, 10) };
  }
}

async function setNotificationState(userId, state) {
  const key = `notifications:${userId}`;
  try {
    await setCache(key, state, TTL.NOTIFICATION_STATE);
    return true;
  } catch (err) {
    logger.error(`[Redis] setNotificationState failed for ${userId}:`, err.message);
    return false;
  }
}

/**
 * Check cooldown for a notification category
 */
async function checkCooldown(userId, category) {
  const key = `notifications:cooldown:${userId}:${category}`;
  try {
    const marker = await getCache(key);
    return !marker; // true if can send (no cooldown)
  } catch {
    return true; // on error, allow sending
  }
}

/**
 * Set cooldown marker for a category
 */
async function setCooldown(userId, category) {
  const key = `notifications:cooldown:${userId}:${category}`;
  try {
    await setCache(key, { set: Date.now() }, TTL.COOLDOWN);
    return true;
  } catch {
    return false;
  }
}

/**
 * Increment daily notification count and mark sent
 */
async function incrementNotificationCount(userId, category) {
  const state = await getNotificationState(userId);
  state.dailyCount++;
  state.lastSentTime = new Date().toISOString();
  state.sentCategories.push(category);
  await setNotificationState(userId, state);
  await setCooldown(userId, category);
  return state.dailyCount;
}

/**
 * Can send notification? Checks daily limit + cooldown
 */
async function canSendNotification(userId, category, maxDaily = 8) {
  const state = await getNotificationState(userId);
  if (state.dailyCount >= maxDaily) return false;
  return checkCooldown(userId, category);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. SKIP HISTORY PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

async function getSkipHistory(userId) {
  const key = `skip_history:${userId}`;
  try {
    return (await getCache(key)) || { count: 0, categories: {}, lastSkipTime: null, reasons: [] };
  } catch {
    return { count: 0, categories: {}, lastSkipTime: null, reasons: [] };
  }
}

async function addSkipEvent(userId, category, reason) {
  const history = await getSkipHistory(userId);
  history.count++;
  history.categories[category] = (history.categories[category] || 0) + 1;
  history.lastSkipTime = Date.now();
  if (reason) history.reasons.push({ reason, time: Date.now() });
  // Keep only last 50 reasons
  if (history.reasons.length > 50) history.reasons = history.reasons.slice(-50);
  await setCache(`skip_history:${userId}`, history, TTL.SKIP_HISTORY);
  return history;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. USER ABSENCE TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

async function trackUserActivity(userId) {
  const key = `absence:${userId}`;
  await setCache(key, { lastActive: new Date().toISOString() }, TTL.ABSENCE);
}

async function getLastActivity(userId) {
  const key = `absence:${userId}`;
  try {
    const data = await getCache(key);
    return data?.lastActive || null;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. EVENT TRACKING PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Log an event to Redis with full context
 */
async function logEvent(userId, eventType, context = {}) {
  const date = new Date().toISOString().slice(0, 10);
  const key = `events:${userId}:${date}`;
  try {
    let events = (await getCache(key)) || [];
    events.push({
      type: eventType,
      timestamp: new Date().toISOString(),
      user_id: userId,
      ...context,
    });
    // Cap at 500 events per user per day
    if (events.length > 500) events = events.slice(-500);
    await setCache(key, events, TTL.EVENTS);
    return true;
  } catch (err) {
    logger.error(`[Redis] logEvent failed:`, err.message);
    return false;
  }
}

/**
 * Get events for a user on a specific date
 */
async function getEvents(userId, date) {
  const key = `events:${userId}:${date || new Date().toISOString().slice(0, 10)}`;
  try {
    return (await getCache(key)) || [];
  } catch {
    return [];
  }
}

/**
 * Get events for a date range
 */
async function getEventsRange(userId, startDate, endDate) {
  const events = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    const dayEvents = await getEvents(userId, dateStr);
    events.push(...dayEvents);
  }
  return events;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. METRICS AGGREGATION PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

async function getDailyMetrics(date) {
  const key = `metrics:${date || new Date().toISOString().slice(0, 10)}`;
  try {
    return (await getCache(key)) || {
      date: date || new Date().toISOString().slice(0, 10),
      notifications_sent: 0,
      notifications_opened: 0,
      notifications_actioned: 0,
      blocks_completed: 0,
      blocks_skipped: 0,
      habits_checked: 0,
      days_started: 0,
      days_completed: 0,
      active_users: 0,
      unique_users: [],
    };
  } catch {
    return { date, notifications_sent: 0, notifications_opened: 0, notifications_actioned: 0,
             blocks_completed: 0, blocks_skipped: 0, habits_checked: 0, days_started: 0,
             days_completed: 0, active_users: 0, unique_users: [] };
  }
}

async function incrementMetric(metricName, userId) {
  const date = new Date().toISOString().slice(0, 10);
  const key = `metrics:${date}`;
  const metrics = await getDailyMetrics(date);
  metrics[metricName] = (metrics[metricName] || 0) + 1;
  if (userId && !metrics.unique_users.includes(userId)) {
    metrics.unique_users.push(userId);
    metrics.active_users = metrics.unique_users.length;
  }
  await setCache(key, metrics, TTL.METRICS);
  return metrics;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. A/B TESTING PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

async function getABVariant(userId) {
  const key = `ab:${userId}`;
  try {
    return (await getCache(key)) || null;
  } catch {
    return null;
  }
}

async function setABVariant(userId, variant) {
  const key = `ab:${userId}`;
  await setCache(key, variant, TTL.AB_VARIANT);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. LONG-TERM BEHAVIORAL DATA
// ═══════════════════════════════════════════════════════════════════════════════

async function getBehavioralProfile(userId) {
  const key = `behavioral:${userId}`;
  try {
    return (await getCache(key)) || {
      userId,
      created: new Date().toISOString(),
      habitConsistency: {},
      energyTrends: [],
      skipPatterns: {},
      peakProductivityHours: [],
      avgCompletionRate: 0,
      streakHistory: [],
      moodCorrelations: {},
      procrastinationTriggers: [],
      totalDaysTracked: 0,
    };
  } catch {
    return { userId, created: new Date().toISOString() };
  }
}

async function updateBehavioralProfile(userId, updates) {
  const profile = await getBehavioralProfile(userId);
  const updated = { ...profile, ...updates, lastUpdated: new Date().toISOString() };
  await setCache(`behavioral:${userId}`, updated, TTL.BEHAVIORAL);
  return updated;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. DEVICE TOKEN PERSISTENCE (FCM)
// ═══════════════════════════════════════════════════════════════════════════════

async function getDeviceTokens(userId) {
  const key = `device_tokens:${userId}`;
  try {
    return (await getCache(key)) || [];
  } catch {
    return [];
  }
}

async function addDeviceToken(userId, token, platform = 'web') {
  const tokens = await getDeviceTokens(userId);
  const exists = tokens.find(t => t.token === token);
  if (!exists) {
    tokens.push({ token, platform, registeredAt: new Date().toISOString() });
    // Keep max 10 tokens per user
    if (tokens.length > 10) tokens.shift();
    await setCache(`device_tokens:${userId}`, tokens, TTL.DEVICE_TOKENS);
  }
  return tokens;
}

async function removeDeviceToken(userId, token) {
  const tokens = await getDeviceTokens(userId);
  const filtered = tokens.filter(t => t.token !== token);
  await setCache(`device_tokens:${userId}`, filtered, TTL.DEVICE_TOKENS);
  return filtered;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. FAILURE QUEUE PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════════════

async function logFailure(type, context) {
  const key = `queue:failures:${new Date().toISOString().slice(0, 10)}`;
  try {
    let failures = (await getCache(key)) || [];
    failures.push({
      type,
      timestamp: new Date().toISOString(),
      ...context,
    });
    if (failures.length > 1000) failures = failures.slice(-1000);
    await setCache(key, failures, TTL.QUEUE_FAILURE);
    return true;
  } catch {
    return false;
  }
}

async function getFailures(date) {
  const key = `queue:failures:${date || new Date().toISOString().slice(0, 10)}`;
  try {
    return (await getCache(key)) || [];
  } catch {
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

function getRedisHealth() {
  const stats = getCacheStats();
  return {
    backend: stats.backend,
    connected: stats.redis_connected,
    inMemorySize: stats.in_memory_size,
    maxSize: stats.max_size,
    hitRate: stats.hit_rate,
    hits: stats.hits,
    misses: stats.misses,
  };
}

module.exports = {
  // Adaptive State
  getAdaptiveState,
  setAdaptiveState,
  updateAdaptiveField,
  
  // Notification State
  getNotificationState,
  setNotificationState,
  canSendNotification,
  incrementNotificationCount,
  checkCooldown,
  setCooldown,
  
  // Skip History
  getSkipHistory,
  addSkipEvent,
  
  // User Absence
  trackUserActivity,
  getLastActivity,
  
  // Event Tracking
  logEvent,
  getEvents,
  getEventsRange,
  
  // Metrics
  getDailyMetrics,
  incrementMetric,
  
  // A/B Testing
  getABVariant,
  setABVariant,
  
  // Behavioral Profile
  getBehavioralProfile,
  updateBehavioralProfile,
  
  // Device Tokens
  getDeviceTokens,
  addDeviceToken,
  removeDeviceToken,
  
  // Failure Queue
  logFailure,
  getFailures,
  
  // Health
  getRedisHealth,
  
  // TTL Constants
  TTL,
};
