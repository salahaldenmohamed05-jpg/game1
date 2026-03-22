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

// ─── Session management ────────────────────────────────────────────────────────
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
    const systemPrompt = `أنت "LifeFlow AI"، مساعد حياة شخصي ذكي ومتعاطف يتحدث بالعربية دائماً.

معلومات المستخدم الحالية:
- الاسم: ${name}
- الوقت: ${greeting}
- درجة الإنتاجية الأسبوعية: ${avgScore}/100
- درجة الطاقة اليوم: ${energy}/100
- المهام العاجلة: ${urgentTasks.length} مهمة${urgentTasks.length > 0 ? ' (أبرزها: ' + urgentTasks.slice(0,2).map(t=>t.title).join('، ') + ')' : ''}
- إجمالي المهام المعلقة: ${todayTasks.length}

قواعد:
1. تحدث بالعربية دائماً مع بعض الإيموجي
2. كن شخصياً وذكياً — أشر للبيانات الفعلية للمستخدم
3. أجب بشكل مباشر ومفيد وعملي
4. إذا كان السؤال غير واضح، اطرح سؤالاً توضيحياً واحداً
5. اجعل ردك في 2-4 جمل (إلا إذا طُلب تفصيل)`;

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
        reply = buildFallbackReply(intent, name, energy, avgScore, urgentTasks);
      }
    } else {
      reply = buildFallbackReply(intent, name, energy, avgScore, urgentTasks);
    }

    // Store in session
    session.history.push({ role: 'user',      content: message, timestamp: Date.now() });
    session.history.push({ role: 'assistant', content: reply,   timestamp: Date.now() });
    session.turnCount += 1;
    if (session.history.length > 20) session.history = session.history.slice(-20);

    return {
      reply,
      intent,
      suggestions: SUGGESTIONS_MAP[intent] || SUGGESTIONS_MAP.general,
      session_id : `${userId}_session`,
      turn       : session.turnCount,
      context    : { energy, productivity: avgScore, pending_tasks: todayTasks.length },
      ai_powered : hasRealKey,
    };
  } catch (err) {
    logger.error('[CONV-ENGINE] Error:', err.message);
    return {
      reply      : 'عذراً، حدث خطأ مؤقت. يرجى المحاولة مرة أخرى.',
      intent     : 'error',
      suggestions: ['أعد المحاولة', 'كيف طاقتي؟'],
      ai_powered : false,
    };
  }
}

// ─── Smart rule-based fallback ────────────────────────────────────────────────
function buildFallbackReply(intent, name, energy, avgScore, urgentTasks) {
  switch (intent) {
    case 'greeting':
      return `مرحباً ${name}! 😊 إنتاجيتك هذا الأسبوع ${avgScore}/100 وطاقتك اليوم ${energy}/100. بماذا يمكنني مساعدتك؟`;
    case 'energy_query':
      return energy >= 70
        ? `طاقتك عالية جداً اليوم 🔥 (${energy}/100)! هذا وقت مثالي للمهام الصعبة.`
        : energy >= 50
          ? `طاقتك معتدلة ⚡ (${energy}/100). ركّز على المهام المتوسطة وخذ استراحات قصيرة.`
          : `طاقتك منخفضة 💧 (${energy}/100). خذ استراحة واشرب ماءً قبل الاستمرار.`;
    case 'productivity':
      return `إنتاجيتك الأسبوعية ${avgScore}/100 ${avgScore >= 65 ? '🌟 ممتازة!' : avgScore >= 45 ? '💪 جيدة مع مجال للتحسين.' : '— جرّب تقسيم مهامك لأجزاء أصغر.'}`;
    case 'burnout_query':
      return `انتبه لعلامات الإجهاد: قلة التركيز، الإرهاق المستمر، وانخفاض الدافعية. إذا شعرت بها خذ استراحة حقيقية! 🧘`;
    case 'goal_query':
      return urgentTasks.length
        ? `لديك ${urgentTasks.length} مهام عاجلة ${name}. أبرزها: "${urgentTasks[0].title}". ابدأ بها الآن! 🎯`
        : `لا توجد مهام عاجلة الآن ${name}. فرصة لتخطيط مهامك القادمة! 📋`;
    case 'status_check':
      return `وضعك ${name}: إنتاجية ${avgScore}/100 | طاقة ${energy}/100 | ${urgentTasks.length} مهام عاجلة. ${avgScore >= 60 ? '👍 وضعك جيد!' : '💡 هناك مجال للتحسين.'}`;
    default:
      return `مرحباً ${name}! أنا LifeFlow AI مساعدك الشخصي. يمكنني مساعدتك في تتبع مهامك وطاقتك وإنتاجيتك. بماذا تريد البدء؟ 😊`;
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
