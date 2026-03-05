/**
 * Weekly Life Audit Service
 * ==========================
 * Generates a comprehensive weekly audit with:
 * - Task & habit analysis
 * - Mood trend detection
 * - Energy pattern detection
 * - AI-generated improvement strategies
 * - Coach summary
 */

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

const getModels = () => ({
  Task:              require('../models/task.model'),
  Habit:             require('../models/habit.model'),
  MoodEntry:         require('../models/mood.model'),
  ProductivityScore: require('../models/productivity_score.model'),
  WeeklyAudit:       require('../models/weekly_audit.model'),
  User:              require('../models/user.model'),
});

// ─────────────────────────────────────────────────────────────────────────────
// GENERATE WEEKLY AUDIT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate or refresh the weekly audit for a user.
 * @param {string} userId
 * @param {string} weekStartStr  YYYY-MM-DD (Monday) — defaults to last Monday
 * @param {string} timezone
 */
async function generateWeeklyAudit(userId, weekStartStr = null, timezone = 'Africa/Cairo') {
  const { Task, Habit, MoodEntry, ProductivityScore, WeeklyAudit, User } = getModels();

  const tz        = timezone || 'Africa/Cairo';
  const weekStart = weekStartStr
    ? moment.tz(weekStartStr, tz).startOf('isoWeek')
    : moment.tz(tz).subtract(1, 'week').startOf('isoWeek');
  const weekEnd   = weekStart.clone().endOf('isoWeek');

  const weekStartDate = weekStart.format('YYYY-MM-DD');
  const weekEndDate   = weekEnd.format('YYYY-MM-DD');
  const weekStartUTC  = weekStart.toDate();
  const weekEndUTC    = weekEnd.toDate();

  try {
    const user = await User.findByPk(userId);

    // ── 1. Task Analysis ──────────────────────────────────────────────────────
    const tasks = await Task.findAll({
      where: {
        user_id:  userId,
        due_date: { [Op.between]: [weekStartUTC, weekEndUTC] },
      },
    });

    const totalTasks      = tasks.length;
    const completedTasks  = tasks.filter(t => t.status === 'completed').length;
    const overdueTasks    = tasks.filter(t =>
      t.status !== 'completed' && t.due_date && new Date(t.due_date) < weekEndUTC
    ).length;
    const rescheduledTasks = tasks.filter(t => (t.reschedule_count || 0) >= 2).length;
    const taskCompletionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // ── 2. Habit Analysis ─────────────────────────────────────────────────────
    const { habitStats } = await getWeeklyHabitStats(userId, weekStartUTC, weekEndUTC);

    // ── 3. Mood Analysis ──────────────────────────────────────────────────────
    const moodEntries = await MoodEntry.findAll({
      where: {
        user_id:    userId,
        createdAt: { [Op.between]: [weekStartUTC, weekEndUTC] },
      },
      order: [['createdAt', 'ASC']],
    });

    const moodAnalysis = analyzeMoodTrend(moodEntries);

    // ── 4. Performance Scores ─────────────────────────────────────────────────
    const scores = await ProductivityScore.findAll({
      where: {
        user_id:    userId,
        score_date: { [Op.between]: [weekStartDate, weekEndDate] },
      },
    });

    const avgProductivity = scores.length > 0
      ? Math.round(scores.reduce((s, r) => s + r.productivity_score, 0) / scores.length)
      : 0;
    const avgFocus = scores.length > 0
      ? Math.round(scores.reduce((s, r) => s + r.focus_score, 0) / scores.length)
      : 0;
    const avgConsistency = scores.length > 0
      ? Math.round(scores.reduce((s, r) => s + r.consistency_score, 0) / scores.length)
      : 0;

    // Compare with previous week
    const prevWeekStart = weekStart.clone().subtract(1, 'week').format('YYYY-MM-DD');
    const prevWeekEnd   = weekStart.clone().subtract(1, 'day').format('YYYY-MM-DD');
    const prevScores    = await ProductivityScore.findAll({
      where: {
        user_id:    userId,
        score_date: { [Op.between]: [prevWeekStart, prevWeekEnd] },
      },
    });
    const prevAvg     = prevScores.length > 0
      ? prevScores.reduce((s, r) => s + r.overall_score, 0) / prevScores.length
      : 0;
    const currAvg     = scores.length > 0
      ? scores.reduce((s, r) => s + r.overall_score, 0) / scores.length
      : 0;
    const weekScoreDelta = Math.round(currAvg - prevAvg);

    // ── 5. Patterns Detection ─────────────────────────────────────────────────
    const patterns = detectWeeklyPatterns(tasks, moodEntries, habitStats, scores);

    // ── 6. AI-Generated Improvement Strategies ────────────────────────────────
    const strategies = generateImprovementStrategies({
      taskCompletionRate,
      moodTrend: moodAnalysis.trend,
      habitCompletionRate: habitStats.completionRate,
      weekScoreDelta,
      patterns,
    });

    // ── 7. Coach Summary ──────────────────────────────────────────────────────
    const coachSummary    = buildCoachSummary(user?.name || 'المستخدم', {
      taskCompletionRate,
      avgMood: moodAnalysis.avgMood,
      habitCompletionRate: habitStats.completionRate,
      weekScoreDelta,
      patterns,
    });
    const topAchievement  = findTopAchievement(tasks, habitStats, moodAnalysis);
    const biggestChallenge = findBiggestChallenge(tasks, habitStats, moodAnalysis, patterns);

    // ── 8. Upsert Audit ───────────────────────────────────────────────────────
    const [audit] = await WeeklyAudit.upsert({
      user_id:    userId,
      week_start: weekStartDate,
      week_end:   weekEndDate,
      week_number: weekStart.isoWeek(),

      total_tasks:       totalTasks,
      completed_tasks:   completedTasks,
      overdue_tasks:     overdueTasks,
      rescheduled_tasks: rescheduledTasks,
      task_completion_rate: taskCompletionRate,

      total_habit_checkins:  habitStats.totalCheckins,
      habit_completion_rate: habitStats.completionRate,
      best_habit_streak:     habitStats.bestStreak,
      missed_habits:         habitStats.missedHabits,

      avg_mood:       moodAnalysis.avgMood,
      mood_trend:     moodAnalysis.trend,
      best_mood_day:  moodAnalysis.bestDay,
      worst_mood_day: moodAnalysis.worstDay,

      avg_productivity_score:  avgProductivity,
      avg_focus_score:         avgFocus,
      avg_consistency_score:   avgConsistency,
      week_score_vs_last_week: weekScoreDelta,

      improvement_strategies: strategies,
      patterns,
      coach_summary:    coachSummary,
      top_achievement:  topAchievement,
      biggest_challenge: biggestChallenge,
      is_read: false,
    });

    logger.info(`✅ Weekly audit generated for user ${userId} — week ${weekStartDate}`);
    return audit;

  } catch (error) {
    logger.error('Weekly audit generation error:', error.message);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET LATEST AUDIT
// ─────────────────────────────────────────────────────────────────────────────

async function getLatestAudit(userId) {
  const { WeeklyAudit } = getModels();
  return WeeklyAudit.findOne({
    where: { user_id: userId },
    order: [['week_start', 'DESC']],
  });
}

async function getAuditHistory(userId, limit = 8) {
  const { WeeklyAudit } = getModels();
  return WeeklyAudit.findAll({
    where: { user_id: userId },
    order: [['week_start', 'DESC']],
    limit,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function getWeeklyHabitStats(userId, start, end) {
  try {
    const { sequelize } = require('../config/database');
    const [logs] = await sequelize.query(
      `SELECT hl.*, h.name, h.current_streak
       FROM habit_logs hl
       JOIN habits h ON hl.habit_id = h.id
       WHERE h.user_id = ? AND hl.log_date BETWEEN ? AND ?`,
      { replacements: [userId, start, end] }
    );
    const completed = logs.filter(l => l.completed).length;
    const total     = logs.length;
    const bestStreak = logs.reduce((max, l) => Math.max(max, l.current_streak || 0), 0);

    // Habits with 0 completions this week
    const [habits] = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM habits WHERE user_id = ? AND is_active = 1`,
      { replacements: [userId] }
    );
    const totalHabits  = habits[0]?.cnt || 0;
    const activeHabitsDays = totalHabits * 7; // expected check-ins
    const missedHabits = Math.max(0, activeHabitsDays - completed);

    return {
      habitStats: {
        totalCheckins:  total,
        completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
        bestStreak,
        missedHabits,
      }
    };
  } catch {
    return { habitStats: { totalCheckins: 0, completionRate: 0, bestStreak: 0, missedHabits: 0 } };
  }
}

function analyzeMoodTrend(entries) {
  if (entries.length === 0) {
    return { avgMood: 0, trend: 'stable', bestDay: null, worstDay: null };
  }

  const avgMood = Math.round(
    (entries.reduce((s, e) => s + (e.mood_score || 5), 0) / entries.length) * 10
  ) / 10;

  // Day-by-day mood
  const dayMap = {};
  entries.forEach(e => {
    const day = moment(e.createdAt).format('dddd');
    if (!dayMap[day]) dayMap[day] = [];
    dayMap[day].push(e.mood_score || 5);
  });
  const dayAvgs = Object.entries(dayMap).map(([d, scores]) => ({
    day: d,
    avg: scores.reduce((s, v) => s + v, 0) / scores.length,
  }));
  dayAvgs.sort((a, b) => b.avg - a.avg);
  const bestDay  = dayAvgs[0]?.day || null;
  const worstDay = dayAvgs[dayAvgs.length - 1]?.day || null;

  // Trend: compare first half vs second half
  const half = Math.floor(entries.length / 2);
  if (entries.length >= 4) {
    const firstHalf  = entries.slice(0, half).reduce((s, e) => s + e.mood_score, 0) / half;
    const secondHalf = entries.slice(half).reduce((s, e) => s + e.mood_score, 0) / (entries.length - half);
    const diff = secondHalf - firstHalf;
    const trend = diff > 0.5 ? 'improving' : diff < -0.5 ? 'declining' : 'stable';
    return { avgMood, trend, bestDay, worstDay };
  }
  return { avgMood, trend: 'stable', bestDay, worstDay };
}

function detectWeeklyPatterns(tasks, moodEntries, habitStats, scores) {
  const patterns = {};

  // Late night work
  const lateNight = tasks.filter(t => {
    if (!t.completed_at) return false;
    const h = new Date(t.completed_at).getHours();
    return h >= 22 || h <= 4;
  });
  if (lateNight.length >= 3) patterns.late_night_work = lateNight.length;

  // Morning avoidance (tasks completed before 10am)
  const morningTasks = tasks.filter(t => {
    if (!t.completed_at) return false;
    return new Date(t.completed_at).getHours() < 10;
  });
  if (morningTasks.length === 0 && tasks.length > 3) patterns.morning_avoidance = true;

  // Overcommitment
  const highPriority = tasks.filter(t => t.priority === 'high' || t.priority === 'urgent');
  if (highPriority.length > tasks.length * 0.5 && tasks.length >= 5) patterns.overcommitment = highPriority.length;

  // Procrastination
  const rescheduled = tasks.filter(t => (t.reschedule_count || 0) >= 2);
  if (rescheduled.length > 0) patterns.procrastination = rescheduled.map(t => t.title);

  // Burnout risk
  const lowMoodDays = moodEntries.filter(e => e.mood_score <= 4).length;
  if (lowMoodDays >= 3 && highPriority.length >= 5) patterns.burnout_risk = true;

  // Score improvement
  if (scores.length >= 3) {
    const first = scores[0].overall_score;
    const last  = scores[scores.length - 1].overall_score;
    if (last > first + 10) patterns.improving = true;
    if (last < first - 10) patterns.declining = true;
  }

  return patterns;
}

function generateImprovementStrategies({ taskCompletionRate, moodTrend, habitCompletionRate, weekScoreDelta, patterns }) {
  const strategies = [];

  if (taskCompletionRate < 60) {
    strategies.push({
      type: 'task_management',
      title: 'تقليل المهام اليومية',
      description: 'حدّد 3 مهام أساسية فقط لكل يوم بدلاً من قائمة طويلة',
      priority: 'high',
      action: 'قلّل مهامك اليومية إلى 3-5 مهام وركّز على الأهم',
    });
  }

  if (moodTrend === 'declining') {
    strategies.push({
      type: 'wellbeing',
      title: 'تحسين الرفاهية',
      description: 'لاحظنا انخفاضاً في مزاجك هذا الأسبوع — الراحة مهمة للإنتاجية',
      priority: 'high',
      action: 'أضف 15 دقيقة من النشاط الجسدي أو التأمل يومياً',
    });
  }

  if (habitCompletionRate < 50) {
    strategies.push({
      type: 'habits',
      title: 'تبسيط العادات',
      description: 'تطبيق عادة واحدة بشكل منتظم أفضل من عشر عادات متقطعة',
      priority: 'medium',
      action: 'اختر عادتين فقط للتركيز عليهما هذا الأسبوع',
    });
  }

  if (patterns.late_night_work) {
    strategies.push({
      type: 'sleep',
      title: 'تنظيم وقت النوم',
      description: 'العمل الليلي يؤثر على جودة نومك وطاقتك في اليوم التالي',
      priority: 'medium',
      action: 'ضع حداً للعمل عند الساعة 10 مساءً',
    });
  }

  if (patterns.overcommitment) {
    strategies.push({
      type: 'planning',
      title: 'إعادة التخطيط',
      description: 'وضع الكثير من المهام العاجلة يرهق طاقتك',
      priority: 'high',
      action: 'راجع قائمة مهامك وأعد ترتيب الأولويات مع فريقك أو قائمتك',
    });
  }

  if (weekScoreDelta > 10) {
    strategies.push({
      type: 'motivation',
      title: 'حافظ على هذا الزخم',
      description: 'أداؤك تحسّن هذا الأسبوع — استمر في نفس النمط',
      priority: 'low',
      action: 'استمر في الروتين الذي يعمل معك وشاركه مع الآخرين',
    });
  }

  // Always give at least 1 strategy
  if (strategies.length === 0) {
    strategies.push({
      type: 'growth',
      title: 'تحديّ نفسك هذا الأسبوع',
      description: 'أضف مهمة تعليمية أو إبداعية لأسبوعك القادم',
      priority: 'low',
      action: 'اقرأ 10 صفحات أو تعلّم مهارة جديدة لمدة 20 دقيقة',
    });
  }

  return strategies.slice(0, 3); // max 3 strategies
}

function buildCoachSummary(name, { taskCompletionRate, avgMood, habitCompletionRate, weekScoreDelta, patterns }) {
  const firstName = name.split(' ')[0];
  let summary = `مرحباً ${firstName}! `;

  if (weekScoreDelta > 5) {
    summary += `أسبوع رائع — نقاط أدائك ارتفعت ${weekScoreDelta} درجة. `;
  } else if (weekScoreDelta < -5) {
    summary += `كان الأسبوع تحدياً — نقاطك انخفضت ${Math.abs(weekScoreDelta)} درجة، لكن هذه فرصة للتعلم. `;
  } else {
    summary += `أسبوع مستقر من حيث الأداء. `;
  }

  if (taskCompletionRate >= 80) {
    summary += `أتممت ${taskCompletionRate}% من مهامك — إنجاز ممتاز! `;
  } else if (taskCompletionRate >= 50) {
    summary += `أتممت ${taskCompletionRate}% من مهامك — هناك مجال للتحسين. `;
  } else {
    summary += `أتممت ${taskCompletionRate}% فقط من مهامك — حاول تقليل عدد المهام لزيادة التركيز. `;
  }

  if (avgMood >= 7) {
    summary += `مزاجك كان ممتازاً بمعدل ${avgMood}/10. `;
  } else if (avgMood >= 5) {
    summary += `مزاجك كان جيداً بمعدل ${avgMood}/10. `;
  } else {
    summary += `لاحظنا أن مزاجك كان منخفضاً بمعدل ${avgMood}/10 — اهتم براحتك أكثر. `;
  }

  if (patterns.burnout_risk) {
    summary += `⚠️ نلاحظ مؤشرات على الإرهاق — خذ استراحة حقيقية هذا الأسبوع.`;
  }

  return summary;
}

function findTopAchievement(tasks, habitStats, moodAnalysis) {
  if (tasks.filter(t => t.status === 'completed').length >= 10) {
    return 'أتممت 10 مهام أو أكثر هذا الأسبوع';
  }
  if (habitStats.bestStreak >= 7) {
    return `حافظت على سلسلة عادة لمدة ${habitStats.bestStreak} أيام`;
  }
  if (moodAnalysis.avgMood >= 8) {
    return `متوسط مزاجك الأسبوعي كان ${moodAnalysis.avgMood}/10`;
  }
  if (habitStats.completionRate >= 80) {
    return `أتممت ${habitStats.completionRate}% من عاداتك الأسبوعية`;
  }
  return 'واظبت على تتبع يومك بانتظام';
}

function findBiggestChallenge(tasks, habitStats, moodAnalysis, patterns) {
  if (patterns.procrastination?.length > 0) {
    return `تأجيل مهام متكرر: ${patterns.procrastination.slice(0, 2).join('، ')}`;
  }
  if (moodAnalysis.trend === 'declining') {
    return 'انخفاض تدريجي في المزاج خلال الأسبوع';
  }
  if (habitStats.completionRate < 40) {
    return 'صعوبة في الحفاظ على العادات بانتظام';
  }
  if (patterns.late_night_work) {
    return 'العمل في أوقات متأخرة من الليل';
  }
  return null;
}

module.exports = {
  generateWeeklyAudit,
  getLatestAudit,
  getAuditHistory,
};
