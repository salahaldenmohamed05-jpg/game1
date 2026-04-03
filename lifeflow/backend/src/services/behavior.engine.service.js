/**
 * Behavior Engine Service v1.0
 * ═════════════════════════════════════════════════════
 * Core behavior loop: Trigger → Action → Feedback → Adapt
 *
 * Responsibilities:
 *   1. Load behavior candidates for execution (habits with behavior_spec)
 *   2. Adapt difficulty based on completion/skip patterns
 *   3. Detect resistance patterns and classify them
 *   4. Detect and handle bad habits (breaking habits)
 *   5. Score behavior candidates for the decision engine
 *   6. Generate behavior-level context for the execution screen
 *
 * Integration:
 *   Goal → Behavior → Task → Execution Engine
 *   Behavior Engine is consumed by:
 *     - unified.decision.service.js (scoring candidates)
 *     - engine.routes.js (goal_context + behavior_context in responses)
 *     - ExecutionScreen (difficulty badge, goal linkage)
 */

'use strict';

const moment = require('moment-timezone');
const logger = require('../utils/logger');

function getModels() {
  try {
    const { Habit, HabitLog } = require('../models/habit.model');
    const Goal = require('../models/goal.model');
    const Task = require('../models/task.model');
    const { sequelize } = require('../config/database');
    return { Habit, HabitLog, Goal, Task, sequelize };
  } catch (e) {
    logger.debug('[BEHAVIOR-ENGINE] Model load error:', e.message);
    return {};
  }
}

// ─── Default behavior_spec template ──────────────────────────────────────────
const DEFAULT_BEHAVIOR_SPEC = {
  cue: { type: 'time', trigger_time: null, trigger_event: null, trigger_location: null, trigger_after: null },
  difficulty: {
    current: 'standard',
    micro:    { duration_minutes: 5,  description_ar: 'نسخة مصغّرة — 5 دقائق فقط' },
    standard: { duration_minutes: 20, description_ar: 'النسخة العادية' },
    stretch:  { duration_minutes: 45, description_ar: 'تحدّي — نسخة موسّعة' },
  },
  reward: { type: 'intrinsic', message_ar: 'أحسنت! 🎉', xp_bonus: 5 },
  resistance_profile: { common_skip_type: null, avg_skip_rate: 0, best_adherence_time: null, worst_time: null },
  adaptation_rules: { reduce_after_skips: 3, increase_after_streak: 7, cooldown_days: 2 },
  chain: { after_habit_id: null, before_habit_id: null },
  is_breaking_habit: false,
  replacement_for: null,
};

