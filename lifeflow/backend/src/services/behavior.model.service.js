/**
 * Behavior Model Service — Phase 10 + Step 1 Fix
 * =================================================
 * Builds a dynamic behavioral model for each user based on
 * tasks history, habit completion, mood logs, energy scores, and timeline events.
 *
 * Step 1 FIX:
 *  - Fixed dead code: return statement was BEFORE persist block
 *  - Added BehaviorPattern population (procrastination, working hours, habit adherence)
 *  - Added continuous update trigger after task/habit events
 *  - Connected behavior data to planning + assistant context
 */

'use strict';

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

function getModels() {
  const Task            = require('../models/task.model');
  const { Habit, HabitLog } = require('../models/habit.model');
  const MoodEntry       = require('../models/mood.model');
  const ProductivityScore = require('../models/productivity_score.model');
  const BehavioralFlag  = require('../models/behavioral_flag.model');
  const EnergyLog       = require('../models/energy_log.model');
  const { sequelize }   = require('../config/database');
  return { Task, Habit, HabitLog, MoodEntry, ProductivityScore, BehavioralFlag, EnergyLog, sequelize };
}

function getBehaviorModels() {
  let BehaviorProfile, BehaviorPattern;
  try { BehaviorProfile = require('../models/behavior_profile.model'); } catch (_) {}
  try { BehaviorPattern = require('../models/behavior_pattern.model'); } catch (_) {}
  return { BehaviorProfile, BehaviorPattern };
}

const ARABIC_HOURS = {
  5:'الفجر',6:'الصباح الباكر',7:'الصباح',8:'الضحى',9:'منتصف الصباح',
  10:'قبل الظهر',11:'قبيل الظهر',12:'الظهر',13:'بعد الظهر',14:'العصر',
  15:'منتصف العصر',16:'آخر العصر',17:'المساء',18:'أول المساء',
  19:'المساء المتأخر',20:'العشاء',21:'الليل',22:'منتصف الليل',23:'الليل المتأخر',
};

/**
 * buildBehaviorModel(userId, timezone, daysBack)
 * Main entry point — returns full behavioral model AND persists to DB.
 */
