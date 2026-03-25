/**
 * Conversation Service — خدمة الذاكرة والمحادثة
 * ================================================
 * Maintains per-user chat history (last 20 messages).
 * Injects history + live context into every AI request.
 * Intent classification: Task Action | Question | Advice | General Chat
 */

'use strict';

const moment = require('moment-timezone');
const logger  = require('../utils/logger');
const { chat: aiClientChat, buildIntelligentFallback } = require('./ai/ai.client');

// ─── In-Memory Session Store ──────────────────────────────────────────────────
const sessions    = new Map();
const SESSION_TTL = 60 * 60 * 1000;  // 1 hour
const MAX_HISTORY = 20;               // last 20 messages per user

// ─── Intent Classification ────────────────────────────────────────────────────
const INTENT_CATEGORIES = {
  task_action: {
    patterns: [
      'اضف','أضف','ضيف','ضف','عندي مهمة','لازم','محتاج','اعمل مهمة','خلص','انتهيت',
      'عملت','أجّل','أجل','أخّر','احذف','حذف','ألغِ','المهمة','مهمة','task',
      'امتحان','اختبار','مذاكرة','جدول','schedule','خطة اليوم','نظم يومي',
      'ذكّرني','مزاجي','سجّل','طاقتي'
    ],
    label: 'task_action'
  },
  question: {
    patterns: [
      'ما','ماذا','كيف','هل','متى','أين','من','ليه','لماذا','ما هو','ما هي',
      'كم','what','how','when','why','?','؟','شرح','اشرح','وضّح'
    ],
    label: 'question'
  },
  advice: {
    patterns: [
      'نصيحة','نصائح','اقتراح','اقترح','مساعدة','ساعدني','advice','help me',
      'كيف أتحسن','كيف أرفع','كيف أزيد','أفضل طريقة','ما الأفضل','جرّب','جرب',
      'تعبان','تعب','ضغط','توتر','stressed','tired','burnout','مش قادر'
    ],
    label: 'advice'
  },
};

/**
 * Classify message intent category
 * @returns 'task_action' | 'question' | 'advice' | 'general'
 */
function classifyIntent(message) {
  const lower = message.toLowerCase().trim();
  
  // Task action check (highest priority)
  if (INTENT_CATEGORIES.task_action.patterns.some(p => lower.includes(p))) {
    return 'task_action';
  }
  // Advice / emotional support
  if (INTENT_CATEGORIES.advice.patterns.some(p => lower.includes(p))) {
    return 'advice';
  }
  // Question
  if (INTENT_CATEGORIES.question.patterns.some(p => lower.includes(p))) {
    return 'question';
  }
  return 'general';
}

// ─── Suggestion chips per category ───────────────────────────────────────────
const SUGGESTION_CHIPS = {
  task_action : ['اضف مهمة أخرى', 'عرض مهامي اليوم', 'ما المهام المتأخرة؟'],
  question    : ['شرح أكثر', 'نصيحة عملية', 'كيف أطبق هذا؟'],
  advice      : ['نصائح للتركيز', 'كيف أرفع طاقتي؟', 'تقنية بومودورو'],
  general     : ['كيف حالي اليوم؟', 'خطة اليوم', 'اضف مهمة', 'سجّل مزاجي'],
};

// ─── Session Management ───────────────────────────────────────────────────────
function getSession(userId) {
  const now = Date.now();
  let session = sessions.get(userId);
  
  // Expire stale sessions
  if (session && now - session.lastActivity > SESSION_TTL) {
    sessions.delete(userId);
    session = null;
  }
  
  if (!session) {
    session = {
      userId,
      history: [],
      turnCount: 0,
      createdAt: now,
      lastActivity: now,
      lastActionSummary: null,
    };
    sessions.set(userId, session);
  }
  
  session.lastActivity = now;
  return session;
}

