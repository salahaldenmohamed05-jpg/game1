/**
 * Insight Controller
 * ====================
 * يولد رؤى يومية وأسبوعية وتقارير سلوكية
 * Phase 2-9 Fix: All endpoints work without AI (local fallbacks provided)
 */

const { Op } = require('sequelize');
const { Insight } = require('../models/insight.model');
const Task = require('../models/task.model');
const { Habit, HabitLog } = require('../models/habit.model');
const MoodEntry = require('../models/mood.model');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

// Lazy-load AI service so insights still work without valid API keys
function getAiService() {
  try { return require('../ai/ai.service').aiService; } catch (_) { return null; }
}

// ── Local fallback summary generators (no AI required) ─────────────────────

function buildLocalDailySummary({ tasks, habits, mood, score, userName, today }) {
  const completed = tasks.completed;
  const total = tasks.total;
  const habitsDone = habits.completed;
  const habitsTotal = habits.total;
  const pending = total - completed;
  const moodText = mood ? ` مزاجك اليوم ${mood}/10.` : '';

  let opening = '';
  if (score >= 80) opening = '🌟 يوم رائع!';
  else if (score >= 50) opening = '💪 تقدم جيد اليوم.';
  else if (completed > 0) opening = '✅ بدأت بخطوات صحيحة.';
  else opening = '🌅 كل يوم فرصة جديدة.';

  const taskText = total === 0
    ? 'لا توجد مهام مجدولة اليوم.'
    : `أتممت ${completed} من ${total} مهمة${pending > 0 ? `، تبقى ${pending} مهمة` : ''}.`;
  const habitText = habitsTotal === 0
    ? ''
    : ` وأكملت ${habitsDone} من ${habitsTotal} عادة.`;

  const summary = `${opening} ${taskText}${habitText}${moodText} نسبة إنتاجيتك ${score}%.`;

  const recs = [];
  if (pending > 0) recs.push(`لديك ${pending} مهمة معلقة — حاول إنجازها قبل نهاية اليوم.`);
  if (habitsDone < habitsTotal) recs.push('حاول إكمال عاداتك اليومية للحفاظ على مسارك.');
  if (!mood) recs.push('سجّل مزاجك اليوم لتحسين تتبع إنتاجيتك.');
  if (recs.length === 0) recs.push('استمر في هذا الأداء الممتاز! 🎯');

  return { summary, recommendations: recs };
}

function buildLocalWeeklyReport(weeklyData) {
  const { tasks, habits, mood } = weeklyData;
  const rate = parseFloat(tasks.completion_rate) || 0;
  const habitRate = parseFloat(habits.consistency_rate) || 0;

  const report = `📊 تقرير الأسبوع: أنجزت ${tasks.completed} من ${tasks.total} مهمة (${rate}%). ` +
    `معدل الالتزام بالعادات ${habitRate}%.` +
    (mood.average ? ` متوسط مزاجك ${mood.average}/10.` : '');

  const recs = [];
  if (rate < 50) recs.push('حاول تقليل عدد المهام الأسبوعية لتحسين معدل الإنجاز.');
  if (habitRate < 60) recs.push('ركّز على الحفاظ على عاداتك الأساسية أولاً.');
  if (mood.entries === 0) recs.push('سجّل مزاجك يومياً للحصول على رؤى أدق.');
  if (recs.length === 0) recs.push('أسبوع ممتاز! واصل هذا المستوى. 🌟');

  return { report, recommendations: recs };
}

function buildLocalBehaviorAnalysis(behaviorData) {
  return {
    summary: `معدل إنجاز المهام: ${behaviorData.task_completion_rate}%، ` +
      `حالات التسويف: ${behaviorData.procrastination_patterns}.`,
    insight: 'استمر في تتبع مهامك وعاداتك للحصول على تحليل أعمق.',
  };
}

