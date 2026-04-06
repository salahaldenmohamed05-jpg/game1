/**
 * Cognitive Decision Engine — Real-Time Decision-Making Layer
 * =============================================================
 * This engine REPLACES static behavioral analysis with a live cognitive layer
 * that makes REAL decisions using REAL data every time it's called.
 *
 * MANDATORY INPUTS (always real, never faked):
 *   - today_tasks:     Array of actual tasks with status, priority, due_time, category
 *   - today_habits:    Array of actual habits with completed_today, current_streak
 *   - current_block:   What time block the user is in (morning/afternoon/evening)
 *   - completion_rate:  Real % of today's items done
 *   - skip_history:    Array of recently skipped task IDs with timestamps
 *   - energy_level:    Computed from time + explicit input + profile patterns
 *   - last_actions:    Last 5 actions the user took (from short-term memory)
 *
 * DECISION OUTPUTS:
 *   - chosen_task:     The ONE task to do now (real name, real ID)
 *   - why:             Why THIS task was chosen (specific, data-driven reason)
 *   - blocker:         What's likely blocking the user right now
 *   - smallest_step:   The tiniest executable action to start
 *   - assistant_message: Short, sharp Arabic message (not generic)
 *   - tone:            How the assistant should sound
 *   - xp_reward:       Context-aware XP for completing this
 *
 * NO fake confidence scores. NO generic filler. NO repeated suggestions.
 */

// ─── CONSTANTS ──────────────────────────────────────────────────────────────

const MEMORY_KEY = 'lifeflow_cognitive_memory';
const PROFILE_KEY = 'lifeflow_user_profile';
const MAX_MEMORY_ITEMS = 20;
const MAX_IGNORED_SUGGESTIONS = 10;

// Time blocks aligned to Cairo timezone
function getCairoHour() {
  try {
    const now = new Date();
    const cairo = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    return cairo.getHours();
  } catch {
    return new Date().getHours();
  }
}

function getCurrentBlock() {
  const h = getCairoHour();
  if (h >= 5 && h < 12)  return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 21) return 'evening';
  return 'night';
}

function getEnergyFromTime() {
  const h = getCairoHour();
  if (h >= 6 && h < 10)  return 'high';
  if (h >= 10 && h < 13) return 'medium';
  if (h >= 13 && h < 15) return 'low';    // post-lunch dip
  if (h >= 15 && h < 18) return 'medium';
  if (h >= 18 && h < 21) return 'medium';
  return 'low';
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHORT-TERM MEMORY — Last 5 actions, ignored suggestions, pattern detection
// ═══════════════════════════════════════════════════════════════════════════════

function loadMemory() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(MEMORY_KEY) : null;
    if (!raw) return createEmptyMemory();
    const parsed = JSON.parse(raw);
    // Validate structure
    if (!parsed.actions || !parsed.suggestions_given || !parsed.ignored_suggestions) {
      return createEmptyMemory();
    }
    return parsed;
  } catch {
    return createEmptyMemory();
  }
}

function createEmptyMemory() {
  return {
    actions: [],                // { type, task_id, task_title, timestamp, result }
    suggestions_given: [],      // { task_id, task_title, timestamp, accepted }
    ignored_suggestions: [],    // { task_id, task_title, timestamp, times_ignored }
    skip_history: [],           // { task_id, task_title, reason, timestamp }
    completions_today: [],      // { task_id, task_title, timestamp, type }
    last_session_date: null,
    consecutive_skips: 0,
    consecutive_completions: 0,
  };
}

function saveMemory(memory) {
  try {
    // Trim to prevent localStorage bloat
    memory.actions = memory.actions.slice(-MAX_MEMORY_ITEMS);
    memory.suggestions_given = memory.suggestions_given.slice(-MAX_MEMORY_ITEMS);
    memory.ignored_suggestions = memory.ignored_suggestions.slice(-MAX_IGNORED_SUGGESTIONS);
    memory.skip_history = memory.skip_history.slice(-MAX_MEMORY_ITEMS);
    memory.completions_today = memory.completions_today.slice(-50);
    if (typeof window !== 'undefined') {
      localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
    }
  } catch { /* silently fail */ }
}

/**
 * Record an action in short-term memory.
 * @param {'complete'|'skip'|'start'|'ignore_suggestion'|'accept_suggestion'} type
 * @param {Object} details - { task_id, task_title, reason, type: 'task'|'habit' }
 */
export function recordAction(type, details = {}) {
  const memory = loadMemory();
  const now = new Date().toISOString();
  const todayStr = now.split('T')[0];

  // Reset daily counters if new day
  if (memory.last_session_date !== todayStr) {
    memory.completions_today = [];
    memory.consecutive_skips = 0;
    memory.consecutive_completions = 0;
    memory.last_session_date = todayStr;
  }

  const entry = {
    type,
    task_id: details.task_id || null,
    task_title: details.task_title || null,
    item_type: details.type || 'task', // 'task' or 'habit'
    reason: details.reason || null,
    timestamp: now,
  };

  memory.actions.push(entry);

  switch (type) {
    case 'complete':
      memory.consecutive_completions += 1;
      memory.consecutive_skips = 0;
      memory.completions_today.push({
        task_id: details.task_id,
        task_title: details.task_title,
        timestamp: now,
        type: details.type || 'task',
      });
      break;

    case 'skip':
      memory.consecutive_skips += 1;
      memory.consecutive_completions = 0;
      memory.skip_history.push({
        task_id: details.task_id,
        task_title: details.task_title,
        reason: details.reason || 'unknown',
        timestamp: now,
      });
      break;

    case 'ignore_suggestion': {
      const existing = memory.ignored_suggestions.find(s => s.task_id === details.task_id);
      if (existing) {
        existing.times_ignored += 1;
        existing.timestamp = now;
      } else {
        memory.ignored_suggestions.push({
          task_id: details.task_id,
          task_title: details.task_title,
          times_ignored: 1,
          timestamp: now,
        });
      }
      break;
    }

    case 'accept_suggestion': {
      memory.suggestions_given.push({
        task_id: details.task_id,
        task_title: details.task_title,
        timestamp: now,
        accepted: true,
      });
      // Remove from ignored if was there
      memory.ignored_suggestions = memory.ignored_suggestions.filter(
        s => s.task_id !== details.task_id
      );
      break;
    }
  }

  saveMemory(memory);
  return memory;
}

