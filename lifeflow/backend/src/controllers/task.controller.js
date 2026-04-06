/**
 * Task Controller — Phase 1 Upgrade
 * ====================================
 * Smart sorting: overdue → timed → AI-scheduled → all-day
 * Grouped response: { overdue, timed, scheduled, all_day, completed }
 * Timezone-aware using utils/time.util.js
 */

const { Op } = require('sequelize');
const Task = require('../models/task.model');
const { aiService } = require('../ai/ai.service');
const logger = require('../utils/logger');
const moment = require('moment-timezone');
const { getNow, toUTC, todayString } = require('../utils/time.util');

// ── Input sanitization ─────────────────────────────────────────────────────
function sanitizeText(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/<[^>]*>/g, '')           // Strip HTML tags
    .replace(/[<>"'`;]/g, '')          // Remove dangerous chars
    .trim()
    .slice(0, 1000);                   // Max 1000 chars
}

// Step 1: Wire behavior events into task lifecycle
function getBehaviorService() {
  try { return require('../services/behavior.model.service'); } catch (_) { return null; }
}
// Phase 12: EventBus for brain recomputation
function getEventBus() {
  try { return require('../core/eventBus'); } catch (_) { return null; }
}
// Step 2: Wire UserModel events into task lifecycle (Phase P)
function getUserModelService() {
  try { return require('../services/user.model.service'); } catch (_) { return null; }
}
// Step 3: Wire goal engine for auto-linking and progress
function getGoalEngine() {
  try { return require('../services/goal.engine.service'); } catch (_) { return null; }
}
function getGoalModel() {
  try { return require('../models/goal.model'); } catch (_) { return null; }
}

/* ─── Smart Notification Helper ────────────────────────────────── */
async function createTaskReminder(task, user) {
  try {
    const { Notification } = require('../models/insight.model');
    if (!task.start_time || !task.reminder_before) return;

    const tz = user.timezone || 'Africa/Cairo';
    const name = user.name?.split(' ')[0] || 'صديقي';
    const rb = task.reminder_before || 15;
    const triggerTime = moment(task.start_time).subtract(rb, 'minutes').toDate();

    // Don't create if trigger time is in the past
    if (triggerTime < new Date()) return;

    const minuteLabel = rb >= 60 ? `${Math.round(rb / 60)} ساعة` : `${rb} دقيقة`;
    const isUrgent = task.priority === 'urgent' || task.priority === 'high';

    await Notification.create({
      user_id: user.id,
      type: 'smart_reminder_task',
      title: isUrgent
        ? `⚡ ${name}، مهمة عاجلة تقترب!`
        : `📋 تذكير: ${task.title}`,
      body: `"${task.title}" بعد ${minuteLabel}. هيّئ نفسك.`,
      dynamic_message: `${name}، "${task.title}" بعد ${minuteLabel}. ${isUrgent ? 'عالية الأولوية — لا تؤخّرها.' : 'خطوة صغيرة تقدر عليها!'}`,
      reminder_before: rb,
      priority: task.priority || 'medium',
      related_item_id: task.id,
      related_item_type: 'task',
      scheduled_at: triggerTime,
      channel: 'in_app',
    });
    logger.info(`[NOTIFY] Auto-reminder for task "${task.title}" at ${triggerTime.toISOString()}`);
  } catch (e) {
    logger.warn('[NOTIFY] Auto-reminder creation failed:', e.message);
  }
}

/* ─── helpers ─────────────────────────────────────────────────── */

/**
 * Smart sort tasks into groups:
 *   overdue   – past due, not completed
 *   timed     – has start_time today
 *   scheduled – AI-scheduled (order_index set), no explicit time
 *   all_day   – is_all_day = true
 *   completed – status = 'completed'
 */
function groupTasks(tasks, timezone) {
  const nowMoment = moment().tz(timezone || 'Africa/Cairo');
  const todayStr   = nowMoment.format('YYYY-MM-DD');

  const groups = { overdue: [], timed: [], scheduled: [], all_day: [], completed: [] };

  for (const t of tasks) {
    if (t.status === 'completed') { groups.completed.push(t); continue; }

    const dueDate = t.due_date ? moment(t.due_date).tz(timezone || 'Africa/Cairo').format('YYYY-MM-DD') : null;
    const isOverdue = dueDate && dueDate < todayStr && t.status !== 'completed';

    if (isOverdue) {
      groups.overdue.push(t);
    } else if (t.start_time) {
      groups.timed.push(t);
    } else if (t.is_all_day) {
      groups.all_day.push(t);
    } else {
      groups.scheduled.push(t);
    }
  }

  // Sort each group
  groups.overdue.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

  groups.timed.sort((a, b) => {
    const ta = a.start_time ? new Date(a.start_time) : new Date(0);
    const tb = b.start_time ? new Date(b.start_time) : new Date(0);
    return ta - tb;
  });

  groups.scheduled.sort((a, b) => {
    if (a.order_index !== b.order_index) return (a.order_index || 999) - (b.order_index || 999);
    return (b.ai_priority_score || 0) - (a.ai_priority_score || 0);
  });

  groups.all_day.sort((a, b) => {
    const pa = { urgent: 4, high: 3, medium: 2, low: 1 };
    return (pa[b.priority] || 2) - (pa[a.priority] || 2);
  });

  return groups;
}

/* ─── AI Recommendation Scorer ────────────────────────────────── */

/**
 * Score a task for the AI Decision Engine.
 * Higher score = more urgently recommended to the user right now.
 * Factors: overdue, priority, time proximity, ai_priority_score, energy.
 */
function computeTaskScore(task, nowHour, timezone) {
  let score = 0;
  const tz = timezone || 'Africa/Cairo';
  const todayStr = moment().tz(tz).format('YYYY-MM-DD');

  // 1. Overdue gets highest boost
  const dueDate = task.due_date ? moment(task.due_date).tz(tz).format('YYYY-MM-DD') : null;
  const taskIsOverdue = dueDate && dueDate < todayStr && task.status !== 'completed';
  if (taskIsOverdue) score += 40;

  // 2. Priority weighting
  const priorityWeights = { urgent: 30, high: 20, medium: 10, low: 0 };
  score += priorityWeights[task.priority] || 0;

  // 3. Due today gets a boost
  const taskIsToday = dueDate === todayStr ||
    (task.start_time && moment(task.start_time).tz(tz).format('YYYY-MM-DD') === todayStr);
  if (taskIsToday) score += 15;

  // 4. Time proximity — tasks with start_time close to now get higher score
  if (task.start_time) {
    const taskHour = moment(task.start_time).tz(tz).hour();
    const diff = Math.abs(taskHour - nowHour);
    if (diff <= 1) score += 25;
    else if (diff <= 2) score += 15;
    else if (diff <= 3) score += 5;
  }

  // 5. AI priority score from model
  if (task.ai_priority_score) {
    score += Math.min(task.ai_priority_score * 5, 20);
  }

  // 6. Energy alignment (optional)
  // Low energy tasks get slight boost when it's late (after 20:00)
  if (nowHour >= 20 && task.energy_required === 'low') score += 5;
  if (nowHour < 12 && task.energy_required === 'high') score += 5;

  return score;
}

/* ─── controllers ─────────────────────────────────────────────── */

/**
 * @route   GET /api/v1/tasks/smart-view
 * @desc    Smart view with AI scoring, grouping, and recommended task
 * @returns { overdue: [], today: [], upcoming: [], completed: [], recommendedTaskId, scores: {} }
 */
exports.getSmartView = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const todayStr = moment().tz(timezone).format('YYYY-MM-DD');
    const nowHour = moment().tz(timezone).hour();

    // Fetch all user tasks (reasonable limit)
    // Use raw: true to bypass Sequelize's DATETIME→Date auto-parsing on STRING columns
    // (SQLite column type is DATETIME but values are ISO strings)
    const tasks = await Task.findAll({
      where: { user_id: req.user.id },
      order: [['ai_priority_score', 'DESC'], ['due_date', 'ASC'], ['createdAt', 'DESC']],
      limit: 200,
      raw: true,
    });

    const overdue = [];
    const today = [];
    const upcoming = [];
    const completed = [];
    const scores = {};

    for (const t of tasks) {
      const plain = t.toJSON ? t.toJSON() : t;

      if (plain.status === 'completed') {
        completed.push(plain);
        continue;
      }

      const dueDate = plain.due_date ? moment(plain.due_date).tz(timezone).format('YYYY-MM-DD') : null;
      const startDate = plain.start_time ? moment(plain.start_time).tz(timezone).format('YYYY-MM-DD') : null;
      const isOverdueTask = dueDate && dueDate < todayStr;
      const isTodayTask = dueDate === todayStr || startDate === todayStr ||
        (!dueDate && !startDate); // no date = treat as today

      // Compute AI score
      const taskScore = computeTaskScore(plain, nowHour, timezone);
      scores[plain.id] = taskScore;

      if (isOverdueTask) {
        overdue.push(plain);
      } else if (isTodayTask) {
        today.push(plain);
      } else {
        upcoming.push(plain);
      }
    }

    // Sort groups
    const PRIORITY_MAP = { urgent: 0, high: 1, medium: 2, low: 3 };

    // Overdue: oldest first, then by priority
    overdue.sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : 0;
      const db = b.due_date ? new Date(b.due_date).getTime() : 0;
      if (da !== db) return da - db;
      return (PRIORITY_MAP[a.priority] || 3) - (PRIORITY_MAP[b.priority] || 3);
    });

    // Today: by start_time -> priority -> creation date
    today.sort((a, b) => {
      const ta = a.start_time ? new Date(a.start_time).getTime() : Infinity;
      const tb = b.start_time ? new Date(b.start_time).getTime() : Infinity;
      if (ta !== tb) return ta - tb;
      const pa = PRIORITY_MAP[a.priority] || 3;
      const pb = PRIORITY_MAP[b.priority] || 3;
      if (pa !== pb) return pa - pb;
      return (new Date(a.createdAt || 0)).getTime() - (new Date(b.createdAt || 0)).getTime();
    });

    // Upcoming: by due_date -> priority
    upcoming.sort((a, b) => {
      const da = a.due_date ? new Date(a.due_date).getTime() : Infinity;
      const db = b.due_date ? new Date(b.due_date).getTime() : Infinity;
      if (da !== db) return da - db;
      return (PRIORITY_MAP[a.priority] || 3) - (PRIORITY_MAP[b.priority] || 3);
    });

    // Find recommended task — Phase K: use UnifiedDecisionService if available
    let bestScore = -1;
    let recommendedTaskId = null;
    let recommendedSource = 'legacy_score';

    // Try unified decision engine first
    try {
      const unifiedSvc = require('../services/unified.decision.service');
      if (unifiedSvc?.getUnifiedDecision) {
        const decision = await unifiedSvc.getUnifiedDecision(req.user.id, { timezone });
        if (decision?.currentFocus?.id && decision.currentFocus.type === 'task') {
          recommendedTaskId = decision.currentFocus.id;
          bestScore = decision.currentFocus.score || decision.confidence || 80;
          recommendedSource = 'unified_decision_engine';
        }
      }
    } catch (_e) { /* fall through to legacy */ }

    // Fallback: legacy scoring
    if (!recommendedTaskId) {
      [...overdue, ...today].forEach(t => {
        const s = scores[t.id] || 0;
        if (s > bestScore) {
          bestScore = s;
          recommendedTaskId = t.id;
        }
      });
      recommendedSource = 'legacy_score';
    }

    // Log recommendation for analytics
    if (recommendedTaskId) {
      logger.info(`[SMART-VIEW] User ${req.user.id} — recommended task: ${recommendedTaskId} (score: ${bestScore}, source: ${recommendedSource})`);
    }

    res.json({
      success: true,
      data: {
        overdue,
        today,
        upcoming,
        completed: completed.slice(0, 20), // Limit completed to recent 20
        recommendedTaskId,
        recommendedSource,
        scores,
        stats: {
          total: tasks.length,
          overdue: overdue.length,
          today: today.length,
          upcoming: upcoming.length,
          completed: completed.length,
        },
      },
    });
  } catch (error) {
    logger.error('Smart view error:', error);
    res.status(500).json({ success: false, message: 'فشل في جلب العرض الذكي' });
  }
};

