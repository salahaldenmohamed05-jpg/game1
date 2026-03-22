/**
 * Orchestrator Service — المنسق المركزي (Phase 13 — Full Layer Integration)
 * ==========================================================================
 * Central brain routing requests through the full AI pipeline:
 *
 *   Context Snapshot → Learning Engine → Prediction Engine
 *   → Planning Engine → Decision Engine → Explainability
 *   → Dispatcher → Execute → Feedback → Learn
 *
 * Returns unified response:
 *   { reply, mode, actions, suggestions, is_fallback,
 *     confidence, explanation, planningTip, snapshot }
 */

'use strict';

const logger          = require('../utils/logger');
const memory          = require('./memory.service');
const { buildProfile, buildPersonalizationBlock } = require('./personalization.service');
const adaptiveBehavior = require('./adaptive.behavior.service');
const { buildSystemPrompt, getSuggestions } = require('../config/personality.config');
const { safeExecute, DEFAULT_FALLBACK }    = require('./ai/ai.error.handler');
const { chat }                             = require('../ai/ai.service');

// ─── Lazy Service Loaders ─────────────────────────────────────────────────────
function getContextSnapshot() {
  try { return require('./context.snapshot.service'); } catch (_) { return null; }
}
function getLearning() {
  try { return require('./learning.engine.service'); } catch (_) { return null; }
}
function getPrediction() {
  try { return require('./prediction.service'); } catch (_) { return null; }
}
function getPlanning() {
  try { return require('./planning.engine.service'); } catch (_) { return null; }
}
function getDecisionEngine() {
  try { return require('./decision.engine.service'); } catch (_) { return null; }
}
function getExplainability() {
  try { return require('./explainability.service'); } catch (_) { return null; }
}
function getDispatcher() {
  try { return require('./execution.dispatcher.service'); } catch (_) { return null; }
}
function getPresenter() {
  try { return require('./assistant.presenter.service'); } catch (_) { return null; }
}

// ─── Mode Detection ───────────────────────────────────────────────────────────
function detectMode(message, intentCategory) {
  const lower = message.toLowerCase();

  const emotionalSignals = [
    'تعبان', 'تعب', 'حزين', 'ضغط', 'توتر', 'متضايق', 'مش حلو', 'زهقت',
    'كيف حالي', 'كيف أنا', 'مشاعر', 'خايف', 'قلق', 'وحيد',
    'tired', 'stressed', 'sad', 'anxious', 'feel',
  ];

  const actionSignals = [
    'اضف', 'أضف', 'ضيف', 'احذف', 'حذف', 'عدّل', 'أجّل', 'خلص',
    'سجّل', 'انتهيت', 'امتحان', 'جدول', 'مهمة', 'عادة',
    'create', 'delete', 'schedule',
  ];

  const hasEmotional = emotionalSignals.some(s => lower.includes(s));
  const hasAction    = actionSignals.some(s => lower.includes(s));

  if (hasEmotional && !hasAction) return 'companion';
  if (hasAction && !hasEmotional) return 'manager';
  if (intentCategory === 'advice')      return 'companion';
  if (intentCategory === 'task_action') return 'manager';
  return 'hybrid';
}

