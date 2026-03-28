/**
 * Prediction Service — Phase 9
 * ==============================
 * Predicts future outcomes based on behavioral patterns:
 * task completion likelihood, habit streak, mood trend, burnout risk.
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
  let LifePrediction      = null;
  try { LifePrediction = require('../models/life_prediction.model'); } catch (_) {}
  return { Task, Habit, MoodEntry, ProductivityScore, BehavioralFlag, EnergyLog, LifePrediction };
}

/**
 * Persist a prediction result to the LifePrediction table.
 * Non-blocking: failure to persist does not affect the returned result.
 */
async function persistPrediction(userId, type, data, confidence = 0.5) {
  try {
    const { LifePrediction } = getModels();
    if (!LifePrediction) return null;
    const record = await LifePrediction.create({
      user_id: userId,
      prediction_type: type,
      scenario_label: type.replace(/_/g, ' '),
      prediction_data: data,
      confidence_score: confidence,
      prediction_window: data.prediction_window || 14,
      baseline: data.factors || data.based_on || {},
      projected: {
        main_value: data.completion_probability || data.predicted_score || data.risk_score || data.projected_30d || null,
        trend: data.trend || data.trajectory || null,
      },
    });
    logger.debug(`[PREDICTION] Persisted ${type} prediction ${record.id} for user ${userId}`);
    return record.id;
  } catch (err) {
    logger.warn(`[PREDICTION] Failed to persist ${type}:`, err.message);
    return null;
  }
}

/**
 * predictTaskCompletion(userId, taskId, timezone)
 */
async function predictTaskCompletion(userId, taskId, timezone = 'Africa/Cairo') {
  try {
    const { Task, ProductivityScore } = getModels();
    const [task, scores] = await Promise.all([
      Task.findOne({ where: { id: taskId, user_id: userId }, raw: true }),
      ProductivityScore.findAll({ where: { user_id: userId }, raw: true, order: [['score_date','DESC']], limit: 7 }),
    ]);

    if (!task) throw new Error('المهمة غير موجودة');

    const avgProd = scores.length > 0
      ? scores.reduce((s, r) => s + (r.overall_score || 50), 0) / scores.length
      : 50;

    const priorityMultiplier = { urgent: 0.9, high: 0.8, medium: 0.65, low: 0.5 };
    const baseProbability = priorityMultiplier[task.priority] || 0.65;
    const adjustedProbability = Math.round(baseProbability * (avgProd / 60) * 100);
    const probability = Math.min(95, Math.max(20, adjustedProbability));

    const daysUntilDue = task.due_date
      ? Math.max(0, moment.tz(task.due_date, timezone).diff(moment.tz(timezone), 'days'))
      : null;

    const result = {
      task_id: taskId,
      task_title: task.title,
      completion_probability: probability,
      confidence: probability >= 70 ? 'high' : probability >= 50 ? 'medium' : 'low',
      days_until_due: daysUntilDue,
      factors: {
        priority: task.priority,
        avg_productivity: Math.round(avgProd),
        urgency: daysUntilDue !== null && daysUntilDue <= 2 ? 'high' : 'normal',
      },
      recommendation: probability < 50
        ? 'هذه المهمة تحتاج اهتماماً — جدولها في وقت الطاقة العالية'
        : 'من المرجح إنجاز هذه المهمة في الموعد',
    };

    // Persist prediction
    const predId = await persistPrediction(userId, 'task_completion', result, probability / 100);
    if (predId) result.prediction_id = predId;

    return result;
  } catch (err) {
    logger.error('predict task error:', err.message);
    throw err;
  }
}

/**
 * predictHabitStreak(userId, habitId, timezone)
 */
async function predictHabitStreak(userId, habitId, timezone = 'Africa/Cairo') {
  try {
    const { Habit } = getModels();
    const habit = await Habit.findOne({ where: { id: habitId, user_id: userId }, raw: true });
    if (!habit) throw new Error('العادة غير موجودة');

    const currentStreak = habit.current_streak || 0;
    const longestStreak = habit.longest_streak || currentStreak;

    // Predict 7-day continuation probability
    const consistency = longestStreak > 0 ? Math.min(1, currentStreak / longestStreak) : 0.5;
    const continuationProb = Math.round(consistency * 85 + 15);

    const predicted30Day = currentStreak + Math.round(continuationProb / 100 * 21);

    return {
      habit_id: habitId,
      habit_name: habit.name || habit.title,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      continuation_probability: Math.min(95, continuationProb),
      predicted_streak_30d: predicted30Day,
      at_risk: currentStreak === 0 || (longestStreak > 10 && currentStreak < 3),
      message: continuationProb >= 70
        ? `ممتاز! احتمال استمرار العادة عالٍ (${continuationProb}%)`
        : `العادة تحتاج دعم — احتمال الاستمرار ${continuationProb}%`,
    };
  } catch (err) {
    logger.error('predict habit error:', err.message);
    throw err;
  }
}

