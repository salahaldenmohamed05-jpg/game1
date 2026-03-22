/**
 * Execution Policy — سياسة التنفيذ (Phase 8 Upgraded)
 * ======================================================
 * Risk-based rules for AI-driven actions with three autonomy levels.
 *
 * Autonomy Levels (user-configurable AI mode):
 *  - LEVEL 1 (passive)    → suggest only, never auto-execute anything
 *  - LEVEL 2 (suggestive) → suggest + execute LOW-risk automatically
 *  - LEVEL 3 (active)     → auto-execute LOW + MEDIUM risk, confirm HIGH only
 *
 * AI Mode labels (frontend-friendly):
 *  - 'passive'    → Level 1
 *  - 'suggestive' → Level 2
 *  - 'active'     → Level 3
 *
 * Risk Levels:
 *  - LOW    → safe, reversible
 *  - MEDIUM → can change important data, show to user
 *  - HIGH   → irreversible/destructive, always confirm
 */

'use strict';

const logger = require('../utils/logger');

// ─── Autonomy Levels ──────────────────────────────────────────────────────────
const AUTONOMY = {
  PASSIVE    : 1,   // suggest only
  SUGGESTIVE : 2,   // auto-execute LOW
  ACTIVE     : 3,   // auto-execute LOW + MEDIUM
};

const AI_MODE = {
  passive    : AUTONOMY.PASSIVE,
  suggestive : AUTONOMY.SUGGESTIVE,
  active     : AUTONOMY.ACTIVE,
};

// ─── Risk Levels ─────────────────────────────────────────────────────────────
const RISK = {
  LOW   : 'low',
  MEDIUM: 'medium',
  HIGH  : 'high',
};

// ─── Action Risk Map ──────────────────────────────────────────────────────────
const ACTION_RISK = {
  // Task operations
  create_task     : RISK.LOW,
  complete_task   : RISK.LOW,
  update_task     : RISK.MEDIUM,
  reschedule_task : RISK.MEDIUM,
  delete_task     : RISK.HIGH,
  bulk_delete     : RISK.HIGH,

  // Mood / Energy
  log_mood        : RISK.LOW,
  log_energy      : RISK.LOW,
  update_energy   : RISK.LOW,

  // Habits
  check_habit     : RISK.LOW,
  log_habit       : RISK.LOW,
  check_in_habit  : RISK.LOW,
  create_habit    : RISK.LOW,
  cancel_habit    : RISK.HIGH,
  delete_habit    : RISK.HIGH,

  // Scheduling
  schedule_exam   : RISK.MEDIUM,
  schedule_plan   : RISK.MEDIUM,
  create_reminder : RISK.LOW,

  // Analysis / Read
  analyze         : RISK.LOW,
  life_summary    : RISK.LOW,
  plan_day        : RISK.LOW,

  // Auto-reschedule
  auto_reschedule : RISK.MEDIUM,
  bulk_reschedule : RISK.HIGH,

  // VA actions
  follow_up       : RISK.MEDIUM,
  schedule_meeting: RISK.MEDIUM,
  draft_message   : RISK.LOW,
  research_topic  : RISK.LOW,
  organize_calendar: RISK.MEDIUM,

  // Destructive
  share_data      : RISK.HIGH,
  reset_data      : RISK.HIGH,
  upgrade_subscription: RISK.HIGH,
  delete_all_tasks: RISK.HIGH,

  // Default
  chat            : RISK.LOW,
  ask_question    : RISK.LOW,
};

// ─── Bulk Operation Threshold ────────────────────────────────────────────────
const BULK_THRESHOLD = 3;

// ─── Per-User Autonomy Store ──────────────────────────────────────────────────
const userAutonomyStore = new Map(); // userId → autonomy level (1/2/3)

function getUserAutonomy(userId) {
  return userAutonomyStore.get(userId) || AUTONOMY.SUGGESTIVE; // default: level 2
}

