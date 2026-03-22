/**
 * AI Insight Service
 * ===================
 * Generates behavioral insights from habit, mood, and energy data.
 *
 * Inputs:  habit_streaks[], timeline_events[], mood_history[], energy_data[]
 * Outputs: { behavior_insights, patterns_detected, suggestions, trend_summary }
 *
 * Fallback: Returns a safe static response if AI is unavailable.
 */

'use strict';

const logger = require('../../utils/logger');
const { sendWithFallback } = require('./ai.provider.selector');

// ─── System Prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `أنت محلل سلوكي متخصص يعمل ضمن تطبيق LifeFlow.
مهمتك: اكتشاف الأنماط السلوكية وتقديم رؤى معمّقة مبنية على بيانات العادات والمزاج والطاقة.
يجب أن تُعيد دائماً JSON صحيحاً بهذه الحقول بالضبط:
{
  "behavior_insights": "رؤية سلوكية رئيسية (فقرة واحدة)",
  "patterns_detected": ["نمط1", "نمط2", "نمط3"],
  "suggestions": ["اقتراح1", "اقتراح2"],
  "trend_summary": "ملخص الاتجاه العام خلال الفترة المحللة"
}
ركّز على الأنماط القابلة للقياس والتحسينات العملية.`;

// ─── Fallback response ────────────────────────────────────────────────────────
const FALLBACK = {
  behavior_insights : 'تحليل السلوك غير متاح مؤقتاً.',
  patterns_detected : ['سيتوفر تحليل الأنماط لاحقاً'],
  suggestions       : ['استمر في تسجيل بياناتك اليومية'],
  trend_summary     : 'سيتوفر ملخص الاتجاه عند استعادة الاتصال.',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function summarizeStreaks(streaks = []) {
  if (!streaks.length) return 'لا توجد عادات مسجّلة';
  return streaks.slice(0, 5).map(h => `${h.name || 'عادة'}: ${h.streak || 0} أيام`).join(', ');
}

function summarizeMood(history = []) {
  if (!history.length) return 'لا تتوفر بيانات مزاج';
  const avg = (history.reduce((s, m) => s + (m.mood_score || m.score || 5), 0) / history.length).toFixed(1);
  return `متوسط المزاج: ${avg}/10 (${history.length} إدخال)`;
}

function summarizeEnergy(energyData = []) {
  if (!energyData.length) return 'لا تتوفر بيانات طاقة';
  const avg = (energyData.reduce((s, e) => s + (e.energy_score || e.score || 55), 0) / energyData.length).toFixed(0);
  return `متوسط الطاقة: ${avg}/100`;
}

// ─── Main function ────────────────────────────────────────────────────────────
/**
 * getBehaviorInsights({ habit_streaks, timeline_events, mood_history, energy_data })
 * Returns { behavior_insights, patterns_detected, suggestions, trend_summary, provider }
 */
async function getBehaviorInsights(data = {}) {
  const {
    habit_streaks    = [],
    timeline_events  = [],
    mood_history     = [],
    energy_data      = [],
    period_days      = 7,
  } = data;

  const userPrompt = `
تحليل لآخر ${period_days} أيام:

العادات (أطول سلسلة):
${summarizeStreaks(habit_streaks)}

أحداث المحور الزمني: ${timeline_events.length} حدث
${timeline_events.slice(0, 3).map(e => `- ${e.title || e.type || 'حدث'}`).join('\n')}

المزاج:
${summarizeMood(mood_history)}

الطاقة:
${summarizeEnergy(energy_data)}

حلّل الأنماط واكتشف العلاقات بين المتغيرات.
`.trim();

  try {
    logger.info('[AI-INSIGHT] Requesting behavior insights', {
      habits: habit_streaks.length,
      moods : mood_history.length,
      energy: energy_data.length,
    });
    const { result, provider } = await sendWithFallback(SYSTEM_PROMPT, userPrompt, { maxTokens: 600 });
    logger.info('[AI-INSIGHT] Response received', { provider });

    return {
      behavior_insights : result.behavior_insights || FALLBACK.behavior_insights,
      patterns_detected : Array.isArray(result.patterns_detected) ? result.patterns_detected : FALLBACK.patterns_detected,
      suggestions       : Array.isArray(result.suggestions)       ? result.suggestions       : FALLBACK.suggestions,
      trend_summary     : result.trend_summary     || FALLBACK.trend_summary,
      provider,
    };
  } catch (err) {
    logger.error('[AI-INSIGHT] Error:', err.message);
    return { ...FALLBACK, provider: 'fallback' };
  }
}

module.exports = { getBehaviorInsights };
