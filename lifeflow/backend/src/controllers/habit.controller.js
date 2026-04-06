/**
 * Habit Controller
 * =================
 * يتحكم في إدارة العادات اليومية وتتبع الإنجاز
 * يدعم العادات البسيطة (تم/لم يتم) والعادات القيمية (شرب ماء، صلوات)
 */

const { Op } = require('sequelize');
const { Habit, HabitLog } = require('../models/habit.model');
const { aiService } = require('../ai/ai.service');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

// ── Input sanitization ─────────────────────────────────────────────────────
function sanitizeText(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<[^>]*>/g, '')           // Strip HTML tags
    .replace(/[<>"'`;]/g, '')          // Remove dangerous chars
    .trim()
    .slice(0, 500);
}

// Step 1: Wire behavior events into habit lifecycle
function getBehaviorService() {
  try { return require('../services/behavior.model.service'); } catch (_) { return null; }
}
// Phase 12: EventBus for brain recomputation
function getEventBus() {
  try { return require('../core/eventBus'); } catch (_) { return null; }
}
// Step 2: Wire UserModel events into habit lifecycle (Phase P)
function getUserModelService() {
  try { return require('../services/user.model.service'); } catch (_) { return null; }
}

/* ─── Frequency helpers ────────────────────────────────────────── */

/**
 * Check if a habit is scheduled for a specific date based on its frequency_type.
 * @param {object} habit
 * @param {string} dateStr  YYYY-MM-DD
 * @returns {boolean}
 */
function isScheduledForDate(habit, dateStr) {
  const m = moment(dateStr);
  const dayOfWeek  = m.day();   // 0=Sun … 6=Sat
  const dayOfMonth = m.date();  // 1-31
  const freqType = habit.frequency_type || habit.frequency || 'daily';

  switch (freqType) {
    case 'daily': return true;

    case 'weekly': {
      // custom_days is a JSON array of week-day numbers, e.g. [1,3,5]
      let days;
      try { days = JSON.parse(habit.custom_days || '[]'); } catch { days = []; }
      return days.length ? days.includes(dayOfWeek) : true;
    }

    case 'custom': {
      let days;
      try { days = JSON.parse(habit.custom_days || '[]'); } catch { days = []; }
      return days.includes(dayOfWeek);
    }

    case 'monthly': {
      let mdays;
      try { mdays = JSON.parse(habit.monthly_days || '[]'); } catch { mdays = []; }
      return mdays.includes(dayOfMonth);
    }

    case 'weekdays': return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekends': return dayOfWeek === 0 || dayOfWeek === 6;

    default: return true;
  }
}

/**
 * Generate next-7-days schedule for a habit.
 * Returns array of { date, day_name, scheduled, completed, log }.
 */
async function generateWeekSchedule(habit, userId, timezone) {
  const schedule = [];
  const dayNames = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];

  for (let i = 0; i < 7; i++) {
    const m = moment().tz(timezone).add(i, 'days');
    const dateStr  = m.format('YYYY-MM-DD');
    const scheduled = isScheduledForDate(habit, dateStr);
    let log = null;
    if (scheduled) {
      log = await HabitLog.findOne({
        where: { habit_id: habit.id, log_date: dateStr },
      });
    }
    schedule.push({
      date:      dateStr,
      day_name:  dayNames[m.day()],
      is_today:  i === 0,
      scheduled,
      completed: log?.completed || false,
      log:       log || null,
    });
  }
  return schedule;
}

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

    const timezone = req.user.timezone || 'Africa/Cairo';
    const today = moment().tz(timezone).format('YYYY-MM-DD');

    const habitIds = habits.map(h => h.id);
    const todayLogs = await HabitLog.findAll({
      where: { habit_id: { [Op.in]: habitIds }, log_date: today },
    });

    const logMap = {};
    todayLogs.forEach(log => { logMap[log.habit_id] = log; });

    const habitsWithStatus = habits.map(habit => {
      const log = logMap[habit.id];
      const targetValue = habit.target_value || 1;
      const currentValue = log?.value || 0;
      const isCompleted = habit.habit_type === 'count'
        ? currentValue >= targetValue
        : (log?.completed || false);

      return {
        ...habit.toJSON(),
        today_log: log || null,
        completed_today: isCompleted,
        current_value: currentValue,
        target_value: targetValue,
        progress_percent: habit.habit_type === 'count'
          ? Math.min(100, Math.round((currentValue / targetValue) * 100))
          : (isCompleted ? 100 : 0),
      };
    });

    res.json({ success: true, data: habitsWithStatus });
  } catch (error) {
    logger.error('Get habits error:', error);
    res.status(500).json({ success: false, message: 'فشل في جلب العادات' });
  }
};

