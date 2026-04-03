/**
 * Conversation Engine Service — Phase 11 (AI Life Copilot)
 * ============================================================
 * Multi-turn conversation with real LLM (Groq/Gemini).
 * Falls back to smart rule-based replies if AI unavailable.
 */

'use strict';

const moment = require('moment-timezone');
const logger  = require('../utils/logger');
const { chat } = require('../ai/ai.service');

function getModels() {
  const User              = require('../models/user.model');
  const Task              = require('../models/task.model');
  const ProductivityScore = require('../models/productivity_score.model');
  const EnergyLog         = require('../models/energy_log.model');
  return { User, Task, ProductivityScore, EnergyLog };
}

// In-memory conversation sessions
const sessions    = new Map();
const SESSION_TTL = 30 * 60 * 1000; // 30 min

// ─── Intent patterns (used for suggestion chips) ──────────────────────────────
const INTENT_PATTERNS = [
  { intent: 'energy_query',   patterns: ['طاقة', 'تعب', 'نشاط', 'energy', 'tired'] },
  { intent: 'mood_query',     patterns: ['مزاج', 'حالة', 'شعور', 'mood', 'feel'] },
  { intent: 'productivity',   patterns: ['إنتاجية', 'إنجاز', 'مهام', 'عمل', 'tasks'] },
  { intent: 'burnout_query',  patterns: ['احتراق', 'ضغط', 'إجهاد', 'burnout', 'stress'] },
  { intent: 'goal_query',     patterns: ['هدف', 'أهداف', 'خطة', 'goal', 'plan'] },
  { intent: 'advice_request', patterns: ['نصيحة', 'اقتراح', 'مساعدة', 'advice', 'help'] },
  { intent: 'greeting',       patterns: ['مرحبا', 'السلام', 'أهلا', 'hi', 'hello'] },
  { intent: 'status_check',   patterns: ['كيف', 'وضعي', 'تقرير', 'status', 'report'] },
];

function detectIntent(message) {
  const lower = message.toLowerCase();
  for (const { intent, patterns } of INTENT_PATTERNS) {
    if (patterns.some(p => lower.includes(p))) return intent;
  }
  return 'general';
}

// ─── Suggestion chips per intent ──────────────────────────────────────────────
const SUGGESTIONS_MAP = {
  greeting      : ['كيف طاقتي اليوم؟', 'وضعي العام', 'نصيحة اليوم'],
  energy_query  : ['كيف أرفع طاقتي؟', 'ما أفضل أوقات التركيز؟'],
  mood_query    : ['تحليل مزاجي الأسبوعي', 'كيف أتحسن؟'],
  productivity  : ['كيف أحسّن إنتاجيتي؟', 'مهامي المتأخرة'],
  burnout_query : ['كيف أتجنب الاحتراق؟', 'ما علامات الإجهاد؟'],
  goal_query    : ['ساعدني في ترتيب مهامي', 'كيف أحدد أهدافاً واقعية؟'],
  status_check  : ['تفاصيل الإنتاجية', 'خطة اليوم'],
  general       : ['وضعي العام', 'نصيحة اليوم', 'مهامي اليوم'],
};

// ─── Response sanitization ──────────────────────────────────────────────────
const BANNED_BOT_PHRASES = [
  'أنا هنا عشان أساعدك', 'أنا هنا لمساعدتك', 'لا تتردد', 'بكل سرور',
  'يسعدني مساعدتك', 'يسعدني', 'هل تحتاج مساعدة أخرى', 'هل هناك شيء آخر',
  'إذا كنت تحتاج أي شيء', 'أتمنى لك يوماً سعيداً', 'أتمنى لك يومًا',
  'شكراً لاستخدامك', 'في خدمتك', 'تحت أمرك دائماً',
];

function sanitizeConvReply(text) {
  if (!text || typeof text !== 'string') return text;
  // Remove CJK characters
  let clean = text.replace(/[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uF900-\uFAFF\u2E80-\u2EFF]+/g, '');
  // Remove banned phrases
  for (const phrase of BANNED_BOT_PHRASES) {
    clean = clean.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }
  return clean.replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();
}

