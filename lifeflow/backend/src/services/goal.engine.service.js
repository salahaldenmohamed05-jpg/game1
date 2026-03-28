/**
 * Goal Engine Service — Phase 7
 * ===============================
 * Connects Goals → Planning → Execution → Behavior
 *
 * Responsibilities:
 *  1. Compute goal priority scores for daily planning
 *  2. Map tasks to goals, compute goal progress from task completion
 *  3. Generate goal-aware suggestions for the day planner
 *  4. Provide goal context to the execution engine and AI orchestrator
 *  5. Detect stale/neglected goals and trigger nudges
 *
 * DOES NOT replace dayplanner or execution engine — it enriches them.
 */

'use strict';

const { Op } = require('sequelize');
const moment = require('moment-timezone');
const logger = require('../utils/logger');

function getModels() {
  const m = {};
  try { m.Goal = require('../models/goal.model'); } catch (_) {}
  try { m.Task = require('../models/task.model'); } catch (_) {}
  try { m.Habit = require('../models/habit.model').Habit; } catch (_) {}
  return m;
}

// ── Goal priority scoring ──────────────────────────────────────────────────
// Higher score = more urgently needs daily attention
function scoreGoal(goal, linkedTasks) {
  let score = 50; // base

  // Deadline urgency (target_date)
  if (goal.target_date) {
    const daysLeft = moment(goal.target_date).diff(moment(), 'days');
    if (daysLeft < 0) score += 40;       // overdue
    else if (daysLeft <= 3) score += 30;  // critical
    else if (daysLeft <= 7) score += 20;  // soon
    else if (daysLeft <= 14) score += 10; // approaching
  }

  // Progress gap: how far behind?
  const progressGap = 100 - (goal.progress || 0);
  score += Math.round(progressGap * 0.2); // max +20

  // Category boost
  if (goal.category === 'health') score += 5;
  if (goal.category === 'learning') score += 3;

  // Linked task pressure
  const pendingLinked = linkedTasks.filter(t => t.status !== 'completed').length;
  if (pendingLinked === 0 && goal.progress < 100) score += 15; // no active tasks for this goal!
  else if (pendingLinked > 5) score -= 5; // well-covered

  return Math.min(100, Math.max(0, score));
}

/**
 * getGoalContext(userId, timezone)
 * Returns structured goal data for planning and execution engines.
 *
 * @returns {object} {
 *   activeGoals: [...],           // sorted by priority score desc
 *   goalTaskMap: { goalId: [...tasks] },
 *   neglectedGoals: [...],        // goals with no recent activity
 *   goalSuggestions: [...],       // actionable suggestions for today
 *   summary: { total, onTrack, atRisk, neglected }
 * }
 */
