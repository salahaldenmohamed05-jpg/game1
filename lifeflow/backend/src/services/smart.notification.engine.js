/**
 * Smart Notification Engine — Phase 6: External Execution Layer
 * ==============================================================
 * Transforms LifeFlow from an app-opening experience to an always-on system.
 * 
 * This engine runs the user's day even when they are outside the app:
 *   1. Context-Aware Nudges: behavior-based, delay-based, energy-based
 *   2. Smart Habit Reminders: streak-aware, time-contextual, loss-aversion
 *   3. Task Nudges: priority-weighted, deadline-proximity, procrastination-detection
 *   4. Focus Alerts: deep-work protection, distraction detection
 *   5. End-of-Day Reminders: reflection prompts, incomplete task warnings
 *   6. Comeback System: detects absence, sends warmth messages to returning users
 *   7. Procrastination Intervention: detects repeated skips, suggests alternatives
 * 
 * Rate Limits:
 *   - Max 8 notifications per user per day (increased from 3 for active system)
 *   - Cooldown per category: 90 minutes
 *   - Quiet hours: respects user's sleep_time–wake_up_time
 *   - Escalation: intensity increases with skip count
 */

'use strict';

const moment = require('moment-timezone');
const logger = require('../utils/logger');
const redis = require('./redis.persistence.service');

// ── Configuration ────────────────────────────────────────────────────────────
const MAX_DAILY_NOTIFICATIONS = 8;
const CATEGORY_COOLDOWN_MS = 90 * 60 * 1000; // 90 minutes per category
const NUDGE_SCHEDULE = {
  morning_kickoff:   { hour: 7, minute: 30 },
  mid_morning_check: { hour: 10, minute: 0 },
  lunch_reflection:  { hour: 13, minute: 0 },
  afternoon_push:    { hour: 15, minute: 30 },
  pre_evening_wrap:  { hour: 17, minute: 30 },
  evening_summary:   { hour: 20, minute: 30 },
  night_reflection:  { hour: 22, minute: 0 },
};

// ── Redis-backed tracking (Phase 7: replaces in-memory Maps) ─────────────────
// All state is now persisted in Redis with TTL-based expiry.
// Functions are async wrappers around redis.persistence.service.

async function getDailyCount(userId) {
  const state = await redis.getNotificationState(userId);
  return state.dailyCount || 0;
}

async function incrementCount(userId) {
  const state = await redis.getNotificationState(userId);
  state.dailyCount = (state.dailyCount || 0) + 1;
  state.lastSentTime = new Date().toISOString();
  await redis.setNotificationState(userId, state);
}

async function canSend(userId, category) {
  return redis.canSendNotification(userId, category, MAX_DAILY_NOTIFICATIONS);
}

async function markSent(userId, category) {
  await redis.incrementNotificationCount(userId, category);
  await redis.logEvent(userId, 'notification_sent', { category });
  await redis.incrementMetric('notifications_sent', userId);
}

async function trackSkip(userId, category) {
  await redis.addSkipEvent(userId, category);
}

async function trackActivity(userId) {
  await redis.trackUserActivity(userId);
}

// ── Quiet Hours Check ────────────────────────────────────────────────────────
function isQuietHours(user, tz) {
  const now = moment.tz(tz);
  const hour = now.hour();
  const sleepHour = parseInt((user.sleep_time || '23:00').split(':')[0]);
  const wakeHour = parseInt((user.wake_up_time || '07:00').split(':')[0]);
  
  if (sleepHour > wakeHour) {
    return hour >= sleepHour || hour < wakeHour;
  }
  return hour >= sleepHour && hour < wakeHour;
}

