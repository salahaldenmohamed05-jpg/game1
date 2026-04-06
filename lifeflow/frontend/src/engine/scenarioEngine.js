/**
 * Arabic Assistant Scenario Engine
 * ==================================
 * Personality: Direct, motivational, practical, slightly challenging
 * Language: Egyptian Arabic, simple short sentences, optional light English
 * NO formal Arabic (فصحى). Always colloquial (عامية مصرية).
 *
 * Response Structure: [Hook] → [Reality Check] → [Action] → [Reinforcement]
 *
 * 5 SCENARIOS:
 *   1. PROCRASTINATION — User has tasks but keeps skipping/delaying
 *   2. BURNOUT         — Overloaded, low energy, declining performance
 *   3. MOMENTUM        — On a roll, completing tasks consistently
 *   4. CONFUSION       — Too many tasks, unclear priorities
 *   5. COMEBACK        — Returning after absence
 *
 * Each scenario has:
 *   - Trigger detection logic (inputs → boolean)
 *   - Structured response generator ([Hook] → [Reality Check] → [Action] → [Reinforcement])
 *   - 3+ example input/output pairs
 *   - Escalation rules (response changes based on severity)
 */

import { BEHAVIOR_STATES, computeEnergyLevel } from './behavioralEngine';

// ─── SCENARIO DEFINITIONS ───────────────────────────────────────────────────

export const SCENARIOS = {
  PROCRASTINATION: 'procrastination',
  BURNOUT: 'burnout',
  MOMENTUM: 'momentum',
  CONFUSION: 'confusion',
  COMEBACK: 'comeback',
};

// ─── SCENARIO 1: PROCRASTINATION ────────────────────────────────────────────
/**
 * TRIGGER: User has tasks but completion rate < 20% AND skips >= 2
 * OR: Has been online but completed 0 tasks in last 2 hours
 *
 * STRATEGY: Two-Minute Rule → start ridiculously small
 * TONE: Direct + empathetic, never shaming
 */
const PROCRASTINATION_RESPONSES = {
  mild: {
    // skips: 2-3, some tasks done today
    hooks: [
      'عندك مهام مستنياك — بس مش لازم تعمل كلها',
      'أنا فاهم إن البداية صعبة',
      'مش كل يوم لازم يكون مثالي',
    ],
    realityChecks: [
      'بس كل ما تأجل، المهمة بتكبر في دماغك أكتر من حجمها الحقيقي',
      'التأجيل مش كسل — دا دماغك بيهرب من حاجة مش واضحة',
      'اللي بيأجل مش ضعيف — بس محتاج يبدأ بحاجة أصغر',
    ],
    actions: [
      'افتح أسهل مهمة عندك واعمل فيها دقيقتين بس. لو عايز تكمل كمّل، لو لأ مفيش مشكلة',
      'قسّم المهمة الكبيرة لـ3 خطوات — وابدأ بأول واحدة دلوقتي',
      'اختار مهمة واحدة بس — اللي ممكن تخلصها في 5 دقايق',
    ],
    reinforcements: [
      'أول خطوة أصعب من الباقي كله — وأنت لسه عندك وقت',
      'كل مهمة بتكملها بتبني ثقة — ابدأ بواحدة',
      'مش لازم تحس إنك جاهز — ابدأ وهتلاقي نفسك جاهز',
    ],
  },
  severe: {
    // skips: 4+, 0 tasks done, been online a while
    hooks: [
      'خلينا نكون صريحين — أنت بتأجل من فترة',
      'أنا مش هكذب عليك — عندك مشكلة تأجيل',
      'الوقت بيجري وأنت واقف',
    ],
    realityChecks: [
      'كل ساعة بتعدي من غير ما تبدأ، المهمة بتحسها أصعب. بس هي نفسها',
      'التأجيل ليه تمن — وبيتراكم. النهاردة أسهل من بكرة',
      'أنت مش محتاج motivation. أنت محتاج تبدأ — والـ motivation هييجي بعدها',
    ],
    actions: [
      'دلوقتي: أقفل كل حاجة تانية. افتح مهمة واحدة. اشتغل فيها 2 دقيقة. بس كده',
      'قاعدة الـ 2 دقيقة: لو المهمة ممكن تتعمل في دقيقتين، اعملها دلوقتي. لو أكبر — ابدأ أول دقيقتين منها',
      'اعمل صفقة مع نفسك: 5 دقايق شغل، وبعدها لو عايز توقف — وقف. بس ابدأ الأول',
    ],
    reinforcements: [
      'أنت مش ضعيف — أنت بس محتاج تبدأ. والبداية بتكسر كل حاجة',
      'الناس الناجحة مش بيبقوا motivated كل يوم — بيبدؤوا وخلاص',
      'كل مرة بتبدأ غصب عنك — دي هوية جديدة بتتبني',
    ],
  },
};

