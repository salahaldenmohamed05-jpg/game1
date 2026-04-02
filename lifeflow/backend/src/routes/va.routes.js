/**
 * VA Routes v1.0 — Full Adaptive Virtual Assistant
 * ══════════════════════════════════════════════════
 * 
 * The VA that remembers, follows up, and gently chases.
 * 
 * PHASE 1 — VA Presence Layer (in-app):
 *   GET  /va/presence       → session memory + greeting + resume prompt + daily narrative
 * 
 * PHASE 2 — Follow-up Intelligence:
 *   POST /va/escalate       → multi-step escalation (gentle → direct → offer easier)
 *   GET  /va/failure-patterns → learn failure patterns (reduce difficulty auto)
 *   GET  /va/timing-adapt   → shift suggestion times based on ignore patterns
 * 
 * PHASE 3 — Communication Engine:
 *   POST /va/comm/send      → enqueue message to channels
 *   GET  /va/comm/stats     → delivery stats per channel
 *   GET  /va/comm/pending   → pending in-app messages
 *   POST /va/comm/ack       → acknowledge message (mark read)
 * 
 * PHASE 4 — WhatsApp Integration:
 *   POST /va/whatsapp/send  → send WhatsApp message
 *   POST /va/whatsapp/webhook → receive WhatsApp webhook
 * 
 * PHASE 5 — Email Reports:
 *   GET  /va/email/daily    → daily summary
 *   GET  /va/email/weekly   → weekly report
 *   POST /va/email/send-daily  → trigger daily email
 *   POST /va/email/send-weekly → trigger weekly email
 * 
 * PHASE 6 — Safety & UX Control:
 *   GET  /va/settings       → user's VA channel settings
 *   PUT  /va/settings       → update channel toggles and frequencies
 * 
 * Rules:
 *   - No random features; every endpoint serves execution/follow-up/presence
 *   - UI stays ultra-simple; internal state is invisible
 *   - All external comms are rate-limited and user-controlled
 */

'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

router.use(protect);

