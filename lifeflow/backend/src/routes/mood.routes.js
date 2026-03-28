/**
 * Mood Routes
 */
const express = require('express');
const router = express.Router();
const moodController = require('../controllers/mood.controller');
const { protect } = require('../middleware/auth.middleware');
const { validateMoodCheckIn } = require('../middleware/validators');
const { writeLimiter } = require('../middleware/rateLimiter');

router.use(protect);

router.post('/check-in', writeLimiter, validateMoodCheckIn, moodController.checkIn);

// POST /mood — Flutter mobile alias (without /check-in)
router.post('/', writeLimiter, validateMoodCheckIn, moodController.checkIn);

router.get('/today', moodController.getTodayMood);
router.get('/history', moodController.getMoodHistory);
router.get('/analytics', moodController.getMoodAnalytics);

module.exports = router;
