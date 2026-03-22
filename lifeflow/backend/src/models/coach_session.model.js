/**
 * CoachSession Model  — Phase 10
 * ================================
 * Stores AI coach insight snapshots per session so users can
 * review past coaching reports and track recommendation follow-up.
 */
const { DataTypes } = require('sequelize');
const { sequelize }  = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const CoachSession = sequelize.define('CoachSession', {
  id:      { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  session_date: { type: DataTypes.DATEONLY, allowNull: false },

  // ── Summary metrics ───────────────────────────────────────────────
  avg_score_14d:        { type: DataTypes.FLOAT, defaultValue: 0 },
  score_trend:          { type: DataTypes.STRING(15), defaultValue: 'stable' },
  avg_mood_14d:         { type: DataTypes.FLOAT, defaultValue: 0 },
  task_completion_rate: { type: DataTypes.FLOAT, defaultValue: 0 },
  burnout_risk:         { type: DataTypes.STRING(10), defaultValue: 'low' },
  burnout_score:        { type: DataTypes.FLOAT, defaultValue: 0 },

  // ── Full snapshot (JSON) ──────────────────────────────────────────
  recommendations: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get()  { try { return JSON.parse(this.getDataValue('recommendations') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('recommendations', JSON.stringify(v)); },
  },
  highlights: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get()  { try { return JSON.parse(this.getDataValue('highlights') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('highlights', JSON.stringify(v)); },
  },
  action_plan: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get()  { try { return JSON.parse(this.getDataValue('action_plan') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('action_plan', JSON.stringify(v)); },
  },
  life_balance: {
    type: DataTypes.TEXT, defaultValue: '{}',
    get()  { try { return JSON.parse(this.getDataValue('life_balance') || '{}'); } catch { return {}; } },
    set(v) { this.setDataValue('life_balance', JSON.stringify(v)); },
  },

  // ── User engagement ───────────────────────────────────────────────
  is_read:            { type: DataTypes.BOOLEAN, defaultValue: false },
  acknowledged_items: { type: DataTypes.INTEGER, defaultValue: 0 },
}, {
  tableName: 'coach_sessions',
  underscored: false,
  indexes: [
    { fields: ['user_id', 'session_date'] },
    { fields: ['session_date'] },
  ],
});

module.exports = CoachSession;
