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
      order: [['createdAt', 'DESC']],
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

// ─── Proactive Monitor API ────────────────────────────────────────────────────
const { triggerNow } = require('../services/proactive.monitor.service');

/**
 * POST /notifications/trigger-proactive
 * Manually trigger an AI proactive message for current user (for testing / frontend trigger)
 */
router.post('/trigger-proactive', async (req, res) => {
  try {
    const { type = 'morning_check' } = req.body;
    const validTypes = ['morning_check', 'mood_check', 'overdue_tasks', 'energy_drop', 'habit_reminder', 'burnout_alert', 'evening_review', 'daily_question'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'نوع رسالة غير صالح', valid: validTypes });
    }
    const result = await triggerNow(req.user.id, type);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: 'فشل في إرسال الرسالة: ' + err.message });
  }
});

/**
 * GET /notifications/proactive-status
 * Returns monitoring status for the current user
 */
router.get('/proactive-status', async (req, res) => {
  try {
    const { Op } = require('sequelize');
    const proactiveTypes = ['morning_briefing','mood_prompt','habit_reminder','burnout_alert','evening_review','daily_question','overdue_reminder','energy_alert','idle_check','ai_proactive'];
    const recent = await Notification.findAll({
      where: { user_id: req.user.id, type: { [Op.in]: proactiveTypes } },
      order: [['createdAt', 'DESC']],
      limit: 5,
    });
    res.json({
      success: true,
      data: {
        monitoring_active: true,
        recent_proactive: recent,
        schedule: {
          morning_briefing: '7:30 AM',
          mood_check: '2:00 PM & 7:00 PM',
          energy_check: 'Every 2 hours (10 AM–6 PM)',
          habit_reminder: '11:00 AM & 5:00 PM',
          overdue_tasks: '10 AM, 1 PM, 4 PM',
          burnout_check: '6:00 PM',
          evening_review: '9:00 PM',
          daily_question: '12:00 PM',
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
