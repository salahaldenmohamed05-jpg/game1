/**
 * Behavioral Engine — Atomic Habits Implementation
 * ===================================================
 * Based on James Clear's "Atomic Habits" 4 Laws of Behavior Change:
 *
 *   HABIT LOOP: Cue → Craving → Response → Reward
 *
 *   LAW 1 (CUE):      Make it OBVIOUS     — environment design, implementation intentions
 *   LAW 2 (CRAVING):  Make it ATTRACTIVE   — temptation bundling, social proof
 *   LAW 3 (RESPONSE): Make it EASY         — reduce friction, 2-minute rule
 *   LAW 4 (REWARD):   Make it SATISFYING   — immediate reward, habit tracking
 *
 * IDENTITY-BASED HABITS:
 *   - Focus on WHO you want to become, not WHAT you want to achieve
 *   - Every action is a vote for the type of person you want to be
 *   - Strongest habits are identity-reinforcing ("I am a person who...")
 *
 * This engine is a RULE-BASED SYSTEM (not ML) that takes behavioral inputs
 * and produces actionable outputs for the entire app.
 *
 * INPUTS:  skips, streak, completion_rate, time_of_day, energy_level,
 *          consecutive_completions, days_since_last_activity, mood_score
 * OUTPUTS: next_best_action, assistant_tone, reward_intensity, task_reorder_strategy,
 *          notification_urgency, identity_statement, cue_suggestion
 */

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

export const ENERGY_LEVELS = {
  high:   { label: 'طاقة عالية', value: 3, window: [6, 12] },
  medium: { label: 'طاقة متوسطة', value: 2, window: [12, 18] },
  low:    { label: 'طاقة منخفضة', value: 1, window: [18, 24] },
};

export const BEHAVIOR_STATES = {
  MOMENTUM:      'momentum',       // 3+ consecutive completions today
  STEADY:        'steady',         // Regular activity, no streak risk
  STARTING:      'starting',       // New user or new habit (< 7 days)
  SLIPPING:      'slipping',       // Missed 1-2 days, streak at risk
  COMEBACK:      'comeback',       // Returning after 3+ days absence
  BURNOUT_RISK:  'burnout_risk',   // Too many tasks, low completion rate
  PROCRASTINATING: 'procrastinating', // Has tasks but keeps skipping
};

export const REWARD_LEVELS = {
  MICRO:    { level: 1, label: 'تقدم صغير', xp: 5,  emoji: '✅' },
  STANDARD: { level: 2, label: 'إنجاز',     xp: 15, emoji: '💪' },
  STREAK:   { level: 3, label: 'سلسلة',     xp: 30, emoji: '🔥' },
  MILESTONE:{ level: 4, label: 'إنجاز كبير', xp: 50, emoji: '🏆' },
  IDENTITY: { level: 5, label: 'هوية جديدة', xp: 100, emoji: '👑' },
};

// Milestone days that trigger celebrations
const STREAK_MILESTONES = [3, 7, 14, 21, 30, 60, 100, 365];

// ─── HELPER: Get Cairo hour ─────────────────────────────────────────────────
function getCairoHour() {
  try {
    const now = new Date();
    const cairo = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    return cairo.getHours();
  } catch {
    return new Date().getHours();
  }
}

// ─── CORE: Detect Behavior State ────────────────────────────────────────────
/**
 * Analyzes user's current behavioral state based on multiple signals.
 * This is the CUE DETECTION layer — understanding where the user is
 * in their behavioral cycle.
 *
 * @param {Object} inputs
 * @param {number} inputs.skips             - Tasks skipped today
 * @param {number} inputs.streak            - Current longest habit streak (days)
 * @param {number} inputs.completionRate    - Today's completion % (0-100)
 * @param {number} inputs.consecutiveCompletions - Tasks completed in a row today
 * @param {number} inputs.daysSinceLastActivity  - Days since last check-in
 * @param {number} inputs.totalTasksToday   - Total tasks for today
 * @param {number} inputs.completedToday    - Tasks completed today
 * @param {number} inputs.habitsCompletedToday - Habits completed today
 * @param {number} inputs.habitsTotal       - Total habits
 * @returns {string} One of BEHAVIOR_STATES
 */
