/**
 * AI Planner Service
 * ===================
 * Generates a structured daily plan using tasks, energy predictions,
 * focus windows, and habits.
 *
 * Inputs:  tasks[], energy_predictions{}, focus_windows[], habits[]
 * Outputs: { morning_plan, afternoon_plan, evening_plan, priority_tasks, focus_tip, daily_summary }
 *
 * Fallback: Returns a safe static response if AI is unavailable.
 */

'use strict';

const logger = require('../../utils/logger');
const { sendWithFallback } = require('./ai.provider.selector');

// ─── System Prompt ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `أنت مخطط يوم ذكي يعمل ضمن تطبيق LifeFlow.
مهمتك: بناء خطة يوم مُثلى ومُقسّمة زمنياً بناءً على مهام المستخدم ومستوى طاقته ونوافذ التركيز.
يجب أن تُعيد دائماً JSON صحيحاً بهذه الحقول بالضبط:
{
  "morning_plan": [{"time": "09:00", "task": "وصف المهمة", "duration_min": 60}],
  "afternoon_plan": [{"time": "13:00", "task": "وصف المهمة", "duration_min": 45}],
  "evening_plan": [{"time": "18:00", "task": "وصف المهمة", "duration_min": 30}],
  "priority_tasks": ["أهم مهمة1", "أهم مهمة2", "أهم مهمة3"],
  "focus_tip": "نصيحة تركيز مخصصة",
  "daily_summary": "ملخص اليوم المقترح"
}
رتّب المهام حسب الأهمية والطاقة المتاحة في كل فترة.`;

// ─── Fallback response ────────────────────────────────────────────────────────
const FALLBACK = {
  morning_plan   : [{ time: '09:00', task: 'ابدأ بأهم مهمة', duration_min: 60 }],
  afternoon_plan : [{ time: '14:00', task: 'راجع تقدمك', duration_min: 30 }],
  evening_plan   : [{ time: '19:00', task: 'مراجعة اليوم وتخطيط الغد', duration_min: 20 }],
  priority_tasks : ['أكمل المهام المتأخرة'],
  focus_tip      : 'ركز على مهمة واحدة في كل مرة.',
  daily_summary  : 'خطة اليوم ستتوفر عند استعادة الاتصال بالذكاء الاصطناعي.',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function describeEnergyPrediction(pred = {}) {
  if (!pred || Object.keys(pred).length === 0) return 'طاقة معتدلة متوقعة';
  const { morning = 60, afternoon = 55, evening = 40 } = pred;
  return `الصباح: ${morning}/100 | الظهيرة: ${afternoon}/100 | المساء: ${evening}/100`;
}

function describeFocusWindows(windows = []) {
  if (!windows.length) return 'نوافذ تركيز عامة';
  return windows.slice(0, 3).map(w => `${w.start || ''}-${w.end || ''} (${w.quality || 'جيد'})`).join(', ');
}

function describeHabits(habits = []) {
  if (!habits.length) return 'لا توجد عادات محددة';
  return habits.slice(0, 5).map(h => `${h.title || h.name || 'عادة'} (${h.frequency || 'يومي'})`).join(', ');
}

function describeTasks(tasks = []) {
  if (!tasks.length) return 'لا توجد مهام مُدرجة';
  return tasks.slice(0, 8).map((t, i) =>
    `${i + 1}. ${t.title || t.name || 'مهمة'} [${t.priority || 'عادي'}]`
  ).join('\n');
}

// ─── Main function ────────────────────────────────────────────────────────────
/**
 * getDailyPlan({ tasks, energy_predictions, focus_windows, habits, date })
 * Returns { morning_plan, afternoon_plan, evening_plan, priority_tasks, focus_tip, daily_summary, provider }
 */
async function getDailyPlan(data = {}) {
  const {
    tasks              = [],
    energy_predictions = {},
    focus_windows      = [],
    habits             = [],
    date               = new Date().toISOString().slice(0, 10),
  } = data;

  const userPrompt = `
التاريخ: ${date}

المهام المطلوبة (${tasks.length} مهمة):
${describeTasks(tasks)}

توقعات الطاقة:
${describeEnergyPrediction(energy_predictions)}

نوافذ التركيز:
${describeFocusWindows(focus_windows)}

العادات اليومية:
${describeHabits(habits)}

ابنِ خطة يوم مُثلى تراعي مستوى الطاقة في كل فترة.
`.trim();

  try {
    logger.info('[AI-PLANNER] Requesting daily plan', {
      tasks  : tasks.length,
      habits : habits.length,
      date,
    });
    const { result, provider } = await sendWithFallback(SYSTEM_PROMPT, userPrompt, { maxTokens: 800 });
    logger.info('[AI-PLANNER] Response received', { provider });

    return {
      morning_plan   : Array.isArray(result.morning_plan)   ? result.morning_plan   : FALLBACK.morning_plan,
      afternoon_plan : Array.isArray(result.afternoon_plan) ? result.afternoon_plan : FALLBACK.afternoon_plan,
      evening_plan   : Array.isArray(result.evening_plan)   ? result.evening_plan   : FALLBACK.evening_plan,
      priority_tasks : Array.isArray(result.priority_tasks) ? result.priority_tasks : FALLBACK.priority_tasks,
      focus_tip      : result.focus_tip      || FALLBACK.focus_tip,
      daily_summary  : result.daily_summary  || FALLBACK.daily_summary,
      provider,
    };
  } catch (err) {
    logger.error('[AI-PLANNER] Error:', err.message);
    return { ...FALLBACK, provider: 'fallback' };
  }
}

module.exports = { getDailyPlan };
