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
  due_date: {
    type: DataTypes.DATE, allowNull: true,
    get() {
      const v = this.getDataValue('due_date');
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    },
  },
  due_time: { type: DataTypes.STRING(8), allowNull: true },
  completed_at: {
    type: DataTypes.DATE, allowNull: true,
    get() {
      const v = this.getDataValue('completed_at');
      if (!v) return null;
      const d = new Date(v);
      return isNaN(d.getTime()) ? null : d;
    },
  },
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
  goal_id: { type: DataTypes.STRING(36), allowNull: true, comment: 'linked goal for goal-driven planning' },
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
  reschedule_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  original_due_date: { type: DataTypes.DATE, allowNull: true },
  // Phase 16: Energy-aware task attributes
  energy_level: { type: DataTypes.STRING(10), allowNull: true, defaultValue: null, comment: 'low|medium|high — energy required for this task' },
  focus_required: { type: DataTypes.BOOLEAN, defaultValue: false, comment: 'requires deep focus' },
  burnout_risk_flag: { type: DataTypes.BOOLEAN, defaultValue: false, comment: 'ML flagged as potential burnout contributor' },
  // Phase 1 (Upgrade): Time-aware task fields — stored as STRING to avoid Date parsing issues
  start_time: {
    type: DataTypes.STRING(50), allowNull: true, comment: 'scheduled start datetime (ISO string)',
    get() {
      // SQLite column is DATETIME, so Sequelize may auto-parse the value as a Date object.
      // Access raw dataValues to bypass type coercion, then validate.
      const raw = this.dataValues ? this.dataValues.start_time : this.getDataValue('start_time');
      if (raw == null) return null;
      // If Sequelize returned a Date object
      if (raw instanceof Date) {
        return isNaN(raw.getTime()) ? null : raw.toISOString();
      }
      // String value — validate it's a parseable date
      if (typeof raw === 'string' && raw.length > 0) {
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : raw;
      }
      return null;
    },
  },
  end_time: {
    type: DataTypes.STRING(50), allowNull: true, comment: 'scheduled end datetime (ISO string)',
    get() {
      const raw = this.dataValues ? this.dataValues.end_time : this.getDataValue('end_time');
      if (raw == null) return null;
      if (raw instanceof Date) {
        return isNaN(raw.getTime()) ? null : raw.toISOString();
      }
      if (typeof raw === 'string' && raw.length > 0) {
        const d = new Date(raw);
        return isNaN(d.getTime()) ? null : raw;
      }
      return null;
    },
  },
  is_all_day: { type: DataTypes.BOOLEAN, defaultValue: false, comment: 'all-day task (no specific time)' },
  energy_required: { type: DataTypes.STRING(10), allowNull: true, defaultValue: 'medium', comment: 'low|medium|high — energy level required' },
  order_index: { type: DataTypes.INTEGER, defaultValue: 0, comment: 'manual sort order within same day' },
  reminder_before: { type: DataTypes.INTEGER, defaultValue: 30, comment: 'minutes before start_time to notify' },
}, {
  tableName: 'tasks',
  underscored: false,
  indexes: [
    { fields: ['user_id'] }, { fields: ['status'] }, { fields: ['due_date'] },
    { fields: ['start_time'] }, { fields: ['user_id', 'status'] },
  ],
});

module.exports = Task;