export function detectBehaviorState(inputs) {
  const {
    skips = 0,
    streak = 0,
    completionRate = 0,
    consecutiveCompletions = 0,
    daysSinceLastActivity = 0,
    totalTasksToday = 0,
    completedToday = 0,
    habitsCompletedToday = 0,
    habitsTotal = 0,
  } = inputs || {};

  // Comeback: absent 3+ days
  if (daysSinceLastActivity >= 3) return BEHAVIOR_STATES.COMEBACK;

  // Burnout risk: high load + low completion
  if (totalTasksToday > 8 && completionRate < 30) return BEHAVIOR_STATES.BURNOUT_RISK;

  // Procrastinating: has tasks but keeps skipping
  if (skips >= 3 && completedToday === 0 && totalTasksToday > 0) return BEHAVIOR_STATES.PROCRASTINATING;

  // Momentum: 3+ consecutive completions today
  if (consecutiveCompletions >= 3) return BEHAVIOR_STATES.MOMENTUM;

  // Slipping: missed 1-2 days OR streak dropping
  if (daysSinceLastActivity >= 1 && daysSinceLastActivity < 3 && streak > 3) return BEHAVIOR_STATES.SLIPPING;

  // Starting: new user or new habit pattern
  if (streak < 7 && habitsTotal > 0 && habitsCompletedToday <= 1) return BEHAVIOR_STATES.STARTING;

  // Default: steady
  return BEHAVIOR_STATES.STEADY;
}

// ─── CORE: Compute Energy Level ─────────────────────────────────────────────
/**
 * Estimates energy level based on time of day and optional explicit input.
 * Follows Atomic Habits principle: match task difficulty to energy.
 *
 * @param {string|null} explicitEnergy - 'high', 'medium', 'low' or null
 * @returns {{ level: string, value: number, label: string }}
 */
export function computeEnergyLevel(explicitEnergy = null) {
  if (explicitEnergy && ENERGY_LEVELS[explicitEnergy]) {
    return { level: explicitEnergy, ...ENERGY_LEVELS[explicitEnergy] };
  }

  const hour = getCairoHour();
  // Morning (6-12): peak energy
  if (hour >= 6 && hour < 12) return { level: 'high', ...ENERGY_LEVELS.high };
  // Afternoon (12-16): moderate
  if (hour >= 12 && hour < 16) return { level: 'medium', ...ENERGY_LEVELS.medium };
  // Late afternoon (16-20): declining
  if (hour >= 16 && hour < 20) return { level: 'medium', ...ENERGY_LEVELS.medium };
  // Evening/Night: low
  return { level: 'low', ...ENERGY_LEVELS.low };
}

// ─── CORE: Determine Reward Intensity ───────────────────────────────────────
/**
 * LAW 4: Make it SATISFYING
 * Calculates reward intensity based on context.
 * Higher rewards for:
 *   - Milestone streaks (7, 14, 21, 30...)
 *   - Breaking procrastination
 *   - Completing hard tasks during low energy
 *   - First completion of the day
 *
 * @param {Object} context
 * @returns {{ level: Object, xpBonus: number, message: string, emoji: string }}
 */
