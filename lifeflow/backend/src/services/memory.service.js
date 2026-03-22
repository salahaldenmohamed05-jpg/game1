/**
 * Memory Service — خدمة الذاكرة
 * ================================
 * Short-term: last 10 conversation messages per user (in-memory, 1h TTL)
 * Long-term:  user behavior patterns stored persistently
 *             - Focus hours (peak productivity times)
 *             - Habit behavior (completion patterns)
 *             - Mood trends (over past weeks)
 *             - User preferences (tone, verbosity, etc.)
 *             - Interaction history (accepted/rejected suggestions)
 */

'use strict';

const moment = require('moment-timezone');
const logger  = require('../utils/logger');

// ─── Short-Term Memory ────────────────────────────────────────────────────────
const SHORT_TERM_TTL = 60 * 60 * 1000;   // 1 hour
const MAX_SHORT_TERM = 10;               // last 10 messages

const shortTermStore = new Map(); // userId → { messages[], lastActivity, createdAt }

// ─── Long-Term Memory ────────────────────────────────────────────────────────
// In-memory for now (no schema change needed). Persists for session lifetime.
// Will survive across conversations within same process.

const longTermStore = new Map(); // userId → LongTermProfile

// ─── Short-Term Operations ────────────────────────────────────────────────────

function getShortTerm(userId) {
  const now  = Date.now();
  let mem    = shortTermStore.get(userId);

  if (mem && now - mem.lastActivity > SHORT_TERM_TTL) {
    shortTermStore.delete(userId);
    mem = null;
  }

  if (!mem) {
    mem = { messages: [], lastActivity: now, createdAt: now };
    shortTermStore.set(userId, mem);
  }

  mem.lastActivity = now;
  return mem;
}

/**
 * Add a message to short-term memory.
 * @param {string} userId
 * @param {'user'|'assistant'} role
 * @param {string} content
 * @param {object} meta - optional metadata (intent, action, etc.)
 */
function addShortTerm(userId, role, content, meta = {}) {
  const mem = getShortTerm(userId);

  mem.messages.push({
    role,
    content: content?.slice(0, 500) || '',  // cap at 500 chars to save memory
    timestamp: Date.now(),
    ...meta,
  });

  // Keep only last MAX_SHORT_TERM messages
  if (mem.messages.length > MAX_SHORT_TERM) {
    mem.messages = mem.messages.slice(-MAX_SHORT_TERM);
  }

  logger.debug(`[MEMORY] Short-term: added ${role} message, total=${mem.messages.length}`);
}

/**
 * Get recent messages formatted for prompt injection.
 * @param {string} userId
 * @param {number} limit - how many to include (default: 6 = 3 turns)
 */
function getRecentMessages(userId, limit = 6) {
  const mem = getShortTerm(userId);
  return mem.messages.slice(-limit);
}

/**
 * Build conversation history string for prompt injection.
 */
function buildHistoryString(userId, limit = 6) {
  const messages = getRecentMessages(userId, limit);
  if (messages.length === 0) return '';

  return messages
    .map(m => `${m.role === 'user' ? 'المستخدم' : 'LifeFlow'}: ${m.content}`)
    .join('\n');
}

function clearShortTerm(userId) {
  shortTermStore.delete(userId);
  logger.debug(`[MEMORY] Short-term cleared for user=${userId}`);
}

function getShortTermStats(userId) {
  const mem = shortTermStore.get(userId);
  if (!mem) return { messages: 0, age_minutes: 0 };
  return {
    messages   : mem.messages.length,
    age_minutes: Math.round((Date.now() - mem.createdAt) / 60000),
    last_active: new Date(mem.lastActivity).toISOString(),
  };
}

// ─── Long-Term Memory Operations ─────────────────────────────────────────────

function getLongTerm(userId) {
  let profile = longTermStore.get(userId);
  if (!profile) {
    profile = createEmptyProfile(userId);
    longTermStore.set(userId, profile);
  }
  return profile;
}