/**
 * predictMoodTrend(userId, timezone)
 */
async function predictMoodTrend(userId, timezone = 'Africa/Cairo') {
  try {
    const { MoodEntry } = getModels();
    const since14 = moment.tz(timezone).subtract(14, 'days').toDate();

    const moods = await MoodEntry.findAll({
      where: { user_id: userId, entry_date: { [Op.gte]: since14 } },
      raw: true,
      order: [['entry_date', 'ASC']],
    });

    if (moods.length === 0) {
      return { trend: 'unknown', predicted_score: 5.5, message: 'بيانات غير كافية للتنبؤ' };
    }

    const scores = moods.map(m => m.mood_score || m.score || 5);
    const avg = scores.reduce((s, v) => s + v, 0) / scores.length;
    const recent3 = scores.slice(-3);
    const recentAvg = recent3.reduce((s, v) => s + v, 0) / recent3.length;

    const trend = recentAvg > avg + 0.5 ? 'improving' : recentAvg < avg - 0.5 ? 'declining' : 'stable';
    const delta = trend === 'improving' ? 0.3 : trend === 'declining' ? -0.3 : 0;
    const predicted7d = Math.min(10, Math.max(1, parseFloat((recentAvg + delta * 7).toFixed(1))));

    return {
      trend,
      trend_label: trend === 'improving' ? 'في تحسن' : trend === 'declining' ? 'في تراجع' : 'مستقر',
      current_avg: parseFloat(avg.toFixed(1)),
      predicted_score: predicted7d,
      data_points: scores.length,
      message: trend === 'improving'
        ? `مزاجك في تحسن مستمر 😊 — متوقع ${predicted7d}/10 خلال أسبوع`
        : trend === 'declining'
        ? `مزاجك في تراجع بسيط — انتبه لأسباب التوتر`
        : `مزاجك مستقر عند ${parseFloat(avg.toFixed(1))}/10`,
    };
  } catch (err) {
    logger.error('predict mood error:', err.message);
    throw err;
  }
}

/**
 * predictBurnoutRisk(userId, timezone)
 */
