/**
 * UserModel — Persistent Evolving User Brain (Phase P)
 * =====================================================
 * The long-term memory of each user's behavior, performance, habits, and adaptation.
 * Updated after every task completion, missed task, decision accepted/rejected.
 * Consumed by Decision Engine for per-user personalized scoring.
 *
 * Profiles:
 *   behavior_profile    — procrastination patterns, peak hours, burnout tendency, task preference
 *   performance_profile — completion rates by type, avg delay, success rate history
 *   habit_profile       — consistency score, streak behavior, drop-off patterns
 *   adaptation_profile  — optimal task size, session length, resistance threshold
 *   feedback_loop       — decision acceptance/ignore/completion tracking
 */

'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// ─── JSON field helper ──────────────────────────────────────────────────────
function jsonField(defaultValue) {
  return {
    type: DataTypes.TEXT,
    defaultValue: JSON.stringify(defaultValue),
    get() {
      try { return JSON.parse(this.getDataValue(this.constructor.name) || JSON.stringify(defaultValue)); }
      catch { return defaultValue; }
    },
    set(val) { this.setDataValue(this.constructor.name, JSON.stringify(val || defaultValue)); },
  };
}

const DEFAULT_BEHAVIOR = {
  procrastination_pattern: {
    score: 0.5,            // 0=never, 1=always procrastinates
    peak_avoidance_hours: [],
    avg_delay_minutes: 0,
    trend: 'stable',       // improving | stable | worsening
    samples: 0,
  },
  peak_productivity_hours: {
    hours: [],             // e.g. [9, 10, 11]
    confidence: 'low',
    samples: 0,
  },
  burnout_tendency: {
    score: 0.3,            // 0=resilient, 1=burns out easily
    recovery_speed: 'medium',
    triggers: [],
    samples: 0,
  },
  task_preference: {
    preferred_type: 'mixed',    // deep_work | quick_win | mixed
    preferred_duration: 30,     // minutes
    preferred_energy: 'medium', // low | medium | high
    avoids: [],
    samples: 0,
  },
};

const DEFAULT_PERFORMANCE = {
  completion_rate_by_type: {
    urgent: { completed: 0, total: 0, rate: 0 },
    high:   { completed: 0, total: 0, rate: 0 },
    medium: { completed: 0, total: 0, rate: 0 },
    low:    { completed: 0, total: 0, rate: 0 },
  },
  avg_task_delay: 0,         // average minutes between due and completion
  success_rate: 0,           // overall 0-1
  on_time_rate: 0,           // percentage completed on/before due
  total_completed: 0,
  total_missed: 0,
  weekly_trend: [],          // last 4 weeks: [{ week, completed, missed, rate }]
  samples: 0,
};

const DEFAULT_HABIT = {
  consistency_score: 0.5,    // 0=inconsistent, 1=rock-solid
  streak_behavior: {
    avg_streak: 0,
    max_streak: 0,
    break_frequency: 0,      // breaks per month
    trend: 'stable',
  },
  drop_off_patterns: {
    common_drop_day: null,    // day of week habits usually break
    drop_after_days: 0,       // streaks usually break after N days
    reasons: [],
  },
  best_habit_time: null,
  samples: 0,
};

const DEFAULT_ADAPTATION = {
  optimal_task_size: {
    duration_minutes: 25,     // Pomodoro default, adapts
    confidence: 'low',
    samples: 0,
  },
  optimal_session_length: {
    minutes: 90,              // deep work session length
    confidence: 'low',
    samples: 0,
  },
  resistance_threshold: {
    score: 0.5,               // 0=accepts everything, 1=resists everything
    trend: 'stable',
    samples: 0,
  },
  difficulty_level: {
    current: 'normal',        // easy | normal | challenging | hard
    auto_adjusted: false,
    last_change: null,
    reason: null,
  },
  push_tolerance: {
    score: 0.5,               // how much the system can push the user
    samples: 0,
  },
};

const DEFAULT_FEEDBACK_LOOP = {
  decisions_presented: 0,
  decisions_accepted: 0,
  decisions_ignored: 0,
  decisions_rejected: 0,
  acceptance_rate: 0,
  tasks_started_after_suggestion: 0,
  avg_time_to_start: 0,       // minutes between suggestion and task start
  completions_after_suggestion: 0,
  deviation_count: 0,          // times user chose different task than suggested
  recent_feedback: [],         // last 20: [{ action, feedback, ts }]
  samples: 0,
};

