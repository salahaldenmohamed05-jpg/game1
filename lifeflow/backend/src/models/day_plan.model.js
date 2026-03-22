/**
 * DayPlan Model  — Phase 10
 * ==========================
 * Persists generated daily plans so they can be retrieved, tracked,
 * and compared across days without re-computing each time.
 */
const { DataTypes } = require('sequelize');
const { sequelize }  = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const DayPlan = sequelize.define('DayPlan', {
  id:      { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  plan_date: { type: DataTypes.DATEONLY, allowNull: false },

  // ── Serialised schedule from dayplanner.service ──────────────────
  schedule: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get()  { try { return JSON.parse(this.getDataValue('schedule') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('schedule', JSON.stringify(v)); },
  },
  focus_windows: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get()  { try { return JSON.parse(this.getDataValue('focus_windows') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('focus_windows', JSON.stringify(v)); },
  },
  warnings: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get()  { try { return JSON.parse(this.getDataValue('warnings') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('warnings', JSON.stringify(v)); },
  },
  stats: {
    type: DataTypes.TEXT,
    defaultValue: '{}',
    get()  { try { return JSON.parse(this.getDataValue('stats') || '{}'); } catch { return {}; } },
    set(v) { this.setDataValue('stats', JSON.stringify(v)); },
  },

  // ── Completion tracking ──────────────────────────────────────────
  completed_blocks: { type: DataTypes.INTEGER, defaultValue: 0 },
  total_blocks:     { type: DataTypes.INTEGER, defaultValue: 0 },
  completion_rate:  { type: DataTypes.FLOAT,   defaultValue: 0 },
  energy_match_score: { type: DataTypes.FLOAT, defaultValue: 0 },

  // ── User rating (optional feedback) ─────────────────────────────
  user_rating: { type: DataTypes.INTEGER, allowNull: true }, // 1-5
  user_notes:  { type: DataTypes.TEXT,    allowNull: true },
}, {
  tableName: 'day_plans',
  underscored: false,
  indexes: [
    { fields: ['user_id', 'plan_date'], unique: true },
    { fields: ['plan_date'] },
  ],
});

module.exports = DayPlan;
