/**
 * Dashboard Controller
 * =====================
 * لوحة التحكم الرئيسية - ملخص شامل لليوم
 */

const { Op } = require('sequelize');
const Task = require('../models/task.model');
const { Habit, HabitLog } = require('../models/habit.model');
const MoodEntry = require('../models/mood.model');
const { Insight, Notification, Goal } = require('../models/insight.model');
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

    // Fetch all data in parallel
    const [todayTasks, habits, habitLogs, todayMood, recentInsights,
           unreadNotifications, activeGoals, weekTasks] = await Promise.all([
      // Today's tasks
      Task.findAll({
        where: {
          user_id: req.user.id,
          [Op.or]: [
            { due_date: { [Op.between]: [`${today}T00:00:00`, `${today}T23:59:59`] } },
            { status: 'in_progress' },
          ],
        },
        order: [['ai_priority_score', 'DESC'], ['due_date', 'ASC']],
        limit: 10,
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
        order: [['created_at', 'DESC']],
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

    // Calculate summary stats
    const habitLogMap = {};
    habitLogs.forEach(l => { habitLogMap[l.habit_id] = l; });

    const completedHabits = habitLogs.filter(l => l.completed).length;
    const completedTasks = todayTasks.filter(t => t.status === 'completed').length;
    const overdueTasks = todayTasks.filter(t =>
      t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date()
    ).length;

    // Productivity score
    const productivityScore = calculateScore(todayTasks, habitLogs, todayMood);

    // Greeting based on time
    const greeting = getGreeting(now.hour(), req.user.name);

    // Smart suggestion from AI
    let smartSuggestion = null;
    try {
      smartSuggestion = await aiService.getSmartSuggestion({
        user: req.user,
        tasks: todayTasks,
        habits: habits,
        habitLogs: habitLogs,
        mood: todayMood,
        currentHour: now.hour(),
      });
    } catch (aiErr) {
      logger.warn('Smart suggestion failed:', aiErr.message);
    }

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
          tasks: {
            total: todayTasks.length,
            completed: completedTasks,
            pending: todayTasks.length - completedTasks,
            overdue: overdueTasks,
          },
          habits: {
            total: habits.length,
            completed: completedHabits,
            pending: habits.length - completedHabits,
            percentage: habits.length > 0
              ? Math.round((completedHabits / habits.length) * 100)
              : 0,
          },
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
        today_tasks: todayTasks.map(t => ({
          ...t.toJSON(),
          completed_today: t.status === 'completed',
        })),
        habits: habits.map(h => ({
          ...h.toJSON(),
          completed_today: habitLogMap[h.id]?.completed || false,
          log: habitLogMap[h.id] || null,
        })),
        recent_insights: recentInsights,
        active_goals: activeGoals,
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
  const firstName = name?.split(' ')[0] || 'عزيزي';
  if (hour >= 5 && hour < 12) return `صباح الخير، ${firstName}! ☀️`;
  if (hour >= 12 && hour < 17) return `مساء النور، ${firstName}! 🌤️`;
  if (hour >= 17 && hour < 21) return `أهلاً بك، ${firstName}! 🌇`;
  return `مساء الخير، ${firstName}! 🌙`;
}
