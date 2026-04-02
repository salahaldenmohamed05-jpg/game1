/**
 * IntelligenceService v2.0 — LifeFlow Behavior-Aware ML Signal Aggregator
 * =========================================================================
 * Upgrade from Phase K → Phase L
 *
 * CHANGES from v1.0:
 *   1. FIXED: estimated_minutes → estimated_duration (matching actual DB schema)
 *   2. NEW: Non-linear signal interactions (signals amplify/dampen each other)
 *   3. NEW: Behavior detection (avoidance, overwhelm, momentum, fake productivity)
 *   4. NEW: momentum_state signal — tracks user's current behavioral pattern
 *   5. NEW: overwhelm_index signal — composite overwhelm detection
 *   6. ENHANCED: procrastination_risk uses sigmoid curve instead of linear sum
 *   7. ENHANCED: energy_level accounts for post-lunch dip and productivity rhythm
 *   8. ENHANCED: All signals have richer factor explanations
 *
 * Architecture (unchanged):
 *   ML layer produces EXPLAINABLE SIGNALS → DecisionService makes FINAL decisions
 *   LLM (Grok/Gemini) is ONLY used for explanations/coaching, NEVER for decisions.
 */

'use strict';

const moment = require('moment-timezone');
const logger = require('../utils/logger');

// ─── Lazy model/service loaders ────────────────────────────────────────────
function getModels() {
  try { return require('../config/database').sequelize.models; } catch (_e) { return {}; }
}
function getLearning() {
  try { return require('./learning.engine.service'); } catch (_e) { return null; }
}

// ─── Constants ──────────────────────────────────────────────────────────────
const SIGNAL_VERSION = '2.0.0';

// Time-of-day energy curve — research-based circadian rhythm
// Includes post-lunch dip (13-14h), second wind (16-18h)
const BASELINE_ENERGY_CURVE = [
  12, 8,  6,  5,  6,  15, 35, 55, 72, 85, 90, 88,  // 00–11
  78, 60, 55, 60, 70, 72, 65, 52, 40, 30, 22, 15,  // 12–23
];

// ─── Utility: sigmoid curve for non-linear mapping ─────────────────────────
function sigmoid(x, midpoint = 0.5, steepness = 10) {
  return 1 / (1 + Math.exp(-steepness * (x - midpoint)));
}

// ─── Utility: clamp value ──────────────────────────────────────────────────
function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// ═══════════════════════════════════════════════════════════════════════════
// SIGNAL COMPUTATION FUNCTIONS
// Each returns { value, confidence, source[], factors{} }
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Signal: completion_probability (0–1)
 * Non-linear: multiple bad signals compound exponentially
 */
