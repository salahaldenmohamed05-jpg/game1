/**
 * AI Performance Engine
 * ======================
 * Calculates Productivity Score, Focus Score, Consistency Score
 * Generates daily performance snapshots
 * Premium feature — runs via cron + on-demand API
 */

const { Op } = require('sequelize');
const User              = require('../models/user.model');
const ProductivityScore = require('../models/productivity_score.model');
const BehavioralFlag    = require('../models/behavioral_flag.model');
const EnergyProfile     = require('../models/energy_profile.model');
const logger = require('../utils/logger');

// ── Weights for Overall Score ──────────────────────────────────────────────
const WEIGHTS = {
  productivity: 0.40,
  focus:        0.30,
  consistency:  0.30,
};

// ── Score thresholds ───────────────────────────────────────────────────────
const SCORE_LABELS = {
  excellent: { min: 85, label: 'ممتاز 🌟',  color: '#10B981' },
  good:      { min: 70, label: 'جيد 😊',     color: '#6C63FF' },
  average:   { min: 50, label: 'متوسط 😐',   color: '#F59E0B' },
  low:       { min: 30, label: 'منخفض 😔',   color: '#EF4444' },
  critical:  { min: 0,  label: 'يحتاج عمل 🚨', color: '#DC2626' },
};

function getScoreLabel(score) {
  for (const [, v] of Object.entries(SCORE_LABELS)) {
    if (score >= v.min) return v;
  }
  return SCORE_LABELS.critical;
}

/**
 * calculateDailyScores
 * ---------------------
 * Compute all scores for a given user on a given date.
 * Returns a plain object ready to upsert into productivity_scores.
 *
 * @param {string} userId
 * @param {Date}   date
 */
