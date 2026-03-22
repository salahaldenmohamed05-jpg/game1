/**
 * Life Score Service — Phase 9
 * ==============================
 * Computes a holistic life score (0-100) from multiple dimensions:
 * productivity, mood, habits, tasks, energy, and behavioral health.
 */

'use strict';

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

function getModels() {
  const Task              = require('../models/task.model');
  const { Habit } = require('../models/habit.model');
  const MoodEntry         = require('../models/mood.model');
  const ProductivityScore = require('../models/productivity_score.model');
  const BehavioralFlag    = require('../models/behavioral_flag.model');
  const EnergyLog         = require('../models/energy_log.model');
  return { Task, Habit, MoodEntry, ProductivityScore, BehavioralFlag, EnergyLog };
}

const WEIGHTS = {
  productivity: 0.30,
  mood:         0.25,
  habits:       0.20,
  energy:       0.15,
  stress:       0.10,
};

/**
 * computeLifeScore(userId, timezone)
 */
async function computeLifeScore(userId, timezone = 'Africa/Cairo') {
  try {
    const { Task, Habit, MoodEntry, ProductivityScore, BehavioralFlag, EnergyLog } = getModels();
    const since14 = moment.tz(timezone).subtract(14, 'days').toDate();
    const since7  = moment.tz(timezone).subtract(7, 'days').toDate();

    const [tasks, moods, scores, flags, energyLogs, habits] = await Promise.all([
      Task.findAll({ where: { user_id: userId, [Op.or]: [{ due_date: { [Op.gte]: since14 } }, { completed_at: { [Op.gte]: since14 } }] }, raw: true }),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: since14 } }, raw: true }),
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since7 } }, raw: true, order: [['score_date','DESC']] }),
      BehavioralFlag.findAll({ where: { user_id: userId, is_resolved: false }, raw: true }),
      EnergyLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: since7 } }, raw: true }),
      Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }),
    ]);

    // Productivity score
    const avgProd = scores.length > 0
      ? scores.reduce((s, r) => s + (r.overall_score || 50), 0) / scores.length
      : 50;
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const taskRate = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 50;
    const prodScore = Math.round(avgProd * 0.6 + taskRate * 0.4);

    // Mood score
    const avgMood = moods.length > 0
      ? moods.reduce((s, m) => s + (m.mood_score || m.score || 5), 0) / moods.length
      : 5;
    const moodScore = Math.round((avgMood / 10) * 100);

    // Habit score
    const activeHabitsWithStreak = habits.filter(h => (h.current_streak || 0) > 0).length;
    const habitScore = habits.length > 0 ? Math.round((activeHabitsWithStreak / habits.length) * 100) : 50;

    // Energy score
    const avgEnergy = energyLogs.length > 0
      ? energyLogs.reduce((s, e) => s + (e.energy_score || 55), 0) / energyLogs.length
      : 55;
    const energyScore = Math.round(avgEnergy);

    // Stress/flag score
    const stressScore = Math.max(0, 100 - flags.length * 15);

    // Weighted life score
    const lifeScore = Math.round(
      prodScore * WEIGHTS.productivity +
      moodScore * WEIGHTS.mood +
      habitScore * WEIGHTS.habits +
      energyScore * WEIGHTS.energy +
      stressScore * WEIGHTS.stress
    );

    const level = lifeScore >= 75 ? 'excellent' : lifeScore >= 60 ? 'good' : lifeScore >= 45 ? 'moderate' : 'needs_improvement';
    const label = lifeScore >= 75 ? 'ممتاز' : lifeScore >= 60 ? 'جيد' : lifeScore >= 45 ? 'متوسط' : 'يحتاج تحسين';

    return {
      life_score: lifeScore,
      level,
      label,
      breakdown: {
        productivity: Math.round(prodScore),
        mood:         Math.round(moodScore),
        habits:       habitScore,
        energy:       Math.round(energyScore),
        stress:       Math.round(stressScore),
      },
      data_points: { tasks: tasks.length, moods: moods.length, scores: scores.length, flags: flags.length },
      computed_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.error('lifescore error:', err.message);
    throw err;
  }
}

/**
 * getLifeScoreHistory(userId, timezone, days)
 */
async function getLifeScoreHistory(userId, timezone = 'Africa/Cairo', days = 30) {
  try {
    const { ProductivityScore } = getModels();
    const since = moment.tz(timezone).subtract(days, 'days').toDate();

    const scores = await ProductivityScore.findAll({
      where: { user_id: userId, score_date: { [Op.gte]: since } },
      raw: true,
      order: [['score_date', 'ASC']],
    });

    const history = scores.map(s => ({
      date: moment.tz(s.score_date || s.createdAt, timezone).format('YYYY-MM-DD'),
      score: s.overall_score || 50,
      label: (s.overall_score || 50) >= 70 ? 'جيد' : 'متوسط',
    }));

    const avg = history.length > 0 ? Math.round(history.reduce((s, h) => s + h.score, 0) / history.length) : 50;
    const trend = history.length >= 3
      ? (history.slice(-3).reduce((s, h) => s + h.score, 0) / 3 > avg ? 'improving' : 'stable')
      : 'stable';

    return { history, average: avg, trend, days };
  } catch (err) {
    logger.error('lifescore history error:', err.message);
    throw err;
  }
}

module.exports = {
  computeLifeScore,
  getLifeScoreHistory,
};
