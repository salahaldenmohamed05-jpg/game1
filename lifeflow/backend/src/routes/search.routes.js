/**
 * Global Search Routes — LifeFlow
 * ================================
 * GET /api/v1/search?q=<query>&type=all|tasks|habits
 */
'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

router.use(protect);

router.get('/', async (req, res) => {
  try {
    const { q, type = 'all', limit = 20 } = req.query;
    if (!q || q.trim().length < 1) {
      return res.json({ success: true, data: { results: [], total: 0 } });
    }

    const query = q.trim();
    const userId = req.user.id;
    const results = [];
    const maxLimit = Math.min(parseInt(limit) || 20, 50);
    const searchPattern = `%${query}%`;

    // Use raw SQL to avoid Sequelize model loading issues
    if (type === 'all' || type === 'tasks') {
      try {
        const [tasks] = await sequelize.query(
          `SELECT id, title, description, status, priority, due_date 
           FROM tasks WHERE user_id = ? AND (title LIKE ? OR description LIKE ?) 
           ORDER BY createdAt DESC LIMIT ?`,
          { replacements: [userId, searchPattern, searchPattern, maxLimit] }
        );
        tasks.forEach(t => {
          results.push({
            id: t.id, type: 'task', title: t.title || '',
            description: t.description || '', status: t.status || 'pending',
            priority: t.priority || 'medium', due_date: t.due_date,
            icon: '📋', view: 'tasks',
          });
        });
      } catch (e) {
        logger.warn('[SEARCH] Task query error: ' + String(e?.message || e));
      }
    }

    if (type === 'all' || type === 'habits') {
      try {
        const [habits] = await sequelize.query(
          `SELECT id, name, description, is_active, category 
           FROM habits WHERE user_id = ? AND (name LIKE ? OR description LIKE ?) 
           ORDER BY createdAt DESC LIMIT ?`,
          { replacements: [userId, searchPattern, searchPattern, maxLimit] }
        );
        habits.forEach(h => {
          results.push({
            id: h.id, type: 'habit', title: h.name || '',
            description: h.description || '',
            status: h.is_active !== 0 ? 'active' : 'paused',
            category: h.category || '', icon: '🎯', view: 'habits',
          });
        });
      } catch (e) {
        logger.warn('[SEARCH] Habit query error: ' + String(e?.message || e));
      }
    }

    // Sort by relevance
    results.sort((a, b) => {
      const aExact = a.title.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
      const bExact = b.title.toLowerCase().includes(query.toLowerCase()) ? 1 : 0;
      return bExact - aExact;
    });

    res.json({
      success: true,
      data: {
        results: results.slice(0, maxLimit),
        total: results.length,
        query,
      },
    });
  } catch (error) {
    logger.error('[SEARCH] Error: ' + String(error?.message || error));
    res.status(500).json({ success: false, message: 'حدث خطأ في البحث' });
  }
});

module.exports = router;
