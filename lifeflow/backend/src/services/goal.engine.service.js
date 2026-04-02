/**
 * Goal Engine Service v2.0 — Behavior-Aware
 * ═════════════════════════════════════════════════════
 * Phase 12 + Behavior Engine Integration
 *
 * Responsibilities:
 *   1. Compute goal priority scores for daily planning
 *   2. Map tasks + behaviors to goals, compute goal progress
 *   3. Generate goal-aware suggestions for the day planner
 *   4. Provide goal context to the execution engine and AI orchestrator
 *   5. Detect stale/neglected goals and trigger nudges
 *   6. NEW: Auto-generate goals from onboarding selections
 *   7. NEW: Map goals → behaviors (habits with behavior_spec)
 *   8. NEW: Auto-update progress from linked behaviors + tasks
 *   9. NEW: Suggest goals from usage patterns
 *
 * Integration pipeline: Goal → Behavior → Task → Execution Engine
 */

'use strict';

const { Op } = require('sequelize');
const moment = require('moment-timezone');
const logger = require('../utils/logger');

function getModels() {
  const m = {};
  try { m.Goal = require('../models/goal.model'); } catch (_) {}
  try { m.Task = require('../models/task.model'); } catch (_) {}
  try { const { Habit, HabitLog } = require('../models/habit.model'); m.Habit = Habit; m.HabitLog = HabitLog; } catch (_) {}
  return m;
}

function getBehaviorEngine() {
  try { return require('./behavior.engine.service'); } catch (_) { return null; }
}

// ─── Goal templates for onboarding ──────────────────────────────────────────
const AREA_GOAL_TEMPLATES = {
  productivity: {
    title: 'زيادة الإنتاجية اليومية',
    description: 'إنجاز المهام المهمة يومياً بتركيز وكفاءة',
    category: 'productivity',
    goal_type: 'habit_building',
    time_horizon: 'monthly',
    success_metric: { metric_type: 'completion_rate', target_value: 80, unit: '%', measurement_frequency: 'weekly' },
    eisenhower_quadrant: 'important',
  },
  study: {
    title: 'تطوير عادات الدراسة',
    description: 'بناء روتين مذاكرة منتظم ومركّز',
    category: 'learning',
    goal_type: 'habit_building',
    time_horizon: 'monthly',
    success_metric: { metric_type: 'streak', target_value: 21, unit: 'يوم', measurement_frequency: 'daily' },
    eisenhower_quadrant: 'important',
  },
  health: {
    title: 'تحسين الصحة اليومية',
    description: 'بناء عادات صحية يومية مستدامة',
    category: 'health',
    goal_type: 'habit_building',
    time_horizon: 'monthly',
    success_metric: { metric_type: 'consistency', target_value: 90, unit: '%', measurement_frequency: 'weekly' },
    eisenhower_quadrant: 'important',
  },
  fitness: {
    title: 'بناء لياقة بدنية',
    description: 'ممارسة الرياضة بانتظام وبناء القوة',
    category: 'health',
    goal_type: 'habit_building',
    time_horizon: 'monthly',
    success_metric: { metric_type: 'frequency', target_value: 5, unit: 'مرات/أسبوع', measurement_frequency: 'weekly' },
    eisenhower_quadrant: 'important',
  },
  work: {
    title: 'تنظيم العمل والمهام',
    description: 'إدارة المهام المهنية بكفاءة وتخطيط يومي',
    category: 'productivity',
    goal_type: 'outcome',
    time_horizon: 'monthly',
    success_metric: { metric_type: 'completion_rate', target_value: 85, unit: '%', measurement_frequency: 'weekly' },
    eisenhower_quadrant: 'urgent_important',
  },
  creativity: {
    title: 'تنمية الإبداع',
    description: 'تخصيص وقت يومي للممارسة الإبداعية',
    category: 'personal',
    goal_type: 'habit_building',
    time_horizon: 'monthly',
    success_metric: { metric_type: 'streak', target_value: 14, unit: 'يوم', measurement_frequency: 'daily' },
    eisenhower_quadrant: 'important',
  },
  social: {
    title: 'تقوية العلاقات',
    description: 'التواصل المنتظم مع الأشخاص المهمين',
    category: 'relationships',
    goal_type: 'habit_building',
    time_horizon: 'monthly',
    success_metric: { metric_type: 'frequency', target_value: 3, unit: 'مرات/أسبوع', measurement_frequency: 'weekly' },
    eisenhower_quadrant: 'important',
  },
  finance: {
    title: 'السيطرة المالية',
    description: 'تتبع المصاريف والوعي المالي اليومي',
    category: 'finance',
    goal_type: 'habit_building',
    time_horizon: 'monthly',
    success_metric: { metric_type: 'consistency', target_value: 80, unit: '%', measurement_frequency: 'weekly' },
    eisenhower_quadrant: 'important',
  },
};

