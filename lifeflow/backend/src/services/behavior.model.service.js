/**
 * Behavior Model Service — Phase 10
 * ====================================
 * Builds a dynamic behavioral model for each user based on
 * tasks history, habit completion, mood logs, energy scores, and timeline events.
 * Outputs: productivity profile, focus windows, stress triggers, motivation patterns.
 */

'use strict';

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

function getModels() {
  const Task            = require('../models/task.model');
  const { Habit } = require('../models/habit.model');
  const MoodEntry       = require('../models/mood.model');
  const ProductivityScore = require('../models/productivity_score.model');
  const BehavioralFlag  = require('../models/behavioral_flag.model');
  const EnergyLog       = require('../models/energy_log.model');
  const { sequelize }   = require('../config/database');
  return { Task, Habit, MoodEntry, ProductivityScore, BehavioralFlag, EnergyLog, sequelize };
}

const ARABIC_HOURS = {
  5:'الفجر',6:'الصباح الباكر',7:'الصباح',8:'الضحى',9:'منتصف الصباح',
  10:'قبل الظهر',11:'قبيل الظهر',12:'الظهر',13:'بعد الظهر',14:'العصر',
  15:'منتصف العصر',16:'آخر العصر',17:'المساء',18:'أول المساء',
  19:'المساء المتأخر',20:'العشاء',21:'الليل',22:'منتصف الليل',23:'الليل المتأخر',
};

/**
 * buildBehaviorModel(userId, timezone, daysBack)
 * Main entry point — returns full behavioral model.
 */
