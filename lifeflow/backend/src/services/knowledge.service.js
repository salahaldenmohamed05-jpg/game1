/**
 * Knowledge Service  —  Phase 4
 * ================================
 * Provides factual, trusted answers via:
 *   1. Curated local knowledge base (KB)
 *   2. AI synthesis via Groq LLM
 * Returns { answer, source, confidence, related }
 *
 * Integrated into:
 *   - ai.client.js  (enriches prompts)
 *   - orchestrator.service.js  (context injection)
 *   - GET /ai/knowledge?query=…
 */

'use strict';

const logger = require('../utils/logger');

/* ─── Local knowledge base ────────────────────────────────────── */
const LOCAL_KB = [
  // Productivity
  { topic: 'pomodoro', keywords: ['بومودورو','pomodoro','تقنية التركيز','focus technique'],
    answer: 'تقنية بومودورو: اعمل 25 دقيقة ثم خذ استراحة 5 دقائق، وبعد 4 جولات استرح 15-30 دقيقة. تحسّن التركيز بنسبة 40%.',
    source: 'Productivity Research', confidence: 0.95 },
  { topic: 'sleep', keywords: ['نوم','sleep','ساعات النوم','hours of sleep'],
    answer: 'البالغون يحتاجون 7–9 ساعات نوم يومياً. النوم قبل منتصف الليل يحسّن جودة النوم العميق (REM).',
    source: 'Sleep Foundation', confidence: 0.95 },
  { topic: 'water', keywords: ['ماء','شرب الماء','water intake','hydration'],
    answer: 'يُنصح بشرب 8 أكواب (2 لتر) من الماء يومياً. في الطقس الحار أو عند ممارسة الرياضة يجب زيادة الكمية.',
    source: 'WHO', confidence: 0.93 },
  { topic: 'exercise', keywords: ['تمرين','رياضة','exercise','workout','تمارين'],
    answer: 'منظمة الصحة العالمية توصي بـ 150 دقيقة نشاط بدني متوسط الشدة أسبوعياً، أو 75 دقيقة نشاط مكثف.',
    source: 'WHO Guidelines', confidence: 0.95 },
  { topic: 'meditation', keywords: ['تأمل','meditation','mindfulness','يقظة ذهنية'],
    answer: 'التأمل 10-20 دقيقة يومياً يقلل التوتر بنسبة 30% ويحسّن التركيز والذاكرة العاملة.',
    source: 'Mindfulness Research', confidence: 0.88 },
  { topic: 'cognitive_load', keywords: ['تعدد مهام','multitasking','cognitive load','عبء معرفي'],
    answer: 'تعدد المهام يقلل الإنتاجية بنسبة 40%. التحويل بين المهام يستغرق 15-20 دقيقة لاستعادة التركيز الكامل.',
    source: 'APA Research', confidence: 0.90 },
  { topic: 'break', keywords: ['استراحة','break','rest','راحة'],
    answer: 'الاستراحات القصيرة (5-10 دق) كل ساعة تزيد الإنتاجية 13% وتقلل الإجهاد الذهني.',
    source: 'Ergonomics Research', confidence: 0.88 },
  { topic: 'habit_formation', keywords: ['تكوين عادة','habit formation','21 day','66 day','بناء عادة'],
    answer: 'يستغرق تكوين عادة جديدة 66 يوماً في المتوسط (لا 21 يوماً). التكرار في نفس السياق يسرّع التثبيت.',
    source: 'UCL Study 2010', confidence: 0.90 },
  { topic: 'burnout', keywords: ['إرهاق','احتراق وظيفي','burnout','إجهاد'],
    answer: 'الاحتراق الوظيفي يتسم بثلاثة أبعاد: الإرهاق العاطفي، الانفصال، وانخفاض الكفاءة. العلاج: حدود واضحة + راحة منتظمة.',
    source: 'WHO ICD-11', confidence: 0.92 },
  { topic: 'sugar', keywords: ['سكر','sugar','سكريات','caffeine','كافيين'],
    answer: 'السكر الزائد يسبب ارتفاعاً سريعاً ثم انهياراً في الطاقة. الكافيين يؤثر على النوم إذا تناولته بعد 2 م.',
    source: 'Nutrition Science', confidence: 0.87 },
];

