/**
 * AI Coach Service — Phase 11 (Life Copilot)
 * =============================================
 * Answers life productivity questions, interprets life score,
 * and explains behavioral insights in Arabic.
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
 * getCopilotSuggestions(userId, timezone)
 * Returns proactive AI-generated suggestions based on current state.
 */
async function getCopilotSuggestions(userId, timezone = 'Africa/Cairo') {
  try {
    const { User, ProductivityScore, BehavioralFlag, MoodEntry, EnergyLog, Task } = getModels();
    const since7  = moment.tz(timezone).subtract(7, 'days').format('YYYY-MM-DD');
    const todayStr = moment.tz(timezone).format('YYYY-MM-DD');

    const [user, scores, flags, todayMood, energyLog, urgentTasks] = await Promise.all([
      User.findByPk(userId, { raw: true }),
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since7 } }, raw: true, order: [['score_date','DESC']], limit: 7 }),
      BehavioralFlag.findAll({ where: { user_id: userId, is_resolved: false }, raw: true, limit: 5 }),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: todayStr }, raw: true }),
      EnergyLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: since7 } }, raw: true, order: [['log_date','DESC']], limit: 1 }),
      Task.findAll({ where: { user_id: userId, status: 'pending', priority: { [Op.in]: ['urgent','high'] } }, raw: true, limit: 5 }),
    ]);

    const name    = user?.name?.split(' ')[0] || 'صديقي';
    const hour    = moment.tz(timezone).hour();
    const avgScore= scores.length > 0 ? Math.round(scores.reduce((s, r) => s + (r.overall_score || 0), 0) / scores.length) : 55;
    const latestEnergy = energyLog[0]?.energy_score || 55;
    const hasMoodToday = todayMood.length > 0;

    const suggestions = [];

    // Priority 1: Missing mood check-in
    if (!hasMoodToday) {
      suggestions.push({
        id: 'checkin_mood', type: 'action', priority: 1,
        message: `مرحباً ${name}! لم تسجّل مزاجك اليوم بعد 🌟`,
        sub: 'تسجيل المزاج يساعدني على تقديم توصيات أفضل لك',
        action_label: 'سجّل مزاجك', action_target: 'mood', icon: '😊',
      });
    }

    // Priority 2: Urgent tasks
    if (urgentTasks.length > 0) {
      suggestions.push({
        id: 'urgent_alert', type: 'alert', priority: 2,
        message: `⚠️ لديك ${urgentTasks.length} مهمة عاجلة تنتظر إنجازها`,
        sub: `أولها: "${urgentTasks[0]?.title || 'مهمة عاجلة'}"`,
        action_label: 'عرض المهام', action_target: 'tasks', icon: '🔥',
      });
    }

    // Priority 3: Active behavioral flags
    const criticalFlags = flags.filter(f => f.severity === 'critical' || f.flag_type === 'burnout_risk');
    if (criticalFlags.length > 0) {
      suggestions.push({
        id: 'burnout_alert', type: 'warning', priority: 1,
        message: 'تنبيه: رصدنا علامات إجهاد تحتاج اهتمامك',
        sub: criticalFlags[0]?.ai_recommendation || 'خذ استراحة وراجع جدولك',
        action_label: 'تفاصيل الإجهاد', action_target: 'coach', icon: '🚨',
      });
    }

    // Priority 4: Energy-based deep work suggestion
    if (latestEnergy >= 70 && hour >= 8 && hour <= 11) {
      suggestions.push({
        id: 'deep_work_now', type: 'opportunity', priority: 3,
        message: `طاقتك عالية الآن (${latestEnergy}/100) — نافذة تركيز مفتوحة! ⚡`,
        sub: 'هذا أفضل وقت لمهامك الأصعب والأهم',
        action_label: 'ابدأ العمل العميق', action_target: 'day_plan', icon: '🎯',
      });
    }

    // Priority 5: Score interpretation
    suggestions.push({
      id: 'score_insight', type: 'insight', priority: 5,
      message: interpretScore(avgScore, name),
      sub: avgScore >= 70 ? 'استمر في هذا المسار الرائع' : 'أنا هنا لمساعدتك على التحسين',
      action_label: 'عرض الأداء التفصيلي', action_target: 'performance', icon: avgScore >= 70 ? '🏆' : '📊',
    });

    // Priority 6: Daily plan suggestion
    if (hour >= 6 && hour <= 10) {
      suggestions.push({
        id: 'build_plan', type: 'action', priority: 4,
        message: 'هل بنيت خطة يومك بعد؟ 📅',
        sub: 'أنشئ جدولاً ذكياً يتناسب مع طاقتك وأولوياتك',
        action_label: 'بناء خطة اليوم', action_target: 'day_plan', icon: '📅',
      });
    }

    return {
      user_id:      userId,
      name,
      generated_at: moment.tz(timezone).toISOString(),
      greeting:     buildGreeting(hour, name),
      suggestions:  suggestions.sort((a, b) => a.priority - b.priority).slice(0, 5),
      context: { avg_score: avgScore, energy: latestEnergy, has_mood: hasMoodToday, active_flags: flags.length },
    };
  } catch (err) {
    logger.error('getCopilotSuggestions error:', err.message);
    throw err;
  }
}