export function computeRewardIntensity(context) {
  const {
    streak = 0,
    completedToday = 0,
    taskPriority = 'medium',
    energyLevel = 'medium',
    behaviorState = BEHAVIOR_STATES.STEADY,
    isFirstOfDay = false,
    isHabit = false,
  } = context || {};

  let baseLevel = REWARD_LEVELS.MICRO;
  let xpBonus = 0;
  let messages = [];

  // Streak milestone check
  const isMilestone = STREAK_MILESTONES.includes(streak);
  if (isMilestone && isHabit) {
    baseLevel = streak >= 30 ? REWARD_LEVELS.IDENTITY : REWARD_LEVELS.MILESTONE;
    xpBonus += streak >= 30 ? 100 : 50;
    messages.push(streak >= 30
      ? `${streak} يوم! دي مش عادة — دي هوية جديدة`
      : `${streak} يوم متتالي — سلسلة قوية`
    );
  }

  // First completion of the day (breaking inertia)
  if (isFirstOfDay) {
    xpBonus += 10;
    messages.push('أول إنجاز اليوم — البداية أصعب خطوة');
  }

  // Completing hard task during low energy (extra impressive)
  if (taskPriority === 'urgent' || taskPriority === 'high') {
    if (energyLevel === 'low') {
      xpBonus += 20;
      messages.push('مهمة صعبة وطاقتك منخفضة — إرادة حقيقية');
    }
    if (!isMilestone) baseLevel = REWARD_LEVELS.STANDARD;
  }

  // Breaking procrastination
  if (behaviorState === BEHAVIOR_STATES.PROCRASTINATING) {
    xpBonus += 15;
    messages.push('كسرت حاجز التأجيل — دي خطوة كبيرة');
  }

  // Comeback completion
  if (behaviorState === BEHAVIOR_STATES.COMEBACK) {
    xpBonus += 20;
    messages.push('رجعت وبدأت — دا أهم من أي شيء');
  }

  // Momentum bonus
  if (behaviorState === BEHAVIOR_STATES.MOMENTUM) {
    xpBonus += 10;
    if (!isMilestone && completedToday >= 3) baseLevel = REWARD_LEVELS.STREAK;
  }

  return {
    level: baseLevel,
    xpBonus,
    totalXP: baseLevel.xp + xpBonus,
    message: messages[0] || baseLevel.label,
    allMessages: messages,
    emoji: baseLevel.emoji,
  };
}

// ─── CORE: Determine Next Best Action ───────────────────────────────────────
/**
 * The "obvious" choice engine. Uses Atomic Habits principles:
 *   1. Environment design (time-matching)
 *   2. Two-minute rule (start small when energy is low)
 *   3. Habit stacking (what naturally follows what you just did)
 *   4. Identity reinforcement (connect action to identity)
 *
 * @param {Object} inputs - All behavioral inputs
 * @param {Array} tasks - Available tasks
 * @param {Array} habits - Available habits
 * @returns {{ action: Object, reasoning: string[], strategy: string }}
 */
