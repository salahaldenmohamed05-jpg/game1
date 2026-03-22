/**
 * Decision Engine Service — محرك القرارات
 * ==========================================
 * Converts AI suggestions into executable actions.
 * Phase 15 Enhancements:
 *  - Confidence scoring (energy × priority × learning × context)
 *  - Learning Engine integration (success rate per action)
 *  - Planning Engine integration (optimal timing recommendations)
 *  - Explainability integration (why[] for every decision)
 *  - Decision score formula: energy(0.25) + priority(0.35) + learning(0.25) + context(0.15)
 * Core Features:
 *  - Evaluates AI suggestions against execution policy
 *  - Auto-executes low-risk actions
 *  - Queues medium-risk for user approval
 *  - Requires confirmation for high-risk actions
 *  - Auto-reschedules overdue tasks (with user override)
 *  - Logs all decisions with full audit trail
 */

'use strict';

const moment = require('moment-timezone');
const logger  = require('../utils/logger');
const { evaluate, buildConfirmationMessage, RISK } = require('../config/execution.policy');
const memory  = require('./memory.service');

// Phase 15 — lazy imports (avoid circular deps)
function getLearning() {
  try { return require('./learning.engine.service'); } catch (_) { return null; }
}
function getPlanning() {
  try { return require('./planning.engine.service'); } catch (_) { return null; }
}
function getExplainability() {
  try { return require('./explainability.service'); } catch (_) { return null; }
}

// ─── Decision Log (in-memory, ring buffer) ───────────────────────────────────
const DECISION_LOG_MAX = 200;
const decisionLog = [];  // [{ id, userId, action, risk, status, ts, ... }]

function logDecision(entry) {
  decisionLog.unshift({ id: Date.now(), ts: new Date().toISOString(), ...entry });
  if (decisionLog.length > DECISION_LOG_MAX) decisionLog.pop();
  logger.debug('[DECISION-ENGINE] Decision logged', { action: entry.action, risk: entry.risk, status: entry.status });
}

// ─── Model Loader ─────────────────────────────────────────────────────────────
function getModels() {
  const models = {};
  try { models.Task     = require('../models/task.model'); }      catch (_) {}
  try { models.Habit    = require('../models/habit.model'); }     catch (_) {}
  try { models.MoodEntry= require('../models/mood.model'); }      catch (_) {}
  return models;
}

// ─── Core Decision Evaluator ──────────────────────────────────────────────────
/**
 * Evaluates a proposed action and returns a decision object.
 * Phase 15: Now includes confidence scoring, learning insights, planning recommendations.
 *
 * @param {object} proposal
 * @param {string} proposal.action       - action type (e.g., 'create_task', 'delete_task')
 * @param {object} proposal.payload      - action data
 * @param {string} proposal.userId
 * @param {string} proposal.mode         - 'companion' | 'manager' | 'hybrid'
 * @param {number} proposal.itemCount    - number of items affected
 * @param {number} [proposal.energy]     - current energy 0-100
 * @param {number} [proposal.mood]       - current mood 1-10
 * @param {string} [proposal.priority]   - task priority
 * @param {number} [proposal.overdueCount] - overdue task count for context
 *
 * @returns {object} decision (extended with confidence, explanation, planningTip)
 */
