/**
 * AI Service — Core Intelligence Layer
 * ======================================
 * Uses Groq (OpenAI-compatible API) as the primary LLM backend.
 * Falls back to static Arabic responses if the key is missing.
 *
 * Provider: Groq → https://api.groq.com/openai/v1
 * Model:    llama3-70b-8192  (or from OPENAI_MODEL env)
 */

'use strict';

const https  = require('https');
const logger = require('../utils/logger');

// Read at call time so dotenv override works properly
function getApiConfig() {
  // Prefer GROQ_API_KEY (our primary), fall back to OPENAI_API_KEY
  const key = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY || '';
  const url = 'https://api.groq.com/openai/v1';
  const model = process.env.OPENAI_MODEL || 'llama-3.3-70b-versatile';
  return { key, url, model };
}

// ─── HTTP helper (no extra deps) ──────────────────────────────────────────────
function postJSON(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u    = new URL(url);
    const opts = {
      hostname : u.hostname,
      port     : 443,
      path     : u.pathname,
      method   : 'POST',
      headers  : { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), ...headers },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.setTimeout(15_000, () => req.destroy(new Error('AI_TIMEOUT')));
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Core chat function ────────────────────────────────────────────────────────
async function chat(systemPrompt, userMessage, options = {}) {
  const { key: API_KEY, url: BASE_URL, model: MODEL } = getApiConfig();
  // If key is not set or is a placeholder, return fallback immediately
  if (!API_KEY || API_KEY === 'demo-key' || API_KEY.startsWith('your-')) {
    logger.debug('[AI-SERVICE] No real API key — using fallback response');
    return getFallbackResponse(options.type);
  }

  try {
    const payload = JSON.stringify({
      model   : MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userMessage  },
      ],
      max_tokens  : options.maxTokens  || 600,
      temperature : options.temperature || 0.7,
      ...(options.jsonMode && { response_format: { type: 'json_object' } }),
    });

    const { status, body } = await postJSON(
      `${BASE_URL}/chat/completions`,
      { Authorization: `Bearer ${API_KEY}` },
      payload
    );

    if (status === 429) { logger.warn('[AI-SERVICE] Rate limit hit'); return getFallbackResponse(options.type); }
    if (status !== 200) throw new Error(`Groq HTTP ${status}: ${body.slice(0, 200)}`);

    const parsed  = JSON.parse(body);
    const content = parsed?.choices?.[0]?.message?.content || '';
    logger.debug('[AI-SERVICE] Response received', { model: MODEL, chars: content.length });

    if (options.jsonMode) {
      try { return JSON.parse(content); }
      catch {
        // Try extracting JSON block from text
        const match = content.match(/\{[\s\S]*\}/);
        if (match) try { return JSON.parse(match[0]); } catch { /* ignore */ }
        logger.warn('[AI-SERVICE] JSON parse failed, returning fallback');
        return getFallbackResponse(options.type);
      }
    }
    return content;
  } catch (error) {
    logger.error('[AI-SERVICE] Error:', error.message);
    return getFallbackResponse(options.type);
  }
}

// ─── System prompt template ────────────────────────────────────────────────────
const SYSTEM_PROMPTS = {
  assistant: (user) => `أنت "LifeFlow"، مساعد شخصي ذكي ومميز باللغة العربية.
شخصيتك: مشجع، إيجابي، ومحترف.
معلومات المستخدم:
- الاسم: ${user?.name || 'المستخدم'}
- المنطقة الزمنية: ${user?.timezone || 'Africa/Cairo'}

قواعد مهمة:
1. تحدث دائماً بالعربية فقط (لا تستخدم أحرف صينية أو يابانية أو كورية مطلقاً)
2. كن مشجعاً وإيجابياً
3. قدم توصيات عملية وقابلة للتنفيذ
4. اجعل ردودك مختصرة ومفيدة
5. استخدم إيموجي باعتدال
6. لا تستخدم رمز "??" أبداً — إذا لم تعرف كلمة اكتب بديلاً عربياً
7. تأكد أن كل الحروف العربية مكتملة ولا ينقص منها شيء`,
};

