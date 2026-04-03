/**
 * Unified Decision Service v2.0 — LifeFlow Behavior-Aware Core Brain
 * =====================================================================
 * Upgrade from Phase K → Phase L
 *
 * CHANGES from v1.0:
 *   1. FIXED: estimated_minutes → estimated_duration (matching actual DB schema)
 *   2. NEW: Behavior-aware scoring (avoidance, overwhelm, momentum, fake productivity)
 *   3. NEW: Non-linear scoring with signal interactions
 *   4. NEW: Behavior-centric rules replace simple urgency-centric rules
 *   5. NEW: Rich explanations with concrete "why" for each decision
 *   6. NEW: Proactive action commands (not passive suggestions)
 *   7. ENHANCED: ML signals weighted 35% (up from 25%)
 *   8. ENHANCED: Context scoring considers user behavioral state
 *
 * Architecture (unchanged):
 *   IntelligenceService (ML signals)
 *     ↓
 *   UnifiedDecisionService (deterministic rules + behavior analysis)
 *     ↓
 *   LLMOrchestrator (optional: explanation/coaching text)
 *
 * Decision Flow:
 *   1. Fetch intelligence signals (9 signals including momentum + overwhelm)
 *   2. Detect behavioral state (avoidance / overwhelm / productive / coasting)
 *   3. Load candidate tasks/habits
 *   4. Score candidates: behavior(0.35) + urgency(0.25) + priority(0.20) + context(0.20)
 *   5. Apply behavior-aware rules (not just simple overrides)
 *   6. Build actionable response with concrete why[], proactive next_steps
 */

'use strict';

const moment = require('moment-timezone');
const logger = require('../utils/logger');

// ─── Dependencies ──────────────────────────────────────────────────────────
function getModels() {
  try { return require('../config/database').sequelize.models; } catch (_e) { return {}; }
}
function getIntelligence() {
  try { return require('./intelligence.service'); } catch (_e) { return null; }
}
function getLLMOrchestrator() {
  try { return require('./llm.orchestrator.service'); } catch (_e) { return null; }
}
function getAdaptiveBehavior() {
  try { return require('./adaptive.behavior.service'); } catch (_e) { return null; }
}
function getUserModelService() {
  try { return require('./user.model.service'); } catch (_e) { return null; }
}
function getBehaviorEngine() {
  try { return require('./behavior.engine.service'); } catch (_e) { return null; }
}
function getGoalEngine() {
  try { return require('./goal.engine.service'); } catch (_e) { return null; }
}

// ─── Scoring Weights v2 — Behavior-centric ─────────────────────────────────
// Shift: behavior now has the highest weight (was 0 in v1)
// These are BASE weights — UserModel modifiers adjust them per user
const BASE_WEIGHTS = {
  behavior: 0.35,  // ML signals + behavioral state match
  urgency:  0.25,  // deadline pressure + overdue days
  priority: 0.20,  // user-assigned priority
  context:  0.20,  // time-of-day, habits, category alignment
};
// Legacy alias for external consumers
const WEIGHTS = BASE_WEIGHTS;

const PRIORITY_SCORES = { urgent: 100, high: 75, medium: 50, low: 25 };

// ─── Utility ───────────────────────────────────────────────────────────────
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

// ─── Phase P: Compute Per-User Effective Weights ──────────────────────────
/**
 * Adjusts the BASE_WEIGHTS using the user's model.
 * Different users get different weight distributions:
 *   - High-procrastination user → more behavior weight (to push behavior correction)
 *   - User who thrives under pressure → more urgency weight
 *   - Cold-start user → use BASE_WEIGHTS unchanged
 * Weights ALWAYS sum to 1.0
 */