const UserModel = sequelize.define('UserModel', {
  id: {
    type: DataTypes.STRING(36),
    defaultValue: () => uuidv4(),
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.STRING(36),
    allowNull: false,
    unique: true,
  },

  // ── Behavior Profile ─────────────────────────────────────────────────────
  behavior_profile: {
    type: DataTypes.TEXT,
    defaultValue: JSON.stringify(DEFAULT_BEHAVIOR),
    get() {
      try { return JSON.parse(this.getDataValue('behavior_profile') || JSON.stringify(DEFAULT_BEHAVIOR)); }
      catch { return { ...DEFAULT_BEHAVIOR }; }
    },
    set(val) { this.setDataValue('behavior_profile', JSON.stringify(val || DEFAULT_BEHAVIOR)); },
  },

  // ── Performance Profile ──────────────────────────────────────────────────
  performance_profile: {
    type: DataTypes.TEXT,
    defaultValue: JSON.stringify(DEFAULT_PERFORMANCE),
    get() {
      try { return JSON.parse(this.getDataValue('performance_profile') || JSON.stringify(DEFAULT_PERFORMANCE)); }
      catch { return { ...DEFAULT_PERFORMANCE }; }
    },
    set(val) { this.setDataValue('performance_profile', JSON.stringify(val || DEFAULT_PERFORMANCE)); },
  },

  // ── Habit Profile ────────────────────────────────────────────────────────
  habit_profile: {
    type: DataTypes.TEXT,
    defaultValue: JSON.stringify(DEFAULT_HABIT),
    get() {
      try { return JSON.parse(this.getDataValue('habit_profile') || JSON.stringify(DEFAULT_HABIT)); }
      catch { return { ...DEFAULT_HABIT }; }
    },
    set(val) { this.setDataValue('habit_profile', JSON.stringify(val || DEFAULT_HABIT)); },
  },

  // ── Adaptation Profile ───────────────────────────────────────────────────
  adaptation_profile: {
    type: DataTypes.TEXT,
    defaultValue: JSON.stringify(DEFAULT_ADAPTATION),
    get() {
      try { return JSON.parse(this.getDataValue('adaptation_profile') || JSON.stringify(DEFAULT_ADAPTATION)); }
      catch { return { ...DEFAULT_ADAPTATION }; }
    },
    set(val) { this.setDataValue('adaptation_profile', JSON.stringify(val || DEFAULT_ADAPTATION)); },
  },

  // ── Feedback Loop ────────────────────────────────────────────────────────
  feedback_loop: {
    type: DataTypes.TEXT,
    defaultValue: JSON.stringify(DEFAULT_FEEDBACK_LOOP),
    get() {
      try { return JSON.parse(this.getDataValue('feedback_loop') || JSON.stringify(DEFAULT_FEEDBACK_LOOP)); }
      catch { return { ...DEFAULT_FEEDBACK_LOOP }; }
    },
    set(val) { this.setDataValue('feedback_loop', JSON.stringify(val || DEFAULT_FEEDBACK_LOOP)); },
  },

  // ── Meta ─────────────────────────────────────────────────────────────────
  model_version: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
  last_event: {
    type: DataTypes.STRING(50),
    allowNull: true,
  },
  last_event_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  total_events: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  // Phase P additions — confidence tracking
  confidence: {
    type: DataTypes.STRING(20),
    defaultValue: 'cold_start',
  },
  data_points: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  last_computed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'user_models',
  timestamps: true,
  indexes: [
    { fields: ['user_id'], unique: true },
  ],
});

// Export defaults for use in service
UserModel.DEFAULTS = {
  BEHAVIOR: DEFAULT_BEHAVIOR,
  PERFORMANCE: DEFAULT_PERFORMANCE,
  HABIT: DEFAULT_HABIT,
  ADAPTATION: DEFAULT_ADAPTATION,
  FEEDBACK_LOOP: DEFAULT_FEEDBACK_LOOP,
};

module.exports = UserModel;
