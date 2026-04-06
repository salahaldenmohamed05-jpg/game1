/**
 * Daily Execution Flow Routes — Phase 4.5: System Hardening
 * ===========================================================
 * HARDENING CHANGES:
 *   - Block status guards: prevent double-complete, completing skipped blocks
 *   - Idempotent habit check-in: no streak increment if already completed today
 *   - Start-day guard: prevent overwriting active plan
 *   - End-day: uses ALL completed tasks (not just due_date=today) for score
 *   - Input sanitization on all text fields
 *   - Consistent task counts via analytics.service.js
 *   - Balanced plan generation: more tasks, fewer habit blocks
 *
 * Endpoints:
 *   GET  /daily-flow/status        — Get current day state
 *   POST /daily-flow/start-day     — Start the day (guarded)
 *   GET  /daily-flow/plan          — Get today's plan
 *   POST /daily-flow/complete-block — Complete a block (idempotent, guarded)
 *   POST /daily-flow/skip-block    — Skip block with reason (guarded)
 *   POST /daily-flow/check-habit   — Check-in habit (idempotent)
 *   POST /daily-flow/end-day       — End day (guarded)
 *   GET  /daily-flow/narrative     — Get day narrative
 *   POST /daily-flow/reset-day     — Reset day state
 */

'use strict';

const express = require('express');
const router = express.Router();
const { Op } = require('sequelize');
const moment = require('moment-timezone');
const { protect } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

// ── Lazy model loaders ─────────────────────────────────────────────────────
function getModels() {
  const m = {};
  try { m.Task = require('../models/task.model'); } catch (_) {}
  try { m.Habit = require('../models/habit.model').Habit; } catch (_) {}
  try { m.HabitLog = require('../models/habit.model').HabitLog; } catch (_) {}
  try { m.MoodEntry = require('../models/mood.model'); } catch (_) {}
  try { m.DayPlan = require('../models/day_plan.model'); } catch (_) {}
  try { m.Goal = require('../models/goal.model'); } catch (_) {}
  try { m.User = require('../models/user.model'); } catch (_) {}
  try { m.ExecutionSession = require('../models/execution_session.model'); } catch (_) {}
  return m;
}

function getGoalEngine() {
  try { return require('../services/goal.engine.service'); } catch (_) { return null; }
}