function computeEffectiveWeights(userModifiers) {
  if (!userModifiers || userModifiers.model_confidence === 'cold_start') {
    return { ...BASE_WEIGHTS };
  }

  let b = BASE_WEIGHTS.behavior;
  let u = BASE_WEIGHTS.urgency;
  let p = BASE_WEIGHTS.priority;
  let c = BASE_WEIGHTS.context;

  // Apply behavior modifier (from UserModelService)
  const behaviorMod = userModifiers.behavior_weight_modifier || 0;
  b += behaviorMod;

  // Apply urgency modifier
  const urgencyMod = userModifiers.urgency_weight_modifier || 0;
  u += urgencyMod;

  // Energy-sensitive users get more behavior weight (energy matching matters more)
  b += userModifiers.energy_weight_boost || 0;

  // High habit consistency → slightly boost context (habit timing matters)
  if (userModifiers.habit_consistency > 75) {
    c += 0.03;
  }

  // Normalize to sum=1.0
  const total = b + u + p + c;
  return {
    behavior: Math.round((b / total) * 1000) / 1000,
    urgency:  Math.round((u / total) * 1000) / 1000,
    priority: Math.round((p / total) * 1000) / 1000,
    context:  Math.round((c / total) * 1000) / 1000,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// TASK SCORING v2 — Behavior-Aware
// ═══════════════════════════════════════════════════════════════════════════

function scoreTask(task, signals, ctx) {
  const { hour, todayStr, behaviorState, userModifiers } = ctx;
  const breakdown = {};

  // ── 1. Urgency Score (0–100) ────────────────────────────────────────────
  let urgency = 0;
  const due = task.due_date ? String(task.due_date).split('T')[0].split(' ')[0] : null;
  let daysUntil = null;
  if (due) {
    daysUntil = Math.floor((new Date(due) - new Date(todayStr)) / 86400000);
    if (daysUntil < 0) urgency = clamp(80 + Math.abs(daysUntil) * 4, 80, 100);
    else if (daysUntil === 0) urgency = 70;
    else if (daysUntil === 1) urgency = 50;
    else if (daysUntil <= 3) urgency = 35;
    else if (daysUntil <= 7) urgency = 20;
    else urgency = 10;
  } else {
    urgency = 25; // no due date → treat as somewhat important
  }

  // Time proximity boost
  if (task.start_time) {
    try {
      const taskHour = moment(task.start_time).tz(ctx.timezone).hour();
      const diff = Math.abs(taskHour - hour);
      if (diff <= 1) urgency = clamp(urgency + 20, 0, 100);
      else if (diff <= 2) urgency = clamp(urgency + 10, 0, 100);
    } catch (_e) { /* ignore */ }
  }
  breakdown.urgency = urgency;

  // ── 2. Priority Score (0–100) ───────────────────────────────────────────
  breakdown.priority = PRIORITY_SCORES[task.priority] || 50;

  // ── 3. Behavior Score (0–100) — THE KEY UPGRADE ─────────────────────────
  let behavior = 50; // neutral
  const energy = signals.energy_level?.value || 50;
  const focusScore = signals.focus_score?.value || 50;
  const completionProb = signals.completion_probability?.value || 0.5;
  const optimalType = signals.optimal_task_type?.value || 'light_task';
  const momentum = signals.momentum_state?.value || 'starting';
  const overwhelm = signals.overwhelm_index?.value || 0;
  const taskEnergy = task.energy_required || 'medium';
  const estDuration = task.estimated_duration || 30;
  const isDeepWork = task.priority === 'urgent' || task.priority === 'high'
    || (estDuration >= 45);
  const isQuickTask = estDuration <= 15;
  const isSmallTask = estDuration <= 10 || task.priority === 'low';

  // 3a. Energy-task match (non-linear)
  if (taskEnergy === 'high' && energy >= 70) behavior += 20;
  else if (taskEnergy === 'high' && energy >= 55) behavior += 5;
  else if (taskEnergy === 'high' && energy < 40) behavior -= 25; // STRONG penalty
  else if (taskEnergy === 'low' && energy < 40) behavior += 15;  // good match
  else if (taskEnergy === 'low' && energy >= 75) behavior -= 10; // waste of peak energy

  // 3b. Optimal task type match
  if (optimalType === 'deep_work' && isDeepWork) behavior += 18;
  else if (optimalType === 'quick_win' && isQuickTask) behavior += 20;
  else if (optimalType === 'light_task' && !isDeepWork) behavior += 10;
  else if (optimalType === 'structured_catchup' && daysUntil !== null && daysUntil < 0) behavior += 15;
  else if (optimalType === 'break') behavior -= 20;

  // 3c. Completion probability influence (non-linear via power curve)
  behavior += Math.round(Math.pow(completionProb, 0.7) * 20 - 10);

  // 3d. Focus alignment (non-linear)
  if (focusScore >= 70 && isDeepWork) behavior += 12;
  else if (focusScore < 35 && isDeepWork) behavior -= 15;
  else if (focusScore < 35 && isSmallTask) behavior += 8; // small task for unfocused time

  // 3e. Behavioral state adaptation
  if (momentum === 'avoidance' && isQuickTask) behavior += 25; // nudge toward easy start
  if (momentum === 'avoidance' && isDeepWork) behavior -= 15;  // don't push hard tasks during avoidance
  if (momentum === 'productive' && isDeepWork) behavior += 15;  // ride the momentum
  if (momentum === 'coasting' && isDeepWork) behavior += 20;   // push toward hard tasks
  if (momentum === 'coasting' && isSmallTask) behavior -= 10;  // stop doing easy stuff
  if (momentum === 'overwhelmed' && isQuickTask) behavior += 20; // small wins
  if (momentum === 'overwhelmed' && isDeepWork) behavior -= 20; // don't add pressure

  // 3f. Overwhelm dampening: when overwhelmed, reduce all scores slightly
  if (overwhelm > 0.6) {
    behavior -= Math.round(overwhelm * 10);
  }

  breakdown.behavior = clamp(behavior, 0, 100);

  // ── 4. Context Score (0–100) ────────────────────────────────────────────
  let context = 50;

  // Time-category matching
  const cat = (task.category || '').toLowerCase();
  if (hour >= 8 && hour <= 12 && isDeepWork) context += 12;
  if (hour >= 20 && !isDeepWork) context += 8;
  if (cat === 'study' && hour >= 8 && hour <= 14) context += 10;
  if (cat === 'exercise' && (hour >= 6 && hour <= 8 || hour >= 17 && hour <= 20)) context += 10;
  if (cat === 'personal' && hour >= 18) context += 5;
  if (cat === 'work' && hour >= 9 && hour <= 17) context += 8;

  // Duration appropriateness for time of day
  if (hour >= 21 && estDuration > 60) context -= 10; // long task late at night
  if (hour >= 9 && hour <= 11 && estDuration >= 30) context += 5; // morning = good for medium+ tasks

  breakdown.context = clamp(context, 0, 100);

  // ── 5. UserModel Personalization Adjustments ───────────────────────────
  if (userModifiers) {
    // Procrastinator boost for quick wins
    if (isQuickTask && userModifiers.quick_win_boost) {
      breakdown.behavior = clamp(breakdown.behavior + userModifiers.quick_win_boost, 0, 100);
    }
    // Procrastinator penalty for deep work
    if (isDeepWork && userModifiers.deep_work_penalty) {
      breakdown.behavior = clamp(breakdown.behavior + userModifiers.deep_work_penalty, 0, 100);
    }
    // Burnout: penalize long tasks
    if (estDuration > 45 && userModifiers.long_task_penalty) {
      breakdown.context = clamp(breakdown.context + userModifiers.long_task_penalty, 0, 100);
    }
    // Peak hour bonus
    if (userModifiers.peak_hour_bonus && userModifiers.is_peak_hour) {
      breakdown.context = clamp(breakdown.context + userModifiers.peak_hour_bonus, 0, 100);
    }
    // High performer gets harder tasks boosted
    if (isDeepWork && userModifiers.success_boost > 0) {
      breakdown.priority = clamp(breakdown.priority + userModifiers.success_boost, 0, 100);
    }
    // Suggestion dampening (if user ignores suggestions, reduce urgency)
    if (userModifiers.suggestion_dampen && userModifiers.suggestion_dampen !== 1.0) {
      breakdown.urgency = clamp(Math.round(breakdown.urgency * userModifiers.suggestion_dampen), 0, 100);
    }
  }

  // ── Weighted Total (per-user effective weights from UserModel) ──────────
  const ew = ctx._effectiveWeights || BASE_WEIGHTS;
  const total =
    breakdown.behavior * ew.behavior +
    breakdown.urgency  * ew.urgency +
    breakdown.priority * ew.priority +
    breakdown.context  * ew.context;

  return {
    total: parseFloat(total.toFixed(2)),
    breakdown,
    task_id: task.id,
    title: task.title,
    priority: task.priority,
    due_date: due,
    days_until_due: daysUntil,
    energy_required: task.energy_required,
    estimated_duration: task.estimated_duration,
    category: task.category,
    is_deep_work: isDeepWork,
    is_quick_task: isQuickTask,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// BEHAVIOR-AWARE RULE ENGINE v2
// Rules are driven by BEHAVIORAL STATE, not just raw thresholds
// ═══════════════════════════════════════════════════════════════════════════

function applyBehaviorRules(topCandidate, scoredTasks, signals, ctx) {
  const overrides = [];
  const burnout = signals.burnout_risk?.value || 0;
  const procrastination = signals.procrastination_risk?.value || 0;
  const energy = signals.energy_level?.value || 50;
  const momentum = signals.momentum_state?.value || 'starting';
  const overwhelm = signals.overwhelm_index?.value || 0;
  const optimalType = signals.optimal_task_type?.value || 'light_task';
  const focus = signals.focus_score?.value || 50;

  // ═══ Rule 1: BURNOUT PROTECTION (highest priority) ═══
  if (burnout >= 0.65) {
    const reason_ar = `مستوى الإرهاق ${Math.round(burnout * 100)}% — جسمك يحتاج راحة. خذ استراحة 15-20 دقيقة ثم ارجع بنشاط.`;
    overrides.push({
      rule: 'BURNOUT_PROTECT',
      action: 'take_break',
      reason: reason_ar,
      reason_en: `Burnout ${Math.round(burnout * 100)}% — your body needs rest before productive work`,
    });
    return {
      override: true,
      focus: {
        type: 'break',
        action: 'take_break',
        title: '💆 خذ استراحة الآن',
        message: reason_ar,
        next_steps: ['اشرب ماء أو مشروب دافئ', 'قم بمشي قصير 5 دقائق', 'بعد الراحة ابدأ بمهمة صغيرة'],
      },
      overrides,
    };
  }

  // ═══ Rule 2: OVERWHELM INTERVENTION ═══
  if (overwhelm >= 0.7 && momentum === 'overwhelmed') {
    const reason_ar = 'المهام كثيرة والطاقة منخفضة. ركّز على مهمة واحدة فقط وتجاهل الباقي مؤقتاً.';
    overrides.push({
      rule: 'OVERWHELM_INTERVENTION',
      action: 'single_focus',
      reason: reason_ar,
    });
    // Don't override the selection, but force picking the easiest viable task
    const quickWin = scoredTasks.find(t => t.is_quick_task && t.total > 20);
    if (quickWin && topCandidate && quickWin.task_id !== topCandidate.task_id) {
      return {
        override: true,
        focus: {
          type: 'task',
          id: quickWin.task_id,
          title: quickWin.title,
          action: 'start_task',
          priority: quickWin.priority,
          due_date: quickWin.due_date,
          estimated_duration: quickWin.estimated_duration,
          score: quickWin.total,
          breakdown: quickWin.breakdown,
          message: reason_ar,
          next_steps: [
            `ابدأ "${quickWin.title}" الآن — ${quickWin.estimated_duration || 10} دقيقة فقط`,
            'بعد إنجازها ستشعر بتحسن فوري',
            'ثم اختر المهمة التالية',
          ],
        },
        overrides,
      };
    }
  }

  // ═══ Rule 3: AVOIDANCE COUNTER — force small start ═══
  if (momentum === 'avoidance' && procrastination >= 0.5) {
    const quickTask = scoredTasks.find(t => t.is_quick_task || (t.estimated_duration && t.estimated_duration <= 15));
    if (quickTask && topCandidate && quickTask.task_id !== topCandidate.task_id) {
      overrides.push({
        rule: 'AVOIDANCE_COUNTER',
        reason: `سلوك تجنّبي — ابدأ بمهمة صغيرة "${quickTask.title}" لكسر الجمود`,
        reason_en: `Avoidance detected — start with quick task to break inertia`,
      });
      return {
        override: true,
        focus: {
          type: 'task',
          id: quickTask.task_id,
          title: quickTask.title,
          action: 'start_task',
          priority: quickTask.priority,
          due_date: quickTask.due_date,
          estimated_duration: quickTask.estimated_duration,
          score: quickTask.total,
          breakdown: quickTask.breakdown,
          message: `لاحظنا تأخير في البدء. ابدأ بـ"${quickTask.title}" — فقط ${quickTask.estimated_duration || 10} دقائق!`,
          next_steps: [
            `افتح "${quickTask.title}" وابدأ الآن`,
            'بعد إنهائها ستشعر بدفعة إنتاجية',
            'ثم انتقل للمهمة الأصعب',
          ],
        },
        overrides,
      };
    }
    // Even if no quick task found, still flag it
    overrides.push({
      rule: 'AVOIDANCE_DETECTED',
      reason: `سلوك تجنّبي (${Math.round(procrastination * 100)}%) — حاول البدء بأي شيء لمدة 5 دقائق فقط`,
    });
  }

  // ═══ Rule 4: FAKE PRODUCTIVITY (coasting) — push toward hard task ═══
  if (momentum === 'coasting') {
    const hardTask = scoredTasks.find(t =>
      t.is_deep_work && t.days_until_due !== null && t.days_until_due <= 1
    ) || scoredTasks.find(t => t.is_deep_work);
    if (hardTask && topCandidate && !topCandidate.is_deep_work) {
      overrides.push({
        rule: 'COASTING_NUDGE',
        reason: `أنت تنجز مهام سهلة فقط — حان وقت "${hardTask.title}"`,
        reason_en: 'Fake productivity detected — nudge toward meaningful work',
      });
      return {
        override: true,
        focus: {
          type: 'task',
          id: hardTask.task_id,
          title: hardTask.title,
          action: 'start_task',
          priority: hardTask.priority,
          due_date: hardTask.due_date,
          estimated_duration: hardTask.estimated_duration,
          score: hardTask.total,
          breakdown: hardTask.breakdown,
          message: `أنجزت مهام سهلة — الآن حان وقت "${hardTask.title}". ابدأها 10 دقائق فقط.`,
          next_steps: [
            `افتح "${hardTask.title}" وابدأ 10 دقائق`,
            'لا تفكر بإنهائها — فقط ابدأ',
            'الزخم الذي بنيته سيساعدك',
          ],
        },
        overrides,
      };
    }
  }

  // ═══ Rule 5: PEAK ENERGY OPTIMIZATION ═══
  if (energy >= 75 && focus >= 65 && topCandidate && !topCandidate.is_deep_work) {
    const hardTask = scoredTasks.find(t => t.is_deep_work && t.total > 30);
    if (hardTask) {
      overrides.push({
        rule: 'PEAK_ENERGY_REDIRECT',
        reason: `طاقتك عالية (${energy}%) — لا تضيّعها على مهام سهلة. "${hardTask.title}" أولى.`,
        reason_en: `Peak energy ${energy}% — redirecting to deep work "${hardTask.title}"`,
      });
    }
  }

  // ═══ Rule 6: OVERDUE CRITICAL — force execution ═══
  if (topCandidate && topCandidate.due_date) {
    const daysOverdue = Math.floor((new Date(ctx.todayStr) - new Date(topCandidate.due_date)) / 86400000);
    if (daysOverdue > 0 && (topCandidate.priority === 'urgent' || topCandidate.priority === 'high')) {
      overrides.push({
        rule: 'OVERDUE_CRITICAL',
        reason: `"${topCandidate.title}" متأخرة ${daysOverdue} يوم وأولويتها ${topCandidate.priority === 'urgent' ? 'عاجلة' : 'عالية'} — ابدأ الآن`,
        reason_en: `Critical overdue: "${topCandidate.title}" is ${daysOverdue} days late`,
      });
    }
  }

  // ═══ Rule 7: MOMENTUM RIDE — keep going ═══
  if (momentum === 'productive' && topCandidate && topCandidate.is_deep_work) {
    overrides.push({
      rule: 'MOMENTUM_RIDE',
      reason: `زخمك الإنتاجي ممتاز! "${topCandidate.title}" هي المهمة المثالية الآن.`,
      reason_en: 'Riding productive momentum — deep work is optimal',
    });
  }

  return { override: false, overrides };
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD RICH "WHY" EXPLANATIONS
// ═══════════════════════════════════════════════════════════════════════════

function buildRichWhy(topTask, signals, ctx, ruleOverrides) {
  const why = [];
  const energy = signals.energy_level?.value || 50;
  const focus = signals.focus_score?.value || 50;
  const momentum = signals.momentum_state?.value || 'starting';
  const overwhelm = signals.overwhelm_index?.value || 0;

  if (!topTask) return why;

  // 1. Deadline context (specific)
  if (topTask.due_date) {
    const daysUntil = topTask.days_until_due;
    if (daysUntil !== null && daysUntil < 0) {
      why.push(`⏰ "${topTask.title}" متأخرة ${Math.abs(daysUntil)} يوم — يجب البدء فوراً`);
    } else if (daysUntil === 0) {
      why.push(`📅 "${topTask.title}" مستحقة اليوم`);
    } else if (daysUntil === 1) {
      why.push(`📅 "${topTask.title}" مستحقة غداً`);
    }
  }

  // 2. Priority (with task name)
  if (topTask.priority === 'urgent') why.push(`🔴 أولوية عاجلة`);
  else if (topTask.priority === 'high') why.push(`🟠 أولوية عالية`);

  // 3. Energy explanation (specific, not generic)
  if (energy >= 75) {
    why.push(`⚡ طاقتك عالية (${energy}%) — أفضل وقت للمهام الصعبة`);
  } else if (energy >= 55) {
    why.push(`💪 طاقتك جيدة (${energy}%)`);
  } else if (energy < 35) {
    why.push(`😴 طاقتك منخفضة (${energy}%) — اخترنا مهمة تناسب حالتك`);
  }

  // 4. Focus explanation
  if (focus >= 70) {
    why.push(`🎯 تركيزك عالي (${focus}%) — استغله الآن`);
  } else if (focus < 35) {
    why.push(`📱 تركيزك منخفض — اخترنا مهمة قصيرة`);
  }

  // 5. Behavioral state (the human-like touch)
  if (momentum === 'productive') {
    why.push('🚀 أنت في زخم إنتاجي — استمر!');
  } else if (momentum === 'avoidance') {
    why.push('💡 لاحظنا تأخير — هذه مهمة سهلة للبداية');
  } else if (momentum === 'overwhelmed') {
    why.push('🧘 ركّز على هذه المهمة فقط وتجاهل الباقي مؤقتاً');
  } else if (momentum === 'coasting') {
    why.push('📈 حان وقت التحدي الحقيقي');
  }

  // 6. Overwhelm acknowledgment
  if (overwhelm >= 0.5) {
    why.push(`⚠️ الحمل عالي — لكن خطوة واحدة تكفي الآن`);
  }

  // 7. Rule-based reasons (with context)
  ruleOverrides.forEach(r => {
    if (!why.some(w => w.includes(r.reason.split('—')[0]?.trim()))) {
      why.push(r.reason);
    }
  });

  return why;
}

// ═══════════════════════════════════════════════════════════════════════════
// BUILD PROACTIVE NEXT STEPS
// ═══════════════════════════════════════════════════════════════════════════

function buildNextSteps(currentFocus, signals, ctx) {
  const steps = [];
  const momentum = signals.momentum_state?.value || 'starting';
  const energy = signals.energy_level?.value || 50;
  const estDuration = currentFocus.estimated_duration || 30;

  if (currentFocus.type === 'task') {
    steps.push(`ابدأ "${currentFocus.title}" الآن`);
    if (estDuration > 30) {
      steps.push(`قسّمها: ${Math.ceil(estDuration / 25)} جولات × 25 دقيقة`);
    }
    if (momentum === 'avoidance') {
      steps.push('ابدأ 5 دقائق فقط — الباقي سيأتي تلقائياً');
    }
    if (energy < 40) {
      steps.push('خذ استراحة قصيرة بعد الانتهاء');
    }
  } else if (currentFocus.type === 'habit') {
    steps.push(`أنجز عادة "${currentFocus.title}" الآن`);
    steps.push('حافظ على السلسلة!');
  } else if (currentFocus.type === 'break') {
    steps.push('اشرب ماء أو مشروب دافئ');
    steps.push('قم بمشي قصير أو تمدد');
    steps.push('بعد 15 دقيقة ارجع لأسهل مهمة');
  }

  return steps;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: getUnifiedDecision(userId, options)
// ═══════════════════════════════════════════════════════════════════════════

async function getUnifiedDecision(userId, options = {}) {
  const startMs = Date.now();
  const { timezone = 'Africa/Cairo', include_explanation = false } = options;

  const intelligence = getIntelligence();
  const models = getModels();
  const nowTz = moment().tz(timezone);
  const hour = nowTz.hour();
  const todayStr = nowTz.format('YYYY-MM-DD');
  const { Op } = require('sequelize');

  // ── Step 1: Get Intelligence Signals v2 ──────────────────────────────────
  let signals = {};
  if (intelligence) {
    try {
      signals = await intelligence.getIntelligenceSignals(userId, {
        timezone,
        energy: options.energy,
        mood: options.mood,
      });
    } catch (e) {
      logger.warn('[DECISION] Intelligence signals failed:', String(e.message).slice(0, 200));
    }
  }

  // Ensure signals have defaults
  const defSig = { value: 0.5, confidence: 'low', source: ['default'], factors: {} };
  signals.completion_probability = signals.completion_probability || defSig;
  signals.procrastination_risk   = signals.procrastination_risk || { ...defSig, value: 0.3 };
  signals.energy_level           = signals.energy_level || { ...defSig, value: 50 };
  signals.focus_score            = signals.focus_score || { ...defSig, value: 50 };
  signals.burnout_risk           = signals.burnout_risk || { ...defSig, value: 0.2 };
  signals.habit_strength         = signals.habit_strength || { ...defSig, value: 0.5 };
  signals.optimal_task_type      = signals.optimal_task_type || { value: 'light_task', confidence: 'low', source: ['default'], factors: {} };
  signals.momentum_state         = signals.momentum_state || { value: 'starting', description: '', actionHint: '', confidence: 'low', source: ['default'], factors: {} };
  signals.overwhelm_index        = signals.overwhelm_index || { ...defSig, value: 0.2 };

  const behaviorState = signals.momentum_state?.value || 'starting';

  // ── Step 1.5: Load UserModel modifiers (per-user personalization) ────────
  let userModifiers = null;
  const userModelSvc = getUserModelService();
  if (userModelSvc) {
    try {
      userModifiers = await userModelSvc.getDecisionModifiers(userId);
    } catch (e) {
      logger.debug('[DECISION] UserModel modifiers failed (non-critical):', String(e.message).slice(0, 100));
    }
  }

  // Compute effective weights (personalized per user from their model)
  const effectiveWeights = computeEffectiveWeights(userModifiers);

  const ctx = { userId, timezone, hour, todayStr, behaviorState, userModifiers, _effectiveWeights: effectiveWeights };

  // ── Step 2: Load candidates (tasks + behavior candidates) ──────────────
  // FIXED: use estimated_duration (actual column name), not estimated_minutes
  let tasks = [];
  let habits = [];
  let behaviorCandidates = [];

  if (models.Task) {
    try {
      const allPending = await models.Task.findAll({
        where: { user_id: userId, status: { [Op.in]: ['pending', 'in_progress'] } },
        attributes: ['id', 'title', 'priority', 'due_date', 'start_time', 'energy_required', 'estimated_duration', 'category', 'status'],
        order: [['due_date', 'ASC'], ['priority', 'ASC']],
        limit: 30,
        raw: true,
      });
      tasks = allPending;
    } catch (e) { logger.warn('[DECISION] Task load error:', String(e.message || e).slice(0, 200)); }
  }

  if (models.Habit) {
    try {
      const activeHabits = await models.Habit.findAll({
        where: { user_id: userId, is_active: true },
        attributes: ['id', 'name', 'name_ar', 'current_streak', 'target_time', 'preferred_time', 'frequency'],
        limit: 10,
        raw: true,
      });

      if (models.HabitLog) {
        const logs = await models.HabitLog.findAll({
          where: { user_id: userId, log_date: todayStr, completed: true },
          attributes: ['habit_id'],
          raw: true,
        });
        const doneIds = new Set(logs.map(l => l.habit_id));
        habits = activeHabits.filter(h => !doneIds.has(h.id));
      } else {
        habits = activeHabits;
      }
    } catch (e) { logger.debug('[DECISION] Habit load error:', String(e.message || e).slice(0, 200)); }
  }

  // ── Step 2.5: Load behavior candidates via BehaviorEngine ──────────────
  const behaviorEngSvc = getBehaviorEngine();
  if (behaviorEngSvc) {
    try {
      behaviorCandidates = await behaviorEngSvc.loadBehaviorCandidates(userId, signals, ctx);
    } catch (e) {
      logger.debug('[DECISION] BehaviorEngine load error (non-critical):', String(e.message).slice(0, 100));
    }
  }

  // ── Step 2.6: Load goal context for scoring boost ──────────────────────
  let goalContext = null;
  const goalEngSvc = getGoalEngine();
  if (goalEngSvc) {
    try {
      goalContext = await goalEngSvc.getGoalContext(userId, timezone);
    } catch (e) {
      logger.debug('[DECISION] GoalEngine context error (non-critical):', String(e.message).slice(0, 100));
    }
  }

  // ── Step 3: Score all task candidates (with per-user weights) ───────────
  const scoredTasks = tasks.map(t => {
    const scored = scoreTask(t, signals, ctx, effectiveWeights, userModifiers);
    // Goal linkage boost
    if (t.goal_id && goalContext) {
      const boost = goalEngSvc ? goalEngSvc.getGoalBoostForTask(t, goalContext) : 0;
      if (boost > 0) {
        scored.total = parseFloat((scored.total + boost * 0.3).toFixed(2));
        scored.goal_boost = boost;
      }
    }
    return scored;
  });
  scoredTasks.sort((a, b) => b.total - a.total);

  // ── Step 4: Check behavior candidates (replaces simple habit check) ────
  // BehaviorEngine already scored and filtered; pick top candidate
  let habitCandidate = null;
  let behaviorMeta = null;
  if (behaviorCandidates.length > 0) {
    const topBehavior = behaviorCandidates[0];
    // Behavior candidate competes with top task
    const topTaskScore = scoredTasks[0]?.total || 0;
    // Behaviors get a base boost of 10 (habit consistency is valuable)
    const behaviorEffectiveScore = topBehavior.score + 10;
    if (behaviorEffectiveScore >= topTaskScore * 0.85 || topBehavior.streak >= 5) {
      habitCandidate = {
        id: topBehavior.habit_id,
        name: topBehavior.habit_name,
        name_ar: topBehavior.habit_name,
        current_streak: topBehavior.streak,
        target_time: topBehavior.cue?.trigger_time,
        preferred_time: topBehavior.cue?.trigger_time,
      };
      behaviorMeta = {
        score: topBehavior.score,
        current_difficulty: topBehavior.current_difficulty,
        estimated_minutes: topBehavior.estimated_minutes,
        goal_id: topBehavior.goal_id,
        is_breaking_habit: topBehavior.is_breaking_habit,
        reward: topBehavior.reward,
      };
    }
  }
  // Fallback to simple habit check if no behavior candidates
  if (!habitCandidate) {
    for (const h of habits) {
      const targetTime = h.target_time || h.preferred_time;
      if (targetTime) {
        const hh = parseInt(targetTime.split(':')[0]);
        if (Math.abs(hour - hh) <= 1) {
          habitCandidate = h;
          break;
        }
      }
    }
    if (!habitCandidate && habits.length > 0) {
      const streakHabit = [...habits].sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0))[0];
      if ((streakHabit.current_streak || 0) >= 3) {
        habitCandidate = streakHabit;
      }
    }
  }

  // ── Step 5: Apply BEHAVIOR-AWARE rules ──────────────────────────────────
  const topTask = scoredTasks[0] || null;
  const ruleResult = applyBehaviorRules(topTask, scoredTasks, signals, ctx);

  // ── Step 6: Build final decision ────────────────────────────────────────
  let currentFocus;
  let why = [];
  let confidence;

  if (ruleResult.override) {
    currentFocus = ruleResult.focus;
    why = ruleResult.overrides.map(r => r.reason);
    confidence = 85;
    // Add next steps if not already present
    if (!currentFocus.next_steps) {
      currentFocus.next_steps = buildNextSteps(currentFocus, signals, ctx);
    }
  }
  else if (topTask) {
    const due = topTask.due_date;
    const daysUntil = topTask.days_until_due;
    const isOverdue = daysUntil !== null && daysUntil < 0;

    currentFocus = {
      type: 'task',
      id: topTask.task_id,
      title: topTask.title,
      action: 'start_task',
      priority: topTask.priority,
      due_date: due,
      energy_required: topTask.energy_required,
      estimated_duration: topTask.estimated_duration,
      category: topTask.category,
      score: topTask.total,
      breakdown: topTask.breakdown,
      is_deep_work: topTask.is_deep_work,
      is_quick_task: topTask.is_quick_task,
    };

    why = buildRichWhy(topTask, signals, ctx, ruleResult.overrides);

    // Confidence based on score gap + signal alignment
    const scoreGap = scoredTasks.length >= 2 ? topTask.total - scoredTasks[1].total : 20;
    confidence = clamp(Math.round(50 + scoreGap * 0.8 + (topTask.total / 100) * 20), 40, 95);

    // Proactive next steps
    currentFocus.next_steps = buildNextSteps(currentFocus, signals, ctx);
    // Add message
    currentFocus.message = why[0] || '';

    // Habit streak protection: override if habit at target time with long streak
    if (habitCandidate && (habitCandidate.current_streak || 0) >= 5) {
      const targetTime = habitCandidate.target_time || habitCandidate.preferred_time;
      if (targetTime) {
        const hh = parseInt(targetTime.split(':')[0]);
        if (Math.abs(hour - hh) === 0) {
          currentFocus = {
            type: 'habit',
            id: habitCandidate.id,
            title: habitCandidate.name_ar || habitCandidate.name,
            action: 'check_habit',
            streak: habitCandidate.current_streak,
            target_time: targetTime,
            message: `عادة "${habitCandidate.name_ar || habitCandidate.name}" الآن — سلسلة ${habitCandidate.current_streak} يوم!`,
            next_steps: [
              `أنجز "${habitCandidate.name_ar || habitCandidate.name}" الآن`,
              `حافظ على سلسلة ${habitCandidate.current_streak} يوم`,
              'بعدها ارجع للمهام',
            ],
          };
          why = [
            `🔥 سلسلة ${habitCandidate.current_streak} يوم — لا تقطعها!`,
            `⏰ الوقت المحدد: ${targetTime}`,
          ];
          confidence = 85;
        }
      }
    }
  }
  else if (habitCandidate) {
    currentFocus = {
      type: 'habit',
      id: habitCandidate.id,
      title: habitCandidate.name_ar || habitCandidate.name,
      action: 'check_habit',
      streak: habitCandidate.current_streak || 0,
      message: `خلّصت مهامك — حافظ على عادة "${habitCandidate.name_ar || habitCandidate.name}"`,
      next_steps: [
        `أنجز "${habitCandidate.name_ar || habitCandidate.name}"`,
        'استمر بالاتساق',
      ],
    };
    why = ['✅ خلّصت مهامك', `🔄 حافظ على عادة "${habitCandidate.name_ar || habitCandidate.name}"`];
    confidence = 70;
  }
  else {
    currentFocus = {
      type: 'celebration',
      action: 'review_plan',
      title: '🎉 يوم منجز!',
      message: 'أحسنت! خلّصت كل مهامك وعاداتك.',
      next_steps: ['كافئ نفسك بشيء تحبه', 'خطط لمهام غد', 'استرح وأعد شحن طاقتك'],
    };
    why = ['✅ كل المهام مكتملة', '🌟 إنجاز رائع'];
    confidence = 100;
  }

  // ── Build alternatives ──────────────────────────────────────────────────
  const alternatives = [];
  for (let i = 1; i < Math.min(4, scoredTasks.length); i++) {
    const alt = scoredTasks[i];
    alternatives.push({
      type: 'task',
      id: alt.task_id,
      title: alt.title,
      score: alt.total,
      priority: alt.priority,
      due_date: alt.due_date,
      estimated_duration: alt.estimated_duration,
      is_deep_work: alt.is_deep_work,
      is_quick_task: alt.is_quick_task,
    });
  }
  if (habitCandidate && currentFocus.type !== 'habit') {
    alternatives.push({
      type: 'habit',
      id: habitCandidate.id,
      title: habitCandidate.name_ar || habitCandidate.name,
      streak: habitCandidate.current_streak || 0,
    });
  }

  // ── Step 7: Optional LLM Explanation ────────────────────────────────────
  let explanation = null;
  if (include_explanation) {
    const llm = getLLMOrchestrator();
    if (llm) {
      try {
        explanation = await llm.explainDecision({
          currentFocus,
          why,
          signals: intelligence ? intelligence.summarizeSignals(signals) : {},
        });
      } catch (e) {
        logger.debug('[DECISION] LLM explanation failed (non-critical):', String(e.message).slice(0, 100));
      }
    }
  }

  // ── Step 8: Adaptive behavior recording ─────────────────────────────────
  const adaptive = getAdaptiveBehavior();
  let adaptiveAdjustments = null;
  if (adaptive) {
    try {
      const behavior = typeof adaptive.getBehavior === 'function' ? adaptive.getBehavior(userId) : null;
      if (behavior) {
        adaptiveAdjustments = {};

        // Low engagement → lower difficulty
        if (behavior.engagementScore < 0.3) {
          adaptiveAdjustments.difficulty = 'lowered';
          adaptiveAdjustments.reason = 'تفاعل منخفض — نقترح مهام أسهل';
          if (currentFocus.type === 'task' && currentFocus.is_deep_work) {
            const easierAlt = scoredTasks.find(t =>
              (t.is_quick_task || t.priority === 'medium' || t.priority === 'low') &&
              t.task_id !== currentFocus.id
            );
            if (easierAlt) {
              adaptiveAdjustments.nudge = {
                from: currentFocus.title,
                to: easierAlt.title,
                to_id: easierAlt.task_id,
                reason: 'مهمة أسهل تناسب مستوى تفاعلك الحالي',
              };
            }
          }
        }
        // High engagement → increase challenge
        else if (behavior.engagementScore > 0.8 && behavior.suggestionRate > 1.2) {
          adaptiveAdjustments.difficulty = 'increased';
          adaptiveAdjustments.reason = 'أداؤك ممتاز — نزيد التحدي!';
        }

        adaptiveAdjustments.suggestion_rate = behavior.suggestionRate;
        adaptiveAdjustments.engagement_score = Math.round(behavior.engagementScore * 100);
      }
    } catch (_e) { /* non-critical */ }

    try {
      adaptive.recordInteraction(userId, currentFocus.action || 'unknown', 'presented');
    } catch (_e) { /* non-critical */ }
  }

  // ── Step 9: Attach goal context to currentFocus ─────────────────────────
  if (currentFocus.id && goalEngSvc) {
    try {
      const actionGoal = await goalEngSvc.getGoalForAction(
        currentFocus.type, currentFocus.id, userId
      );
      if (actionGoal) {
        currentFocus.goal_context = actionGoal;
      }
    } catch (_e) { /* non-critical */ }
  }

  // Attach behavior metadata if current focus is a behavior/habit
  if (behaviorMeta && currentFocus.type === 'habit') {
    currentFocus.behavior_meta = behaviorMeta;
  }

  const result = {
    currentFocus,
    why,
    signalsUsed: intelligence ? intelligence.summarizeSignals(signals) : {},
    alternatives: alternatives.slice(0, 3),
    confidence,
    explanation,
    rules_applied: ruleResult.overrides.map(r => r.rule),
    adaptiveAdjustments,
    // v2: behavioral context
    behaviorState: {
      state: signals.momentum_state?.value,
      description: signals.momentum_state?.description,
      actionHint: signals.momentum_state?.actionHint,
    },
    // v3: UserModel personalization
    userModel: userModifiers ? {
      difficulty_level: userModifiers.difficulty_level,
      push_intensity: userModifiers.push_intensity,
      optimal_duration: userModifiers.optimal_duration,
      peak_hours: userModifiers.peak_hours,
      is_peak_hour: userModifiers.is_peak_hour,
      confidence: userModifiers.confidence,
      total_events: userModifiers.total_events,
      applied_modifiers: {
        quick_win_boost: userModifiers.quick_win_boost,
        deep_work_penalty: userModifiers.deep_work_penalty,
        break_boost: userModifiers.break_boost,
        suggestion_dampen: userModifiers.suggestion_dampen,
        success_boost: userModifiers.success_boost,
      },
    } : null,
    debug: {
      scored_tasks: scoredTasks.slice(0, 5).map(t => ({
        id: t.task_id,
        title: t.title,
        score: t.total,
        breakdown: t.breakdown,
        is_deep: t.is_deep_work,
        is_quick: t.is_quick_task,
      })),
      total_candidates: tasks.length,
      habit_candidates: habits.length,
      weights: effectiveWeights,
      base_weights: BASE_WEIGHTS,
      version: '3.0',
      computation_ms: Date.now() - startMs,
    },
    generated_at: new Date().toISOString(),
  };

  logger.info(`[DECISION] v2 user=${userId}: focus=${currentFocus.type}/${currentFocus.action} behavior=${behaviorState} confidence=${confidence}% tasks=${tasks.length} [${Date.now() - startMs}ms]`);
  return result;
}

module.exports = {
  getUnifiedDecision,
  scoreTask,
  applyBehaviorRules,
  computeEffectiveWeights,
  WEIGHTS,
  BASE_WEIGHTS,
};
