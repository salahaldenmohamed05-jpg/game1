/**
 * Life Score Service
 * ===================
 * Computes a holistic "Life Score" (0–100) that aggregates all life dimensions:
 * productivity, habits, mood, energy, consistency, and growth trajectory.
 *
 * Philosophy: This is NOT just a productivity score.
 * It measures overall life balance — a person who sleeps well, maintains
 * their habits, stays emotionally healthy, and completes focused work
 * should score higher than someone who burns out completing tasks.
 */

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

const getModels = () => ({
  Task:              require('../models/task.model'),
  Habit:             require('../models/habit.model').Habit,
  HabitLog:          require('../models/habit.model').HabitLog,
  MoodEntry:         require('../models/mood.model'),
  ProductivityScore: require('../models/productivity_score.model'),
  EnergyProfile:     require('../models/energy_profile.model'),
  BehavioralFlag:    require('../models/behavioral_flag.model'),
  WeeklyAudit:       require('../models/weekly_audit.model'),
  User:              require('../models/user.model'),
});

// ─── Dimension weights (must sum to 1.0) ────────────────────────────────────
const DIMENSIONS = {
  productivity:  0.25,  // task completion, on-time rate
  habits:        0.20,  // habit consistency, streaks
  mood:          0.20,  // emotional wellbeing, mood trend
  energy:        0.15,  // energy optimization, peak hour usage
  consistency:   0.12,  // daily regularity, logging habit
  growth:        0.08,  // week-over-week improvement trend
};

/**
 * Compute the Life Score for a user on a given date.
 * Returns a rich object with dimension breakdown and trend data.
 */