function createEmptyProfile(userId) {
  return {
    userId,
    createdAt         : Date.now(),
    updatedAt         : Date.now(),

    // Focus hours: hour → score (higher = more productive during that hour)
    focusHours        : {},  // { '9': 8, '10': 9, '14': 6, ... }

    // Mood trends: rolling 14-day mood data
    moodTrend         : [],  // [{ date, score, emoji }, ...]

    // Habit behavior: habit completion rates
    habitBehavior     : {},  // { habitId: { name, totalDays, completedDays, rate } }

    // Preferences derived from usage
    preferences       : {
      preferredTaskPriority: 'medium',  // usually created tasks priority
      verbosity             : 'normal', // 'brief' | 'normal' | 'detailed'
      topCategories         : [],       // most used categories
    },

    // Suggestion interaction history
    suggestionHistory : [],  // [{ type, action: 'accepted'|'ignored'|'rejected', ts }]

    // Stress triggers detected
    stressTriggers    : [],  // ['exam_season', 'overdue_tasks', 'low_energy', ...]

    // Peak productivity windows
    peakWindows       : [],  // [{ startHour, endHour, productivityScore }]

    // Interaction counters
    stats             : {
      totalMessages   : 0,
      tasksCreated    : 0,
      tasksCompleted  : 0,
      habitsChecked   : 0,
      moodLogged      : 0,
      suggestionsShown: 0,
      suggestionsAccepted: 0,
    },
  };
}

// ─── Long-Term: Focus Hours ───────────────────────────────────────────────────

/**
 * Record task completion or high-productivity event at a specific hour.
 */
function recordFocusEvent(userId, hour, score = 1) {
  const profile = getLongTerm(userId);
  const h = String(hour);
  profile.focusHours[h] = (profile.focusHours[h] || 0) + score;
  profile.updatedAt = Date.now();
}

/**
 * Get top N focus hours (sorted by score).
 */
function getTopFocusHours(userId, n = 3) {
  const profile = getLongTerm(userId);
  return Object.entries(profile.focusHours)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([hour, score]) => ({ hour: parseInt(hour), score }));
}

// ─── Long-Term: Mood Trends ───────────────────────────────────────────────────

function recordMood(userId, score, date) {
  const profile = getLongTerm(userId);
  const entry   = { date: date || new Date().toISOString().slice(0, 10), score, ts: Date.now() };

  // Remove duplicate date
  profile.moodTrend = profile.moodTrend.filter(m => m.date !== entry.date);
  profile.moodTrend.push(entry);

  // Keep last 14 days
  profile.moodTrend = profile.moodTrend.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 14);
  profile.stats.moodLogged++;
  profile.updatedAt = Date.now();
}

function getMoodTrend(userId, days = 7) {
  const profile  = getLongTerm(userId);
  const cutoff   = moment().subtract(days, 'days').format('YYYY-MM-DD');
  const recent   = profile.moodTrend.filter(m => m.date >= cutoff);

  if (recent.length === 0) return { trend: 'unknown', avg: null, data: [] };

  const avg    = recent.reduce((s, m) => s + m.score, 0) / recent.length;
  const sorted = recent.sort((a, b) => a.date.localeCompare(b.date));

  // Simple trend: compare first half vs second half
  let trend = 'stable';
  if (sorted.length >= 4) {
    const half     = Math.floor(sorted.length / 2);
    const firstAvg = sorted.slice(0, half).reduce((s, m) => s + m.score, 0) / half;
    const lastAvg  = sorted.slice(half).reduce((s, m) => s + m.score, 0) / (sorted.length - half);
    if (lastAvg - firstAvg > 0.8) trend = 'improving';
    else if (firstAvg - lastAvg > 0.8) trend = 'declining';
  }

  return { trend, avg: Math.round(avg * 10) / 10, data: sorted };
}

// ─── Long-Term: Habit Behavior ────────────────────────────────────────────────

