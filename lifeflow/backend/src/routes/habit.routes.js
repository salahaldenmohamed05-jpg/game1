/**
 * Habit Routes
 */
const express = require('express');
const router = express.Router();
const habitController = require('../controllers/habit.controller');
const { protect } = require('../middleware/auth.middleware');
const { validateCreateHabit, validateUpdateHabit } = require('../middleware/validators');
const { writeLimiter } = require('../middleware/rateLimiter');

router.use(protect);

router.get('/', habitController.getHabits);
router.get('/today-summary', habitController.getTodaySummary);

// GET /habits/today — alias for today-summary
router.get('/today', habitController.getTodaySummary);

router.post('/', writeLimiter, validateCreateHabit, habitController.createHabit);
router.put('/:id', writeLimiter, validateUpdateHabit, habitController.updateHabit);
router.delete('/:id', habitController.deleteHabit);

router.post('/:id/check-in', habitController.checkIn);
router.post('/:id/checkin', habitController.checkIn); // alias without hyphen

// Log value-based check-in (e.g. water glasses: 3 out of 8)
router.post('/:id/log', habitController.logValue);

router.get('/:id/stats', habitController.getHabitStats);
router.get('/:id/schedule', habitController.getHabitSchedule);

module.exports = router;