/**
 * @route   POST /api/v1/habits
 * @desc    Create new habit | إضافة عادة جديدة
 * Supports habit_type: 'boolean' (done/not done) | 'count' (daily target count)
 */
exports.createHabit = async (req, res) => {
  try {
    const {
      name, name_ar, category = 'health', icon = '⭐', color = '#6C63FF',
      frequency = 'daily', target_time, duration_minutes = 30,
      target_value, unit, description,
      habit_type = 'boolean', // 'boolean' | 'count'
      count_label,            // e.g. "كأس", "ركعة", "محاضرة"
      // Phase 2: flexible scheduling fields
      frequency_type,
      custom_days,
      monthly_days,
      preferred_time,
      reminder_before = 15,
      reminder_enabled = true,
      // Phase 3: behavior_type support (build/quit)
      behavior_type = 'build', // 'build' | 'break' | 'maintain'
      replaces_behavior,       // what negative behavior this replaces (for quit habits)
      goal_id,                 // link to a goal
    } = req.body;

    // Resolve frequency_type: use explicit field, fallback to frequency
    const resolvedFreqType = frequency_type || frequency || 'daily';

    // For prayers (5 per day), water (8 glasses), etc.
    const habitData = {
      user_id: req.user.id,
      name: name_ar || name,
      name_ar: name_ar || name,
      category,
      icon,
      color,
      frequency: resolvedFreqType,
      frequency_type: resolvedFreqType,
      custom_days: custom_days || null,
      monthly_days: monthly_days || null,
      preferred_time: preferred_time || target_time || null,
      target_time: target_time || preferred_time || null,
      duration_minutes: parseInt(duration_minutes) || 30,
      target_value: parseInt(target_value) || (habit_type === 'count' ? 1 : null),
      unit: unit || (habit_type === 'count' ? 'مرة' : null),
      description,
      habit_type,
      count_label: count_label || unit || 'مرة',
      reminder_before: parseInt(reminder_before) || 15,
      reminder_enabled: reminder_enabled !== false,
      behavior_type: behavior_type || 'build',
      replaces_behavior: replaces_behavior || null,
      goal_id: goal_id || null,
    };

    // HARDENED: Sanitize text inputs
    if (habitData.name) habitData.name = sanitizeText(habitData.name);
    if (habitData.name_ar) habitData.name_ar = sanitizeText(habitData.name_ar);
    if (habitData.description) habitData.description = sanitizeText(habitData.description).slice(0, 2000);

    // Deduplication: check if habit with same name already exists for this user
    const existingHabit = await Habit.findOne({
      where: { user_id: req.user.id, name: habitData.name },
    });
    if (existingHabit) {
      logger.info(`[HABIT] Duplicate prevented: "${habitData.name}" already exists for user ${req.user.id}`);
      return res.status(200).json({
        success: true,
        message: `العادة "${habitData.name}" موجودة بالفعل`,
        data: existingHabit,
        duplicate: true,
      });
    }

    const habit = await Habit.create(habitData);

    logger.info(`[HABIT] Created habit "${habit.name}" (${habit_type}) for user ${req.user.id}`);
    res.status(201).json({
      success: true,
      message: `تم إضافة عادة "${habit.name_ar || habit.name}" بنجاح! حافظ عليها كل يوم 💪`,
      data: habit,
    });
  } catch (error) {
    logger.error('Create habit error:', error);
    res.status(500).json({ success: false, message: 'فشل في إنشاء العادة: ' + error.message });
  }
};

/**
 * @route   PUT /api/v1/habits/:id
 * @desc    Update habit
 */
