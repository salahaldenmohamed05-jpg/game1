/**
 * Life Optimizer Service — Phase 12
 * ====================================
 * Analyzes user data across multiple life dimensions
 * and generates an optimized action plan for overall life improvement.
 * Dimensions: productivity, health, relationships, learning, finance_proxy, purpose.
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
  const Goal              = require('../models/goal.model');
  return { Task, Habit, MoodEntry, ProductivityScore, BehavioralFlag, EnergyLog, Goal };
}

// Dimension weights for life score
const DIMENSION_WEIGHTS = {
  productivity: 0.25,
  health:       0.20,
  mood:         0.20,
  habits:       0.15,
  goals:        0.15,
  stress:       0.05,
};

function calcDimensionScore(raw, min, max) {
  return Math.round(Math.min(100, Math.max(0, ((raw - min) / (max - min)) * 100)));
}

/**
 * getLifeOptimizationReport(userId, timezone)
 * Full life optimization analysis.
 */
async function getLifeOptimizationReport(userId, timezone = 'Africa/Cairo') {
  try {
    const { Task, Habit, MoodEntry, ProductivityScore, BehavioralFlag, EnergyLog, Goal } = getModels();
    const since30 = moment.tz(timezone).subtract(30, 'days').toDate();
    const since7  = moment.tz(timezone).subtract(7, 'days').toDate();

    const [tasks, habits, moods, scores, flags, energyLogs, goals] = await Promise.all([
      Task.findAll({ where: { user_id: userId, [Op.or]: [{ due_date: { [Op.gte]: since30 } }, { completed_at: { [Op.gte]: since30 } }] }, raw: true }),
      Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: since30 } }, raw: true }),
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since7 } }, raw: true, order: [['score_date','DESC']], limit: 7 }),
      BehavioralFlag.findAll({ where: { user_id: userId, is_resolved: false }, raw: true }),
      EnergyLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: since7 } }, raw: true, order: [['log_date','DESC']], limit: 7 }),
      Goal.findAll({ where: { user_id: userId }, raw: true }),
    ]);

    // ── Calculate dimensions ──────────────────────────────────────────────────
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const taskRate = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 50;
    const avgProd  = scores.length > 0 ? scores.reduce((s, r) => s + (r.overall_score || 50), 0) / scores.length : 50;
    const prodScore = Math.round((taskRate * 0.5) + (avgProd * 0.5));

    const avgMood = moods.length > 0 ? moods.reduce((s, m) => s + (m.mood_score || m.score || 5), 0) / moods.length : 5;
    const moodScore = calcDimensionScore(avgMood, 1, 10);

    const avgEnergy = energyLogs.length > 0 ? energyLogs.reduce((s, e) => s + (e.energy_score || 55), 0) / energyLogs.length : 55;
    const healthScore = calcDimensionScore(avgEnergy, 0, 100);

    const completedGoals = goals.filter(g => g.status === 'completed').length;
    const activeGoals    = goals.filter(g => g.status === 'active').length;
    const avgGoalProgress = goals.length > 0
      ? goals.reduce((s, g) => s + (g.progress || 0), 0) / goals.length
      : 0;
    const goalScore = goals.length > 0 ? Math.round((completedGoals / goals.length) * 50 + avgGoalProgress * 0.5) : 40;

    const stressLevel = Math.min(100, flags.length * 20);
    const stressScore = 100 - stressLevel;

    // Habit completion rate (simplified using streak data)
    const habitsWithStreak = habits.filter(h => (h.current_streak || 0) > 0).length;
    const habitScore = habits.length > 0 ? Math.round((habitsWithStreak / habits.length) * 100) : 50;

    // Weighted life optimization score
    const dimensions = {
      productivity: { score: Math.round(prodScore), weight: DIMENSION_WEIGHTS.productivity },
      health:       { score: Math.round(healthScore), weight: DIMENSION_WEIGHTS.health },
      mood:         { score: Math.round(moodScore), weight: DIMENSION_WEIGHTS.mood },
      habits:       { score: habitScore, weight: DIMENSION_WEIGHTS.habits },
      goals:        { score: Math.round(goalScore), weight: DIMENSION_WEIGHTS.goals },
      stress:       { score: Math.round(stressScore), weight: DIMENSION_WEIGHTS.stress },
    };

    const overallScore = Math.round(
      Object.values(dimensions).reduce((s, d) => s + d.score * d.weight, 0)
    );

    // Optimization recommendations
    const recommendations = buildOptimizationRecommendations(dimensions, goals, habits, flags);

    // Optimization trajectory
    const trajectory = buildTrajectory(overallScore, scores);

    return {
      overall_score: overallScore,
      dimensions,
      optimization_potential: 100 - overallScore,
      recommendations,
      trajectory,
      summary: buildOptimizationSummary(overallScore, dimensions),
      data_window_days: 30,
      goals_summary: {
        total: goals.length,
        active: activeGoals,
        completed: completedGoals,
        avg_progress: Math.round(avgGoalProgress),
      },
    };
  } catch (err) {
    logger.error('life optimizer error:', err.message);
    throw err;
  }
}

