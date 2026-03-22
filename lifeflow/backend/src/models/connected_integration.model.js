/**
 * ConnectedIntegration Model — Phase 14
 */
'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ConnectedIntegration = sequelize.define('ConnectedIntegration', {
  id:               { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:          { type: DataTypes.UUID, allowNull: false },
  integration_type: { type: DataTypes.STRING(50), allowNull: false,
    validate: { isIn: [['google_calendar','apple_calendar','outlook','google_fit','apple_health','samsung_health','notion','todoist','trello','custom']] } },
  display_name:     { type: DataTypes.STRING(100) },
  access_token:     { type: DataTypes.TEXT },
  refresh_token:    { type: DataTypes.TEXT },
  token_expires_at: { type: DataTypes.DATE },
  is_active:        { type: DataTypes.BOOLEAN, defaultValue: true },
  last_synced_at:   { type: DataTypes.DATE },
  sync_settings:    { type: DataTypes.JSON, defaultValue: {} },
  connected_at:     { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
}, { tableName: 'connected_integrations', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
  indexes: [{ fields: ['user_id'] }, { unique: true, fields: ['user_id', 'integration_type'] }] });

module.exports = ConnectedIntegration;
