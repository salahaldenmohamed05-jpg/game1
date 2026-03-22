/**
 * Explainability Service — خدمة الشفافية والتفسير
 * ==================================================
 * Phase 15: Explainable AI Layer
 *
 * Returns explainable AI decisions with:
 *  - why[]       : human-readable Arabic reasons
 *  - confidence  : 0-100 score
 *  - factors     : weighted contributing factors
 *  - alternatives: what could have been done differently
 *
 * Used by: decision engine, proactive engine, assistant
 *
 * Confidence Score Formula:
 *  confidence = (energy_weight * energy_factor)
 *             + (priority_weight * priority_factor)
 *             + (learning_weight * learning_success_rate)
 *             + (context_weight * context_alignment)
 *
 * Weights: energy=0.25, priority=0.35, learning=0.25, context=0.15
 */

'use strict';

const logger   = require('../utils/logger');
const learning = require('./learning.engine.service');

// ─── Weight Configuration ─────────────────────────────────────────────────────
const WEIGHTS = {
  energy  : 0.25,
  priority: 0.35,
  learning: 0.25,
  context : 0.15,
};

// ─── Priority Factor Map ──────────────────────────────────────────────────────
const PRIORITY_FACTORS = {
  urgent: 1.0,
  high  : 0.85,
  medium: 0.60,
  low   : 0.35,
};

// ─── Action Categories ────────────────────────────────────────────────────────
const ACTION_META = {
  create_task      : { label: 'إنشاء مهمة',     effort: 'medium', benefit: 'high'   },
  complete_task    : { label: 'إنجاز مهمة',     effort: 'low',    benefit: 'high'   },
  reschedule_task  : { label: 'إعادة جدولة',    effort: 'low',    benefit: 'medium' },
  update_task      : { label: 'تحديث مهمة',     effort: 'low',    benefit: 'medium' },
  delete_task      : { label: 'حذف مهمة',       effort: 'low',    benefit: 'low'    },
  auto_reschedule  : { label: 'جدولة تلقائية',  effort: 'none',   benefit: 'high'   },
  log_mood         : { label: 'تسجيل المزاج',   effort: 'low',    benefit: 'high'   },
  energy_check     : { label: 'فحص الطاقة',     effort: 'none',   benefit: 'medium' },
  habit_reminder   : { label: 'تذكير بالعادة',  effort: 'low',    benefit: 'high'   },
  focus_block      : { label: 'جلسة تركيز',     effort: 'high',   benefit: 'high'   },
};

// ─── Core: Explain a Decision ─────────────────────────────────────────────────
/**
 * Explain a decision with confidence scoring.
 *
 * @param {object} params
 * @param {string} params.action          - action type
 * @param {string} params.userId
 * @param {number} [params.energy]        - 0-100
 * @param {number} [params.mood]          - 1-10
 * @param {string} [params.priority]      - 'urgent'|'high'|'medium'|'low'
 * @param {string} [params.risk]          - 'low'|'medium'|'high'
 * @param {string} [params.mode]          - orchestration mode
 * @param {string} [params.intent]        - detected intent
 * @param {number} [params.overdueCount]  - number of overdue tasks
 * @param {number} [params.pendingCount]  - total pending tasks
 * @param {string} [params.context]       - extra context string
 *
 * @returns {object} ExplainedDecision
 */
