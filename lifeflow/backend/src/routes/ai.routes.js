/**
 * AI Routes — Direct AI Interactions (v3 — Safe Executor)
 * =========================================================
 * All AI calls go through safeAIExecute — never crashes, never returns undefined.
 * POST /ai/chat returns: { reply, mode, actions, suggestions, is_fallback, confidence, explanation }
 */

'use strict';

const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { aiService, chat } = require('../ai/ai.service');
const logger = require('../utils/logger');
const { safeAIExecute, FALLBACK_DEFAULT } = require('../services/ai/ai.safe.executor');

// Phase B: Use ai.core.service as single AI entry point
const aiCore = require('../services/ai.core.service');

// Lazy loaders (kept for backward-compat endpoints that need direct access)
function getMemoryService()       { try { return require('../services/memory.service'); } catch (_e) { logger.debug(`[AI_ROUTES] Module '../services/memory.service' not available: ${_e.message}`); return null; } }

// Keep backward compat
const { DEFAULT_FALLBACK: OLD_FALLBACK } = require('../services/ai/ai.error.handler');

router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// POST /ai/chat — Upgraded: returns { reply, mode, actions, suggestions }
// Uses orchestrator with full memory + personalization context
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat', async (req, res) => {
  const { message, timezone } = req.body;
  if (!message?.trim()) {
    return res.status(400).json({ success: false, message: 'الرسالة مطلوبة' });
  }

  const userId   = req.user.id;
  const userName = req.user.name || 'صديقي';
  const tz       = timezone || req.user.timezone || 'Africa/Cairo';

  // Phase B: Route through ai.core.service as single entry point
  const aiResult = await safeAIExecute(async () => {
    // Use unified AI core — handles orchestrator, conversation, and fallback internally
    let userCtx = null;
    try {
      userCtx = await aiCore.fetchUserContext(userId, tz);
    } catch (_e) { logger.debug(`[AI_ROUTES] Non-critical operation failed: ${_e.message}`); }

    const result = await aiCore.chat(userId, message, tz, userCtx);

    return {
      reply       : result.reply,
      mode        : result.mode,
      actions     : result.actions     || [],
      suggestions : result.suggestions || [],
      is_fallback : !!result.is_fallback,
      intent      : result.intentCategory,
      confidence  : result.confidence  || null,
      explanation : result.explanation || [],
      planningTip : result.planningTip || null,
      snapshot    : result.snapshot    || null,
      prediction  : result.prediction  || null,
      pipeline_ms : result.pipeline_ms || null,
    };
  }, { context: 'ai/chat', userId, userName });

  // ── Extract structured data (aiResult.reply is either string OR the full object) ─
  let responseData;
  const raw = aiResult.reply;

  if (typeof raw === 'object' && raw !== null && raw.reply !== undefined) {
    // Orchestrator returned full object
    responseData = raw;
  } else {
    // Plain string reply
    responseData = {
      reply      : typeof raw === 'string' ? raw : FALLBACK_DEFAULT,
      mode       : 'hybrid',
      actions    : [],
      suggestions: ['كيف حالي اليوم؟', 'خطة اليوم', 'اضف مهمة', 'سجّل مزاجي'],
      is_fallback: aiResult.is_fallback,
    };
  }

  // Override is_fallback with executor's verdict
  if (aiResult.is_fallback) responseData.is_fallback = true;

  // Store in memory
  try {
    const memService = getMemoryService();
    if (memService) {
      memService.addShortTerm(userId, 'user', message);
      memService.addShortTerm(userId, 'assistant', responseData.reply);
    }
  } catch (_e) { logger.debug(`[AI_ROUTES] Non-critical operation failed: ${_e.message}`); }

  logger.info('[AI-ROUTES] /chat response', {
    userId,
    mode       : responseData.mode,
    is_fallback: responseData.is_fallback,
    error_type : aiResult.error_type || null,
    elapsed_ms : aiResult.elapsed_ms,
    has_reply  : !!responseData.reply,
  });

  // Always respond with 200 — never let the client see a 5xx on AI failures
  return res.json({ success: true, data: responseData });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ai/chat/history — conversation history