// ── Input sanitization ─────────────────────────────────────────────────────
function sanitizeText(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<[^>]*>/g, '')           // Strip HTML tags
    .replace(/[<>"'`;]/g, '')          // Remove dangerous chars
    .trim()
    .slice(0, 1000);                   // Max 1000 chars
}

// All routes require authentication
router.use(protect);

// ── Helper: Get greeting based on hour ─────────────────────────────────────
function getGreeting(hour, name) {
  const n = name || '';
  if (hour < 12) return `صباح الخير يا ${n} ☀️`;
  if (hour < 17) return `مساء النور يا ${n} 🌤️`;
  if (hour < 21) return `مساء الخير يا ${n} 🌆`;
  return `أهلاً يا ${n} 🌙`;
}

// ── Helper: Calculate XP reward ────────────────────────────────────────────
function calculateBlockReward(block, streak = 0) {
  let xp = 10; // base
  if (block.type === 'focus' || block.type === 'deep_work') xp = 25;
  else if (block.type === 'habit') xp = 15;
  else if (block.type === 'task') xp = 20;
  else if (block.type === 'break') xp = 5;
  // Streak bonus
  if (streak >= 7) xp += 15;
  else if (streak >= 3) xp += 10;
  else if (streak >= 1) xp += 5;
  return xp;
}

// ── Helper: Build BALANCED plan blocks ─────────────────────────────────────
// HARDENED: Tasks get priority. Habits are capped. Completed habits pre-marked.
function buildPlanBlocks(tasks, habits, habitLogs, hour, energy) {
  const blocks = [];
  let blockId = 1;

  // Determine completed habit IDs
  const completedHabitIds = new Set(
    (habitLogs || []).filter(l => l.completed).map(l => String(l.habit_id))
  );

  // Sort tasks by priority
  const priorityMap = { urgent: 0, high: 1, medium: 2, low: 3 };
  const sortedTasks = [...(tasks || [])].sort((a, b) => {
    const pa = priorityMap[a.priority] ?? 2;
    const pb = priorityMap[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return (b.ai_priority_score || 0) - (a.ai_priority_score || 0);
  });

  // --- BALANCED PLAN: Include up to 10 tasks, cap habits at 5 ---

  // Focus block for top priority task (deep work)
  if (sortedTasks.length > 0) {
    const top = sortedTasks[0];
    blocks.push({
      id: `block_${blockId++}`,
      type: 'focus',
      task_id: top.id,
      goal_id: top.goal_id || null,
      title: top.title_ar || top.title || 'مهمة',
      duration: top.estimated_minutes || 25,
      status: top.status === 'completed' ? 'completed' : 'pending',
      priority: top.priority,
      icon: '🎯',
      color: '#6C63FF',
    });
  }

  // Break after deep focus
  if (sortedTasks.length > 0) {
    blocks.push({
      id: `block_${blockId++}`,
      type: 'break',
      title: 'استراحة قصيرة',
      duration: 10,
      status: 'pending',
      icon: '☕',
      color: '#F59E0B',
    });
  }

  // Morning habits (max 2)
  const morningHabits = (habits || []).filter(h => {
    const pt = h.preferred_time || '';
    return pt === 'morning' || pt === 'صباحاً';
  }).slice(0, 2);
  for (const h of morningHabits) {
    blocks.push({
      id: `block_${blockId++}`,
      type: 'habit',
      habit_id: h.id,
      title: h.name_ar || h.name || 'عادة',
      duration: 10,
      status: completedHabitIds.has(String(h.id)) ? 'completed' : 'pending',
      icon: h.icon || '🔄',
      color: h.color || '#10B981',
      streak: h.current_streak || 0,
    });
  }

  // Remaining tasks (up to 9 more, total 10 tasks)
  const MAX_TASKS = 10;
  for (let i = 1; i < Math.min(sortedTasks.length, MAX_TASKS); i++) {
    const t = sortedTasks[i];
    blocks.push({
      id: `block_${blockId++}`,
      type: 'task',
      task_id: t.id,
      goal_id: t.goal_id || null,
      title: t.title_ar || t.title || 'مهمة',
      duration: t.estimated_minutes || 20,
      status: t.status === 'completed' ? 'completed' : 'pending',
      priority: t.priority,
      icon: '📋',
      color: '#8B5CF6',
    });

    // Break every 3 tasks
    if (i % 3 === 0 && i < sortedTasks.length - 1) {
      blocks.push({
        id: `block_${blockId++}`,
        type: 'break',
        title: 'استراحة',
        duration: 5,
        status: 'pending',
        icon: '☕',
        color: '#F59E0B',
      });
    }
  }

  // Evening/other habits (max 3, total habits capped at 5)
  const placedHabitIds = new Set(blocks.filter(b => b.habit_id).map(b => String(b.habit_id)));
  const remainingHabits = (habits || []).filter(h => !placedHabitIds.has(String(h.id)));
  const MAX_REMAINING_HABITS = 3;
  for (const h of remainingHabits.slice(0, MAX_REMAINING_HABITS)) {
    blocks.push({
      id: `block_${blockId++}`,
      type: 'habit',
      habit_id: h.id,
      title: h.name_ar || h.name || 'عادة',
      duration: 10,
      status: completedHabitIds.has(String(h.id)) ? 'completed' : 'pending',
      icon: h.icon || '🔄',
      color: h.color || '#10B981',
      streak: h.current_streak || 0,
    });
  }

  // End-of-day review block
  blocks.push({
    id: `block_${blockId++}`,
    type: 'review',
    title: 'مراجعة نهاية اليوم',
    duration: 10,
    status: 'pending',
    icon: '📊',
    color: '#6B7280',
  });

  return blocks;
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /daily-flow/status — Current day state
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/status', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');
    const hour = moment.tz(tz).hour();

    // HARDENED: Hydrate from DB if not in memory (survives restart)
    await hydrateFromDB(userId, today);

    // Check if day was started
    const dayStarted = localStorage_dayState.get(`${userId}:${today}:started`);
    const dayEnded = localStorage_dayState.get(`${userId}:${today}:ended`);

    let state = 'not_started';
    if (dayEnded) state = 'completed';
    else if (dayStarted) state = 'active';

    // HARDENED: Use consistent counting — ALL pending tasks + overdue
    const { Task, Habit, HabitLog } = getModels();
    const [allTasks, habits, habitLogs] = await Promise.all([
      Task ? Task.findAll({
        where: { user_id: userId },
        attributes: ['id', 'status', 'due_date', 'completed_at'],
        raw: true,
      }) : [],
      Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
      HabitLog ? HabitLog.findAll({ where: { user_id: userId, log_date: today }, raw: true }) : [],
    ]);

    const pendingTasks = allTasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
    const completedTasks = allTasks.filter(t => t.status === 'completed');
    const overdueTasks = allTasks.filter(t => {
      if (t.status === 'completed') return false;
      if (!t.due_date) return false;
      return String(t.due_date).split('T')[0] < today;
    });
    const completedHabits = habitLogs.filter(l => l.completed).length;

    res.json({
      success: true,
      data: {
        state,
        date: today,
        hour,
        stats: {
          total_tasks: allTasks.length,
          pending_tasks: pendingTasks.length,
          completed_tasks: completedTasks.length,
          overdue_tasks: overdueTasks.length,
          total_habits: habits.length,
          completed_habits: completedHabits,
        },
        plan_exists: localStorage_dayState.has(`${userId}:${today}:plan`),
      },
    });
  } catch (err) {
    logger.error('[DAILY-FLOW] /status error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب حالة اليوم' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /daily-flow/start-day — Start the day + generate plan
// HARDENED: Prevents double-start (returns existing plan if already started)
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/start-day', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const now = moment.tz(tz);
    const today = now.format('YYYY-MM-DD');
    const hour = now.hour();
    const userName = req.user.name?.split(' ')[0] || '';

    // GUARD: Prevent double start — return existing plan
    const existingPlan = localStorage_dayState.get(`${userId}:${today}:plan`);
    const dayEnded = localStorage_dayState.get(`${userId}:${today}:ended`);

    if (dayEnded) {
      return res.status(409).json({
        success: false,
        message: 'اليوم انتهى بالفعل. ابدأ يوم جديد غداً أو أعد التعيين.',
      });
    }

    if (existingPlan) {
      // Return existing plan instead of overwriting
      const greeting = getGreeting(hour, userName);
      return res.json({
        success: true,
        data: {
          greeting,
          context: 'خطتك موجودة بالفعل — استمر!',
          already_started: true,
          plan: existingPlan,
        },
      });
    }

    const { Task, Habit, HabitLog, Goal } = getModels();

    // Fetch all data in parallel — include overdue + today + no due date
    const [tasks, habits, habitLogs, goals] = await Promise.all([
      Task ? Task.findAll({
        where: {
          user_id: userId,
          status: { [Op.in]: ['pending', 'in_progress'] },
          [Op.or]: [
            { due_date: { [Op.lte]: today } },
            { due_date: null },
            { status: 'in_progress' },
          ],
        },
        order: [['priority', 'ASC'], ['due_date', 'ASC'], ['ai_priority_score', 'DESC']],
        limit: 20,
        raw: true,
      }) : [],
      Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
      HabitLog ? HabitLog.findAll({ where: { user_id: userId, log_date: today }, raw: true }) : [],
      Goal ? Goal.findAll({ where: { user_id: userId, status: 'active' }, raw: true, limit: 5 }) : [],
    ]);

    // Deduplicate tasks by id
    const uniqueTasks = tasks.filter((t, idx, arr) => arr.findIndex(x => x.id === t.id) === idx);

    const overdueTasks = uniqueTasks.filter(t => {
      if (!t.due_date) return false;
      return String(t.due_date).split('T')[0] < today;
    });

    // Energy estimate
    let energy = 'عالية ⚡';
    if (hour >= 14 && hour < 18) energy = 'متوسطة 🔋';
    else if (hour >= 18) energy = 'منخفضة 😌';

    const mainGoal = goals.length > 0 ? (goals[0].title || goals[0].title_ar || 'تحقيق أهدافك') : 'تنظيم يومك';

    // Build BALANCED plan blocks
    const blocks = buildPlanBlocks(uniqueTasks, habits, habitLogs, hour, energy);

    const plan = {
      date: today,
      started_at: now.toISOString(),
      blocks,
      stats: {
        total_blocks: blocks.length,
        completed_blocks: blocks.filter(b => b.status === 'completed').length,
        total_tasks: uniqueTasks.length,
        total_habits: habits.length,
        overdue_tasks: overdueTasks.length,
      },
    };

    localStorage_dayState.set(`${userId}:${today}:started`, true);
    localStorage_dayState.set(`${userId}:${today}:plan`, plan);
    localStorage_dayState.set(`${userId}:${today}:xp`, 0);
    localStorage_dayState.set(`${userId}:${today}:completed_blocks`, []);

    // Persist to DayPlan model
    const { DayPlan } = getModels();
    if (DayPlan) {
      try {
        await DayPlan.upsert({
          user_id: userId,
          plan_date: today,
          schedule: blocks,
          total_blocks: blocks.length,
          completed_blocks: 0,
          completion_rate: 0,
        });
      } catch (_) {}
    }

    const greeting = getGreeting(hour, userName);

    res.json({
      success: true,
      data: {
        greeting,
        context: `${uniqueTasks.length} مهمة (${overdueTasks.length} متأخرة) • هدفك: ${mainGoal}`,
        energy_estimate: energy,
        day_snapshot: {
          tasks_count: uniqueTasks.length,
          habits_count: habits.length,
          overdue_count: overdueTasks.length,
          main_goal: mainGoal,
          goals_count: goals.length,
        },
        plan,
        motivational: hour < 12
          ? 'جاهز نبدأ يوم بسيط ومنظم؟ 💪'
          : hour < 18
            ? 'لسه في وقت تنجز فيه كتير! 🚀'
            : 'يلا نخلّص اللي فاضل ونختم اليوم بقوة 🌙',
      },
    });
  } catch (err) {
    logger.error('[DAILY-FLOW] /start-day error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في بدء اليوم' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /daily-flow/plan — Get today's plan
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/plan', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');

    let plan = localStorage_dayState.get(`${userId}:${today}:plan`);

    // Fallback: try DB
    if (!plan) {
      const { DayPlan } = getModels();
      if (DayPlan) {
        const dbPlan = await DayPlan.findOne({ where: { user_id: userId, plan_date: today } });
        if (dbPlan) {
          plan = {
            date: today,
            blocks: dbPlan.schedule || [],
            stats: {
              total_blocks: dbPlan.total_blocks || 0,
              completed_blocks: dbPlan.completed_blocks || 0,
            },
          };
          // Re-hydrate in-memory state from DB
          localStorage_dayState.set(`${userId}:${today}:plan`, plan);
          localStorage_dayState.set(`${userId}:${today}:started`, true);
        }
      }
    }

    if (!plan) {
      return res.json({ success: true, data: { plan: null, state: 'not_started' } });
    }

    const currentBlock = plan.blocks.find(b => b.status === 'pending') || null;
    const completedCount = plan.blocks.filter(b => b.status === 'completed').length;
    const totalXp = localStorage_dayState.get(`${userId}:${today}:xp`) || 0;

    res.json({
      success: true,
      data: {
        plan,
        current_block: currentBlock,
        progress: {
          completed: completedCount,
          total: plan.blocks.length,
          percentage: plan.blocks.length > 0 ? Math.round((completedCount / plan.blocks.length) * 100) : 0,
          xp_earned: totalXp,
        },
      },
    });
  } catch (err) {
    logger.error('[DAILY-FLOW] /plan error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب الخطة' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /daily-flow/complete-block — Complete a block (IDEMPOTENT + GUARDED)
// HARDENED: Rejects already-completed, already-skipped blocks. No double XP.
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/complete-block', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');
    const { block_id } = req.body;

    // HARDENED: Hydrate from DB if not in memory
    await hydrateFromDB(userId, today);

    if (!block_id) {
      return res.status(400).json({ success: false, message: 'block_id مطلوب' });
    }

    const plan = localStorage_dayState.get(`${userId}:${today}:plan`);
    if (!plan) {
      return res.status(400).json({ success: false, message: 'لا توجد خطة نشطة — ابدأ يومك أولاً' });
    }

    const blockIndex = plan.blocks.findIndex(b => b.id === block_id);
    if (blockIndex === -1) {
      return res.status(404).json({ success: false, message: 'البلوك غير موجود' });
    }

    const block = plan.blocks[blockIndex];

    // ── CRITICAL GUARD: Only pending blocks can be completed ──
    if (block.status === 'completed') {
      // Idempotent: return success but no additional XP
      return res.json({
        success: true,
        data: {
          completed_block: block,
          reward: { xp: 0, total_xp: localStorage_dayState.get(`${userId}:${today}:xp`) || 0, message: 'تم إكمال هذا البلوك مسبقاً ✅', achievement: null, streak: block.streak || 0 },
          already_completed: true,
          next_block: plan.blocks.find(b => b.status === 'pending') || null,
          progress: { completed: plan.blocks.filter(b => b.status === 'completed').length, total: plan.blocks.length, percentage: plan.blocks.length > 0 ? Math.round((plan.blocks.filter(b => b.status === 'completed').length / plan.blocks.length) * 100) : 0 },
          all_done: plan.blocks.every(b => b.status !== 'pending'),
        },
      });
    }

    if (block.status === 'skipped') {
      return res.status(409).json({
        success: false,
        message: 'لا يمكن إكمال بلوك تم تخطيه. يمكنك إكمال البلوك التالي.',
      });
    }

    // Mark as completed
    block.status = 'completed';
    block.completed_at = moment.tz(tz).toISOString();

    // Update real data in DB
    const { Task, Habit, HabitLog } = getModels();

    if (block.type === 'focus' || block.type === 'task') {
      if (block.task_id && Task) {
        try {
          await Task.update(
            { status: 'completed', completed_at: new Date() },
            { where: { id: block.task_id, user_id: userId } }
          );
        } catch (_) {}
      }
    } else if (block.type === 'habit') {
      if (block.habit_id && Habit && HabitLog) {
        try {
          const habit = await Habit.findOne({ where: { id: block.habit_id, user_id: userId } });
          if (habit) {
            // HARDENED: Check if already completed today (idempotent)
            const existingLog = await HabitLog.findOne({
              where: { habit_id: block.habit_id, user_id: userId, log_date: today, completed: true },
            });

            if (!existingLog) {
              await HabitLog.upsert({
                habit_id: block.habit_id,
                user_id: userId,
                log_date: today,
                completed: true,
                value: habit.habit_type === 'boolean' ? 1 : (habit.target_value || 1),
              });
              // Only increment streak if not already completed today
              const newStreak = (habit.current_streak || 0) + 1;
              await Habit.update(
                {
                  current_streak: newStreak,
                  best_streak: Math.max(newStreak, habit.best_streak || 0),
                  last_completed: today,
                },
                { where: { id: block.habit_id } }
              );
              block.streak = newStreak;
            } else {
              // Already completed — keep existing streak
              block.streak = habit.current_streak || 0;
            }
          }
        } catch (_) {}
      }
    }

    // Calculate reward
    const streak = block.streak || 0;
    const xp = calculateBlockReward(block, streak);

    // Update plan in memory
    plan.blocks[blockIndex] = block;
    plan.stats.completed_blocks = plan.blocks.filter(b => b.status === 'completed').length;
    localStorage_dayState.set(`${userId}:${today}:plan`, plan);

    // Track XP
    const totalXp = (localStorage_dayState.get(`${userId}:${today}:xp`) || 0) + xp;
    localStorage_dayState.set(`${userId}:${today}:xp`, totalXp);

    // Track completed blocks
    const completedBlocks = localStorage_dayState.get(`${userId}:${today}:completed_blocks`) || [];
    completedBlocks.push({ block_id, xp, completed_at: block.completed_at });
    localStorage_dayState.set(`${userId}:${today}:completed_blocks`, completedBlocks);

    // Persist to DayPlan in DB
    const { DayPlan } = getModels();
    if (DayPlan) {
      try {
        await DayPlan.update(
          { schedule: plan.blocks, completed_blocks: plan.stats.completed_blocks, completion_rate: plan.blocks.length > 0 ? plan.stats.completed_blocks / plan.blocks.length : 0 },
          { where: { user_id: userId, plan_date: today } }
        );
      } catch (_) {}
    }

    // Update goal progress if applicable
    let goalProgress = null;
    if (block.goal_id) {
      const goalEngine = getGoalEngine();
      if (goalEngine) {
        try {
          await goalEngine.updateGoalProgress(block.goal_id, userId);
          const { Goal } = getModels();
          if (Goal) {
            const goal = await Goal.findByPk(block.goal_id);
            if (goal) {
              goalProgress = {
                goal_title: goal.title || goal.title_ar,
                progress: goal.progress || 0,
                message: `تقدمت في هدف "${goal.title || goal.title_ar}" 📈`,
              };
            }
          }
        } catch (_) {}
      }
    }

    // Find next block and compute progress
    const nextBlock = plan.blocks.find(b => b.status === 'pending') || null;
    const completedCount = plan.blocks.filter(b => b.status === 'completed').length;
    const percentage = plan.blocks.length > 0 ? Math.round((completedCount / plan.blocks.length) * 100) : 0;

    // Generate reward message
    let rewardMessage = `أحسنت! +${xp} XP 🎉`;
    let achievement = null;
    if (completedCount === plan.blocks.length) {
      rewardMessage = `🏆 أنجزت كل خطة اليوم! +${xp} XP`;
      achievement = 'day_complete';
    } else if (completedCount >= 5) {
      rewardMessage = `🔥 إنجاز رائع! ${completedCount} بلوك مكتمل — +${xp} XP`;
      achievement = 'streak_5';
    } else if (streak >= 7) {
      rewardMessage = `🔥🔥 سلسلة ${streak} يوم! +${xp} XP`;
    } else if (streak >= 3) {
      rewardMessage = `🔥 ${streak} أيام متتالية! +${xp} XP`;
    }

    // Phase 6: Report to Adaptive Intelligence V2
    let adaptiveInsight = null;
    try {
      const adaptiveV2 = require('../services/adaptive.intelligence.v2');
      const result = adaptiveV2.onBlockComplete(userId, { ...block, xp });
      adaptiveInsight = {
        energy_level: result?.state?.energyLevel,
        momentum_pct: result?.state?.momentum ? Math.round(result.state.momentum * 100) : null,
        recommendations: (result?.recommendations || []).filter(r => r.type !== 'intensity_adjustment').slice(0, 2),
      };
    } catch (_) {}

    // Phase 6: Check Perfect Day status
    let perfectDayCheck = null;
    if (completedCount === plan.blocks.length) {
      try {
        const crossDay = require('../services/cross.day.intelligence');
        perfectDayCheck = await crossDay.checkPerfectDay(userId, tz);
      } catch (_) {}
    }

    res.json({
      success: true,
      data: {
        completed_block: block,
        reward: { xp, total_xp: totalXp, message: rewardMessage, achievement, streak },
        goal_progress: goalProgress,
        next_block: nextBlock,
        progress: { completed: completedCount, total: plan.blocks.length, percentage },
        momentum: percentage >= 60
          ? '🔥 أنت داخل في flow! استمر!'
          : percentage >= 30
            ? '💪 تقدم ممتاز، واصل!'
            : '🚀 بداية قوية!',
        all_done: completedCount === plan.blocks.length,
        adaptive: adaptiveInsight,
        perfect_day: perfectDayCheck,
      },
    });
  } catch (err) {
    logger.error('[DAILY-FLOW] /complete-block error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في إكمال البلوك' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /daily-flow/skip-block — Skip a block with reason (GUARDED)
// HARDENED: Only pending blocks can be skipped
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/skip-block', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');
    const { block_id, reason } = req.body;

    if (!block_id) {
      return res.status(400).json({ success: false, message: 'block_id مطلوب' });
    }

    const plan = localStorage_dayState.get(`${userId}:${today}:plan`);
    if (!plan) return res.status(400).json({ success: false, message: 'لا توجد خطة نشطة' });

    const blockIndex = plan.blocks.findIndex(b => b.id === block_id);
    if (blockIndex === -1) return res.status(404).json({ success: false, message: 'البلوك غير موجود' });

    const block = plan.blocks[blockIndex];

    // GUARD: Only pending blocks can be skipped
    if (block.status !== 'pending') {
      return res.status(409).json({
        success: false,
        message: block.status === 'completed'
          ? 'لا يمكن تخطي بلوك مكتمل'
          : 'تم تخطي هذا البلوك مسبقاً',
      });
    }

    block.status = 'skipped';
    block.skip_reason = sanitizeText(reason) || 'other';
    plan.blocks[blockIndex] = block;
    localStorage_dayState.set(`${userId}:${today}:plan`, plan);

    const nextBlock = plan.blocks.find(b => b.status === 'pending') || null;

    let recovery = 'مفيش مشكلة — نكمل اللي بعده! 💪';
    if (reason === 'overwhelmed') recovery = 'خذ نفس عميق. نبدأ بحاجة أسهل 🧘';
    else if (reason === 'low_energy') recovery = 'طاقتك مهمة — نخلي الصعب لبكرة 😌';
    else if (reason === 'busy') recovery = 'وقتك ضيق — نركز على الأهم بس ⏰';

    // Phase 6: Report to Adaptive Intelligence V2
    let adaptiveInsight = null;
    try {
      const adaptiveV2 = require('../services/adaptive.intelligence.v2');
      const result = adaptiveV2.onBlockSkip(userId, block, reason || 'other');
      adaptiveInsight = {
        energy_level: result?.state?.energyLevel,
        procrastination_detected: result?.state?.procrastination,
        burnout_risk: result?.state?.burnoutRisk,
        recommendations: (result?.recommendations || []).filter(r => r.type !== 'intensity_adjustment').slice(0, 2),
      };

      // If adaptive engine suggests a break, update recovery message
      const breakRec = result?.recommendations?.find(r => r.type === 'energy_intervention');
      if (breakRec) {
        recovery = breakRec.message_ar || recovery;
      }

      // If procrastination detected, add intervention message
      const procRec = result?.recommendations?.find(r => r.type === 'procrastination_intervention');
      if (procRec) {
        recovery = procRec.message_ar || recovery;
      }
    } catch (_) {}

    res.json({
      success: true,
      data: {
        skipped_block: block,
        next_block: nextBlock,
        recovery_message: recovery,
        adaptive: adaptiveInsight,
      },
    });
  } catch (err) {
    logger.error('[DAILY-FLOW] /skip-block error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /daily-flow/check-habit — Check-in habit (IDEMPOTENT)
// HARDENED: No double streak increment
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/check-habit', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');
    const { habit_id, value } = req.body;

    if (!habit_id) {
      return res.status(400).json({ success: false, message: 'habit_id مطلوب' });
    }

    const { Habit, HabitLog } = getModels();
    if (!Habit || !HabitLog) return res.status(500).json({ success: false, message: 'Habit model unavailable' });

    const habit = await Habit.findOne({ where: { id: habit_id, user_id: userId } });
    if (!habit) return res.status(404).json({ success: false, message: 'العادة غير موجودة' });

    // HARDENED: Check if already completed today (idempotent)
    const existingLog = await HabitLog.findOne({
      where: { habit_id, user_id: userId, log_date: today, completed: true },
    });

    let newStreak = habit.current_streak || 0;
    let alreadyCompleted = false;

    if (existingLog) {
      // Already completed — idempotent response, no streak change
      alreadyCompleted = true;
    } else {
      // First completion today
      const logValue = value || (habit.habit_type === 'boolean' ? 1 : habit.target_value || 1);
      await HabitLog.upsert({
        habit_id, user_id: userId, log_date: today, completed: true, value: logValue,
      });

      newStreak = (habit.current_streak || 0) + 1;
      await Habit.update(
        { current_streak: newStreak, best_streak: Math.max(newStreak, habit.best_streak || 0), last_completed: today },
        { where: { id: habit_id } }
      );
    }

    // Update plan block if exists
    const plan = localStorage_dayState.get(`${userId}:${today}:plan`);
    if (plan) {
      const habitBlock = plan.blocks.find(b => String(b.habit_id) === String(habit_id));
      if (habitBlock && habitBlock.status === 'pending') {
        habitBlock.status = 'completed';
        habitBlock.streak = newStreak;
        localStorage_dayState.set(`${userId}:${today}:plan`, plan);
      }
    }

    // Only award XP if first completion
    let xp = 0;
    let totalXp = localStorage_dayState.get(`${userId}:${today}:xp`) || 0;
    if (!alreadyCompleted) {
      xp = calculateBlockReward({ type: 'habit' }, newStreak);
      totalXp += xp;
      localStorage_dayState.set(`${userId}:${today}:xp`, totalXp);
    }

    let streakMessage = null;
    if (newStreak >= 30) streakMessage = `🏆 ${newStreak} يوم! أنت أسطورة!`;
    else if (newStreak >= 7) streakMessage = `🔥🔥 ${newStreak} أيام متتالية!`;
    else if (newStreak >= 3) streakMessage = `🔥 ${newStreak} أيام! استمر!`;

    res.json({
      success: true,
      data: {
        habit_id,
        streak: newStreak,
        xp,
        total_xp: totalXp,
        already_completed: alreadyCompleted,
        reward_message: alreadyCompleted
          ? `✅ ${habit.name_ar || habit.name} — تم إكماله مسبقاً اليوم`
          : `✅ ${habit.name_ar || habit.name} — +${xp} XP`,
        streak_message: streakMessage,
        cue_next: 'جاهز للخطوة التالية؟ 👉',
      },
    });
  } catch (err) {
    logger.error('[DAILY-FLOW] /check-habit error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /daily-flow/end-day — End day (HARDENED score calculation)
// FIXED: Uses ALL completed tasks (not just due_date=today) for score
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/end-day', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');
    const { reflection_text } = req.body;

    // GUARD: Prevent ending day that hasn't started
    const dayStarted = localStorage_dayState.get(`${userId}:${today}:started`);
    if (!dayStarted) {
      return res.status(400).json({ success: false, message: 'لم يتم بدء اليوم بعد' });
    }

    // GUARD: Prevent double end
    const dayEnded = localStorage_dayState.get(`${userId}:${today}:ended`);
    if (dayEnded) {
      const existingNarrative = localStorage_dayState.get(`${userId}:${today}:narrative`);
      return res.json({ success: true, data: existingNarrative || {}, already_ended: true });
    }

    const plan = localStorage_dayState.get(`${userId}:${today}:plan`);
    const totalXp = localStorage_dayState.get(`${userId}:${today}:xp`) || 0;

    const { Task, Habit, HabitLog, Goal } = getModels();

    // FIXED: Count ALL tasks completed today (by completed_at date, not due_date)
    const [allTasks, habits, habitLogs, goals] = await Promise.all([
      Task ? Task.findAll({ where: { user_id: userId }, raw: true }) : [],
      Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
      HabitLog ? HabitLog.findAll({ where: { user_id: userId, log_date: today }, raw: true }) : [],
      Goal ? Goal.findAll({ where: { user_id: userId, status: 'active' }, raw: true, limit: 5 }) : [],
    ]);

    // Tasks completed today (by completed_at, not due_date)
    const completedTasksToday = allTasks.filter(t => {
      if (t.status !== 'completed' || !t.completed_at) return false;
      return moment(t.completed_at).tz(tz).format('YYYY-MM-DD') === today;
    });

    // All pending + overdue (the denominator for task score)
    const pendingAndOverdue = allTasks.filter(t => {
      if (t.status === 'completed') return false;
      if (!t.due_date) return true; // no date = should still count
      return String(t.due_date).split('T')[0] <= today;
    });

    const totalRelevantTasks = completedTasksToday.length + pendingAndOverdue.length;

    const completedHabits = habitLogs.filter(l => l.completed).length;
    const planBlocks = plan?.blocks || [];
    const planCompleted = planBlocks.filter(b => b.status === 'completed').length;
    const planSkipped = planBlocks.filter(b => b.status === 'skipped').length;
    const planPending = planBlocks.filter(b => b.status === 'pending').length;

    // Goal progress
    const goalProgress = goals.map(g => ({
      title: g.title || g.title_ar || 'هدف',
      progress: g.progress || 0,
      status: g.progress >= 80 ? 'on_track' : g.progress >= 40 ? 'needs_attention' : 'at_risk',
    }));

    // FIXED score: uses completed_today vs all relevant tasks
    const taskScore = totalRelevantTasks > 0 ? Math.round((completedTasksToday.length / totalRelevantTasks) * 100) : 0;
    const habitScore = habits.length > 0 ? Math.round((completedHabits / habits.length) * 100) : 0;
    const planScore = planBlocks.length > 0 ? Math.round((planCompleted / planBlocks.length) * 100) : 0;
    const dayScore = Math.round((taskScore * 0.4 + habitScore * 0.3 + planScore * 0.3));

    let narrativeTitle = '';
    let narrativeEmoji = '';
    if (dayScore >= 80) { narrativeTitle = 'يوم استثنائي!'; narrativeEmoji = '🏆'; }
    else if (dayScore >= 60) { narrativeTitle = 'يوم ممتاز!'; narrativeEmoji = '🌟'; }
    else if (dayScore >= 40) { narrativeTitle = 'يوم جيد'; narrativeEmoji = '👍'; }
    else if (dayScore >= 20) { narrativeTitle = 'يوم فيه تحديات'; narrativeEmoji = '💪'; }
    else { narrativeTitle = 'بكرة أحسن إن شاء الله'; narrativeEmoji = '🌱'; }

    const narrative = {
      date: today,
      title: `${narrativeEmoji} ${narrativeTitle}`,
      score: dayScore,
      xp_earned: totalXp,
      achievements: {
        tasks: { completed: completedTasksToday.length, total: totalRelevantTasks, score: taskScore },
        habits: { completed: completedHabits, total: habits.length, score: habitScore },
        plan: { completed: planCompleted, total: planBlocks.length, skipped: planSkipped, pending: planPending, score: planScore },
      },
      goal_progress: goalProgress,
      reflection: sanitizeText(reflection_text) || null,
      highlights: [],
      tomorrow_preview: 'جاهز ليوم جديد؟ ابدأ بكرة من هنا! 🚀',
    };

    if (completedTasksToday.length > 0) narrative.highlights.push(`✅ أكملت ${completedTasksToday.length} مهمة`);
    if (completedHabits > 0) narrative.highlights.push(`🔄 أنجزت ${completedHabits} عادة`);
    if (totalXp > 50) narrative.highlights.push(`⚡ كسبت ${totalXp} XP`);
    const streakHabits = habits.filter(h => (h.current_streak || 0) >= 3);
    if (streakHabits.length > 0) narrative.highlights.push(`🔥 ${streakHabits.length} عادة في سلسلة!`);

    // Mark day as ended
    localStorage_dayState.set(`${userId}:${today}:ended`, true);
    localStorage_dayState.set(`${userId}:${today}:narrative`, narrative);

    // Persist to DayPlan
    const { DayPlan } = getModels();
    if (DayPlan) {
      try {
        await DayPlan.update(
          {
            completed_blocks: planCompleted,
            completion_rate: planBlocks.length > 0 ? planCompleted / planBlocks.length : 0,
            user_rating: req.body.rating || null,
            user_notes: sanitizeText(reflection_text) || null,
          },
          { where: { user_id: userId, plan_date: today } }
        );
      } catch (_) {}
    }

    res.json({ success: true, data: narrative });
  } catch (err) {
    logger.error('[DAILY-FLOW] /end-day error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في إنهاء اليوم' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /daily-flow/narrative — Get day narrative
// ═══════════════════════════════════════════════════════════════════════════════
router.get('/narrative', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');

    const narrative = localStorage_dayState.get(`${userId}:${today}:narrative`);
    if (!narrative) {
      return res.json({ success: true, data: null, message: 'اليوم لم ينتهِ بعد' });
    }

    res.json({ success: true, data: narrative });
  } catch (err) {
    logger.error('[DAILY-FLOW] /narrative error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /daily-flow/reset-day — Reset day state
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/reset-day', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');

    // Clear in-memory state
    const prefix = `${userId}:${today}:`;
    for (const key of localStorage_dayState.keys()) {
      if (key.startsWith(prefix)) {
        localStorage_dayState.delete(key);
      }
    }

    // HARDENED: Also clear DB record to prevent hydrateFromDB from restoring old state
    const { DayPlan } = getModels();
    if (DayPlan) {
      try {
        const deleted = await DayPlan.destroy({ where: { user_id: userId, plan_date: today } });
        logger.info(`[DAILY-FLOW] Deleted ${deleted} DayPlan record(s) for user ${userId} on ${today}`);
      } catch (e) {
        logger.warn(`[DAILY-FLOW] DayPlan delete failed: ${e.message}`);
      }
    }

    logger.info(`[DAILY-FLOW] Day reset for user ${userId} on ${today}`);

    res.json({
      success: true,
      data: { message: 'تم إعادة تعيين اليوم — يمكنك البدء من جديد! 🔄', date: today },
    });
  } catch (err) {
    logger.error('[DAILY-FLOW] /reset-day error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في إعادة التعيين' });
  }
});

// ── In-memory day state with DB-backed hydration ────────────────────────────
// HARDENED: Auto-hydrates from DayPlan model on cache miss (survives restart)
const localStorage_dayState = new Map();

/**
 * Hydrate in-memory state from DayPlan DB for a user/date if not already present.
 * Called automatically in /status, /plan, /complete-block, etc.
 */
async function hydrateFromDB(userId, today) {
  const prefix = `${userId}:${today}:`;
  if (localStorage_dayState.has(`${prefix}started`)) return; // Already in memory

  const { DayPlan } = getModels();
  if (!DayPlan) return;

  try {
    const dbPlan = await DayPlan.findOne({ where: { user_id: userId, plan_date: today } });
    if (dbPlan && dbPlan.schedule) {
      const blocks = Array.isArray(dbPlan.schedule) ? dbPlan.schedule : [];
      const plan = {
        date: today,
        blocks,
        stats: {
          total_blocks: blocks.length,
          completed_blocks: dbPlan.completed_blocks || blocks.filter(b => b.status === 'completed').length,
        },
      };
      localStorage_dayState.set(`${prefix}plan`, plan);
      localStorage_dayState.set(`${prefix}started`, true);
      // Compute XP from completed blocks
      const completedBlocks = blocks.filter(b => b.status === 'completed');
      let xp = 0;
      for (const b of completedBlocks) {
        xp += calculateBlockReward(b, b.streak || 0);
      }
      localStorage_dayState.set(`${prefix}xp`, xp);
      localStorage_dayState.set(`${prefix}completed_blocks`, completedBlocks.map(b => ({
        block_id: b.id, xp: calculateBlockReward(b, b.streak || 0),
      })));
      // Check if day was ended (completion_rate = 1 or user_notes exist)
      if (dbPlan.user_notes || (dbPlan.completion_rate && dbPlan.completion_rate >= 0.99)) {
        localStorage_dayState.set(`${prefix}ended`, true);
      }
      logger.info(`[DAILY-FLOW] Hydrated state from DB for user ${userId} on ${today}`);
    }
  } catch (e) {
    logger.debug(`[DAILY-FLOW] DB hydration failed: ${e.message}`);
  }
}

module.exports = router;
