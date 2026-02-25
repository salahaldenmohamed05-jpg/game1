/**
 * User Model - SQLite/PostgreSQL compatible
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const User = sequelize.define('User', {
  id: { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true, validate: { isEmail: true } },
  password: { type: DataTypes.STRING(255), allowNull: false },
  avatar: { type: DataTypes.TEXT, allowNull: true },
  timezone: { type: DataTypes.STRING(50), defaultValue: 'Africa/Cairo' },
  language: { type: DataTypes.STRING(5), defaultValue: 'ar' },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  is_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  last_login: { type: DataTypes.DATE, allowNull: true },
  wake_up_time: { type: DataTypes.STRING(8), defaultValue: '07:00' },
  sleep_time: { type: DataTypes.STRING(8), defaultValue: '23:00' },
  work_start_time: { type: DataTypes.STRING(8), defaultValue: '09:00' },
  work_end_time: { type: DataTypes.STRING(8), defaultValue: '17:00' },
  notifications_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  smart_reminders: { type: DataTypes.BOOLEAN, defaultValue: true },
  ai_personality: { type: DataTypes.STRING(20), defaultValue: 'friendly' },
  fcm_token: { type: DataTypes.TEXT, allowNull: true },
  refresh_token: { type: DataTypes.TEXT, allowNull: true },
  behavior_profile: {
    type: DataTypes.TEXT,
    defaultValue: '{}',
    get() { try { return JSON.parse(this.getDataValue('behavior_profile') || '{}'); } catch { return {}; } },
    set(val) { this.setDataValue('behavior_profile', JSON.stringify(val)); },
  },
}, {
  tableName: 'users',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) user.password = await bcrypt.hash(user.password, 12);
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) user.password = await bcrypt.hash(user.password, 12);
    },
  },
});

User.prototype.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

User.prototype.toSafeObject = function () {
  const obj = this.toJSON();
  delete obj.password;
  delete obj.refresh_token;
  return obj;
};

module.exports = User;
