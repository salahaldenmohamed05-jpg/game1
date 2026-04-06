/**
 * Phase 6 Routes — External Execution Layer & Cross-Day Intelligence
 * =====================================================================
 * Endpoints for the always-on system:
 *
 *   GET  /phase6/adaptive-state        — Current adaptive intelligence state
 *   POST /phase6/block-event           — Report block completion/skip events
 *   GET  /phase6/reorder-plan          — Get reordered plan based on behavior
 *   GET  /phase6/weekly-narrative      — Weekly narrative + trends + achievements
 *   GET  /phase6/streak-warnings       — Active streak loss warnings
 *   GET  /phase6/perfect-day           — Perfect Day badge check
 *   GET  /phase6/comeback-status       — Comeback system status
 *   POST /phase6/trigger-notifications — Manually trigger smart notification engine
 *   GET  /phase6/notification-schedule — View notification schedule status
 *   GET  /phase6/widget-data           — Lightweight data for home-screen widget
 *   POST /phase6/quick-action          — One-tap actions (complete habit, complete task)
 *   GET  /phase6/subscription-gate     — Check feature access for freemium
 */

'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

// Lazy-load services
const getAdaptiveV2 = () => {
  try { return require('../services/adaptive.intelligence.v2'); } catch (_) { return null; }
};
const getCrossDayIntel = () => {
  try { return require('../services/cross.day.intelligence'); } catch (_) { return null; }
};
const getSmartNotifEngine = () => {
  try { return require('../services/smart.notification.engine'); } catch (_) { return null; }
};

// All routes require authentication
router.use(protect);

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTIVE INTELLIGENCE V2
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /phase6/adaptive-state
 * Returns the user's current adaptive intelligence state:
 *   - energy level, procrastination flag, burnout risk, momentum
 *   - recommendations (break suggestions, intensity adjustments)
 */
router.get('/adaptive-state', async (req, res) => {
  try {
    const adaptiveV2 = getAdaptiveV2();
    if (!adaptiveV2) return res.json({ success: true, data: { available: false } });

    const state = adaptiveV2.getUserAdaptiveState(req.user.id);
    res.json({ success: true, data: state });
  } catch (err) {
    logger.error('[PHASE6] /adaptive-state error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب حالة الذكاء التكيفي' });
  }
});

/**
 * POST /phase6/block-event
 * Report block events (complete, skip) to the adaptive engine
 * Body: { event: 'complete' | 'skip', block: {...}, reason?: string }
 */