// ── Model Loaders ────────────────────────────────────────────────────────────
function getModels() {
  const m = {};
  try { m.User = require('../models/user.model'); } catch (_) {}
  try { m.Task = require('../models/task.model'); } catch (_) {}
  try { m.Habit = require('../models/habit.model').Habit; } catch (_) {}
  try { m.HabitLog = require('../models/habit.model').HabitLog; } catch (_) {}
  try { m.DayPlan = require('../models/day_plan.model'); } catch (_) {}
  try { m.Notification = require('../models/insight.model').Notification; } catch (_) {}
  try { m.MoodEntry = require('../models/mood.model'); } catch (_) {}
  try { m.ProductivityScore = require('../models/productivity_score.model'); } catch (_) {}
  try { m.EnergyLog = require('../models/energy_log.model'); } catch (_) {}
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION GENERATORS — Context-Aware Messages
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate morning kickoff notification
 * Craft a "start your day" message with today's plan preview
 */
async function generateMorningKickoff(userId, tz) {
  if (!canSend(userId, 'morning_kickoff')) return null;

  const { User, Task, Habit, HabitLog, DayPlan } = getModels();
  const { Op } = require('sequelize');

  try {
    const user = await User.findByPk(userId, { raw: true });
    if (!user || isQuietHours(user, tz)) return null;

    const name = user.name?.split(' ')[0] || 'صديقي';
    const today = moment.tz(tz).format('YYYY-MM-DD');

    const [tasks, habits, habitLogs, dayPlan] = await Promise.all([
      Task ? Task.findAll({
        where: { user_id: userId, status: { [Op.in]: ['pending', 'in_progress'] } },
        raw: true,
      }) : [],
      Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
      HabitLog ? HabitLog.findAll({ where: { user_id: userId, log_date: today }, raw: true }) : [],
      DayPlan ? DayPlan.findOne({ where: { user_id: userId, plan_date: today }, raw: true }) : null,
    ]);

    const overdue = tasks.filter(t => t.due_date && String(t.due_date).slice(0, 10) < today).length;
    const todayTasks = tasks.filter(t => !t.due_date || String(t.due_date).slice(0, 10) <= today);
    const completedHabits = habitLogs.filter(l => l.completed).length;
    const topHabitStreak = habits.reduce((max, h) => Math.max(max, h.current_streak || 0), 0);

    let message, title;
    const dayStarted = !!dayPlan;

    if (dayStarted) {
      title = `☀️ ${name}، يومك جاهز!`;
      message = `خطتك موجودة: ${todayTasks.length} مهمة${overdue > 0 ? ` (${overdue} متأخرة!)` : ''}. ${habits.length > 0 ? `${habits.length - completedHabits} عادة تنتظرك.` : ''} ابدأ الآن! 🚀`;
    } else {
      title = `🌟 صباح جديد يا ${name}!`;
      message = `عندك ${todayTasks.length} مهمة اليوم${overdue > 0 ? ` + ${overdue} متأخرة` : ''}. ${topHabitStreak >= 3 ? `🔥 سلسلتك ${topHabitStreak} يوم — لا تكسرها!` : 'ابدأ يومك واحصل على أول XP! ⚡'}`;
    }

    markSent(userId, 'morning_kickoff');
    return {
      user_id: userId,
      type: 'morning_kickoff',
      title,
      body: message,
      priority: 'high',
      channel: 'push',
      data: {
        category: 'morning_kickoff',
        tasks_count: todayTasks.length,
        overdue_count: overdue,
        habits_count: habits.length,
        day_started: dayStarted,
      },
      actions: [
        { action: 'start_day', title: dayStarted ? '📋 افتح الخطة' : '🚀 ابدأ يومك', url: '/?view=daily-flow' },
        { action: 'dismiss', title: 'لاحقاً' },
      ],
    };
  } catch (err) {
    logger.debug('[SMART-NOTIF] morning_kickoff error:', err.message);
    return null;
  }
}

/**
 * Generate context-aware task nudge
 * Detects: idle users, approaching deadlines, procrastination patterns
 */
async function generateTaskNudge(userId, tz) {
  if (!canSend(userId, 'task_nudge')) return null;

  const { User, Task, DayPlan } = getModels();
  const { Op } = require('sequelize');

  try {
    const user = await User.findByPk(userId, { raw: true });
    if (!user || isQuietHours(user, tz)) return null;

    const name = user.name?.split(' ')[0] || 'صديقي';
    const now = moment.tz(tz);
    const today = now.format('YYYY-MM-DD');
    const hour = now.hour();

    // Find the most urgent incomplete task
    const urgentTasks = await Task.findAll({
      where: {
        user_id: userId,
        status: { [Op.in]: ['pending', 'in_progress'] },
        due_date: { [Op.lte]: today },
      },
      order: [['priority', 'ASC'], ['due_date', 'ASC']],
      limit: 3,
      raw: true,
    });

    if (urgentTasks.length === 0) return null;

    const top = urgentTasks[0];
    const skipHistory = userSkipHistory.get(userId) || { count: 0, categories: {} };
    const isOverdue = top.due_date && String(top.due_date).slice(0, 10) < today;
    const rescheduleCount = top.reschedule_count || 0;

    let title, message;

    // Escalation based on context
    if (rescheduleCount >= 3) {
      // Procrastination intervention
      title = `⚠️ "${top.title}" — المرة ${rescheduleCount + 1}`;
      message = `${name}، هذه المهمة أُجّلت ${rescheduleCount} مرات. ممكن نقسّمها لخطوات أصغر؟ ابدأ بـ5 دقائق فقط.`;
    } else if (isOverdue) {
      title = `🔴 مهمة متأخرة: ${top.title}`;
      message = `${name}، "${top.title}" متأخرة! خلّصها الآن أو أعد جدولتها — المهم ما تضيع.`;
    } else if (hour >= 15 && urgentTasks.length >= 3) {
      title = `⏰ ${urgentTasks.length} مهام تنتظرك!`;
      message = `${name}، الوقت بيجري. ابدأ بـ"${top.title}" — 20 دقيقة وبس!`;
    } else {
      title = `📋 خطوتك التالية: ${top.title}`;
      message = `${name}، "${top.title}" جاهزة. ابدأها الآن واحصل على XP! ⚡`;
    }

    markSent(userId, 'task_nudge');
    return {
      user_id: userId,
      type: 'task_nudge',
      title,
      body: message,
      priority: isOverdue ? 'urgent' : 'medium',
      channel: 'push',
      data: {
        category: 'task_nudge',
        task_id: top.id,
        task_title: top.title,
        is_overdue: isOverdue,
        reschedule_count: rescheduleCount,
      },
      actions: [
        { action: 'complete_task', title: '✅ أنجزها', url: `/?view=daily-flow&task=${top.id}` },
        { action: 'reschedule', title: '📅 أجّلها', url: `/?view=tasks&edit=${top.id}` },
      ],
    };
  } catch (err) {
    logger.debug('[SMART-NOTIF] task_nudge error:', err.message);
    return null;
  }
}

/**
 * Generate habit reminder with streak awareness + loss aversion
 */
async function generateHabitReminder(userId, tz) {
  if (!canSend(userId, 'habit_reminder')) return null;

  const { User, Habit, HabitLog } = getModels();

  try {
    const user = await User.findByPk(userId, { raw: true });
    if (!user || isQuietHours(user, tz)) return null;

    const name = user.name?.split(' ')[0] || 'صديقي';
    const today = moment.tz(tz).format('YYYY-MM-DD');

    const [habits, logs] = await Promise.all([
      Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
      HabitLog ? HabitLog.findAll({ where: { user_id: userId, log_date: today }, raw: true }) : [],
    ]);

    const completedIds = new Set(logs.filter(l => l.completed).map(l => String(l.habit_id)));
    const pending = habits.filter(h => !completedIds.has(String(h.id)));

    if (pending.length === 0) return null;

    // Prioritize: highest streak first (loss aversion)
    pending.sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0));
    const top = pending[0];
    const streak = top.current_streak || 0;

    let title, message;

    if (streak >= 14) {
      // High-streak loss aversion
      title = `🔥 ${streak} يوم — لا تخسرها!`;
      message = `${name}، "${top.name}" — ${streak} يوم متتالي! أنت أصبحت شخص يلتزم بهذه العادة. لا تكسر السلسلة اليوم! ⚡`;
    } else if (streak >= 7) {
      title = `🔥 أسبوع كامل: ${top.name}`;
      message = `${name}، أسبوع من "${top.name}"! هذه هوية جديدة تبنيها — سجّل الآن! 💪`;
    } else if (streak >= 3) {
      title = `⭐ ${streak} أيام: ${top.name}`;
      message = `${name}، سلسلتك في "${top.name}" (${streak} أيام) — كل يوم يقرّبك لعادة دائمة!`;
    } else {
      title = `🔄 حان وقت: ${top.name}`;
      message = `${name}، "${top.name}" تنتظرك! سجّلها الآن واحصل على XP. ${pending.length > 1 ? `(+${pending.length - 1} عادات أخرى)` : ''}`;
    }

    markSent(userId, 'habit_reminder');
    return {
      user_id: userId,
      type: 'habit_reminder',
      title,
      body: message,
      priority: streak >= 7 ? 'high' : 'medium',
      channel: 'push',
      data: {
        category: 'habit_reminder',
        habit_id: top.id,
        habit_name: top.name,
        streak,
        pending_count: pending.length,
        quick_action: 'check_habit',
      },
      actions: [
        { action: 'check_habit', title: '✅ سجّل الآن', url: `/?view=habits&check=${top.id}` },
        { action: 'later', title: 'بعدين' },
      ],
    };
  } catch (err) {
    logger.debug('[SMART-NOTIF] habit_reminder error:', err.message);
    return null;
  }
}