/**
 * @route   GET /api/v1/tasks
 * @desc    Get tasks with smart grouping | جلب المهام مع تجميع ذكي
 * @query   status, category, priority, date, page, limit, search,
 *          due_today, grouped (true → return groups)
 */
exports.getTasks = async (req, res) => {
  try {
    const {
      status, category, priority,
      date, page = 1, limit = 50,
      search, due_today, grouped = 'false',
    } = req.query;

    const timezone = req.user.timezone || 'Africa/Cairo';
    const where = { user_id: req.user.id };

    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    if (search) where.title = { [Op.like]: `%${search}%` };

    if (due_today === 'true') {
      const today = moment().tz(timezone).format('YYYY-MM-DD');
      where.due_date = { [Op.between]: [`${today}T00:00:00`, `${today}T23:59:59`] };
    }

    if (date) {
      where.due_date = { [Op.between]: [`${date}T00:00:00`, `${date}T23:59:59`] };
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: tasks } = await Task.findAndCountAll({
      where,
      order: [
        ['ai_priority_score', 'DESC'],
        ['due_date',          'ASC'],
        ['order_index',       'ASC'],
        ['createdAt',         'DESC'],
      ],
      limit:  parseInt(limit),
      offset,
    });

    if (grouped === 'true') {
      const groups = groupTasks(tasks, timezone);
      return res.json({
        success: true,
        data: {
          groups,
          counts: {
            overdue:   groups.overdue.length,
            timed:     groups.timed.length,
            scheduled: groups.scheduled.length,
            all_day:   groups.all_day.length,
            completed: groups.completed.length,
            total:     count,
          },
          pagination: {
            total: count, page: parseInt(page),
            limit: parseInt(limit), pages: Math.ceil(count / parseInt(limit)),
          },
        },
      });
    }

    res.json({
      success: true,
      data: {
        tasks,
        pagination: {
          total: count, page: parseInt(page),
          limit: parseInt(limit), pages: Math.ceil(count / parseInt(limit)),
        },
      },
    });
  } catch (error) {
    logger.error('Get tasks error:', error);
    res.status(500).json({ success: false, message: 'فشل في جلب المهام' });
  }
};

