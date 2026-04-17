/**
 * Dashboard Controller — Phase 14: TODAY-Only Progress
 * =====================================================
 * CRITICAL FIX: Dashboard progress/summary now uses ONLY today's data.
 *   - Tasks: counts today's pending + today's completed (not all-time)
 *   - Habits: today's completed vs active habits
 *   - Mood: today's check-in status
 *   - Productivity score: based on today's progress only
 */

const { Op } = require('sequelize');
const Task = require('../models/task.model');
const { Habit, HabitLog } = require('../models/habit.model');
const MoodEntry = require('../models/mood.model');
const { Insight, Notification } = require('../models/insight.model');
const Goal = require('../models/goal.model');
const { aiService } = require('../ai/ai.service');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

/**
 * @route   GET /api/v1/dashboard
 * @desc    Get main dashboard data — TODAY-focused
 */
exports.getDashboard = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const now = moment().tz(timezone);
    const today = now.format('YYYY-MM-DD');
    const todayStart = `${today}T00:00:00`;
    const todayEnd = `${today}T23:59:59`;
    const weekStart = now.clone().startOf('isoWeek').format('YYYY-MM-DD');

    const [allTasks, habits, habitLogs, todayMood, recentInsights,
           unreadNotifications, activeGoals, weekTasks] = await Promise.all([
      Task.findAll({
        where: { user_id: req.user.id },
        order: [['ai_priority_score', 'DESC'], ['due_date', 'ASC']],
      }),
      Habit.findAll({ where: { user_id: req.user.id, is_active: true } }),
      HabitLog.findAll({ where: { user_id: req.user.id, log_date: today } }),
      MoodEntry.findOne({ where: { user_id: req.user.id, entry_date: today } }),
      Insight.findAll({
        where: { user_id: req.user.id },
        order: [['createdAt', 'DESC']],
        limit: 3,
      }),
      Notification.count({ where: { user_id: req.user.id, is_read: false } }),
      Goal.findAll({ where: { user_id: req.user.id, status: 'active' }, limit: 5 }),
      Task.findAll({
        where: {
          user_id: req.user.id,
          due_date: { [Op.gte]: `${weekStart}T00:00:00` },
        },
      }),
    ]);

    // ── TODAY-only task categorization ─────────────────────────────────────
    // Overdue: pending tasks with due_date < today
    const overdueTasks = allTasks.filter(t => {
      if (t.status === 'completed') return false;
      if (!t.due_date) return false;
      const dueStr = typeof t.due_date === 'string' ? t.due_date.split('T')[0].split(' ')[0] : moment(t.due_date).tz(timezone).format('YYYY-MM-DD');
      return dueStr < today;
    });

    // Today's tasks: tasks due today ONLY (P1-8 fix: removed in_progress-always-today logic)
    // in_progress without a due_date belong in the backlog, not today
    const todayTasks = allTasks.filter(t => {
      const dueStr = t.due_date ? (typeof t.due_date === 'string' ? t.due_date.split('T')[0].split(' ')[0] : moment(t.due_date).tz(timezone).format('YYYY-MM-DD')) : null;
      return dueStr === today;
    });

    // Completed today: tasks completed today (regardless of due_date)
    const completedToday = allTasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      return moment(t.completed_at).tz(timezone).format('YYYY-MM-DD') === today;
    });

    // Today's pending tasks (due today, not completed)
    const todayPending = todayTasks.filter(t => t.status !== 'completed');

    // ── TODAY-only progress calculation ──────────────────────────────────
    // Total for today = today's tasks due + overdue (what the user should do today)
    const todayTotal = todayPending.length + completedToday.length + overdueTasks.length;
    const todayCompleted = completedToday.length;

    // Habits: today's completed vs active habits due today
    const habitLogMap = {};
    habitLogs.forEach(l => { habitLogMap[l.habit_id] = l; });
    const completedHabits = habitLogs.filter(l => l.completed).length;

    // ── TODAY-only productivity score ──────────────────────────────────
    const productivityScore = calculateTodayScore(todayTotal, todayCompleted, habits.length, completedHabits, todayMood);

    const firstName = req.user.first_name || req.user.name?.split(' ')[0] || 'صديقي';
    const greeting = getGreeting(now.hour(), firstName);

    // Smart suggestion from AI (non-blocking)
    let smartSuggestion = null;
    try {
      smartSuggestion = await aiService.getSmartSuggestion({
        user: req.user,
        tasks: [...overdueTasks, ...todayPending].slice(0, 15),
        habits: habits,
        habitLogs: habitLogs,
        mood: todayMood,
        currentHour: now.hour(),
      });
    } catch (aiErr) {
      logger.warn('Smart suggestion failed:', aiErr.message);
    }

    // ── HONEST summary — shows REAL counts across ALL tasks ────────────
    // P0-2 FIX: Dashboard was only showing today's tasks (total=2 while DB had 27).
    // Now surfaces allTasks totals so users see the complete picture.
    const allPendingTasks = allTasks.filter(t => t.status !== 'completed');
    const taskSummary = {
      // TODAY context (for daily progress widget)
      total_today: todayTotal,
      completed_today: todayCompleted,
      pending_today: todayPending.length,
      // ALL TASKS (honest overall picture)
      total: allTasks.length,
      pending: allPendingTasks.length,
      completed: allTasks.filter(t => t.status === 'completed').length,
      overdue: overdueTasks.length,
      // Backlog (no due_date) — never hidden again
      no_due_date: allPendingTasks.filter(t => !t.due_date).length,
    };

    const habitSummary = {
      total: habits.length,
      completed: completedHabits,
      pending: habits.length - completedHabits,
      percentage: habits.length > 0
        ? Math.round((completedHabits / habits.length) * 100)
        : 0,
    };

    res.json({
      success: true,
      data: {
        greeting,
        date: {
          today,
          day_name: now.locale('ar').format('dddd'),
          formatted: now.locale('ar').format('D MMMM YYYY'),
          time: now.format('HH:mm'),
        },
        summary: {
          productivity_score: productivityScore,
          tasks: taskSummary,
          habits: habitSummary,
          mood: todayMood ? {
            score: todayMood.mood_score,
            emotions: todayMood.emotions,
            has_checked_in: true,
          } : {
            has_checked_in: false,
            prompt: 'كيف كان مزاجك اليوم؟',
          },
          unread_notifications: unreadNotifications,
        },
        today_tasks: [...overdueTasks, ...todayTasks].slice(0, 20).map(t => ({
          ...(t.toJSON ? t.toJSON() : t),
          is_overdue: overdueTasks.includes(t),
        })),
        habits: habits.map(h => ({
          ...(h.toJSON ? h.toJSON() : h),
          completed_today: habitLogMap[h.id]?.completed || false,
          log: habitLogMap[h.id] || null,
        })),
        recent_insights: recentInsights,
        active_goals: activeGoals.map(g => ({
          ...(g.toJSON ? g.toJSON() : g),
          linkedTasks: allTasks.filter(t => t.goal_id === g.id).length,
          completedTasks: allTasks.filter(t => t.goal_id === g.id && t.status === 'completed').length,
        })),
        week_progress: {
          total: weekTasks.length,
          completed: weekTasks.filter(t => t.status === 'completed').length,
        },
        smart_suggestion: smartSuggestion,
      },
    });
  } catch (error) {
    logger.error('Dashboard error:', error);
    res.status(500).json({ success: false, message: 'فشل في جلب بيانات لوحة التحكم' });
  }
};