function addToHistory(session, role, content, metadata = {}) {
  session.history.push({ role, content, timestamp: Date.now(), ...metadata });
  // Keep last MAX_HISTORY messages
  if (session.history.length > MAX_HISTORY) {
    session.history = session.history.slice(-MAX_HISTORY);
  }
  session.turnCount += (role === 'user' ? 1 : 0);
}

function getConversationHistory(userId) {
  const session = sessions.get(userId);
  if (!session) return { history: [], turn_count: 0 };
  return {
    history: session.history,
    turn_count: session.turnCount,
    started_at: new Date(session.createdAt).toISOString(),
  };
}

function clearConversation(userId) {
  sessions.delete(userId);
  return { cleared: true };
}

// ─── User Context Fetcher ─────────────────────────────────────────────────────
async function fetchUserContext(userId, timezone) {
  try {
    const { Op } = require('sequelize');
    const User              = require('../models/user.model');
    const Task              = require('../models/task.model');
    const MoodEntry         = require('../models/mood.model');
    const Habit             = require('../models/habit.model');
    
    let ProductivityScore, EnergyLog;
    try { ProductivityScore = require('../models/productivity_score.model'); } catch(_) {}
    try { EnergyLog         = require('../models/energy_log.model'); } catch(_) {}

    const now     = moment.tz(timezone);
    const today   = now.format('YYYY-MM-DD');
    const since7  = now.clone().subtract(7, 'days').format('YYYY-MM-DD');

    const queries = [
      User.findByPk(userId, { raw: true }),
      Task.findAll({
        where: { user_id: userId, status: { [Op.in]: ['pending', 'in_progress'] } },
        order: [['due_date', 'ASC'], ['priority', 'ASC']],
        limit: 15,
        raw: true,
      }),
      MoodEntry.findOne({ where: { user_id: userId, entry_date: today }, raw: true }),
      Habit.findAll({ where: { user_id: userId, is_active: true }, limit: 8, raw: true }),
    ];

    if (ProductivityScore) {
      queries.push(
        ProductivityScore.findAll({
          where: { user_id: userId, score_date: { [Op.gte]: since7 } },
          raw: true,
          limit: 7,
          order: [['score_date', 'DESC']],
        })
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    if (EnergyLog) {
      queries.push(
        EnergyLog.findAll({
          where: { user_id: userId },
          raw: true,
          order: [['log_date', 'DESC']],
          limit: 1,
        })
      );
    } else {
      queries.push(Promise.resolve([]));
    }

    const [user, tasks, todayMood, habits, scores, energyLogs] = await Promise.all(queries);

    const name       = user?.name?.split(' ')[0] || 'صديقي';
    const hour       = now.hour();
    const greeting   = hour < 6  ? 'مرحباً، أنت صاحي بدري 🌙'
                     : hour < 12 ? `صباح الخير ${name} ☀️`
                     : hour < 17 ? `مساء النور ${name} 🌤️`
                     :             `مساء الخير ${name} 🌙`;

    const avgScore   = scores.length
      ? Math.round(scores.reduce((s, r) => s + (r.overall_score || 0), 0) / scores.length)
      : 55;
    const energy     = energyLogs?.[0]?.energy_score || 55;

    const urgentTasks  = tasks.filter(t => ['urgent', 'high'].includes(t.priority));
    const overdueTasks = tasks.filter(t => t.due_date && t.due_date.substring(0,10) < today);
    const todayTasks   = tasks.filter(t => t.due_date && t.due_date.substring(0,10) === today);

    // Phase 6: Also fetch completed tasks today for AI context (avoid suggesting done things)
    let completedToday = [];
    try {
      completedToday = await Task.findAll({
        where: { user_id: userId, status: 'completed', completed_at: { [Op.gte]: `${today}T00:00:00` } },
        limit: 10, raw: true,
      });
    } catch(_) {}

    // Phase 6: Get today's habit logs for AI context
    let habitLogs = [];
    try {
      const { HabitLog } = require('../models/habit.model');
      habitLogs = await HabitLog.findAll({
        where: { user_id: userId, log_date: today },
        raw: true,
      });
    } catch(_) {}

    return {
      name, greeting, hour, today, timezone,
      tasks, urgentTasks, todayTasks, overdueTasks,
      completedToday,
      todayMood: todayMood?.mood_score || null,
      moodEmotions: todayMood?.emotions || null,
      habits,
      habitLogs,
      completedHabitCount: habitLogs.filter(l => l.completed).length,
      productivity: avgScore,
      energy,
    };
  } catch (err) {
    logger.warn('[CONV-SERVICE] fetchUserContext error:', err.message);
    return {
      name: 'صديقي', greeting: 'مرحباً', today: moment.tz(timezone).format('YYYY-MM-DD'),
      tasks: [], urgentTasks: [], todayTasks: [], overdueTasks: [],
      todayMood: null, habits: [], productivity: 55, energy: 55,
    };
  }
}

// ─── System Prompt Builder ────────────────────────────────────────────────────
function buildSystemPrompt(ctx, intentCategory, session) {
  const lastActionNote = session.lastActionSummary
    ? `\nآخر إجراء نُفِّذ: ${session.lastActionSummary}` : '';

  const overdueLine = ctx.overdueTasks.length > 0
    ? `⚠️ مهام متأخرة: ${ctx.overdueTasks.length} (${ctx.overdueTasks.slice(0,2).map(t=>t.title).join('، ')})`
    : '';

  return `أنت "LifeFlow AI"، مساعد حياة شخصي ذكي ومتعاطف تتحدث بالعربية دائماً.
أنت تعرف كل شيء عن جدول المستخدم وبياناته الحقيقية.

═══ بيانات المستخدم الحالية ═══
- الاسم: ${ctx.name}
- الوقت: ${ctx.greeting}
- درجة الإنتاجية (آخر 7 أيام): ${ctx.productivity}/100
- مستوى الطاقة: ${ctx.energy}/100
- المزاج اليوم: ${ctx.todayMood ? ctx.todayMood + '/10' : 'لم يُسجَّل بعد'}
- مهام اليوم: ${ctx.todayTasks.length} مهمة
- إجمالي المعلقة: ${ctx.tasks.length} مهمة
- العاجلة/المهمة: ${ctx.urgentTasks.length} مهمة${ctx.urgentTasks.length > 0 ? ` (${ctx.urgentTasks.slice(0,2).map(t=>t.title).join('، ')})` : ''}
${overdueLine}
- العادات النشطة: ${ctx.habits.length}${lastActionNote}

═══ تعليمات الرد ═══
1. تحدث بالعربية دائماً مع إيموجي مناسبة
2. كن شخصياً — استخدم اسم المستخدم وأشر للبيانات الفعلية
3. ردودك عملية ومباشرة (2-5 جمل إلا إذا طُلب تفصيل)
4. ${intentCategory === 'task_action' ? 'بعد تنفيذ أي إجراء، أكد التنفيذ واقترح الخطوة التالية المنطقية' : ''}
5. ${intentCategory === 'advice' ? 'قدم نصائح عملية قابلة للتطبيق الفوري، مع مراعاة وضع المستخدم الحالي' : ''}
6. ${intentCategory === 'question' ? 'أجب بشكل واضح ومفصل، واستخدم البيانات الحقيقية للمستخدم في إجابتك' : ''}
7. إذا ذكر المستخدم تعباً أو ضغطاً: اعترف بمشاعره أولاً ثم قدم حلاً عملياً
8. لا تقل "تم!" فقط — دائماً اشرح ما تم واسأل سؤالاً متابعة مفيداً
9. إذا لم تكن متأكداً من القصد، اطرح سؤالاً توضيحياً واحداً فقط
10. أجب بذكاء حتى لو السؤال غير متعلق بالمهام (صحة، علاقات، دراسة...)
11. عند إنشاء جداول مذاكرة: اليوم فيه 24 ساعة فقط، الحد الأقصى للدراسة 8 ساعات/يوم
12. عند ذكر الصلوات الخمس في الجدول: تأكد من إدراج جميعها (فجر، ظهر، عصر، مغرب، عشاء) بدون استثناء
13. إذا تجاوزت المهام سعة اليوم، وزّعها على أيام أكثر بدلاً من حشر الكل في يوم واحد`;
}

// ─── History Context Builder ──────────────────────────────────────────────────
function buildHistoryContext(session, currentMessage) {
  const recentHistory = session.history.slice(-8); // last 4 turns
  
  if (recentHistory.length === 0) return currentMessage;
  
  const historyStr = recentHistory
    .map(h => `${h.role === 'user' ? 'المستخدم' : 'LifeFlow'}: ${h.content.substring(0, 200)}`)
    .join('\n');
  
  return `[سياق المحادثة:\n${historyStr}]\n\nالرسالة الحالية: ${currentMessage}`;
}

// ─── Smart Fallback Replies ───────────────────────────────────────────────────
function buildFallbackReply(intentCategory, ctx, actionSummary) {
  if (actionSummary) {
    return `${actionSummary}\n\nهل هناك شيء آخر يمكنني مساعدتك به يا ${ctx.name}؟ 😊`;
  }
  
  switch (intentCategory) {
    case 'advice':
      if (ctx.energy < 50) {
        return `يبدو أن طاقتك منخفضة قليلاً (${ctx.energy}/100) يا ${ctx.name} 💙\n\nنصيحتي: خذ استراحة 10 دقائق، اشرب ماءً، ثم ركّز على مهمة واحدة فقط. أصغر خطوة أفضل من لا شيء! 💪`;
      }
      if (ctx.overdueTasks.length > 0) {
        return `لديك ${ctx.overdueTasks.length} مهمة متأخرة يا ${ctx.name} ⚠️\n\nنصيحتي: ابدأ بأصغرها لتحصل على دفعة من الإنجاز، ثم تابع واحدة واحدة. هل تريد مساعدة في ترتيب أولوياتها؟`;
      }
      return `إنتاجيتك ${ctx.productivity}/100 يا ${ctx.name}. ${ctx.productivity >= 65 ? '🌟 أداء رائع! حافظ على هذا الإيقاع.' : '💡 يمكن تحسينها — جرّب تقسيم مهامك الكبيرة لأجزاء صغيرة والبدء بالأسهل.'}\n\nهل تريد نصائح أكثر تحديداً؟`;
    
    case 'question':
      return `مرحباً ${ctx.name}! 😊\n\nلم أفهم سؤالك تماماً. يمكنني مساعدتك في:\n• 📋 إدارة المهام والجدولة\n• 💭 تتبع المزاج والطاقة\n• 📊 تحليل إنتاجيتك\n• 🎓 جدولة المذاكرة\n• 💡 نصائح الإنتاجية\n\nماذا تريد بالضبط؟`;
    
    case 'task_action':
      return `حسناً يا ${ctx.name}، سأساعدك في ذلك 💪\n\nيرجى تحديد ما تريده بشكل أوضح قليلاً، مثلاً:\n"اضف مهمة مذاكرة الرياضيات بكرة الساعة 3"\nأو "خلص مهمة المشروع"`;
    
    default:
      return `أهلاً ${ctx.name}! 😊\n\nحالتك اليوم: إنتاجية ${ctx.productivity}/100 | طاقة ${ctx.energy}/100 | ${ctx.tasks.length} مهمة معلقة${ctx.todayMood ? ` | مزاج ${ctx.todayMood}/10` : ''}.\n\nبماذا يمكنني مساعدتك؟`;
  }
}

// ─── Main Process ─────────────────────────────────────────────────────────────
/**
 * Process a conversational message with full context + history.
 * @param {string} userId
 * @param {string} message
 * @param {string} timezone
 * @param {object|null} actionResult - result from command engine (if action was taken)
 * @param {string|null} actionSummary - human-readable summary of what was done
 * @returns {{ reply, intentCategory, suggestions, session_id, turn, context, ai_powered }}
 */
async function processConversation(userId, message, timezone = 'Africa/Cairo', actionResult = null, actionSummary = null) {
  try {
    const session = getSession(userId);
    const ctx     = await fetchUserContext(userId, timezone);
    const intentCategory = classifyIntent(message);

    // Update last action summary in session
    if (actionSummary) {
      session.lastActionSummary = actionSummary;
    }

    // Check for real API key
    const apiKey   = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '';
    const hasRealKey = apiKey && apiKey !== 'demo-key' && !apiKey.startsWith('your-') && apiKey.length > 20;

    let reply = '';

    if (hasRealKey) {
      try {
        const systemPrompt = buildSystemPrompt(ctx, intentCategory, session);
        
        // Build user message with action result context if any
        let userMsgForAI = buildHistoryContext(session, message);
        if (actionSummary) {
          userMsgForAI = `[الإجراء المنفذ تلقائياً: ${actionSummary}]\n\nالمستخدم قال: ${message}`;
        } else if (actionResult && !actionResult.success) {
          userMsgForAI = `[محاولة تنفيذ: ${actionResult.message || 'فشل'}]\n\nالمستخدم قال: ${message}`;
        }

        reply = await aiClientChat(systemPrompt, userMsgForAI, { temperature: 0.72, maxTokens: 500 });
        logger.info(`[CONV-SERVICE] AI reply generated for user=${userId}, intent=${intentCategory}`);
      } catch (aiErr) {
        logger.warn('[CONV-SERVICE] AI call failed, using intelligent fallback:', aiErr.message);
        // Use intelligent fallback for rate limits / all-providers-failed
        if (aiErr.message && (aiErr.message.includes('RATE_LIMIT') || aiErr.message.includes('ALL_PROVIDERS'))) {
          reply = buildIntelligentFallback(message, { intentCategory });
        } else {
          reply = buildFallbackReply(intentCategory, ctx, actionSummary);
        }
      }
    } else {
      reply = buildFallbackReply(intentCategory, ctx, actionSummary);
    }

    // Store in session history
    addToHistory(session, 'user', message, { intent: intentCategory });
    addToHistory(session, 'assistant', reply, { action_summary: actionSummary || null });

    return {
      reply,
      intentCategory,
      suggestions: SUGGESTION_CHIPS[intentCategory] || SUGGESTION_CHIPS.general,
      session_id : `${userId}_conv`,
      turn       : session.turnCount,
      context    : {
        name        : ctx.name,
        energy      : ctx.energy,
        productivity: ctx.productivity,
        pending_tasks: ctx.tasks.length,
        today_tasks : ctx.todayTasks.length,
        mood_today  : ctx.todayMood,
      },
      ai_powered : hasRealKey,
    };
  } catch (err) {
    logger.error('[CONV-SERVICE] processConversation error:', err.message);
    return {
      reply      : 'عذراً، حدث خطأ مؤقت. يرجى المحاولة مرة أخرى. 🔄',
      intentCategory: 'general',
      suggestions: SUGGESTION_CHIPS.general,
      ai_powered : false,
    };
  }
}

// ─── Standalone Chat (for /api/v1/ai/chat) ───────────────────────────────────
/**
 * Standalone chat endpoint - returns { reply, actions, suggestions }
 */
async function chatWithAI(userId, message, timezone = 'Africa/Cairo') {
  const result = await processConversation(userId, message, timezone);
  return {
    reply      : result.reply,
    actions    : [],  // no direct actions from pure chat
    suggestions: result.suggestions,
    intent     : result.intentCategory,
    context    : result.context,
    ai_powered : result.ai_powered,
    turn       : result.turn,
  };
}

module.exports = {
  processConversation,
  chatWithAI,
  classifyIntent,
  getConversationHistory,
  clearConversation,
  fetchUserContext,
  SUGGESTION_CHIPS,
};