/**
 * @route   POST /api/v1/tasks
 * @desc    Create new task | إنشاء مهمة جديدة
 */
exports.createTask = async (req, res) => {
  try {
    const taskData = { ...req.body, user_id: req.user.id };

    // HARDENED: Sanitize text fields to prevent XSS
    if (taskData.title) taskData.title = sanitizeText(taskData.title);
    if (taskData.description) taskData.description = sanitizeText(taskData.description).slice(0, 5000);
    if (taskData.category) taskData.category = sanitizeText(taskData.category).slice(0, 100);
    if (taskData.notes) taskData.notes = sanitizeText(taskData.notes).slice(0, 2000);

    // Normalize start_time / end_time to UTC string if provided as local strings
    if (taskData.start_time) {
      const utc = toUTC(taskData.start_time);
      taskData.start_time = utc && typeof utc.toISOString === 'function' ? utc.toISOString() : String(utc || taskData.start_time);
    }
    if (taskData.end_time) {
      const utc = toUTC(taskData.end_time);
      taskData.end_time = utc && typeof utc.toISOString === 'function' ? utc.toISOString() : String(utc || taskData.end_time);
    }

    // Auto-link to goal: if goal_id not explicitly provided, infer from category
    if (!taskData.goal_id) {
      try {
        const Goal = getGoalModel();
        if (Goal) {
          // First try matching by category
          const categoryGoal = taskData.category
            ? await Goal.findOne({
                where: { user_id: req.user.id, status: 'active', category: taskData.category },
                attributes: ['id'],
                order: [['priority_score', 'DESC']],
                raw: true,
              })
            : null;
          if (categoryGoal) {
            taskData.goal_id = categoryGoal.id;
          } else {
            // Fallback: link to the highest-priority active goal
            const topGoal = await Goal.findOne({
              where: { user_id: req.user.id, status: 'active' },
              attributes: ['id'],
              order: [['priority_score', 'DESC']],
              raw: true,
            });
            if (topGoal) taskData.goal_id = topGoal.id;
          }
        }
      } catch (e) {
        logger.debug('[TASK] Goal auto-link failed:', e.message);
      }
    }

    // AI auto-prioritize
    try {
      const aiPriority = await aiService.prioritizeTask(taskData, req.user);
      taskData.ai_priority_score = aiPriority.score;
      taskData.ai_suggestions    = aiPriority.suggestions;
    } catch (aiError) {
      logger.warn('AI prioritization failed:', aiError.message);
    }

    const task = await Task.create(taskData);

    // Auto-create smart reminder notification
    createTaskReminder(task, req.user);

    const io = req.app.get('io');
    io?.to(`user_${req.user.id}`).emit('task_created', task);

    // Phase 12: Emit TASK_CREATED → triggers brain.recompute
    const eb = getEventBus();
    if (eb) eb.emit(eb.EVENT_TYPES.TASK_CREATED, { userId: req.user.id, taskId: task.id, title: task.title });

    res.status(201).json({
      success: true,
      message: 'تم إنشاء المهمة بنجاح ✅',
      data: task,
    });
  } catch (error) {
    logger.error('Create task error:', error);
    res.status(500).json({ success: false, message: 'فشل في إنشاء المهمة' });
  }
};