export function computeNextBestAction(inputs, tasks = [], habits = []) {
  const energy = computeEnergyLevel(inputs.energyLevel);
  const state = detectBehaviorState(inputs);
  const hour = getCairoHour();
  const reasoning = [];

  // Strategy based on behavior state
  let strategy = 'normal';

  switch (state) {
    case BEHAVIOR_STATES.MOMENTUM:
      strategy = 'ride_momentum';
      reasoning.push('عندك زخم ممتاز — استغله وكمّل المهام الصعبة');
      break;
    case BEHAVIOR_STATES.PROCRASTINATING:
      strategy = 'two_minute_rule';
      reasoning.push('ابدأ بمهمة صغيرة جداً — أول خطوة هي الأصعب');
      break;
    case BEHAVIOR_STATES.COMEBACK:
      strategy = 'gentle_restart';
      reasoning.push('مرحباً بعودتك — ابدأ بأسهل شيء عندك');
      break;
    case BEHAVIOR_STATES.BURNOUT_RISK:
      strategy = 'reduce_friction';
      reasoning.push('عندك حمل زيادة — ركّز على أهم 3 مهام بس');
      break;
    case BEHAVIOR_STATES.SLIPPING:
      strategy = 'streak_save';
      reasoning.push('السلسلة في خطر — سجّل عادة واحدة على الأقل');
      break;
    case BEHAVIOR_STATES.STARTING:
      strategy = 'build_identity';
      reasoning.push('كل يوم بتعمل فيه ده بتقول: أنا شخص منضبط');
      break;
    default:
      strategy = 'energy_match';
      reasoning.push(`طاقتك ${energy.label} — هنختار مهمة تناسبك`);
  }

  // Sort tasks by strategy
  const sortedTasks = [...tasks].filter(t => t.status !== 'completed');
  const sortedHabits = [...habits].filter(h => !h.completed_today);

  // Priority mapping
  const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 };

  // Sort based on strategy
  sortedTasks.sort((a, b) => {
    switch (strategy) {
      case 'two_minute_rule':
        // Easiest first (low priority, no time constraint)
        return (priorityWeight[a.priority] || 2) - (priorityWeight[b.priority] || 2);
      case 'ride_momentum':
        // Hardest first (maximize momentum)
        return (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2);
      case 'gentle_restart':
        // Easiest first
        return (priorityWeight[a.priority] || 2) - (priorityWeight[b.priority] || 2);
      case 'reduce_friction':
        // Urgent only
        return (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2);
      case 'energy_match':
        // High energy → hard tasks, Low energy → easy tasks
        if (energy.level === 'high') {
          return (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2);
        }
        return (priorityWeight[a.priority] || 2) - (priorityWeight[b.priority] || 2);
      default:
        // Time-based then priority
        const timeA = a.due_time || a.start_time || '99:99';
        const timeB = b.due_time || b.start_time || '99:99';
        if (timeA !== timeB) return timeA.localeCompare(timeB);
        return (priorityWeight[b.priority] || 2) - (priorityWeight[a.priority] || 2);
    }
  });

  // Streak save: habits first
  if (strategy === 'streak_save' && sortedHabits.length > 0) {
    const atRisk = sortedHabits
      .filter(h => (h.current_streak || 0) >= 3)
      .sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0));

    if (atRisk.length > 0) {
      return {
        action: { type: 'habit', item: atRisk[0], reason: 'streak_save' },
        reasoning: [...reasoning, `${atRisk[0].name}: ${atRisk[0].current_streak} يوم — لا تقطعها!`],
        strategy,
        behaviorState: state,
        energyLevel: energy,
      };
    }
  }

  // Time-matched habits
  const timeMatchedHabit = sortedHabits.find(h => {
    const targetTime = h.target_time || h.preferred_time || h.ai_best_time;
    if (!targetTime) return false;
    const targetHour = parseInt(targetTime.split(':')[0], 10);
    return Math.abs(hour - targetHour) <= 1;
  });

  if (timeMatchedHabit) {
    reasoning.push(`الآن وقت "${timeMatchedHabit.name}" — ابدأها`);
    return {
      action: { type: 'habit', item: timeMatchedHabit, reason: 'time_match' },
      reasoning,
      strategy,
      behaviorState: state,
      energyLevel: energy,
    };
  }

  // Default: first sorted task
  if (sortedTasks.length > 0) {
    return {
      action: { type: 'task', item: sortedTasks[0], reason: strategy },
      reasoning,
      strategy,
      behaviorState: state,
      energyLevel: energy,
    };
  }

  // No tasks: suggest habit
  if (sortedHabits.length > 0) {
    return {
      action: { type: 'habit', item: sortedHabits[0], reason: 'no_tasks' },
      reasoning: [...reasoning, 'كل المهام مكتملة — وقت العادات'],
      strategy,
      behaviorState: state,
      energyLevel: energy,
    };
  }

  return {
    action: { type: 'rest', item: null, reason: 'all_done' },
    reasoning: ['كل شيء مكتمل — أحسنت! خذ استراحة مستحقة'],
    strategy,
    behaviorState: state,
    energyLevel: energy,
  };
}

// ─── CORE: Determine Assistant Tone ─────────────────────────────────────────
/**
 * Adjusts the assistant's communication style based on behavior state.
 * Follows the response structure: [Hook] → [Reality Check] → [Action] → [Reinforcement]
 *
 * @param {string} behaviorState
 * @param {Object} context
 * @returns {{ tone: string, intensity: string, hooks: string[], style: string }}
 */
