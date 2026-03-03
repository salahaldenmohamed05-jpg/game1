/**
 * Procrastination Detection Service
 * ===================================
 * Analyzes task patterns to detect:
 * - Repeated rescheduling (≥2 times)
 * - Tasks untouched for 3+ days
 * - Category-based avoidance patterns
 * - Suggests optimal timing & task breakdown
 */

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

const getModels = () => ({
  Task:          require('../models/task.model'),
  BehavioralFlag: require('../models/behavioral_flag.model'),
  EnergyProfile:  require('../models/energy_profile.model'),
});

// Thresholds
const RESCHEDULE_THRESHOLD  = 2;  // flag after 2+ reschedules
const AVOIDANCE_DAYS        = 3;  // flag if not touched in 3 days
const OVERCOMMIT_DAILY_MAX  = 7;  // flag if >7 high-priority tasks

// ─────────────────────────────────────────────────────────────────────────────
// MAIN DETECTION FUNCTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Scan all active tasks for behavioral flags and save them.
 * @param {string} userId
 * @param {string} timezone
 * @returns {BehavioralFlag[]} newly created or updated flags
 */
async function detectProcrastination(userId, timezone = 'Africa/Cairo') {
  const { Task, BehavioralFlag, EnergyProfile } = getModels();

  const tz    = timezone || 'Africa/Cairo';
  const now   = moment.tz(tz);
  const today = now.format('YYYY-MM-DD');

  try {
    const tasks = await Task.findAll({
      where: {
        user_id: userId,
        status:  { [Op.in]: ['pending', 'in_progress'] },
      },
    });

    const energyProfile = await EnergyProfile.findOne({ where: { user_id: userId } });
    const peakHours     = energyProfile?.peak_hours || [9, 10, 11];

    const newFlags = [];

    for (const task of tasks) {
      // ── Procrastination: rescheduled ≥2 times ─────────────────────────────
      if ((task.reschedule_count || 0) >= RESCHEDULE_THRESHOLD) {
        const flag = await upsertFlag(userId, {
          flag_type:    'procrastination',
          severity:     task.reschedule_count >= 4 ? 'high' : 'medium',
          entity_type:  'task',
          entity_id:    task.id,
          entity_title: task.title,
          description:  `تم تأجيل المهمة "${task.title}" ${task.reschedule_count} مرات`,
          ai_recommendation: buildProcrastinationAdvice(task),
          sub_steps:    generateSubSteps(task),
          suggested_time: suggestOptimalTime(task, peakHours),
          suggested_day:  suggestBestDay(),
          occurrence_count: task.reschedule_count,
        });
        if (flag) newFlags.push(flag);
      }

      // ── Avoidance: untouched for 3+ days ──────────────────────────────────
      if (task.updatedAt) {
        const daysSinceTouch = now.diff(moment(task.updatedAt), 'days');
        if (daysSinceTouch >= AVOIDANCE_DAYS) {
          const flag = await upsertFlag(userId, {
            flag_type:    'avoidance',
            severity:     daysSinceTouch >= 7 ? 'high' : 'medium',
            entity_type:  'task',
            entity_id:    task.id,
            entity_title: task.title,
            description:  `المهمة "${task.title}" لم تُلمس منذ ${daysSinceTouch} أيام`,
            ai_recommendation: `قسّم هذه المهمة إلى خطوة واحدة صغيرة وابدأها الآن. الخطوة الأولى دائماً هي الأصعب.`,
            sub_steps:    generateSubSteps(task),
            suggested_time: suggestOptimalTime(task, peakHours),
            occurrence_count: daysSinceTouch,
          });
          if (flag) newFlags.push(flag);
        }
      }

      // ── Energy mismatch: scheduled in low-energy window ───────────────────
      if (task.due_date && energyProfile?.data_points >= 7) {
        const scheduledHour = new Date(task.due_date).getHours();
        const hourlyComp    = energyProfile.hourly_task_completions || new Array(24).fill(0);
        const maxHourlyComp = Math.max(...hourlyComp);
        if (maxHourlyComp > 0 && (hourlyComp[scheduledHour] || 0) < maxHourlyComp * 0.3) {
          const flag = await upsertFlag(userId, {
            flag_type:    'energy_mismatch',
            severity:     'low',
            entity_type:  'task',
            entity_id:    task.id,
            entity_title: task.title,
            description:  `المهمة "${task.title}" مجدولة في وقت منخفض الطاقة`,
            ai_recommendation: `انقل هذه المهمة إلى ساعة ${formatHour(peakHours[0])} — وقت ذروة إنتاجيتك`,
            suggested_time: suggestOptimalTime(task, peakHours),
            occurrence_count: 1,
          });
          if (flag) newFlags.push(flag);
        }
      }
    }

    // ── Overcommitment: too many high-priority tasks today ─────────────────
    const todayTasks  = tasks.filter(t => {
      if (!t.due_date) return false;
      return moment(t.due_date).format('YYYY-MM-DD') === today;
    });
    const highPriTasks = todayTasks.filter(t => t.priority === 'high' || t.priority === 'urgent');

    if (highPriTasks.length > OVERCOMMIT_DAILY_MAX) {
      const flag = await upsertFlag(userId, {
        flag_type:    'overcommitment',
        severity:     'high',
        entity_type:  null,
        entity_id:    null,
        entity_title: null,
        description:  `لديك ${highPriTasks.length} مهام عالية الأولوية اليوم — هذا كثير جداً`,
        ai_recommendation: `اختر أهم 3 مهام عالية الأولوية وحرّك الباقي لغد أو الأسبوع القادم.`,
        occurrence_count: highPriTasks.length,
      });
      if (flag) newFlags.push(flag);
    }

    logger.info(`🚩 Procrastination scan for user ${userId}: ${newFlags.length} flags`);
    return newFlags;

  } catch (error) {
    logger.error('Procrastination detection error:', error.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET FLAGS
// ─────────────────────────────────────────────────────────────────────────────

async function getActiveFlags(userId, limit = 20) {
  const { BehavioralFlag } = getModels();
  return BehavioralFlag.findAll({
    where: {
      user_id:      userId,
      is_resolved:  false,
      is_dismissed: false,
    },
    order:  [['createdAt', 'DESC']],
    limit,
  });
}

async function resolveFlag(flagId, userId) {
  const { BehavioralFlag } = getModels();
  const flag = await BehavioralFlag.findOne({ where: { id: flagId, user_id: userId } });
  if (!flag) throw new Error('Flag not found');
  await flag.update({ is_resolved: true, resolved_at: new Date() });
  return flag;
}

async function dismissFlag(flagId, userId) {
  const { BehavioralFlag } = getModels();
  const flag = await BehavioralFlag.findOne({ where: { id: flagId, user_id: userId } });
  if (!flag) throw new Error('Flag not found');
  await flag.update({ is_dismissed: true });
  return flag;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

async function upsertFlag(userId, data) {
  const { BehavioralFlag } = getModels();
  try {
    // Check if same flag type + entity already exists
    const existing = data.entity_id
      ? await BehavioralFlag.findOne({
          where: {
            user_id:      userId,
            flag_type:    data.flag_type,
            entity_id:    data.entity_id,
            is_resolved:  false,
            is_dismissed: false,
          }
        })
      : await BehavioralFlag.findOne({
          where: {
            user_id:    userId,
            flag_type:  data.flag_type,
            is_resolved: false,
            is_dismissed: false,
          }
        });

    if (existing) {
      await existing.update({
        ...data,
        occurrence_count: (existing.occurrence_count || 1) + 1,
      });
      return existing;
    }

    return BehavioralFlag.create({ user_id: userId, ...data });
  } catch (err) {
    logger.error('upsertFlag error:', err.message);
    return null;
  }
}

function generateSubSteps(task) {
  const title = task.title || '';
  // Heuristic: break title into verb + noun sub-steps
  const steps = [
    `اجلس 5 دقائق وراجع ما تحتاجه لبدء "${title}"`,
    `ابدأ بأول خطوة صغيرة فقط — لا تفكر في الإنهاء الكامل`,
    `ضع مؤقتاً 25 دقيقة للتركيز على "${title}" فقط`,
  ];

  if (task.description) {
    steps.unshift(`اقرأ وصف المهمة: "${task.description?.slice(0, 60)}..."`);
  }
  return steps.slice(0, 3);
}

function buildProcrastinationAdvice(task) {
  const count = task.reschedule_count;
  if (count >= 5) {
    return `هذه المهمة مؤجلة ${count} مرات — اسأل نفسك: هل هي ضرورية؟ إذا نعم، قسّمها إلى خطوة واحدة وابدأها الآن.`;
  }
  return `قسّم "${task.title}" إلى 3 خطوات صغيرة وجدول الخطوة الأولى لغداً الصباح.`;
}

function suggestOptimalTime(task, peakHours) {
  if (task.priority === 'high' || task.priority === 'urgent') {
    return formatHour(peakHours[0] || 9);
  }
  return formatHour(peakHours[1] || 10);
}

function suggestBestDay() {
  // Suggest next Monday or Tuesday (fresh start days)
  const next = moment().day() <= 1 ? moment().day(2) : moment().add(1, 'week').day(1);
  return next.format('YYYY-MM-DD');
}

function formatHour(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

module.exports = {
  detectProcrastination,
  getActiveFlags,
  resolveFlag,
  dismissFlag,
};
