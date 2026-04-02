/**
 * Execution Engine Routes v3.0 — Adaptive VA Behavior Layer
 * ═══════════════════════════════════════════════════════════
 * Loop: Start → Track → Adapt → Reward → Learn → Follow-up → Next
 *
 * Endpoints:
 *   GET  /engine/today       — Current state + next action (or active session)
 *   POST /engine/start       — Begin execution (idle→active)
 *   POST /engine/pulse       — Mid-session heartbeat: tracking + adaptation
 *   POST /engine/pause       — Pause session (active→paused)
 *   POST /engine/resume      — Resume session (paused→active)
 *   POST /engine/complete    — Finish execution → reward → learn → next
 *   POST /engine/skip        — Skip → micro-adapt → lighter suggestion instantly
 *   POST /engine/delay       — Delay → auto-suggest new time slot
 *   POST /engine/abandon     — Exit focus → re-engage with lighter prompt
 *   POST /engine/nudge       — Ignore detected → push small step
 *   POST /engine/switch      — Switch to alternative in-engine (no nav away)
 *   GET  /engine/session     — Current active session detail
 *
 * v3 Additions (Adaptive VA Behavior Layer):
 *   - Micro-Adaptation Loop: skip→lighter, delay→reschedule, abandon→re-engage, ignore→nudge
 *   - Adaptive Tone: uses UserModel procrastination/burnout/discipline scores
 *   - Follow-up Limits: max 3 nudges per session, 2-min cooldown, daily cap
 *   - All interactions stay in-app, no external notifications
 *
 * Philosophy:
 *   - DB-persisted sessions (survives restart)
 *   - Real-time adaptation during execution
 *   - Resistance classification feeds UserModel
 *   - Completion triggers reward + learning + next suggestion
 *   - In-engine switching — never leave the execution screen
 *   - Proactive follow-up: system reacts instantly to user behavior
 */

'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

router.use(protect);

// ─── Lazy service loaders ───────────────────────────────────────────────────
function getUnifiedDecision() {
  try { return require('../services/unified.decision.service'); } catch (e) { return null; }
}
function getNextAction() {
  try { return require('../services/next.action.service'); } catch (e) { return null; }
}
function getExecutionEngine() {
  try { return require('../services/execution.engine.service'); } catch (e) { return null; }
}
function getLearning() {
  try { return require('../services/learning.engine.service'); } catch (e) { return null; }
}
function getUserModelService() {
  try { return require('../services/user.model.service'); } catch (e) { return null; }
}
function getIntelligence() {
  try { return require('../services/intelligence.service'); } catch (e) { return null; }
}
function getModels() {
  try { return require('../config/database').sequelize.models; } catch (e) { return {}; }
}
function getSessionModel() {
  try { return require('../models/execution_session.model'); } catch (e) { return null; }
}
function getBehaviorEngine() {
  try { return require('../services/behavior.engine.service'); } catch (e) { return null; }
}
function getGoalEngine() {
  try { return require('../services/goal.engine.service'); } catch (e) { return null; }
}

// ─── Session timeout constants ──────────────────────────────────────────────
const SESSION_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours → auto-abandon
const NUDGE_INTERVALS_MIN = [5, 15, 30, 45, 60]; // When to send nudges

// ─── Follow-up / Anti-annoyance limits ──────────────────────────────────────
const FOLLOWUP_LIMITS = {
  max_nudges_per_session: 3,     // Don't nudge more than 3 times per session
  nudge_cooldown_ms: 2 * 60 * 1000,  // 2 minutes between nudges
  max_daily_followups: 8,        // Cap total follow-ups per day
  ignore_threshold_ms: 3 * 60 * 1000, // After 3 min inactivity → trigger nudge
};

// ─── In-memory follow-up tracker (per-user, resets daily) ────────────────────
const followupTracker = new Map(); // userId → { count, lastAt, date }
function getFollowupState(userId) {
  const today = new Date().toISOString().split('T')[0];
  const state = followupTracker.get(userId);
  if (!state || state.date !== today) {
    const fresh = { count: 0, lastAt: 0, date: today };
    followupTracker.set(userId, fresh);
    return fresh;
  }
  return state;
}
function canFollowUp(userId) {
  const state = getFollowupState(userId);
  if (state.count >= FOLLOWUP_LIMITS.max_daily_followups) return false;
  if (Date.now() - state.lastAt < FOLLOWUP_LIMITS.nudge_cooldown_ms) return false;
  return true;
}
function recordFollowUp(userId) {
  const state = getFollowupState(userId);
  state.count++;
  state.lastAt = Date.now();
}

// ─── Reward calculation ─────────────────────────────────────────────────────
function calculateReward(session, progress) {
  let xp = 10; // Base XP for completing anything
  const elapsed = session.active_seconds || 0;
  const estimated = (session.estimated_minutes || 25) * 60;

  // Bonus for on-time or early completion
  if (estimated > 0 && elapsed <= estimated * 1.1) xp += 15;
  // Bonus for deep focus (no pauses)
  if (session.pause_count === 0 && elapsed > 300) xp += 10;
  // Bonus for streak continuation
  if (session.streak_continued) xp += 20;
  // Penalty for very rushed completion (<30s)
  if (elapsed < 30) xp = Math.max(5, xp - 10);

  // Achievement detection
  let achievement = null;
  const totalToday = progress?.tasks_done || 0;
  if (totalToday === 1) achievement = 'أول إنجاز اليوم! 🌅';
  else if (totalToday === 5) achievement = 'خمسة إنجازات! ⭐';
  else if (totalToday === 10) achievement = 'عشرة إنجازات! 🏆';
  else if (elapsed > 3600) achievement = 'ساعة تركيز كاملة! 🧠';
  else if (session.pause_count === 0 && elapsed > 1500) achievement = 'تركيز بلا توقف! 🔥';

  return { xp, achievement };
}

// ─── Adaptive Tone Engine — uses UserModel for message tone ──────────────────
// Reads procrastination_score, burnout_score, acceptance_rate, difficulty_level
// Returns tone-adapted messages: gentle (burnout/overwhelmed), direct (disciplined), encouraging (procrastinating)
async function getAdaptiveTone(userId) {
  const userModelSvc = getUserModelService();
  if (!userModelSvc) return { tone: 'encouraging', procrastination: 0.5, burnout: 0.3, discipline: 0.5 };
  try {
    const mods = await userModelSvc.getDecisionModifiers(userId);
    const behavior = mods._raw?.behavior_profile || {};
    const adapt = mods._raw?.adaptation_profile || {};
    const procrastination = behavior.procrastination_score || 0.5;
    const burnout = behavior.burnout_score || 0.3;
    const acceptRate = behavior.avg_decision_acceptance_rate || 50;
    const discipline = acceptRate > 70 ? 0.8 : acceptRate > 50 ? 0.5 : 0.3;
    const pushIntensity = adapt.push_intensity || 'moderate';

    let tone = 'encouraging'; // default
    if (burnout > 0.6) tone = 'gentle';             // burned out → soft
    else if (procrastination > 0.6) tone = 'encouraging'; // procrastinating → motivational
    else if (discipline > 0.7 && pushIntensity !== 'gentle') tone = 'direct'; // disciplined → concise

    return { tone, procrastination, burnout, discipline, pushIntensity };
  } catch (_e) {
    return { tone: 'encouraging', procrastination: 0.5, burnout: 0.3, discipline: 0.5 };
  }
}

// ─── Tone-adapted message generator ─────────────────────────────────────────
function toneMessage(tone, messages) {
  // messages = { gentle: '...', encouraging: '...', direct: '...' }
  return messages[tone] || messages.encouraging || messages.direct || '';
}