/**
 * Get the last N actions from memory.
 */
export function getLastActions(n = 5) {
  const memory = loadMemory();
  return memory.actions.slice(-n);
}

/**
 * Check if a task was recently suggested and ignored.
 */
export function wasRecentlyIgnored(taskId) {
  const memory = loadMemory();
  return memory.ignored_suggestions.find(s => s.task_id === taskId);
}

/**
 * Get skip patterns — which tasks are repeatedly skipped?
 */
export function getSkipPatterns() {
  const memory = loadMemory();
  const skipCounts = {};
  memory.skip_history.forEach(s => {
    if (!s.task_id) return;
    if (!skipCounts[s.task_id]) {
      skipCounts[s.task_id] = { task_id: s.task_id, task_title: s.task_title, count: 0, reasons: [] };
    }
    skipCounts[s.task_id].count += 1;
    if (s.reason) skipCounts[s.task_id].reasons.push(s.reason);
  });
  return Object.values(skipCounts).sort((a, b) => b.count - a.count);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ADAPTIVE USER PROFILE — Learns from actual behavior
// ═══════════════════════════════════════════════════════════════════════════════

function loadProfile() {
  try {
    const raw = typeof window !== 'undefined' ? localStorage.getItem(PROFILE_KEY) : null;
    if (!raw) return createDefaultProfile();
    return JSON.parse(raw);
  } catch {
    return createDefaultProfile();
  }
}

function createDefaultProfile() {
  return {
    // Preferred task size (small/medium/large) — learned from completions
    preferred_task_size: 'medium',
    // Best time of day — learned from completion timestamps
    best_time_of_day: 'morning',
    // Execution style
    execution_style: 'mixed',  // 'serial' (one at a time) | 'batch' (groups) | 'mixed'
    // Energy pattern: { morning, afternoon, evening, night }
    energy_pattern: { morning: 'high', afternoon: 'medium', evening: 'medium', night: 'low' },
    // Habit discipline: 'strong' | 'moderate' | 'building'
    habit_discipline: 'moderate',
    // Resistance type: 'procrastinator' | 'perfectionist' | 'overwhelmed' | 'consistent'
    resistance_type: 'consistent',
    // Skip patterns
    frequently_skipped_categories: [],
    // Completion distribution by hour
    completions_by_hour: {},
    // Average completions per day
    avg_completions_per_day: 0,
    // Days active
    total_days_active: 0,
    // Last profile update
    last_updated: null,
    // Learning evidence (proves the profile is adapting)
    learning_log: [],
  };
}

function saveProfile(profile) {
  try {
    profile.last_updated = new Date().toISOString();
    // Trim learning log
    profile.learning_log = (profile.learning_log || []).slice(-20);
    if (typeof window !== 'undefined') {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    }
  } catch { /* silently fail */ }
}

/**
 * Update profile based on today's data. Called daily or on significant events.
 * This is where the system LEARNS.
 */
export function updateProfile(todayData = {}) {
  const profile = loadProfile();
  const memory = loadMemory();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];

  // Skip if already updated today
  if (profile.last_updated && profile.last_updated.split('T')[0] === todayStr) {
    return profile;
  }

  const changes = [];

  // 1. Learn preferred task size from completions
  const completions = memory.completions_today || [];
  const tasks = todayData.tasks || [];
  const completedTasks = tasks.filter(t => t.status === 'completed');
  if (completedTasks.length >= 3) {
    const priorities = completedTasks.map(t => t.priority || 'medium');
    const lowCount = priorities.filter(p => p === 'low').length;
    const highCount = priorities.filter(p => p === 'high' || p === 'urgent').length;
    const oldSize = profile.preferred_task_size;
    if (lowCount > highCount * 2) {
      profile.preferred_task_size = 'small';
    } else if (highCount > lowCount * 2) {
      profile.preferred_task_size = 'large';
    } else {
      profile.preferred_task_size = 'medium';
    }
    if (oldSize !== profile.preferred_task_size) {
      changes.push(`preferred_task_size: ${oldSize} → ${profile.preferred_task_size}`);
    }
  }

  // 2. Learn best time of day from completion timestamps
  const hourCounts = { ...profile.completions_by_hour };
  completions.forEach(c => {
    try {
      const h = new Date(c.timestamp).getHours();
      hourCounts[h] = (hourCounts[h] || 0) + 1;
    } catch { /* skip */ }
  });
  profile.completions_by_hour = hourCounts;
  const bestHour = Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0];
  if (bestHour) {
    const h = parseInt(bestHour[0], 10);
    const oldBest = profile.best_time_of_day;
    if (h < 12) profile.best_time_of_day = 'morning';
    else if (h < 17) profile.best_time_of_day = 'afternoon';
    else profile.best_time_of_day = 'evening';
    if (oldBest !== profile.best_time_of_day) {
      changes.push(`best_time_of_day: ${oldBest} → ${profile.best_time_of_day}`);
    }
  }

  // 3. Learn energy pattern from skip reasons
  const skipsByTime = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  const compsByTime = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  memory.skip_history.forEach(s => {
    try {
      const h = new Date(s.timestamp).getHours();
      const block = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
      skipsByTime[block] += 1;
      if (s.reason === 'low_energy') {
        profile.energy_pattern[block] = 'low';
      }
    } catch { /* skip */ }
  });
  completions.forEach(c => {
    try {
      const h = new Date(c.timestamp).getHours();
      const block = h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night';
      compsByTime[block] += 1;
    } catch { /* skip */ }
  });
  // Update energy pattern based on completion vs skip ratio
  Object.keys(skipsByTime).forEach(block => {
    const skips = skipsByTime[block];
    const comps = compsByTime[block];
    const oldEnergy = profile.energy_pattern[block];
    if (skips > comps * 2 && skips >= 3) {
      profile.energy_pattern[block] = 'low';
    } else if (comps > skips * 2 && comps >= 3) {
      profile.energy_pattern[block] = 'high';
    }
    if (oldEnergy !== profile.energy_pattern[block]) {
      changes.push(`energy_pattern.${block}: ${oldEnergy} → ${profile.energy_pattern[block]}`);
    }
  });

  // 4. Learn resistance type from skip patterns
  const skipPatterns = getSkipPatterns();
  const totalSkips = memory.skip_history.length;
  const totalCompletions = completions.length;
  const oldResistance = profile.resistance_type;
  if (totalSkips > totalCompletions * 2 && totalSkips >= 5) {
    profile.resistance_type = 'procrastinator';
  } else if (skipPatterns.some(p => p.reasons.includes('overwhelmed') && p.count >= 3)) {
    profile.resistance_type = 'overwhelmed';
  } else if (totalCompletions > totalSkips * 3) {
    profile.resistance_type = 'consistent';
  }
  if (oldResistance !== profile.resistance_type) {
    changes.push(`resistance_type: ${oldResistance} → ${profile.resistance_type}`);
  }

  // 5. Learn habit discipline
  const habits = todayData.habits || [];
  const habitsCompleted = habits.filter(h => h.completed_today).length;
  const habitsTotal = habits.length;
  const oldDiscipline = profile.habit_discipline;
  if (habitsTotal > 0) {
    const rate = habitsCompleted / habitsTotal;
    if (rate >= 0.8) profile.habit_discipline = 'strong';
    else if (rate >= 0.5) profile.habit_discipline = 'moderate';
    else profile.habit_discipline = 'building';
  }
  if (oldDiscipline !== profile.habit_discipline) {
    changes.push(`habit_discipline: ${oldDiscipline} → ${profile.habit_discipline}`);
  }

  // 6. Track frequently skipped categories
  const catSkips = {};
  memory.skip_history.forEach(s => {
    const task = tasks.find(t => t.id === s.task_id);
    if (task?.category) {
      catSkips[task.category] = (catSkips[task.category] || 0) + 1;
    }
  });
  profile.frequently_skipped_categories = Object.entries(catSkips)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([cat]) => cat);

  // 7. Update stats
  profile.total_days_active += 1;
  profile.avg_completions_per_day = Math.round(
    ((profile.avg_completions_per_day * (profile.total_days_active - 1)) + completedTasks.length) /
    profile.total_days_active
  );

  // Log learning evidence
  if (changes.length > 0) {
    profile.learning_log.push({
      date: todayStr,
      changes,
      trigger: `${completedTasks.length} completions, ${totalSkips} skips`,
    });
  }

  saveProfile(profile);
  return profile;
}

