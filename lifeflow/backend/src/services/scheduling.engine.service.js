/**
 * Scheduling Engine Service — Phase 16
 * ======================================
 * Assigns intelligent time slots to tasks & habits using:
 *  - ML best focus hours (from learning engine)
 *  - ML task completion probability
 *  - Burnout risk (reduce workload when high)
 *  - User wake/sleep/work schedule
 *  - Priority ordering + deadline urgency
 *
 * Output: ordered daily plan with {type, title, start_time, end_time, confidence, reason[]}
 */

'use strict';

const logger = require('../utils/logger');

// ─── Lazy loaders ────────────────────────────────────────────────────────────
function getLearning()    { try { return require('./learning.engine.service');  } catch (_) { return null; } }
function getModels()      { try { return require('../config/database').sequelize.models; } catch (_) { return {}; } }

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_WORK_START  = '09:00';
const DEFAULT_WORK_END    = '17:00';
const DEFAULT_WAKE_TIME   = '07:00';
const DEFAULT_SLEEP_TIME  = '23:00';
const SLOT_BUFFER_MINS    = 10;      // gap between tasks
const MAX_CONTINUOUS_MINS = 90;      // max focus block before a break
const BREAK_MINS          = 15;      // break duration after long block
const MAX_DAILY_WORK_HRS  = 10;      // hard cap on scheduled work per day

// Priority weight → higher = schedule earlier
const PRIORITY_WEIGHT = { urgent: 4, high: 3, medium: 2, low: 1 };

