/**
 * Habit Controller
 * =================
 * يتحكم في إدارة العادات اليومية وتتبع الإنجاز
 */

const { Op } = require('sequelize');
const { Habit, HabitLog } = require('../models/habit.model');
const { aiService } = require('../ai/ai.service');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

/**
 * @route   GET /api/v1/habits
 * @desc    Get all habits for user
 */
exports.getHabits = async (req, res) => {
  try {
    const { active_only = true } = req.query;
    const where = { user_id: req.user.id };
    if (active_only === 'true') where.is_active = true;

    const habits = await Habit.findAll({
      where,
      order: [['createdAt', 'ASC']],
    });

    // Add today's completion status for each habit
    const timezone = req.user.timezone || 'Africa/Cairo';
    const today = moment().tz(timezone).format('YYYY-MM-DD');

    const habitIds = habits.map(h => h.id);
    const todayLogs = await HabitLog.findAll({
      where: { habit_id: { [Op.in]: habitIds }, log_date: today },
    });

    const logMap = {};
    todayLogs.forEach(log => { logMap[log.habit_id] = log; });

    const habitsWithStatus = habits.map(habit => ({
      ...habit.toJSON(),
      today_log: logMap[habit.id] || null,
      completed_today: logMap[habit.id]?.completed || false,
    }));

    res.json({ success: true, data: habitsWithStatus });
  } catch (error) {
    logger.error('Get habits error:', error);
    res.status(500).json({ success: false, message: 'فشل في جلب العادات' });
  }
};

/**
 * @route   POST /api/v1/habits
 * @desc    Create new habit | إضافة عادة جديدة
 */
exports.createHabit = async (req, res) => {
  try {
    const habit = await Habit.create({ ...req.body, user_id: req.user.id });

    res.status(201).json({
      success: true,
      message: `تم إضافة عادة "${habit.name}" بنجاح! حافظ عليها كل يوم 💪`,
      data: habit,
    });
  } catch (error) {
    logger.error('Create habit error:', error);
    res.status(500).json({ success: false, message: 'فشل في إنشاء العادة' });
  }
};

/**
 * @route   POST /api/v1/habits/:id/check-in
 * @desc    Mark habit as done for today | تسجيل إتمام العادة
 */
exports.checkIn = async (req, res) => {
  try {
    const { value, mood_after, notes } = req.body;
    const timezone = req.user.timezone || 'Africa/Cairo';
    const today = moment().tz(timezone).format('YYYY-MM-DD');

    const habit = await Habit.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!habit) return res.status(404).json({ success: false, message: 'العادة غير موجودة' });

    // Check if already logged today
    const [log, created] = await HabitLog.findOrCreate({
      where: { habit_id: habit.id, log_date: today },
      defaults: {
        user_id: req.user.id,
        habit_id: habit.id,
        log_date: today,
        completed: true,
        value: value || habit.target_value,
        completed_at: new Date(),
        mood_after,
        notes,
      },
    });

    if (!created) {
      await log.update({
        completed: true,
        value: value || habit.target_value,
        completed_at: new Date(),
        mood_after,
        notes,
      });
    }

    // Update streak
    await updateHabitStreak(habit);

    const encouragement = getEncouragementMessage(habit.current_streak + 1);

    res.json({
      success: true,
      message: encouragement,
      data: { log, habit },
    });
  } catch (error) {
    logger.error('Habit check-in error:', error);
    res.status(500).json({ success: false, message: 'فشل في تسجيل العادة' });
  }
};

/**
 * @route   GET /api/v1/habits/:id/stats
 * @desc    Get habit statistics | إحصائيات العادة
 */
