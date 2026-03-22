/**
 * Adaptive Behavior Service — خدمة السلوك التكيّفي
 * ===================================================
 * Tracks user reactions to AI suggestions.
 * Reduces suggestion frequency if ignored.
 * Increases engagement if suggestions are accepted.
 * Learns user patterns over time to improve relevance.
 */

'use strict';

const logger = require('../utils/logger');
const memory = require('./memory.service');

// ─── Interaction Types ────────────────────────────────────────────────────────
const INTERACTION = {
  ACCEPTED: 'accepted',
  IGNORED : 'ignored',
  REJECTED: 'rejected',
  EXECUTED: 'executed',
};

// ─── Default Behavior Settings ────────────────────────────────────────────────
const DEFAULT_BEHAVIOR = {
  suggestionRate     : 1.0,   // multiplier: 1 = normal, 0.5 = half, 2 = double
  engagementScore    : 0.5,   // 0-1 scale
  preferredSuggestions: [],   // types user accepts most
  ignoredSuggestions : [],    // types user ignores most
  lastInteractionTs  : null,
  dailyInteractions  : 0,
  totalInteractions  : 0,
};

// ─── Per-User Behavior Store ──────────────────────────────────────────────────
const behaviorStore = new Map(); // userId → behavior object

function getBehavior(userId) {
  let behavior = behaviorStore.get(userId);
  if (!behavior) {
    behavior = { ...DEFAULT_BEHAVIOR, userId };
    behaviorStore.set(userId, behavior);
  }
  return behavior;
}

// ─── Record Interaction ───────────────────────────────────────────────────────
/**
 * Record a user interaction with an AI suggestion.
 *
 * @param {string} userId
 * @param {string} suggestionType  - e.g., 'overdue_tasks', 'energy_drop', 'habit_streak_break'
 * @param {string} action          - 'accepted' | 'ignored' | 'rejected' | 'executed'
 */
function recordInteraction(userId, suggestionType, action) {
  const behavior = getBehavior(userId);
  const now      = Date.now();

  // Update interaction counters
  behavior.totalInteractions++;
  behavior.dailyInteractions++;
  behavior.lastInteractionTs = now;

  // Update acceptance/ignore lists
  if (action === INTERACTION.ACCEPTED || action === INTERACTION.EXECUTED) {
    // Add to preferred if not already there
    if (!behavior.preferredSuggestions.includes(suggestionType)) {
      behavior.preferredSuggestions.push(suggestionType);
    }
    // Remove from ignored
    behavior.ignoredSuggestions = behavior.ignoredSuggestions.filter(t => t !== suggestionType);

    // Increase suggestion rate slightly
    behavior.suggestionRate = Math.min(1.5, behavior.suggestionRate + 0.1);
    behavior.engagementScore = Math.min(1.0, behavior.engagementScore + 0.05);

  } else if (action === INTERACTION.IGNORED) {
    // Track ignored suggestions
    if (!behavior.ignoredSuggestions.includes(suggestionType)) {
      behavior.ignoredSuggestions.push(suggestionType);
    }

    // Decrease suggestion rate for this type
    behavior.suggestionRate = Math.max(0.3, behavior.suggestionRate - 0.05);
    behavior.engagementScore = Math.max(0.1, behavior.engagementScore - 0.02);

  } else if (action === INTERACTION.REJECTED) {
    // Strong signal to reduce
    behavior.ignoredSuggestions.push(suggestionType);
    behavior.suggestionRate = Math.max(0.2, behavior.suggestionRate - 0.15);
    behavior.engagementScore = Math.max(0.1, behavior.engagementScore - 0.08);
  }

  // Cap lists
  if (behavior.preferredSuggestions.length > 10) {
    behavior.preferredSuggestions = behavior.preferredSuggestions.slice(-10);
  }
  if (behavior.ignoredSuggestions.length > 10) {
    behavior.ignoredSuggestions = behavior.ignoredSuggestions.slice(-10);
  }

  // Also update memory long-term
  memory.recordSuggestionInteraction(userId, suggestionType, action);

  logger.debug('[ADAPTIVE] Recorded interaction', {
    userId, suggestionType, action,
    newRate   : behavior.suggestionRate.toFixed(2),
    engagement: behavior.engagementScore.toFixed(2),
  });

  return behavior;
}

