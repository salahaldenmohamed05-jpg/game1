/**
 * Export Routes — LifeFlow
 * =========================
 * POST /api/v1/export/pdf   → Generate PDF report
 * POST /api/v1/export/excel → Generate Excel/CSV report
 */
'use strict';

const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const logger = require('../utils/logger');

router.use(protect);

// Helper: get user data for export
async function getUserExportData(userId, type = 'all', period = 'month') {
  const Task = require('../models/task.model');
  const { Habit } = require('../models/habit.model');
  const Mood = require('../models/mood.model');
  const { Op } = require('sequelize');

  const now = new Date();
  const days = period === 'week' ? 7 : period === 'month' ? 30 : 90;
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const data = {};

  if (type === 'all' || type === 'tasks') {
    try {
      data.tasks = await Task.findAll({
        where: { user_id: userId, createdAt: { [Op.gte]: startDate } },
        order: [['createdAt', 'DESC']],
        raw: true,
      });
    } catch (e) { data.tasks = []; }
  }

  if (type === 'all' || type === 'habits') {
    try {
      data.habits = await Habit.findAll({
        where: { user_id: userId },
        raw: true,
      });
    } catch (e) { data.habits = []; }
  }

  if (type === 'all' || type === 'mood') {
    try {
      data.moods = await Mood.findAll({
        where: { user_id: userId, createdAt: { [Op.gte]: startDate } },
        order: [['createdAt', 'DESC']],
        raw: true,
      });
    } catch (e) { data.moods = []; }
  }

  return data;
}

// POST /export/csv — Generate CSV report
router.post('/csv', async (req, res) => {
  try {
    const { type = 'all', period = 'month' } = req.body;
    const data = await getUserExportData(req.user.id, type, period);

    const rows = [];
    // Header
    rows.push(['النوع', 'العنوان', 'الحالة', 'الأولوية', 'التاريخ', 'ملاحظات'].join(','));

    if (data.tasks) {
      data.tasks.forEach(t => {
        const status = t.status === 'completed' ? 'مكتمل' : t.status === 'pending' ? 'قيد الانتظار' : t.status;
        const priority = t.priority === 'high' ? 'عالي' : t.priority === 'medium' ? 'متوسط' : 'منخفض';
        rows.push([
          'مهمة',
          `"${(t.title || '').replace(/"/g, '""')}"`,
          status,
          priority,
          t.due_date || t.created_at?.split('T')[0] || '',
          `"${(t.description || '').replace(/"/g, '""').substring(0, 100)}"`,
        ].join(','));
      });
    }

    if (data.habits) {
      data.habits.forEach(h => {
        rows.push([
          'عادة',
          `"${(h.name || '').replace(/"/g, '""')}"`,
          h.is_active !== false ? 'نشطة' : 'متوقفة',
          h.category || '-',
          h.created_at?.split('T')[0] || '',
          `"سلسلة: ${h.current_streak || 0} يوم"`,
        ].join(','));
      });
    }

    if (data.moods) {
      data.moods.forEach(m => {
        rows.push([
          'مزاج',
          `"مستوى المزاج: ${m.mood_score || m.score || '-'}"`,
          '-',
          '-',
          m.created_at?.split('T')[0] || '',
          `"${(m.notes || m.note || '').replace(/"/g, '""').substring(0, 100)}"`,
        ].join(','));
      });
    }

    // Add BOM for UTF-8 support in Excel
    const bom = '\uFEFF';
    const csv = bom + rows.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=lifeflow-report-${new Date().toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } catch (error) {
    logger.error('[EXPORT] CSV error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء التقرير' });
  }
});

// POST /export/json — Generate JSON report
router.post('/json', async (req, res) => {
  try {
    const { type = 'all', period = 'month' } = req.body;
    const data = await getUserExportData(req.user.id, type, period);

    const report = {
      generated_at: new Date().toISOString(),
      period,
      user: req.user.name,
      summary: {
        total_tasks: data.tasks?.length || 0,
        completed_tasks: data.tasks?.filter(t => t.status === 'completed').length || 0,
        total_habits: data.habits?.length || 0,
        mood_entries: data.moods?.length || 0,
      },
      ...data,
    };

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=lifeflow-report-${new Date().toISOString().split('T')[0]}.json`);
    res.json(report);
  } catch (error) {
    logger.error('[EXPORT] JSON error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء التقرير' });
  }
});

// GET /export/summary — Generate summary report (for PDF rendering on frontend)
router.get('/summary', async (req, res) => {
  try {
    const { period = 'month' } = req.body;
    const data = await getUserExportData(req.user.id, 'all', period);

    const completedTasks = data.tasks?.filter(t => t.status === 'completed') || [];
    const pendingTasks = data.tasks?.filter(t => t.status === 'pending') || [];
    const activeHabits = data.habits?.filter(h => h.is_active !== false) || [];
    const avgMood = data.moods?.length > 0
      ? (data.moods.reduce((sum, m) => sum + (m.mood_score || m.score || 0), 0) / data.moods.length).toFixed(1)
      : 0;

    const topHabits = activeHabits
      .sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0))
      .slice(0, 5)
      .map(h => ({ name: h.name, streak: h.current_streak || 0, category: h.category }));

    res.json({
      success: true,
      data: {
        period,
        generated_at: new Date().toISOString(),
        user_name: req.user.name,
        stats: {
          total_tasks: data.tasks?.length || 0,
          completed_tasks: completedTasks.length,
          pending_tasks: pendingTasks.length,
          completion_rate: data.tasks?.length > 0
            ? Math.round((completedTasks.length / data.tasks.length) * 100)
            : 0,
          total_habits: data.habits?.length || 0,
          active_habits: activeHabits.length,
          avg_mood: avgMood,
          mood_entries: data.moods?.length || 0,
        },
        top_habits: topHabits,
        recent_completed: completedTasks.slice(0, 10).map(t => ({
          title: t.title,
          completed_at: t.completed_at || t.updated_at,
          priority: t.priority,
        })),
      },
    });
  } catch (error) {
    logger.error('[EXPORT] Summary error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في إنشاء الملخص' });
  }
});

module.exports = router;
