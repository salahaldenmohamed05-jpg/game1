/**
 * ChatMessage Model — Phase 16
 * Individual messages within a chat session
 */

'use strict';

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const ChatMessage = sequelize.define('ChatMessage', {
  id: {
    type        : DataTypes.STRING(36),
    defaultValue: () => uuidv4(),
    primaryKey  : true,
  },
  session_id: {
    type    : DataTypes.STRING(36),
    allowNull: false,
  },
  user_id: {
    type    : DataTypes.STRING(36),
    allowNull: false,
  },
  role: {
    type        : DataTypes.STRING(15),
    allowNull   : false,
    defaultValue: 'user',
    validate    : { isIn: [['user', 'assistant', 'system']] },
  },
  content: {
    type    : DataTypes.TEXT,
    allowNull: false,
  },
  intent: {
    type    : DataTypes.STRING(50),
    allowNull: true,
  },
  mode: {
    type    : DataTypes.STRING(20),
    allowNull: true,
  },
  is_fallback: {
    type        : DataTypes.BOOLEAN,
    defaultValue: false,
  },
  confidence: {
    type    : DataTypes.FLOAT,
    allowNull: true,
  },
  actions_taken: {
    type        : DataTypes.TEXT,
    defaultValue: '[]',
    get() {
      try { return JSON.parse(this.getDataValue('actions_taken') || '[]'); }
      catch { return []; }
    },
    set(val) {
      this.setDataValue('actions_taken', JSON.stringify(val || []));
    },
  },
  suggestions: {
    type        : DataTypes.TEXT,
    defaultValue: '[]',
    get() {
      try { return JSON.parse(this.getDataValue('suggestions') || '[]'); }
      catch { return []; }
    },
    set(val) {
      this.setDataValue('suggestions', JSON.stringify(val || []));
    },
  },
  tokens_used: {
    type        : DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName : 'chat_messages',
  timestamps: true,
  indexes   : [
    { fields: ['session_id'] },
    { fields: ['user_id'] },
    { fields: ['session_id', 'createdAt'] },
  ],
});

module.exports = ChatMessage;
