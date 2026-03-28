/**
 * AI Core Service — الخدمة المركزية للذكاء الاصطناعي
 * =====================================================
 * Phase B: SINGLE unified AI entry point for ALL AI operations.
 *
 * Architecture:
 *   Request → ai.core.service.js → provider (Gemini/Groq) → Response
 *
 * This service:
 *   1. Receives ALL AI-related requests from routes
 *   2. Routes internally to task analysis, coaching, predictions, assistant commands
 *   3. Handles provider selection and centralized fallback logic
 *   4. ai.command.engine, orchestrator, conversation are INTERNAL modules (not entry points)
 *
 * Exported Methods (the ONLY AI interface for routes):
 *   - chat(userId, message, timezone, opts)         → conversational reply
 *   - command(userId, message, timezone, pending)    → action + reply
 *   - plan(userId, timezone, date)                   → day plan
 *   - predict(userId, type, timezone)                → predictions
 *   - coach(userId, timezone)                        → coaching message
 *   - proactive(userId, timezone)                    → proactive alerts
 *   - autonomous(userId, timezone)                   → autonomous suggestions
 *   - status()                                       → AI health status
 *   - context(userId, timezone)                      → user context snapshot
 *   - history(userId)                                → conversation history
 *   - clearHistory(userId)                           → clear conversation
 */

'use strict';

const logger = require('../utils/logger');

// ─── Internal Modules (NOT entry points — used ONLY through ai.core) ─────────
const commandEngine    = require('./ai.command.engine');
const orchestrator     = require('./orchestrator.service');
const conversationSvc  = require('./conversation.service');
const { getAIStatus, buildIntelligentFallback } = require('./ai/ai.client');

// Lazy-loaded services (optional, may not exist)
function getDayPlanner()   { try { return require('./dayplanner.service');   } catch (_) { return null; } }
function getPrediction()   { try { return require('./prediction.service');   } catch (_) { return null; } }
function getCoaching()     { try { return require('./ai.coach.service');     } catch (_) { return null; } }
function getProactiveEngine() { try { return require('./proactive.engine.service'); } catch (_) { return null; } }

// ─── 1. Chat — Pure Conversational AI ─────────────────────────────────────────
/**
 * Conversational chat via orchestrator pipeline.
 * Full context: memory, personalization, energy/mood, learning, prediction.
 *
 * @param {string} userId
 * @param {string} message
 * @param {string} timezone
 * @param {object} userCtx - optional pre-fetched context
 * @returns {{ reply, mode, actions, suggestions, is_fallback, confidence, ... }}
 */
async function chat(userId, message, timezone = 'Africa/Cairo', userCtx = null) {
  logger.info(`[AI-CORE] chat: user=${userId}, msg="${message.substring(0, 60)}"`);
  return orchestrator.companionChat(userId, message, timezone, userCtx);
}

// ─── 2. Command — Intent Detection + Action Execution + Reply ─────────────────
/**
 * Full command pipeline: detect intent → execute action → generate reply.
 * Handles confirmations, exam scheduling, task CRUD, mood logging, etc.
 *
 * @param {string} userId
 * @param {string} message
 * @param {string} timezone
 * @param {object|null} pendingConfirmation - previously stored pending action
 * @returns {{ reply, action_taken, needs_confirmation, pending_action, intent, suggestions }}
 */
async function command(userId, message, timezone = 'Africa/Cairo', pendingConfirmation = null) {
  logger.info(`[AI-CORE] command: user=${userId}, msg="${message.substring(0, 60)}"`);
  return commandEngine.processCommand(userId, message, timezone, pendingConfirmation);
}

// ─── 3. Plan — Day Planner ────────────────────────────────────────────────────
/**
 * Build a daily schedule combining energy profile, tasks, habits, mood.
 *
 * @param {string} userId
 * @param {string} timezone
 * @param {string} targetDate - optional YYYY-MM-DD
 * @returns {{ schedule, focus_windows, warnings, stats, persisted, plan_id }}
 */
async function plan(userId, timezone = 'Africa/Cairo', targetDate = null) {
  logger.info(`[AI-CORE] plan: user=${userId}, date=${targetDate || 'today'}`);
  const planner = getDayPlanner();
  if (!planner) throw new Error('Day planner service not available');
  return planner.buildDayPlan(userId, timezone, targetDate);
}

// ─── 4. Predict — Predictions (Task, Burnout, Mood, Probabilistic) ────────────
/**
 * @param {string} userId
 * @param {string} type - 'task'|'burnout'|'mood'|'habit'|'trajectory'|'unified'
 * @param {string} timezone
 * @returns {object} prediction result
 */
