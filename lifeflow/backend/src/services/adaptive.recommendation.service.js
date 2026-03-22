/**
 * Adaptive Recommendation Service — Phase 10
 * =============================================
 * Generates intelligent, personalized recommendations based on
 * detected behavioral patterns and current user state.
 */

'use strict';

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

function getModels() {
  const User              = require('../models/user.model');
  const ProductivityScore = require('../models/productivity_score.model');
  const BehavioralFlag    = require('../models/behavioral_flag.model');
  const MoodEntry         = require('../models/mood.model');
  const EnergyLog         = require('../models/energy_log.model');
  const Task              = require('../models/task.model');
  return { User, ProductivityScore, BehavioralFlag, MoodEntry, EnergyLog, Task };
}

/**
 * getAdaptiveRecommendations(userId, timezone)
 * Returns a ranked list of intelligent life recommendations.
 */
async function getAdaptiveRecommendations(userId, timezone = 'Africa/Cairo') {
  try {
    const { User, ProductivityScore, BehavioralFlag, MoodEntry, EnergyLog, Task } = getModels();
    const since14 = moment.tz(timezone).subtract(14, 'days').toDate();
    const since7  = moment.tz(timezone).subtract(7, 'days').toDate();

    const [user, scores, flags, moodEntries, energyLogs, recentTasks] = await Promise.all([
      User.findByPk(userId, { raw: true }),
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since14 } }, raw: true, order: [['score_date','ASC']] }),
      BehavioralFlag.findAll({ where: { user_id: userId, is_resolved: false }, raw: true }),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: since7 } }, raw: true }),
      EnergyLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: since7 } }, raw: true }),
      Task.findAll({ where: { user_id: userId, status: { [Op.ne]: 'completed' }, due_date: { [Op.lte]: moment.tz(timezone).add(3, 'days').toDate() } }, raw: true }),
    ]);

    const recs = [];

    // ── Context metrics ───────────────────────────────────────────────────────
    const avgScore7 = scores.slice(-7).length > 0
      ? Math.round(scores.slice(-7).reduce((s, r) => s + (r.overall_score || 0), 0) / Math.min(scores.length, 7)) : 55;
    const avgMood7  = moodEntries.length > 0
      ? parseFloat((moodEntries.reduce((s, m) => s + (m.mood_score || 5), 0) / moodEntries.length).toFixed(1)) : 6;
    const avgEnergy = energyLogs.length > 0
      ? Math.round(energyLogs.reduce((s, e) => s + (e.energy_score || 50), 0) / energyLogs.length) : 55;
    const flagTypes = flags.map(f => f.flag_type);
    const hour      = moment.tz(timezone).hour();

    // ── 1. Time-aware context ─────────────────────────────────────────────────
    recs.push(...generateTimeAwareRecs(hour, avgScore7, avgEnergy));

    // ── 2. Score-based recommendations ────────────────────────────────────────
    recs.push(...generateScoreRecs(avgScore7, scores));

    // ── 3. Energy-based recommendations ──────────────────────────────────────
    recs.push(...generateEnergyRecs(avgEnergy, energyLogs));

    // ── 4. Mood-based recommendations ─────────────────────────────────────────
    recs.push(...generateMoodRecs(avgMood7));

    // ── 5. Behavioral flag recommendations ───────────────────────────────────
    recs.push(...generateFlagRecs(flagTypes, flags));

    // ── 6. Task urgency recommendations ──────────────────────────────────────
    if (recentTasks.length > 0)
      recs.push(...generateTaskRecs(recentTasks, avgEnergy));

    // ── 7. Pattern-based deep recommendations ────────────────────────────────
    recs.push(...generatePatternRecs(avgScore7, avgMood7, avgEnergy, flagTypes));

    // Deduplicate, sort by priority weight, take top 8
    const sorted = recs
      .filter((r, i, a) => a.findIndex(x => x.id === r.id) === i)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 8);

    return {
      user_id:       userId,
      generated_at:  moment.tz(timezone).toISOString(),
      user_context: {
        avg_score_7d:  avgScore7,
        avg_mood_7d:   avgMood7,
        avg_energy_7d: avgEnergy,
        active_flags:  flagTypes.length,
        urgent_tasks:  recentTasks.filter(t => t.priority === 'urgent').length,
      },
      recommendations: sorted.map(({ weight, ...r }) => r),
      total: sorted.length,
    };
  } catch (err) {
    logger.error('getAdaptiveRecommendations error:', err.message);
    throw err;
  }
}

