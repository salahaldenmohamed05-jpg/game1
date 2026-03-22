/**
 * Dashboard Routes
 */
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/', dashboardController.getDashboard);

// GET /dashboard/stats — alias used by frontend dashboardAPI.getQuickStats
router.get('/stats', dashboardController.getDashboard);

// GET /dashboard/overview — alias
router.get('/overview', dashboardController.getDashboard);

module.exports = router;
