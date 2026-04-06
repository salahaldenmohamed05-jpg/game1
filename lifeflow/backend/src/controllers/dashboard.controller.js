/**
 * Dashboard Controller — Phase 4.5: System Hardening
 * =====================================================
 * HARDENING CHANGES:
 *   - Uses analytics.service.js as single source of truth for ALL counts
 *   - Fallback calculates from ALL tasks (not just today's subset)
 *   - Consistent task totals: total >= completed + pending always
 *   - Greeting uses first_name with safe fallback
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
 * @desc    Get main dashboard data
 */
exports.getDashboard = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const now = moment().tz(timezone);
    const today = now.format('YYYY-MM-DD');
    const weekStart = now.clone().startOf('isoWeek').format('YYYY-MM-DD');

    // HARDENED: Fetch ALL tasks for accurate counts, plus today-specific data
    const [allTasks, habits, habitLogs, todayMood, recentInsights,
           unreadNotifications, activeGoals, weekTasks] = await Promise.all([
      // ALL tasks — not just today's subset
      Task.findAll({
        where: { user_id: req.user.id },
        order: [['ai_priority_score', 'DESC'], ['due_date', 'ASC']],
      }),
      // Active habits
      Habit.findAll({ where: { user_id: req.user.id, is_active: true } }),
      // Today's habit logs
      HabitLog.findAll({ where: { user_id: req.user.id, log_date: today } }),
      // Today's mood
      MoodEntry.findOne({ where: { user_id: req.user.id, entry_date: today } }),
      // Recent insights
      Insight.findAll({
        where: { user_id: req.user.id },
        order: [['createdAt', 'DESC']],
        limit: 3,
      }),
      // Unread notifications
      Notification.count({ where: { user_id: req.user.id, is_read: false } }),
      // Active goals
      Goal.findAll({ where: { user_id: req.user.id, status: 'active' }, limit: 5 }),
      // This week's tasks
      Task.findAll({
        where: {
          user_id: req.user.id,
          due_date: { [Op.gte]: `${weekStart}T00:00:00` },
        },
      }),
    ]);

    // HARDENED: Consistent task categorization
    const completedTasks = allTasks.filter(t => t.status === 'completed');
    const pendingTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
    const overdueTasks = allTasks.filter(t => {
      if (t.status === 'completed') return false;
      if (!t.due_date) return false;
      const dueStr = typeof t.due_date === 'string' ? t.due_date.split('T')[0] : moment(t.due_date).tz(timezone).format('YYYY-MM-DD');
      return dueStr < today;
    });
    const todayTasks = allTasks.filter(t => {
      if (t.status === 'in_progress') return true;
      const dueStr = t.due_date ? (typeof t.due_date === 'string' ? t.due_date.split('T')[0] : moment(t.due_date).tz(timezone).format('YYYY-MM-DD')) : null;
      return dueStr === today;
    });
    const completedToday = allTasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      return moment(t.completed_at).tz(timezone).format('YYYY-MM-DD') === today;
    });

    // Calculate summary stats — Phase O: use analytics.service.js for accurate data
    let analyticsSummary = null;
    try {
      const analytics = require('../services/analytics.service');
      analyticsSummary = await analytics.getAnalyticsSummary(req.user.id, timezone);
    } catch (_e) { /* fallback below */ }

    const habitLogMap = {};
    habitLogs.forEach(l => { habitLogMap[l.habit_id] = l; });

    const completedHabits = habitLogs.filter(l => l.completed).length;

    // Productivity score — use analytics service if available
    const productivityScore = analyticsSummary?.productivity_score ?? calculateScore(allTasks, habitLogs, todayMood);

    // HARDENED: Greeting uses first_name with safe fallback
    const firstName = req.user.first_name || req.user.name?.split(' ')[0] || 'صديقي';
    const greeting = getGreeting(now.hour(), firstName);

    // Smart suggestion from AI (non-blocking)
    let smartSuggestion = null;
    try {
      smartSuggestion = await aiService.getSmartSuggestion({
        user: req.user,
        tasks: [...todayTasks, ...overdueTasks].slice(0, 15),
        habits: habits,
        habitLogs: habitLogs,
        mood: todayMood,
        currentHour: now.hour(),
      });
    } catch (aiErr) {
      logger.warn('Smart suggestion failed:', aiErr.message);
    }

    // HARDENED: Build consistent summary — total always >= completed + pending
    const taskSummary = analyticsSummary?.tasks ?? {
      total: allTasks.length,
      completed: completedTasks.length,
      completed_today: completedToday.length,
      pending: pendingTasks.length,
      overdue: overdueTasks.length,
    };

    const habitSummary = analyticsSummary?.habits ?? {
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
          mood: analyticsSummary?.mood ?? (todayMood ? {
            score: todayMood.mood_score,
            emotions: todayMood.emotions,
            has_checked_in: true,
          } : {
            has_checked_in: false,
            prompt: 'كيف كان مزاجك اليوم؟',
          }),
          unread_notifications: unreadNotifications,
        },
        today_tasks: [...overdueTasks, ...todayTasks].slice(0, 20).map(t => ({
          ...(t.toJSON ? t.toJSON() : t),
          completed_today: t.status === 'completed',
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
        week_progress: analyticsSummary?.week_progress ?? {
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

function calculateScore(tasks, habitLogs, mood) {
  let score = 0;
  const maxScore = 100;

  if (tasks.length > 0) {
    score += (tasks.filter(t => t.status === 'completed').length / tasks.length) * 40;
  } else {
    score += 20;
  }

  if (habitLogs.length > 0) {
    score += (habitLogs.filter(l => l.completed).length / habitLogs.length) * 40;
  } else {
    score += 20;
  }

  if (mood) {
    score += (mood.mood_score / 10) * 20;
  } else {
    score += 10;
  }

  return Math.round(Math.min(score, maxScore));
}

function getGreeting(hour, name) {
  const firstName = name || 'صديقي';
  if (hour >= 5 && hour < 12) return `صباح الخير، ${firstName}! ☀️`;
  if (hour >= 12 && hour < 17) return `مساء النور، ${firstName}! 🌤️`;
  if (hour >= 17 && hour < 21) return `أهلاً بك، ${firstName}! 🌇`;
  return `مساء الخير، ${firstName}! 🌙`;
}