function computeCompletionProbability(ctx) {
  const { learning, hour, energy, mood, overdueTasks, todayTasks, completedToday } = ctx;
  const sources = [];
  const factors = {};

  // 1. Historical success rate
  let historicalRate = 0.55;
  if (learning) {
    try {
      const mlPreds = learning.getMLPredictions(ctx.userId, {
        energy, mood, hour, overdueCount: overdueTasks.length,
      });
      if (mlPreds.confidence !== 'insufficient') {
        historicalRate = mlPreds.task_completion_probability;
        sources.push('learning_engine');
      }
    } catch (_e) { /* non-critical */ }
    factors.historical_rate = historicalRate;
  }

  // 2. Energy → non-linear: below 30 drops sharply, above 70 has diminishing returns
  const energyFactor = energy >= 70 ? 0.12
    : energy >= 50 ? 0.03
    : energy >= 35 ? -0.08
    : -0.15 * sigmoid(1 - energy / 100, 0.3, 8); // sharp drop below 35
  factors.energy_effect = parseFloat(energyFactor.toFixed(3));

  // 3. Mood → non-linear
  const moodFactor = mood >= 8 ? 0.1
    : mood >= 6 ? 0.03
    : mood >= 4 ? -0.05
    : -0.12 * (1 + (3 - mood) / 3); // very low mood = severe impact
  factors.mood_effect = parseFloat(moodFactor.toFixed(3));

  // 4. Overdue pressure: non-linear demoralization
  // 1-2 overdue = slight pressure (motivating), 3-5 = demotivating, 6+ = overwhelming
  const overdueCount = overdueTasks.length;
  const overduePressure = overdueCount === 0 ? 0.05
    : overdueCount <= 2 ? 0.02  // slight positive pressure
    : overdueCount <= 4 ? -0.08
    : overdueCount <= 7 ? -0.15
    : -0.2 - (overdueCount - 7) * 0.02; // escalating demoralization
  factors.overdue_pressure = parseFloat(overduePressure.toFixed(3));
  factors.overdue_count = overdueCount;

  // 5. Task load saturation (non-linear)
  const totalActive = overdueTasks.length + todayTasks.length;
  const loadFactor = totalActive <= 3 ? 0.03
    : totalActive <= 6 ? 0
    : totalActive <= 10 ? -0.05
    : -0.1 * sigmoid(totalActive / 20, 0.4, 6);
  factors.task_load = parseFloat(loadFactor.toFixed(3));

  // 6. Momentum boost: if already completed tasks today, completion prob goes up
  const momentumBoost = completedToday >= 3 ? 0.1
    : completedToday >= 1 ? 0.05 : 0;
  factors.momentum_boost = momentumBoost;

  // 7. Signal interaction: low energy + low mood = compound penalty
  const compoundPenalty = (energy < 40 && mood < 4) ? -0.1 : 0;
  factors.compound_penalty = compoundPenalty;

  const value = clamp(
    historicalRate + energyFactor + moodFactor + overduePressure + loadFactor + momentumBoost + compoundPenalty,
    0.03, 0.97
  );

  const confidence = learning && sources.includes('learning_engine') ? 'medium' : 'low';
  sources.push('energy_model', 'mood_model', 'behavior_model');

  return { value: parseFloat(value.toFixed(3)), confidence, source: sources, factors };
}

/**
 * Signal: procrastination_risk (0–1)
 * ENHANCED: uses sigmoid curve, detects avoidance behavior patterns
 */
function computeProcrastinationRisk(ctx) {
  const { overdueTasks, todayTasks, completedToday, hour, energy, mood, learning, userId } = ctx;
  const factors = {};

  const totalActive = overdueTasks.length + todayTasks.length;
  if (totalActive === 0) {
    return { value: 0, confidence: 'low', source: ['no_tasks'], factors: { reason: 'no_active_tasks' } };
  }

  // 1. Overdue ratio → sigmoid: risk accelerates sharply past 50% overdue
  const overdueRatio = overdueTasks.length / totalActive;
  const overdueRisk = sigmoid(overdueRatio, 0.35, 8) * 0.35;
  factors.overdue_ratio = parseFloat(overdueRatio.toFixed(2));
  factors.overdue_risk = parseFloat(overdueRisk.toFixed(3));

  // 2. Inaction detection (time-aware)
  // Late in the day + nothing done = strong avoidance signal
  let inactionRisk = 0;
  if (hour >= 16 && completedToday === 0 && totalActive > 0) {
    inactionRisk = 0.45; // it's 4pm and nothing done — high avoidance
    factors.inaction_pattern = 'severe_avoidance';
  } else if (hour >= 14 && completedToday === 0 && totalActive > 2) {
    inactionRisk = 0.3;
    factors.inaction_pattern = 'moderate_avoidance';
  } else if (hour >= 11 && completedToday === 0 && totalActive > 3) {
    inactionRisk = 0.15;
    factors.inaction_pattern = 'mild_avoidance';
  } else if (completedToday > 0) {
    inactionRisk = -0.05; // active user gets a discount
    factors.inaction_pattern = 'active';
  }
  factors.inaction_risk = parseFloat(inactionRisk.toFixed(3));

  // 3. Energy-load interaction (non-linear)
  // Low energy + many tasks = avoidance risk spikes
  let energyLoadRisk = 0;
  if (energy < 35 && totalActive > 4) {
    energyLoadRisk = 0.25;
    factors.energy_load_pattern = 'overwhelm_risk';
  } else if (energy < 45 && totalActive > 6) {
    energyLoadRisk = 0.15;
    factors.energy_load_pattern = 'moderate_strain';
  }
  factors.energy_load_risk = parseFloat(energyLoadRisk.toFixed(3));

  // 4. Mood-driven avoidance
  const moodRisk = mood <= 3 ? 0.15 : mood <= 4 ? 0.08 : 0;
  factors.mood_avoidance = parseFloat(moodRisk.toFixed(3));

  // 5. Historical patterns
  let histPattern = 0;
  if (learning) {
    try {
      const stats = learning.getLearningStats(userId);
      const failurePatterns = stats.failurePatterns || [];
      const procrastPatterns = failurePatterns.filter(p =>
        p.reason && (p.reason.includes('procrastin') || p.reason.includes('postponed') || p.reason.includes('skipped'))
      );
      if (procrastPatterns.length >= 3) histPattern = 0.2;
      else if (procrastPatterns.length > 0) histPattern = 0.1;
      factors.historical_pattern = histPattern;
    } catch (_e) { /* non-critical */ }
  }

  // Combine with sigmoid compression (prevents exceeding 1.0 naturally)
  const rawRisk = overdueRisk + inactionRisk + energyLoadRisk + moodRisk + histPattern;
  const value = clamp(sigmoid(rawRisk, 0.3, 5), 0, 1);

  return {
    value: parseFloat(value.toFixed(3)),
    confidence: totalActive > 2 ? 'medium' : 'low',
    source: ['task_analysis', 'energy_model', 'behavior_model'],
    factors,
  };
}

