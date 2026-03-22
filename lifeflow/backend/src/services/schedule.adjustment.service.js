/**
 * Schedule Adjustment Service — Phase 12
 * =========================================
 * Dynamically adjusts existing schedules based on real-time context:
 * mood changes, energy dips, unexpected tasks, overload detection.
 */

'use strict';

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

function getModels() {
  const Task    = require('../models/task.model');
  const EnergyLog = require('../models/energy_log.model');
  const MoodEntry = require('../models/mood.model');
  const DayPlan = require('../models/day_plan.model');
  return { Task, EnergyLog, MoodEntry, DayPlan };
}

const ADJUSTMENT_REASONS = {
  LOW_ENERGY:     'low_energy',
  MOOD_DROP:      'mood_drop',
  TASK_ADDED:     'task_added',
  OVERLOADED:     'overloaded',
  MISSED_BLOCK:   'missed_block',
  CONTEXT_CHANGE: 'context_change',
};

/**
 * suggestAdjustments(userId, currentSchedule, context, timezone)
 * Analyzes the current state and suggests schedule modifications.
 */
async function suggestAdjustments(userId, currentSchedule = [], context = {}, timezone = 'Africa/Cairo') {
  try {
    const { Task, EnergyLog, MoodEntry } = getModels();
    const since3h = moment.tz(timezone).subtract(3, 'hours').toDate();

    const [recentEnergy, recentMood, urgentTasks] = await Promise.all([
      EnergyLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: since3h } }, raw: true, limit: 1, order: [['log_date','DESC']] }),
      MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: since3h } }, raw: true, limit: 1, order: [['entry_date','DESC']] }),
      Task.findAll({ where: { user_id: userId, status: 'pending', priority: 'urgent' }, raw: true, limit: 3 }),
    ]);

    const currentHour = moment.tz(timezone).hour();
    const currentEnergy = recentEnergy[0]?.energy_score || context.energy || 60;
    const currentMood   = recentMood[0]?.mood_score || recentMood[0]?.score || context.mood || 5;

    const adjustments = [];
    const rescheduled = [];

    // Detect energy drop
    if (currentEnergy < 40) {
      adjustments.push({
        type: ADJUSTMENT_REASONS.LOW_ENERGY,
        severity: 'high',
        message: `طاقتك منخفضة (${currentEnergy}/100) — نقترح تأجيل المهام الصعبة`,
        suggestions: [
          'أضف استراحة 20 دقيقة الآن',
          'أرجئ أصعب مهمة لوقت لاحق',
          'ركز على مهام بسيطة للآن',
        ],
      });

      // Reschedule heavy tasks
      currentSchedule
        .filter(b => b.hour >= currentHour && b.type === 'deep_work')
        .forEach(b => {
          rescheduled.push({
            original_hour: b.hour,
            new_hour: Math.min(22, b.hour + 2),
            title: b.title,
            reason: 'طاقة منخفضة',
          });
        });
    }

    // Detect mood drop
    if (currentMood < 4) {
      adjustments.push({
        type: ADJUSTMENT_REASONS.MOOD_DROP,
        severity: 'medium',
        message: `مزاجك منخفض اليوم (${currentMood}/10) — نقترح تعديل الجدول`,
        suggestions: [
          'ابدأ بمهمة سهلة لبناء الزخم',
          'خذ استراحة قصيرة ومشي خفيف',
          'تجنب الاجتماعات المهمة الآن إن أمكن',
        ],
      });
    }

    // Detect urgency overload
    if (urgentTasks.length >= 3) {
      adjustments.push({
        type: ADJUSTMENT_REASONS.OVERLOADED,
        severity: 'high',
        message: `لديك ${urgentTasks.length} مهام عاجلة غير مجدولة`,
        suggestions: urgentTasks.slice(0, 3).map(t => `جدول "${t.title}" في أقرب وقت`),
      });
    }

    // Build adjusted schedule
    const adjustedSchedule = applyAdjustments(currentSchedule, adjustments, currentHour, currentEnergy);

    return {
      current_hour: currentHour,
      current_energy: currentEnergy,
      current_mood: currentMood,
      adjustments_needed: adjustments.length > 0,
      adjustments,
      rescheduled,
      adjusted_schedule: adjustedSchedule,
      adjustment_summary: adjustments.length > 0
        ? `${adjustments.length} تعديل مقترح على جدولك`
        : 'جدولك يسير بشكل مثالي الآن 👍',
    };
  } catch (err) {
    logger.error('schedule adjustment error:', err.message);
    throw err;
  }
}

function applyAdjustments(schedule, adjustments, currentHour, energy) {
  if (adjustments.length === 0 || schedule.length === 0) return schedule;

  return schedule.map(block => {
    if (block.hour < currentHour) return { ...block, status: 'past' };
    if (block.hour === currentHour) return { ...block, status: 'current' };

    // If energy is very low, mark deep_work blocks as rescheduled
    const lowEnergyAdj = adjustments.find(a => a.type === ADJUSTMENT_REASONS.LOW_ENERGY);
    if (lowEnergyAdj && block.type === 'deep_work' && energy < 40) {
      return { ...block, status: 'suggested_reschedule', note: 'يُفضَّل تأجيله' };
    }

    return { ...block, status: 'upcoming' };
  });
}

/**
 * getSmartRescheduleSuggestion(userId, taskId, timezone)
 * Suggests the best time to reschedule a specific task.
 */
async function getSmartRescheduleSuggestion(userId, taskId, timezone = 'Africa/Cairo') {
  try {
    const { Task, EnergyLog } = getModels();
    const [task, energyLogs] = await Promise.all([
      Task.findOne({ where: { id: taskId, user_id: userId }, raw: true }),
      EnergyLog.findAll({ where: { user_id: userId }, raw: true, order: [['log_date','DESC']], limit: 7 }),
    ]);

    if (!task) throw new Error('المهمة غير موجودة');

    const avgEnergy = energyLogs.length > 0
      ? energyLogs.reduce((s, e) => s + (e.energy_score || 55), 0) / energyLogs.length
      : 60;

    const isPriorityHigh = ['urgent', 'high'].includes(task.priority);

    // Recommend best time slot based on energy patterns
    const bestSlots = isPriorityHigh
      ? [{ hour: 9, label: '9:00 ص — أفضل وقت للعمل العميق' }, { hour: 10, label: '10:00 ص — طاقة عالية' }]
      : [{ hour: 14, label: '2:00 م — مناسب للمهام المتوسطة' }, { hour: 16, label: '4:00 م — طاقة متجددة' }];

    return {
      task_id: taskId,
      task_title: task.title,
      priority: task.priority,
      avg_user_energy: Math.round(avgEnergy),
      recommended_slots: bestSlots,
      reasoning: `بناءً على أنماط طاقتك (${Math.round(avgEnergy)}/100) ومستوى أولوية المهمة`,
    };
  } catch (err) {
    logger.error('reschedule suggestion error:', err.message);
    throw err;
  }
}

module.exports = {
  suggestAdjustments,
  getSmartRescheduleSuggestion,
  ADJUSTMENT_REASONS,
};
