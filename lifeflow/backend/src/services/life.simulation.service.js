/**
 * Life Simulation Service — Phase 10
 * =====================================
 * Simulates future outcomes using behavioral patterns.
 * Predicts what happens when sleep/tasks/exercise/workload changes.
 * Window: 7 to 30 days.
 */

'use strict';

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

function getModels() {
  const ProductivityScore = require('../models/productivity_score.model');
  const MoodEntry         = require('../models/mood.model');
  const EnergyLog         = require('../models/energy_log.model');
  const Task              = require('../models/task.model');
  return { ProductivityScore, MoodEntry, EnergyLog, Task };
}

/**
 * simulateLife(userId, scenario, timezone, windowDays)
 * scenario: { sleep_change, task_change, exercise_change, workload_change }
 * Returns predictions for each day in the window.
 */
async function simulateLife(userId, scenario = {}, timezone = 'Africa/Cairo', windowDays = 14) {
  try {
    const { ProductivityScore, MoodEntry, EnergyLog, Task } = getModels();
    const since = moment.tz(timezone).subtract(30, 'days').toDate();

    const [scores, moodEntries, energyLogs, tasks] = await Promise.all([
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since } }, raw: true, order: [['score_date','ASC']] }),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: since } }, raw: true }),
      EnergyLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: since } }, raw: true }),
      Task.findAll({ where: { user_id: userId, [Op.or]: [{ due_date: { [Op.gte]: since } }, { completed_at: { [Op.gte]: since } }] }, raw: true }),
    ]);

    // Baseline metrics
    const baseline = calcBaseline(scores, moodEntries, energyLogs, tasks);

    // Apply scenario modifiers
    const modified = applyScenario(baseline, scenario);

    // Generate day-by-day predictions
    const predictions = generateDayPredictions(modified, baseline, windowDays, timezone);

    // Summary
    const summary = buildSimulationSummary(baseline, modified, scenario, windowDays);

    return {
      user_id:         userId,
      simulated_at:    moment.tz(timezone).toISOString(),
      window_days:     windowDays,
      scenario:        normalizeScenario(scenario),
      baseline,
      projected:       modified,
      daily_predictions: predictions,
      summary,
      warnings:        generateWarnings(modified, baseline),
    };
  } catch (err) {
    logger.error('simulateLife error:', err.message);
    throw err;
  }
}

// ── Scenario: what-if endpoints ───────────────────────────────────────────────

/**
 * getScenarioTemplates()
 * Returns pre-built simulation scenarios.
 */
