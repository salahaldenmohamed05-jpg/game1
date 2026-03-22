/**
 * Timeline Service — Phase 9
 * ============================
 * Generates a personal activity timeline showing productivity events,
 * mood patterns, habit completions, and key life milestones.
 */

'use strict';

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

function getModels() {
  const Task    = require('../models/task.model');
  const { Habit } = require('../models/habit.model');
  const MoodEntry = require('../models/mood.model');
  const ProductivityScore = require('../models/productivity_score.model');
  return { Task, Habit, MoodEntry, ProductivityScore };
}

/**
 * getTimeline(userId, timezone, days)
 */
async function getTimeline(userId, timezone = 'Africa/Cairo', days = 14) {
  try {
    const { Task, Habit, MoodEntry, ProductivityScore } = getModels();
    const since = moment.tz(timezone).subtract(days, 'days').toDate();

    const [completedTasks, moods, scores] = await Promise.all([
      Task.findAll({ where: { user_id: userId, status: 'completed', updatedAt: { [Op.gte]: since } }, raw: true, order: [['updatedAt','DESC']], limit: 20 }),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: since } }, raw: true, order: [['entry_date','DESC']], limit: 20 }),
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since } }, raw: true, order: [['score_date','DESC']], limit: 14 }),
    ]);

    const events = [];

    // Task completions
    completedTasks.forEach(t => {
      events.push({
        type: 'task_completed',
        date: t.updatedAt,
        title: `أنجزت: ${t.title}`,
        subtitle: `أولوية: ${t.priority}`,
        icon: '✅',
        color: '#10B981',
        priority: t.priority,
      });
    });

    // Mood logs
    moods.forEach(m => {
      const score = m.mood_score || m.score || 5;
      const emoji = score >= 8 ? '😊' : score >= 6 ? '🙂' : score >= 4 ? '😐' : '😔';
      events.push({
        type: 'mood_log',
        date: m.entry_date || m.createdAt,
        title: `مزاج: ${score}/10 ${emoji}`,
        subtitle: m.notes || m.note || '',
        icon: emoji,
        color: score >= 7 ? '#3B82F6' : score >= 5 ? '#F59E0B' : '#EF4444',
        mood_score: score,
      });
    });

    // Productivity milestones
    scores.forEach(s => {
      if ((s.overall_score || 0) >= 70) {
        events.push({
          type: 'productivity_milestone',
          date: s.score_date,
          title: `إنتاجية ممتازة: ${s.overall_score}/100`,
          subtitle: 'يوم إنتاجي مميز',
          icon: '⭐',
          color: '#F59E0B',
          score: s.overall_score,
        });
      }
    });

    // Sort by date descending
    events.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Group by day
    const grouped = {};
    events.forEach(e => {
      const day = moment.tz(e.date, timezone).format('YYYY-MM-DD');
      if (!grouped[day]) grouped[day] = { date: day, label: moment.tz(e.date, timezone).format('dddd، D MMMM'), events: [] };
      grouped[day].events.push(e);
    });

    return {
      timeline: Object.values(grouped).sort((a, b) => b.date.localeCompare(a.date)),
      total_events: events.length,
      period_days: days,
    };
  } catch (err) {
    logger.error('timeline error:', err.message);
    throw err;
  }
}

module.exports = { getTimeline };
