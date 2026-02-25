/**
 * Task Model - SQLite/PostgreSQL compatible
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const jsonField = (defaultVal = null) => ({
  type: DataTypes.TEXT,
  defaultValue: JSON.stringify(defaultVal),
  get() { try { return JSON.parse(this.getDataValue(this.constructor._jsonFields?.find(f => this.getDataValue(f) !== undefined) || '{}') || JSON.stringify(defaultVal)); } catch { return defaultVal; } },
});

const Task = sequelize.define('Task', {
  id: { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  category: { type: DataTypes.STRING(20), defaultValue: 'personal' },
  priority: { type: DataTypes.STRING(10), defaultValue: 'medium' },
  status: { type: DataTypes.STRING(15), defaultValue: 'pending' },
  due_date: { type: DataTypes.DATE, allowNull: true },
  due_time: { type: DataTypes.STRING(8), allowNull: true },
  completed_at: { type: DataTypes.DATE, allowNull: true },
  ai_priority_score: { type: DataTypes.FLOAT, defaultValue: 0 },
  is_recurring: { type: DataTypes.BOOLEAN, defaultValue: false },
  recurrence_pattern: {
    type: DataTypes.TEXT, defaultValue: null,
    get() { try { const v = this.getDataValue('recurrence_pattern'); return v ? JSON.parse(v) : null; } catch { return null; } },
    set(val) { this.setDataValue('recurrence_pattern', val ? JSON.stringify(val) : null); },
  },
  tags: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('tags') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('tags', JSON.stringify(val || [])); },
  },
  estimated_duration: { type: DataTypes.INTEGER, allowNull: true },
  actual_duration: { type: DataTypes.INTEGER, allowNull: true },
  parent_task_id: { type: DataTypes.STRING(36), allowNull: true },
  notes: { type: DataTypes.TEXT, allowNull: true },
  ai_suggestions: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('ai_suggestions') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('ai_suggestions', JSON.stringify(val || [])); },
  },
  reminders: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('reminders') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('reminders', JSON.stringify(val || [])); },
  },
  completion_mood: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'tasks',
  indexes: [
    { fields: ['user_id'] }, { fields: ['status'] }, { fields: ['due_date'] },
  ],
});

module.exports = Task;
