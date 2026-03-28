/**
 * Daily Plan Generator Service — Phase 11 (AI Life Copilot)
 * ===========================================================
 * Generates fully AI-driven daily plans that adapt to the user's
 * current energy level, pending tasks, habits, mood, and goals.
 * Produces a time-blocked schedule with natural-language explanations.
 */

'use strict';

const moment = require('moment-timezone');
const logger  = require('../utils/logger');

function getModels() {
  const Task    = require('../models/task.model');
  const { Habit } = require('../models/habit.model');
  const EnergyLog = require('../models/energy_log.model');
  const Goal    = require('../models/goal.model');
  return { Task, Habit, EnergyLog, Goal };
}

const BLOCK_TYPES = {
  DEEP_WORK:   { type: 'deep_work',   label: 'عمل عميق',     color: '#3B82F6', min_energy: 65 },
  TASK:        { type: 'task',        label: 'مهمة',          color: '#8B5CF6', min_energy: 40 },
  HABIT:       { type: 'habit',       label: 'عادة',          color: '#10B981', min_energy: 20 },
  BREAK:       { type: 'break',       label: 'استراحة',       color: '#F59E0B', min_energy: 0  },
  REVIEW:      { type: 'review',      label: 'مراجعة',        color: '#6B7280', min_energy: 30 },
  MEETING:     { type: 'meeting',     label: 'اجتماع',        color: '#EF4444', min_energy: 40 },
  LEARNING:    { type: 'learning',    label: 'تعلّم',          color: '#06B6D4', min_energy: 55 },
  EXERCISE:    { type: 'exercise',    label: 'رياضة',         color: '#F97316', min_energy: 0  },
  MORNING:     { type: 'morning',     label: 'روتين صباحي',   color: '#FCD34D', min_energy: 0  },
  EVENING:     { type: 'evening',     label: 'روتين مسائي',   color: '#7C3AED', min_energy: 0  },
};

// Circadian energy curve: hour → energy multiplier (0-100 baseline)
const ENERGY_CURVE = {
  5:30, 6:40, 7:55, 8:70, 9:85, 10:90, 11:88,
  12:75, 13:65, 14:60, 15:70, 16:78, 17:80,
  18:72, 19:68, 20:60, 21:50, 22:40, 23:30,
};

function getHourlyEnergy(hour, baseEnergy) {
  const curve = ENERGY_CURVE[hour] || 50;
  return Math.round((curve / 100) * baseEnergy);
}

function hourLabel(h) {
  const period = h < 12 ? 'ص' : 'م';
  const display = h <= 12 ? h : h - 12;
  return `${display}:00 ${period}`;
}

function buildMorningBlock(startHour) {
  return {
    hour: startHour,
    time_label: hourLabel(startHour),
    type: BLOCK_TYPES.MORNING.type,
    label: BLOCK_TYPES.MORNING.label,
    title: 'الروتين الصباحي',
    description: 'تمرين خفيف، فطور، مراجعة أهداف اليوم',
    duration_minutes: 45,
    color: BLOCK_TYPES.MORNING.color,
    energy_match: 80,
  };
}

function buildBreakBlock(hour, reason = '') {
  return {
    hour,
    time_label: hourLabel(hour),
    type: BLOCK_TYPES.BREAK.type,
    label: BLOCK_TYPES.BREAK.label,
    title: reason || 'استراحة',
    description: 'خذ نفساً، تمدد، شرب ماء',
    duration_minutes: 15,
    color: BLOCK_TYPES.BREAK.color,
    energy_match: 90,
  };
}

function buildReviewBlock(hour) {
  return {
    hour,
    time_label: hourLabel(hour),
    type: BLOCK_TYPES.REVIEW.type,
    label: BLOCK_TYPES.REVIEW.label,
    title: 'مراجعة اليوم',
    description: 'مراجعة المنجزات، تحديث المهام، التخطيط للغد',
    duration_minutes: 20,
    color: BLOCK_TYPES.REVIEW.color,
    energy_match: 85,
  };
}

function prioritizeTask(task) {
  const map = { urgent: 4, high: 3, medium: 2, low: 1 };
  return map[task.priority] || 1;
}

/**
 * generateAdaptivePlan(userId, timezone, date)
 * Generates a full AI-driven daily plan.
 */
