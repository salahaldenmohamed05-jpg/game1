/**
 * Assistant Presenter Service — خدمة عرض المساعد
 * ==================================================
 * PHASE 11: Convert raw AI output into UI-ready format
 *
 * Transforms internal AI/decision data into structured cards that
 * the frontend can render directly.
 *
 * Output types:
 *  - insight    : analytical observation
 *  - action     : something that was done / can be done
 *  - suggestion : recommendation for the user
 *  - alert      : urgent notification
 *  - plan       : daily plan block
 *
 * Each item has:
 *  { type, title, message, icon, explanation[], confidence, meta }
 */

'use strict';

const logger = require('../utils/logger');

// ─── Icon Map ─────────────────────────────────────────────────────────────────
const ICONS = {
  // Actions
  create_task     : '✅',
  complete_task   : '🎯',
  reschedule_task : '📅',
  delete_task     : '🗑️',
  auto_reschedule : '🔄',
  log_mood        : '😊',
  check_in_habit  : '🔥',
  follow_up       : '📌',
  schedule_meeting: '📆',
  organize_calendar:'🗓️',
  research_topic  : '🔍',
  draft_message   : '✉️',
  // Insights
  energy_high     : '⚡',
  energy_low      : '🪫',
  mood_high       : '😄',
  mood_low        : '😔',
  burnout_risk    : '🔥',
  productivity    : '📊',
  overdue         : '⚠️',
  habit_streak    : '🔥',
  goal_progress   : '🎯',
  // General
  insight         : '💡',
  plan            : '📋',
  suggestion      : '💬',
  alert           : '🚨',
  morning         : '🌅',
  evening         : '🌙',
  success         : '✨',
  default         : '🤖',
};

function getIcon(type, subtype) {
  return ICONS[subtype] || ICONS[type] || ICONS.default;
}

// ─── Title Generators ─────────────────────────────────────────────────────────
const ACTION_TITLES = {
  create_task     : 'تمت إضافة مهمة',
  complete_task   : 'تم إنجاز مهمة',
  reschedule_task : 'تمت إعادة جدولة',
  delete_task     : 'تم حذف مهمة',
  auto_reschedule : 'جدولة تلقائية',
  log_mood        : 'تم تسجيل المزاج',
  check_in_habit  : 'عادة محققة',
  follow_up       : 'متابعة مضافة',
  schedule_meeting: 'اجتماع مجدوَل',
  organize_calendar:'التقويم منظَّم',
  research_topic  : 'بحث مجدوَل',
  default         : 'إجراء مكتمل',
};

// ─── Present a Single AI Reply ────────────────────────────────────────────────
/**
 * Convert a raw AI reply string into a presenter card.
 *
 * @param {object} params
 * @param {string} params.reply        - AI reply text
 * @param {string} params.mode         - companion|manager|hybrid
 * @param {string} params.intentCategory
 * @param {boolean} params.is_fallback
 * @param {number}  params.confidence  - 0-100
 * @param {string[]} params.explanation - why[] array
 */
function presentReply({
  reply,
  mode           = 'hybrid',
  intentCategory = 'general',
  is_fallback    = false,
  confidence     = 75,
  explanation    = [],
}) {
  const type = is_fallback ? 'alert' : (mode === 'companion' ? 'insight' : 'action');
  const icon = is_fallback ? ICONS.alert : getIcon(type, intentCategory);

  const title = buildReplyTitle(mode, intentCategory, is_fallback);

  return {
    type,
    title,
    message    : reply,
    icon,
    explanation: explanation.length > 0 ? explanation : buildDefaultExplanation(mode, intentCategory),
    confidence : is_fallback ? 0 : confidence,
    meta       : {
      mode,
      intent    : intentCategory,
      is_fallback,
      presented_at: new Date().toISOString(),
    },
  };
}

// ─── Present an Action Result ─────────────────────────────────────────────────
/**
 * Convert an action execution result into a presenter card.
 *
 * @param {object} params
 * @param {string} params.action        - action type
 * @param {boolean} params.success
 * @param {object} params.data          - action result data
 * @param {string} params.executor      - 'system' | 'user' | 'virtual_assistant'
 * @param {number} params.confidence    - 0-100
 * @param {string[]} params.why         - explanation reasons
 */
function presentAction({
  action,
  success      = true,
  data         = {},
  executor     = 'system',
  confidence   = 80,
  why          = [],
}) {
  const icon  = getIcon('action', action);
  const title = ACTION_TITLES[action] || ACTION_TITLES.default;

  // Build human-readable message
  let message;
  if (!success) {
    message = `تعذّر تنفيذ الإجراء: ${action}`;
  } else if (action === 'create_task' && data.title) {
    message = `تمت إضافة "${data.title}" بنجاح ✅`;
  } else if (action === 'complete_task' && data.title) {
    message = `أحسنت! أنجزتَ "${data.title}" 🎉`;
  } else if (action === 'reschedule_task' || action === 'auto_reschedule') {
    const count = data.count || 1;
    message = `تمت إعادة جدولة ${count} مهمة${count > 1 ? '' : ''} تلقائياً`;
  } else if (action === 'log_mood') {
    message = `سُجِّل مزاجك بنجاح — ${data.mood_label || ''}`;
  } else {
    message = `تم تنفيذ: ${ACTION_TITLES[action] || action}`;
  }

  return {
    type       : 'action',
    title,
    message,
    icon,
    explanation: why.length > 0 ? why : [`تم تنفيذ الإجراء بواسطة: ${executorLabel(executor)}`],
    confidence,
    meta       : {
      action,
      success,
      executor,
      data,
      presented_at: new Date().toISOString(),
    },
  };
}

