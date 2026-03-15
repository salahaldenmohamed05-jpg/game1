/**
 * Insight Controller
 * ====================
 * يولد رؤى يومية وأسبوعية وتقارير سلوكية
 */

const { Op } = require('sequelize');
const { Insight } = require('../models/insight.model');
const Task = require('../models/task.model');
const { Habit, HabitLog } = require('../models/habit.model');
const MoodEntry = require('../models/mood.model');
const { aiService } = require('../ai/ai.service');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

/**
 * @route   GET /api/v1/insights/daily
 * @desc    Generate daily summary | الملخص اليومي
 */
exports.getDailySummary = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const today = moment().tz(timezone).format('YYYY-MM-DD');

    // Check if already generated today
    let insight = await Insight.findOne({
      where: { user_id: req.user.id, type: 'daily_summary',
        createdAt: { [Op.gte]: moment().tz(timezone).startOf('day').toDate() },
      },
    });

    if (!insight) {
      // Gather today's data
      const [tasks, habitLogs, moodEntry] = await Promise.all([
        Task.findAll({ where: { user_id: req.user.id,
          due_date: { [Op.between]: [`${today}T00:00:00`, `${today}T23:59:59`] },
        }}),
        HabitLog.findAll({ where: { user_id: req.user.id, log_date: today } }),
        MoodEntry.findOne({ where: { user_id: req.user.id, entry_date: today } }),
      ]);

      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const completedHabits = habitLogs.filter(l => l.completed).length;

      // Generate AI summary
      const aiSummary = await aiService.generateDailySummary({
        user: req.user,
        date: today,
        tasks: { total: tasks.length, completed: completedTasks, pending: tasks.length - completedTasks },
        habits: { total: habitLogs.length, completed: completedHabits },
        mood: moodEntry,
      });

      insight = await Insight.create({
        user_id: req.user.id,
        type: 'daily_summary',
        title: `ملخص يوم ${moment(today).format('dddd، D MMMM YYYY')}`,
        content: aiSummary.summary,
        data: {
          tasks: { total: tasks.length, completed: completedTasks },
          habits: { total: habitLogs.length, completed: completedHabits },
          mood: moodEntry?.mood_score || null,
          productivity_score: calculateProductivityScore(tasks, habitLogs, moodEntry),
        },
        recommendations: aiSummary.recommendations,
        period_start: today,
        period_end: today,
      });
    }

    res.json({ success: true, data: insight });
  } catch (error) {
    logger.error('Daily summary error:', error);
    res.status(500).json({ success: false, message: 'فشل في إنشاء الملخص اليومي' });
  }
};

/**
 * @route   GET /api/v1/insights/weekly
 * @desc    Generate weekly report | التقرير الأسبوعي
 */
exports.getWeeklyReport = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const weekStart = moment().tz(timezone).startOf('isoWeek').format('YYYY-MM-DD');
    const weekEnd = moment().tz(timezone).endOf('isoWeek').format('YYYY-MM-DD');

    // Check if already generated this week
    let report = await Insight.findOne({
      where: { user_id: req.user.id, type: 'weekly_report', period_start: weekStart },
    });

    if (!report) {
      // Gather week's data
      const [tasks, habitLogs, moodEntries] = await Promise.all([
        Task.findAll({ where: { user_id: req.user.id,
          due_date: { [Op.between]: [`${weekStart}T00:00:00`, `${weekEnd}T23:59:59`] },
        }}),
        HabitLog.findAll({ where: { user_id: req.user.id,
          log_date: { [Op.between]: [weekStart, weekEnd] },
        }}),
        MoodEntry.findAll({ where: { user_id: req.user.id,
          entry_date: { [Op.between]: [weekStart, weekEnd] },
        }}),
      ]);

      const weeklyData = buildWeeklyData(tasks, habitLogs, moodEntries, weekStart, weekEnd);
      const aiReport = await aiService.generateWeeklyReport({ user: req.user, ...weeklyData });

      report = await Insight.create({
        user_id: req.user.id,
        type: 'weekly_report',
        title: `تقرير الأسبوع: ${moment(weekStart).format('D MMM')} - ${moment(weekEnd).format('D MMM YYYY')}`,
        content: aiReport.report,
        data: weeklyData,
        recommendations: aiReport.recommendations,
        period_start: weekStart,
        period_end: weekEnd,
        priority: 'high',
      });
    }

    res.json({ success: true, data: report });
  } catch (error) {
    logger.error('Weekly report error:', error);
    res.status(500).json({ success: false, message: 'فشل في إنشاء التقرير الأسبوعي' });
  }
};

/**
 * @route   GET /api/v1/insights/behavior
 * @desc    Behavior analysis | تحليل السلوك والإنتاجية
 */