/**
 * Signal: energy_level (0–100)
 * ENHANCED: post-lunch dip, productivity rhythm, compound mood effect
 */
function computeEnergyLevel(ctx) {
  const { hour, mood, learning, userId, completedToday } = ctx;
  const factors = {};

  // 1. Baseline from circadian rhythm
  const baseline = BASELINE_ENERGY_CURVE[hour] || 50;
  factors.time_baseline = baseline;

  // 2. Post-lunch dip detection (13-15h)
  const postLunchDip = (hour >= 13 && hour <= 15) ? -8 : 0;
  factors.post_lunch_dip = postLunchDip;

  // 3. Mood influence (non-linear)
  const moodModifier = mood >= 8 ? 18
    : mood >= 6 ? 8
    : mood >= 4 ? -5
    : -12 - (4 - mood) * 3; // very bad mood = severe energy drain
  factors.mood_modifier = Math.round(moodModifier);

  // 4. Focus hour proximity from learning engine
  let focusBonus = 0;
  if (learning) {
    try {
      const optHour = learning.getOptimalHour(userId);
      if (optHour !== null) {
        const dist = Math.abs(hour - optHour);
        focusBonus = dist <= 1 ? 15 : dist <= 2 ? 8 : dist <= 3 ? 3 : -3;
        factors.focus_hour_bonus = focusBonus;
        factors.optimal_hour = optHour;
      }
    } catch (_e) { /* non-critical */ }
  }

  // 5. Activity momentum: completing tasks generates energy
  const activityBoost = completedToday >= 3 ? 8 : completedToday >= 1 ? 4 : 0;
  factors.activity_boost = activityBoost;

  const value = clamp(Math.round(baseline + postLunchDip + moodModifier + focusBonus + activityBoost), 5, 100);

  return {
    value,
    confidence: learning ? 'medium' : 'low',
    source: ['circadian_rhythm', 'mood_input', 'learning_engine', 'activity_model'],
    factors,
  };
}

/**
 * Signal: focus_score (0–100)
 * ENHANCED: accounts for overwhelm, context switching, and momentum
 */