async function buildBehaviorModel(userId, timezone = 'Africa/Cairo', daysBack = 30) {
  try {
    const { Task, Habit, HabitLog, MoodEntry, ProductivityScore, BehavioralFlag, EnergyLog } = getModels();
    const since = moment.tz(timezone).subtract(daysBack, 'days').toDate();

    // ── Fetch raw data ────────────────────────────────────────────────────────
    const [tasks, moodEntries, scores, flags, energyLogs] = await Promise.all([
      Task.findAll({ where: { user_id: userId, [Op.or]: [{ due_date: { [Op.gte]: since } }, { completed_at: { [Op.gte]: since } }] }, raw: true }),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: since } }, raw: true }),
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since } }, raw: true, order: [['score_date','ASC']] }),
      BehavioralFlag.findAll({ where: { user_id: userId, is_resolved: false }, raw: true }),
      EnergyLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: since } }, raw: true, order: [['log_date','ASC']] }),
    ]);

    // ── Fetch habit data ──────────────────────────────────────────────────────
    let habits = [], habitLogs = [];
    try {
      const sinceStr = moment.tz(timezone).subtract(daysBack, 'days').format('YYYY-MM-DD');
      [habits, habitLogs] = await Promise.all([
        Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true }),
        HabitLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: sinceStr } }, raw: true }),
      ]);
    } catch (_) { /* HabitLog may fail on some setups */ }

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
    const habitStrength = calcHabitStrength(flags, habits, habitLogs);

    // ── Score trend ───────────────────────────────────────────────────────────
    const scoreTrend = calcScoreTrend(scores.map(s => s.overall_score || 0));

    // ── Procrastination Score ─────────────────────────────────────────────────
    const procrastinationData = detectProcrastination(tasks, timezone);

    // ── Working Hours Pattern ─────────────────────────────────────────────────
    const workingHoursPattern = detectWorkingHours(completedTasks, timezone);

    // ── Build result ──────────────────────────────────────────────────────────
    const result = {
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
      stress_triggers:       stressTriggers,
      motivation_pattern:    motivationPattern,
      habit_strength:        habitStrength,
      procrastination:       procrastinationData,
      working_hours_pattern: workingHoursPattern,
    };

    // ── Persist to BehaviorProfile table (FIX: was dead code before) ──────────
    const totalDataPoints = tasks.length + moodEntries.length + habitLogs.length;
    try {
      const { BehaviorProfile } = getBehaviorModels();
      if (BehaviorProfile) {
        const existingProfile = await BehaviorProfile.findOne({ where: { user_id: userId } });
        const profileData = {
          user_id:              userId,
          focus_peak_hours:     peakHours.map(h => h.hour),
          stress_triggers:      stressTriggers,
          productivity_pattern: result.productivity_profile,
          sleep_pattern:        result.sleep_pattern,
          habit_strength:       habitStrength,
          motivation_pattern:   motivationPattern,
          mood_pattern:         result.mood_pattern,
          data_quality:         totalDataPoints > 50 ? 'good' : totalDataPoints > 20 ? 'fair' : 'low',
          period_days:          daysBack,
        };

        if (existingProfile) {
          await existingProfile.update(profileData);
        } else {
          await BehaviorProfile.create(profileData);
        }
        logger.info(`[BEHAVIOR-MODEL] Profile persisted for user ${userId} (${totalDataPoints} data points)`);
      }
    } catch (persistErr) {
      logger.warn('[BEHAVIOR-MODEL] Failed to persist profile:', persistErr.message);
    }

    // ── Persist BehaviorPatterns (NEW in Step 1) ──────────────────────────────
    try {
      await persistBehaviorPatterns(userId, result);
    } catch (patternErr) {
      logger.warn('[BEHAVIOR-MODEL] Failed to persist patterns:', patternErr.message);
    }

    return result;
  } catch (err) {
    logger.error('buildBehaviorModel error:', err.message);
    throw err;
  }
}

// ── Persist individual behavior patterns to behavior_patterns table ──────────
async function persistBehaviorPatterns(userId, model) {
  const { BehaviorPattern } = getBehaviorModels();
  if (!BehaviorPattern) return;

  const patterns = [];

  // 1. Procrastination pattern
  if (model.procrastination && model.procrastination.score > 30) {
    patterns.push({
      user_id: userId,
      pattern_type: 'procrastination',
      title: 'نمط التأجيل',
      correlation_score: model.procrastination.score / 100,
      confidence_level: model.procrastination.confidence || 0.6,
      pattern_description: `تأجيل ${model.procrastination.reschedule_count} مهمة خلال الفترة`,
      insight: model.procrastination.insight,
      recommendation: model.procrastination.recommendation,
      actionable: true,
      icon: '⏰',
      extra_data: { reschedule_count: model.procrastination.reschedule_count, overdue_rate: model.procrastination.overdue_rate },
    });
  }

  // 2. Working hours routine
  if (model.working_hours_pattern && model.working_hours_pattern.consistency > 0.5) {
    patterns.push({
      user_id: userId,
      pattern_type: 'working_hours',
      title: 'نمط ساعات العمل',
      correlation_score: model.working_hours_pattern.consistency,
      confidence_level: model.working_hours_pattern.confidence || 0.7,
      pattern_description: `ساعات العمل المعتادة: ${model.working_hours_pattern.typical_start}:00 - ${model.working_hours_pattern.typical_end}:00`,
      insight: model.working_hours_pattern.insight,
      recommendation: model.working_hours_pattern.recommendation,
      actionable: true,
      icon: '🕐',
      extra_data: model.working_hours_pattern,
    });
  }

  // 3. Habit adherence pattern
  if (model.habit_strength) {
    patterns.push({
      user_id: userId,
      pattern_type: 'habit_adherence',
      title: 'الالتزام بالعادات',
      correlation_score: (model.habit_strength.score || 50) / 100,
      confidence_level: 0.8,
      pattern_description: model.habit_strength.description || 'تتبع العادات اليومية',
      insight: `قوة العادات: ${model.habit_strength.label}`,
      recommendation: model.habit_strength.score < 50 ? 'ابدأ بعادة واحدة فقط وأكملها يومياً لمدة أسبوع' : 'استمر في هذا المستوى الممتاز',
      actionable: model.habit_strength.score < 70,
      icon: '🔄',
      extra_data: model.habit_strength,
    });
  }

  // 4. Mood-productivity correlation
  if (model.mood_pattern && model.mood_pattern.avg_mood != null && model.productivity_profile) {
    const moodProd = model.mood_pattern.avg_mood >= 7 && model.productivity_profile.task_completion_rate >= 60;
    patterns.push({
      user_id: userId,
      pattern_type: 'mood_productivity',
      title: 'المزاج والإنتاجية',
      correlation_score: moodProd ? 0.8 : 0.4,
      confidence_level: model.mood_pattern.data_points >= 7 ? 0.8 : 0.5,
      pattern_description: moodProd ? 'المزاج الجيد يرتبط بإنتاجية عالية' : 'لا يوجد ارتباط قوي بين المزاج والإنتاجية',
      insight: moodProd ? 'مزاجك يؤثر بشكل إيجابي على إنتاجيتك' : 'إنتاجيتك مستقلة عن مزاجك نسبياً',
      recommendation: moodProd ? 'اهتم بمزاجك لتحسين الأداء' : 'ركّز على بناء عادات ثابتة بغض النظر عن المزاج',
      actionable: true,
      icon: moodProd ? '😊' : '📊',
      extra_data: { avg_mood: model.mood_pattern.avg_mood, task_rate: model.productivity_profile.task_completion_rate },
    });
  }

  // Upsert patterns (delete old for user, insert new)
  if (patterns.length > 0) {
    try {
      await BehaviorPattern.destroy({ where: { user_id: userId } });
      await BehaviorPattern.bulkCreate(patterns);
      logger.info(`[BEHAVIOR-MODEL] ${patterns.length} patterns persisted for user ${userId}`);
    } catch (e) {
      logger.warn('[BEHAVIOR-MODEL] Pattern persist error:', e.message);
    }
  }
}