async function buildBehaviorModel(userId, timezone = 'Africa/Cairo', daysBack = 30) {
  try {
    const { Task, Habit, MoodEntry, ProductivityScore, BehavioralFlag, EnergyLog, sequelize } = getModels();
    const since = moment.tz(timezone).subtract(daysBack, 'days').toDate();

    // ── Fetch raw data ────────────────────────────────────────────────────────
    const [tasks, moodEntries, scores, flags, energyLogs] = await Promise.all([
      Task.findAll({ where: { user_id: userId, [Op.or]: [{ due_date: { [Op.gte]: since } }, { completed_at: { [Op.gte]: since } }] }, raw: true }),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: since } }, raw: true }),
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since } }, raw: true, order: [['score_date','ASC']] }),
      BehavioralFlag.findAll({ where: { user_id: userId, is_resolved: false }, raw: true }),
      EnergyLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: since } }, raw: true, order: [['log_date','ASC']] }),
    ]);

    // ── Productivity Profile ──────────────────────────────────────────────────
    const completedTasks = tasks.filter(t => t.status === 'completed');
    const taskRate        = tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0;
    const urgentCompleted = tasks.filter(t => t.priority === 'urgent' && t.status === 'completed').length;
    const urgentTotal     = tasks.filter(t => t.priority === 'urgent').length;
    const urgentRate      = urgentTotal > 0 ? Math.round((urgentCompleted / urgentTotal) * 100) : 0;

    const avgScore = scores.length > 0
      ? Math.round(scores.reduce((s, r) => s + (r.overall_score || 0), 0) / scores.length)
      : 0;

    // Hourly productivity pattern from completed tasks
    const hourBuckets = Array(24).fill(0);
    completedTasks.forEach(t => {
      if (t.completed_at) {
        // Use new Date() first to ensure valid ISO input for moment.tz
        const h = moment.tz(new Date(t.completed_at).toISOString(), timezone).hour();
        hourBuckets[h]++;
      }
    });
    const maxBucket = Math.max(...hourBuckets, 1);
    const hourlyProductivity = hourBuckets.map((count, h) => ({
      hour: h,
      label: ARABIC_HOURS[h] || `${h}:00`,
      score: Math.round((count / maxBucket) * 100),
      count,
    }));

    // Peak hours (top 3)
    const peakHours = [...hourlyProductivity]
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map(h => ({ ...h }));

    // ── Focus Windows ─────────────────────────────────────────────────────────
    const focusWindows = detectFocusWindows(hourlyProductivity);

    // ── Sleep Pattern ─────────────────────────────────────────────────────────
    const avgEnergy = energyLogs.length > 0
      ? Math.round(energyLogs.reduce((s, e) => s + (e.energy_score || 0), 0) / energyLogs.length)
      : null;
    const avgSleep = energyLogs.filter(e => e.sleep_score != null).length > 0
      ? energyLogs.reduce((s, e) => s + (e.sleep_score || 0), 0) / energyLogs.filter(e => e.sleep_score != null).length
      : null;

    // ── Mood Pattern ──────────────────────────────────────────────────────────
    const avgMood = moodEntries.length > 0
      ? parseFloat((moodEntries.reduce((s, m) => s + (m.mood_score || 5), 0) / moodEntries.length).toFixed(1))
      : null;
    const moodStability = calcMoodStability(moodEntries);

    // ── Stress Triggers ───────────────────────────────────────────────────────
    const stressTriggers = analyzeStressTriggers(flags, tasks, moodEntries);

    // ── Motivation Patterns ───────────────────────────────────────────────────
    const motivationPattern = detectMotivationPattern(scores, taskRate, avgMood);

    // ── Habit Strength ────────────────────────────────────────────────────────
    const habitStrength = calcHabitStrength(flags);

    // ── Score trend ───────────────────────────────────────────────────────────
    const scoreTrend = calcScoreTrend(scores.map(s => s.overall_score || 0));

    return {
      user_id:      userId,
      period_days:  daysBack,
      generated_at: moment.tz(timezone).toISOString(),
      productivity_profile: {
        task_completion_rate: taskRate,
        urgent_task_rate:     urgentRate,
        avg_score_30d:        avgScore,
        score_trend:          scoreTrend,
        hourly_productivity:  hourlyProductivity,
        peak_hours:           peakHours,
      },
      focus_windows: focusWindows,
      sleep_pattern: {
        avg_energy_score: avgEnergy,
        avg_sleep_quality: avgSleep ? Math.round((avgSleep / 20) * 100) : null,
        data_points: energyLogs.length,
      },
      mood_pattern: {
        avg_mood:        avgMood,
        mood_stability:  moodStability.stability,
        stability_label: moodStability.label,
        data_points:     moodEntries.length,
      },
      stress_triggers:    stressTriggers,
      motivation_pattern: motivationPattern,
      habit_strength:     habitStrength,
    };
  } catch (err) {
    logger.error('buildBehaviorModel error:', err.message);
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectFocusWindows(hourlyProductivity) {
  const windows = [];
  // Find contiguous blocks with score >= 60
  let blockStart = null;
  for (let h = 5; h <= 22; h++) {
    const entry = hourlyProductivity[h];
    if (entry && entry.score >= 60) {
      if (blockStart === null) blockStart = h;
    } else {
      if (blockStart !== null) {
        windows.push({
          start_hour: blockStart,
          end_hour:   h,
          label:      `${ARABIC_HOURS[blockStart] || blockStart + ':00'} — ${ARABIC_HOURS[h] || h + ':00'}`,
          avg_score:  Math.round(hourlyProductivity.slice(blockStart, h).reduce((s, x) => s + x.score, 0) / (h - blockStart)),
          duration_hours: h - blockStart,
        });
        blockStart = null;
      }
    }
  }
  // Fallback: default morning window
  if (windows.length === 0) {
    windows.push({ start_hour: 9, end_hour: 11, label: 'الضحى — قبل الظهر', avg_score: 70, duration_hours: 2 });
    windows.push({ start_hour: 20, end_hour: 22, label: 'العشاء — منتصف الليل', avg_score: 65, duration_hours: 2 });
  }
  return windows.slice(0, 3);
}

function calcMoodStability(moodEntries) {
  if (moodEntries.length < 3) return { stability: 'unknown', label: 'بيانات غير كافية' };
  const scores = moodEntries.map(m => m.mood_score || 5);
  const mean   = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  if (stdDev < 1.0) return { stability: 'stable',   label: 'مزاج مستقر جداً' };
  if (stdDev < 2.0) return { stability: 'moderate', label: 'مزاج متوسط الاستقرار' };
  return              { stability: 'volatile', label: 'مزاج متقلب' };
}

function analyzeStressTriggers(flags, tasks, moodEntries) {
  const triggers = [];
  const flagTypes = flags.map(f => f.flag_type);

  if (flagTypes.includes('overcommitment'))
    triggers.push({ trigger: 'كثرة المهام', arabic: 'تحمّل مهام أكثر من الطاقة', severity: 'high' });
  if (flagTypes.includes('late_night_work'))
    triggers.push({ trigger: 'العمل الليلي', arabic: 'العمل في ساعات متأخرة من الليل', severity: 'medium' });
  if (flagTypes.includes('procrastination'))
    triggers.push({ trigger: 'التأجيل', arabic: 'تأجيل المهام العاجلة يولد ضغطاً', severity: 'medium' });
  if (flagTypes.includes('burnout_risk'))
    triggers.push({ trigger: 'الإجهاد المتراكم', arabic: 'علامات إجهاد متراكمة', severity: 'critical' });

  // Mood-based trigger
  const lowMoodDays = moodEntries.filter(m => (m.mood_score || 5) < 4).length;
  if (lowMoodDays >= 3)
    triggers.push({ trigger: 'أيام مزاج منخفض', arabic: `${lowMoodDays} يوم بمزاج منخفض خلال الفترة`, severity: 'medium' });

  return triggers.length > 0 ? triggers : [{ trigger: 'لا مشغلات', arabic: 'لا توجد مشغلات إجهاد واضحة', severity: 'none' }];
}

function detectMotivationPattern(scores, taskRate, avgMood) {
  if (scores.length < 3) return { pattern: 'insufficient_data', label: 'بيانات غير كافية' };

  const recentScores = scores.slice(-7).map(s => s.overall_score || 0);
  const trend = calcScoreTrend(recentScores);

  if (trend === 'improving' && taskRate >= 70)
    return { pattern: 'ascending',   label: 'دافعية متصاعدة — أنت في قمة أدائك', icon: '🚀' };
  if (trend === 'declining' && taskRate < 50)
    return { pattern: 'declining',   label: 'دافعية منخفضة — تحتاج لإعادة توجيه', icon: '⚠️' };
  if (avgMood && avgMood >= 7 && taskRate >= 60)
    return { pattern: 'mood_driven', label: 'مدفوع بالمزاج — مزاجك الجيد يرفع أداءك', icon: '😊' };
  return { pattern: 'stable', label: 'أداء ثابت ومستقر', icon: '📊' };
}

function calcHabitStrength(flags) {
  const breakingFlags = flags.filter(f => f.flag_type === 'habit_breaking').length;
  if (breakingFlags === 0) return { score: 90, label: 'قوي', description: 'عاداتك قوية ومستمرة' };
  if (breakingFlags <= 1) return { score: 65, label: 'متوسط', description: 'بعض العادات تحتاج دعماً' };
  return { score: 35, label: 'ضعيف', description: 'العادات تتكسر بشكل متكرر' };
}

function calcScoreTrend(scores) {
  if (!scores || scores.length < 2) return 'stable';
  const n      = scores.length;
  const recent = scores.slice(Math.max(0, n - 3)).reduce((a, b) => a + b, 0) / Math.min(n, 3);
  const older  = scores.slice(0, Math.min(3, n)).reduce((a, b) => a + b, 0) / Math.min(3, n);
  const diff   = recent - older;
  if (diff > 5)  return 'improving';
  if (diff < -5) return 'declining';
  return 'stable';
}

module.exports = { buildBehaviorModel, detectFocusWindows, calcScoreTrend };