exports.updateHabit = async (req, res) => {
  try {
    const habit = await Habit.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!habit) return res.status(404).json({ success: false, message: 'العادة غير موجودة' });

    const allowedFields = [
      'name', 'name_ar', 'category', 'icon', 'color',
      'frequency', 'frequency_type', 'custom_days', 'monthly_days',
      'preferred_time', 'reminder_before', 'ai_best_time', 'ai_best_time_reason',
      'target_time', 'duration_minutes',
      'target_value', 'unit', 'description', 'is_active',
      'habit_type', 'count_label', 'reminder_enabled', 'reminder_times',
      'behavior_type', 'replaces_behavior', 'goal_id',
    ];

    const updates = {};
    allowedFields.forEach(f => {
      if (req.body[f] !== undefined) updates[f] = req.body[f];
    });

    await habit.update(updates);
    logger.info(`[HABIT] Updated habit "${habit.name}" for user ${req.user.id}`);
    res.json({ success: true, message: 'تم تحديث العادة', data: habit });
  } catch (error) {
    logger.error('Update habit error:', error);
    res.status(500).json({ success: false, message: 'فشل في تحديث العادة' });
  }
};

/**
 * @route   DELETE /api/v1/habits/:id
 * @desc    Delete habit (soft delete by deactivating)
 */
exports.deleteHabit = async (req, res) => {
  try {
    const habit = await Habit.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!habit) return res.status(404).json({ success: false, message: 'العادة غير موجودة' });

    const habitName = habit.name_ar || habit.name;
    
    // Hard delete the habit and its logs
    await HabitLog.destroy({ where: { habit_id: habit.id } });
    await habit.destroy();

    logger.info(`[HABIT] Deleted habit "${habitName}" for user ${req.user.id}`);
    res.json({ success: true, message: `تم حذف عادة "${habitName}"` });
  } catch (error) {
    logger.error('Delete habit error:', error);
    res.status(500).json({ success: false, message: 'فشل في حذف العادة' });
  }
};

/**
 * @route   POST /api/v1/habits/:id/check-in
 * @desc    Mark boolean habit as done for today
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

    // For count-based habits, use logValue approach
    if (habit.habit_type === 'count') {
      const existingLog = await HabitLog.findOne({ where: { habit_id: habit.id, log_date: today } });
      const targetValue = habit.target_value || 1;
      const currentValue = (existingLog?.value || 0) + 1;
      const isCompleted = currentValue >= targetValue;

      if (existingLog) {
        await existingLog.update({
          value: currentValue,
          completed: isCompleted,
          completed_at: isCompleted ? new Date() : existingLog.completed_at,
        });
      } else {
        await HabitLog.create({
          user_id: req.user.id,
          habit_id: habit.id,
          log_date: today,
          value: 1,
          completed: isCompleted,
          completed_at: isCompleted ? new Date() : null,
        });
      }

      if (isCompleted) await updateHabitStreak(habit);

      return res.json({
        success: true,
        message: isCompleted
          ? getEncouragementMessage(habit.current_streak + 1)
          : `${currentValue}/${targetValue} ${habit.count_label || habit.unit || 'مرة'} 👍`,
        data: { current_value: currentValue, target_value: targetValue, completed: isCompleted },
      });
    }

    // Boolean habit — HARDENED: Idempotent check-in
    const existingBoolLog = await HabitLog.findOne({
      where: { habit_id: habit.id, log_date: today, completed: true },
    });

    if (existingBoolLog) {
      // Already completed today — idempotent response, no streak change
      return res.json({
        success: true,
        message: `✅ ${habit.name_ar || habit.name} — تم إكماله مسبقاً اليوم`,
        data: { log: existingBoolLog, habit, already_completed: true },
      });
    }

    const [log, created] = await HabitLog.findOrCreate({
      where: { habit_id: habit.id, log_date: today },
      defaults: {
        user_id: req.user.id,
        habit_id: habit.id,
        log_date: today,
        completed: true,
        value: value || habit.target_value || 1,
        completed_at: new Date(),
        mood_after,
        notes,
      },
    });

    if (!created) {
      await log.update({
        completed: true,
        value: value || habit.target_value || 1,
        completed_at: new Date(),
        mood_after,
        notes,
      });
    }

    await updateHabitStreak(habit);
    const encouragement = getEncouragementMessage(habit.current_streak + 1);

    // Step 1: Notify behavior system of habit completion
    const behaviorSvc = getBehaviorService();
    if (behaviorSvc) {
      behaviorSvc.onHabitEvent(req.user.id, 'habit_completed', { habitId: habit.id }, req.user.timezone).catch(() => {});
    }

    // Step 2: Update persistent UserModel (Phase P) — HARDENED: safe method check
    const userModelSvc = getUserModelService();
    if (userModelSvc?.onHabitCompleted) {
      userModelSvc.onHabitCompleted(req.user.id, {
        id: habit.id,
        name: habit.name,
        current_streak: habit.current_streak,
        category: habit.category,
      }).catch(e => logger.debug('[HABIT] UserModel update failed:', e.message));
    }

    // Phase 12: Emit HABIT_COMPLETED to EventBus → triggers brain.recompute
    const eb = getEventBus();
    if (eb) eb.emit(eb.EVENT_TYPES.HABIT_COMPLETED, { userId: req.user.id, habitId: habit.id, habitName: habit.name, streak: habit.current_streak });

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
 * @route   POST /api/v1/habits/:id/log
 * @desc    Log a specific value for count-based habit (e.g. 3 glasses of water)
 */
