/**
 * Prediction Engine Service
 * ==========================
 * Simulates future outcomes based on current behavior patterns.
 *
 * Predictions:
 * 1. Task completion probability (will this task be done on time?)
 * 2. Habit streak sustainability (will streak continue for N days?)
 * 3. Mood trend forecast (7-day projection)
 * 4. Life score trajectory (next 2 weeks)
 * 5. Burnout risk assessment
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
  BehavioralFlag:    require('../models/behavioral_flag.model'),
});

// ─────────────────────────────────────────────────────────────────────────────
// TASK COMPLETION PROBABILITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Predict the probability that a task will be completed on time.
 * Factors: reschedule history, category completion rate, time until due, priority.
 */
async function predictTaskCompletion(taskId, userId) {
  const { Task } = getModels();

  const task = await Task.findOne({ where: { id: taskId, user_id: userId } });
  if (!task) return null;

  // Historical completion rate for this category
  const categoryTasks = await Task.findAll({
    where: {
      user_id: userId,
      category: task.category,
      due_date: { [Op.ne]: null },
      createdAt: { [Op.gte]: moment().subtract(60, 'days').toDate() },
    },
  });

  const catTotal     = categoryTasks.length || 1;
  const catCompleted = categoryTasks.filter(t => t.status === 'completed').length;
  const baseRate     = catCompleted / catTotal; // 0–1

  // Reschedule penalty
  const reschedulePenalty = Math.min(0.5, (task.reschedule_count || 0) * 0.15);

  // Days until due
  let dueFactor = 0.7;
  if (task.due_date) {
    const daysLeft = moment(task.due_date).diff(moment(), 'days');
    if (daysLeft >= 7) dueFactor = 0.9;
    else if (daysLeft >= 3) dueFactor = 0.75;
    else if (daysLeft >= 1) dueFactor = 0.6;
    else if (daysLeft >= 0) dueFactor = 0.4;
    else dueFactor = 0.15; // overdue
  }

  // Priority boost
  const priorityBoost = task.priority === 'urgent' ? 0.1
    : task.priority === 'high' ? 0.05
    : task.priority === 'low' ? -0.05
    : 0;

  const probability = Math.min(1, Math.max(0,
    baseRate * dueFactor + priorityBoost - reschedulePenalty
  ));

  return {
    task_id:       taskId,
    probability:   Math.round(probability * 100),
    risk_level:    probability >= 0.7 ? 'low' : probability >= 0.4 ? 'medium' : 'high',
    factors: {
      category_completion_rate: Math.round(baseRate * 100),
      reschedule_penalty:       Math.round(reschedulePenalty * 100),
      days_until_due:           task.due_date ? moment(task.due_date).diff(moment(), 'days') : null,
      priority:                 task.priority,
    },
    recommendation: getPredictionRecommendation(probability, task),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HABIT STREAK SUSTAINABILITY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Predict whether a habit streak will continue for the next N days.
 */
async function predictHabitStreak(habitId, userId, forecastDays = 7) {
  const { Habit, HabitLog } = getModels();

  const habit = await Habit.findOne({ where: { id: habitId, user_id: userId } });
  if (!habit) return null;

  // Last 30 days completion pattern
  const thirtyDaysAgo = moment().subtract(30, 'days').format('YYYY-MM-DD');
  const logs = await HabitLog.findAll({
    where: { habit_id: habitId, log_date: { [Op.gte]: thirtyDaysAgo } },
    order: [['log_date', 'ASC']],
  });

  const completedCount = logs.filter(l => l.completed).length;
  const baseRate       = logs.length > 0 ? completedCount / logs.length : 0.5;

  // Recent trend (last 7 days vs previous 7 days)
  const sevenDaysAgo      = moment().subtract(7, 'days').format('YYYY-MM-DD');
  const fourteenDaysAgo   = moment().subtract(14, 'days').format('YYYY-MM-DD');
  const recentLogs        = logs.filter(l => l.log_date >= sevenDaysAgo);
  const previousLogs      = logs.filter(l => l.log_date >= fourteenDaysAgo && l.log_date < sevenDaysAgo);
  const recentRate        = recentLogs.length > 0 ? recentLogs.filter(l => l.completed).length / recentLogs.length : baseRate;
  const prevRate          = previousLogs.length > 0 ? previousLogs.filter(l => l.completed).length / previousLogs.length : baseRate;
  const trendFactor       = recentRate >= prevRate ? 1.05 : 0.90; // 5% boost or 10% decline

  // Current streak momentum
  const currentStreak     = habit.current_streak || 0;
  const streakMomentum    = Math.min(0.15, currentStreak * 0.005); // max +15% for long streaks

  const dailyProbability  = Math.min(0.99, (baseRate * trendFactor) + streakMomentum);

  // Compound probability for N days
  const sustainProbability = Math.pow(dailyProbability, forecastDays);

  // Expected streak at end of forecast
  const expectedStreakAt  = Math.round(currentStreak + forecastDays * dailyProbability);

  return {
    habit_id:          habitId,
    habit_name:        habit.name,
    current_streak:    currentStreak,
    daily_probability: Math.round(dailyProbability * 100),
    sustain_probability: Math.round(sustainProbability * 100),
    forecast_days:     forecastDays,
    expected_streak_at_end: expectedStreakAt,
    trend:             recentRate >= prevRate ? 'improving' : 'declining',
    risk:              sustainProbability >= 0.7 ? 'low' : sustainProbability >= 0.4 ? 'medium' : 'high',
    message:           getStreakMessage(sustainProbability, forecastDays, currentStreak),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MOOD TREND FORECAST
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Project the mood trend for the next 7 days using exponential smoothing.
 */
async function forecastMoodTrend(userId, timezone = 'Africa/Cairo', forecastDays = 7) {
  const { MoodEntry } = getModels();
  const tz = timezone || 'Africa/Cairo';

  const entries = await MoodEntry.findAll({
    where: {
      user_id: userId,
      entry_date: { [Op.gte]: moment().tz(tz).subtract(30, 'days').format('YYYY-MM-DD') },
    },
    order: [['entry_date', 'ASC']],
  });

  if (entries.length < 3) {
    return {
      insufficient_data: true,
      message: 'سجّل مزاجك لمدة 3 أيام على الأقل للحصول على تنبؤات دقيقة',
      forecast: [],
    };
  }

  // Exponential smoothing (alpha = 0.3)
  const alpha   = 0.3;
  let smoothed  = entries[0].mood_score;
  entries.forEach(e => { smoothed = alpha * e.mood_score + (1 - alpha) * smoothed; });

  // Trend: slope of linear regression on last 14 days
  const recent    = entries.slice(-14);
  const n         = recent.length;
  const xMean     = (n - 1) / 2;
  const yMean     = recent.reduce((s, e) => s + e.mood_score, 0) / n;
  const slope     = recent.reduce((s, e, i) => s + (i - xMean) * (e.mood_score - yMean), 0)
                  / recent.reduce((s, _, i) => s + (i - xMean) ** 2, 0.001);

  // Cap slope so forecast stays in [1, 10]
  const cappedSlope = Math.max(-0.3, Math.min(0.3, slope));

  const forecast = [];
  for (let d = 1; d <= forecastDays; d++) {
    const date      = moment().tz(tz).add(d, 'days').format('YYYY-MM-DD');
    const rawScore  = smoothed + cappedSlope * d;
    const projected = Math.min(10, Math.max(1, rawScore));
    const confidence = Math.max(30, 90 - d * 8); // confidence decreases with time

    forecast.push({
      date,
      projected_score: Math.round(projected * 10) / 10,
      confidence,
      emoji: getMoodEmoji(projected),
    });
  }

  const lastEntry = entries[entries.length - 1];
  const trendDir  = cappedSlope > 0.05 ? 'improving' : cappedSlope < -0.05 ? 'declining' : 'stable';

  return {
    current_smoothed: Math.round(smoothed * 10) / 10,
    trend:            trendDir,
    slope:            Math.round(cappedSlope * 100) / 100,
    forecast,
    message:          getMoodForecastMessage(trendDir, Math.round(smoothed * 10) / 10),
    data_points:      entries.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// BURNOUT RISK ASSESSMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assess the risk of burnout based on:
 * - Overdue task accumulation
 * - Low mood trend
 * - Declining habit consistency
 * - High number of behavioral flags
 * - Late-night work patterns
 */
async function assessBurnoutRisk(userId, timezone = 'Africa/Cairo') {
  const { Task, MoodEntry, HabitLog, BehavioralFlag, ProductivityScore } = getModels();
  const tz       = timezone || 'Africa/Cairo';
  const twoWeeks = moment().tz(tz).subtract(14, 'days').format('YYYY-MM-DD');

  const [tasks, moodEntries, habitLogs, flags, scores] = await Promise.all([
    Task.findAll({ where: { user_id: userId, status: { [Op.in]: ['pending', 'in_progress'] } } }),
    MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: twoWeeks } }, order: [['entry_date', 'ASC']] }),
    HabitLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: twoWeeks } } }),
    BehavioralFlag.findAll({ where: { user_id: userId, is_resolved: false } }),
    ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: twoWeeks } }, order: [['score_date', 'ASC']] }),
  ]);

  let riskScore = 0;
  const riskFactors = [];

  // Factor 1: Overdue task accumulation
  const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== 'completed').length;
  if (overdueTasks > 10) { riskScore += 25; riskFactors.push({ factor: 'overdue_tasks', severity: 'high', detail: `${overdueTasks} مهام متأخرة` }); }
  else if (overdueTasks > 5) { riskScore += 15; riskFactors.push({ factor: 'overdue_tasks', severity: 'medium', detail: `${overdueTasks} مهام متأخرة` }); }
  else if (overdueTasks > 2) { riskScore += 8; riskFactors.push({ factor: 'overdue_tasks', severity: 'low', detail: `${overdueTasks} مهام متأخرة` }); }

  // Factor 2: Low/declining mood
  if (moodEntries.length >= 3) {
    const avgMood   = moodEntries.reduce((s, e) => s + e.mood_score, 0) / moodEntries.length;
    const recentAvg = moodEntries.slice(-4).reduce((s, e) => s + e.mood_score, 0) / Math.min(4, moodEntries.length);
    if (avgMood < 4)  { riskScore += 25; riskFactors.push({ factor: 'low_mood', severity: 'high', detail: `متوسط المزاج ${avgMood.toFixed(1)}/10` }); }
    else if (avgMood < 5.5) { riskScore += 12; riskFactors.push({ factor: 'low_mood', severity: 'medium', detail: `متوسط المزاج ${avgMood.toFixed(1)}/10` }); }
    if (recentAvg < avgMood - 1) { riskScore += 10; riskFactors.push({ factor: 'declining_mood', severity: 'medium', detail: 'انخفاض ملحوظ في المزاج مؤخراً' }); }
  }

  // Factor 3: Habit consistency drop
  const completedLogs = habitLogs.filter(l => l.completed).length;
  const habitRate     = habitLogs.length > 0 ? completedLogs / habitLogs.length : 0;
  if (habitRate < 0.3 && habitLogs.length > 0) { riskScore += 15; riskFactors.push({ factor: 'habit_drop', severity: 'medium', detail: `${Math.round(habitRate * 100)}% اتساق عادات` }); }

  // Factor 4: Behavioral flags
  const criticalFlags = flags.filter(f => f.severity === 'critical').length;
  const burnoutFlag   = flags.find(f => f.flag_type === 'burnout_risk');
  if (burnoutFlag)    { riskScore += 20; riskFactors.push({ factor: 'burnout_flag', severity: 'critical', detail: 'علامة إجهاد محددة' }); }
  if (criticalFlags > 2) { riskScore += 15; riskFactors.push({ factor: 'critical_flags', severity: 'high', detail: `${criticalFlags} علامات حرجة` }); }

  // Factor 5: Productivity score decline
  if (scores.length >= 4) {
    const firstHalf  = scores.slice(0, Math.floor(scores.length / 2)).reduce((s, sc) => s + sc.overall_score, 0) / Math.floor(scores.length / 2);
    const secondHalf = scores.slice(Math.floor(scores.length / 2)).reduce((s, sc) => s + sc.overall_score, 0) / (scores.length - Math.floor(scores.length / 2));
    if (secondHalf < firstHalf - 20) { riskScore += 15; riskFactors.push({ factor: 'score_decline', severity: 'high', detail: `انخفاض ${Math.round(firstHalf - secondHalf)} نقطة في الأداء` }); }
  }

  const capped  = Math.min(100, riskScore);
  const level   = capped >= 70 ? 'critical' : capped >= 45 ? 'high' : capped >= 25 ? 'medium' : 'low';

  return {
    risk_score:    capped,
    risk_level:    level,
    risk_ar:       { critical: 'خطر عالٍ جداً', high: 'خطر عالٍ', medium: 'خطر متوسط', low: 'خطر منخفض' }[level],
    factors:       riskFactors,
    recommendations: getBurnoutRecommendations(level, riskFactors),
    assessed_at:   new Date().toISOString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY PERFORMANCE TRAJECTORY
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a 2-week trajectory projection based on current velocity.
 */
async function projectLifeTrajectory(userId, timezone = 'Africa/Cairo') {
  const { ProductivityScore } = getModels();
  const tz = timezone || 'Africa/Cairo';

  const scores = await ProductivityScore.findAll({
    where: {
      user_id: userId,
      score_date: { [Op.gte]: moment().tz(tz).subtract(14, 'days').format('YYYY-MM-DD') },
    },
    order: [['score_date', 'ASC']],
  });

  if (scores.length < 3) {
    return { insufficient_data: true, message: 'بيانات غير كافية للتنبؤ', trajectory: [] };
  }

  // Calculate velocity (average daily change)
  const changes   = [];
  for (let i = 1; i < scores.length; i++) {
    changes.push(scores[i].overall_score - scores[i - 1].overall_score);
  }
  const avgVelocity = changes.reduce((s, c) => s + c, 0) / changes.length;
  const currentScore = scores[scores.length - 1].overall_score;

  // Regression to mean — extreme scores tend to regress
  const regressionFactor = currentScore > 80 ? -0.5 : currentScore < 30 ? 0.5 : 0;
  const velocity = avgVelocity + regressionFactor;

  const trajectory = [];
  let projectedScore = currentScore;

  for (let d = 1; d <= 14; d++) {
    const date  = moment().tz(tz).add(d, 'days').format('YYYY-MM-DD');
    projectedScore = Math.min(100, Math.max(0, projectedScore + velocity));
    trajectory.push({
      date,
      projected_score: Math.round(projectedScore),
      is_forecast:     true,
      day_label:       d <= 7 ? `يوم ${d}` : `أسبوع 2 · يوم ${d - 7}`,
    });
  }

  // Combine historical and forecast
  const historical = scores.map(s => ({
    date:            s.score_date,
    projected_score: Math.round(s.overall_score),
    is_forecast:     false,
  }));

  return {
    current_score:    Math.round(currentScore),
    velocity:         Math.round(avgVelocity * 100) / 100,
    trend:            avgVelocity > 1 ? 'improving' : avgVelocity < -1 ? 'declining' : 'stable',
    trend_ar:         avgVelocity > 1 ? 'في تحسن' : avgVelocity < -1 ? 'في انخفاض' : 'مستقر',
    historical,
    trajectory,
    insight:          getTrajectoryInsight(avgVelocity, currentScore),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function getMoodEmoji(score) {
  if (score >= 8) return '🤩';
  if (score >= 6) return '😊';
  if (score >= 4) return '😐';
  if (score >= 2) return '😔';
  return '😞';
}

function getMoodForecastMessage(trend, score) {
  if (trend === 'improving') return `مزاجك في تحسن مستمر! توقع وصوله إلى ${(score + 0.5).toFixed(1)} قريباً 📈`;
  if (trend === 'declining') return `لاحظنا انخفاضاً في مزاجك. خذ استراحة واعتنِ بنفسك 🌿`;
  return `مزاجك مستقر حول ${score}/10. استمر في روتينك اليومي ✅`;
}

function getStreakMessage(prob, days, currentStreak) {
  if (prob >= 0.8) return `رائع! فرصة قوية للحفاظ على سلسلتك لـ ${days} أيام قادمة 💪`;
  if (prob >= 0.5) return `سلسلتك في خطر متوسط. ضع تذكيراً يومياً لتعزيزها ⏰`;
  return `سلسلتك في خطر! ابدأ الآن لتجنب انقطاعها 🚨`;
}

function getPredictionRecommendation(prob, task) {
  if (prob >= 0.8) return 'المهمة في مسار ممتاز، استمر!';
  if (prob >= 0.6) return `ابدأ بـ"${task.title}" اليوم لضمان الإنجاز في الموعد`;
  if (prob >= 0.4) return `قسّم "${task.title}" إلى مهام صغيرة وابدأ بأولها الآن`;
  return `"${task.title}" في خطر التأخر. جدولها الآن أو أعِد تحديد أولوياتك`;
}

function getBurnoutRecommendations(level, factors) {
  const base = [
    'خذ استراحة من 10 دقائق كل ساعة',
    'مارس تمريناً بدنياً خفيفاً اليوم',
    'تحدث مع صديق أو شخص تثق به',
  ];
  if (level === 'critical') return [
    'خذ يوماً للراحة الكاملة اليوم',
    'راجع قائمة مهامك وأزل غير الضروري',
    'تحدث مع شخص متخصص في الصحة النفسية',
    ...base,
  ];
  if (level === 'high') return [
    'قلص عدد مهامك اليومية إلى 3 فقط',
    'نم 8 ساعات الليلة القادمة',
    ...base,
  ];
  return base;
}

function getTrajectoryInsight(velocity, score) {
  if (velocity > 2) return `أداؤك يتحسن بسرعة! إذا استمررت، ستصل إلى ${Math.min(100, Math.round(score + velocity * 14))} نقطة خلال أسبوعين 🚀`;
  if (velocity > 0) return `أداؤك في تحسن بطيء ومستدام. استمر على هذا النهج ✅`;
  if (velocity > -2) return `أداؤك مستقر. ابحث عن طريقة واحدة لتحسين يومك غداً 💡`;
  return `انتبه: أداؤك في انخفاض. راجع روتينك اليومي وحدد سبب الانخفاض 🔍`;
}

module.exports = {
  predictTaskCompletion,
  predictHabitStreak,
  forecastMoodTrend,
  assessBurnoutRisk,
  projectLifeTrajectory,
};
