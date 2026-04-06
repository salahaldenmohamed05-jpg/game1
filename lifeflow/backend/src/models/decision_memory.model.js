/**
 * DecisionMemory Model — Phase 13: Persistent Decision Memory
 * =============================================================
 * Persists brain decision history, rejection streaks, and blocked tasks
 * to database so state survives server restarts.
 *
 * Replaces the in-memory `brainCache.decisionMemory` for durability.
 * One row per user — stores the full decision memory as JSON.
 */

'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const DecisionMemory = sequelize.define('DecisionMemory', {
  id: {
    type        : DataTypes.STRING(36),
    defaultValue: () => uuidv4(),
    primaryKey  : true,
  },
  user_id: {
    type     : DataTypes.STRING(36),
    allowNull: false,
    unique   : true,
  },

  // Full decision history (last N decisions as JSON array)
  // Each entry: { taskId, taskTitle, type, intent, action, timestamp, confidence }
  decision_history: {
    type        : DataTypes.TEXT,
    defaultValue: '[]',
    get() {
      const raw = this.getDataValue('decision_history');
      try { return JSON.parse(raw || '[]'); } catch { return []; }
    },
    set(val) {
      this.setDataValue('decision_history', JSON.stringify(val || []));
    },
  },

  // Rejection streak data: { taskId: { count, lastRejectedAt, reason } }
  rejection_streaks: {
    type        : DataTypes.TEXT,
    defaultValue: '{}',
    get() {
      const raw = this.getDataValue('rejection_streaks');
      try { return JSON.parse(raw || '{}'); } catch { return {}; }
    },
    set(val) {
      this.setDataValue('rejection_streaks', JSON.stringify(val || {}));
    },
  },

  // Blocked tasks: [{ taskId, blockedAt, reason, cooldownUntil }]
  blocked_tasks: {
    type        : DataTypes.TEXT,
    defaultValue: '[]',
    get() {
      const raw = this.getDataValue('blocked_tasks');
      try { return JSON.parse(raw || '[]'); } catch { return []; }
    },
    set(val) {
      this.setDataValue('blocked_tasks', JSON.stringify(val || []));
    },
  },

  // Adaptive signals snapshot: { rejectionStreak, completionStreak, skipTypes, difficultyModifier, ... }
  adaptive_signals: {
    type        : DataTypes.TEXT,
    defaultValue: '{}',
    get() {
      const raw = this.getDataValue('adaptive_signals');
      try { return JSON.parse(raw || '{}'); } catch { return {}; }
    },
    set(val) {
      this.setDataValue('adaptive_signals', JSON.stringify(val || {}));
    },
  },

  // Summary stats
  total_decisions:       { type: DataTypes.INTEGER, defaultValue: 0 },
  total_rejections:      { type: DataTypes.INTEGER, defaultValue: 0 },
  recent_acceptance_rate:{ type: DataTypes.FLOAT,   defaultValue: 0 },

  // Last persisted timestamp
  last_persisted_at: {
    type        : DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName : 'decision_memories',
  timestamps: true,
  indexes   : [
    { unique: true, fields: ['user_id'] },
  ],
});

module.exports = DecisionMemory;
