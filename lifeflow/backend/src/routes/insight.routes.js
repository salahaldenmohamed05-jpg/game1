/**
 * Insight Routes
 */
const express = require('express');
const router = express.Router();
const insightController = require('../controllers/insight.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);

router.get('/', insightController.getInsights);
router.get('/daily', insightController.getDailySummary);
router.get('/weekly', insightController.getWeeklyReport);
router.get('/behavior', insightController.getBehaviorAnalysis);
router.get('/productivity-tips', insightController.getProductivityTips);

module.exports = router;
