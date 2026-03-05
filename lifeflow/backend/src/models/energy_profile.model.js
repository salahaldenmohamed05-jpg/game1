/**
 * EnergyProfile Model
 * ====================
 * Tracks when the user is most productive/energetic
 * Builds a personal energy heatmap — Premium feature
 */
const { DataTypes } = require('sequelize');
const { sequelize }  = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const EnergyProfile = sequelize.define('EnergyProfile', {
  id:      { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false, unique: true },

  // ── Hourly Productivity Heatmap (24 slots: 00-23) ────────────────
  hourly_task_completions: {
    type: DataTypes.TEXT,
    defaultValue: JSON.stringify(new Array(24).fill(0)),
    get()  { try { return JSON.parse(this.getDataValue('hourly_task_completions') || '[]'); } catch { return new Array(24).fill(0); } },
    set(v) { this.setDataValue('hourly_task_completions', JSON.stringify(v)); },
  },

  // ── Daily Productivity (0=Sun … 6=Sat) ──────────────────────────
  daily_task_completions: {
    type: DataTypes.TEXT,
    defaultValue: JSON.stringify(new Array(7).fill(0)),
    get()  { try { return JSON.parse(this.getDataValue('daily_task_completions') || '[]'); } catch { return new Array(7).fill(0); } },
    set(v) { this.setDataValue('daily_task_completions', JSON.stringify(v)); },
  },

  // ── Peak Hours (top 3 most productive hours) ─────────────────────
  peak_hours: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get()  { try { return JSON.parse(this.getDataValue('peak_hours') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('peak_hours', JSON.stringify(v)); },
  },

  // ── Recommended Work Blocks ──────────────────────────────────────
  recommended_deep_work_start: { type: DataTypes.STRING(8), allowNull: true },
  recommended_deep_work_end:   { type: DataTypes.STRING(8), allowNull: true },
  recommended_break_times: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get()  { try { return JSON.parse(this.getDataValue('recommended_break_times') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('recommended_break_times', JSON.stringify(v)); },
  },

  // ── Mood-Energy Correlation ──────────────────────────────────────
  high_energy_mood_avg:  { type: DataTypes.FLOAT, defaultValue: 0 },
  low_energy_mood_avg:   { type: DataTypes.FLOAT, defaultValue: 0 },
  energy_mood_correlation: { type: DataTypes.FLOAT, defaultValue: 0 }, // -1 to 1

  // ── Sample Size ──────────────────────────────────────────────────
  data_points: { type: DataTypes.INTEGER, defaultValue: 0 },
  last_updated:{ type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, {
  tableName: 'energy_profiles',
});

module.exports = EnergyProfile;
