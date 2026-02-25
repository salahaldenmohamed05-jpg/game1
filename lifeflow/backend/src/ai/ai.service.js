/**
 * AI Service - Core Intelligence Layer
 * ======================================
 * طبقة الذكاء الاصطناعي الأساسية
 * تستخدم OpenAI GPT لتوليد رؤى وتوصيات ذكية
 */

const OpenAI = require('openai');
const logger = require('../utils/logger');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'demo-key',
});

const MODEL = process.env.OPENAI_MODEL || 'gpt-4-turbo-preview';

/**
 * Core AI chat function - Arabic-optimized
 * دالة الذكاء الاصطناعي الأساسية - محسنة للعربية
 */
async function chat(systemPrompt, userMessage, options = {}) {
  try {
    if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'demo-key') {
      return getFallbackResponse(options.type);
    }

    const response = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: options.maxTokens || 500,
      temperature: options.temperature || 0.7,
      response_format: options.jsonMode ? { type: 'json_object' } : undefined,
    });

    const content = response.choices[0].message.content;
    return options.jsonMode ? JSON.parse(content) : content;
  } catch (error) {
    logger.error('OpenAI API error:', error.message);
    return getFallbackResponse(options.type);
  }
}

// =======================================
// System Prompt Templates
// =======================================

const SYSTEM_PROMPTS = {
  assistant: (user) => `
أنت "LifeFlow"، مساعد شخصي ذكي ومميز باللغة العربية.
شخصيتك: ${user?.ai_personality || 'friendly'} - مشجع، إيجابي، ومحترف.
معلومات المستخدم:
- الاسم: ${user?.name || 'المستخدم'}
- المنطقة الزمنية: ${user?.timezone || 'Africa/Cairo'}
- وقت الاستيقاظ: ${user?.wake_up_time || '07:00'}
- ساعات العمل: ${user?.work_start_time || '09:00'} - ${user?.work_end_time || '17:00'}

قواعد مهمة:
1. دائماً تحدث بالعربية
2. كن مشجعاً وإيجابياً
3. قدم توصيات عملية وقابلة للتنفيذ
4. اجعل ردودك مختصرة ومفيدة
5. استخدم إيموجي باعتدال لجعل النص أكثر حيوية
`,
};

// =======================================
// AI Service Methods
// =======================================

