/**
 * AI Performance Engine Service
 * ================================
 * Computes daily productivity, focus, and consistency scores.
 * Generates weekly performance trends and behavioral analysis.
 */

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

// Lazy-load models to avoid circular deps
const getModels = () => ({
  Task:               require('../models/task.model'),
  Habit:              require('../models/habit.model').Habit,
  MoodEntry:          require('../models/mood.model'),
  ProductivityScore:  require('../models/productivity_score.model'),
  EnergyProfile:      require('../models/energy_profile.model'),
  User:               require('../models/user.model'),
});

// ─────────────────────────────────────────────────────────────────────────────
// SCORING WEIGHTS
// ─────────────────────────────────────────────────────────────────────────────
const WEIGHTS = {
  productivity: {
    task_completion:  0.45,
    habit_completion: 0.25,
    on_time_rate:     0.20,
    mood_boost:       0.10,
  },
  focus: {
    high_priority_completion: 0.50,
    deep_work_sessions:       0.30,
    distraction_avoidance:    0.20,
  },
  consistency: {
    streak_maintenance:  0.40,
    daily_login:         0.20,
    habit_regularity:    0.25,
    mood_logging:        0.15,
  },
  overall: {
    productivity: 0.40,
    focus:        0.35,
    consistency:  0.25,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// DAILY SCORE COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute or refresh the daily performance score for a user.
 * @param {string} userId
 * @param {string} dateStr  YYYY-MM-DD  (defaults to today)
 * @param {string} timezone
 * @returns {ProductivityScore}
 */
async function computeDailyScore(userId, dateStr = null, timezone = 'Africa/Cairo') {
  const { Task, Habit, MoodEntry, ProductivityScore, User } = getModels();

  const tz      = timezone || 'Africa/Cairo';
  const today   = dateStr || moment().tz(tz).format('YYYY-MM-DD');
  const dayStart = moment.tz(today, tz).startOf('day').toDate();
  const dayEnd   = moment.tz(today, tz).endOf('day').toDate();

  try {
    // ── 1. Fetch raw data ────────────────────────────────────────────────────
    const [tasks, habitLogs, moodEntries, user] = await Promise.all([
      Task.findAll({ where: { user_id: userId } }),
      fetchHabitLogs(userId, dayStart, dayEnd),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: today } }),
      User.findByPk(userId),
    ]);

    const todayTasks  = tasks.filter(t => {
      const due = t.due_date ? new Date(t.due_date) : null;
      return due && due >= dayStart && due <= dayEnd;
    });
    const allTasks    = tasks.filter(t => {
      const due = t.due_date ? new Date(t.due_date) : null;
      return due && due <= dayEnd; // all past/current tasks
    });

    // ── 2. Productivity Score ─────────────────────────────────────────────────
    const completedToday   = todayTasks.filter(t => t.status === 'completed').length;
    const totalToday       = todayTasks.length || 1;
    const taskCompRate     = completedToday / totalToday;

    const completedHabits  = habitLogs.filter(l => l.completed).length;
    const totalHabits      = habitLogs.length || 1;
    const habitCompRate    = completedHabits / totalHabits;

    const onTimeTasks      = todayTasks.filter(t =>
      t.status === 'completed' && t.completed_at && t.due_date &&
      new Date(t.completed_at) <= new Date(t.due_date)
    ).length;
    const onTimeRate       = completedToday > 0 ? onTimeTasks / completedToday : 0;

    const avgMoodRaw       = moodEntries.length > 0
      ? moodEntries.reduce((s, m) => s + (m.mood_score || 5), 0) / moodEntries.length
      : 5;
    const moodBoost        = (avgMoodRaw / 10); // normalize to 0-1

    const productivityScore = Math.min(100, Math.round(
      (taskCompRate  * WEIGHTS.productivity.task_completion  +
       habitCompRate * WEIGHTS.productivity.habit_completion +
       onTimeRate    * WEIGHTS.productivity.on_time_rate     +
       moodBoost     * WEIGHTS.productivity.mood_boost) * 100
    ));

    // ── 3. Focus Score ───────────────────────────────────────────────────────
    const highPriority        = todayTasks.filter(t => t.priority === 'high' || t.priority === 'urgent');
    const highPriorityDone    = highPriority.filter(t => t.status === 'completed').length;
    const highPriorityRate    = highPriority.length > 0 ? highPriorityDone / highPriority.length : taskCompRate;

    // Deep work proxy: ≥2 tasks completed in a 2h window
    const deepWorkSessions    = estimateDeepWorkSessions(todayTasks);
    const deepWorkScore       = Math.min(1, deepWorkSessions / 3); // 3+ sessions = 100%

    // Distraction proxy: tasks completed without being rescheduled
    const notRescheduled      = todayTasks.filter(t => (t.reschedule_count || 0) === 0).length;
    const distractionAvoid    = totalToday > 0 ? notRescheduled / totalToday : 1;

    const focusScore = Math.min(100, Math.round(
      (highPriorityRate  * WEIGHTS.focus.high_priority_completion +
       deepWorkScore     * WEIGHTS.focus.deep_work_sessions       +
       distractionAvoid  * WEIGHTS.focus.distraction_avoidance) * 100
    ));

    // ── 4. Consistency Score ─────────────────────────────────────────────────
    const avgStreak    = await getAvgHabitStreak(userId);
    const streakScore  = Math.min(1, avgStreak / 30); // 30-day streak = 100%

    const dailyLogin   = user?.last_login
      ? (new Date(user.last_login) >= dayStart ? 1 : 0)
      : 0;

    const habitRegularity = habitCompRate;
    const moodLogged      = moodEntries.length > 0 ? 1 : 0;

    const consistencyScore = Math.min(100, Math.round(
      (streakScore       * WEIGHTS.consistency.streak_maintenance +
       dailyLogin        * WEIGHTS.consistency.daily_login        +
       habitRegularity   * WEIGHTS.consistency.habit_regularity   +
       moodLogged        * WEIGHTS.consistency.mood_logging) * 100
    ));

    // ── 5. Overall Score ─────────────────────────────────────────────────────
    const overallScore = Math.round(
      productivityScore * WEIGHTS.overall.productivity +
      focusScore        * WEIGHTS.overall.focus        +
      consistencyScore  * WEIGHTS.overall.consistency
    );

    // ── 6. Previous scores for delta ─────────────────────────────────────────
    const yesterday     = moment.tz(today, tz).subtract(1, 'day').format('YYYY-MM-DD');
    const prevDayScore  = await ProductivityScore.findOne({ where: { user_id: userId, score_date: yesterday } });
    const lastWeekDate  = moment.tz(today, tz).subtract(7, 'days').format('YYYY-MM-DD');
    const prevWeekScore = await ProductivityScore.findOne({ where: { user_id: userId, score_date: lastWeekDate } });

    const scoreDelta = prevDayScore ? overallScore - prevDayScore.overall_score : 0;

    // ── 7. Upsert ─────────────────────────────────────────────────────────────
    // Use findOrCreate + update to avoid SQLite upsert issues
    const scoreData = {
      productivity_score: productivityScore,
      focus_score:        focusScore,
      consistency_score:  consistencyScore,
      overall_score:      overallScore,
      task_completion_rate:  Math.round(taskCompRate * 100),
      habit_completion_rate: Math.round(habitCompRate * 100),
      mood_average:          Math.round(avgMoodRaw * 10) / 10,
      on_time_rate:          Math.round(onTimeRate * 100),
      prev_day_score:   prevDayScore?.overall_score  ?? null,
      prev_week_score:  prevWeekScore?.overall_score ?? null,
      score_delta:      scoreDelta,
      computed_at:      new Date(),
      raw_data: {
        tasks_total:     totalToday,
        tasks_completed: completedToday,
        habits_total:    totalHabits,
        habits_done:     completedHabits,
        mood_entries:    moodEntries.length,
        deep_work_sessions: deepWorkSessions,
      },
    };
    let scoreRecord = await ProductivityScore.findOne({
      where: { user_id: userId, score_date: today }
    });
    if (scoreRecord) {
      await scoreRecord.update(scoreData);
    } else {
      scoreRecord = await ProductivityScore.create({
        user_id: userId, score_date: today, ...scoreData
      });
    }

    // ── 8. Update Energy Profile ──────────────────────────────────────────────
    await updateEnergyProfile(userId, todayTasks, timezone);

    logger.info(`✅ Performance score computed for user ${userId} on ${today}: ${overallScore}`);
    return scoreRecord;

  } catch (error) {
    logger.error('Performance score computation error:', error.message);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY PERFORMANCE TREND
// ─────────────────────────────────────────────────────────────────────────────

async function getWeeklyTrend(userId, weeksBack = 4) {
  const { ProductivityScore } = getModels();
  const since = moment().subtract(weeksBack, 'weeks').format('YYYY-MM-DD');

  const scores = await ProductivityScore.findAll({
    where: {
      user_id:    userId,
      score_date: { [Op.gte]: since },
    },
    order: [['score_date', 'ASC']],
  });

  // Group by week
  const weekMap = {};
  scores.forEach(s => {
    const wk = moment(s.score_date).startOf('isoWeek').format('YYYY-MM-DD');
    if (!weekMap[wk]) weekMap[wk] = [];
    weekMap[wk].push(s);
  });

  return Object.entries(weekMap).map(([week, records]) => ({
    week_start:           week,
    avg_productivity:     avg(records, 'productivity_score'),
    avg_focus:            avg(records, 'focus_score'),
    avg_consistency:      avg(records, 'consistency_score'),
    avg_overall:          avg(records, 'overall_score'),
    best_day_score:       Math.max(...records.map(r => r.overall_score)),
    data_points:          records.length,
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// ENERGY PROFILE UPDATE
// ─────────────────────────────────────────────────────────────────────────────

async function updateEnergyProfile(userId, tasks, timezone = 'Africa/Cairo') {
  const { EnergyProfile } = getModels();
  const completedTasks = tasks.filter(t => t.status === 'completed' && t.completed_at);
  if (completedTasks.length === 0) return;

  let profile = await EnergyProfile.findOne({ where: { user_id: userId } });
  if (!profile) {
    profile = await EnergyProfile.create({ user_id: userId });
  }

  const hourly = [...profile.hourly_task_completions];
  const daily  = [...profile.daily_task_completions];

  completedTasks.forEach(t => {
    const completed = moment(t.completed_at).tz(timezone);
    const hour = completed.hour();
    const day  = completed.day(); // 0=Sun
    hourly[hour] = (hourly[hour] || 0) + 1;
    daily[day]   = (daily[day]  || 0) + 1;
  });

  // Compute peak hours (top 3)
  const hourlyWithIndex = hourly.map((v, i) => ({ hour: i, count: v }));
  hourlyWithIndex.sort((a, b) => b.count - a.count);
  const peakHours = hourlyWithIndex.slice(0, 3).map(h => h.hour);

  // Recommend deep work window: 2h block with highest combined completions
  let bestWindowStart = 9;
  let bestWindowScore = 0;
  for (let h = 5; h <= 20; h++) {
    const score = (hourly[h] || 0) + (hourly[h + 1] || 0);
    if (score > bestWindowScore) {
      bestWindowScore = score;
      bestWindowStart = h;
    }
  }

  await profile.update({
    hourly_task_completions: hourly,
    daily_task_completions:  daily,
    peak_hours:              peakHours,
    recommended_deep_work_start: `${String(bestWindowStart).padStart(2, '0')}:00`,
    recommended_deep_work_end:   `${String(bestWindowStart + 2).padStart(2, '0')}:00`,
    data_points: profile.data_points + completedTasks.length,
    last_updated: new Date(),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE HISTORY (last N days)
// ─────────────────────────────────────────────────────────────────────────────

async function getScoreHistory(userId, days = 30) {
  const { ProductivityScore } = getModels();
  const since = moment().subtract(days, 'days').format('YYYY-MM-DD');

  return ProductivityScore.findAll({
    where: {
      user_id:    userId,
      score_date: { [Op.gte]: since },
    },
    order: [['score_date', 'ASC']],
    attributes: [
      'score_date', 'productivity_score', 'focus_score',
      'consistency_score', 'overall_score', 'score_delta',
      'task_completion_rate', 'habit_completion_rate', 'mood_average',
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function fetchHabitLogs(userId, start, end) {
  try {
    // Lazy load habit log model
    const { sequelize } = require('../config/database');
    const [rows] = await sequelize.query(
      `SELECT hl.* FROM habit_logs hl
       JOIN habits h ON hl.habit_id = h.id
       WHERE h.user_id = ? AND hl.log_date BETWEEN ? AND ?`,
      { replacements: [userId, start, end] }
    );
    return rows;
  } catch {
    return [];
  }
}

async function getAvgHabitStreak(userId) {
  try {
    const { sequelize } = require('../config/database');
    const [rows] = await sequelize.query(
      `SELECT AVG(current_streak) as avg_streak FROM habits WHERE user_id = ? AND is_active = 1`,
      { replacements: [userId] }
    );
    return rows[0]?.avg_streak || 0;
  } catch {
    return 0;
  }
}

function estimateDeepWorkSessions(tasks) {
  const completed = tasks
    .filter(t => t.status === 'completed' && t.completed_at)
    .sort((a, b) => new Date(a.completed_at) - new Date(b.completed_at));

  let sessions = 0;
  let windowStart = null;
  let count = 0;

  completed.forEach(t => {
    const time = new Date(t.completed_at);
    if (!windowStart) {
      windowStart = time;
      count = 1;
    } else {
      const diffHours = (time - windowStart) / (1000 * 60 * 60);
      if (diffHours <= 2) {
        count++;
        if (count >= 2) sessions++;
      } else {
        windowStart = time;
        count = 1;
      }
    }
  });

  return sessions;
}

function avg(arr, key) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((s, r) => s + (r[key] || 0), 0) / arr.length);
}

module.exports = {
  computeDailyScore,
  getWeeklyTrend,
  getScoreHistory,
  updateEnergyProfile,
};
