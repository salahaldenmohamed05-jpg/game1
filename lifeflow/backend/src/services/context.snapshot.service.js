/**
 * Context Snapshot Service — خدمة لقطة السياق
 * ===============================================
 * PHASE 1: Real-time user context awareness
 *
 * Generates structured snapshots of user state every 1-2 hours.
 * Snapshot includes: time, energy, mood, active/overdue tasks,
 * recent activity, and behavioral signals.
 *
 * Storage: In-memory ring buffer (last 48 snapshots per user = ~48 hours)
 * Auto-snapshot: triggered on demand, cached for 90 minutes
 */

'use strict';

const moment = require('moment-timezone');
const logger = require('../utils/logger');

// ─── Constants ────────────────────────────────────────────────────────────────
const SNAPSHOT_TTL_MS     = 90 * 60 * 1000;   // 90 minutes cache
const MAX_SNAPSHOTS       = 48;                 // ~48h ring buffer
const SNAPSHOT_INTERVAL   = 2 * 60 * 60 * 1000; // 2h auto interval

// ─── Storage ──────────────────────────────────────────────────────────────────
// userId → { snapshots: [], lastGenerated: ts }
const store = new Map();

// ─── Lazy Model Loader ────────────────────────────────────────────────────────
function getModels() {
  const m = {};
  try { m.Task      = require('../models/task.model');       } catch (_) {}
  try { m.Habit     = require('../models/habit.model');      } catch (_) {}
  try { m.HabitLog  = require('../models/habit_log.model');  } catch (_) {}
  try { m.MoodEntry = require('../models/mood.model');       } catch (_) {}
  try { m.User      = require('../models/user.model');       } catch (_) {}
  return m;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────
function getStore(userId) {
  if (!store.has(userId)) {
    store.set(userId, { snapshots: [], lastGenerated: 0 });
  }
  return store.get(userId);
}

function isDue(userId) {
  const s = getStore(userId);
  return Date.now() - s.lastGenerated > SNAPSHOT_TTL_MS;
}

function getEnergyLevel(score) {
  if (score >= 75) return { label: 'عالية',    icon: '⚡', category: 'high'   };
  if (score >= 50) return { label: 'متوسطة',   icon: '🔋', category: 'medium' };
  if (score >= 25) return { label: 'منخفضة',   icon: '😴', category: 'low'    };
  return              { label: 'منهك',      icon: '🪫', category: 'critical' };
}

function getMoodCategory(score) {
  if (!score || score === 0) return { label: 'غير مسجّل', category: 'unknown' };
  if (score >= 8) return { label: 'ممتاز',    category: 'great'   };
  if (score >= 6) return { label: 'جيد',      category: 'good'    };
  if (score >= 4) return { label: 'متوسط',    category: 'neutral' };
  return               { label: 'ضعيف',     category: 'low'     };
}

// ─── Main Snapshot Generator ──────────────────────────────────────────────────
/**
 * Generate a full context snapshot for a user.
 *
 * @param {string} userId
 * @param {string} timezone
 * @returns {object} snapshot
 */
async function generateSnapshot(userId, timezone = 'Africa/Cairo') {
  const now       = moment().tz(timezone);
  const todayStr  = now.format('YYYY-MM-DD');
  const hour      = now.hour();
  const { Task, HabitLog, MoodEntry, User } = getModels();

  const snapshot = {
    user_id    : userId,
    generated_at: now.toISOString(),
    time: {
      hour,
      day_of_week : now.format('dddd'),
      period      : getTimePeriod(hour),
      is_work_hours: hour >= 9 && hour < 17,
      is_evening  : hour >= 18,
      timestamp   : Date.now(),
    },
    energy        : { score: 55, ...getEnergyLevel(55) },
    mood          : { score: 0,  ...getMoodCategory(0) },
    active_tasks  : [],
    overdue_tasks : [],
    recent_activity: [],
    habits_today  : { total: 0, done: 0, completion_rate: 0 },
    signals       : [],
  };

  try {
    // ── 1. Load User (for energy baseline) ───────────────────────────────────
    if (User) {
      const user = await User.findByPk(userId, { attributes: ['timezone', 'wake_up_time', 'sleep_time'] });
      if (user) {
        const wakeHour  = parseInt((user.wake_up_time || '07:00').split(':')[0], 10);
        const sleepHour = parseInt((user.sleep_time   || '23:00').split(':')[0], 10);
        const awakeHours = hour - wakeHour;
        const totalAwake = sleepHour - wakeHour;

        // Simple energy model based on time-of-day
        const fatigueFactor = awakeHours > 0 ? Math.max(0, 1 - (awakeHours / totalAwake) * 0.4) : 0.9;
        // Peak in morning (2-5h after wake), dip after lunch (6-7h after wake)
        let timeFactor;
        if (awakeHours < 0)          timeFactor = 0.3;
        else if (awakeHours < 1)     timeFactor = 0.6;
        else if (awakeHours < 3)     timeFactor = 0.9;
        else if (awakeHours < 5)     timeFactor = 1.0;
        else if (awakeHours < 7)     timeFactor = 0.7;  // post-lunch dip
        else if (awakeHours < 9)     timeFactor = 0.8;
        else                         timeFactor = 0.5;

        const energyScore = Math.round(55 * fatigueFactor * timeFactor + 10);
        snapshot.energy = { score: energyScore, ...getEnergyLevel(energyScore) };
      }
    }

    // ── 2. Load Today's Mood ──────────────────────────────────────────────────
    if (MoodEntry) {
      const todayMood = await MoodEntry.findOne({
        where: { user_id: userId, entry_date: todayStr },
        order: [['createdAt', 'DESC']],
      });
      if (todayMood) {
        const moodScore = todayMood.mood_score || todayMood.overall_mood || 0;
        snapshot.mood = {
          score    : moodScore,
          note     : todayMood.notes || null,
          logged_at: todayMood.createdAt,
          ...getMoodCategory(moodScore),
        };
        // Adjust energy by mood
        if (moodScore >= 7) snapshot.energy.score = Math.min(100, snapshot.energy.score + 10);
        if (moodScore <= 3) snapshot.energy.score = Math.max(0,   snapshot.energy.score - 15);
      }
    }

    // ── 3. Load Tasks ─────────────────────────────────────────────────────────
    if (Task) {
      const tasks = await Task.findAll({
        where: { user_id: userId, status: ['pending', 'in_progress'] },
        order: [['due_date', 'ASC']],
        limit: 20,
      });

      const nowDate = now.toDate();
      snapshot.active_tasks  = tasks.filter(t => !t.due_date || new Date(t.due_date) >= nowDate)
        .slice(0, 10)
        .map(t => ({
          id      : t.id,
          title   : t.title,
          priority: t.priority,
          due_date: t.due_date,
          area    : t.life_area,
        }));

      snapshot.overdue_tasks = tasks.filter(t => t.due_date && new Date(t.due_date) < nowDate)
        .map(t => ({
          id      : t.id,
          title   : t.title,
          priority: t.priority,
          days_overdue: Math.floor((nowDate - new Date(t.due_date)) / 86400000),
        }));
    }

    // ── 4. Load Habit completions ─────────────────────────────────────────────
    if (HabitLog) {
      const { Habit } = getModels();
      if (Habit) {
        const habits = await Habit.findAll({ where: { user_id: userId, is_active: true } });
        const logs   = await HabitLog.findAll({
          where: { user_id: userId, log_date: todayStr },
        });

        snapshot.habits_today = {
          total          : habits.length,
          done           : logs.length,
          completion_rate: habits.length > 0 ? Math.round((logs.length / habits.length) * 100) : 0,
        };
      }
    }

    // ── 5. Recent Activity ────────────────────────────────────────────────────
    if (Task) {
      const recentDone = await Task.findAll({
        where: {
          user_id: userId,
          status : 'completed',
        },
        order: [['updatedAt', 'DESC']],
        limit: 5,
      });

      snapshot.recent_activity = recentDone.map(t => ({
        type    : 'task_completed',
        title   : t.title,
        done_at : t.updatedAt,
      }));
    }

    // ── 6. Behavioral Signals ─────────────────────────────────────────────────
    if (snapshot.overdue_tasks.length >= 3) {
      snapshot.signals.push({ type: 'overload',      severity: 'high',   message: 'عدد كبير من المهام المتأخرة' });
    }
    if (snapshot.energy.score <= 30) {
      snapshot.signals.push({ type: 'low_energy',    severity: 'medium', message: 'طاقة منخفضة — يُنصح بالراحة' });
    }
    if (snapshot.mood.score > 0 && snapshot.mood.score <= 3) {
      snapshot.signals.push({ type: 'low_mood',      severity: 'medium', message: 'مزاج منخفض — انتبه لحالتك' });
    }
    if (snapshot.habits_today.completion_rate === 100 && snapshot.habits_today.total > 0) {
      snapshot.signals.push({ type: 'all_habits',    severity: 'positive', message: 'أتممت جميع عاداتك اليوم 🎉' });
    }
    if (snapshot.active_tasks.length === 0 && snapshot.overdue_tasks.length === 0) {
      snapshot.signals.push({ type: 'clear_tasks',   severity: 'positive', message: 'لا مهام معلقة — يوم خالٍ 😊' });
    }

  } catch (err) {
    logger.error('[CONTEXT-SNAPSHOT] Error generating snapshot:', err.message);
    // Return partial snapshot — never throw
  }

  // ── Store snapshot ────────────────────────────────────────────────────────
  const s = getStore(userId);
  s.snapshots.unshift(snapshot);
  if (s.snapshots.length > MAX_SNAPSHOTS) s.snapshots.pop();
  s.lastGenerated = Date.now();

  logger.debug('[CONTEXT-SNAPSHOT] Generated', {
    userId,
    energy       : snapshot.energy.score,
    activeTasks  : snapshot.active_tasks.length,
    overdueTasks : snapshot.overdue_tasks.length,
    signals      : snapshot.signals.length,
  });

  return snapshot;
}

// ─── Get or Generate ─────────────────────────────────────────────────────────
/**
 * Get the latest snapshot, generating a fresh one if stale.
 * @param {string} userId
 * @param {string} timezone
 * @param {boolean} force  - force refresh even if cached
 */
async function getSnapshot(userId, timezone = 'Africa/Cairo', force = false) {
  if (!force && !isDue(userId)) {
    const s = getStore(userId);
    if (s.snapshots.length > 0) {
      logger.debug('[CONTEXT-SNAPSHOT] Returning cached snapshot for', userId);
      return s.snapshots[0];
    }
  }
  return generateSnapshot(userId, timezone);
}

// ─── Get Snapshot History ─────────────────────────────────────────────────────
/**
 * Returns last N snapshots for a user.
 * @param {string} userId
 * @param {number} limit
 */
function getHistory(userId, limit = 10) {
  const s = getStore(userId);
  return s.snapshots.slice(0, Math.min(limit, s.snapshots.length));
}

// ─── Time Period Helper ───────────────────────────────────────────────────────
function getTimePeriod(hour) {
  if (hour < 6)  return 'night';
  if (hour < 12) return 'morning';
  if (hour < 14) return 'midday';
  if (hour < 18) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
}

// ─── Compact Context for AI Prompts ──────────────────────────────────────────
/**
 * Returns a compact string summary of the snapshot for AI system prompts.
 * @param {object} snapshot
 */
function toPromptContext(snapshot) {
  if (!snapshot) return '';
  const lines = [];
  lines.push(`الوقت: ${snapshot.time.period} (${snapshot.time.hour}:00)`);
  lines.push(`الطاقة: ${snapshot.energy.score}/100 (${snapshot.energy.label})`);
  if (snapshot.mood.score > 0) {
    lines.push(`المزاج: ${snapshot.mood.score}/10 (${snapshot.mood.label})`);
  }
  if (snapshot.active_tasks.length > 0) {
    lines.push(`مهام نشطة: ${snapshot.active_tasks.length}`);
  }
  if (snapshot.overdue_tasks.length > 0) {
    lines.push(`مهام متأخرة: ⚠️ ${snapshot.overdue_tasks.length}`);
  }
  if (snapshot.habits_today.total > 0) {
    lines.push(`العادات اليوم: ${snapshot.habits_today.done}/${snapshot.habits_today.total}`);
  }
  if (snapshot.signals.length > 0) {
    lines.push(`إشارات: ${snapshot.signals.map(s => s.message).join(' | ')}`);
  }
  return lines.join('\n');
}

// ─── Invalidate ──────────────────────────────────────────────────────────────
function invalidate(userId) {
  const s = getStore(userId);
  s.lastGenerated = 0;
  logger.debug('[CONTEXT-SNAPSHOT] Invalidated cache for', userId);
}

module.exports = {
  getSnapshot,
  generateSnapshot,
  getHistory,
  toPromptContext,
  invalidate,
  getTimePeriod,
  getEnergyLevel,
  getMoodCategory,
  // Aliases used by orchestrator and routes
  getLatestSnapshot    : getSnapshot,
  getOrGenerateSnapshot: getSnapshot,
};
