/**
 * Goal Engine Service — Phase 12
 * ================================
 * Manages long-term goals, progress monitoring, and life optimization.
 */

'use strict';

const { Op, DataTypes } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

function getGoalModel() {
  return require('../models/goal.model');
}

function getModels() {
  const Task  = require('../models/task.model');
  const { Habit } = require('../models/habit.model');
  const ProductivityScore = require('../models/productivity_score.model');
  return { Task, Habit, ProductivityScore };
}

/**
 * getUserGoals(userId, timezone)
 */
async function getUserGoals(userId, timezone = 'Africa/Cairo') {
  try {
    const Goal = getGoalModel();
    const goals = await Goal.findAll({
      where: { user_id: userId },
      order: [['target_date', 'ASC']],
      raw: true,
    });

    // Enrich with progress analysis
    const enriched = goals.map(g => ({
      ...g,
      days_remaining: g.target_date
        ? Math.max(0, moment.tz(g.target_date, timezone).diff(moment.tz(timezone), 'days'))
        : null,
      is_overdue: g.target_date && moment.tz(g.target_date, timezone).isBefore(moment.tz(timezone)) && g.status !== 'completed',
      progress_label: getProgressLabel(g.progress || 0),
      momentum: getMomentum(g),
    }));

    const summary = {
      total:    goals.length,
      active:   goals.filter(g => g.status === 'active').length,
      completed: goals.filter(g => g.status === 'completed').length,
      overdue:  enriched.filter(g => g.is_overdue).length,
    };

    return { goals: enriched, summary };
  } catch (err) {
    logger.error('getUserGoals error:', err.message);
    throw err;
  }
}

/**
 * createGoal(userId, data)
 */
async function createGoal(userId, data, timezone = 'Africa/Cairo') {
  try {
    const Goal = getGoalModel();
    const goal = await Goal.create({
      user_id:     userId,
      title:       data.title,
      description: data.description || null,
      category:    data.category || 'general',
      target_date: data.target_date || null,
      progress:    0,
      status:      'active',
      milestones:  data.milestones || [],
      tags:        data.tags || [],
    });
    return goal;
  } catch (err) {
    logger.error('createGoal error:', err.message);
    throw err;
  }
}

/**
 * updateGoalProgress(goalId, userId, progress, note)
 */
async function updateGoalProgress(goalId, userId, progress, note = null) {
  try {
    const Goal = getGoalModel();
    const goal = await Goal.findOne({ where: { id: goalId, user_id: userId } });
    if (!goal) return null;

    goal.progress       = Math.min(100, Math.max(0, progress));
    goal.last_update_note = note;
    if (goal.progress >= 100) goal.status = 'completed';
    await goal.save();
    return goal;
  } catch (err) {
    logger.error('updateGoalProgress error:', err.message);
    throw err;
  }
}

/**
 * getLifeOptimization(userId, timezone)
 * Returns the overall life optimization analysis.
 */