// ─── SCENARIO 2: BURNOUT ────────────────────────────────────────────────────
/**
 * TRIGGER: totalTasks > 8 AND completionRate < 30%
 * OR: moodScore < 4 AND tasks > 5
 * OR: Declining completion rate over 3 days
 *
 * STRATEGY: Reduce friction, protect energy, say "no" to tasks
 * TONE: Calm, protective, permission to rest
 */
const BURNOUT_RESPONSES = {
  mild: {
    hooks: [
      'يومك مزحوم شوية — بس ده مش معناه لازم تعمل كل حاجة',
      'لو حاسس بتعب، ده مش ضعف — ده جسمك بيقولك استنى',
      'أنت بتشتغل كتير — والراحة جزء من الشغل',
    ],
    realityChecks: [
      'لو حاولت تعمل كل حاجة النهاردة، مش هتعمل حاجة صح',
      'الإنتاجية الحقيقية مش إنك تعمل أكتر — إنك تعمل الصح',
      '8+ مهام في يوم واحد كتير على أي حد — مش عليك بس',
    ],
    actions: [
      'اختار أهم 3 مهام بس — وألغي أو أجّل الباقي. إيه أهم 3؟',
      'خذ استراحة 15 دقيقة دلوقتي. بجد. قوم من مكانك واتمشى',
      'اعمل reset: ألغي كل حاجة مش urgent وابدأ يومك من جديد',
    ],
    reinforcements: [
      'الراحة مش كسل — دي استثمار في إنتاجية بكرة',
      'أنت بتحمي نفسك — وده أذكى قرار تاخده النهاردة',
      'بكرة هتكون أقوى لو ارتحت النهاردة',
    ],
  },
  severe: {
    hooks: [
      'وقف. أنت محتاج تاخد نفس',
      'أنا شايف إنك بتحاول تعمل كل حاجة — وده مش مطلوب',
      'خلينا نكون واقعيين — جسمك بيقولك كفاية',
    ],
    realityChecks: [
      'لو كملت بالطريقة دي، مش بس هتتعب — هتكره الشغل نفسه',
      'الـ burnout مش بييجي من كتر الشغل — بييجي من إنك مش بتاخد بريك',
      'أنت مش ماكينة. والماكينات نفسها بتوقف للصيانة',
    ],
    actions: [
      'دلوقتي: ألغي أي مهمة مش حياة أو موت. واعمل مهمة واحدة بس — الأهم',
      'غيّر المكان. اقفل الشاشة 10 دقايق. ارجع بس لما تحس إنك مستعد',
      'اكتبلي أهم مهمة واحدة عندك — وأنا هساعدك تقسمها لخطوات صغيرة',
    ],
    reinforcements: [
      'القائد الحقيقي يعرف يقول لأ — وده اللي أنت بتعمله دلوقتي',
      'صحتك أولاً. المهام هتفضل موجودة — أنت اللي لازم تفضل موجود',
      'أنت بتاخد قرار ذكي — مش ضعيف',
    ],
  },
};

// ─── SCENARIO 3: MOMENTUM ───────────────────────────────────────────────────
/**
 * TRIGGER: consecutiveCompletions >= 3 OR completionRate > 70%
 *
 * STRATEGY: Ride the wave, challenge with harder tasks, reinforce identity
 * TONE: Energetic, challenging, celebrating
 */
