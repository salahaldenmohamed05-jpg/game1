/**
 * Task Decomposition Service — Phase 16
 * =======================================
 * Breaks down complex tasks into smaller actionable subtasks using AI.
 *
 * Input:  "Build graduation project"
 * Output: [
 *   { title: "تحديد موضوع المشروع",    duration: 30, priority: "high",   order: 1 },
 *   { title: "بحث وجمع المراجع",       duration: 60, priority: "high",   order: 2 },
 *   { title: "كتابة الخطة التفصيلية",   duration: 45, priority: "medium", order: 3 },
 *   { title: "التنفيذ والبرمجة",         duration: 240, priority: "high",  order: 4 },
 *   { title: "المراجعة والتصحيح",       duration: 60, priority: "medium", order: 5 },
 * ]
 */

'use strict';

const logger = require('../utils/logger');

// ─── Lazy loaders ─────────────────────────────────────────────────────────────
function getAIClient() { try { return require('./ai/ai.client'); } catch (_e) { logger.debug(`[TASK_DECOMPOSITION_SERVICE] Module './ai/ai.client' not available: ${_e.message}`); return null; } }

// ─── Static patterns for common task categories ───────────────────────────────
// Used when AI is unavailable
const DECOMPOSITION_PATTERNS = {
  study: [
    { title_template: 'قراءة الفصل الأول', duration: 45, priority: 'high' },
    { title_template: 'عمل ملاحظات وملخص', duration: 30, priority: 'medium' },
    { title_template: 'حل التمارين', duration: 45, priority: 'high' },
    { title_template: 'مراجعة ومذاكرة', duration: 30, priority: 'medium' },
  ],
  project: [
    { title_template: 'تحديد المتطلبات والنطاق', duration: 30, priority: 'high' },
    { title_template: 'التخطيط والتصميم', duration: 45, priority: 'high' },
    { title_template: 'التنفيذ الأساسي', duration: 120, priority: 'urgent' },
    { title_template: 'الاختبار والمراجعة', duration: 60, priority: 'high' },
    { title_template: 'التسليم النهائي', duration: 30, priority: 'urgent' },
  ],
  presentation: [
    { title_template: 'جمع المعلومات والمحتوى', duration: 45, priority: 'high' },
    { title_template: 'تصميم الشرائح', duration: 60, priority: 'medium' },
    { title_template: 'كتابة النصوص والملاحظات', duration: 30, priority: 'medium' },
    { title_template: 'التدريب على العرض', duration: 30, priority: 'high' },
  ],
  report: [
    { title_template: 'البحث وجمع المصادر', duration: 60, priority: 'high' },
    { title_template: 'كتابة المقدمة والهيكل', duration: 30, priority: 'medium' },
    { title_template: 'كتابة المحتوى الرئيسي', duration: 90, priority: 'high' },
    { title_template: 'المراجعة والتدقيق', duration: 30, priority: 'medium' },
    { title_template: 'التنسيق والتسليم', duration: 20, priority: 'medium' },
  ],
  generic: [
    { title_template: 'التحضير والتخطيط', duration: 20, priority: 'medium' },
    { title_template: 'البدء والتنفيذ الأولي', duration: 60, priority: 'high' },
    { title_template: 'الإتمام والمراجعة', duration: 30, priority: 'medium' },
  ],
};

function detectCategory(taskTitle) {
  const t = (taskTitle || '').toLowerCase();
  if (/مذاكرة|مراجعة|درس|دراسة|امتحان|اختبار|lecture|study/i.test(t)) return 'study';
  if (/مشروع|project|تطبيق|برنامج|develop|build/i.test(t)) return 'project';
  if (/تقديم|عرض|presentation|slide/i.test(t)) return 'presentation';
  if (/تقرير|بحث|report|essay/i.test(t)) return 'report';
  return 'generic';
}

