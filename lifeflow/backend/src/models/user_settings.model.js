/**
 * UserSettings Model — Control Center
 * ======================================
 * System behavior settings that ACTIVELY affect:
 *  - Notification delivery timing and types
 *  - AI intervention level and recommendation style
 *  - Auto-rescheduling behavior
 *  - Privacy and data usage
 *
 * These are NOT cosmetic — they control the engine.
 */
'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const UserSettings = sequelize.define('UserSettings', {
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

  // ── App Preferences ─────────────────────────────────────────────────
  language: {
    type: DataTypes.STRING(5),
    defaultValue: 'ar',
  },
  theme: {
    type: DataTypes.STRING(10),
    defaultValue: 'dark',
    validate: { isIn: [['dark', 'light', 'auto']] },
  },
  time_format: {
    type: DataTypes.STRING(5),
    defaultValue: '24h',
    validate: { isIn: [['12h', '24h']] },
  },
  start_of_week: {
    type: DataTypes.STRING(10),
    defaultValue: 'saturday',
    validate: { isIn: [['saturday', 'sunday', 'monday']] },
  },

  // ── Notifications ───────────────────────────────────────────────────
  notifications_enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  notification_sound: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  quiet_hours_start: {
    type: DataTypes.STRING(8),
    defaultValue: '23:00',
  },
  quiet_hours_end: {
    type: DataTypes.STRING(8),
    defaultValue: '07:00',
  },
  notify_tasks: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  notify_habits: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  notify_mood: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  notify_ai_suggestions: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  notify_weekly_report: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  // ── AI Behavior (CRITICAL) ──────────────────────────────────────────
  ai_intervention_level: {
    type: DataTypes.STRING(10),
    defaultValue: 'medium',
    validate: { isIn: [['low', 'medium', 'high']] },
  },
  recommendation_style: {
    type: DataTypes.STRING(20),
    defaultValue: 'balanced',
    validate: { isIn: [['minimal', 'balanced', 'proactive']] },
  },
  auto_reschedule: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  ai_coaching_tone: {
    type: DataTypes.STRING(20),
    defaultValue: 'friendly',
    validate: { isIn: [['friendly', 'strict', 'soft', 'analytical', 'coach']] },
  },
  smart_reminders: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },

  // ── Privacy ─────────────────────────────────────────────────────────
  data_collection: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,   // allow AI to learn from user patterns
  },
  share_anonymous_stats: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  export_data_requested: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  delete_requested_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  tableName: 'user_settings',
  underscored: false,
  timestamps: true,
  indexes: [
    { fields: ['user_id'], unique: true },
  ],
});

module.exports = UserSettings;