function buildLocalProductivityTips(user) {
  return [
    { tip: 'ابدأ يومك بأصعب مهمة (أكل الضفدع) لتوفير طاقتك لبقية اليوم.', priority: 'high' },
    { tip: 'خصّص كتل زمنية (Timeblocking) بدلاً من قوائم مهام مفتوحة.', priority: 'high' },
    { tip: 'احتفل بإنجازاتك الصغيرة لتعزيز الدافعية.', priority: 'medium' },
    { tip: 'راجع مهامك كل مساء للتخطيط الجيد لليوم التالي.', priority: 'medium' },
  ];
}

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
        period_start: { [Op.gte]: moment().tz(timezone).startOf('day').format('YYYY-MM-DD') },
      },
    });

    if (!insight) {
      // Gather today's data — Phase O: use analytics.service.js for accurate counts
      let analyticsData = null;
      try {
        const analytics = require('../services/analytics.service');
        analyticsData = await analytics.getDailyInsightData(req.user.id, timezone);
      } catch (_e) { /* fallback below */ }

      const [tasks, habitLogs, moodEntry] = await Promise.all([
        Task.findAll({ where: { user_id: req.user.id,
          due_date: { [Op.between]: [`${today}T00:00:00`, `${today}T23:59:59`] },
        }}),
        HabitLog.findAll({ where: { user_id: req.user.id, log_date: today } }),
        MoodEntry.findOne({ where: { user_id: req.user.id, entry_date: today } }),
      ]);

      const completedTasks = tasks.filter(t => t.status === 'completed').length;
      const completedHabits = habitLogs.filter(l => l.completed).length;

      // Use analytics data if available (accurate), else fallback
      const insightTasks = analyticsData?.tasks ?? { total: tasks.length, completed: completedTasks };
      const insightHabits = analyticsData?.habits ?? { total: habitLogs.length, completed: completedHabits };
      const insightMood = analyticsData?.mood ?? (moodEntry?.mood_score || null);
      const insightScore = analyticsData?.productivity_score ?? calculateProductivityScore(tasks, habitLogs, moodEntry);

      // Generate AI summary — fall back to local if AI unavailable
      let summaryContent, summaryRecs;
      try {
        const aiService = getAiService();
        if (!aiService) throw new Error('AI service not available');
        const aiSummary = await aiService.generateDailySummary({
          user: req.user, date: today,
          tasks: insightTasks, habits: insightHabits, mood: moodEntry,
        });
        summaryContent = aiSummary.summary;
        summaryRecs    = aiSummary.recommendations;
      } catch (_aiErr) {
        // P2-9 Fix: Local fallback — no AI required
        const local = buildLocalDailySummary({
          tasks: insightTasks, habits: insightHabits,
          mood: insightMood, score: insightScore,
          userName: req.user.name, today,
        });
        summaryContent = local.summary;
        summaryRecs    = local.recommendations;
        logger.info('[Insights] Daily summary generated locally (AI unavailable)');
      }

      insight = await Insight.create({
        user_id: req.user.id,
        type: 'daily_summary',
        title: `ملخص يوم ${moment(today).locale('ar').format('dddd، D MMMM YYYY')}`,
        content: summaryContent,
        data: {
          tasks: insightTasks,
          habits: insightHabits,
          mood: insightMood,
          productivity_score: insightScore,
        },
        recommendations: summaryRecs,
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

      let reportContent, reportRecs;
      try {
        const aiService = getAiService();
        if (!aiService) throw new Error('AI service not available');
        const aiReport = await aiService.generateWeeklyReport({ user: req.user, ...weeklyData });
        reportContent = aiReport.report;
        reportRecs    = aiReport.recommendations;
      } catch (_aiErr) {
        const local = buildLocalWeeklyReport(weeklyData);
        reportContent = local.report;
        reportRecs    = local.recommendations;
        logger.info('[Insights] Weekly report generated locally (AI unavailable)');
      }

      report = await Insight.create({
        user_id: req.user.id,
        type: 'weekly_report',
        title: `تقرير الأسبوع: ${moment(weekStart).format('D MMM')} - ${moment(weekEnd).format('D MMM YYYY')}`,
        content: reportContent,
        data: weeklyData,
        recommendations: reportRecs,
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
          { due_date: { [Op.gte]: thirtyDaysAgo } },
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

    try {
      const aiService = getAiService();
      if (!aiService) throw new Error('AI service not available');
      const aiAnalysis = await aiService.analyzeBehavior(behaviorData, req.user);
      behaviorData.ai_analysis = aiAnalysis;
    } catch (_aiErr) {
      behaviorData.ai_analysis = buildLocalBehaviorAnalysis(behaviorData);
      logger.info('[Insights] Behavior analysis generated locally (AI unavailable)');
    }

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
    let tips;
    try {
      const aiService = getAiService();
      if (!aiService) throw new Error('AI service not available');
      const result = await aiService.getProductivityTips(req.user);
      // Normalize: AI may return { tips: [...] } or directly an array
      tips = Array.isArray(result) ? result : (result?.tips || buildLocalProductivityTips(req.user));
    } catch (_aiErr) {
      tips = buildLocalProductivityTips(req.user);
      logger.info('[Insights] Productivity tips generated locally (AI unavailable)');
    }
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
