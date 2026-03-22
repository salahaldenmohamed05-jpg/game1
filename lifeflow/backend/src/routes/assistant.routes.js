/**
 * Life Assistant Routes — المساعد الشخصي التنفيذي (v2 Upgraded)
 * ================================================================
 * POST /api/v1/assistant/command           — process natural language command
 * POST /api/v1/assistant/chat              — orchestrated AI chat (returns {reply, mode, actions, suggestions})
 * GET  /api/v1/assistant/context           — get user's current life context
 * GET  /api/v1/assistant/autonomous        — get autonomous suggestions
 * GET  /api/v1/assistant/history           — conversation history (short-term memory)
 * POST /api/v1/assistant/clear             — clear conversation history
 * GET  /api/v1/assistant/monitor           — proactive engine alerts
 * POST /api/v1/assistant/execute-suggestion — execute an approved suggestion
 * POST /api/v1/assistant/interaction       — record user interaction with suggestion (adaptive)
 * GET  /api/v1/assistant/profile           — user personalization profile
 * GET  /api/v1/assistant/decisions         — decision engine audit log
 * POST /api/v1/assistant/decide            — evaluate and execute a proposed action
 */
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth.middleware');
const {
  processCommand,
  runAutonomousCheck,
  buildUserContext,
  getConversationHistory,
  clearConversation,
} = require('../services/ai.command.engine');
const { chatWithAI, fetchUserContext } = require('../services/conversation.service');
const { getProactiveMessages }         = require('../services/proactive.engine.service');
const orchestrator                     = require('../services/orchestrator.service');
const memory                           = require('../services/memory.service');
const adaptiveBehavior                 = require('../services/adaptive.behavior.service');
const decisionEngine                   = require('../services/decision.engine.service');
const { buildProfile }                 = require('../services/personalization.service');
const { DEFAULT_FALLBACK }             = require('../services/ai/ai.error.handler');
const logger                           = require('../utils/logger');

// In-memory session store (per user) — stores pending confirmations
const sessions = new Map();