// ─── Behavior scoring for decision engine ────────────────────────────────────
function scoreBehavior(habit, spec, signals, ctx) {
  const { hour, todayStr } = ctx;
  let score = 50; // base

  // 1. Cue timing match (the strongest signal)
  const cue = spec.cue || {};
  if (cue.trigger_time) {
    const triggerHour = parseInt(cue.trigger_time.split(':')[0]);
    const diff = Math.abs(hour - triggerHour);
    if (diff === 0) score += 30;       // exact hour match
    else if (diff === 1) score += 15;  // ±1 hour
    else if (diff <= 2) score += 5;
    else score -= 10;                  // wrong time
  }

  // 2. Streak protection (the higher the streak, the more important)
  const streak = habit.current_streak || 0;
  if (streak >= 10) score += 25;
  else if (streak >= 5) score += 18;
  else if (streak >= 3) score += 10;

  // 3. Goal linkage boost
  if (habit.goal_id) score += 10;

  // 4. Difficulty adaptation — prefer current difficulty level
  const currentDiff = spec.difficulty?.current || habit.current_difficulty || 'standard';
  const energy = signals?.energy_level?.value || 50;
  if (currentDiff === 'micro' && energy < 40) score += 15;      // micro when tired = good
  if (currentDiff === 'stretch' && energy >= 70) score += 10;   // stretch when energized
  if (currentDiff === 'standard') score += 5;                    // standard is always reasonable

  // 5. Breaking habit urgency
  if (spec.is_breaking_habit || habit.behavior_type === 'break') {
    score += 12; // breaking habits need consistent reinforcement
  }

  // 6. Resistance penalty — if user often skips this habit at this time
  const resistance = spec.resistance_profile || {};
  if (resistance.worst_time) {
    const worstHour = parseInt(resistance.worst_time.split(':')[0]);
    if (Math.abs(hour - worstHour) <= 1) score -= 15; // bad time for this habit
  }
  if (resistance.avg_skip_rate > 0.5) score -= 10; // frequently skipped

  // 7. Energy match
  const estMinutes = spec.difficulty?.[currentDiff]?.duration_minutes || habit.duration_minutes || 20;
  if (energy < 35 && estMinutes > 30) score -= 15;
  if (energy >= 70 && estMinutes <= 10) score -= 5; // waste of peak energy

  return {
    score: Math.max(0, Math.min(100, score)),
    habit_id: habit.id,
    habit_name: habit.name_ar || habit.name,
    type: 'behavior',
    current_difficulty: currentDiff,
    estimated_minutes: estMinutes,
    streak: streak,
    goal_id: habit.goal_id || null,
    is_breaking_habit: spec.is_breaking_habit || habit.behavior_type === 'break',
    cue: cue,
    reward: spec.reward || {},
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// loadBehaviorCandidates(userId, signals, ctx)
// Returns scored behavior candidates for the decision engine
// ═════════════════════════════════════════════════════════════════════════════
async function loadBehaviorCandidates(userId, signals, ctx) {
  const { Habit, HabitLog } = getModels();
  if (!Habit) return [];

  try {
    const { todayStr, timezone } = ctx;

    // Load active habits
    const habits = await Habit.findAll({
      where: { user_id: userId, is_active: true },
      raw: true,
    });

    if (!habits.length) return [];

    // Check which are already done today
    let doneIds = new Set();
    if (HabitLog) {
      const logs = await HabitLog.findAll({
        where: { user_id: userId, log_date: todayStr, completed: true },
        attributes: ['habit_id'],
        raw: true,
      });
      doneIds = new Set(logs.map(l => l.habit_id));
    }

    // Filter out completed habits and score the rest
    const candidates = [];
    for (const habit of habits) {
      if (doneIds.has(habit.id)) continue;

      // Parse behavior_spec (may be a string or already parsed)
      let spec;
      try {
        spec = typeof habit.behavior_spec === 'string'
          ? JSON.parse(habit.behavior_spec || '{}')
          : (habit.behavior_spec || {});
      } catch { spec = {}; }

      // Merge with defaults
      const fullSpec = { ...DEFAULT_BEHAVIOR_SPEC, ...spec };

      const scored = scoreBehavior(habit, fullSpec, signals, ctx);
      scored.behavior_spec = fullSpec;
      candidates.push(scored);
    }

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);
    return candidates;
  } catch (err) {
    logger.error('[BEHAVIOR-ENGINE] loadBehaviorCandidates error:', err.message);
    return [];
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// adaptDifficulty(userId, habitId)
// Adjusts difficulty based on recent completion/skip patterns
// Rules:
//   - 3 consecutive skips → reduce to micro
//   - 7 consecutive completions → increase to stretch (if currently standard)
//   - After reducing, wait 2 days before increasing
// ═════════════════════════════════════════════════════════════════════════════
async function adaptDifficulty(userId, habitId) {
  const { Habit, HabitLog } = getModels();
  if (!Habit || !HabitLog) return null;

  try {
    const habit = await Habit.findOne({ where: { id: habitId, user_id: userId } });
    if (!habit) return null;

    let spec;
    try {
      spec = typeof habit.behavior_spec === 'string'
        ? JSON.parse(habit.behavior_spec || '{}')
        : (habit.behavior_spec || {});
    } catch { spec = {}; }

    const rules = spec.adaptation_rules || DEFAULT_BEHAVIOR_SPEC.adaptation_rules;
    const currentDiff = spec.difficulty?.current || habit.current_difficulty || 'standard';

    // Get recent logs (last 14 days)
    const recentLogs = await HabitLog.findAll({
      where: {
        habit_id: habitId,
        user_id: userId,
        log_date: {
          [require('sequelize').Op.gte]: moment().subtract(14, 'days').format('YYYY-MM-DD'),
        },
      },
      order: [['log_date', 'DESC']],
      limit: 14,
      raw: true,
    });

    // Count consecutive results
    let consecutiveSkips = 0;
    let consecutiveCompletions = 0;
    for (const log of recentLogs) {
      if (log.completed) {
        if (consecutiveSkips === 0) consecutiveCompletions++;
        else break;
      } else {
        if (consecutiveCompletions === 0) consecutiveSkips++;
        else break;
      }
    }

    // Also count days without any log as skips
    const logDates = new Set(recentLogs.map(l => l.log_date));
    const today = moment().format('YYYY-MM-DD');
    for (let i = 1; i <= 7; i++) {
      const dateStr = moment().subtract(i, 'days').format('YYYY-MM-DD');
      if (!logDates.has(dateStr)) {
        consecutiveSkips++;
      } else {
        break;
      }
    }

    let newDifficulty = currentDiff;
    let adapted = false;
    let reason = null;

    // Reduce difficulty after consecutive skips
    if (consecutiveSkips >= (rules.reduce_after_skips || 3)) {
      if (currentDiff === 'stretch') { newDifficulty = 'standard'; adapted = true; reason = 'تقليل الصعوبة بعد عدة تخطيات'; }
      else if (currentDiff === 'standard') { newDifficulty = 'micro'; adapted = true; reason = 'نسخة مصغّرة لإعادة بناء الاتساق'; }
    }
    // Increase difficulty after streak
    else if (consecutiveCompletions >= (rules.increase_after_streak || 7)) {
      if (currentDiff === 'micro') { newDifficulty = 'standard'; adapted = true; reason = 'ترقية! أنت مستعد للنسخة العادية'; }
      else if (currentDiff === 'standard') { newDifficulty = 'stretch'; adapted = true; reason = 'تحدّي! جرّب النسخة الموسّعة'; }
    }

    if (adapted) {
      // Update habit
      const updatedSpec = { ...spec };
      if (!updatedSpec.difficulty) updatedSpec.difficulty = { ...DEFAULT_BEHAVIOR_SPEC.difficulty };
      updatedSpec.difficulty.current = newDifficulty;

      await habit.update({
        behavior_spec: JSON.stringify(updatedSpec),
        current_difficulty: newDifficulty,
      });

      logger.info(`[BEHAVIOR-ENGINE] Adapted difficulty for habit ${habitId}: ${currentDiff} → ${newDifficulty} (${reason})`);
    }

    return {
      adapted,
      previous: currentDiff,
      current: newDifficulty,
      reason,
      consecutive_skips: consecutiveSkips,
      consecutive_completions: consecutiveCompletions,
    };
  } catch (err) {
    logger.error('[BEHAVIOR-ENGINE] adaptDifficulty error:', err.message);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// detectResistance(userId, habitId)
// Analyzes skip/completion patterns to build a resistance profile
// ═════════════════════════════════════════════════════════════════════════════
async function detectResistance(userId, habitId) {
  const { HabitLog } = getModels();
  if (!HabitLog) return null;

  try {
    const logs = await HabitLog.findAll({
      where: {
        habit_id: habitId,
        user_id: userId,
        log_date: {
          [require('sequelize').Op.gte]: moment().subtract(30, 'days').format('YYYY-MM-DD'),
        },
      },
      raw: true,
    });

    if (logs.length < 3) return { insufficient_data: true };

    const completed = logs.filter(l => l.completed);
    const skipped = logs.filter(l => !l.completed);
    const skipRate = logs.length > 0 ? skipped.length / logs.length : 0;

    // Analyze skip reasons
    const skipReasons = {};
    for (const skip of skipped) {
      const reason = skip.skipped_reason || 'unknown';
      skipReasons[reason] = (skipReasons[reason] || 0) + 1;
    }
    const commonSkipType = Object.entries(skipReasons)
      .sort(([, a], [, b]) => b - a)[0]?.[0] || null;

    // Analyze completion time patterns
    const completionHours = completed
      .filter(l => l.completed_at)
      .map(l => new Date(l.completed_at).getHours());

    let bestTime = null;
    let worstTime = null;
    if (completionHours.length >= 3) {
      const hourCounts = {};
      for (const h of completionHours) hourCounts[h] = (hourCounts[h] || 0) + 1;
      const sorted = Object.entries(hourCounts).sort(([, a], [, b]) => b - a);
      bestTime = sorted[0] ? `${String(sorted[0][0]).padStart(2, '0')}:00` : null;
    }

    // Analyze skip time patterns
    const skipDates = skipped.map(l => moment(l.log_date));
    const skipDays = skipDates.map(d => d.day());
    const daySkipCounts = {};
    for (const d of skipDays) daySkipCounts[d] = (daySkipCounts[d] || 0) + 1;
    const worstDay = Object.entries(daySkipCounts).sort(([, a], [, b]) => b - a)[0]?.[0];

    return {
      common_skip_type: commonSkipType,
      avg_skip_rate: Math.round(skipRate * 100) / 100,
      best_adherence_time: bestTime,
      worst_day: worstDay ? parseInt(worstDay) : null,
      total_completions: completed.length,
      total_skips: skipped.length,
      skip_reasons: skipReasons,
    };
  } catch (err) {
    logger.error('[BEHAVIOR-ENGINE] detectResistance error:', err.message);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// detectBreakingHabitTriggers(userId)
// Identifies potential negative patterns from task/mood data
// Returns suggestions for breaking-habit behaviors
// ═════════════════════════════════════════════════════════════════════════════
async function detectBreakingHabitTriggers(userId) {
  const models = getModels();
  if (!models.Habit) return [];

  try {
    // Find habits marked as breaking habits
    const breakingHabits = await models.Habit.findAll({
      where: { user_id: userId, is_active: true, behavior_type: 'break' },
      raw: true,
    });

    const triggers = [];
    for (const habit of breakingHabits) {
      let spec;
      try {
        spec = typeof habit.behavior_spec === 'string'
          ? JSON.parse(habit.behavior_spec || '{}') : (habit.behavior_spec || {});
      } catch { spec = {}; }

      const cue = spec.cue || {};
      triggers.push({
        habit_id: habit.id,
        habit_name: habit.name_ar || habit.name,
        replacement_behavior: habit.replaces_behavior,
        trigger_type: cue.type || 'unknown',
        trigger_details: cue,
        current_streak: habit.current_streak || 0,
        suggestion: spec.is_breaking_habit
          ? `بدل ${habit.replaces_behavior || 'السلوك السلبي'} بـ "${habit.name_ar || habit.name}"`
          : null,
      });
    }

    return triggers;
  } catch (err) {
    logger.error('[BEHAVIOR-ENGINE] detectBreakingHabitTriggers error:', err.message);
    return [];
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// getBehaviorContext(userId, habitId)
// Returns full behavior context for the execution screen
// ═════════════════════════════════════════════════════════════════════════════
async function getBehaviorContext(userId, habitId) {
  const { Habit, Goal } = getModels();
  if (!Habit) return null;

  try {
    const habit = await Habit.findOne({
      where: { id: habitId, user_id: userId },
      raw: true,
    });
    if (!habit) return null;

    let spec;
    try {
      spec = typeof habit.behavior_spec === 'string'
        ? JSON.parse(habit.behavior_spec || '{}') : (habit.behavior_spec || {});
    } catch { spec = {}; }

    const fullSpec = { ...DEFAULT_BEHAVIOR_SPEC, ...spec };
    const currentDiff = fullSpec.difficulty?.current || habit.current_difficulty || 'standard';
    const diffInfo = fullSpec.difficulty?.[currentDiff] || fullSpec.difficulty?.standard;

    let goalContext = null;
    if (habit.goal_id && Goal) {
      const goal = await Goal.findByPk(habit.goal_id, {
        attributes: ['id', 'title', 'progress', 'category', 'goal_type'],
        raw: true,
      });
      if (goal) {
        goalContext = {
          id: goal.id,
          title: goal.title,
          progress: goal.progress,
          category: goal.category,
          goal_type: goal.goal_type,
        };
      }
    }

    return {
      habit_id: habit.id,
      habit_name: habit.name_ar || habit.name,
      behavior_type: habit.behavior_type || 'build',
      current_difficulty: currentDiff,
      difficulty_label: diffInfo?.description_ar || 'النسخة العادية',
      estimated_minutes: diffInfo?.duration_minutes || habit.duration_minutes || 20,
      streak: habit.current_streak || 0,
      longest_streak: habit.longest_streak || 0,
      completion_rate: habit.completion_rate || 0,
      cue: fullSpec.cue,
      reward: fullSpec.reward,
      is_breaking_habit: fullSpec.is_breaking_habit || habit.behavior_type === 'break',
      replaces_behavior: habit.replaces_behavior,
      goal: goalContext,
    };
  } catch (err) {
    logger.error('[BEHAVIOR-ENGINE] getBehaviorContext error:', err.message);
    return null;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// createBehaviorFromOnboarding(userId, area, goalId)
// Auto-generates a habit with behavior_spec from onboarding selection
// ═════════════════════════════════════════════════════════════════════════════
const AREA_BEHAVIOR_TEMPLATES = {
  productivity: {
    name: 'Deep Work Session', name_ar: 'جلسة عمل عميق', category: 'productivity', icon: '🎯', color: '#6C63FF',
    duration_minutes: 25, description: 'تركيز بلا مشتتات لمدة 25 دقيقة',
    spec: { cue: { type: 'time', trigger_time: '09:00' }, difficulty: { current: 'standard', micro: { duration_minutes: 10, description_ar: '10 دقائق تركيز' }, standard: { duration_minutes: 25, description_ar: '25 دقيقة عمل عميق' }, stretch: { duration_minutes: 50, description_ar: '50 دقيقة تحدّي' } }, reward: { type: 'intrinsic', message_ar: 'جلسة تركيز ممتازة! 🧠', xp_bonus: 8 } },
  },
  study: {
    name: 'Study Session', name_ar: 'جلسة مذاكرة', category: 'learning', icon: '📚', color: '#8B5CF6',
    duration_minutes: 30, description: 'مذاكرة مركّزة لمادة واحدة',
    spec: { cue: { type: 'time', trigger_time: '16:00' }, difficulty: { current: 'standard', micro: { duration_minutes: 15, description_ar: 'مراجعة سريعة 15 دقيقة' }, standard: { duration_minutes: 30, description_ar: 'مذاكرة 30 دقيقة' }, stretch: { duration_minutes: 60, description_ar: 'جلسة مذاكرة مكثّفة' } }, reward: { type: 'intrinsic', message_ar: 'أحسنت! المذاكرة المنتظمة مفتاح النجاح 📖', xp_bonus: 10 } },
  },
  health: {
    name: 'Drink Water', name_ar: 'اشرب ماء', category: 'health', icon: '💧', color: '#06B6D4',
    duration_minutes: 2, description: 'اشرب كوب ماء كامل',
    spec: { cue: { type: 'event', trigger_event: 'morning_routine' }, difficulty: { current: 'micro', micro: { duration_minutes: 1, description_ar: 'كوب واحد' }, standard: { duration_minutes: 2, description_ar: 'كوبين ماء' }, stretch: { duration_minutes: 3, description_ar: '3 أكواب + ليمون' } }, reward: { type: 'intrinsic', message_ar: 'جسمك يشكرك! 💧', xp_bonus: 3 } },
  },
  fitness: {
    name: 'Exercise', name_ar: 'تمرين رياضي', category: 'health', icon: '💪', color: '#EF4444',
    duration_minutes: 20, description: 'تمرين بدني يومي',
    spec: { cue: { type: 'time', trigger_time: '07:00' }, difficulty: { current: 'standard', micro: { duration_minutes: 7, description_ar: 'تمرين سريع 7 دقائق' }, standard: { duration_minutes: 20, description_ar: '20 دقيقة تمرين' }, stretch: { duration_minutes: 45, description_ar: 'تمرين مكثّف 45 دقيقة' } }, reward: { type: 'intrinsic', message_ar: 'جسم صحي = عقل صحي! 💪', xp_bonus: 10 } },
  },
  work: {
    name: 'Planning Session', name_ar: 'تخطيط اليوم', category: 'productivity', icon: '📋', color: '#F59E0B',
    duration_minutes: 10, description: 'خطط ليومك وحدد أولوياتك',
    spec: { cue: { type: 'time', trigger_time: '08:00' }, difficulty: { current: 'micro', micro: { duration_minutes: 5, description_ar: '5 دقائق تخطيط سريع' }, standard: { duration_minutes: 10, description_ar: 'تخطيط شامل 10 دقائق' }, stretch: { duration_minutes: 20, description_ar: 'تخطيط تفصيلي مع مراجعة' } }, reward: { type: 'intrinsic', message_ar: 'يومك منظّم! 📋', xp_bonus: 5 } },
  },
  creativity: {
    name: 'Creative Practice', name_ar: 'ممارسة إبداعية', category: 'personal', icon: '🎨', color: '#EC4899',
    duration_minutes: 20, description: 'خصص وقتاً لإبداعك',
    spec: { cue: { type: 'time', trigger_time: '18:00' }, difficulty: { current: 'standard', micro: { duration_minutes: 10, description_ar: 'رسمة أو فكرة سريعة' }, standard: { duration_minutes: 20, description_ar: 'ممارسة إبداعية' }, stretch: { duration_minutes: 45, description_ar: 'مشروع إبداعي مكثّف' } }, reward: { type: 'intrinsic', message_ar: 'إبداعك يتطور! 🎨', xp_bonus: 7 } },
  },
  social: {
    name: 'Connect with someone', name_ar: 'تواصل مع شخص', category: 'relationships', icon: '🤝', color: '#10B981',
    duration_minutes: 10, description: 'تواصل مع صديق أو فرد من العائلة',
    spec: { cue: { type: 'time', trigger_time: '20:00' }, difficulty: { current: 'micro', micro: { duration_minutes: 5, description_ar: 'رسالة قصيرة' }, standard: { duration_minutes: 10, description_ar: 'مكالمة أو لقاء' }, stretch: { duration_minutes: 30, description_ar: 'لقاء مطوّل أو نشاط مشترك' } }, reward: { type: 'intrinsic', message_ar: 'العلاقات ثروة! 🤝', xp_bonus: 5 } },
  },
  finance: {
    name: 'Track Expenses', name_ar: 'تتبع المصاريف', category: 'finance', icon: '💰', color: '#14B8A6',
    duration_minutes: 5, description: 'سجّل مصاريفك اليومية',
    spec: { cue: { type: 'time', trigger_time: '21:00' }, difficulty: { current: 'micro', micro: { duration_minutes: 2, description_ar: 'سجّل مصروف واحد' }, standard: { duration_minutes: 5, description_ar: 'مراجعة كل مصاريف اليوم' }, stretch: { duration_minutes: 15, description_ar: 'مراجعة أسبوعية شاملة' } }, reward: { type: 'intrinsic', message_ar: 'السيطرة على المال! 💰', xp_bonus: 5 } },
  },
};

async function createBehaviorFromOnboarding(userId, area, goalId = null) {
  const { Habit } = getModels();
  if (!Habit) return null;

  const template = AREA_BEHAVIOR_TEMPLATES[area];
  if (!template) return null;

  try {
    const fullSpec = { ...DEFAULT_BEHAVIOR_SPEC, ...template.spec };

    // Deduplication: check if habit with same name already exists for user
    const existingHabit = await Habit.findOne({
      where: { user_id: userId, name: template.name },
    });
    if (existingHabit) {
      logger.info(`[BEHAVIOR-ENGINE] Duplicate prevented: "${template.name}" already exists for user ${userId}`);
      // Update goal_id if missing
      if (goalId && !existingHabit.goal_id) {
        await existingHabit.update({ goal_id: goalId });
      }
      return existingHabit;
    }

    const habit = await Habit.create({
      user_id: userId,
      name: template.name,
      name_ar: template.name_ar,
      category: template.category,
      icon: template.icon,
      color: template.color,
      duration_minutes: template.duration_minutes,
      description: template.description,
      frequency: 'daily',
      is_active: true,
      behavior_spec: JSON.stringify(fullSpec),
      behavior_type: 'build',
      current_difficulty: fullSpec.difficulty?.current || 'standard',
      goal_id: goalId,
      preferred_time: template.spec?.cue?.trigger_time || null,
    });

    logger.info(`[BEHAVIOR-ENGINE] Created behavior "${template.name_ar}" for user ${userId} (area: ${area})`);
    return habit;
  } catch (err) {
    logger.error('[BEHAVIOR-ENGINE] createBehaviorFromOnboarding error:', err.message);
    return null;
  }
}

module.exports = {
  loadBehaviorCandidates,
  scoreBehavior,
  adaptDifficulty,
  detectResistance,
  detectBreakingHabitTriggers,
  getBehaviorContext,
  createBehaviorFromOnboarding,
  DEFAULT_BEHAVIOR_SPEC,
  AREA_BEHAVIOR_TEMPLATES,
};