/**
 * Generate focus alert during deep work sessions
 */
async function generateFocusAlert(userId, tz) {
  if (!canSend(userId, 'focus_alert')) return null;

  const { User, DayPlan } = getModels();

  try {
    const user = await User.findByPk(userId, { raw: true });
    if (!user || isQuietHours(user, tz)) return null;

    const name = user.name?.split(' ')[0] || 'صديقي';
    const today = moment.tz(tz).format('YYYY-MM-DD');

    const dayPlan = await DayPlan?.findOne({ where: { user_id: userId, plan_date: today }, raw: true });
    if (!dayPlan || !dayPlan.schedule) return null;

    const blocks = Array.isArray(dayPlan.schedule) ? dayPlan.schedule : [];
    const activeBlock = blocks.find(b => b.status === 'pending' && (b.type === 'focus' || b.type === 'task'));
    
    if (!activeBlock) return null;

    const completedCount = blocks.filter(b => b.status === 'completed').length;
    const progress = blocks.length > 0 ? Math.round((completedCount / blocks.length) * 100) : 0;

    let title, message;

    if (progress >= 70) {
      title = `🏁 ${name}، قربت تخلّص!`;
      message = `${progress}% من خطتك مكتملة! "${activeBlock.title}" هي اللي فاضلة — خلّصها وأنهي يوم مثالي! 🏆`;
    } else if (progress >= 40) {
      title = `💪 نص الطريق: ${activeBlock.title}`;
      message = `${name}، ${progress}% مكتمل. "${activeBlock.title}" هي الخطوة التالية — 25 دقيقة وبس!`;
    } else {
      title = `🎯 ركّز: ${activeBlock.title}`;
      message = `${name}، "${activeBlock.title}" جاهزة. شغّل وضع التركيز واحصل على +25 XP! ⚡`;
    }

    markSent(userId, 'focus_alert');
    return {
      user_id: userId,
      type: 'focus_alert',
      title,
      body: message,
      priority: 'medium',
      channel: 'push',
      data: {
        category: 'focus_alert',
        block_id: activeBlock.id,
        block_title: activeBlock.title,
        progress,
      },
      actions: [
        { action: 'start_focus', title: '🎯 ابدأ التركيز', url: '/?view=daily-flow' },
        { action: 'skip', title: 'تخطّي' },
      ],
    };
  } catch (err) {
    logger.debug('[SMART-NOTIF] focus_alert error:', err.message);
    return null;
  }
}