async function getLifeOptimization(userId, timezone = 'Africa/Cairo') {
  try {
    const Goal = getGoalModel();
    const { Task, Habit, ProductivityScore } = getModels();
    const since30 = moment.tz(timezone).subtract(30, 'days').toDate();
    const since7  = moment.tz(timezone).subtract(7, 'days').toDate();

    const [goals, tasks, scores] = await Promise.all([
      Goal.findAll({ where: { user_id: userId, status: 'active' }, raw: true }),
      Task.findAll({ where: { user_id: userId, [Op.or]: [{ due_date: { [Op.gte]: since30 } }, { completed_at: { [Op.gte]: since30 } }] }, raw: true }),
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since7 } }, raw: true }),
    ]);

    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((s, r) => s + (r.overall_score || 0), 0) / scores.length) : 55;
    const taskRate = tasks.length > 0
      ? Math.round((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100) : 0;

    // Optimization dimensions
    const dimensions = [
      { dim: 'productivity',    score: avgScore,  label: 'الإنتاجية',    icon: '📊', weight: 0.30 },
      { dim: 'goal_progress',   score: calcGoalScore(goals), label: 'الأهداف', icon: '🎯', weight: 0.25 },
      { dim: 'task_completion', score: taskRate,  label: 'إتمام المهام', icon: '✅', weight: 0.25 },
      { dim: 'consistency',     score: calcConsistency(tasks, timezone), label: 'الاتساق', icon: '🔄', weight: 0.20 },
    ];

    const overallScore = Math.round(dimensions.reduce((s, d) => s + d.score * d.weight, 0));

    // Optimization actions
    const actions = buildOptimizationActions(dimensions, goals, tasks);

    return {
      user_id:       userId,
      generated_at:  moment.tz(timezone).toISOString(),
      overall_score: overallScore,
      overall_label: overallScore >= 75 ? 'ممتاز' : overallScore >= 55 ? 'جيد' : 'يحتاج تحسين',
      dimensions,
      active_goals: goals.length,
      optimization_actions: actions,
      schedule_health: analyzeScheduleHealth(tasks, timezone),
    };
  } catch (err) {
    logger.error('getLifeOptimization error:', err.message);
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getProgressLabel(progress) {
  if (progress >= 100) return 'مكتمل ✅';
  if (progress >= 75)  return 'قريب من الإنجاز 🏁';
  if (progress >= 50)  return 'في منتصف الطريق 📍';
  if (progress >= 25)  return 'بداية جيدة 🌱';
  return 'لم يبدأ بعد 🕐';
}

function getMomentum(goal) {
  if (!goal.target_date) return 'normal';
  const daysLeft = moment(goal.target_date).diff(moment(), 'days');
  const progress = goal.progress || 0;
  const expectedProgress = Math.max(0, 100 - (daysLeft / 90) * 100); // 90 day default
  if (progress > expectedProgress + 10) return 'ahead';
  if (progress < expectedProgress - 10) return 'behind';
  return 'on_track';
}

function calcGoalScore(goals) {
  if (goals.length === 0) return 50;
  const avgProgress = goals.reduce((s, g) => s + (g.progress || 0), 0) / goals.length;
  return Math.round(avgProgress);
}

function calcConsistency(tasks, timezone) {
  if (tasks.length < 7) return 50;
  const dayMap = {};
  tasks.filter(t => t.status === 'completed').forEach(t => {
    if (t.completed_at) {
      const day = moment.tz(t.completed_at, timezone).format('YYYY-MM-DD');
      dayMap[day] = true;
    }
  });
  const activeDays = Object.keys(dayMap).length;
  return Math.min(100, Math.round((activeDays / 30) * 100 * 1.5));
}

function buildOptimizationActions(dimensions, goals, tasks) {
  const actions = [];
  const lowest  = [...dimensions].sort((a, b) => a.score - b.score)[0];

  if (lowest.dim === 'productivity' && lowest.score < 60) {
    actions.push({ priority: 1, action: 'رفع الإنتاجية', description: 'ركّز على إنجاز 3 مهام يومياً بشكل منتظم', icon: '📈' });
  }
  if (lowest.dim === 'goal_progress' && goals.length === 0) {
    actions.push({ priority: 1, action: 'تحديد هدف', description: 'أضف هدفاً واحداً واضحاً لهذا الشهر', icon: '🎯' });
  }
  if (lowest.dim === 'task_completion' && lowest.score < 50) {
    actions.push({ priority: 2, action: 'تحسين إتمام المهام', description: 'قلّل عدد المهام اليومية وركّز على الجودة لا الكمية', icon: '✅' });
  }

  // Schedule protection
  const urgentCount = tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length;
  if (urgentCount >= 3) {
    actions.push({ priority: 1, action: 'حماية وقت التركيز', description: 'لديك مهام عاجلة — أغلق الإشعارات وخصص ساعتين للإنجاز', icon: '🛡️' });
  }

  // Balance workload
  actions.push({ priority: 3, action: 'توازن عبء العمل', description: 'وزّع مهامك على أيام الأسبوع بالتساوي لتجنب الإجهاد', icon: '⚖️' });

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 4);
}

function analyzeScheduleHealth(tasks, timezone) {
  if (tasks.length === 0) return { score: 50, label: 'لا توجد بيانات كافية', issues: [] };

  const issues = [];
  const urgentPending = tasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length;
  const overdueTasks  = tasks.filter(t => t.due_date && moment(t.due_date).isBefore(moment()) && t.status !== 'completed').length;

  if (urgentPending >= 5) issues.push({ type: 'overload',  message: `${urgentPending} مهمة عاجلة معلقة` });
  if (overdueTasks >= 3)  issues.push({ type: 'overdue',   message: `${overdueTasks} مهمة متأخرة` });

  const score = Math.max(0, 100 - urgentPending * 8 - overdueTasks * 10);
  return {
    score,
    label: score >= 70 ? 'جدول صحي' : score >= 50 ? 'يحتاج مراجعة' : 'جدول مكتظ',
    issues,
  };
}

module.exports = { getUserGoals, createGoal, updateGoalProgress, getLifeOptimization };
