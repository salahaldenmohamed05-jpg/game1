/**
 * Goal Model — Phase 12 + Behavior Engine Extension
 * ====================================================
 * Extended with behavior-engine fields:
 *   - goal_type: outcome | habit_building | breaking_habit | learning | milestone
 *   - time_horizon: daily | weekly | monthly | quarterly | yearly
 *   - success_metric: JSON SMART metrics
 *   - linked_behaviors: JSON array of linked habit/behavior IDs
 *   - source: onboarding | pattern_detection | user_created | behavior_upgrade | ai_suggested
 *   - auto_progress: boolean — auto-compute from linked behaviors/tasks
 *   - priority_score: float — computed by goal engine
 *   - smart_criteria: JSON — internal SMART analysis
 *   - eisenhower_quadrant: urgent_important | important | urgent | neither
 */
'use strict';
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Goal = sequelize.define('Goal', {
  id:         { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  user_id:    { type: DataTypes.UUID, allowNull: false },
  title:      { type: DataTypes.STRING(200), allowNull: false },
  description:{ type: DataTypes.TEXT },

  // ── Original fields ──────────────────────────────────────────────────
  category:   { type: DataTypes.STRING(50), defaultValue: 'general',
    validate: { isIn: [['health','productivity','learning','finance','relationships','personal','general','fitness','work','creativity','social']] } },
  target_date:{ type: DataTypes.DATEONLY },
  progress:   { type: DataTypes.INTEGER, defaultValue: 0, validate: { min: 0, max: 100 } },
  status:     { type: DataTypes.STRING(20), defaultValue: 'active',
    validate: { isIn: [['active','completed','paused','cancelled']] } },
  milestones: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('milestones') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('milestones', JSON.stringify(val || [])); },
  },
  tags: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('tags') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('tags', JSON.stringify(val || [])); },
  },
  last_update_note: { type: DataTypes.TEXT },

  // ── Behavior Engine Extension ────────────────────────────────────────
  goal_type: {
    type: DataTypes.STRING(30),
    defaultValue: 'outcome',
    comment: 'outcome | habit_building | breaking_habit | learning | milestone',
  },
  time_horizon: {
    type: DataTypes.STRING(20),
    defaultValue: 'monthly',
    comment: 'daily | weekly | monthly | quarterly | yearly',
  },
  success_metric: {
    type: DataTypes.TEXT, defaultValue: '{}',
    get() { try { return JSON.parse(this.getDataValue('success_metric') || '{}'); } catch { return {}; } },
    set(val) { this.setDataValue('success_metric', JSON.stringify(val || {})); },
    comment: 'JSON: { metric_type, target_value, current_value, unit, measurement_frequency }',
  },
  linked_behaviors: {
    type: DataTypes.TEXT, defaultValue: '[]',
    get() { try { return JSON.parse(this.getDataValue('linked_behaviors') || '[]'); } catch { return []; } },
    set(val) { this.setDataValue('linked_behaviors', JSON.stringify(val || [])); },
    comment: 'JSON array of habit IDs linked to this goal',
  },
  source: {
    type: DataTypes.STRING(30),
    defaultValue: 'user_created',
    comment: 'onboarding | pattern_detection | user_created | behavior_upgrade | ai_suggested',
  },
  auto_progress: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    comment: 'Auto-compute progress from linked behaviors and tasks',
  },
  priority_score: {
    type: DataTypes.FLOAT,
    defaultValue: 50,
    comment: 'Computed by goal engine (0-100)',
  },
  smart_criteria: {
    type: DataTypes.TEXT, defaultValue: '{}',
    get() { try { return JSON.parse(this.getDataValue('smart_criteria') || '{}'); } catch { return {}; } },
    set(val) { this.setDataValue('smart_criteria', JSON.stringify(val || {})); },
    comment: 'JSON: { specific, measurable, achievable, relevant, time_bound }',
  },
  eisenhower_quadrant: {
    type: DataTypes.STRING(20),
    defaultValue: 'important',
    comment: 'urgent_important | important | urgent | neither',
  },
}, {
  tableName: 'goals',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['status'] },
    { fields: ['target_date'] },
    { fields: ['goal_type'] },
    { fields: ['source'] },
  ],
});

module.exports = Goal;