// ─── Context Block Builder ────────────────────────────────────────────────────
function buildContextBlock(ctx, profile, historyStr, snapshot = null, learningProfile = null, prediction = null) {
  const parts = [];

  // User basics
  parts.push(`الاسم: ${ctx.name || 'صديقي'}`);
  parts.push(`التوقيت: ${ctx.greeting || 'مرحباً'}`);
  parts.push(`الطاقة: ${ctx.energy || 55}/100`);
  parts.push(`المزاج اليوم: ${ctx.todayMood ? ctx.todayMood + '/10' : 'لم يُسجَّل'}`);
  parts.push(`الإنتاجية (7 أيام): ${ctx.productivity || 55}/100`);

  // Tasks
  if (ctx.tasks?.length > 0) {
    parts.push(`مهام معلقة: ${ctx.tasks.length}`);
  }
  if (ctx.urgentTasks?.length > 0) {
    parts.push(`مهام عاجلة: ${ctx.urgentTasks.length} (${ctx.urgentTasks.slice(0, 2).map(t => t.title).join('، ')})`);
  }
  if (ctx.overdueTasks?.length > 0) {
    parts.push(`مهام متأخرة: ⚠️ ${ctx.overdueTasks.length}`);
  }

  // Context snapshot signals
  if (snapshot?.signals?.length > 0) {
    const sigTexts = snapshot.signals.slice(0, 2).map(s => s.label || s.message).join('، ');
    parts.push(`إشارات: ${sigTexts}`);
  }

  // Learning insights
  if (learningProfile?.insights?.length > 0) {
    parts.push(`رؤى التعلم: ${learningProfile.insights[0]}`);
  }
  if (learningProfile?.optimal_hour !== null && learningProfile?.optimal_hour !== undefined) {
    parts.push(`أفضل وقت للإنجاز: الساعة ${learningProfile.optimal_hour}:00`);
  }

  // Predictions
  if (prediction) {
    if (prediction.burnout_risk > 0.6) {
      parts.push(`⚠️ خطر الإجهاد: ${Math.round(prediction.burnout_risk * 100)}%`);
    }
    if (prediction.task_completion_probability < 0.4) {
      parts.push(`📉 احتمالية إتمام المهام منخفضة: ${Math.round(prediction.task_completion_probability * 100)}%`);
    }
  }

  // Personalization
  if (profile) {
    const personBlock = buildPersonalizationBlock(profile);
    if (personBlock) parts.push(personBlock);
  }

  // Memory summary
  const memSummary = memory.buildMemorySummary(ctx.userId || '');
  if (memSummary) parts.push(memSummary);

  // History
  if (historyStr) {
    parts.push(`\nسياق المحادثة الأخيرة:\n${historyStr}`);
  }

  return parts.join('\n');
}

// ─── Full Pipeline Orchestration ──────────────────────────────────────────────
/**
 * Full AI pipeline: Context → Learning → Prediction → Planning → Decision → Explain → Dispatch
 *
 * @returns {{ reply, mode, actions, suggestions, is_fallback, confidence, explanation, planningTip, snapshot }}
 */