function decide(proposal) {
  const {
    action,
    payload      = {},
    userId,
    mode         = 'hybrid',
    itemCount    = 1,
    energy       = 60,
    mood         = 5,
    priority     = payload.priority || 'medium',
    overdueCount = 0,
  } = proposal;

  const policy = evaluate(action, {
    itemCount,
    isDestructive: action.includes('delete'),
  });

  // ── Phase 15: Confidence scoring ──────────────────────────────────────────
  const explainability = getExplainability();
  let explanation      = null;
  let confidence       = 65;  // default

  if (explainability && userId) {
    try {
      explanation = explainability.explainDecision({
        action,
        userId,
        energy,
        mood,
        priority,
        risk         : policy.risk,
        mode,
        overdueCount,
        pendingCount : itemCount,
      });
      confidence = explanation.confidence;
    } catch (err) {
      logger.warn('[DECISION-ENGINE] Explainability error (non-fatal):', err.message);
    }
  }

  // ── Phase 15: Learning insights (upgraded with ML) ───────────────────────
  const learningEngine = getLearning();
  let learningInsight  = null;

  if (learningEngine && userId) {
    try {
      const successRate = learningEngine.getActionSuccessRate(userId, action);
      if (successRate !== null) {
        learningInsight = {
          successRate,
          label: successRate >= 75 ? 'أداؤك ممتاز في هذا النوع' :
                 successRate >= 50 ? 'أداؤك جيد في هذا النوع'   :
                                     'نجاحك في هذا النوع منخفض — انتبه',
        };
      }

      // ML: Get completion probability using ML predictor
      if (learningEngine.predictTaskCompletion) {
        const mlProb = learningEngine.predictTaskCompletion(
          { priority, action },
          { energy, mood, hour: new Date().getHours() },
          userId
        );
        if (learningInsight) {
          learningInsight.ml_completion_probability = mlProb;
        } else {
          learningInsight = { ml_completion_probability: mlProb };
        }

        // Boost or reduce confidence based on ML prediction
        if (explanation && mlProb > 0.75) {
          confidence = Math.min(100, confidence + 5);
        } else if (explanation && mlProb < 0.40) {
          confidence = Math.max(10, confidence - 10);
        }
      }

      // Record this decision for future learning
      learningEngine.recordDecision(userId, { action, risk: policy.risk, energy, mood, mode });
    } catch (err) {
      logger.warn('[DECISION-ENGINE] Learning engine error (non-fatal):', err.message);
    }
  }

  // ── Phase 15: Planning recommendation ────────────────────────────────────
  const planningEngine = getPlanning();
  let planningTip      = null;

  if (planningEngine && userId) {
    try {
      const rec = planningEngine.getPlanningRecommendation(userId, action, { energy, hour: new Date().getHours() });
      if (rec.suggestion) planningTip = rec.suggestion;
    } catch (err) {
      logger.warn('[DECISION-ENGINE] Planning engine error (non-fatal):', err.message);
    }
  }

  const decision = {
    action,
    payload,
    userId,
    mode,
    risk               : policy.risk,
    shouldAutoExecute  : policy.shouldAutoExecute,
    requiresConfirmation: policy.requiresConfirmation,
    shouldSuggest      : policy.shouldSuggest,
    confirmationMessage: policy.requiresConfirmation
      ? buildConfirmationMessage(action, { count: itemCount, title: payload.title })
      : null,
    reason      : policy.reason,
    // Phase 15 additions
    confidence,
    explanation : explanation ? {
      why            : explanation.why,
      confidenceLabel: explanation.confidenceLabel,
      factors        : explanation.factors,
      alternatives   : explanation.alternatives,
    } : null,
    learningInsight,
    planningTip,
  };

  return decision;
}

