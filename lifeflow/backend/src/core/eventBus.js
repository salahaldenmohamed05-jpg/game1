/**
 * EventBus — LifeFlow Central Pub/Sub System
 * =============================================
 * Single source of truth for all system events.
 * Every lifecycle event (task, habit, decision, inactivity) flows through here.
 *
 * Event Types:
 *   TASK_COMPLETED   — user finished a task
 *   TASK_SKIPPED     — user skipped a task
 *   TASK_CREATED     — new task added
 *   HABIT_COMPLETED  — habit checked in
 *   ENERGY_UPDATED   — energy level changed
 *   DECISION_REJECTED — user rejected brain suggestion
 *   USER_INACTIVE    — no activity for 20+ minutes
 *
 * Usage:
 *   const eventBus = require('./eventBus');
 *   eventBus.emit('TASK_COMPLETED', { userId, taskId, ... });
 *   eventBus.subscribe('TASK_COMPLETED', handler);
 */

'use strict';

const logger = require('../utils/logger');

// ─── Event Type Registry ────────────────────────────────────────────────────
const EVENT_TYPES = {
  TASK_COMPLETED:     'TASK_COMPLETED',
  TASK_SKIPPED:       'TASK_SKIPPED',
  TASK_CREATED:       'TASK_CREATED',
  HABIT_COMPLETED:    'HABIT_COMPLETED',
  ENERGY_UPDATED:     'ENERGY_UPDATED',
  DECISION_REJECTED:  'DECISION_REJECTED',
  USER_INACTIVE:      'USER_INACTIVE',
};

// ─── Subscriber Registry ────────────────────────────────────────────────────
// Map<eventType, Set<handler>>
const subscribers = new Map();

// ─── Event Log (ring buffer for debugging) ──────────────────────────────────
const MAX_LOG = 100;
const eventLog = [];

/**
 * Subscribe to an event type.
 * @param {string} eventType - One of EVENT_TYPES
 * @param {Function} handler - async (payload) => void
 * @returns {Function} unsubscribe function
 */
function subscribe(eventType, handler) {
  if (!subscribers.has(eventType)) {
    subscribers.set(eventType, new Set());
  }
  subscribers.get(eventType).add(handler);
  logger.debug(`[EventBus] +subscriber for ${eventType} (total: ${subscribers.get(eventType).size})`);

  // Return unsubscribe function
  return () => {
    const subs = subscribers.get(eventType);
    if (subs) {
      subs.delete(handler);
      logger.debug(`[EventBus] -subscriber for ${eventType} (total: ${subs.size})`);
    }
  };
}

/**
 * Emit an event to all subscribers.
 * Non-blocking: all handlers run in parallel, errors are caught individually.
 * @param {string} eventType - One of EVENT_TYPES
 * @param {object} payload   - Event data (must include userId)
 */
function emit(eventType, payload = {}) {
  const ts = Date.now();
  const entry = { eventType, payload, ts, handlerCount: 0, errors: [] };

  // Log event
  eventLog.unshift(entry);
  if (eventLog.length > MAX_LOG) eventLog.pop();

  const subs = subscribers.get(eventType);
  if (!subs || subs.size === 0) {
    logger.debug(`[EventBus] ${eventType} emitted — no subscribers`);
    return;
  }

  entry.handlerCount = subs.size;
  logger.info(`[EventBus] ${eventType} → ${subs.size} handler(s) | userId=${payload.userId || 'N/A'}`);

  // Fire all handlers in parallel, never block the caller
  for (const handler of subs) {
    Promise.resolve()
      .then(() => handler(payload))
      .catch(err => {
        entry.errors.push(err.message);
        logger.error(`[EventBus] Handler error for ${eventType}:`, err.message);
      });
  }
}

/**
 * Get recent event log (for debugging/admin).
 * @param {number} limit
 * @returns {Array}
 */
function getLog(limit = 20) {
  return eventLog.slice(0, limit);
}

/**
 * Get subscriber count per event type.
 * @returns {object}
 */
function getStats() {
  const stats = {};
  for (const [type, subs] of subscribers) {
    stats[type] = subs.size;
  }
  return { subscribers: stats, logSize: eventLog.length };
}

/**
 * Clear all subscribers (for testing).
 */
function reset() {
  subscribers.clear();
  eventLog.length = 0;
}

module.exports = {
  EVENT_TYPES,
  subscribe,
  emit,
  getLog,
  getStats,
  reset,
};