async function orchestrate({
  userId,
  message,
  timezone     = 'Africa/Cairo',
  actionResult  = null,
  actionSummary = null,
  intentCategory = 'general',
  userCtx       = null,
}) {
  const startMs = Date.now();

  try {
    const mode = detectMode(message, intentCategory);

    // ── STEP 1: Context Snapshot ──────────────────────────────────────────────
    let snapshot = null;
    try {
      const ctxService = getContextSnapshot();
      if (ctxService) {
        snapshot = await ctxService.getOrGenerateSnapshot(userId, timezone);
      }
    } catch (_) {}

    // ── STEP 2: Learning Engine ───────────────────────────────────────────────
    let learningProfile = null;
    try {
      const learning = getLearning();
      if (learning) {
        learningProfile = learning.getUserLearningProfile(userId);
        // Record this decision event
        learning.recordDecision(userId, {
          action : intentCategory,
          risk   : 'low',
          energy : snapshot?.energy?.score || userCtx?.energy || 55,
          mood   : snapshot?.mood?.score   || userCtx?.todayMood || 5,
          mode,
          intent : intentCategory,
        });
      }
    } catch (_) {}

    // ── STEP 3: Probabilistic Prediction ─────────────────────────────────────
    let prediction = null;
    try {
      const predService = getPrediction();
      if (predService) {
        prediction = await predService.getProbabilisticPrediction(userId, timezone);
      }
    } catch (_) {}

    // ── STEP 4: Planning Hint (async, non-blocking) ───────────────────────────
    let planningTip = null;
    try {
      const planning = getPlanning();
      if (planning && mode !== 'companion') {
        const plan = await planning.generateDailyPlan(userId, {
          timezone,
          energy     : snapshot?.energy?.score || 55,
          tasks      : userCtx?.tasks          || [],
          overdueTasks: userCtx?.overdueTasks  || [],
        });
        if (plan?.suggestions?.length > 0) {
          planningTip = plan.suggestions[0];
        }
      }
    } catch (_) {}

    // ── STEP 5: Decision Evaluation (for action enrichment) ───────────────────
    let decisionResult = null;
    let confidence     = 70;
    if (mode === 'manager' && intentCategory === 'task_action') {
      try {
        const engine = getDecisionEngine();
        if (engine) {
          decisionResult = engine.decide({
            action     : actionResult?.action || intentCategory,
            payload    : actionResult?.task   || {},
            userId,
            mode,
            energy     : snapshot?.energy?.score || 55,
            mood       : snapshot?.mood?.score   || 5,
            priority   : actionResult?.task?.priority || 'medium',
            itemCount  : 1,
          });
          confidence = decisionResult?.confidence || 70;
        }
      } catch (_) {}
    }

    // ── STEP 6: Explainability ────────────────────────────────────────────────
    let explanation = null;
    try {
      const explSvc = getExplainability();
      if (explSvc && (decisionResult || mode !== 'companion')) {
        const explResult = explSvc.explainDecision({
          action      : actionResult?.action || intentCategory,
          userId,
          energy      : snapshot?.energy?.score || 55,
          mood        : snapshot?.mood?.score   || 5,
          priority    : actionResult?.task?.priority || 'medium',
          risk        : decisionResult?.risk || 'low',
          overdueCount: userCtx?.overdueTasks?.length || 0,
        });
        explanation = explResult?.why || [];
        if (explResult?.confidence) confidence = explResult.confidence;
      }
    } catch (_) {}

    // ── STEP 7: Build Conversation Context ────────────────────────────────────
    const historyStr = memory.buildHistoryString(userId, 6);

    let profile = null;
    try { profile = await buildProfile(userId, timezone); } catch (_) {}

    const contextBlock = buildContextBlock(
      { ...(userCtx || {}), userId },
      profile,
      historyStr,
      snapshot,
      learningProfile,
      prediction
    );

    // ── STEP 8: Build System Prompt ───────────────────────────────────────────
    const systemPrompt = buildSystemPrompt({
      mode,
      intentCategory,
      tone        : profile?.preferredTone || 'supportive',
      contextBlock,
    });

    // ── STEP 9: Call AI ───────────────────────────────────────────────────────
    let userMsgForAI = message;

    if (actionSummary) {
      userMsgForAI = `[تم تنفيذ: ${actionSummary}]\n\nالمستخدم قال: ${message}`;
    } else if (actionResult && !actionResult.success) {
      userMsgForAI = `[محاولة تنفيذ فشلت: ${actionResult.message || ''}]\n\nالمستخدم قال: ${message}`;
    } else if (historyStr) {
      userMsgForAI = `[سياق:\n${historyStr}]\n\nالمستخدم الآن: ${message}`;
    }

    // Add planning tip to message if available
    if (planningTip && mode !== 'companion') {
      userMsgForAI += `\n\n[تلميح تخطيط: ${planningTip}]`;
    }

    const { reply, is_fallback } = await safeExecute(
      async () => {
        const response = await chat(systemPrompt, userMsgForAI, {
          temperature: mode === 'companion' ? 0.8 : mode === 'manager' ? 0.5 : 0.7,
          maxTokens  : 500,
        });
        return response;
      },
      { userName: userCtx?.name, intentCategory }
    );

    // ── STEP 10: Adaptive Suggestions ────────────────────────────────────────
    const suggestions = adaptiveBehavior.getAdaptiveSuggestions(userId, intentCategory);

    // ── STEP 11: Build Actions Array ──────────────────────────────────────────
    const actions = [];
    if (actionResult?.success && actionResult?.task) {
      actions.push({ type: 'task_created', data: actionResult.task });
    }
    if (actionResult?.success && actionResult?.count > 0 && !actionResult?.task) {
      actions.push({ type: actionResult.action || 'update', count: actionResult.count });
    }

    // ── STEP 12: Dispatch (for tracking, non-blocking) ────────────────────────
    if (actions.length > 0) {
      try {
        const dispatcher = getDispatcher();
        if (dispatcher) {
          const dispatched = dispatcher.dispatch({
            action        : actions[0].type,
            userId,
            risk          : decisionResult?.risk || 'low',
            policyLevel   : 'suggestive',
            confidence,
            acceptanceRate: learningProfile?.suggestion_accept_rate || 60,
            payload       : actions[0].data || {},
          });
          if (dispatched) {
            actions[0]._dispatch = { executor: dispatched.executor, auto: dispatched.auto_execute };
          }
        }
      } catch (_) {}
    }

    // ── STEP 13: Store in Memory ──────────────────────────────────────────────
    memory.addShortTerm(userId, 'user', message, { intent: intentCategory, mode });
    memory.addShortTerm(userId, 'assistant', reply, { mode, is_fallback: !!is_fallback, confidence });
    memory.incrementStat(userId, 'totalMessages');

    // ── STEP 14: Record Outcome in Learning Engine ────────────────────────────
    if (!is_fallback) {
      try {
        const learning = getLearning();
        if (learning) {
          learning.recordOutcome(userId, {
            action   : intentCategory,
            success  : true,
            energy   : snapshot?.energy?.score || 55,
            mood     : snapshot?.mood?.score   || 5,
          });
        }
      } catch (_) {}
    }

    // ── STEP 15: Policy Adaptation Check ─────────────────────────────────────
    try {
      const totalMessages = memory.getStats(userId)?.totalMessages || 0;
      if (totalMessages > 0 && totalMessages % 10 === 0) {
        adaptiveBehavior.adaptPolicy(userId);
      }
    } catch (_) {}

    const elapsed = Date.now() - startMs;

    logger.info('[ORCHESTRATOR] Full pipeline complete', {
      userId,
      mode,
      intentCategory,
      is_fallback : !!is_fallback,
      confidence,
      elapsed_ms  : elapsed,
      has_snapshot: !!snapshot,
      has_learning: !!learningProfile,
      has_prediction: !!prediction,
    });

    return {
      reply,
      mode,
      actions,
      suggestions,
      is_fallback   : !!is_fallback,
      intentCategory,
      confidence,
      explanation   : explanation || [],
      planningTip,
      snapshot      : snapshot ? {
        energy : snapshot.energy,
        mood   : snapshot.mood,
        signals: snapshot.signals?.slice(0, 3) || [],
      } : null,
      prediction    : prediction ? {
        task_completion_probability: prediction.task_completion_probability,
        burnout_risk               : prediction.burnout_risk,
        focus_score                : prediction.focus_score,
      } : null,
      pipeline_ms   : elapsed,
    };

  } catch (err) {
    logger.error('[ORCHESTRATOR] Critical error:', err.message);

    return {
      reply      : DEFAULT_FALLBACK,
      mode       : 'hybrid',
      actions    : [],
      suggestions: getSuggestions('default'),
      is_fallback: true,
      confidence : 0,
      explanation: [],
      planningTip: null,
      snapshot   : null,
      prediction : null,
      error      : err.message,
    };
  }
}

