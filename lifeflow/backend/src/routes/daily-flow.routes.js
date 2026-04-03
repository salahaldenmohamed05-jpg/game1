/**
 * Daily Execution Flow Routes — Phase 4: Daily Companion
 * ========================================================
 * Transforms LifeFlow from suggestion system → daily life leader.
 *
 * Endpoints:
 *   GET  /daily-flow/status        — Get current day state (not_started/active/completed)
 *   POST /daily-flow/start-day     — Start the day → generate plan
 *   GET  /daily-flow/plan          — Get today's plan (ordered blocks)
 *   POST /daily-flow/complete-block — Complete a block → reward → next
 *   POST /daily-flow/skip-block    — Skip block with reason
 *   POST /daily-flow/check-habit   — Check-in habit within flow
 *   POST /daily-flow/end-day       — End day → narrative summary
 *   GET  /daily-flow/narrative     — Get day narrative (if ended)
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
function getAnalytics() {
  try { return require('../services/analytics.service'); } catch (_) { return null; }
}

// All routes require authentication
router.use(protect);

// ── Helper: Get greeting based on hour ─────────────────────────────────────
function getGreeting(hour, name) {
  const n = name || '';
  if (hour < 12) return `صباح الخير يا ${n} 🌅`;
  if (hour < 17) return `مساء النور يا ${n} ☀️`;
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

// ── Helper: Build plan blocks from tasks + habits ──────────────────────────
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

  // Morning habits first
  const morningHabits = (habits || []).filter(h => {
    const pt = h.preferred_time || '';
    return pt === 'morning' || pt === 'صباحاً';
  });
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

  // Remaining tasks
  for (let i = 1; i < Math.min(sortedTasks.length, 5); i++) {
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

    // Insert habit blocks between tasks
    const midHabits = (habits || []).filter(h => {
      const pt = h.preferred_time || '';
      return pt !== 'morning' && pt !== 'صباحاً' && pt !== 'evening' && pt !== 'مساءً';
    });
    if (i === 2 && midHabits.length > 0) {
      const mh = midHabits[0];
      blocks.push({
        id: `block_${blockId++}`,
        type: 'habit',
        habit_id: mh.id,
        title: mh.name_ar || mh.name || 'عادة',
        duration: 10,
        status: completedHabitIds.has(String(mh.id)) ? 'completed' : 'pending',
        icon: mh.icon || '🔄',
        color: mh.color || '#10B981',
        streak: mh.current_streak || 0,
      });
    }

    // Break every 2 tasks
    if (i % 2 === 0 && i < sortedTasks.length - 1) {
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

  // Evening habits at the end
  const eveningHabits = (habits || []).filter(h => {
    const pt = h.preferred_time || '';
    return pt === 'evening' || pt === 'مساءً';
  });
  for (const h of eveningHabits) {
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

  // Remaining habits not placed yet
  const placedHabitIds = new Set(blocks.filter(b => b.habit_id).map(b => String(b.habit_id)));
  const unplacedHabits = (habits || []).filter(h => !placedHabitIds.has(String(h.id)));
  for (const h of unplacedHabits) {
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

    // Check if day was started
    const dayStarted = localStorage_dayState.get(`${userId}:${today}:started`);
    const dayEnded = localStorage_dayState.get(`${userId}:${today}:ended`);

    let state = 'not_started';
    if (dayEnded) state = 'completed';
    else if (dayStarted) state = 'active';

    // Quick stats
    const { Task, Habit, HabitLog } = getModels();
    const [tasks, habits, habitLogs] = await Promise.all([
      Task ? Task.findAll({ where: { user_id: userId, status: { [Op.in]: ['pending', 'in_progress'] }, due_date: today }, raw: true, limit: 20 }) : [],
      Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
      HabitLog ? HabitLog.findAll({ where: { user_id: userId, log_date: today }, raw: true }) : [],
    ]);

    const completedTasks = await (Task ? Task.count({ where: { user_id: userId, status: 'completed', updatedAt: { [Op.gte]: today } } }) : 0);
    const completedHabits = habitLogs.filter(l => l.completed).length;

    res.json({
      success: true,
      data: {
        state,
        date: today,
        hour,
        stats: {
          total_tasks: tasks.length,
          completed_tasks: completedTasks,
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
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/start-day', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const now = moment.tz(tz);
    const today = now.format('YYYY-MM-DD');
    const hour = now.hour();
    const userName = req.user.name?.split(' ')[0] || '';

    const { Task, Habit, HabitLog, Goal } = getModels();

    // Fetch all data in parallel
    const [tasks, habits, habitLogs, goals] = await Promise.all([
      Task ? Task.findAll({
        where: {
          user_id: userId,
          status: { [Op.in]: ['pending', 'in_progress'] },
          [Op.or]: [{ due_date: today }, { due_date: null }, { status: 'in_progress' }],
        },
        order: [['priority', 'ASC'], ['ai_priority_score', 'DESC']],
        limit: 15,
        raw: true,
      }) : [],
      Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
      HabitLog ? HabitLog.findAll({ where: { user_id: userId, log_date: today }, raw: true }) : [],
      Goal ? Goal.findAll({ where: { user_id: userId, status: 'active' }, raw: true, limit: 5 }) : [],
    ]);

    // Compute overdue
    const overdueTasks = tasks.filter(t => {
      if (!t.due_date) return false;
      return String(t.due_date).split('T')[0] < today;
    });
    const todayTasks = tasks.filter(t => {
      if (!t.due_date) return false;
      return String(t.due_date).split('T')[0] === today;
    });

    // Energy estimate (simple: morning=high, afternoon=medium, evening=low)
    let energy = 'عالية ⚡';
    if (hour >= 14 && hour < 18) energy = 'متوسطة 🔋';
    else if (hour >= 18) energy = 'منخفضة 😌';

    // Main goal for today
    const mainGoal = goals.length > 0 ? (goals[0].title || goals[0].title_ar || 'تحقيق أهدافك') : 'تنظيم يومك';

    // Build plan blocks
    const blocks = buildPlanBlocks(todayTasks, habits, habitLogs, hour, energy);

    // Store plan in memory (per user per day)
    const plan = {
      date: today,
      started_at: now.toISOString(),
      blocks,
      stats: {
        total_blocks: blocks.length,
        completed_blocks: blocks.filter(b => b.status === 'completed').length,
        total_tasks: todayTasks.length,
        total_habits: habits.length,
        overdue_tasks: overdueTasks.length,
      },
    };

    localStorage_dayState.set(`${userId}:${today}:started`, true);
    localStorage_dayState.set(`${userId}:${today}:plan`, plan);
    localStorage_dayState.set(`${userId}:${today}:xp`, 0);
    localStorage_dayState.set(`${userId}:${today}:completed_blocks`, []);

    // Also persist to DayPlan model if available
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
        context: `${todayTasks.length} مهمة اليوم • هدفك الرئيسي: ${mainGoal}`,
        energy_estimate: energy,
        day_snapshot: {
          tasks_count: todayTasks.length,
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
        }
      }
    }

    if (!plan) {
      return res.json({ success: true, data: { plan: null, state: 'not_started' } });
    }

    // Determine current block (first pending)
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
// POST /daily-flow/complete-block — Complete a block → reward → next
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/complete-block', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');
    const { block_id, satisfaction, reflection } = req.body;

    const plan = localStorage_dayState.get(`${userId}:${today}:plan`);
    if (!plan) {
      return res.status(400).json({ success: false, message: 'لا توجد خطة نشطة — ابدأ يومك أولاً' });
    }

    const blockIndex = plan.blocks.findIndex(b => b.id === block_id);
    if (blockIndex === -1) {
      return res.status(404).json({ success: false, message: 'البلوك غير موجود' });
    }

    const block = plan.blocks[blockIndex];
    block.status = 'completed';
    block.completed_at = moment.tz(tz).toISOString();

    // Update real data
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
            await HabitLog.upsert({
              habit_id: block.habit_id,
              user_id: userId,
              log_date: today,
              completed: true,
              value: habit.habit_type === 'boolean' ? 1 : (habit.target_value || 1),
            });
            // Update streak
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

    // Also update DayPlan in DB
    const { DayPlan } = getModels();
    if (DayPlan) {
      try {
        await DayPlan.update(
          { schedule: plan.blocks, completed_blocks: plan.stats.completed_blocks, completion_rate: plan.blocks.length > 0 ? plan.stats.completed_blocks / plan.blocks.length : 0 },
          { where: { user_id: userId, plan_date: today } }
        );
      } catch (_) {}
    }

    // Find next block
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
      achievement = `streak_${streak}`;
    } else if (streak >= 3) {
      rewardMessage = `🔥 ${streak} أيام متتالية! +${xp} XP`;
      achievement = `streak_${streak}`;
    }

    // Goal progress message
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

    res.json({
      success: true,
      data: {
        completed_block: block,
        reward: {
          xp,
          total_xp: totalXp,
          message: rewardMessage,
          achievement,
          streak: block.streak || 0,
        },
        goal_progress: goalProgress,
        next_block: nextBlock,
        progress: {
          completed: completedCount,
          total: plan.blocks.length,
          percentage,
        },
        momentum: percentage >= 60
          ? '🔥 أنت داخل في flow! استمر!'
          : percentage >= 30
            ? '💪 تقدم ممتاز، واصل!'
            : '🚀 بداية قوية!',
        all_done: completedCount === plan.blocks.length,
      },
    });
  } catch (err) {
    logger.error('[DAILY-FLOW] /complete-block error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في إكمال البلوك' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /daily-flow/skip-block — Skip a block with reason
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/skip-block', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');
    const { block_id, reason } = req.body;

    const plan = localStorage_dayState.get(`${userId}:${today}:plan`);
    if (!plan) return res.status(400).json({ success: false, message: 'لا توجد خطة نشطة' });

    const blockIndex = plan.blocks.findIndex(b => b.id === block_id);
    if (blockIndex === -1) return res.status(404).json({ success: false, message: 'البلوك غير موجود' });

    plan.blocks[blockIndex].status = 'skipped';
    plan.blocks[blockIndex].skip_reason = reason || 'other';
    localStorage_dayState.set(`${userId}:${today}:plan`, plan);

    const nextBlock = plan.blocks.find(b => b.status === 'pending') || null;

    // Recovery message based on reason
    let recovery = 'مفيش مشكلة — نكمل اللي بعده! 💪';
    if (reason === 'overwhelmed') recovery = 'خذ نفس عميق. نبدأ بحاجة أسهل 🧘';
    else if (reason === 'low_energy') recovery = 'طاقتك مهمة — نخلي الصعب لبكرة 😌';
    else if (reason === 'busy') recovery = 'وقتك ضيق — نركز على الأهم بس ⏰';

    res.json({
      success: true,
      data: {
        skipped_block: plan.blocks[blockIndex],
        next_block: nextBlock,
        recovery_message: recovery,
      },
    });
  } catch (err) {
    logger.error('[DAILY-FLOW] /skip-block error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /daily-flow/check-habit — Check-in a habit within the flow
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/check-habit', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');
    const { habit_id, value } = req.body;

    const { Habit, HabitLog } = getModels();
    if (!Habit || !HabitLog) return res.status(500).json({ success: false, message: 'Habit model unavailable' });

    const habit = await Habit.findOne({ where: { id: habit_id, user_id: userId } });
    if (!habit) return res.status(404).json({ success: false, message: 'العادة غير موجودة' });

    const logValue = value || (habit.habit_type === 'boolean' ? 1 : habit.target_value || 1);
    await HabitLog.upsert({
      habit_id, user_id: userId, log_date: today, completed: true, value: logValue,
    });

    const newStreak = (habit.current_streak || 0) + 1;
    await Habit.update(
      { current_streak: newStreak, best_streak: Math.max(newStreak, habit.best_streak || 0), last_completed: today },
      { where: { id: habit_id } }
    );

    // Update plan block if exists
    const plan = localStorage_dayState.get(`${userId}:${today}:plan`);
    if (plan) {
      const habitBlock = plan.blocks.find(b => b.habit_id === habit_id || String(b.habit_id) === String(habit_id));
      if (habitBlock) {
        habitBlock.status = 'completed';
        habitBlock.streak = newStreak;
        localStorage_dayState.set(`${userId}:${today}:plan`, plan);
      }
    }

    const xp = calculateBlockReward({ type: 'habit' }, newStreak);
    const totalXp = (localStorage_dayState.get(`${userId}:${today}:xp`) || 0) + xp;
    localStorage_dayState.set(`${userId}:${today}:xp`, totalXp);

    let streakMessage = null;
    if (newStreak >= 30) streakMessage = `🏆 ${newStreak} يوم! أنت أسطورة!`;
    else if (newStreak >= 7) streakMessage = `🔥🔥 ${newStreak} أيام متتالية!`;
    else if (newStreak >= 3) streakMessage = `🔥 ${newStreak} أيام! استمر!`;

    // Identity layer
    let identityMessage = null;
    if (newStreak >= 7) {
      identityMessage = `أنت شخص ملتزم بـ"${habit.name_ar || habit.name}" 👌`;
    }

    res.json({
      success: true,
      data: {
        habit_id,
        streak: newStreak,
        xp,
        total_xp: totalXp,
        reward_message: `✅ ${habit.name_ar || habit.name} — +${xp} XP`,
        streak_message: streakMessage,
        identity_message: identityMessage,
        cue_next: 'جاهز للخطوة التالية؟ 👉',
      },
    });
  } catch (err) {
    logger.error('[DAILY-FLOW] /check-habit error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /daily-flow/end-day — End day → generate narrative
// ═══════════════════════════════════════════════════════════════════════════════
router.post('/end-day', async (req, res) => {
  try {
    const userId = req.user.id;
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment.tz(tz).format('YYYY-MM-DD');
    const { reflection_text } = req.body;

    const plan = localStorage_dayState.get(`${userId}:${today}:plan`);
    const totalXp = localStorage_dayState.get(`${userId}:${today}:xp`) || 0;

    const { Task, Habit, HabitLog, Goal } = getModels();

    // Fetch completion stats
    const [completedTasksCount, totalTodayTasks, habits, habitLogs, goals] = await Promise.all([
      Task ? Task.count({ where: { user_id: userId, status: 'completed', updatedAt: { [Op.gte]: today } } }) : 0,
      Task ? Task.count({ where: { user_id: userId, due_date: today } }) : 0,
      Habit ? Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }) : [],
      HabitLog ? HabitLog.findAll({ where: { user_id: userId, log_date: today }, raw: true }) : [],
      Goal ? Goal.findAll({ where: { user_id: userId, status: 'active' }, raw: true, limit: 5 }) : [],
    ]);

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

    // Score
    const taskScore = totalTodayTasks > 0 ? Math.round((completedTasksCount / totalTodayTasks) * 100) : 0;
    const habitScore = habits.length > 0 ? Math.round((completedHabits / habits.length) * 100) : 0;
    const planScore = planBlocks.length > 0 ? Math.round((planCompleted / planBlocks.length) * 100) : 0;
    const dayScore = Math.round((taskScore * 0.4 + habitScore * 0.3 + planScore * 0.3));

    // Narrative message
    let narrativeTitle = '';
    let narrativeEmoji = '';
    if (dayScore >= 80) { narrativeTitle = 'يوم استثنائي!'; narrativeEmoji = '🏆'; }
    else if (dayScore >= 60) { narrativeTitle = 'يوم ممتاز!'; narrativeEmoji = '🌟'; }
    else if (dayScore >= 40) { narrativeTitle = 'يوم جيد'; narrativeEmoji = '👍'; }
    else if (dayScore >= 20) { narrativeTitle = 'يوم فيه تحديات'; narrativeEmoji = '💪'; }
    else { narrativeTitle = 'بكرة أحسن إن شاء الله'; narrativeEmoji = '🌱'; }

    // Build narrative
    const narrative = {
      date: today,
      title: `${narrativeEmoji} ${narrativeTitle}`,
      score: dayScore,
      xp_earned: totalXp,
      achievements: {
        tasks: { completed: completedTasksCount, total: totalTodayTasks, score: taskScore },
        habits: { completed: completedHabits, total: habits.length, score: habitScore },
        plan: { completed: planCompleted, total: planBlocks.length, skipped: planSkipped, pending: planPending, score: planScore },
      },
      goal_progress: goalProgress,
      reflection: reflection_text || null,
      highlights: [],
      tomorrow_preview: 'جاهز ليوم جديد؟ ابدأ بكرة من هنا! 🚀',
    };

    // Build highlights
    if (completedTasksCount > 0) narrative.highlights.push(`✅ أكملت ${completedTasksCount} مهمة`);
    if (completedHabits > 0) narrative.highlights.push(`🔄 أنجزت ${completedHabits} عادة`);
    if (totalXp > 50) narrative.highlights.push(`⚡ كسبت ${totalXp} XP`);
    const streakHabits = habits.filter(h => (h.current_streak || 0) >= 3);
    if (streakHabits.length > 0) {
      narrative.highlights.push(`🔥 ${streakHabits.length} عادة في سلسلة!`);
    }

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
            user_notes: reflection_text || null,
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

// ── In-memory day state (survives within server process) ───────────────────
// In production, this would be Redis. For demo, Map is sufficient.
const localStorage_dayState = new Map();

module.exports = router;