// ─── Should Show Suggestion ───────────────────────────────────────────────────
/**
 * Determines if a suggestion should be shown based on user behavior.
 *
 * @param {string} userId
 * @param {string} suggestionType
 * @returns {boolean}
 */
function shouldShowSuggestion(userId, suggestionType) {
  const behavior = getBehavior(userId);

  // If suggestion rate is very low, skip
  if (behavior.suggestionRate < 0.3) {
    logger.debug('[ADAPTIVE] Skipping suggestion (low rate)', { userId, suggestionType });
    return false;
  }

  // If this specific type is in ignored list, reduce probability
  if (behavior.ignoredSuggestions.includes(suggestionType)) {
    // Still show occasionally (30% chance) to re-engage
    const show = Math.random() < 0.3;
    logger.debug('[ADAPTIVE] Ignored type probabilistic check', { show, suggestionType });
    return show;
  }

  // Normal probability based on rate
  const threshold = 1.0 - behavior.suggestionRate;
  return Math.random() >= threshold;
}

// ─── Get Ranked Suggestions ───────────────────────────────────────────────────
/**
 * Filter and rank a list of suggestions based on user preferences.
 *
 * @param {string} userId
 * @param {Array}  suggestions - array of { type, message, priority, ... }
 * @param {number} maxCount    - max suggestions to return
 * @returns {Array} ranked and filtered suggestions
 */
function rankSuggestions(userId, suggestions, maxCount = 3) {
  if (!suggestions || suggestions.length === 0) return [];

  const behavior = getBehavior(userId);

  // Score each suggestion
  const scored = suggestions.map(s => {
    let score = 0;

    // Priority score
    if (s.priority === 'high')   score += 3;
    if (s.priority === 'medium') score += 2;
    if (s.priority === 'low')    score += 1;

    // User preference bonus
    if (behavior.preferredSuggestions.includes(s.type)) score += 2;

    // Penalty for ignored types
    if (behavior.ignoredSuggestions.includes(s.type)) score -= 2;

    return { ...s, _score: score };
  });

  // Sort by score descending
  scored.sort((a, b) => b._score - a._score);

  // Filter out low-score suggestions
  const filtered = scored.filter(s => s._score >= 0);

  return filtered.slice(0, maxCount).map(({ _score, ...s }) => s);
}

// ─── Adaptive Suggestions Generator ──────────────────────────────────────────
/**
 * Generate adaptive suggestion chips based on user behavior.
 *
 * @param {string} userId
 * @param {string} intentCategory
 * @returns {Array<string>} suggestion labels
 */
function getAdaptiveSuggestions(userId, intentCategory) {
  const behavior = getBehavior(userId);
  const { getSuggestions } = require('../config/personality.config');

  // Base suggestions from personality config
  const baseSuggestions = getSuggestions(intentCategory) || getSuggestions('default');

  // If user is highly engaged, add more suggestions
  if (behavior.engagementScore > 0.7) {
    const extra = getSuggestions('task');
    const combined = [...new Set([...baseSuggestions, ...extra])];
    return combined.slice(0, 4);
  }

  // If engagement is low, return fewer, more targeted suggestions
  if (behavior.engagementScore < 0.3) {
    return baseSuggestions.slice(0, 2);
  }

  return baseSuggestions;
}

