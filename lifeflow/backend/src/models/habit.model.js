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
}, {
  tableName: 'habits',
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