function computeFocusScore(ctx) {
  const { energy, hour, overdueTasks, todayTasks, learning, userId, completedToday } = ctx;
  const factors = {};

  // 1. Energy base (35% weight)
  const energyComponent = Math.round(energy * 0.35);
  factors.energy_component = energyComponent;

  // 2. Time window (20% weight)
  const timeScore = (hour >= 8 && hour <= 12) ? 20
    : (hour >= 14 && hour <= 17) ? 15
    : (hour >= 6 && hour <= 8) ? 12
    : (hour >= 17 && hour <= 20) ? 10 : 5;
  factors.time_component = timeScore;

  // 3. Optimal hour match from learning (20% weight)
  let optimalMatch = 10;
  if (learning) {
    try {
      const optHour = learning.getOptimalHour(userId);
      if (optHour !== null) {
        const dist = Math.abs(hour - optHour);
        optimalMatch = dist <= 1 ? 20 : dist <= 2 ? 15 : dist <= 3 ? 10 : 5;
      }
    } catch (_e) { /* non-critical */ }
  }
  factors.optimal_match = optimalMatch;

  // 4. Overwhelm penalty (non-linear) — too many tasks fragments attention
  const totalActive = overdueTasks.length + todayTasks.length;
  let distractionPenalty;
  if (totalActive > 12) distractionPenalty = 2;      // severe overwhelm
  else if (totalActive > 8) distractionPenalty = 5;
  else if (totalActive > 5) distractionPenalty = 10;
  else if (totalActive > 3) distractionPenalty = 15;
  else distractionPenalty = 20;                        // focused
  factors.distraction_penalty = distractionPenalty;

  // 5. Momentum bonus: active completion streak sharpens focus
  const momentumBonus = completedToday >= 3 ? 8 : completedToday >= 1 ? 3 : 0;
  factors.momentum_bonus = momentumBonus;

  const value = clamp(energyComponent + timeScore + optimalMatch + distractionPenalty + momentumBonus, 5, 100);

  return {
    value,
    confidence: learning ? 'medium' : 'low',
    source: ['energy_model', 'time_analysis', 'learning_engine', 'behavior_model'],
    factors,
  };
}

/**
 * Signal: burnout_risk (0–1)
 * ENHANCED: compound detection — mood trend + overdue pressure + energy exhaustion
 */
function computeBurnoutRisk(ctx) {
  const { learning, userId, mood, overdueTasks, energy, recentMoods } = ctx;
  const factors = {};

  // Component 1: ML-based burnout from learning engine
  let mlBurnout = 0;
  if (learning && learning.detectBurnoutRisk) {
    try {
      mlBurnout = learning.detectBurnoutRisk(userId, {
        mood,
        overdueCount: overdueTasks.length,
        recentMoods,
      });
      factors.ml_burnout = parseFloat(mlBurnout.toFixed(3));
    } catch (_e) { /* non-critical */ }
  }

  // Component 2: Mood trend analysis (declining mood = burnout precursor)
  let moodTrendRisk = 0;
  if (recentMoods.length >= 3) {
    const recentAvg = recentMoods.slice(-3).reduce((a, b) => a + b, 0) / Math.min(3, recentMoods.length);
    const olderAvg = recentMoods.length > 3
      ? recentMoods.slice(0, -3).reduce((a, b) => a + b, 0) / (recentMoods.length - 3)
      : recentAvg;
    const trend = olderAvg - recentAvg; // positive = declining mood
    moodTrendRisk = trend > 2 ? 0.25 : trend > 1 ? 0.15 : trend > 0 ? 0.05 : 0;
    factors.mood_trend = parseFloat(trend.toFixed(2));
  }
  factors.mood_trend_risk = parseFloat(moodTrendRisk.toFixed(3));

  // Component 3: Current state indicators
  const moodFactor = mood <= 2 ? 0.35 : mood <= 3 ? 0.25 : mood <= 4 ? 0.12 : mood <= 5 ? 0.05 : 0;
  const overdueFactor = overdueTasks.length > 8 ? 0.3
    : overdueTasks.length > 5 ? 0.2
    : overdueTasks.length > 2 ? 0.1 : 0;
  const energyFactor = energy < 25 ? 0.25 : energy < 35 ? 0.15 : energy < 50 ? 0.05 : 0;
  factors.mood_factor = parseFloat(moodFactor.toFixed(3));
  factors.overdue_factor = parseFloat(overdueFactor.toFixed(3));
  factors.energy_factor = parseFloat(energyFactor.toFixed(3));

  // Compound: multiple risk factors amplify each other
  const rawRisk = mlBurnout * 0.3 + moodFactor * 0.25 + overdueFactor * 0.2 + energyFactor * 0.15 + moodTrendRisk * 0.1;
  const compoundMultiplier = (moodFactor > 0 && overdueFactor > 0 && energyFactor > 0) ? 1.3 : 1.0;
  factors.compound_multiplier = compoundMultiplier;

  const value = clamp(rawRisk * compoundMultiplier, 0, 1);
  return {
    value: parseFloat(value.toFixed(3)),
    confidence: (learning && recentMoods.length >= 3) ? 'medium' : 'low',
    source: ['learning_engine', 'energy_model', 'mood_trend', 'behavior_model'],
    factors,
  };
}