async function predict(userId, type = 'unified', timezone = 'Africa/Cairo') {
  logger.info(`[AI-CORE] predict: user=${userId}, type=${type}`);
  const pred = getPrediction();
  if (!pred) throw new Error('Prediction service not available');

  switch (type) {
    case 'task':       return pred.predictTaskCompletion(userId, timezone);
    case 'burnout':    return pred.predictBurnoutRisk(userId, timezone);
    case 'mood':       return pred.predictMoodTrend(userId, timezone);
    case 'habit':      return pred.predictHabitStreak(userId, timezone);
    case 'trajectory': return pred.getLifeTrajectory(userId, timezone);
    case 'unified':
    default:           return pred.getProbabilisticPrediction(userId, timezone);
  }
}

// ─── 5. Coach — AI Coaching Message ───────────────────────────────────────────
/**
 * Get a personalized coaching message based on current state.
 *
 * @param {string} userId
 * @param {string} timezone
 * @returns {{ message, type, actions }}
 */
async function coach(userId, timezone = 'Africa/Cairo') {
  logger.info(`[AI-CORE] coach: user=${userId}`);
  const coaching = getCoaching();
  if (!coaching) {
    // Fallback coaching message
    return {
      message: 'استمر في التقدم! كل خطوة صغيرة تقربك من أهدافك.',
      type: 'motivational',
      actions: [],
    };
  }
  return coaching.getDailyCoaching(userId, timezone);
}

// ─── 6. Proactive — Proactive Alerts (Energy, Mood, Overdue, Burnout) ─────────
/**
 * Run all proactive checks for a user.
 * Respects max 3 notifications/day and 2h cooldown per check type.
 *
 * @param {string} userId
 * @param {string} timezone
 * @returns {Array} alerts
 */
async function proactive(userId, timezone = 'Africa/Cairo') {
  logger.info(`[AI-CORE] proactive: user=${userId}`);
  const engine = getProactiveEngine();
  if (!engine) return [];
  return engine.getProactiveMessages(userId, timezone);
}

// ─── 7. Autonomous — Autonomous Life Manager ──────────────────────────────────
/**
 * Proactive suggestions: overdue tasks, overloaded days, mood reminders, etc.
 *
 * @param {string} userId
 * @param {string} timezone
 * @returns {Array} suggestions
 */
async function autonomous(userId, timezone = 'Africa/Cairo') {
  logger.info(`[AI-CORE] autonomous: user=${userId}`);
  return commandEngine.runAutonomousCheck(userId, timezone);
}

// ─── 8. Status — AI Health Check ──────────────────────────────────────────────
/**
 * Returns AI provider status (Gemini/Groq availability, failure rates, etc.)
 */
function status() {
  return getAIStatus();
}

// ─── 9. Context — User Context Snapshot ───────────────────────────────────────
/**
 * Build full user context for AI consumption.
 *
 * @param {string} userId
 * @param {string} timezone
 * @returns {{ recentTasks, todayMood, habits, profile, settings, ... }}
 */
async function context(userId, timezone = 'Africa/Cairo') {
  return commandEngine.buildUserContext(userId, timezone);
}

// ─── 10. History — Conversation History ───────────────────────────────────────
function history(userId) {
  return conversationSvc.getConversationHistory(userId);
}

// ─── 11. Clear History ────────────────────────────────────────────────────────
function clearHistory(userId) {
  return conversationSvc.clearConversation(userId);
}

// ─── 12. Standalone Chat (for simpler /ai/chat endpoint) ──────────────────────
/**
 * Simple chat wrapper without orchestrator pipeline.
 * Returns { reply, actions, suggestions, intent, context }
 */
async function simpleChat(userId, message, timezone = 'Africa/Cairo') {
  return conversationSvc.chatWithAI(userId, message, timezone);
}

// ─── 13. Intelligent Fallback ─────────────────────────────────────────────────
/**
 * Generate a context-aware fallback when all AI providers fail.
 */
function fallback(message, opts = {}) {
  return buildIntelligentFallback(message, opts);
}

// ─── 14. Detect Intent (for routes that need raw intent) ──────────────────────
async function detectIntent(message, context = {}) {
  return commandEngine.detectIntent(message, context);
}

// ─── 15. Intent Classification (lightweight, no AI call) ──────────────────────
function classifyIntent(message) {
  return conversationSvc.classifyIntent(message);
}

// ─── 16. Fetch User Context (conversation-style) ──────────────────────────────
async function fetchUserContext(userId, timezone = 'Africa/Cairo') {
  return conversationSvc.fetchUserContext(userId, timezone);
}

// ─── Module Export ─────────────────────────────────────────────────────────────
module.exports = {
  // Primary API (routes should use ONLY these)
  chat,
  command,
  plan,
  predict,
  coach,
  proactive,
  autonomous,
  status,
  context,
  history,
  clearHistory,

  // Secondary (specific use cases)
  simpleChat,
  fallback,
  detectIntent,
  classifyIntent,
  fetchUserContext,

  // Constants (re-exported for backward compat)
  SUGGESTION_CHIPS: conversationSvc.SUGGESTION_CHIPS,
};
