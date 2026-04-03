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
const { writeLimiter } = require('../middleware/rateLimiter');
const { body } = require('express-validator');
const { handleValidation } = require('../middleware/validators');

// ─── Assistant input validators ─────────────────────────────────────────────
const validateMessage = [
  body('message').trim().notEmpty().withMessage('الرسالة مطلوبة').isLength({ max: 5000 }).withMessage('الرسالة طويلة جداً'),
  handleValidation,
];
// Phase B: Use ai.core.service as SINGLE AI entry point (internal modules are NOT entry points)
const aiCore = require('../services/ai.core.service');
const assistantSvc = require('../services/assistant.service');
// Legacy aliases for backward compatibility within this file
const processCommand         = (uid, msg, tz, pending) => aiCore.command(uid, msg, tz, pending);
const runAutonomousCheck     = (uid, tz) => aiCore.autonomous(uid, tz);
const buildUserContext       = (uid, tz) => aiCore.context(uid, tz);
const getConversationHistory = (uid) => aiCore.history(uid);
const clearConversation      = (uid) => aiCore.clearHistory(uid);
const fetchUserContext       = (uid, tz) => aiCore.fetchUserContext(uid, tz);
const getProactiveMessages   = (uid, tz) => aiCore.proactive(uid, tz);
const memory                           = require('../services/memory.service');
const adaptiveBehavior                 = require('../services/adaptive.behavior.service');
const decisionEngine                   = require('../services/decision.engine.service');
const { buildProfile }                 = require('../services/personalization.service');
const { DEFAULT_FALLBACK }             = require('../services/ai/ai.error.handler');

// Phase 16 — Scheduling Engine
function getScheduler() {
  try { return require('../services/scheduling.engine.service'); } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Module '../services/scheduling.engine.service' not available: ${_e.message}`); return null; }
}
// Phase 16 — Next Best Action
function getNextAction() {
  try { return require('../services/next.action.service'); } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Module '../services/next.action.service' not available: ${_e.message}`); return null; }
}
// Phase 16 — Life Feed
function getLifeFeed() {
  try { return require('../services/life.feed.service'); } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Module '../services/life.feed.service' not available: ${_e.message}`); return null; }
}
// Phase 16 — Task Decomposition
function getDecomposer() {
  try { return require('../services/task.decomposition.service'); } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Module '../services/task.decomposition.service' not available: ${_e.message}`); return null; }
}
const logger                           = require('../utils/logger');

// In-memory session store (per user) — stores pending confirmations
const sessions = new Map();