// Prayer times (approximate, Egypt timezone)
const PRAYER_BLOCKS = [
  { name: '🕌 فجر',   start: '04:45', end: '05:15' },
  { name: '🕌 ظهر',   start: '12:15', end: '12:45' },
  { name: '🕌 عصر',   start: '15:30', end: '16:00' },
  { name: '🕌 مغرب',  start: '18:00', end: '18:30' },
  { name: '🕌 عشاء',  start: '19:45', end: '20:15' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function timeToMins(timeStr) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minsToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function isBusy(startMins, endMins, busySlots) {
  return busySlots.some(b => startMins < b.end && endMins > b.start);
}

function urgencyScore(task, todayStr) {
  const due = task.due_date;
  if (!due) return 0;
  const dueStr = typeof due === 'string' ? due.split('T')[0] : new Date(due).toISOString().split('T')[0];
  const daysLeft = Math.floor((new Date(dueStr) - new Date(todayStr)) / 86400000);
  if (daysLeft < 0)  return 5;   // overdue
  if (daysLeft === 0) return 4;  // due today
  if (daysLeft === 1) return 3;  // due tomorrow
  if (daysLeft <= 3)  return 2;
  return 1;
}

// ─── ML Context ───────────────────────────────────────────────────────────────
function getMLContext(userId) {
  const learning = getLearning();
  if (!learning) return { bestFocusHour: 10, burnoutRisk: 0, completionBoost: 0 };

  try {
    const profile   = learning.getUserLearningProfile(userId);
    const optHour   = learning.getOptimalHour(userId);
    const mlPreds   = learning.getMLPredictions?.(userId, { energy: 60, productivity: 60 });

    return {
      bestFocusHour  : optHour ?? 10,
      burnoutRisk    : mlPreds?.burnout_risk ?? 0,
      completionBoost: (mlPreds?.task_completion_probability ?? 0.5) - 0.5, // -0.5 to +0.5
      successRates   : profile?.stats?.successRates || {},
    };
  } catch (e) {
    logger.warn('[SCHEDULER] ML context error:', e.message);
    return { bestFocusHour: 10, burnoutRisk: 0, completionBoost: 0 };
  }
}

// ─── Priority + Focus Scoring ─────────────────────────────────────────────────
function scoreTask(task, mlCtx, todayStr) {
  const priority  = PRIORITY_WEIGHT[task.priority] || 2;
  const urgency   = urgencyScore(task, todayStr);
  const mlBoost   = mlCtx.completionBoost * 10;
  return priority * 10 + urgency * 8 + mlBoost;
}

// ─── Build Busy Slots (prayers + existing fixed habits) ───────────────────────
function buildBusySlots(includePrayers, habits) {
  const busy = [];

  if (includePrayers) {
    for (const p of PRAYER_BLOCKS) {
      busy.push({ name: p.name, start: timeToMins(p.start), end: timeToMins(p.end), type: 'prayer' });
    }
  }

  for (const h of habits) {
    if (h.preferred_time) {
      const s = timeToMins(h.preferred_time);
      const dur = h.duration_minutes || 30;
      busy.push({ name: h.name_ar || h.name, start: s, end: s + dur, type: 'habit' });
    }
  }

  busy.sort((a, b) => a.start - b.start);
  return busy;
}

// ─── Find Next Free Slot ──────────────────────────────────────────────────────
function findNextFreeSlot(currentMins, durationMins, busySlots, dayEndMins) {
  let tryStart = currentMins;

  for (let attempt = 0; attempt < 50; attempt++) {
    const tryEnd = tryStart + durationMins;
    if (tryEnd > dayEndMins) return null; // no room left in day

    if (!isBusy(tryStart, tryEnd, busySlots)) {
      return tryStart;
    }
    // Skip to end of blocking slot
    const blocker = busySlots.find(b => tryStart < b.end && tryEnd > b.start);
    if (blocker) {
      tryStart = blocker.end + SLOT_BUFFER_MINS;
    } else {
      tryStart += SLOT_BUFFER_MINS;
    }
  }
  return null;
}

// ─── Confidence Builder ───────────────────────────────────────────────────────
function buildConfidence(task, slotStartMins, mlCtx) {
  let confidence = 55; // base
  const slotHour = Math.floor(slotStartMins / 60);

  // +15 if within ±2 hours of best focus hour
  if (Math.abs(slotHour - mlCtx.bestFocusHour) <= 2) confidence += 15;

  // +10 for high/urgent priority
  if (task.priority === 'urgent') confidence += 12;
  if (task.priority === 'high')   confidence += 8;

  // +10 ML completion boost (if positive)
  if (mlCtx.completionBoost > 0) confidence += Math.round(mlCtx.completionBoost * 20);

  // -15 if burnout risk high
  if (mlCtx.burnoutRisk > 0.6) confidence -= 15;

  return Math.max(20, Math.min(98, confidence));
}

function buildReason(task, slotStartMins, mlCtx) {
  const reasons = [];
  const slotHour = Math.floor(slotStartMins / 60);

  if (Math.abs(slotHour - mlCtx.bestFocusHour) <= 2) {
    reasons.push(`⭐ أفضل وقت تركيز ليك (الساعة ${mlCtx.bestFocusHour}:00)`);
  }
  if (task.priority === 'urgent') reasons.push('🔴 أولوية عاجلة');
  if (task.priority === 'high')   reasons.push('🟠 أولوية عالية');
  if (mlCtx.completionBoost > 0.1) reasons.push('📈 نسبة نجاحك مرتفعة الآن');
  if (mlCtx.burnoutRisk > 0.6)     reasons.push('⚠️ خفضنا الحمل بسبب خطر الإجهاد');
  if (task.due_date) {
    const todayStr = new Date().toISOString().split('T')[0];
    const dueStr   = typeof task.due_date === 'string' ? task.due_date.split('T')[0] : new Date(task.due_date).toISOString().split('T')[0];
    const daysLeft = Math.floor((new Date(dueStr) - new Date(todayStr)) / 86400000);
    if (daysLeft === 0) reasons.push('📅 الموعد النهائي اليوم');
    if (daysLeft === 1) reasons.push('📅 الموعد غداً');
  }
  if (reasons.length === 0) reasons.push('🕐 وقت متاح مناسب');
  return reasons;
}

// ─── Main Schedule Builder ────────────────────────────────────────────────────
/**
 * Build a full daily plan for a user.
 * @param {string} userId
 * @param {Object} options
 * @param {Array}  options.tasks   - pending tasks
 * @param {Array}  options.habits  - active habits
 * @param {Object} options.user    - user profile (wake_time, sleep_time, work_start_time)
 * @param {boolean} options.includePrayers
 * @param {string} options.timezone
 * @returns {{ schedule: Array, stats: Object }}
 */
async function buildDailySchedule(userId, options = {}) {
  const {
    tasks          = [],
    habits         = [],
    user           = {},
    includePrayers = false,
    timezone       = 'Africa/Cairo',
  } = options;

  const todayStr    = new Date().toISOString().split('T')[0];
  const mlCtx       = getMLContext(userId);

  // Resolve day boundaries — support both wake_up_time (DB) and wake_time (legacy)
  const wakeTime    = timeToMins(user.wake_up_time || user.wake_time  || DEFAULT_WAKE_TIME);
  const sleepTime   = timeToMins(user.sleep_time   || DEFAULT_SLEEP_TIME);
  const workStart   = timeToMins(user.work_start_time || DEFAULT_WORK_START);

  // Reduce max hours if burnout risk is high
  const maxDailyMins = mlCtx.burnoutRisk > 0.7
    ? (MAX_DAILY_WORK_HRS - 2) * 60
    : MAX_DAILY_WORK_HRS * 60;

  // Build busy slots (prayers + fixed habits)
  const busySlots = buildBusySlots(includePrayers, habits);

  const schedule   = [];
  let scheduledMins = 0;
  let cursorMins   = Math.max(wakeTime, workStart);

  // ── Add prayer blocks first ──────────────────────────────────────────────
  if (includePrayers) {
    for (const p of PRAYER_BLOCKS) {
      const s = timeToMins(p.start);
      const e = timeToMins(p.end);
      if (s >= wakeTime && e <= sleepTime) {
        schedule.push({
          type      : 'prayer',
          title     : p.name,
          start_time: p.start,
          end_time  : p.end,
          confidence: 100,
          reason    : ['🕌 وقت الصلاة'],
          category  : 'personal',
        });
      }
    }
  }

  // ── Add habits with fixed times ──────────────────────────────────────────
  for (const h of habits) {
    if (h.preferred_time) {
      const s   = timeToMins(h.preferred_time);
      const dur = h.duration_minutes || 30;
      const e   = s + dur;
      if (s >= wakeTime && e <= sleepTime) {
        schedule.push({
          type      : 'habit',
          title     : `🔄 ${h.name_ar || h.name}`,
          start_time: minsToTime(s),
          end_time  : minsToTime(e),
          confidence: 85,
          reason    : ['📆 وقت ثابت للعادة'],
          habit_id  : h.id,
          category  : h.category,
        });
        scheduledMins += dur;
      }
    }
  }

  // ── Sort tasks by score (urgency + priority + ML) ────────────────────────
  // Normalize due_date to YYYY-MM-DD string for comparison
  const normDate = (d) => d ? (typeof d === 'string' ? d.split('T')[0] : new Date(d).toISOString().split('T')[0]) : null;

  const todayTasks = tasks.filter(t => {
    const due = normDate(t.due_date);
    return !due || due >= todayStr;
  });

  // ── Phase: Separate tasks with fixed times from those needing scheduling ──
  const fixedTimeTasks   = []; // tasks with explicit start_time — schedule at their actual time
  const flexibleTasks    = []; // tasks without start_time — AI assigns a slot

  for (const task of todayTasks) {
    if (task.start_time) {
      fixedTimeTasks.push(task);
    } else {
      flexibleTasks.push(task);
    }
  }

  // ── Schedule fixed-time tasks first (at their ACTUAL scheduled time) ──
  const moment = require('moment-timezone');
  for (const task of fixedTimeTasks) {
    const startMoment = moment(task.start_time).tz(timezone);
    const endMoment   = task.end_time ? moment(task.end_time).tz(timezone) : startMoment.clone().add(task.estimated_minutes || 60, 'minutes');
    const startStr    = startMoment.format('HH:mm');
    const endStr      = endMoment.format('HH:mm');
    const startM      = timeToMins(startStr);
    const endM        = timeToMins(endStr);
    const taskDur     = endM - startM;

    schedule.push({
      type      : 'task',
      title     : task.title,
      start_time: startStr,
      end_time  : endStr,
      confidence: 95,  // high confidence — user set this time explicitly
      reason    : ['📅 موعد محدد من المستخدم'],
      task_id   : task.id,
      priority  : task.priority,
      category  : task.category,
      due_date  : task.due_date,
      fixed_time: true,
    });

    // Mark as busy so flexible tasks don't overlap
    busySlots.push({ name: task.title, start: startM, end: endM + SLOT_BUFFER_MINS, type: 'task' });
    busySlots.sort((a, b) => a.start - b.start);
    scheduledMins += taskDur > 0 ? taskDur : 60;
  }

  // ── Sort flexible tasks by AI score ──────────────────────────────────────
  const sortedTasks = [...flexibleTasks].sort((a, b) =>
    scoreTask(b, mlCtx, todayStr) - scoreTask(a, mlCtx, todayStr)
  );

  // ── Schedule flexible tasks into free slots ──────────────────────────────
  let continuousMins = 0;

  for (const task of sortedTasks) {
    if (scheduledMins >= maxDailyMins) break;

    const taskDur = task.estimated_minutes || task.duration_minutes || task.estimated_duration || 60;

    // Insert break if continuous work too long
    if (continuousMins >= MAX_CONTINUOUS_MINS) {
      const breakStart = findNextFreeSlot(cursorMins, BREAK_MINS, busySlots, sleepTime);
      if (breakStart !== null) {
        schedule.push({
          type      : 'break',
          title     : '☕ استراحة قصيرة',
          start_time: minsToTime(breakStart),
          end_time  : minsToTime(breakStart + BREAK_MINS),
          confidence: 90,
          reason    : ['🧠 استرح لتحافظ على تركيزك'],
          category  : 'health',
        });
        cursorMins     = breakStart + BREAK_MINS + SLOT_BUFFER_MINS;
        continuousMins = 0;
      }
    }

    const slotStart = findNextFreeSlot(cursorMins, taskDur, busySlots, sleepTime);
    if (slotStart === null) continue; // no room

    const slotEnd = slotStart + taskDur;
    const confidence = buildConfidence(task, slotStart, mlCtx);
    const reason     = buildReason(task, slotStart, mlCtx);

    schedule.push({
      type      : 'task',
      title     : task.title,
      start_time: minsToTime(slotStart),
      end_time  : minsToTime(slotEnd),
      confidence,
      reason,
      task_id   : task.id,
      priority  : task.priority,
      category  : task.category,
      due_date  : task.due_date,
    });

    // Mark this slot as busy for next tasks
    busySlots.push({ name: task.title, start: slotStart, end: slotEnd + SLOT_BUFFER_MINS, type: 'task' });
    busySlots.sort((a, b) => a.start - b.start);

    scheduledMins  += taskDur;
    continuousMins += taskDur;
    cursorMins      = slotEnd + SLOT_BUFFER_MINS;
  }

  // ── Sort schedule by start time ──────────────────────────────────────────
  schedule.sort((a, b) => timeToMins(a.start_time) - timeToMins(b.start_time));

  // ── Add energy_required + why alias to each item ────────────────────────
  for (const item of schedule) {
    // Alias: why = reason (both kept for compatibility)
    item.why = item.reason || [];

    // energy_required based on priority + time of day
    if (item.type === 'task') {
      const hour = timeToMins(item.start_time) / 60;
      const isFocusHour = Math.abs(hour - mlCtx.bestFocusHour) <= 2;
      if (item.priority === 'urgent' || item.priority === 'high') {
        item.energy_required = isFocusHour ? 'high' : 'medium';
      } else if (item.priority === 'low') {
        item.energy_required = 'low';
      } else {
        item.energy_required = 'medium';
      }
    } else if (item.type === 'habit') {
      item.energy_required = 'low';
    } else if (item.type === 'break') {
      item.energy_required = 'none';
    } else {
      item.energy_required = 'low';
    }
  }

  // ── Build energy curve (hourly energy level 0-100) ──────────────────────
  const energyCurve = [];
  for (let h = 6; h <= 23; h++) {
    let energy = 60; // base
    // Peak at best focus hour ±2
    const distFromFocus = Math.abs(h - mlCtx.bestFocusHour);
    if (distFromFocus === 0) energy = 95;
    else if (distFromFocus === 1) energy = 85;
    else if (distFromFocus === 2) energy = 75;
    else if (distFromFocus <= 4) energy = 65;
    // Afternoon dip (13-15)
    if (h >= 13 && h <= 15) energy -= 15;
    // Evening decline
    if (h >= 20) energy -= 20;
    // Burnout penalty
    if (mlCtx.burnoutRisk > 0.6) energy = Math.round(energy * 0.75);
    energyCurve.push({ hour: `${String(h).padStart(2,'0')}:00`, energy: Math.max(20, Math.min(100, energy)) });
  }

  const focusScore = Math.max(0, Math.min(100, Math.round(
    70
    - (mlCtx.burnoutRisk * 30)
    + (mlCtx.completionBoost * 20)
    + (schedule.filter(s => s.type === 'task').length > 0 ? 10 : 0)
  )));

  const stats = {
    total_items    : schedule.length,
    tasks_scheduled: schedule.filter(s => s.type === 'task').length,
    total_work_hrs : (scheduledMins / 60).toFixed(1),
    best_focus_hour: mlCtx.bestFocusHour,
    burnout_risk   : mlCtx.burnoutRisk,
    focus_score    : focusScore,
    ml_enhanced    : getLearning() !== null,
    generated_at   : new Date().toISOString(),
  };

  logger.info(`[SCHEDULER] Built schedule for ${userId}: ${schedule.length} items, ${stats.total_work_hrs}h work, focus=${focusScore}`);

  return { schedule, timeline: schedule, energy_curve: energyCurve, focus_score: focusScore, stats };
}

// ─── Fetch & Build (DB-connected) ─────────────────────────────────────────────
/**
 * Full pipeline: fetch user data from DB → build schedule → return
 */
async function getDailyPlan(userId, timezone = 'Africa/Cairo') {
  try {
    const moment = require('moment-timezone');
    const models = getModels();
    const { Task, Habit, User } = models;

    if (!Task || !Habit) {
      logger.warn(`[SCHEDULER] Models not ready. Available: ${Object.keys(models).join(', ')}`);
      return { schedule: [], stats: { error: 'Models not ready' } };
    }

    const todayStr = moment().tz(timezone).format('YYYY-MM-DD');
    const { Op }   = require('sequelize');
    const cutoffDate = moment().tz(timezone).add(3, 'days').toDate();

    const [tasks, habits, user] = await Promise.all([
      Task.findAll({
        where: {
          user_id: userId,
          status : { [Op.in]: ['pending', 'in_progress'] },
          [Op.or]: [
            { due_date: null },
            { due_date: { [Op.lte]: cutoffDate } },
          ],
        },
        order: [['priority', 'ASC'], ['due_date', 'ASC']],
        limit: 20,
      }),
      Habit.findAll({
        where: { user_id: userId, is_active: true },
        limit: 10,
      }),
      User ? User.findByPk(userId, { attributes: ['wake_up_time', 'sleep_time', 'work_start_time', 'work_end_time'] }) : Promise.resolve(null),
    ]);

    // Check if user has prayers in their tasks for today
    logger.info(`[SCHEDULER] getDailyPlan: userId=${userId}, tasks=${tasks.length}, habits=${habits.length}`);

    // Convert Sequelize instances to plain objects
    const plainTasks  = tasks.map(t => t.toJSON ? t.toJSON() : t);
    const plainHabits = habits.map(h => h.toJSON ? h.toJSON() : h);

    const hasPrayers = plainTasks.some(t => {
      const dueStr = t.due_date ? new Date(t.due_date).toISOString().split('T')[0] : null;
      return /صلاة|فجر|ظهر|عصر|مغرب|عشاء/i.test(t.title || '') && dueStr === todayStr;
    });

    return await buildDailySchedule(userId, {
      tasks         : plainTasks,
      habits        : plainHabits,
      user          : user?.toJSON?.() || {},
      includePrayers: hasPrayers,
      timezone,
    });

  } catch (e) {
    logger.error('[SCHEDULER] getDailyPlan error:', e.message);
    return { schedule: [], stats: { error: e.message } };
  }
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  buildDailySchedule,
  getDailyPlan,
  getMLContext,
  timeToMins,
  minsToTime,
  scoreTask,
};