// ─── AI Service methods ────────────────────────────────────────────────────────
const aiService = {

  async prioritizeTask(task, user) {
    const sys = SYSTEM_PROMPTS.assistant(user) + `\nمهمتك: تحليل المهمة وإعطاء درجة أولوية من 0 إلى 100.\nأعد JSON فقط: {"score":75,"reasoning":"سبب الدرجة","suggestions":["اقتراح1","اقتراح2"]}`;
    const msg = `المهمة: ${task.title}\nالأولوية: ${task.priority}\nالموعد: ${task.due_date || 'غير محدد'}`;
    const result = await chat(sys, msg, { jsonMode: true, type: 'priority' });
    return { score: result.score || 50, suggestions: result.suggestions || [], reasoning: result.reasoning || '' };
  },

  async breakdownTask(title, description, user) {
    const sys = SYSTEM_PROMPTS.assistant(user) + `\nمهمتك: تقسيم المهمة إلى مهام فرعية صغيرة.\nأعد JSON فقط: {"subtasks":[{"title":"...","estimated_duration":30,"priority":"high","description":"..."}],"tips":["نصيحة"]}`;
    return await chat(sys, `المهمة: ${title}\nالوصف: ${description || 'لا يوجد'}`, { jsonMode: true, type: 'breakdown' });
  },

  async analyzeMood(moodEntry, user) {
    const sys = SYSTEM_PROMPTS.assistant(user) + `\nأنت محلل نفسي لطيف.\nأعد JSON: {"analysis":"تحليل موجز","recommendation":"توصية عملية","action_items":["فعل1","فعل2"]}`;
    const msg = `درجة المزاج: ${moodEntry.mood_score}/10\nالمشاعر: ${(moodEntry.emotions || []).join('، ')}\nمستوى الطاقة: ${moodEntry.energy_level || 'غير محدد'}\nالملاحظات: ${moodEntry.journal_entry || 'لا يوجد'}`;
    return await chat(sys, msg, { jsonMode: true, type: 'mood' });
  },

  async generateDailySummary({ user, date, tasks, habits, mood }) {
    const sys = SYSTEM_PROMPTS.assistant(user) + `\nمهمتك: كتابة ملخص يومي مشجع.\nأعد JSON: {"summary":"الملخص (3-5 جمل)","highlights":["إنجاز1"],"recommendations":["توصية1","توصية2"]}`;
    const msg = `التاريخ: ${date}\nالمهام: ${tasks.completed}/${tasks.total} مكتملة\nالعادات: ${habits.completed}/${habits.total} مكتملة\nالمزاج: ${mood ? `${mood.mood_score}/10` : 'لم يُسجَّل'}`;
    return await chat(sys, msg, { jsonMode: true, type: 'daily_summary', maxTokens: 800 });
  },

  async generateWeeklyReport({ user, tasks, habits, mood, period }) {
    const sys = SYSTEM_PROMPTS.assistant(user) + `\nمهمتك: كتابة تقرير أسبوعي شامل.\nأعد JSON: {"report":"التقرير","strengths":["نقطة قوة"],"areas_to_improve":["مجال"],"recommendations":["توصية"],"next_week_goals":["هدف"]}`;
    const msg = `معدل المهام: ${tasks.completion_rate}%\nالعادات: ${habits.consistency_rate}%\nالمزاج: ${mood?.average || 'غير متاح'}/10`;
    return await chat(sys, msg, { jsonMode: true, type: 'weekly_report', maxTokens: 1000 });
  },

  async analyzeBehavior(behaviorData, user) {
    const sys = SYSTEM_PROMPTS.assistant(user) + `\nمهمتك: تحليل أنماط السلوك.\nأعد JSON: {"analysis":"التحليل","peak_productivity_insight":"رؤية","habit_pattern":"النمط","recommendations":["توصية"],"action_plan":["خطوة"]}`;
    return await chat(sys, JSON.stringify(behaviorData, null, 2), { jsonMode: true, type: 'behavior', maxTokens: 800 });
  },

  async getSmartSuggestion({ user, tasks, habits, habitLogs, mood, currentHour }) {
    const sys = SYSTEM_PROMPTS.assistant(user) + `\nمهمتك: تقديم اقتراح واحد ذكي مناسب للسياق.\nأعد JSON: {"suggestion":"الاقتراح","reason":"السبب","action":"ما يجب فعله","priority":"high/medium/low"}`;
    const pendingTasks = (tasks || []).filter(t => t.status === 'pending').length;
    const completedHabits = (habitLogs || []).filter(l => l.completed).length;
    const msg = `الوقت: ${currentHour}:00\nالمهام المعلقة: ${pendingTasks}\nالعادات المكتملة: ${completedHabits}/${(habits||[]).length}\nالمزاج: ${mood ? `${mood.mood_score}/10` : 'لم يُسجَّل'}`;
    return await chat(sys, msg, { jsonMode: true, type: 'suggestion' });
  },

  async analyzeHabit(habit, stats, user) {
    const sys = SYSTEM_PROMPTS.assistant(user) + `\nمهمتك: تحليل العادة.\nأعد JSON: {"analysis":"التحليل","strengths":["نقطة"],"recommendations":["توصية"],"motivation":"رسالة تحفيزية"}`;
    return await chat(sys, `العادة: ${habit.name}\nالتسلسل: ${stats.current_streak} يوم\nمعدل الإتمام: ${stats.completion_rate}%`, { jsonMode: true, type: 'habit_analysis' });
  },

  async getMoodInsight(entries, user) {
    const sys = SYSTEM_PROMPTS.assistant(user) + `\nمهمتك: تقديم رؤية عميقة حول مزاج المستخدم خلال الأسبوعين الماضيين.\nأعد نصاً عربياً مفيداً ومشجعاً (3-4 جمل فقط).`;
    const avg = entries.length > 0 ? (entries.reduce((s, e) => s + e.mood_score, 0) / entries.length).toFixed(1) : 5;
    return await chat(sys, `متوسط المزاج: ${avg}/10\nعدد التسجيلات: ${entries.length}`, { type: 'mood_insight' });
  },

  async getProductivityTips(user) {
    const sys = SYSTEM_PROMPTS.assistant(user) + `\nمهمتك: تقديم 5 نصائح إنتاجية مخصصة.\nأعد JSON: {"tips":[{"title":"...","description":"...","category":"time_management/focus/habits/mindset","difficulty":"easy/medium/hard"}]}`;
    return await chat(sys, `المستخدم: ${user.name}`, { jsonMode: true, type: 'tips', maxTokens: 800 });
  },

  async processVoiceCommand(text, user) {
    const sys = SYSTEM_PROMPTS.assistant(user) + `\nمهمتك: تحليل أمر صوتي.\nأعد JSON: {"intent":"create_task/complete_task/check_habits/check_mood/get_summary/ask_question","entities":{"task_title":null,"date":null},"response":"رد طبيعي","action":"الإجراء"}`;
    return await chat(sys, text, { jsonMode: true, type: 'voice_command' });
  },

  // ─── Copilot / conversation (real AI) ─────────────────────────────────────
  async copilotChat(userMessage, context, user) {
    const ctx = context || {};
    const sys = `${SYSTEM_PROMPTS.assistant(user)}

السياق الحالي للمستخدم:
- درجة الحياة: ${ctx.life_score || 'غير محددة'}/100
- درجة الطاقة: ${ctx.energy_score || 'غير محددة'}/100
- المهام المعلقة: ${ctx.pending_tasks || 0}
- المزاج الأخير: ${ctx.last_mood || 'غير مسجّل'}

أجب على سؤال المستخدم بشكل مباشر، ذكي، وشخصي. يمكنك طرح سؤال واحد للمتابعة إن لزم.`;
    return await chat(sys, userMessage, { type: 'copilot', maxTokens: 600 });
  },
};

