/**
 * Trigger Engine v1.0 — LifeFlow Proactive Intervention System
 * ═══════════════════════════════════════════════════════════════
 * Listens to user behavior patterns and decides WHEN to intervene.
 * Interventions are overlays — NOT decisions. They assist, not dictate.
 *
 * TRIGGER CONDITIONS:
 *   1. INACTIVITY: No action 12–20 min + pending tasks → light nudge
 *   2. PROCRASTINATION: 2+ skips in same category → suggest easier alternative
 *   3. MOMENTUM BOOST: 2+ tasks completed quickly → suggest harder/deeper task
 *   4. DEADLINE RISK: Task due soon & not started → urgency intervention
 *
 * SILENCE INTELLIGENCE:
 *   - Do NOT trigger when user just completed a task (grace period)
 *   - Do NOT trigger when user is actively working (recent clicks/actions)
 *   - Do NOT trigger if no meaningful suggestion can be made
 *   - Max 1 intervention per 10–15 min per user (rate limiting)
 *
 * PREDICTIVE SIGNALS (light):
 *   - Track typical inactivity windows per user
 *   - Track common skip times (time of day)
 *   - Track peak productivity hours to bias triggers
 *
 * DELIVERY: Socket.IO "brain:intervention" event
 *
 * INTERVENTION OBJECT SCHEMA:
 *   {
 *     id: string,                            // unique intervention ID
 *     type: "nudge"|"warning"|"boost"|"break",
 *     trigger: string,                       // which condition fired
 *     message: string,                       // Arabic message to display
 *     submessage: string,                    // secondary hint
 *     priority: "low"|"medium"|"high",
 *     expiresAt: ISO string,                 // auto-dismiss after this time
 *     taskId: string|null,                   // related task (if any)
 *     taskTitle: string|null,                // related task title
 *     createdAt: ISO string,
 *     dismissable: true,
 *   }
 *
 * HARD RULES:
 *   - Max 1 intervention per 10 min per user
 *   - Never interrupt active work
 *   - Never fire on empty task lists
 *   - Interventions expire (2–5 min lifetime)
 *   - All messages are in Arabic
 */

'use strict';

const moment = require('moment-timezone');
const logger = require('../utils/logger');
const eventBus = require('../core/eventBus');

// ─── Socket.IO reference ────────────────────────────────────────────────────
let _io = null;

// ─── Per-user state ─────────────────────────────────────────────────────────
// userId → { lastIntervention, lastActivity, lastCompletion, activityLog, skipLog, completionLog, predictiveProfile }
const userState = new Map();

// ─── Constants ──────────────────────────────────────────────────────────────

// Rate limiting: min gap between interventions (milliseconds)
const MIN_INTERVENTION_GAP_MS = 10 * 60 * 1000; // 10 minutes

// Grace period after task completion (no interventions)
const POST_COMPLETION_GRACE_MS = 3 * 60 * 1000; // 3 minutes

// Active work threshold — if activity within this window, user is "active"
const ACTIVE_WORK_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes

// Inactivity trigger thresholds
const INACTIVITY_LIGHT_MS = 12 * 60 * 1000; // 12 minutes
const INACTIVITY_STRONG_MS = 20 * 60 * 1000; // 20 minutes

// Procrastination: skips in same category within this window
const SKIP_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const SKIP_THRESHOLD = 2; // 2+ skips in same category

// Momentum: completions within this window
const MOMENTUM_WINDOW_MS = 30 * 60 * 1000; // 30 minutes
const MOMENTUM_THRESHOLD = 2; // 2+ fast completions

// Deadline risk: hours before due date to trigger
const DEADLINE_RISK_HOURS = 4;

// Intervention lifetimes (how long they stay visible)
const LIFETIME = {
  nudge:   3 * 60 * 1000,  // 3 min
  warning: 5 * 60 * 1000,  // 5 min
  boost:   2 * 60 * 1000,  // 2 min
  break:   4 * 60 * 1000,  // 4 min
};

// ─── Timezone ───────────────────────────────────────────────────────────────
const DEFAULT_TZ = process.env.DEFAULT_TIMEZONE || 'Africa/Cairo';

