/**
 * Chat Sessions Routes — Phase 16 (Complete)
 * ============================================
 * POST   /api/v1/chat/session              — create new chat session
 * GET    /api/v1/chat/sessions             — list user's sessions
 * GET    /api/v1/chat/session/:id          — get session with messages
 * GET    /api/v1/chat/session/:id/messages — get messages only (paginated)
 * POST   /api/v1/chat/message              — send message (with session_id)
 * PATCH  /api/v1/chat/session/:id/rename   — rename session title
 * PATCH  /api/v1/chat/session/:id/pin      — pin/unpin a session
 * DELETE /api/v1/chat/session/:id          — soft-delete session
 */

'use strict';

const express = require('express');
const router  = express.Router();
const logger  = require('../utils/logger');
const { protect } = require('../middleware/auth.middleware');
const { writeLimiter } = require('../middleware/rateLimiter');
const { body } = require('express-validator');
const { handleValidation } = require('../middleware/validators');

// ─── Chat validators ─────────────────────────────────────────────────────────
const validateChatMessage = [
  body('message').trim().notEmpty().withMessage('الرسالة مطلوبة').isLength({ max: 5000 }).withMessage('الرسالة طويلة جداً'),
  body('session_id').optional().trim(),
  handleValidation,
];
const validateSessionCreate = [
  body('title').optional().trim().isLength({ max: 200 }).withMessage('عنوان الجلسة طويل جداً'),
  body('mode').optional().isIn(['manager', 'companion', 'coach', 'planner']).withMessage('وضع المحادثة غير صالح'),
  handleValidation,
];
const validateSessionRename = [
  body('title').trim().notEmpty().withMessage('العنوان مطلوب').isLength({ max: 200 }).withMessage('العنوان طويل جداً'),
  handleValidation,
];

// ─── Lazy model loaders ───────────────────────────────────────────────────────
function getModels() {
  try {
    const db = require('../config/database').sequelize;
    return {
      ChatSession : db.models.ChatSession,
      ChatMessage : db.models.ChatMessage,
    };
  } catch (_) { return {}; }
}

function getOrchestrator() {
  try { return require('../services/orchestrator.service'); } catch (_e) { logger.debug(`[CHAT_ROUTES] Module '../services/orchestrator.service' not available: ${_e.message}`); return null; }
}

function getCommandEngine() {
  try { return require('../services/ai.command.engine'); } catch (_e) { logger.debug(`[CHAT_ROUTES] Module '../services/ai.command.engine' not available: ${_e.message}`); return null; }
}

/**
 * Phase 15: Detect if a message is an actionable command (create task, complete, etc.)
 * Returns true if the command engine should execute FIRST, then orchestrator generates reply.
 */
function isActionableCommand(message) {
  const lower = (message || '').toLowerCase().trim();
  const actionPatterns = [
    // Create task
    'اضف', 'أضف', 'ضيف', 'ضف', 'عندي مهمة', 'سجل مهمة', 'أنشئ مهمة', 'انشئ مهمة',
    'لازم اعمل', 'لازم أعمل', 'محتاج اعمل', 'محتاج أعمل', 'اعمل مهمة',
    'add task', 'create task', 'new task',
    // Complete task
    'خلصت', 'انتهيت', 'عملت', 'خلّصت', 'كمّلت', 'أنجزت', 'انجزت',
    // Reschedule
    'أجّل', 'أجل', 'أخّر', 'اخر', 'أأجل', 'رحّل',
    // Delete
    'احذف', 'حذف', 'ألغِ', 'الغي', 'شيل',
    // Mood
    'سجل مزاج', 'مزاجي', 'حاسس', 'حالتي', 'نفسيتي',
    // Schedule exam
    'امتحان', 'اختبار',
    // Plan
    'جدول', 'خطة يومي', 'نظم يومي', 'خطط',
    // Habit
    'سجل عادة', 'عادتي',
    // Profile
    'غير اسمي', 'عدل الملف', 'اسمي', 'تخصصي', 'دوري', 'ملفي الشخصي',
    'عدل البروفايل', 'بروفايل',
    // Settings
    'غير الإعدادات', 'اللغة', 'المنطقة الزمنية', 'التذكير', 'إعدادات',
    'عدل الإعدادات',
  ];
  return actionPatterns.some(p => lower.includes(p));
}