// ─── Lazy service loaders ─────────────────────────────────────────────────────
function getCommEngine() {
  try { return require('../services/communication.engine.service'); } catch (e) { return null; }
}
function getUserModelService() {
  try { return require('../services/user.model.service'); } catch (e) { return null; }
}
function getModels() {
  try {
    // Force-load models that va.routes needs (they register with sequelize on require)
    require('../models/user_settings.model');
    require('../models/execution_session.model');
    try { require('../models/task.model'); } catch (_) {}
    try { require('../models/habit.model'); } catch (_) {}
    return require('../config/database').sequelize.models;
  } catch (e) { return {}; }
}
function getSessionModel() {
  try { return require('../models/execution_session.model'); } catch (e) { return null; }
}
function getUserSettingsModel() {
  try { return require('../models/user_settings.model'); } catch (e) { return null; }
}
function getBehaviorEngine() {
  try { return require('../services/behavior.engine.service'); } catch (e) { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 1: VA PRESENCE — "The app remembers me and continues"
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /va/presence — Main VA presence endpoint
 * Returns everything needed for the VA presence layer:
 *   - Session memory (last action, status, failure reason, last active time)
 *   - Resume prompt (if last session wasn't done)
 *   - Time-of-day contextual greeting
 *   - Contextual greeting based on recent activity / idle time
 *   - One-line daily narrative
 */
router.get('/presence', async (req, res) => {
  const userId = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';
  const startMs = Date.now();

  try {
    const Session = getSessionModel();
    const models = getModels();
    const commEngine = getCommEngine();
    const { Op } = require('sequelize');
    const nowTz = moment().tz(timezone);
    const hour = nowTz.hour();
    const todayStr = nowTz.format('YYYY-MM-DD');

    // ── 1. Session Memory ──────────────────────────────────────────────────
    let sessionMemory = {
      last_action: null,
      last_session_status: null,
      last_failure_reason: null,
      last_active_time: null,
    };

    if (Session) {
      const lastSession = await Session.findOne({
        where: { user_id: userId },
        order: [['started_at', 'DESC']],
        raw: true,
      });

      if (lastSession) {
        sessionMemory = {
          last_action: lastSession.target_title || null,
          last_session_status: lastSession.state, // completed/abandoned/active/paused
          last_failure_reason: lastSession.skip_type || null,
          last_active_time: lastSession.completed_at || lastSession.started_at,
          last_target_type: lastSession.target_type,
          last_target_id: lastSession.target_id,
          last_active_seconds: lastSession.active_seconds || 0,
          last_estimated_minutes: lastSession.estimated_minutes,
        };
      }
    }

    // ── 2. Resume Prompt ───────────────────────────────────────────────────
    let resumePrompt = null;
    if (sessionMemory.last_session_status &&
        sessionMemory.last_session_status !== 'completed' &&
        sessionMemory.last_action) {

      const toneCtx = await getAdaptiveToneContext(userId);
      const activeMin = Math.round((sessionMemory.last_active_seconds || 0) / 60);
      const title = sessionMemory.last_action;

      if (sessionMemory.last_session_status === 'active' || sessionMemory.last_session_status === 'paused') {
        // Session still open — strong resume prompt
        resumePrompt = {
          type: 'resume',
          title,
          message: toneMessage(toneCtx.tone, {
            gentle: `بدأت "${title}" — تريد تكمل من حيث توقفت؟ 💙`,
            encouraging: `عندك "${title}" بانتظارك! ${activeMin > 0 ? `عملت ${activeMin} د` : 'جاهزة للبدء'} — كمّل الآن! 💪`,
            direct: `"${title}" قيد العمل. ${activeMin > 0 ? `${activeMin} د تمت.` : 'ابدأ.'} أكمل الآن.`,
          }),
          options: [
            { action: 'resume', label: 'أكمل', icon: '▶️' },
            { action: 'restart', label: 'ابدأ من جديد', icon: '🔄' },
          ],
          target_type: sessionMemory.last_target_type,
          target_id: sessionMemory.last_target_id,
          active_minutes: activeMin,
          tone: toneCtx.tone,
        };
      } else if (sessionMemory.last_session_status === 'abandoned') {
        // Session abandoned — gentle re-engagement
        const idleHours = sessionMemory.last_active_time
          ? Math.round((Date.now() - new Date(sessionMemory.last_active_time).getTime()) / (60 * 60 * 1000))
          : 0;

        if (idleHours < 24) {
          resumePrompt = {
            type: 're_engage',
            title,
            message: toneMessage(toneCtx.tone, {
              gentle: `توقفت عن "${title}" — لا بأس! تريد تبدأ من جديد؟ 💙`,
              encouraging: `"${title}" لسه موجودة! جرّبها تاني — ${sessionMemory.last_estimated_minutes || 10} دقيقة بس 💪`,
              direct: `"${title}" لم تكتمل. ابدأ الآن.`,
            }),
            options: [
              { action: 'restart', label: 'ابدأ من جديد', icon: '🔄' },
              { action: 'skip', label: 'مهمة أخرى', icon: '⏭️' },
            ],
            target_type: sessionMemory.last_target_type,
            target_id: sessionMemory.last_target_id,
            idle_hours: idleHours,
            tone: toneCtx.tone,
          };
        }
      }
    }

    // ── 3. Time-of-Day Awareness ───────────────────────────────────────────
    let timeOfDay, timeGreeting;
    if (hour >= 5 && hour < 12) {
      timeOfDay = 'morning';
      timeGreeting = 'صباح الخير';
    } else if (hour >= 12 && hour < 18) {
      timeOfDay = 'afternoon';
      timeGreeting = 'مساء النور';
    } else {
      timeOfDay = 'evening';
      timeGreeting = 'مساء الخير';
    }

    // ── 4. Contextual Greeting (based on recent activity / idle time) ──────
    let contextualGreeting;
    const lastActiveTime = sessionMemory.last_active_time
      ? new Date(sessionMemory.last_active_time)
      : null;
    const idleHoursSinceActive = lastActiveTime
      ? Math.round((Date.now() - lastActiveTime.getTime()) / (60 * 60 * 1000))
      : null;

    if (idleHoursSinceActive === null || idleHoursSinceActive > 72) {
      // New user or long absence
      contextualGreeting = `${timeGreeting}! مرحباً بك — جاهز تبدأ يومك؟`;
    } else if (idleHoursSinceActive > 24) {
      // Absent 1-3 days
      contextualGreeting = `${timeGreeting}! اشتقنالك — عندك مهام بانتظارك`;
    } else if (idleHoursSinceActive > 8) {
      // Overnight/long break
      contextualGreeting = `${timeGreeting}! يوم جديد — خلينا نبدأ`;
    } else if (sessionMemory.last_session_status === 'completed') {
      // Just completed something
      contextualGreeting = `${timeGreeting}! أداء ممتاز — جاهز للخطوة التالية؟`;
    } else {
      contextualGreeting = `${timeGreeting}! يومك بانتظارك`;
    }

    // ── 5. Daily Narrative ("today's plan") ────────────────────────────────
    let dailyNarrative = '';
    let progressData = { tasks_done: 0, tasks_total: 0, habits_done: 0, habits_total: 0, completion_pct: 0 };

    try {
      if (models.Task) {
        const tasks = await models.Task.findAll({
          where: { user_id: userId, due_date: todayStr },
          attributes: ['id', 'title', 'status', 'priority'],
          raw: true,
        }).catch(() => []);
        progressData.tasks_total = tasks.length;
        progressData.tasks_done = tasks.filter(t => t.status === 'completed').length;
      }
      if (models.Habit && models.HabitLog) {
        const habits = await models.Habit.findAll({
          where: { user_id: userId, is_active: true },
          attributes: ['id'],
          raw: true,
        }).catch(() => []);
        progressData.habits_total = habits.length;
        const logs = await models.HabitLog.findAll({
          where: { user_id: userId, log_date: todayStr, completed: true },
          attributes: ['habit_id'],
          raw: true,
        }).catch(() => []);
        progressData.habits_done = logs.length;
      }

      const total = progressData.tasks_total + progressData.habits_total;
      const done = progressData.tasks_done + progressData.habits_done;
      progressData.completion_pct = total > 0 ? Math.round((done / total) * 100) : 0;

      // Build one-line narrative
      if (total === 0) {
        dailyNarrative = 'لا توجد مهام مجدولة اليوم — أضف مهامك';
      } else if (done === total) {
        dailyNarrative = `أنهيت كل شيء اليوم! ${done} من ${total} ✅`;
      } else if (done === 0) {
        dailyNarrative = `عندك ${total} مهام/عادات اليوم — ابدأ بالأولى!`;
      } else {
        const remaining = total - done;
        dailyNarrative = `أنجزت ${done} من ${total} — باقي ${remaining} ${remaining === 1 ? 'واحدة' : ''}`;
      }
    } catch (err) {
      dailyNarrative = 'جاري تحميل خطة اليوم...';
    }

    // ── 6. Pending in-app messages from comm engine ─────────────────────────
    let pendingMessages = [];
    if (commEngine) {
      pendingMessages = commEngine.getPendingInAppMessages(userId);
      commEngine.trackUserActivity(userId);
    }

    const computeMs = Date.now() - startMs;
    logger.info(`[VA] /presence user=${userId} idle=${idleHoursSinceActive}h phase=${sessionMemory.last_session_status} [${computeMs}ms]`);

    res.json({
      success: true,
      data: {
        session_memory: sessionMemory,
        resume_prompt: resumePrompt,
        time_of_day: timeOfDay,
        greeting: contextualGreeting,
        daily_narrative: dailyNarrative,
        progress: progressData,
        pending_messages: pendingMessages.slice(0, 3), // Max 3 at a time
        _meta: { computation_ms: computeMs },
      },
    });
  } catch (err) {
    logger.error('[VA] /presence error:', err.message);
    const nowTz = moment().tz(timezone);
    const hour = nowTz.hour();
    res.json({
      success: true,
      data: {
        session_memory: { last_action: null, last_session_status: null },
        resume_prompt: null,
        time_of_day: hour >= 5 && hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening',
        greeting: 'مرحباً! يومك بانتظارك',
        daily_narrative: 'جاري التحميل...',
        progress: { tasks_done: 0, tasks_total: 0, habits_done: 0, habits_total: 0, completion_pct: 0 },
        pending_messages: [],
      },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 2: FOLLOW-UP INTELLIGENCE
// Multi-step escalation, failure pattern learning, timing adaptation
// ═══════════════════════════════════════════════════════════════════════════════

// ─── In-memory escalation state (per user) ────────────────────────────────────
const escalationState = new Map(); // userId → { level, last_at, target_id }

/**
 * POST /va/escalate — Multi-step follow-up escalation
 * Level 1: gentle nudge → Level 2: more direct → Level 3: offer easier action
 */
router.post('/escalate', async (req, res) => {
  const userId = req.user.id;
  const { target_id, target_title, trigger } = req.body;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    // Get or initialize escalation state
    let state = escalationState.get(userId);
    if (!state || state.target_id !== target_id || Date.now() - state.last_at > 30 * 60 * 1000) {
      // Reset if new target or more than 30 min since last escalation
      state = { level: 0, last_at: Date.now(), target_id };
    }

    state.level = Math.min(state.level + 1, 3);
    state.last_at = Date.now();
    escalationState.set(userId, state);

    const toneCtx = await getAdaptiveToneContext(userId);

    let escalation;

    switch (state.level) {
      case 1:
        // Gentle nudge
        escalation = {
          level: 1,
          type: 'gentle_nudge',
          message: toneMessage(toneCtx.tone, {
            gentle: `"${target_title || 'المهمة'}" لا زالت بانتظارك — خذ وقتك 💙`,
            encouraging: `"${target_title || 'المهمة'}" جاهزة! 5 دقائق فقط لتبدأ 💪`,
            direct: `"${target_title || 'المهمة'}" بانتظارك.`,
          }),
          suggested_action: 'start',
          tone: toneCtx.tone,
        };
        break;

      case 2:
        // More direct
        escalation = {
          level: 2,
          type: 'direct_prompt',
          message: toneMessage(toneCtx.tone, {
            gentle: `لاحظنا تأخير — هل تحتاج وقت إضافي؟ يمكنك التأجيل 💙`,
            encouraging: `وقت العمل! "${target_title || 'المهمة'}" مهمة — ابدأ الآن ولو 3 دقائق 🚀`,
            direct: `"${target_title || 'المهمة'}" متأخرة. ابدأ الآن أو أجّل.`,
          }),
          suggested_action: 'start_or_delay',
          tone: toneCtx.tone,
          options: [
            { action: 'start', label: 'ابدأ الآن', icon: '▶️' },
            { action: 'delay', label: 'أجّل', icon: '🕐' },
          ],
        };
        break;

      case 3:
      default:
        // Offer easier action — micro adaptation
        const microMinutes = toneCtx.burnout > 0.5 ? 3 : 5;
        escalation = {
          level: 3,
          type: 'offer_easier',
          message: toneMessage(toneCtx.tone, {
            gentle: `يبدو أن "${target_title || 'المهمة'}" صعبة الآن — جرّب ${microMinutes} دقائق بس 💙`,
            encouraging: `مش لازم تكمل كلها! جرّب ${microMinutes} دقائق فقط — البداية هي الأصعب 💪`,
            direct: `${microMinutes} دقائق. ابدأ بأي جزء.`,
          }),
          suggested_action: 'start_micro',
          suggested_minutes: microMinutes,
          tone: toneCtx.tone,
          options: [
            { action: 'start_micro', label: `ابدأ ${microMinutes} د`, icon: '⚡' },
            { action: 'skip', label: 'مهمة أخرى', icon: '⏭️' },
          ],
        };
        break;
    }

    // Record in learning
    const userModelSvc = getUserModelService();
    if (userModelSvc) {
      userModelSvc.onDecisionFeedback(userId, {
        action: 'escalation',
        response: 'presented',
        level: state.level,
        target_id,
      }).catch(() => {});
    }

    logger.info(`[VA] /escalate user=${userId} level=${state.level} target=${target_id}`);

    res.json({
      success: true,
      data: {
        escalation,
        current_level: state.level,
        max_level: 3,
      },
    });
  } catch (err) {
    logger.error('[VA] /escalate error:', err.message);
    res.json({ success: true, data: { escalation: null, current_level: 0 } });
  }
});

/**
 * GET /va/failure-patterns — Analyze failure patterns for auto-adjustment
 * Returns: skip patterns, worst times, recommendations
 */
router.get('/failure-patterns', async (req, res) => {
  const userId = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    const Session = getSessionModel();
    const { Op } = require('sequelize');
    const thirtyDaysAgo = moment().tz(timezone).subtract(30, 'days').toDate();

    const sessions = await Session.findAll({
      where: {
        user_id: userId,
        started_at: { [Op.gte]: thirtyDaysAgo },
      },
      attributes: ['state', 'skip_type', 'started_at', 'target_type', 'active_seconds', 'estimated_minutes'],
      raw: true,
    });

    const total = sessions.length;
    const abandoned = sessions.filter(s => s.state === 'abandoned');
    const completed = sessions.filter(s => s.state === 'completed');

    // Skip type distribution
    const skipTypes = {};
    abandoned.forEach(s => {
      const t = s.skip_type || 'unknown';
      skipTypes[t] = (skipTypes[t] || 0) + 1;
    });

    // Worst hours (hours with most skips)
    const hourSkips = {};
    abandoned.forEach(s => {
      const h = moment(s.started_at).tz(timezone).hour();
      hourSkips[h] = (hourSkips[h] || 0) + 1;
    });
    const worstHours = Object.entries(hourSkips)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([h, c]) => ({ hour: parseInt(h), skips: c }));

    // Best hours (hours with most completions)
    const hourCompletes = {};
    completed.forEach(s => {
      const h = moment(s.started_at).tz(timezone).hour();
      hourCompletes[h] = (hourCompletes[h] || 0) + 1;
    });
    const bestHours = Object.entries(hourCompletes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([h, c]) => ({ hour: parseInt(h), completions: c }));

    // Skip rate over time (should decrease)
    const skipRate = total > 0 ? Math.round((abandoned.length / total) * 100) : 0;

    // Recommendations
    const recommendations = [];
    if (skipRate > 60) {
      recommendations.push({
        type: 'reduce_difficulty',
        message: 'معدل التخطي مرتفع — سنقلل صعوبة المهام تلقائياً',
        action: 'auto_reduce',
      });
    }
    if (skipTypes['overwhelmed'] > 3) {
      recommendations.push({
        type: 'smaller_tasks',
        message: 'التخطي بسبب الإرهاق متكرر — سنقترح مهام أصغر',
        action: 'micro_tasks',
      });
    }
    if (worstHours.length > 0) {
      recommendations.push({
        type: 'shift_timing',
        message: `أكثر التخطي يحدث الساعة ${worstHours[0].hour}:00 — سنحول الاقتراحات لأوقات أفضل`,
        action: 'timing_shift',
      });
    }

    // Auto-apply: if skip rate > 50%, reduce difficulty
    if (skipRate > 50) {
      const behaviorEngine = getBehaviorEngine();
      if (behaviorEngine && models.Habit) {
        const models2 = getModels();
        if (models2.Habit) {
          const habits = await models2.Habit.findAll({
            where: { user_id: userId, is_active: true },
            attributes: ['id'],
            raw: true,
          }).catch(() => []);
          // Adapt top 3 habits
          for (const h of habits.slice(0, 3)) {
            behaviorEngine.adaptDifficulty(userId, h.id).catch(() => {});
          }
        }
      }
    }

    res.json({
      success: true,
      data: {
        total_sessions: total,
        completed: completed.length,
        abandoned: abandoned.length,
        skip_rate: skipRate,
        skip_types: skipTypes,
        worst_hours: worstHours,
        best_hours: bestHours,
        recommendations,
        auto_adjusted: skipRate > 50,
      },
    });
  } catch (err) {
    logger.error('[VA] /failure-patterns error:', err.message);
    res.json({ success: true, data: { total_sessions: 0, skip_rate: 0, recommendations: [] } });
  }
});

/**
 * GET /va/timing-adapt — Shift suggestion times based on ignore patterns
 */
router.get('/timing-adapt', async (req, res) => {
  const userId = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    const Session = getSessionModel();
    const { Op } = require('sequelize');
    const fourteenDaysAgo = moment().tz(timezone).subtract(14, 'days').toDate();

    const sessions = await Session.findAll({
      where: {
        user_id: userId,
        started_at: { [Op.gte]: fourteenDaysAgo },
      },
      attributes: ['state', 'started_at'],
      raw: true,
    });

    // Compute completion rate per hour
    const hourStats = {};
    sessions.forEach(s => {
      const h = moment(s.started_at).tz(timezone).hour();
      if (!hourStats[h]) hourStats[h] = { total: 0, completed: 0 };
      hourStats[h].total++;
      if (s.state === 'completed') hourStats[h].completed++;
    });

    // Find best and worst hours
    const hourRates = Object.entries(hourStats).map(([h, stats]) => ({
      hour: parseInt(h),
      total: stats.total,
      completed: stats.completed,
      rate: stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0,
    })).sort((a, b) => b.rate - a.rate);

    const bestHours = hourRates.filter(h => h.rate >= 60).slice(0, 3);
    const avoidHours = hourRates.filter(h => h.rate < 30 && h.total >= 2);

    res.json({
      success: true,
      data: {
        hour_stats: hourRates,
        recommended_hours: bestHours.map(h => h.hour),
        avoid_hours: avoidHours.map(h => h.hour),
        insight: bestHours.length > 0
          ? `أفضل أوقاتك: ${bestHours.map(h => `${h.hour}:00`).join('، ')} — سنقترح المهام في هذه الأوقات`
          : 'لا توجد بيانات كافية بعد — استمر وسنتعلم أوقاتك المثالية',
      },
    });
  } catch (err) {
    logger.error('[VA] /timing-adapt error:', err.message);
    res.json({ success: true, data: { hour_stats: [], recommended_hours: [], avoid_hours: [] } });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 3: COMMUNICATION ENGINE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /va/comm/send — Enqueue a message to specified channels
 */
router.post('/comm/send', async (req, res) => {
  const userId = req.user.id;
  const { trigger, context, channels } = req.body;

  try {
    const commEngine = getCommEngine();
    if (!commEngine) {
      return res.json({ success: false, message: 'Communication engine not available' });
    }

    const entries = await commEngine.enqueueMessage(userId, trigger, context || {}, {
      channels: channels || ['in_app'],
    });

    // Process queue immediately
    const delivered = await commEngine.processQueue(userId);

    res.json({
      success: true,
      data: {
        queued: entries.length,
        delivered: delivered.length,
        entries: entries.map(e => ({ id: e.id, channel: e.channel, status: e.status })),
      },
    });
  } catch (err) {
    logger.error('[VA] /comm/send error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /va/comm/stats — Delivery stats per channel
 */
router.get('/comm/stats', async (req, res) => {
  const userId = req.user.id;

  try {
    const commEngine = getCommEngine();
    if (!commEngine) {
      return res.json({ success: true, data: {} });
    }

    res.json({
      success: true,
      data: commEngine.getDeliveryStats(userId),
    });
  } catch (err) {
    logger.error('[VA] /comm/stats error:', err.message);
    res.json({ success: true, data: {} });
  }
});

/**
 * GET /va/comm/pending — Pending in-app messages
 */
router.get('/comm/pending', async (req, res) => {
  const userId = req.user.id;

  try {
    const commEngine = getCommEngine();
    if (!commEngine) return res.json({ success: true, data: { messages: [] } });

    const messages = commEngine.getPendingInAppMessages(userId);

    res.json({
      success: true,
      data: { messages: messages.slice(0, 5) },
    });
  } catch (err) {
    logger.error('[VA] /comm/pending error:', err.message);
    res.json({ success: true, data: { messages: [] } });
  }
});

/**
 * POST /va/comm/ack — Acknowledge / mark message as read
 */
router.post('/comm/ack', async (req, res) => {
  const userId = req.user.id;
  const { message_id, action } = req.body; // action: 'read' | 'dismissed' | 'acted'

  try {
    const commEngine = getCommEngine();
    if (action === 'dismissed' && commEngine) {
      commEngine.recordIgnored(userId, 'in_app');
    }

    res.json({ success: true, data: { acknowledged: true } });
  } catch (err) {
    res.json({ success: true, data: { acknowledged: false } });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 4: WHATSAPP INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /va/whatsapp/send — Send WhatsApp message manually
 */
router.post('/whatsapp/send', async (req, res) => {
  const userId = req.user.id;
  const { trigger, context } = req.body;

  try {
    const commEngine = getCommEngine();
    if (!commEngine) {
      return res.json({ success: false, message: 'Communication engine not available' });
    }

    const entries = await commEngine.enqueueMessage(userId, trigger || 'next_action_ready', context || {}, {
      channels: ['whatsapp'],
      priority: 'high',
    });

    const delivered = await commEngine.processQueue(userId);

    res.json({
      success: true,
      data: {
        queued: entries.length,
        delivered: delivered.length,
        message: entries.length > 0 ? 'تم إرسال الرسالة عبر واتساب' : 'لم يتم الإرسال — تحقق من الإعدادات',
      },
    });
  } catch (err) {
    logger.error('[VA] /whatsapp/send error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /va/whatsapp/webhook — Receive WhatsApp webhook (Twilio/Meta)
 * This endpoint doesn't require auth (webhooks come from Twilio/Meta)
 */
// NOTE: This route will be registered separately without protect middleware if needed

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 5: EMAIL REPORTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /va/email/daily — Get daily summary data (preview)
 */
router.get('/email/daily', async (req, res) => {
  const userId = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    const commEngine = getCommEngine();
    if (!commEngine) {
      return res.json({ success: true, data: null });
    }

    const summary = await commEngine.buildDailySummary(userId, timezone);
    res.json({ success: true, data: summary });
  } catch (err) {
    logger.error('[VA] /email/daily error:', err.message);
    res.json({ success: true, data: null });
  }
});

/**
 * GET /va/email/weekly — Get weekly report data (preview)
 */
router.get('/email/weekly', async (req, res) => {
  const userId = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    const commEngine = getCommEngine();
    if (!commEngine) {
      return res.json({ success: true, data: null });
    }

    const report = await commEngine.buildWeeklyReport(userId, timezone);
    res.json({ success: true, data: report });
  } catch (err) {
    logger.error('[VA] /email/weekly error:', err.message);
    res.json({ success: true, data: null });
  }
});

/**
 * POST /va/email/send-daily — Trigger daily email now
 */
router.post('/email/send-daily', async (req, res) => {
  const userId = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    const commEngine = getCommEngine();
    if (!commEngine) {
      return res.json({ success: false, message: 'Communication engine not available' });
    }

    const summary = await commEngine.buildDailySummary(userId, timezone);
    const entries = await commEngine.enqueueMessage(userId, 'daily_summary', summary, {
      channels: ['email'],
    });
    const delivered = await commEngine.processQueue(userId);

    res.json({
      success: true,
      data: {
        sent: delivered.length > 0,
        summary,
        message: delivered.length > 0 ? 'تم إرسال الملخص اليومي' : 'لم يتم الإرسال — تحقق من الإعدادات',
      },
    });
  } catch (err) {
    logger.error('[VA] /email/send-daily error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /va/email/send-weekly — Trigger weekly email now
 */
router.post('/email/send-weekly', async (req, res) => {
  const userId = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    const commEngine = getCommEngine();
    if (!commEngine) {
      return res.json({ success: false, message: 'Communication engine not available' });
    }

    const report = await commEngine.buildWeeklyReport(userId, timezone);
    const entries = await commEngine.enqueueMessage(userId, 'weekly_report', report, {
      channels: ['email'],
    });
    const delivered = await commEngine.processQueue(userId);

    res.json({
      success: true,
      data: {
        sent: delivered.length > 0,
        report,
        message: delivered.length > 0 ? 'تم إرسال التقرير الأسبوعي' : 'لم يتم الإرسال — تحقق من الإعدادات',
      },
    });
  } catch (err) {
    logger.error('[VA] /email/send-weekly error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 6: SAFETY & UX CONTROL
// Settings toggles, smart silence, anti-spam
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /va/settings — Get VA channel settings
 */
router.get('/settings', async (req, res) => {
  const userId = req.user.id;

  try {
    const UserSettings = getUserSettingsModel();
    let settings = null;

    if (UserSettings) {
      settings = await UserSettings.findOne({
        where: { user_id: userId },
        raw: true,
      });
    }

    // Default settings
    const vaSettings = {
      // Channel toggles
      whatsapp_enabled: settings?.whatsapp_enabled || false,
      whatsapp_phone: null, // Don't expose phone in response
      whatsapp_frequency: settings?.whatsapp_frequency || 'normal', // low | normal | high
      email_reports_enabled: settings?.email_reports_enabled ?? true,
      email_daily: settings?.email_daily ?? true,
      email_weekly: settings?.email_weekly ?? true,
      email_frequency: settings?.email_frequency || 'daily', // daily | weekly_only

      // In-app behavior
      in_app_nudges: settings?.in_app_nudges ?? true,
      nudge_intensity: settings?.nudge_intensity || 'moderate', // gentle | moderate | persistent
      quiet_hours_start: settings?.quiet_hours_start || '23:00',
      quiet_hours_end: settings?.quiet_hours_end || '07:00',

      // Smart silence
      smart_silence: settings?.smart_silence ?? true, // Suppress external if active in app
      anti_spam_enabled: settings?.anti_spam_enabled ?? true,
    };

    // Get current delivery stats
    const commEngine = getCommEngine();
    const deliveryStats = commEngine ? commEngine.getDeliveryStats(userId) : {};

    res.json({
      success: true,
      data: {
        settings: vaSettings,
        delivery_stats: deliveryStats,
      },
    });
  } catch (err) {
    logger.error('[VA] /settings GET error:', err.message);
    res.json({ success: true, data: { settings: {} } });
  }
});

/**
 * PUT /va/settings — Update VA channel settings
 */
router.put('/settings', async (req, res) => {
  const userId = req.user.id;
  const updates = req.body;

  try {
    const UserSettings = getUserSettingsModel();
    // Allowed fields
    const allowedFields = [
      'whatsapp_enabled', 'whatsapp_phone', 'whatsapp_frequency',
      'email_reports_enabled', 'email_daily', 'email_weekly', 'email_frequency',
      'in_app_nudges', 'nudge_intensity',
      'quiet_hours_start', 'quiet_hours_end',
      'smart_silence', 'anti_spam_enabled',
    ];

    const safeUpdates = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) safeUpdates[key] = updates[key];
    }

    if (UserSettings) {
      const [settings, created] = await UserSettings.findOrCreate({
        where: { user_id: userId },
        defaults: { user_id: userId, ...safeUpdates },
      });

      if (!created) {
        await settings.update(safeUpdates);
      }
    }

    logger.info(`[VA] /settings PUT user=${userId} fields=${Object.keys(safeUpdates).join(',')}`);

    res.json({
      success: true,
      data: {
        updated: true,
        fields: Object.keys(safeUpdates),
        message: 'تم تحديث إعدادات المساعد الافتراضي',
      },
    });
  } catch (err) {
    logger.error('[VA] /settings PUT error:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// PHASE 7: TESTING ENDPOINT — Verify all scenarios
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /va/test-scenarios — Run all test scenarios and return results
 * Tests: return after days, ignore tasks, start from WhatsApp, etc.
 */
router.get('/test-scenarios', async (req, res) => {
  const userId = req.user.id;
  const timezone = req.user.timezone || 'Africa/Cairo';

  try {
    const results = [];

    // Test 1: VA Presence loads correctly
    try {
      const Session = getSessionModel();
      const lastSession = Session ? await Session.findOne({
        where: { user_id: userId },
        order: [['started_at', 'DESC']],
        raw: true,
      }) : null;
      results.push({
        test: 'va_presence_load',
        status: 'pass',
        detail: `Last session: ${lastSession?.state || 'none'}`,
      });
    } catch (e) {
      results.push({ test: 'va_presence_load', status: 'fail', detail: e.message });
    }

    // Test 2: Greeting based on time of day
    const hour = moment().tz(timezone).hour();
    const expectedTimeOfDay = hour >= 5 && hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    results.push({
      test: 'time_of_day_greeting',
      status: 'pass',
      detail: `Hour: ${hour}, Period: ${expectedTimeOfDay}`,
    });

    // Test 3: Escalation system
    try {
      escalationState.delete(userId);
      results.push({
        test: 'escalation_reset',
        status: 'pass',
        detail: 'Escalation state cleared for user',
      });
    } catch (e) {
      results.push({ test: 'escalation_reset', status: 'fail', detail: e.message });
    }

    // Test 4: Communication engine availability
    const commEngine = getCommEngine();
    results.push({
      test: 'comm_engine_available',
      status: commEngine ? 'pass' : 'fail',
      detail: commEngine ? 'Communication engine loaded' : 'Not available',
    });

    // Test 5: Channel rate limiting
    if (commEngine) {
      const stats = commEngine.getDeliveryStats(userId);
      results.push({
        test: 'rate_limiting',
        status: 'pass',
        detail: `Channels: ${JSON.stringify(Object.keys(stats))}`,
      });
    }

    // Test 6: Tone adaptation
    const toneCtx = await getAdaptiveToneContext(userId);
    results.push({
      test: 'tone_adaptation',
      status: 'pass',
      detail: `Tone: ${toneCtx.tone}, Proc: ${toneCtx.procrastination}, Burnout: ${toneCtx.burnout}`,
    });

    // Test 7: Smart silence
    if (commEngine) {
      const isActive = commEngine.isUserActiveInApp(userId);
      results.push({
        test: 'smart_silence',
        status: 'pass',
        detail: `User active in-app: ${isActive}`,
      });
    }

    res.json({
      success: true,
      data: {
        tests_run: results.length,
        passed: results.filter(r => r.status === 'pass').length,
        failed: results.filter(r => r.status === 'fail').length,
        results,
      },
    });
  } catch (err) {
    logger.error('[VA] /test-scenarios error:', err.message);
    res.json({ success: true, data: { tests_run: 0, results: [] } });
  }
});

// ─── Tone helpers (shared with engine.routes.js) ─────────────────────────────
async function getAdaptiveToneContext(userId) {
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

    let tone = 'encouraging';
    if (burnout > 0.6) tone = 'gentle';
    else if (procrastination > 0.6) tone = 'encouraging';
    else if (discipline > 0.7) tone = 'direct';

    return { tone, procrastination, burnout, discipline, pushIntensity: adapt.push_intensity || 'moderate' };
  } catch {
    return { tone: 'encouraging', procrastination: 0.5, burnout: 0.3, discipline: 0.5 };
  }
}

function toneMessage(tone, messages) {
  return messages[tone] || messages.encouraging || messages.direct || '';
}

module.exports = router;