router.post('/block-event', async (req, res) => {
  try {
    const { event, block, reason } = req.body;
    const adaptiveV2 = getAdaptiveV2();
    if (!adaptiveV2) return res.json({ success: true, data: { available: false } });

    let result;
    if (event === 'complete') {
      result = adaptiveV2.onBlockComplete(req.user.id, block || {});
    } else if (event === 'skip') {
      result = adaptiveV2.onBlockSkip(req.user.id, block || {}, reason || 'other');

      // Also track in smart notification engine
      const smartEngine = getSmartNotifEngine();
      if (smartEngine) smartEngine.trackSkip(req.user.id, block?.type || 'unknown');
    } else if (event === 'idle') {
      result = adaptiveV2.onIdleDetected(req.user.id, block?.idle_minutes || 30);
    } else {
      return res.status(400).json({ success: false, message: 'event يجب أن يكون complete, skip, أو idle' });
    }

    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[PHASE6] /block-event error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

/**
 * GET /phase6/reorder-plan
 * Get a reordered plan based on current behavioral state
 * Uses the active day plan blocks and reorders them
 */
router.get('/reorder-plan', async (req, res) => {
  try {
    const adaptiveV2 = getAdaptiveV2();
    if (!adaptiveV2) return res.json({ success: true, data: { available: false } });

    const moment = require('moment-timezone');
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');

    // Get current plan
    let DayPlan;
    try { DayPlan = require('../models/day_plan.model'); } catch (_) {}

    if (!DayPlan) return res.json({ success: true, data: { reordered: false } });

    const dayPlan = await DayPlan.findOne({ where: { user_id: req.user.id, plan_date: today }, raw: true });
    if (!dayPlan || !dayPlan.schedule) {
      return res.json({ success: true, data: { reordered: false, message: 'لا توجد خطة نشطة' } });
    }

    const blocks = Array.isArray(dayPlan.schedule) ? dayPlan.schedule : [];
    const reordered = adaptiveV2.reorderBlocks(req.user.id, blocks);
    const state = adaptiveV2.getUserAdaptiveState(req.user.id);

    res.json({
      success: true,
      data: {
        reordered: true,
        blocks: reordered,
        adaptive_state: state.state,
        recommendations: state.recommendations,
      },
    });
  } catch (err) {
    logger.error('[PHASE6] /reorder-plan error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CROSS-DAY INTELLIGENCE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /phase6/weekly-narrative
 * Weekly narrative with trends, achievements, and predictions
 */
router.get('/weekly-narrative', async (req, res) => {
  try {
    const crossDay = getCrossDayIntel();
    if (!crossDay) return res.json({ success: true, data: { available: false } });

    const tz = req.user.timezone || 'Africa/Cairo';
    const narrative = await crossDay.generateWeeklyNarrative(req.user.id, tz);
    res.json({ success: true, data: narrative });
  } catch (err) {
    logger.error('[PHASE6] /weekly-narrative error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء السرد الأسبوعي' });
  }
});

/**
 * GET /phase6/streak-warnings
 * Active streak loss warnings for today
 */
router.get('/streak-warnings', async (req, res) => {
  try {
    const crossDay = getCrossDayIntel();
    if (!crossDay) return res.json({ success: true, data: { warnings: [] } });

    const tz = req.user.timezone || 'Africa/Cairo';
    const warnings = await crossDay.checkStreakWarnings(req.user.id, tz);
    res.json({ success: true, data: { warnings, count: warnings.length } });
  } catch (err) {
    logger.error('[PHASE6] /streak-warnings error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

/**
 * GET /phase6/perfect-day
 * Check if today qualifies as a Perfect Day
 */
router.get('/perfect-day', async (req, res) => {
  try {
    const crossDay = getCrossDayIntel();
    if (!crossDay) return res.json({ success: true, data: { is_perfect_day: false } });

    const tz = req.user.timezone || 'Africa/Cairo';
    const result = await crossDay.checkPerfectDay(req.user.id, tz);
    res.json({ success: true, data: result });
  } catch (err) {
    logger.error('[PHASE6] /perfect-day error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

/**
 * GET /phase6/comeback-status
 * Comeback system for returning users
 */
router.get('/comeback-status', async (req, res) => {
  try {
    const crossDay = getCrossDayIntel();
    if (!crossDay) return res.json({ success: true, data: null });

    const tz = req.user.timezone || 'Africa/Cairo';
    const status = await crossDay.getComebackStatus(req.user.id, tz);
    res.json({ success: true, data: status });
  } catch (err) {
    logger.error('[PHASE6] /comeback-status error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SMART NOTIFICATION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /phase6/trigger-notifications
 * Manually trigger the smart notification engine for current user
 */
router.post('/trigger-notifications', async (req, res) => {
  try {
    const smartEngine = getSmartNotifEngine();
    if (!smartEngine) return res.json({ success: true, data: { available: false } });

    const tz = req.user.timezone || 'Africa/Cairo';
    const io = req.app.get('io');
    const notifications = await smartEngine.runForUser(req.user.id, tz, io);

    res.json({
      success: true,
      data: {
        sent: notifications.length,
        notifications: notifications.map(n => ({
          type: n.type,
          title: n.title,
          body: n.body,
          priority: n.priority,
          actions: n.actions,
        })),
      },
    });
  } catch (err) {
    logger.error('[PHASE6] /trigger-notifications error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

/**
 * GET /phase6/notification-schedule
 * View the smart notification schedule and status
 */
router.get('/notification-schedule', async (req, res) => {
  try {
    const smartEngine = getSmartNotifEngine();
    const dailyCount = smartEngine ? smartEngine.getDailyCount(req.user.id) : 0;

    res.json({
      success: true,
      data: {
        daily_sent: dailyCount,
        daily_limit: 8,
        schedule: {
          morning_kickoff: '7:30 AM',
          task_nudges: '10 AM – 5 PM (context-aware)',
          habit_reminders: '9 AM, 1 PM, 5 PM',
          focus_alerts: '9 AM – 6 PM (plan-based)',
          energy_check: '2 PM – 4 PM (skip-triggered)',
          end_of_day: '8:30 PM',
          comeback: 'anytime (after 2+ days absence)',
        },
        features: {
          loss_aversion_streaks: true,
          procrastination_detection: true,
          energy_intervention: true,
          perfect_day_badge: true,
          quick_actions: true,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// INSTANT ACTION LAYER — Widget & Quick Actions
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /phase6/widget-data
 * Lightweight data for home-screen widget display
 * Returns: pending tasks, habits, XP, streak, next action
 */
router.get('/widget-data', async (req, res) => {
  try {
    const moment = require('moment-timezone');
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');
    const hour = moment.tz(tz).hour();

    let Task, Habit, HabitLog, DayPlan;
    try { Task = require('../models/task.model'); } catch (_) {}
    try { Habit = require('../models/habit.model').Habit; } catch (_) {}
    try { HabitLog = require('../models/habit.model').HabitLog; } catch (_) {}
    try { DayPlan = require('../models/day_plan.model'); } catch (_) {}

    const userId = req.user.id;
    const { Op } = require('sequelize');

    const [tasks, habits, habitLogs, dayPlan] = await Promise.all([
      Task ? Task.findAll({
        where: { user_id: userId, status: { [Op.in]: ['pending', 'in_progress'] } },
        attributes: ['id', 'title', 'priority', 'due_date', 'status'],
        limit: 5,
        order: [['priority', 'ASC'], ['due_date', 'ASC']],
        raw: true,
      }) : [],
      Habit ? Habit.findAll({
        where: { user_id: userId, is_active: true },
        attributes: ['id', 'name', 'icon', 'current_streak'],
        raw: true,
      }) : [],
      HabitLog ? HabitLog.findAll({
        where: { user_id: userId, log_date: today, completed: true },
        attributes: ['habit_id'],
        raw: true,
      }) : [],
      DayPlan ? DayPlan.findOne({
        where: { user_id: userId, plan_date: today },
        raw: true,
      }) : null,
    ]);

    const completedHabitIds = new Set(habitLogs.map(l => String(l.habit_id)));
    const pendingHabits = habits.filter(h => !completedHabitIds.has(String(h.id)));
    const topStreak = habits.reduce((max, h) => Math.max(max, h.current_streak || 0), 0);

    const blocks = dayPlan?.schedule ? (Array.isArray(dayPlan.schedule) ? dayPlan.schedule : []) : [];
    const completedBlocks = blocks.filter(b => b.status === 'completed').length;
    const nextBlock = blocks.find(b => b.status === 'pending');

    res.json({
      success: true,
      data: {
        date: today,
        hour,
        tasks: { pending: tasks.length, top: tasks[0] || null },
        habits: {
          total: habits.length,
          completed: habitLogs.length,
          pending: pendingHabits.length,
          pending_list: pendingHabits.slice(0, 3).map(h => ({
            id: h.id, name: h.name, icon: h.icon, streak: h.current_streak || 0,
          })),
          top_streak: topStreak,
        },
        plan: {
          active: !!dayPlan,
          progress: blocks.length > 0 ? Math.round((completedBlocks / blocks.length) * 100) : 0,
          next_block: nextBlock ? { title: nextBlock.title, type: nextBlock.type, duration: nextBlock.duration } : null,
        },
        quick_actions: [
          pendingHabits.length > 0 ? { type: 'check_habit', label: `✅ ${pendingHabits[0].name}`, habit_id: pendingHabits[0].id } : null,
          tasks.length > 0 ? { type: 'complete_task', label: `📋 ${tasks[0].title}`, task_id: tasks[0].id } : null,
          !dayPlan ? { type: 'start_day', label: '🚀 ابدأ يومك' } : null,
          nextBlock ? { type: 'start_block', label: `🎯 ${nextBlock.title}` } : null,
        ].filter(Boolean).slice(0, 3),
      },
    });
  } catch (err) {
    logger.error('[PHASE6] /widget-data error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

/**
 * POST /phase6/quick-action
 * One-tap actions from notifications or widget
 * Body: { action: 'check_habit' | 'complete_task' | 'start_day', item_id? }
 */
router.post('/quick-action', async (req, res) => {
  try {
    const { action, item_id } = req.body;
    const userId = req.user.id;
    const moment = require('moment-timezone');
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');

    if (action === 'check_habit' && item_id) {
      // One-tap habit check-in
      let Habit, HabitLog;
      try { Habit = require('../models/habit.model').Habit; } catch (_) {}
      try { HabitLog = require('../models/habit.model').HabitLog; } catch (_) {}

      if (!Habit || !HabitLog) return res.status(500).json({ success: false, message: 'Model unavailable' });

      const habit = await Habit.findOne({ where: { id: item_id, user_id: userId } });
      if (!habit) return res.status(404).json({ success: false, message: 'العادة غير موجودة' });

      const existing = await HabitLog.findOne({ where: { habit_id: item_id, user_id: userId, log_date: today, completed: true } });
      if (existing) {
        return res.json({ success: true, data: { already_completed: true, streak: habit.current_streak, message: '✅ تم مسبقاً!' } });
      }

      await HabitLog.upsert({ habit_id: item_id, user_id: userId, log_date: today, completed: true, value: 1 });
      const newStreak = (habit.current_streak || 0) + 1;
      await Habit.update(
        { current_streak: newStreak, best_streak: Math.max(newStreak, habit.best_streak || 0), last_completed: today },
        { where: { id: item_id } }
      );

      res.json({
        success: true,
        data: {
          action: 'check_habit',
          habit_name: habit.name,
          streak: newStreak,
          xp: 15,
          message: `✅ ${habit.name} — ${newStreak} يوم! +15 XP ⚡`,
        },
      });

    } else if (action === 'complete_task' && item_id) {
      // One-tap task completion
      let Task;
      try { Task = require('../models/task.model'); } catch (_) {}
      if (!Task) return res.status(500).json({ success: false, message: 'Model unavailable' });

      const task = await Task.findOne({ where: { id: item_id, user_id: userId } });
      if (!task) return res.status(404).json({ success: false, message: 'المهمة غير موجودة' });

      if (task.status === 'completed') {
        return res.json({ success: true, data: { already_completed: true, message: '✅ تم مسبقاً!' } });
      }

      await Task.update({ status: 'completed', completed_at: new Date() }, { where: { id: item_id, user_id: userId } });

      res.json({
        success: true,
        data: {
          action: 'complete_task',
          task_title: task.title,
          xp: 20,
          message: `✅ "${task.title}" مكتملة! +20 XP ⚡`,
        },
      });

    } else {
      return res.status(400).json({ success: false, message: 'action غير صالح أو item_id مفقود' });
    }
  } catch (err) {
    logger.error('[PHASE6] /quick-action error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// MONETIZATION — Freemium Feature Gate
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /phase6/subscription-gate
 * Check which Phase 6 features are available for the user's plan
 */
router.get('/subscription-gate', async (req, res) => {
  try {
    const plan = req.user.subscription_plan || 'free';
    const isPro = ['premium', 'enterprise', 'trial'].includes(plan);

    const features = {
      // Free features
      smart_notifications: true,              // Basic smart notifications
      daily_plan: true,                        // Start/complete/skip blocks
      habit_tracking: true,                    // Up to 5 habits
      task_management: true,                   // Up to 20 tasks
      basic_analytics: true,                   // 7-day overview
      streak_tracking: true,                   // Basic streak display

      // Pro features
      advanced_ai_planning: isPro,            // AI-powered plan optimization
      weekly_narrative: isPro,                 // Weekly story + predictions
      unlimited_habits: isPro,                 // Unlimited habits (free: 5)
      unlimited_tasks: isPro,                  // Unlimited tasks (free: 20)
      advanced_insights: isPro,                // Trend detection, predictions
      perfect_day_badge: isPro,                // Perfect Day system
      adaptive_intelligence: isPro,            // Adaptive V2 engine
      cross_day_intelligence: isPro,           // Weekly narratives + trends
      energy_interventions: isPro,             // Energy-drop interventions
      procrastination_detection: isPro,        // Procrastination alerts
      export_data: isPro,                      // CSV/PDF export
      priority_support: isPro,                 // Priority support
    };

    const limits = {
      habits: isPro ? Infinity : 5,
      tasks: isPro ? Infinity : 20,
      daily_notifications: isPro ? 8 : 3,
      analytics_days: isPro ? 90 : 7,
    };

    res.json({
      success: true,
      data: {
        plan,
        is_pro: isPro,
        features,
        limits,
        upgrade_cta: !isPro ? {
          message_ar: '🚀 ارتقِ للنسخة Pro — ذكاء تكيفي، تحليلات متقدمة، عادات غير محدودة!',
          price: '$4.99/شهر',
          trial_days: 7,
        } : null,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

module.exports = router;