export function computeAssistantTone(behaviorState, context = {}) {
  const { completionRate = 0, streak = 0, consecutiveCompletions = 0 } = context;

  switch (behaviorState) {
    case BEHAVIOR_STATES.MOMENTUM:
      return {
        tone: 'energetic',
        intensity: 'high',
        style: 'challenging',
        hooks: ['أنت ماشي بقوة!', 'الزخم ده مش عادي!', 'مين يوقفك؟'],
        reinforcement: 'كل مهمة بتكملها بتثبت إنك شخص منجز',
      };
    case BEHAVIOR_STATES.PROCRASTINATING:
      return {
        tone: 'direct',
        intensity: 'medium',
        style: 'practical',
        hooks: ['ابدأ بحاجة صغيرة — دقيقتين بس', 'مش لازم تكون جاهز، ابدأ وهتلاقي نفسك جاهز'],
        reinforcement: 'أول خطوة أصعب من الباقي كله',
      };
    case BEHAVIOR_STATES.COMEBACK:
      return {
        tone: 'warm',
        intensity: 'gentle',
        style: 'supportive',
        hooks: ['أهلاً بعودتك!', 'رجوعك أهم من اللي فاتك'],
        reinforcement: 'كل يوم جديد فرصة تبدأ من جديد',
      };
    case BEHAVIOR_STATES.BURNOUT_RISK:
      return {
        tone: 'calm',
        intensity: 'low',
        style: 'protective',
        hooks: ['خذ نفس — مش كل حاجة لازم تتعمل النهاردة', 'صحتك أولاً'],
        reinforcement: 'الراحة جزء من الإنتاجية',
      };
    case BEHAVIOR_STATES.SLIPPING:
      return {
        tone: 'urgent',
        intensity: 'high',
        style: 'loss_aversion',
        hooks: ['السلسلة في خطر!', 'يوم واحد ممكن يضيع مجهود أيام'],
        reinforcement: 'سجّل عادة واحدة بس — ده كفاية تحافظ على السلسلة',
      };
    case BEHAVIOR_STATES.STARTING:
      return {
        tone: 'encouraging',
        intensity: 'medium',
        style: 'identity_building',
        hooks: ['كل مرة بتعمل ده بتقول: أنا شخص جديد', 'البدايات أهم من النتائج'],
        reinforcement: 'أنت مش بتعمل مهمة — أنت بتبني شخصية',
      };
    default:
      return {
        tone: 'balanced',
        intensity: 'medium',
        style: 'motivational',
        hooks: ['يلا نكمّل', 'وقت الشغل'],
        reinforcement: 'كل خطوة بتقربك من اللي عايز تكونه',
      };
  }
}

// ─── CORE: Compute Task Reorder Strategy ────────────────────────────────────
/**
 * LAW 3: Make it EASY — reduce friction by reordering tasks
 * based on current energy and behavior state.
 *
 * @param {Array} tasks
 * @param {string} behaviorState
 * @param {string} energyLevel
 * @returns {Array} Reordered tasks
 */
export function reorderTasks(tasks, behaviorState, energyLevel) {
  if (!Array.isArray(tasks) || tasks.length === 0) return tasks;

  const priorityWeight = { urgent: 4, high: 3, medium: 2, low: 1 };
  const sorted = [...tasks];

  sorted.sort((a, b) => {
    // Always put time-specific tasks first
    const aHasTime = !!(a.due_time || a.start_time);
    const bHasTime = !!(b.due_time || b.start_time);
    if (aHasTime && !bHasTime) return -1;
    if (!aHasTime && bHasTime) return 1;
    if (aHasTime && bHasTime) {
      const timeA = a.due_time || a.start_time;
      const timeB = b.due_time || b.start_time;
      if (timeA !== timeB) return timeA.localeCompare(timeB);
    }

    // Then by behavior state strategy
    const pA = priorityWeight[a.priority] || 2;
    const pB = priorityWeight[b.priority] || 2;

    switch (behaviorState) {
      case BEHAVIOR_STATES.PROCRASTINATING:
      case BEHAVIOR_STATES.COMEBACK:
        // Easiest first to build momentum
        return pA - pB;
      case BEHAVIOR_STATES.MOMENTUM:
      case BEHAVIOR_STATES.STEADY:
        // Hardest first to leverage energy
        if (energyLevel === 'high') return pB - pA;
        return pA - pB;
      case BEHAVIOR_STATES.BURNOUT_RISK:
        // Only urgent, skip the rest mentally
        return pB - pA;
      default:
        return pB - pA;
    }
  });

  return sorted;
}

