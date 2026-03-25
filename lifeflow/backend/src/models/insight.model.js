/**
 * Insight, Notification Models - SQLite/PostgreSQL compatible
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const Insight = sequelize.define('Insight', {
  id: { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  type: { type: DataTypes.STRING(30), allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
  data: {
    type: DataTypes.TEXT, defaultValue: '{}',
    get() { try { return JSON.parse(this.getDataValue('data') || '{}'); } catch { return {}; } },
    set(val) { this.setDataValue('data', JSON.stringify(val || {})); },
  },
  recommendations: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('recommendations') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('recommendations', JSON.stringify(val || [])); },
  },
  period_start: { type: DataTypes.DATEONLY, allowNull: true },
  period_end: { type: DataTypes.DATEONLY, allowNull: true },
  is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
  priority: { type: DataTypes.STRING(10), defaultValue: 'medium' },
}, { tableName: 'insights', underscored: false });

const Notification = sequelize.define('Notification', {
  id: { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  type: { type: DataTypes.STRING(30), allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  body: { type: DataTypes.TEXT, allowNull: false },
  data: {
    type: DataTypes.TEXT, defaultValue: '{}',
    get() { try { return JSON.parse(this.getDataValue('data') || '{}'); } catch { return {}; } },
    set(val) { this.setDataValue('data', JSON.stringify(val || {})); },
  },
  scheduled_at: { type: DataTypes.DATE, allowNull: true },
  sent_at: { type: DataTypes.DATE, allowNull: true },
  is_sent: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
  channel: { type: DataTypes.STRING(10), defaultValue: 'in_app' },
  // Phase 16: Smart notification fields
  reminder_before: { type: DataTypes.INTEGER, allowNull: true, comment: 'Minutes before event to send reminder' },
  dynamic_message: { type: DataTypes.TEXT, allowNull: true, comment: 'AI-generated dynamic message content' },
  priority: { type: DataTypes.STRING(10), defaultValue: 'medium', comment: 'low|medium|high|urgent' },
  related_item_id: { type: DataTypes.STRING(36), allowNull: true, comment: 'task_id or habit_id' },
  related_item_type: { type: DataTypes.STRING(10), allowNull: true, comment: 'task|habit' },
}, { tableName: 'notifications', underscored: false });

module.exports = { Insight, Notification };
