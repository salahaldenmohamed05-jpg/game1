/**
 * Day Planner Service
 * ====================
 * Automatically builds an optimised daily schedule by combining:
 *   - EnergyProfile  (peak hours / deep-work windows / break times)
 *   - Today's tasks  (priority, estimated duration, due time)
 *   - Active habits  (scheduled times)
 *   - Prediction scores (task completion probability)
 *
 * Outputs:
 *   - Ordered time-blocked plan for the day
 *   - Recommended task slots (matched to energy level)
 *   - Break suggestions
 *   - Overload / under-load warnings
 */

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

const getModels = () => ({
  Task:          require('../models/task.model'),
  Habit:         require('../models/habit.model').Habit,
  HabitLog:      require('../models/habit.model').HabitLog,
  EnergyProfile: require('../models/energy_profile.model'),
  MoodEntry:     require('../models/mood.model'),
  User:          require('../models/user.model'),
  DayPlan:       require('../models/day_plan.model'),
});

// Lazy-load Goal Engine (optional — graceful if missing)
function getGoalEngine() {
  try { return require('./goal.engine.service'); } catch (_) { return null; }
}

// ─── Priority weights ────────────────────────────────────────────────────────
const PRIORITY_SCORE = { urgent: 4, high: 3, medium: 2, low: 1 };

// ─── Energy level per hour (default curve, overridden by EnergyProfile) ─────
const DEFAULT_ENERGY_CURVE = {
  5:2, 6:3, 7:5, 8:7, 9:9, 10:10, 11:9, 12:7,
  13:5, 14:6, 15:7, 16:8, 17:7, 18:6, 19:5, 20:4, 21:3, 22:2, 23:1,
};

// ─── Task energy demand ──────────────────────────────────────────────────────
const TASK_ENERGY_DEMAND = { urgent:9, high:7, medium:5, low:3 };