// ─── Intervention ID generator ──────────────────────────────────────────────
let _interventionCounter = 0;
function generateId() {
  _interventionCounter += 1;
  return `intervention_${Date.now()}_${_interventionCounter}`;
}

// ═════════════════════════════════════════════════════════════════════════════
// USER STATE MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

function ensureUserState(userId) {
  if (!userState.has(userId)) {
    userState.set(userId, {
      lastInterventionAt: 0,
      lastInterventionType: null,
      lastActivityAt: Date.now(),
      lastCompletionAt: 0,
      inactivityTimer: null,

      // Activity log for predictive signals
      activityLog: [],    // [{ ts, type }] — recent activity timestamps
      skipLog: [],        // [{ ts, category, taskId }] — recent skips
      completionLog: [],  // [{ ts, taskId, durationMs }] — recent completions

      // Predictive profile (learned over time)
      predictiveProfile: {
        typicalInactivityWindows: [], // [{ hour, dayOfWeek, avgMinutes }]
        commonSkipHours: {},          // { hour: count }
        peakProductivityHours: {},    // { hour: completionCount }
        totalInterventions: 0,
        interventionDismissRate: 0,
        interventionEngageRate: 0,
      },
    });
  }
  return userState.get(userId);
}

function recordActivity(userId, type = 'generic') {
  const state = ensureUserState(userId);
  const now = Date.now();
  state.lastActivityAt = now;
  state.activityLog.push({ ts: now, type });

  // Keep only last 100 entries
  if (state.activityLog.length > 100) {
    state.activityLog = state.activityLog.slice(-100);
  }

  // Reset inactivity timer
  resetInactivityTimer(userId);
}

function recordSkip(userId, category, taskId) {
  const state = ensureUserState(userId);
  const now = Date.now();
  const hour = moment().tz(DEFAULT_TZ).hour();

  state.skipLog.push({ ts: now, category: category || 'unknown', taskId });
  if (state.skipLog.length > 50) state.skipLog = state.skipLog.slice(-50);

  // Update predictive: common skip hours
  state.predictiveProfile.commonSkipHours[hour] =
    (state.predictiveProfile.commonSkipHours[hour] || 0) + 1;

  recordActivity(userId, 'skip');
}

function recordCompletion(userId, taskId, durationMs) {
  const state = ensureUserState(userId);
  const now = Date.now();
  const hour = moment().tz(DEFAULT_TZ).hour();

  state.lastCompletionAt = now;
  state.completionLog.push({ ts: now, taskId, durationMs: durationMs || 0 });
  if (state.completionLog.length > 50) state.completionLog = state.completionLog.slice(-50);

  // Update predictive: peak productivity hours
  state.predictiveProfile.peakProductivityHours[hour] =
    (state.predictiveProfile.peakProductivityHours[hour] || 0) + 1;

  recordActivity(userId, 'completion');
}

// ═════════════════════════════════════════════════════════════════════════════
// SILENCE INTELLIGENCE — Determines if NOW is a good time to intervene
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Check if user is silenced (should NOT receive interventions right now).
 * Returns { silent: boolean, reason: string }
 */
function checkSilence(userId) {
  const state = ensureUserState(userId);
  const now = Date.now();

  // Rule 1: Rate limit — max 1 intervention per MIN_INTERVENTION_GAP_MS
  if (state.lastInterventionAt && now - state.lastInterventionAt < MIN_INTERVENTION_GAP_MS) {
    const remaining = Math.round((MIN_INTERVENTION_GAP_MS - (now - state.lastInterventionAt)) / 1000);
    return { silent: true, reason: `rate_limit (${remaining}s remaining)` };
  }

  // Rule 2: Post-completion grace period
  if (state.lastCompletionAt && now - state.lastCompletionAt < POST_COMPLETION_GRACE_MS) {
    return { silent: true, reason: 'post_completion_grace' };
  }

  // Rule 3: Active work — user did something recently
  if (state.lastActivityAt && now - state.lastActivityAt < ACTIVE_WORK_THRESHOLD_MS) {
    return { silent: true, reason: 'active_work' };
  }

  return { silent: false, reason: null };
}

