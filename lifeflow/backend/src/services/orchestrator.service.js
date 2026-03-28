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
// Use ai.client for multi-provider retry + cache (Gemini → Groq multi-model fallback)
const { chat: chatClient, buildIntelligentFallback } = require('./ai/ai.client');
const { chat: chatFallback }               = require('../ai/ai.service'); // backup if client fails

// ─── Lazy Service Loaders ─────────────────────────────────────────────────────
function getContextSnapshot() {
  try { return require('./context.snapshot.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './context.snapshot.service' not available: ${_e.message}`); return null; }
}
function getLearning() {
  try { return require('./learning.engine.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './learning.engine.service' not available: ${_e.message}`); return null; }
}
function getPrediction() {
  try { return require('./prediction.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './prediction.service' not available: ${_e.message}`); return null; }
}
function getPlanning() {
  try { return require('./planning.engine.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './planning.engine.service' not available: ${_e.message}`); return null; }
}
function getDecisionEngine() {
  try { return require('./decision.engine.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './decision.engine.service' not available: ${_e.message}`); return null; }
}
function getExplainability() {
  try { return require('./explainability.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './explainability.service' not available: ${_e.message}`); return null; }
}
function getDispatcher() {
  try { return require('./execution.dispatcher.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './execution.dispatcher.service' not available: ${_e.message}`); return null; }
}
function getPresenter() {
  try { return require('./assistant.presenter.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './assistant.presenter.service' not available: ${_e.message}`); return null; }
}
// Step 1+3: Add behavior and energy service loaders
function getBehaviorModel() {
  try { return require('./behavior.model.service'); } catch (_e) { return null; }
}
function getEnergyService() {
  try { return require('./energy.service'); } catch (_e) { return null; }
}
function getExecutionEngine() {
  try { return require('./execution.engine.service'); } catch (_e) { return null; }
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

  // Tasks — Phase 6: inject REAL task details
  if (ctx.tasks?.length > 0) {
    parts.push(`مهام معلقة: ${ctx.tasks.length}`);
    // List actual task titles so AI references them
    const taskList = ctx.tasks.slice(0, 5).map(t => {
      let info = `"${t.title}" (${t.priority || 'medium'})`;
      if (t.start_time) info += ` الساعة ${new Date(t.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}`;
      return info;
    }).join(' | ');
    parts.push(`قائمة المهام: ${taskList}`);
  }
  if (ctx.urgentTasks?.length > 0) {
    parts.push(`مهام عاجلة: ${ctx.urgentTasks.length} (${ctx.urgentTasks.slice(0, 3).map(t => t.title).join('، ')})`);
  }
  if (ctx.overdueTasks?.length > 0) {
    parts.push(`مهام متأخرة: ⚠️ ${ctx.overdueTasks.length} (${ctx.overdueTasks.slice(0, 2).map(t => t.title).join('، ')})`);
  }
  if (ctx.todayTasks?.length > 0) {
    parts.push(`مهام اليوم: ${ctx.todayTasks.length}`);
  }
  // Phase 6: completed today — prevents AI from suggesting done tasks
  if (ctx.completedToday?.length > 0) {
    parts.push(`مهام مكتملة اليوم: ${ctx.completedToday.length} (${ctx.completedToday.slice(0, 3).map(t => t.title).join('، ')})`);
  }
  // Phase 6: habits status
  if (ctx.habits?.length > 0) {
    parts.push(`عادات نشطة: ${ctx.habits.length}`);
    if (ctx.completedHabitCount > 0) {
      parts.push(`عادات مكتملة اليوم: ${ctx.completedHabitCount}/${ctx.habits.length}`);
    }
  }
  // Phase 6: current Cairo time
  const moment = require('moment-timezone');
  const cairoNow = moment().tz('Africa/Cairo');
  parts.push(`الوقت الحالي (القاهرة): ${cairoNow.format('HH:mm')} — ${cairoNow.format('dddd')}`);
  parts.push(`التاريخ: ${cairoNow.format('YYYY-MM-DD')}`);

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

  // Personalization (now includes profile + settings from ProfileView/SettingsView)
  if (profile) {
    const personBlock = buildPersonalizationBlock(profile, ctx);
    if (personBlock) parts.push(personBlock);
  }

  // Memory summary
  const memSummary = memory.buildMemorySummary(ctx.userId || '');
  if (memSummary) parts.push(memSummary);

  // History
  if (historyStr) {
    parts.push(`\nسياق المحادثة الأخيرة:\n${historyStr}`);
  }

  // Step 1+3: Behavior profile data
  // (injected via userCtx.behaviorInsights by the orchestrate function)
  if (ctx.behaviorInsights) {
    parts.push(`\nرؤى السلوك: ${ctx.behaviorInsights}`);
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
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

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
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

    // ── STEP 2b: Behavior Profile (Step 1+3 addition) ────────────────────────
    let behaviorInsights = null;
    try {
      const behaviorSvc = getBehaviorModel();
      if (behaviorSvc) {
        const profile = await behaviorSvc.getBehaviorProfile(userId);
        const patterns = await behaviorSvc.getBehaviorPatterns(userId);
        if (profile || patterns.length > 0) {
          const parts = [];
          if (profile?.focus_peak_hours?.length > 0) {
            parts.push(`ساعات الذروة: ${profile.focus_peak_hours.join(', ')}:00`);
          }
          if (profile?.data_quality) {
            parts.push(`جودة بيانات السلوك: ${profile.data_quality}`);
          }
          const procPattern = patterns.find(p => p.pattern_type === 'procrastination');
          if (procPattern && procPattern.correlation_score > 0.3) {
            parts.push(`تأجيل: ${procPattern.insight}`);
          }
          const workPattern = patterns.find(p => p.pattern_type === 'working_hours');
          if (workPattern) {
            parts.push(`${workPattern.insight}`);
          }
          if (parts.length > 0) {
            behaviorInsights = parts.join(' | ');
          }
        }
      }
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Behavior profile load failed: ${_e.message}`); }

    // ── STEP 3: Probabilistic Prediction ─────────────────────────────────────
    let prediction = null;
    try {
      const predService = getPrediction();
      if (predService) {
        prediction = await predService.getProbabilisticPrediction(userId, timezone);
      }
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

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
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

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
      } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }
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
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

    // ── STEP 7: Build Conversation Context ────────────────────────────────────
    const historyStr = memory.buildHistoryString(userId, 6);

    let profile = null;
    try { profile = await buildProfile(userId, timezone); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

    const contextBlock = buildContextBlock(
      { ...(userCtx || {}), userId, behaviorInsights },
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
        // Try ai.client first (Groq multi-model + Gemini fallback with cache)
        try {
          const response = await chatClient(systemPrompt, userMsgForAI, {
            temperature: mode === 'companion' ? 0.8 : mode === 'manager' ? 0.5 : 0.7,
            maxTokens  : 500,
          });
          return response;
        } catch (clientErr) {
          const errMsg = clientErr.message || '';
          logger.warn('[ORCHESTRATOR] ai.client failed:', errMsg);

          // If rate limited on ALL providers, use intelligent local fallback
          // (not the generic ai.service fallback which returns "شكراً لاستخدامك LifeFlow!")
          if (errMsg.includes('RATE_LIMIT_ALL') || errMsg.includes('ALL_PROVIDERS_FAILED')) {
            logger.info('[ORCHESTRATOR] Building intelligent local fallback for rate limit');
            // Use the user's original message + context to generate meaningful response
            const intelligentReply = buildIntelligentFallback(message, {
              intentCategory,
              mode,
              userName: userCtx?.name,
              tasks   : userCtx?.urgentTasks || [],
            });
            // Return as object to signal it's a soft fallback (contextual, not error)
            // We still return is_fallback=true so the frontend can optionally show a note
            throw Object.assign(new Error('INTELLIGENT_FALLBACK'), {
              intelligentReply,
            });
          }

          // For other errors, try ai.service as last resort
          logger.warn('[ORCHESTRATOR] Trying ai.service as last resort');
          const response = await chatFallback(systemPrompt, userMsgForAI, {
            temperature: mode === 'companion' ? 0.8 : mode === 'manager' ? 0.5 : 0.7,
            maxTokens  : 500,
          });
          return response;
        }
      },
      { userName: userCtx?.name, intentCategory }
    );

    // If safeExecute caught INTELLIGENT_FALLBACK error, reply will be the contextual message
    // (safeExecute classifies it as UNKNOWN and uses buildContextualFallback)
    // We need to check if we have a better intelligent reply available
    let finalReply = reply;
    let finalIsFallback = is_fallback;

    // Check if the reply is a generic error message — if so, build intelligent fallback
    const genericPhrases = [
      'حصل مشكلة مؤقتة',
      'حاول تاني',
      'نعالج طلبات كثيرة',
      'استغرق الرد',
      'تعذّر معالجة',
    ];
    const isGenericReply = genericPhrases.some(phrase => reply?.includes(phrase));

    if (isGenericReply || (is_fallback && reply === DEFAULT_FALLBACK)) {
      finalReply = buildIntelligentFallback(message, {
        intentCategory,
        mode,
        userName: userCtx?.name,
        tasks   : userCtx?.urgentTasks || [],
      });
      finalIsFallback = true; // Still mark as fallback — was not real AI
      logger.info('[ORCHESTRATOR] Replaced generic error with intelligent fallback');
    }

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
      } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }
    }

    // ── STEP 13: Store in Memory ──────────────────────────────────────────────
    memory.addShortTerm(userId, 'user', message, { intent: intentCategory, mode });
    memory.addShortTerm(userId, 'assistant', finalReply, { mode, is_fallback: !!finalIsFallback, confidence });
    memory.incrementStat(userId, 'totalMessages');

    // ── STEP 14: Record Outcome in Learning Engine ────────────────────────────
    if (!finalIsFallback) {
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
      } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }
    }

    // ── STEP 15: Policy Adaptation Check ─────────────────────────────────────
    try {
      const totalMessages = memory.getStats(userId)?.totalMessages || 0;
      if (totalMessages > 0 && totalMessages % 10 === 0) {
        adaptiveBehavior.adaptPolicy(userId);
      }
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

    const elapsed = Date.now() - startMs;

    logger.info('[ORCHESTRATOR] Full pipeline complete', {
      userId,
      mode,
      intentCategory,
      is_fallback       : !!finalIsFallback,
      used_intelligent  : finalIsFallback && reply !== finalReply,
      confidence,
      elapsed_ms        : elapsed,
      has_snapshot      : !!snapshot,
      has_learning      : !!learningProfile,
      has_prediction    : !!prediction,
    });

    return {
      reply       : finalReply,
      mode,
      actions,
      suggestions,
      is_fallback : !!finalIsFallback,
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