// ─── Generate lighter version of current action ─────────────────────────────
async function generateLighterAction(userId, currentAction, skipType, timezone) {
  const toneCtx = await getAdaptiveTone(userId);
  const models = getModels();
  const behaviorEngine = getBehaviorEngine();
  const { Op } = require('sequelize');

  // Strategy 1: If habit with behavior_spec → reduce to micro difficulty
  if (currentAction?.type === 'habit' && currentAction?.id && behaviorEngine) {
    try {
      const ctx = await behaviorEngine.getBehaviorContext(userId, currentAction.id);
      if (ctx) {
        const microMinutes = ctx.estimated_minutes ? Math.max(5, Math.round(ctx.estimated_minutes * 0.4)) : 5;
        return {
          type: 'habit',
          id: currentAction.id,
          title: currentAction.title,
          estimated_minutes: microMinutes,
          message: toneMessage(toneCtx.tone, {
            gentle: `${microMinutes} دقائق فقط كافية — لا تضغط على نفسك 💙`,
            encouraging: `جرّب ${microMinutes} دقائق بس — خطوة صغيرة أفضل من لا شيء! 💪`,
            direct: `${microMinutes} دقائق. ابدأ الآن.`,
          }),
          is_lighter: true,
          original_minutes: ctx.estimated_minutes,
          tone: toneCtx.tone,
        };
      }
    } catch (_e) { /* fallback below */ }
  }

  // Strategy 2: If task → find a shorter/easier alternative
  if (models.Task && currentAction?.type === 'task') {
    try {
      const alternatives = await models.Task.findAll({
        where: {
          user_id: userId,
          status: { [Op.in]: ['pending', 'in_progress'] },
          id: { [Op.ne]: currentAction.id || '' },
        },
        attributes: ['id', 'title', 'estimated_duration', 'priority', 'category'],
        order: [['estimated_duration', 'ASC']],
        limit: 5,
        raw: true,
      });

      // Pick the shortest task that isn't the current one
      const lighter = alternatives.find(t =>
        (t.estimated_duration || 30) < (currentAction.estimated_minutes || 30)
      ) || alternatives[0];

      if (lighter) {
        const mins = lighter.estimated_duration || 10;
        return {
          type: 'task',
          id: lighter.id,
          title: lighter.title,
          estimated_minutes: mins,
          message: toneMessage(toneCtx.tone, {
            gentle: `مهمة أخف — ${mins} دقائق فقط. لا بأس بالتدرج 💙`,
            encouraging: `جرّب "${lighter.title}" — أقصر وأسهل! ${mins} دقائق 💪`,
            direct: `"${lighter.title}" — ${mins} دقائق. ابدأ.`,
          }),
          is_lighter: true,
          original_id: currentAction.id,
          tone: toneCtx.tone,
          priority: lighter.priority,
          category: lighter.category,
        };
      }
    } catch (_e) { /* fallback below */ }
  }

  // Strategy 3: Reduce current task duration
  const reducedMinutes = Math.max(5, Math.round((currentAction?.estimated_minutes || 25) * 0.4));
  return {
    type: currentAction?.type || 'task',
    id: currentAction?.id || null,
    title: currentAction?.title || 'مهمة مصغّرة',
    estimated_minutes: reducedMinutes,
    message: toneMessage(toneCtx.tone, {
      gentle: `${reducedMinutes} دقائق فقط — أي جهد أفضل من لا شيء 💙`,
      encouraging: `جرّب ${reducedMinutes} دقائق بس! البداية الصغيرة هي المفتاح 🔑`,
      direct: `${reducedMinutes} دقائق. ابدأ الآن.`,
    }),
    is_lighter: true,
    original_minutes: currentAction?.estimated_minutes,
    tone: toneCtx.tone,
  };
}

// ─── Generate re-engagement prompt after abandon/exit ───────────────────────
async function generateReEngagement(userId, abandonedSession) {
  const toneCtx = await getAdaptiveTone(userId);
  const activeSeconds = abandonedSession?.active_seconds || 0;
  const activeMinutes = Math.round(activeSeconds / 60);
  const title = abandonedSession?.target_title || 'المهمة';

  // Already worked for some time → offer to continue for just 5 more minutes
  if (activeMinutes >= 2) {
    return {
      type: 're_engage',
      prompt: toneMessage(toneCtx.tone, {
        gentle: `عملت ${activeMinutes} دقائق — ممتاز! أكمل 5 دقائق بس؟ 💙`,
        encouraging: `${activeMinutes} دقائق في الجيب! 5 دقائق إضافية وتخلص 💪`,
        direct: `${activeMinutes} د تم. أكمل 5 د.`,
      }),
      suggested_minutes: 5,
      target_type: abandonedSession?.target_type,
      target_id: abandonedSession?.target_id,
      target_title: title,
      tone: toneCtx.tone,
    };
  }

  // Barely started → suggest a micro version
  return {
    type: 're_engage',
    prompt: toneMessage(toneCtx.tone, {
      gentle: `لم تبدأ بعد — جرّب 3 دقائق فقط. بداية صغيرة 💙`,
      encouraging: `فقط 3 دقائق! جرّب وشوف — الأصعب هو البداية 🚀`,
      direct: `3 دقائق. ابدأ الآن.`,
    }),
    suggested_minutes: 3,
    target_type: abandonedSession?.target_type,
    target_id: abandonedSession?.target_id,
    target_title: title,
    tone: toneCtx.tone,
  };
}

// ─── Generate time-slot suggestion for delay ────────────────────────────────
function suggestTimeSlot(timezone) {
  const nowTz = moment().tz(timezone);
  const hour = nowTz.hour();
  const min = nowTz.minute();

  // Round up to next half-hour or hour
  let suggestedHour, suggestedMin;
  if (min < 25) {
    suggestedHour = hour;
    suggestedMin = 30;
  } else if (min < 55) {
    suggestedHour = hour + 1;
    suggestedMin = 0;
  } else {
    suggestedHour = hour + 1;
    suggestedMin = 30;
  }

  // Don't suggest after 23:00
  if (suggestedHour >= 23) {
    return { time: 'غداً صباحاً ☀️', hour: 9, min: 0, is_tomorrow: true };
  }

  const timeStr = `${String(suggestedHour).padStart(2, '0')}:${String(suggestedMin).padStart(2, '0')}`;
  return { time: timeStr, hour: suggestedHour, min: suggestedMin, is_tomorrow: false };
}

// ─── Nudge generator based on elapsed time and state ────────────────────────
function generateNudge(session, signals) {
  const elapsedMin = Math.round((session.active_seconds || 0) / 60);
  const nudgesSent = session.nudges_sent || [];
  const lastNudgeAt = nudgesSent.length > 0 ? nudgesSent[nudgesSent.length - 1].at_minutes : 0;

  // Find next nudge interval
  const nextNudgeAt = NUDGE_INTERVALS_MIN.find(n => n > lastNudgeAt);
  if (!nextNudgeAt || elapsedMin < nextNudgeAt) return null;

  const burnout = signals?.burnout_risk?.value || 0;
  const energy = signals?.energy_level?.value || 55;

  // Adaptive nudge based on context
  if (burnout > 0.7) {
    return { type: 'break_warning', message: 'يبدو أنك تعمل بكثافة — فكّر في استراحة قصيرة 💆', urgency: 'high' };
  }
  if (elapsedMin >= 45 && energy < 40) {
    return { type: 'energy_low', message: 'طاقتك قد تكون منخفضة — خذ 5 دقائق ثم أكمل 🔋', urgency: 'medium' };
  }
  if (elapsedMin >= 25 && elapsedMin < 30) {
    return { type: 'pomodoro', message: 'مرّت 25 دقيقة — هل تحتاج استراحة بومودورو؟ 🍅', urgency: 'low' };
  }
  if (elapsedMin >= 15) {
    return { type: 'encouragement', message: 'عمل رائع! استمر — أنت تتقدم 💪', urgency: 'low' };
  }
  return { type: 'progress', message: 'ممتاز — واصل التركيز 🎯', urgency: 'low' };
}