const aiService = {

  /**
   * Prioritize a task using AI
   * ترتيب أولوية المهمة بالذكاء الاصطناعي
   */
  async prioritizeTask(task, user) {
    const systemPrompt = SYSTEM_PROMPTS.assistant(user) + `
مهمتك: تحليل المهمة وإعطاء درجة أولوية من 0 إلى 100.
أعد JSON فقط بهذا الشكل:
{
  "score": 75,
  "reasoning": "سبب الدرجة بالعربية",
  "suggestions": ["اقتراح 1", "اقتراح 2"]
}`;

    const userMessage = `
المهمة: ${task.title}
الوصف: ${task.description || 'لا يوجد'}
الفئة: ${task.category}
الأولوية المحددة: ${task.priority}
الموعد النهائي: ${task.due_date || 'غير محدد'}
الوقت المقدر: ${task.estimated_duration ? task.estimated_duration + ' دقيقة' : 'غير محدد'}
`;

    const result = await chat(systemPrompt, userMessage, { jsonMode: true, type: 'priority' });
    return {
      score: result.score || 50,
      suggestions: result.suggestions || [],
      reasoning: result.reasoning || '',
    };
  },

  /**
   * Break down a large task into subtasks
   * تقسيم مهمة كبيرة لمهام صغيرة
   */
  async breakdownTask(title, description, user) {
    const systemPrompt = SYSTEM_PROMPTS.assistant(user) + `
مهمتك: تقسيم المهمة الكبيرة إلى مهام فرعية صغيرة قابلة للتنفيذ.
أعد JSON فقط:
{
  "subtasks": [
    {
      "title": "عنوان المهمة الفرعية",
      "estimated_duration": 30,
      "priority": "high",
      "description": "وصف مختصر"
    }
  ],
  "tips": ["نصيحة 1", "نصيحة 2"]
}`;

    return await chat(systemPrompt,
      `المهمة: ${title}\nالوصف: ${description || 'لا يوجد'}`,
      { jsonMode: true, type: 'breakdown' }
    );
  },

  /**
   * Analyze mood and give recommendation
   * تحليل المزاج وتقديم توصية
   */
  async analyzeMood(moodEntry, user) {
    const systemPrompt = SYSTEM_PROMPTS.assistant(user) + `
أنت محلل نفسي لطيف ومتعاطف.
مهمتك: تحليل مزاج المستخدم وتقديم توصية مفيدة.
أعد JSON:
{
  "analysis": "تحليل موجز للمزاج",
  "recommendation": "توصية عملية ومشجعة",
  "action_items": ["فعل 1", "فعل 2"]
}`;

    const msg = `
درجة المزاج: ${moodEntry.mood_score}/10
المشاعر: ${(moodEntry.emotions || []).join('، ')}
مستوى الطاقة: ${moodEntry.energy_level || 'غير محدد'}
مستوى التوتر: ${moodEntry.stress_level || 'غير محدد'}
التأثيرات الإيجابية: ${(moodEntry.factors?.positive || []).join('، ')}
التأثيرات السلبية: ${(moodEntry.factors?.negative || []).join('، ')}
الملاحظات: ${moodEntry.journal_entry || 'لا يوجد'}
`;

    return await chat(systemPrompt, msg, { jsonMode: true, type: 'mood' });
  },

  /**
   * Generate daily summary
   * إنشاء ملخص يومي
   */
  async generateDailySummary({ user, date, tasks, habits, mood }) {
    const systemPrompt = SYSTEM_PROMPTS.assistant(user) + `
مهمتك: كتابة ملخص يومي مشجع وإيجابي للمستخدم.
أعد JSON:
{
  "summary": "الملخص اليومي بالعربية (3-5 جمل)",
  "highlights": ["إنجاز 1", "إنجاز 2"],
  "recommendations": ["توصية لليوم التالي 1", "توصية 2", "توصية 3"]
}`;

    const msg = `
التاريخ: ${date}
المهام: ${tasks.completed}/${tasks.total} مكتملة
العادات: ${habits.completed}/${habits.total} مكتملة
المزاج: ${mood ? `${mood.mood_score}/10` : 'لم يُسجَّل'}
`;

    return await chat(systemPrompt, msg, { jsonMode: true, type: 'daily_summary', maxTokens: 800 });
  },

  /**
   * Generate weekly report
   * إنشاء تقرير أسبوعي
   */
  async generateWeeklyReport({ user, tasks, habits, mood, period }) {
    const systemPrompt = SYSTEM_PROMPTS.assistant(user) + `
مهمتك: كتابة تقرير أسبوعي شامل ومفصل للمستخدم.
أعد JSON:
{
  "report": "التقرير الأسبوعي (5-7 جمل)",
  "strengths": ["نقطة قوة 1", "نقطة قوة 2"],
  "areas_to_improve": ["مجال تطوير 1", "مجال 2"],
  "recommendations": ["توصية 1", "توصية 2", "توصية 3"],
  "next_week_goals": ["هدف 1", "هدف 2"]
}`;

    const msg = `
معدل إتمام المهام: ${tasks.completion_rate}%
معدل الاتساق في العادات: ${habits.consistency_rate}%
متوسط المزاج: ${mood?.average || 'غير متاح'}/10
`;

    return await chat(systemPrompt, msg, { jsonMode: true, type: 'weekly_report', maxTokens: 1000 });
  },

  /**
   * Analyze behavior patterns
   * تحليل أنماط السلوك
   */
  async analyzeBehavior(behaviorData, user) {
    const systemPrompt = SYSTEM_PROMPTS.assistant(user) + `
مهمتك: تحليل أنماط سلوك المستخدم خلال آخر 30 يوم.
أعد JSON:
{
  "analysis": "التحليل الشامل",
  "peak_productivity_insight": "رؤية عن ساعات الذروة",
  "habit_pattern": "نمط العادات",
  "recommendations": ["توصية 1", "توصية 2", "توصية 3"],
  "action_plan": ["خطوة 1", "خطوة 2"]
}`;

    return await chat(systemPrompt,
      JSON.stringify(behaviorData, null, 2),
      { jsonMode: true, type: 'behavior', maxTokens: 800 }
    );
  },

  /**
   * Get smart context-aware suggestion
   * اقتراح ذكي بناءً على السياق
   */
  async getSmartSuggestion({ user, tasks, habits, habitLogs, mood, currentHour }) {
    const systemPrompt = SYSTEM_PROMPTS.assistant(user) + `
مهمتك: تقديم اقتراح واحد ذكي ومناسب للسياق الحالي.
أعد JSON:
{
  "suggestion": "الاقتراح بالعربية",
  "reason": "سبب الاقتراح",
  "action": "ما يجب فعله",
  "priority": "high/medium/low"
}`;

    const pendingTasks = tasks.filter(t => t.status === 'pending').length;
    const completedHabits = habitLogs.filter(l => l.completed).length;

    const msg = `
الوقت الحالي: ${currentHour}:00
المهام المعلقة: ${pendingTasks}
العادات المكتملة اليوم: ${completedHabits}/${habits.length}
المزاج: ${mood ? `${mood.mood_score}/10` : 'لم يُسجَّل'}
`;

    return await chat(systemPrompt, msg, { jsonMode: true, type: 'suggestion' });
  },

  /**
   * Analyze a specific habit
   * تحليل عادة محددة
   */
  async analyzeHabit(habit, stats, user) {
    const systemPrompt = SYSTEM_PROMPTS.assistant(user) + `
مهمتك: تحليل عادة المستخدم وتقديم رؤى قيمة.
أعد JSON:
{
  "analysis": "تحليل العادة",
  "strengths": ["نقطة قوة"],
  "recommendations": ["توصية 1", "توصية 2"],
  "motivation": "رسالة تحفيزية"
}`;

    return await chat(systemPrompt,
      `العادة: ${habit.name}\nالتسلسل الحالي: ${stats.current_streak} يوم\nمعدل الإتمام: ${stats.completion_rate}%`,
      { jsonMode: true, type: 'habit_analysis' }
    );
  },

  /**
   * Get mood insight
   */
  async getMoodInsight(entries, user) {
    const systemPrompt = SYSTEM_PROMPTS.assistant(user) + `
مهمتك: تقديم رؤية عميقة حول مزاج المستخدم خلال الأسبوعين الماضيين.
أعد نصاً عربياً مفيداً ومشجعاً (3-4 جمل).`;

    const avgMood = entries.length > 0
      ? (entries.reduce((s, e) => s + e.mood_score, 0) / entries.length).toFixed(1)
      : 5;

    return await chat(systemPrompt,
      `متوسط المزاج: ${avgMood}/10\nعدد التسجيلات: ${entries.length}`,
      { type: 'mood_insight' }
    );
  },

  /**
   * Get productivity tips
   * نصائح إنتاجية مخصصة
   */
  async getProductivityTips(user) {
    const systemPrompt = SYSTEM_PROMPTS.assistant(user) + `
مهمتك: تقديم 5 نصائح إنتاجية مخصصة للمستخدم.
أعد JSON:
{
  "tips": [
    {
      "title": "عنوان النصيحة",
      "description": "شرح مختصر",
      "category": "time_management/focus/habits/mindset",
      "difficulty": "easy/medium/hard"
    }
  ]
}`;

    return await chat(systemPrompt,
      `معلومات المستخدم: ${user.name}, وقت العمل: ${user.work_start_time}-${user.work_end_time}`,
      { jsonMode: true, type: 'tips', maxTokens: 800 }
    );
  },

  /**
   * Voice command processing
   * معالجة الأوامر الصوتية
   */
  async processVoiceCommand(text, user) {
    const systemPrompt = SYSTEM_PROMPTS.assistant(user) + `
مهمتك: تحليل أمر صوتي وتحديد النية والإجراء المطلوب.
أعد JSON:
{
  "intent": "create_task/complete_task/check_habits/check_mood/get_summary/ask_question",
  "entities": {
    "task_title": null,
    "date": null,
    "time": null,
    "habit_name": null
  },
  "response": "رد طبيعي للمستخدم",
  "action": "الإجراء الموصى به"
}`;

    return await chat(systemPrompt, text, { jsonMode: true, type: 'voice_command' });
  },
};

