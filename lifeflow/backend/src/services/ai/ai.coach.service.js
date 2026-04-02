/**
 * AI Coach Service
 * =================
 * Generates personalized coaching insights using real LLM providers.
 *
 * Inputs:  energy_score, life_score, tasks_overdue, mood_trend
 * Outputs: { insight, recommendation, coach_tip, score_analysis }
 *
 * Fallback: Returns a safe static response if AI is unavailable.
 */

'use strict';

const logger = require('../../utils/logger');
const { sendWithFallback } = require('./ai.provider.selector');

// ─── System Prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `أنت مدرب حياة وإنتاجية متخصص يعمل ضمن تطبيق LifeFlow.
مهمتك: تحليل بيانات المستخدم وتقديم رؤى عملية وتوصيات مخصصة باللغة العربية.

قواعد الكتابة:
- اكتب بالعربية فقط ولا تستخدم أحرفاً صينية أو يابانية أو رمز "??" أبداً
- تأكد أن كل كلمة عربية مكتوبة بشكل صحيح وكامل بدون أحرف ناقصة
- قدّم نصائح مبنية على البيانات الحقيقية وليست عامة

يجب أن تُعيد دائماً JSON صحيحاً بهذه الحقول بالضبط:
{
  "insight": "رؤية تحليلية مختصرة مبنية على البيانات (جملتان كحد أقصى)",
  "recommendation": "توصية عملية واضحة وقابلة للتنفيذ مع خطوة محددة",
  "coach_tip": "نصيحة تحفيزية قصيرة وشخصية",
  "score_analysis": "تحليل موجز للدرجات مع مقارنة واضحة"
}
كن دقيقاً، إيجابياً، وعملياً. لا تكرر المعطيات.`;

// ─── Fallback response ────────────────────────────────────────────────────────
const FALLBACK = {
  insight         : 'الذكاء الاصطناعي غير متاح مؤقتاً.',
  recommendation  : 'حاول مرة أخرى لاحقاً.',
  coach_tip       : 'استمر في تتبع تقدمك اليومي.',
  score_analysis  : 'سيتوفر التحليل عند استعادة الاتصال.',
};

// ─── Main function ────────────────────────────────────────────────────────────
/**
 * getCoachResponse({ energy_score, life_score, tasks_overdue, mood_trend })
 * Returns { insight, recommendation, coach_tip, score_analysis, provider }
 */
async function getCoachResponse(data = {}) {
  const {
    energy_score   = 55,
    life_score     = 50,
    tasks_overdue  = 0,
    mood_trend     = 'stable',
    user_name      = 'المستخدم',
  } = data;

  const userPrompt = `
بيانات المستخدم الحالية:
- الاسم: ${user_name}
- درجة الطاقة: ${energy_score}/100
- درجة الحياة: ${life_score}/100
- المهام المتأخرة: ${tasks_overdue}
- اتجاه المزاج: ${mood_trend}

قدّم تحليلاً شاملاً وتوصيات مخصصة.
`.trim();

  try {
    logger.info('[AI-COACH] Requesting coach response', { energy_score, life_score, tasks_overdue, mood_trend });
    const { result, provider } = await sendWithFallback(SYSTEM_PROMPT, userPrompt, { maxTokens: 500 });
    logger.info('[AI-COACH] Response received', { provider });

    return {
      insight        : result.insight        || FALLBACK.insight,
      recommendation : result.recommendation || FALLBACK.recommendation,
      coach_tip      : result.coach_tip      || FALLBACK.coach_tip,
      score_analysis : result.score_analysis || FALLBACK.score_analysis,
      provider,
    };
  } catch (err) {
    logger.error('[AI-COACH] Error:', err.message);
    return { ...FALLBACK, provider: 'fallback' };
  }
}

module.exports = { getCoachResponse };