router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant/command
// Main entry: receive user message, classify intent, execute, conversational reply
// Phase 16: persists messages to ChatSession/ChatMessage DB + returns confidence/explanation
// ─────────────────────────────────────────────────────────────────────────────
router.post('/command', writeLimiter, validateMessage, async (req, res) => {
  const { message, pending_action, session_id } = req.body;

  const userId   = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';
  const session  = sessions.get(userId) || {};
  const pending  = pending_action || session.pendingAction || null;

  try {
    // Step 5: Retry logic with structured error handling
    let result = null;
    let lastError = null;
    const MAX_RETRIES = 2;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        result = await processCommand(userId, message, timezone, pending);
        break; // Success — exit retry loop
      } catch (err) {
        lastError = err;
        logger.warn(`[ASSISTANT] command attempt ${attempt + 1} failed: ${err.message}`);
        if (attempt < MAX_RETRIES) {
          // Wait before retry (200ms, 500ms)
          await new Promise(r => setTimeout(r, (attempt + 1) * 250));
        }
      }
    }

    // If all retries failed, build a meaningful fallback
    if (!result) {
      const errorType = lastError?.message?.includes('RATE_LIMIT') ? 'rate_limit'
        : lastError?.message?.includes('timeout') ? 'timeout'
        : 'internal';

      const fallbackMessages = {
        rate_limit: 'نعالج عدد كبير من الطلبات الآن. يرجى المحاولة بعد دقيقة.',
        timeout: 'استغرق الرد وقتاً أطول من المتوقع. حاول مرة أخرى.',
        internal: 'حدث خطأ مؤقت. جرّب إعادة صياغة رسالتك أو المحاولة لاحقاً.',
      };

      result = {
        reply: fallbackMessages[errorType],
        action_taken: null,
        needs_confirmation: false,
        pending_action: null,
        intent: 'error_fallback',
        suggestions: ['ابدأ يومي', 'عاداتي', 'مهامي'],
        is_fallback: true,
        confidence: 0,
        error_type: errorType,
      };
      logger.error(`[ASSISTANT] All retries failed: ${lastError?.message}`);
    }

    // Update in-memory session
    if (result.needs_confirmation && result.pending_action) {
      sessions.set(userId, { pendingAction: result.pending_action });
    } else {
      sessions.set(userId, { pendingAction: null });
    }

    // ── Phase 16: Persist to ChatSession/ChatMessage DB ────────────────────
    let dbSessionId = session_id || null;
    try {
      const db = require('../config/database').sequelize;
      const ChatSession = db.models.ChatSession;
      const ChatMessage = db.models.ChatMessage;
      const { v4: uuidv4 } = require('uuid');

      if (ChatSession && ChatMessage) {
        // Find or create a default session for this user
        let chatSession;
        if (dbSessionId) {
          chatSession = await ChatSession.findOne({ where: { id: dbSessionId, user_id: userId } });
        }
        if (!chatSession) {
          // Find the most recent active session or create one
          chatSession = await ChatSession.findOne({
            where: { user_id: userId, is_active: true },
            order: [['updated_at', 'DESC']],
          });
        }
        if (!chatSession) {
          chatSession = await ChatSession.create({
            id       : uuidv4(),
            user_id  : userId,
            title    : message.substring(0, 50),
            mode     : 'manager',
            is_active: true,
            auto_title: true,
          });
        }
        dbSessionId = chatSession.id;

        // Save user message
        await ChatMessage.create({
          id        : uuidv4(),
          session_id: chatSession.id,
          user_id   : userId,
          role      : 'user',
          content   : message,
        });

        // Save AI reply
        await ChatMessage.create({
          id          : uuidv4(),
          session_id  : chatSession.id,
          user_id     : userId,
          role        : 'assistant',
          content     : result.reply || '',
          intent      : result.intent || null,
          mode        : result.mode || null,
          confidence  : result.confidence || null,
          is_fallback : result.is_fallback || false,
          suggestions : result.suggestions || [],
          actions_taken: result.actions || [],
        });

        // Update session message count
        const currentCount = chatSession.message_count || 0;
        await chatSession.update({
          message_count   : currentCount + 2,
          last_message_at : new Date(),
        });
      }
    } catch (dbErr) {
      logger.warn('[ASSISTANT] /command DB persist failed:', dbErr.message);
    }

    logger.info(`[ASSISTANT] user=${userId} intent=${result.intent} action=${result.action_taken?.action||'none'}`);

    res.json({
      success: true,
      data: {
        reply             : result.reply,
        action_taken      : result.action_taken,
        actions           : result.actions || [],
        needs_confirmation: result.needs_confirmation,
        pending_action    : result.needs_confirmation ? result.pending_action : null,
        intent            : result.intent,
        suggestions       : result.suggestions || [],
        context_used      : result.context_used,
        // Phase 16: confidence + explainability
        confidence        : result.confidence ?? 70,
        explanation       : result.explanation || [],
        mode              : result.mode || 'manager',
        is_fallback       : result.is_fallback || false,
        session_id        : dbSessionId,
      }
    });
  } catch (e) {
    logger.error('[ASSISTANT] command error:', e.message);
    // Step 5: Structured error response (never silent failure)
    res.status(500).json({
      success: false,
      message: 'حدث خطأ في المساعد. يرجى المحاولة مرة أخرى.',
      data: {
        reply: 'عذراً، حدث خطأ مؤقت. جرّب مرة أخرى أو أعد صياغة رسالتك.',
        suggestions: ['ابدأ يومي', 'مهامي', 'عاداتي'],
        is_fallback: true,
        error_type: 'server_error',
      }
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant/chat
// Orchestrated AI endpoint → { reply, mode, actions, suggestions }
// Uses full context: memory, personalization, energy/mood
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat', writeLimiter, validateMessage, async (req, res) => {
  const { message } = req.body;

  const userId   = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    // Fetch user context for enriched prompts
    let userCtx = null;
    try { userCtx = await fetchUserContext(userId, timezone); } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

    // Phase B: Route through ai.core.service for full context-aware response
    const result = await aiCore.chat(userId, message, timezone, userCtx);

    logger.info(`[ASSISTANT] chat via ai.core: user=${userId}, mode=${result.mode}, fallback=${result.is_fallback}`);

    res.json({
      success: true,
      data: {
        reply       : result.reply,
        mode        : result.mode,
        actions     : result.actions     || [],
        suggestions : result.suggestions  || [],
        intent      : result.intentCategory,
        is_fallback : !!result.is_fallback,
        confidence  : result.confidence  || 70,
        explanation : result.explanation || [],
        planningTip : result.planningTip || null,
        snapshot    : result.snapshot    || null,
        prediction  : result.prediction  || null,
        pipeline_ms : result.pipeline_ms || null,
        // Phase M: Decision Engine data
        decisionData: result.decisionData || null,
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] chat error:', e.message);
    // Phase M: Never crash — try Decision Engine fallback before generic reply
    let emergencyReply = DEFAULT_FALLBACK;
    let emergencyDecision = null;
    try {
      const unifiedSvc = require('../services/unified.decision.service');
      if (unifiedSvc?.getUnifiedDecision) {
        const decision = await unifiedSvc.getUnifiedDecision(req.user.id, {
          timezone: req.user.timezone || 'Africa/Cairo',
        });
        if (decision?.currentFocus) {
          const focus = decision.currentFocus;
          const why = (decision.why || []).slice(0, 2).join(' | ');
          const step = focus.next_steps?.[0] || '';
          emergencyReply = `📌 **${focus.title}**\n${why}\n${step ? `👉 ${step}` : ''}`;
          emergencyDecision = {
            currentFocus: decision.currentFocus,
            why: decision.why,
            signalsUsed: decision.signalsUsed,
            behaviorState: decision.behaviorState,
          };
        }
      }
    } catch (_de) { /* truly last resort */ }

    res.json({
      success: true,
      data: {
        reply       : emergencyReply,
        mode        : 'hybrid',
        actions     : [],
        suggestions : ['أعد المحاولة', 'ابدأ يومي', 'سجّل مزاجي'],
        is_fallback : emergencyReply === DEFAULT_FALLBACK,
        confidence  : emergencyReply === DEFAULT_FALLBACK ? 0 : 60,
        explanation : [],
        decisionData: emergencyDecision,
      },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant  ← alias for /assistant/chat (Phase 16 explainability)
// Forwards directly to the same handler so POST /api/v1/assistant also works
// ─────────────────────────────────────────────────────────────────────────────
router.post('/', writeLimiter, validateMessage, async (req, res) => {
  const { message } = req.body;
  const userId   = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';
  try {
    let userCtx = null;
    try { userCtx = await fetchUserContext(userId, timezone); } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }
    const result = await aiCore.chat(userId, message, timezone, userCtx);
    logger.info(`[ASSISTANT] / alias: user=${userId}, mode=${result.mode}`);
    res.json({
      success: true,
      data: {
        reply       : result.reply,
        mode        : result.mode,
        actions     : result.actions     || [],
        suggestions : result.suggestions  || [],
        intent      : result.intentCategory,
        is_fallback : !!result.is_fallback,
        confidence  : result.confidence  || 70,
        explanation : result.explanation || [],
        planningTip : result.planningTip || null,
        decisionData: result.decisionData || null,
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] / alias error:', e.message);
    res.json({
      success: true,
      data: {
        reply       : DEFAULT_FALLBACK,
        mode        : 'hybrid',
        actions     : [],
        suggestions : ['أعد المحاولة', 'ابدأ يومي'],
        is_fallback : true,
        confidence  : 0,
        explanation : [],
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

    const todayTasks = ctx.recentTasks.filter(t => {
      if (!t.due_date) return false;
      const d = typeof t.due_date === 'string' ? t.due_date.substring(0, 10) : (t.due_date instanceof Date ? t.due_date.toISOString().substring(0, 10) : '');
      return d === ctx.today;
    });

    // Enrich with goal context (Phase G: assistant context enrichment)
    let goalContext = null;
    try {
      const goalEngine = require('../services/goal.engine.service');
      if (goalEngine?.getGoalSummaryForAI) {
        goalContext = await goalEngine.getGoalSummaryForAI(req.user.id, tz);
      } else if (goalEngine?.getGoalContext) {
        const gCtx = await goalEngine.getGoalContext(req.user.id, tz);
        goalContext = { summary: gCtx.summary, topGoals: (gCtx.activeGoals || []).slice(0, 3).map(g => g.title) };
      }
    } catch (_e) { /* goal engine optional */ }

    // Enrich with analytics snapshot
    let analyticsSnapshot = null;
    try {
      const analytics = require('../services/analytics.service');
      analyticsSnapshot = await analytics.getAnalyticsSnapshot(req.user.id, tz);
    } catch (_e) { /* analytics optional */ }

    res.json({
      success: true,
      data: {
        ...ctx,
        greeting,
        hour,
        tasks_today   : ctx.todayTasks || todayTasks.length,
        tasks_pending : ctx.recentTasks.length,
        mood_today    : ctx.todayMood,
        habits_active : ctx.habits.length,
        recent_tasks  : ctx.recentTasks,
        completed_today: ctx.completedToday || 0,
        // Profile & Settings data for frontend personalization
        user_profile  : ctx.profile || null,
        user_settings : ctx.settings || null,
        // Phase G: Goal & Analytics enrichment
        goal_context  : goalContext,
        analytics     : analyticsSnapshot,
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
    try { legacyHist = getConversationHistory(req.user.id); } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

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
    try { clearConversation(req.user.id); } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }
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
router.get('/decisions', async (req, res) => {
  try {
    const userId = req.user.id;
    // Get in-memory decision log
    const log = decisionEngine.getDecisionLog(userId, 20);

    // Also include DB-persisted decisions
    let dbDecisions = [];
    try {
      const LO = require('../models/learning_outcome.model');
      const rows = await LO.findAll({
        where  : { user_id: userId, type: 'decision' },
        order  : [['ts', 'DESC']],
        limit  : 20,
        raw    : true,
      });
      dbDecisions = rows.map(r => ({
        action    : r.action,
        risk      : r.risk,
        mode      : r.mode,
        energy    : r.energy,
        mood      : r.mood,
        hour      : r.hour,
        source    : 'db',
        timestamp : new Date(Number(r.ts)).toISOString(),
      }));
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

    // Merge in-memory + DB (deduplicate by latest)
    const merged = log.length > 0 ? log : dbDecisions;
    res.json({ success: true, data: { decisions: merged, count: merged.length } });
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
    const userId = req.user.id;
    const profile = learningEngine.getUserLearningProfile(userId);

    // Also query DB for total counts (more accurate than in-memory)
    let db_total_records = 0, db_total_outcomes = 0;
    try {
      const LO = require('../models/learning_outcome.model');
      db_total_records  = await LO.count({ where: { user_id: userId } });
      db_total_outcomes = await LO.count({ where: { user_id: userId, type: 'outcome' } });
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

    res.json({
      success: true,
      data: {
        ...profile.stats,
        total_records   : db_total_records  || profile.stats.totalRecords,
        total_outcomes  : db_total_outcomes || profile.stats.totalOutcomes,
        insights        : profile.insights.map(i => i.description || i),
        optimal_hours   : profile.stats.optimalHours,
        success_rates   : profile.stats.successRates,
        generated_at    : profile.generatedAt,
      },
    });
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
    try { ctx = await conversationService.buildUserContext(req.user.id, tz); } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

    const plan = await planningEngine.generateDailyPlan(req.user.id, { ...ctx, timezone: tz });
    res.json({ success: true, plan });
  } catch (e) {
    logger.error('[ASSISTANT] /plan error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16: GET /assistant/daily-plan
// Smart scheduling engine — returns time-slotted ordered plan with ML context
// ─────────────────────────────────────────────────────────────────────────────
router.get('/daily-plan', async (req, res) => {
  try {
    const scheduler = getScheduler();
    if (!scheduler) {
      return res.status(503).json({ success: false, message: 'Scheduling engine not available' });
    }

    const userId   = req.user.id;
    const timezone = req.user.timezone || 'Africa/Cairo';

    const { schedule, timeline, energy_curve, focus_score, stats } = await scheduler.getDailyPlan(userId, timezone);

    logger.info(`[ASSISTANT] daily-plan: ${schedule.length} items for user ${userId}`);

    res.json({
      success : true,
      data    : {
        timeline    : timeline || schedule,
        schedule,
        energy_curve: energy_curve || [],
        focus_score : focus_score ?? stats?.focus_score ?? 70,
        ml_enhanced : stats?.ml_enhanced ?? false,   // Phase 11: top-level ML flag
        stats,
        generated_at : new Date().toISOString(),
        timezone,
        ml_note: stats.ml_enhanced
          ? `📊 الخطة محسّنة بالذكاء الاصطناعي — أفضل وقت تركيز: ${stats.best_focus_hour}:00 — نقاط التركيز: ${focus_score ?? stats.focus_score}`
          : '📋 خطة يومية أساسية',
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] /daily-plan error:', e.message);
    res.json({
      success: true,
      data   : { schedule: [], stats: { error: e.message }, generated_at: new Date().toISOString() },
    });
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
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

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
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

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
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

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
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

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
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

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
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

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
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

    if (!orchestrated) {
      return res.json({ success: true, cards: [], count: 0 });
    }

    const cards = presenter.presentOrchestration(orchestrated);
    res.json({ success: true, cards, count: cards.length });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 10: POST /assistant/present — convert a single AI output into a UI card
// Body: { type, action?, title, message?, confidence }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/present', async (req, res) => {
  try {
    const presenter = require('../services/assistant.presenter.service');
    const { type = 'action', action, title, message, confidence = 80, explanation = [] } = req.body;

    let card;
    if (type === 'action') {
      card = presenter.presentAction({ action: action || 'create_task', executor: 'ai', confidence, why: explanation });
    } else if (type === 'suggestion') {
      card = presenter.presentSuggestion({ message: title || message || 'اقتراح', confidence });
    } else if (type === 'insight') {
      card = presenter.presentInsight({ message: title || message || 'رؤية', confidence });
    } else {
      card = presenter.presentAction({ action: action || 'create_task', executor: 'ai', confidence, why: explanation });
    }

    // Normalise: ensure type and icon are at top level of data
    res.json({
      success: true,
      data: {
        ...card,
        title      : card.title || title,
        message    : card.message || message,
        confidence : card.confidence ?? confidence,
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] POST /present error:', e.message);
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

    // Pre-warm the learning engine — await DB load so predictions use real data
    try { await learning.warmup(userId); } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

    // Get current context for ML predictions with real user data
    let context = { energy: 55, mood: 5, overdueCount: 0 };
    try {
      const db = require('../config/database').sequelize;
      // Get today's mood
      const moment = require('moment-timezone');
      const today  = moment().tz(tz).format('YYYY-MM-DD');
      if (db.models.MoodEntry) {
        const moodEntry = await db.models.MoodEntry.findOne({
          where: { user_id: userId, entry_date: today },
          order: [['createdAt', 'DESC']],
        });
        if (moodEntry) context.mood = moodEntry.mood_score || 5;
      }
      // Get overdue tasks count
      if (db.models.Task) {
        const overdueCount = await db.models.Task.count({
          where: {
            user_id: userId,
            status: ['pending', 'in_progress'],
            due_date: { [require('sequelize').Op.lt]: today },
          },
        });
        context.overdueCount = overdueCount;
      }
      // Try context snapshot service for energy
      try {
        const ctxService = require('../services/context.snapshot.service');
        const snap = await ctxService.getSnapshot(userId, tz, false);
        if (snap) {
          context.energy = snap.energy?.score || 55;
          context.mood   = snap.mood?.score   || context.mood;
        }
      } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

    const mlPredictions = learning.getMLPredictions(userId, context);
    const profile       = learning.getUserLearningProfile(userId);

    res.json({
      success: true,
      data: {
        ...mlPredictions,
        energy_forecast: mlPredictions.best_focus_hours ? {
          best_hours  : mlPredictions.best_focus_hours,
          peak_hour   : mlPredictions.best_focus_hours[0] || 10,
          description : `أفضل وقت للتركيز: ${mlPredictions.best_focus_hours[0] || 10}:00`,
        } : null,
        risk_percentage: mlPredictions.burnout_risk ? Math.round(mlPredictions.burnout_risk * 100) : null,
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

// ─────────────────────────────────────────────────────────────────────────────
// Phase L: GET /assistant/next-action
// Behavior-aware, proactive. Returns actionable focus with next_steps.
// Query params: ?energy=0-100&mood=1-10
// ─────────────────────────────────────────────────────────────────────────────
router.get('/next-action', async (req, res) => {
  try {
    const userId        = req.user.id;
    const timezone      = req.user.timezone || 'Africa/Cairo';
    const currentEnergy = req.query.energy ? parseInt(req.query.energy) : undefined;
    const currentMood   = req.query.mood   ? parseFloat(req.query.mood) : undefined;

    // Phase L: UnifiedDecisionService v2 (behavior-aware)
    let unifiedDecision = null;
    try {
      const unifiedSvc = require('../services/unified.decision.service');
      if (unifiedSvc?.getUnifiedDecision) {
        unifiedDecision = await unifiedSvc.getUnifiedDecision(userId, {
          timezone,
          energy: currentEnergy,
          mood: currentMood,
        });
      }
    } catch (_e) { logger.debug('[ASSISTANT] Unified decision service not available:', String(_e.message).slice(0, 150)); }

    if (unifiedDecision?.currentFocus) {
      const focus = unifiedDecision.currentFocus;

      // Enrich with real task data if action references a task
      let taskData = null;
      if (focus.id && focus.type === 'task') {
        try {
          const Task = require('../models/task.model');
          const t = await Task.findOne({ where: { id: focus.id, user_id: userId } });
          if (t) {
            taskData = {
              id:              t.id,
              title:           t.title,
              priority:        t.priority,
              due_date:        t.due_date,
              start_time:      t.start_time,
              energy_required: t.energy_required,
            };
          }
        } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${String(_e.message).slice(0, 100)}`); }
      }

      logger.info(`[ASSISTANT] next-action v2: user=${userId}, action=${focus.action}, behavior=${unifiedDecision.behaviorState?.state}, confidence=${unifiedDecision.confidence}%`);

      return res.json({
        success: true,
        data: {
          action:      focus.action || 'review_plan',
          task_id:     focus.id || null,
          habit_id:    focus.type === 'habit' ? focus.id : null,
          title:       focus.title,
          task_title:  taskData?.title || focus.title || null,
          message:     focus.message || unifiedDecision.why?.join(' — ') || '',
          reason:      unifiedDecision.why || [],
          explanation: unifiedDecision.why || [],
          confidence:  unifiedDecision.confidence || 70,
          urgency:     focus.priority === 'urgent' ? 'critical' : focus.priority === 'high' ? 'high' : 'medium',
          energy_match: true,
          ml_driven:   true,
          task_data:   taskData,
          suggestions: unifiedDecision.alternatives?.slice(0, 3).map(a => a.title) || [],
          // v2: proactive + behavioral
          next_steps:    focus.next_steps || [],
          signalsUsed:   unifiedDecision.signalsUsed,
          alternatives:  unifiedDecision.alternatives,
          behaviorState: unifiedDecision.behaviorState,
          source:        'unified_decision_engine',
          generated_at:  unifiedDecision.generated_at || new Date().toISOString(),
        },
      });
    }

    // Fallback: Use legacy next.action.service
    const nextActionSvc = getNextAction();
    if (!nextActionSvc) {
      return res.status(503).json({ success: false, message: 'Next-action service not available' });
    }

    const action = await nextActionSvc.getNextBestAction(userId, {
      timezone,
      currentEnergy,
      currentMood,
    });

    let taskData = null;
    if (action.task_id) {
      try {
        const Task = require('../models/task.model');
        const t = await Task.findOne({ where: { id: action.task_id, user_id: userId } });
        if (t) {
          taskData = {
            id:              t.id,
            title:           t.title,
            priority:        t.priority,
            due_date:        t.due_date,
            start_time:      t.start_time,
            energy_required: t.energy_required,
          };
        }
      } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${String(_e.message).slice(0, 100)}`); }
    }

    logger.info(`[ASSISTANT] next-action (legacy): user=${userId}, action=${action.action}, urgency=${action.urgency}`);

    res.json({
      success: true,
      data: {
        ...action,
        task_title:   taskData?.title || action.title || null,
        task_data:    taskData,
        source:       'legacy_next_action',
        generated_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] /next-action error:', String(e.message).slice(0, 200));
    res.json({
      success: true,
      data: {
        action:      'review_plan',
        title:       '📋 راجع خطتك',
        task_title:  '📋 راجع خطتك',
        message:     'تحقق من مهامك وابدأ بالأهم.',
        reasons:     ['راجع مهام اليوم'],
        confidence:  50,
        urgency:     'medium',
        energy_match: true,
        next_steps:  ['افتح قائمة المهام', 'اختر أول مهمة وابدأ'],
        generated_at: new Date().toISOString(),
      },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16: GET /assistant/life-feed
// Returns personalized feed of AI insights, tasks, mood, habits, ML insights
// Query params: ?limit=20&timezone=Africa/Cairo
// ─────────────────────────────────────────────────────────────────────────────
router.get('/life-feed', async (req, res) => {
  try {
    const lifeFeedSvc = getLifeFeed();
    if (!lifeFeedSvc) {
      return res.json({ success: true, data: { feed: [], count: 0 } });
    }

    const userId   = req.user.id;
    const timezone = req.user.timezone || req.query.timezone || 'Africa/Cairo';
    const limit    = Math.min(parseInt(req.query.limit) || 20, 50);

    const feed = await lifeFeedSvc.getLifeFeed(userId, { timezone, limit });

    logger.info(`[ASSISTANT] life-feed: ${feed.length} items for user ${userId}`);

    res.json({
      success: true,
      data   : {
        feed,
        count       : feed.length,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] /life-feed error:', e.message);
    res.json({ success: true, data: { feed: [], count: 0, generated_at: new Date().toISOString() } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16: POST /assistant/decompose
// Decompose a complex task into ordered subtasks using AI
// Body: { task_title, task_id?, category?, due_date?, priority?, estimated_minutes? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/decompose', async (req, res) => {
  // Support both `task_title` and `task` field names
  const task_title_raw = req.body.task_title || req.body.task;
  const { task_id, category, due_date, priority, estimated_minutes } = req.body;
  const task_title = task_title_raw;

  if (!task_title?.trim()) {
    return res.status(400).json({ success: false, message: 'task_title مطلوب' });
  }

  try {
    const decomposer = getDecomposer();
    if (!decomposer) {
      return res.status(503).json({ success: false, message: 'Task decomposition service not available' });
    }

    const result = await decomposer.decomposeTask(task_title.trim(), {
      category,
      due_date,
      priority,
      estimated_minutes,
    });

    logger.info(`[ASSISTANT] decompose: "${task_title}" → ${result.subtasks?.length} subtasks (${result.source})`);

    // Normalize subtask field names: ensure both `duration` and `estimated_minutes` exist
    const normalizedSubtasks = (result.subtasks || []).map(st => ({
      ...st,
      estimated_minutes: st.estimated_minutes ?? st.duration ?? 30,
      duration         : st.duration ?? st.estimated_minutes ?? 30,
    }));

    res.json({
      success: true,
      data   : {
        task_title,
        task_id,
        ...result,
        subtasks    : normalizedSubtasks,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] /decompose error:', e.message);
    res.status(500).json({ success: false, message: 'خطأ في تقسيم المهمة' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16: GET /assistant/burnout-status
// Returns current burnout risk + energy-aware recommendations
// ─────────────────────────────────────────────────────────────────────────────
router.get('/burnout-status', async (req, res) => {
  try {
    const userId   = req.user.id;
    const tz       = req.user.timezone || 'Africa/Cairo';

    let burnoutRisk    = 0.3;
    let bestFocusHour  = 10;
    let completionBoost = 0;
    let insights       = [];

    try {
      const learning = require('../services/learning.engine.service');
      const mlPreds  = learning.getMLPredictions(userId, { energy: 55, mood: 5, overdueCount: 0 });
      burnoutRisk     = mlPreds.burnout_risk         || 0.3;
      bestFocusHour   = mlPreds.best_focus_hours?.[0] ?? 10;
      completionBoost = (mlPreds.task_completion_probability || 0.5) - 0.5;

      const profile = learning.getUserLearningProfile(userId);
      insights = profile?.insights?.slice(0, 3) || [];
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

    const riskLevel = burnoutRisk >= 0.7 ? 'high' : burnoutRisk >= 0.45 ? 'medium' : 'low';
    const riskPercent = Math.round(burnoutRisk * 100);

    const recommendations = riskLevel === 'high'
      ? ['خذ استراحة 20 دقيقة الآن', 'قلّل عدد المهام لـ 3 فقط', 'توقف عن العمل الساعة 6 مساءً']
      : riskLevel === 'medium'
      ? ['خذ استراحة كل 90 دقيقة', 'راجع أولوياتك قبل الإضافة', 'تأكد من النوم الكافي']
      : ['حافظ على الإيقاع الحالي', `أفضل وقت تركيز: ${bestFocusHour}:00`, 'أنت في وضع ممتاز'];

    res.json({
      success: true,
      data   : {
        burnout_risk    : burnoutRisk,
        risk_level      : riskLevel,
        risk_percent    : riskPercent,
        risk_percentage : riskPercent,   // alias for frontend compatibility
        best_focus_hour : bestFocusHour,
        completion_boost: completionBoost,
        recommendations,
        insights,
        summary: riskLevel === 'high'
          ? `⚠️ خطر إجهاد مرتفع (${riskPercent}%) — تحتاج للراحة`
          : riskLevel === 'medium'
          ? `🟡 إجهاد متوسط (${riskPercent}%) — انتبه لحجم عملك`
          : `✅ وضع ممتاز (خطر ${riskPercent}%) — استمر!`,
        generated_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] /burnout-status error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16: GET /assistant/chat-summary
// Returns overview of all persistent chat sessions for this user
// ─────────────────────────────────────────────────────────────────────────────
router.get('/chat-summary', async (req, res) => {
  try {
    const userId = req.user.id;
    let sessions = [], totalMessages = 0;

    try {
      const db           = require('../config/database').sequelize;
      const ChatSession  = db.models.ChatSession;
      const ChatMessage  = db.models.ChatMessage;
      const { Op }       = require('sequelize');

      if (ChatSession && ChatMessage) {
        const [sessRows, msgCount] = await Promise.all([
          ChatSession.findAll({
            where  : { user_id: userId, is_active: true },
            order  : [['last_message_at', 'DESC'], ['createdAt', 'DESC']],
            limit  : 10,
            attributes: ['id', 'title', 'message_count', 'last_message_at', 'summary', 'createdAt'],
          }),
          ChatMessage.count({ where: { user_id: userId } }),
        ]);
        sessions      = sessRows.map(s => s.toJSON());
        totalMessages = msgCount;
      }
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

    // Also include in-memory memory stats
    const memStats = memory.getShortTermStats(userId);

    res.json({
      success: true,
      data   : {
        sessions,
        session_count  : sessions.length,
        total_messages : totalMessages,
        memory_stats   : memStats,
        generated_at   : new Date().toISOString(),
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] /chat-summary error:', e.message);
    res.json({ success: true, data: { sessions: [], session_count: 0, total_messages: 0 } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16: POST /assistant/smart-notify
// Generate AI-powered smart notification content for a task/habit
// Body: { type: 'task'|'habit', item_id, minutes_before? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/smart-notify', async (req, res) => {
  // Support both `minutes_before` and `reminder_before` field names
  const { type = 'task', item_id, context } = req.body;
  const minutes_before = req.body.minutes_before ?? req.body.reminder_before ?? 30;

  if (!item_id) {
    return res.status(400).json({ success: false, message: 'item_id مطلوب' });
  }

  try {
    const userId = req.user.id;
    const tz     = req.user.timezone || 'Africa/Cairo';

    // Fetch the item
    let item = null;
    try {
      const db = require('../config/database').sequelize;
      if (type === 'task' && db.models.Task) {
        const t = await db.models.Task.findOne({ where: { id: item_id, user_id: userId } });
        if (t) item = t.toJSON();
      } else if (type === 'habit' && db.models.Habit) {
        const h = await db.models.Habit.findOne({ where: { id: item_id, user_id: userId } });
        if (h) item = h.toJSON();
      }
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

    if (!item) {
      return res.status(404).json({ success: false, message: 'العنصر غير موجود' });
    }

    // Build dynamic notification message
    const name        = req.user.name?.split(' ')[0] || 'صديقي';
    const itemTitle   = item.title || item.name_ar || item.name || 'مهمتك';
    const minute_label = minutes_before >= 60
      ? `${Math.round(minutes_before / 60)} ساعة`
      : `${minutes_before} دقيقة`;

    let title, body, icon;

    if (type === 'task') {
      const isUrgent = item.priority === 'urgent' || item.priority === 'high';
      title = isUrgent ? `⚡ ${name}، مهمة عاجلة!` : `📋 تذكير: ${itemTitle}`;
      body  = minutes_before <= 15
        ? `"${itemTitle}" بعد ${minute_label} فقط — ابدأ الآن!`
        : `"${itemTitle}" بعد ${minute_label}. خصّص وقتك وكن مستعداً.`;
      icon  = isUrgent ? '⚡' : '📋';
    } else {
      title = `🔄 حان وقت عادتك!`;
      body  = `"${itemTitle}" بعد ${minute_label}. لا تكسر سلسلتك!`;
      icon  = '🔄';
    }

    logger.info(`[ASSISTANT] smart-notify: type=${type}, item=${itemTitle}, before=${minutes_before}m`);

    // Build dynamic_message — AI-enhanced context-aware message
    const dynamicMessage = type === 'task'
      ? `${name}، تذكير بـ "${itemTitle}"! ${
          item.priority === 'urgent' ? '⚡ هذه مهمة عاجلة جداً.' :
          item.priority === 'high'   ? '🔴 مهمة ذات أولوية عالية.' : ''
        } ${minutes_before <= 15 ? 'ابدأ الآن فوراً!' : `لديك ${minute_label} للاستعداد.`}`
      : `${name}، حان وقت عادة "${itemTitle}"! الاتساق هو مفتاح النجاح. ${minutes_before <= 15 ? 'ابدأ الآن!' : `لديك ${minute_label}.`}`;

    // Save notification to DB with new Phase 16 fields
    let notification_id = null;
    try {
      const db = require('../config/database').sequelize;
      if (db.models.Notification) {
        const { v4: uuidv4 } = require('uuid');
        const notif = await db.models.Notification.create({
          id               : uuidv4(),
          user_id          : userId,
          type             : `smart_${type}_reminder`,
          title,
          body,
          dynamic_message  : dynamicMessage,
          reminder_before  : minutes_before,
          related_item_id  : item_id,
          related_item_type: type,
          priority         : item.priority || 'medium',
          channel          : 'in_app',
          scheduled_at     : new Date(Date.now() + minutes_before * 60 * 1000),
          data             : { item_title: itemTitle, context: context || null },
        });
        notification_id = notif.id;
      }
    } catch (dbErr) {
      logger.warn('[ASSISTANT] smart-notify DB save failed:', dbErr.message);
    }

    res.json({
      success: true,
      data   : {
        notification_id,
        title,
        body,
        icon,
        dynamic_message: dynamicMessage,
        reminder_before: minutes_before,
        item_id,
        item_type       : type,
        item_title      : itemTitle,
        priority        : item.priority || 'medium',
        scheduled_at    : new Date(Date.now() + minutes_before * 60 * 1000).toISOString(),
        generated_at    : new Date().toISOString(),
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] /smart-notify error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16: GET /assistant/ai-mode  — Get current AI mode for user
// ─────────────────────────────────────────────────────────────────────────────
router.get('/ai-mode', async (req, res) => {
  try {
    const userId = req.user.id;
    const db     = require('../config/database').sequelize;
    const User   = db.models.User;

    let ai_mode = req.user.ai_mode || 'suggestive';
    if (User) {
      const user = await User.findByPk(userId, { attributes: ['ai_mode'] });
      if (user && user.ai_mode) ai_mode = user.ai_mode;
    }

    const modeDescriptions = {
      passive    : 'المساعد يراقب فقط ويقترح عند الطلب — لا إجراءات تلقائية',
      suggestive : 'المساعد يقترح الإجراءات ويطلب موافقتك قبل التنفيذ',
      active     : 'المساعد ينفذ الإجراءات الآمنة تلقائياً ويُخبرك بما تم',
    };

    res.json({
      success: true,
      data   : {
        ai_mode,
        current_mode: ai_mode,   // alias for frontend compatibility
        description: modeDescriptions[ai_mode] || modeDescriptions['suggestive'],
        available_modes: [
          { mode: 'passive',    label: 'سلبي',     description: modeDescriptions.passive,    icon: '👁️' },
          { mode: 'suggestive', label: 'اقتراحي',  description: modeDescriptions.suggestive, icon: '💡' },
          { mode: 'active',     label: 'نشط',      description: modeDescriptions.active,     icon: '⚡' },
        ],
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] GET /ai-mode error:', e.message);
    res.json({ success: true, data: { ai_mode: 'suggestive' } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16: PUT /assistant/ai-mode  — Update AI mode for user
// Body: { mode: 'passive' | 'suggestive' | 'active' }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/ai-mode', async (req, res) => {
  try {
    const { mode } = req.body;
    const validModes = ['passive', 'suggestive', 'active'];

    if (!mode || !validModes.includes(mode)) {
      return res.status(400).json({
        success: false,
        message: `النمط غير صحيح. الأنماط المتاحة: ${validModes.join(', ')}`,
      });
    }

    const db   = require('../config/database').sequelize;
    const User = db.models.User;

    if (User) {
      await User.update({ ai_mode: mode }, { where: { id: req.user.id } });
    }

    const modeMessages = {
      passive    : '👁️ تم التفعيل: المساعد الآن في وضع المراقبة فقط',
      suggestive : '💡 تم التفعيل: المساعد يقترح ويطلب موافقتك',
      active     : '⚡ تم التفعيل: المساعد ينفذ الإجراءات الآمنة تلقائياً',
    };

    logger.info(`[ASSISTANT] AI mode changed to "${mode}" for user ${req.user.id}`);

    res.json({
      success: true,
      data   : { ai_mode: mode, updated_at: new Date().toISOString() },
      message: modeMessages[mode],
    });
  } catch (e) {
    logger.error('[ASSISTANT] PUT /ai-mode error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Phase 16: GET /assistant/presenter  — Presenter layer: convert last action to UI-ready card
// ─────────────────────────────────────────────────────────────────────────────
router.get('/presenter', async (req, res) => {
  try {
    const presenter = require('../services/assistant.presenter.service');
    const memory    = require('../services/memory.service');

    const userId = req.user.id;
    const msgs   = memory.getShortTermMemory?.(userId) || [];
    const last   = msgs.filter(m => m.role === 'assistant').slice(-1)[0];

    if (!last) {
      return res.json({
        success: true,
        data   : presenter.presentReply({
          reply      : 'مرحباً! أنا مساعدك الذكي. كيف يمكنني مساعدتك اليوم؟',
          confidence : 100,
          suggestions: ['عرض الخطة اليومية', 'أضف مهمة', 'كيف حالي؟'],
          explanation: ['لا توجد محادثة سابقة'],
        }),
      });
    }

    res.json({
      success: true,
      data   : presenter.presentReply({
        reply      : last.content,
        confidence : last.confidence || 70,
        suggestions: last.suggestions || [],
        explanation: last.explanation || [],
        mode       : last.mode,
      }),
    });
  } catch (e) {
    logger.error('[ASSISTANT] GET /presenter error:', e.message);
    res.json({ success: false, message: e.message });
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

// ─────────────────────────────────────────────────────────────────────────────
// GET /assistant/timeline/smart
// AI-powered Smart Timeline — enriches daily-plan with overdue tasks,
// free time slots, and rule-based suggestions.
//
// Response shape:
// {
//   timeline:    [{ start_time, end_time, title, type, status }],
//   overdue:     [{ id, title, due_date, priority }],
//   freeSlots:   [{ start, end, duration_min }],
//   suggestions: [{ id, type, title, reason, action }],
//   generated_at
// }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/timeline/smart', async (req, res) => {
  const userId   = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    // ── 1. Reuse the scheduling engine for today's timeline ────────────
    let schedule = [];
    let stats = {};
    try {
      const scheduler = getScheduler();
      if (scheduler) {
        const plan = await scheduler.getDailyPlan(userId, timezone);
        schedule = plan.timeline || plan.schedule || [];
        stats    = plan.stats || {};
      }
    } catch (schedErr) {
      logger.warn('[SMART-TIMELINE] scheduler unavailable:', schedErr.message);
    }

    // Normalize timeline items with status
    const timeline = schedule.map(item => ({
      start_time: item.start_time || item.time || null,
      end_time:   item.end_time || null,
      title:      item.title,
      type:       item.type || 'task',
      status:     item.completed ? 'completed' : item.missed ? 'missed' : 'pending',
      priority:   item.priority || 'medium',
      source_id:  item.task_id || item.habit_id || null,
    }));

    // ── 2. Find overdue tasks ──────────────────────────────────────────
    const Task = require('../models/task.model');
    const { Op } = require('sequelize');
    const now = new Date();
    const overdueTasks = await Task.findAll({
      where: {
        user_id: userId,
        status: { [Op.in]: ['pending', 'in_progress'] },
        due_date: { [Op.lt]: now },
      },
      order: [['due_date', 'ASC']],
      limit: 10,
    });

    const overdue = overdueTasks.map(t => ({
      id:       t.id,
      title:    t.title,
      due_date: t.due_date,
      priority: t.priority || 'medium',
      days_overdue: Math.ceil((now - new Date(t.due_date)) / (1000 * 60 * 60 * 24)),
    }));

    // ── 3. Detect free slots in the timeline ───────────────────────────
    const freeSlots = [];
    // Parse times to minutes-since-midnight for gap detection
    function parseHHMM(str) {
      if (!str) return null;
      const parts = str.match(/(\d{1,2}):(\d{2})/);
      if (!parts) return null;
      return parseInt(parts[1]) * 60 + parseInt(parts[2]);
    }
    function minutesToHHMM(m) {
      return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    }

    const sorted = timeline
      .filter(i => i.start_time)
      .sort((a, b) => (parseHHMM(a.start_time) || 0) - (parseHHMM(b.start_time) || 0));

    const dayStart = 8 * 60;   // 08:00
    const dayEnd   = 22 * 60;  // 22:00
    let cursor = dayStart;

    for (const item of sorted) {
      const start = parseHHMM(item.start_time);
      const end   = parseHHMM(item.end_time) || (start + 30); // default 30 min if no end
      if (start == null) continue;
      if (start > cursor + 30) { // 30+ min gap = free slot
        freeSlots.push({
          start:        minutesToHHMM(cursor),
          end:          minutesToHHMM(start),
          duration_min: start - cursor,
        });
      }
      cursor = Math.max(cursor, end);
    }
    // Trailing free time
    if (cursor < dayEnd - 30) {
      freeSlots.push({
        start:        minutesToHHMM(cursor),
        end:          minutesToHHMM(dayEnd),
        duration_min: dayEnd - cursor,
      });
    }

    // ── 4. Load user settings to control suggestion behavior ───────────
    let userSettings = null;
    let userProfile = null;
    try {
      const UserSettings = require('../models/user_settings.model');
      const UserProfile  = require('../models/user_profile.model');
      [userSettings, userProfile] = await Promise.all([
        UserSettings.findOne({ where: { user_id: userId } }),
        UserProfile.findOne({ where: { user_id: userId } }),
      ]);
    } catch (_e) { logger.debug(`[ASSISTANT_ROUTES] Non-critical operation failed: ${_e.message}`); }

    // Settings-driven behavior
    const interventionLevel  = userSettings?.ai_intervention_level || 'medium';
    const autoReschedule     = userSettings?.auto_reschedule ?? false;
    const deepWorkDuration   = userProfile?.deep_work_duration || 90;

    // ── 5. Rule-based suggestions (respects intervention level) ────────
    const suggestions = [];
    let sugId = 1;

    // Suggestion: reschedule overdue tasks into free slots
    // If auto_reschedule is ON, mark suggestions as auto-accepted
    for (const od of overdue.slice(0, interventionLevel === 'low' ? 1 : 3)) {
      const slot = freeSlots.find(s => s.duration_min >= 30);
      if (slot) {
        suggestions.push({
          id:     `sug-${sugId++}`,
          type:   'reschedule',
          title:  `أعد جدولة "${od.title}" إلى ${slot.start}`,
          reason: `متأخرة ${od.days_overdue} يوم — يوجد وقت فارغ من ${slot.start} حتى ${slot.end}`,
          action: { type: 'reschedule_task', task_id: od.id, proposed_time: slot.start },
          auto_apply: autoReschedule,
        });
      }
    }

    // Suggestion: take a break if schedule is dense (medium+ intervention)
    const totalScheduled = timeline.length;
    if (interventionLevel !== 'low' && totalScheduled >= 6 && freeSlots.length === 0) {
      suggestions.push({
        id:     `sug-${sugId++}`,
        type:   'break',
        title:  'جدولك مزدحم — خذ استراحة قصيرة',
        reason: `لديك ${totalScheduled} مهمة اليوم بدون فترات راحة واضحة`,
        action: { type: 'add_break' },
      });
    }

    // Suggestion: use free time for habits (medium+ intervention)
    if (interventionLevel !== 'low') {
      const { Habit } = require('../models/habit.model');
      const todayHabits = await Habit.findAll({
        where: { user_id: userId, is_active: true },
        limit: 5,
      });
      const incompleteHabits = todayHabits.filter(h => !h.last_check_in || new Date(h.last_check_in).toDateString() !== now.toDateString());
      if (incompleteHabits.length > 0 && freeSlots.length > 0) {
        const habit = incompleteHabits[0];
        suggestions.push({
          id:     `sug-${sugId++}`,
          type:   'habit_reminder',
          title:  `لم تُكمل عادة "${habit.title}" اليوم`,
          reason: `لديك وقت فارغ — أكمل عاداتك اليومية`,
          action: { type: 'complete_habit', habit_id: habit.id },
        });
      }
    }

    // Suggestion: focus block for large free slots (use user's deep work duration)
    for (const slot of freeSlots) {
      if (slot.duration_min >= deepWorkDuration) {
        suggestions.push({
          id:     `sug-${sugId++}`,
          type:   'focus_block',
          title:  `فترة تركيز متاحة: ${slot.start} – ${slot.end}`,
          reason: `${slot.duration_min} دقيقة متاحة — مثالية لعمل عميق (إعدادك: ${deepWorkDuration} دقيقة)`,
          action: { type: 'create_focus_block', start: slot.start, end: slot.end },
        });
        break; // Only suggest one focus block
      }
    }

    logger.info(`[SMART-TIMELINE] user=${userId}: ${timeline.length} items, ${overdue.length} overdue, ${freeSlots.length} free slots, ${suggestions.length} suggestions`);

    res.json({
      success: true,
      data: {
        timeline,
        overdue,
        freeSlots,
        suggestions,
        stats: {
          total_scheduled: timeline.length,
          completed:       timeline.filter(i => i.status === 'completed').length,
          overdue_count:   overdue.length,
          free_minutes:    freeSlots.reduce((sum, s) => sum + s.duration_min, 0),
        },
        generated_at: new Date().toISOString(),
        timezone,
      },
    });
  } catch (e) {
    logger.error('[SMART-TIMELINE] error:', e.message);
    res.json({
      success: true,
      data: {
        timeline: [], overdue: [], freeSlots: [], suggestions: [],
        stats: { error: e.message },
        generated_at: new Date().toISOString(),
      },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant/timeline/smart/complete
// Marks a task as completed and instantly removes it from the timeline.
// Body: { task_id: string }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/timeline/smart/complete', async (req, res) => {
  const userId = req.user.id;
  const { task_id } = req.body;

  if (!task_id) {
    return res.status(400).json({ success: false, message: 'task_id is required' });
  }

  try {
    const Task = require('../models/task.model');
    const task = await Task.findOne({ where: { id: task_id, user_id: userId } });
    if (!task) {
      return res.status(404).json({ success: false, message: 'Task not found' });
    }

    task.status = 'completed';
    task.completed_at = new Date();
    await task.save();

    logger.info(`[SMART-TIMELINE] Task completed: ${task_id} by user ${userId}`);

    res.json({
      success: true,
      message: 'تم إكمال المهمة بنجاح',
      data: { task_id, status: 'completed' },
    });
  } catch (e) {
    logger.error('[SMART-TIMELINE] complete error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant/timeline/smart/accept-suggestion
// Accepts an AI suggestion (reschedule, break, habit, focus block).
// Body: { suggestion_id, action: { type, task_id?, proposed_time?, ... } }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/timeline/smart/accept-suggestion', async (req, res) => {
  const userId = req.user.id;
  const { suggestion_id, action } = req.body;

  if (!action?.type) {
    return res.status(400).json({ success: false, message: 'action.type is required' });
  }

  try {
    let result = { applied: false };

    switch (action.type) {
      case 'reschedule_task': {
        const Task = require('../models/task.model');
        const task = await Task.findOne({ where: { id: action.task_id, user_id: userId } });
        if (task) {
          // Set new due_date to today at the proposed_time
          const now = new Date();
          const [hh, mm] = (action.proposed_time || '14:00').split(':');
          const newDue = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hh), parseInt(mm));
          task.due_date = newDue;
          task.status = 'pending';
          await task.save();
          result = { applied: true, task_id: action.task_id, new_due: newDue };
          logger.info(`[SMART-TIMELINE] Rescheduled task ${action.task_id} to ${action.proposed_time}`);
        }
        break;
      }
      case 'complete_habit': {
        const { Habit } = require('../models/habit.model');
        const habit = await Habit.findOne({ where: { id: action.habit_id, user_id: userId } });
        if (habit) {
          habit.last_check_in = new Date();
          habit.current_streak = (habit.current_streak || 0) + 1;
          await habit.save();
          result = { applied: true, habit_id: action.habit_id };
          logger.info(`[SMART-TIMELINE] Habit checked in: ${action.habit_id}`);
        }
        break;
      }
      case 'add_break':
      case 'create_focus_block': {
        // These don't modify DB — they're informational suggestions.
        // Mark as accepted for analytics.
        result = { applied: true, type: action.type };
        logger.info(`[SMART-TIMELINE] Suggestion accepted: ${action.type}`);
        break;
      }
      default:
        result = { applied: true, type: action.type };
    }

    res.json({
      success: true,
      message: 'تم تنفيذ الاقتراح',
      data: { suggestion_id, ...result },
    });
  } catch (e) {
    logger.error('[SMART-TIMELINE] accept-suggestion error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;

// ─────────────────────────────────────────────────────────────────────────────
// POST /assistant/run-loop — Step 2+6: Trigger execution loop on demand
// ─────────────────────────────────────────────────────────────────────────────
// Note: This is added AFTER module.exports to avoid breaking existing routes.
// Re-export after adding route.
router.post('/run-loop', async (req, res) => {
  try {
    const executionEngine = require('../services/execution.engine.service');
    const userId   = req.user.id;
    const timezone = req.user.timezone || 'Africa/Cairo';
    const result = await executionEngine.triggerLoop(userId, timezone);
    res.json({
      success: true,
      data: result,
    });
  } catch (e) {
    logger.error('[ASSISTANT] run-loop error:', e.message);
    res.status(500).json({ success: false, message: 'فشل في تشغيل الحلقة التنفيذية' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /assistant/behavior — Step 1+6: Get user behavior profile + patterns
// ─────────────────────────────────────────────────────────────────────────────
router.get('/behavior', async (req, res) => {
  try {
    const behaviorSvc = require('../services/behavior.model.service');
    const userId = req.user.id;
    const [profile, patterns] = await Promise.all([
      behaviorSvc.getBehaviorProfile(userId),
      behaviorSvc.getBehaviorPatterns(userId),
    ]);
    res.json({
      success: true,
      data: {
        profile: profile?.toJSON ? profile.toJSON() : profile,
        patterns,
      },
    });
  } catch (e) {
    logger.error('[ASSISTANT] behavior error:', e.message);
    res.status(500).json({ success: false, message: 'فشل في جلب بيانات السلوك' });
  }
});

