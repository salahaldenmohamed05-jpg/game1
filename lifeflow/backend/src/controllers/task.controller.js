/**
 * Task Controller
 * ================
 * يتحكم في إدارة المهام - إنشاء، تعديل، إتمام، وتحليل المهام
 */

const { Op } = require('sequelize');
const Task = require('../models/task.model');
const { aiService } = require('../ai/ai.service');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

/**
 * @route   GET /api/v1/tasks
 * @desc    Get all tasks for user | جلب كل مهام المستخدم
 */
exports.getTasks = async (req, res) => {
  try {
    const {
      status, category, priority,
      date, page = 1, limit = 20,
      search, due_today,
    } = req.query;

    const where = { user_id: req.user.id };

    if (status) where.status = status;
    if (category) where.category = category;
    if (priority) where.priority = priority;
    if (search) where.title = { [Op.iLike]: `%${search}%` };

    // Filter tasks due today
    if (due_today === 'true') {
      const today = moment().tz(req.user.timezone).format('YYYY-MM-DD');
      where.due_date = { [Op.between]: [`${today}T00:00:00`, `${today}T23:59:59`] };
    }

    const offset = (parseInt(page) - 1) * parseInt(limit);

    const { count, rows: tasks } = await Task.findAndCountAll({
      where,
      order: [
        ['ai_priority_score', 'DESC'],
        ['due_date', 'ASC'],
        ['created_at', 'DESC'],
      ],
      limit: parseInt(limit),
      offset,
    });

    res.json({
      success: true,
      data: {
        tasks,
        pagination: {
          total: count,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(count / parseInt(limit)),
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

    // AI auto-prioritize the task
    try {
      const aiPriority = await aiService.prioritizeTask(taskData, req.user);
      taskData.ai_priority_score = aiPriority.score;
      taskData.ai_suggestions = aiPriority.suggestions;
    } catch (aiError) {
      logger.warn('AI prioritization failed, using default:', aiError.message);
    }

    const task = await Task.create(taskData);

    // Emit real-time update
    const io = req.app.get('io');
    io?.to(`user_${req.user.id}`).emit('task_created', task);

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
    const task = await Task.findOne({ where: { id: req.params.id, user_id: req.user.id } });

    if (!task) {
      return res.status(404).json({ success: false, message: 'المهمة غير موجودة' });
    }

    // If completing task, record completion time
    if (req.body.status === 'completed' && task.status !== 'completed') {
      req.body.completed_at = new Date();
    }

    await task.update(req.body);

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
 * @desc    Mark task as complete | إتمام مهمة
 */
exports.completeTask = async (req, res) => {
  try {
    const task = await Task.findOne({ where: { id: req.params.id, user_id: req.user.id } });

    if (!task) return res.status(404).json({ success: false, message: 'المهمة غير موجودة' });

    await task.update({
      status: 'completed',
      completed_at: new Date(),
      completion_mood: req.body.mood || null,
    });

    // Handle recurring tasks
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
    const task = await Task.findOne({ where: { id: req.params.id, user_id: req.user.id } });

    if (!task) return res.status(404).json({ success: false, message: 'المهمة غير موجودة' });

    await task.destroy(); // Soft delete (paranoid: true)

    res.json({ success: true, message: 'تم حذف المهمة' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في حذف المهمة' });
  }
};

/**
 * @route   GET /api/v1/tasks/today
 * @desc    Get today's task summary | ملخص مهام اليوم
 */
exports.getTodayTasks = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const today = moment().tz(timezone).format('YYYY-MM-DD');

    const tasks = await Task.findAll({
      where: {
        user_id: req.user.id,
        [Op.or]: [
          { due_date: { [Op.between]: [`${today}T00:00:00`, `${today}T23:59:59`] } },
          { status: 'in_progress' },
        ],
      },
      order: [['ai_priority_score', 'DESC'], ['due_date', 'ASC']],
    });

    const summary = {
      total: tasks.length,
      completed: tasks.filter(t => t.status === 'completed').length,
      pending: tasks.filter(t => t.status === 'pending').length,
      in_progress: tasks.filter(t => t.status === 'in_progress').length,
      overdue: tasks.filter(t =>
        t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date()
      ).length,
      tasks,
    };

    res.json({ success: true, data: summary });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب مهام اليوم' });
  }
};

/**
 * @route   POST /api/v1/tasks/ai-breakdown
 * @desc    AI breaks down a big task into subtasks
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

// Helper: Create next recurring task instance
async function createNextRecurringTask(task) {
  try {
    const pattern = task.recurrence_pattern;
    if (!pattern) return;

    let nextDate = moment(task.due_date);
    if (pattern.type === 'daily') nextDate.add(1, 'day');
    else if (pattern.type === 'weekly') nextDate.add(1, 'week');
    else if (pattern.type === 'monthly') nextDate.add(1, 'month');

    await Task.create({
      ...task.toJSON(),
      id: undefined,
      status: 'pending',
      completed_at: null,
      due_date: nextDate.toDate(),
      created_at: undefined,
      updated_at: undefined,
    });
  } catch (err) {
    logger.error('Create recurring task error:', err);
  }
}