async function predictBurnoutRisk(userId, timezone = 'Africa/Cairo') {
  try {
    const { ProductivityScore, BehavioralFlag, MoodEntry, EnergyLog } = getModels();
    const since14 = moment.tz(timezone).subtract(14, 'days').toDate();
    const since7  = moment.tz(timezone).subtract(7, 'days').toDate();

    const [scores, flags, recentMoods, energyLogs] = await Promise.all([
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since14 } }, raw: true }),
      BehavioralFlag.findAll({ where: { user_id: userId, is_resolved: false }, raw: true }),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: since7 } }, raw: true }),
      EnergyLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: since7 } }, raw: true }),
    ]);

    let riskScore = 0;

    // Flag count contribution
    riskScore += Math.min(40, flags.length * 10);

    // Low productivity trend
    if (scores.length >= 3) {
      const avgProd = scores.reduce((s, r) => s + (r.overall_score || 50), 0) / scores.length;
      if (avgProd < 45) riskScore += 20;
      else if (avgProd < 55) riskScore += 10;
    }

    // Low mood
    if (recentMoods.length > 0) {
      const avgMood = recentMoods.reduce((s, m) => s + (m.mood_score || m.score || 5), 0) / recentMoods.length;
      if (avgMood < 4) riskScore += 20;
      else if (avgMood < 5) riskScore += 10;
    }

    // Low energy
    if (energyLogs.length > 0) {
      const avgEnergy = energyLogs.reduce((s, e) => s + (e.energy_score || 55), 0) / energyLogs.length;
      if (avgEnergy < 35) riskScore += 20;
      else if (avgEnergy < 45) riskScore += 10;
    }

    riskScore = Math.min(100, riskScore);
    const risk_level = riskScore >= 70 ? 'high' : riskScore >= 40 ? 'medium' : 'low';
    const urgent = riskScore >= 70;

    const result = {
      risk_score: riskScore,
      risk_level,
      urgent,
      risk_label: risk_level === 'high' ? 'مرتفع' : risk_level === 'medium' ? 'متوسط' : 'منخفض',
      factors: {
        active_flags: flags.length,
        avg_productivity: scores.length > 0 ? Math.round(scores.reduce((s, r) => s + (r.overall_score || 50), 0) / scores.length) : 50,
        avg_mood: recentMoods.length > 0 ? parseFloat((recentMoods.reduce((s, m) => s + (m.mood_score || m.score || 5), 0) / recentMoods.length).toFixed(1)) : 5,
        avg_energy: energyLogs.length > 0 ? Math.round(energyLogs.reduce((s, e) => s + (e.energy_score || 55), 0) / energyLogs.length) : 55,
      },
      recommendations: buildBurnoutRecommendations(risk_level, flags.length),
      message: urgent
        ? '⚠️ خطر احتراق وظيفي مرتفع — اتخاذ إجراء فوري ضروري'
        : risk_level === 'medium'
        ? '⚠️ مؤشرات طفيفة للضغط — راقب نمط عملك'
        : '✅ لا توجد مؤشرات مقلقة للاحتراق الوظيفي',
    };

    // Persist prediction
    const predId = await persistPrediction(userId, 'burnout_risk', result, (100 - riskScore) / 100);
    if (predId) result.prediction_id = predId;

    return result;
  } catch (err) {
    logger.error('predict burnout error:', err.message);
    throw err;
  }
}

function buildBurnoutRecommendations(level, flagCount) {
  if (level === 'high') {
    return [
      'خذ يوم راحة كامل في أقرب وقت',
      'قلل الالتزامات غير الأساسية',
      'تحدث مع شخص تثق به',
      'راجع أهدافك وأعد ترتيب أولوياتك',
    ];
  }
  if (level === 'medium') {
    return [
      'اضبط ساعات نومك (7-8 ساعات)',
      'أضف استراحات منتظمة أثناء العمل',
      'مارس نشاطاً بدنياً خفيفاً يومياً',
    ];
  }
  return [
    'استمر في نمط حياتك الصحي الحالي',
    'حافظ على استراحاتك المنتظمة',
  ];
}

/**
 * getLifeTrajectory(userId, timezone)
 */
