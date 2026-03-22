/**
 * BehaviorPattern Model — Phase 10
 * Stores individual detected behavioral correlations.
 */
'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BehaviorPattern = sequelize.define('BehaviorPattern', {
  id:           { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:      { type: DataTypes.UUID, allowNull: false },
  pattern_type: { type: DataTypes.STRING(50), allowNull: false },
  title:        { type: DataTypes.STRING(100) },
  correlation_score: { type: DataTypes.FLOAT, defaultValue: 0 },
  confidence_level:  { type: DataTypes.FLOAT, defaultValue: 0 },
  pattern_description: { type: DataTypes.TEXT },
  insight:      { type: DataTypes.TEXT },
  recommendation: { type: DataTypes.TEXT },
  actionable:   { type: DataTypes.BOOLEAN, defaultValue: true },
  icon:         { type: DataTypes.STRING(10) },
  extra_data:   { type: DataTypes.JSON, defaultValue: {} },
}, { tableName: 'behavior_patterns', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
  indexes: [{ fields: ['user_id'] }, { fields: ['pattern_type'] }, { fields: ['created_at'] }] });

module.exports = BehaviorPattern;