// ─────────────────────────────────────────────────────────────────────────────
// MAIN: BUILD TODAY'S PLAN
// ─────────────────────────────────────────────────────────────────────────────
async function buildDayPlan(userId, timezone = 'Africa/Cairo', targetDate = null) {
  const { Task, Habit, HabitLog, EnergyProfile, MoodEntry, User } = getModels();
  const tz    = timezone || 'Africa/Cairo';
  const today = targetDate
    ? moment.tz(targetDate, tz).format('YYYY-MM-DD')
    : moment.tz(tz).format('YYYY-MM-DD');

  try {
    const user = await User.findByPk(userId);
    const wakeHour  = parseHour(user?.locale?.wake_up_time  || '06:00', 6);
    const sleepHour = parseHour(user?.locale?.sleep_time    || '23:00', 23);
    const workStart = parseHour(user?.locale?.work_start_time || '09:00', 9);
    const workEnd   = parseHour(user?.locale?.work_end_time   || '18:00', 18);

    // ── Fetch data in parallel ────────────────────────────────────────────────
    const [tasks, habits, habitLogs, energyProfile, todayMood] = await Promise.all([
      Task.findAll({
        where: {
          user_id: userId,
          status: { [Op.in]: ['pending', 'in_progress'] },
          [Op.or]: [
            { due_date: today },
            { due_date: null },
            { status: 'in_progress' },
          ],
        },
        order: [
          ['priority', 'ASC'],
          ['ai_priority_score', 'DESC'],
          ['due_date', 'ASC'],
        ],
        limit: 30,
      }),
      Habit.findAll({ where: { user_id: userId, is_active: true } }),
      HabitLog.findAll({ where: { user_id: userId, log_date: today } }),
      EnergyProfile.findOne({ where: { user_id: userId } }),
      MoodEntry.findOne({
        where: { user_id: userId, entry_date: today },
        order: [['createdAt', 'DESC']],
      }),
    ]);

    // ── Build energy curve for today ──────────────────────────────────────────
    const energyCurve = buildEnergyCurve(energyProfile, wakeHour, sleepHour);

    // ── Fetch goal context (optional — enriches task ranking) ──────────────
    let goalContext = null;
    const goalEngine = getGoalEngine();
    if (goalEngine) {
      try {
        goalContext = await goalEngine.getGoalContext(userId, tz);
      } catch (e) { logger.debug('[DAY-PLANNER] Goal context fetch failed:', e.message); }
    }

    // ── Sort tasks by combined score (goal-boosted) ────────────────────────
    const rankedTasks = rankTasks(tasks, today, tz, goalContext);

    // ── Build habit blocks ────────────────────────────────────────────────────
    const habitBlocks = buildHabitBlocks(habits, habitLogs, today, wakeHour, workEnd);

    // ── Schedule tasks into time blocks ──────────────────────────────────────
    const { schedule, warnings, stats } = scheduleTasks(
      rankedTasks, habitBlocks, energyCurve,
      wakeHour, sleepHour, workStart, workEnd, today, tz,
    );

    // ── Mood-based adjustments ────────────────────────────────────────────────
    const moodAdjustments = getMoodAdjustments(todayMood);

    // ── Focus windows (high energy blocks) ────────────────────────────────────
    const focusWindows = getFocusWindows(energyCurve, workStart, workEnd);

    // ── Break suggestions ─────────────────────────────────────────────────────
    const breakSuggestions = getBreakSuggestions(schedule, energyCurve, workStart, workEnd);

    const planStats = {
      ...stats,
      total_tasks: rankedTasks.length,
      scheduled_tasks: schedule.filter(b => b.type === 'task').length,
      total_habits: habits.length,
      completed_habits: habitLogs.filter(l => l.completed).length,
      estimated_work_minutes: rankedTasks.reduce((s, t) => s + (t.estimated_duration || 30), 0),
      peak_energy_hour: getPeakHour(energyCurve, workStart, workEnd),
    };

    const planResult = {
      date: today,
      generated_at: new Date().toISOString(),
      schedule,
      focus_windows: focusWindows,
      break_suggestions: breakSuggestions,
      mood_adjustments: moodAdjustments,
      warnings,
      stats: planStats,
      goals: goalContext ? {
        active: goalContext.activeGoals.slice(0, 5),
        suggestions: goalContext.goalSuggestions.slice(0, 3),
        summary: goalContext.summary,
      } : null,
      energy_curve: Object.entries(energyCurve)
        .filter(([h]) => h >= wakeHour && h <= sleepHour)
        .map(([hour, level]) => ({ hour: Number(hour), level, label: hourLabel(Number(hour)) })),
    };

    // ── Persist to DB (upsert by user_id + plan_date) ────────────────────────
    try {
      const { DayPlan } = getModels();
      const [record, created] = await DayPlan.findOrCreate({
        where: { user_id: userId, plan_date: today },
        defaults: {
          schedule,
          focus_windows: focusWindows,
          warnings,
          stats: planStats,
          total_blocks: schedule.length,
          energy_match_score: planStats.energy_match_score || 0,
        },
      });
      if (!created) {
        await record.update({
          schedule,
          focus_windows: focusWindows,
          warnings,
          stats: planStats,
          total_blocks: schedule.length,
          energy_match_score: planStats.energy_match_score || 0,
        });
      }
      planResult.persisted = true;
      planResult.plan_id = record.id;
      logger.info(`[DAY-PLANNER] Plan ${created ? 'created' : 'updated'} for user ${userId} date ${today}`);
    } catch (persistErr) {
      logger.warn('[DAY-PLANNER] Failed to persist plan to DB:', persistErr.message);
      planResult.persisted = false;
    }

    return planResult;
  } catch (err) {
    logger.error('buildDayPlan error:', err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// RANK TASKS (goal-aware)
// ─────────────────────────────────────────────────────────────────────────────
function rankTasks(tasks, today, tz, goalContext) {
  const goalEngine = getGoalEngine();
  return tasks.map(t => {
    const priorityScore = PRIORITY_SCORE[t.priority] || 2;
    const aiScore       = t.ai_priority_score || 0;

    // Urgency: tasks due today get +3
    let urgencyBonus = 0;
    if (t.due_date === today) urgencyBonus = 3;
    else if (t.due_date && moment.tz(new Date(t.due_date).toISOString(), tz).isBefore(moment.tz(tz))) urgencyBonus = 5; // overdue

    // Reschedule penalty
    const reschedulePenalty = Math.min(2, (t.reschedule_count || 0) * 0.5);

    // Goal boost: tasks linked to high-priority goals get ranked higher
    const goalBoost = (goalEngine && goalContext)
      ? goalEngine.getGoalBoostForTask(t, goalContext)
      : 0;

    const totalScore = priorityScore * 2 + aiScore / 20 + urgencyBonus - reschedulePenalty + goalBoost;
    return { ...t.toJSON(), _score: totalScore, _energyDemand: TASK_ENERGY_DEMAND[t.priority] || 5, _goalBoost: goalBoost };
  }).sort((a, b) => b._score - a._score);
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD ENERGY CURVE
// ─────────────────────────────────────────────────────────────────────────────
function buildEnergyCurve(profile, wakeHour, sleepHour) {
  if (!profile || profile.data_points < 5) {
    // Return default curve within wake/sleep window
    const curve = {};
    for (let h = 0; h < 24; h++) curve[h] = DEFAULT_ENERGY_CURVE[h] || 3;
    return curve;
  }

  const hourly    = profile.hourly_task_completions || new Array(24).fill(0);
  const maxVal    = Math.max(...hourly, 1);
  const curve     = {};

  for (let h = 0; h < 24; h++) {
    // Normalize 0–10
    const normalised = Math.round((hourly[h] / maxVal) * 10);
    // Blend 70% personal data + 30% default curve
    curve[h] = Math.round(normalised * 0.7 + (DEFAULT_ENERGY_CURVE[h] || 3) * 0.3);
  }
  return curve;
}

// ─────────────────────────────────────────────────────────────────────────────
// BUILD HABIT BLOCKS
// ─────────────────────────────────────────────────────────────────────────────
function buildHabitBlocks(habits, habitLogs, today, wakeHour, workEnd) {
  const completedIds = new Set(
    habitLogs.filter(l => l.completed).map(l => l.habit_id)
  );

  const blocks = [];
  habits.forEach(h => {
    if (!h.is_active) return;
    const targetTime = h.target_time || null;
    const hour = targetTime ? parseHour(targetTime, null) : null;
    if (hour === null) return; // no scheduled time → skip fixed block

    blocks.push({
      type:      'habit',
      hour,
      duration:  h.duration_minutes || 15,
      title:     h.name,
      habit_id:  h.id,
      completed: completedIds.has(h.id),
      icon:      h.icon || '✅',
      color:     h.color || '#6366f1',
    });
  });
  return blocks;
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHEDULE TASKS INTO TIME BLOCKS
// ─────────────────────────────────────────────────────────────────────────────
function scheduleTasks(rankedTasks, habitBlocks, energyCurve, wakeHour, sleepHour, workStart, workEnd, today, tz) {
  const schedule   = [];
  const warnings   = [];
  const stats      = { overloaded: false, underloaded: false, energy_match_score: 0 };

  // Track occupied slots (in 15-min increments)
  const occupied = new Set();
  const slotMinutes = 15;

  // Mark wake/sleep
  const markOccupied = (startHour, durationMin) => {
    const slots = Math.ceil(durationMin / slotMinutes);
    const startSlot = Math.round(startHour * 4);
    for (let s = 0; s < slots; s++) occupied.add(startSlot + s);
  };

  const isSlotFree = (startHour, durationMin) => {
    const slots = Math.ceil(durationMin / slotMinutes);
    const startSlot = Math.round(startHour * 4);
    for (let s = 0; s < slots; s++) {
      if (occupied.has(startSlot + s)) return false;
    }
    return true;
  };

  // ── Add morning routine block ─────────────────────────────────────────────
  schedule.push({
    type: 'routine', hour: wakeHour, minute: 0,
    title: 'روتين الصباح', duration: 30,
    description: 'استعداد، إفطار، مراجعة مهام اليوم', color: '#f59e0b',
    time_label: formatTime(wakeHour, 0),
  });
  markOccupied(wakeHour, 30);

  // ── Add habit blocks first ────────────────────────────────────────────────
  habitBlocks.forEach(hb => {
    if (hb.hour >= wakeHour && hb.hour <= sleepHour) {
      schedule.push({
        ...hb, minute: 0,
        time_label: formatTime(hb.hour, 0),
        description: `عادة يومية: ${hb.title}`,
      });
      markOccupied(hb.hour, hb.duration);
    }
  });

  // ── Add break blocks at low-energy hours within work window ──────────────
  const breakHours = getBreakHoursFromCurve(energyCurve, workStart, workEnd);
  breakHours.forEach(bh => {
    if (isSlotFree(bh, 15)) {
      schedule.push({
        type: 'break', hour: bh, minute: 0,
        title: 'استراحة', duration: 15,
        description: 'استرح، اشرب ماءً، ابتعد عن الشاشة', color: '#10b981',
        time_label: formatTime(bh, 0),
      });
      markOccupied(bh, 15);
    }
  });

  // ── Schedule tasks by energy match ───────────────────────────────────────
  let energyMatchTotal = 0;
  let scheduledCount   = 0;
  let unscheduledCount = 0;

  rankedTasks.forEach(task => {
    const duration = task.estimated_duration || 30;
    const demand   = task._energyDemand || 5;

    // Find best free slot matching energy demand
    const bestHour = findBestSlot(demand, energyCurve, occupied, workStart, workEnd, sleepHour, duration);
    if (bestHour === null) {
      unscheduledCount++;
      return;
    }

    const energyLevel = energyCurve[bestHour] || 5;
    const match = 1 - Math.abs(demand - energyLevel) / 10;
    energyMatchTotal += match;
    scheduledCount++;

    schedule.push({
      type:       'task',
      hour:       bestHour,
      minute:     0,
      title:      task.title,
      task_id:    task.id,
      duration,
      priority:   task.priority,
      energy_demand: demand,
      energy_match:  Math.round(match * 100),
      color:      priorityColor(task.priority),
      time_label: formatTime(bestHour, 0),
      description: task.description || '',
      due_date:   task.due_date,
      ai_score:   task.ai_priority_score,
    });
    markOccupied(bestHour, duration);
  });

  // ── Evening review block ───────────────────────────────────────────────────
  const reviewHour = Math.min(sleepHour - 1, workEnd + 1);
  if (isSlotFree(reviewHour, 20)) {
    schedule.push({
      type: 'review', hour: reviewHour, minute: 0,
      title: 'مراجعة اليوم', duration: 20,
      description: 'راجع ما أتممت وخطط لغد', color: '#8b5cf6',
      time_label: formatTime(reviewHour, 0),
    });
  }

  // ── Warnings ──────────────────────────────────────────────────────────────
  if (rankedTasks.length > 10) {
    warnings.push({ type: 'overload', message: `لديك ${rankedTasks.length} مهمة — قد تكون مُثقلاً. أعِد ترتيب الأولويات.` });
    stats.overloaded = true;
  }
  if (unscheduledCount > 0) {
    warnings.push({ type: 'unscheduled', message: `لم يمكن جدولة ${unscheduledCount} مهمة — لا يوجد وقت كافٍ اليوم.` });
  }
  if (rankedTasks.length === 0) {
    warnings.push({ type: 'empty', message: 'لا مهام مجدولة اليوم. أضف مهمة جديدة!' });
    stats.underloaded = true;
  }

  stats.energy_match_score = scheduledCount > 0
    ? Math.round((energyMatchTotal / scheduledCount) * 100) : 0;

  // ── Sort schedule by hour ─────────────────────────────────────────────────
  schedule.sort((a, b) => a.hour - b.hour || (a.minute || 0) - (b.minute || 0));

  return { schedule, warnings, stats };
}

// ─────────────────────────────────────────────────────────────────────────────
// FIND BEST FREE SLOT
// ─────────────────────────────────────────────────────────────────────────────
function findBestSlot(demandLevel, energyCurve, occupied, workStart, workEnd, sleepHour, durationMin) {
  const slotMinutes = 15;
  let bestHour  = null;
  let bestScore = -1;

  for (let h = workStart; h <= Math.min(workEnd, sleepHour - 1); h++) {
    if (!isSlotFreeStatic(h, durationMin, occupied, slotMinutes)) continue;
    const energyLevel = energyCurve[h] || 5;
    // Score = how well energy matches demand
    const matchScore = 10 - Math.abs(demandLevel - energyLevel);
    if (matchScore > bestScore) {
      bestScore = matchScore;
      bestHour  = h;
    }
  }
  return bestHour;
}

function isSlotFreeStatic(startHour, durationMin, occupied, slotMinutes = 15) {
  const slots     = Math.ceil(durationMin / slotMinutes);
  const startSlot = Math.round(startHour * 4);
  for (let s = 0; s < slots; s++) {
    if (occupied.has(startSlot + s)) return false;
  }
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// FOCUS WINDOWS
// ─────────────────────────────────────────────────────────────────────────────
function getFocusWindows(energyCurve, workStart, workEnd) {
  const windows = [];
  let inWindow  = false;
  let winStart  = 0;

  for (let h = workStart; h <= workEnd; h++) {
    const level = energyCurve[h] || 0;
    if (level >= 7 && !inWindow) { inWindow = true; winStart = h; }
    if ((level < 7 || h === workEnd) && inWindow) {
      inWindow = false;
      if (h - winStart >= 1) {
        windows.push({
          start: winStart, end: h,
          label: `${formatTime(winStart, 0)} - ${formatTime(h, 0)}`,
          duration_hours: h - winStart,
          avg_energy: Math.round(
            Array.from({ length: h - winStart }, (_, i) => energyCurve[winStart + i] || 0)
              .reduce((s, v) => s + v, 0) / (h - winStart)
          ),
          recommendation: 'خصّص هذا الوقت للمهام العميقة والصعبة',
        });
      }
    }
  }
  return windows;
}

// ─────────────────────────────────────────────────────────────────────────────
// BREAK SUGGESTIONS
// ─────────────────────────────────────────────────────────────────────────────
function getBreakHoursFromCurve(energyCurve, workStart, workEnd) {
  // Find hours with energy dip (local minimum) within work window
  const dips = [];
  for (let h = workStart + 1; h < workEnd; h++) {
    if ((energyCurve[h] || 0) < (energyCurve[h - 1] || 0) &&
        (energyCurve[h] || 0) < (energyCurve[h + 1] || 0)) {
      dips.push(h);
    }
  }
  // Always include midday if not in dips
  if (!dips.includes(13) && 13 >= workStart && 13 <= workEnd) dips.push(13);
  return dips.slice(0, 3);
}

function getBreakSuggestions(schedule, energyCurve, workStart, workEnd) {
  const taskBlocks = schedule.filter(b => b.type === 'task');
  const suggestions = [];

  // After every 2 consecutive task hours → suggest break
  if (taskBlocks.length >= 2) {
    suggestions.push({
      after_task: taskBlocks[Math.min(1, taskBlocks.length - 1)]?.title,
      suggested_hour: (taskBlocks[Math.min(1, taskBlocks.length - 1)]?.hour || workStart) + 1,
      duration: 15,
      reason: 'بعد ساعتين من العمل المكثف، استراحة 15 دقيقة ترفع الإنتاجية 30%',
    });
  }
  // Lunch break
  suggestions.push({
    after_task: null,
    suggested_hour: 13,
    duration: 60,
    reason: 'استراحة الغداء — ضرورية لتجديد الطاقة في النصف الثاني من اليوم',
  });
  return suggestions;
}

// ─────────────────────────────────────────────────────────────────────────────
// MOOD ADJUSTMENTS
// ─────────────────────────────────────────────────────────────────────────────
function getMoodAdjustments(todayMood) {
  if (!todayMood) return null;
  const score = todayMood.mood_score || 5;
  if (score <= 3) return {
    recommendation: 'مزاجك منخفض اليوم — ركّز على مهمتين فقط وخذ استراحات أطول',
    reduce_tasks: true, extra_breaks: true, mood_score: score,
  };
  if (score >= 8) return {
    recommendation: 'مزاجك رائع اليوم! استغل هذه الطاقة في المهام الصعبة',
    boost_deep_work: true, mood_score: score,
  };
  return { recommendation: 'حالة مزاجية معتدلة — خطة يوم متوازنة', mood_score: score };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function parseHour(timeStr, fallback) {
  if (!timeStr) return fallback;
  const parts = timeStr.split(':');
  return parseInt(parts[0], 10) || fallback;
}

function formatTime(hour, minute = 0) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function hourLabel(h) {
  const labels = {
    5:'الفجر',6:'الفجر',7:'الصباح الباكر',8:'الصباح الباكر',
    9:'الصباح',10:'الصباح',11:'قبل الظهر',12:'الظهر',
    13:'بعد الظهر',14:'بعد الظهر',15:'العصر',16:'العصر',
    17:'المساء',18:'المساء',19:'المساء',20:'الليل',
    21:'الليل',22:'الليل المتأخر',23:'منتصف الليل',
  };
  return labels[h] || `${h}:00`;
}

function priorityColor(priority) {
  return { urgent:'#ef4444', high:'#f97316', medium:'#3b82f6', low:'#6b7280' }[priority] || '#6b7280';
}

function getPeakHour(energyCurve, workStart, workEnd) {
  let best = workStart, bestVal = 0;
  for (let h = workStart; h <= workEnd; h++) {
    if ((energyCurve[h] || 0) > bestVal) { bestVal = energyCurve[h]; best = h; }
  }
  return best;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET TODAY'S FOCUS WINDOWS (standalone endpoint helper)
// ─────────────────────────────────────────────────────────────────────────────
async function getFocusWindowsForUser(userId, timezone = 'Africa/Cairo') {
  const { EnergyProfile, User } = getModels();
  const tz  = timezone || 'Africa/Cairo';
  const user = await User.findByPk(userId);
  const workStart = parseHour(user?.locale?.work_start_time || '09:00', 9);
  const workEnd   = parseHour(user?.locale?.work_end_time   || '18:00', 18);
  const profile   = await EnergyProfile.findOne({ where: { user_id: userId } });
  const curve     = buildEnergyCurve(profile, workStart, workEnd);
  return getFocusWindows(curve, workStart, workEnd);
}

module.exports = { buildDayPlan, getFocusWindowsForUser };