// ─────────────────────────────────────────────────────────────────────────────
router.get('/chat/history', (req, res) => {
  try {
    const memService = getMemoryService();
    if (!memService) {
      return res.json({ success: true, data: { history: [], turn_count: 0 } });
    }

    const messages = memService.getRecentMessages(req.user.id, 20);
    const stats    = memService.getShortTermStats(req.user.id);

    res.json({
      success: true,
      data: {
        history    : messages,
        turn_count : messages.filter(m => m.role === 'user').length,
        ...stats,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /ai/chat/clear — clear conversation history
// ─────────────────────────────────────────────────────────────────────────────
router.post('/chat/clear', (req, res) => {
  try {
    const memService = getMemoryService();
    if (memService) memService.clearShortTerm(req.user.id);

    // Also clear via ai.core
    try { aiCore.clearHistory(req.user.id); } catch (_) {}

    res.json({ success: true, data: { cleared: true } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ai/status — AI provider status
// ─────────────────────────────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  try {
    const { getStatus } = require('../services/ai/ai.provider.selector');
    const { getStats }  = require('../services/ai/ai.cache');
    res.json({
      success: true,
      data: {
        provider: getStatus(),
        cache   : getStats(),
      },
    });
  } catch (e) {
    res.json({ success: true, data: { provider: { status: 'unknown' }, cache: {} } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ai/productivity-tips — backward compatible
// ─────────────────────────────────────────────────────────────────────────────
router.get('/productivity-tips', async (req, res) => {
  try {
    const tips = await aiService.getProductivityTips(req.user);
    res.json({ success: true, data: tips });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب النصائح' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /ai/goal-breakdown — backward compatible
// ─────────────────────────────────────────────────────────────────────────────
router.post('/goal-breakdown', async (req, res) => {
  try {
    const { goal_name, goal_description, deadline } = req.body;
    const breakdown = await aiService.breakdownTask(goal_name, goal_description, req.user);
    res.json({ success: true, data: breakdown });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في تحليل الهدف' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /ai/insights — backward compatible
// ─────────────────────────────────────────────────────────────────────────────
router.post('/insights', async (req, res) => {
  try {
    const { type = 'general' } = req.body;
    const systemPrompt = `أنت محلل إنتاجية شخصي. قدّم رؤية تحليلية مختصرة بالعربية.`;
    const userPrompt   = `المستخدم: ${req.user.name}، الخطة: ${req.user.subscription_plan || 'free'}. أعطني 3 نصائح مخصصة لتحسين الإنتاجية والحياة.`;
    const response     = await chat(systemPrompt, userPrompt, { maxTokens: 400 });
    res.json({ success: true, data: { insights: response || DEFAULT_FALLBACK, type, generated_at: new Date().toISOString() } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في توليد الرؤى' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /ai/voice-analysis — backward compatible
// ─────────────────────────────────────────────────────────────────────────────
router.post('/voice-analysis', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'النص مطلوب' });
    const systemPrompt = 'حلّل المحادثة التالية وأعطِ ملاحظات مختصرة بالعربية.';
    const response     = await chat(systemPrompt, text, { maxTokens: 300 });
    res.json({ success: true, data: { analysis: response || DEFAULT_FALLBACK } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في التحليل' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ai/knowledge?query= — Phase 4: Knowledge layer
// Returns { answer, source, confidence, related }
// ─────────────────────────────────────────────────────────────────────────────
router.get('/knowledge', async (req, res) => {
  try {
    const { query: q, topics } = req.query;

    const knowledgeService = require('../services/knowledge.service');

    // List all topics
    if (topics === 'true') {
      return res.json({ success: true, data: { topics: knowledgeService.getTopics() } });
    }

    if (!q?.trim()) {
      return res.status(400).json({ success: false, message: 'يرجى تحديد استعلام (query=...)' });
    }

    // Load AI client for synthesis fallback
    let aiClient = null;
    try {
      aiClient = { chat: async ({ systemPrompt, userMessage, maxTokens }) =>
        ({ content: await chat(systemPrompt, userMessage, { maxTokens }) })
      };
    } catch (_e) { logger.debug(`[AI_ROUTES] Non-critical operation failed: ${_e.message}`); }

    const result = await knowledgeService.query(q.trim(), { useAI: true, aiClient });

    logger.info(`[KNOWLEDGE] user=${req.user.id} q="${q}" conf=${result.confidence}`);

    res.json({
      success:    true,
      data:       result,
      queried_at: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[KNOWLEDGE] endpoint error:', error);
    res.status(500).json({ success: false, message: 'فشل في الاستعلام عن المعلومة' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /ai/routines — Phase 3: Routine engine rules
// POST /ai/routines — Add custom rule
// POST /ai/routines/evaluate — Evaluate rules for current context
// ─────────────────────────────────────────────────────────────────────────────
router.get('/routines', async (req, res) => {
  try {
    const routineEngine = require('../services/routine.engine.service');
    const rules = routineEngine.getRulesForUser(req.user.id);
    res.json({ success: true, data: { rules, count: rules.length } });
  } catch (error) {
    logger.error('[ROUTINES] get error:', error);
    res.status(500).json({ success: false, message: 'فشل في جلب القواعد' });
  }
});

router.post('/routines', async (req, res) => {
  try {
    const routineEngine = require('../services/routine.engine.service');
    const { name, description, trigger, action, priority } = req.body;

    if (!name || !trigger || !action) {
      return res.status(400).json({ success: false, message: 'name, trigger, action مطلوبة' });
    }

    const rule = routineEngine.addRule(req.user.id, { name, description, trigger, action, priority });
    res.status(201).json({ success: true, data: rule, message: `تمت إضافة القاعدة "${name}"` });
  } catch (error) {
    logger.error('[ROUTINES] add error:', error);
    res.status(500).json({ success: false, message: 'فشل في إضافة القاعدة' });
  }
});

router.post('/routines/evaluate', async (req, res) => {
  try {
    const routineEngine = require('../services/routine.engine.service');
    const { energy, mood, overdue_count, best_streak, last_completed_task } = req.body;

    const context = {
      energy:               energy ?? 55,
      mood:                 mood ?? 5,
      overdue_count:        overdue_count ?? 0,
      best_streak:          best_streak ?? 0,
      last_completed_task:  last_completed_task || null,
      timezone:             req.user.timezone || 'Africa/Cairo',
    };

    const firedRules = await routineEngine.evaluateRules(req.user.id, context);
    const actions    = routineEngine.executeActions(firedRules, context);

    res.json({
      success:      true,
      data: {
        fired_count: firedRules.length,
        actions,
        context,
        evaluated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('[ROUTINES] evaluate error:', error);
    res.status(500).json({ success: false, message: 'فشل في تقييم القواعد' });
  }
});

module.exports = router;