/* ─── Main query function ─────────────────────────────────────── */

/**
 * query(text, { useAI, aiClient, userId })
 * @returns {{ answer, source, confidence, related, query }}
 */
async function query(text, options = {}) {
  const { useAI = true, aiClient = null } = options;

  try {
    // 1. Try local KB first (fast, high confidence)
    const localResult = searchLocalKB(text);
    if (localResult && localResult.confidence >= 0.85) {
      logger.info(`[KNOWLEDGE] Local KB hit: "${localResult.topic}" — conf ${localResult.confidence}`);
      return {
        query:      text,
        answer:     localResult.answer,
        source:     localResult.source,
        confidence: localResult.confidence,
        from_cache: true,
        related:    getRelatedTopics(localResult.topic),
      };
    }

    // 2. AI synthesis fallback
    if (useAI && aiClient) {
      const aiAnswer = await askAI(text, aiClient);
      return {
        query:      text,
        answer:     aiAnswer,
        source:     'AI Synthesis',
        confidence: 0.72,
        from_cache: false,
        related:    [],
      };
    }

    // 3. Graceful fallback
    return {
      query:      text,
      answer:     `لا توجد معلومات كافية حول "${text}" في قاعدة المعرفة حالياً.`,
      source:     'Not Found',
      confidence: 0.0,
      from_cache: false,
      related:    [],
    };
  } catch (err) {
    logger.error('[KNOWLEDGE] Query error:', err.message);
    return {
      query:      text,
      answer:     'حدث خطأ أثناء البحث في قاعدة المعرفة.',
      source:     'Error',
      confidence: 0.0,
      related:    [],
    };
  }
}

/* ─── Local KB search ─────────────────────────────────────────── */

function searchLocalKB(text) {
  const lower = text.toLowerCase();
  let best = null;
  let bestScore = 0;

  for (const entry of LOCAL_KB) {
    let score = 0;
    for (const kw of entry.keywords) {
      if (lower.includes(kw.toLowerCase())) score += 1;
    }
    if (score > bestScore) { bestScore = score; best = entry; }
  }

  return bestScore > 0 ? best : null;
}

function getRelatedTopics(topic) {
  const relations = {
    sleep:          ['burnout', 'meditation', 'exercise'],
    burnout:        ['sleep', 'break', 'meditation'],
    pomodoro:       ['break', 'cognitive_load'],
    meditation:     ['burnout', 'sleep'],
    exercise:       ['sleep', 'water', 'break'],
    habit_formation:['pomodoro', 'break'],
  };

  return (relations[topic] || []).map(t => {
    const e = LOCAL_KB.find(k => k.topic === t);
    return e ? { topic: t, summary: e.answer.substring(0, 80) + '…' } : null;
  }).filter(Boolean);
}

/* ─── AI synthesis ────────────────────────────────────────────── */

async function askAI(question, aiClient) {
  const systemPrompt = `أنت مساعد معلوماتي موثوق. أجب بإيجاز ودقة على الأسئلة المتعلقة بالإنتاجية والصحة وإدارة الوقت والعادات. 
الإجابة يجب أن تكون مباشرة، مستندة إلى علم أو بحث، وبالعربية.`;

  try {
    const response = await aiClient.chat({
      systemPrompt,
      userMessage: question,
      maxTokens:   300,
    });
    return response?.content || response?.reply || 'لا يمكنني الإجابة حالياً.';
  } catch {
    return `بخصوص "${question}" — لا تتوفر إجابة AI حالياً.`;
  }
}

/* ─── List all topics ─────────────────────────────────────────── */

function getTopics() {
  return LOCAL_KB.map(e => ({
    topic:    e.topic,
    keywords: e.keywords,
    source:   e.source,
    confidence: e.confidence,
  }));
}

/* ─── Exports ─────────────────────────────────────────────────── */
module.exports = { query, getTopics, searchLocalKB };