// ─── Helper: Build next_action from decision services ───────────────────────
async function buildNextAction(userId, timezone) {
  const models = getModels();
  const { Op } = require('sequelize');
  const nowTz = moment().tz(timezone);
  const todayStr = nowTz.format('YYYY-MM-DD');
  const currentHourMinute = nowTz.format('HH:mm');

  const [decisionResult, progressResult, intelligenceResult] = await Promise.allSettled([
    (async () => {
      const svc = getUnifiedDecision();
      if (!svc) {
        const naSvc = getNextAction();
        if (naSvc) return { fallback: true, data: await naSvc.getNextBestAction(userId, { timezone }) };
        return null;
      }
      return { fallback: false, data: await svc.getUnifiedDecision(userId, { timezone }) };
    })(),
    (async () => {
      if (!models.Task) return null;
      const [tasks, habits, habitLogs] = await Promise.all([
        models.Task.findAll({
          where: { user_id: userId, due_date: todayStr },
          attributes: ['id', 'title', 'status', 'priority', 'due_time', 'start_time', 'category'],
          raw: true,
        }).catch(() => []),
        models.Habit ? models.Habit.findAll({
          where: { user_id: userId, is_active: true },
          attributes: ['id', 'name', 'name_ar', 'current_streak', 'target_time', 'preferred_time'],
          raw: true,
        }).catch(() => []) : [],
        models.HabitLog ? models.HabitLog.findAll({
          where: { user_id: userId, log_date: todayStr, completed: true },
          attributes: ['habit_id'],
          raw: true,
        }).catch(() => []) : [],
      ]);
      const tasksDone = tasks.filter(t => t.status === 'completed').length;
      const doneHabitIds = new Set(habitLogs.map(l => l.habit_id));
      const habitsDone = habits.filter(h => doneHabitIds.has(h.id)).length;
      let streakAtRisk = null;
      for (const h of habits) {
        if ((h.current_streak || 0) >= 3 && !doneHabitIds.has(h.id)) {
          streakAtRisk = h.name_ar || h.name;
          break;
        }
      }
      const totalItems = tasks.length + habits.length;
      const doneItems = tasksDone + habitsDone;
      return {
        tasks_done: tasksDone, tasks_total: tasks.length,
        habits_done: habitsDone, habits_total: habits.length,
        completion_pct: totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0,
        streak_at_risk: streakAtRisk,
        // Time-aware: include today's pending tasks with their scheduled times
        today_pending_tasks: tasks.filter(t => t.status !== 'completed'),
        today_habits: habits,
        done_habit_ids: [...doneHabitIds],
      };
    })(),
    (async () => {
      const intel = getIntelligence();
      if (!intel) return null;
      return await intel.getIntelligenceSignals(userId, { timezone });
    })(),
  ]);

  const decision = decisionResult.status === 'fulfilled' ? decisionResult.value : null;
  const progress = progressResult.status === 'fulfilled' ? progressResult.value : null;
  const signals = intelligenceResult.status === 'fulfilled' ? intelligenceResult.value : null;

  let next_action = null;
  let reasoning = [];
  let confidence = 60;
  let alternatives = [];
  let goal_context = null;
  let behavior_context = null;

  if (decision && !decision.fallback && decision.data) {
    const d = decision.data;
    const focus = d.currentFocus || {};
    next_action = {
      type: focus.type || 'task',
      id: focus.id || null,
      title: focus.title || 'راجع خطتك',
      message: focus.message || d.why?.join(' — ') || '',
      cta_label: getCTALabel(focus.action || focus.type),
      cta_action: getCTAAction(focus.action || focus.type),
      priority: focus.priority || 'medium',
      category: focus.category || null,
      estimated_minutes: focus.estimated_duration || null,
      due_time: focus.due_time || null,
      next_steps: focus.next_steps || [],
      is_deep_work: focus.is_deep_work || false,
      is_quick_task: focus.is_quick_task || false,
    };
    // Extract goal and behavior context from decision
    goal_context = focus.goal_context || null;
    if (focus.behavior_meta) {
      behavior_context = {
        current_difficulty: focus.behavior_meta.current_difficulty,
        estimated_minutes: focus.behavior_meta.estimated_minutes,
        is_breaking_habit: focus.behavior_meta.is_breaking_habit,
        reward: focus.behavior_meta.reward,
      };
    }
    reasoning = d.why || [];
    confidence = d.confidence || 60;
    alternatives = (d.alternatives || []).slice(0, 5).map(a => ({
      type: a.type || 'task',
      id: a.id,
      title: a.title,
      score: a.score,
      priority: a.priority,
      category: a.category || null,
      estimated_minutes: a.estimated_duration,
      message: a.message || '',
    }));
  } else if (decision && decision.fallback && decision.data) {
    const na = decision.data;
    next_action = {
      type: na.habit_id ? 'habit' : na.action === 'take_break' ? 'break' : na.action === 'log_mood' ? 'mood' : 'task',
      id: na.task_id || na.habit_id || null,
      title: na.title || 'راجع خطتك',
      message: na.message || '',
      cta_label: getCTALabel(na.action),
      cta_action: getCTAAction(na.action),
      priority: na.priority || 'medium',
      category: na.category || null,
      estimated_minutes: null,
      due_time: null,
      next_steps: na.suggestions || [],
      is_deep_work: false,
      is_quick_task: false,
    };
    reasoning = Array.isArray(na.reason) ? na.reason : na.explanation ? [na.explanation] : [];
    confidence = na.confidence || 60;
  } else {
    next_action = {
      type: 'task', id: null,
      title: '📋 راجع خطتك',
      message: 'تحقق من مهامك وعاداتك وابدأ بالأهم.',
      cta_label: 'افتح المهام', cta_action: 'navigate',
      priority: 'medium', category: null,
      estimated_minutes: null, due_time: null,
      next_steps: ['افتح قائمة المهام', 'اختر أول مهمة وابدأ'],
      is_deep_work: false, is_quick_task: false,
    };
    reasoning = ['⚠️ تعذّر تحميل التوصيات — ابدأ بأهم مهمة'];
    confidence = 40;
  }

  // ═══ REALITY-AWARE DECISION LAYER ═══════════════════════════════════════
  // Applies time-of-day, day boundary, burnout, and "nothing to do" logic
  // BEFORE returning the next action to the frontend.
  // ════════════════════════════════════════════════════════════════════════

  const currentHour = nowTz.hours();
  const isLateNight = currentHour >= 23 || currentHour < 5;
  const isEvening = currentHour >= 20 && currentHour < 23;
  const isMorning = currentHour >= 5 && currentHour < 12;
  const isAfternoon = currentHour >= 12 && currentHour < 17;
  const allDayDone = progress && progress.tasks_total > 0 && progress.completion_pct >= 100;
  const burnoutRisk = signals?.burnout_risk?.value || 0;
  const highBurnout = burnoutRisk >= 0.6;

  // 1. DAY BOUNDARY: All tasks done OR late night → don't suggest execution
  if (allDayDone || (isLateNight && next_action?.id)) {
    const dayEndMessages = [
      { title: 'يوم منجز!', message: 'أكملت كل مهامك — استرح أو خطط للغد.', emoji: '🎉' },
      { title: 'وقت الراحة', message: 'الساعة متأخرة — الراحة جزء من الإنتاجية.', emoji: '🌙' },
      { title: 'أحسنت اليوم!', message: 'راجع إنجازاتك واستعد لغد أفضل.', emoji: '⭐' },
    ];
    const msg = allDayDone ? dayEndMessages[0] : dayEndMessages[1];
    
    if (isLateNight) {
      next_action = {
        type: 'rest', id: null,
        title: `${msg.emoji} ${msg.title}`,
        message: msg.message,
        cta_label: 'خطط للغد', cta_action: 'navigate',
        priority: 'low', category: null,
        estimated_minutes: null, due_time: null,
        next_steps: ['راجع مزاجك', 'خطط لمهام الغد'],
        is_deep_work: false, is_quick_task: false,
        _reality_override: true,
        _reality_reason: isLateNight ? 'late_night' : 'day_complete',
      };
      reasoning = [isLateNight ? '🌙 الساعة متأخرة — لا ننصح بالتنفيذ الآن' : '🎉 أكملت كل مهام اليوم!'];
      confidence = 95;
    }
  }

  // 2. TIME-OF-DAY FILTERING: Tag action suitability
  if (next_action?.id && !next_action._reality_override) {
    const isHeavyTask = next_action.is_deep_work || next_action.priority === 'urgent' || 
                        (next_action.estimated_minutes && next_action.estimated_minutes > 45);
    
    if (isEvening && isHeavyTask) {
      // Evening: prefer light tasks, warn about heavy ones
      reasoning.unshift('🌆 مساءً — مهمة ثقيلة. يمكنك البدء أو تأجيلها للصباح.');
      next_action._time_warning = 'heavy_evening';
    }
    
    if (isLateNight) {
      // Late night: only reflection/planning
      reasoning.unshift('🌙 وقت متأخر — فقط تأمل وتخطيط.');
      next_action._time_warning = 'late_night_override';
    }
  }

  // 3. HIGH BURNOUT: Suggest rest
  if (highBurnout && next_action?.id && !next_action._reality_override) {
    reasoning.unshift('🔥 مستوى الإرهاق مرتفع — خذ استراحة أو اختر مهمة خفيفة.');
    if (burnoutRisk >= 0.8) {
      next_action = {
        type: 'break', id: null,
        title: '🧘 خذ استراحة — طاقتك منخفضة',
        message: 'جسمك يحتاج راحة. الإنتاجية الحقيقية تبدأ من الاستراحة.',
        cta_label: 'استرح', cta_action: 'navigate',
        priority: 'low', category: null,
        estimated_minutes: 15, due_time: null,
        next_steps: ['تنفّس بعمق', 'قم بنزهة قصيرة', 'اشرب ماء'],
        is_deep_work: false, is_quick_task: false,
        _reality_override: true,
        _reality_reason: 'high_burnout',
      };
      reasoning = ['🔥 مستوى الإرهاق مرتفع جداً — الراحة أولوية'];
      confidence = 90;
    }
  }

  // 4. NOTHING TO DO STATE: Contextual "empty" messages
  if (!next_action?.id && !next_action?._reality_override) {
    let emptyMsg;
    if (isLateNight) {
      emptyMsg = { title: '🌙 وقت النوم', message: 'لا مهام الآن. نم جيداً واستعد لغد مميز.' };
    } else if (allDayDone) {
      emptyMsg = { title: '🎉 يوم منجز!', message: 'أكملت كل شيء. استمتع بوقتك.' };
    } else if (highBurnout) {
      emptyMsg = { title: '🧘 استرح', message: 'طاقتك منخفضة. الراحة إنتاجية أيضاً.' };
    } else {
      emptyMsg = { title: '📋 يومك فاضي', message: 'أضف مهام لتبدأ يومك.' };
    }
    if (emptyMsg && !next_action?.title) {
      next_action = {
        ...next_action,
        title: emptyMsg.title,
        message: emptyMsg.message,
      };
    }
  }

  // ═══ TIME-AWARE TASK SCHEDULING LAYER ═══════════════════════════════════
  // Don't suggest tasks before their scheduled time.
  // Show remaining time for approaching tasks.
  // Suggest preparation or suitable habits for tasks not yet due.
  // ═══════════════════════════════════════════════════════════════════════
  if (next_action?.id && next_action?.type === 'task' && !next_action._reality_override) {
    const taskDueTime = next_action.due_time;
    if (taskDueTime) {
      const nowMinutes = nowTz.hours() * 60 + nowTz.minutes();
      const dueParts = taskDueTime.split(':').map(Number);
      const dueMinutes = (dueParts[0] || 0) * 60 + (dueParts[1] || 0);
      const diffMinutes = dueMinutes - nowMinutes;

      if (diffMinutes > 60) {
        // Task is more than 1 hour away — don't push it, suggest preparation
        const hoursLeft = Math.floor(diffMinutes / 60);
        const minsLeft = diffMinutes % 60;
        const timeLabel = hoursLeft > 0
          ? `${hoursLeft} ساعة${minsLeft > 0 ? ` و${minsLeft} دقيقة` : ''}`
          : `${minsLeft} دقيقة`;

        reasoning.unshift(`⏳ موعد "${next_action.title}" بعد ${timeLabel} (${taskDueTime}) — استعد أو اعمل شيء آخر`);
        next_action._time_remaining = timeLabel;
        next_action._time_remaining_minutes = diffMinutes;
        next_action._not_due_yet = true;

        // Try to find a task that IS due now or has no specific time
        if (progress?.today_pending_tasks) {
          const pendingNow = progress.today_pending_tasks.find(t => {
            if (t.id === next_action.id) return false;
            if (t.status === 'completed') return false;
            const tTime = t.due_time || t.start_time;
            if (!tTime) return true; // No time = can be done anytime
            const tParts = String(tTime).split(':').map(Number);
            const tMins = (tParts[0] || 0) * 60 + (tParts[1] || 0);
            return (tMins - nowMinutes) <= 30; // Due within 30 min
          });
          if (pendingNow) {
            // Switch to a task that's actually due now
            alternatives.unshift({
              type: 'task', id: next_action.id, title: next_action.title,
              score: confidence, priority: next_action.priority,
              estimated_minutes: next_action.estimated_minutes,
              message: `⏳ موعدها ${taskDueTime} — متبقي ${timeLabel}`,
            });
            next_action = {
              ...next_action,
              id: pendingNow.id,
              title: pendingNow.title,
              priority: pendingNow.priority,
              category: pendingNow.category,
              due_time: pendingNow.due_time,
              _not_due_yet: false,
            };
            reasoning.unshift(`✅ "${pendingNow.title}" يناسب الوقت الحالي`);
          } else {
            // No task due now — suggest a habit or preparation
            const undoneHabits = (progress.today_habits || []).filter(
              h => !(progress.done_habit_ids || []).includes(h.id)
            );
            const suitableHabit = undoneHabits.find(h => {
              const ht = h.target_time || h.preferred_time;
              if (!ht) return true;
              const hParts = String(ht).split(':').map(Number);
              const hMins = (hParts[0] || 0) * 60 + (hParts[1] || 0);
              return Math.abs(hMins - nowMinutes) <= 60;
            });
            if (suitableHabit) {
              reasoning.unshift(`🎯 جرّب تسجيل عادة "${suitableHabit.name_ar || suitableHabit.name}" بينما تنتظر`);
            } else {
              reasoning.unshift(`💡 استعد للمهمة القادمة أو خذ استراحة`);
            }
          }
        }
      } else if (diffMinutes > 0 && diffMinutes <= 60) {
        // Task is approaching (within 1 hour) — show remaining time and suggest starting
        const minsLeft = diffMinutes;
        next_action._time_remaining = `${minsLeft} دقيقة`;
        next_action._time_remaining_minutes = minsLeft;
        reasoning.unshift(`⏰ موعد "${next_action.title}" قريب — متبقي ${minsLeft} دقيقة`);
      } else if (diffMinutes < -60) {
        // Task is overdue by more than an hour
        reasoning.unshift(`🔴 "${next_action.title}" متأخرة — كان موعدها ${taskDueTime}`);
        next_action._is_overdue = true;
      }
    }
  }
  // ═══ END TIME-AWARE LAYER ═══════════════════════════════════════════════

  // Determine mode
  const energyLevel = signals?.energy_level?.value || 55;
  // burnoutRisk already declared in Reality-Aware Layer above
  const momentum = signals?.momentum_state?.value || 'starting';

  let mode = 'focus';
  if (burnoutRisk >= 0.65 || energyLevel < 30) mode = 'recovery';
  else if (momentum === 'productive' && energyLevel >= 65) mode = 'momentum';
  else if (momentum === 'avoidance' || momentum === 'starting') mode = 'warmup';

  const energy = {
    level: energyLevel >= 70 ? 'high' : energyLevel >= 45 ? 'medium' : 'low',
    score: Math.round(energyLevel),
    label: energyLevel >= 70 ? 'طاقة عالية ⚡' : energyLevel >= 45 ? 'طاقة متوسطة 💪' : 'طاقة منخفضة 😴',
  };

  return { next_action, reasoning, confidence, mode, alternatives, progress, energy, signals, goal_context, behavior_context };
}