exports.logValue = async (req, res) => {
  try {
    const { value = 1, mood_after, notes } = req.body;
    const timezone = req.user.timezone || 'Africa/Cairo';
    const today = moment().tz(timezone).format('YYYY-MM-DD');

    const habit = await Habit.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!habit) return res.status(404).json({ success: false, message: 'العادة غير موجودة' });

    const targetValue = habit.target_value || 1;
    const existingLog = await HabitLog.findOne({ where: { habit_id: habit.id, log_date: today } });
    
    // Allow setting absolute value or incrementing
    const newValue = req.body.absolute ? parseInt(value) : (existingLog?.value || 0) + parseInt(value);
    const isCompleted = newValue >= targetValue;

    if (existingLog) {
      await existingLog.update({
        value: newValue,
        completed: isCompleted,
        completed_at: isCompleted && !existingLog.completed_at ? new Date() : existingLog.completed_at,
        mood_after: mood_after || existingLog.mood_after,
        notes: notes || existingLog.notes,
      });
    } else {
      await HabitLog.create({
        user_id: req.user.id,
        habit_id: habit.id,
        log_date: today,
        value: newValue,
        completed: isCompleted,
        completed_at: isCompleted ? new Date() : null,
        mood_after,
        notes,
      });
    }

    if (isCompleted && !existingLog?.completed) {
      await updateHabitStreak(habit);
    }

    const unit = habit.count_label || habit.unit || 'مرة';
    const progressMsg = isCompleted 
      ? `🎉 أكملت ${habit.name_ar || habit.name}! ${newValue}/${targetValue} ${unit}`
      : `${newValue}/${targetValue} ${unit} - استمر! 💪`;

    res.json({
      success: true,
      message: progressMsg,
      data: { 
        current_value: newValue, 
        target_value: targetValue, 
        completed: isCompleted,
        progress_percent: Math.min(100, Math.round((newValue / targetValue) * 100)),
      },
    });
  } catch (error) {
    logger.error('Log value error:', error);
    res.status(500).json({ success: false, message: 'فشل في تسجيل القيمة' });
  }
};

/**
 * @route   GET /api/v1/habits/:id/stats
 * @desc    Get habit statistics
 */
exports.getHabitStats = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const habit = await Habit.findOne({
      where: { id: req.params.id, user_id: req.user.id },
      include: [{ model: HabitLog, as: 'logs', limit: 90, order: [['log_date', 'DESC']] }],
    });

    if (!habit) return res.status(404).json({ success: false, message: 'العادة غير موجودة' });

    const logs = habit.logs || [];
    const completedDays = logs.filter(l => l.completed).length;
    const totalDays = logs.length;

    // Compute AI best_time from log patterns
    const bestTime = computeBestTime(logs);

    // Update ai_best_time if we have enough data
    if (bestTime && completedDays >= 5) {
      await habit.update({
        ai_best_time:        bestTime.time,
        ai_best_time_reason: bestTime.reason,
      });
    }

    const stats = {
      current_streak:    habit.current_streak,
      longest_streak:    habit.longest_streak,
      total_completions: habit.total_completions,
      completion_rate:   totalDays > 0 ? ((completedDays / totalDays) * 100).toFixed(1) : 0,
      last_30_days:      getLast30DaysData(logs),
      weekly_pattern:    getWeeklyPattern(logs),
      average_mood:      getAverageMood(logs),
      ai_best_time:      habit.ai_best_time || bestTime?.time || null,
      ai_best_time_reason: habit.ai_best_time_reason || bestTime?.reason || null,
      preferred_time:    habit.preferred_time || null,
      week_schedule:     await generateWeekSchedule(habit, req.user.id, timezone),
      average_daily_value: habit.habit_type === 'count'
        ? (logs.reduce((sum, l) => sum + (l.value || 0), 0) / Math.max(1, logs.length)).toFixed(1)
        : null,
      best_day_value: habit.habit_type === 'count'
        ? Math.max(...logs.map(l => l.value || 0), 0)
        : null,
    };

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
 * @route   GET /api/v1/habits/:id/schedule
 * @desc    Get 7-day schedule for a habit | جدول العادة لأسبوع
 */