// ── Detect Procrastination Signals ──────────────────────────────────────────
function detectProcrastination(tasks, timezone) {
  const now = moment.tz(timezone);
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'in_progress');
  const overdueTasks = pendingTasks.filter(t => {
    if (!t.due_date) return false;
    const due = moment.tz(String(t.due_date).split('T')[0], 'YYYY-MM-DD', timezone);
    return due.isBefore(now, 'day');
  });
  const rescheduledTasks = tasks.filter(t => (t.reschedule_count || 0) > 0);
  const totalReschedules = rescheduledTasks.reduce((s, t) => s + (t.reschedule_count || 0), 0);

  const overdueRate = pendingTasks.length > 0 ? Math.round((overdueTasks.length / pendingTasks.length) * 100) : 0;
  const rescheduleRate = tasks.length > 0 ? Math.round((totalReschedules / tasks.length) * 100) : 0;

  // Procrastination score: 0 = no procrastination, 100 = severe
  const score = Math.min(100, Math.round(overdueRate * 0.5 + rescheduleRate * 0.3 + Math.min(overdueTasks.length * 5, 20)));

  let insight, recommendation;
  if (score > 70) {
    insight = 'نمط تأجيل شديد — مهامك تتراكم بشكل ملحوظ';
    recommendation = 'استخدم قاعدة الدقيقتين: ابدأ بأصغر مهمة الآن';
  } else if (score > 40) {
    insight = 'تأجيل متوسط — بعض المهام تحتاج متابعة';
    recommendation = 'حدد 3 مهام صغيرة وأنهها قبل نهاية اليوم';
  } else {
    insight = 'التزام جيد بالمواعيد';
    recommendation = 'استمر في هذا النهج الرائع';
  }

  return {
    score,
    overdue_count: overdueTasks.length,
    reschedule_count: totalReschedules,
    overdue_rate: overdueRate,
    confidence: tasks.length >= 10 ? 0.8 : tasks.length >= 5 ? 0.6 : 0.4,
    insight,
    recommendation,
  };
}