/**
 * Signal: habit_strength (0–1)
 * Overall consistency of the user's habit practice.
 */
function computeHabitStrength(ctx) {
  const { activeHabits, habitsCompletedToday, totalHabitsToday } = ctx;
  const factors = {};

  if (activeHabits.length === 0) {
    return { value: 0, confidence: 'low', source: ['no_habits'], factors: { reason: 'no_active_habits' } };
  }

  const todayRate = totalHabitsToday > 0 ? habitsCompletedToday / totalHabitsToday : 0;
  factors.today_completion_rate = parseFloat(todayRate.toFixed(2));

  const streaks = activeHabits.map(h => h.current_streak || 0);
  const avgStreak = streaks.reduce((a, b) => a + b, 0) / streaks.length;
  const maxStreak = Math.max(...streaks);
  const streakScore = Math.min(1, avgStreak / 14);
  factors.avg_streak = parseFloat(avgStreak.toFixed(1));
  factors.max_streak = maxStreak;
  factors.streak_score = parseFloat(streakScore.toFixed(2));
  factors.active_habit_count = activeHabits.length;

  // Weighted: 40% today rate + 40% streak score + 20% consistency bonus
  const consistencyBonus = maxStreak >= 21 ? 0.2 : maxStreak >= 14 ? 0.15 : maxStreak >= 7 ? 0.1 : 0.05;
  const value = todayRate * 0.4 + streakScore * 0.4 + consistencyBonus;

  return {
    value: parseFloat(clamp(value, 0, 1).toFixed(3)),
    confidence: activeHabits.length >= 3 ? 'medium' : 'low',
    source: ['habit_data'],
    factors,
  };
}

/**
 * Signal: optimal_task_type (categorical)
 * ENHANCED: considers behavior state, not just raw numbers
 */
function computeOptimalTaskType(ctx, signals) {
  const { energy, hour, overdueTasks, completedToday, todayTasks, mood } = ctx;
  const burnoutRisk = signals.burnout_risk?.value || 0;
  const focusScore = signals.focus_score?.value || 50;
  const procRisk = signals.procrastination_risk?.value || 0;
  const factors = {};

  let taskType;
  let reason;

  // Priority 1: Burnout protection
  if (burnoutRisk >= 0.65) {
    taskType = 'break';
    reason = 'burnout_protection';
    factors.trigger = `burnout_risk ${(burnoutRisk * 100).toFixed(0)}% >= 65%`;
  }
  // Priority 2: Energy critically low
  else if (energy < 25) {
    taskType = 'break';
    reason = 'energy_critically_low';
    factors.trigger = `energy ${energy}% < 25%`;
  }
  // Priority 3: High procrastination → small wins to build momentum
  else if (procRisk >= 0.6 && completedToday === 0) {
    taskType = 'quick_win';
    reason = 'procrastination_counter';
    factors.trigger = `procrastination ${(procRisk * 100).toFixed(0)}% + no completions today`;
  }
  // Priority 4: Peak conditions → deep work
  else if (focusScore >= 65 && energy >= 65 && mood >= 5) {
    taskType = 'deep_work';
    reason = 'peak_conditions';
    factors.trigger = `focus ${focusScore}% + energy ${energy}% + mood ${mood}`;
  }
  // Priority 5: Good energy but scattered → structured work
  else if (energy >= 55 && focusScore < 50 && overdueTasks.length > 3) {
    taskType = 'structured_catchup';
    reason = 'energy_but_scattered';
    factors.trigger = `energy OK but focus low + ${overdueTasks.length} overdue`;
  }
  // Priority 6: Low energy → habits or light tasks
  else if (energy < 45) {
    taskType = (overdueTasks.length > 0 && overdueTasks.length <= 2) ? 'light_task' : 'habit';
    reason = energy < 35 ? 'energy_low' : 'energy_moderate_low';
    factors.trigger = `energy ${energy}% < 45%`;
  }
  // Priority 7: Late night
  else if (hour >= 22 || hour < 6) {
    taskType = overdueTasks.length > 0 ? 'light_task' : 'break';
    reason = 'late_night';
    factors.trigger = `hour ${hour}`;
  }
  // Priority 8: Momentum — already productive, keep going
  else if (completedToday >= 3 && energy >= 50) {
    taskType = 'deep_work';
    reason = 'momentum_ride';
    factors.trigger = `${completedToday} completed today + energy ${energy}%`;
  }
  // Default: moderate work
  else {
    taskType = 'light_task';
    reason = 'moderate_conditions';
    factors.trigger = 'default';
  }

  factors.energy = energy;
  factors.focus_score = focusScore;
  factors.burnout_risk = parseFloat(burnoutRisk.toFixed(3));
  factors.procrastination_risk = parseFloat(procRisk.toFixed(3));
  factors.hour = hour;
  factors.completed_today = completedToday;

  return {
    value: taskType,
    confidence: burnoutRisk >= 0.5 || energy < 30 ? 'high' : 'medium',
    source: ['rule_engine', 'signal_aggregation', 'behavior_model'],
    factors,
    reason,
  };
}

