/**
 * Execution Engine Service — Step 2
 * ====================================
 * Core daily loop: Observe → Decide → Act → Track → Learn
 *
 * Runs daily (8 AM cron) and on-demand via assistant.
 * Integrates: Behavior Model, Energy Service, Planning, Decision Engine, Learning Engine.
 *
 * Loop Steps:
 *  1. OBSERVE  — Gather user state (context snapshot, behavior profile, energy)
 *  2. DECIDE   — Identify actions needed (overdue reschedule, plan generation, proactive alerts)
 *  3. ACT      — Execute safe actions, queue risky ones as suggestions
 *  4. TRACK    — Record outcomes in learning engine
 *  5. LEARN    — Update behavior model with new data
 */

'use strict';

const moment = require('moment-timezone');
const logger = require('../utils/logger');

// ── Lazy service loaders ─────────────────────────────────────────────────────
function getContextSnapshot()  { try { return require('./context.snapshot.service');  } catch (_) { return null; } }
function getBehaviorModel()    { try { return require('./behavior.model.service');    } catch (_) { return null; } }
function getEnergyService()    { try { return require('./energy.service');            } catch (_) { return null; } }
function getDayPlanner()       { try { return require('./dayplanner.service');        } catch (_) { return null; } }
function getDecisionEngine()   { try { return require('./decision.engine.service');   } catch (_) { return null; } }
function getLearningEngine()   { try { return require('./learning.engine.service');   } catch (_) { return null; } }
function getSchedulingEngine() { try { return require('./scheduling.engine.service'); } catch (_) { return null; } }
function getGoalEngine()       { try { return require('./goal.engine.service');       } catch (_) { return null; } }

function getModels() {
  const m = {};
  try { m.Task = require('../models/task.model'); } catch (_) {}
  try { m.Habit = require('../models/habit.model').Habit; } catch (_) {}
  try { m.HabitLog = require('../models/habit.model').HabitLog; } catch (_) {}
  try { m.MoodEntry = require('../models/mood.model'); } catch (_) {}
  try { m.Notification = require('../models/insight.model').Notification; } catch (_) {}
  try { m.User = require('../models/user.model'); } catch (_) {}
  return m;
}

// ── Run Results ──────────────────────────────────────────────────────────────
const loopResults = new Map(); // userId → last loop result

/**
 * runDailyLoop(userId, timezone, io)
 * Main entry: executes the full Observe→Decide→Act→Track→Learn cycle.
 * Called by scheduler (8 AM) or on-demand from assistant.
 *
 * @returns {object} loop result with actions taken, suggestions, and state
 */
