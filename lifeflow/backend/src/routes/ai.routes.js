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

// Lazy loaders
function getOrchestrator()        { try { return require('../services/orchestrator.service');   } catch (_) { return null; } }
function getConversationService() { try { return require('../services/conversation.service');   } catch (_) { return null; } }
function getMemoryService()       { try { return require('../services/memory.service');         } catch (_) { return null; } }

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

  // ── Always return JSON — use safeAIExecute at the TOP LEVEL ─────────────────
  const aiResult = await safeAIExecute(async () => {
    // Step 1: Try full orchestrator pipeline
    const orchestrator = getOrchestrator();
    if (orchestrator) {
      let userCtx = null;
      try {
        const convService = getConversationService();
        if (convService?.fetchUserContext) {
          userCtx = await convService.fetchUserContext(userId, tz);
        }
      } catch (_) {}

      const result = await orchestrator.companionChat(userId, message, tz, userCtx);

      // Return structured object — safe executor will extract .reply
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
    }

    // Step 2: Fallback to conversation service
    const convService = getConversationService();
    if (convService) {
      const r = await convService.chatWithAI(userId, message, tz);
      return {
        reply      : r.reply,
        mode       : 'hybrid',
        actions    : r.actions    || [],
        suggestions: r.suggestions || [],
        is_fallback: !r.ai_powered,
        intent     : r.intent,
      };
    }

    // Step 3: Direct chat as last resort
    const sysPrmpt = `أنت LifeFlow AI، مساعد حياة شخصي للمستخدم ${userName}. تحدث بالعربية دائماً.`;
    const text = await chat(sysPrmpt, message, { maxTokens: 500 });
    return { reply: text, mode: 'hybrid', actions: [], suggestions: [], is_fallback: false };

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
  } catch (_) {}

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

    // Also clear conversation service
    const convService = getConversationService();
    if (convService?.clearConversation) convService.clearConversation(req.user.id);

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

module.exports = router;
