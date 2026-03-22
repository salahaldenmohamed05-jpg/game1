/**
 * Smart Coaching Service
 * =======================
 * Generates daily micro-feedback, motivational nudges,
 * and behavior-based coaching messages.
 * Adapts tone based on user's AI personality setting.
 */

const { Op } = require('sequelize');
const moment = require('moment-timezone');
const logger = require('../utils/logger');

const getModels = () => ({
  User:              require('../models/user.model'),
  ProductivityScore: require('../models/productivity_score.model'),
  BehavioralFlag:    require('../models/behavioral_flag.model'),
  MoodEntry:         require('../models/mood.model'),
  WeeklyAudit:       require('../models/weekly_audit.model'),
});

// ─────────────────────────────────────────────────────────────────────────────
// DAILY COACHING MESSAGE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate personalized daily coaching message.
 * @param {string} userId
 * @param {string} timezone
 * @returns {{ message, type, actions, tone }}
 */
async function getDailyCoaching(userId, timezone = 'Africa/Cairo') {
  const { User, ProductivityScore, BehavioralFlag, MoodEntry, WeeklyAudit } = getModels();
  const tz       = timezone || 'Africa/Cairo';
  const today    = moment.tz(tz).format('YYYY-MM-DD');
  const hour     = moment.tz(tz).hour();

  try {
    const user      = await User.findByPk(userId);
    const name      = user?.name?.split(' ')[0] || 'صديقي';
    const aiTone    = user?.ai_personality || 'friendly';
    const greeting  = getTimeGreeting(hour);

    // Load recent data
    const [recentScores, activeFlags, todayMoods, latestAudit] = await Promise.all([
      ProductivityScore.findAll({
        where: { user_id: userId },
        order: [['score_date', 'DESC']],
        limit: 7,
      }),
      BehavioralFlag.findAll({
        where: { user_id: userId, is_resolved: false, is_dismissed: false },
        order: [['severity', 'DESC']],
        limit: 5,
      }),
      MoodEntry.findAll({
        where: {
          user_id: userId,
          entry_date: moment.tz(today, tz).format('YYYY-MM-DD'),
        },
        limit: 1,
      }),
      WeeklyAudit.findOne({
        where: { user_id: userId },
        order: [['week_start', 'DESC']],
      }),
    ]);

    // Determine context
    const latestScore    = recentScores[0];
    const avgScore7d     = recentScores.length > 0
      ? recentScores.reduce((s, r) => s + r.overall_score, 0) / recentScores.length
      : 50;
    const scoreTrend     = getScoreTrend(recentScores);
    const hasMoodToday   = todayMoods.length > 0;
    const criticalFlags  = activeFlags.filter(f => f.severity === 'critical' || f.severity === 'high');
    const topFlag        = criticalFlags[0] || activeFlags[0];

    // Build coaching response
    const context = {
      name, greeting, hour, aiTone,
      latestScore, avgScore7d, scoreTrend,
      hasMoodToday, topFlag, latestAudit,
      recentScores,
    };

    return buildCoachingMessage(context);

  } catch (error) {
    logger.error('Daily coaching error:', error.message);
    return getDefaultMessage(userId, timezone);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGE BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildCoachingMessage(ctx) {
  const { name, greeting, hour, aiTone, latestScore, avgScore7d, scoreTrend, hasMoodToday, topFlag, latestAudit } = ctx;

  const messages = [];
  const actions  = [];
  let type = 'motivational';

  // ── Morning (5–11): Energize ──────────────────────────────────────────────
  if (hour >= 5 && hour <= 11) {
    type = 'morning';
    messages.push(`${greeting}، ${name}! 🌟`);

    if (scoreTrend === 'improving') {
      messages.push(getToneMessage(aiTone, {
        friendly:     `أداؤك في تصاعد مستمر — استمر في هذا الزخم الرائع!`,
        motivational: `أنت على المسار الصحيح تماماً! كل يوم أفضل من السابق.`,
        direct:       `أداؤك يتحسن. ركّز على مهامك الكبيرة أولاً.`,
        analytical:   `تحسّن ملحوظ بمعدل ${Math.abs(latestScore?.score_delta || 0).toFixed(1)} نقطة. حافظ على النمط.`,
      }));
    } else if (scoreTrend === 'declining') {
      messages.push(getToneMessage(aiTone, {
        friendly:     `لاحظت أن أداءك تراجع قليلاً — لكن اليوم فرصة جديدة! ابدأ بمهمة صغيرة.`,
        motivational: `كل يوم جديد فرصة للبداية من جديد! دعنا نجعل هذا اليوم مميزاً.`,
        direct:       `أداؤك انخفض. حدد أهم 3 مهام وأتمها.`,
        analytical:   `انخفاض ${Math.abs(latestScore?.score_delta || 0).toFixed(1)} نقطة مقارنة بالأمس. ركّز على معدل إتمام المهام.`,
      }));
    } else {
      messages.push(getToneMessage(aiTone, {
        friendly:     `يوم جديد، إمكانيات جديدة! ما هي أهم مهمة ستنجزها اليوم؟`,
        motivational: `الفائزون يبدؤون يومهم بنية واضحة — ما هدفك اليوم؟`,
        direct:       `ما أهم 3 مهام لإنجازها اليوم؟`,
        analytical:   `متوسط أدائك 7 أيام: ${avgScore7d.toFixed(0)}/100. ابدأ بالمهام عالية الأولوية.`,
      }));
    }

    actions.push({ label: 'ابدأ يومك', action: 'open_tasks' });
    if (!hasMoodToday) {
      actions.push({ label: 'سجّل مزاجك الصباحي', action: 'log_mood' });
    }
  }

  // ── Afternoon (12–17): Check-in ───────────────────────────────────────────
  else if (hour >= 12 && hour <= 17) {
    type = 'checkin';
    messages.push(`كيف يسير يومك يا ${name}؟`);

    if (topFlag?.flag_type === 'procrastination') {
      messages.push(getToneMessage(aiTone, {
        friendly:     `لاحظت أن مهمة "${topFlag.entity_title}" تنتظر منذ فترة — هل يمكنك تخصيص 25 دقيقة لها الآن؟`,
        motivational: `المهمة الصعبة لن تختفي من تلقاء نفسها! 25 دقيقة تركيز الآن ستريحك كثيراً.`,
        direct:       `أتمم "${topFlag.entity_title}" الآن. 25 دقيقة كافية.`,
        analytical:   `"${topFlag.entity_title}" مؤجلة ${topFlag.occurrence_count} مرات. بدء الآن يزيد معدل الإتمام 43%.`,
      }));
      type = 'nudge';
    } else {
      messages.push(getToneMessage(aiTone, {
        friendly:     `نصف اليوم مضى — تذكّر أن تأخذ استراحة قصيرة وتشرب ماءً.`,
        motivational: `استراحة 10 دقائق ترفع إنتاجيتك 30% في النصف الثاني من اليوم!`,
        direct:       `خذ استراحة الآن، ثم استكمل مهامك.`,
        analytical:   `دراسات تُظهر أن 17 دقيقة راحة لكل 52 دقيقة عمل هي النسبة المثلى.`,
      }));
    }

    actions.push({ label: 'راجع مهامي', action: 'open_tasks' });
    actions.push({ label: 'سجّل مزاجي', action: 'log_mood' });
  }

  // ── Evening (18–22): Reflect ──────────────────────────────────────────────
  else if (hour >= 18 && hour <= 22) {
    type = 'evening';
    messages.push(`مساء الخير يا ${name}! 🌙`);

    if (latestScore?.overall_score >= 70) {
      messages.push(getToneMessage(aiTone, {
        friendly:     `يوم رائع! حصلت على ${latestScore.overall_score}/100 — أنت تستحق الراحة.`,
        motivational: `${latestScore.overall_score}/100! أداء ممتاز. خذ لحظة للاحتفال بما أتممت.`,
        direct:       `نقاط اليوم: ${latestScore.overall_score}/100. مقبول.`,
        analytical:   `درجة اليوم: ${latestScore.overall_score}/100. مهام: ${latestScore.task_completion_rate}%، عادات: ${latestScore.habit_completion_rate}%.`,
      }));
    } else {
      messages.push(getToneMessage(aiTone, {
        friendly:     `كل يوم تعلم فيه شيئاً هو يوم ناجح. ما الذي تعلمته اليوم؟`,
        motivational: `"النجاح ليس نهائياً، والفشل ليس قاتلاً — ما يهم هو الشجاعة على الاستمرار."`,
        direct:       `راجع مهام اليوم وضع خطة لغد أفضل.`,
        analytical:   `فرصة للتحسين: عزّز معدل إتمام المهام (حالياً ${latestScore?.task_completion_rate || 0}%).`,
      }));
    }

    actions.push({ label: 'راجع يومي', action: 'view_today_summary' });
    actions.push({ label: 'خطط لغد', action: 'plan_tomorrow' });
  }

  // ── Night (23–4): Wind down ───────────────────────────────────────────────
  else {
    type = 'winddown';
    messages.push(`وقت الراحة يا ${name}! 😴`);
    messages.push(getToneMessage(aiTone, {
      friendly:     `الدماغ يحتاج للنوم ليعالج كل ما تعلمته اليوم ويجدد طاقته.`,
      motivational: `النوم المبكر هو أهم استثمار في إنتاجيتك الغد.`,
      direct:       `أغلق الأجهزة ونم. الغد مهام جديدة.`,
      analytical:   `7-8 ساعات نوم ترفع الإنتاجية 20% وتحسّن التركيز 40%.`,
    }));
    actions.push({ label: 'جدول مهام الغد', action: 'schedule_tomorrow' });
  }

  return {
    type,
    message:    messages.join(' '),
    actions,
    tone:       aiTone,
    score:      latestScore?.overall_score,
    trend:      ctx.scoreTrend,
    flagged:    topFlag ? { type: topFlag.flag_type, task: topFlag.entity_title } : null,
    timestamp:  new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BEHAVIOR NUDGE (triggered by events)
// ─────────────────────────────────────────────────────────────────────────────

async function getBehaviorNudge(userId, eventType, eventData = {}) {
  const { User } = getModels();
  const user   = await User.findByPk(userId);
  const aiTone = user?.ai_personality || 'friendly';
  const name   = user?.name?.split(' ')[0] || 'صديقي';

  const nudges = {
    task_completed: {
      friendly:     `أحسنت! "${eventData.title}" تمت. استمر! 🎉`,
      motivational: `مهمة أخرى تُنجز! الزخم بيدك الآن.`,
      direct:       `تمت. التالية؟`,
      analytical:   `+1 مهمة مكتملة. معدل الإتمام اليومي يرتفع.`,
    },
    task_overdue: {
      friendly:     `"${eventData.title}" تأخرت قليلاً — لا بأس! هل يمكنك البدء بها الآن؟`,
      motivational: `التأخر لا يعني الفشل! ابدأ "${eventData.title}" الآن.`,
      direct:       `"${eventData.title}" متأخرة. ابدأها الآن.`,
      analytical:   `تأخير "${eventData.title}" 24ساعة+ يؤثر على درجة الاتساق.`,
    },
    habit_streak: {
      friendly:     `🔥 سلسلة ${eventData.streak} أيام لعادة "${eventData.habit}"! رائع!`,
      motivational: `${eventData.streak} أيام متواصلة! لا تكسر هذه السلسلة!`,
      direct:       `سلسلة ${eventData.streak}. حافظ عليها.`,
      analytical:   `سلسلة ${eventData.streak} أيام تعني عادة راسخة بنسبة ${Math.min(99, eventData.streak * 3)}%.`,
    },
    mood_low: {
      friendly:     `لاحظت أن مزاجك منخفض — هل تحتاج لاستراحة؟ أنت مهم.`,
      motivational: `الأيام الصعبة تبني القوة. خذ استراحة وعُد بطاقة أقوى.`,
      direct:       `مزاج منخفض = خذ استراحة 30 دقيقة.`,
      analytical:   `مزاج ≤3/10 يرتبط بانخفاض 28% في الإنتاجية. الراحة ضرورة.`,
    },
  };

  const nudge = nudges[eventType];
  if (!nudge) return null;

  return {
    message:  getToneMessage(aiTone, nudge),
    type:     eventType,
    tone:     aiTone,
    user:     name,
    timestamp: new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function getTimeGreeting(hour) {
  if (hour >= 5  && hour < 12) return 'صباح الخير';
  if (hour >= 12 && hour < 17) return 'مساء الخير';
  if (hour >= 17 && hour < 21) return 'مساء النور';
  return 'مرحباً';
}

function getToneMessage(tone, options) {
  return options[tone] || options.friendly;
}

function getScoreTrend(scores) {
  if (scores.length < 3) return 'stable';
  const recent = scores.slice(0, 3);
  const deltas = recent.map(s => s.score_delta || 0);
  const avgDelta = deltas.reduce((s, v) => s + v, 0) / deltas.length;
  if (avgDelta > 3)  return 'improving';
  if (avgDelta < -3) return 'declining';
  return 'stable';
}

function getDefaultMessage(userId, timezone) {
  return {
    type: 'motivational',
    message: 'مرحباً! ابدأ يومك بمهمة واحدة صغيرة — الزخم يبدأ بخطوة.',
    actions: [{ label: 'افتح المهام', action: 'open_tasks' }],
    tone: 'friendly',
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  getDailyCoaching,
  getBehaviorNudge,
};

// ─────────────────────────────────────────────────────────────────────────────
// AI LIFE COACH INSIGHTS  (Phase 9 addition)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Generate comprehensive AI life-coach insight report:
 *   - Behavior pattern analysis (last 14 days)
 *   - Life balance recommendations
 *   - Burnout early warning
 *   - Habit improvement suggestions
 *   - Weekly growth highlights
 */
async function getCoachInsights(userId, timezone = 'Africa/Cairo') {
  const {
    User, ProductivityScore, BehavioralFlag, MoodEntry, WeeklyAudit,
  } = getModels();
  const Task    = require('../models/task.model');
  const Habit   = require('../models/habit.model').Habit;
  const HabitLog = require('../models/habit.model').HabitLog;
  const { Op }  = require('sequelize');

  const tz       = timezone || 'Africa/Cairo';
  const today    = moment.tz(tz).format('YYYY-MM-DD');
  const twoWeeks = moment.tz(tz).subtract(14, 'days').format('YYYY-MM-DD');

  const [user, scores, flags, moods, latestAudit, habits, habitLogs, tasks] = await Promise.all([
    User.findByPk(userId),
    ProductivityScore.findAll({
      where: { user_id: userId, score_date: { [Op.gte]: twoWeeks } },
      order: [['score_date', 'ASC']],
    }),
    BehavioralFlag.findAll({
      where: { user_id: userId, is_resolved: false, is_dismissed: false },
      order: [['severity', 'DESC']],
      limit: 10,
    }),
    MoodEntry.findAll({
      where: { user_id: userId, entry_date: { [Op.gte]: twoWeeks } },
      order: [['entry_date', 'ASC']],
    }),
    WeeklyAudit.findOne({
      where: { user_id: userId },
      order: [['week_start', 'DESC']],
    }),
    Habit.findAll({ where: { user_id: userId, is_active: true } }),
    HabitLog.findAll({
      where: { user_id: userId, log_date: { [Op.gte]: twoWeeks } },
    }),
    Task.findAll({
      where: {
        user_id: userId,
        [Op.or]: [
          { due_date: { [Op.gte]: twoWeeks } },
          { completed_at: { [Op.gte]: moment.tz(twoWeeks, tz).toDate() } },
        ],
      },
    }),
  ]);

  const name = user?.name?.split(' ')[0] || 'صديقي';

  // ── 1. Behavior Analysis ──────────────────────────────────────────────────
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((s, r) => s + r.overall_score, 0) / scores.length) : 0;
  const scoreTrend = calcTrend(scores.map(s => s.overall_score));
  const avgMood = moods.length > 0
    ? Math.round(moods.reduce((s, m) => s + m.mood_score, 0) / moods.length * 10) / 10 : 0;
  const moodTrend = calcTrend(moods.map(m => m.mood_score));

  // Task completion analysis
  const completedTasks  = tasks.filter(t => t.status === 'completed').length;
  const taskCompletionRate = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;
  const rescheduledTasks = tasks.filter(t => t.reschedule_count > 0).length;

  // Habit analysis per habit
  const habitAnalysis = habits.map(h => {
    const logs   = habitLogs.filter(l => l.habit_id === h.id);
    const done   = logs.filter(l => l.completed).length;
    const rate   = Math.round((done / Math.max(14, 1)) * 100);
    return { id: h.id, name: h.name, completion_rate: rate, streak: h.current_streak || 0 };
  }).sort((a, b) => a.completion_rate - b.completion_rate);

  const weakestHabit  = habitAnalysis[0] || null;
  const strongestHabit = habitAnalysis[habitAnalysis.length - 1] || null;

  // ── 2. Burnout Risk ───────────────────────────────────────────────────────
  const burnoutFactors = [];
  let burnoutScore = 0;

  if (avgScore < 40)         { burnoutScore += 30; burnoutFactors.push('درجات أداء منخفضة بشكل متواصل'); }
  if (avgMood < 4)           { burnoutScore += 25; burnoutFactors.push('مزاج منخفض مستمر'); }
  if (flags.filter(f => f.flag_type === 'burnout_risk').length > 0) {
    burnoutScore += 25; burnoutFactors.push('إشارات إجهاد نشطة'); }
  if (rescheduledTasks > 5)  { burnoutScore += 10; burnoutFactors.push('تأجيل متكرر للمهام'); }
  if (scoreTrend === 'declining') { burnoutScore += 10; burnoutFactors.push('تراجع في الأداء'); }

  const burnoutRisk = burnoutScore >= 60 ? 'high' : burnoutScore >= 30 ? 'medium' : 'low';

  // ── 3. Life Balance Dimensions ────────────────────────────────────────────
  const taskDimension   = Math.min(100, taskCompletionRate);
  const habitDimension  = habitAnalysis.length > 0
    ? Math.round(habitAnalysis.reduce((s, h) => s + h.completion_rate, 0) / habitAnalysis.length) : 0;
  const moodDimension   = Math.round(avgMood * 10);
  const consistencyDim  = scores.length >= 7 ? Math.round(
    scores.slice(-7).filter(s => s.overall_score >= 40).length / 7 * 100
  ) : 50;

  // ── 4. Recommendations ────────────────────────────────────────────────────
  const recommendations = buildCoachRecommendations({
    avgScore, scoreTrend, avgMood, moodTrend,
    taskCompletionRate, rescheduledTasks,
    weakestHabit, strongestHabit, burnoutRisk, flags, name,
  });

  // ── 5. Growth Highlights ──────────────────────────────────────────────────
  const highlights = buildGrowthHighlights({
    scores, moods, taskCompletionRate, strongestHabit,
    latestAudit, completedTasks, name,
  });

  // ── 6. Action Plan ────────────────────────────────────────────────────────
  const actionPlan = buildActionPlan(recommendations, burnoutRisk, weakestHabit);

  return {
    generated_at: new Date().toISOString(),
    summary: {
      avg_score_14d:        avgScore,
      score_trend:          scoreTrend,
      avg_mood_14d:         avgMood,
      mood_trend:           moodTrend,
      task_completion_rate: taskCompletionRate,
      active_flags:         flags.length,
    },
    behavior_analysis: {
      productivity_trend:   scoreTrend,
      consistency_days:     scores.length,
      rescheduled_tasks:    rescheduledTasks,
      habit_analysis:       habitAnalysis,
    },
    life_balance: {
      tasks:       taskDimension,
      habits:      habitDimension,
      mood:        moodDimension,
      consistency: consistencyDim,
      overall:     Math.round((taskDimension + habitDimension + moodDimension + consistencyDim) / 4),
    },
    burnout_warning: {
      risk_level:  burnoutRisk,
      risk_score:  burnoutScore,
      factors:     burnoutFactors,
      urgent:      burnoutRisk === 'high',
    },
    recommendations,
    highlights,
    action_plan: actionPlan,
    coaching_tone: user?.ai_personality || 'friendly',
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function calcTrend(values) {
  if (values.length < 3) return 'stable';
  const first = values.slice(0, Math.ceil(values.length / 2));
  const last  = values.slice(Math.floor(values.length / 2));
  const avgFirst = first.reduce((s, v) => s + v, 0) / first.length;
  const avgLast  = last.reduce((s, v) => s + v, 0) / last.length;
  if (avgLast - avgFirst > 3)  return 'improving';
  if (avgFirst - avgLast > 3)  return 'declining';
  return 'stable';
}

function buildCoachRecommendations({ avgScore, scoreTrend, avgMood, moodTrend, taskCompletionRate,
  rescheduledTasks, weakestHabit, strongestHabit, burnoutRisk, flags, name }) {
  const recs = [];

  if (burnoutRisk === 'high') recs.push({
    type: 'burnout', priority: 'critical',
    title: '⚠️ تحذير إجهاد',
    body:  `يا ${name}، المؤشرات تشير إلى خطر إجهاد حقيقي. خذ استراحة يوم أو يومين وقلّل من مهامك.`,
    action: 'schedule_rest_day',
  });

  if (scoreTrend === 'declining') recs.push({
    type: 'performance', priority: 'high',
    title: 'أداؤك في تراجع',
    body:  'لاحظنا انخفاضاً في درجاتك خلال الأسبوعين الماضيين. حلّل سبب ذلك واضبط خطتك.',
    action: 'review_performance',
  });

  if (taskCompletionRate < 50) recs.push({
    type: 'tasks', priority: 'high',
    title: 'معدل إتمام المهام منخفض',
    body:  `أتممت ${taskCompletionRate}% فقط من مهامك. حاول تقليل عدد المهام اليومية أو تقسيم الكبيرة منها.`,
    action: 'reduce_task_count',
  });

  if (weakestHabit && weakestHabit.completion_rate < 40) recs.push({
    type: 'habits', priority: 'medium',
    title: `عادة "${weakestHabit.name}" تحتاج اهتماماً`,
    body:  `معدل إتمام "${weakestHabit.name}" ${weakestHabit.completion_rate}% فقط. اربطها بعادة أخرى أقوى.`,
    action: 'improve_habit',
    habit_id: weakestHabit.id,
  });

  if (avgMood < 5) recs.push({
    type: 'mood', priority: 'medium',
    title: 'مزاجك يحتاج رعاية',
    body:  'متوسط مزاجك في الأسبوعين الأخيرين منخفض. الرياضة والنوم الجيد والحديث مع الأصدقاء قد تساعد.',
    action: 'improve_mood',
  });

  if (rescheduledTasks > 3) recs.push({
    type: 'procrastination', priority: 'medium',
    title: 'تأجيل المهام يتكرر',
    body:  `أجّلت ${rescheduledTasks} مهام. حدد السبب: هل هي صعبة جداً؟ غير واضحة؟ أم أن الوقت غير مناسب؟`,
    action: 'address_procrastination',
  });

  if (strongestHabit && strongestHabit.completion_rate >= 80) recs.push({
    type: 'strength', priority: 'low',
    title: `💪 قوتك في "${strongestHabit.name}"`,
    body:  `أنت تؤدي "${strongestHabit.name}" بانتظام رائع (${strongestHabit.completion_rate}%). استخدم هذا الزخم لتحسين عادة أخرى.`,
    action: 'leverage_strength',
  });

  if (recs.length === 0) recs.push({
    type: 'general', priority: 'low',
    title: 'استمر في هذا المسار',
    body:  `أداؤك جيد يا ${name}! حافظ على نمطك الحالي وفكّر في إضافة هدف جديد هذا الأسبوع.`,
    action: 'set_new_goal',
  });

  return recs;
}

function buildGrowthHighlights({ scores, moods, taskCompletionRate, strongestHabit, latestAudit, completedTasks, name }) {
  const highlights = [];
  if (completedTasks > 0) highlights.push({ emoji: '✅', text: `أتممت ${completedTasks} مهمة في الأسبوعين الماضيين` });
  if (strongestHabit) highlights.push({ emoji: '🔥', text: `${strongestHabit.name}: سلسلة ${strongestHabit.streak} يوم` });
  if (scores.length > 0) {
    const best = Math.max(...scores.map(s => s.overall_score));
    highlights.push({ emoji: '⭐', text: `أعلى درجة: ${best}/100` });
  }
  if (latestAudit?.top_achievement) highlights.push({ emoji: '🏆', text: latestAudit.top_achievement });
  return highlights;
}

function buildActionPlan(recommendations, burnoutRisk, weakestHabit) {
  const plan = [];
  const urgent = recommendations.filter(r => r.priority === 'critical' || r.priority === 'high');
  const medium = recommendations.filter(r => r.priority === 'medium');

  if (burnoutRisk === 'high') plan.push({ day: 'اليوم',    task: 'خذ استراحة — لا تضيف مهام جديدة', priority: 'critical' });
  if (urgent.length > 0)     plan.push({ day: 'هذا الأسبوع', task: urgent[0].title, priority: 'high' });
  if (medium.length > 0)     plan.push({ day: 'الأسبوع القادم', task: medium[0].title, priority: 'medium' });
  if (weakestHabit)          plan.push({ day: 'كل يوم',    task: `أتمّ عادة: ${weakestHabit.name}`, priority: 'low' });
  return plan;
}

module.exports = {
  getDailyCoaching,
  getBehaviorNudge,
  getCoachInsights,
};
