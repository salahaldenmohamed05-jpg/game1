/**
 * Personalization Service — خدمة التخصيص
 * ==========================================
 * Builds user profile based on real data + memory patterns.
 * Detects:
 *  - Focus hours (when user is most productive)
 *  - Productivity peaks (best days/times)
 *  - Stress triggers (what correlates with low mood/energy)
 *  - User tone preferences
 *  - Category preferences
 */

'use strict';

const moment  = require('moment-timezone');
const logger  = require('../utils/logger');
const memory  = require('./memory.service');

// ─── Model Loader ─────────────────────────────────────────────────────────────
function getModels() {
  const models = {};
  try { models.Task = require('../models/task.model'); } catch (_e) { logger.debug(`[PERSONALIZATION_SERVICE] Model load failed: ${_e.message}`); }
  try { models.MoodEntry = require('../models/mood.model'); } catch (_e) { logger.debug(`[PERSONALIZATION_SERVICE] Model load failed: ${_e.message}`); }
  try { models.Habit = require('../models/habit.model').Habit; } catch (_e) { logger.debug(`[PERSONALIZATION_SERVICE] Model load failed: ${_e.message}`); }
  try { models.HabitLog = require('../models/habit_log.model'); } catch (_e) { logger.debug(`[PERSONALIZATION_SERVICE] Model load failed: ${_e.message}`); }
  try { models.ProductivityScore = require('../models/productivity_score.model'); } catch (_e) { logger.debug(`[PERSONALIZATION_SERVICE] Model load failed: ${_e.message}`); }
  try { models.EnergyLog = require('../models/energy_log.model'); } catch (_e) { logger.debug(`[PERSONALIZATION_SERVICE] Model load failed: ${_e.message}`); }
  return models;
}

// ─── Default Profile ──────────────────────────────────────────────────────────
function defaultProfile(userId) {
  return {
    userId,
    focusHours        : [9, 10, 14],  // default productive hours
    productivityPeaks : ['morning'],   // morning | afternoon | evening | night
    stressTriggers    : [],
    preferredTone     : 'supportive',
    preferredVerbosity: 'normal',
    topCategories     : ['personal', 'work'],
    weeklyPattern     : null,          // best/worst days
    avgMood           : null,
    avgEnergy         : null,
    taskCompletionRate: null,
    profileConfidence : 'low',         // low | medium | high
    generatedAt       : new Date().toISOString(),
  };
}

// ─── Focus Hours Detection ────────────────────────────────────────────────────
/**
 * Detect when user is most productive based on task completions and productivity scores.
 */
async function detectFocusHours(userId, timezone = 'Africa/Cairo') {
  try {
    const { Task } = getModels();
    if (!Task) return [9, 10, 14];

    // Look at tasks completed recently (last 30 days)
    const { Op } = require('sequelize');
    const since = moment().tz(timezone).subtract(30, 'days').toDate();

    const completed = await Task.findAll({
      where: {
        user_id   : userId,
        status    : 'completed',
        updated_at: { [Op.gte]: since },
      },
      attributes: ['updated_at'],
      raw: true,
      limit: 100,
    });

    if (completed.length < 5) return [9, 10, 14]; // not enough data

    // Count completions by hour
    const hourCounts = {};
    for (const task of completed) {
      const h = moment(task.updated_at).tz(timezone).hour();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    }

    // Return top 3 hours
    return Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([h]) => parseInt(h))
      .sort((a, b) => a - b);
  } catch (err) {
    logger.debug('[PERSONALIZATION] detectFocusHours error:', err.message);
    return [9, 10, 14];
  }
}

// ─── Productivity Peaks ───────────────────────────────────────────────────────
function classifyProductivityPeak(focusHours) {
  if (!focusHours || focusHours.length === 0) return ['morning'];

  const peaks = new Set();
  for (const h of focusHours) {
    if (h >= 5  && h < 12) peaks.add('morning');
    if (h >= 12 && h < 17) peaks.add('afternoon');
    if (h >= 17 && h < 21) peaks.add('evening');
    if (h >= 21 || h < 5)  peaks.add('night');
  }
  return Array.from(peaks);
}

// ─── Stress Trigger Detection ─────────────────────────────────────────────────
/**
 * Detects what correlates with low mood/energy periods.
 */
async function detectStressTriggers(userId, timezone = 'Africa/Cairo') {
  const triggers = [];

  try {
    const { Task, MoodEntry } = getModels();
    if (!Task || !MoodEntry) return triggers;

    const { Op } = require('sequelize');
    const since  = moment().tz(timezone).subtract(14, 'days').format('YYYY-MM-DD');

    // Check overdue tasks correlation with low mood
    const [overdueTasks, lowMoodDays] = await Promise.all([
      Task.count({
        where: {
          user_id: userId,
          status : { [Op.in]: ['pending', 'in_progress'] },
          due_date: { [Op.lt]: moment().tz(timezone).format('YYYY-MM-DD') },
        },
      }),
      MoodEntry.count({
        where: {
          user_id   : userId,
          mood_score: { [Op.lt]: 5 },
          entry_date: { [Op.gte]: since },
        },
      }),
    ]);

    if (overdueTasks > 3) triggers.push('overdue_tasks');
    if (lowMoodDays > 3)  triggers.push('frequent_low_mood');

    // Check for high task load
    const urgentCount = await Task.count({
      where: {
        user_id : userId,
        priority: { [Op.in]: ['urgent', 'high'] },
        status  : { [Op.in]: ['pending', 'in_progress'] },
      },
    });

    if (urgentCount > 5) triggers.push('high_urgent_load');

    return triggers;
  } catch (err) {
    logger.debug('[PERSONALIZATION] detectStressTriggers error:', err.message);
    return triggers;
  }
}

