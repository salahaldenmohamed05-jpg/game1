/**
 * EnergyLog Model  — Phase 10
 * ============================
 * Daily energy score snapshots for trend analysis.
 * Enables energy history charts and correlation studies.
 */
const { DataTypes } = require('sequelize');
const { sequelize }  = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const EnergyLog = sequelize.define('EnergyLog', {
  id:      { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  log_date: { type: DataTypes.DATEONLY,  allowNull: false },

  // ── Scores ────────────────────────────────────────────────────────
  energy_score: { type: DataTypes.FLOAT, defaultValue: 0 },   // 0-100
  level: { type: DataTypes.STRING(10), defaultValue: 'medium' }, // high/medium/low/critical

  // ── Breakdown components ──────────────────────────────────────────
  sleep_score:     { type: DataTypes.FLOAT, defaultValue: 0 },
  mood_score:      { type: DataTypes.FLOAT, defaultValue: 0 },
  habit_score:     { type: DataTypes.FLOAT, defaultValue: 0 },
  task_load_score: { type: DataTypes.FLOAT, defaultValue: 0 },
  stress_score:    { type: DataTypes.FLOAT, defaultValue: 0 },

  // ── Raw inputs ────────────────────────────────────────────────────
  mood_raw:        { type: DataTypes.FLOAT, allowNull: true },
  habit_rate:      { type: DataTypes.FLOAT, allowNull: true },
  pending_urgent:  { type: DataTypes.INTEGER, defaultValue: 0 },
  active_flags:    { type: DataTypes.INTEGER, defaultValue: 0 },
}, {
  tableName: 'energy_logs',
  underscored: false,
  indexes: [
    { fields: ['user_id', 'log_date'], unique: true },
    { fields: ['log_date'] },
  ],
});

module.exports = EnergyLog;