// ─── Execute Task Operations ──────────────────────────────────────────────────
async function executeTaskAction(action, payload, userId, timezone = 'Africa/Cairo') {
  const { Task } = getModels();
  if (!Task) throw new Error('Task model not available');

  const now   = moment().tz(timezone);
  const today = now.format('YYYY-MM-DD');

  switch (action) {
    case 'create_task': {
      const task = await Task.create({
        user_id          : userId,
        title            : payload.title || 'مهمة جديدة',
        priority         : payload.priority || 'medium',
        status           : 'pending',
        category         : payload.category || 'personal',
        due_date         : payload.due_date || today,
        due_time         : payload.due_time || null,
        estimated_minutes: payload.estimated_minutes || null,
        notes            : payload.notes || null,
      });
      memory.incrementStat(userId, 'tasksCreated');
      return { success: true, task, message: `تم إنشاء مهمة: "${task.title}"` };
    }

    case 'complete_task': {
      const { Op } = require('sequelize');
      const where = payload.task_id
        ? { id: payload.task_id, user_id: userId }
        : { user_id: userId, title: { [Op.iLike]: `%${payload.title}%` }, status: { [Op.ne]: 'completed' } };

      const [count] = await Task.update(
        { status: 'completed', completed_at: now.toDate() },
        { where }
      );
      if (count > 0) memory.incrementStat(userId, 'tasksCompleted');
      return { success: count > 0, count, message: count > 0 ? `تم إنجاز المهمة` : 'لم يتم العثور على المهمة' };
    }

    case 'reschedule_task':
    case 'update_task': {
      const where = payload.task_id
        ? { id: payload.task_id, user_id: userId }
        : { user_id: userId };

      const updates = {};
      if (payload.due_date)    updates.due_date = payload.due_date;
      if (payload.due_time)    updates.due_time = payload.due_time;
      if (payload.priority)    updates.priority = payload.priority;
      if (payload.title)       updates.title    = payload.title;
      if (payload.status)      updates.status   = payload.status;

      const [count] = await Task.update(updates, { where });
      return { success: count > 0, count, message: `تم تحديث ${count} مهمة` };
    }

    case 'delete_task': {
      const where = payload.task_id
        ? { id: payload.task_id, user_id: userId }
        : { user_id: userId };

      const deleted = await Task.destroy({ where, limit: payload.task_id ? 1 : undefined });
      return { success: deleted > 0, count: deleted, message: `تم حذف ${deleted} مهمة` };
    }

    case 'auto_reschedule': {
      // Auto-reschedule overdue tasks to today
      const { Op } = require('sequelize');
      const ids = payload.task_ids || [];
      if (ids.length === 0) {
        return { success: true, count: 0, message: 'لا توجد مهام للجدولة' };
      }
      const [count] = await Task.update(
        { due_date: payload.new_date || today },
        { where: { id: { [Op.in]: ids }, user_id: userId } }
      );
      return { success: true, count, message: `تم إعادة جدولة ${count} مهام لليوم` };
    }

    default:
      return { success: false, message: `إجراء غير معروف: ${action}` };
  }
}

// ─── Process Proposal ─────────────────────────────────────────────────────────
/**
 * Main entry: receives a proposal, decides, optionally executes.
 * Phase 15: Records outcomes to learning engine, attaches confidence + explanation.
 *
 * @param {object} proposal
 * @param {string} proposal.action
 * @param {object} proposal.payload
 * @param {string} proposal.userId
 * @param {string} proposal.timezone
 * @param {string} proposal.mode
 * @param {boolean} proposal.forceExecute - bypass policy check
 * @param {number}  [proposal.energy]     - user energy for scoring
 * @param {number}  [proposal.mood]       - user mood for scoring
 *
 * @returns {object} { decision, result, executed, pending_confirmation, confidence, explanation }
 */
async function processProposal(proposal) {
  const { userId, timezone = 'Africa/Cairo', forceExecute = false } = proposal;

  const decision = decide(proposal);
  const learningEngine = getLearning();

  // Auto-execute if low risk OR forced
  if (decision.shouldAutoExecute || forceExecute) {
    try {
      const result = await executeTaskAction(decision.action, decision.payload, userId, timezone);

      logDecision({
        userId,
        action    : decision.action,
        risk      : decision.risk,
        status    : 'executed',
        result    : result.message,
        payload   : decision.payload,
        confidence: decision.confidence,
      });

      // Phase 15: Record outcome to learning engine
      if (learningEngine) {
        learningEngine.recordOutcome(userId, {
          action  : decision.action,
          success : result.success,
          energy  : proposal.energy,
          mood    : proposal.mood,
        });
      }

      return {
        decision,
        result,
        executed             : true,
        pending_confirmation : false,
        confidence           : decision.confidence,
        explanation          : decision.explanation,
        learningInsight      : decision.learningInsight,
        planningTip          : decision.planningTip,
      };
    } catch (err) {
      logger.error('[DECISION-ENGINE] Execution error:', err.message);
      logDecision({
        userId,
        action : decision.action,
        risk   : decision.risk,
        status : 'failed',
        error  : err.message,
      });

      // Record failure
      if (learningEngine) {
        learningEngine.recordOutcome(userId, {
          action    : decision.action,
          success   : false,
          failReason: err.message,
          energy    : proposal.energy,
          mood      : proposal.mood,
        });
      }

      return {
        decision,
        result  : { success: false, message: `فشل التنفيذ: ${err.message}` },
        executed: false,
        confidence: decision.confidence,
      };
    }
  }

  // Medium risk: suggest to user
  if (decision.shouldSuggest) {
    logDecision({
      userId,
      action    : decision.action,
      risk      : decision.risk,
      status    : 'suggested',
      confidence: decision.confidence,
    });

    return {
      decision,
      result               : null,
      executed             : false,
      pending_confirmation : false,
      confidence           : decision.confidence,
      explanation          : decision.explanation,
      learningInsight      : decision.learningInsight,
      planningTip          : decision.planningTip,
      suggestion           : {
        action : decision.action,
        payload: decision.payload,
        message: decision.confirmationMessage || `اقتراح: ${decision.action}`,
      },
    };
  }

  // High risk: require explicit confirmation
  logDecision({
    userId,
    action    : decision.action,
    risk      : decision.risk,
    status    : 'awaiting_confirmation',
    confidence: decision.confidence,
  });

  return {
    decision,
    result               : null,
    executed             : false,
    pending_confirmation : true,
    confirmation_message : decision.confirmationMessage,
    confidence           : decision.confidence,
    explanation          : decision.explanation,
    learningInsight      : decision.learningInsight,
    planningTip          : decision.planningTip,
  };
}

