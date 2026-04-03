/**
 * ExecutionSession Model — Persistent Execution Tracking
 * ========================================================
 * Replaces in-memory Map with durable DB-backed session management.
 * 
 * State Machine:
 *   idle → active → paused → active → completed
 *                                    → abandoned (auto after timeout)
 *                 → abandoned (idle too long)
 *
 * Each session tracks:
 *   - What the user is working on (task/habit)
 *   - When they started, paused, resumed
 *   - Total active time (excluding pauses)
 *   - Mid-session nudges delivered
 *   - Skip classification (if skipped)
 *   - Completion satisfaction + learning reflection
 */

'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const ExecutionSession = sequelize.define('ExecutionSession', {
  id: {
    type: DataTypes.STRING(36),
    defaultValue: () => uuidv4(),
    primaryKey: true,
  },
  user_id: {
    type: DataTypes.STRING(36),
    allowNull: false,
  },

  // ─── What is being executed ────────────────────────────────────────────
  target_type: {
    type: DataTypes.STRING(20), // 'task' | 'habit' | 'break' | 'mood'
    allowNull: false,
    defaultValue: 'task',
  },
  target_id: {
    type: DataTypes.STRING(36), // task_id or habit_id
    allowNull: true,
  },
  target_title: {
    type: DataTypes.STRING(500),
    allowNull: true,
  },

  // ─── State Machine ─────────────────────────────────────────────────────
  // idle → active → paused → active → completed | abandoned
  state: {
    type: DataTypes.STRING(20),
    allowNull: false,
    defaultValue: 'active',
    validate: { isIn: [['idle', 'active', 'paused', 'completed', 'abandoned']] },
  },

  // ─── Timing ────────────────────────────────────────────────────────────
  started_at: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW,
  },
  paused_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  resumed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Total accumulated active time in seconds (excludes pauses)
  active_seconds: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  // Number of pause/resume cycles
  pause_count: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  // Estimated minutes from the engine suggestion
  estimated_minutes: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  // ─── Mid-session tracking ──────────────────────────────────────────────
  // JSON array of nudges sent during session: [{type, message, at, responded}]
  nudges_sent: {
    type: DataTypes.TEXT, // JSON string
    defaultValue: '[]',
    get() {
      try { return JSON.parse(this.getDataValue('nudges_sent') || '[]'); } catch { return []; }
    },
    set(v) { this.setDataValue('nudges_sent', JSON.stringify(v || [])); },
  },
  // JSON object of adaptation events: [{type, reason, at}]
  adaptations: {
    type: DataTypes.TEXT,
    defaultValue: '[]',
    get() {
      try { return JSON.parse(this.getDataValue('adaptations') || '[]'); } catch { return []; }
    },
    set(v) { this.setDataValue('adaptations', JSON.stringify(v || [])); },
  },

  // ─── Engine context at start ───────────────────────────────────────────
  mode_at_start: {
    type: DataTypes.STRING(20), // focus | momentum | warmup | recovery
    allowNull: true,
  },
  energy_at_start: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  confidence_at_start: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },

  // ─── Completion data ───────────────────────────────────────────────────
  // User satisfaction after completion (1-5 stars)
  satisfaction: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: { min: 1, max: 5 },
  },
  // Brief learning reflection text
  reflection: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Was the action fully completed or partially?
  completion_quality: {
    type: DataTypes.STRING(20), // 'full' | 'partial' | 'rushed'
    allowNull: true,
  },

  // ─── Skip / Resistance classification ──────────────────────────────────
  skip_type: {
    type: DataTypes.STRING(30),
    allowNull: true,
    // 'lazy' | 'overwhelmed' | 'busy' | 'wrong_task' | 'unclear' | 'low_energy' | 'interrupted'
  },
  skip_reason_text: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  // Was user deferred to an alternative?
  switched_to_id: {
    type: DataTypes.STRING(36),
    allowNull: true,
  },

  // ─── Reward data ───────────────────────────────────────────────────────
  // Points/XP earned from completing this session
  reward_xp: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  // Streak continuation flag
  streak_continued: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  // Achievement unlocked (if any)
  achievement: {
    type: DataTypes.STRING(100),
    allowNull: true,
  },

}, {
  tableName: 'execution_sessions',
  timestamps: true,
  indexes: [
    { fields: ['user_id'] },
    { fields: ['user_id', 'state'] },
    { fields: ['user_id', 'started_at'] },
    { fields: ['target_type', 'target_id'] },
    { fields: ['state'] },
  ],
});

module.exports = ExecutionSession;