/**
 * Generate end-of-day reminder
 */
async function generateEndOfDayReminder(userId, tz) {
  if (!canSend(userId, 'end_of_day')) return null;

  const { User, Task, Habit, HabitLog, DayPlan } = getModels();
  const { Op } = require('sequelize');

  try {
    const user = await User.findByPk(userId, { raw: true });
    if (!user || isQuietHours(user, tz)) return null;

    const name = user.name?.split(' ')[0] || 'صديقي';
    const today = moment.tz(tz).format('YYYY-MM-DD');

    const [allTasks, habits, habitLogs, dayPlan] = await Promise.all([
      Task ? Task.findAll({ where: { user_id: userId }, raw: true }) : [],
      Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
      HabitLog ? HabitLog.findAll({ where: { user_id: userId, log_date: today }, raw: true }) : [],
      DayPlan ? DayPlan.findOne({ where: { user_id: userId, plan_date: today }, raw: true }) : null,
    ]);

    const completedToday = allTasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      return moment(t.completed_at).tz(tz).format('YYYY-MM-DD') === today;
    });
    const completedHabits = habitLogs.filter(l => l.completed).length;
    const pendingHabits = habits.length - completedHabits;

    let title, message;
    const isPerfectDay = completedToday.length > 0 && pendingHabits === 0;

    if (isPerfectDay) {
      title = `🏆 يوم مثالي يا ${name}!`;
      message = `أنجزت ${completedToday.length} مهمة + كل العادات! أنت بطل اليوم. سجّل تأملك المسائي واحصل على شارة اليوم المثالي! ⭐`;
    } else if (pendingHabits > 0) {
      title = `🌙 ${name}، ${pendingHabits} عادة تنتظرك`;
      message = `أنجزت ${completedToday.length} مهمة اليوم، بس ${pendingHabits} عادة لسه. سجّلها قبل ما تنام — 2 دقيقة بس! 💪`;
    } else {
      title = `🌙 وقت التأمل يا ${name}`;
      message = `أنهي يومك بتأمل قصير — إيه اللي تم إنجازه؟ إيه اللي ممكن يتحسّن بكرة؟`;
    }

    markSent(userId, 'end_of_day');
    return {
      user_id: userId,
      type: 'end_of_day_reminder',
      title,
      body: message,
      priority: pendingHabits > 0 ? 'high' : 'medium',
      channel: 'push',
      data: {
        category: 'end_of_day',
        completed_tasks: completedToday.length,
        completed_habits: completedHabits,
        pending_habits: pendingHabits,
        is_perfect_day: isPerfectDay,
      },
      actions: [
        { action: 'end_day', title: '📊 أنهي يومك', url: '/?view=daily-flow&stage=end' },
        { action: 'check_habits', title: `🔄 ${pendingHabits} عادة`, url: '/?view=habits' },
      ],
    };
  } catch (err) {
    logger.debug('[SMART-NOTIF] end_of_day error:', err.message);
    return null;
  }
}