function setUserAutonomy(userId, level) {
  const normalized = typeof level === 'string' ? (AI_MODE[level] || AUTONOMY.SUGGESTIVE) : (level || AUTONOMY.SUGGESTIVE);
  userAutonomyStore.set(userId, normalized);
  logger.info(`[EXEC-POLICY] User ${userId} autonomy → level ${normalized}`);
  return normalized;
}

function getUserAIMode(userId) {
  const level = getUserAutonomy(userId);
  return Object.keys(AI_MODE).find(k => AI_MODE[k] === level) || 'suggestive';
}

// ─── Policy Evaluator ─────────────────────────────────────────────────────────
/**
 * Evaluates the execution policy for a given action.
 *
 * @param {string} actionType - intent action type
 * @param {object} context
 * @param {number} [context.itemCount]     - number of items affected
 * @param {boolean} [context.isDestructive] - force HIGH risk
 * @param {string} [context.userId]        - user ID for autonomy lookup
 * @param {string} [context.aiMode]        - override AI mode ('passive'|'suggestive'|'active')
 *
 * @returns {{ risk, autonomyLevel, shouldAutoExecute, shouldSuggest, requiresConfirmation, reason, aiMode }}
 */
function evaluate(actionType, context = {}) {
  const { itemCount = 1, isDestructive = false, userId, aiMode } = context;

  let risk = ACTION_RISK[actionType] || RISK.MEDIUM;

  // Escalate for bulk ops
  if (itemCount > BULK_THRESHOLD && risk !== RISK.HIGH) {
    risk = RISK.HIGH;
    logger.debug(`[EXEC-POLICY] Bulk escalation → HIGH (${itemCount} items)`);
  }

  // Escalate for explicitly destructive
  if (isDestructive && risk === RISK.LOW) {
    risk = RISK.MEDIUM;
  }

  // Determine autonomy level
  let autonomyLevel = AUTONOMY.SUGGESTIVE;
  if (aiMode) {
    autonomyLevel = AI_MODE[aiMode] || AUTONOMY.SUGGESTIVE;
  } else if (userId) {
    autonomyLevel = getUserAutonomy(userId);
  }

  // Compute execution decision based on autonomy level + risk
  let shouldAutoExecute    = false;
  let shouldSuggest        = false;
  let requiresConfirmation = false;

  if (autonomyLevel === AUTONOMY.PASSIVE) {
    // Level 1: always suggest only, never auto-execute
    shouldSuggest        = true;
    shouldAutoExecute    = false;
    requiresConfirmation = risk === RISK.HIGH;

  } else if (autonomyLevel === AUTONOMY.SUGGESTIVE) {
    // Level 2: auto-execute LOW, suggest MEDIUM, confirm HIGH
    shouldAutoExecute    = risk === RISK.LOW;
    shouldSuggest        = risk === RISK.MEDIUM;
    requiresConfirmation = risk === RISK.HIGH;

  } else if (autonomyLevel === AUTONOMY.ACTIVE) {
    // Level 3: auto-execute LOW+MEDIUM, confirm HIGH only
    shouldAutoExecute    = risk === RISK.LOW || risk === RISK.MEDIUM;
    shouldSuggest        = false;
    requiresConfirmation = risk === RISK.HIGH;
  }

  const reason      = getReason(risk, actionType, context, autonomyLevel);
  const modeLabel   = Object.keys(AI_MODE).find(k => AI_MODE[k] === autonomyLevel) || 'suggestive';

  logger.debug('[EXEC-POLICY] Evaluated', { actionType, risk, autonomyLevel, shouldAutoExecute });

  return {
    risk,
    autonomyLevel,
    aiMode           : modeLabel,
    shouldAutoExecute,
    shouldSuggest,
    requiresConfirmation,
    reason,
  };
}

