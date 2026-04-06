/**
 * Cross-Day Intelligence — Phase 6: Weekly Narratives & Trend Detection
 * ========================================================================
 * Provides intelligence that spans across days:
 *   1. Weekly Narrative: story of the user's week (not just stats)
 *   2. Trend Detection: productivity trends, habit consistency, mood patterns
 *   3. Behavioral Reinforcement V2:
 *      - Loss-Aversion Streak Warnings
 *      - Comeback System for returning users
 *      - Perfect Day Badge
 *      - Weekly Achievements
 *   4. Predictive Insights: "if you continue like this..."
 */

'use strict';

const moment = require('moment-timezone');
const logger = require('../utils/logger');

function getModels() {
  const m = {};
  try { m.Task = require('../models/task.model'); } catch (_) {}
  try { m.Habit = require('../models/habit.model').Habit; } catch (_) {}
  try { m.HabitLog = require('../models/habit.model').HabitLog; } catch (_) {}
  try { m.MoodEntry = require('../models/mood.model'); } catch (_) {}
  try { m.DayPlan = require('../models/day_plan.model'); } catch (_) {}
  try { m.ProductivityScore = require('../models/productivity_score.model'); } catch (_) {}
  try { m.User = require('../models/user.model'); } catch (_) {}
  return m;
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEEKLY NARRATIVE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Generate a weekly narrative — a story of the user's week
 */
async function generateWeeklyNarrative(userId, tz = 'Africa/Cairo') {
  const { Task, Habit, HabitLog, MoodEntry, DayPlan, User } = getModels();
  const { Op } = require('sequelize');

  try {
    const user = await User?.findByPk(userId, { raw: true });
    const name = user?.name?.split(' ')[0] || 'صديقي';

    const weekStart = moment.tz(tz).startOf('isoWeek');
    const weekEnd = moment.tz(tz).endOf('isoWeek');
    const weekStartStr = weekStart.format('YYYY-MM-DD');
    const weekEndStr = weekEnd.format('YYYY-MM-DD');

    // Parallel data fetch
    const [tasks, habits, habitLogs, moods, dayPlans] = await Promise.all([
      Task ? Task.findAll({
        where: { user_id: userId, due_date: { [Op.between]: [weekStart.toDate(), weekEnd.toDate()] } },
        raw: true,
      }) : [],
      Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
      HabitLog ? HabitLog.findAll({
        where: { user_id: userId, log_date: { [Op.between]: [weekStartStr, weekEndStr] } },
        raw: true,
      }) : [],
      MoodEntry ? MoodEntry.findAll({
        where: { user_id: userId, entry_date: { [Op.between]: [weekStartStr, weekEndStr] } },
        order: [['entry_date', 'ASC']],
        raw: true,
      }) : [],
      DayPlan ? DayPlan.findAll({
        where: { user_id: userId, plan_date: { [Op.between]: [weekStartStr, weekEndStr] } },
        raw: true,
      }) : [],
    ]);

    // ── Task Analysis ────────────────────────────────────────────────────
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const totalTasks = tasks.length;
    const taskRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // ── Habit Analysis ───────────────────────────────────────────────────
    const habitDays = 7;
    const totalHabitSlots = habits.length * habitDays;
    const completedHabitLogs = habitLogs.filter(l => l.completed).length;
    const habitRate = totalHabitSlots > 0 ? Math.round((completedHabitLogs / totalHabitSlots) * 100) : 0;

    // Streak analysis
    const streakHabits = habits.filter(h => (h.current_streak || 0) >= 7);
    const longestStreak = habits.reduce((max, h) => Math.max(max, h.current_streak || 0), 0);

    // ── Mood Trend ───────────────────────────────────────────────────────
    const avgMood = moods.length > 0
      ? Math.round((moods.reduce((s, m) => s + m.mood_score, 0) / moods.length) * 10) / 10
      : null;
    const moodTrend = moods.length >= 3
      ? (moods[moods.length - 1].mood_score - moods[0].mood_score > 0 ? 'improving' : moods[moods.length - 1].mood_score - moods[0].mood_score < -1 ? 'declining' : 'stable')
      : 'insufficient_data';

    // ── Plan Consistency ─────────────────────────────────────────────────
    const daysWithPlan = dayPlans.length;
    const avgCompletion = dayPlans.length > 0
      ? Math.round((dayPlans.reduce((s, p) => s + (p.completion_rate || 0), 0) / dayPlans.length) * 100)
      : 0;

    // ── Perfect Days ─────────────────────────────────────────────────────
    const perfectDays = dayPlans.filter(p => (p.completion_rate || 0) >= 0.9).length;

    // ── Generate Narrative ───────────────────────────────────────────────
    let narrativeTitle, narrativeEmoji, narrativeBody;
    const overallScore = Math.round(taskRate * 0.3 + habitRate * 0.3 + avgCompletion * 0.4);

    if (overallScore >= 80) {
      narrativeEmoji = '🏆';
      narrativeTitle = `أسبوع استثنائي يا ${name}!`;
      narrativeBody = `أنجزت ${completedTasks} مهمة (${taskRate}%) وحافظت على عاداتك بنسبة ${habitRate}%. ${perfectDays > 0 ? `🌟 ${perfectDays} يوم مثالي!` : ''} استمر على هذا المستوى!`;
    } else if (overallScore >= 60) {
      narrativeEmoji = '⭐';
      narrativeTitle = `أسبوع ممتاز!`;
      narrativeBody = `${completedTasks}/${totalTasks} مهمة مكتملة، وعاداتك بنسبة ${habitRate}%. ${longestStreak >= 7 ? `🔥 سلسلتك الأطول ${longestStreak} يوم!` : 'كل أسبوع بتتحسن!'}`;
    } else if (overallScore >= 40) {
      narrativeEmoji = '💪';
      narrativeTitle = `أسبوع فيه جهد`;
      narrativeBody = `أنجزت ${completedTasks} مهمة وحافظت على بعض عاداتك. الأسبوع الجاي ممكن تركّز على عادة واحدة بس وتحافظ عليها.`;
    } else {
      narrativeEmoji = '🌱';
      narrativeTitle = `أسبوع صعب — بس انت لسه هنا!`;
      narrativeBody = `كان أسبوع فيه تحديات. مجرد إنك فاتح التطبيق ده إنجاز. الأسبوع الجاي ابدأ بخطوة واحدة صغيرة كل يوم.`;
    }

    // ── Trend Detection ──────────────────────────────────────────────────
    const trends = [];

    if (taskRate >= 70) {
      trends.push({ type: 'positive', area: 'tasks', message_ar: `إنتاجيتك ${taskRate}% — أعلى من المتوسط!`, icon: '📈' });
    } else if (taskRate < 40 && totalTasks > 0) {
      trends.push({ type: 'attention', area: 'tasks', message_ar: `إنتاجيتك ${taskRate}% — جرّب تقليل المهام اليومية`, icon: '📉' });
    }

    if (habitRate >= 80) {
      trends.push({ type: 'positive', area: 'habits', message_ar: `عاداتك ${habitRate}% — أنت شخص ملتزم! 🔥`, icon: '🔥' });
    } else if (habitRate < 50 && habits.length > 0) {
      trends.push({ type: 'attention', area: 'habits', message_ar: `عاداتك ${habitRate}% — ركّز على أهم 2 عادات فقط`, icon: '⚠️' });
    }

    if (moodTrend === 'declining') {
      trends.push({ type: 'concern', area: 'mood', message_ar: 'مزاجك بينخفض — خذ وقت لنفسك هالأسبوع', icon: '💙' });
    } else if (moodTrend === 'improving') {
      trends.push({ type: 'positive', area: 'mood', message_ar: 'مزاجك بيتحسن — استمر على نفس النمط!', icon: '😊' });
    }

    if (daysWithPlan < 4) {
      trends.push({ type: 'attention', area: 'planning', message_ar: `استخدمت خطة اليوم ${daysWithPlan} مرات بس — جرّب ابدأ يومك بخطة`, icon: '📋' });
    }

    // ── Achievements ─────────────────────────────────────────────────────
    const achievements = [];

    if (perfectDays > 0) {
      achievements.push({
        id: 'perfect_day',
        title_ar: `🏆 ${perfectDays} يوم مثالي`,
        description_ar: 'أنهيت يومك بإكمال أكثر من 90% من خطتك',
        count: perfectDays,
        badge: '🏆',
      });
    }

    if (longestStreak >= 7) {
      achievements.push({
        id: 'streak_week',
        title_ar: `🔥 سلسلة أسبوع`,
        description_ar: `${longestStreak} يوم متتالي — أنت ماكينة إنجاز!`,
        count: longestStreak,
        badge: '🔥',
      });
    }

    if (completedTasks >= 20) {
      achievements.push({
        id: 'task_machine',
        title_ar: '⚡ آلة إنجاز',
        description_ar: `أنجزت ${completedTasks} مهمة هالأسبوع!`,
        count: completedTasks,
        badge: '⚡',
      });
    }

    if (completedHabitLogs >= totalHabitSlots * 0.9 && totalHabitSlots > 0) {
      achievements.push({
        id: 'habit_master',
        title_ar: '🧘 سيد العادات',
        description_ar: `حافظت على عاداتك بنسبة ${habitRate}%!`,
        count: completedHabitLogs,
        badge: '🧘',
      });
    }

    return {
      user_id: userId,
      week: { start: weekStartStr, end: weekEndStr },
      narrative: {
        emoji: narrativeEmoji,
        title: narrativeTitle,
        body: narrativeBody,
        overall_score: overallScore,
      },
      stats: {
        tasks: { completed: completedTasks, total: totalTasks, rate: taskRate },
        habits: { completed: completedHabitLogs, total: totalHabitSlots, rate: habitRate, longest_streak: longestStreak, streak_habits: streakHabits.length },
        mood: { average: avgMood, trend: moodTrend, entries: moods.length },
        planning: { days_with_plan: daysWithPlan, avg_completion: avgCompletion },
        perfect_days: perfectDays,
      },
      trends,
      achievements,
      prediction: generatePrediction(overallScore, taskRate, habitRate, moodTrend),
    };
  } catch (err) {
    logger.error('[CROSS-DAY] generateWeeklyNarrative error:', err.message);
    return {
      user_id: userId,
      error: true,
      message: 'فشل في إنشاء السرد الأسبوعي',
    };
  }
}

/**
 * Generate predictive insight based on current trends
 */
function generatePrediction(overallScore, taskRate, habitRate, moodTrend) {
  if (overallScore >= 75) {
    return {
      type: 'positive',
      message_ar: 'لو استمريت بنفس المعدل، هتوصل لأهدافك أسرع 30% من المتوسط! 🚀',
      confidence: 0.8,
    };
  } else if (overallScore >= 50) {
    return {
      type: 'encouraging',
      message_ar: 'أنت في المسار الصحيح. زيادة عادة واحدة يومياً ممكن يرفع أداءك 20%.',
      confidence: 0.65,
    };
  } else if (moodTrend === 'declining') {
    return {
      type: 'concern',
      message_ar: 'مزاجك بينخفض مع أداء منخفض — خذ يوم راحة وابدأ من جديد بخطة بسيطة.',
      confidence: 0.7,
    };
  } else {
    return {
      type: 'restart',
      message_ar: 'الأسبوع اللي فات كان صعب. ابدأ الأسبوع الجديد بـ3 مهام وعادة واحدة فقط.',
      confidence: 0.6,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEHAVIORAL REINFORCEMENT V2
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check for streak warnings (loss aversion) — called daily
 */
async function checkStreakWarnings(userId, tz = 'Africa/Cairo') {
  const { Habit, HabitLog } = getModels();

  try {
    const today = moment.tz(tz).format('YYYY-MM-DD');
    const habits = await Habit?.findAll({ where: { user_id: userId, is_active: true }, raw: true }) || [];
    const logs = await HabitLog?.findAll({ where: { user_id: userId, log_date: today }, raw: true }) || [];

    const completedIds = new Set(logs.filter(l => l.completed).map(l => String(l.habit_id)));
    const warnings = [];

    for (const habit of habits) {
      if (completedIds.has(String(habit.id))) continue;

      const streak = habit.current_streak || 0;
      if (streak >= 7) {
        warnings.push({
          type: 'streak_at_risk',
          habit_id: habit.id,
          habit_name: habit.name,
          streak,
          severity: streak >= 30 ? 'critical' : streak >= 14 ? 'high' : 'medium',
          message_ar: streak >= 30
            ? `⚠️ "${habit.name}" — ${streak} يوم على المحك! لا تخسرها!`
            : streak >= 14
              ? `🔥 "${habit.name}" — ${streak} يوم! سجّل الآن!`
              : `⭐ "${habit.name}" — ${streak} يوم، استمر!`,
        });
      }
    }

    return warnings;
  } catch (err) {
    logger.debug('[CROSS-DAY] checkStreakWarnings error:', err.message);
    return [];
  }
}

/**
 * Check if today is a Perfect Day
 */
async function checkPerfectDay(userId, tz = 'Africa/Cairo') {
  const { Task, Habit, HabitLog, DayPlan } = getModels();
  const { Op } = require('sequelize');

  try {
    const today = moment.tz(tz).format('YYYY-MM-DD');

    const [tasks, habits, habitLogs, dayPlan] = await Promise.all([
      Task ? Task.findAll({ where: { user_id: userId }, raw: true }) : [],
      Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
      HabitLog ? HabitLog.findAll({ where: { user_id: userId, log_date: today, completed: true }, raw: true }) : [],
      DayPlan ? DayPlan.findOne({ where: { user_id: userId, plan_date: today }, raw: true }) : null,
    ]);

    const completedToday = tasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      return moment(t.completed_at).tz(tz).format('YYYY-MM-DD') === today;
    });

    const allHabitsComplete = habitLogs.length >= habits.length;
    const planCompletion = dayPlan ? (dayPlan.completion_rate || 0) : 0;
    const hasTasks = completedToday.length > 0;

    const isPerfectDay = allHabitsComplete && planCompletion >= 0.8 && hasTasks;

    return {
      is_perfect_day: isPerfectDay,
      score: Math.round((planCompletion * 100 + (allHabitsComplete ? 100 : 0) + (hasTasks ? 100 : 0)) / 3),
      criteria: {
        all_habits: allHabitsComplete,
        plan_80_percent: planCompletion >= 0.8,
        has_completed_tasks: hasTasks,
      },
      badge: isPerfectDay ? {
        id: 'perfect_day',
        title_ar: '🏆 يوم مثالي!',
        description_ar: `أكملت كل عاداتك و80%+ من خطتك وأنجزت ${completedToday.length} مهمة!`,
        earned_at: new Date().toISOString(),
      } : null,
    };
  } catch (err) {
    logger.debug('[CROSS-DAY] checkPerfectDay error:', err.message);
    return { is_perfect_day: false, score: 0, criteria: {}, badge: null };
  }
}

/**
 * Get comeback status for returning user
 */
async function getComebackStatus(userId, tz = 'Africa/Cairo') {
  const { User, Habit } = getModels();

  try {
    const user = await User?.findByPk(userId, { raw: true });
    if (!user || !user.last_login) return null;

    const daysSinceLogin = moment.tz(tz).diff(moment(user.last_login), 'days');
    if (daysSinceLogin < COMEBACK_ABSENCE_DAYS) return null;

    const habits = await Habit?.findAll({ where: { user_id: userId, is_active: true }, raw: true }) || [];
    const atRiskStreaks = habits.filter(h => (h.current_streak || 0) > 0);

    return {
      is_comeback: true,
      days_absent: daysSinceLogin,
      at_risk_streaks: atRiskStreaks.map(h => ({
        habit_name: h.name,
        streak: h.current_streak,
      })),
      welcome_message: daysSinceLogin >= 7
        ? `مرحباً بعودتك يا ${user.name?.split(' ')[0]}! 💙 ${daysSinceLogin} يوم — لكن كل يوم بداية جديدة!`
        : `${user.name?.split(' ')[0]}، رجعت! 💪 ${atRiskStreaks.length > 0 ? 'سلسلاتك لسه موجودة — سجّل اليوم!' : 'يلا نبدأ يوم جديد!'}`,
      recovery_plan: {
        step_1: 'ابدأ بعادة واحدة فقط',
        step_2: 'أكمل مهمة صغيرة (5 دقائق)',
        step_3: 'سجّل مزاجك',
      },
    };
  } catch (err) {
    logger.debug('[CROSS-DAY] getComebackStatus error:', err.message);
    return null;
  }
}

module.exports = {
  generateWeeklyNarrative,
  checkStreakWarnings,
  checkPerfectDay,
  getComebackStatus,
};