exports.getBehaviorAnalysis = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const thirtyDaysAgo = moment().tz(timezone).subtract(30, 'days').format('YYYY-MM-DD');

    const [tasks, habitLogs, moodEntries] = await Promise.all([
      Task.findAll({ where: { user_id: req.user.id,
        // Fix: use due_date for task range queries (createdAt is unreliable for behavior analysis)
        [Op.or]: [
          { due_date: { [Op.gte]: thirtyDaysAgo } },
          { createdAt: { [Op.gte]: thirtyDaysAgo } },
        ],
      }}),
      HabitLog.findAll({ where: { user_id: req.user.id,
        log_date: { [Op.gte]: thirtyDaysAgo },
      }}),
      MoodEntry.findAll({ where: { user_id: req.user.id,
        entry_date: { [Op.gte]: thirtyDaysAgo },
      }}),
    ]);

    const behaviorData = {
      task_completion_rate: calculateCompletionRate(tasks),
      peak_productivity_hours: findPeakHours(tasks),
      best_performing_days: getBestDays(tasks, habitLogs, moodEntries),
      habit_consistency: calculateHabitConsistency(habitLogs),
      mood_productivity_correlation: correlateMoodProductivity(tasks, moodEntries),
      procrastination_patterns: findProcrastination(tasks),
    };

    const aiAnalysis = await aiService.analyzeBehavior(behaviorData, req.user);
    behaviorData.ai_analysis = aiAnalysis;

    res.json({ success: true, data: behaviorData });
  } catch (error) {
    logger.error('Behavior analysis error:', error);
    res.status(500).json({ success: false, message: 'فشل في تحليل السلوك' });
  }
};

/**
 * @route   GET /api/v1/insights/productivity-tips
 * @desc    Personalized productivity tips
 */
exports.getProductivityTips = async (req, res) => {
  try {
    const tips = await aiService.getProductivityTips(req.user);
    res.json({ success: true, data: tips });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب نصائح الإنتاجية' });
  }
};

/**
 * @route   GET /api/v1/insights
 * @desc    Get all insights
 */
exports.getInsights = async (req, res) => {
  try {
    const { type, page = 1, limit = 10 } = req.query;
    const where = { user_id: req.user.id };
    if (type) where.type = type;

    const { count, rows } = await Insight.findAndCountAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({ success: true, data: { insights: rows, total: count } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب الرؤى' });
  }
};

// ==============================
// Helper functions
// ==============================

function calculateProductivityScore(tasks, habitLogs, moodEntry) {
  let score = 0;
  if (tasks.length > 0) {
    score += (tasks.filter(t => t.status === 'completed').length / tasks.length) * 40;
  }
  if (habitLogs.length > 0) {
    score += (habitLogs.filter(l => l.completed).length / habitLogs.length) * 40;
  }
  if (moodEntry) {
    score += (moodEntry.mood_score / 10) * 20;
  }
  return Math.round(score);
}

function buildWeeklyData(tasks, habitLogs, moodEntries, weekStart, weekEnd) {
  return {
    period: { start: weekStart, end: weekEnd },
    tasks: {
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      by_category: groupByField(tasks, 'category'),
      completion_rate: tasks.length > 0
        ? ((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100).toFixed(1)
        : 0,
    },
    habits: {
      total_logs: habitLogs.length,
      completed: habitLogs.filter(l => l.completed).length,
      consistency_rate: habitLogs.length > 0
        ? ((habitLogs.filter(l => l.completed).length / habitLogs.length) * 100).toFixed(1)
        : 0,
    },
    mood: {
      average: moodEntries.length > 0
        ? (moodEntries.reduce((s, e) => s + e.mood_score, 0) / moodEntries.length).toFixed(1)
        : null,
      entries: moodEntries.length,
      trend: moodEntries.map(e => ({ date: e.entry_date, score: e.mood_score })),
    },
  };
}

function calculateCompletionRate(tasks) {
  if (!tasks.length) return 0;
  return ((tasks.filter(t => t.status === 'completed').length / tasks.length) * 100).toFixed(1);
}

function findPeakHours(tasks) {
  const hours = {};
  tasks.filter(t => t.completed_at).forEach(t => {
    const hour = new Date(t.completed_at).getHours();
    hours[hour] = (hours[hour] || 0) + 1;
  });
  return Object.entries(hours).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([h]) => `${h}:00`);
}

function getBestDays(tasks, habitLogs, moodEntries) {
  const dayNames = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const dayScores = {};

  tasks.filter(t => t.completed_at).forEach(t => {
    const day = new Date(t.completed_at).getDay();
    dayScores[day] = (dayScores[day] || 0) + 1;
  });

  return Object.entries(dayScores).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d]) => dayNames[d]);
}

function calculateHabitConsistency(habitLogs) {
  if (!habitLogs.length) return 0;
  return ((habitLogs.filter(l => l.completed).length / habitLogs.length) * 100).toFixed(1);
}

function correlateMoodProductivity(tasks, moodEntries) {
  const moodMap = {};
  moodEntries.forEach(e => { moodMap[e.entry_date] = e.mood_score; });
  const correlation = [];
  tasks.filter(t => t.completed_at).forEach(t => {
    const date = moment(t.completed_at).format('YYYY-MM-DD');
    if (moodMap[date]) correlation.push({ mood: moodMap[date], task_completed: true });
  });
  return correlation;
}

function findProcrastination(tasks) {
  return tasks.filter(t =>
    t.due_date && t.completed_at &&
    new Date(t.completed_at) > new Date(t.due_date)
  ).length;
}

function groupByField(items, field) {
  const groups = {};
  items.forEach(item => {
    const key = item[field] || 'other';
    groups[key] = (groups[key] || 0) + 1;
  });
  return groups;
}