async function generateAdaptivePlan(userId, timezone = 'Africa/Cairo', date = null) {
  try {
    const { Task, Habit, EnergyLog, Goal } = getModels();
    const { Op } = require('sequelize');

    const targetDate = date ? moment.tz(date, timezone) : moment.tz(timezone);
    const dayStart   = targetDate.clone().startOf('day').toDate();
    const dayEnd     = targetDate.clone().endOf('day').toDate();

    // Fetch data
    const [pendingTasks, habits, energyLogs, goals] = await Promise.all([
      Task.findAll({
        where: {
          user_id: userId,
          status: { [Op.in]: ['pending', 'in_progress'] },
        },
        order: [['priority', 'ASC'], ['due_date', 'ASC']],
        raw: true,
        limit: 10,
      }),
      Habit.findAll({ where: { user_id: userId, is_active: true }, raw: true, limit: 5 }),
      EnergyLog.findAll({ where: { user_id: userId }, raw: true, order: [['log_date', 'DESC']], limit: 3 }),
      Goal.findAll({ where: { user_id: userId, status: 'active' }, raw: true, limit: 3 }),
    ]);

    // Determine base energy
    const avgEnergy = energyLogs.length > 0
      ? Math.round(energyLogs.reduce((s, e) => s + (e.energy_score || 55), 0) / energyLogs.length)
      : 60;

    const schedule = [];
    let taskIndex = 0;
    let habitIndex = 0;

    // Sort tasks by priority
    const sortedTasks = [...pendingTasks].sort((a, b) => prioritizeTask(b) - prioritizeTask(a));

    // Morning routine 7am
    schedule.push(buildMorningBlock(7));

    // Build blocks 8am-22pm
    for (let hour = 8; hour <= 22; hour++) {
      const hourlyEnergy = getHourlyEnergy(hour, avgEnergy);

      // Break at lunch and mid-afternoon
      if (hour === 12) {
        schedule.push({
          hour,
          time_label: hourLabel(hour),
          type: BLOCK_TYPES.BREAK.type,
          label: 'استراحة الغداء',
          title: 'استراحة الغداء',
          description: 'وجبة منتظمة وراحة',
          duration_minutes: 60,
          color: BLOCK_TYPES.BREAK.color,
          energy_match: 95,
        });
        continue;
      }

      if (hour === 15) {
        schedule.push(buildBreakBlock(hour, 'استراحة العصر'));
        continue;
      }

      if (hour === 21) {
        // Habits in the evening
        if (habitIndex < habits.length) {
          const habit = habits[habitIndex++];
          schedule.push({
            hour,
            time_label: hourLabel(hour),
            type: BLOCK_TYPES.HABIT.type,
            label: BLOCK_TYPES.HABIT.label,
            title: habit.name || habit.title || 'عادة يومية',
            description: `ممارسة العادة اليومية: ${habit.name || habit.title || ''}`,
            duration_minutes: habit.duration_minutes || 20,
            color: BLOCK_TYPES.HABIT.color,
            energy_match: 80,
          });
        } else {
          schedule.push(buildReviewBlock(hour));
        }
        continue;
      }

      if (hour === 22) {
        schedule.push({
          hour,
          time_label: hourLabel(hour),
          type: BLOCK_TYPES.EVENING.type,
          label: BLOCK_TYPES.EVENING.label,
          title: 'الروتين المسائي',
          description: 'قراءة، تأمل، تحضير للنوم',
          duration_minutes: 30,
          color: BLOCK_TYPES.EVENING.color,
          energy_match: 85,
        });
        continue;
      }

      // Deep work windows: 9-11am and 4-6pm
      if ((hour >= 9 && hour <= 11) || (hour >= 16 && hour <= 18)) {
        if (taskIndex < sortedTasks.length && hourlyEnergy >= 50) {
          const task = sortedTasks[taskIndex++];
          schedule.push({
            hour,
            time_label: hourLabel(hour),
            type: hour <= 11 ? BLOCK_TYPES.DEEP_WORK.type : BLOCK_TYPES.TASK.type,
            label: hour <= 11 ? BLOCK_TYPES.DEEP_WORK.label : BLOCK_TYPES.TASK.label,
            title: task.title,
            description: task.description || `مهمة بأولوية ${task.priority}`,
            duration_minutes: task.estimated_duration || 60,
            priority: task.priority,
            task_id: task.id,
            color: hour <= 11 ? BLOCK_TYPES.DEEP_WORK.color : BLOCK_TYPES.TASK.color,
            energy_match: Math.round((hourlyEnergy / avgEnergy) * 95),
          });
          continue;
        }
      }

      // Morning habit slot at 8am
      if (hour === 8 && habitIndex < habits.length) {
        const habit = habits[habitIndex++];
        schedule.push({
          hour,
          time_label: hourLabel(hour),
          type: BLOCK_TYPES.HABIT.type,
          label: BLOCK_TYPES.HABIT.label,
          title: habit.name || habit.title || 'عادة صباحية',
          description: `ممارسة العادة: ${habit.name || habit.title || ''}`,
          duration_minutes: habit.duration_minutes || 20,
          color: BLOCK_TYPES.HABIT.color,
          energy_match: 85,
        });
        continue;
      }

      // Remaining tasks in other slots
      if (taskIndex < sortedTasks.length && hourlyEnergy >= 35) {
        const task = sortedTasks[taskIndex++];
        schedule.push({
          hour,
          time_label: hourLabel(hour),
          type: BLOCK_TYPES.TASK.type,
          label: BLOCK_TYPES.TASK.label,
          title: task.title,
          description: task.description || '',
          duration_minutes: task.estimated_duration || 45,
          priority: task.priority,
          task_id: task.id,
          color: BLOCK_TYPES.TASK.color,
          energy_match: Math.round((hourlyEnergy / avgEnergy) * 90),
        });
      } else if (hourlyEnergy < 35) {
        schedule.push(buildBreakBlock(hour, 'استراحة للتجدد'));
      } else {
        // Learning or buffer
        schedule.push({
          hour,
          time_label: hourLabel(hour),
          type: BLOCK_TYPES.LEARNING.type,
          label: BLOCK_TYPES.LEARNING.label,
          title: 'وقت للتعلم والتطوير',
          description: 'قراءة، مقالات، بودكاست تطويري',
          duration_minutes: 30,
          color: BLOCK_TYPES.LEARNING.color,
          energy_match: 75,
        });
      }
    }

    // Stats
    const taskBlocks = schedule.filter(b => ['task', 'deep_work'].includes(b.type));
    const totalWorkMinutes = taskBlocks.reduce((s, b) => s + (b.duration_minutes || 0), 0);
    const avgEnergyMatch = schedule.length > 0
      ? Math.round(schedule.reduce((s, b) => s + (b.energy_match || 0), 0) / schedule.length)
      : 80;

    // Focus windows (high energy hours)
    const focusWindows = schedule
      .filter(b => b.type === 'deep_work')
      .map(b => ({ hour: b.hour, label: b.time_label, energy: getHourlyEnergy(b.hour, avgEnergy) }));

    // AI explanation
    const explanation = buildPlanExplanation(avgEnergy, taskBlocks.length, goals.length);

    return {
      date: targetDate.format('YYYY-MM-DD'),
      base_energy: avgEnergy,
      schedule: schedule.sort((a, b) => a.hour - b.hour),
      focus_windows: focusWindows,
      stats: {
        total_blocks: schedule.length,
        task_blocks:  taskBlocks.length,
        scheduled_tasks: taskBlocks.length,
        work_minutes: totalWorkMinutes,
        avg_energy_match: avgEnergyMatch,
        breaks: schedule.filter(b => b.type === 'break').length,
      },
      energy_curve: Object.entries(ENERGY_CURVE)
        .filter(([h]) => parseInt(h) >= 7 && parseInt(h) <= 22)
        .map(([h, v]) => ({ hour: parseInt(h), energy: Math.round((v / 100) * avgEnergy) })),
      explanation,
      goals_tracked: goals.map(g => ({ id: g.id, title: g.title, progress: g.progress })),
      warnings: buildWarnings(avgEnergy, pendingTasks.length),
    };
  } catch (err) {
    logger.error('daily plan generator error:', err.message);
    throw err;
  }
}

