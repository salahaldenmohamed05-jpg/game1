/**
 * Adaptive Intelligence V2 — Phase 6: System Brain
 * ===================================================
 * Detects behavioral patterns and adapts the system in real-time:
 *   1. Procrastination Detection: repeated skips, reschedules, delay patterns
 *   2. Energy Drop Detection: completion rate drops, skip surges, time-of-day
 *   3. Skip Pattern Analysis: identifies avoidance categories, suggests alternatives
 *   4. Dynamic Block Reordering: rearranges plan based on real-time behavior
 *   5. Intensity Adjustment: scales notification frequency/tone based on engagement
 *   6. Break Suggestions: detects burnout signals, inserts recovery blocks
 * 
 * This is the "brain" that makes LifeFlow responsive to the user's state.
 */

'use strict';

const moment = require('moment-timezone');
const logger = require('../utils/logger');
const redis = require('./redis.persistence.service');

// ── Thresholds ───────────────────────────────────────────────────────────────
const PROCRASTINATION_SKIP_THRESHOLD = 3;    // 3 skips in a day = procrastination flag
const ENERGY_DROP_SKIP_SURGE = 2;             // 2 skips in a row = energy drop
const RESCHEDULE_ALERT_THRESHOLD = 2;         // 2+ reschedules = flagged task
const BURNOUT_SIGNAL_THRESHOLD = 5;           // 5+ skips in 2 days = burnout risk
const COMEBACK_ABSENCE_DAYS = 2;              // 2 days absent = comeback mode

// ── Redis-backed behavioral state (Phase 7: replaces in-memory Map) ──────────
// All state is now persisted in Redis with 24h TTL, auto-reset daily.

async function getState(userId) {
  return redis.getAdaptiveState(userId);
}

