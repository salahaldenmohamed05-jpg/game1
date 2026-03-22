/**
 * ExternalEvent Model — Phase 14
 */
'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ExternalEvent = sequelize.define('ExternalEvent', {
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:    { type: DataTypes.UUID, allowNull: false },
  source:     { type: DataTypes.STRING(50), allowNull: false },
  event_type: { type: DataTypes.STRING(50), allowNull: false },
  event_data: { type: DataTypes.JSON, defaultValue: {} },
  event_date: { type: DataTypes.DATEONLY, allowNull: false },
  title:      { type: DataTypes.STRING(200) },
  duration_minutes: { type: DataTypes.INTEGER },
  is_busy:    { type: DataTypes.BOOLEAN, defaultValue: false },
  external_id:{ type: DataTypes.STRING(200) },
}, { tableName: 'external_events', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
  indexes: [{ fields: ['user_id'] }, { fields: ['event_date'] }, { fields: ['source'] }] });

module.exports = ExternalEvent;