/**
 * NEW Signal: momentum_state (categorical)
 * Detects user's current behavioral pattern:
 *   - 'avoidance': ignoring tasks, high procrastination
 *   - 'overwhelmed': too many tasks, low energy, paralyzed
 *   - 'productive': actively completing tasks
 *   - 'coasting': doing easy tasks, avoiding hard ones (fake productivity)
 *   - 'starting': beginning of day, no pattern yet
 *   - 'winding_down': end of day
 */
function computeMomentumState(ctx, signals) {
  const { hour, energy, completedToday, overdueTasks, todayTasks, mood } = ctx;
  const procRisk = signals.procrastination_risk?.value || 0;
  const burnoutRisk = signals.burnout_risk?.value || 0;
  const totalActive = overdueTasks.length + todayTasks.length;
  const factors = {};

  let state;
  let description;
  let actionHint;

  // Detect avoidance behavior
  if (procRisk >= 0.5 && completedToday === 0 && hour >= 12) {
    state = 'avoidance';
    description = 'تأخير في البدء — سلوك تجنّبي واضح';
    actionHint = 'ابدأ بمهمة صغيرة جداً (5 دقائق)';
    factors.pattern = 'late_start_no_activity';
  }
  // Detect overwhelm
  else if (totalActive > 8 && energy < 45 && mood <= 4) {
    state = 'overwhelmed';
    description = 'مهام كثيرة + طاقة منخفضة = شعور بالإرهاق';
    actionHint = 'ركّز على مهمة واحدة فقط';
    factors.pattern = 'high_load_low_energy_low_mood';
  }
  // Detect productive momentum
  else if (completedToday >= 2 && energy >= 50) {
    state = 'productive';
    description = 'زخم إنتاجي ممتاز!';
    actionHint = 'استغل الزخم — تقدّم بمهمة صعبة';
    factors.pattern = 'active_good_energy';
  }
  // Detect fake productivity (completing only easy tasks while hard ones pile up)
  else if (completedToday >= 2 && overdueTasks.length > 4) {
    state = 'coasting';
    description = 'إنجاز مهام سهلة وتجاهل الصعبة';
    actionHint = 'حان وقت المهمة الأصعب — ابدأها 10 دقائق فقط';
    factors.pattern = 'easy_completions_hard_avoided';
  }
  // End of day
  else if (hour >= 21 || burnoutRisk >= 0.5) {
    state = 'winding_down';
    description = 'وقت الراحة والتخطيط للغد';
    actionHint = 'راجع إنجازاتك وخطط لغد';
    factors.pattern = 'late_or_tired';
  }
  // Starting
  else {
    state = 'starting';
    description = 'بداية يوم جديد';
    actionHint = 'اختر أول مهمة وابدأ';
    factors.pattern = 'default_start';
  }

  factors.hour = hour;
  factors.completed_today = completedToday;
  factors.total_active = totalActive;
  factors.energy = energy;
  factors.mood = ctx.mood;

  return {
    value: state,
    description,
    actionHint,
    confidence: 'medium',
    source: ['behavior_analysis', 'signal_aggregation'],
    factors,
  };
}

/**
 * NEW Signal: overwhelm_index (0–1)
 * Composite measure of how overwhelmed the user feels
 */