// ─── Session management ──────────────────────────────────────────────────────
function getOrCreateSession(userId) {
  const now = Date.now();
  let session = sessions.get(userId);
  if (session && now - session.lastActivity > SESSION_TTL) {
    sessions.delete(userId);
    session = null;
  }
  if (!session) {
    session = { userId, history: [], createdAt: now, lastActivity: now, turnCount: 0 };
    sessions.set(userId, session);
  }
  session.lastActivity = now;
  return session;
}

// ─── Main entry ───────────────────────────────────────────────────────────────
async function processMessage(userId, message, timezone = 'Africa/Cairo') {
  try {
    const { User, Task, ProductivityScore, EnergyLog } = getModels();
    const session = getOrCreateSession(userId);
    const { Op } = require('sequelize');
    const since7 = moment.tz(timezone).subtract(7, 'days').format('YYYY-MM-DD');
    const todayStr = moment.tz(timezone).format('YYYY-MM-DD');

    // Parallel data fetch
    const [user, scores, energyLogs, urgentTasks, todayTasks] = await Promise.all([
      User.findByPk(userId, { raw: true }),
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since7 } }, raw: true, limit: 7 }),
      EnergyLog.findAll({ where: { user_id: userId }, raw: true, order: [['log_date', 'DESC']], limit: 1 }),
      Task.findAll({ where: { user_id: userId, status: 'pending', priority: { [Op.in]: ['urgent', 'high'] } }, raw: true, limit: 5 }),
      Task.findAll({ where: { user_id: userId, status: 'pending' }, raw: true, limit: 10 }),
    ]);

    const name        = user?.name?.split(' ')[0] || 'صديقي';
    const hour        = moment.tz(timezone).hour();
    const greeting    = hour < 12 ? 'صباح النور' : hour < 17 ? 'مساء الخير' : 'مساء النور';
    const avgScore    = scores.length ? Math.round(scores.reduce((s, r) => s + (r.overall_score || 0), 0) / scores.length) : 55;
    const energy      = energyLogs[0]?.energy_score || 55;
    const intent      = detectIntent(message);

    // ─── Build conversation history for LLM ─────────────────────────────────
    // Detect language from message
    const isEnglish = /^[a-zA-Z0-9\s.,!?'"@#$%&*()\-+=:;/\\<>{}[\]|~`]+$/.test(message.trim());

    const systemPrompt = isEnglish
      ? `You are "LifeFlow" — the user's smart friend who understands them perfectly. You speak casual, friendly English like a close friend texting.

User info:
- Name: ${name}
- Time: ${greeting}
- Productivity: ${avgScore}/100
- Energy: ${energy}/100
- Urgent tasks: ${urgentTasks.length}${urgentTasks.length > 0 ? ' (top: ' + urgentTasks.slice(0,2).map(t=>t.title).join(', ') + ')' : ''}
- Pending tasks: ${todayTasks.length}

Strict rules:
1. Respond in English — casual and friendly, like a friend on WhatsApp. Not formal.
2. Keep replies to 2-3 sentences max. No intros or outros.
3. Never say bot phrases like "I'm here to help", "Don't hesitate", "Is there anything else?"
4. Use the real data in your responses — don't make stuff up.
5. If a task is overdue or important, mention it by name.
6. Max 1-2 emojis per response.`
      : `أنت "LifeFlow" — صاحب المستخدم الذكي اللي بيفهمه من نص كلمة. بتتكلم مصري طبيعي.

معلومات المستخدم:
- الاسم: ${name}
- الوقت: ${greeting}
- الإنتاجية: ${avgScore}/100
- الطاقة: ${energy}/100
- المهام العاجلة: ${urgentTasks.length} مهمة${urgentTasks.length > 0 ? ' (أبرزها: ' + urgentTasks.slice(0,2).map(t=>t.title).join('، ') + ')' : ''}
- مهام معلقة: ${todayTasks.length}

قواعد صارمة:
1. رد بالعربي المصري — ممنوع أي حرف صيني أو ياباني غير أسماء المهام
2. اتكلم مصري عادي — "ازيك"، "يلا"، "كده"
3. ردك 2-3 جمل بالكتير. مش محتاج مقدمات
4. ممنوع جمل البوتات: "أنا هنا لمساعدتك"، "لا تتردد"، "بكل سرور"، "هل تحتاج مساعدة أخرى؟"
5. استخدم البيانات الحقيقية في ردك — ماتخترعش حاجة`;

    // Include last 6 turns for context
    const historyMessages = session.history.slice(-6).map(h => ({
      role   : h.role,
      content: h.content,
    }));

    // ─── Try real AI first ────────────────────────────────────────────────────
    let reply = '';
    // Check both GROQ_API_KEY and OPENAI_API_KEY (Groq-compatible)
    const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '';
    const hasRealKey = apiKey && apiKey !== 'demo-key' && !apiKey.startsWith('your-') && apiKey.length > 20;

    if (hasRealKey) {
      try {
        const { postJSON: _unused, ...rest } = {};
        // Build full message for multi-turn context
        const fullUserMsg = historyMessages.length > 0
          ? `[سياق المحادثة السابقة: ${historyMessages.map(h => `${h.role === 'user' ? 'المستخدم' : 'المساعد'}: ${h.content}`).join(' | ')}]\n\nرسالة المستخدم الحالية: ${message}`
          : message;

        reply = await chat(systemPrompt, fullUserMsg, { type: 'copilot', maxTokens: 500 });
        logger.info('[CONV-ENGINE] Real AI response generated');
      } catch (aiErr) {
        logger.warn('[CONV-ENGINE] AI failed, using fallback:', aiErr.message);
        reply = buildFallbackReply(intent, name, energy, avgScore, urgentTasks, isEnglish);
      }
    } else {
      reply = buildFallbackReply(intent, name, energy, avgScore, urgentTasks, isEnglish);
    }

    // Sanitize reply — remove CJK chars and bot phrases
    reply = sanitizeConvReply(reply);

    // Pick suggestions based on language
    const baseSuggestions = SUGGESTIONS_MAP[intent] || SUGGESTIONS_MAP.general;
    const enSuggestions = {
      greeting:      ["How's my energy?", 'My overall status', "Today's tip"],
      energy_query:  ['How to boost energy?', 'Best focus times?'],
      mood_query:    ['Weekly mood analysis', 'How to improve?'],
      productivity:  ['Improve productivity?', 'Overdue tasks'],
      burnout_query: ['Avoid burnout?', 'Signs of stress?'],
      goal_query:    ['Help me organize tasks', 'Set realistic goals?'],
      status_check:  ['Productivity details', "Today's plan"],
      general:       ['My status', "Today's tip", 'My tasks today'],
    };
    const suggestions = isEnglish ? (enSuggestions[intent] || enSuggestions.general) : baseSuggestions;

    // Store in session
    session.history.push({ role: 'user',      content: message, timestamp: Date.now() });
    session.history.push({ role: 'assistant', content: reply,   timestamp: Date.now() });
    session.turnCount += 1;
    if (session.history.length > 20) session.history = session.history.slice(-20);

    return {
      reply,
      intent,
      suggestions,
      session_id : `${userId}_session`,
      turn       : session.turnCount,
      context    : { energy, productivity: avgScore, pending_tasks: todayTasks.length },
      ai_powered : hasRealKey,
    };
  } catch (err) {
    logger.error('[CONV-ENGINE] Error:', err.message);
    return {
      reply      : 'حصل مشكلة بسيطة — جرّب تاني كمان شوية 🙏',
      intent     : 'error',
      suggestions: ['أعد المحاولة', 'كيف طاقتي؟'],
      ai_powered : false,
    };
  }
}