// ─── Category Analysis ────────────────────────────────────────────────────────
async function detectTopCategories(userId) {
  try {
    const { Task } = getModels();
    if (!Task) return ['personal'];

    const { fn, col, literal } = require('sequelize');

    const tasks = await Task.findAll({
      where     : { user_id: userId },
      attributes: ['category'],
      raw       : true,
      limit     : 200,
    });

    const counts = {};
    for (const t of tasks) {
      const cat = t.category || 'personal';
      counts[cat] = (counts[cat] || 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cat]) => cat);
  } catch (err) {
    logger.debug('[PERSONALIZATION] detectTopCategories error:', err.message);
    return ['personal'];
  }
}

// ─── Task Completion Rate ─────────────────────────────────────────────────────
async function getTaskCompletionRate(userId, timezone = 'Africa/Cairo') {
  try {
    const { Task } = getModels();
    if (!Task) return null;

    const { Op } = require('sequelize');
    const since  = moment().tz(timezone).subtract(30, 'days').toDate();

    const [total, completed] = await Promise.all([
      Task.count({
        where: { user_id: userId, created_at: { [Op.gte]: since } },
      }),
      Task.count({
        where: { user_id: userId, status: 'completed', created_at: { [Op.gte]: since } },
      }),
    ]);

    if (total === 0) return null;
    return Math.round((completed / total) * 100);
  } catch (err) {
    logger.debug('[PERSONALIZATION] getTaskCompletionRate error:', err.message);
    return null;
  }
}

// ─── Average Mood/Energy ──────────────────────────────────────────────────────
async function getAverages(userId, timezone = 'Africa/Cairo') {
  try {
    const { MoodEntry, EnergyLog } = getModels();
    const { Op } = require('sequelize');
    const since = moment().tz(timezone).subtract(14, 'days').format('YYYY-MM-DD');

    const [moods, energies] = await Promise.all([
      MoodEntry
        ? MoodEntry.findAll({
            where: { user_id: userId, entry_date: { [Op.gte]: since } },
            attributes: ['mood_score'],
            raw: true,
          })
        : [],
      EnergyLog
        ? EnergyLog.findAll({
            where: { user_id: userId },
            attributes: ['energy_score'],
            raw: true,
            limit: 14,
            order: [['log_date', 'DESC']],
          })
        : [],
    ]);

    const avgMood   = moods.length   ? Math.round(moods.reduce((s, m) => s + m.mood_score, 0) / moods.length * 10) / 10 : null;
    const avgEnergy = energies.length ? Math.round(energies.reduce((s, e) => s + e.energy_score, 0) / energies.length) : null;

    return { avgMood, avgEnergy };
  } catch (err) {
    logger.debug('[PERSONALIZATION] getAverages error:', err.message);
    return { avgMood: null, avgEnergy: null };
  }
}

// ─── Main: Build User Profile ─────────────────────────────────────────────────
/**
 * Build a complete personalization profile for a user.
 * Uses real DB data + memory patterns.
 *
 * @param {string} userId
 * @param {string} timezone
 * @returns {object} profile
 */
async function buildProfile(userId, timezone = 'Africa/Cairo') {
  try {
    // Run all detections in parallel
    const [focusHours, stressTriggers, topCategories, completionRate, averages] = await Promise.all([
      detectFocusHours(userId, timezone),
      detectStressTriggers(userId, timezone),
      detectTopCategories(userId),
      getTaskCompletionRate(userId, timezone),
      getAverages(userId, timezone),
    ]);

    const productivityPeaks = classifyProductivityPeak(focusHours);

    // Determine preferred verbosity from memory
    const memProfile   = memory.getLongTerm(userId);
    const verbosity    = memProfile.preferences.verbosity || 'normal';
    const tone         = memProfile.preferences.preferredTone || 'supportive';

    // Confidence: more data = higher confidence
    const dataPoints = (focusHours.length > 0 ? 1 : 0) +
                       (stressTriggers.length > 0 ? 1 : 0) +
                       (completionRate !== null ? 1 : 0) +
                       (averages.avgMood !== null ? 1 : 0);
    const confidence = dataPoints >= 3 ? 'high' : dataPoints >= 1 ? 'medium' : 'low';

    const profile = {
      userId,
      focusHours,
      productivityPeaks,
      stressTriggers,
      topCategories,
      preferredTone     : tone,
      preferredVerbosity: verbosity,
      taskCompletionRate: completionRate,
      avgMood           : averages.avgMood,
      avgEnergy         : averages.avgEnergy,
      profileConfidence : confidence,
      generatedAt       : new Date().toISOString(),
    };

    // Update memory long-term with detected patterns
    if (focusHours.length > 0) {
      for (const h of focusHours) {
        memory.recordFocusEvent(userId, h, 2);
      }
    }

    logger.debug('[PERSONALIZATION] Profile built', { userId, confidence, focusHours });
    return profile;

  } catch (err) {
    logger.error('[PERSONALIZATION] buildProfile error:', err.message);
    return defaultProfile(userId);
  }
}