async function saveState(userId, state) {
  return redis.setAdaptiveState(userId, state);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EVENT HANDLERS — Called on user actions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Called when a user completes a block
 */
async function onBlockComplete(userId, block) {
  const state = await getState(userId);
  state.dailyCompletes++;
  state.consecutiveSkips = 0; // Reset skip streak
  state.lastActionTime = new Date().toISOString();
  state.totalXPToday += block.xp || 0;

  // Boost energy detection on completion
  if (state.dailyCompletes >= 3) {
    state.energyLevel = 'high';
    state.intensityLevel = Math.max(1, state.intensityLevel - 1); // Reduce nudging
  }

  // Detect momentum
  const momentum = state.dailyCompletes / Math.max(1, state.dailyCompletes + state.dailySkips);
  
  logger.debug(`[ADAPTIVE-V2] User ${userId} completed block. Momentum: ${Math.round(momentum * 100)}%`);

  await saveState(userId, state);
  return analyzeState(userId);
}

/**
 * Called when a user skips a block
 */
async function onBlockSkip(userId, block, reason) {
  const state = await getState(userId);
  state.dailySkips++;
  state.consecutiveSkips++;
  state.lastActionTime = new Date().toISOString();

  if (block.type) state.skipCategories.push(block.type);
  if (reason) state.skipReasons.push(reason);

  // Detect energy drop
  if (state.consecutiveSkips >= ENERGY_DROP_SKIP_SURGE) {
    state.energyLevel = state.energyLevel === 'low' ? 'critical' : 'low';
  }

  // Detect procrastination
  if (state.dailySkips >= PROCRASTINATION_SKIP_THRESHOLD) {
    state.procrastinationDetected = true;
  }

  // Detect burnout risk (check reasons)
  const overwhelmedCount = state.skipReasons.filter(r => 
    r === 'overwhelmed' || r === 'low_energy' || r === 'burnout'
  ).length;
  if (overwhelmedCount >= 2 || state.dailySkips >= BURNOUT_SIGNAL_THRESHOLD) {
    state.burnoutRisk = true;
  }

  // Increase intensity (more nudges needed)
  state.intensityLevel = Math.min(5, state.intensityLevel + 1);

  logger.debug(`[ADAPTIVE-V2] User ${userId} skipped. Consecutive: ${state.consecutiveSkips}, Total: ${state.dailySkips}`);

  await saveState(userId, state);
  return analyzeState(userId);
}

/**
 * Called when user is idle for too long
 */
async function onIdleDetected(userId, idleMinutes) {
  const state = await getState(userId);
  
  if (idleMinutes >= 60) {
    state.energyLevel = 'low';
    state.intensityLevel = Math.min(5, state.intensityLevel + 1);
  } else if (idleMinutes >= 30) {
    state.intensityLevel = Math.min(5, state.intensityLevel + 1);
  }

  await saveState(userId, state);
  return analyzeState(userId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ANALYSIS ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Analyze user state and return recommendations
 */
async function analyzeState(userId) {
  const state = await getState(userId);
  const recommendations = [];

  // 1. Procrastination intervention
  if (state.procrastinationDetected) {
    recommendations.push({
      type: 'procrastination_intervention',
      severity: 'high',
      message_ar: 'لاحظت إنك بتتخطى كتير. يمكن المهام كبيرة — نقسّمها لخطوات أصغر؟',
      action: 'break_down_tasks',
      data: {
        skip_count: state.dailySkips,
        common_categories: getMostSkippedCategories(state),
        suggestion: 'قسّم المهمة الحالية لـ 3 خطوات صغيرة',
      },
    });
  }

  // 2. Energy drop intervention
  if (state.energyLevel === 'low' || state.energyLevel === 'critical') {
    recommendations.push({
      type: 'energy_intervention',
      severity: state.energyLevel === 'critical' ? 'high' : 'medium',
      message_ar: state.energyLevel === 'critical'
        ? 'طاقتك منخفضة جداً — خذ استراحة 15 دقيقة. جسمك أولوية! 💙'
        : 'خذ استراحة قصيرة — 5 دقائق تنعشك وتخليك تكمل.',
      action: 'suggest_break',
      data: {
        energy_level: state.energyLevel,
        consecutive_skips: state.consecutiveSkips,
        break_duration: state.energyLevel === 'critical' ? 15 : 5,
      },
    });
  }

  // 3. Burnout risk
  if (state.burnoutRisk) {
    recommendations.push({
      type: 'burnout_alert',
      severity: 'critical',
      message_ar: 'ملاحظ إنك مرهق اليوم. قلّل المهام وركّز على أهم 2 بس. صحتك أهم! 🌿',
      action: 'reduce_load',
      data: {
        daily_skips: state.dailySkips,
        overwhelm_count: state.skipReasons.filter(r => r === 'overwhelmed').length,
        suggestion: 'خلّي اليوم خفيف — أهم 2 مهام فقط',
      },
    });
  }

  // 4. Category avoidance pattern
  const avoidedCategories = getMostSkippedCategories(state);
  if (avoidedCategories.length > 0) {
    recommendations.push({
      type: 'avoidance_pattern',
      severity: 'low',
      message_ar: `لاحظت إنك بتتجنب مهام "${avoidedCategories[0]}" — ممكن نحاول طريقة مختلفة؟`,
      action: 'suggest_alternative',
      data: {
        avoided_categories: avoidedCategories,
        suggestion: 'جرّب تبدأ بأسهل مهمة في هذه الفئة',
      },
    });
  }

  // 5. Intensity adjustment
  recommendations.push({
    type: 'intensity_adjustment',
    severity: 'info',
    action: 'adjust_intensity',
    data: {
      current_level: state.intensityLevel,
      suggested_nudge_frequency: getIntensityFrequency(state.intensityLevel),
    },
  });

  return {
    userId,
    state: {
      energyLevel: state.energyLevel,
      procrastination: state.procrastinationDetected,
      burnoutRisk: state.burnoutRisk,
      momentum: state.dailyCompletes / Math.max(1, state.dailyCompletes + state.dailySkips),
      intensityLevel: state.intensityLevel,
      dailyStats: {
        completes: state.dailyCompletes,
        skips: state.dailySkips,
        xp: state.totalXPToday,
      },
    },
    recommendations,
  };
}

/**
 * Reorder plan blocks based on current behavioral state
 */
async function reorderBlocks(userId, blocks) {
  const state = await getState(userId);
  const pending = blocks.filter(b => b.status === 'pending');
  const nonPending = blocks.filter(b => b.status !== 'pending');

  if (pending.length === 0) return blocks;

  // If energy is low, move lighter tasks first
  if (state.energyLevel === 'low' || state.energyLevel === 'critical') {
    pending.sort((a, b) => {
      const durationA = a.duration || 20;
      const durationB = b.duration || 20;
      // Shorter tasks first when tired
      if (durationA !== durationB) return durationA - durationB;
      // Breaks first
      if (a.type === 'break' && b.type !== 'break') return -1;
      if (b.type === 'break' && a.type !== 'break') return 1;
      return 0;
    });

    // Insert a break block at the beginning if none exists
    if (!pending.some(b => b.type === 'break')) {
      pending.unshift({
        id: `break_recovery_${Date.now()}`,
        type: 'break',
        title: 'استراحة تعافي',
        duration: state.energyLevel === 'critical' ? 15 : 5,
        status: 'pending',
        icon: '🧘',
        color: '#10B981',
        _injected: true,
      });
    }
  }

  // If procrastination detected, move the most-skipped category items to end
  if (state.procrastinationDetected) {
    const avoided = getMostSkippedCategories(state);
    if (avoided.length > 0) {
      const avoidedSet = new Set(avoided);
      const preferred = pending.filter(b => !avoidedSet.has(b.type));
      const deferred = pending.filter(b => avoidedSet.has(b.type));
      return [...nonPending, ...preferred, ...deferred];
    }
  }

  return [...nonPending, ...pending];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMostSkippedCategories(state) {
  if (state.skipCategories.length === 0) return [];
  
  const counts = {};
  state.skipCategories.forEach(cat => {
    counts[cat] = (counts[cat] || 0) + 1;
  });

  return Object.entries(counts)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);
}

function getIntensityFrequency(level) {
  const map = {
    1: 'every_4_hours',
    2: 'every_3_hours',
    3: 'every_2_hours',
    4: 'every_90_min',
    5: 'every_hour',
  };
  return map[level] || 'every_2_hours';
}

// ── API: Get user's adaptive state ───────────────────────────────────────────

function getUserAdaptiveState(userId) {
  return analyzeState(userId);
}

function resetDailyState(userId) {
  userBehaviorState.delete(userId);
}

module.exports = {
  onBlockComplete,
  onBlockSkip,
  onIdleDetected,
  analyzeState,
  reorderBlocks,
  getUserAdaptiveState,
  resetDailyState,
  getState,
};