// ── Recommendation Generators ─────────────────────────────────────────────────

function generateTimeAwareRecs(hour, score, energy) {
  const recs = [];
  if (hour >= 5 && hour < 9) {
    recs.push({ id: 'morning_routine', category: 'صباح', priority: 'high', weight: 90,
      title: 'ابدأ صباحك بقوة',
      body: 'الصباح الباكر هو أفضل وقت لبناء الزخم — تناول إفطارك وراجع مهام اليوم',
      action: 'فتح خطة اليوم', action_type: 'navigate', action_target: 'day_plan', icon: '🌅' });
  } else if (hour >= 9 && hour < 12 && energy >= 60) {
    recs.push({ id: 'deep_work_morning', category: 'تركيز', priority: 'high', weight: 95,
      title: 'نافذة تركيزك العميق مفتوحة',
      body: 'طاقتك جيدة الآن وهذا أفضل وقت لمهامك الأصعب والأهم',
      action: 'مهامي العاجلة', action_type: 'navigate', action_target: 'tasks', icon: '🎯' });
  } else if (hour >= 14 && hour < 16) {
    recs.push({ id: 'afternoon_recovery', category: 'طاقة', priority: 'medium', weight: 70,
      title: 'فترة التعافي بعد الظهر',
      body: 'الطاقة تنخفض طبيعياً بعد الظهر — استراحة 15 دقيقة تجدد تركيزك',
      action: 'جلسة استراحة', action_type: 'break', icon: '☕' });
  } else if (hour >= 20 && hour < 23) {
    recs.push({ id: 'evening_review', category: 'مراجعة', priority: 'medium', weight: 75,
      title: 'راجع يومك الآن',
      body: 'خصّص 10 دقائق لتسجيل مزاجك ومراجعة ما أنجزته اليوم',
      action: 'تسجيل المزاج', action_type: 'navigate', action_target: 'mood', icon: '📝' });
  }
  return recs;
}

function generateScoreRecs(avgScore, scores) {
  const recs = [];
  if (scores.length < 3) {
    recs.push({ id: 'improve_data', category: 'بيانات', priority: 'high', weight: 85,
      title: 'أكمل يومك لتحسين توصياتك',
      body: 'سجّل مهامك ومزاجك يومياً لأحصل على توصيات أكثر دقة لك',
      action: 'إضافة مهمة', action_type: 'navigate', action_target: 'tasks', icon: '📊' });
    return recs;
  }

  if (avgScore >= 75) {
    recs.push({ id: 'sustain_performance', category: 'أداء', priority: 'medium', weight: 72,
      title: 'حافظ على هذا الأداء المميز',
      body: `نقاطك ${avgScore}/100 — أنت في قمة أدائك. تأكد من الراحة الكافية لتديم هذا المستوى`,
      action: 'عرض الأداء', action_type: 'navigate', action_target: 'performance', icon: '🏆' });
  } else if (avgScore < 50) {
    recs.push({ id: 'boost_performance', category: 'أداء', priority: 'high', weight: 90,
      title: 'نقاطك تحتاج دفعة قوية',
      body: `نقاطك ${avgScore}/100 — ابدأ بإنجاز مهمة واحدة صغيرة وستشعر بفرق فوري`,
      action: 'أبسط مهمة', action_type: 'navigate', action_target: 'tasks', icon: '💪' });
  }

  // Trend-based
  if (scores.length >= 5) {
    const recent3  = scores.slice(-3).map(s => s.overall_score || 0);
    const prev3    = scores.slice(-6, -3).map(s => s.overall_score || 0);
    const r3avg    = recent3.reduce((a, b) => a + b, 0) / 3;
    const p3avg    = prev3.reduce((a, b) => a + b, 0) / Math.max(prev3.length, 1);
    if (r3avg - p3avg > 8) {
      recs.push({ id: 'trend_up', category: 'تقدم', priority: 'low', weight: 60,
        title: 'أداؤك في ارتفاع مستمر 📈',
        body: `تحسنت نقاطك ${Math.round(r3avg - p3avg)} نقطة مقارنةً بالأسبوع الماضي — استمر!`,
        action: 'عرض المسار', action_type: 'navigate', action_target: 'trajectory', icon: '🚀' });
    }
  }
  return recs;
}

