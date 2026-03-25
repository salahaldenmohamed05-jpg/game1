/**
 * ChatSession Model — Phase 16
 * Persistent chat sessions for multi-session memory
 */

'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const ChatSession = sequelize.define('ChatSession', {
  id: {
    type        : DataTypes.STRING(36),
    defaultValue: () => uuidv4(),
    primaryKey  : true,
  },
  user_id: {
    type    : DataTypes.STRING(36),
    allowNull: false,
  },
  title: {
    type        : DataTypes.STRING(255),
    allowNull   : true,
    defaultValue: 'محادثة جديدة',
  },
  summary: {
    type    : DataTypes.TEXT,
    allowNull: true,
  },
  message_count: {
    type        : DataTypes.INTEGER,
    defaultValue: 0,
  },
  last_message_at: {
    type    : DataTypes.DATE,
    allowNull: true,
  },
  is_active: {
    type        : DataTypes.BOOLEAN,
    defaultValue: true,
  },
  metadata: {
    type        : DataTypes.TEXT,
    defaultValue: '{}',
    get() {
      try { return JSON.parse(this.getDataValue('metadata') || '{}'); }
      catch { return {}; }
    },
    set(val) {
      this.setDataValue('metadata', JSON.stringify(val || {}));
    },
  },
}, {
  tableName : 'chat_sessions',
  timestamps: true,
  indexes   : [
    { fields: ['user_id'] },
    { fields: ['user_id', 'is_active'] },
  ],
});

module.exports = ChatSession;