// ─── Helper: Load active session from DB ────────────────────────────────────
async function getActiveSession(userId) {
  const Session = getSessionModel();
  if (!Session) return null;
  try {
    const session = await Session.findOne({
      where: { user_id: userId, state: ['active', 'paused'] },
      order: [['started_at', 'DESC']],
    });
    if (!session) return null;

    // Auto-abandon if timed out
    const elapsed = Date.now() - new Date(session.started_at).getTime();
    if (elapsed > SESSION_TIMEOUT_MS) {
      await session.update({ state: 'abandoned', completed_at: new Date() });
      return null;
    }

    // Compute live active_seconds for active sessions
    if (session.state === 'active') {
      const lastResumeOrStart = session.resumed_at || session.started_at;
      const liveExtra = Math.round((Date.now() - new Date(lastResumeOrStart).getTime()) / 1000);
      session.dataValues._live_active_seconds = session.active_seconds + liveExtra;
    } else {
      session.dataValues._live_active_seconds = session.active_seconds;
    }

    return session;
  } catch (e) {
    logger.debug('[ENGINE] getActiveSession error:', e.message);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// GET /engine/today — Main state endpoint
// Returns active session (if any) OR next suggested action
// ═════════════════════════════════════════════════════════════════════════════
router.get('/today', async (req, res) => {
  const userId = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';
  const startMs = Date.now();

  try {
    // Check for active session first
    const activeSession = await getActiveSession(userId);

    // Build next action data
    const { next_action, reasoning, confidence, mode, alternatives, progress, energy, signals, goal_context, behavior_context } = 
      await buildNextAction(userId, timezone);

    // If there's an active session, generate adaptation/nudge
    let sessionData = null;
    let nudge = null;
    if (activeSession) {
      const liveSeconds = activeSession.dataValues._live_active_seconds || activeSession.active_seconds;
      sessionData = {
        id: activeSession.id,
        target_type: activeSession.target_type,
        target_id: activeSession.target_id,
        title: activeSession.target_title,
        state: activeSession.state,
        started_at: activeSession.started_at,
        active_seconds: liveSeconds,
        elapsed_minutes: Math.round(liveSeconds / 60),
        pause_count: activeSession.pause_count,
        estimated_minutes: activeSession.estimated_minutes,
        mode_at_start: activeSession.mode_at_start,
        energy_at_start: activeSession.energy_at_start,
        nudges_count: (activeSession.nudges_sent || []).length,
      };

      // Generate nudge if applicable
      nudge = generateNudge({ ...activeSession.dataValues, active_seconds: liveSeconds }, signals);
    }

    // Part C: Rapid Adaptation — attach behavior fingerprint + adaptive recommendation
    let adaptive = null;
    try {
      const learning = getLearning();
      if (learning?.getAdaptiveRecommendation) {
        adaptive = learning.getAdaptiveRecommendation(userId, {
          energy: energy?.score || 55,
          mood: signals?.mood?.value || 5,
          hour: new Date().getHours(),
          overdueCount: progress?.overdue_count || 0,
        });
      }
    } catch (_e) { /* non-critical */ }

    const computeMs = Date.now() - startMs;
    logger.info(`[ENGINE] /today user=${userId} session=${activeSession ? 'active' : 'none'} action=${next_action.type}/${next_action.title?.slice(0, 20)} mode=${mode} [${computeMs}ms]`);

    res.json({
      success: true,
      data: {
        next_action,
        reasoning,
        confidence,
        mode,
        alternatives,
        progress: progress || {
          tasks_done: 0, tasks_total: 0,
          habits_done: 0, habits_total: 0,
          completion_pct: 0, streak_at_risk: null,
        },
        energy,
        active_session: sessionData,
        nudge,
        goal_context,
        behavior_context,
        adaptive, // Rapid Adaptation Layer data
        generated_at: new Date().toISOString(),
        _meta: { computation_ms: computeMs },
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /today error:', String(err.message).slice(0, 300));
    res.json({
      success: true,
      data: {
        next_action: {
          type: 'task', id: null,
          title: '📋 راجع خطتك',
          message: 'تحقق من مهامك وابدأ بالأهم',
          cta_label: 'افتح المهام', cta_action: 'navigate',
          priority: 'medium', category: null,
          estimated_minutes: null, due_time: null,
          next_steps: ['افتح قائمة المهام', 'اختر أول مهمة وابدأ'],
          is_deep_work: false, is_quick_task: false,
        },
        reasoning: ['⚠️ خطأ مؤقت في محرك التنفيذ'],
        confidence: 30, mode: 'warmup',
        alternatives: [],
        progress: { tasks_done: 0, tasks_total: 0, habits_done: 0, habits_total: 0, completion_pct: 0, streak_at_risk: null },
        energy: { level: 'medium', score: 50, label: 'طاقة متوسطة 💪' },
        active_session: null,
        nudge: null,
        generated_at: new Date().toISOString(),
      },
    });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /engine/start — Begin execution (Start phase)
// Creates a persistent session: idle → active
// ═════════════════════════════════════════════════════════════════════════════
router.post('/start', async (req, res) => {
  const userId = req.user.id;
  const { target_type, target_id, title, estimated_minutes, mode, energy_score, confidence } = req.body;

  try {
    const Session = getSessionModel();

    // Abandon any existing active session
    if (Session) {
      await Session.update(
        { state: 'abandoned', completed_at: new Date() },
        { where: { user_id: userId, state: ['active', 'paused'] } }
      );
    }

    // Create new session
    let session = null;
    if (Session) {
      session = await Session.create({
        user_id: userId,
        target_type: target_type || 'task',
        target_id: target_id || null,
        target_title: title || 'مهمة',
        state: 'active',
        started_at: new Date(),
        estimated_minutes: estimated_minutes || null,
        mode_at_start: mode || 'focus',
        energy_at_start: energy_score || null,
        confidence_at_start: confidence || null,
      });
    }

    // Record in learning engine
    const learning = getLearning();
    if (learning) {
      learning.recordOutcome(userId, {
        action: 'execution_started',
        success: true,
        task_id: target_id,
        action_type: target_type,
      });
    }

    // Record in UserModel
    const userModelSvc = getUserModelService();
    if (userModelSvc) {
      userModelSvc.onDecisionFeedback(userId, {
        action: target_type === 'habit' ? 'check_habit' : 'start_task',
        response: 'accepted',
        task_id: target_id,
        time_to_start_ms: req.body.time_to_start_ms || null,
      }).catch(() => {});
    }

    // Trigger execution engine event
    const execEngine = getExecutionEngine();
    if (execEngine) {
      execEngine.onEvent(userId, 'execution_started', { task_id: target_id, title }).catch(() => {});
    }

    logger.info(`[ENGINE] /start user=${userId} session=${session?.id} type=${target_type} target=${target_id}`);

    res.json({
      success: true,
      data: {
        session_id: session?.id || null,
        state: 'active',
        started_at: session?.started_at || new Date().toISOString(),
        message: 'بدأ التنفيذ — بالتوفيق! 🚀',
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /start error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /engine/pulse — Mid-session heartbeat (Track + Adapt phase)
// Client sends every 30-60s during active execution
// Returns nudges, adaptations, and updated stats
// ═════════════════════════════════════════════════════════════════════════════
router.post('/pulse', async (req, res) => {
  const userId = req.user.id;
  const { session_id } = req.body;

  try {
    const activeSession = await getActiveSession(userId);
    if (!activeSession) {
      return res.json({ success: true, data: { active: false, message: 'لا توجد جلسة نشطة' } });
    }

    const timezone = req.user.timezone || 'Africa/Cairo';
    const signals = await (async () => {
      const intel = getIntelligence();
      if (!intel) return null;
      return await intel.getIntelligenceSignals(userId, { timezone });
    })();

    const liveSeconds = activeSession.dataValues._live_active_seconds || activeSession.active_seconds;
    const nudge = generateNudge({ ...activeSession.dataValues, active_seconds: liveSeconds }, signals);

    // Store nudge if generated
    if (nudge) {
      const nudges = activeSession.nudges_sent || [];
      nudges.push({ ...nudge, at_minutes: Math.round(liveSeconds / 60), sent_at: new Date().toISOString() });
      await activeSession.update({ nudges_sent: nudges });
    }

    // Detect adaptation needs
    let adaptation = null;
    const burnout = signals?.burnout_risk?.value || 0;
    const energyNow = signals?.energy_level?.value || 55;
    const energyStart = activeSession.energy_at_start || 55;

    if (burnout > 0.75 && liveSeconds > 1800) {
      adaptation = { type: 'suggest_break', reason: 'خطر الإرهاق مرتفع', urgency: 'high' };
    } else if (energyNow < energyStart - 25 && liveSeconds > 900) {
      adaptation = { type: 'energy_drop', reason: 'انخفاض ملحوظ في الطاقة', urgency: 'medium' };
    } else if (liveSeconds > (activeSession.estimated_minutes || 25) * 60 * 1.5) {
      adaptation = { type: 'overtime', reason: 'تجاوزت الوقت المقدّر — هل تحتاج مساعدة؟', urgency: 'medium' };
    }

    if (adaptation) {
      const adaptations = activeSession.adaptations || [];
      adaptations.push({ ...adaptation, at: new Date().toISOString() });
      await activeSession.update({ adaptations });
    }

    res.json({
      success: true,
      data: {
        active: true,
        session_id: activeSession.id,
        state: activeSession.state,
        active_seconds: liveSeconds,
        elapsed_minutes: Math.round(liveSeconds / 60),
        nudge,
        adaptation,
        energy_now: Math.round(energyNow),
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /pulse error:', err.message);
    res.json({ success: true, data: { active: false, nudge: null, adaptation: null } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /engine/pause — Pause session (active → paused)
// ═════════════════════════════════════════════════════════════════════════════
router.post('/pause', async (req, res) => {
  const userId = req.user.id;

  try {
    const activeSession = await getActiveSession(userId);
    if (!activeSession || activeSession.state !== 'active') {
      return res.json({ success: true, data: { paused: false, message: 'لا توجد جلسة نشطة' } });
    }

    // Accumulate active time before pausing
    const lastResumeOrStart = activeSession.resumed_at || activeSession.started_at;
    const segmentSeconds = Math.round((Date.now() - new Date(lastResumeOrStart).getTime()) / 1000);
    const totalActive = activeSession.active_seconds + segmentSeconds;

    await activeSession.update({
      state: 'paused',
      paused_at: new Date(),
      active_seconds: totalActive,
      pause_count: activeSession.pause_count + 1,
    });

    logger.info(`[ENGINE] /pause user=${userId} session=${activeSession.id} active=${totalActive}s pauses=${activeSession.pause_count + 1}`);

    res.json({
      success: true,
      data: {
        paused: true,
        session_id: activeSession.id,
        active_seconds: totalActive,
        pause_count: activeSession.pause_count + 1,
        message: 'تم الإيقاف مؤقتاً — يمكنك الاستئناف في أي وقت ⏸️',
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /pause error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /engine/resume — Resume session (paused → active)
// ═════════════════════════════════════════════════════════════════════════════
router.post('/resume', async (req, res) => {
  const userId = req.user.id;

  try {
    const Session = getSessionModel();
    if (!Session) return res.json({ success: true, data: { resumed: false } });

    const session = await Session.findOne({
      where: { user_id: userId, state: 'paused' },
      order: [['started_at', 'DESC']],
    });

    if (!session) {
      return res.json({ success: true, data: { resumed: false, message: 'لا توجد جلسة متوقفة' } });
    }

    await session.update({ state: 'active', resumed_at: new Date() });

    logger.info(`[ENGINE] /resume user=${userId} session=${session.id}`);

    res.json({
      success: true,
      data: {
        resumed: true,
        session_id: session.id,
        active_seconds: session.active_seconds,
        message: 'تم الاستئناف — واصل التركيز! ▶️',
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /resume error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /engine/complete — Finish execution (Reward + Learn + Next)
// This is where the magic happens: reward → record → learn → suggest next
// ═════════════════════════════════════════════════════════════════════════════
router.post('/complete', async (req, res) => {
  const userId = req.user.id;
  const { satisfaction, reflection, completion_quality } = req.body;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    const activeSession = await getActiveSession(userId);
    const models = getModels();
    let finalActiveSeconds = 0;

    if (activeSession) {
      // Calculate final active time
      if (activeSession.state === 'active') {
        const lastResumeOrStart = activeSession.resumed_at || activeSession.started_at;
        const segmentSeconds = Math.round((Date.now() - new Date(lastResumeOrStart).getTime()) / 1000);
        finalActiveSeconds = activeSession.active_seconds + segmentSeconds;
      } else {
        finalActiveSeconds = activeSession.active_seconds;
      }

      // ── REWARD Phase ──────────────────────────────────────────────────
      // Build progress for reward calculation
      const todayStr = moment().tz(timezone).format('YYYY-MM-DD');
      let todayProgress = null;
      if (models.Task) {
        const tasks = await models.Task.findAll({
          where: { user_id: userId, due_date: todayStr },
          attributes: ['status'],
          raw: true,
        }).catch(() => []);
        todayProgress = { tasks_done: tasks.filter(t => t.status === 'completed').length + 1 };
      }

      const reward = calculateReward(activeSession, todayProgress);

      // Check streak continuation
      let streakContinued = false;
      if (activeSession.target_type === 'habit' && activeSession.target_id && models.Habit) {
        const habit = await models.Habit.findByPk(activeSession.target_id, { attributes: ['current_streak'], raw: true }).catch(() => null);
        if (habit && (habit.current_streak || 0) >= 2) streakContinued = true;
      }

      // Update session to completed with reward data
      await activeSession.update({
        state: 'completed',
        completed_at: new Date(),
        active_seconds: finalActiveSeconds,
        satisfaction: satisfaction || null,
        reflection: reflection || null,
        completion_quality: completion_quality || 'full',
        reward_xp: reward.xp,
        streak_continued: streakContinued,
        achievement: reward.achievement,
      });

      // ── Complete the underlying task/habit ─────────────────────────────
      if (activeSession.target_type === 'task' && activeSession.target_id && models.Task) {
        await models.Task.update(
          { status: 'completed', completed_at: new Date() },
          { where: { id: activeSession.target_id, user_id: userId } }
        );
      }
      if (activeSession.target_type === 'habit' && activeSession.target_id && models.HabitLog) {
        const todayStr2 = moment().tz(timezone).format('YYYY-MM-DD');
        await models.HabitLog.findOrCreate({
          where: { habit_id: activeSession.target_id, user_id: userId, log_date: todayStr2 },
          defaults: { completed: true, value: 1 },
        });
      }

      // ── LEARN Phase ───────────────────────────────────────────────────
      const learning = getLearning();
      if (learning) {
        learning.recordOutcome(userId, {
          action: 'execution_completed',
          success: true,
          task_id: activeSession.target_id,
          duration_minutes: Math.round(finalActiveSeconds / 60),
          satisfaction,
          completion_quality: completion_quality || 'full',
          mode: activeSession.mode_at_start,
        });
      }

      const userModelSvc = getUserModelService();
      if (userModelSvc) {
        userModelSvc.onTaskCompleted(userId, {
          id: activeSession.target_id,
          actual_minutes: Math.round(finalActiveSeconds / 60),
          estimated_minutes: activeSession.estimated_minutes,
          satisfaction,
        }).catch(() => {});
      }

      // Trigger execution engine event
      const execEngine = getExecutionEngine();
      if (execEngine) {
        execEngine.onEvent(userId, 'task_completed', {
          task_id: activeSession.target_id,
          taskTitle: activeSession.target_title,
        }).catch(() => {});
      }

      // ── BEHAVIOR ADAPTATION Phase — adjust difficulty + update goal progress
      const behaviorEngine = getBehaviorEngine();
      const goalEngine = getGoalEngine();
      let behaviorAdaptation = null;

      if (activeSession.target_type === 'habit' && activeSession.target_id) {
        if (behaviorEngine) {
          behaviorAdaptation = await behaviorEngine.adaptDifficulty(userId, activeSession.target_id).catch(() => null);
        }
        // Update linked goal progress
        if (goalEngine && models.Habit) {
          const habit = await models.Habit.findByPk(activeSession.target_id, { attributes: ['goal_id'], raw: true }).catch(() => null);
          if (habit?.goal_id) {
            await goalEngine.autoUpdateProgress(habit.goal_id, userId).catch(() => {});
          }
        }
      }
      // Also update goal progress for tasks linked to goals
      if (activeSession.target_type === 'task' && activeSession.target_id && goalEngine && models.Task) {
        const task = await models.Task.findByPk(activeSession.target_id, { attributes: ['goal_id'], raw: true }).catch(() => null);
        if (task?.goal_id) {
          await goalEngine.autoUpdateProgress(task.goal_id, userId).catch(() => {});
        }
      }

      // ── NEXT Phase — Build next suggestion immediately ─────────────────
      const nextData = await buildNextAction(userId, timezone);

      logger.info(`[ENGINE] /complete user=${userId} session=${activeSession.id} active=${finalActiveSeconds}s xp=${reward.xp}`);

      return res.json({
        success: true,
        data: {
          completed: true,
          session_summary: {
            active_minutes: Math.round(finalActiveSeconds / 60),
            pause_count: activeSession.pause_count,
            nudges_received: (activeSession.nudges_sent || []).length,
            title: activeSession.target_title,
          },
          reward: {
            xp: reward.xp,
            achievement: reward.achievement,
            streak_continued: streakContinued,
            message: reward.achievement || `أحسنت! +${reward.xp} XP 🎉`,
          },
          // Immediate next suggestion for seamless flow
          next: {
            next_action: nextData.next_action,
            reasoning: nextData.reasoning,
            confidence: nextData.confidence,
            mode: nextData.mode,
            alternatives: nextData.alternatives,
            progress: nextData.progress,
            energy: nextData.energy,
            goal_context: nextData.goal_context,
            behavior_context: nextData.behavior_context,
          },
          behavior_adaptation: behaviorAdaptation,
        },
      });
    }

    // No session found — just complete directly
    const { task_id, habit_id } = req.body;
    if (task_id && models.Task) {
      await models.Task.update(
        { status: 'completed', completed_at: new Date() },
        { where: { id: task_id, user_id: userId } }
      );
    }
    if (habit_id && models.HabitLog) {
      const todayStr = moment().tz(timezone).format('YYYY-MM-DD');
      await models.HabitLog.findOrCreate({
        where: { habit_id, user_id: userId, log_date: todayStr },
        defaults: { completed: true, value: 1 },
      });
    }

    const nextData = await buildNextAction(userId, timezone);
    res.json({
      success: true,
      data: {
        completed: true,
        session_summary: null,
        reward: { xp: 10, achievement: null, streak_continued: false, message: 'أحسنت! 🎉' },
        next: {
          next_action: nextData.next_action,
          reasoning: nextData.reasoning,
          confidence: nextData.confidence,
          mode: nextData.mode,
          alternatives: nextData.alternatives,
          progress: nextData.progress,
          energy: nextData.energy,
        },
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /complete error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /engine/skip — Skip with resistance classification
// Classifies: lazy | overwhelmed | busy | wrong_task | unclear | low_energy | interrupted
// ═════════════════════════════════════════════════════════════════════════════
router.post('/skip', async (req, res) => {
  const userId = req.user.id;
  const { task_id, skip_type, reason_text, switch_to_id } = req.body;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    const Session = getSessionModel();
    const activeSession = await getActiveSession(userId);

    // If there's an active session, mark it as abandoned with skip data
    if (activeSession) {
      // Accumulate final time
      let finalSeconds = activeSession.active_seconds;
      if (activeSession.state === 'active') {
        const lastResumeOrStart = activeSession.resumed_at || activeSession.started_at;
        finalSeconds += Math.round((Date.now() - new Date(lastResumeOrStart).getTime()) / 1000);
      }

      await activeSession.update({
        state: 'abandoned',
        completed_at: new Date(),
        active_seconds: finalSeconds,
        skip_type: skip_type || 'lazy',
        skip_reason_text: reason_text || null,
        switched_to_id: switch_to_id || null,
      });
    }

    // Record in learning engine with classification
    const learning = getLearning();
    if (learning) {
      learning.recordOutcome(userId, {
        action: 'execution_skipped',
        success: false,
        task_id: task_id || activeSession?.target_id,
        userResponse: 'skipped',
        skipReason: skip_type || 'lazy',
        failReason: reason_text || skip_type || 'user_skipped',
      });
    }

    // Feed resistance classification into UserModel
    const userModelSvc = getUserModelService();
    if (userModelSvc) {
      userModelSvc.onDecisionFeedback(userId, {
        action: 'skip',
        response: 'rejected',
        task_id: task_id || activeSession?.target_id,
        skip_type: skip_type || 'lazy',
        reason: reason_text,
      }).catch(() => {});
    }

    // ── MICRO-ADAPTATION: Generate lighter alternative instantly ──────────
    const currentAction = {
      type: activeSession?.target_type || 'task',
      id: task_id || activeSession?.target_id,
      title: activeSession?.target_title || '',
      estimated_minutes: activeSession?.estimated_minutes || 25,
    };
    const lighterAction = await generateLighterAction(userId, currentAction, skip_type, timezone);

    // Also build full next action for fallback
    const nextData = await buildNextAction(userId, timezone);

    // Record follow-up
    recordFollowUp(userId);

    // Adapt behavior difficulty if habit
    const behaviorEngine = getBehaviorEngine();
    if (activeSession?.target_type === 'habit' && activeSession?.target_id && behaviorEngine) {
      behaviorEngine.adaptDifficulty(userId, activeSession.target_id).catch(() => {});
    }

    logger.info(`[ENGINE] /skip user=${userId} type=${skip_type} task=${task_id || activeSession?.target_id} lighter=${lighterAction?.is_lighter}`);

    res.json({
      success: true,
      data: {
        skipped: true,
        skip_type: skip_type || 'lazy',
        message: getSkipMessage(skip_type),
        // MICRO-ADAPTATION: lighter alternative (shown first)
        lighter_action: lighterAction,
        // Full next suggestion (fallback if user rejects lighter too)
        next: {
          next_action: nextData.next_action,
          reasoning: nextData.reasoning,
          confidence: nextData.confidence,
          mode: nextData.mode,
          alternatives: nextData.alternatives,
          progress: nextData.progress,
          energy: nextData.energy,
          goal_context: nextData.goal_context,
          behavior_context: nextData.behavior_context,
        },
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /skip error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /engine/delay — Delay current action → suggest a new time slot
// The system proposes a specific time (e.g. "6 pm?") and user confirms
// ═════════════════════════════════════════════════════════════════════════════
router.post('/delay', async (req, res) => {
  const userId = req.user.id;
  const { task_id, reason_text } = req.body;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    // Abandon active session if any
    const activeSession = await getActiveSession(userId);
    if (activeSession) {
      let finalSeconds = activeSession.active_seconds;
      if (activeSession.state === 'active') {
        const lastResumeOrStart = activeSession.resumed_at || activeSession.started_at;
        finalSeconds += Math.round((Date.now() - new Date(lastResumeOrStart).getTime()) / 1000);
      }
      await activeSession.update({
        state: 'abandoned',
        completed_at: new Date(),
        active_seconds: finalSeconds,
        skip_type: 'busy',
        skip_reason_text: reason_text || 'delayed',
      });
    }

    // Get adaptive tone
    const toneCtx = await getAdaptiveTone(userId);

    // Suggest time slot
    const slot = suggestTimeSlot(timezone);

    // Record in learning
    const learning = getLearning();
    if (learning) {
      learning.recordOutcome(userId, {
        action: 'execution_delayed',
        success: false,
        task_id: task_id || activeSession?.target_id,
        userResponse: 'delayed',
      });
    }

    // Record in UserModel
    const userModelSvc = getUserModelService();
    if (userModelSvc) {
      userModelSvc.onDecisionFeedback(userId, {
        action: 'delay',
        response: 'deferred',
        task_id: task_id || activeSession?.target_id,
      }).catch(() => {});
    }

    recordFollowUp(userId);

    // Build next action for immediate engagement
    const nextData = await buildNextAction(userId, timezone);

    const delayMessage = toneMessage(toneCtx.tone, {
      gentle: slot.is_tomorrow
        ? 'لا بأس — نؤجّلها لغداً صباحاً. ارتاح الآن 💙'
        : `تم التأجيل — سنذكّرك الساعة ${slot.time} 🕐`,
      encouraging: slot.is_tomorrow
        ? 'تمام! نحجزها لغداً الصبح — ارجع بنشاط! ☀️'
        : `تم! الساعة ${slot.time} — جهّز نفسك! 💪`,
      direct: slot.is_tomorrow
        ? `مؤجّل لغداً ${slot.time}.`
        : `مؤجّل للساعة ${slot.time}.`,
    });

    logger.info(`[ENGINE] /delay user=${userId} task=${task_id || activeSession?.target_id} slot=${slot.time}`);

    res.json({
      success: true,
      data: {
        delayed: true,
        suggested_time: slot,
        message: delayMessage,
        tone: toneCtx.tone,
        // Also provide next action for immediate engagement
        next: {
          next_action: nextData.next_action,
          reasoning: nextData.reasoning,
          confidence: nextData.confidence,
          mode: nextData.mode,
          progress: nextData.progress,
          energy: nextData.energy,
        },
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /delay error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /engine/abandon — User exits focus → show re-engagement prompt
// "Stopped early… continue 5 min?" — stays on the same screen
// ═════════════════════════════════════════════════════════════════════════════
router.post('/abandon', async (req, res) => {
  const userId = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    const activeSession = await getActiveSession(userId);
    if (!activeSession) {
      return res.json({ success: true, data: { abandoned: false, message: 'لا توجد جلسة نشطة' } });
    }

    // Calculate final active time
    let finalSeconds = activeSession.active_seconds;
    if (activeSession.state === 'active') {
      const lastResumeOrStart = activeSession.resumed_at || activeSession.started_at;
      finalSeconds += Math.round((Date.now() - new Date(lastResumeOrStart).getTime()) / 1000);
    }

    // Mark session as abandoned
    await activeSession.update({
      state: 'abandoned',
      completed_at: new Date(),
      active_seconds: finalSeconds,
      skip_type: 'interrupted',
      skip_reason_text: req.body.reason || 'user_exit',
    });

    // Record in learning
    const learning = getLearning();
    if (learning) {
      learning.recordOutcome(userId, {
        action: 'execution_abandoned',
        success: false,
        task_id: activeSession.target_id,
        duration_minutes: Math.round(finalSeconds / 60),
      });
    }

    // Record in UserModel
    const userModelSvc = getUserModelService();
    if (userModelSvc) {
      userModelSvc.onDecisionFeedback(userId, {
        action: 'abandon',
        response: 'interrupted',
        task_id: activeSession.target_id,
      }).catch(() => {});
    }

    // Generate re-engagement prompt
    const reEngagement = await generateReEngagement(userId, {
      ...activeSession.dataValues,
      active_seconds: finalSeconds,
    });

    // Build next action for fallback
    const nextData = await buildNextAction(userId, timezone);

    recordFollowUp(userId);

    logger.info(`[ENGINE] /abandon user=${userId} session=${activeSession.id} active=${finalSeconds}s`);

    res.json({
      success: true,
      data: {
        abandoned: true,
        active_seconds: finalSeconds,
        active_minutes: Math.round(finalSeconds / 60),
        // RE-ENGAGEMENT: prompt to continue
        re_engagement: reEngagement,
        // Fallback: full next action
        next: {
          next_action: nextData.next_action,
          reasoning: nextData.reasoning,
          confidence: nextData.confidence,
          mode: nextData.mode,
          progress: nextData.progress,
          energy: nextData.energy,
        },
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /abandon error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /engine/nudge — System detects user ignoring → push small step
// Called by frontend after X minutes of inactivity on action screen
// Returns a micro-action prompt to re-engage the user
// ═════════════════════════════════════════════════════════════════════════════
router.post('/nudge', async (req, res) => {
  const userId = req.user.id;
  const { current_action_id, current_action_title, idle_seconds } = req.body;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    // Check follow-up limits (anti-annoyance)
    if (!canFollowUp(userId)) {
      return res.json({
        success: true,
        data: { nudge: null, reason: 'limit_reached', can_nudge: false },
      });
    }

    const toneCtx = await getAdaptiveTone(userId);
    const idleMin = Math.round((idle_seconds || 180) / 60);

    // Build micro-step prompt
    const microMinutes = toneCtx.burnout > 0.5 ? 3 : toneCtx.procrastination > 0.6 ? 5 : 10;

    const nudgePrompt = {
      type: 'nudge',
      message: toneMessage(toneCtx.tone, {
        gentle: `مرّت ${idleMin} دقائق — جرّب ${microMinutes} دقائق بس؟ لا ضغط 💙`,
        encouraging: `${idleMin} دقائق مرّت! ابدأ ${microMinutes} دقائق فقط — الأصعب هو أول خطوة 🚀`,
        direct: `${idleMin} د بدون نشاط. ابدأ ${microMinutes} د الآن.`,
      }),
      suggested_minutes: microMinutes,
      target_id: current_action_id || null,
      target_title: current_action_title || null,
      tone: toneCtx.tone,
    };

    // Record learning
    const learning = getLearning();
    if (learning) {
      learning.recordOutcome(userId, {
        action: 'nudge_sent',
        success: true,
        context: { idle_seconds, tone: toneCtx.tone },
      });
    }

    recordFollowUp(userId);

    logger.info(`[ENGINE] /nudge user=${userId} idle=${idleMin}m tone=${toneCtx.tone}`);

    res.json({
      success: true,
      data: {
        nudge: nudgePrompt,
        can_nudge: true,
        followup_count: getFollowupState(userId).count,
        max_followups: FOLLOWUP_LIMITS.max_daily_followups,
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /nudge error:', err.message);
    res.json({ success: true, data: { nudge: null, can_nudge: false } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /engine/switch — Switch to alternative without leaving execution screen
// Abandons current session (if any) and starts new session with the alternative
// ═════════════════════════════════════════════════════════════════════════════
router.post('/switch', async (req, res) => {
  const userId = req.user.id;
  const { target_type, target_id, title, estimated_minutes, reason } = req.body;

  try {
    const Session = getSessionModel();

    // Abandon current session (mark as switched)
    const activeSession = await getActiveSession(userId);
    if (activeSession) {
      let finalSeconds = activeSession.active_seconds;
      if (activeSession.state === 'active') {
        const lastResumeOrStart = activeSession.resumed_at || activeSession.started_at;
        finalSeconds += Math.round((Date.now() - new Date(lastResumeOrStart).getTime()) / 1000);
      }
      await activeSession.update({
        state: 'abandoned',
        completed_at: new Date(),
        active_seconds: finalSeconds,
        skip_type: 'wrong_task',
        switched_to_id: target_id,
      });
    }

    // Create new session for the alternative
    let newSession = null;
    if (Session) {
      newSession = await Session.create({
        user_id: userId,
        target_type: target_type || 'task',
        target_id: target_id || null,
        target_title: title || 'مهمة بديلة',
        state: 'active',
        started_at: new Date(),
        estimated_minutes: estimated_minutes || null,
        mode_at_start: req.body.mode || 'focus',
      });
    }

    // Record the switch in learning
    const learning = getLearning();
    if (learning) {
      learning.recordOutcome(userId, {
        action: 'execution_switched',
        success: true,
        task_id: target_id,
        action_type: 'switch_alternative',
      });
    }

    logger.info(`[ENGINE] /switch user=${userId} from=${activeSession?.target_id} to=${target_id}`);

    res.json({
      success: true,
      data: {
        switched: true,
        session_id: newSession?.id || null,
        state: 'active',
        started_at: newSession?.started_at || new Date().toISOString(),
        title: title,
        message: 'تم التبديل — ابدأ بالبديل! 🔄',
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /switch error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /engine/session — Current session detail
// ═════════════════════════════════════════════════════════════════════════════
router.get('/session', async (req, res) => {
  const userId = req.user.id;

  try {
    const activeSession = await getActiveSession(userId);
    if (!activeSession) {
      return res.json({ success: true, data: null });
    }

    const liveSeconds = activeSession.dataValues._live_active_seconds || activeSession.active_seconds;

    res.json({
      success: true,
      data: {
        id: activeSession.id,
        target_type: activeSession.target_type,
        target_id: activeSession.target_id,
        title: activeSession.target_title,
        state: activeSession.state,
        started_at: activeSession.started_at,
        active_seconds: liveSeconds,
        elapsed_minutes: Math.round(liveSeconds / 60),
        pause_count: activeSession.pause_count,
        estimated_minutes: activeSession.estimated_minutes,
        mode_at_start: activeSession.mode_at_start,
        energy_at_start: activeSession.energy_at_start,
        nudges: activeSession.nudges_sent || [],
        adaptations: activeSession.adaptations || [],
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /session error:', err.message);
    res.json({ success: true, data: null });
  }
});

// ─── CTA Helpers ────────────────────────────────────────────────────────────
function getCTALabel(action) {
  switch (action) {
    case 'start_task':   return 'ابدأ الآن 🚀';
    case 'check_habit':  return 'سجّل العادة ✓';
    case 'log_mood':     return 'سجّل مزاجك 📊';
    case 'take_break':   return 'خذ استراحة 💆';
    case 'review_plan':  return 'راجع الخطة 📋';
    default:             return 'ابدأ الآن 🚀';
  }
}

function getCTAAction(action) {
  switch (action) {
    case 'start_task':   return 'start';
    case 'check_habit':  return 'log';
    case 'log_mood':     return 'navigate';
    case 'take_break':   return 'navigate';
    case 'review_plan':  return 'navigate';
    default:             return 'start';
  }
}

function getSkipMessage(skipType) {
  switch (skipType) {
    case 'overwhelmed': return 'لا بأس — سنقترح شيئاً أسهل 💙';
    case 'busy':        return 'مفهوم — سنقترح شيئاً أسرع ⚡';
    case 'wrong_task':  return 'تم التبديل — جاري اقتراح بديل أنسب 🔄';
    case 'unclear':     return 'سنوضّح الخطوة التالية بشكل أفضل 💡';
    case 'low_energy':  return 'طاقتك منخفضة — جاري اقتراح مهمة أخف 😴';
    case 'interrupted': return 'تم التأجيل — يمكنك العودة لاحقاً 📌';
    case 'lazy':
    default:            return 'لا بأس — جاري اقتراح بديل 💪';
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// POST /engine/onboarding — Generate goals + behaviors from onboarding data
// Called when user completes onboarding flow
// Returns: { goals, behaviors, first_action }
// ═════════════════════════════════════════════════════════════════════════════
router.post('/onboarding', async (req, res) => {
  const userId = req.user.id;
  const { role, focus_areas } = req.body;

  try {
    const goalEngine = getGoalEngine();
    if (!goalEngine) {
      return res.json({ success: true, data: { goals: [], behaviors: [], first_action: null, message: 'محرك الأهداف غير متاح' } });
    }

    const result = await goalEngine.generateFromOnboarding(userId, role, focus_areas || []);

    // Update user profile with role if available
    const models = getModels();
    if (models.UserProfile) {
      await models.UserProfile.update(
        { role },
        { where: { user_id: userId } }
      ).catch(() => {});
    }

    logger.info(`[ENGINE] /onboarding user=${userId} role=${role} areas=${(focus_areas || []).join(',')} goals=${result.goals.length}`);

    res.json({
      success: true,
      data: {
        goals: result.goals,
        behaviors: result.behaviors,
        first_action: result.first_action,
        message: `تم إنشاء ${result.goals.length} أهداف و${result.behaviors.length} سلوكيات — ابدأ الآن!`,
      },
    });
  } catch (err) {
    logger.error('[ENGINE] /onboarding error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /engine/goals — Get user's goal context
// ═════════════════════════════════════════════════════════════════════════════
router.get('/goals', async (req, res) => {
  const userId = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    const goalEngine = getGoalEngine();
    if (!goalEngine) {
      return res.json({ success: true, data: { activeGoals: [], summary: { total: 0 } } });
    }

    const ctx = await goalEngine.getGoalContext(userId, timezone);
    res.json({ success: true, data: ctx });
  } catch (err) {
    logger.error('[ENGINE] /goals error:', err.message);
    res.json({ success: true, data: { activeGoals: [], summary: { total: 0 } } });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /engine/adapt-behavior — Trigger behavior difficulty adaptation
// Called after completion/skip to adjust difficulty
// ═════════════════════════════════════════════════════════════════════════════
router.post('/adapt-behavior', async (req, res) => {
  const userId = req.user.id;
  const { habit_id } = req.body;

  try {
    const behaviorEngine = getBehaviorEngine();
    if (!behaviorEngine || !habit_id) {
      return res.json({ success: true, data: { adapted: false } });
    }

    const result = await behaviorEngine.adaptDifficulty(userId, habit_id);

    // Also update goal progress if habit is linked to a goal
    const goalEngine = getGoalEngine();
    if (goalEngine) {
      const models = getModels();
      if (models.Habit) {
        const habit = await models.Habit.findByPk(habit_id, { attributes: ['goal_id'], raw: true }).catch(() => null);
        if (habit?.goal_id) {
          await goalEngine.autoUpdateProgress(habit.goal_id, userId).catch(() => {});
        }
      }
    }

    res.json({ success: true, data: result || { adapted: false } });
  } catch (err) {
    logger.error('[ENGINE] /adapt-behavior error:', err.message);
    res.json({ success: true, data: { adapted: false } });
  }
});

module.exports = router;