async function getLifeTrajectory(userId, timezone = 'Africa/Cairo') {
  try {
    const { ProductivityScore } = getModels();
    const since30 = moment.tz(timezone).subtract(30, 'days').toDate();

    const scores = await ProductivityScore.findAll({
      where: { user_id: userId, score_date: { [Op.gte]: since30 } },
      raw: true,
      order: [['score_date', 'ASC']],
    });

    if (scores.length < 5) {
      return {
        trajectory: 'insufficient_data',
        message: 'بيانات غير كافية — أضف المزيد من السجلات اليومية',
        projected_30d: 55,
      };
    }

    const values = scores.map(s => s.overall_score || 50);
    const avg = values.reduce((s, v) => s + v, 0) / values.length;
    const recent5 = values.slice(-5);
    const recentAvg = recent5.reduce((s, v) => s + v, 0) / 5;

    const trend = recentAvg > avg + 3 ? 'ascending' : recentAvg < avg - 3 ? 'descending' : 'stable';
    const delta = trend === 'ascending' ? 3 : trend === 'descending' ? -2 : 0.5;

    return {
      trajectory: trend,
      trajectory_label: trend === 'ascending' ? 'صاعد' : trend === 'descending' ? 'هابط' : 'مستقر',
      current_avg: Math.round(avg),
      recent_avg: Math.round(recentAvg),
      projected_30d: Math.min(100, Math.max(0, Math.round(recentAvg + delta * 4))),
      projected_7d:  Math.min(100, Math.max(0, Math.round(recentAvg + delta))),
      data_points: scores.length,
      message: trend === 'ascending'
        ? `إنتاجيتك في تصاعد مستمر! متوقع ${Math.round(recentAvg + delta * 4)}/100 خلال شهر`
        : trend === 'descending'
        ? 'انتبه: هناك انخفاض في المنحنى — راجع عادياتك اليومية'
        : 'مسارك مستقر ومتوازن',
    };
  } catch (err) {
    logger.error('trajectory error:', err.message);
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PHASE 3 UPGRADE: Probability-based Unified Prediction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * getProbabilisticPrediction(userId, timezone)
 *
 * Returns a unified probability-based prediction object:
 * {
 *   task_completion_probability: 0–1,
 *   burnout_risk: 0–1,
 *   focus_score: 0–100,
 *   mood_tomorrow: 0–10,
 *   trajectory: 'ascending'|'stable'|'descending',
 *   confidence: 0–100,
 *   data_quality: 'high'|'medium'|'low',
 * }
 *
 * Uses: learning engine data + context snapshot
 */
async function getProbabilisticPrediction(userId, timezone = 'Africa/Cairo') {
  try {
    const { ProductivityScore, MoodEntry, EnergyLog } = getModels();
    const since7 = moment().tz(timezone).subtract(7, 'days').format('YYYY-MM-DD');

    const [scores7d, moods7d, energyLogs] = await Promise.all([
      ProductivityScore.findAll({
        where : { user_id: userId, score_date: { [Op.gte]: since7 } },
        raw   : true,
        order : [['score_date', 'DESC']],
      }),
      MoodEntry.findAll({
        where : { user_id: userId, entry_date: { [Op.gte]: since7 } },
        raw   : true,
        order : [['entry_date', 'DESC']],
      }),
      EnergyLog
        ? EnergyLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: since7 } }, raw: true, order: [['log_date', 'DESC']] }).catch(() => [])
        : Promise.resolve([]),
    ]);

    // ── Learning engine (ML) integration ─────────────────────────────────────
    let learningSuccessRate = null;
    let mlPredictions       = null;
    try {
      const learning = require('./learning.engine.service');
      const stats    = learning.getLearningStats(userId);
      const rates    = Object.values(stats.successRates || {}).filter(r => r !== null);
      if (rates.length > 0) {
        learningSuccessRate = rates.reduce((a, b) => a + b, 0) / rates.length / 100;
      }

      // Get full ML predictions bundle
      const currentEnergy = energyLogs.length > 0
        ? energyLogs[0].energy_score || 55
        : 55;
      const currentMood = moods7d.length > 0
        ? (moods7d[0].mood_score || moods7d[0].overall_mood || 5)
        : 5;
      const currentHour = moment().tz(timezone).hour();

      mlPredictions = learning.getMLPredictions(userId, {
        energy   : currentEnergy,
        mood     : currentMood,
        hour     : currentHour,
        overdueCount: 0,  // will be enhanced later
        recentMoods : moods7d.map(m => m.mood_score || m.overall_mood || 5),
      });
    } catch (_e) { logger.debug(`[PREDICTION_SERVICE] Non-critical operation failed: ${_e.message}`); }

    // ── Compute base probabilities ────────────────────────────────────────────
    const avgScore = scores7d.length > 0
      ? scores7d.reduce((s, r) => s + (r.overall_score || 50), 0) / scores7d.length
      : 50;

    const avgMood = moods7d.length > 0
      ? moods7d.reduce((s, r) => s + (r.mood_score || r.overall_mood || 5), 0) / moods7d.length
      : 5;

    const avgEnergy = energyLogs.length > 0
      ? energyLogs.reduce((s, e) => s + (e.energy_score || 55), 0) / energyLogs.length
      : 55;

    // Task completion probability:
    // 60% from productivity score, 40% from ML predictor (if available)
    let taskProb = Math.min(0.95, Math.max(0.05, avgScore / 100));
    if (learningSuccessRate !== null) {
      taskProb = taskProb * 0.6 + learningSuccessRate * 0.4;
    }
    // Override/blend with ML prediction if available
    if (mlPredictions?.task_completion_probability != null) {
      taskProb = taskProb * 0.5 + mlPredictions.task_completion_probability * 0.5;
    }
    taskProb = Math.min(0.97, Math.max(0.03, taskProb));

    // Burnout risk: DB-based formula + ML burnout detection
    const burnoutBase = 1 - (avgScore / 100) * 0.5 - (avgMood / 10) * 0.3 - (avgEnergy / 100) * 0.2;
    let burnoutRisk   = Math.min(0.95, Math.max(0.02, burnoutBase));
    if (mlPredictions?.burnout_risk != null) {
      burnoutRisk = burnoutRisk * 0.5 + mlPredictions.burnout_risk * 0.5;
    }
    burnoutRisk = Math.min(0.97, Math.max(0.02, burnoutRisk));

    // Focus score: ML version or computed from consistency
    let focusScore;
    if (mlPredictions?.focus_score != null) {
      // Blend DB-based and ML-based focus scores
      const variance = scores7d.length > 1
        ? scores7d.reduce((s, r) => s + Math.pow((r.overall_score || 50) - avgScore, 2), 0) / scores7d.length
        : 200;
      const consistencyBonus = Math.max(0, 1 - variance / 1000);
      const dbFocusScore = Math.round(Math.min(100, (avgScore * 0.7 + consistencyBonus * 30)));
      focusScore = Math.round((dbFocusScore + mlPredictions.focus_score) / 2);
    } else {
      const variance = scores7d.length > 1
        ? scores7d.reduce((s, r) => s + Math.pow((r.overall_score || 50) - avgScore, 2), 0) / scores7d.length
        : 200;
      const consistencyBonus = Math.max(0, 1 - variance / 1000);
      focusScore = Math.round(Math.min(100, (avgScore * 0.7 + consistencyBonus * 30)));
    }

    // Mood tomorrow: simple moving average trend
    const moodTrend = moods7d.length >= 3
      ? moods7d.slice(0, 3).reduce((s, r) => s + (r.mood_score || r.overall_mood || 5), 0) / 3
      : avgMood;

    // Data quality
    const dataPoints = scores7d.length + moods7d.length;
    const dataQuality = dataPoints >= 10 ? 'high' : dataPoints >= 5 ? 'medium' : 'low';

    // Overall confidence
    const confidence = Math.round(
      (scores7d.length / 7 * 40) +
      (moods7d.length  / 7 * 25) +
      (learningSuccessRate !== null ? 20 : 0) +
      (mlPredictions ? 15 : 0)
    );

    // Trajectory
    const recentAvg = scores7d.length >= 3
      ? scores7d.slice(0, 3).reduce((s, r) => s + (r.overall_score || 50), 0) / 3
      : avgScore;
    const trajectory = recentAvg > avgScore + 3 ? 'ascending'
      : recentAvg < avgScore - 3 ? 'descending' : 'stable';

    const result = {
      task_completion_probability: parseFloat(taskProb.toFixed(3)),
      burnout_risk               : parseFloat(burnoutRisk.toFixed(3)),
      focus_score                : focusScore,
      mood_tomorrow              : parseFloat(Math.min(10, Math.max(1, moodTrend)).toFixed(1)),
      trajectory,
      confidence,
      data_quality               : dataQuality,
      // ML layer additions
      ml_enhanced     : mlPredictions != null,
      best_focus_hours: mlPredictions?.best_focus_hours || [9, 10, 11],
      success_rates   : mlPredictions?.success_rates || {},
      ml_confidence   : mlPredictions?.confidence || 'insufficient',
      based_on: {
        productivity_days : scores7d.length,
        mood_days         : moods7d.length,
        energy_days       : energyLogs.length,
        learning_data     : learningSuccessRate !== null,
        ml_data_points    : mlPredictions?.data_points || 0,
      },
      generated_at: new Date().toISOString(),
    };

    // Persist unified prediction
    const predId = await persistPrediction(userId, 'probabilistic_unified', result, confidence / 100);
    if (predId) result.prediction_id = predId;

    return result;

  } catch (err) {
    logger.error('probabilistic prediction error:', err.message);
    return {
      task_completion_probability: 0.6,
      burnout_risk               : 0.3,
      focus_score                : 60,
      mood_tomorrow              : 6,
      trajectory                 : 'stable',
      confidence                 : 20,
      data_quality               : 'low',
      ml_enhanced                : false,
      best_focus_hours           : [9, 10, 11],
      success_rates              : {},
      ml_confidence              : 'insufficient',
      based_on                   : { error: err.message },
      generated_at               : new Date().toISOString(),
    };
  }
}

module.exports = {
  predictTaskCompletion,
  predictHabitStreak,
  predictMoodTrend,
  predictBurnoutRisk,
  getLifeTrajectory,
  getProbabilisticPrediction,
};