exports.getHabitSchedule = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const habit = await Habit.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!habit) return res.status(404).json({ success: false, message: 'العادة غير موجودة' });

    const schedule = await generateWeekSchedule(habit, req.user.id, timezone);

    res.json({
      success: true,
      data: {
        habit: {
          id:              habit.id,
          name:            habit.name_ar || habit.name,
          frequency_type:  habit.frequency_type || habit.frequency,
          custom_days:     habit.custom_days,
          monthly_days:    habit.monthly_days,
          preferred_time:  habit.preferred_time,
          reminder_before: habit.reminder_before,
          ai_best_time:    habit.ai_best_time,
          ai_best_time_reason: habit.ai_best_time_reason,
        },
        schedule,
        week_start: moment().tz(timezone).format('YYYY-MM-DD'),
        week_end:   moment().tz(timezone).add(6, 'days').format('YYYY-MM-DD'),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب جدول العادة' });
  }
};

/**
 * @route   GET /api/v1/habits/suggestions
 * @desc    Smart habit suggestions based on time, patterns, and failures
 */
exports.getSmartSuggestions = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const now = moment().tz(timezone);
    const today = now.format('YYYY-MM-DD');
    const currentHour = now.hour();

    const habits = await Habit.findAll({ where: { user_id: req.user.id, is_active: true } });
    const todayLogs = await HabitLog.findAll({
      where: { user_id: req.user.id, log_date: today, habit_id: { [Op.in]: habits.map(h => h.id) } },
    });
    const logMap = {};
    todayLogs.forEach(l => { logMap[l.habit_id] = l; });

    const suggestions = [];

    for (const habit of habits) {
      const log = logMap[habit.id];
      const isDone = habit.habit_type === 'count'
        ? (log?.value || 0) >= (habit.target_value || 1)
        : (log?.completed || false);
      if (isDone) continue;
      if (!isScheduledForDate(habit, today)) continue;

      let priority = 50;
      let reason = '';

      // Time match: current hour near preferred/best time
      const targetTime = habit.preferred_time || habit.ai_best_time || habit.target_time;
      if (targetTime) {
        const hh = parseInt(targetTime.split(':')[0]) || 0;
        const diff = Math.abs(currentHour - hh);
        if (diff === 0) {
          priority += 40;
          reason = `⏰ الآن وقت ${habit.name_ar || habit.name}`;
        } else if (diff === 1) {
          priority += 25;
          reason = `⏳ قرب موعد ${habit.name_ar || habit.name}`;
        } else if (diff <= 2) {
          priority += 10;
          reason = `📅 ${habit.name_ar || habit.name} في خلال ${diff} ساعة`;
        }
      }

      // Streak at risk
      if ((habit.current_streak || 0) >= 3) {
        priority += 20;
        reason = reason || `🔥 سلسلة ${habit.current_streak} يوم — لا تقطعها!`;
      }

      // Broken streak recovery
      if ((habit.longest_streak || 0) > 5 && (habit.current_streak || 0) === 0) {
        priority += 15;
        reason = reason || `⚠️ ${habit.name_ar || habit.name} — ابدأ سلسلة جديدة!`;
      }

      // Quit habit urgency
      if (habit.behavior_type === 'break') {
        priority += 10;
        reason = reason || `🚫 ${habit.name_ar || habit.name} — عادة تحاول التخلص منها`;
      }

      if (!reason) {
        reason = `📋 ${habit.name_ar || habit.name} — لم تسجلها بعد اليوم`;
      }

      suggestions.push({
        habit_id: habit.id,
        name: habit.name_ar || habit.name,
        icon: habit.icon || '⭐',
        color: habit.color || '#6C63FF',
        category: habit.category,
        behavior_type: habit.behavior_type || 'build',
        current_streak: habit.current_streak || 0,
        priority,
        reason,
        target_time: targetTime,
      });
    }

    // Sort by priority descending, return top 5
    suggestions.sort((a, b) => b.priority - a.priority);

    res.json({ success: true, data: suggestions.slice(0, 5) });
  } catch (error) {
    logger.error('Habit suggestions error:', error);
    res.status(500).json({ success: false, message: 'فشل في جلب الاقتراحات' });
  }
};