function explainDecision(params) {
  const {
    action,
    userId,
    energy       = 60,
    mood         = 5,
    priority     = 'medium',
    risk         = 'low',
    mode         = 'hybrid',
    intent       = null,
    overdueCount = 0,
    pendingCount = 0,
    context      = '',
  } = params;

  const actionMeta = ACTION_META[action] || { label: action, effort: 'medium', benefit: 'medium' };

  // ── Factor 1: Energy alignment ───────────────────────────────────────────
  let energyFactor = energy / 100;
  // High-effort actions need high energy
  if (actionMeta.effort === 'high' && energy < 50) energyFactor *= 0.6;
  if (actionMeta.effort === 'none')                energyFactor = 1.0;  // no energy needed
  energyFactor = Math.min(1.0, Math.max(0, energyFactor));

  // ── Factor 2: Priority/urgency factor ────────────────────────────────────
  const priorityFactor = PRIORITY_FACTORS[priority] || PRIORITY_FACTORS.medium;

  // ── Factor 3: Learning success rate ──────────────────────────────────────
  const learnedRate = learning.getActionSuccessRate(userId, action);
  const learningFactor = learnedRate !== null ? learnedRate / 100 : 0.65; // default 65% if no data

  // ── Factor 4: Context alignment ──────────────────────────────────────────
  let contextFactor = 0.7;  // baseline

  // Overdue tasks increase urgency → higher context score for scheduling actions
  if (overdueCount > 0 && ['reschedule_task', 'auto_reschedule', 'complete_task'].includes(action)) {
    contextFactor = Math.min(1.0, 0.7 + overdueCount * 0.1);
  }

  // Mood adjustment: bad mood → lower confidence for high-effort actions
  if (mood < 4 && actionMeta.effort === 'high') contextFactor *= 0.75;

  // Mode alignment
  if (mode === 'manager' && ['create_task', 'complete_task', 'reschedule_task'].includes(action)) {
    contextFactor = Math.min(1.0, contextFactor + 0.1);
  }
  if (mode === 'companion' && ['log_mood', 'energy_check', 'habit_reminder'].includes(action)) {
    contextFactor = Math.min(1.0, contextFactor + 0.1);
  }

  contextFactor = Math.min(1.0, Math.max(0, contextFactor));

  // ── Composite Confidence Score ────────────────────────────────────────────
  const rawConfidence = (
    WEIGHTS.energy   * energyFactor   +
    WEIGHTS.priority * priorityFactor +
    WEIGHTS.learning * learningFactor +
    WEIGHTS.context  * contextFactor
  );

  const confidence = Math.round(Math.min(100, Math.max(0, rawConfidence * 100)));

  // ── Build "why" explanation array (Arabic) ────────────────────────────────
  const why = [];

  // Energy reasons
  if (energy >= 70) {
    why.push(`طاقتك عالية (${energy}٪) — وقت مثالي للإنجاز ✅`);
  } else if (energy < 40) {
    why.push(`طاقتك منخفضة (${energy}٪) — قد يكون التنفيذ أصعب من المعتاد ⚠️`);
  } else {
    why.push(`طاقتك معقولة (${energy}٪) — يمكنك التنفيذ مع أخذ استراحات`);
  }

  // Priority reasons
  if (priority === 'urgent' || priority === 'high') {
    why.push(`الأولوية ${priority === 'urgent' ? 'عاجلة' : 'عالية'} — يُفضَّل التنفيذ فوراً 🔴`);
  } else if (priority === 'low') {
    why.push('الأولوية منخفضة — يمكن تأجيلها إذا كان هناك ما هو أهم');
  }

  // Overdue reasons
  if (overdueCount > 2) {
    why.push(`لديك ${overdueCount} مهام متأخرة — هذا يزيد من أهمية التنفيذ الآن ⏰`);
  } else if (overdueCount > 0) {
    why.push(`لديك مهام متأخرة — يُفضَّل معالجتها قريباً`);
  }

  // Learning reasons
  if (learnedRate !== null) {
    if (learnedRate >= 75) {
      why.push(`سجلك الشخصي ممتاز في هذا النوع من المهام (${learnedRate}٪ نجاح) 📈`);
    } else if (learnedRate < 40) {
      why.push(`نسبة نجاحك التاريخية في هذا النوع منخفضة (${learnedRate}٪) — تأكد من الاستعداد`);
    }
  } else {
    why.push('لا توجد بيانات تاريخية كافية — سيبدأ التعلم من هذا القرار');
  }

  // Mood reasons
  if (mood >= 7) {
    why.push(`مزاجك الجيد (${mood}/10) يساعدك على الإنجاز 😊`);
  } else if (mood < 4) {
    why.push(`مزاجك منخفض (${mood}/10) — قد تحتاج دعماً إضافياً اليوم 💙`);
  }

  // Risk reasons
  if (risk === 'high') {
    why.push('هذا الإجراء عالي المخاطرة — تأكيدك ضروري قبل التنفيذ 🔒');
  } else if (risk === 'low') {
    why.push('الإجراء آمن ومنخفض المخاطرة — يمكن التنفيذ تلقائياً ✔️');
  }

  // ── Confidence label ──────────────────────────────────────────────────────
  let confidenceLabel;
  if (confidence >= 80)      confidenceLabel = 'عالية جداً';
  else if (confidence >= 65) confidenceLabel = 'عالية';
  else if (confidence >= 50) confidenceLabel = 'متوسطة';
  else if (confidence >= 35) confidenceLabel = 'منخفضة';
  else                       confidenceLabel = 'منخفضة جداً';

  // ── Alternative suggestions ───────────────────────────────────────────────
  const alternatives = _buildAlternatives(action, { energy, mood, priority, confidence });

  // ── Factors breakdown ─────────────────────────────────────────────────────
  const factors = {
    energy  : { value: Math.round(energyFactor   * 100), weight: WEIGHTS.energy,   contribution: Math.round(WEIGHTS.energy   * energyFactor   * 100) },
    priority: { value: Math.round(priorityFactor * 100), weight: WEIGHTS.priority, contribution: Math.round(WEIGHTS.priority * priorityFactor * 100) },
    learning: { value: Math.round(learningFactor * 100), weight: WEIGHTS.learning, contribution: Math.round(WEIGHTS.learning * learningFactor * 100) },
    context : { value: Math.round(contextFactor  * 100), weight: WEIGHTS.context,  contribution: Math.round(WEIGHTS.context  * contextFactor  * 100) },
  };

  const result = {
    action,
    actionLabel    : actionMeta.label,
    confidence,
    confidenceLabel,
    why,
    factors,
    alternatives,
    risk,
    mode,
    rawScores      : { energyFactor, priorityFactor, learningFactor, contextFactor },
    computedAt     : new Date().toISOString(),
  };

  logger.debug(`[EXPLAINABILITY] ${action} → confidence=${confidence} (${confidenceLabel}), why=${why.length} reasons`);

  return result;
}

