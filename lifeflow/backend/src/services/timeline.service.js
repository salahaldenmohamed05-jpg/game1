/**
 * Life Timeline Service
 * ======================
 * Aggregates all user events (tasks, habits, mood, insights, audits)
 * into a unified, sorted chronological timeline.
 *
 * Use cases:
 * - "What happened this week?" — unified view
 * - Activity heatmap data
 * - Context for the AI coach
 */

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

const getModels = () => ({
  Task:         require('../models/task.model'),
  Habit:        require('../models/habit.model').Habit,
  HabitLog:     require('../models/habit.model').HabitLog,
  MoodEntry:    require('../models/mood.model'),
  Insight:      require('../models/insight.model').Insight,
  Notification: require('../models/insight.model').Notification,
  WeeklyAudit:  require('../models/weekly_audit.model'),
});

/**
 * Build a unified timeline of events for a user.
 * @param {string} userId
 * @param {string} timezone
 * @param {number} days  — look-back window (default: 30)
 * @param {string[]} types — filter to specific event types (optional)
 * @returns {TimelineEvent[]}
 */
async function buildTimeline(userId, timezone = 'Africa/Cairo', days = 30, types = null) {
  const { Task, HabitLog, Habit, MoodEntry, Insight, Notification, WeeklyAudit } = getModels();

  const tz        = timezone || 'Africa/Cairo';
  const startDate = moment().tz(tz).subtract(days, 'days').format('YYYY-MM-DD');
  const startISO  = moment().tz(tz).subtract(days, 'days').startOf('day').toDate();

  try {
    const shouldInclude = (type) => !types || types.includes(type);

    const [tasks, habitLogs, habits, moodEntries, insights, notifications, weeklyAudits] =
      await Promise.all([
        shouldInclude('task') ? Task.findAll({
          where: {
            user_id: userId,
            [Op.or]: [
              { completed_at: { [Op.gte]: startISO } },
              { createdAt:    { [Op.gte]: startISO } },
            ],
          },
          limit: 200,
        }) : [],

        shouldInclude('habit') ? HabitLog.findAll({
          where: { user_id: userId, log_date: { [Op.gte]: startDate }, completed: true },
          limit: 500,
        }) : [],

        shouldInclude('habit') ? Habit.findAll({
          where: { user_id: userId, is_active: true },
        }) : [],

        shouldInclude('mood') ? MoodEntry.findAll({
          where: { user_id: userId, entry_date: { [Op.gte]: startDate } },
          order: [['entry_date', 'DESC']],
          limit: 100,
        }) : [],

        shouldInclude('insight') ? Insight.findAll({
          where: { user_id: userId, createdAt: { [Op.gte]: startISO } },
          order: [['createdAt', 'DESC']],
          limit: 50,
        }) : [],

        shouldInclude('notification') ? Notification.findAll({
          where: { user_id: userId, createdAt: { [Op.gte]: startISO } },
          order: [['createdAt', 'DESC']],
          limit: 50,
        }) : [],

        shouldInclude('audit') ? WeeklyAudit.findAll({
          where: { user_id: userId, week_start: { [Op.gte]: startDate } },
          order: [['week_start', 'DESC']],
          limit: 10,
        }) : [],
      ]);

    // Build habit lookup map
    const habitMap = {};
    habits.forEach(h => { habitMap[h.id] = h; });

    // ── Convert to unified timeline events ────────────────────────────────────
    const events = [];

    // Tasks: completed tasks as achievements, newly created as activity
    tasks.forEach(task => {
      if (task.completed_at) {
        events.push({
          id:         `task_done_${task.id}`,
          type:       'task_completed',
          category:   task.category || 'personal',
          title:      `أنجزت: ${task.title}`,
          subtitle:   getPriorityLabel(task.priority),
          icon:       '✅',
          timestamp:  new Date(task.completed_at).toISOString(),
          date:       moment(task.completed_at).tz(tz).format('YYYY-MM-DD'),
          priority:   task.priority,
          color:      getCategoryColor(task.category),
          entity_id:  task.id,
          entity_type: 'task',
          metadata: {
            duration: task.actual_duration,
            on_time:  task.due_date ? new Date(task.completed_at) <= new Date(task.due_date) : null,
          },
        });
      }
    });

    // Habit completions
    habitLogs.forEach(log => {
      const habit = habitMap[log.habit_id];
      events.push({
        id:         `habit_${log.id}`,
        type:       'habit_completed',
        category:   habit?.category || 'health',
        title:      `عادة: ${habit?.name || 'عادة'}`,
        subtitle:   `سلسلة ${habit?.current_streak || 0} يوم 🔥`,
        icon:       habit?.icon || '⭐',
        timestamp:  log.completed_at ? new Date(log.completed_at).toISOString()
                    : moment(log.log_date).tz(tz).hour(12).minute(0).second(0).toISOString(),
        date:       log.log_date,
        color:      habit?.color || '#10B981',
        entity_id:  log.habit_id,
        entity_type: 'habit',
        metadata: {
          streak:     habit?.current_streak,
          mood_after: log.mood_after,
        },
      });
    });

    // Mood entries
    moodEntries.forEach(entry => {
      events.push({
        id:         `mood_${entry.id}`,
        type:       'mood_logged',
        category:   'mood',
        title:      `مزاج: ${getMoodLabel(entry.mood_score)}`,
        subtitle:   `${entry.mood_score}/10`,
        icon:       getMoodEmoji(entry.mood_score),
        timestamp:  moment(entry.entry_date).tz(tz).hour(12).minute(0).second(0).toISOString(),
        date:       entry.entry_date,
        color:      getMoodColor(entry.mood_score),
        entity_id:  entry.id,
        entity_type: 'mood',
        metadata: {
          score:    entry.mood_score,
          emotions: entry.emotions || [],
          period:   entry.period,
        },
      });
    });

    // Insights
    insights.forEach(insight => {
      events.push({
        id:         `insight_${insight.id}`,
        type:       `insight_${insight.type}`,
        category:   'insight',
        title:      insight.title,
        subtitle:   insight.type === 'daily_summary' ? 'ملخص يومي' : 'تقرير أسبوعي',
        icon:       insight.type === 'weekly_report' ? '📊' : '💡',
        timestamp:  new Date(insight.createdAt).toISOString(),
        date:       moment(insight.createdAt).tz(tz).format('YYYY-MM-DD'),
        color:      '#6C63FF',
        entity_id:  insight.id,
        entity_type: 'insight',
        metadata: {
          is_read:  insight.is_read,
          priority: insight.priority,
        },
      });
    });

    // Weekly audits
    weeklyAudits.forEach(audit => {
      events.push({
        id:         `audit_${audit.id}`,
        type:       'weekly_audit',
        category:   'audit',
        title:      `تدقيق الأسبوع ${audit.week_number || ''}`,
        subtitle:   `إنجاز ${Math.round(audit.task_completion_rate)}%`,
        icon:       '📋',
        timestamp:  moment(audit.week_end).tz(tz).endOf('day').toISOString(),
        date:       audit.week_end,
        color:      '#F59E0B',
        entity_id:  audit.id,
        entity_type: 'audit',
        metadata: {
          completion_rate: audit.task_completion_rate,
          avg_mood:        audit.avg_mood,
          top_achievement: audit.top_achievement,
        },
      });
    });

    // ── Sort by timestamp descending (most recent first) ──────────────────────
    events.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    // ── Build daily activity heatmap ──────────────────────────────────────────
    const heatmap = buildHeatmap(events, days, tz);

    return { events, heatmap, total: events.length, period_days: days };
  } catch (err) {
    logger.error('buildTimeline error:', err.message);
    throw err;
  }
}

