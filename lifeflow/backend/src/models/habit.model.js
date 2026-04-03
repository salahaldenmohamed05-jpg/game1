/**
 * Habit Model - SQLite/PostgreSQL compatible
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const Habit = sequelize.define('Habit', {
  id: { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  name_ar: { type: DataTypes.STRING(100), allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  category: { type: DataTypes.STRING(20), defaultValue: 'health' },
  icon: { type: DataTypes.STRING(10), defaultValue: '⭐' },
  color: { type: DataTypes.STRING(7), defaultValue: '#6C63FF' },
  frequency: { type: DataTypes.STRING(10), defaultValue: 'daily' },
  frequency_config: {
    type: DataTypes.TEXT, defaultValue: '{"days":[0,1,2,3,4,5,6]}',
    get() { try { return JSON.parse(this.getDataValue('frequency_config') || '{"days":[0,1,2,3,4,5,6]}'); } catch { return { days: [0,1,2,3,4,5,6] }; } },
    set(val) { this.setDataValue('frequency_config', JSON.stringify(val)); },
  },
  target_time: { type: DataTypes.STRING(8), allowNull: true },
  duration_minutes: { type: DataTypes.INTEGER, defaultValue: 30 },
  target_value: { type: DataTypes.FLOAT, allowNull: true },
  unit: { type: DataTypes.STRING(20), allowNull: true },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  start_date: { type: DataTypes.DATEONLY, defaultValue: DataTypes.NOW },
  current_streak: { type: DataTypes.INTEGER, defaultValue: 0 },
  longest_streak: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_completions: { type: DataTypes.INTEGER, defaultValue: 0 },
  completion_rate: { type: DataTypes.FLOAT, defaultValue: 0 },
  reminder_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  reminder_times: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('reminder_times') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('reminder_times', JSON.stringify(val || [])); },
  },
  ai_insights: {
    type: DataTypes.TEXT, defaultValue: '{}',
    get() { try { return JSON.parse(this.getDataValue('ai_insights') || '{}'); } catch { return {}; } },
    set(val) { this.setDataValue('ai_insights', JSON.stringify(val || {})); },
  },
  // habit_type: 'boolean' (done/not done) | 'count' (reach a target count)
  habit_type: { type: DataTypes.STRING(20), defaultValue: 'boolean' },
  // count_label: unit label for count habits, e.g. "كأس", "ركعة"
  count_label: { type: DataTypes.STRING(30), allowNull: true },
  // Phase 2 (Upgrade): Flexible scheduling fields
  frequency_type: { type: DataTypes.STRING(10), defaultValue: 'daily', comment: 'daily|weekly|monthly|custom' },
  custom_days: {
    type: DataTypes.TEXT, defaultValue: null,
    get() { try { const v = this.getDataValue('custom_days'); return v ? JSON.parse(v) : null; } catch { return null; } },
    set(val) { this.setDataValue('custom_days', val ? JSON.stringify(val) : null); },
    comment: '[0-6] days of week for weekly/custom',
  },
  monthly_days: {
    type: DataTypes.TEXT, defaultValue: null,
    get() { try { const v = this.getDataValue('monthly_days'); return v ? JSON.parse(v) : null; } catch { return null; } },
    set(val) { this.setDataValue('monthly_days', val ? JSON.stringify(val) : null); },
    comment: '[1-31] dates of month for monthly',
  },
  preferred_time: { type: DataTypes.STRING(8), allowNull: true, comment: 'HH:mm — user preferred time for this habit' },
  reminder_before: { type: DataTypes.INTEGER, defaultValue: 15, comment: 'minutes before preferred_time to notify' },
  ai_best_time: { type: DataTypes.STRING(8), allowNull: true, comment: 'AI-suggested optimal time HH:mm' },
  ai_best_time_reason: { type: DataTypes.TEXT, allowNull: true, comment: 'reason for AI time suggestion' },

  // ── Behavior Engine Extension ────────────────────────────────────────
  // behavior_spec: full behavior model for adaptive execution
  behavior_spec: {
    type: DataTypes.TEXT, defaultValue: '{}',
    get() {
      try { return JSON.parse(this.getDataValue('behavior_spec') || '{}'); } catch { return {}; }
    },
    set(val) { this.setDataValue('behavior_spec', JSON.stringify(val || {})); },
    comment: `JSON: {
      cue: { type, trigger_time, trigger_event, trigger_location, trigger_after },
      difficulty: { current: 'micro'|'standard'|'stretch', micro: {...}, standard: {...}, stretch: {...} },
      reward: { type, message_ar, xp_bonus },
      resistance_profile: { common_skip_type, avg_skip_rate, best_adherence_time, worst_time },
      adaptation_rules: { reduce_after_skips, increase_after_streak, cooldown_days },
      chain: { after_habit_id, before_habit_id },
      is_breaking_habit: false,
      replacement_for: null
    }`,
  },
  // Goal linkage
  goal_id: {
    type: DataTypes.STRING(36), allowNull: true,
    comment: 'Linked goal ID',
  },
  // Current difficulty level for adaptive behavior
  current_difficulty: {
    type: DataTypes.STRING(20), defaultValue: 'standard',
    comment: 'micro | standard | stretch — adapted by behavior engine',
  },
  // Behavior type classification
  behavior_type: {
    type: DataTypes.STRING(20), defaultValue: 'build',
    comment: 'build | break | maintain',
  },
  // Breaking habit: what negative behavior this replaces
  replaces_behavior: {
    type: DataTypes.TEXT, allowNull: true,
    comment: 'Description of negative behavior this habit replaces',
  },
}, {
  tableName: 'habits',
  underscored: false,
  indexes: [{ fields: ['user_id'] }, { fields: ['is_active'] }],
});

const HabitLog = sequelize.define('HabitLog', {
  id: { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  habit_id: { type: DataTypes.STRING(36), allowNull: false },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  log_date: { type: DataTypes.DATEONLY, allowNull: false },
  completed: { type: DataTypes.BOOLEAN, defaultValue: false },
  value: { type: DataTypes.FLOAT, allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: true },
  mood_after: { type: DataTypes.INTEGER, allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  skipped_reason: { type: DataTypes.STRING(255), allowNull: true },
}, {
  tableName: 'habit_logs',
  indexes: [{ fields: ['habit_id', 'log_date'], unique: true }, { fields: ['user_id', 'log_date'] }],
});

Habit.hasMany(HabitLog, { foreignKey: 'habit_id', as: 'logs' });
HabitLog.belongsTo(Habit, { foreignKey: 'habit_id', as: 'habit' });

module.exports = { Habit, HabitLog };