function getScenarioTemplates() {
  return [
    {
      id:          'more_sleep',
      label:       'ماذا لو نمت أكثر؟',
      description: 'زيادة وقت النوم بساعة إضافية',
      scenario:    { sleep_change: +1 },
      icon:        '😴',
    },
    {
      id:          'less_sleep',
      label:       'ماذا لو نمت أقل؟',
      description: 'تقليل وقت النوم بساعة',
      scenario:    { sleep_change: -1 },
      icon:        '⚠️',
    },
    {
      id:          'more_tasks',
      label:       'ماذا لو زادت مهامك؟',
      description: 'زيادة عدد المهام اليومية بنسبة 50%',
      scenario:    { task_change: +0.5, workload_change: +0.3 },
      icon:        '📋',
    },
    {
      id:          'add_exercise',
      label:       'ماذا لو مارست الرياضة يومياً؟',
      description: 'إضافة 30 دقيقة رياضة يومياً',
      scenario:    { exercise_change: +1 },
      icon:        '🏃',
    },
    {
      id:          'reduce_workload',
      label:       'ماذا لو خففت العمل؟',
      description: 'تقليل عبء العمل بنسبة 30%',
      scenario:    { workload_change: -0.3, task_change: -0.3 },
      icon:        '🌿',
    },
    {
      id:          'optimal_schedule',
      label:       'الجدول الأمثل',
      description: 'أكثر نوماً + رياضة + تقليل عبء عمل',
      scenario:    { sleep_change: +1, exercise_change: +1, workload_change: -0.2 },
      icon:        '🚀',
    },
  ];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcBaseline(scores, moodEntries, energyLogs, tasks) {
  const avgScore = scores.length > 0
    ? Math.round(scores.reduce((s, r) => s + (r.overall_score || 0), 0) / scores.length) : 55;

  const avgMood = moodEntries.length > 0
    ? parseFloat((moodEntries.reduce((s, m) => s + (m.mood_score || 5), 0) / moodEntries.length).toFixed(1)) : 6;

  const avgEnergy = energyLogs.length > 0
    ? Math.round(energyLogs.reduce((s, e) => s + (e.energy_score || 50), 0) / energyLogs.length) : 55;

  const completedTasks = tasks.filter(t => t.status === 'completed').length;
  const taskRate       = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 60;

  return {
    productivity_score: avgScore,
    mood_score:         avgMood,
    energy_score:       avgEnergy,
    task_completion:    taskRate,
    burnout_risk:       calcBurnoutRisk(avgScore, avgMood, avgEnergy),
  };
}

function applyScenario(baseline, scenario) {
  const sc = { ...baseline };
  const {
    sleep_change    = 0,
    task_change     = 0,
    exercise_change = 0,
    workload_change = 0,
  } = scenario;

  // Sleep impact: ±1h → ±8 energy, ±6 productivity, ±0.5 mood
  const sleepMult = sleep_change > 0 ? Math.min(sleep_change * 8, 20) : Math.max(sleep_change * 8, -20);
  sc.energy_score       = clamp(sc.energy_score  + sleepMult, 0, 100);
  sc.productivity_score = clamp(sc.productivity_score + sleepMult * 0.75, 0, 100);
  sc.mood_score         = clamp(sc.mood_score    + sleep_change * 0.5, 1, 10);

  // Exercise impact: +1 → +10 mood, +8 energy, +5 productivity
  if (exercise_change > 0) {
    sc.energy_score       = clamp(sc.energy_score  + 10 * exercise_change, 0, 100);
    sc.mood_score         = clamp(sc.mood_score    + 1.0 * exercise_change, 1, 10);
    sc.productivity_score = clamp(sc.productivity_score + 5 * exercise_change, 0, 100);
  }

  // Task/workload impact: more tasks → lower completion rate, higher burnout
  const taskImpact = task_change * 15 + workload_change * 10;
  sc.task_completion    = clamp(sc.task_completion - taskImpact, 0, 100);
  sc.productivity_score = clamp(sc.productivity_score - taskImpact * 0.5, 0, 100);

  // Workload reduction: free up energy
  if (workload_change < 0) {
    sc.energy_score = clamp(sc.energy_score - workload_change * 15, 0, 100);
    sc.mood_score   = clamp(sc.mood_score   - workload_change * 0.5, 1, 10);
  }

  sc.burnout_risk = calcBurnoutRisk(sc.productivity_score, sc.mood_score, sc.energy_score);

  // Round all numbers
  sc.energy_score       = Math.round(sc.energy_score);
  sc.productivity_score = Math.round(sc.productivity_score);
  sc.mood_score         = parseFloat(sc.mood_score.toFixed(1));
  sc.task_completion    = Math.round(sc.task_completion);

  return sc;
}

function generateDayPredictions(projected, baseline, windowDays, timezone) {
  const days = [];
  const today = moment.tz(timezone);

  for (let i = 1; i <= windowDays; i++) {
    const date = today.clone().add(i, 'days');
    // Add daily variance (±3 points) and gradual trend toward projected
    const factor     = Math.min(i / windowDays, 1);
    const variance   = (Math.random() - 0.5) * 6;
    const prodScore  = Math.round(clamp(
      baseline.productivity_score + (projected.productivity_score - baseline.productivity_score) * factor + variance, 0, 100));
    const energyScore = Math.round(clamp(
      baseline.energy_score + (projected.energy_score - baseline.energy_score) * factor + variance * 0.8, 0, 100));
    const moodScore  = parseFloat(clamp(
      baseline.mood_score + (projected.mood_score - baseline.mood_score) * factor + variance * 0.1, 1, 10).toFixed(1));

    days.push({
      date:             date.format('YYYY-MM-DD'),
      day_label:        date.locale('ar').format('dddd D/M'),
      productivity:     prodScore,
      energy:           energyScore,
      mood:             moodScore,
      recommended_load: prodScore >= 70 ? 'full' : prodScore >= 50 ? 'moderate' : 'light',
      load_label:       prodScore >= 70 ? 'حمل كامل' : prodScore >= 50 ? 'حمل متوسط' : 'حمل خفيف',
    });
  }
  return days;
}

function buildSimulationSummary(baseline, projected, scenario, windowDays) {
  const changes = [];
  const prodDiff   = projected.productivity_score - baseline.productivity_score;
  const energyDiff = projected.energy_score - baseline.energy_score;
  const moodDiff   = projected.mood_score - baseline.mood_score;

  if (Math.abs(prodDiff) > 3)
    changes.push({ metric: 'الإنتاجية', change: prodDiff, icon: prodDiff > 0 ? '📈' : '📉', label: `${prodDiff > 0 ? '+' : ''}${Math.round(prodDiff)} نقطة` });
  if (Math.abs(energyDiff) > 3)
    changes.push({ metric: 'الطاقة', change: energyDiff, icon: energyDiff > 0 ? '⚡' : '🔋', label: `${energyDiff > 0 ? '+' : ''}${Math.round(energyDiff)} نقطة` });
  if (Math.abs(moodDiff) > 0.2)
    changes.push({ metric: 'المزاج', change: moodDiff, icon: moodDiff > 0 ? '😊' : '😔', label: `${moodDiff > 0 ? '+' : ''}${moodDiff.toFixed(1)} نقطة` });

  const overallImpact = (prodDiff + energyDiff) / 2;
  return {
    overall_impact:    overallImpact > 5 ? 'positive' : overallImpact < -5 ? 'negative' : 'neutral',
    impact_label:      overallImpact > 5 ? 'تأثير إيجابي واضح' : overallImpact < -5 ? 'تأثير سلبي' : 'تأثير محدود',
    changes,
    projection_window: `${windowDays} يوم`,
    confidence:        baseline.productivity_score > 0 ? 0.75 : 0.50,
  };
}

function generateWarnings(projected, baseline) {
  const warnings = [];
  if (projected.burnout_risk === 'high')
    warnings.push({ level: 'critical', message: 'هذا السيناريو يزيد خطر الإجهاد — لا يُنصح به' });
  if (projected.task_completion < 40)
    warnings.push({ level: 'warning', message: 'معدل إتمام المهام سيكون منخفضاً جداً' });
  if (projected.energy_score < 30)
    warnings.push({ level: 'warning', message: 'مستوى الطاقة سيكون حرجاً في هذا السيناريو' });
  return warnings;
}

function calcBurnoutRisk(score, mood, energy) {
  let risk = 0;
  if (score < 40)  risk += 2;
  if (mood < 5)    risk += 2;
  if (energy < 30) risk += 2;
  if (risk >= 4)   return 'high';
  if (risk >= 2)   return 'medium';
  return 'low';
}

function normalizeScenario(sc) {
  const labels = [];
  if (sc.sleep_change)    labels.push(`نوم ${sc.sleep_change > 0 ? '+' : ''}${sc.sleep_change} ساعة`);
  if (sc.exercise_change) labels.push(sc.exercise_change > 0 ? 'رياضة يومية' : 'بدون رياضة');
  if (sc.task_change)     labels.push(`مهام ${sc.task_change > 0 ? '+' : ''}${Math.round(sc.task_change * 100)}%`);
  if (sc.workload_change) labels.push(`عبء عمل ${sc.workload_change > 0 ? '+' : ''}${Math.round(sc.workload_change * 100)}%`);
  return { ...sc, label: labels.length > 0 ? labels.join(' + ') : 'سيناريو مخصص' };
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

module.exports = { simulateLife, getScenarioTemplates };