/**
 * Build an activity heatmap for the last N days.
 * Returns array of { date, count, intensity } for each day.
 */
function buildHeatmap(events, days, tz) {
  const heatmap = {};
  // Initialize all days to 0
  for (let i = 0; i < days; i++) {
    const date = moment().tz(tz).subtract(i, 'days').format('YYYY-MM-DD');
    heatmap[date] = { date, count: 0, types: new Set() };
  }

  events.forEach(event => {
    if (heatmap[event.date]) {
      heatmap[event.date].count++;
      heatmap[event.date].types.add(event.type);
    }
  });

  return Object.values(heatmap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(d => ({
      date:      d.date,
      count:     d.count,
      types:     Array.from(d.types),
      intensity: d.count === 0 ? 0
                : d.count <= 2 ? 1
                : d.count <= 5 ? 2
                : d.count <= 9 ? 3
                : 4,
    }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPriorityLabel(priority) {
  const map = { urgent: 'عاجل 🔴', high: 'عالي 🟠', medium: 'متوسط 🟡', low: 'منخفض 🟢' };
  return map[priority] || priority;
}

function getCategoryColor(category) {
  const map = {
    university: '#6C63FF', work: '#10B981', health: '#EF4444',
    fitness: '#F59E0B',    finance: '#84CC16', personal: '#EC4899',
    social: '#06B6D4',     learning: '#8B5CF6', other: '#6B7280',
  };
  return map[category] || '#6B7280';
}

function getMoodEmoji(score) {
  if (score >= 9) return '🤩';
  if (score >= 7) return '😊';
  if (score >= 5) return '😐';
  if (score >= 3) return '😔';
  return '😞';
}

function getMoodLabel(score) {
  if (score >= 9) return 'رائع جداً';
  if (score >= 7) return 'جيد';
  if (score >= 5) return 'معتدل';
  if (score >= 3) return 'ليس جيداً';
  return 'سيء';
}

function getMoodColor(score) {
  if (score >= 7) return '#10B981';
  if (score >= 5) return '#F59E0B';
  return '#EF4444';
}

module.exports = { buildTimeline };