// ─── Goal priority scoring (enhanced) ────────────────────────────────────────
function scoreGoal(goal, linkedTasks, linkedBehaviors) {
  let score = 50;

  // Deadline urgency
  if (goal.target_date) {
    const daysLeft = moment(goal.target_date).diff(moment(), 'days');
    if (daysLeft < 0) score += 40;
    else if (daysLeft <= 3) score += 30;
    else if (daysLeft <= 7) score += 20;
    else if (daysLeft <= 14) score += 10;
  }

  // Progress gap
  const progressGap = 100 - (goal.progress || 0);
  score += Math.round(progressGap * 0.2);

  // Category boost
  if (goal.category === 'health') score += 5;
  if (goal.category === 'learning') score += 3;

  // Linked task pressure
  const pendingLinked = (linkedTasks || []).filter(t => t.status !== 'completed').length;
  if (pendingLinked === 0 && goal.progress < 100) score += 15;
  else if (pendingLinked > 5) score -= 5;

  // Behavior linkage bonus (habits linked to goal = higher priority)
  const behaviorCount = (linkedBehaviors || []).length;
  if (behaviorCount > 0) score += Math.min(10, behaviorCount * 3);

  // Eisenhower quadrant
  if (goal.eisenhower_quadrant === 'urgent_important') score += 15;
  else if (goal.eisenhower_quadrant === 'important') score += 8;
  else if (goal.eisenhower_quadrant === 'urgent') score += 5;

  return Math.min(100, Math.max(0, score));
}