/**
 * @route   PUT /api/v1/tasks/:id
 * @desc    Update task | تعديل مهمة
 */
exports.updateTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!task) {
      return res.status(404).json({ success: false, message: 'المهمة غير موجودة' });
    }

    // HARDENED: Sanitize text fields on update
    if (req.body.title) req.body.title = sanitizeText(req.body.title);
    if (req.body.description) req.body.description = sanitizeText(req.body.description).slice(0, 5000);
    if (req.body.category) req.body.category = sanitizeText(req.body.category).slice(0, 100);
    if (req.body.notes) req.body.notes = sanitizeText(req.body.notes).slice(0, 2000);

    if (req.body.status === 'completed' && task.status !== 'completed') {
      req.body.completed_at = new Date();
      // Step 1: Notify behavior system
      const behaviorSvc = getBehaviorService();
      if (behaviorSvc) {
        behaviorSvc.onTaskEvent(req.user.id, 'task_completed', { taskId: task.id }, req.user?.timezone).catch(() => {});
      }
      // Step 2: Update persistent UserModel (Phase P)
      const userModelSvc = getUserModelService();
      if (userModelSvc) {
        userModelSvc.onTaskCompleted(req.user.id, {
          id: task.id, priority: task.priority, due_date: task.due_date,
          completed_at: req.body.completed_at, estimated_duration: task.estimated_duration,
          energy_required: task.energy_required, category: task.category,
        }).catch(e => logger.debug('[TASK] UserModel update failed:', e.message));
      }
    }

    // Normalize times to UTC strings
    if (req.body.start_time) {
      const utc = toUTC(req.body.start_time);
      req.body.start_time = utc && typeof utc.toISOString === 'function' ? utc.toISOString() : String(utc || req.body.start_time);
    }
    if (req.body.end_time) {
      const utc = toUTC(req.body.end_time);
      req.body.end_time = utc && typeof utc.toISOString === 'function' ? utc.toISOString() : String(utc || req.body.end_time);
    }

    await task.update(req.body);

    // Update linked goal progress on completion
    if (req.body.status === 'completed' && task.goal_id) {
      const goalEngine = getGoalEngine();
      if (goalEngine) {
        goalEngine.autoUpdateProgress(task.goal_id, req.user.id).catch(e =>
          logger.debug('[TASK] Goal progress update failed:', e.message)
        );
      }
    }

    const io = req.app.get('io');
    io?.to(`user_${req.user.id}`).emit('task_updated', task);

    res.json({ success: true, message: 'تم تحديث المهمة ✏️', data: task });
  } catch (error) {
    logger.error('Update task error:', error);
    res.status(500).json({ success: false, message: 'فشل في تحديث المهمة' });
  }
};

