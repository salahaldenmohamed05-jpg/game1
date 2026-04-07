/**
 * Goal Routes — LifeFlow
 */
'use strict';

const express = require('express');
const router = express.Router();
const goalController = require('../controllers/goal.controller');
const { protect } = require('../middleware/auth.middleware');
const { writeLimiter } = require('../middleware/rateLimiter');

router.use(protect);

// List & Create
router.get('/',          goalController.listGoals);
router.post('/', writeLimiter, goalController.createGoal);

// Single goal
router.get('/:id',       goalController.getGoal);
router.put('/:id', writeLimiter, goalController.updateGoal);
router.delete('/:id',    goalController.deleteGoal);

// Progress update
router.patch('/:id/progress', writeLimiter, goalController.updateProgress);

module.exports = router;
