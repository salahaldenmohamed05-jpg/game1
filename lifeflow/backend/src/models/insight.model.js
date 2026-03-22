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
}, { tableName: 'notifications', underscored: false });

module.exports = { Insight, Notification };
