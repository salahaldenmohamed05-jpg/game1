/**
 * Assistant Service — خدمة المساعد الذكي
 * =========================================
 * Phase B: Interprets user intent and orchestrates actions through ai.core.
 *
 * Architecture:
 *   User Message → assistant.service → ai.core.service → provider → response
 *                                    → action triggers (tasks, habits, planning)
 *
 * This is the BUSINESS LOGIC layer between routes and AI core.
 * Routes should call assistant.service for high-level operations.
 * assistant.service calls ai.core.service for AI operations.
 *
 * Responsibilities:
 *   1. Interpret user intent from natural language
 *   2. Route to appropriate ai.core method
 *   3. Trigger side effects (create tasks, log mood, etc.)
 *   4. Format responses for the client
 */

'use strict';

const logger  = require('../utils/logger');
const aiCore  = require('./ai.core.service');

// ─── In-Memory Session Store (pending confirmations) ──────────────────────────
const pendingActions = new Map(); // userId → { intent, entities, timestamp }
const PENDING_TTL    = 5 * 60 * 1000; // 5 minutes

function getPendingAction(userId) {
  const pending = pendingActions.get(userId);
  if (!pending) return null;
  if (Date.now() - pending.timestamp > PENDING_TTL) {
    pendingActions.delete(userId);
    return null;
  }
  return pending;
}

function setPendingAction(userId, action) {
  pendingActions.set(userId, { ...action, timestamp: Date.now() });
}

function clearPendingAction(userId) {
  pendingActions.delete(userId);
}

// ─── 1. Process Message — Main Entry Point ────────────────────────────────────
/**
 * Process any user message: classify → route → respond.
 * This is the SINGLE entry point for all assistant interactions.
 *
 * @param {string} userId
 * @param {string} message
 * @param {string} timezone
 * @param {object} opts - { mode: 'command'|'chat'|'auto' }
 * @returns {{ reply, action_taken, needs_confirmation, suggestions, intent, mode, ... }}
 */
async function processMessage(userId, message, timezone = 'Africa/Cairo', opts = {}) {
  const startMs = Date.now();

  try {
    const mode = opts.mode || 'auto';

    // Check for pending confirmation first
    const pending = getPendingAction(userId);

    if (mode === 'command' || mode === 'auto') {
      // Full command pipeline: intent detection + action execution + reply
      const result = await aiCore.command(userId, message, timezone, pending);

      // Store new pending action if confirmation needed
      if (result.needs_confirmation && result.pending_action) {
        setPendingAction(userId, result.pending_action);
      } else {
        clearPendingAction(userId);
      }

      logger.info(`[ASSISTANT] processMessage complete`, {
        userId,
        intent: result.intent,
        hasAction: !!result.action_taken,
        needsConfirmation: result.needs_confirmation,
        elapsed_ms: Date.now() - startMs,
      });

      return {
        ...result,
        mode: 'command',
        pipeline_ms: Date.now() - startMs,
      };
    }

    // Pure chat mode (no actions, just conversation)
    const chatResult = await aiCore.chat(userId, message, timezone);

    logger.info(`[ASSISTANT] chat complete`, {
      userId,
      mode: chatResult.mode,
      is_fallback: chatResult.is_fallback,
      elapsed_ms: Date.now() - startMs,
    });

    return {
      reply: chatResult.reply,
      action_taken: null,
      needs_confirmation: false,
      suggestions: chatResult.suggestions,
      intent: chatResult.intentCategory || 'chat',
      mode: chatResult.mode || 'chat',
      is_fallback: chatResult.is_fallback,
      confidence: chatResult.confidence,
      pipeline_ms: Date.now() - startMs,
    };

  } catch (err) {
    logger.error('[ASSISTANT] processMessage error:', err.message);
    return {
      reply: 'عذرا، حدث خطأ في المعالجة. يرجى المحاولة مرة أخرى.',
      action_taken: null,
      needs_confirmation: false,
      suggestions: aiCore.SUGGESTION_CHIPS.general,
      intent: 'error',
      mode: 'error',
      pipeline_ms: Date.now() - startMs,
    };
  }
}

// ─── 2. Quick Actions — Direct Action Shortcuts ───────────────────────────────

/**
 * Plan the user's day.
 */
async function planDay(userId, timezone = 'Africa/Cairo', targetDate = null) {
  try {
    return await aiCore.plan(userId, timezone, targetDate);
  } catch (err) {
    logger.error('[ASSISTANT] planDay error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get predictions for the user.
 */
async function getPrediction(userId, type = 'unified', timezone = 'Africa/Cairo') {
  try {
    return await aiCore.predict(userId, type, timezone);
  } catch (err) {
    logger.error('[ASSISTANT] getPrediction error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Get coaching message.
 */
async function getCoaching(userId, timezone = 'Africa/Cairo') {
  try {
    return await aiCore.coach(userId, timezone);
  } catch (err) {
    logger.error('[ASSISTANT] getCoaching error:', err.message);
    return { message: 'استمر في التقدم!', type: 'motivational', actions: [] };
  }
}

/**
 * Get proactive alerts.
 */
async function getProactiveAlerts(userId, timezone = 'Africa/Cairo') {
  try {
    return await aiCore.proactive(userId, timezone);
  } catch (err) {
    logger.error('[ASSISTANT] getProactiveAlerts error:', err.message);
    return [];
  }
}

/**
 * Get autonomous suggestions.
 */
async function getAutonomousSuggestions(userId, timezone = 'Africa/Cairo') {
  try {
    return await aiCore.autonomous(userId, timezone);
  } catch (err) {
    logger.error('[ASSISTANT] getAutonomousSuggestions error:', err.message);
    return [];
  }
}

// ─── 3. Context & History ─────────────────────────────────────────────────────

async function getUserContext(userId, timezone = 'Africa/Cairo') {
  return aiCore.context(userId, timezone);
}

function getHistory(userId) {
  return aiCore.history(userId);
}

function clearHistory(userId) {
  clearPendingAction(userId);
  return aiCore.clearHistory(userId);
}

// ─── 4. AI Status ─────────────────────────────────────────────────────────────
function getAIStatus() {
  return aiCore.status();
}

// ─── Module Export ─────────────────────────────────────────────────────────────
module.exports = {
  // Main entry point
  processMessage,

  // Quick actions
  planDay,
  getPrediction,
  getCoaching,
  getProactiveAlerts,
  getAutonomousSuggestions,

  // Context & history
  getUserContext,
  getHistory,
  clearHistory,

  // Status
  getAIStatus,
};