exports.getHabitStats = async (req, res) => {
  try {
    const habit = await Habit.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [{ model: HabitLog, as: 'logs', limit: 90, order: [['log_date', 'DESC']] }],
    });

    if (!habit) return res.status(404).json({ success: false, message: 'العادة غير موجودة' });

    const logs = habit.logs || [];
    const completedDays = logs.filter(l => l.completed).length;
    const totalDays = logs.length;

    const stats = {
      current_streak: habit.current_streak,
      longest_streak: habit.longest_streak,
      total_completions: habit.total_completions,
      completion_rate: totalDays > 0 ? ((completedDays / totalDays) * 100).toFixed(1) : 0,
      last_30_days: getLast30DaysData(logs),
      weekly_pattern: getWeeklyPattern(logs),
      average_mood: getAverageMood(logs),
    };

    // AI insights
    try {
      stats.ai_insights = await aiService.analyzeHabit(habit, stats, req.user);
    } catch (e) {
      logger.warn('AI habit analysis failed');
    }

    res.json({ success: true, data: stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب إحصائيات العادة' });
  }
};

/**
 * @route   GET /api/v1/habits/today-summary
 * @desc    Today's habits summary | ملخص عادات اليوم
 */
exports.getTodaySummary = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const today = moment().tz(timezone).format('YYYY-MM-DD');

    const habits = await Habit.findAll({ where: { user_id: req.user.id, is_active: true } });
    const logs = await HabitLog.findAll({
      where: {
        user_id: req.user.id,
        log_date: today,
        habit_id: { [Op.in]: habits.map(h => h.id) },
      },
    });

    const logMap = {};
    logs.forEach(l => { logMap[l.habit_id] = l; });

    const summary = {
      total: habits.length,
      completed: logs.filter(l => l.completed).length,
      pending: habits.length - logs.filter(l => l.completed).length,
      completion_percentage: habits.length > 0
        ? Math.round((logs.filter(l => l.completed).length / habits.length) * 100)
        : 0,
      habits: habits.map(h => ({
        ...h.toJSON(),
        completed_today: logMap[h.id]?.completed || false,
        log: logMap[h.id] || null,
      })),
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب ملخص اليوم' });
  }
};

// =============================================
// Helper functions
// =============================================

async function updateHabitStreak(habit) {
  try {
    const timezone = 'Africa/Cairo';
    const yesterday = moment().tz(timezone).subtract(1, 'day').format('YYYY-MM-DD');

    const yesterdayLog = await HabitLog.findOne({
      where: { habit_id: habit.id, log_date: yesterday, completed: true },
    });

    const newStreak = yesterdayLog ? habit.current_streak + 1 : 1;
    const longestStreak = Math.max(newStreak, habit.longest_streak);

    await habit.update({
      current_streak: newStreak,
      longest_streak: longestStreak,
      total_completions: habit.total_completions + 1,
    });
  } catch (err) {
    logger.error('Update streak error:', err);
  }
}

function getEncouragementMessage(streak) {
  if (streak === 1) return 'أحسنت! يوم أول رائع 🌟';
  if (streak === 3) return `تسلسل 3 أيام! استمر 🔥`;
  if (streak === 7) return `أسبوع كامل! أنت بطل 🏆`;
  if (streak === 14) return `أسبوعان متتاليان! عادة رائعة ✨`;
  if (streak === 30) return `شهر كامل! هذا إنجاز حقيقي 🎊`;
  if (streak >= 100) return `${streak} يوم! أنت قدوة للجميع 💎`;
  return `اليوم ${streak} - تسلسل رائع! استمر 💪`;
}

function getLast30DaysData(logs) {
  const data = [];
  for (let i = 29; i >= 0; i--) {
    const date = moment().subtract(i, 'days').format('YYYY-MM-DD');
    const log = logs.find(l => l.log_date === date);
    data.push({ date, completed: log?.completed || false, value: log?.value || 0 });
  }
  return data;
}

function getWeeklyPattern(logs) {
  const days = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
  const counts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };

  logs.forEach(log => {
    const day = moment(log.log_date).day();
    counts[day]++;
    if (log.completed) days[day]++;
  });

  const names = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  return Object.keys(days).map(d => ({
    day: names[d],
    completions: days[d],
    rate: counts[d] > 0 ? ((days[d] / counts[d]) * 100).toFixed(0) : 0,
  }));
}

function getAverageMood(logs) {
  const withMood = logs.filter(l => l.mood_after);
  if (!withMood.length) return null;
  return (withMood.reduce((sum, l) => sum + l.mood_after, 0) / withMood.length).toFixed(1);
}