// ─── CORE: Generate Identity Statement ──────────────────────────────────────
/**
 * IDENTITY-BASED HABITS — the most powerful concept in Atomic Habits.
 * "Every action is a vote for the type of person you want to be."
 *
 * Generates contextual identity statements based on user's habits and streaks.
 *
 * @param {Array} habits - User's habits with streak data
 * @param {Object} context
 * @returns {string|null} Identity statement in Arabic
 */
export function generateIdentityStatement(habits, context = {}) {
  if (!Array.isArray(habits) || habits.length === 0) return null;

  const best = habits.reduce((a, b) =>
    (a.current_streak || 0) > (b.current_streak || 0) ? a : b, habits[0]);
  const streak = best.current_streak || 0;

  if (streak < 3) return null;

  const name = best.name || 'العادة';

  // Identity statements escalate with streak length
  if (streak >= 100) return `أنت شخص ملتزم — 100+ يوم من "${name}" بلا توقف. دي هوية، مش عادة`;
  if (streak >= 60)  return `60 يوم من "${name}" — أنت أصبحت شخص مختلف تماماً عن اللي بدأ`;
  if (streak >= 30)  return `شهر كامل من "${name}" — دي مش عادة، دي جزء من شخصيتك`;
  if (streak >= 21)  return `21 يوم من "${name}" — العلم بيقول إنت كده بنيت عادة حقيقية`;
  if (streak >= 14)  return `أسبوعين من "${name}" — أنت بتثبت لنفسك إنك تقدر`;
  if (streak >= 7)   return `أسبوع كامل من "${name}" — كل يوم صوت جديد لشخصيتك الجديدة`;
  return `${streak} أيام من "${name}" — استمر وهتتغير`;
}

// ─── CORE: Compute Notification Urgency ─────────────────────────────────────
/**
 * Determines how urgent/persistent notifications should be based on
 * behavior state and context.
 *
 * @param {string} behaviorState
 * @param {Object} context
 * @returns {{ urgency: string, frequency: string, tone: string }}
 */
export function computeNotificationUrgency(behaviorState, context = {}) {
  const { streak = 0, completionRate = 0 } = context;

  switch (behaviorState) {
    case BEHAVIOR_STATES.SLIPPING:
      return {
        urgency: 'high',
        frequency: 'every_2h',
        tone: 'السلسلة في خطر — افتح التطبيق!',
      };
    case BEHAVIOR_STATES.PROCRASTINATING:
      return {
        urgency: 'medium',
        frequency: 'every_3h',
        tone: 'عندك مهام مستنياك — ابدأ بواحدة صغيرة',
      };
    case BEHAVIOR_STATES.MOMENTUM:
      return {
        urgency: 'low',
        frequency: 'daily',
        tone: 'ماشي بقوة! استمر',
      };
    case BEHAVIOR_STATES.BURNOUT_RISK:
      return {
        urgency: 'low',
        frequency: 'once',
        tone: 'خذ استراحة — صحتك أهم',
      };
    case BEHAVIOR_STATES.COMEBACK:
      return {
        urgency: 'medium',
        frequency: 'daily',
        tone: 'أهلاً بعودتك! ابدأ بحاجة بسيطة',
      };
    default:
      return {
        urgency: 'normal',
        frequency: 'daily',
        tone: 'يومك مستنيك — يلا نبدأ',
      };
  }
}