/**
 * Check if the current time is within a predictively good window for intervention.
 * Uses learned patterns to decide if this is a "high skip" hour or "low productivity" hour.
 */
function isPredictivelyGoodTime(userId) {
  const state = ensureUserState(userId);
  const profile = state.predictiveProfile;
  const now = moment().tz(DEFAULT_TZ);
  const hour = now.hour();

  // If this hour has high skip rate → good time to intervene (user tends to stall)
  const skipCount = profile.commonSkipHours[hour] || 0;
  const productivityCount = profile.peakProductivityHours[hour] || 0;

  // During peak productivity → slightly suppress interventions
  if (productivityCount > 5 && skipCount < 2) {
    return { good: false, reason: 'peak_productivity_hour', confidence: 0.6 };
  }

  // During frequent skip hours → slightly boost interventions
  if (skipCount > 3) {
    return { good: true, reason: 'frequent_skip_hour', confidence: 0.7 };
  }

  // Neutral — allow normal triggering
  return { good: true, reason: 'neutral', confidence: 0.5 };
}

// ═════════════════════════════════════════════════════════════════════════════
// TRIGGER CONDITIONS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Trigger 1: INACTIVITY
 * No action for 12–20 min + pending tasks → light nudge
 */
function checkInactivity(userId, pendingTaskCount) {
  const state = ensureUserState(userId);
  const now = Date.now();
  const inactiveMs = now - state.lastActivityAt;

  if (pendingTaskCount <= 0) return null;
  if (inactiveMs < INACTIVITY_LIGHT_MS) return null;

  const minutes = Math.round(inactiveMs / 60000);
  const isStrong = inactiveMs >= INACTIVITY_STRONG_MS;

  return {
    trigger: 'inactivity',
    type: isStrong ? 'warning' : 'nudge',
    priority: isStrong ? 'medium' : 'low',
    minutes,
    pendingCount: pendingTaskCount,
  };
}

/**
 * Trigger 2: PROCRASTINATION
 * 2+ skips in same category within 1 hour → suggest easier alternative
 */
function checkProcrastination(userId) {
  const state = ensureUserState(userId);
  const now = Date.now();
  const cutoff = now - SKIP_WINDOW_MS;

  // Count skips per category in the last hour
  const recentSkips = state.skipLog.filter(s => s.ts > cutoff);
  if (recentSkips.length < SKIP_THRESHOLD) return null;

  const categoryCount = {};
  for (const skip of recentSkips) {
    categoryCount[skip.category] = (categoryCount[skip.category] || 0) + 1;
  }

  // Find the category with most skips
  let worstCategory = null;
  let maxSkips = 0;
  for (const [cat, count] of Object.entries(categoryCount)) {
    if (count >= SKIP_THRESHOLD && count > maxSkips) {
      worstCategory = cat;
      maxSkips = count;
    }
  }

  if (!worstCategory) return null;

  return {
    trigger: 'procrastination',
    type: 'nudge',
    priority: 'medium',
    category: worstCategory,
    skipCount: maxSkips,
  };
}

/**
 * Trigger 3: MOMENTUM BOOST
 * 2+ tasks completed quickly (within 30 min window) → suggest harder task
 */
function checkMomentum(userId) {
  const state = ensureUserState(userId);
  const now = Date.now();
  const cutoff = now - MOMENTUM_WINDOW_MS;

  const recentCompletions = state.completionLog.filter(c => c.ts > cutoff);
  if (recentCompletions.length < MOMENTUM_THRESHOLD) return null;

  // Only fire if the last completion was recent (within 5 min) — user is on a roll
  const lastCompletion = recentCompletions[recentCompletions.length - 1];
  if (now - lastCompletion.ts > 5 * 60 * 1000) return null;

  return {
    trigger: 'momentum',
    type: 'boost',
    priority: 'low',
    completionCount: recentCompletions.length,
  };
}

