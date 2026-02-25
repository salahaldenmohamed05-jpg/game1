/**
 * Mood Routes
 */
const express = require('express');
const router = express.Router();
const moodController = require('../controllers/mood.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.post('/check-in', moodController.checkIn);
router.get('/today', moodController.getTodayMood);
router.get('/history', moodController.getMoodHistory);
router.get('/analytics', moodController.getMoodAnalytics);

module.exports = router;