// ─── CORE: Generate Cue Suggestions ─────────────────────────────────────────
/**
 * LAW 1: Make it OBVIOUS — suggest environmental cues
 * "Implementation Intention: I will [BEHAVIOR] at [TIME] in [LOCATION]"
 *
 * @param {Object} habit
 * @param {Object} context
 * @returns {string} Arabic cue suggestion
 */
export function generateCueSuggestion(habit, context = {}) {
  const { hour = getCairoHour() } = context;
  const name = habit?.name || 'العادة';

  // Time-based cue suggestions
  if (hour >= 5 && hour < 8)  return `اربط "${name}" بروتين الصباح — بعد ما تصحى مباشرة`;
  if (hour >= 8 && hour < 12)  return `نفّذ "${name}" أول ما توصل الشغل أو الجامعة`;
  if (hour >= 12 && hour < 14) return `خلّي "${name}" جزء من استراحة الغدا`;
  if (hour >= 14 && hour < 18) return `"${name}" بعد العصر — ثبّتها في وقت محدد`;
  if (hour >= 18 && hour < 21) return `"${name}" قبل العشا — اعملها روتين مسائي`;
  return `"${name}" قبل ما تنام — آخر حاجة في يومك`;
}

// ─── MASTER FUNCTION: Full Behavioral Analysis ──────────────────────────────
/**
 * The main entry point. Takes all available data and produces
 * a complete behavioral analysis with all outputs.
 *
 * @param {Object} params
 * @returns {Object} Complete behavioral engine output
 */
export function analyzeBehavior(params) {
  const {
    tasks = [],
    habits = [],
    skips = 0,
    streak = 0,
    completionRate = 0,
    consecutiveCompletions = 0,
    daysSinceLastActivity = 0,
    moodScore = null,
    energyLevel = null,
  } = params || {};

  const totalTasksToday = tasks.length;
  const completedToday = tasks.filter(t => t.status === 'completed').length;
  const habitsCompletedToday = habits.filter(h => h.completed_today).length;
  const habitsTotal = habits.length;

  const inputs = {
    skips,
    streak,
    completionRate: totalTasksToday > 0 ? Math.round((completedToday / totalTasksToday) * 100) : completionRate,
    consecutiveCompletions,
    daysSinceLastActivity,
    totalTasksToday,
    completedToday,
    habitsCompletedToday,
    habitsTotal,
  };

  // 1. Detect state
  const behaviorState = detectBehaviorState(inputs);

  // 2. Compute energy
  const energy = computeEnergyLevel(energyLevel);

  // 3. Next best action
  const nextAction = computeNextBestAction(inputs, tasks, habits);

  // 4. Assistant tone
  const assistantTone = computeAssistantTone(behaviorState, inputs);

  // 5. Reward settings
  const rewardConfig = computeRewardIntensity({
    streak,
    completedToday,
    behaviorState,
    energyLevel: energy.level,
    isFirstOfDay: completedToday === 0,
  });

  // 6. Task reorder
  const reorderedTasks = reorderTasks(
    tasks.filter(t => t.status !== 'completed'),
    behaviorState,
    energy.level
  );

  // 7. Identity statement
  const identityStatement = generateIdentityStatement(habits);

  // 8. Notification config
  const notificationConfig = computeNotificationUrgency(behaviorState, inputs);

  return {
    behaviorState,
    energy,
    nextAction,
    assistantTone,
    rewardConfig,
    reorderedTasks,
    identityStatement,
    notificationConfig,
    inputs,
    timestamp: new Date().toISOString(),
  };
}

const behavioralEngine = {
  analyzeBehavior,
  detectBehaviorState,
  computeEnergyLevel,
  computeRewardIntensity,
  computeNextBestAction,
  computeAssistantTone,
  reorderTasks,
  generateIdentityStatement,
  computeNotificationUrgency,
  generateCueSuggestion,
  BEHAVIOR_STATES,
  REWARD_LEVELS,
  ENERGY_LEVELS,
};

export default behavioralEngine;