// ─── Execute Confirmed Action ─────────────────────────────────────────────────
/**
 * Execute a previously confirmed action (user said yes).
 */
async function executeConfirmed(action, payload, userId, timezone = 'Africa/Cairo') {
  try {
    const result = await executeTaskAction(action, payload, userId, timezone);

    logDecision({
      userId,
      action,
      risk  : RISK.HIGH,
      status: 'confirmed_and_executed',
      result: result.message,
    });

    return { success: true, result };
  } catch (err) {
    logger.error('[DECISION-ENGINE] executeConfirmed error:', err.message);
    return { success: false, error: err.message };
  }
}

// ─── Auto-Reschedule Overdue Tasks ────────────────────────────────────────────
/**
 * Automatically propose rescheduling overdue tasks.
 * Returns a proposal that can be confirmed by user.
 */
async function proposeAutoReschedule(userId, timezone = 'Africa/Cairo') {
  const { Task } = getModels();
  if (!Task) return null;

  try {
    const { Op } = require('sequelize');
    const today = moment().tz(timezone).format('YYYY-MM-DD');

    const overdue = await Task.findAll({
      where: {
        user_id : userId,
        status  : { [Op.in]: ['pending', 'in_progress'] },
        due_date: { [Op.lt]: today },
      },
      limit: 10,
      raw  : true,
    });

    if (overdue.length === 0) return null;

    const decision = decide({
      action   : 'auto_reschedule',
      payload  : { task_ids: overdue.map(t => t.id), new_date: today },
      userId,
      itemCount: overdue.length,
    });

    return {
      type               : 'auto_reschedule',
      overdueTasks       : overdue,
      count              : overdue.length,
      decision,
      confirmationMessage: decision.confirmationMessage,
      taskTitles         : overdue.slice(0, 3).map(t => t.title),
    };
  } catch (err) {
    logger.error('[DECISION-ENGINE] proposeAutoReschedule error:', err.message);
    return null;
  }
}

// ─── Get Decision Log ─────────────────────────────────────────────────────────
function getDecisionLog(userId, limit = 20) {
  return decisionLog
    .filter(d => d.userId === userId)
    .slice(0, limit);
}

function getGlobalLog(limit = 50) {
  return decisionLog.slice(0, limit);
}

// ─── Phase 15: Get Learning Profile for a User ────────────────────────────────
function getLearningProfile(userId) {
  const learningEngine = getLearning();
  if (!learningEngine) return null;
  return learningEngine.getUserLearningProfile(userId);
}

// ─── Phase 15: Get Daily Plan ─────────────────────────────────────────────────
async function getDailyPlan(userId, ctx = {}) {
  const planningEngine = getPlanning();
  if (!planningEngine) return null;
  return planningEngine.generateDailyPlan(userId, ctx);
}

module.exports = {
  decide,
  processProposal,
  executeConfirmed,
  proposeAutoReschedule,
  executeTaskAction,
  getDecisionLog,
  getGlobalLog,
  // Phase 15 additions
  getLearningProfile,
  getDailyPlan,
};
