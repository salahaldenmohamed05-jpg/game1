/**
 * WeeklyAudit Model
 * ==================
 * Weekly Life Audit: task patterns, energy peaks, recommendations
 * Premium feature — generated every Sunday
 */
const { DataTypes } = require('sequelize');
const { sequelize }  = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const WeeklyAudit = sequelize.define('WeeklyAudit', {
  id:      { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },

  // ── Period ───────────────────────────────────────────────────────
  week_start: { type: DataTypes.DATEONLY, allowNull: false },
  week_end:   { type: DataTypes.DATEONLY, allowNull: false },
  week_number:{ type: DataTypes.INTEGER },

  // ── Task Analysis ────────────────────────────────────────────────
  total_tasks:      { type: DataTypes.INTEGER, defaultValue: 0 },
  completed_tasks:  { type: DataTypes.INTEGER, defaultValue: 0 },
  overdue_tasks:    { type: DataTypes.INTEGER, defaultValue: 0 },
  rescheduled_tasks:{ type: DataTypes.INTEGER, defaultValue: 0 },
  task_completion_rate: { type: DataTypes.FLOAT, defaultValue: 0 },

  // ── Habit Analysis ───────────────────────────────────────────────
  total_habit_checkins: { type: DataTypes.INTEGER, defaultValue: 0 },
  habit_completion_rate:{ type: DataTypes.FLOAT, defaultValue: 0 },
  best_habit_streak:    { type: DataTypes.INTEGER, defaultValue: 0 },
  missed_habits:        { type: DataTypes.INTEGER, defaultValue: 0 },

  // ── Mood Analysis ────────────────────────────────────────────────
  avg_mood:    { type: DataTypes.FLOAT, defaultValue: 0 },
  mood_trend:  { type: DataTypes.STRING(20), defaultValue: 'stable' }, // 'improving'|'declining'|'stable'
  best_mood_day:   { type: DataTypes.STRING(10), allowNull: true },
  worst_mood_day:  { type: DataTypes.STRING(10), allowNull: true },

  // ── Performance Scores ───────────────────────────────────────────
  avg_productivity_score: { type: DataTypes.FLOAT, defaultValue: 0 },
  avg_focus_score:        { type: DataTypes.FLOAT, defaultValue: 0 },
  avg_consistency_score:  { type: DataTypes.FLOAT, defaultValue: 0 },
  week_score_vs_last_week:{ type: DataTypes.FLOAT, defaultValue: 0 }, // delta

  // ── Improvement Strategies (AI-generated, 3 items) ───────────────
  improvement_strategies: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get()  { try { return JSON.parse(this.getDataValue('improvement_strategies') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('improvement_strategies', JSON.stringify(v)); },
  },

  // ── Detected Patterns ────────────────────────────────────────────
  patterns: {
    type: DataTypes.TEXT,
    defaultValue: '{}',
    get()  { try { return JSON.parse(this.getDataValue('patterns') || '{}'); } catch { return {}; } },
    set(v) { this.setDataValue('patterns', JSON.stringify(v)); },
  },

  // ── Coach Summary ────────────────────────────────────────────────
  coach_summary: { type: DataTypes.TEXT, allowNull: true },
  top_achievement:  { type: DataTypes.TEXT, allowNull: true },
  biggest_challenge:{ type: DataTypes.TEXT, allowNull: true },

  is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
  tableName: 'weekly_audits',
  underscored: false,
  indexes: [
    { fields: ['user_id', 'week_start'], unique: true },
  ],
});

module.exports = WeeklyAudit;
