/**
 * Task Routes
 */
const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const { protect } = require('../middleware/auth.middleware');
const { validateCreateTask, validateUpdateTask } = require('../middleware/validators');
const { writeLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');

router.use(protect);

// Smart View — AI-scored grouping with recommendation (replaces frontend computeAIScore)
router.get('/smart-view', taskController.getSmartView);

router.get('/', taskController.getTasks);
router.get('/today', taskController.getTodayTasks);
// Convenience alias: GET /tasks/grouped → same as GET /tasks?grouped=true
router.get('/grouped', (req, res, next) => {
  req.query.grouped = 'true';
  return taskController.getTasks(req, res, next);
});
router.post('/', writeLimiter, validateCreateTask, taskController.createTask);
router.put('/:id', writeLimiter, validateUpdateTask, taskController.updateTask);
router.patch('/:id/complete', taskController.completeTask);
router.delete('/:id', taskController.deleteTask);
router.post('/ai-breakdown', taskController.aiBreakdown);

// AI prioritize — smart sort of pending tasks
router.post('/ai-prioritize', async (req, res) => {
  try {
    const Task = require('../models/task.model');
    const { chat } = require('../ai/ai.service');
    const tasks = await Task.findAll({
      where: { user_id: req.user.id, status: 'pending' },
      order: [['due_date', 'ASC']], limit: 20
    });
    if (tasks.length === 0) return res.json({ success: true, data: { tasks: [], message: 'لا توجد مهام معلقة' } });
    const list = tasks.map((t,i) => `${i+1}. ${t.title} (${t.priority}، ${t.due_date||'غير محدد'})`).join('\n');
    const reply = await chat(
      'أنت مساعد إنتاجية. رتّب هذه المهام حسب الأولوية وأضف تعليقاً مختصراً بالعربية لكل منها.',
      list, { max_tokens: 400 }
    );
    res.json({ success: true, data: { tasks: tasks.map(t=>({id:t.id,title:t.title,priority:t.priority,due_date:t.due_date})), ai_priority_notes: reply } });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// AI recommendation logging — track display, click, completion events
router.post('/smart-view/log', async (req, res) => {
  try {
    const { event, taskId, score } = req.body;
    // event: 'display' | 'click' | 'complete'
    const validEvents = ['display', 'click', 'complete'];
    if (!validEvents.includes(event)) {
      return res.status(400).json({ success: false, message: 'Invalid event type' });
    }
    logger.info(`[SMART-LOG] user=${req.user.id} event=${event} task=${taskId || 'none'} score=${score || 0}`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
