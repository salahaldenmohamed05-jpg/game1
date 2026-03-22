/**
 * BehaviorProfile Model — Phase 10
 * Stores the user's behavioral model snapshot.
 */
'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BehaviorProfile = sequelize.define('BehaviorProfile', {
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:    { type: DataTypes.UUID, allowNull: false },
  focus_peak_hours:    { type: DataTypes.JSON, defaultValue: [] },
  stress_triggers:     { type: DataTypes.JSON, defaultValue: [] },
  productivity_pattern:{ type: DataTypes.JSON, defaultValue: {} },
  sleep_pattern:       { type: DataTypes.JSON, defaultValue: {} },
  habit_strength:      { type: DataTypes.JSON, defaultValue: {} },
  motivation_pattern:  { type: DataTypes.JSON, defaultValue: {} },
  mood_pattern:        { type: DataTypes.JSON, defaultValue: {} },
  data_quality:        { type: DataTypes.STRING(20), defaultValue: 'fair' },
  period_days:         { type: DataTypes.INTEGER, defaultValue: 30 },
}, { tableName: 'behavior_profiles', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
  indexes: [{ fields: ['user_id'] }, { fields: ['created_at'] }] });

module.exports = BehaviorProfile;