/**
 * Generate comeback message for returning users
 */
async function generateComebackNudge(userId, tz) {
  if (!canSend(userId, 'comeback')) return null;

  const { User, Habit, Task } = getModels();
  const { Op } = require('sequelize');

  try {
    const user = await User.findByPk(userId, { raw: true });
    if (!user) return null;

    const name = user.name?.split(' ')[0] || 'صديقي';
    const lastActive = userAbsence.get(userId) || user.last_login;
    
    if (!lastActive) return null;

    const daysSinceActive = moment.tz(tz).diff(moment(lastActive), 'days');
    if (daysSinceActive < 2) return null; // Only trigger after 2+ days absence

    // Get what they're missing
    const habits = await Habit?.findAll({ where: { user_id: userId, is_active: true }, raw: true }) || [];
    const brokenStreaks = habits.filter(h => (h.current_streak || 0) > 0);

    let title, message;

    if (daysSinceActive >= 7) {
      title = `💙 ${name}، اشتقنالك!`;
      message = `${daysSinceActive} يوم بعيد. أهدافك لسه موجودة ومستنياك. ابدأ من جديد — حتى خطوة صغيرة مهمة! 🌱`;
    } else if (brokenStreaks.length > 0) {
      const topStreak = brokenStreaks.sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0))[0];
      title = `🔥 سلسلتك في خطر!`;
      message = `${name}، "${topStreak.name}" كانت ${topStreak.current_streak} يوم! لا تخسرها — سجّل اليوم واستعد. 💪`;
    } else {
      title = `👋 مرحباً ${name}!`;
      message = `يوم جديد وفرصة جديدة. عندك ${habits.length} عادة في انتظارك — ابدأ بأي واحدة!`;
    }

    markSent(userId, 'comeback');
    return {
      user_id: userId,
      type: 'comeback_nudge',
      title,
      body: message,
      priority: brokenStreaks.length > 0 ? 'high' : 'medium',
      channel: 'push',
      data: {
        category: 'comeback',
        days_absent: daysSinceActive,
        broken_streaks: brokenStreaks.length,
      },
      actions: [
        { action: 'start_day', title: '🚀 ابدأ من جديد', url: '/?view=daily-flow' },
        { action: 'view_habits', title: '🔄 عاداتي', url: '/?view=habits' },
      ],
    };
  } catch (err) {
    logger.debug('[SMART-NOTIF] comeback error:', err.message);
    return null;
  }
}