/**
 * @route   GET /api/v1/habits/today-summary
 * @desc    Today's habits summary with progress
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

    const habitsWithStatus = habits.map(h => {
      const log = logMap[h.id];
      const targetValue = h.target_value || 1;
      const currentValue = log?.value || 0;
      const isCompleted = h.habit_type === 'count'
        ? currentValue >= targetValue
        : (log?.completed || false);

      return {
        ...h.toJSON(),
        completed_today: isCompleted,
        log: log || null,
        current_value: currentValue,
        target_value: targetValue,
        progress_percent: h.habit_type === 'count'
          ? Math.min(100, Math.round((currentValue / targetValue) * 100))
          : (isCompleted ? 100 : 0),
      };
    });

    const completedCount = habitsWithStatus.filter(h => h.completed_today).length;

    const summary = {
      total: habits.length,
      completed: completedCount,
      pending: habits.length - completedCount,
      completion_percentage: habits.length > 0
        ? Math.round((completedCount / habits.length) * 100)
        : 0,
      habits: habitsWithStatus,
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب ملخص اليوم' });
  }
};

// =============================================
// Helper functions
// =============================================

/**
 * HARDENED: updateHabitStreak — Idempotent streak update
 * Only increments if not already updated today (checks last_completed date)
 */
async function updateHabitStreak(habit) {
  try {
    const timezone = 'Africa/Cairo';
    const today = moment().tz(timezone).format('YYYY-MM-DD');
    const yesterday = moment().tz(timezone).subtract(1, 'day').format('YYYY-MM-DD');

    // GUARD: If already updated today, skip (idempotent)
    const lastCompleted = habit.last_completed ? String(habit.last_completed).split('T')[0] : null;
    if (lastCompleted === today) {
      return; // Already counted today
    }

    const yesterdayLog = await HabitLog.findOne({
      where: { habit_id: habit.id, log_date: yesterday, completed: true },
    });

    const newStreak = yesterdayLog ? (habit.current_streak || 0) + 1 : 1;
    const longestStreak = Math.max(newStreak, habit.longest_streak || 0);

    await habit.update({
      current_streak: newStreak,
      longest_streak: longestStreak,
      best_streak: Math.max(newStreak, habit.best_streak || 0),
      total_completions: (habit.total_completions || 0) + 1,
      last_completed: today,
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

/**
 * Compute the best time of day for a habit based on completion patterns.
 * Returns { time: 'HH:MM', reason: string } or null.
 */
function computeBestTime(logs) {
  const completedWithTime = logs.filter(l => l.completed && l.completed_at);
  if (completedWithTime.length < 3) return null;

  // Bucket by hour
  const hourBuckets = {};
  for (const log of completedWithTime) {
    const h = moment(log.completed_at).hour();
    hourBuckets[h] = (hourBuckets[h] || 0) + 1;
  }

  // Find most frequent hour
  const bestHour = Object.entries(hourBuckets)
    .sort((a, b) => b[1] - a[1])[0][0];

  const h = parseInt(bestHour);
  const timeStr = `${String(h).padStart(2, '0')}:00`;

  let period = 'صباحاً';
  if (h >= 12 && h < 17) period = 'ظهراً';
  else if (h >= 17 && h < 21) period = 'مساءً';
  else if (h >= 21) period = 'ليلاً';

  return {
    time:   timeStr,
    reason: `أفضل وقت بناءً على ${completedWithTime.length} إنجاز — عادةً ${period}`,
  };
}