router.use(protect);

// ─────────────────────────────────────────────────────────────────────────────
// POST /chat/session  —  Create a new chat session
// Body: { title?, mode? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/session', writeLimiter, validateSessionCreate, async (req, res) => {
  try {
    const { ChatSession } = getModels();
    if (!ChatSession) return res.status(503).json({ success: false, message: 'Chat not ready' });

    const { title, mode = 'manager' } = req.body;
    const sessionTitle = title || 'محادثة جديدة';

    const session = await ChatSession.create({
      user_id   : req.user.id,
      title     : sessionTitle,
      mode,
      auto_title: !title,  // if no title, will be auto-set from first message
    });

    logger.info(`[CHAT] New session created: ${session.id} for user ${req.user.id}`);

    res.status(201).json({
      success: true,
      data   : {
        session: {
          session_id   : session.id,
          id           : session.id,
          title        : session.title,
          mode         : session.mode || mode,
          is_pinned    : session.is_pinned || false,
          message_count: 0,
          created_at   : session.createdAt,
        },
      },
    });
  } catch (e) {
    logger.error('[CHAT] POST /session error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /chat/sessions  —  List all sessions for the current user
// Query: ?pinned=true (optional filter)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/sessions', async (req, res) => {
  try {
    const { ChatSession } = getModels();
    if (!ChatSession) return res.json({ success: true, data: { sessions: [], count: 0 } });

    const where = { user_id: req.user.id, is_active: true };
    if (req.query.pinned === 'true') where.is_pinned = true;

    const sessions = await ChatSession.findAll({
      where,
      order  : [['is_pinned', 'DESC'], ['last_message_at', 'DESC'], ['createdAt', 'DESC']],
      limit  : 50,
      attributes: ['id', 'title', 'mode', 'message_count', 'last_message_at', 'summary', 'is_pinned', 'auto_title', 'createdAt'],
    });

    res.json({
      success: true,
      data   : { sessions: sessions.map(s => s.toJSON()), count: sessions.length },
    });
  } catch (e) {
    logger.error('[CHAT] GET /sessions error:', e.message);
    res.json({ success: true, data: { sessions: [], count: 0 } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /chat/session/:id  —  Get a session + its latest messages
// ─────────────────────────────────────────────────────────────────────────────
router.get('/session/:id', async (req, res) => {
  try {
    const { ChatSession, ChatMessage } = getModels();
    if (!ChatSession) return res.json({ success: true, data: { session: null, messages: [] } });

    const session = await ChatSession.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });
    if (!session) return res.status(404).json({ success: false, message: 'جلسة المحادثة غير موجودة' });

    const messages = ChatMessage
      ? await ChatMessage.findAll({
          where: { session_id: session.id },
          order: [['createdAt', 'ASC']],
          limit: 200,
        })
      : [];

    res.json({
      success: true,
      data   : {
        session : session.toJSON(),
        messages: messages.map(m => ({
          id         : m.id,
          role       : m.role,
          content    : m.content,
          intent     : m.intent,
          mode       : m.mode,
          is_fallback: m.is_fallback,
          confidence : m.confidence,
          suggestions: m.suggestions,
          actions    : m.actions_taken,
          timestamp  : m.createdAt,
        })),
        total_messages: messages.length,
      },
    });
  } catch (e) {
    logger.error('[CHAT] GET /session/:id error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /chat/session/:id/messages  —  Paginated messages only
// Query: ?page=1&limit=50&order=asc|desc
// ─────────────────────────────────────────────────────────────────────────────
router.get('/session/:id/messages', async (req, res) => {
  try {
    const { ChatSession, ChatMessage } = getModels();
    if (!ChatMessage) return res.json({ success: true, data: { messages: [], total: 0, page: 1 } });

    // Verify session belongs to user
    if (ChatSession) {
      const session = await ChatSession.findOne({ where: { id: req.params.id, user_id: req.user.id } });
      if (!session) return res.status(404).json({ success: false, message: 'غير موجود' });
    }

    const page  = Math.max(1, parseInt(req.query.page  || '1'));
    const limit = Math.min(100, parseInt(req.query.limit || '50'));
    const order = (req.query.order || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const offset = (page - 1) * limit;

    const { count, rows: messages } = await ChatMessage.findAndCountAll({
      where : { session_id: req.params.id },
      order : [['createdAt', order]],
      limit,
      offset,
    });

    res.json({
      success: true,
      data   : {
        messages: messages.map(m => ({
          id        : m.id,
          role      : m.role,
          content   : m.content,
          intent    : m.intent,
          confidence: m.confidence,
          suggestions: m.suggestions,
          timestamp : m.createdAt,
        })),
        total  : count,
        page,
        pages  : Math.ceil(count / limit),
        limit,
      },
    });
  } catch (e) {
    logger.error('[CHAT] GET /session/:id/messages error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /chat/message  —  Send a message within a session
// Body: { session_id?, message, timezone? }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/message', writeLimiter, validateChatMessage, async (req, res) => {
  const { session_id, message, timezone } = req.body;

  if (!message?.trim()) {
    return res.status(400).json({ success: false, message: 'الرسالة مطلوبة' });
  }

  const userId   = req.user.id;
  const tz       = timezone || req.user.timezone || 'Africa/Cairo';
  const { ChatSession, ChatMessage } = getModels();
  let session = null;

  try {
    // ── Ensure session exists ─────────────────────────────────────────────
    if (session_id && ChatSession) {
      session = await ChatSession.findOne({ where: { id: session_id, user_id: userId } });
    }
    if (!session && ChatSession) {
      // Auto-create: title = first 50 chars of message
      const autoTitle = message.trim().substring(0, 50) + (message.trim().length > 50 ? '…' : '');
      session = await ChatSession.create({
        user_id   : userId,
        title     : autoTitle,
        auto_title: true,
      });
    }

    // ── Save user message ─────────────────────────────────────────────────
    if (ChatMessage && session) {
      await ChatMessage.create({
        session_id: session.id,
        user_id   : userId,
        role      : 'user',
        content   : message.trim(),
      });
    }

    // ── Phase 15: Execute commands FIRST, then generate AI reply ────────
    // CRITICAL FIX: When user says "اضف مهمة X", we MUST actually create the task
    // before generating the conversational response. Previously, chat route only
    // did conversational AI with no command execution, causing "says added but wasn't".
    const orchestrator = getOrchestrator();
    const commandEngine = getCommandEngine();
    let reply        = 'عذراً، حدث خطأ مؤقت 🙏';
    let mode         = 'hybrid';
    let actions      = [];
    let suggestions  = [];
    let is_fallback  = true;
    let intent       = null;
    let confidence   = 50;
    let explanation  = [];
    let planningTip  = null;
    let actionResult = null;

    // Step 1: If message is an actionable command, execute it via command engine
    if (commandEngine && isActionableCommand(message.trim())) {
      try {
        logger.info(`[CHAT] Detected actionable command, routing through command engine: "${message.trim().substring(0, 60)}"`);
        const cmdResult = await commandEngine.processCommand(userId, message.trim(), tz, null);
        if (cmdResult) {
          actionResult = cmdResult;
          // Use command engine's reply if action succeeded
          if (cmdResult.reply) {
            reply = cmdResult.reply;
          }
          intent = cmdResult.intent || null;
          confidence = cmdResult.confidence || 80;
          is_fallback = !!cmdResult.is_fallback;
          suggestions = cmdResult.suggestions || [];

          // Build actions array from command result
          if (cmdResult.action_taken) {
            actions.push({
              type: cmdResult.action_taken.action || 'command_executed',
              label: cmdResult.action_taken.message || 'تم التنفيذ',
              data: cmdResult.action_taken.data || null,
              count: cmdResult.action_taken.count || 0,
            });
          }

          logger.info(`[CHAT] Command executed: intent=${cmdResult.intent}, action=${cmdResult.action_taken?.action || 'none'}, success=${!!cmdResult.action_taken}`);
        }
      } catch (cmdErr) {
        logger.warn('[CHAT] Command engine failed, falling back to orchestrator:', cmdErr.message);
        actionResult = null;
      }
    }

    // Step 2: If no command was executed (or message is conversational), use orchestrator
    if (!actionResult && orchestrator) {
      try {
        const result = await orchestrator.companionChat(userId, message.trim(), tz, null);
        reply        = result.reply          || reply;
        mode         = result.mode           || mode;
        actions      = result.actions        || [];
        suggestions  = result.suggestions    || [];
        is_fallback  = !!result.is_fallback;
        intent       = result.intentCategory || null;
        confidence   = result.confidence     || 50;
        explanation  = result.explanation    || [];
        planningTip  = result.planningTip    || null;
      } catch (orchErr) {
        logger.warn('[CHAT] Orchestrator failed:', orchErr.message);
        is_fallback = true;
      }
    }
    // Step 3: If command was executed but orchestrator needed for richer reply
    else if (actionResult && orchestrator) {
      try {
        // Generate a contextual reply incorporating the action result
        const orchResult = await orchestrator.orchestrate({
          userId,
          message: message.trim(),
          timezone: tz,
          actionResult: actionResult.action_taken || null,
          actionSummary: actionResult.reply || null,
          intentCategory: actionResult.intent || 'task_action',
          userCtx: null,
        });
        if (orchResult?.reply && !orchResult.is_fallback) {
          reply = orchResult.reply;
          mode = orchResult.mode || mode;
          suggestions = orchResult.suggestions || suggestions;
          explanation = orchResult.explanation || [];
        }
      } catch (_orchErr) {
        // Keep command engine reply — orchestrator enhancement is optional
        logger.debug('[CHAT] Orchestrator enhancement failed, using command reply');
      }
    }

    // ── Save assistant reply ──────────────────────────────────────────────
    if (ChatMessage && session) {
      await ChatMessage.create({
        session_id   : session.id,
        user_id      : userId,
        role         : 'assistant',
        content      : reply,
        intent,
        mode,
        is_fallback,
        confidence,
        suggestions,
        actions_taken: actions,
      });

      // Update session metadata
      const newCount = (session.message_count || 0) + 2;
      const updates  = {
        message_count  : newCount,
        last_message_at: new Date(),
      };
      // Auto-update title from first real user message
      if (session.auto_title && newCount === 2) {
        updates.title = message.trim().substring(0, 50) + (message.trim().length > 50 ? '…' : '');
      }
      await session.update(updates);
    }

    logger.info(`[CHAT] session=${session?.id}, user=${userId}, fallback=${is_fallback}, conf=${confidence}`);

    res.json({
      success: true,
      data   : {
        session_id : session?.id || null,
        reply,
        mode,
        actions,
        action_taken: actionResult?.action_taken || null,
        suggestions,
        explanation,
        planning_tip: planningTip,
        is_fallback,
        intent,
        confidence,
        timestamp  : new Date().toISOString(),
      },
    });

  } catch (e) {
    logger.error('[CHAT] POST /message error:', e.message);
    res.json({
      success: true,
      data   : {
        session_id : session?.id || session_id || null,
        reply      : 'عذراً، حدث خطأ مؤقت. جرّب مرة أخرى 🙏',
        mode       : 'hybrid',
        actions    : [],
        suggestions: ['أعد المحاولة', 'كيف حالي؟'],
        explanation: [],
        is_fallback: true,
        confidence : 30,
      },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /chat/session/:id/rename  —  Rename a session
// Body: { title }
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/session/:id/rename', writeLimiter, validateSessionRename, async (req, res) => {
  try {
    const { ChatSession } = getModels();
    if (!ChatSession) return res.status(503).json({ success: false, message: 'Chat not ready' });

    const { title } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, message: 'العنوان مطلوب' });

    const session = await ChatSession.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!session) return res.status(404).json({ success: false, message: 'غير موجود' });

    await session.update({ title: title.trim(), auto_title: false });

    logger.info(`[CHAT] Session ${session.id} renamed to "${title.trim()}"`);

    res.json({
      success: true,
      data   : { session_id: session.id, title: session.title },
      message: 'تم تغيير اسم المحادثة',
    });
  } catch (e) {
    logger.error('[CHAT] PATCH /rename error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /chat/session/:id/pin  —  Pin or unpin a session
// Body: { pinned: true|false } (optional, toggles if not provided)
// ─────────────────────────────────────────────────────────────────────────────
router.patch('/session/:id/pin', writeLimiter, async (req, res) => {
  try {
    const { ChatSession } = getModels();
    if (!ChatSession) return res.status(503).json({ success: false, message: 'Chat not ready' });

    const session = await ChatSession.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!session) return res.status(404).json({ success: false, message: 'غير موجود' });

    const newPinned = req.body.pinned !== undefined ? !!req.body.pinned : !session.is_pinned;
    await session.update({ is_pinned: newPinned });

    logger.info(`[CHAT] Session ${session.id} ${newPinned ? 'pinned' : 'unpinned'}`);

    res.json({
      success  : true,
      data     : { session_id: session.id, is_pinned: newPinned },
      message  : newPinned ? 'تم تثبيت المحادثة' : 'تم إلغاء تثبيت المحادثة',
    });
  } catch (e) {
    logger.error('[CHAT] PATCH /pin error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /chat/session/:id  —  Soft-delete a session
// ─────────────────────────────────────────────────────────────────────────────
router.delete('/session/:id', writeLimiter, async (req, res) => {
  try {
    const { ChatSession } = getModels();
    if (!ChatSession) return res.json({ success: true });

    const session = await ChatSession.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!session) return res.status(404).json({ success: false, message: 'غير موجود' });

    await session.update({ is_active: false });
    logger.info(`[CHAT] Session ${session.id} deleted by user ${req.user.id}`);

    res.json({ success: true, message: 'تم حذف المحادثة' });
  } catch (e) {
    logger.error('[CHAT] DELETE /session/:id error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PUT /chat/session/:id  — Alias: rename session (title in body)
// PUT /chat/session/:id/pin — Alias: pin/unpin session
// ─────────────────────────────────────────────────────────────────────────────
router.put('/session/:id', writeLimiter, async (req, res) => {
  try {
    const { ChatSession } = getModels();
    if (!ChatSession) return res.status(503).json({ success: false, message: 'Chat not ready' });

    const { title } = req.body;
    if (!title?.trim()) return res.status(400).json({ success: false, message: 'العنوان مطلوب' });

    const session = await ChatSession.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!session) return res.status(404).json({ success: false, message: 'غير موجود' });

    await session.update({ title: title.trim(), auto_title: false });
    logger.info(`[CHAT] Session ${session.id} renamed to "${title.trim()}" via PUT`);

    res.json({
      success: true,
      data   : { session_id: session.id, title: session.title },
      message: 'تم تغيير اسم المحادثة',
    });
  } catch (e) {
    logger.error('[CHAT] PUT /session/:id error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

router.put('/session/:id/pin', writeLimiter, async (req, res) => {
  try {
    const { ChatSession } = getModels();
    if (!ChatSession) return res.status(503).json({ success: false, message: 'Chat not ready' });

    const session = await ChatSession.findOne({ where: { id: req.params.id, user_id: req.user.id } });
    if (!session) return res.status(404).json({ success: false, message: 'غير موجود' });

    // Support both `is_pinned` and `pinned` field names
    const newPinned = (req.body.is_pinned ?? req.body.pinned) !== undefined
      ? !!(req.body.is_pinned ?? req.body.pinned)
      : !session.is_pinned;

    await session.update({ is_pinned: newPinned });
    logger.info(`[CHAT] Session ${session.id} ${newPinned ? 'pinned' : 'unpinned'} via PUT`);

    res.json({
      success: true,
      data   : { session_id: session.id, is_pinned: newPinned },
      message: newPinned ? 'تم تثبيت المحادثة' : 'تم إلغاء تثبيت المحادثة',
    });
  } catch (e) {
    logger.error('[CHAT] PUT /session/:id/pin error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