router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant/command
// Main entry: receive user message, classify intent, execute, conversational reply
// ─────────────────────────────────────────────────────────────────────────────
router.post('/command', async (req, res) => {
  const { message, pending_action } = req.body;
  if (!message?.trim()) return res.status(400).json({ success: false, message: 'الرسالة مطلوبة' });

  const userId   = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';
  const session  = sessions.get(userId) || {};
  const pending  = pending_action || session.pendingAction || null;

  try {
    const result = await processCommand(userId, message, timezone, pending);

    // Update session
    if (result.needs_confirmation && result.pending_action) {
      sessions.set(userId, { pendingAction: result.pending_action });
    } else {
      sessions.set(userId, { pendingAction: null });
    }

    logger.info(`[ASSISTANT] user=${userId} intent=${result.intent} action=${result.action_taken?.action||'none'}`);

    res.json({
      success: true,
      data: {
        reply             : result.reply,
        action_taken      : result.action_taken,
        needs_confirmation: result.needs_confirmation,
        pending_action    : result.needs_confirmation ? result.pending_action : null,
        intent            : result.intent,
        suggestions       : result.suggestions || [],
        context_used      : result.context_used,
      }
    });
  } catch (e) {
    logger.error('[ASSISTANT] command error:', e.message);
    res.status(500).json({ success: false, message: 'خطأ في المساعد الذكي' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant/chat
// Orchestrated AI endpoint → { reply, mode, actions, suggestions }
// Uses full context: memory, personalization, energy/mood
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message?.trim()) return res.status(400).json({ success: false, message: 'الرسالة مطلوبة' });

  const userId   = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    // Fetch user context for enriched prompts
    let userCtx = null;
    try { userCtx = await fetchUserContext(userId, timezone); } catch (_) {}

    // Use orchestrator for full context-aware response
    const result = await orchestrator.companionChat(userId, message, timezone, userCtx);

    logger.info(`[ASSISTANT] chat orchestrated: user=${userId}, mode=${result.mode}, fallback=${result.is_fallback}`);

    res.json({
      success: true,
      data: {
        reply      : result.reply,
        mode       : result.mode,
        actions    : result.actions    || [],
        suggestions: result.suggestions || [],
        intent     : result.intentCategory,
        is_fallback: !!result.is_fallback,
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] chat error:', e.message);
    // Never crash — return fallback
    res.json({
      success: true,
      data: {
        reply      : DEFAULT_FALLBACK,
        mode       : 'hybrid',
        actions    : [],
        suggestions: ['أعد المحاولة', 'كيف طاقتي؟', 'وضعي اليوم'],
        is_fallback: true,
      },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /assistant/context
// Returns user's current life snapshot (tasks, mood, habits)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/context', async (req, res) => {
  try {
    const tz  = req.user.timezone || 'Africa/Cairo';
    const ctx = await buildUserContext(req.user.id, tz);

    const moment = require('moment-timezone');
    const hour   = moment().tz(tz).hour();
    const name   = req.user.name?.split(' ')[0] || 'صديقي';
    const greeting = hour < 6  ? `مرحباً ${name}، أنت صاحي بدري 🌙`
      : hour < 12 ? `صباح الخير ${name} ☀️`
      : hour < 17 ? `مساء النور ${name} 🌤️`
      :             `مساء الخير ${name} 🌙`;

    const todayTasks = ctx.recentTasks.filter(t => t.due_date === ctx.today);

    res.json({
      success: true,
      data: {
        ...ctx,
        greeting,
        hour,
        tasks_today   : todayTasks.length,
        tasks_pending : ctx.recentTasks.length,
        mood_today    : ctx.todayMood,
        habits_active : ctx.habits.length,
        recent_tasks  : ctx.recentTasks,
      }
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /assistant/autonomous
// Returns proactive suggestions the assistant noticed
// ─────────────────────────────────────────────────────────────────────────────
router.get('/autonomous', async (req, res) => {
  try {
    const tz          = req.user.timezone || 'Africa/Cairo';
    const suggestions = await runAutonomousCheck(req.user.id, tz);
    res.json({ success: true, data: { suggestions, count: suggestions.length } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /assistant/history
// Returns short-term conversation memory (last 10 messages)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/history', (req, res) => {
  try {
    // Try new memory service first
    const messages  = memory.getRecentMessages(req.user.id, 20);
    const stats     = memory.getShortTermStats(req.user.id);

    // Also try legacy conversation service
    let legacyHist = { history: [], turn_count: 0 };
    try { legacyHist = getConversationHistory(req.user.id); } catch (_) {}

    // Merge: prefer new memory if available
    const history    = messages.length > 0 ? messages : legacyHist.history;
    const turn_count = history.filter(m => m.role === 'user').length;

    res.json({ success: true, data: { history, turn_count, ...stats } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant/clear
// Clear conversation history (both memory service and legacy)
// ─────────────────────────────────────────────────────────────────────────────
router.post('/clear', (req, res) => {
  try {
    memory.clearShortTerm(req.user.id);

    // Also clear legacy
    try { clearConversation(req.user.id); } catch (_) {}
    sessions.delete(req.user.id);

    res.json({ success: true, data: { cleared: true } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /assistant/monitor
// Returns proactive engine alerts (uses new proactive.engine.service)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/monitor', async (req, res) => {
  try {
    const tz     = req.user.timezone || 'Africa/Cairo';
    const alerts = await getProactiveMessages(req.user.id, tz);
    res.json({ success: true, data: { alerts, count: alerts.length } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant/execute-suggestion
// Execute an autonomous suggestion that user approved
// ─────────────────────────────────────────────────────────────────────────────
router.post('/execute-suggestion', async (req, res) => {
  const { suggestion_type, action, task_ids, approve, suggestion } = req.body;

  // Support both old format (flat fields) and new format (suggestion object)
  const type    = suggestion_type || suggestion?.type;
  const ids     = task_ids || suggestion?.task_ids;
  const approved = approve !== undefined ? approve : true;

  if (!approved) return res.json({ success: true, data: { message: 'تم إلغاء الاقتراح' } });

  const Task    = require('../models/task.model');
  const moment  = require('moment-timezone');
  const tz      = req.user.timezone || 'Africa/Cairo';
  const today   = moment().tz(tz).format('YYYY-MM-DD');
  const tomorrow = moment().tz(tz).add(1,'day').format('YYYY-MM-DD');

  try {
    if ((type === 'overdue_tasks' || type === 'reschedule') && ids?.length) {
      await Task.update({ due_date: today }, { where: { id: ids, user_id: req.user.id } });
      return res.json({ success: true, data: { message: `✅ تم تحديث ${ids.length} مهمة لليوم`, updated: ids.length } });
    }
    if (type === 'overloaded_day' && ids?.length) {
      await Task.update({ due_date: tomorrow }, { where: { id: ids, user_id: req.user.id } });
      return res.json({ success: true, data: { message: `✅ تم نقل ${ids.length} مهمة لغد`, updated: ids.length } });
    }
    res.json({ success: true, data: { message: 'تم تنفيذ الاقتراح' } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant/interaction
// Record user interaction with a suggestion (for adaptive behavior)
// Body: { suggestion_type, action: 'accepted'|'ignored'|'rejected' }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/interaction', (req, res) => {
  const { suggestion_type, action = 'accepted' } = req.body;

  if (!suggestion_type) {
    return res.status(400).json({ success: false, message: 'suggestion_type مطلوب' });
  }

  try {
    const behavior = adaptiveBehavior.recordInteraction(req.user.id, suggestion_type, action);
    res.json({
      success: true,
      data: {
        recorded          : true,
        suggestion_rate   : Math.round(behavior.suggestionRate * 100),
        engagement_score  : Math.round(behavior.engagementScore * 100),
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /assistant/profile
// Returns user's personalization profile + engagement report
// ─────────────────────────────────────────────────────────────────────────────
router.get('/profile', async (req, res) => {
  try {
    const tz           = req.user.timezone || 'Africa/Cairo';
    const profile      = await buildProfile(req.user.id, tz);
    const engagement   = adaptiveBehavior.getEngagementReport(req.user.id);
    const memStats     = memory.getStats(req.user.id);

    res.json({
      success: true,
      data: {
        personalization : profile,
        engagement,
        memory_stats    : memStats,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /assistant/decisions
// Returns decision engine audit log for this user
// ─────────────────────────────────────────────────────────────────────────────
router.get('/decisions', (req, res) => {
  try {
    const log = decisionEngine.getDecisionLog(req.user.id, 20);
    res.json({ success: true, data: { decisions: log, count: log.length } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant/decide
// Evaluate and (optionally) execute a proposed action via decision engine
// Body: { action, payload, force_execute?, energy?, mood? }
// Phase 15: Now returns confidence, explanation (why[]), learningInsight, planningTip
// ─────────────────────────────────────────────────────────────────────────────
router.post('/decide', async (req, res) => {
  const { action, payload = {}, force_execute = false, energy, mood } = req.body;

  if (!action) {
    return res.status(400).json({ success: false, message: 'action مطلوب' });
  }

  try {
    const tz     = req.user.timezone || 'Africa/Cairo';
    const result = await decisionEngine.processProposal({
      action,
      payload,
      userId       : req.user.id,
      timezone     : tz,
      mode         : 'hybrid',
      forceExecute : force_execute,
      energy       : energy ?? 60,
      mood         : mood   ?? 5,
    });

    res.json({
      success: true,
      data: {
        executed             : result.executed,
        pending_confirmation : result.pending_confirmation,
        confirmation_message : result.confirmation_message,
        result               : result.result,
        decision             : {
          risk                 : result.decision.risk,
          reason               : result.decision.reason,
          should_auto_execute  : result.decision.shouldAutoExecute,
          requires_confirmation: result.decision.requiresConfirmation,
        },
        // Phase 15 additions (backward-compatible — new fields only)
        confidence      : result.confidence,
        explanation     : result.explanation,
        learningInsight : result.learningInsight,
        planningTip     : result.planningTip,
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] /decide error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant/auto-reschedule
// Propose auto-rescheduling of overdue tasks
// ─────────────────────────────────────────────────────────────────────────────
router.post('/auto-reschedule', async (req, res) => {
  try {
    const tz       = req.user.timezone || 'Africa/Cairo';
    const proposal = await decisionEngine.proposeAutoReschedule(req.user.id, tz);

    if (!proposal) {
      return res.json({ success: true, data: { proposal: null, message: 'لا توجد مهام متأخرة' } });
    }

    res.json({
      success: true,
      data: {
        proposal,
        confirmation_message: proposal.confirmationMessage,
        overdue_count       : proposal.count,
        task_titles         : proposal.taskTitles,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 15: GET /assistant/learning
// Get user's self-learning profile from the learning engine
// ─────────────────────────────────────────────────────────────────────────────
router.get('/learning', async (req, res) => {
  try {
    const learningEngine = require('../services/learning.engine.service');
    const profile = learningEngine.getUserLearningProfile(req.user.id);
    res.json({ success: true, profile });
  } catch (e) {
    logger.error('[ASSISTANT] /learning error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 15: GET /assistant/plan
// Get today's adaptive daily plan
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan', async (req, res) => {
  try {
    const planningEngine = require('../services/planning.engine.service');
    const conversationService = require('../services/conversation.service');
    const tz = req.user.timezone || 'Africa/Cairo';

    let ctx = {};
    try { ctx = await conversationService.buildUserContext(req.user.id, tz); } catch (_) {}

    const plan = await planningEngine.generateDailyPlan(req.user.id, { ...ctx, timezone: tz });
    res.json({ success: true, plan });
  } catch (e) {
    logger.error('[ASSISTANT] /plan error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 15: GET /assistant/plan/weekly
// Get this week's adaptive plan
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan/weekly', async (req, res) => {
  try {
    const planningEngine = require('../services/planning.engine.service');
    const tz = req.user.timezone || 'Africa/Cairo';
    const plan = await planningEngine.generateWeeklyPlan(req.user.id, { timezone: tz });
    res.json({ success: true, plan });
  } catch (e) {
    logger.error('[ASSISTANT] /plan/weekly error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 15: POST /assistant/explain
// Get explainable reasoning for any action
// Body: { action, energy?, mood?, priority?, risk?, overdueCount? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/explain', async (req, res) => {
  try {
    const explainability = require('../services/explainability.service');
    const { action = 'complete_task', energy, mood, priority, risk, overdueCount } = req.body;

    const explanation = explainability.explainDecision({
      action,
      userId      : req.user.id,
      energy      : energy ?? 60,
      mood        : mood   ?? 5,
      priority    : priority || 'medium',
      risk        : risk    || 'low',
      overdueCount: overdueCount || 0,
    });

    res.json({ success: true, explanation });
  } catch (e) {
    logger.error('[ASSISTANT] /explain error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 15: GET /assistant/metrics
// Get comprehensive AI + productivity metrics
// ─────────────────────────────────────────────────────────────────────────────
router.get('/metrics', async (req, res) => {
  try {
    const metricsService = require('../services/metrics.service');
    const tz = req.user.timezone || 'Africa/Cairo';
    const metrics = await metricsService.getUserMetrics(req.user.id, tz);
    res.json({ success: true, metrics });
  } catch (e) {
    logger.error('[ASSISTANT] /metrics error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 12: GET /assistant/timeline
// Chronological feed of AI insights, actions, and suggestions
// ─────────────────────────────────────────────────────────────────────────────
router.get('/timeline', async (req, res) => {
  try {
    const userId   = req.user.id;
    const tz       = req.user.timezone || 'Africa/Cairo';
    const limit    = Math.min(parseInt(req.query.limit) || 20, 50);

    const timelineItems = [];

    // ── 1. Conversation history (short-term memory) ───────────────────────────
    try {
      const memItems = memory.getHistory(userId, 8);
      memItems.forEach(m => {
        if (m.role === 'assistant' && m.content) {
          timelineItems.push({
            type      : 'ai_reply',
            category  : 'conversation',
            title     : 'رد المساعد',
            message   : m.content.slice(0, 120),
            icon      : '🤖',
            timestamp : m.ts || Date.now(),
            meta      : { mode: m.meta?.mode, is_fallback: m.meta?.is_fallback },
          });
        }
      });
    } catch (_) {}

    // ── 2. Decision engine log ────────────────────────────────────────────────
    try {
      const decisions = decisionEngine.getDecisionLog(userId, 6);
      decisions.forEach(d => {
        timelineItems.push({
          type      : 'decision',
          category  : 'action',
          title     : getActionLabel(d.action),
          message   : d.reason || d.action,
          icon      : getActionIcon(d.action),
          timestamp : new Date(d.ts).getTime(),
          meta      : { risk: d.risk, status: d.status, confidence: d.confidence },
        });
      });
    } catch (_) {}

    // ── 3. Learning engine insights ───────────────────────────────────────────
    try {
      const learningEngine = require('../services/learning.engine.service');
      const profile = learningEngine.getUserLearningProfile(userId);
      if (profile?.insights?.length > 0) {
        profile.insights.slice(0, 3).forEach(insight => {
          timelineItems.push({
            type      : 'insight',
            category  : 'learning',
            title     : 'رؤية مكتسبة',
            message   : insight,
            icon      : '💡',
            timestamp : Date.now() - 5 * 60 * 1000, // ~5m ago
            meta      : { source: 'learning_engine' },
          });
        });
      }
    } catch (_) {}

    // ── 4. Context snapshot signals ───────────────────────────────────────────
    try {
      const ctxService = require('../services/context.snapshot.service');
      const snapshot = await ctxService.getLatestSnapshot(userId, tz);
      if (snapshot?.signals?.length > 0) {
        snapshot.signals.slice(0, 3).forEach(sig => {
          timelineItems.push({
            type      : 'signal',
            category  : 'context',
            title     : sig.label || 'إشارة سياق',
            message   : sig.message || sig.label,
            icon      : sig.icon || '📡',
            timestamp : new Date(snapshot.generated_at).getTime(),
            meta      : { type: sig.type, severity: sig.severity },
          });
        });
      }
    } catch (_) {}

    // ── 5. Proactive monitoring alerts ────────────────────────────────────────
    try {
      const { getProactiveMessages } = require('../services/proactive.engine.service');
      const proactive = await getProactiveMessages(userId, tz);
      if (proactive?.length > 0) {
        proactive.slice(0, 3).forEach(p => {
          timelineItems.push({
            type      : 'alert',
            category  : 'proactive',
            title     : p.title || 'تنبيه',
            message   : p.message,
            icon      : p.icon || '🔔',
            timestamp : Date.now() - 2 * 60 * 1000,
            meta      : { priority: p.priority, action: p.action },
          });
        });
      }
    } catch (_) {}

    // ── 6. Virtual assistant history ──────────────────────────────────────────
    try {
      const vaService = require('../services/virtual.assistant.service');
      const vaHistory = vaService.getActionHistory(userId, 4);
      vaHistory.forEach(item => {
        timelineItems.push({
          type      : 'va_action',
          category  : 'virtual_assistant',
          title     : getActionLabel(item.action),
          message   : item.result?.summary || item.notes || item.action,
          icon      : '🤝',
          timestamp : new Date(item.ts).getTime(),
          meta      : { status: item.status, action_id: item.action_id },
        });
      });
    } catch (_) {}

    // ── Sort by timestamp descending, take limit ───────────────────────────────
    timelineItems.sort((a, b) => b.timestamp - a.timestamp);
    const timeline = timelineItems.slice(0, limit).map(item => ({
      ...item,
      timestamp: new Date(item.timestamp).toISOString(),
    }));

    res.json({
      success : true,
      timeline,
      count   : timeline.length,
      generated_at: new Date().toISOString(),
    });

  } catch (e) {
    logger.error('[ASSISTANT] /timeline error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: GET /assistant/policy — get AI autonomy policy
// Phase 8: POST /assistant/policy — set AI mode (passive/suggestive/active)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/policy', (req, res) => {
  try {
    const { getUserAutonomy, getUserAIMode } = require('../config/execution.policy');
    const adaptive = require('../services/adaptive.behavior.service');
    const policy   = adaptive.getPolicyStatus(req.user.id);
    res.json({ success: true, policy });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

router.post('/policy', (req, res) => {
  try {
    const { mode } = req.body; // 'passive' | 'suggestive' | 'active'
    if (!['passive', 'suggestive', 'active'].includes(mode)) {
      return res.status(400).json({ success: false, message: 'mode must be passive|suggestive|active' });
    }
    const { setUserAutonomy } = require('../config/execution.policy');
    const level = setUserAutonomy(req.user.id, mode);
    res.json({ success: true, level, mode });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 9: POST /assistant/dispatch — execute an action via dispatcher
// ─────────────────────────────────────────────────────────────────────────────
router.post('/dispatch', async (req, res) => {
  try {
    const { action, payload = {}, risk = 'low', confidence = 70 } = req.body;
    if (!action) return res.status(400).json({ success: false, message: 'action required' });

    const dispatcher = require('../services/execution.dispatcher.service');
    const result = dispatcher.dispatch({
      action,
      userId         : req.user.id,
      risk,
      policyLevel    : req.query.policy || 'suggestive',
      confidence,
      acceptanceRate : 60,
      payload,
    });

    res.json({ success: true, dispatch: result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10: POST /assistant/va/execute — virtual assistant execution
// ─────────────────────────────────────────────────────────────────────────────
router.post('/va/execute', async (req, res) => {
  try {
    const { action, instructions, priority = 'medium' } = req.body;
    if (!action) return res.status(400).json({ success: false, message: 'action required' });

    const vaService = require('../services/virtual.assistant.service');
    const result = await vaService.execute({
      action,
      instructions,
      priority,
      userId  : req.user.id,
      timezone: req.user.timezone || 'Africa/Cairo',
    });

    res.json({ success: true, result });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 11: GET /assistant/present — get AI output as UI-ready cards
// ─────────────────────────────────────────────────────────────────────────────
router.get('/present', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz     = req.user.timezone || 'Africa/Cairo';
    const presenter = require('../services/assistant.presenter.service');

    // Get orchestrator result for last context
    let orchestrated = null;
    try {
      const ctxService = require('../services/context.snapshot.service');
      const snapshot   = await ctxService.getLatestSnapshot(userId, tz);
      if (snapshot) {
        const learning  = require('../services/learning.engine.service');
        const profile   = learning.getUserLearningProfile(userId);
        orchestrated = {
          reply       : null,
          mode        : 'hybrid',
          actions     : [],
          suggestions : adaptiveBehavior.getAdaptiveSuggestions(userId, 'general'),
          is_fallback : false,
          snapshot,
          insights    : profile?.insights || [],
        };
      }
    } catch (_) {}

    if (!orchestrated) {
      return res.json({ success: true, cards: [], count: 0 });
    }

    const cards = presenter.presentOrchestrationResult(orchestrated);
    res.json({ success: true, cards, count: cards.length });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1: GET /assistant/snapshot — get latest context snapshot
// ─────────────────────────────────────────────────────────────────────────────
router.get('/snapshot', async (req, res) => {
  try {
    const ctxService = require('../services/context.snapshot.service');
    const tz = req.user.timezone || 'Africa/Cairo';
    const snapshot = await ctxService.getOrGenerateSnapshot(req.user.id, tz);
    res.json({ success: true, snapshot });
  } catch (e) {
    logger.error('[ASSISTANT] /snapshot error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Part B: GET /assistant/ml-predictions — ML self-learning predictions bundle
// Returns: task_completion_probability, burnout_risk, focus_score, best_focus_hours
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ml-predictions', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz     = req.user.timezone || 'Africa/Cairo';
    const learning = require('../services/learning.engine.service');

    // Get current context for ML predictions
    let context = { energy: 55, mood: 5, overdueCount: 0 };
    try {
      const ctxService = require('../services/context.snapshot.service');
      const snap = await ctxService.getSnapshot(userId, tz, false);
      if (snap) {
        context.energy       = snap.energy?.score || 55;
        context.mood         = snap.mood?.score   || 5;
        context.overdueCount = snap.tasks?.overdue || 0;
      }
    } catch (_) {}

    const mlPredictions = learning.getMLPredictions(userId, context);
    const profile       = learning.getUserLearningProfile(userId);

    res.json({
      success: true,
      data: {
        ...mlPredictions,
        insights      : profile.insights.slice(0, 5),
        learning_stats: {
          total_records   : profile.stats.totalRecords,
          optimal_hours   : profile.stats.optimalHours,
          suggestion_accept_rate: profile.stats.suggestionAcceptRate,
          best_action     : profile.stats.bestAction,
        },
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] /ml-predictions error:', e.message);
    // Always return something useful — never 500
    res.json({
      success: true,
      data: {
        task_completion_probability: 0.6,
        burnout_risk               : 0.3,
        focus_score                : 60,
        best_focus_hours           : [9, 10, 11],
        success_rates              : {},
        failure_patterns           : [],
        confidence                 : 'insufficient',
        data_points                : 0,
        insights                   : [],
        learning_stats             : {},
        computed_at                : new Date().toISOString(),
      },
    });
  }
});

// ─── Helper Functions ─────────────────────────────────────────────────────────
function getActionLabel(action) {
  const labels = {
    create_task    : 'إنشاء مهمة',
    complete_task  : 'إنجاز مهمة',
    reschedule_task: 'إعادة جدولة',
    delete_task    : 'حذف مهمة',
    auto_reschedule: 'جدولة تلقائية',
    log_mood       : 'تسجيل المزاج',
    check_in_habit : 'تسجيل عادة',
    schedule_meeting: 'جدولة اجتماع',
    follow_up      : 'متابعة',
    draft_message  : 'صياغة رسالة',
    research_topic : 'بحث موضوع',
  };
  return labels[action] || action || 'إجراء';
}

function getActionIcon(action) {
  const icons = {
    create_task    : '✅',
    complete_task  : '🎯',
    reschedule_task: '📅',
    delete_task    : '🗑️',
    auto_reschedule: '🔄',
    log_mood       : '😊',
    check_in_habit : '🔥',
    schedule_meeting: '📆',
    follow_up      : '📌',
    draft_message  : '✉️',
    research_topic : '🔍',
  };
  return icons[action] || '⚡';
}

module.exports = router;