/**
 * answerCopilotQuestion(userId, question, timezone)
 * Provides a context-aware answer to common life/productivity questions.
 */
async function answerCopilotQuestion(userId, question, timezone = 'Africa/Cairo') {
  try {
    const { ProductivityScore, MoodEntry, EnergyLog } = getModels();
    const since14 = moment.tz(timezone).subtract(14, 'days').toDate();

    const [scores, moodEntries, energyLogs] = await Promise.all([
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since14 } }, raw: true }),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: since14 } }, raw: true }),
      EnergyLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: since14 } }, raw: true }),
    ]);

    const avgScore  = scores.length > 0 ? Math.round(scores.reduce((s, r) => s + (r.overall_score || 0), 0) / scores.length) : 55;
    const avgMood   = moodEntries.length > 0 ? parseFloat((moodEntries.reduce((s, m) => s + (m.mood_score || 5), 0) / moodEntries.length).toFixed(1)) : 6;
    const avgEnergy = energyLogs.length > 0 ? Math.round(energyLogs.reduce((s, e) => s + (e.energy_score || 50), 0) / energyLogs.length) : 55;

    const q = question.toLowerCase().trim();
    const answer = matchQuestion(q, { avgScore, avgMood, avgEnergy, scoresCount: scores.length });

    return {
      user_id:    userId,
      question,
      answer:     answer.text,
      suggestions: answer.suggestions || [],
      action:     answer.action || null,
      confidence: answer.confidence || 0.8,
      generated_at: moment.tz(timezone).toISOString(),
    };
  } catch (err) {
    logger.error('answerCopilotQuestion error:', err.message);
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function interpretScore(score, name) {
  if (score >= 80) return `${name}، نقاطك ${score}/100 — أداء استثنائي! 🏆`;
  if (score >= 65) return `${name}، نقاطك ${score}/100 — أداء جيد جداً 👍`;
  if (score >= 50) return `${name}، نقاطك ${score}/100 — أداء متوسط، هناك مجال للتحسين`;
  return `${name}، نقاطك ${score}/100 — أنا هنا لمساعدتك على تحسين هذا الرقم`;
}

function buildGreeting(hour, name) {
  if (hour >= 5 && hour < 12)  return `صباح النور ${name}! ☀️`;
  if (hour >= 12 && hour < 17) return `مرحباً ${name}! 👋`;
  if (hour >= 17 && hour < 21) return `مساء الخير ${name}! 🌆`;
  return `مرحباً ${name}، أنت صاحي متأخر! 🌙`;
}

function matchQuestion(q, ctx) {
  const { avgScore, avgMood, avgEnergy } = ctx;

  if (q.includes('نقط') || q.includes('score') || q.includes('أداء')) {
    return {
      text: `نقاط حياتك الحالية ${avgScore}/100. ${avgScore >= 65 ? 'أنت تسير بشكل ممتاز!' : 'لتحسين نقاطك: أنجز مهامك يومياً، سجّل مزاجك، وحافظ على عاداتك.'}`,
      suggestions: ['كيف أرفع نقاطي؟', 'ما أكثر شيء يؤثر على أدائي؟'],
      confidence: 0.95,
    };
  }
  if (q.includes('طاقة') || q.includes('تعب') || q.includes('نشاط')) {
    return {
      text: `طاقتك الحالية ${avgEnergy}/100. ${avgEnergy >= 60 ? 'طاقتك جيدة — استثمرها في مهامك المهمة.' : 'لرفع طاقتك: نم 7-8 ساعات، تحرك 20 دقيقة، وتناول إفطاراً صحياً.'}`,
      suggestions: ['ما أفضل وقت لعملي العميق؟', 'كيف أحسّن طاقتي؟'],
      action: { label: 'تحليل الطاقة', target: 'energy' },
      confidence: 0.9,
    };
  }
  if (q.includes('مزاج') || q.includes('حزين') || q.includes('تعيس') || q.includes('سعيد')) {
    return {
      text: `متوسط مزاجك الأسبوعي ${avgMood}/10. ${avgMood >= 7 ? 'مزاجك رائع — استمر في نهجك الإيجابي.' : 'لتحسين مزاجك: مارس نشاطاً تحبه، تحدث مع شخص تثق به، وخصص وقتاً للاسترخاء.'}`,
      suggestions: ['كيف أرفع مزاجي؟', 'هل المزاج يؤثر على إنتاجيتي؟'],
      confidence: 0.88,
    };
  }
  if (q.includes('مهام') || q.includes('tasks') || q.includes('تأجيل') || q.includes('إنجاز')) {
    return {
      text: 'لتحسين إنجاز مهامك: 1) قسّم المهام الكبيرة لخطوات صغيرة، 2) ابدأ بالمهمة الأصعب صباحاً، 3) استخدم تقنية 25 دقيقة عمل + 5 دقيقة استراحة.',
      suggestions: ['ما هي المهام العاجلة اليوم؟', 'كيف أتغلب على التأجيل؟'],
      action: { label: 'مهامي اليوم', target: 'tasks' },
      confidence: 0.9,
    };
  }
  if (q.includes('نوم') || q.includes('sleep') || q.includes('ليل')) {
    return {
      text: 'لتحسين نومك: نَم وصحِ في نفس الوقت يومياً، أوقف الشاشات قبل النوم بساعة، واجعل غرفتك باردة ومظلمة. النوم الجيد يرفع الإنتاجية 30%.',
      suggestions: ['كيف يؤثر النوم على طاقتي؟', 'ما أفضل وقت للنوم؟'],
      confidence: 0.85,
    };
  }
  if (q.includes('رياضة') || q.includes('تمرين') || q.includes('exercise')) {
    return {
      text: 'الرياضة هي أقوى أداة لتحسين المزاج والطاقة. 20-30 دقيقة يومياً تكفي. حتى المشي السريع يرفع مزاجك فوراً ويحسن تركيزك لساعات.',
      suggestions: ['كم مرة يجب أن أتمرن؟', 'ما أفضل وقت للرياضة؟'],
      confidence: 0.85,
    };
  }

  // Default answer
  return {
    text: `سؤال رائع! بناءً على بياناتك: نقاطك ${avgScore}/100، طاقتك ${avgEnergy}/100، مزاجك ${avgMood}/10. هل تريد تفاصيل حول جانب معين؟`,
    suggestions: ['اشرح لي نقاطي', 'كيف أحسّن طاقتي؟', 'ما أهم شيء أركز عليه الآن؟'],
    confidence: 0.6,
  };
}

module.exports = { getCopilotSuggestions, answerCopilotQuestion };