async function calculateDailyScores(userId, date = new Date()) {
  const Task       = require('../models/task.model');
  const Habit      = require('../models/habit.model');
  const MoodEntry  = require('../models/mood.model');

  const dateStr   = date.toISOString().split('T')[0];
  const startOfDay = new Date(dateStr + 'T00:00:00.000Z');
  const endOfDay   = new Date(dateStr + 'T23:59:59.999Z');

  // ── 1. Task Metrics ───────────────────────────────────────────────
  const allTasks = await Task.findAll({
    where: {
      user_id: userId,
      due_date: { [Op.between]: [startOfDay, endOfDay] },
    },
  });

  const completedTasks    = allTasks.filter(t => t.status === 'completed');
  const onTimeTasks       = completedTasks.filter(t =>
    t.completed_at && t.due_date && new Date(t.completed_at) <= new Date(t.due_date)
  );
  const urgentTasks       = allTasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
  const completedUrgent   = urgentTasks.filter(t => t.status === 'completed');

  const taskCompletionRate = allTasks.length > 0
    ? (completedTasks.length / allTasks.length) * 100 : 0;
  const onTimeRate = completedTasks.length > 0
    ? (onTimeTasks.length / completedTasks.length) * 100 : 0;
  const urgentCompletionBonus = urgentTasks.length > 0
    ? (completedUrgent.length / urgentTasks.length) * 20 : 0;

  // ── 2. Habit Metrics ──────────────────────────────────────────────
  const allHabits = await Habit.findAll({ where: { user_id: userId, is_active: true } });
  // Check habit logs for today
  const { sequelize } = require('../config/database');
  const [habitLogs] = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM habit_logs WHERE user_id = ? AND completed_date = ?`,
    { replacements: [userId, dateStr], type: sequelize.QueryTypes.SELECT }
  ).catch(() => [[{ cnt: 0 }]]);

  const completedHabits     = parseInt(habitLogs?.cnt || 0);
  const habitCompletionRate = allHabits.length > 0
    ? (completedHabits / allHabits.length) * 100 : 0;

  // ── 3. Mood Score ─────────────────────────────────────────────────
  const moodEntry = await MoodEntry.findOne({
    where: {
      user_id: userId,
      entry_date: dateStr,
    },
    order: [['entry_date', 'DESC']],
  });
  const moodScore    = moodEntry ? moodEntry.mood_score : null;
  const moodFactor   = moodScore ? (moodScore / 10) * 100 : 50; // neutral default

  // ── 4. Productivity Score (40% weight) ────────────────────────────
  // Formula: task completion (50%) + on-time (30%) + urgent bonus (20%)
  const productivityScore = Math.min(100,
    (taskCompletionRate * 0.50) +
    (onTimeRate         * 0.30) +
    urgentCompletionBonus
  );

  // ── 5. Focus Score (30% weight) ───────────────────────────────────
  // Formula: high-priority task rate + no-reschedule bonus + mood factor
  const rescheduledToday = allTasks.filter(t => (t.reschedule_count || 0) > 0).length;
  const reschedulepenalty= allTasks.length > 0 ? (rescheduledToday / allTasks.length) * 30 : 0;
  const focusScore = Math.min(100, Math.max(0,
    (urgentCompletionBonus * 2) +
    (moodFactor * 0.4) +
    (taskCompletionRate * 0.3) -
    reschedulepenalty
  ));

  // ── 6. Consistency Score (30% weight) ────────────────────────────
  // Based on habit completion + checking back 7 days
  const past7Scores = await ProductivityScore.findAll({
    where: { user_id: userId },
    order: [['score_date', 'DESC']],
    limit: 7,
  });

  let consistencyScore;
  if (past7Scores.length < 3) {
    // Not enough history — use today's data only
    consistencyScore = (habitCompletionRate * 0.6) + (taskCompletionRate * 0.4);
  } else {
    const avgPast = past7Scores.reduce((s, r) => s + r.overall_score, 0) / past7Scores.length;
    const variance = past7Scores.reduce((s, r) => s + Math.pow(r.overall_score - avgPast, 2), 0) / past7Scores.length;
    const stdDev   = Math.sqrt(variance);
    // Lower variance = higher consistency; combine with habit rate
    consistencyScore = Math.min(100, Math.max(0,
      (100 - stdDev) * 0.5 + habitCompletionRate * 0.5
    ));
  }

  // ── 7. Overall Score ─────────────────────────────────────────────
  const overallScore =
    productivityScore * WEIGHTS.productivity +
    focusScore        * WEIGHTS.focus +
    consistencyScore  * WEIGHTS.consistency;

  // ── 8. Comparison ────────────────────────────────────────────────
  const yesterday = await ProductivityScore.findOne({
    where: { user_id: userId },
    order: [['score_date', 'DESC']],
    limit: 1,
  });
  const prevDayScore = yesterday?.overall_score || null;
  const scoreDelta   = prevDayScore !== null ? overallScore - prevDayScore : null;

  return {
    user_id: userId,
    score_date: dateStr,
    productivity_score: Math.round(productivityScore * 10) / 10,
    focus_score:        Math.round(focusScore * 10) / 10,
    consistency_score:  Math.round(consistencyScore * 10) / 10,
    overall_score:      Math.round(overallScore * 10) / 10,
    task_completion_rate:  Math.round(taskCompletionRate * 10) / 10,
    habit_completion_rate: Math.round(habitCompletionRate * 10) / 10,
    mood_average:    moodScore ? Math.round(moodScore * 10) / 10 : null,
    on_time_rate:    Math.round(onTimeRate * 10) / 10,
    prev_day_score:  prevDayScore,
    prev_week_score: past7Scores[6]?.overall_score || null,
    score_delta:     scoreDelta !== null ? Math.round(scoreDelta * 10) / 10 : null,
    raw_data: {
      total_tasks: allTasks.length, completed_tasks: completedTasks.length,
      total_habits: allHabits.length, completed_habits: completedHabits,
      mood_score: moodScore, rescheduled: rescheduledToday,
    },
  };
}

/**
 * upsertDailyScore — compute and save/update today's scores
 */
async function upsertDailyScore(userId, date) {
  try {
    const scores = await calculateDailyScores(userId, date);
    const [record] = await ProductivityScore.findOrCreate({
      where: { user_id: userId, score_date: scores.score_date },
      defaults: scores,
    });
    // Always update with latest values
    await record.update(scores);
    logger.info(`📊 Scores updated for user ${userId}: overall=${scores.overall_score}`);
    return record;
  } catch (err) {
    logger.error(`Score calculation error for ${userId}: ${err.message}`);
    return null;
  }
}

/**
 * getScoreHistory — last N days of scores for charts
 */
async function getScoreHistory(userId, days = 30) {
  const records = await ProductivityScore.findAll({
    where: { user_id: userId },
    order: [['score_date', 'DESC']],
    limit: days,
  });
  return records.reverse(); // oldest first for charting
}

/**
 * getWeeklyComparison — compare this week vs last week
 */
async function getWeeklyComparison(userId) {
  const now       = new Date();
  const thisWeekStart = new Date(now);
  thisWeekStart.setDate(now.getDate() - now.getDay());
  thisWeekStart.setHours(0, 0, 0, 0);

  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = new Date(thisWeekStart);
  lastWeekEnd.setDate(lastWeekEnd.getDate() - 1);

  const [thisWeek, lastWeek] = await Promise.all([
    ProductivityScore.findAll({
      where: { user_id: userId, score_date: { [Op.gte]: thisWeekStart.toISOString().split('T')[0] } },
    }),
    ProductivityScore.findAll({
      where: { user_id: userId, score_date: {
        [Op.between]: [lastWeekStart.toISOString().split('T')[0], lastWeekEnd.toISOString().split('T')[0]],
      }},
    }),
  ]);

  const avg = (arr, key) => arr.length > 0
    ? Math.round(arr.reduce((s, r) => s + (r[key] || 0), 0) / arr.length * 10) / 10
    : 0;

  return {
    this_week: {
      avg_productivity: avg(thisWeek, 'productivity_score'),
      avg_focus:        avg(thisWeek, 'focus_score'),
      avg_consistency:  avg(thisWeek, 'consistency_score'),
      avg_overall:      avg(thisWeek, 'overall_score'),
      days_tracked: thisWeek.length,
    },
    last_week: {
      avg_productivity: avg(lastWeek, 'productivity_score'),
      avg_focus:        avg(lastWeek, 'focus_score'),
      avg_consistency:  avg(lastWeek, 'consistency_score'),
      avg_overall:      avg(lastWeek, 'overall_score'),
      days_tracked: lastWeek.length,
    },
    delta: {
      overall:      avg(thisWeek, 'overall_score') - avg(lastWeek, 'overall_score'),
      productivity: avg(thisWeek, 'productivity_score') - avg(lastWeek, 'productivity_score'),
      focus:        avg(thisWeek, 'focus_score') - avg(lastWeek, 'focus_score'),
      consistency:  avg(thisWeek, 'consistency_score') - avg(lastWeek, 'consistency_score'),
    },
  };
}

module.exports = {
  calculateDailyScores,
  upsertDailyScore,
  getScoreHistory,
  getWeeklyComparison,
  getScoreLabel,
};