const MOMENTUM_RESPONSES = {
  mild: {
    // 3-5 completions, good day
    hooks: [
      'أنت ماشي بقوة النهاردة!',
      'الزخم ده حقيقي — استغله',
      'شايف الإنجاز ده؟ ده أنت',
    ],
    realityChecks: [
      'الأيام الكويسة دي لازم تستغلها — مش كل يوم بييجي كده',
      'الزخم ده مش حظ — ده نتيجة إنك بدأت',
      'لو كملت دلوقتي، هتنام النهاردة وأنت مرتاح',
    ],
    actions: [
      'كمّل! خذ أصعب مهمة عندك — دلوقتي طاقتك تسمح',
      'استغل الزخم: انقل المهمة اللي كنت بتأجلها — دلوقتي وقتها',
      'عايز challenge؟ خلّص كل مهامك قبل ${new Date().getHours() + 2}:00',
    ],
    reinforcements: [
      'كل مهمة بتكملها بتقول: أنا شخص منجز. واليوم ده إثبات',
      'أنت مش بتعمل مهام — أنت بتبني هوية',
      'ده اليوم اللي هتفتكره وتقول: أنا فعلاً اتغيرت',
    ],
  },
  peak: {
    // 5+ completions, exceptional day
    hooks: [
      'يوم خرافي! مين يوقفك؟',
      'أنت بطل اليوم — وده مش مبالغة',
      'ده أداء مش عادي!',
    ],
    realityChecks: [
      'أيام زي دي بتثبت إنك قادر — فاكرها كويس',
      'ده مش luck — ده إنت',
      'اليوم ده proof إن النظام شغال',
    ],
    actions: [
      'عايز تكسر الرقم القياسي بتاعك؟ يلا!',
      'كمّل! أنت في الـ zone — استغلها لآخرها',
      'ابدأ حاجة كنت بتحلم بيها من زمان — النهاردة اليوم',
    ],
    reinforcements: [
      'أنت مش بس عملت مهام — أنت أثبتلي ولنفسك إنك شخص تاني',
      'ده اليوم اللي بيغير كل حاجة — والعبرة بالاستمرار',
      'النهاردة أنت فتحت مستوى جديد — ما ترجعش',
    ],
  },
};

// ─── SCENARIO 4: CONFUSION ──────────────────────────────────────────────────
/**
 * TRIGGER: totalTasks > 5 AND no completions AND skips >= 1
 * OR: User explicitly asks "ابدأ بإيه" or "مش عارف"
 *
 * STRATEGY: Prioritize, simplify, give ONE clear next step
 * TONE: Structured, calm, decisive
 */
const CONFUSION_RESPONSES = {
  mild: {
    hooks: [
      'كتير قدامك؟ خليني أرتبهالك',
      'مش لازم تعرف كل حاجة — تعرف الخطوة الجاية بس',
      'أنا هنا أساعدك ترتب',
    ],
    realityChecks: [
      'لما بتبص على كل حاجة مع بعض، بتتوه. ركّز على واحدة',
      'مفيش حد بيعرف يعمل 10 حاجات في نفس الوقت — حتى أذكى الناس',
      'الإحساس إنك تايه مش معناه إنك فاشل — معناه عندك خيارات كتير',
    ],
    actions: [
      'إليك أهم مهمة واحدة دلوقتي. ابدأ بيها وبس. الباقي هيستنى',
      'اسأل نفسك: لو مقدرش أعمل غير حاجة واحدة النهاردة — إيه هي؟ ابدأ بيها',
      'خلينا نعمل كده: 1) أهم مهمة 2) أسرع مهمة 3) الباقي بعدين',
    ],
    reinforcements: [
      'الوضوح بييجي من الفعل — مش من التفكير. ابدأ وهتوضح',
      'مش لازم تشوف الطريق كله — خطوة واحدة كفاية',
      'أنت مش تايه — أنت بس محتاج تبدأ من نقطة واحدة',
    ],
  },
  severe: {
    hooks: [
      'أنا فاهم — كل حاجة مهمة ومش عارف تبدأ منين',
      'وقف. خذ نفس. وخليني أرتب معاك',
      'الحل بسيط: مهمة واحدة. واحدة بس',
    ],
    realityChecks: [
      'كل ما تفكر أكتر من غير ما تبدأ، بتزيد التوتر. الحل: ابدأ بأي حاجة',
      'مفيش ترتيب مثالي — أي بداية أحسن من لا بداية',
      'دماغك بيـ overthink لأنه خايف يغلط. بس أي خطوة صح',
    ],
    actions: [
      'دلوقتي: اختار أول مهمة في القايمة — أياً كانت — واشتغل فيها 5 دقايق',
      'أنا مرتبهالك بالأولوية. ابدأ بالأولى. بلاش تفكر في الباقي',
      'قاعدة: لو مش عارف تبدأ بإيه — ابدأ بالأسهل. الزخم هييجي',
    ],
    reinforcements: [
      'أنت أذكى مما بتفتكر — بس محتاج تبدأ عشان تشوف ده',
      'مفيش غلط تبدأ بالسهل — ده بالظبط اللي الناجحين بيعملوه',
      'أول ما تخلص حاجة واحدة — هتحس إن كل حاجة اتغيرت',
    ],
  },
};

