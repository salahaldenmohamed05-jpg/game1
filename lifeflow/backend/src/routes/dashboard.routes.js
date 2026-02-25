/**
 * Dashboard Routes
 */
const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboard.controller');
const { protect } = require('../middleware/auth.middleware');

router.use(protect);
router.get('/', dashboardController.getDashboard);

module.exports = router;