// ─── Reason Builder ───────────────────────────────────────────────────────────
function getReason(risk, actionType, context = {}, autonomyLevel = AUTONOMY.SUGGESTIVE) {
  const levelLabel = autonomyLevel === AUTONOMY.PASSIVE ? '(وضع سلبي)'
    : autonomyLevel === AUTONOMY.ACTIVE ? '(وضع نشط)' : '';

  switch (risk) {
    case RISK.LOW:
      return autonomyLevel === AUTONOMY.PASSIVE
        ? `اقتراح آمن — لم يُنفَّذ تلقائياً ${levelLabel}`
        : `تنفيذ تلقائي — إجراء آمن (${actionType}) ${levelLabel}`;
    case RISK.MEDIUM:
      if (context.itemCount > BULK_THRESHOLD)
        return `يتأثر ${context.itemCount} عنصر — أعرض على المستخدم أولاً ${levelLabel}`;
      return autonomyLevel === AUTONOMY.ACTIVE
        ? `تنفيذ تلقائي في الوضع النشط — قد يغيّر بيانات مهمة ${levelLabel}`
        : `يتطلب مراجعة — قد يغيّر بيانات مهمة ${levelLabel}`;
    case RISK.HIGH:
      return actionType.includes('delete')
        ? 'إجراء غير قابل للتراجع — يجب تأكيد المستخدم دائماً'
        : 'مخاطرة عالية — يجب تأكيد المستخدم الصريح دائماً';
    default:
      return 'مستوى مخاطر غير محدد';
  }
}

// ─── Confirmation Message Builder ─────────────────────────────────────────────
function buildConfirmationMessage(actionType, details = {}) {
  const { count, title } = details;

  switch (actionType) {
    case 'delete_task':
      return title
        ? `هل تريد حذف مهمة "${title}" بشكل نهائي؟ لا يمكن التراجع. ✋`
        : 'هل تريد حذف هذه المهمة بشكل نهائي؟ لا يمكن التراجع. ✋';
    case 'bulk_delete':
      return `هل تريد حذف ${count || 'كل'} المهام بشكل نهائي؟ ⚠️ هذا الإجراء لا يمكن التراجع عنه.`;
    case 'reschedule_task':
      return `هل تريد إعادة جدولة "${title || 'هذه المهمة'}"؟`;
    case 'schedule_exam':
      return `سيتم إنشاء ${count || 'عدة'} مهام مذاكرة وامتحانات. هل تريد المتابعة؟ 📚`;
    case 'schedule_plan':
      return `سيتم إنشاء ${count || 'عدة'} مهام لخطتك. هل أكمل؟ 📋`;
    case 'update_task':
      return `هل تريد تحديث بيانات مهمة "${title || 'هذه المهمة'}"؟`;
    case 'auto_reschedule':
      return `اقتراح: إعادة جدولة ${count || 'المهام المتأخرة'} لليوم. هل تريد تطبيق ذلك؟ 🔄`;
    case 'bulk_reschedule':
      return `إعادة جدولة ${count || 'عدة'} مهام. هل تريد تطبيق ذلك؟ 🔄`;
    case 'delete_habit':
      return `هل تريد حذف عادة "${title}"؟ ستفقد جميع بياناتها. ⚠️`;
    case 'cancel_habit':
      return `هل تريد إيقاف عادة "${title}"؟`;
    case 'schedule_meeting':
      return `هل تريد جدولة الاجتماع: "${title || 'الاجتماع المقترح'}"؟ 📆`;
    case 'organize_calendar':
      return `إعادة تنظيم ${count || 'عدة'} عناصر في التقويم. هل تريد المتابعة؟ 🗓️`;
    default:
      return 'هل تريد تنفيذ هذا الإجراء؟';
  }
}

// ─── Mode Permission Check ────────────────────────────────────────────────────
function isAllowed(actionType, mode = 'hybrid') {
  if (mode === 'companion') {
    const risk = ACTION_RISK[actionType] || RISK.MEDIUM;
    return risk === RISK.LOW;
  }
  if (mode === 'manager') {
    const risk = ACTION_RISK[actionType] || RISK.MEDIUM;
    return risk !== RISK.HIGH;
  }
  return true;
}

// ─── Exports ──────────────────────────────────────────────────────────────────
module.exports = {
  RISK,
  AUTONOMY,
  AI_MODE,
  ACTION_RISK,
  BULK_THRESHOLD,
  evaluate,
  buildConfirmationMessage,
  isAllowed,
  getUserAutonomy,
  setUserAutonomy,
  getUserAIMode,
};