async function computeLifeScore(userId, timezone = 'Africa/Cairo', daysWindow = 7) {
  const {
    Task, Habit, HabitLog, MoodEntry, ProductivityScore,
    EnergyProfile, BehavioralFlag, WeeklyAudit, User,
  } = getModels();

  const tz        = timezone || 'Africa/Cairo';
  const today     = moment().tz(tz).format('YYYY-MM-DD');
  const weekAgo   = moment().tz(tz).subtract(daysWindow, 'days').format('YYYY-MM-DD');
  const monthAgo  = moment().tz(tz).subtract(30, 'days').format('YYYY-MM-DD');

  try {
    const [tasks, allHabits, habitLogs, moodEntries, productivityScores,
           energyProfile, activeFlags, weeklyAudit, user] = await Promise.all([
      Task.findAll({
        where: {
          user_id: userId,
          [Op.or]: [
            { due_date: { [Op.gte]: weekAgo } },
            { status: 'in_progress' },
          ],
        },
      }),
      Habit.findAll({ where: { user_id: userId, is_active: true } }),
      HabitLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: weekAgo } } }),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: weekAgo } } }),
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: weekAgo } }, order: [['score_date', 'ASC']] }),
      EnergyProfile.findOne({ where: { user_id: userId } }),
      BehavioralFlag.findAll({ where: { user_id: userId, is_resolved: false, is_dismissed: false } }),
      WeeklyAudit.findOne({ where: { user_id: userId }, order: [['week_start', 'DESC']] }),
      User.findByPk(userId),
    ]);

    // ── 1. Productivity Dimension (0–100) ─────────────────────────────────────
    const completedTasks = tasks.filter(t => t.status === 'completed').length;
    const totalTasks     = tasks.length || 1;
    const onTimeTasks    = tasks.filter(t =>
      t.status === 'completed' && t.completed_at && t.due_date &&
      new Date(t.completed_at) <= new Date(t.due_date)
    ).length;

    const taskRate    = completedTasks / totalTasks;
    const onTimeRate  = completedTasks > 0 ? onTimeTasks / completedTasks : 0;
    const productivityDim = Math.round((taskRate * 0.6 + onTimeRate * 0.4) * 100);

    // ── 2. Habits Dimension (0–100) ───────────────────────────────────────────
    const totalPossibleLogs = allHabits.length * daysWindow;
    const completedLogs     = habitLogs.filter(l => l.completed).length;
    const habitRate         = totalPossibleLogs > 0 ? completedLogs / totalPossibleLogs : 0;

    // Streak bonus: average streak as % of 30 days
    const avgStreak = allHabits.length > 0
      ? allHabits.reduce((s, h) => s + (h.current_streak || 0), 0) / allHabits.length
      : 0;
    const streakBonus = Math.min(1, avgStreak / 30);

    const habitsDim = Math.round((habitRate * 0.7 + streakBonus * 0.3) * 100);

    // ── 3. Mood Dimension (0–100) ─────────────────────────────────────────────
    let moodDim = 50; // default neutral
    if (moodEntries.length > 0) {
      const avgMood = moodEntries.reduce((s, e) => s + e.mood_score, 0) / moodEntries.length;
      // Trend: compare first half vs second half
      const half = Math.floor(moodEntries.length / 2);
      const firstHalfAvg  = half > 0 ? moodEntries.slice(0, half).reduce((s, e) => s + e.mood_score, 0) / half : avgMood;
      const secondHalfAvg = moodEntries.length - half > 0
        ? moodEntries.slice(half).reduce((s, e) => s + e.mood_score, 0) / (moodEntries.length - half)
        : avgMood;

      const moodTrendBonus = secondHalfAvg > firstHalfAvg ? 5 : 0;
      moodDim = Math.min(100, Math.round((avgMood / 10) * 100 + moodTrendBonus));
    }

    // ── 4. Energy Dimension (0–100) ───────────────────────────────────────────
    let energyDim = 50; // default if no profile
    if (energyProfile && energyProfile.data_points >= 5) {
      // Score based on peak hours utilization
      const peakHours = energyProfile.peak_hours || [];
      if (peakHours.length > 0) {
        // Check if tasks are being completed during peak hours
        const peakTaskCompletions = tasks.filter(t => {
          if (!t.completed_at) return false;
          const hour = new Date(t.completed_at).getHours();
          return peakHours.includes(hour);
        }).length;
        const peakUtilization = completedTasks > 0 ? peakTaskCompletions / completedTasks : 0;
        energyDim = Math.round(peakUtilization * 100);
      }
      // Factor in mood-energy correlation
      if (energyProfile.energy_mood_correlation > 0.3) energyDim = Math.min(100, energyDim + 15);
    }

    // ── 5. Consistency Dimension (0–100) ─────────────────────────────────────
    // How many of the last N days had some activity (task or habit or mood)
    const daysWithActivity = new Set();
    tasks.filter(t => t.completed_at).forEach(t => {
      daysWithActivity.add(moment(t.completed_at).tz(tz).format('YYYY-MM-DD'));
    });
    habitLogs.filter(l => l.completed).forEach(l => {
      daysWithActivity.add(l.log_date);
    });
    moodEntries.forEach(e => {
      daysWithActivity.add(e.entry_date);
    });

    const activeDays     = daysWithActivity.size;
    const consistencyDim = Math.round((activeDays / daysWindow) * 100);

    // ── 6. Growth Dimension (0–100) ───────────────────────────────────────────
    let growthDim = 50;
    if (productivityScores.length >= 2) {
      const firstScore = productivityScores[0].overall_score || 0;
      const lastScore  = productivityScores[productivityScores.length - 1].overall_score || 0;
      const delta      = lastScore - firstScore;
      // +20 points max for improvement, -20 for decline, centered at 50
      growthDim = Math.min(100, Math.max(0, 50 + (delta / 100) * 100));
    } else if (weeklyAudit) {
      const delta = weeklyAudit.week_score_vs_last_week || 0;
      growthDim   = Math.min(100, Math.max(0, 50 + delta));
    }

    // ── 7. Behavioral Flag Penalty ────────────────────────────────────────────
    const criticalFlags = activeFlags.filter(f => f.severity === 'critical').length;
    const highFlags     = activeFlags.filter(f => f.severity === 'high').length;
    const flagPenalty   = Math.min(15, criticalFlags * 5 + highFlags * 2);

    // ── 8. Composite Life Score ───────────────────────────────────────────────
    const rawScore =
      productivityDim * DIMENSIONS.productivity +
      habitsDim       * DIMENSIONS.habits        +
      moodDim         * DIMENSIONS.mood          +
      energyDim       * DIMENSIONS.energy        +
      consistencyDim  * DIMENSIONS.consistency   +
      growthDim       * DIMENSIONS.growth;

    const lifeScore = Math.min(100, Math.max(0, Math.round(rawScore - flagPenalty)));

    // ── 9. Score Classification ───────────────────────────────────────────────
    const classification = getScoreClassification(lifeScore);

    return {
      life_score: lifeScore,
      classification,
      dimensions: {
        productivity:  { score: productivityDim, weight: DIMENSIONS.productivity, label: 'الإنتاجية' },
        habits:        { score: habitsDim,        weight: DIMENSIONS.habits,        label: 'العادات' },
        mood:          { score: moodDim,          weight: DIMENSIONS.mood,          label: 'المزاج' },
        energy:        { score: energyDim,        weight: DIMENSIONS.energy,        label: 'الطاقة' },
        consistency:   { score: consistencyDim,   weight: DIMENSIONS.consistency,   label: 'الاتساق' },
        growth:        { score: growthDim,        weight: DIMENSIONS.growth,        label: 'النمو' },
      },
      behavioral_flags: {
        total: activeFlags.length,
        critical: criticalFlags,
        high: highFlags,
        penalty: flagPenalty,
      },
      context: {
        days_analyzed:     daysWindow,
        tasks_total:       totalTasks,
        tasks_completed:   completedTasks,
        habits_total:      allHabits.length,
        mood_entries:      moodEntries.length,
        active_days:       activeDays,
        avg_mood:          moodEntries.length > 0
          ? (moodEntries.reduce((s, e) => s + e.mood_score, 0) / moodEntries.length).toFixed(1)
          : null,
      },
      computed_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.error('computeLifeScore error:', err.message);
    throw err;
  }
}

