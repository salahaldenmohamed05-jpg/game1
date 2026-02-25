/**
 * Notification Routes
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { Notification } = require('../models/insight.model');
const { Op } = require('sequelize');

router.use(protect);

// Get all notifications
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, unread_only } = req.query;
    const where = { user_id: req.user.id };
    if (unread_only === 'true') where.is_read = false;

    const { count, rows } = await Notification.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit),
    });

    res.json({ success: true, data: { notifications: rows, total: count, unread: await Notification.count({ where: { user_id: req.user.id, is_read: false } }) } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب الإشعارات' });
  }
});

// Mark notification as read
router.patch('/:id/read', async (req, res) => {
  try {
    await Notification.update({ is_read: true }, { where: { id: req.params.id, user_id: req.user.id } });
    res.json({ success: true, message: 'تم تعليم الإشعار كمقروء' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل' });
  }
});

// Mark all as read
router.patch('/read-all', async (req, res) => {
  try {
    await Notification.update({ is_read: true }, { where: { user_id: req.user.id, is_read: false } });
    res.json({ success: true, message: 'تم تعليم كل الإشعارات كمقروءة' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل' });
  }
});

module.exports = router;