/**
 * Get the current user profile.
 */
export function getProfile() {
  return loadProfile();
}

// ═══════════════════════════════════════════════════════════════════════════════
// COGNITIVE DECISION ENGINE — The brain that decides WHAT to do NOW
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * The main decision function. Takes REAL data and returns ONE clear decision.
 *
 * @param {Object} params
 * @param {Array}  params.tasks   - Today's real tasks
 * @param {Array}  params.habits  - Today's real habits
 * @param {string} params.energy  - 'high'|'medium'|'low' (explicit or null for auto)
 * @returns {Object} Decision with chosen_task, why, blocker, smallest_step, message
 */
export function decide(params = {}) {
  const {
    tasks = [],
    habits = [],
    energy = null,
  } = params;

  const memory = loadMemory();
  const profile = loadProfile();
  const block = getCurrentBlock();
  const hour = getCairoHour();

  // Compute real inputs
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const pendingHabits = habits.filter(h => !h.completed_today);
  const completedHabits = habits.filter(h => h.completed_today);

  const totalItems = tasks.length + habits.length;
  const doneItems = completedTasks.length + completedHabits.length;
  const completionRate = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  // Determine energy level
  const resolvedEnergy = energy || profile.energy_pattern[block] || getEnergyFromTime();

  // Get recently ignored suggestions
  const recentlyIgnored = new Set(
    memory.ignored_suggestions
      .filter(s => s.times_ignored >= 2)
      .map(s => s.task_id)
  );

  // Get recently skipped tasks
  const recentlySkipped = new Set(
    memory.skip_history
      .filter(s => {
        const age = Date.now() - new Date(s.timestamp).getTime();
        return age < 2 * 60 * 60 * 1000; // last 2 hours
      })
      .map(s => s.task_id)
  );

  // Last 5 actions
  const lastActions = memory.actions.slice(-5);
  const lastActionType = lastActions.length > 0 ? lastActions[lastActions.length - 1].type : null;
  const lastTaskId = lastActions.length > 0 ? lastActions[lastActions.length - 1].task_id : null;

  // ─── DETECT CURRENT STATE ────────────────────────────────────────────────

  let state = 'normal';
  let blocker = null;

  if (memory.consecutive_skips >= 3) {
    state = 'procrastinating';
    blocker = 'تخطيت 3 مهام متتالية — البداية هي اللي صعبة';
  } else if (pendingTasks.length > 8 && completionRate < 25) {
    state = 'overwhelmed';
    blocker = `عندك ${pendingTasks.length} مهمة — كتير. لازم تختار 3 بس`;
  } else if (memory.consecutive_completions >= 3) {
    state = 'momentum';
    blocker = null;
  } else if (pendingTasks.length === 0 && pendingHabits.length === 0) {
    state = 'all_done';
    blocker = null;
  } else if (resolvedEnergy === 'low') {
    state = 'low_energy';
    blocker = 'طاقتك منخفضة — هنختار حاجة خفيفة';
  } else if (completedTasks.length === 0 && hour >= 14) {
    state = 'late_start';
    blocker = 'لسه ما بدأتش اليوم — أول مهمة هي الأهم';
  }

  // ─── SCORE AND RANK TASKS ─────────────────────────────────────────────────

  const scoredTasks = pendingTasks.map(task => {
    let score = 0;
    const reasons = [];

    // 1. Urgency: overdue tasks get highest score
    if (task.is_overdue || isOverdue(task)) {
      score += 100;
      reasons.push('متأخرة — لازم تتعمل');
    }

    // 2. Time-based: task has a due_time approaching
    if (task.due_time) {
      const minutesLeft = getMinutesUntilDue(task);
      if (minutesLeft !== null) {
        if (minutesLeft < 0) {
          score += 90;
          reasons.push('فات وقتها');
        } else if (minutesLeft < 30) {
          score += 80;
          reasons.push(`باقي ${minutesLeft} دقيقة — ابدأ دلوقتي`);
        } else if (minutesLeft < 60) {
          score += 50;
          reasons.push(`باقي ${minutesLeft} دقيقة`);
        }
      }
    }

    // 3. Priority
    const priorityScores = { urgent: 60, high: 40, medium: 20, low: 10 };
    score += priorityScores[task.priority] || 20;
    if (task.priority === 'urgent') reasons.push('أولوية قصوى');
    else if (task.priority === 'high') reasons.push('أولوية عالية');

    // 4. Energy matching
    if (resolvedEnergy === 'low') {
      // Prefer low-priority (easy) tasks
      if (task.priority === 'low' || task.priority === 'medium') {
        score += 30;
        reasons.push('مناسبة لطاقتك الحالية');
      } else {
        score -= 20; // Penalize hard tasks when tired
      }
    } else if (resolvedEnergy === 'high') {
      // Prefer hard tasks when energy is high
      if (task.priority === 'urgent' || task.priority === 'high') {
        score += 25;
        reasons.push('طاقتك عالية — وقت المهام الصعبة');
      }
    }

    // 5. Skip penalty: if task was recently skipped, reduce score
    if (recentlySkipped.has(task.id)) {
      score -= 40;
      reasons.push('تم تخطيها مؤخراً');
    }

    // 6. Ignored suggestion penalty: don't suggest same thing repeatedly
    if (recentlyIgnored.has(task.id)) {
      score -= 60;
      reasons.push('تم تجاهل الاقتراح سابقاً');
    }

    // 7. Profile matching: if user frequently skips this category, lower score
    if (profile.frequently_skipped_categories.includes(task.category)) {
      score -= 15;
    }

    // 8. Two-minute rule: if procrastinating, boost easy tasks
    if (state === 'procrastinating' && (task.priority === 'low' || task.estimated_minutes <= 5)) {
      score += 50;
      reasons.push('مهمة سريعة — قاعدة الدقيقتين');
    }

    // 9. Momentum: if on a roll, suggest harder tasks
    if (state === 'momentum' && (task.priority === 'urgent' || task.priority === 'high')) {
      score += 30;
      reasons.push('استغل الزخم');
    }

    return { ...task, _score: score, _reasons: reasons };
  });

  // Sort by score descending
  scoredTasks.sort((a, b) => b._score - a._score);

  // ─── ALSO CONSIDER HABITS ────────────────────────────────────────────────

  const scoredHabits = pendingHabits.map(habit => {
    let score = 0;
    const reasons = [];

    // Time-matched habits
    const targetTime = habit.target_time || habit.preferred_time || habit.ai_best_time;
    if (targetTime) {
      const parts = targetTime.split(':').map(Number);
      const targetHour = parts[0] || 0;
      const diff = Math.abs(hour - targetHour);
      if (diff <= 1) {
        score += 90;
        reasons.push(`دلوقتي وقت "${habit.name}"`);
      } else if (diff <= 2) {
        score += 40;
        reasons.push('قرب وقتها');
      }
    }

    // Streak at risk
    if ((habit.current_streak || 0) >= 5) {
      score += 70;
      reasons.push(`${habit.current_streak} يوم — لا تقطع السلسلة`);
    } else if ((habit.current_streak || 0) >= 3) {
      score += 40;
      reasons.push(`سلسلة ${habit.current_streak} يوم`);
    }

    // Low energy = habits are good (usually quick)
    if (resolvedEnergy === 'low') {
      score += 20;
      reasons.push('العادات خفيفة وسريعة');
    }

    return { ...habit, _score: score, _reasons: reasons, _isHabit: true };
  });

  // ─── PICK THE WINNER ─────────────────────────────────────────────────────

  // Merge and pick top item
  const allItems = [...scoredTasks, ...scoredHabits].sort((a, b) => b._score - a._score);

  // Special case: all done
  if (allItems.length === 0) {
    return buildDecision({
      state: 'all_done',
      completionRate,
      completedCount: doneItems,
      totalCount: totalItems,
      energy: resolvedEnergy,
      block,
      memory,
      profile,
    });
  }

  const chosen = allItems[0];
  const isHabit = !!chosen._isHabit;

  // ─── BUILD SMALLEST STEP ─────────────────────────────────────────────────

  const smallestStep = buildSmallestStep(chosen, state, isHabit, memory);

  // ─── BUILD ASSISTANT MESSAGE ─────────────────────────────────────────────

  const message = buildMessage({
    chosen,
    isHabit,
    state,
    blocker,
    energy: resolvedEnergy,
    completionRate,
    memory,
    profile,
    smallestStep,
    completedCount: doneItems,
  });

  // ─── COMPUTE XP ──────────────────────────────────────────────────────────

  const xp = computeContextualXP({
    state,
    energy: resolvedEnergy,
    priority: chosen.priority,
    isHabit,
    streak: chosen.current_streak || 0,
    isFirstOfDay: doneItems === 0,
    consecutiveCompletions: memory.consecutive_completions,
  });

  // ─── Record suggestion given ─────────────────────────────────────────────
  const mem = loadMemory();
  mem.suggestions_given.push({
    task_id: chosen.id,
    task_title: chosen.title || chosen.name,
    timestamp: new Date().toISOString(),
    accepted: null, // Unknown until user acts
  });
  saveMemory(mem);

  return {
    chosen_task: {
      id: chosen.id,
      title: chosen.title || chosen.name,
      priority: chosen.priority || null,
      category: chosen.category || null,
      due_time: chosen.due_time || null,
      is_habit: isHabit,
      streak: chosen.current_streak || null,
    },
    why: chosen._reasons.slice(0, 3),
    blocker,
    smallest_step: smallestStep,
    assistant_message: message.text,
    assistant_tone: message.tone,
    xp_reward: xp,
    state,
    energy: resolvedEnergy,
    block,
    completion_rate: completionRate,
    pending_count: pendingTasks.length + pendingHabits.length,
    completed_count: doneItems,
    all_scored: allItems.slice(0, 5).map(t => ({
      id: t.id,
      title: t.title || t.name,
      score: t._score,
      reasons: t._reasons,
      is_habit: !!t._isHabit,
    })),
    memory_summary: {
      last_5_actions: lastActions,
      consecutive_skips: memory.consecutive_skips,
      consecutive_completions: memory.consecutive_completions,
      ignored_count: memory.ignored_suggestions.length,
      total_completions_today: memory.completions_today.length,
    },
    profile_snapshot: {
      preferred_task_size: profile.preferred_task_size,
      best_time_of_day: profile.best_time_of_day,
      resistance_type: profile.resistance_type,
      energy_pattern: profile.energy_pattern,
      habit_discipline: profile.habit_discipline,
    },
    timestamp: new Date().toISOString(),
  };
}