function recordHabitEvent(userId, habitId, habitName, completed) {
  const profile = getLongTerm(userId);
  if (!profile.habitBehavior[habitId]) {
    profile.habitBehavior[habitId] = { name: habitName, totalDays: 0, completedDays: 0, rate: 0 };
  }
  const h = profile.habitBehavior[habitId];
  h.totalDays++;
  if (completed) h.completedDays++;
  h.rate = Math.round((h.completedDays / h.totalDays) * 100);
  h.name = habitName;
  profile.stats.habitsChecked++;
  profile.updatedAt = Date.now();
}

function getHabitBehavior(userId) {
  return getLongTerm(userId).habitBehavior;
}

// ─── Long-Term: Preferences ───────────────────────────────────────────────────

function updatePreference(userId, key, value) {
  const profile = getLongTerm(userId);
  profile.preferences[key] = value;
  profile.updatedAt = Date.now();
}

function getPreferences(userId) {
  return getLongTerm(userId).preferences;
}

// ─── Long-Term: Suggestion Interaction ───────────────────────────────────────

function recordSuggestionInteraction(userId, type, action) {
  const profile = getLongTerm(userId);
  profile.suggestionHistory.push({ type, action, ts: Date.now() });
  // Keep last 50 interactions
  if (profile.suggestionHistory.length > 50) {
    profile.suggestionHistory = profile.suggestionHistory.slice(-50);
  }
  profile.stats.suggestionsShown++;
  if (action === 'accepted') profile.stats.suggestionsAccepted++;
  profile.updatedAt = Date.now();
}

/**
 * Get acceptance rate for a suggestion type.
 */
function getSuggestionAcceptanceRate(userId, type) {
  const profile = getLongTerm(userId);
  const relevant = profile.suggestionHistory.filter(s => s.type === type);
  if (relevant.length === 0) return 0.5; // Default: 50%

  const accepted = relevant.filter(s => s.action === 'accepted').length;
  return accepted / relevant.length;
}

// ─── Long-Term: Stats Tracking ────────────────────────────────────────────────

function incrementStat(userId, stat) {
  const profile = getLongTerm(userId);
  if (stat in profile.stats) {
    profile.stats[stat]++;
    profile.updatedAt = Date.now();
  }
}

function getStats(userId) {
  return getLongTerm(userId).stats;
}

// ─── Memory Summary (for prompt injection) ───────────────────────────────────

/**
 * Build a compact memory summary for injection into AI prompts.
 */
function buildMemorySummary(userId) {
  const profile = getLongTerm(userId);
  const topFocus = getTopFocusHours(userId, 2);
  const moodInfo = getMoodTrend(userId, 7);

  const parts = [];

  if (topFocus.length > 0) {
    parts.push(`أوقات التركيز المفضلة: ${topFocus.map(f => `${f.hour}:00`).join('، ')}`);
  }

  if (moodInfo.avg) {
    parts.push(`متوسط المزاج (7 أيام): ${moodInfo.avg}/10 (${moodInfo.trend === 'improving' ? 'يتحسن ✅' : moodInfo.trend === 'declining' ? 'يتراجع ⚠️' : 'مستقر'})`);
  }

  if (profile.stats.tasksCompleted > 0) {
    parts.push(`إجمالي المهام المنجزة: ${profile.stats.tasksCompleted}`);
  }

  return parts.length > 0 ? parts.join(' | ') : '';
}

// ─── Full Memory Snapshot ─────────────────────────────────────────────────────

function getFullSnapshot(userId) {
  return {
    shortTerm: {
      messages: getRecentMessages(userId, MAX_SHORT_TERM),
      stats   : getShortTermStats(userId),
    },
    longTerm: getLongTerm(userId),
  };
}

module.exports = {
  // Short-term
  addShortTerm,
  getRecentMessages,
  buildHistoryString,
  clearShortTerm,
  getShortTermStats,

  // Long-term
  getLongTerm,
  recordFocusEvent,
  getTopFocusHours,
  recordMood,
  getMoodTrend,
  recordHabitEvent,
  getHabitBehavior,
  updatePreference,
  getPreferences,
  recordSuggestionInteraction,
  getSuggestionAcceptanceRate,
  incrementStat,
  getStats,
  buildMemorySummary,
  getFullSnapshot,
};