// ── Detect Working Hours Pattern ────────────────────────────────────────────
function detectWorkingHours(completedTasks, timezone) {
  if (completedTasks.length < 5) {
    return { consistency: 0, insight: 'بيانات غير كافية لتحديد ساعات العمل', confidence: 0 };
  }

  const hourCounts = Array(24).fill(0);
  completedTasks.forEach(t => {
    if (t.completed_at) {
      const h = moment.tz(new Date(t.completed_at).toISOString(), timezone).hour();
      hourCounts[h]++;
    }
  });

  // Find typical start (first hour with significant activity)
  const threshold = Math.max(...hourCounts) * 0.2;
  let typicalStart = 9, typicalEnd = 18;
  for (let h = 5; h <= 23; h++) {
    if (hourCounts[h] >= threshold) { typicalStart = h; break; }
  }
  for (let h = 23; h >= 5; h--) {
    if (hourCounts[h] >= threshold) { typicalEnd = h; break; }
  }

  // Consistency: what % of tasks fall within the typical window?
  const inWindowCount = completedTasks.filter(t => {
    if (!t.completed_at) return false;
    const h = moment.tz(new Date(t.completed_at).toISOString(), timezone).hour();
    return h >= typicalStart && h <= typicalEnd;
  }).length;
  const consistency = completedTasks.length > 0 ? parseFloat((inWindowCount / completedTasks.length).toFixed(2)) : 0;

  // Late night work detection
  const lateNightCount = completedTasks.filter(t => {
    if (!t.completed_at) return false;
    const h = moment.tz(new Date(t.completed_at).toISOString(), timezone).hour();
    return h >= 23 || h <= 4;
  }).length;
  const lateNightRate = completedTasks.length > 0 ? parseFloat((lateNightCount / completedTasks.length).toFixed(2)) : 0;

  let insight, recommendation;
  if (lateNightRate > 0.2) {
    insight = 'نلاحظ عمل متأخر بشكل متكرر — قد يؤثر على نوعية النوم';
    recommendation = 'حاول إنهاء مهامك قبل الساعة 22:00';
  } else if (consistency > 0.7) {
    insight = `لديك روتين عمل ثابت من ${typicalStart}:00 إلى ${typicalEnd}:00`;
    recommendation = 'جدّول المهام الصعبة في ساعات الذروة';
  } else {
    insight = 'ساعات عملك متفرقة — لا يوجد روتين واضح';
    recommendation = 'حدد ساعات عمل ثابتة لتحسين التركيز';
  }

  return {
    typical_start: typicalStart,
    typical_end: typicalEnd,
    consistency,
    late_night_rate: lateNightRate,
    confidence: completedTasks.length >= 20 ? 0.9 : completedTasks.length >= 10 ? 0.7 : 0.5,
    insight,
    recommendation,
  };
}

// ── Quick Update — called after task/habit events for incremental update ─────
/**
 * Incrementally update behavior data after a task completion or habit log.
 * Lighter than full buildBehaviorModel — only updates relevant pattern.
 */
async function onTaskEvent(userId, eventType, taskData = {}, timezone = 'Africa/Cairo') {
  try {
    const { BehaviorProfile, BehaviorPattern } = getBehaviorModels();
    if (!BehaviorProfile) return;

    const profile = await BehaviorProfile.findOne({ where: { user_id: userId } });
    if (!profile) {
      // No profile yet — trigger full build in background
      setImmediate(() => buildBehaviorModel(userId, timezone).catch(() => {}));
      return;
    }

    // Update productivity pattern with the event
    const prodPattern = profile.productivity_pattern || {};
    if (eventType === 'task_completed') {
      const hour = moment.tz(timezone).hour();
      const hourly = prodPattern.hourly_productivity || [];
      if (hourly[hour]) {
        hourly[hour].count = (hourly[hour].count || 0) + 1;
      }
      prodPattern.hourly_productivity = hourly;
      await profile.update({ productivity_pattern: prodPattern });
      logger.debug(`[BEHAVIOR-MODEL] Incremental update: task_completed at hour ${hour}`);
    }

    if (eventType === 'task_rescheduled') {
      // Trigger procrastination pattern update in background
      setImmediate(() => buildBehaviorModel(userId, timezone).catch(() => {}));
    }
  } catch (e) {
    logger.warn('[BEHAVIOR-MODEL] onTaskEvent error (non-fatal):', e.message);
  }
}