// ═════════════════════════════════════════════════════════════════════════════
// generateFromOnboarding(userId, role, focusAreas)
// Creates goals + linked behaviors from onboarding selections
// Returns: { goals: [...], behaviors: [...], first_action: {...} }
// ═════════════════════════════════════════════════════════════════════════════
async function generateFromOnboarding(userId, role, focusAreas) {
  const { Goal } = getModels();
  const behaviorEngine = getBehaviorEngine();
  if (!Goal) return { goals: [], behaviors: [], first_action: null };

  const results = { goals: [], behaviors: [], first_action: null };

  try {
    for (const area of focusAreas) {
      const template = AREA_GOAL_TEMPLATES[area];
      if (!template) continue;

      // Create goal
      const targetDate = moment().add(
        template.time_horizon === 'weekly' ? 7 :
        template.time_horizon === 'monthly' ? 30 :
        template.time_horizon === 'quarterly' ? 90 : 365,
        'days'
      ).format('YYYY-MM-DD');

      const goal = await Goal.create({
        user_id: userId,
        title: template.title,
        description: template.description,
        category: template.category,
        goal_type: template.goal_type,
        time_horizon: template.time_horizon,
        success_metric: template.success_metric,
        eisenhower_quadrant: template.eisenhower_quadrant,
        source: 'onboarding',
        auto_progress: true,
        target_date: targetDate,
        smart_criteria: {
          specific: template.title,
          measurable: `${template.success_metric.target_value} ${template.success_metric.unit}`,
          achievable: true,
          relevant: `مرتبط بمجال ${area}`,
          time_bound: targetDate,
        },
      });

      results.goals.push({
        id: goal.id,
        title: goal.title,
        category: goal.category,
        target_date: targetDate,
      });

      // Create linked behavior (habit)
      if (behaviorEngine) {
        const behavior = await behaviorEngine.createBehaviorFromOnboarding(userId, area, goal.id);
        if (behavior) {
          // Link behavior to goal
          const linkedBehaviors = [behavior.id];
          await goal.update({ linked_behaviors: linkedBehaviors });

          results.behaviors.push({
            id: behavior.id,
            name: behavior.name_ar || behavior.name,
            goal_id: goal.id,
          });

          // First behavior = first action suggestion
          if (!results.first_action) {
            const spec = behaviorEngine.AREA_BEHAVIOR_TEMPLATES[area]?.spec || {};
            const currentDiff = spec.difficulty?.current || 'standard';
            const diffInfo = spec.difficulty?.[currentDiff];

            results.first_action = {
              type: 'behavior',
              id: behavior.id,
              title: behavior.name_ar || behavior.name,
              goal_title: goal.title,
              estimated_minutes: diffInfo?.duration_minutes || behavior.duration_minutes || 20,
              difficulty: currentDiff,
              message: `ابدأ ببناء عادة "${behavior.name_ar || behavior.name}" لتحقيق هدف "${goal.title}"`,
            };
          }
        }
      }
    }

    logger.info(`[GOAL-ENGINE] Generated ${results.goals.length} goals + ${results.behaviors.length} behaviors for user ${userId} from onboarding`);
    return results;
  } catch (err) {
    logger.error('[GOAL-ENGINE] generateFromOnboarding error:', err.message);
    return results;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// autoUpdateProgress(goalId, userId)
// Recalculates goal progress from linked tasks + behaviors
// ═════════════════════════════════════════════════════════════════════════════
async function autoUpdateProgress(goalId, userId) {
  const { Goal, Task, Habit, HabitLog } = getModels();
  if (!Goal) return;

  try {
    const goal = await Goal.findByPk(goalId);
    if (!goal || goal.user_id !== userId) return;
    if (!goal.auto_progress) return; // manual progress only

    let totalPoints = 0;
    let earnedPoints = 0;

    // Task-based progress
    if (Task) {
      const tasks = await Task.findAll({ where: { goal_id: goalId, user_id: userId } });
      if (tasks.length > 0) {
        totalPoints += tasks.length;
        earnedPoints += tasks.filter(t => t.status === 'completed').length;
      }
    }

    // Behavior-based progress (linked habits over last 7 days)
    let linkedBehaviors;
    try {
      linkedBehaviors = typeof goal.linked_behaviors === 'string'
        ? JSON.parse(goal.linked_behaviors || '[]')
        : (goal.linked_behaviors || []);
    } catch { linkedBehaviors = []; }

    if (Habit && HabitLog && linkedBehaviors.length > 0) {
      const last7 = moment().subtract(7, 'days').format('YYYY-MM-DD');
      for (const habitId of linkedBehaviors) {
        // 7 potential days
        totalPoints += 7;
        const completions = await HabitLog.count({
          where: {
            habit_id: habitId,
            user_id: userId,
            completed: true,
            log_date: { [Op.gte]: last7 },
          },
        });
        earnedPoints += completions;
      }
    }

    const progress = totalPoints > 0 ? Math.min(100, Math.round((earnedPoints / totalPoints) * 100)) : goal.progress;
    const updates = { progress };
    if (progress >= 100 && goal.status === 'active') {
      updates.status = 'completed';
    }
    await goal.update(updates);

    logger.debug(`[GOAL-ENGINE] Auto-updated goal "${goal.title}" progress to ${progress}%`);
    return progress;
  } catch (err) {
    logger.warn('[GOAL-ENGINE] autoUpdateProgress error:', err.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// getGoalContext(userId, timezone)
// Enhanced: includes linked behaviors and SMART analysis
// ═════════════════════════════════════════════════════════════════════════════
async function getGoalContext(userId, timezone = 'Africa/Cairo') {
  const { Goal, Task, Habit } = getModels();
  if (!Goal || !Task) {
    return { activeGoals: [], goalTaskMap: {}, neglectedGoals: [], goalSuggestions: [], summary: { total: 0 } };
  }

  try {
    const goals = await Goal.findAll({
      where: { user_id: userId, status: 'active' },
      order: [['target_date', 'ASC'], ['created_at', 'ASC']],
    });

    if (!goals.length) {
      return { activeGoals: [], goalTaskMap: {}, neglectedGoals: [], goalSuggestions: [], summary: { total: 0 } };
    }

    const tasks = await Task.findAll({
      where: {
        user_id: userId,
        [Op.or]: [
          { status: { [Op.in]: ['pending', 'in_progress'] } },
          { status: 'completed', completed_at: { [Op.gte]: moment().tz(timezone).subtract(7, 'days').toDate() } },
        ],
      },
    });

    // Build goal-task map
    const goalTaskMap = {};
    const goalIds = new Set(goals.map(g => g.id));
    for (const goal of goals) goalTaskMap[goal.id] = [];
    for (const task of tasks) {
      if (task.goal_id && goalIds.has(task.goal_id)) {
        goalTaskMap[task.goal_id].push(task);
      } else {
        for (const goal of goals) {
          if (task.category && task.category === goal.category) {
            goalTaskMap[goal.id].push(task);
            break;
          }
        }
      }
    }

    // Build goal-behavior map
    const goalBehaviorMap = {};
    if (Habit) {
      const habits = await Habit.findAll({
        where: { user_id: userId, is_active: true },
        attributes: ['id', 'name', 'name_ar', 'goal_id', 'current_streak', 'current_difficulty', 'behavior_type'],
        raw: true,
      });
      for (const h of habits) {
        if (h.goal_id && goalIds.has(h.goal_id)) {
          if (!goalBehaviorMap[h.goal_id]) goalBehaviorMap[h.goal_id] = [];
          goalBehaviorMap[h.goal_id].push(h);
        }
      }
    }

    // Score and sort goals
    const scoredGoals = goals.map(g => {
      const linked = goalTaskMap[g.id] || [];
      const linkedBehaviors = goalBehaviorMap[g.id] || [];
      const priorityScore = scoreGoal(g, linked, linkedBehaviors);
      const completedLinked = linked.filter(t => t.status === 'completed').length;

      let gLinkedBehaviors;
      try {
        gLinkedBehaviors = typeof g.linked_behaviors === 'string'
          ? JSON.parse(g.linked_behaviors || '[]')
          : (g.linked_behaviors || []);
      } catch { gLinkedBehaviors = []; }

      return {
        id: g.id,
        title: g.title,
        category: g.category,
        goal_type: g.goal_type || 'outcome',
        time_horizon: g.time_horizon || 'monthly',
        progress: g.progress || 0,
        target_date: g.target_date,
        status: g.status,
        milestones: g.milestones || [],
        priorityScore,
        linkedTasks: linked.length,
        completedTasks: completedLinked,
        pendingTasks: linked.length - completedLinked,
        linkedBehaviors: linkedBehaviors.map(b => ({
          id: b.id, name: b.name_ar || b.name, streak: b.current_streak, difficulty: b.current_difficulty,
        })),
        eisenhower_quadrant: g.eisenhower_quadrant || 'important',
        source: g.source || 'user_created',
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);

    // Detect neglected goals
    const neglectedGoals = scoredGoals.filter(g => {
      if (g.progress >= 80) return false;
      const linked = goalTaskMap[g.id] || [];
      const recentActivity = linked.some(t =>
        t.completed_at && moment(t.completed_at).isAfter(moment().subtract(7, 'days'))
      );
      return !recentActivity && g.pendingTasks === 0;
    });

    // Generate suggestions
    const goalSuggestions = [];
    for (const goal of scoredGoals.slice(0, 5)) {
      const linked = goalTaskMap[goal.id] || [];
      const pendingTasks = linked.filter(t => t.status !== 'completed');

      if (pendingTasks.length === 0 && goal.progress < 100) {
        goalSuggestions.push({
          type: 'create_task_for_goal',
          goal_id: goal.id,
          goal_title: goal.title,
          message: `هدف "${goal.title}" يحتاج مهام جديدة — التقدم ${goal.progress}%`,
          priority: goal.priorityScore > 70 ? 'high' : 'medium',
        });
      } else if (pendingTasks.length > 0) {
        goalSuggestions.push({
          type: 'focus_on_goal_task',
          goal_id: goal.id,
          goal_title: goal.title,
          task_id: pendingTasks[0].id,
          task_title: pendingTasks[0].title,
          message: `ركّز على "${pendingTasks[0].title}" لتحقيق هدف "${goal.title}"`,
          priority: goal.priorityScore > 70 ? 'high' : 'medium',
        });
      }

      if (goal.target_date) {
        const daysLeft = moment(goal.target_date).diff(moment(), 'days');
        if (daysLeft >= 0 && daysLeft <= 3 && goal.progress < 80) {
          goalSuggestions.push({
            type: 'goal_deadline_warning',
            goal_id: goal.id,
            goal_title: goal.title,
            message: `⚠️ هدف "${goal.title}" ينتهي خلال ${daysLeft} يوم والتقدم ${goal.progress}% فقط!`,
            priority: 'high',
          });
        }
      }
    }

    const summary = {
      total: goals.length,
      onTrack: scoredGoals.filter(g => g.progress >= 50 || g.priorityScore < 60).length,
      atRisk: scoredGoals.filter(g => g.priorityScore >= 70 && g.progress < 50).length,
      neglected: neglectedGoals.length,
    };

    return { activeGoals: scoredGoals, goalTaskMap, goalBehaviorMap, neglectedGoals, goalSuggestions, summary };
  } catch (err) {
    logger.error('[GOAL-ENGINE] getGoalContext error:', err.message);
    return { activeGoals: [], goalTaskMap: {}, neglectedGoals: [], goalSuggestions: [], summary: { total: 0 } };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// getGoalForAction(actionType, actionId, userId)
// Returns the goal context for a specific action being executed
// ═════════════════════════════════════════════════════════════════════════════
async function getGoalForAction(actionType, actionId, userId) {
  const { Goal, Task, Habit } = getModels();
  if (!Goal) return null;

  try {
    let goalId = null;

    if (actionType === 'task' && Task) {
      const task = await Task.findByPk(actionId, { attributes: ['goal_id'], raw: true });
      goalId = task?.goal_id;
    } else if ((actionType === 'habit' || actionType === 'behavior') && Habit) {
      const habit = await Habit.findByPk(actionId, { attributes: ['goal_id'], raw: true });
      goalId = habit?.goal_id;
    }

    if (!goalId) return null;

    const goal = await Goal.findByPk(goalId, { raw: true });
    if (!goal || goal.user_id !== userId) return null;

    return {
      id: goal.id,
      title: goal.title,
      progress: goal.progress || 0,
      category: goal.category,
      goal_type: goal.goal_type || 'outcome',
      target_date: goal.target_date,
      eisenhower_quadrant: goal.eisenhower_quadrant,
    };
  } catch (err) {
    logger.debug('[GOAL-ENGINE] getGoalForAction error:', err.message);
    return null;
  }
}

// Legacy exports (backward compatible)
function updateGoalProgress(goalId, userId) {
  return autoUpdateProgress(goalId, userId);
}

function getGoalBoostForTask(task, goalContext) {
  if (!task.goal_id || !goalContext?.activeGoals?.length) return 0;
  const goal = goalContext.activeGoals.find(g => g.id === task.goal_id);
  if (!goal) return 0;
  return Math.round(goal.priorityScore * 0.2);
}

async function getGoalSummaryForAI(userId, timezone = 'Africa/Cairo') {
  const ctx = await getGoalContext(userId, timezone);
  if (!ctx.activeGoals.length) return 'لا توجد أهداف نشطة حالياً.';
  const lines = ctx.activeGoals.slice(0, 5).map(g => {
    const deadline = g.target_date ? ` (ينتهي ${g.target_date})` : '';
    return `• ${g.title}: ${g.progress}% مكتمل${deadline} — ${g.pendingTasks} مهمة متبقية`;
  });
  if (ctx.summary.atRisk > 0) lines.push(`⚠️ ${ctx.summary.atRisk} أهداف في خطر التأخر`);
  if (ctx.summary.neglected > 0) lines.push(`💤 ${ctx.summary.neglected} أهداف مهملة تحتاج اهتمام`);
  return lines.join('\n');
}

module.exports = {
  getGoalContext,
  updateGoalProgress,
  autoUpdateProgress,
  getGoalBoostForTask,
  getGoalSummaryForAI,
  getGoalForAction,
  generateFromOnboarding,
  scoreGoal,
  AREA_GOAL_TEMPLATES,
};