/**
 * TODAY-only productivity score
 * Weight: tasks 40%, habits 40%, mood 20%
 */
function calculateTodayScore(totalTasks, completedTasks, totalHabits, completedHabits, mood) {
  let score = 0;

  // Tasks: 40% weight
  if (totalTasks > 0) {
    score += (completedTasks / totalTasks) * 40;
  } else {
    score += 20; // no tasks today = neutral
  }

  // Habits: 40% weight
  if (totalHabits > 0) {
    score += (completedHabits / totalHabits) * 40;
  } else {
    score += 20;
  }

  // Mood: 20% weight
  if (mood) {
    score += (mood.mood_score / 10) * 20;
  } else {
    score += 10; // no mood check-in = neutral
  }

  return Math.round(Math.min(score, 100));
}

function getGreeting(hour, name) {
  const firstName = name || 'صديقي';
  if (hour >= 5 && hour < 12) return `صباح الخير، ${firstName}! ☀️`;
  if (hour >= 12 && hour < 17) return `مساء النور، ${firstName}! 🌤️`;
  if (hour >= 17 && hour < 21) return `أهلاً بك، ${firstName}! 🌇`;
  return `مساء الخير، ${firstName}! 🌙`;
}

/**
 * @route   GET /api/v1/dashboard/quick-stats
 * @desc    Quick lightweight stats — TODAY only
 */
exports.getQuickStats = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const now = moment().tz(timezone);
    const today = now.format('YYYY-MM-DD');

    const [tasks, habits, habitLogs, todayMood] = await Promise.all([
      Task.findAll({ where: { user_id: req.user.id } }),
      Habit.findAll({ where: { user_id: req.user.id, is_active: true } }),
      HabitLog.findAll({ where: { user_id: req.user.id, log_date: today } }),
      MoodEntry.findOne({ where: { user_id: req.user.id, entry_date: today } }),
    ]);

    // TODAY-only (P1-8 fix: no longer treat all in_progress as today)
    const todayTasks = tasks.filter(t => {
      const dueStr = t.due_date ? (typeof t.due_date === 'string' ? t.due_date.split('T')[0].split(' ')[0] : moment(t.due_date).tz(timezone).format('YYYY-MM-DD')) : null;
      return dueStr === today;
    });
    const overdueTasks = tasks.filter(t => {
      if (t.status === 'completed' || !t.due_date) return false;
      const dueStr = typeof t.due_date === 'string' ? t.due_date.split('T')[0].split(' ')[0] : moment(t.due_date).tz(timezone).format('YYYY-MM-DD');
      return dueStr < today;
    });
    const completedToday = tasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      return moment(t.completed_at).tz(timezone).format('YYYY-MM-DD') === today;
    });

    const completedHabits = habitLogs.filter(l => l.completed).length;

    res.json({
      success: true,
      data: {
        tasks: {
          total: todayTasks.length + overdueTasks.length,
          completed: completedToday.length,
          pending: todayTasks.filter(t => t.status !== 'completed').length,
          overdue: overdueTasks.length,
        },
        habits: {
          total: habits.length,
          completed: completedHabits,
          percentage: habits.length > 0 ? Math.round((completedHabits / habits.length) * 100) : 0,
        },
        mood: {
          has_checked_in: !!todayMood,
          score: todayMood?.mood_score || null,
        },
      },
    });
  } catch (error) {
    logger.error('Quick stats error:', error);
    res.status(500).json({ success: false, message: 'فشل في جلب الإحصائيات' });
  }
};