// ─── SCENARIO 5: COMEBACK ───────────────────────────────────────────────────
/**
 * TRIGGER: daysSinceLastActivity >= 3
 *
 * STRATEGY: Zero guilt, celebrate return, start tiny
 * TONE: Warm, welcoming, zero shame
 */
const COMEBACK_RESPONSES = {
  mild: {
    // 3-7 days absent
    hooks: [
      'أهلاً بعودتك! 💙',
      'رجعت — وده أهم خطوة',
      'مفيش مشكلة إنك غبت — المهم إنك رجعت',
    ],
    realityChecks: [
      'كل الناس بتوقف أحياناً. اللي بيفرق هو إنك ترجع — وأنت رجعت',
      'السلاسل اللي اتقطعت ممكن تتبني تاني — من النهاردة',
      'غيابك مش نهاية — رجوعك هو البداية الجديدة',
    ],
    actions: [
      'ابدأ بعادة واحدة بس — أسهل واحدة عندك. مش محتاج أكتر من كده النهاردة',
      'خليني أقترح عليك: سجّل عادة واحدة وخلّص مهمة وحدة صغيرة — وكده يومك ناجح',
      'مش لازم تعوّض اللي فات — ركّز على النهاردة بس',
    ],
    reinforcements: [
      'كل يوم بترجع فيه — ده تصويت لنفسك الجديدة',
      'مش مهم كام يوم غبت — المهم إنك رجعت. وده يكفي',
      'أنت قررت ترجع — وده أصعب قرار. الباقي سهل',
    ],
  },
  severe: {
    // 7+ days absent
    hooks: [
      'فاتك وقت — بس لسه عندك وقت',
      'أنا مبسوط إنك فتحت التطبيق — ده في حد ذاته إنجاز',
      'بعد غياب طويل، رجوعك هو أهم حاجة حصلت النهاردة',
    ],
    realityChecks: [
      'مفيش حد بيمشي في خط مستقيم. الحياة فيها ups and downs — المهم ترجع',
      'اللي فات مش مهم — المهم إنك النهاردة قررت تبدأ تاني',
      'أنت مش بادئ من الصفر — أنت بادئ من الخبرة',
    ],
    actions: [
      'أبسط حاجة ممكن تعملها دلوقتي: افتح قايمة المهام واقرأها — بس كده',
      'النهاردة عايزك تعمل حاجة واحدة بس: سجّل عادة أو خلّص مهمة صغيرة',
      'ابدأ بدقيقتين — لو حبيت كمّل، لو لأ ده كفاية. البداية هي الهدف',
    ],
    reinforcements: [
      'كل الناس الناجحة وقعت ورجعت. أنت في الطريق الصح',
      'رجوعك بعد غياب طويل أصعب بكتير من إنك تكمل. وأنت عملتها',
      'النهاردة يوم جديد — وأنت شخص جديد. ابدأ من هنا',
    ],
  },
};

// ─── SCENARIO DETECTION ─────────────────────────────────────────────────────

/**
 * Detects which scenario the user is in based on inputs.
 *
 * @param {Object} inputs
 * @returns {{ scenario: string, severity: string, confidence: number }}
 */
export function detectScenario(inputs) {
  const {
    skips = 0,
    completionRate = 0,
    consecutiveCompletions = 0,
    daysSinceLastActivity = 0,
    totalTasksToday = 0,
    completedToday = 0,
    moodScore = null,
    habitsTotal = 0,
    habitsCompletedToday = 0,
  } = inputs || {};

  // COMEBACK — highest priority (returning users need special care)
  if (daysSinceLastActivity >= 7) {
    return { scenario: SCENARIOS.COMEBACK, severity: 'severe', confidence: 95 };
  }
  if (daysSinceLastActivity >= 3) {
    return { scenario: SCENARIOS.COMEBACK, severity: 'mild', confidence: 90 };
  }

  // BURNOUT
  if ((totalTasksToday > 8 && completionRate < 30) ||
      (moodScore !== null && moodScore < 4 && totalTasksToday > 5)) {
    return {
      scenario: SCENARIOS.BURNOUT,
      severity: totalTasksToday > 10 || (moodScore !== null && moodScore < 3) ? 'severe' : 'mild',
      confidence: 85,
    };
  }

  // MOMENTUM
  if (consecutiveCompletions >= 5 || completionRate > 80) {
    return { scenario: SCENARIOS.MOMENTUM, severity: 'peak', confidence: 90 };
  }
  if (consecutiveCompletions >= 3 || completionRate > 60) {
    return { scenario: SCENARIOS.MOMENTUM, severity: 'mild', confidence: 80 };
  }

  // PROCRASTINATION
  if (skips >= 4 && completedToday === 0 && totalTasksToday > 0) {
    return { scenario: SCENARIOS.PROCRASTINATION, severity: 'severe', confidence: 90 };
  }
  if (skips >= 2 && completionRate < 20 && totalTasksToday > 0) {
    return { scenario: SCENARIOS.PROCRASTINATION, severity: 'mild', confidence: 75 };
  }

  // CONFUSION
  if (totalTasksToday > 5 && completedToday === 0 && skips >= 1) {
    return { scenario: SCENARIOS.CONFUSION, severity: 'severe', confidence: 70 };
  }
  if (totalTasksToday > 3 && completedToday === 0) {
    return { scenario: SCENARIOS.CONFUSION, severity: 'mild', confidence: 60 };
  }

  // Default: no specific scenario detected
  return { scenario: null, severity: 'none', confidence: 0 };
}