async function onHabitEvent(userId, eventType, habitData = {}, timezone = 'Africa/Cairo') {
  try {
    const { BehaviorProfile } = getBehaviorModels();
    if (!BehaviorProfile) return;

    const profile = await BehaviorProfile.findOne({ where: { user_id: userId } });
    if (!profile) {
      setImmediate(() => buildBehaviorModel(userId, timezone).catch(() => {}));
      return;
    }

    // Update habit strength
    if (eventType === 'habit_completed') {
      const hs = profile.habit_strength || {};
      hs.score = Math.min(100, (hs.score || 50) + 1);
      await profile.update({ habit_strength: hs });
      logger.debug(`[BEHAVIOR-MODEL] Incremental update: habit_completed`);
    }

    if (eventType === 'habit_missed') {
      const hs = profile.habit_strength || {};
      hs.score = Math.max(0, (hs.score || 50) - 3);
      await profile.update({ habit_strength: hs });
    }
  } catch (e) {
    logger.warn('[BEHAVIOR-MODEL] onHabitEvent error (non-fatal):', e.message);
  }
}

/**
 * Get the user's behavior profile from DB (cached, no recompute).
 * Returns null if no profile exists.
 */
async function getBehaviorProfile(userId) {
  try {
    const { BehaviorProfile } = getBehaviorModels();
    if (!BehaviorProfile) return null;
    return await BehaviorProfile.findOne({ where: { user_id: userId } });
  } catch (_) {
    return null;
  }
}

/**
 * Get the user's behavior patterns from DB.
 */
async function getBehaviorPatterns(userId) {
  try {
    const { BehaviorPattern } = getBehaviorModels();
    if (!BehaviorPattern) return [];
    return await BehaviorPattern.findAll({ where: { user_id: userId }, raw: true });
  } catch (_) {
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectFocusWindows(hourlyProductivity) {
  const windows = [];
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

  // Dynamic detection: high reschedule count
  const highReschedule = tasks.filter(t => (t.reschedule_count || 0) >= 3).length;
  if (highReschedule >= 2)
    triggers.push({ trigger: 'تأجيل متكرر', arabic: `${highReschedule} مهمة تم تأجيلها 3+ مرات`, severity: 'medium' });

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

function calcHabitStrength(flags, habits = [], habitLogs = []) {
  const breakingFlags = flags.filter(f => f.flag_type === 'habit_breaking').length;

  // Enhanced: also compute from actual habit log data
  if (habits.length > 0 && habitLogs.length > 0) {
    const uniqueDays = new Set(habitLogs.map(l => l.log_date)).size;
    const completedLogs = habitLogs.filter(l => l.completed).length;
    const expectedLogs = habits.length * Math.max(uniqueDays, 1);
    const adherenceRate = expectedLogs > 0 ? Math.round((completedLogs / expectedLogs) * 100) : 0;

    let label, description;
    if (adherenceRate >= 80) { label = 'قوي'; description = `التزام ${adherenceRate}٪ — عاداتك قوية ومستمرة`; }
    else if (adherenceRate >= 50) { label = 'متوسط'; description = `التزام ${adherenceRate}٪ — بعض العادات تحتاج دعماً`; }
    else { label = 'ضعيف'; description = `التزام ${adherenceRate}٪ — تحتاج لإعادة ضبط عاداتك`; }

    return { score: adherenceRate, label, description, data_driven: true };
  }

  // Fallback to flag-based
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

module.exports = {
  buildBehaviorModel,
  detectFocusWindows,
  calcScoreTrend,
  // Step 1 additions
  onTaskEvent,
  onHabitEvent,
  getBehaviorProfile,
  getBehaviorPatterns,
  detectProcrastination,
  detectWorkingHours,
};