function computeOverwhelmIndex(ctx, signals) {
  const { overdueTasks, todayTasks, energy, mood } = ctx;
  const totalActive = overdueTasks.length + todayTasks.length;
  const burnout = signals.burnout_risk?.value || 0;
  const factors = {};

  // Task volume pressure (non-linear)
  const volumePressure = sigmoid(totalActive / 15, 0.4, 6);
  factors.volume_pressure = parseFloat(volumePressure.toFixed(3));

  // Overdue weight
  const overduePressure = overdueTasks.length > 0
    ? sigmoid(overdueTasks.length / totalActive, 0.3, 8) * 0.3
    : 0;
  factors.overdue_pressure = parseFloat(overduePressure.toFixed(3));

  // Resource depletion (low energy + low mood)
  const resourceDrain = clamp((100 - energy) / 100 * 0.3 + (10 - mood) / 10 * 0.2, 0, 0.5);
  factors.resource_drain = parseFloat(resourceDrain.toFixed(3));

  // Burnout amplifier
  const burnoutAmp = burnout * 0.2;
  factors.burnout_amplifier = parseFloat(burnoutAmp.toFixed(3));

  const value = clamp(volumePressure * 0.35 + overduePressure + resourceDrain + burnoutAmp, 0, 1);

  return {
    value: parseFloat(value.toFixed(3)),
    confidence: totalActive > 0 ? 'medium' : 'low',
    source: ['task_analysis', 'resource_model', 'behavior_model'],
    factors,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN: getIntelligenceSignals(userId, options)
// ═══════════════════════════════════════════════════════════════════════════

async function getIntelligenceSignals(userId, options = {}) {
  const startMs = Date.now();
  const { timezone = 'Africa/Cairo' } = options;

  const models  = getModels();
  const learning = getLearning();
  const nowTz   = moment().tz(timezone);
  const hour    = nowTz.hour();
  const todayStr = nowTz.format('YYYY-MM-DD');
  const { Op } = require('sequelize');

  // ── Gather raw data ─────────────────────────────────────────────────────
  let overdueTasks = [];
  let todayTasks   = [];
  let completedToday = 0;
  let activeHabits = [];
  let habitsCompletedToday = 0;
  let totalHabitsToday = 0;
  let mood = options.mood || 5;
  let recentMoods = [];

  // Tasks — FIXED: use only columns that exist in actual DB schema
  if (models.Task) {
    try {
      const allPending = await models.Task.findAll({
        where: { user_id: userId, status: { [Op.in]: ['pending', 'in_progress'] } },
        attributes: ['id', 'title', 'priority', 'due_date', 'start_time', 'energy_required', 'estimated_duration', 'category', 'status'],
        order: [['due_date', 'ASC']],
        limit: 50,
        raw: true,
      });

      for (const t of allPending) {
        const due = t.due_date ? String(t.due_date).split('T')[0].split(' ')[0] : null;
        if (due && due < todayStr) overdueTasks.push(t);
        else todayTasks.push(t);
      }

      // Completed today count
      completedToday = await models.Task.count({
        where: {
          user_id: userId,
          status: 'completed',
          completed_at: { [Op.gte]: `${todayStr}T00:00:00` },
        },
      });
    } catch (e) { logger.warn('[INTELLIGENCE] Task load error:', String(e.message || e).slice(0, 200)); }
  }

  // Habits
  if (models.Habit) {
    try {
      const habits = await models.Habit.findAll({
        where: { user_id: userId, is_active: true },
        attributes: ['id', 'name', 'name_ar', 'current_streak', 'target_time', 'preferred_time', 'frequency'],
        limit: 20,
        raw: true,
      });
      activeHabits = habits;
      totalHabitsToday = habits.length;

      if (models.HabitLog) {
        const logs = await models.HabitLog.findAll({
          where: { user_id: userId, log_date: todayStr, completed: true },
          attributes: ['habit_id'],
          raw: true,
        });
        habitsCompletedToday = logs.length;
      }
    } catch (e) { logger.debug('[INTELLIGENCE] Habit load error:', String(e.message || e).slice(0, 200)); }
  }

  // Mood
  if (models.MoodEntry && !options.mood) {
    try {
      const todayMood = await models.MoodEntry.findOne({
        where: { user_id: userId, entry_date: todayStr },
        order: [['createdAt', 'DESC']],
        attributes: ['mood_score'],
        raw: true,
      });
      if (todayMood) mood = todayMood.mood_score || 5;

      const weekAgo = moment().tz(timezone).subtract(7, 'days').format('YYYY-MM-DD');
      const recentEntries = await models.MoodEntry.findAll({
        where: { user_id: userId, entry_date: { [Op.gte]: weekAgo } },
        attributes: ['mood_score'],
        raw: true,
      });
      recentMoods = recentEntries.map(e => e.mood_score || 5);
    } catch (e) { logger.debug('[INTELLIGENCE] Mood load error:', String(e.message || e).slice(0, 200)); }
  }

  // Warm up learning engine
  if (learning) {
    try { await learning.warmup(userId); } catch (_e) { /* non-critical */ }
  }

  // ── Compute energy first (other signals depend on it) ────────────────────
  const energyCtx = { hour, mood, learning, userId, completedToday };
  const energySignal = computeEnergyLevel(energyCtx);
  const effectiveEnergy = options.energy || energySignal.value;

  // ── Build shared context ────────────────────────────────────────────────
  const ctx = {
    userId, hour, todayStr,
    energy: effectiveEnergy,
    mood, recentMoods,
    overdueTasks, todayTasks, completedToday,
    activeHabits, habitsCompletedToday, totalHabitsToday,
    learning,
  };

  // ── Compute all signals ─────────────────────────────────────────────────
  const signals = {};
  signals.completion_probability = computeCompletionProbability(ctx);
  signals.procrastination_risk   = computeProcrastinationRisk(ctx);
  signals.energy_level           = energySignal;
  signals.focus_score            = computeFocusScore(ctx);
  signals.burnout_risk           = computeBurnoutRisk(ctx);
  signals.habit_strength         = computeHabitStrength(ctx);
  signals.optimal_task_type      = computeOptimalTaskType(ctx, signals);
  // NEW v2 signals
  signals.momentum_state         = computeMomentumState(ctx, signals);
  signals.overwhelm_index        = computeOverwhelmIndex(ctx, signals);

  // ── Meta ────────────────────────────────────────────────────────────────
  signals._meta = {
    version: SIGNAL_VERSION,
    userId,
    timezone,
    hour,
    today: todayStr,
    computation_ms: Date.now() - startMs,
    timestamp: new Date().toISOString(),
    data_summary: {
      overdue_count: overdueTasks.length,
      today_count: todayTasks.length,
      completed_today: completedToday,
      active_habits: activeHabits.length,
      habits_done_today: habitsCompletedToday,
      mood_score: mood,
      effective_energy: effectiveEnergy,
    },
  };

  logger.info(`[INTELLIGENCE] v2 signals: user=${userId} overdue=${overdueTasks.length} today=${todayTasks.length} energy=${effectiveEnergy} [${signals._meta.computation_ms}ms]`);
  return signals;
}

/**
 * Quick summary of intelligence signals (for logging/debugging).
 */
function summarizeSignals(signals) {
  return {
    completion: signals.completion_probability?.value,
    procrastination: signals.procrastination_risk?.value,
    energy: signals.energy_level?.value,
    focus: signals.focus_score?.value,
    burnout: signals.burnout_risk?.value,
    habit: signals.habit_strength?.value,
    task_type: signals.optimal_task_type?.value,
    momentum: signals.momentum_state?.value,
    overwhelm: signals.overwhelm_index?.value,
  };
}

module.exports = {
  getIntelligenceSignals,
  summarizeSignals,
  // Expose for testing
  _computeCompletionProbability: computeCompletionProbability,
  _computeProcrastinationRisk: computeProcrastinationRisk,
  _computeEnergyLevel: computeEnergyLevel,
  _computeFocusScore: computeFocusScore,
  _computeBurnoutRisk: computeBurnoutRisk,
  _computeHabitStrength: computeHabitStrength,
  _computeOptimalTaskType: computeOptimalTaskType,
  _computeMomentumState: computeMomentumState,
  _computeOverwhelmIndex: computeOverwhelmIndex,
  BASELINE_ENERGY_CURVE,
};
