/**
 * Habit Routes
 */
const express = require('express');
const router = express.Router();
const habitController = require('../controllers/habit.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/', habitController.getHabits);
router.get('/today-summary', habitController.getTodaySummary);
router.post('/', habitController.createHabit);
router.post('/:id/check-in', habitController.checkIn);
router.get('/:id/stats', habitController.getHabitStats);

module.exports = router;