// =======================================
// Fallback responses when AI is offline
// =======================================

function getFallbackResponse(type) {
  const fallbacks = {
    priority: { score: 50, suggestions: ['راجع موعد التسليم', 'قدّر الوقت اللازم'], reasoning: 'أولوية متوسطة' },
    breakdown: { subtasks: [{ title: 'البحث والتحضير', estimated_duration: 30, priority: 'high' }, { title: 'التنفيذ', estimated_duration: 60, priority: 'high' }, { title: 'المراجعة', estimated_duration: 20, priority: 'medium' }], tips: ['ابدأ بالخطوات الأصغر'] },
    mood: { analysis: 'شكراً لمشاركتك مزاجك معي!', recommendation: 'استمر في تتبع مزاجك يومياً لفهم أنماطك', action_items: ['خذ استراحة قصيرة', 'اشرب كوب ماء'] },
    daily_summary: { summary: 'يوم مليء بالإنجازات! كل خطوة صغيرة تقربك من أهدافك.', highlights: ['تسجيل حضور في التطبيق'], recommendations: ['راجع مهامك لغداً', 'احرص على النوم الجيد', 'مارس نشاطاً بدنياً'] },
    weekly_report: { report: 'أسبوع جديد فرصة جديدة للنمو والتطور!', strengths: ['الاستمرارية'], areas_to_improve: ['إدارة الوقت'], recommendations: ['ضع أولوياتك بوضوح', 'راجع أهدافك الأسبوعية'], next_week_goals: ['إتمام المهام المعلقة', 'الحفاظ على عاداتك اليومية'] },
    behavior: { analysis: 'بناءً على بياناتك، لديك قدرة جيدة على إدارة مهامك.', peak_productivity_insight: 'معظم الناس أكثر إنتاجية في الصباح', habit_pattern: 'الاستمرارية مفتاح النجاح', recommendations: ['حدد أوقاتك المنتجة', 'استرح بين المهام', 'تابع تقدمك يومياً'], action_plan: ['ابدأ يومك بمهمة مهمة', 'راجع أهدافك أسبوعياً'] },
    suggestion: { suggestion: 'حان وقت مراجعة مهامك اليوم!', reason: 'الوقت المناسب للتخطيط', action: 'افتح قائمة المهام وحدد أولوياتك', priority: 'medium' },
    habit_analysis: { analysis: 'استمر في هذه العادة الرائعة!', strengths: ['الاستمرارية'], recommendations: ['حاول الحفاظ على وقت ثابت للعادة'], motivation: 'كل يوم تبني نسخة أفضل من نفسك!' },
    tips: { tips: [{ title: 'قاعدة 2 دقيقة', description: 'إذا كانت المهمة تستغرق أقل من دقيقتين، افعلها الآن', category: 'time_management', difficulty: 'easy' }, { title: 'تقنية بومودورو', description: 'اعمل 25 دقيقة ثم استرح 5 دقائق', category: 'focus', difficulty: 'easy' }, { title: 'صباح منتج', description: 'ابدأ يومك بأهم مهمة قبل التحقق من البريد', category: 'habits', difficulty: 'medium' }, { title: 'قلل التشتيت', description: 'أغلق الإشعارات أثناء العمل المركز', category: 'focus', difficulty: 'easy' }, { title: 'راجع يومك', description: 'خصص 10 دقائق في المساء لمراجعة ما أنجزته', category: 'mindset', difficulty: 'easy' }] },
    voice_command: { intent: 'ask_question', entities: {}, response: 'عذراً، لم أفهم طلبك. هل يمكنك إعادة صياغته؟', action: 'retry' },
    mood_insight: 'استمر في تتبع مزاجك يومياً! هذا يساعدك على فهم نفسك أفضل.',
    default: 'شكراً لاستخدامك LifeFlow! دائماً هنا لمساعدتك.',
  };
  return fallbacks[type] || fallbacks.default;
}

module.exports = { aiService, chat };