/**
 * @route   PATCH /api/v1/tasks/:id/complete
 * @desc    Mark task complete | إتمام مهمة
 */
exports.completeTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!task) return res.status(404).json({ success: false, message: 'المهمة غير موجودة' });

    await task.update({
      status:         'completed',
      completed_at:   new Date(),
      completion_mood: req.body.mood || null,
    });

    // Step 1: Notify behavior system of task completion
    const behaviorSvc = getBehaviorService();
    if (behaviorSvc) {
      behaviorSvc.onTaskEvent(req.user.id, 'task_completed', { taskId: task.id, priority: task.priority }, req.user.timezone).catch(() => {});
    }

    // Step 2: Update persistent UserModel (Phase P)
    const userModelSvc = getUserModelService();
    if (userModelSvc) {
      userModelSvc.onTaskCompleted(req.user.id, {
        id: task.id,
        priority: task.priority,
        due_date: task.due_date,
        completed_at: task.completed_at,
        estimated_duration: task.estimated_duration,
        actual_duration: task.actual_duration,
        energy_required: task.energy_required,
        category: task.category,
      }).catch(e => logger.debug('[TASK] UserModel update failed:', e.message));
    }

    // Step 3: Update linked goal progress
    if (task.goal_id) {
      const goalEngine = getGoalEngine();
      if (goalEngine) {
        goalEngine.autoUpdateProgress(task.goal_id, req.user.id).catch(e =>
          logger.debug('[TASK] Goal progress update failed:', e.message)
        );
      }
    }

    // Phase 12: Emit TASK_COMPLETED to EventBus → triggers brain.recompute
    const eb = getEventBus();
    if (eb) eb.emit(eb.EVENT_TYPES.TASK_COMPLETED, { userId: req.user.id, taskId: task.id, priority: task.priority, title: task.title });

    if (task.is_recurring && task.recurrence_pattern) {
      await createNextRecurringTask(task);
    }

    res.json({
      success: true,
      message: 'أحسنت! تم إتمام المهمة بنجاح 🎉',
      data: task,
    });
  } catch (error) {
    logger.error('Complete task error:', error);
    res.status(500).json({ success: false, message: 'فشل في إتمام المهمة' });
  }
};