function buildPlanExplanation(energy, taskCount, goalCount) {
  const level = energy >= 70 ? 'عالية' : energy >= 45 ? 'متوسطة' : 'منخفضة';
  return `تم إنشاء خطة اليوم بناءً على طاقتك الحالية ${level} (${energy}/100). ` +
    `تم جدولة ${taskCount} مهمة في الأوقات المثلى. ` +
    (goalCount > 0 ? `المخطط يتماشى مع ${goalCount} أهداف نشطة لديك.` : '');
}

function buildWarnings(energy, pendingCount) {
  const warnings = [];
  if (energy < 40) warnings.push({ type: 'low_energy', message: 'طاقتك منخفضة — أضفنا استراحات إضافية', severity: 'warning' });
  if (pendingCount > 8) warnings.push({ type: 'overloaded', message: `لديك ${pendingCount} مهمة معلقة — فكر في تفويض بعضها`, severity: 'warning' });
  return warnings;
}

// ── CONSOLIDATION NOTE (Phase 5) ─────────────────────────────────────────
// dayplanner.service.js is the single planning authority.
// This module delegates to it when available, falling back to its own logic.
async function generateAdaptivePlanUnified(userId, timezone = 'Africa/Cairo', date = null) {
  try {
    const dayPlanner = require('./dayplanner.service');
    const plan = await dayPlanner.buildDayPlan(userId, timezone, date);
    // Transform to match the generateAdaptivePlan output shape
    return {
      ...plan,
      // Compat fields for adaptive.routes
      explanation: plan.mood_adjustments?.recommendation || 'خطة يومية محسّنة',
      goals_tracked: plan.goals?.active || [],
    };
  } catch (_e) {
    // Fallback to original implementation
    return generateAdaptivePlan(userId, timezone, date);
  }
}

module.exports = {
  generateAdaptivePlan: generateAdaptivePlanUnified,
  BLOCK_TYPES,
  ENERGY_CURVE,
};
