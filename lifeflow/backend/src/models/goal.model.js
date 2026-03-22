/**
 * Goal Model — Phase 12
 */
'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Goal = sequelize.define('Goal', {
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:    { type: DataTypes.UUID, allowNull: false },
  title:      { type: DataTypes.STRING(200), allowNull: false },
  description:{ type: DataTypes.TEXT },
  category:   { type: DataTypes.STRING(50), defaultValue: 'general',
    validate: { isIn: [['health','productivity','learning','finance','relationships','personal','general']] } },
  target_date:{ type: DataTypes.DATEONLY },
  progress:   { type: DataTypes.INTEGER, defaultValue: 0, validate: { min: 0, max: 100 } },
  status:     { type: DataTypes.STRING(20), defaultValue: 'active',
    validate: { isIn: [['active','completed','paused','cancelled']] } },
  milestones: { type: DataTypes.JSON, defaultValue: [] },
  tags:       { type: DataTypes.JSON, defaultValue: [] },
  last_update_note: { type: DataTypes.TEXT },
}, { tableName: 'goals', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: 'updated_at',
  indexes: [{ fields: ['user_id'] }, { fields: ['status'] }, { fields: ['target_date'] }] });

module.exports = Goal;