// ─── Build Alternatives ───────────────────────────────────────────────────────
function _buildAlternatives(action, { energy, mood, priority, confidence }) {
  const alternatives = [];

  if (confidence < 50) {
    alternatives.push({
      action     : 'delay',
      description: 'تأجيل التنفيذ حتى تتحسن الظروف',
    });
  }

  if (energy < 40 && action !== 'log_mood') {
    alternatives.push({
      action     : 'split_task',
      description: 'تقسيم المهمة إلى أجزاء أصغر وتنفيذ جزء واحد الآن',
    });
  }

  if (action === 'delete_task') {
    alternatives.push({
      action     : 'reschedule_task',
      description: 'إعادة الجدولة بدلاً من الحذف',
    });
    alternatives.push({
      action     : 'lower_priority',
      description: 'خفض الأولوية بدلاً من الحذف',
    });
  }

  if (action === 'complete_task' && energy < 50) {
    alternatives.push({
      action     : 'partial_complete',
      description: 'تسجيل تقدم جزئي (in_progress) بدلاً من إنجاز كامل',
    });
  }

  return alternatives;
}

// ─── Explain Proactive Notification ──────────────────────────────────────────
/**
 * Explain why a proactive notification was sent.
 *
 * @param {string} checkType   - 'energy_drop' | 'overdue_tasks' | 'burnout_risk' | etc.
 * @param {object} data        - data that triggered the check
 * @param {string} userId
 * @returns {object} ProactiveExplanation
 */
function explainProactiveNotification(checkType, data, userId) {
  const reasons = [];
  let confidence = 70;

  switch (checkType) {
    case 'energy_drop':
      reasons.push(`طاقتك انخفضت إلى ${data.energy || '?'}٪`);
      reasons.push('انخفاض الطاقة يؤثر على التركيز والإنجاز');
      confidence = Math.round(100 - (data.energy || 50));
      break;

    case 'mood_decline':
      reasons.push(`مزاجك اليوم (${data.mood || '?'}/10) أقل من المعتاد`);
      reasons.push('المزاج المنخفض يحتاج انتباهاً واهتماماً');
      confidence = Math.round((10 - (data.mood || 5)) * 10);
      break;

    case 'overdue_tasks':
      reasons.push(`لديك ${data.count || '?'} مهمة متأخرة عن موعدها`);
      reasons.push('المهام المتأخرة تسبب ضغطاً تراكمياً');
      confidence = Math.min(100, 50 + (data.count || 0) * 10);
      break;

    case 'habit_streak_break':
      reasons.push(`انكسرت سلسلة عادة "${data.habitName || '?'}"`);
      reasons.push('الحفاظ على الاتساق هو مفتاح بناء العادات');
      confidence = 75;
      break;

    case 'burnout_risk':
      reasons.push('الجمع بين طاقة منخفضة ومزاج متراجع يشير لخطر الإجهاد');
      if (data.energy) reasons.push(`طاقة ${data.energy}٪ + مزاج ${data.mood || '?'}/10`);
      confidence = Math.min(95, 60 + (data.signals || 0) * 10);
      break;

    case 'productivity_peak':
      reasons.push(`وصلت لمستوى إنتاجية ممتاز (${data.score || '?'}٪) 🎉`);
      confidence = Math.min(95, data.score || 70);
      break;

    default:
      reasons.push(`فحص دوري: ${checkType}`);
      confidence = 65;
  }

  // Add learning context
  const learnedRate = learning.getActionSuccessRate(userId, 'complete_task');
  if (learnedRate !== null && learnedRate > 70) {
    reasons.push(`سجلك يُظهر قدرتك على تجاوز هذه التحديات (${learnedRate}٪ نجاح)`);
    confidence = Math.min(100, confidence + 5);
  }

  return {
    checkType,
    confidence   : Math.min(100, Math.max(0, confidence)),
    why          : reasons,
    data,
    computedAt   : new Date().toISOString(),
  };
}

// ─── Batch Explain Multiple Decisions ────────────────────────────────────────
/**
 * Explain multiple decisions at once (for plan display).
 * Lazy-loads learning profile once for efficiency.
 *
 * @param {Array<object>} decisions
 * @param {string} userId
 * @returns {Array<object>}
 */
function explainBatch(decisions, userId) {
  return decisions.map(d => explainDecision({ ...d, userId }));
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  explainDecision,
  explainProactiveNotification,
  explainBatch,
  WEIGHTS,
};