// ─── Present a Suggestion ─────────────────────────────────────────────────────
/**
 * Convert an AI suggestion into a presenter card.
 *
 * @param {object} params
 * @param {string} params.text          - suggestion text
 * @param {string} params.action        - related action type
 * @param {number} params.confidence    - 0-100
 * @param {string} params.reason        - why this suggestion
 */
function presentSuggestion({
  text,
  action      = null,
  confidence  = 60,
  reason      = '',
}) {
  return {
    type       : 'suggestion',
    title      : 'اقتراح من المساعد',
    message    : text,
    icon       : ICONS.suggestion,
    explanation: reason ? [reason] : ['استناداً إلى نشاطك وسلوكك المعتاد'],
    confidence,
    meta       : {
      action,
      presented_at: new Date().toISOString(),
    },
  };
}

// ─── Present an Insight ───────────────────────────────────────────────────────
/**
 * Convert a raw insight object into a presenter card.
 *
 * @param {object} insight  - { type, title, message, data, confidence }
 */
function presentInsight(insight) {
  const icon = getIcon('insight', insight.type);

  return {
    type       : 'insight',
    title      : insight.title  || 'رؤية جديدة',
    message    : insight.message || '',
    icon,
    explanation: insight.explanation || [],
    confidence : insight.confidence  || 70,
    meta       : {
      insight_type : insight.type,
      data         : insight.data || {},
      presented_at : new Date().toISOString(),
    },
  };
}

// ─── Present an Alert ─────────────────────────────────────────────────────────
/**
 * Convert a signal/alert into a presenter card.
 *
 * @param {object} signal  - { type, severity, message }
 */
function presentAlert(signal) {
  const severityIcons = { high: '🚨', medium: '⚠️', positive: '✨', low: 'ℹ️' };
  const icon = severityIcons[signal.severity] || ICONS.alert;

  return {
    type       : 'alert',
    title      : signal.severity === 'positive' ? 'رسالة إيجابية' : 'تنبيه',
    message    : signal.message || '',
    icon,
    explanation: [],
    confidence : 90,
    meta       : {
      signal_type : signal.type,
      severity    : signal.severity,
      presented_at: new Date().toISOString(),
    },
  };
}

// ─── Present a Plan Block ─────────────────────────────────────────────────────
/**
 * Convert a planning block into a presenter card.
 *
 * @param {object} block  - { start_time, end_time, title, type, tasks[] }
 */
function presentPlanBlock(block) {
  const typeIcons = {
    focus_block   : '🎯',
    habit_slot    : '🔥',
    break         : '☕',
    low_energy    : '😴',
    meeting       : '📆',
    default       : '📋',
  };

  return {
    type       : 'plan',
    title      : block.title || 'كتلة خطة',
    message    : block.description || `${block.start_time || ''} — ${block.end_time || ''}`,
    icon       : typeIcons[block.type] || typeIcons.default,
    explanation: block.reasoning ? [block.reasoning] : [],
    confidence : 80,
    meta       : {
      block_type : block.type,
      start_time : block.start_time,
      end_time   : block.end_time,
      tasks      : block.tasks || [],
      presented_at: new Date().toISOString(),
    },
  };
}

// ─── Present Full Orchestration Result ───────────────────────────────────────
/**
 * Present the full result from orchestrator.orchestrate().
 * Combines reply + actions + suggestions into an array of cards.
 *
 * @param {object} orchestratorResult
 * @param {number} confidence
 * @param {string[]} explanation
 */
function presentOrchestration(orchestratorResult, confidence = 75, explanation = []) {
  const cards = [];

  const { reply, mode, actions = [], suggestions = [], is_fallback, intentCategory } = orchestratorResult;

  // 1. Main reply card
  if (reply) {
    cards.push(presentReply({ reply, mode, intentCategory, is_fallback, confidence, explanation }));
  }

  // 2. Action cards
  for (const action of actions) {
    cards.push(presentAction({
      action    : action.type || action.action || 'unknown',
      success   : true,
      data      : action.data || action,
      executor  : 'system',
      confidence,
    }));
  }

  // 3. Suggestion cards (max 3)
  for (const sug of suggestions.slice(0, 3)) {
    cards.push(presentSuggestion({
      text      : typeof sug === 'string' ? sug : sug.text,
      action    : sug.action || null,
      confidence: 60,
    }));
  }

  return cards;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildReplyTitle(mode, intentCategory, isFallback) {
  if (isFallback) return 'خطأ مؤقت';
  if (mode === 'companion') return 'رد المساعد';
  if (mode === 'manager')   return 'تنفيذ إجراء';
  if (intentCategory === 'advice') return 'نصيحة';
  if (intentCategory === 'question') return 'إجابة';
  return 'رسالة المساعد';
}

function buildDefaultExplanation(mode, intentCategory) {
  const explanations = {
    companion : ['تم توليد الرد باستخدام سياق محادثتك الحالية'],
    manager   : ['تم تنفيذ الإجراء بناءً على طلبك'],
    advice    : ['هذه النصيحة مبنية على بياناتك الشخصية وسلوكك'],
    question  : ['الإجابة مستندة إلى المعطيات المتاحة لديّ'],
    default   : ['رد مولَّد بالذكاء الاصطناعي مع مراعاة سياقك الشخصي'],
  };
  return explanations[mode] || explanations[intentCategory] || explanations.default;
}

function executorLabel(executor) {
  const labels = {
    system           : 'النظام التلقائي',
    user             : 'المستخدم',
    virtual_assistant: 'المساعد الافتراضي',
  };
  return labels[executor] || executor;
}

module.exports = {
  presentReply,
  presentAction,
  presentSuggestion,
  presentInsight,
  presentAlert,
  presentPlanBlock,
  presentOrchestration,
  getIcon,
  ICONS,
};