// ─── AI-based decomposition ───────────────────────────────────────────────────
async function decomposeWithAI(taskTitle, taskContext = {}) {
  const aiClient = getAIClient();
  if (!aiClient) throw new Error('AI_CLIENT_UNAVAILABLE');

  const systemPrompt = `أنت مساعد تخطيط محترف. مهمتك تحليل المهمة وتقسيمها لخطوات صغيرة قابلة للتنفيذ.
أرجع JSON فقط بهذا الشكل بدون أي نص إضافي:
{
  "subtasks": [
    { "title": "عنوان الخطوة بالعربية", "duration": 30, "priority": "high|medium|low", "order": 1 }
  ],
  "total_estimated_minutes": 180,
  "complexity": "simple|medium|complex",
  "tips": ["نصيحة قصيرة"]
}
قواعد:
- من 3 إلى 7 خطوات فقط
- المدة الكلية لا تتجاوز 4 ساعات (240 دقيقة)
- ابدأ بالخطوة الأبسط أو التحضير
- انتهِ بمراجعة أو تسليم
- اكتب العناوين بالعربية فقط`;

  const userPrompt = `المهمة: "${taskTitle}"
${taskContext.category ? `الفئة: ${taskContext.category}` : ''}
${taskContext.due_date ? `الموعد النهائي: ${taskContext.due_date}` : ''}
${taskContext.priority ? `الأولوية: ${taskContext.priority}` : ''}`;

  const result = await aiClient.chat(systemPrompt, userPrompt, {
    temperature: 0.3,
    maxTokens  : 600,
    jsonMode   : true,
  });

  // Parse result
  if (typeof result === 'object' && result.subtasks) return result;
  if (typeof result === 'string') {
    const match = result.match(/\{[\s\S]*\}/);
    if (match) {
      const parsed = JSON.parse(match[0]);
      if (parsed.subtasks) return parsed;
    }
  }
  throw new Error('AI_PARSE_FAIL');
}

// ─── Static fallback decomposition ───────────────────────────────────────────
function decomposeStatic(taskTitle) {
  const category = detectCategory(taskTitle);
  const pattern  = DECOMPOSITION_PATTERNS[category] || DECOMPOSITION_PATTERNS.generic;

  const subtasks = pattern.map((p, i) => ({
    title            : p.title_template,
    duration         : p.duration,
    estimated_minutes: p.duration,   // alias
    priority         : p.priority,
    order            : i + 1,
  }));

  const total = subtasks.reduce((sum, s) => sum + s.duration, 0);

  return {
    subtasks,
    total_estimated_minutes: total,
    complexity: subtasks.length > 4 ? 'complex' : 'medium',
    tips: ['ابدأ بالخطوة الأولى دائماً — لا تنتظر الوقت المثالي', 'خذ استراحة 5 دقائق بين كل خطوتين'],
    source: 'static',
  };
}

// ─── Main function ─────────────────────────────────────────────────────────────
/**
 * Decompose a task into subtasks.
 * @param {string} taskTitle
 * @param {object} taskContext - { category, due_date, priority, estimated_minutes }
 * @returns {Promise<object>}
 */
async function decomposeTask(taskTitle, taskContext = {}) {
  if (!taskTitle || typeof taskTitle !== 'string' || taskTitle.trim().length < 3) {
    return { subtasks: [], total_estimated_minutes: 0, error: 'Task title too short' };
  }

  try {
    // Try AI decomposition first
    const aiResult = await decomposeWithAI(taskTitle, taskContext);

    // Validate subtasks
    if (!Array.isArray(aiResult.subtasks) || aiResult.subtasks.length < 2) {
      throw new Error('AI returned insufficient subtasks');
    }

    // Ensure all required fields
    const validated = aiResult.subtasks.map((s, i) => {
      const dur = typeof s.duration === 'number' ? s.duration :
                  typeof s.estimated_minutes === 'number' ? s.estimated_minutes : 30;
      return {
        title             : s.title || `خطوة ${i + 1}`,
        duration          : dur,
        estimated_minutes : dur,   // alias for compatibility
        priority          : ['urgent', 'high', 'medium', 'low'].includes(s.priority) ? s.priority : 'medium',
        order             : s.order ?? i + 1,
      };
    });

    logger.info(`[DECOMPOSE] AI decomposed "${taskTitle}" → ${validated.length} subtasks`);

    return {
      ...aiResult,
      subtasks: validated,
      source  : 'ai',
    };

  } catch (err) {
    logger.warn(`[DECOMPOSE] AI failed (${err.message}), using static fallback`);
    return decomposeStatic(taskTitle);
  }
}

module.exports = { decomposeTask, decomposeStatic, detectCategory };