/**
 * Generate energy-drop intervention
 * Detects afternoon slump and suggests break/lighter tasks
 */
async function generateEnergyIntervention(userId, tz) {
  if (!canSend(userId, 'energy_intervention')) return null;

  const { User, DayPlan } = getModels();

  try {
    const user = await User.findByPk(userId, { raw: true });
    if (!user || isQuietHours(user, tz)) return null;

    const name = user.name?.split(' ')[0] || 'صديقي';
    const hour = moment.tz(tz).hour();
    const today = moment.tz(tz).format('YYYY-MM-DD');

    // Energy intervention only during known dip hours (2-4 PM)
    if (hour < 13 || hour > 16) return null;

    const skipHistory = userSkipHistory.get(userId) || { count: 0 };
    
    // Only trigger if user has been skipping blocks (sign of energy drop)
    if (skipHistory.count < 2) return null;

    const dayPlan = await DayPlan?.findOne({ where: { user_id: userId, plan_date: today }, raw: true });
    const blocks = dayPlan?.schedule ? (Array.isArray(dayPlan.schedule) ? dayPlan.schedule : []) : [];
    const skippedCount = blocks.filter(b => b.status === 'skipped').length;

    if (skippedCount < 2) return null;

    markSent(userId, 'energy_intervention');
    return {
      user_id: userId,
      type: 'energy_intervention',
      title: `😌 ${name}، خذ استراحة`,
      body: `لاحظت إنك تخطيت ${skippedCount} بلوك — ممكن طاقتك منخفضة. خذ 10 دقائق راحة ثم ارجع لمهمة خفيفة. جسمك يستحق! 💙`,
      priority: 'medium',
      channel: 'push',
      data: {
        category: 'energy_intervention',
        skipped_count: skippedCount,
        suggestion: 'take_break',
      },
      actions: [
        { action: 'take_break', title: '☕ استراحة 10 دقائق', url: '/?view=daily-flow' },
        { action: 'lighter_task', title: '📋 مهمة أخف', url: '/?view=tasks' },
      ],
    };
  } catch (err) {
    logger.debug('[SMART-NOTIF] energy_intervention error:', err.message);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN ENGINE — Scheduled Runner
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the smart notification engine for a specific user.
 * Called by scheduler at configured intervals.
 */
async function runForUser(userId, tz = 'Africa/Cairo', ioInstance = null) {
  const hour = moment.tz(tz).hour();
  const notifications = [];

  try {
    trackActivity(userId);

    // Morning: 7-9 AM
    if (hour >= 7 && hour <= 9) {
      const morning = await generateMorningKickoff(userId, tz);
      if (morning) notifications.push(morning);
    }

    // Mid-day task nudges: 10 AM - 5 PM
    if (hour >= 10 && hour <= 17) {
      const taskNudge = await generateTaskNudge(userId, tz);
      if (taskNudge) notifications.push(taskNudge);
    }

    // Habit reminders: 9 AM, 1 PM, 5 PM windows
    if ([9, 10, 13, 14, 17, 18].includes(hour)) {
      const habitReminder = await generateHabitReminder(userId, tz);
      if (habitReminder) notifications.push(habitReminder);
    }

    // Focus alerts: during work hours
    if (hour >= 9 && hour <= 18) {
      const focusAlert = await generateFocusAlert(userId, tz);
      if (focusAlert) notifications.push(focusAlert);
    }

    // Energy intervention: afternoon dip
    if (hour >= 13 && hour <= 16) {
      const energy = await generateEnergyIntervention(userId, tz);
      if (energy) notifications.push(energy);
    }

    // End-of-day: 8-10 PM
    if (hour >= 20 && hour <= 22) {
      const endOfDay = await generateEndOfDayReminder(userId, tz);
      if (endOfDay) notifications.push(endOfDay);
    }

    // Comeback: any time
    const comeback = await generateComebackNudge(userId, tz);
    if (comeback) notifications.push(comeback);

    // Persist and emit notifications
    const { Notification } = getModels();
    for (const notif of notifications) {
      try {
        if (Notification) {
          await Notification.create({
            user_id: notif.user_id,
            type: notif.type,
            title: notif.title,
            body: notif.body,
            priority: notif.priority,
            channel: notif.channel || 'push',
            data: notif.data,
            sent_at: new Date(),
            is_sent: true,
          });
        }

        // Emit via Socket.IO for real-time delivery
        if (ioInstance) {
          ioInstance.to(`user_${userId}`).emit('notification', notif);
          ioInstance.to(`user_${userId}`).emit('push_notification', {
            title: notif.title,
            body: notif.body,
            icon: '/favicon.ico',
            badge: '/favicon.ico',
            tag: `lifeflow-${notif.type}`,
            url: notif.actions?.[0]?.url || '/',
            actions: notif.actions,
            requireInteraction: notif.priority === 'high' || notif.priority === 'urgent',
            data: notif.data,
          });
        }
      } catch (saveErr) {
        logger.debug('[SMART-NOTIF] Failed to persist notification:', saveErr.message);
      }
    }

    if (notifications.length > 0) {
      logger.info(`[SMART-NOTIF] Sent ${notifications.length} notifications to user ${userId}`);
    }

    return notifications;
  } catch (err) {
    logger.error('[SMART-NOTIF] runForUser error:', err.message);
    return [];
  }
}

/**
 * Run engine for all active users
 */
async function runForAllUsers(ioInstance = null) {
  try {
    const { User } = getModels();
    if (!User) return;

    const users = await User.findAll({
      where: { is_active: true, notifications_enabled: true },
      attributes: ['id', 'timezone'],
      limit: 1000,
      raw: true,
    });

    logger.info(`[SMART-NOTIF] Running for ${users.length} users`);

    let totalSent = 0;
    for (const user of users) {
      try {
        const results = await runForUser(user.id, user.timezone || 'Africa/Cairo', ioInstance);
        totalSent += results.length;
      } catch (err) {
        logger.debug(`[SMART-NOTIF] Error for user ${user.id}:`, err.message);
      }
    }

    logger.info(`[SMART-NOTIF] Total notifications sent: ${totalSent}`);
  } catch (err) {
    logger.error('[SMART-NOTIF] runForAllUsers error:', err.message);
  }
}

module.exports = {
  runForUser,
  runForAllUsers,
  generateMorningKickoff,
  generateTaskNudge,
  generateHabitReminder,
  generateFocusAlert,
  generateEndOfDayReminder,
  generateComebackNudge,
  generateEnergyIntervention,
  trackSkip,
  trackActivity,
  // Expose for testing
  getDailyCount,
  canSend,
};