// ─── RESPONSE GENERATOR ─────────────────────────────────────────────────────

const SCENARIO_RESPONSES = {
  [SCENARIOS.PROCRASTINATION]: PROCRASTINATION_RESPONSES,
  [SCENARIOS.BURNOUT]: BURNOUT_RESPONSES,
  [SCENARIOS.MOMENTUM]: MOMENTUM_RESPONSES,
  [SCENARIOS.CONFUSION]: CONFUSION_RESPONSES,
  [SCENARIOS.COMEBACK]: COMEBACK_RESPONSES,
};

/**
 * Picks a random item from an array using a time-based seed.
 * Avoids Math.random() in render — uses deterministic hour-based selection.
 */
function pickRandom(arr, seed = null) {
  if (!Array.isArray(arr) || arr.length === 0) return '';
  if (seed !== null) return arr[seed % arr.length];
  // Deterministic: based on current hour + minute to avoid Math.random in render
  const now = new Date();
  const timeSeed = now.getHours() * 60 + now.getMinutes();
  return arr[timeSeed % arr.length];
}

/**
 * Generates a structured response for a detected scenario.
 *
 * Response structure: [Hook] → [Reality Check] → [Action] → [Reinforcement]
 *
 * @param {Object} detection - Output from detectScenario()
 * @param {Object} context - Additional context (task names, habit names, etc.)
 * @returns {{ hook: string, realityCheck: string, action: string, reinforcement: string, fullMessage: string, scenario: string, severity: string }}
 */
export function generateScenarioResponse(detection, context = {}) {
  const { scenario, severity } = detection || {};

  if (!scenario || !SCENARIO_RESPONSES[scenario]) {
    // Fallback for no detected scenario
    return {
      hook: 'يلا نبدأ يومك',
      realityCheck: 'كل يوم فرصة جديدة',
      action: 'اختار مهمة واحدة وابدأ فيها',
      reinforcement: 'كل خطوة بتقربك',
      fullMessage: 'يلا نبدأ يومك! 💪\n\nكل يوم فرصة جديدة.\n\n👉 اختار مهمة واحدة وابدأ فيها.\n\nكل خطوة بتقربك من اللي عايز تكونه.',
      scenario: null,
      severity: 'none',
    };
  }

  const responses = SCENARIO_RESPONSES[scenario][severity] || SCENARIO_RESPONSES[scenario].mild;
  if (!responses) {
    return {
      hook: 'يلا نشتغل',
      realityCheck: '',
      action: 'ابدأ بأول مهمة',
      reinforcement: 'أنت تقدر',
      fullMessage: 'يلا نشتغل! ابدأ بأول مهمة — أنت تقدر.',
      scenario,
      severity,
    };
  }

  const hook = pickRandom(responses.hooks);
  const realityCheck = pickRandom(responses.realityChecks);
  const action = pickRandom(responses.actions);
  const reinforcement = pickRandom(responses.reinforcements);

  // Personalize with context
  let personalizedAction = action;
  if (context.nextTaskTitle) {
    personalizedAction = action.replace(/أول مهمة|المهمة|مهمة واحدة/g, `"${context.nextTaskTitle}"`);
  }

  const fullMessage = `${hook}\n\n${realityCheck}\n\n👉 ${personalizedAction}\n\n💡 ${reinforcement}`;

  return {
    hook,
    realityCheck,
    action: personalizedAction,
    reinforcement,
    fullMessage,
    scenario,
    severity,
  };
}

