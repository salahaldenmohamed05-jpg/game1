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
          createdAt: {
            [Op.gte]: moment.tz(today, tz).startOf('day').toDate(),
          },
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
