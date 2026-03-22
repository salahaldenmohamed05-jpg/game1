/**
 * Execution Dispatcher Service — موزّع التنفيذ
 * ===============================================
 * PHASE 9: Decides WHO executes an action
 *
 * Routes actions to:
 *  - system     : auto-executed by the backend (LEVEL 3 autonomy)
 *  - user       : shown as suggestion, user confirms (LEVEL 1)
 *  - virtual_assistant : delegated to VA layer for complex tasks (LEVEL 2/3)
 *
 * Routing criteria:
 *  - execution policy level (passive/suggestive/active)
 *  - action risk level (low/medium/high)
 *  - action type (simple CRUD vs complex coordination)
 *  - user autonomy preference
 *  - learning data (past acceptance rate)
 */

'use strict';

const logger = require('../utils/logger');

// ─── Action Categories ────────────────────────────────────────────────────────
const SYSTEM_ACTIONS = new Set([
  'create_task', 'update_task', 'complete_task', 'reschedule_task',
  'delete_task', 'log_mood', 'check_in_habit', 'log_habit',
  'auto_reschedule', 'update_energy', 'create_reminder',
]);

const VA_ACTIONS = new Set([
  'schedule_meeting', 'send_reminder_email', 'coordinate_team',
  'book_appointment', 'follow_up', 'draft_message',
  'research_topic', 'organize_calendar',
]);

const USER_CONFIRMATION_ACTIONS = new Set([
  'delete_all_tasks', 'bulk_reschedule', 'cancel_habit',
  'share_data', 'upgrade_subscription', 'reset_data',
]);

// ─── Executor Types ───────────────────────────────────────────────────────────
const EXECUTOR = {
  SYSTEM           : 'system',
  USER             : 'user',
  VIRTUAL_ASSISTANT: 'virtual_assistant',
};

// ─── Main Dispatcher ──────────────────────────────────────────────────────────
/**
 * Decide who should execute an action.
 *
 * @param {object} params
 * @param {string} params.action         - action type
 * @param {string} params.userId
 * @param {string} params.risk           - 'low' | 'medium' | 'high'
 * @param {string} params.policyLevel    - 'passive' | 'suggestive' | 'active'
 * @param {number} params.confidence     - 0-100 confidence score
 * @param {number} params.acceptanceRate - 0-100 historical acceptance rate
 * @param {object} params.payload        - action data
 *
 * @returns {object} dispatch decision
 */
function dispatch({
  action,
  userId,
  risk           = 'low',
  policyLevel    = 'suggestive',
  confidence     = 50,
  acceptanceRate = null,
  payload        = {},
}) {
  let executor = EXECUTOR.USER;
  let requiresConfirmation = false;
  let reason = '';
  let autoExecute = false;

  // ── Hard rules (override everything) ────────────────────────────────────────
  if (USER_CONFIRMATION_ACTIONS.has(action)) {
    executor = EXECUTOR.USER;
    requiresConfirmation = true;
    reason = 'عملية حساسة تتطلب تأكيداً صريحاً';
    return buildDispatch(executor, requiresConfirmation, autoExecute, reason, action, payload);
  }

  if (VA_ACTIONS.has(action)) {
    executor = EXECUTOR.VIRTUAL_ASSISTANT;
    requiresConfirmation = risk === 'high';
    reason = 'مهمة تنسيق متقدمة — ستُنفَّذ بواسطة المساعد الافتراضي';
    return buildDispatch(executor, requiresConfirmation, autoExecute, reason, action, payload);
  }

  // ── Policy-based routing ─────────────────────────────────────────────────────
  if (!SYSTEM_ACTIONS.has(action)) {
    // Unknown action → always ask user
    executor = EXECUTOR.USER;
    reason = 'نوع إجراء غير معروف — يحتاج موافقة';
    return buildDispatch(executor, true, false, reason, action, payload);
  }

  switch (policyLevel) {
    case 'passive':
      // LEVEL 1: always show as suggestion
      executor = EXECUTOR.USER;
      requiresConfirmation = false;
      autoExecute = false;
      reason = 'الوضع السلبي — كل الإجراءات تُعرض كاقتراحات';
      break;

    case 'suggestive':
      // LEVEL 2: suggest + confirm for medium/high risk
      if (risk === 'low' && confidence >= 70) {
        executor = EXECUTOR.SYSTEM;
        autoExecute = acceptanceRate !== null ? acceptanceRate >= 70 : false;
        reason = autoExecute
          ? 'ثقة عالية + قبول تاريخي مرتفع — تنفيذ تلقائي'
          : 'مخاطرة منخفضة — يُنصح بالتنفيذ';
      } else {
        executor = EXECUTOR.USER;
        requiresConfirmation = risk === 'high';
        reason = risk === 'high'
          ? 'مخاطرة عالية — يتطلب تأكيداً'
          : 'وضع اقتراحي — انتظار موافقة';
      }
      break;

    case 'active':
      // LEVEL 3: auto-execute when safe
      if (risk === 'low' || (risk === 'medium' && confidence >= 80)) {
        executor = EXECUTOR.SYSTEM;
        autoExecute = true;
        reason = 'وضع نشط — تنفيذ تلقائي للإجراءات الآمنة';
      } else {
        executor = EXECUTOR.USER;
        requiresConfirmation = true;
        reason = 'مخاطرة عالية في الوضع النشط — تأكيد مطلوب';
      }
      break;

    default:
      executor = EXECUTOR.USER;
      reason = 'مستوى سياسة غير معروف — افتراضي للمستخدم';
  }

  return buildDispatch(executor, requiresConfirmation, autoExecute, reason, action, payload);
}

// ─── Build Result ─────────────────────────────────────────────────────────────
function buildDispatch(executor, requiresConfirmation, autoExecute, reason, action, payload) {
  const result = {
    executor,
    requires_confirmation: requiresConfirmation,
    auto_execute         : autoExecute,
    reason,
    action,
    payload,
    dispatched_at        : new Date().toISOString(),
  };

  logger.debug('[DISPATCHER] Dispatch decision', {
    action,
    executor,
    autoExecute,
    requiresConfirmation,
  });

  return result;
}

// ─── Batch Dispatcher ─────────────────────────────────────────────────────────
/**
 * Dispatch multiple actions at once.
 * @param {object[]} actions  - array of {action, risk, payload, ...}
 * @param {string}   userId
 * @param {string}   policyLevel
 */
function dispatchBatch(actions, userId, policyLevel = 'suggestive') {
  return actions.map(a => dispatch({ ...a, userId, policyLevel }));
}

// ─── Update Policy ────────────────────────────────────────────────────────────
const userPolicies = new Map();  // userId → 'passive' | 'suggestive' | 'active'

function setUserPolicy(userId, level) {
  if (!['passive', 'suggestive', 'active'].includes(level)) {
    throw new Error(`Invalid policy level: ${level}`);
  }
  userPolicies.set(userId, level);
  logger.info('[DISPATCHER] User policy updated', { userId, level });
}

function getUserPolicy(userId) {
  return userPolicies.get(userId) || 'suggestive';
}

module.exports = {
  dispatch,
  dispatchBatch,
  setUserPolicy,
  getUserPolicy,
  EXECUTOR,
};