// ─── Smart rule-based fallback ────────────────────────────────────────────────
function buildFallbackReply(intent, name, energy, avgScore, urgentTasks, isEnglish = false) {
  if (isEnglish) {
    switch (intent) {
      case 'greeting':
        return avgScore >= 65
          ? `Hey ${name}! Productivity ${avgScore}/100, energy ${energy}/100 — looking good 💪`
          : `Hey ${name}! Energy ${energy}/100, productivity ${avgScore}/100. What should we start with?`;
      case 'energy_query':
        return energy >= 70
          ? `Your energy is high today 🔥 (${energy}/100) — tackle the hard tasks now.`
          : energy >= 50
            ? `Energy is moderate (${energy}/100). Focus on one thing at a time ⚡`
            : `Energy is low (${energy}/100). Drink water and take a short break first 💧`;
      case 'productivity':
        return `Your productivity this week: ${avgScore}/100 ${avgScore >= 65 ? '— excellent! Keep it up 🌟' : avgScore >= 45 ? '— decent, room for improvement 💪' : '— try breaking tasks into smaller pieces.'}`;
      case 'burnout_query':
        return `${name}, if you're feeling exhausted — your body is telling you to rest. Take a real break 🧘`;
      case 'goal_query':
        return urgentTasks.length
          ? `You have ${urgentTasks.length} urgent tasks, ${name}. Most important: "${urgentTasks[0].title}". Let's start! 🎯`
          : `No urgent tasks right now, ${name}. Good time to plan ahead 📋`;
      case 'status_check':
        return `${name}, productivity ${avgScore}/100 | energy ${energy}/100 | ${urgentTasks.length} urgent tasks. ${avgScore >= 60 ? 'Looking good 👍' : 'Room for improvement 💡'}`;
      default:
        return `Hey ${name}! What do you want to start with — tasks, energy, productivity, or just chat?`;
    }
  }
  switch (intent) {
    case 'greeting':
      if (avgScore >= 65) return `أهلاً ${name}! إنتاجيتك ${avgScore}/100 وطاقتك ${energy}/100 — ماشي كويس 💪`;
      return `أهلاً ${name}! طاقتك ${energy}/100 وإنتاجيتك ${avgScore}/100. عايز تبدأ بإيه؟`;
    case 'energy_query':
      return energy >= 70
        ? `طاقتك عالية النهارده 🔥 (${energy}/100) — استغلها في المهام الصعبة.`
        : energy >= 50
          ? `طاقتك متوسطة (${energy}/100). ركّز على حاجة واحدة وخد راحة بين المهام ⚡`
          : `طاقتك واطية (${energy}/100). اشرب مية وخد راحة صغيرة الأول 💧`;
    case 'productivity':
      return `إنتاجيتك الأسبوع ده ${avgScore}/100 ${avgScore >= 65 ? '— ممتازة! كمّل كده 🌟' : avgScore >= 45 ? '— كويسة بس في مجال للتحسين 💪' : '— جرّب تقسّم المهام لحاجات أصغر.'}`;
    case 'burnout_query':
      return `${name}، لو حاسس بإرهاق أو قلة تركيز — ده جسمك بيقولك كفاية. خد راحة حقيقية 🧘`;
    case 'goal_query':
      return urgentTasks.length
        ? `عندك ${urgentTasks.length} مهمة عاجلة يا ${name}. الأهم: "${urgentTasks[0].title}". يلا نبدأ بيها 🎯`
        : `مافيش مهام عاجلة دلوقتي يا ${name}. فرصة تخطّط للي جاي 📋`;
    case 'status_check':
      return `${name}، إنتاجيتك ${avgScore}/100 | طاقتك ${energy}/100 | ${urgentTasks.length} مهام عاجلة. ${avgScore >= 60 ? 'ماشي كويس 👍' : 'في مجال للتحسين 💡'}`;
    default:
      return `أهلاً ${name}! عايز تبدأ بإيه — مهام، طاقة، إنتاجية، ولا عايز تتكلم؟`;
  }
}

function getConversationHistory(userId) {
  const session = sessions.get(userId);
  if (!session) return { history: [], turn_count: 0 };
  return { history: session.history, turn_count: session.turnCount, started_at: new Date(session.createdAt).toISOString() };
}

function clearConversation(userId) {
  sessions.delete(userId);
  return { cleared: true };
}

module.exports = { processMessage, getConversationHistory, clearConversation, detectIntent };
