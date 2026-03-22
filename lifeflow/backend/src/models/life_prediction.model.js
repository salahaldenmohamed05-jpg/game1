/**
 * LifePrediction Model — Phase 10
 * Stores life simulation / prediction results.
 */
'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const LifePrediction = sequelize.define('LifePrediction', {
  id:              { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:         { type: DataTypes.UUID, allowNull: false },
  prediction_type: { type: DataTypes.STRING(50), allowNull: false },
  scenario_label:  { type: DataTypes.STRING(200) },
  prediction_data: { type: DataTypes.JSON, defaultValue: {} },
  confidence_score:{ type: DataTypes.FLOAT, defaultValue: 0.5 },
  prediction_window: { type: DataTypes.INTEGER, defaultValue: 14 },
  baseline:        { type: DataTypes.JSON, defaultValue: {} },
  projected:       { type: DataTypes.JSON, defaultValue: {} },
}, { tableName: 'life_predictions', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
  indexes: [{ fields: ['user_id'] }, { fields: ['prediction_type'] }, { fields: ['created_at'] }] });

module.exports = LifePrediction;