// ─── Context Block Builder ────────────────────────────────────────────────────
/**
 * Build a context string for injection into AI prompts.
 */
function buildPersonalizationBlock(profile, userContext = null) {
  if (!profile) return '';

  const parts = [];

  // ── User profile data (from ProfileView) ──────────────────────────
  const ctx = userContext?.profile;
  if (ctx) {
    const roleLabels = { student: 'طالب', employee: 'موظف', freelancer: 'عمل حر', entrepreneur: 'رائد أعمال', parent: 'والد/ة' };
    if (ctx.role) parts.push(`👤 الدور: ${roleLabels[ctx.role] || ctx.role}`);
    if (ctx.focus_areas?.length > 0) {
      const areaLabels = { work: 'العمل', study: 'الدراسة', fitness: 'اللياقة', health: 'الصحة', creativity: 'الإبداع', social: 'العلاقات', finance: 'المالية' };
      parts.push(`🎯 مجالات التركيز: ${ctx.focus_areas.map(a => areaLabels[a] || a).join(', ')}`);
    }
    const workTimeLabels = { early_morning: 'الفجر', morning: 'الصباح', afternoon: 'الظهر', evening: 'المساء', night: 'الليل' };
    if (ctx.preferred_work_time) parts.push(`🕐 وقت العمل المفضل: ${workTimeLabels[ctx.preferred_work_time] || ctx.preferred_work_time}`);
    const energyLabels = { very_low: 'منخفضة جداً', low: 'منخفضة', medium: 'متوسطة', high: 'عالية', very_high: 'عالية جداً' };
    if (ctx.energy_level) parts.push(`🔋 مستوى الطاقة: ${energyLabels[ctx.energy_level] || ctx.energy_level}`);
    if (ctx.weekly_goals?.length > 0) parts.push(`📌 أهداف أسبوعية: ${ctx.weekly_goals.join(' | ')}`);
    if (ctx.monthly_goals?.length > 0) parts.push(`🗓️ أهداف شهرية: ${ctx.monthly_goals.join(' | ')}`);
  }

  // ── AI settings (from SettingsView) ───────────────────────────────
  const settings = userContext?.settings;
  if (settings) {
    const interventionLabels = { low: 'منخفض (فقط عند الطلب)', medium: 'متوسط (اقتراحات ذكية)', high: 'عالي (استباقي نشط)' };
    if (settings.ai_intervention_level) parts.push(`🤖 مستوى التدخل: ${interventionLabels[settings.ai_intervention_level] || settings.ai_intervention_level}`);
    const styleLabels = { minimal: 'مختصر', balanced: 'متوازن', proactive: 'مفصّل' };
    if (settings.recommendation_style) parts.push(`💡 أسلوب التوصيات: ${styleLabels[settings.recommendation_style] || settings.recommendation_style}`);
    if (settings.auto_reschedule) parts.push('🔄 إعادة الجدولة التلقائية: مفعّل');
  }

  // ── Computed patterns (from AI analysis) ──────────────────────────
  if (profile.focusHours?.length > 0) {
    parts.push(`⏰ أفضل أوقات التركيز: ${profile.focusHours.map(h => `${h}:00`).join(', ')}`);
  }

  if (profile.avgMood) {
    parts.push(`😊 متوسط المزاج (14 يوم): ${profile.avgMood}/10`);
  }

  if (profile.avgEnergy) {
    parts.push(`⚡ متوسط الطاقة: ${profile.avgEnergy}/100`);
  }

  if (profile.taskCompletionRate !== null) {
    parts.push(`✅ معدل إنجاز المهام: ${profile.taskCompletionRate}%`);
  }

  if (profile.stressTriggers?.length > 0) {
    const triggerLabels = {
      overdue_tasks    : 'مهام متأخرة',
      frequent_low_mood: 'مزاج منخفض متكرر',
      high_urgent_load : 'ضغط مهام عاجلة',
    };
    const labels = profile.stressTriggers.map(t => triggerLabels[t] || t);
    parts.push(`⚠️ مثيرات الضغط: ${labels.join(', ')}`);
  }

  return parts.join('\n');
}

module.exports = {
  buildProfile,
  detectFocusHours,
  detectStressTriggers,
  detectTopCategories,
  getTaskCompletionRate,
  getAverages,
  buildPersonalizationBlock,
  defaultProfile,
};
