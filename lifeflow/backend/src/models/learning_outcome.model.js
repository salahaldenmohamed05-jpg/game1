/**
 * LearningOutcome Model — Phase 15/16
 * Persists ML learning data to database so it survives server restarts.
 * Replaces the in-memory learningStore Map for durable ML training data.
 */

'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const LearningOutcome = sequelize.define('LearningOutcome', {
  id: {
    type        : DataTypes.STRING(36),
    defaultValue: () => uuidv4(),
    primaryKey  : true,
  },
  user_id: {
    type    : DataTypes.STRING(36),
    allowNull: false,
  },
  // Type: 'decision' | 'outcome'
  type: {
    type        : DataTypes.STRING(20),
    defaultValue: 'outcome',
    allowNull   : false,
  },
  // Action taken (create_task, complete_task, chat, etc.)
  action: {
    type    : DataTypes.STRING(50),
    allowNull: true,
  },
  // Was the action successful?
  success: {
    type        : DataTypes.BOOLEAN,
    defaultValue: true,
  },
  // User energy at time of action (0-100)
  energy: {
    type        : DataTypes.INTEGER,
    defaultValue: 55,
  },
  // User mood at time of action (1-10)
  mood: {
    type        : DataTypes.FLOAT,
    defaultValue: 5.0,
  },
  // Hour of day (0-23) for optimal time tracking
  hour: {
    type        : DataTypes.INTEGER,
    defaultValue: 12,
  },
  // Day of week (0=Sun, 6=Sat)
  day_of_week: {
    type        : DataTypes.INTEGER,
    defaultValue: 1,
  },
  // Interaction mode (companion | manager | advisor)
  mode: {
    type    : DataTypes.STRING(20),
    allowNull: true,
  },
  // Suggestion type (if this was a suggestion interaction)
  suggestion_type: {
    type    : DataTypes.STRING(50),
    allowNull: true,
  },
  // User response to suggestion (accepted | rejected | ignored)
  user_response: {
    type    : DataTypes.STRING(20),
    allowNull: true,
  },
  // Reason for failure (if any)
  fail_reason: {
    type    : DataTypes.STRING(100),
    allowNull: true,
  },
  // Priority of the action (urgent | high | medium | low)
  priority: {
    type    : DataTypes.STRING(20),
    allowNull: true,
  },
  // Risk level (low | medium | high)
  risk: {
    type    : DataTypes.STRING(20),
    allowNull: true,
  },
  // Confidence score (0-100)
  confidence: {
    type        : DataTypes.FLOAT,
    defaultValue: 70,
  },
  // Timestamp of the event (milliseconds)
  ts: {
    type        : DataTypes.BIGINT,
    defaultValue: () => Date.now(),
  },
}, {
  tableName : 'learning_outcomes',
  timestamps: true,
  indexes   : [
    { fields: ['user_id'] },
    { fields: ['user_id', 'type'] },
    { fields: ['user_id', 'action'] },
    { fields: ['ts'] },
  ],
});

module.exports = LearningOutcome;