function buildOptimizationRecommendations(dims, goals, habits, flags) {
  const recs = [];
  const sorted = Object.entries(dims).sort((a, b) => a[1].score - b[1].score);

  for (const [dim, { score }] of sorted.slice(0, 3)) {
    if (score < 50) {
      recs.push(getDimRecommendation(dim, score));
    }
  }

  if (flags.length >= 3) {
    recs.push({
      dimension: 'stress',
      priority: 'high',
      title: 'تقليل مستوى الضغط',
      action: 'لديك ' + flags.length + ' مؤشرات ضغط نشطة. خذ يوم راحة وراجع أولوياتك.',
      impact: '+15% في الإنتاجية',
    });
  }

  if (goals.filter(g => g.status === 'active').length === 0) {
    recs.push({
      dimension: 'goals',
      priority: 'medium',
      title: 'تحديد أهداف واضحة',
      action: 'ليس لديك أهداف نشطة. حدد 1-3 أهداف للشهر القادم.',
      impact: '+20% في الإنتاجية المحفوزة',
    });
  }

  return recs.slice(0, 5);
}

function getDimRecommendation(dim, score) {
  const map = {
    productivity: {
      dimension: 'productivity', priority: 'high',
      title: 'تحسين الإنتاجية',
      action: 'طبّق أسلوب بومودورو وحدد 3 مهام أولوية كل صباح.',
      impact: `+${Math.round((80 - score) * 0.3)}% إنتاجية`,
    },
    health: {
      dimension: 'health', priority: 'high',
      title: 'تحسين مستوى الطاقة',
      action: 'نظّم ساعات نومك (7-8 ساعات) وأضف 20 دقيقة نشاط بدني يومياً.',
      impact: `+${Math.round((80 - score) * 0.25)}% طاقة`,
    },
    mood: {
      dimension: 'mood', priority: 'medium',
      title: 'تحسين المزاج العام',
      action: 'سجّل مزاجك يومياً وحدد محفزات التوتر في حياتك.',
      impact: 'تحسين جودة الحياة',
    },
    habits: {
      dimension: 'habits', priority: 'medium',
      title: 'تعزيز العادات اليومية',
      action: 'ابدأ بعادة واحدة صغيرة وطوّرها قبل إضافة أخرى.',
      impact: 'بناء أساس حياة منتظمة',
    },
    goals: {
      dimension: 'goals', priority: 'medium',
      title: 'تحقيق الأهداف',
      action: 'قسّم أهدافك الكبيرة إلى خطوات أسبوعية قابلة للتتبع.',
      impact: '+25% معدل إنجاز الأهداف',
    },
    stress: {
      dimension: 'stress', priority: 'high',
      title: 'إدارة التوتر',
      action: 'مارس تقنيات الاسترخاء وخفف الالتزامات غير الضرورية.',
      impact: '+30% وضوح ذهني',
    },
  };
  return map[dim] || { dimension: dim, priority: 'low', title: dim, action: 'راجع هذا الجانب', impact: 'تحسين عام' };
}

function buildTrajectory(currentScore, recentScores) {
  if (recentScores.length < 3) {
    return { trend: 'stable', projected_7d: currentScore, projected_30d: currentScore + 5 };
  }
  const recent3 = recentScores.slice(0, 3).map(s => s.overall_score || 50);
  const avg = recent3.reduce((s, v) => s + v, 0) / 3;
  const trend = avg > currentScore + 3 ? 'improving' : avg < currentScore - 3 ? 'declining' : 'stable';
  const delta = trend === 'improving' ? 5 : trend === 'declining' ? -3 : 1;
  return {
    trend,
    trend_label: trend === 'improving' ? 'في تحسن' : trend === 'declining' ? 'في تراجع' : 'مستقر',
    projected_7d:  Math.min(100, Math.max(0, currentScore + delta)),
    projected_30d: Math.min(100, Math.max(0, currentScore + delta * 4)),
  };
}

function buildOptimizationSummary(score, dims) {
  const weakest = Object.entries(dims).sort((a, b) => a[1].score - b[1].score)[0];
  const strongest = Object.entries(dims).sort((a, b) => b[1].score - a[1].score)[0];
  return {
    overall: score >= 70 ? 'ممتاز — أنت في مسار رائع' : score >= 50 ? 'جيد — هناك إمكانية للتحسين' : 'يحتاج تطوير — ركز على المجالات الأساسية',
    weakest_area:   weakest[0],
    strongest_area: strongest[0],
    quick_win: `ركز على تحسين ${weakest[0]} لأكبر تأثير على حياتك`,
  };
}

module.exports = { getLifeOptimizationReport };