/**
 * Trigger 4: DEADLINE RISK
 * Task due within DEADLINE_RISK_HOURS hours & status not started → urgency
 */
function checkDeadlineRisk(tasks) {
  if (!tasks || tasks.length === 0) return null;

  const now = moment().tz(DEFAULT_TZ);
  const riskCutoff = now.clone().add(DEADLINE_RISK_HOURS, 'hours');

  for (const task of tasks) {
    const dueDate = task.due_date ? moment(task.due_date).tz(DEFAULT_TZ) : null;
    if (!dueDate || !dueDate.isValid()) continue;

    // Task is due within the risk window
    if (dueDate.isBefore(riskCutoff) && dueDate.isAfter(now)) {
      const hoursLeft = dueDate.diff(now, 'hours', true);
      const status = (task.status || '').toLowerCase();

      // Only trigger for tasks that are not started or barely started
      if (status === 'pending' || status === 'not_started' || status === 'todo') {
        return {
          trigger: 'deadline_risk',
          type: 'warning',
          priority: 'high',
          taskId: task.id,
          taskTitle: task.title,
          hoursLeft: Math.round(hoursLeft * 10) / 10,
          dueDate: dueDate.format('HH:mm'),
        };
      }
    }
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════════════
// INTERVENTION BUILDER
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Arabic message templates for each trigger type.
 */
const MESSAGES = {
  inactivity_light: [
    { message: 'فاتك وقت ممكن تستغله 💡', submessage: 'عندك مهام مستنياك — ابدا بأصغر واحدة' },
    { message: 'بقالك شوية مش بتعمل حاجة ⏰', submessage: 'رجعة صغيرة هتفرق — اختار مهمة وابدا' },
    { message: 'مهامك مستنياك 📋', submessage: 'دقيقتين بس وتبدا — هتحس بالإنجاز' },
  ],
  inactivity_strong: [
    { message: 'بقالك أكتر من 20 دقيقة بعيد ⚠️', submessage: 'لو مشغول مفيش مشكلة — لكن لو فاضي، ابدا بحاجة صغيرة' },
    { message: 'الوقت بيعدي — عندك مهام مهمة 🕐', submessage: 'حتى لو مهمة صغيرة، هتكسر الجمود' },
  ],
  procrastination: [
    { message: 'لاحظت إنك بتأجل مهام ${category} 🔄', submessage: 'ممكن تبدا بحاجة أسهل في نفس المجال؟' },
    { message: '${skipCount} تخطيات في ${category} — جرب نهج مختلف 💭', submessage: 'أسهل خطوة: افتح المهمة واقرا أول سطر بس' },
  ],
  momentum: [
    { message: 'أنت ماشي كويس جداً! 🔥', submessage: 'استغل الزخم — خد مهمة أكبر شوية' },
    { message: 'إنجاز رائع — ${count} مهام في وقت قصير! ⚡', submessage: 'الطاقة عالية — وقت التحدي' },
  ],
  deadline_risk: [
    { message: '⚠️ "${taskTitle}" مطلوبة خلال ${hours} ساعات', submessage: 'لسه مبدأتش — ابدا دلوقتي عشان تلحق' },
    { message: '🔴 ديدلاين قريب: "${taskTitle}" الساعة ${dueTime}', submessage: 'الوقت ضيق — حتى لو بدأت بجزء صغير' },
  ],
  break: [
    { message: 'خد استراحة — أنت تستاهل 🧘', submessage: 'قوم اشرب مية وامشي شوية — هترجع أحسن' },
  ],
};

/**
 * Build an intervention object from a trigger result.
 */
function buildIntervention(triggerResult, userId) {
  const now = new Date();
  const { trigger, type, priority, taskId, taskTitle } = triggerResult;

  // Select message template
  let templateKey;
  if (trigger === 'inactivity') {
    templateKey = type === 'warning' ? 'inactivity_strong' : 'inactivity_light';
  } else {
    templateKey = trigger;
  }

  const templates = MESSAGES[templateKey] || MESSAGES.inactivity_light;
  const template = templates[Math.floor(Math.random() * templates.length)];

  // Interpolate variables
  let message = template.message;
  let submessage = template.submessage;

  // Replace template variables
  const vars = {
    category: triggerResult.category || '',
    skipCount: triggerResult.skipCount || 0,
    count: triggerResult.completionCount || 0,
    taskTitle: taskTitle || '',
    hours: triggerResult.hoursLeft || 0,
    dueTime: triggerResult.dueDate || '',
    minutes: triggerResult.minutes || 0,
    pendingCount: triggerResult.pendingCount || 0,
  };

  for (const [key, val] of Object.entries(vars)) {
    message = message.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(val));
    submessage = submessage.replace(new RegExp(`\\$\\{${key}\\}`, 'g'), String(val));
  }

  const lifetime = LIFETIME[type] || LIFETIME.nudge;

  return {
    id: generateId(),
    type,
    trigger,
    message,
    submessage,
    priority,
    taskId: taskId || null,
    taskTitle: taskTitle || null,
    expiresAt: new Date(now.getTime() + lifetime).toISOString(),
    createdAt: now.toISOString(),
    dismissable: true,
    userId,
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// CORE ENGINE — EVALUATE & FIRE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Evaluate all trigger conditions for a user.
 * Called on events (skip, inactivity) and periodically.
 * Returns an intervention object or null if nothing should fire.
 */
async function evaluate(userId, context = {}) {
  const state = ensureUserState(userId);

  // ── Silence check (FIRST — before any evaluation) ──────────────────────
  const silence = checkSilence(userId);
  if (silence.silent) {
    logger.debug(`[TriggerEngine] User ${userId} silenced: ${silence.reason}`);
    return null;
  }

  // ── Predictive bias ────────────────────────────────────────────────────
  const predictive = isPredictivelyGoodTime(userId);
  // If predictive says bad time AND no high-priority trigger, suppress
  // (We check high-priority triggers first before suppressing)

  // ── Gather context ─────────────────────────────────────────────────────
  let pendingTasks = context.pendingTasks || [];
  let pendingCount = context.pendingCount || pendingTasks.length;

  // If no context provided, try to get from brain cache
  if (pendingCount === 0 && !context._skipDbLookup) {
    try {
      const models = getModels();
      if (models.Task) {
        const { Op } = require('sequelize');
        const todayStr = moment().tz(DEFAULT_TZ).format('YYYY-MM-DD');
        pendingTasks = await models.Task.findAll({
          where: {
            user_id: userId,
            status: { [Op.ne]: 'completed' },
          },
          order: [['due_date', 'ASC']],
          raw: true,
          limit: 20,
        }).catch(() => []);
        pendingCount = pendingTasks.length;
      }
    } catch (err) {
      logger.warn(`[TriggerEngine] Failed to fetch tasks for ${userId}: ${err.message}`);
    }
  }

  // ── Evaluate triggers (highest priority first) ─────────────────────────

  // 1. Deadline risk (HIGH priority — always evaluated)
  const deadlineResult = checkDeadlineRisk(pendingTasks);
  if (deadlineResult) {
    const intervention = buildIntervention(deadlineResult, userId);
    logger.info(`[TriggerEngine] DEADLINE_RISK for ${userId}: ${intervention.message}`);
    return fireIntervention(userId, intervention);
  }

  // 2. Procrastination (MEDIUM priority)
  const procrastResult = checkProcrastination(userId);
  if (procrastResult) {
    const intervention = buildIntervention(procrastResult, userId);
    logger.info(`[TriggerEngine] PROCRASTINATION for ${userId}: ${intervention.message}`);
    return fireIntervention(userId, intervention);
  }

  // 3. Inactivity (LOW-MEDIUM priority)
  const inactivityResult = checkInactivity(userId, pendingCount);
  if (inactivityResult) {
    // If predictive says bad time (peak productivity hour), suppress light nudges
    if (!predictive.good && inactivityResult.type === 'nudge') {
      logger.debug(`[TriggerEngine] Suppressed inactivity nudge for ${userId}: ${predictive.reason}`);
      return null;
    }
    const intervention = buildIntervention(inactivityResult, userId);
    logger.info(`[TriggerEngine] INACTIVITY for ${userId}: ${intervention.message}`);
    return fireIntervention(userId, intervention);
  }

  // 4. Momentum boost (LOW priority — only during active use windows)
  const momentumResult = checkMomentum(userId);
  if (momentumResult) {
    const intervention = buildIntervention(momentumResult, userId);
    logger.info(`[TriggerEngine] MOMENTUM for ${userId}: ${intervention.message}`);
    return fireIntervention(userId, intervention);
  }

  return null;
}

/**
 * Fire an intervention — emit via Socket.IO and update user state.
 */
function fireIntervention(userId, intervention) {
  const state = ensureUserState(userId);

  // Update rate-limit state
  state.lastInterventionAt = Date.now();
  state.lastInterventionType = intervention.type;
  state.predictiveProfile.totalInterventions += 1;

  // Emit via Socket.IO
  if (_io) {
    _io.to(`user_${userId}`).emit('brain:intervention', { userId, intervention });
    logger.info(`[TriggerEngine] Emitted brain:intervention to user_${userId}: ${intervention.type}/${intervention.trigger}`);
  } else {
    logger.warn(`[TriggerEngine] No Socket.IO — cannot deliver intervention to ${userId}`);
  }

  return intervention;
}

// ═════════════════════════════════════════════════════════════════════════════
// INACTIVITY TIMER MANAGEMENT
// ═════════════════════════════════════════════════════════════════════════════

function resetInactivityTimer(userId) {
  const state = ensureUserState(userId);

  if (state.inactivityTimer) {
    clearTimeout(state.inactivityTimer);
    state.inactivityTimer = null;
  }

  // Set a timer to evaluate triggers after INACTIVITY_LIGHT_MS
  state.inactivityTimer = setTimeout(async () => {
    logger.debug(`[TriggerEngine] Inactivity timer fired for ${userId} (${INACTIVITY_LIGHT_MS / 60000} min)`);
    await evaluate(userId);

    // Set a second timer for strong inactivity
    const state2 = ensureUserState(userId);
    state2.inactivityTimer = setTimeout(async () => {
      logger.debug(`[TriggerEngine] Strong inactivity timer fired for ${userId} (${INACTIVITY_STRONG_MS / 60000} min)`);
      await evaluate(userId);
    }, INACTIVITY_STRONG_MS - INACTIVITY_LIGHT_MS);
  }, INACTIVITY_LIGHT_MS);
}

// ═════════════════════════════════════════════════════════════════════════════
// PREDICTIVE SIGNALS — Lightweight pattern learning
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Get the predictive profile for a user.
 * Useful for debugging and analytics.
 */
function getPredictiveProfile(userId) {
  const state = ensureUserState(userId);
  return { ...state.predictiveProfile };
}

/**
 * Record that an intervention was engaged (user clicked/acted on it).
 */
function recordInterventionEngagement(userId, interventionId) {
  const state = ensureUserState(userId);
  const total = state.predictiveProfile.totalInterventions || 1;
  state.predictiveProfile.interventionEngageRate =
    ((state.predictiveProfile.interventionEngageRate * (total - 1)) + 1) / total;
  recordActivity(userId, 'intervention_engaged');
}

/**
 * Record that an intervention was dismissed.
 */
function recordInterventionDismissal(userId, interventionId) {
  const state = ensureUserState(userId);
  const total = state.predictiveProfile.totalInterventions || 1;
  state.predictiveProfile.interventionDismissRate =
    ((state.predictiveProfile.interventionDismissRate * (total - 1)) + 1) / total;
}

// ═════════════════════════════════════════════════════════════════════════════
// LAZY MODEL LOADER
// ═════════════════════════════════════════════════════════════════════════════

function getModels() {
  try { return require('../config/database').sequelize.models; } catch (_e) { return {}; }
}

// ═════════════════════════════════════════════════════════════════════════════
// INITIALIZATION — Subscribe to EventBus events
// ═════════════════════════════════════════════════════════════════════════════

function init(io) {
  _io = io;
  logger.info('[TriggerEngine] Initialized with Socket.IO');

  const { EVENT_TYPES } = eventBus;

  // ── TASK_COMPLETED → record completion, check momentum ─────────────────
  eventBus.subscribe(EVENT_TYPES.TASK_COMPLETED, async (payload) => {
    const { userId, taskId } = payload;
    if (!userId) return;

    recordCompletion(userId, taskId, payload.durationMs);
    recordActivity(userId, 'task_completed');

    // Momentum check happens after grace period
    // (evaluate will respect silence rules)
    setTimeout(() => {
      evaluate(userId, { _skipDbLookup: false }).catch(err => {
        logger.warn(`[TriggerEngine] Momentum eval error for ${userId}: ${err.message}`);
      });
    }, 5000); // 5s delay for momentum to "settle"
  });

  // ── TASK_SKIPPED → record skip, check procrastination ─────────────────
  eventBus.subscribe(EVENT_TYPES.TASK_SKIPPED, async (payload) => {
    const { userId, taskId, category, skipType } = payload;
    if (!userId) return;

    recordSkip(userId, category || skipType, taskId);

    // Evaluate for procrastination pattern
    setTimeout(() => {
      evaluate(userId, { _skipDbLookup: false }).catch(err => {
        logger.warn(`[TriggerEngine] Procrastination eval error for ${userId}: ${err.message}`);
      });
    }, 2000);
  });

  // ── TASK_CREATED → record activity ────────────────────────────────────
  eventBus.subscribe(EVENT_TYPES.TASK_CREATED, async (payload) => {
    if (payload.userId) recordActivity(payload.userId, 'task_created');
  });

  // ── HABIT_COMPLETED → record activity + completion ────────────────────
  eventBus.subscribe(EVENT_TYPES.HABIT_COMPLETED, async (payload) => {
    if (payload.userId) {
      recordCompletion(payload.userId, payload.habitId);
      recordActivity(payload.userId, 'habit_completed');
    }
  });

  // ── ENERGY_UPDATED → record activity ──────────────────────────────────
  eventBus.subscribe(EVENT_TYPES.ENERGY_UPDATED, async (payload) => {
    if (payload.userId) recordActivity(payload.userId, 'energy_updated');
  });

  // ── USER_INACTIVE → evaluate triggers ─────────────────────────────────
  eventBus.subscribe(EVENT_TYPES.USER_INACTIVE, async (payload) => {
    if (payload.userId) {
      await evaluate(payload.userId);
    }
  });

  // ── DECISION_REJECTED → record activity ───────────────────────────────
  eventBus.subscribe(EVENT_TYPES.DECISION_REJECTED, async (payload) => {
    if (payload.userId) recordActivity(payload.userId, 'decision_rejected');
  });

  logger.info('[TriggerEngine] Subscribed to all EventBus events');
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════

module.exports = {
  init,
  evaluate,
  recordActivity,
  recordSkip,
  recordCompletion,
  recordInterventionEngagement,
  recordInterventionDismissal,
  checkSilence,
  getPredictiveProfile,

  // Exposed for testing
  _checkInactivity: checkInactivity,
  _checkProcrastination: checkProcrastination,
  _checkMomentum: checkMomentum,
  _checkDeadlineRisk: checkDeadlineRisk,
  _buildIntervention: buildIntervention,
  _isPredictivelyGoodTime: isPredictivelyGoodTime,
  _ensureUserState: ensureUserState,
  _userState: userState,
  _resetInactivityTimer: resetInactivityTimer,

  // Constants exposed for testing
  MIN_INTERVENTION_GAP_MS,
  POST_COMPLETION_GRACE_MS,
  ACTIVE_WORK_THRESHOLD_MS,
  INACTIVITY_LIGHT_MS,
  INACTIVITY_STRONG_MS,
  SKIP_WINDOW_MS,
  SKIP_THRESHOLD,
  MOMENTUM_WINDOW_MS,
  MOMENTUM_THRESHOLD,
  DEADLINE_RISK_HOURS,
};