// ─── Engagement Report ────────────────────────────────────────────────────────
function getEngagementReport(userId) {
  const behavior = getBehavior(userId);
  const memStats = memory.getStats(userId);

  const acceptanceRate = memStats.suggestionsShown > 0
    ? Math.round((memStats.suggestionsAccepted / memStats.suggestionsShown) * 100)
    : 0;

  return {
    userId,
    suggestionRate      : Math.round(behavior.suggestionRate * 100),
    engagementScore     : Math.round(behavior.engagementScore * 100),
    acceptanceRate      : `${acceptanceRate}%`,
    totalInteractions   : behavior.totalInteractions,
    preferredSuggestions: behavior.preferredSuggestions,
    ignoredSuggestions  : behavior.ignoredSuggestions,
    lastInteraction     : behavior.lastInteractionTs
      ? new Date(behavior.lastInteractionTs).toISOString()
      : null,
  };
}

// ─── Policy Adaptation (Phase 7) ─────────────────────────────────────────────
/**
 * Adapts the AI execution policy based on cumulative user interactions.
 *
 * Strategy:
 *  - High acceptance rate  (>70%) → upgrade autonomy toward ACTIVE
 *  - High rejection rate   (>40%) → downgrade toward PASSIVE
 *  - Neutral behavior             → stay at SUGGESTIVE
 *
 * Returns the recommended autonomy level change, if any.
 *
 * @param {string} userId
 * @returns {{ recommended_level: number, reason: string, changed: boolean }}
 */
function adaptPolicy(userId) {
  const behavior = getBehavior(userId);
  const memStats = memory.getStats(userId);

  const total    = memStats.suggestionsShown || behavior.totalInteractions;
  if (total < 5) {
    return { recommended_level: null, reason: 'Not enough data', changed: false };
  }

  const accepted  = memStats.suggestionsAccepted || 0;
  const acceptRate = accepted / total;

  let newLevel = null;
  let reason   = '';

  const { setUserAutonomy, getUserAutonomy, AUTONOMY } = require('../config/execution.policy');
  const currentLevel = getUserAutonomy(userId);

  if (acceptRate > 0.70 && currentLevel < AUTONOMY.ACTIVE) {
    newLevel = currentLevel + 1;
    reason   = `معدل القبول ${Math.round(acceptRate * 100)}% — رفع مستوى الاستقلالية`;
  } else if (acceptRate < 0.25 && currentLevel > AUTONOMY.PASSIVE) {
    newLevel = currentLevel - 1;
    reason   = `معدل الرفض مرتفع — خفض مستوى الاستقلالية`;
  } else {
    return { recommended_level: currentLevel, reason: 'مستوى مناسب', changed: false };
  }

  setUserAutonomy(userId, newLevel);
  logger.info('[ADAPTIVE] Policy adapted', { userId, from: currentLevel, to: newLevel, acceptRate });

  return { recommended_level: newLevel, reason, changed: true };
}

// ─── Get Policy Status ────────────────────────────────────────────────────────
function getPolicyStatus(userId) {
  const { getUserAutonomy, getUserAIMode, AUTONOMY } = require('../config/execution.policy');
  const level = getUserAutonomy(userId);
  const mode  = getUserAIMode(userId);

  const label = level === AUTONOMY.PASSIVE    ? 'سلبي — اقتراحات فقط'
    : level === AUTONOMY.ACTIVE     ? 'نشط — تنفيذ تلقائي'
    : 'مقترح — تنفيذ آمن تلقائياً';

  return { level, mode, label };
}

// ─── Reset Behavior ───────────────────────────────────────────────────────────
function resetBehavior(userId) {
  behaviorStore.delete(userId);
  logger.info('[ADAPTIVE] Behavior reset for user:', userId);
}

// ─── Daily Reset ──────────────────────────────────────────────────────────────
setInterval(() => {
  const hour = new Date().getHours();
  if (hour === 0) {
    for (const [, behavior] of behaviorStore) {
      behavior.dailyInteractions = 0;
    }
    logger.debug('[ADAPTIVE] Daily interaction counts reset');
  }
}, 60 * 60 * 1000);

module.exports = {
  INTERACTION,
  recordInteraction,
  shouldShowSuggestion,
  rankSuggestions,
  getAdaptiveSuggestions,
  getEngagementReport,
  adaptPolicy,
  getPolicyStatus,
  resetBehavior,
  getBehavior,
};
