/**
 * Task Routes
 */
const express = require('express');
const router = express.Router();
const taskController = require('../controllers/task.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/', taskController.getTasks);
router.get('/today', taskController.getTodayTasks);
router.post('/', taskController.createTask);
router.put('/:id', taskController.updateTask);
router.patch('/:id/complete', taskController.completeTask);
router.delete('/:id', taskController.deleteTask);
router.post('/ai-breakdown', taskController.aiBreakdown);

module.exports = router;