// ─── Fallback responses ────────────────────────────────────────────────────────
function getFallbackResponse(type) {
  const fallbacks = {
    priority       : { score: 50, suggestions: ['راجع موعد التسليم', 'قدّر الوقت اللازم'], reasoning: 'أولوية متوسطة' },
    breakdown      : { subtasks: [{ title: 'البحث والتحضير', estimated_duration: 30, priority: 'high' }, { title: 'التنفيذ', estimated_duration: 60, priority: 'high' }, { title: 'المراجعة', estimated_duration: 20, priority: 'medium' }], tips: ['ابدأ بالخطوات الأصغر'] },
    mood           : { analysis: 'شكراً لمشاركتك مزاجك!', recommendation: 'استمر في تتبع مزاجك يومياً لفهم أنماطك', action_items: ['خذ استراحة قصيرة', 'اشرب كوب ماء'] },
    daily_summary  : { summary: 'يوم مليء بالإنجازات! كل خطوة صغيرة تقربك من أهدافك.', highlights: ['تسجيل حضور في التطبيق'], recommendations: ['راجع مهامك لغداً', 'احرص على النوم الجيد'] },
    weekly_report  : { report: 'أسبوع جديد فرصة جديدة للنمو!', strengths: ['الاستمرارية'], areas_to_improve: ['إدارة الوقت'], recommendations: ['ضع أولوياتك بوضوح'], next_week_goals: ['إتمام المهام المعلقة'] },
    behavior       : { analysis: 'لديك قدرة جيدة على إدارة مهامك.', peak_productivity_insight: 'معظم الناس أكثر إنتاجية في الصباح', habit_pattern: 'الاستمرارية مفتاح النجاح', recommendations: ['حدد أوقاتك المنتجة', 'استرح بين المهام'], action_plan: ['ابدأ يومك بمهمة مهمة'] },
    suggestion     : { suggestion: 'حان وقت مراجعة مهامك اليوم!', reason: 'الوقت المناسب للتخطيط', action: 'افتح قائمة المهام وحدد أولوياتك', priority: 'medium' },
    habit_analysis : { analysis: 'استمر في هذه العادة!', strengths: ['الاستمرارية'], recommendations: ['حافظ على وقت ثابت للعادة'], motivation: 'كل يوم تبني نسخة أفضل من نفسك!' },
    tips           : { tips: [{ title: 'قاعدة 2 دقيقة', description: 'إذا كانت المهمة تستغرق أقل من دقيقتين، افعلها الآن', category: 'time_management', difficulty: 'easy' }, { title: 'تقنية بومودورو', description: 'اعمل 25 دقيقة ثم استرح 5 دقائق', category: 'focus', difficulty: 'easy' }] },
    voice_command  : { intent: 'ask_question', entities: {}, response: 'عذراً، لم أفهم طلبك. هل يمكنك إعادة صياغته؟', action: 'retry' },
    mood_insight   : 'استمر في تتبع مزاجك يومياً! هذا يساعدك على فهم نفسك بشكل أفضل.',
    copilot        : 'أهلاً! قولّي إيه اللي محتاجه وهساعدك.',
    default        : 'أهلاً! قولّي عايز تعمل إيه وأنا معاك.',
  };
  return fallbacks[type] || fallbacks.default;
}

module.exports = { aiService, chat };