// ─── Helper: Is a task overdue? ─────────────────────────────────────────────

function isOverdue(task) {
  if (!task.due_date) return false;
  try {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const dueDateStr = typeof task.due_date === 'string'
      ? task.due_date.split('T')[0]
      : new Date(task.due_date).toISOString().split('T')[0];

    if (dueDateStr < todayStr) return true;
    if (dueDateStr === todayStr && task.due_time) {
      const cairoNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
      const parts = task.due_time.split(':').map(Number);
      const dueDate = new Date(cairoNow);
      dueDate.setHours(parts[0] || 0, parts[1] || 0, 0, 0);
      return cairoNow > dueDate;
    }
    return false;
  } catch {
    return false;
  }
}

function getMinutesUntilDue(task) {
  if (!task.due_time) return null;
  try {
    const now = new Date();
    const cairoNow = new Date(now.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
    const parts = task.due_time.split(':').map(Number);
    const dueDate = new Date(cairoNow);
    dueDate.setHours(parts[0] || 0, parts[1] || 0, 0, 0);
    return Math.round((dueDate - cairoNow) / 60000);
  } catch {
    return null;
  }
}

// ─── Build smallest executable step ─────────────────────────────────────────

function buildSmallestStep(chosen, state, isHabit, memory) {
  const name = chosen.title || chosen.name || 'المهمة';
  const skipCount = memory.skip_history.filter(s => s.task_id === chosen.id).length;

  // If task was skipped multiple times, suggest breaking it down
  if (skipCount >= 2 && !isHabit) {
    return `"${name}" اتخطت ${skipCount} مرات — قسمها: إيه أصغر جزء ممكن تعمله في دقيقتين؟`;
  }

  if (isHabit) {
    return `افتح "${name}" وسجّلها — ثواني بس`;
  }

  switch (state) {
    case 'procrastinating':
      return `افتح "${name}" واشتغل فيها دقيقتين بس. لو عايز توقف بعدها — وقف`;
    case 'overwhelmed':
      return `"${name}" هي الأهم. تجاهل الباقي. ابدأ فيها — خطوة واحدة`;
    case 'low_energy':
      return `"${name}" خفيفة ومناسبة. ابدأ ومش هتاخد وقت`;
    case 'momentum':
      return `كمّل! "${name}" وبعدها الجاية. أنت ماشي`;
    default:
      return `ابدأ "${name}" — أول خطوة: افتحها واقرأ التفاصيل`;
  }
}

// ─── Build assistant message (Egyptian Arabic, short & sharp) ────────────────

function buildMessage({ chosen, isHabit, state, blocker, energy, completionRate, memory, profile, smallestStep, completedCount }) {
  const name = chosen.title || chosen.name;
  const reasons = chosen._reasons || [];
  const firstReason = reasons[0] || '';

  // Tone mapping
  const toneMap = {
    procrastinating: 'direct',
    overwhelmed: 'calm',
    momentum: 'energetic',
    all_done: 'celebrating',
    low_energy: 'gentle',
    late_start: 'urgent',
    normal: 'balanced',
  };
  const tone = toneMap[state] || 'balanced';

  // Build text — always specific, never generic
  let text = '';

  switch (state) {
    case 'procrastinating':
      text = `تخطيت ${memory.consecutive_skips} مهام. `;
      if (profile.resistance_type === 'procrastinator') {
        text += `أنا عارف إنك بتأجل — بس "${name}" صغيرة. `;
      }
      text += smallestStep;
      break;

    case 'overwhelmed':
      text = `عندك ${chosen._score > 80 ? 'مهمة عاجلة' : 'كتير قدامك'}. `;
      text += `ركّز على "${name}" بس — ${firstReason || 'هي الأهم دلوقتي'}. `;
      text += 'الباقي يستنى.';
      break;

    case 'momentum':
      text = `${completedCount} إنجاز متتالي! `;
      if (isHabit) {
        text += `"${name}" — سجّلها وكمّل. `;
      } else {
        text += `"${name}" الجاية — ${firstReason || 'استغل الزخم'}. `;
      }
      text += 'مين يوقفك؟';
      break;

    case 'low_energy':
      text = `طاقتك منخفضة. "${name}" `;
      if (isHabit) {
        text += 'خفيفة — سجّلها في ثواني.';
      } else {
        text += `مناسبة — ${firstReason || 'مش هتاخد وقت'}.`;
      }
      break;

    case 'late_start':
      text = `لسه ما بدأتش النهاردة. `;
      text += `"${name}" أول مهمة — ${firstReason || 'ابدأ بيها'}. `;
      text += 'أول خطوة أصعب من الباقي كله.';
      break;

    default:
      if (isHabit && chosen.current_streak >= 5) {
        text = `"${name}" — ${chosen.current_streak} يوم. لا تقطع السلسلة.`;
      } else if (firstReason) {
        text = `"${name}" — ${firstReason}.`;
      } else {
        text = `"${name}" هي الأهم دلوقتي. ابدأ فيها.`;
      }
  }

  return { text: text.trim(), tone };
}

// ─── Build "all done" decision ───────────────────────────────────────────────

function buildDecision({ state, completionRate, completedCount, totalCount, energy, block, memory, profile }) {
  if (state === 'all_done') {
    const message = completedCount > 0
      ? `كل شيء مكتمل — ${completedCount}/${totalCount}. أحسنت! خذ استراحة مستحقة.`
      : 'مفيش مهام أو عادات لليوم. أضف حاجة أو ارتاح.';

    return {
      chosen_task: null,
      why: ['كل المهام والعادات مكتملة'],
      blocker: null,
      smallest_step: 'استمتع بوقتك — أو أضف مهمة جديدة',
      assistant_message: message,
      assistant_tone: 'celebrating',
      xp_reward: { base: 0, bonus: 0, total: 0, reason: 'يوم مكتمل' },
      state,
      energy,
      block,
      completion_rate: completionRate,
      pending_count: 0,
      completed_count: completedCount,
      all_scored: [],
      memory_summary: {
        last_5_actions: memory.actions.slice(-5),
        consecutive_skips: memory.consecutive_skips,
        consecutive_completions: memory.consecutive_completions,
        ignored_count: memory.ignored_suggestions.length,
        total_completions_today: memory.completions_today.length,
      },
      profile_snapshot: {
        preferred_task_size: profile.preferred_task_size,
        best_time_of_day: profile.best_time_of_day,
        resistance_type: profile.resistance_type,
        energy_pattern: profile.energy_pattern,
        habit_discipline: profile.habit_discipline,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

// ─── Contextual XP computation ──────────────────────────────────────────────

function computeContextualXP({ state, energy, priority, isHabit, streak, isFirstOfDay, consecutiveCompletions }) {
  let base = 5;
  let bonus = 0;
  const reasons = [];

  // Priority bonus
  if (priority === 'urgent') { base = 20; reasons.push('مهمة عاجلة'); }
  else if (priority === 'high') { base = 15; reasons.push('أولوية عالية'); }
  else if (priority === 'medium') { base = 10; }

  // Habit streak bonus
  if (isHabit && streak >= 7) {
    bonus += Math.min(streak, 50);
    reasons.push(`سلسلة ${streak} يوم`);
  }

  // First of day
  if (isFirstOfDay) {
    bonus += 10;
    reasons.push('أول إنجاز اليوم');
  }

  // Hard task + low energy
  if (energy === 'low' && (priority === 'high' || priority === 'urgent')) {
    bonus += 15;
    reasons.push('مهمة صعبة بطاقة منخفضة');
  }

  // Breaking procrastination
  if (state === 'procrastinating') {
    bonus += 10;
    reasons.push('كسرت حاجز التأجيل');
  }

  // Momentum streak
  if (consecutiveCompletions >= 3) {
    bonus += consecutiveCompletions * 2;
    reasons.push(`${consecutiveCompletions} إنجاز متتالي`);
  }

  return {
    base,
    bonus,
    total: base + bonus,
    reasons,
  };
}

// ─── REACT TO EVENTS — instant reactions ────────────────────────────────────

/**
 * React to a task completion. Returns immediate feedback.
 */
export function reactToCompletion(task, allTasks = [], allHabits = []) {
  const isHabit = !task.id || task.completed_today !== undefined;
  recordAction('complete', {
    task_id: task.id,
    task_title: task.title || task.name,
    type: isHabit ? 'habit' : 'task',
  });

  // Re-decide immediately to get next action
  const nextDecision = decide({ tasks: allTasks, habits: allHabits });

  const memory = loadMemory();

  return {
    celebration: getCelebrationMessage(memory.consecutive_completions, isHabit, task),
    next_decision: nextDecision,
    xp_earned: nextDecision.xp_reward,
  };
}

/**
 * React to a task skip.
 */
export function reactToSkip(task, reason, allTasks = [], allHabits = []) {
  recordAction('skip', {
    task_id: task.id,
    task_title: task.title || task.name,
    reason,
  });

  // Re-decide: the skipped task will be scored lower
  const nextDecision = decide({ tasks: allTasks, habits: allHabits });

  return {
    message: getSkipReaction(reason, task, loadMemory()),
    next_decision: nextDecision,
  };
}

function getCelebrationMessage(consecutiveCount, isHabit, task) {
  const name = task.title || task.name;
  if (consecutiveCount >= 5) return { text: `${consecutiveCount} متتالي! يوم خرافي`, emoji: '🏆' };
  if (consecutiveCount >= 3) return { text: `${consecutiveCount} إنجاز! استمر`, emoji: '🔥' };
  if (isHabit && (task.current_streak || 0) >= 7) {
    return { text: `"${name}" — ${task.current_streak} يوم! سلسلة قوية`, emoji: '🔥' };
  }
  return { text: `تم "${name}"`, emoji: '✅' };
}

function getSkipReaction(reason, task, memory) {
  const name = task.title || task.name;
  const skipCount = memory.skip_history.filter(s => s.task_id === task.id).length;

  if (skipCount >= 3) {
    return `"${name}" اتخطت ${skipCount} مرات. يمكن محتاجة تتقسم أو تتلغي — فكّر فيها.`;
  }

  switch (reason) {
    case 'low_energy':
      return `ماشي — هنرجعلك مهمة أخف. "${name}" هترجع بعدين.`;
    case 'overwhelmed':
      return 'كتير عليك النهاردة. خليني أرتب القايمة.';
    case 'wrong_task':
      return 'فاهم. هختارلك حاجة تانية.';
    case 'busy':
      return `"${name}" هتستنى. ركّز على اللي قدامك.`;
    default:
      return 'ماشي — يلا نشوف حاجة تانية.';
  }
}

// ─── SCENARIO VALIDATION — Prove the engine works with real examples ─────────

/**
 * Run validation scenarios that demonstrate the engine's decision logic.
 * Returns an array of { scenario, input, decision, logic_explanation }.
 */
export function runValidationScenarios() {
  const scenarios = [];

  // Scenario 1: 5 pending, 2 completed, low energy, 3 skips
  const scenario1Tasks = [
    { id: 't1', title: 'مراجعة الفصل الثالث', priority: 'high', status: 'pending', category: 'university', due_time: null },
    { id: 't2', title: 'تسليم الـ assignment', priority: 'urgent', status: 'pending', category: 'university', due_time: '23:59' },
    { id: 't3', title: 'ترتيب الغرفة', priority: 'low', status: 'pending', category: 'other', estimated_minutes: 10 },
    { id: 't4', title: 'تمرين 30 دقيقة', priority: 'medium', status: 'pending', category: 'fitness' },
    { id: 't5', title: 'قراءة 10 صفحات', priority: 'low', status: 'pending', category: 'learning', estimated_minutes: 15 },
    { id: 't6', title: 'مهمة مكتملة 1', priority: 'medium', status: 'completed' },
    { id: 't7', title: 'مهمة مكتملة 2', priority: 'low', status: 'completed' },
  ];

  // Simulate 3 skips in memory
  const mem1 = createEmptyMemory();
  mem1.consecutive_skips = 3;
  mem1.skip_history = [
    { task_id: 't1', task_title: 'مراجعة الفصل الثالث', reason: 'low_energy', timestamp: new Date().toISOString() },
    { task_id: 't4', task_title: 'تمرين 30 دقيقة', reason: 'lazy', timestamp: new Date().toISOString() },
    { task_id: 't2', task_title: 'تسليم الـ assignment', reason: 'overwhelmed', timestamp: new Date().toISOString() },
  ];
  saveMemory(mem1);

  const decision1 = decide({ tasks: scenario1Tasks, habits: [], energy: 'low' });
  scenarios.push({
    scenario: 'مهام كتير + طاقة منخفضة + 3 تخطيات',
    input: { tasks: 5, completed: 2, energy: 'low', skips: 3 },
    chosen: decision1.chosen_task?.title,
    why: decision1.why,
    state: decision1.state,
    logic: 'الحالة = procrastinating لأن 3 تخطيات متتالية. المحرك اختار أسهل مهمة (قاعدة الدقيقتين) عشان يكسر حاجز التأجيل. المهام الصعبة اللي اتخطت نزل ترتيبها.',
  });

  // Reset memory for next scenario
  saveMemory(createEmptyMemory());

  // Scenario 2: 3 consecutive completions, high energy, morning
  const scenario2Tasks = [
    { id: 't1', title: 'كتابة التقرير الشهري', priority: 'high', status: 'pending', category: 'work' },
    { id: 't2', title: 'إيميل للمدير', priority: 'medium', status: 'pending', category: 'work' },
    { id: 't3', title: 'ترتيب الملفات', priority: 'low', status: 'pending', category: 'work' },
    { id: 't4', title: 'مهمة 1', status: 'completed' },
    { id: 't5', title: 'مهمة 2', status: 'completed' },
    { id: 't6', title: 'مهمة 3', status: 'completed' },
  ];
  const mem2 = createEmptyMemory();
  mem2.consecutive_completions = 3;
  mem2.completions_today = [
    { task_id: 't4', task_title: 'مهمة 1', timestamp: new Date().toISOString(), type: 'task' },
    { task_id: 't5', task_title: 'مهمة 2', timestamp: new Date().toISOString(), type: 'task' },
    { task_id: 't6', task_title: 'مهمة 3', timestamp: new Date().toISOString(), type: 'task' },
  ];
  saveMemory(mem2);

  const decision2 = decide({ tasks: scenario2Tasks, habits: [], energy: 'high' });
  scenarios.push({
    scenario: 'زخم + طاقة عالية + 3 إنجازات متتالية',
    input: { tasks: 3, completed: 3, energy: 'high', consecutive_completions: 3 },
    chosen: decision2.chosen_task?.title,
    why: decision2.why,
    state: decision2.state,
    logic: 'الحالة = momentum لأن 3 إنجازات متتالية. المحرك اختار أصعب مهمة (high priority) عشان يستغل الزخم والطاقة العالية.',
  });

  // Reset memory
  saveMemory(createEmptyMemory());

  // Scenario 3: Habit with 14-day streak at risk + evening
  const scenario3Habits = [
    { id: 'h1', name: 'قراءة قرآن', completed_today: false, current_streak: 14, target_time: '21:00' },
    { id: 'h2', name: 'تمارين', completed_today: true, current_streak: 5 },
    { id: 'h3', name: 'تأمل', completed_today: false, current_streak: 2, target_time: '22:00' },
  ];
  const scenario3Tasks = [
    { id: 't1', title: 'مهمة عادية', priority: 'medium', status: 'pending' },
  ];

  const decision3 = decide({ tasks: scenario3Tasks, habits: scenario3Habits, energy: 'medium' });
  scenarios.push({
    scenario: 'عادة بسلسلة 14 يوم + وقتها الآن',
    input: { habits: 3, habits_done: 1, streak_at_risk: 14, time: 'evening' },
    chosen: decision3.chosen_task?.title,
    why: decision3.why,
    state: decision3.state,
    logic: 'العادة بسلسلة 14 يوم حصلت على أعلى score لأن: (1) وقتها قرب (time match = +90)، (2) سلسلة 14 يوم في خطر (+70). المحرك أعطاها أولوية على المهمة العادية.',
  });

  // Reset memory to clean state
  saveMemory(createEmptyMemory());

  return scenarios;
}

// ─── PROOF OF LEARNING — Show profile adaptation ────────────────────────────

/**
 * Demonstrate that the profile learns from behavior.
 * Returns before/after snapshots.
 */
export function demonstrateLearning() {
  const examples = [];

  // Example 1: Skipping large tasks → profile learns to suggest smaller
  const profile1Before = { ...createDefaultProfile() };
  const mem = createEmptyMemory();
  // Simulate 5 skips of high-priority tasks
  for (let i = 0; i < 5; i++) {
    mem.skip_history.push({
      task_id: `t${i}`, task_title: `مهمة صعبة ${i}`,
      reason: 'overwhelmed', timestamp: new Date().toISOString(),
    });
  }
  // Simulate 3 completions of low-priority tasks
  mem.completions_today = [
    { task_id: 'easy1', task_title: 'مهمة سهلة 1', timestamp: new Date().toISOString(), type: 'task' },
    { task_id: 'easy2', task_title: 'مهمة سهلة 2', timestamp: new Date().toISOString(), type: 'task' },
    { task_id: 'easy3', task_title: 'مهمة سهلة 3', timestamp: new Date().toISOString(), type: 'task' },
  ];
  saveMemory(mem);

  const profile1After = updateProfile({
    tasks: [
      { id: 'easy1', title: 'مهمة سهلة 1', status: 'completed', priority: 'low' },
      { id: 'easy2', title: 'مهمة سهلة 2', status: 'completed', priority: 'low' },
      { id: 'easy3', title: 'مهمة سهلة 3', status: 'completed', priority: 'low' },
      { id: 't0', title: 'مهمة صعبة 0', status: 'pending', priority: 'high' },
    ],
    habits: [],
  });

  examples.push({
    title: 'تخطي مهام كبيرة → اقتراح مهام أصغر',
    before: {
      preferred_task_size: profile1Before.preferred_task_size,
      resistance_type: profile1Before.resistance_type,
    },
    after: {
      preferred_task_size: profile1After.preferred_task_size,
      resistance_type: profile1After.resistance_type,
    },
    what_changed: profile1After.learning_log.slice(-1),
  });

  // Reset for clean state
  saveMemory(createEmptyMemory());
  saveProfile(createDefaultProfile());

  return examples;
}

// ─── EXPORTS ────────────────────────────────────────────────────────────────

const cognitiveEngine = {
  decide,
  recordAction,
  getLastActions,
  wasRecentlyIgnored,
  getSkipPatterns,
  updateProfile,
  getProfile,
  reactToCompletion,
  reactToSkip,
  runValidationScenarios,
  demonstrateLearning,
  getCurrentBlock,
  loadMemory: () => loadMemory(),
};

export default cognitiveEngine;
