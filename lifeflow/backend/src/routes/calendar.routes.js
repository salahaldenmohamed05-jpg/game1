/**
 * Calendar Routes — التقويم الذكي
 * Provides events from tasks + external integrations (mock/OAuth)
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { writeLimiter } = require('../middleware/rateLimiter');
const { body } = require('express-validator');
const { handleValidation } = require('../middleware/validators');
const logger = require('../utils/logger');

router.use(protect);

/** Helper: get tasks as calendar events */
async function getTaskEvents(userId, timezone = 'Africa/Cairo') {
  try {
    const Task = require('../models/task.model');
    const { Op } = require('sequelize');
    const moment = require('moment-timezone');

    const startOfMonth = moment().tz(timezone).startOf('month').toDate();
    const endOfMonth = moment().tz(timezone).endOf('month').add(2, 'months').toDate();

    const tasks = await Task.findAll({
      where: {
        user_id: userId,
        due_date: { [Op.between]: [startOfMonth, endOfMonth] },
      },
      attributes: ['id', 'title', 'due_date', 'status', 'priority', 'estimated_minutes', 'category'],
      order: [['due_date', 'ASC']],
      limit: 100,
      raw: true,
    });

    return tasks.map(t => ({
      id: `task_${t.id}`,
      title: t.title,
      start: moment(t.due_date).tz(timezone).format(),
      end:   moment(t.due_date).tz(timezone).add(t.estimated_minutes || 30, 'minutes').format(),
      source: 'lifeflow',
      type:   'task',
      status: t.status,
      priority: t.priority,
      category: t.category,
      color:  t.priority === 'urgent' ? '#EF4444' : t.priority === 'high' ? '#F59E0B' : t.priority === 'medium' ? '#6C63FF' : '#6B7280',
    }));
  } catch (e) {
    logger.warn('Calendar task events error:', e.message);
    return [];
  }
}

/** GET /calendar — main events endpoint */
router.get('/', async (req, res) => {
  try {
    const userId = req.user.id;
    const timezone = req.user.timezone || 'Africa/Cairo';
    const taskEvents = await getTaskEvents(userId, timezone);

    // Check connected integrations for external events
    let externalEvents = [];
    try {
      const { ConnectedIntegration, ExternalEvent } = require('../models');
      const connections = await ConnectedIntegration.findAll({
        where: { user_id: userId, is_active: true },
        raw: true,
      });
      if (connections.length > 0) {
        const extEvts = await ExternalEvent.findAll({
          where: { user_id: userId },
          order: [['event_date', 'ASC']],
          limit: 50,
          raw: true,
        });
        externalEvents = extEvts.map(e => ({
          id: `ext_${e.id}`,
          title: e.title,
          start: e.event_date,
          end: new Date(new Date(e.event_date).getTime() + (e.duration_minutes || 30) * 60000),
          source: e.source,
          type: 'external',
          color: '#10B981',
        }));
      }
    } catch (e) { logger.debug('[CALENDAR] External events load failed:', e.message); }

    // Add some AI-generated suggestions as pseudo-events
    const moment = require('moment-timezone');
    const now = moment().tz(timezone);
    const aiSuggestions = [
      {
        id: 'ai_focus_1',
        title: '⚡ وقت تركيز مقترح',
        start: now.clone().hour(9).minute(0).second(0).format(),
        end:   now.clone().hour(10).minute(30).second(0).format(),
        source: 'ai',
        type: 'suggestion',
        color: '#8B5CF6',
      },
      {
        id: 'ai_break_1',
        title: '☕ استراحة مقترحة',
        start: now.clone().hour(14).minute(0).second(0).format(),
        end:   now.clone().hour(14).minute(15).second(0).format(),
        source: 'ai',
        type: 'suggestion',
        color: '#F59E0B',
      },
    ];

    const allEvents = [...taskEvents, ...externalEvents, ...aiSuggestions];

    res.json({
      success: true,
      data: {
        events: allEvents,
        total: allEvents.length,
        sources: {
          lifeflow: taskEvents.length,
          external: externalEvents.length,
          ai_suggestions: aiSuggestions.length,
        },
        integrations: {
          google_calendar: { status: 'setup_required', setup_url: '/api/v1/calendar/google/auth' },
          outlook:         { status: 'setup_required', setup_url: '/api/v1/calendar/outlook/auth' },
        },
      },
    });
  } catch (err) {
    logger.error('Calendar events error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في جلب أحداث التقويم' });
  }
});

const validateCalendarEvent = [
  body('title').trim().notEmpty().withMessage('عنوان الحدث مطلوب').isLength({ max: 500 }).withMessage('العنوان طويل جداً'),
  body('start').notEmpty().withMessage('تاريخ البداية مطلوب'),
  body('type').optional().isIn(['personal', 'work', 'meeting', 'other']).withMessage('نوع الحدث غير صالح'),
  handleValidation,
];

router.post('/', writeLimiter, validateCalendarEvent, async (req, res) => {
  try {
    const { title, start, end, description, type = 'personal' } = req.body;

    // Create as task with due_date
    const Task = require('../models/task.model');
    const task = await Task.create({
      user_id: req.user.id,
      title,
      due_date: new Date(start),
      estimated_minutes: end ? Math.round((new Date(end) - new Date(start)) / 60000) : 30,
      category: type === 'personal' ? 'personal' : 'work',
      status: 'pending',
      priority: 'medium',
    });

    res.json({ success: true, message: 'تم إنشاء الحدث', data: { id: task.id, title: task.title, start } });
  } catch (err) {
    logger.error('Create calendar event error:', err.message);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء الحدث' });
  }
});

router.get('/google/auth', async (req, res) => {
  const setupGuide = {
    step1: 'اذهب إلى https://console.cloud.google.com/',
    step2: 'أنشئ مشروعاً جديداً',
    step3: 'فعّل Google Calendar API',
    step4: 'أنشئ OAuth 2.0 credentials',
    step5: 'أضف GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET و GOOGLE_REDIRECT_URI في backend/.env',
    step6: 'أعد تشغيل الخادم',
  };
  res.json({
    success: true,
    status: 'setup_required',
    message: 'يحتاج إعداد Google OAuth',
    setup_guide: setupGuide,
    setup_url: 'https://console.cloud.google.com/',
  });
});

router.get('/outlook/auth', async (req, res) => {
  res.json({
    success: true,
    status: 'setup_required',
    message: 'يحتاج إعداد Microsoft Azure OAuth',
    setup_url: 'https://portal.azure.com/',
  });
});

module.exports = router;