async function getGoalContext(userId, timezone = 'Africa/Cairo') {
  const { Goal, Task } = getModels();
  if (!Goal || !Task) {
    logger.debug('[GOAL-ENGINE] Models not available');
    return { activeGoals: [], goalTaskMap: {}, neglectedGoals: [], goalSuggestions: [], summary: { total: 0 } };
  }

  try {
    // Fetch active goals
    const goals = await Goal.findAll({
      where: { user_id: userId, status: 'active' },
      order: [['target_date', 'ASC'], ['created_at', 'ASC']],
    });

    if (!goals.length) {
      return { activeGoals: [], goalTaskMap: {}, neglectedGoals: [], goalSuggestions: [], summary: { total: 0 } };
    }

    // Fetch all pending + recent completed tasks for this user
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

    for (const goal of goals) {
      goalTaskMap[goal.id] = [];
    }

    for (const task of tasks) {
      if (task.goal_id && goalIds.has(task.goal_id)) {
        goalTaskMap[task.goal_id].push(task);
      } else {
        // Try to match by category or tags
        for (const goal of goals) {
          if (task.category && task.category === goal.category) {
            goalTaskMap[goal.id].push(task);
            break;
          }
        }
      }
    }

    // Score and sort goals
    const scoredGoals = goals.map(g => {
      const linked = goalTaskMap[g.id] || [];
      const priorityScore = scoreGoal(g, linked);
      const completedLinked = linked.filter(t => t.status === 'completed').length;
      const totalLinked = linked.length;

      return {
        id: g.id,
        title: g.title,
        category: g.category,
        progress: g.progress || 0,
        target_date: g.target_date,
        status: g.status,
        milestones: g.milestones || [],
        priorityScore,
        linkedTasks: totalLinked,
        completedTasks: completedLinked,
        pendingTasks: totalLinked - completedLinked,
      };
    }).sort((a, b) => b.priorityScore - a.priorityScore);

    // Detect neglected goals (no task activity in 7+ days, progress < 80%)
    const neglectedGoals = scoredGoals.filter(g => {
      if (g.progress >= 80) return false;
      const linked = goalTaskMap[g.id] || [];
      const recentActivity = linked.some(t =>
        t.completed_at && moment(t.completed_at).isAfter(moment().subtract(7, 'days'))
      );
      return !recentActivity && g.pendingTasks === 0;
    });

    // Generate daily suggestions based on goals
    const goalSuggestions = [];
    for (const goal of scoredGoals.slice(0, 5)) { // top 5 priority goals
      const linked = goalTaskMap[goal.id] || [];
      const pendingTasks = linked.filter(t => t.status !== 'completed');

      if (pendingTasks.length === 0 && goal.progress < 100) {
        goalSuggestions.push({
          type: 'create_task_for_goal',
          goal_id: goal.id,
          goal_title: goal.title,
          message: `هدف "${goal.title}" يحتاج مهام جديدة — التقدم الحالي ${goal.progress}%`,
          priority: goal.priorityScore > 70 ? 'high' : 'medium',
        });
      } else if (pendingTasks.length > 0) {
        const topTask = pendingTasks[0];
        goalSuggestions.push({
          type: 'focus_on_goal_task',
          goal_id: goal.id,
          goal_title: goal.title,
          task_id: topTask.id,
          task_title: topTask.title,
          message: `ركّز على "${topTask.title}" لتحقيق هدف "${goal.title}"`,
          priority: goal.priorityScore > 70 ? 'high' : 'medium',
        });
      }

      // Deadline warning
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

    // Summary
    const summary = {
      total: goals.length,
      onTrack: scoredGoals.filter(g => g.progress >= 50 || g.priorityScore < 60).length,
      atRisk: scoredGoals.filter(g => g.priorityScore >= 70 && g.progress < 50).length,
      neglected: neglectedGoals.length,
    };

    return { activeGoals: scoredGoals, goalTaskMap, neglectedGoals, goalSuggestions, summary };
  } catch (err) {
    logger.error('[GOAL-ENGINE] getGoalContext error:', err.message);
    return { activeGoals: [], goalTaskMap: {}, neglectedGoals: [], goalSuggestions: [], summary: { total: 0 } };
  }
}

/**
 * updateGoalProgress(goalId, userId)
 * Recalculates goal progress from linked task completion.
 */
async function updateGoalProgress(goalId, userId) {
  const { Goal, Task } = getModels();
  if (!Goal || !Task || !goalId) return;

  try {
    const tasks = await Task.findAll({ where: { goal_id: goalId, user_id: userId } });
    if (!tasks.length) return;

    const completed = tasks.filter(t => t.status === 'completed').length;
    const progress = Math.round((completed / tasks.length) * 100);

    const goal = await Goal.findByPk(goalId);
    if (goal && goal.user_id === userId) {
      const updates = { progress };
      if (progress >= 100 && goal.status === 'active') {
        updates.status = 'completed';
      }
      await goal.update(updates);
      logger.info(`[GOAL-ENGINE] Goal "${goal.title}" progress updated to ${progress}%`);
    }
  } catch (err) {
    logger.warn('[GOAL-ENGINE] updateGoalProgress error:', err.message);
  }
}

/**
 * getGoalBoostForTask(task, goalContext)
 * Returns a priority boost (0-20) for a task based on its goal alignment.
 * Used by dayplanner to rank goal-linked tasks higher.
 */
function getGoalBoostForTask(task, goalContext) {
  if (!task.goal_id || !goalContext?.activeGoals?.length) return 0;

  const goal = goalContext.activeGoals.find(g => g.id === task.goal_id);
  if (!goal) return 0;

  // Scale boost from goal priority score: 100 → +20, 50 → +10, 0 → 0
  return Math.round(goal.priorityScore * 0.2);
}

/**
 * getGoalSummaryForAI(userId, timezone)
 * Returns a concise text summary for inclusion in AI context prompts.
 */
async function getGoalSummaryForAI(userId, timezone = 'Africa/Cairo') {
  const ctx = await getGoalContext(userId, timezone);
  if (!ctx.activeGoals.length) return 'لا توجد أهداف نشطة حالياً.';

  const lines = ctx.activeGoals.slice(0, 5).map(g => {
    const deadline = g.target_date ? ` (ينتهي ${g.target_date})` : '';
    return `• ${g.title}: ${g.progress}% مكتمل${deadline} — ${g.pendingTasks} مهمة متبقية`;
  });

  if (ctx.summary.atRisk > 0) {
    lines.push(`⚠️ ${ctx.summary.atRisk} أهداف في خطر التأخر`);
  }
  if (ctx.summary.neglected > 0) {
    lines.push(`💤 ${ctx.summary.neglected} أهداف مهملة تحتاج اهتمام`);
  }

  return lines.join('\n');
}

module.exports = {
  getGoalContext,
  updateGoalProgress,
  getGoalBoostForTask,
  getGoalSummaryForAI,
  scoreGoal,
};
