/**
 * Mood Model - SQLite/PostgreSQL compatible
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const MoodEntry = sequelize.define('MoodEntry', {
  id: { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  entry_date: { type: DataTypes.DATEONLY, allowNull: false },
  entry_time: { type: DataTypes.STRING(8), allowNull: true },
  mood_score: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1, max: 10 } },
  emotions: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('emotions') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('emotions', JSON.stringify(val || [])); },
  },
  energy_level: { type: DataTypes.INTEGER, allowNull: true },
  stress_level: { type: DataTypes.INTEGER, allowNull: true },
  focus_level: { type: DataTypes.INTEGER, allowNull: true },
  factors: {
    type: DataTypes.TEXT, defaultValue: '{"positive":[],"negative":[]}',
    get() { try { return JSON.parse(this.getDataValue('factors') || '{"positive":[],"negative":[]}'); } catch { return { positive: [], negative: [] }; } },
    set(val) { this.setDataValue('factors', JSON.stringify(val || { positive: [], negative: [] })); },
  },
  journal_entry: { type: DataTypes.TEXT, allowNull: true },
  ai_analysis: {
    type: DataTypes.TEXT, defaultValue: null,
    get() { try { const v = this.getDataValue('ai_analysis'); return v ? JSON.parse(v) : null; } catch { return null; } },
    set(val) { this.setDataValue('ai_analysis', val ? JSON.stringify(val) : null); },
  },
  ai_recommendation: { type: DataTypes.TEXT, allowNull: true },
  weather: {
    type: DataTypes.TEXT, defaultValue: null,
    get() { try { const v = this.getDataValue('weather'); return v ? JSON.parse(v) : null; } catch { return null; } },
    set(val) { this.setDataValue('weather', val ? JSON.stringify(val) : null); },
  },
  period: { type: DataTypes.STRING(10), allowNull: true },
}, {
  tableName: 'mood_entries',
  indexes: [{ fields: ['user_id', 'entry_date'], unique: true }, { fields: ['entry_date'] }],
});

module.exports = MoodEntry;