function generateEnergyRecs(avgEnergy, energyLogs) {
  const recs = [];
  if (avgEnergy < 35) {
    recs.push({ id: 'critical_energy', category: 'طاقة', priority: 'critical', weight: 98,
      title: 'طاقتك في مستوى حرج',
      body: 'طاقتك منخفضة جداً — ركز على النوم الكافي والتغذية السليمة قبل أي شيء آخر',
      action: 'تحليل الطاقة', action_type: 'navigate', action_target: 'energy', icon: '🔴' });
  } else if (avgEnergy < 55) {
    recs.push({ id: 'low_energy', category: 'طاقة', priority: 'high', weight: 80,
      title: 'حسّن طاقتك اليومية',
      body: 'طاقتك دون المستوى الأمثل — جرّب النوم مبكراً هذا الأسبوع والرؤية ستكون مختلفة',
      action: 'تحليل الطاقة', action_type: 'navigate', action_target: 'energy', icon: '⚡' });
  } else if (avgEnergy >= 75) {
    recs.push({ id: 'high_energy', category: 'طاقة', priority: 'low', weight: 55,
      title: 'طاقتك عالية — استثمرها',
      body: 'مستوى طاقتك ممتاز الآن! هذا الوقت المثالي لمهامك الأهم والأصعب',
      action: 'خطة اليوم', action_type: 'navigate', action_target: 'day_plan', icon: '⚡' });
  }
  return recs;
}

function generateMoodRecs(avgMood) {
  const recs = [];
  if (avgMood < 4) {
    recs.push({ id: 'low_mood', category: 'مزاج', priority: 'high', weight: 88,
      title: 'مزاجك يحتاج اهتماماً',
      body: 'مزاجك كان منخفضاً هذا الأسبوع — تحدث مع شخص تثق به أو مارس نشاطاً تحبه',
      action: 'تسجيل المزاج', action_type: 'navigate', action_target: 'mood', icon: '💙' });
  } else if (avgMood >= 8) {
    recs.push({ id: 'high_mood', category: 'مزاج', priority: 'low', weight: 58,
      title: 'مزاجك رائع — هيا نستغل ذلك',
      body: 'مزاجك المرتفع يمنحك طاقة إضافية — ابدأ مشروعاً جديداً أو تحدَّ نفسك بهدف جديد',
      action: 'أهدافي', action_type: 'navigate', action_target: 'goals', icon: '😊' });
  }
  return recs;
}

