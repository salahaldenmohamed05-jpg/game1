/**
 * BehavioralFlag Model
 * =====================
 * Detects procrastination, avoidance, and behavioral patterns
 * Premium intelligence layer
 */
const { DataTypes } = require('sequelize');
const { sequelize }  = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const BehavioralFlag = sequelize.define('BehavioralFlag', {
  id:      { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },

  // ── Flag Type ────────────────────────────────────────────────────
  flag_type: {
    type: DataTypes.STRING(50),
    allowNull: false,
    validate: {
      isIn: [[
        'procrastination',       // Task rescheduled 2+ times
        'avoidance',             // Same task uncompleted for 3+ days
        'burnout_risk',          // Consistently low mood + high task load
        'habit_breaking',        // Streak broken 3+ times in a row
        'energy_mismatch',       // Tasks scheduled in low-energy windows
        'overcommitment',        // Too many high-priority tasks daily
        'consistency_drop',      // 30%+ score drop week-over-week
        'late_night_work',       // Tasks completed after sleep_time
        'morning_avoidance',     // No tasks completed before noon consistently
      ]],
    },
  },

  // ── Severity ─────────────────────────────────────────────────────
  severity: {
    type: DataTypes.STRING(10),
    defaultValue: 'medium',
    validate: { isIn: [['low', 'medium', 'high', 'critical']] },
  },

  // ── Linked Entity ────────────────────────────────────────────────
  entity_type: { type: DataTypes.STRING(20), allowNull: true }, // 'task' | 'habit'
  entity_id:   { type: DataTypes.STRING(36), allowNull: true },
  entity_title:{ type: DataTypes.TEXT, allowNull: true },

  // ── Description & Recommendations ────────────────────────────────
  description: { type: DataTypes.TEXT, allowNull: false },
  ai_recommendation: { type: DataTypes.TEXT, allowNull: true },
  sub_steps: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get()  { try { return JSON.parse(this.getDataValue('sub_steps') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('sub_steps', JSON.stringify(v)); },
  },

  // ── Optimal Time Suggestion ──────────────────────────────────────
  suggested_time: { type: DataTypes.STRING(8), allowNull: true },
  suggested_day:  { type: DataTypes.STRING(15), allowNull: true },

  // ── State ────────────────────────────────────────────────────────
  is_resolved:  { type: DataTypes.BOOLEAN, defaultValue: false },
  is_dismissed: { type: DataTypes.BOOLEAN, defaultValue: false },
  resolved_at:  { type: DataTypes.DATE, allowNull: true },
  occurrence_count: { type: DataTypes.INTEGER, defaultValue: 1 },
}, {
  tableName: 'behavioral_flags',
  indexes: [
    { fields: ['user_id', 'flag_type'] },
    { fields: ['user_id', 'is_resolved'] },
    { fields: ['entity_id'] },
  ],
});

module.exports = BehavioralFlag;
