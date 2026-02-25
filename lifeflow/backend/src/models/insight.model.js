/**
 * Insight, Notification, Goal Models - SQLite/PostgreSQL compatible
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
}, { tableName: 'insights' });

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
}, { tableName: 'notifications' });

const Goal = sequelize.define('Goal', {
  id: { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },
  name: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  category: { type: DataTypes.STRING(20), defaultValue: 'personal' },
  deadline: { type: DataTypes.DATEONLY, allowNull: true },
  progress: { type: DataTypes.FLOAT, defaultValue: 0 },
  milestones: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('milestones') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('milestones', JSON.stringify(val || [])); },
  },
  status: { type: DataTypes.STRING(15), defaultValue: 'active' },
  ai_breakdown: {
    type: DataTypes.TEXT, defaultValue: null,
    get() { try { const v = this.getDataValue('ai_breakdown'); return v ? JSON.parse(v) : null; } catch { return null; } },
    set(val) { this.setDataValue('ai_breakdown', val ? JSON.stringify(val) : null); },
  },
}, { tableName: 'goals' });

module.exports = { Insight, Notification, Goal };