// ─── MASTER FUNCTION ────────────────────────────────────────────────────────

/**
 * Full scenario analysis: detect + generate response.
 *
 * @param {Object} inputs - Behavioral inputs
 * @param {Object} context - Additional context
 * @returns {Object} Complete scenario analysis with response
 */
export function analyzeScenario(inputs, context = {}) {
  const detection = detectScenario(inputs);
  const response = generateScenarioResponse(detection, context);

  return {
    ...detection,
    response,
    inputs,
    timestamp: new Date().toISOString(),
  };
}

// ─── EXAMPLE INPUTS/OUTPUTS (Documentation) ─────────────────────────────────
/**
 * SCENARIO 1: PROCRASTINATION
 *
 * Example 1 (Mild):
 *   INPUT:  { skips: 2, completionRate: 15, completedToday: 1, totalTasksToday: 7 }
 *   OUTPUT: {
 *     scenario: 'procrastination', severity: 'mild',
 *     hook: 'عندك مهام مستنياك — بس مش لازم تعمل كلها',
 *     action: 'افتح أسهل مهمة عندك واعمل فيها دقيقتين بس',
 *     reinforcement: 'أول خطوة أصعب من الباقي كله'
 *   }
 *
 * Example 2 (Severe):
 *   INPUT:  { skips: 5, completionRate: 0, completedToday: 0, totalTasksToday: 6 }
 *   OUTPUT: {
 *     scenario: 'procrastination', severity: 'severe',
 *     hook: 'خلينا نكون صريحين — أنت بتأجل من فترة',
 *     action: 'دلوقتي: أقفل كل حاجة تانية. افتح مهمة واحدة. اشتغل فيها 2 دقيقة',
 *     reinforcement: 'أنت مش ضعيف — أنت بس محتاج تبدأ'
 *   }
 *
 * Example 3 (With context):
 *   INPUT:  { skips: 3, completionRate: 10, completedToday: 0, totalTasksToday: 5 }
 *   CONTEXT: { nextTaskTitle: 'مراجعة الفصل الثالث' }
 *   OUTPUT: {
 *     scenario: 'procrastination', severity: 'mild',
 *     action: 'اختار "مراجعة الفصل الثالث" — اللي ممكن تخلصها في 5 دقايق'
 *   }
 *
 * SCENARIO 2: BURNOUT
 *
 * Example 1: { totalTasksToday: 12, completionRate: 20, moodScore: 3 }
 *   → severe burnout, suggests resting and focusing on 1 task only
 *
 * Example 2: { totalTasksToday: 9, completionRate: 25 }
 *   → mild burnout, suggests picking top 3 priorities
 *
 * Example 3: { totalTasksToday: 10, completionRate: 15, moodScore: 2 }
 *   → severe burnout with mood data, stronger protection tone
 *
 * SCENARIO 3: MOMENTUM
 *
 * Example 1: { consecutiveCompletions: 4, completionRate: 65 }
 *   → mild momentum, encourages continuing
 *
 * Example 2: { consecutiveCompletions: 7, completionRate: 85 }
 *   → peak momentum, challenges for more, celebrates
 *
 * Example 3: { consecutiveCompletions: 3, completionRate: 70, streak: 14 }
 *   → mild momentum + streak milestone recognition
 *
 * SCENARIO 4: CONFUSION
 *
 * Example 1: { totalTasksToday: 8, completedToday: 0, skips: 2 }
 *   → severe confusion, provides ONE clear next step
 *
 * Example 2: { totalTasksToday: 5, completedToday: 0, skips: 0 }
 *   → mild confusion, helps prioritize
 *
 * Example 3: { totalTasksToday: 6, completedToday: 0, skips: 1 }
 *   → mild confusion with context, personalizes action
 *
 * SCENARIO 5: COMEBACK
 *
 * Example 1: { daysSinceLastActivity: 4 }
 *   → mild comeback, warm welcome, suggests 1 easy action
 *
 * Example 2: { daysSinceLastActivity: 10 }
 *   → severe comeback, celebrates return, zero guilt
 *
 * Example 3: { daysSinceLastActivity: 5, streak: 21 }
 *   → mild comeback with streak loss context, motivates rebuilding
 */

const scenarioEngine = {
  SCENARIOS,
  detectScenario,
  generateScenarioResponse,
  analyzeScenario,
};

export default scenarioEngine;