/**
 * @route   DELETE /api/v1/tasks/:id
 * @desc    Delete task | حذف مهمة
 */
exports.deleteTask = async (req, res) => {
  try {
    const task = await Task.findOne({
      where: { id: req.params.id, user_id: req.user.id },
    });

    if (!task) return res.status(404).json({ success: false, message: 'المهمة غير موجودة' });

    await task.destroy();

    res.json({ success: true, message: 'تم حذف المهمة' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في حذف المهمة' });
  }
};

/**
 * @route   GET /api/v1/tasks/today
 * @desc    Today's tasks — grouped | مهام اليوم مجمّعة
 */
exports.getTodayTasks = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const today    = moment().tz(timezone).format('YYYY-MM-DD');

    const tasks = await Task.findAll({
      where: {
        user_id: req.user.id,
        [Op.or]: [
          { due_date: { [Op.between]: [`${today}T00:00:00`, `${today}T23:59:59`] } },
          { status:   'in_progress' },
        ],
      },
      order: [['ai_priority_score', 'DESC'], ['due_date', 'ASC']],
    });

    const groups = groupTasks(tasks, timezone);

    const summary = {
      total:       tasks.length,
      completed:   tasks.filter(t => t.status === 'completed').length,
      pending:     tasks.filter(t => t.status === 'pending').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      overdue:     groups.overdue.length,
      groups,
      tasks,
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب مهام اليوم' });
  }
};

/**
 * @route   POST /api/v1/tasks/ai-breakdown
 * @desc    AI task breakdown | تقسيم المهمة بالذكاء الاصطناعي
 */
exports.aiBreakdown = async (req, res) => {
  try {
    const { task_title, task_description } = req.body;
    const subtasks = await aiService.breakdownTask(task_title, task_description, req.user);
    res.json({ success: true, data: subtasks });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في تحليل المهمة' });
  }
};

/* ─── helper: recurring tasks ─────────────────────────────────── */
async function createNextRecurringTask(task) {
  try {
    const pattern = task.recurrence_pattern;
    if (!pattern) return;

    let nextDate = moment(task.due_date);
    if (pattern.type === 'daily')   nextDate.add(1, 'day');
    else if (pattern.type === 'weekly')  nextDate.add(1, 'week');
    else if (pattern.type === 'monthly') nextDate.add(1, 'month');

    await Task.create({
      ...task.toJSON(),
      id:         undefined,
      status:     'pending',
      completed_at: null,
      due_date:   nextDate.toDate(),
      createdAt:  undefined,
      updatedAt:  undefined,
    });
  } catch (err) {
    logger.error('Create recurring task error:', err);
  }
}
