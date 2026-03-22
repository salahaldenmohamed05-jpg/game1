/**
 * ProductivityScore Model
 * ========================
 * Daily computed scores: productivity, focus, consistency
 * Part of the AI Performance Engine (Premium)
 */
const { DataTypes } = require('sequelize');
const { sequelize }  = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const ProductivityScore = sequelize.define('ProductivityScore', {
  id:      { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },

  // ── Core Scores (0-100) ──────────────────────────────────────────
  productivity_score: { type: DataTypes.FLOAT, defaultValue: 0 },
  focus_score:        { type: DataTypes.FLOAT, defaultValue: 0 },
  consistency_score:  { type: DataTypes.FLOAT, defaultValue: 0 },
  overall_score:      { type: DataTypes.FLOAT, defaultValue: 0 },   // weighted avg

  // ── Sub-metrics ──────────────────────────────────────────────────
  task_completion_rate: { type: DataTypes.FLOAT, defaultValue: 0 }, // %
  habit_completion_rate:{ type: DataTypes.FLOAT, defaultValue: 0 },
  mood_average:         { type: DataTypes.FLOAT, defaultValue: 0 },
  on_time_rate:         { type: DataTypes.FLOAT, defaultValue: 0 }, // tasks completed before deadline %

  // ── Comparison ───────────────────────────────────────────────────
  prev_day_score:  { type: DataTypes.FLOAT, allowNull: true },
  prev_week_score: { type: DataTypes.FLOAT, allowNull: true },
  score_delta:     { type: DataTypes.FLOAT, allowNull: true },       // vs yesterday

  // ── Metadata ─────────────────────────────────────────────────────
  score_date: { type: DataTypes.DATEONLY, allowNull: false },
  computed_at:{ type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  raw_data: {
    type: DataTypes.TEXT,
    defaultValue: '{}',
    get()  { try { return JSON.parse(this.getDataValue('raw_data') || '{}'); } catch { return {}; } },
    set(v) { this.setDataValue('raw_data', JSON.stringify(v)); },
  },
}, {
  tableName: 'productivity_scores',
  underscored: false,
  indexes: [
    { fields: ['user_id', 'score_date'], unique: true },
    { fields: ['score_date'] },
  ],
});

module.exports = ProductivityScore;
