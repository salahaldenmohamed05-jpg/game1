/**
 * UserProfile Model — Personalization Hub
 * =========================================
 * Stores user's life context, energy profile, focus areas, and goals.
 * This data DIRECTLY feeds into the AI engine for personalized behavior.
 *
 * NOT a static form — every field here influences:
 *  - AI recommendations
 *  - Smart scheduling
 *  - Notification timing
 *  - Task prioritization
 */
'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const UserProfile = sequelize.define('UserProfile', {
  id: {
    type: DataTypes.STRING(36),
    defaultValue: () => uuidv4(),
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.STRING(36),
    allowNull: false,
    unique: true,
  },

  // ── Life Context ────────────────────────────────────────────────────
  role: {
    type: DataTypes.STRING(30),
    defaultValue: 'employee',
    validate: { isIn: [['student', 'employee', 'freelancer', 'entrepreneur', 'parent', 'retired', 'other']] },
  },
  focus_areas: {
    type: DataTypes.TEXT,
    defaultValue: '["work"]',
    get() { try { return JSON.parse(this.getDataValue('focus_areas') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('focus_areas', JSON.stringify(Array.isArray(v) ? v : [])); },
  },
  bio: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // ── Energy Profile ──────────────────────────────────────────────────
  preferred_work_time: {
    type: DataTypes.STRING(20),
    defaultValue: 'morning',
    validate: { isIn: [['early_morning', 'morning', 'afternoon', 'evening', 'night']] },
  },
  energy_level: {
    type: DataTypes.STRING(20),
    defaultValue: 'medium',
    validate: { isIn: [['very_low', 'low', 'medium', 'high', 'very_high']] },
  },
  deep_work_duration: {
    type: DataTypes.INTEGER,
    defaultValue: 90,      // minutes — preferred deep work block length
    validate: { min: 15, max: 240 },
  },
  break_frequency: {
    type: DataTypes.INTEGER,
    defaultValue: 60,      // minutes — how often the user wants break reminders
    validate: { min: 15, max: 180 },
  },

  // ── Goals ───────────────────────────────────────────────────────────
  weekly_goals: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('weekly_goals') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('weekly_goals', JSON.stringify(Array.isArray(v) ? v : [])); },
  },
  monthly_goals: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('monthly_goals') || '[]'); } catch { return []; } },
    set(v) { this.setDataValue('monthly_goals', JSON.stringify(Array.isArray(v) ? v : [])); },
  },

  // ── Metadata ────────────────────────────────────────────────────────
  profile_completeness: {
    type: DataTypes.INTEGER,
    defaultValue: 0,      // 0-100%
  },
  last_ai_sync: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'user_profiles',
  underscored: false,
  timestamps: true,
  indexes: [
    { fields: ['user_id'], unique: true },
  ],
});

module.exports = UserProfile;
