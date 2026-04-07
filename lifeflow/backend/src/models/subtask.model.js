/**
 * Subtask Model — Phase 13.1
 * ============================
 * Subtasks allow task decomposition with:
 *   - Individual completion tracking
 *   - Estimated time per subtask
 *   - XP/score contribution based on parent task
 *   - Automatic parent task completion % derivation
 */

'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const Subtask = sequelize.define('Subtask', {
  id: {
    type: DataTypes.STRING(36),
    defaultValue: () => uuidv4(),
    primaryKey: true,
  },
  task_id: {
    type: DataTypes.STRING(36),
    allowNull: false,
  },
  user_id: {
    type: DataTypes.STRING(36),
    allowNull: false,
  },
  title: {
    type: DataTypes.STRING(500),
    allowNull: false,
  },
  completed: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  completed_at: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  estimated_time: {
    type: DataTypes.INTEGER,       // minutes
    allowNull: true,
    defaultValue: null,
  },
  order_index: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'subtasks',
  timestamps: true,
  indexes: [
    { fields: ['task_id'] },
    { fields: ['user_id'] },
    { fields: ['task_id', 'order_index'] },
  ],
});

module.exports = Subtask;