async function runDailyLoop(userId, timezone = 'Africa/Cairo', io = null) {
  const startMs = Date.now();
  const now = moment().tz(timezone);
  const today = now.format('YYYY-MM-DD');

  const result = {
    userId,
    date: today,
    phase: 'init',
    observed: null,
    decisions: [],
    actions_taken: [],
    suggestions: [],
    tracked: 0,
    learned: false,
    errors: [],
    duration_ms: 0,
  };

  try {
    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 1: OBSERVE — Gather complete user state
    // ══════════════════════════════════════════════════════════════════════════
    result.phase = 'observe';
    const observed = await observe(userId, timezone);
    result.observed = {
      energy: observed.energy,
      mood: observed.mood,
      activeTasks: observed.activeTasks.length,
      overdueTasks: observed.overdueTasks.length,
      habitsDone: observed.habitsDone,
      habitsTotal: observed.habitsTotal,
      behaviorQuality: observed.behaviorProfile?.data_quality || 'none',
      procrastinationScore: observed.procrastination?.score || 0,
    };

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2: DECIDE — Determine actions needed
    // ══════════════════════════════════════════════════════════════════════════
    result.phase = 'decide';
    const decisions = decide(observed, timezone);
    result.decisions = decisions.map(d => ({ action: d.action, reason: d.reason, risk: d.risk }));

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 3: ACT — Execute safe actions, queue risky ones
    // ══════════════════════════════════════════════════════════════════════════
    result.phase = 'act';
    for (const decision of decisions) {
      try {
        const actionResult = await act(decision, userId, timezone, io);
        if (actionResult.executed) {
          result.actions_taken.push({ action: decision.action, result: actionResult.message });
        } else {
          result.suggestions.push({ action: decision.action, message: actionResult.message, reason: decision.reason });
        }
      } catch (actErr) {
        result.errors.push({ action: decision.action, error: actErr.message });
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 4: TRACK — Record outcomes
    // ══════════════════════════════════════════════════════════════════════════
    result.phase = 'track';
    const learning = getLearningEngine();
    if (learning) {
      for (const action of result.actions_taken) {
        learning.recordOutcome(userId, {
          action: action.action,
          success: true,
          energy: observed.energy,
          mood: observed.mood,
        });
        result.tracked++;
      }
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 5: LEARN — Update behavior model
    // ══════════════════════════════════════════════════════════════════════════
    result.phase = 'learn';
    const behaviorSvc = getBehaviorModel();
    if (behaviorSvc && result.actions_taken.length > 0) {
      // Trigger background rebuild (non-blocking)
      setImmediate(() => {
        behaviorSvc.buildBehaviorModel(userId, timezone, 30).catch(e => {
          logger.debug(`[EXEC-ENGINE] Background behavior rebuild error: ${e.message}`);
        });
      });
      result.learned = true;
    }

    // ── Generate or refresh daily plan ────────────────────────────────────────
    try {
      const planner = getDayPlanner();
      if (planner) {
        await planner.buildDayPlan(userId, timezone);
        result.actions_taken.push({ action: 'generate_plan', result: 'Daily plan refreshed' });
      }
    } catch (planErr) {
      logger.debug(`[EXEC-ENGINE] Plan generation error: ${planErr.message}`);
    }

    result.phase = 'complete';

  } catch (err) {
    result.errors.push({ phase: result.phase, error: err.message });
    logger.error(`[EXEC-ENGINE] Loop error for user ${userId}:`, err.message);
  }

  result.duration_ms = Date.now() - startMs;
  loopResults.set(userId, result);

  logger.info(`[EXEC-ENGINE] Loop complete for ${userId}: ${result.actions_taken.length} actions, ${result.suggestions.length} suggestions, ${result.duration_ms}ms`);
  return result;
}

// ── OBSERVE: Gather user state ───────────────────────────────────────────────
async function observe(userId, timezone) {
  const { Task, Habit, HabitLog, MoodEntry } = getModels();
  const { Op } = require('sequelize');
  const now = moment().tz(timezone);
  const today = now.format('YYYY-MM-DD');

  // Parallel data fetch
  const [tasks, habits, habitLogs, todayMood, snapshot, behaviorProfile, energyData] = await Promise.all([
    Task ? Task.findAll({ where: { user_id: userId, status: { [Op.in]: ['pending', 'in_progress'] } }, order: [['due_date', 'ASC']], limit: 30, raw: true }) : [],
    Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
    HabitLog ? HabitLog.findAll({ where: { user_id: userId, log_date: today }, raw: true }) : [],
    MoodEntry ? MoodEntry.findOne({ where: { user_id: userId, entry_date: today }, raw: true }) : null,
    (async () => { const ctx = getContextSnapshot(); return ctx ? ctx.getOrGenerateSnapshot(userId, timezone) : null; })(),
    (async () => { const bm = getBehaviorModel(); return bm ? bm.getBehaviorProfile(userId) : null; })(),
    (async () => { const es = getEnergyService(); return es ? es.computeDailyEnergyScore(userId, timezone).catch(() => null) : null; })(),
  ]);

  // Compute overdue
  const overdueTasks = tasks.filter(t => {
    if (!t.due_date) return false;
    const dueStr = String(t.due_date).split('T')[0];
    return dueStr < today;
  });

  // Today's tasks
  const todayTasks = tasks.filter(t => {
    if (!t.due_date) return false;
    const dueStr = String(t.due_date).split('T')[0];
    return dueStr === today;
  });

  // Procrastination from behavior profile or compute inline
  let procrastination = null;
  const bm = getBehaviorModel();
  if (bm) {
    procrastination = bm.detectProcrastination(tasks, timezone);
  }

  // Fetch goal context (enriches decisions)
  let goalContext = null;
  const goalEngine = getGoalEngine();
  if (goalEngine) {
    try { goalContext = await goalEngine.getGoalContext(userId, timezone); } catch (_) {}
  }

  return {
    energy: energyData?.energy_score || snapshot?.energy?.score || 55,
    mood: todayMood?.mood_score || snapshot?.mood?.score || 5,
    activeTasks: tasks,
    todayTasks,
    overdueTasks,
    urgentTasks: tasks.filter(t => t.priority === 'urgent' || t.priority === 'high'),
    habits,
    habitsDone: habitLogs.filter(l => l.completed).length,
    habitsTotal: habits.length,
    behaviorProfile: behaviorProfile?.toJSON ? behaviorProfile.toJSON() : behaviorProfile,
    procrastination,
    snapshot,
    energyData,
    goalContext,
  };
}

// ── DECIDE: Determine actions needed ─────────────────────────────────────────
function decide(observed, timezone) {
  const decisions = [];
  const now = moment().tz(timezone);

  // 1. Auto-reschedule overdue tasks (if few, suggest if many)
  if (observed.overdueTasks.length > 0 && observed.overdueTasks.length <= 3) {
    decisions.push({
      action: 'auto_reschedule_overdue',
      reason: `${observed.overdueTasks.length} مهمة متأخرة — إعادة جدولة تلقائية`,
      risk: 'low',
      data: { taskIds: observed.overdueTasks.map(t => t.id) },
    });
  } else if (observed.overdueTasks.length > 3) {
    decisions.push({
      action: 'suggest_reschedule_overdue',
      reason: `${observed.overdueTasks.length} مهمة متأخرة — يحتاج مراجعة`,
      risk: 'medium',
      data: { taskIds: observed.overdueTasks.map(t => t.id), count: observed.overdueTasks.length },
    });
  }

  // 2. Energy-based task reordering suggestion
  if (observed.energy < 40 && observed.urgentTasks.length > 3) {
    decisions.push({
      action: 'suggest_reduce_load',
      reason: 'طاقة منخفضة مع مهام عاجلة كثيرة — اقتراح تخفيف',
      risk: 'low',
      data: { energy: observed.energy, urgentCount: observed.urgentTasks.length },
    });
  }

  // 3. Habit reminder if none done and past noon
  if (observed.habitsTotal > 0 && observed.habitsDone === 0 && now.hour() >= 12) {
    decisions.push({
      action: 'nudge_habits',
      reason: 'لم تكمل أي عادة اليوم — تذكير',
      risk: 'low',
      data: { habitsTotal: observed.habitsTotal },
    });
  }

  // 4. Procrastination intervention
  if (observed.procrastination && observed.procrastination.score > 60) {
    decisions.push({
      action: 'procrastination_intervention',
      reason: `نمط تأجيل مرتفع (${observed.procrastination.score}%) — تدخل`,
      risk: 'low',
      data: observed.procrastination,
    });
  }

  // 5. Burnout warning
  if (observed.energy < 25 && observed.mood < 4) {
    decisions.push({
      action: 'burnout_warning',
      reason: 'طاقة ومزاج منخفضان جداً — تحذير إجهاد',
      risk: 'low',
      data: { energy: observed.energy, mood: observed.mood },
    });
  }

  // 6. Goal-driven decisions
  if (observed.goalContext) {
    const gc = observed.goalContext;
    // Nudge for neglected goals
    if (gc.neglectedGoals && gc.neglectedGoals.length > 0) {
      decisions.push({
        action: 'nudge_neglected_goals',
        reason: `${gc.neglectedGoals.length} أهداف مهملة تحتاج اهتمام`,
        risk: 'low',
        data: { goals: gc.neglectedGoals.slice(0, 3).map(g => ({ id: g.id, title: g.title })) },
      });
    }
    // Surface top goal suggestions
    if (gc.goalSuggestions && gc.goalSuggestions.length > 0) {
      const topSugg = gc.goalSuggestions[0];
      decisions.push({
        action: 'goal_focus_suggestion',
        reason: topSugg.message,
        risk: 'low',
        data: topSugg,
      });
    }
  }

  // 7. Generate/refresh plan if not generated today
  decisions.push({
    action: 'ensure_daily_plan',
    reason: 'ضمان وجود خطة يومية محدّثة',
    risk: 'low',
    data: {},
  });

  return decisions;
}

// ── ACT: Execute decisions ───────────────────────────────────────────────────
async function act(decision, userId, timezone, io) {
  const { Task } = getModels();
  const { Op } = require('sequelize');
  const today = moment().tz(timezone).format('YYYY-MM-DD');

  switch (decision.action) {
    case 'auto_reschedule_overdue': {
      if (!Task) return { executed: false, message: 'Task model unavailable' };
      const ids = decision.data.taskIds || [];
      if (ids.length === 0) return { executed: false, message: 'No tasks to reschedule' };

      const [count] = await Task.update(
        { due_date: today },
        { where: { id: { [Op.in]: ids }, user_id: userId } }
      );

      // Send notification
      sendNotification(userId, io, {
        type: 'auto_action',
        title: `🔄 تمت إعادة جدولة ${count} مهمة`,
        body: `نقلنا ${count} مهمة متأخرة لليوم تلقائياً`,
      });

      return { executed: true, message: `Rescheduled ${count} overdue tasks to today` };
    }

    case 'suggest_reschedule_overdue': {
      sendNotification(userId, io, {
        type: 'suggestion',
        title: `⚠️ لديك ${decision.data.count} مهمة متأخرة`,
        body: 'هل تريد إعادة جدولتها؟ افتح المساعد للتنظيم.',
      });
      return { executed: false, message: `Suggested reschedule for ${decision.data.count} overdue tasks` };
    }

    case 'suggest_reduce_load': {
      sendNotification(userId, io, {
        type: 'suggestion',
        title: '😴 طاقتك منخفضة اليوم',
        body: `لديك ${decision.data.urgentCount} مهمة عاجلة. ركّز على الأهم فقط.`,
      });
      return { executed: false, message: 'Suggested load reduction' };
    }

    case 'nudge_habits': {
      sendNotification(userId, io, {
        type: 'reminder',
        title: '🔄 لم تسجّل عاداتك اليوم',
        body: `لديك ${decision.data.habitsTotal} عادة بانتظارك. ابدأ بواحدة!`,
      });
      return { executed: false, message: 'Habit nudge sent' };
    }

    case 'procrastination_intervention': {
      const rec = decision.data.recommendation || 'ابدأ بأصغر مهمة الآن';
      sendNotification(userId, io, {
        type: 'intervention',
        title: '⏰ لاحظنا نمط تأجيل',
        body: rec,
      });
      return { executed: false, message: 'Procrastination intervention sent' };
    }

    case 'burnout_warning': {
      sendNotification(userId, io, {
        type: 'warning',
        title: '🚨 تحذير: إجهاد محتمل',
        body: 'طاقتك ومزاجك منخفضان. خذ استراحة أو خفّف مهامك اليوم.',
      });
      return { executed: false, message: 'Burnout warning sent' };
    }

    case 'nudge_neglected_goals': {
      const goalNames = (decision.data.goals || []).map(g => g.title).join('، ');
      sendNotification(userId, io, {
        type: 'suggestion',
        title: '💤 أهداف تحتاج اهتمامك',
        body: `هذه الأهداف لم تحقق تقدماً مؤخراً: ${goalNames}`,
      });
      return { executed: false, message: `Nudged for ${decision.data.goals?.length || 0} neglected goals` };
    }

    case 'goal_focus_suggestion': {
      sendNotification(userId, io, {
        type: 'suggestion',
        title: '🎯 اقتراح لتحقيق أهدافك',
        body: decision.data.message || decision.reason,
      });
      return { executed: false, message: 'Goal focus suggestion sent' };
    }

    case 'ensure_daily_plan': {
      // Plan generation handled in runDailyLoop directly
      return { executed: true, message: 'Daily plan ensured' };
    }

    default:
      return { executed: false, message: `Unknown action: ${decision.action}` };
  }
}

// ── Helper: Send Notification ────────────────────────────────────────────────
async function sendNotification(userId, io, { type, title, body }) {
  try {
    const { Notification } = getModels();
    if (Notification) {
      const notif = await Notification.create({
        user_id: userId,
        type: type || 'system',
        title,
        body,
        priority: type === 'warning' ? 'high' : 'medium',
      });
      if (io) {
        io.to(`user_${userId}`).emit('notification', notif);
      }
    }
  } catch (e) {
    logger.debug(`[EXEC-ENGINE] Notification send failed: ${e.message}`);
  }
}

// ── Get Last Loop Result ─────────────────────────────────────────────────────
function getLastResult(userId) {
  return loopResults.get(userId) || null;
}

// ── On-demand trigger (from assistant or dashboard) ──────────────────────────
async function triggerLoop(userId, timezone = 'Africa/Cairo') {
  return runDailyLoop(userId, timezone, null);
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 3: EVENT-DRIVEN EXECUTION MODEL
// ═══════════════════════════════════════════════════════════════════════════
const eventDebounce = new Map();
const DEBOUNCE_MS = 30000;

async function onEvent(userId, eventType, data = {}, io = null) {
  const debounceKey = `${userId}:${eventType}`;
  const lastFired = eventDebounce.get(debounceKey) || 0;
  if (Date.now() - lastFired < DEBOUNCE_MS) {
    logger.debug(`[EXEC-ENGINE] Event ${eventType} debounced for user ${userId}`);
    return null;
  }
  eventDebounce.set(debounceKey, Date.now());
  const timezone = data.timezone || 'Africa/Cairo';
  logger.info(`[EXEC-ENGINE] Event: ${eventType} for user ${userId}`);

  try {
    switch (eventType) {
      case 'task_completed': {
        const goalEngine = getGoalEngine();
        if (goalEngine && data.goalId) {
          await goalEngine.updateGoalProgress(data.goalId, userId);
        }
        sendNotification(userId, io, {
          type: 'achievement', title: '\uD83C\uDF89 \u0623\u062D\u0633\u0646\u062A!',
          body: data.taskTitle
            ? `\u0623\u0643\u0645\u0644\u062A "${data.taskTitle}". ${data.remaining || 0} \u0645\u0647\u0645\u0629 \u0645\u062A\u0628\u0642\u064A\u0629 \u0627\u0644\u064A\u0648\u0645.`
            : '\u0645\u0647\u0645\u0629 \u0645\u0643\u062A\u0645\u0644\u0629! \u0627\u0633\u062A\u0645\u0631.',
        });
        const planner = getDayPlanner();
        if (planner) setImmediate(() => planner.buildDayPlan(userId, timezone).catch(() => {}));
        return { event: eventType, action: 'plan_refreshed' };
      }
      case 'task_delayed': {
        const rescheduleCount = data.rescheduleCount || 1;
        if (rescheduleCount >= 3) {
          sendNotification(userId, io, {
            type: 'intervention', title: '\u23F0 \u0646\u0645\u0637 \u062A\u0623\u062C\u064A\u0644 \u0645\u0644\u062D\u0648\u0638',
            body: `\u0623\u062C\u0651\u0644\u062A "${data.taskTitle || '\u0645\u0647\u0645\u0629'}" ${rescheduleCount} \u0645\u0631\u0627\u062A. \u0647\u0644 \u062A\u062D\u062A\u0627\u062C \u062A\u0642\u0633\u064A\u0645\u0647\u0627\u061F`,
          });
        }
        return { event: eventType, action: 'procrastination_check' };
      }
      case 'mood_logged': {
        const moodScore = data.moodScore || 5;
        if (moodScore <= 3) {
          sendNotification(userId, io, {
            type: 'suggestion', title: '\uD83D\uDC99 \u0644\u0627\u062D\u0638\u0646\u0627 \u0645\u0632\u0627\u062C\u0643',
            body: '\u0645\u0632\u0627\u062C\u0643 \u0645\u0646\u062E\u0641\u0636 \u0627\u0644\u064A\u0648\u0645. \u062E\u0641\u0651\u0641\u0646\u0627 \u062E\u0637\u062A\u0643 \u0648\u0623\u0636\u0641\u0646\u0627 \u0627\u0633\u062A\u0631\u0627\u062D\u0627\u062A.',
          });
          const planner = getDayPlanner();
          if (planner) setImmediate(() => planner.buildDayPlan(userId, timezone).catch(() => {}));
        } else if (moodScore >= 8) {
          sendNotification(userId, io, {
            type: 'suggestion', title: '\uD83D\uDD25 \u0637\u0627\u0642\u062A\u0643 \u0631\u0627\u0626\u0639\u0629!',
            body: '\u0645\u0632\u0627\u062C\u0643 \u0645\u0631\u062A\u0641\u0639 \u2014 \u0648\u0642\u062A \u0645\u062B\u0627\u0644\u064A \u0644\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u0639\u0645\u064A\u0642\u0629.',
          });
        }
        return { event: eventType, action: 'mood_adjusted', moodScore };
      }
      case 'habit_missed': {
        sendNotification(userId, io, {
          type: 'reminder', title: `\uD83D\uDD14 \u0639\u0627\u062F\u0629 "${data.habitName || '\u064A\u0648\u0645\u064A\u0629'}" \u0628\u0627\u0646\u062A\u0638\u0627\u0631\u0643`,
          body: '\u0644\u0627 \u062A\u0646\u0633\u064E \u0639\u0627\u062F\u0627\u062A\u0643. \u062D\u062A\u0649 \u0644\u0648 \u0641\u0627\u062A\u0643 \u0627\u0644\u0645\u0648\u0639\u062F\u060C \u0633\u062C\u0651\u0644\u0647\u0627 \u0627\u0644\u0622\u0646!',
        });
        return { event: eventType, action: 'habit_nudge_sent' };
      }
      case 'habit_completed': {
        sendNotification(userId, io, {
          type: 'achievement',
          title: `\u2705 \u0631\u0627\u0626\u0639! \u0623\u0643\u0645\u0644\u062A "${data.habitName || '\u0639\u0627\u062F\u0629'}"`,
          body: data.streak ? `\u0633\u0644\u0633\u0644\u0629 ${data.streak} \u064A\u0648\u0645! \uD83D\uDD25` : '\u0627\u0633\u062A\u0645\u0631 \u0641\u064A \u0627\u0644\u0628\u0646\u0627\u0621!',
        });
        return { event: eventType, action: 'habit_celebrated' };
      }
      case 'energy_low': {
        sendNotification(userId, io, {
          type: 'suggestion', title: '\uD83D\uDE34 \u0637\u0627\u0642\u062A\u0643 \u0645\u0646\u062E\u0641\u0636\u0629',
          body: '\u0646\u0646\u0635\u062D \u0628\u0627\u0644\u062A\u0631\u0643\u064A\u0632 \u0639\u0644\u0649 \u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u062E\u0641\u064A\u0641\u0629 \u0623\u0648 \u0623\u062E\u0630 \u0627\u0633\u062A\u0631\u0627\u062D\u0629.',
        });
        return { event: eventType, action: 'energy_suggestion_sent' };
      }
      case 'goal_updated': {
        const planner = getDayPlanner();
        if (planner) setImmediate(() => planner.buildDayPlan(userId, timezone).catch(() => {}));
        return { event: eventType, action: 'plan_refreshed_for_goal' };
      }
      default:
        logger.debug(`[EXEC-ENGINE] Unknown event type: ${eventType}`);
        return null;
    }
  } catch (err) {
    logger.error(`[EXEC-ENGINE] Event handler error for ${eventType}:`, err.message);
    return { event: eventType, error: err.message };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 4: USER AWARENESS LAYER
// ═══════════════════════════════════════════════════════════════════════════
async function getAwarenessSummary(userId, timezone = 'Africa/Cairo') {
  const lastResult = getLastResult(userId);
  const goalEngine = getGoalEngine();
  const summary = {
    lastLoopTime: lastResult?.date || null,
    recentActions: [],
    reschedulingReasons: [],
    peakTimeSuggestions: [],
    goalProgress: [],
    procrastinationInsight: null,
  };

  if (lastResult?.actions_taken) {
    summary.recentActions = lastResult.actions_taken.map(a => ({
      action: a.action, description: a.result, automated: true,
    }));
  }
  if (lastResult?.suggestions) {
    summary.recentActions.push(...lastResult.suggestions.map(s => ({
      action: s.action, description: s.message, automated: false, reason: s.reason,
    })));
  }
  if (lastResult?.observed?.overdueTasks > 0) {
    summary.reschedulingReasons.push({
      reason: `${lastResult.observed.overdueTasks} \u0645\u0647\u0645\u0629 \u0645\u062A\u0623\u062E\u0631\u0629 \u062A\u0645\u062A \u0625\u0639\u0627\u062F\u0629 \u062C\u062F\u0648\u0644\u062A\u0647\u0627`,
      detail: '\u0627\u0644\u0645\u0647\u0627\u0645 \u0627\u0644\u062A\u064A \u062A\u062C\u0627\u0648\u0632\u062A \u0645\u0648\u0639\u062F\u0647\u0627 \u062A\u064F\u0646\u0642\u0644 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B \u0644\u0644\u064A\u0648\u0645.',
    });
  }

  try {
    const planner = getDayPlanner();
    if (planner) {
      const focusWindows = await planner.getFocusWindowsForUser(userId, timezone);
      summary.peakTimeSuggestions = (focusWindows || []).map(w => ({
        window: w.label, avgEnergy: w.avg_energy, recommendation: w.recommendation,
      }));
    }
  } catch (_) {}

  if (goalEngine) {
    try {
      const ctx = await goalEngine.getGoalContext(userId, timezone);
      summary.goalProgress = (ctx.activeGoals || []).slice(0, 5).map(g => ({
        title: g.title, progress: g.progress, priorityScore: g.priorityScore,
        pendingTasks: g.pendingTasks,
        status: g.progress >= 80 ? 'on_track' : g.priorityScore > 70 ? 'at_risk' : 'normal',
      }));
    } catch (_) {}
  }

  if (lastResult?.observed?.procrastinationScore > 40) {
    summary.procrastinationInsight = {
      score: lastResult.observed.procrastinationScore,
      message: lastResult.observed.procrastinationScore > 70
        ? '\u0646\u0645\u0637 \u062A\u0623\u062C\u064A\u0644 \u0645\u0631\u062A\u0641\u0639 \u2014 \u062D\u0627\u0648\u0644 \u062A\u0642\u0646\u064A\u0629 "\u062F\u0642\u064A\u0642\u062A\u064A\u0646": \u0627\u0628\u062F\u0623 \u0623\u064A \u0645\u0647\u0645\u0629 \u0644\u0645\u062F\u0629 \u062F\u0642\u064A\u0642\u062A\u064A\u0646 \u0641\u0642\u0637.'
        : '\u0628\u0639\u0636 \u0627\u0644\u062A\u0623\u062C\u064A\u0644 \u0627\u0644\u0637\u0628\u064A\u0639\u064A \u2014 \u0631\u0643\u0651\u0632 \u0639\u0644\u0649 \u0625\u0646\u0647\u0627\u0621 \u0645\u0647\u0645\u0629 \u0648\u0627\u062D\u062F\u0629 \u0635\u063A\u064A\u0631\u0629 \u0627\u0644\u0622\u0646.',
    };
  }

  return summary;
}

module.exports = {
  runDailyLoop,
  triggerLoop,
  getLastResult,
  observe,
  decide,
  onEvent,
  getAwarenessSummary,
};