// ─── Quick Companion Mode ─────────────────────────────────────────────────────
async function companionChat(userId, message, timezone, userCtx = null) {
  return orchestrate({
    userId,
    message,
    timezone,
    actionResult  : null,
    actionSummary : null,
    intentCategory: detectIntentCategory(message),
    userCtx,
  });
}

// ─── Intent Classifier ───────────────────────────────────────────────────────
function detectIntentCategory(message) {
  const lower = message.toLowerCase().trim();

  const taskPatterns = [
    'اضف','أضف','ضيف','ضف','عندي مهمة','لازم','محتاج','اعمل مهمة',
    'خلص','انتهيت','عملت','أجّل','أجل','أخّر','احذف','حذف','ألغِ',
    'مهمة','task','امتحان','اختبار','مذاكرة','جدول','خطة','نظم',
    'ذكّرني','سجّل','طاقتي',
  ];

  const advicePatterns = [
    'نصيحة','نصائح','اقتراح','مساعدة','ساعدني','كيف أتحسن','كيف أرفع',
    'تعبان','تعب','ضغط','توتر','مش قادر','زهقت',
  ];

  const questionPatterns = [
    'ما','ماذا','كيف','هل','متى','أين','من','ليه','لماذا','?','؟','شرح','اشرح',
  ];

  if (taskPatterns.some(p => lower.includes(p)))   return 'task_action';
  if (advicePatterns.some(p => lower.includes(p))) return 'advice';
  if (questionPatterns.some(p => lower.includes(p))) return 'question';
  return 'general';
}

module.exports = {
  orchestrate,
  companionChat,
  detectMode,
  detectIntentCategory,
  buildContextBlock,
};