function generateFlagRecs(flagTypes, flags) {
  const recs = [];
  const withTitle = (type) => flags.find(f => f.flag_type === type);

  if (flagTypes.includes('burnout_risk')) {
    recs.push({ id: 'burnout_warning', category: 'صحة', priority: 'critical', weight: 99,
      title: 'تحذير: بوادر إجهاد وإرهاق',
      body: 'رصدنا علامات إجهاد متراكم — خذ يوم راحة كامل هذا الأسبوع ولا تعمل مساءً',
      action: 'تقييم الإجهاد', action_type: 'navigate', action_target: 'burnout', icon: '🚨' });
  }
  if (flagTypes.includes('procrastination')) {
    const flag = withTitle('procrastination');
    recs.push({ id: 'procrastination_fix', category: 'مهام', priority: 'high', weight: 87,
      title: 'كسر دائرة التأجيل',
      body: flag?.ai_recommendation || 'لديك مهام مؤجلة — ابدأ بأصغر خطوة ممكنة الآن، 5 دقائق فقط',
      action: 'المهام المؤجلة', action_type: 'navigate', action_target: 'tasks', icon: '⏰' });
  }
  if (flagTypes.includes('late_night_work')) {
    recs.push({ id: 'sleep_schedule', category: 'نوم', priority: 'medium', weight: 76,
      title: 'ضع حداً لساعات العمل الليلية',
      body: 'العمل الليلي يضر بنوعية نومك وإنتاجيتك غداً — حاول الإيقاف قبل 10 مساءً',
      action: 'اضبط تذكيراً', action_type: 'reminder', icon: '🌙' });
  }
  if (flagTypes.includes('overcommitment')) {
    recs.push({ id: 'overcommit_fix', category: 'تنظيم', priority: 'high', weight: 84,
      title: 'أنت تحمّل نفسك فوق طاقتها',
      body: 'لديك مهام أكثر مما يمكنك إنجازه — ألغِ أو أجّل 3 مهام غير عاجلة الآن',
      action: 'مراجعة المهام', action_type: 'navigate', action_target: 'tasks', icon: '⚠️' });
  }
  return recs;
}

function generateTaskRecs(urgentTasks, energy) {
  const urgent = urgentTasks.filter(t => t.priority === 'urgent');
  if (urgent.length === 0) return [];
  const canHandle = energy >= 60 ? 'ابدأ بها الآن' : 'ابدأ بالأسهل منها';
  return [{
    id: 'urgent_tasks', category: 'مهام', priority: 'high', weight: 93,
    title: `${urgent.length} مهمة عاجلة تنتظرك`,
    body: `لديك ${urgent.length} مهمة عاجلة قريبة الموعد — ${canHandle}`,
    action: 'المهام العاجلة', action_type: 'navigate', action_target: 'tasks', icon: '🔥',
  }];
}

function generatePatternRecs(score, mood, energy, flagTypes) {
  const recs = [];

  // Schedule deep work if energy is high
  if (energy >= 70 && score >= 65) {
    recs.push({ id: 'schedule_deep_work', category: 'تخطيط', priority: 'medium', weight: 74,
      title: 'جدوِل عملك العميق',
      body: 'حالتك الآن مثالية للعمل العميق — خصّص ساعتين بدون مقاطعة لمشروعك الأهم',
      action: 'خطة اليوم', action_type: 'navigate', action_target: 'day_plan', icon: '🧠' });
  }

  // Reduce workload on low energy days
  if (energy < 45 && !flagTypes.includes('burnout_risk')) {
    recs.push({ id: 'reduce_today', category: 'طاقة', priority: 'medium', weight: 78,
      title: 'قلّل حمل اليوم — طاقتك محدودة',
      body: 'طاقتك اليوم منخفضة — ركّز على مهمة أو مهمتين فقط وأرجئ الباقي',
      action: 'تنظيم المهام', action_type: 'navigate', action_target: 'tasks', icon: '🌿' });
  }

  // Exercise recommendation for better mood
  if (mood < 6 && energy >= 40) {
    recs.push({ id: 'exercise_boost', category: 'صحة', priority: 'medium', weight: 77,
      title: 'الرياضة ترفع مزاجك فوراً',
      body: 'تمرين 20 دقيقة يرفع المزاج بشكل علمي ثابت — مشي سريع أو تمارين خفيفة',
      action: 'تسجيل عادة', action_type: 'navigate', action_target: 'habits', icon: '🏃' });
  }

  return recs;
}

module.exports = { getAdaptiveRecommendations };
