/**
 * Notification Routes
 * Phase 16 upgrade: smart reminders with reminder_before and dynamic messages
 */
const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { Notification } = require('../models/insight.model');
const { Op }  = require('sequelize');
const logger  = require('../utils/logger');

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

// ─── Phase 16: Smart Reminder Creation ───────────────────────────────────────
/**
 * POST /notifications/smart-reminder
 * Create a smart AI-powered reminder for a task or habit.
 * Body: { type: 'task'|'habit', item_id, item_title, reminder_before?, scheduled_at?, priority? }
 */
router.post('/smart-reminder', async (req, res) => {
  const {
    type          = 'task',
    item_id,
    item_title,
    reminder_before = 30,       // minutes before
    scheduled_at,
    priority       = 'medium',
  } = req.body;

  if (!item_id || !item_title) {
    return res.status(400).json({ success: false, message: 'item_id و item_title مطلوبان' });
  }

  try {
    const userId    = req.user.id;
    const name      = req.user.name?.split(' ')[0] || 'صديقي';
    const minuteLabel = reminder_before >= 60
      ? `${Math.round(reminder_before / 60)} ساعة`
      : `${reminder_before} دقيقة`;

    // Build dynamic AI-style message
    const isUrgentPriority = priority === 'urgent' || priority === 'high';
    let title, body, dynamic_message;

    if (type === 'task') {
      title = isUrgentPriority
        ? `⚡ ${name}، مهمة عاجلة تقترب!`
        : `📋 تذكير: ${item_title}`;
      body = reminder_before <= 10
        ? `ابدأ "${item_title}" الآن — الوقت ينفد!`
        : `"${item_title}" بعد ${minuteLabel}. هيّئ نفسك.`;
      dynamic_message = `${name}، "${item_title}" بعد ${minuteLabel}. ${isUrgentPriority ? 'هذه مهمة عالية الأولوية — لا تؤخّرها.' : 'خطوة صغيرة تقدر عليها!'}`;
    } else {
      title = `🔄 حان وقت عادتك: ${item_title}`;
      body  = `"${item_title}" بعد ${minuteLabel}. لا تكسر سلسلتك! 🔥`;
      dynamic_message = `${name}، حان وقت عادتك "${item_title}" خلال ${minuteLabel}. الاستمرارية هي مفتاح النجاح.`;
    }

    // Calculate scheduled_at if not provided
    const schedTime = scheduled_at
      ? new Date(scheduled_at)
      : new Date(Date.now() + (reminder_before * 60 * 1000));

    const notification = await Notification.create({
      user_id          : userId,
      type             : `smart_reminder_${type}`,
      title,
      body,
      dynamic_message,
      reminder_before,
      priority,
      related_item_id  : item_id,
      related_item_type: type,
      scheduled_at     : schedTime,
      channel          : 'in_app',
      data             : { item_id, item_title, type, reminder_before },
    });

    logger.info(`[NOTIFICATION] Smart reminder created: ${notification.id} for ${type} "${item_title}" (${reminder_before}m before)`);

    res.status(201).json({
      success: true,
      data   : {
        notification_id : notification.id,
        title,
        body,
        dynamic_message,
        reminder_before,
        priority,
        scheduled_at    : notification.scheduled_at,
        related_item_id : item_id,
        related_item_type: type,
      },
    });
  } catch (e) {
    logger.error('[NOTIFICATION] smart-reminder error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
});

// ─── Phase 16: Get Upcoming Smart Reminders ──────────────────────────────────
/**
 * GET /notifications/upcoming
 * Returns upcoming scheduled notifications (not yet sent)
 */
router.get('/upcoming', async (req, res) => {
  try {
    const upcoming = await Notification.findAll({
      where: {
        user_id     : req.user.id,
        is_sent     : false,
        scheduled_at: { [Op.gte]: new Date() },
      },
      order: [['scheduled_at', 'ASC']],
      limit: 20,
    });

    res.json({
      success: true,
      data   : { reminders: upcoming, count: upcoming.length },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
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
          mood_check       : '2:00 PM & 7:00 PM',
          energy_check     : 'Every 2 hours (10 AM–6 PM)',
          habit_reminder   : '11:00 AM & 5:00 PM',
          overdue_tasks    : '10 AM, 1 PM, 4 PM',
          burnout_check    : '6:00 PM',
          evening_review   : '9:00 PM',
          daily_question   : '12:00 PM',
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ─── Phase 5: Compute trigger_time for a task/habit reminder ──────────────────
/**
 * POST /notifications/compute-trigger
 * Compute trigger_time = item_time - reminder_before minutes
 * Body: { item_time (ISO or HH:MM), reminder_before (minutes), timezone? }
 * Returns: { trigger_time (ISO), item_time, reminder_before, minutes_remaining }
 */
router.post('/compute-trigger', async (req, res) => {
  try {
    const {
      item_time,
      reminder_before = 30,
      timezone,
    } = req.body;

    if (!item_time) {
      return res.status(400).json({ success: false, message: 'item_time مطلوب (ISO أو HH:MM)' });
    }

    const tz = timezone || req.user.timezone || 'Africa/Cairo';
    const moment = require('moment-timezone');

    // Parse item_time — could be ISO datetime or HH:MM (today)
    let itemMoment;
    if (/^\d{2}:\d{2}$/.test(item_time)) {
      // HH:MM — assume today
      const [h, m] = item_time.split(':').map(Number);
      itemMoment = moment().tz(tz).hour(h).minute(m).second(0);
    } else {
      itemMoment = moment(item_time).tz(tz);
    }

    const triggerMoment  = itemMoment.clone().subtract(reminder_before, 'minutes');
    const now            = moment().tz(tz);
    const minutesRemaining = triggerMoment.diff(now, 'minutes');

    res.json({
      success: true,
      data: {
        item_time:         itemMoment.toISOString(),
        item_time_local:   itemMoment.format('HH:mm'),
        trigger_time:      triggerMoment.toISOString(),
        trigger_time_local: triggerMoment.format('HH:mm'),
        reminder_before,
        timezone:          tz,
        minutes_remaining: minutesRemaining,
        is_past:           minutesRemaining < 0,
        status:            minutesRemaining < 0 ? 'past' : minutesRemaining === 0 ? 'now' : 'upcoming',
      },
    });
  } catch (error) {
    logger.error('[NOTIFICATION] compute-trigger error:', error);
    res.status(500).json({ success: false, message: 'فشل في حساب وقت التذكير' });
  }
});

/**
 * GET /notifications/settings
 * Returns user's default reminder settings
 */
router.get('/settings', async (req, res) => {
  try {
    const user = req.user;
    res.json({
      success: true,
      data: {
        default_reminder_before: user.default_reminder_before || 30,
        timezone: user.timezone || 'Africa/Cairo',
        reminder_channels: ['in_app', 'push'],
        available_intervals: [5, 10, 15, 30, 60, 120],
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب الإعدادات' });
  }
});

module.exports = router;