/**
 * Get life score history (last N days)
 */
async function getLifeScoreHistory(userId, days = 30, timezone = 'Africa/Cairo') {
  const { ProductivityScore } = getModels();
  const tz      = timezone || 'Africa/Cairo';
  const startDate = moment().tz(tz).subtract(days, 'days').format('YYYY-MM-DD');

  const scores = await ProductivityScore.findAll({
    where: { user_id: userId, score_date: { [Op.gte]: startDate } },
    order: [['score_date', 'ASC']],
    attributes: ['score_date', 'overall_score', 'productivity_score', 'focus_score', 'consistency_score'],
  });

  return scores.map(s => ({
    date:        s.score_date,
    overall:     s.overall_score,
    productivity: s.productivity_score,
    focus:       s.focus_score,
    consistency: s.consistency_score,
  }));
}

function getScoreClassification(score) {
  if (score >= 85) return { level: 'exceptional',    ar: 'استثنائي',   emoji: '🏆', color: '#FFD700' };
  if (score >= 70) return { level: 'great',          ar: 'رائع',       emoji: '⭐', color: '#10B981' };
  if (score >= 55) return { level: 'good',           ar: 'جيد',        emoji: '✅', color: '#6C63FF' };
  if (score >= 40) return { level: 'average',        ar: 'متوسط',      emoji: '📊', color: '#F59E0B' };
  if (score >= 25) return { level: 'needs_work',     ar: 'يحتاج تحسين', emoji: '💪', color: '#F97316' };
  return             { level: 'critical',            ar: 'يحتاج اهتمام', emoji: '⚠️', color: '#EF4444' };
}

module.exports = { computeLifeScore, getLifeScoreHistory };
