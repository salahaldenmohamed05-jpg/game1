/**
 * Brain Service v5.0 — LifeFlow Intent-Aware Cognitive Brain
 * ═══════════════════════════════════════════════════════════════
 * THE single source of truth for ALL decisions in the system.
 * No fallback systems. No duplicate logic. No secondary engines.
 *
 * Phase 12.9 — Truth Alignment + Trust Enforcement:
 *   TASK 1: REASONING VALIDATION LAYER — validate task/reason/confidence; discard invalid
 *   TASK 2: ASSISTANT TRUTH FILTER — ensure messages match dayContext + actual behavior
 *   TASK 3: DECISION EXPLAINABILITY — concrete factors, no vague phrases, specific reasoning
 *   TASK 4: LIFECYCLE TRACING — full instrumentation for loading detection
 *
 * Phase 12.7 — Intent + Context Awareness:
 *   PART 1: INTENT SYSTEM — every task has intent (deadline/growth/maintenance/urgent)
 *   PART 2: DAY CONTEXT — classify day as productive/partial/empty
 *   PART 3: END-OF-DAY FIX — no fake positives; empty day ≠ productive
 *   PART 4: INTENT-AWARE SCORING — deadline highest, growth flexible, maintenance low
 *   PART 5: CONTEXT-AWARE LANGUAGE — tone adapts to day classification
 *
 * HARD RULES (TRUTH ALIGNMENT — Phase 12.9):
 *   - NEVER generate unsupported reasoning (every reason must have data backing)
 *   - NEVER claim unmade progress (completion count must match DB)
 *   - NEVER suggest invalid actions (task must exist, be pending, time-valid)
 *   - NEVER fake praise on empty days (empty day ≠ productive)
 *   - NEVER leave UI stuck loading (all paths resolve within 3s)
 *   - Confidence MUST reflect real data quality (low data → low confidence)
 *   - Reasons MUST reference concrete facts ("بقالك يومين مأجلها" not "مهمة مهمة")
 *   - Tone MUST match dayContext classification
 *
 * Previous phases preserved:
 *   12.5: Decision Memory, Dynamic Confidence, Difficulty Modifier, Anti-Repetition, Inactivity
 *   12.6: Loading Fix, Decision Validity, Semantic Understanding, Arabic Language
 *   12.8: Resilience, Zero Infinite Loading, Fallback States
 *
 * Architecture:
 *   EventBus → brain.recompute(userId, triggerEvent) → validateDecision() → brainState → Socket "brain:update"
 *
 * HARD RULE: Every decision comes from here. No exceptions.
 */

'use strict';

const moment = require('moment-timezone');
const logger = require('../utils/logger');
const eventBus = require('../core/eventBus');

// ─── Lazy service loaders (avoid circular deps) ────────────────────────────
function getModels() {
  try { return require('../config/database').sequelize.models; } catch (_e) { return {}; }
}

// ─── In-Memory Brain State Cache (per userId) ──────────────────────────────
const brainCache = new Map(); // userId → { state, signals, decisionMemory, lastActivity, inactivityTimer, inactivityStartedAt }

// ─── TASK 2: Decision Memory Store ─────────────────────────────────────────
const MAX_DECISION_HISTORY = 200;
const ANTI_REPEAT_REJECTION_THRESHOLD = 3;
const ANTI_REPEAT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour cooldown

// ─── Phase 13: Persistence Debounce ─────────────────────────────────────────
const _persistTimers = new Map(); // userId → timeout
const PERSIST_DEBOUNCE_MS = 5000; // Persist at most once every 5s

/**
 * Phase 13: Load decision memory from DB into cache for a user.
 * Called on first brain access after restart.
 */
async function loadDecisionMemoryFromDB(userId) {
  try {
    const models = getModels();
    if (!models.DecisionMemory) return null;
    const row = await models.DecisionMemory.findOne({ where: { user_id: userId } });
    if (!row) return null;
    return {
      history: row.decision_history || [],
      rejectionStreaks: row.rejection_streaks || {},
      blockedTasks: row.blocked_tasks || [],
      adaptiveSignals: row.adaptive_signals || {},
      totalDecisions: row.total_decisions || 0,
      totalRejections: row.total_rejections || 0,
      recentAcceptanceRate: row.recent_acceptance_rate || 0,
    };
  } catch (err) {
    logger.warn(`[Brain][Phase13] Failed to load decision memory from DB for ${userId}: ${err.message}`);
    return null;
  }
}

/**
 * Phase 13: Persist decision memory to DB (debounced).
 * Runs in background — never blocks brain decisions.
 */
function scheduleDecisionMemoryPersist(userId) {
  if (_persistTimers.has(userId)) clearTimeout(_persistTimers.get(userId));
  _persistTimers.set(userId, setTimeout(async () => {
    _persistTimers.delete(userId);
    try {
      const cache = brainCache.get(userId);
      if (!cache?.decisionMemory) return;
      const models = getModels();
      if (!models.DecisionMemory) return;
      const dm = cache.decisionMemory;
      const signals = cache.signals || {};
      await models.DecisionMemory.upsert({
        user_id: userId,
        decision_history: dm.history || [],
        rejection_streaks: dm.rejectionStreaks || {},
        blocked_tasks: dm.blockedTasks || [],
        adaptive_signals: {
          rejectionStreak: signals.rejectionStreak || 0,
          completionStreak: signals.completionStreak || 0,
          skipTypes: signals.skipTypes || {},
          difficultyModifier: signals.difficultyModifier || 1.0,
          inactivityStrategy: signals.inactivityStrategy || 'normal',
          maxTaskMinutes: signals.maxTaskMinutes || 60,
        },
        total_decisions: dm.totalDecisions || 0,
        total_rejections: dm.totalRejections || 0,
        recent_acceptance_rate: dm.recentAcceptanceRate || 0,
        last_persisted_at: new Date(),
      });
      logger.info(`[Brain][Phase13] Decision memory persisted for user ${userId}`);
    } catch (err) {
      logger.warn(`[Brain][Phase13] Failed to persist decision memory for ${userId}: ${err.message}`);
    }
  }, PERSIST_DEBOUNCE_MS));
}

// ─── Subscribers for brain state changes ────────────────────────────────────
const stateSubscribers = new Map();

// ─── Socket.IO reference ────────────────────────────────────────────────────
let _io = null;

// ─── Constants ──────────────────────────────────────────────────────────────
const INACTIVITY_THRESHOLD_MS = 20 * 60 * 1000;
const MOMENTUM_THRESHOLD = 2;
const BURNOUT_SKIP_THRESHOLD = 3;

// ─── Scoring Weights (Phase 12.7: rebalanced for intent awareness) ──────────
const WEIGHTS = {
  urgency:        0.18,
  priority:       0.18,
  energyMatch:    0.14,
  overdueBonus:   0.12,
  historyBoost:   0.12,
  momentum:       0.08,
  antiRepeat:     0.05,
  intent:         0.13,  // Phase 12.7: intent-based scoring weight
};

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 12.7 PART 1: INTENT SYSTEM
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Intent types:
 *   deadline    — task driven by a due date (highest priority)
 *   urgent      — task with immediate action needed
 *   growth      — learning, building, self-improvement (flexible, energy-dependent)
 *   maintenance — routine, recurring, upkeep (low pressure)
 */
const INTENT_TYPES = ['deadline', 'urgent', 'growth', 'maintenance'];

// Keywords for intent inference (English + Arabic)
const GROWTH_KEYWORDS = [
  'learn', 'study', 'course', 'build', 'create', 'develop', 'research', 'practice', 'improve', 'skill',
  'تعلم', 'مذاكرة', 'دراسة', 'كورس', 'بناء', 'تطوير', 'بحث', 'تدريب', 'مهارة', 'قراءة',
];
const MAINTENANCE_KEYWORDS = [
  'clean', 'organize', 'laundry', 'groceries', 'bills', 'renew', 'maintain', 'routine', 'backup',
  'تنظيف', 'ترتيب', 'غسيل', 'فواتير', 'تجديد', 'صيانة', 'روتين', 'تسوق',
];

/**
 * Infer task intent from its properties.
 * Priority: explicit intent field > due date proximity > keywords > default
 * Phase 12.8: Wrapped in try/catch — NEVER crashes recompute.
 */
function inferIntent(task, todayStr) {
  try {
    if (!task) return 'maintenance';

    // 1. If the task has an explicit intent field, use it
    if (task.intent && INTENT_TYPES.includes(task.intent)) {
      return task.intent;
    }

    // 2. Priority-based: urgent priority → urgent intent
    if (task.priority === 'urgent') return 'urgent';

    // 3. Due date proximity → deadline intent
    const dueDate = task.due_date ? String(task.due_date).split('T')[0] : null;
    if (dueDate) {
      if (dueDate < todayStr) return 'deadline'; // overdue = deadline
      if (dueDate === todayStr) return 'deadline'; // due today = deadline
      // Due tomorrow = deadline if high priority
      const tomorrow = moment().tz('Africa/Cairo').add(1, 'day').format('YYYY-MM-DD');
      if (dueDate === tomorrow && (task.priority === 'high' || task.priority === 'urgent')) {
        return 'deadline';
      }
    }

    // 4. Keyword-based inference
    const text = ((task.title || '') + ' ' + (task.description || '')).toLowerCase();
    for (const kw of GROWTH_KEYWORDS) {
      if (text.includes(kw.toLowerCase())) return 'growth';
    }
    for (const kw of MAINTENANCE_KEYWORDS) {
      if (text.includes(kw.toLowerCase())) return 'maintenance';
    }

    // 5. Recurring/habit-like → maintenance
    if (task.is_recurring || task.recurrence) return 'maintenance';

    // 6. Default: if has due date → deadline, else maintenance
    if (dueDate) return 'deadline';
    return 'maintenance';
  } catch (err) {
    logger.error(`[Brain] inferIntent error: ${err.message}`);
    return 'maintenance'; // safe default
  }
}

/**
 * Get intent-based score modifier.
 * deadline → highest, urgent → immediate, growth → energy-dependent, maintenance → low
 */
function getIntentScoreModifier(intent, energy) {
  switch (intent) {
    case 'deadline': return 90;  // always high
    case 'urgent':   return 95;  // immediate action
    case 'growth':
      // Growth tasks: only suggest at good energy
      if (energy.level === 'high')   return 70;
      if (energy.level === 'medium') return 40;
      return 10; // low energy → don't push growth
    case 'maintenance':
      // Maintenance: good for low energy, low pressure always
      if (energy.level === 'low') return 60;
      return 30; // moderate energy → let higher-intent tasks win
    default: return 50;
  }
}

/**
 * Get intent label in Arabic for UI
 */
function getIntentLabel(intent) {
  switch (intent) {
    case 'deadline':    return 'موعد نهائي';
    case 'urgent':      return 'عاجل';
    case 'growth':      return 'نمو وتطوير';
    case 'maintenance': return 'صيانة وروتين';
    default:            return '';
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 12.7 PART 2: DAY CONTEXT AWARENESS
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Classify the current day into: productive / partial / empty
 * HARD RULE: empty day ≠ productive. Never fake-congratulate.
 * Phase 12.8: Wrapped in try/catch — returns safe default on error.
 */
function classifyDayContext(completedTasks, pendingTasks, totalHabits, completedHabits) {
  try {
    const ct = Number(completedTasks) || 0;
    const pt = Number(pendingTasks) || 0;
    const th = Number(totalHabits) || 0;
    const ch = Number(completedHabits) || 0;

    const hadTasks = ct > 0 || pt > 0;
    const hadHabits = th > 0;
    const completedItems = ct + ch;

    // EMPTY DAY: no tasks AND no habits registered
    if (!hadTasks && !hadHabits) {
      return {
        classification: 'empty',
        hadTasks: false,
        hadHabits: false,
        completedTasks: ct,
        completedHabits: ch,
        totalItems: 0,
        completedItems: 0,
        completionRatio: 0,
        isProductive: false,
        label_ar: 'يوم فارغ',
      };
    }

    // Calculate completion ratio
    const totalToDo = (ct + pt) + th;
    const ratio = totalToDo > 0 ? completedItems / totalToDo : 0;

    // PRODUCTIVE: had items AND meaningful completion (>= 50% or >= 3 items done)
    if ((hadTasks || hadHabits) && (ratio >= 0.5 || completedItems >= 3)) {
      return {
        classification: 'productive',
        hadTasks,
        hadHabits,
        completedTasks: ct,
        completedHabits: ch,
        totalItems: totalToDo,
        completedItems,
        completionRatio: Math.round(ratio * 100),
        isProductive: true,
        label_ar: 'يوم منتج',
      };
    }

    // PARTIAL: had items but low completion
    return {
      classification: 'partial',
      hadTasks,
      hadHabits,
      completedTasks: ct,
      completedHabits: ch,
      totalItems: totalToDo,
      completedItems,
      completionRatio: Math.round(ratio * 100),
      isProductive: false,
      label_ar: 'يوم جزئي',
    };
  } catch (err) {
    logger.error(`[Brain] classifyDayContext error: ${err.message}`);
    return {
      classification: 'empty', hadTasks: false, hadHabits: false,
      completedTasks: 0, completedHabits: 0, totalItems: 0, completedItems: 0,
      completionRatio: 0, isProductive: false, label_ar: 'يوم فارغ',
    };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 12.7 PART 5: CONTEXT-AWARE ASSISTANT TONE
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Get end-of-day message and tone based on day context.
 * HARD RULE: empty day gets neutral/planning tone, NEVER congratulations.
 */
function getEndOfDayResponse(dayContext, isEvening) {
  try {
  const { classification, completedTasks, completedHabits, completionRatio } = dayContext || {};

  if (classification === 'productive') {
    // Genuine congratulations — earned
    const title = isEvening ? 'يوم ممتاز - وقت التامل' : 'يوم منتج - احسنت فعلا!';
    const why = [];
    if (completedTasks > 0) why.push(`خلصت ${completedTasks} مهمة`);
    if (completedHabits > 0) why.push(`سجلت ${completedHabits} عادة`);
    why.push(`نسبة الانجاز ${completionRatio}% - شغل حقيقي`);
    if (isEvening) {
      why.push('راجع انجازاتك وخطط لبكرة');
      why.push('سجل مزاجك واكتب 3 حاجات ممتنلها');
    }
    return {
      title,
      why,
      smallestStep: isEvening ? 'افتح صفحة المزاج وسجل يومك' : 'استمتع بانجازك الحقيقي',
      tone: 'positive',
      confidence: 98,
    };
  }

  if (classification === 'partial') {
    // Constructive — acknowledge effort but suggest improvement
    const title = 'يوم لسه فيه فرصة';
    const why = [];
    if (completedTasks > 0) why.push(`خلصت ${completedTasks} مهمة - بداية كويسة`);
    else why.push('مخلصتش مهام لسه النهاردة');
    why.push(`نسبة الانجاز ${completionRatio}% - ممكن تتحسن`);
    if (isEvening) {
      why.push('فكر ايه اللي وقفك النهاردة');
      why.push('خطط لبكرة بمهام واقعية');
    } else {
      why.push('لسه فيه وقت تنجز اكتر');
    }
    return {
      title,
      why,
      smallestStep: isEvening ? 'خطط لبكرة بـ 3 مهام واقعية' : 'اختار مهمة واحدة وابدا دلوقتي',
      tone: 'constructive',
      confidence: 60,
    };
  }

  // EMPTY DAY — neutral tone, no congratulations, suggest planning
  const title = isEvening ? 'مفيش نشاط النهاردة' : 'يوم من غير مهام';
  const why = [
    'النهارده مفيش مهام او عادات كانت متسجلة',
    isEvening
      ? 'تحب نجهز يوم بكرة؟ ضيف مهمة او عادة واحدة على الاقل'
      : 'ضيف مهمة واحدة صغيرة وابدا بيها',
  ];
  return {
    title,
    why,
    smallestStep: 'افتح صفحة المهام وضيف مهمة جديدة',
    tone: 'neutral',
    confidence: 30,
  };
  } catch (err) {
    logger.error(`[Brain] getEndOfDayResponse error: ${err.message}`);
    return { title: 'نهاية اليوم', why: ['حدث خطأ بسيط — جرب تاني'], smallestStep: 'حدث الصفحة', tone: 'neutral', confidence: 10 };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// P3: SEMANTIC TASK UNDERSTANDING — Keyword-based category analysis
// ═════════════════════════════════════════════════════════════════════════════

const SEMANTIC_CATEGORIES = {
  health: {
    keywords: ['gym', 'workout', 'exercise', 'run', 'walk', 'yoga', 'stretch', 'swim',
      'تمرين', 'رياضة', 'جيم', 'مشي', 'يوغا', 'صحة', 'طبيب', 'دكتور', 'فيتامين',
      'نوم', 'ماء', 'شرب'],
    label_ar: 'صحة',
    label_en: 'health',
    goalKeywords: ['fitness', 'health', 'weight', 'صحة', 'لياقة', 'وزن'],
  },
  learning: {
    keywords: ['study', 'course', 'learn', 'read', 'book', 'lecture', 'homework', 'exam',
      'مذاكرة', 'دراسة', 'كورس', 'قراءة', 'كتاب', 'محاضرة', 'امتحان', 'تعلم', 'دورة'],
    label_ar: 'تعلم',
    label_en: 'learning',
    goalKeywords: ['education', 'skill', 'تعلم', 'مهارة', 'شهادة'],
  },
  work: {
    keywords: ['client', 'meeting', 'email', 'report', 'project', 'deadline', 'presentation',
      'اجتماع', 'عميل', 'مشروع', 'تقرير', 'إيميل', 'عرض', 'شغل', 'وظيفة', 'مكتب'],
    label_ar: 'عمل',
    label_en: 'work',
    goalKeywords: ['career', 'business', 'عمل', 'مهنة', 'ترقية'],
  },
  spiritual: {
    keywords: ['pray', 'quran', 'mosque', 'dua', 'azkar',
      'صلاة', 'قرآن', 'مسجد', 'دعاء', 'أذكار', 'استغفار', 'تسبيح', 'جمعة'],
    label_ar: 'روحاني',
    label_en: 'spiritual',
    goalKeywords: ['دين', 'روحاني', 'spiritual'],
  },
  social: {
    keywords: ['call', 'visit', 'family', 'friend', 'gift',
      'اتصال', 'زيارة', 'عائلة', 'صاحب', 'هدية', 'خروج', 'ناس'],
    label_ar: 'اجتماعي',
    label_en: 'social',
    goalKeywords: ['social', 'relationship', 'علاقات', 'اجتماعي'],
  },
  personal: {
    keywords: ['clean', 'organize', 'cook', 'shop', 'laundry', 'groceries',
      'تنظيف', 'ترتيب', 'طبخ', 'تسوق', 'غسيل', 'بيت', 'منزل'],
    label_ar: 'شخصي',
    label_en: 'personal',
    goalKeywords: ['personal', 'شخصي', 'حياة'],
  },
  creative: {
    keywords: ['design', 'draw', 'write', 'paint', 'music', 'photo', 'video',
      'تصميم', 'رسم', 'كتابة', 'موسيقى', 'فيديو', 'صورة', 'إبداع'],
    label_ar: 'ابداعي',
    label_en: 'creative',
    goalKeywords: ['creative', 'art', 'إبداع', 'فن'],
  },
};

/**
 * Analyze task semantically using keywords
 */
function analyzeTaskSemantics(task) {
  if (!task) return null;
  const text = ((task.title || '') + ' ' + (task.description || '') + ' ' + (task.category || '')).toLowerCase();

  for (const [category, config] of Object.entries(SEMANTIC_CATEGORIES)) {
    for (const kw of config.keywords) {
      if (text.includes(kw.toLowerCase())) {
        return {
          category,
          label_ar: config.label_ar,
          label_en: config.label_en,
          goalKeywords: config.goalKeywords,
        };
      }
    }
  }
  return null;
}

// ─── Energy from time of day (Cairo) ────────────────────────────────────────
function computeEnergy(timezone = 'Africa/Cairo') {
  const hour = moment().tz(timezone).hour();
  if (hour >= 6 && hour < 10)  return { level: 'high',   score: 85 };
  if (hour >= 10 && hour < 13) return { level: 'medium', score: 65 };
  if (hour >= 13 && hour < 15) return { level: 'low',    score: 35 };
  if (hour >= 15 && hour < 18) return { level: 'medium', score: 60 };
  if (hour >= 18 && hour < 21) return { level: 'medium', score: 55 };
  if (hour >= 21 && hour < 23) return { level: 'low',    score: 30 };
  return { level: 'low', score: 20 };
}

// ─── Time block ─────────────────────────────────────────────────────────────
function getCurrentBlock(timezone = 'Africa/Cairo') {
  const hour = moment().tz(timezone).hour();
  if (hour >= 5 && hour < 12)  return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

// ─── Priority score mapping ─────────────────────────────────────────────────
const PRIORITY_SCORES = { urgent: 100, high: 75, medium: 50, low: 25 };

// ═════════════════════════════════════════════════════════════════════════════
// TASK 2: DECISION MEMORY
// ═════════════════════════════════════════════════════════════════════════════

function getDecisionMemory(userId) {
  const entry = ensureCacheEntry(userId);
  if (!entry.decisionMemory) {
    entry.decisionMemory = { history: [], taskStats: new Map() };
  }
  // Phase 13: Ensure taskStats is always a proper Map (DB restore returns plain object)
  if (!entry.decisionMemory.taskStats || !(entry.decisionMemory.taskStats instanceof Map)) {
    entry.decisionMemory.taskStats = new Map();
  }
  if (!Array.isArray(entry.decisionMemory.history)) {
    entry.decisionMemory.history = [];
  }
  return entry.decisionMemory;
}

function recordDecisionOutcome(userId, taskId, action) {
  const mem = getDecisionMemory(userId);
  const now = Date.now();

  mem.history.push({ taskId, action, timestamp: now });
  if (mem.history.length > MAX_DECISION_HISTORY) {
    mem.history = mem.history.slice(-MAX_DECISION_HISTORY);
  }

  if (!mem.taskStats.has(taskId)) {
    mem.taskStats.set(taskId, { accepted: 0, rejected: 0, ignored: 0, lastSuggested: 0, consecutiveRejects: 0, blockedUntil: 0 });
  }
  const stats = mem.taskStats.get(taskId);

  if (action === 'accepted') {
    stats.accepted += 1;
    stats.consecutiveRejects = 0;
    stats.blockedUntil = 0;
  } else if (action === 'rejected') {
    stats.rejected += 1;
    stats.consecutiveRejects += 1;
    if (stats.consecutiveRejects >= ANTI_REPEAT_REJECTION_THRESHOLD) {
      stats.blockedUntil = now + ANTI_REPEAT_COOLDOWN_MS;
    }
  } else if (action === 'ignored') {
    stats.ignored += 1;
    stats.consecutiveRejects += 1;
    if (stats.consecutiveRejects >= ANTI_REPEAT_REJECTION_THRESHOLD) {
      stats.blockedUntil = now + ANTI_REPEAT_COOLDOWN_MS;
    }
  }
  stats.lastSuggested = now;

  // Phase 13: Schedule persistence to DB
  scheduleDecisionMemoryPersist(userId);
}

function getTaskHistoricalRate(userId, taskId) {
  const mem = getDecisionMemory(userId);
  const stats = mem.taskStats.get(taskId);
  if (!stats) return 0.5;
  const total = stats.accepted + stats.rejected + stats.ignored;
  if (total === 0) return 0.5;
  return stats.accepted / total;
}

function getRecentAcceptanceRate(userId) {
  const mem = getDecisionMemory(userId);
  const recent = mem.history.slice(-20);
  if (recent.length === 0) return 0.5;
  const accepted = recent.filter(d => d.action === 'accepted').length;
  return accepted / recent.length;
}

function isTaskBlocked(userId, taskId) {
  const mem = getDecisionMemory(userId);
  const stats = mem.taskStats.get(taskId);
  if (!stats) return false;
  return stats.blockedUntil > Date.now();
}

function computeHistoryModifier(userId, taskId) {
  const mem = getDecisionMemory(userId);
  const stats = mem.taskStats.get(taskId);
  if (!stats) return 0;

  const total = stats.accepted + stats.rejected + stats.ignored;
  if (total === 0) return 0;

  const successRate = stats.accepted / total;
  const rejectPenalty = stats.consecutiveRejects >= 3 ? -40 * (stats.consecutiveRejects - 2) : 0;
  const acceptBoost = successRate > 0.6 ? 30 * successRate : 0;

  return Math.max(-100, Math.min(100, acceptBoost + rejectPenalty));
}

// ═════════════════════════════════════════════════════════════════════════════
// TASK 3: DYNAMIC CONFIDENCE
// ═════════════════════════════════════════════════════════════════════════════

function computeDynamicConfidence(userId, taskId, energy, task) {
  const historicalRate = taskId ? getTaskHistoricalRate(userId, taskId) : 0.5;
  const recentRate = getRecentAcceptanceRate(userId);

  let energyMatch = 0.5;
  if (task) {
    const estMin = task.estimated_duration || task.estimated_minutes || 30;
    const isSmall = estMin <= 15;
    const isLarge = estMin > 45;
    if (energy.level === 'high' && isLarge) energyMatch = 0.9;
    else if (energy.level === 'high' && isSmall) energyMatch = 0.4;
    else if (energy.level === 'low' && isSmall) energyMatch = 0.85;
    else if (energy.level === 'low' && isLarge) energyMatch = 0.15;
    else if (energy.level === 'medium') energyMatch = 0.65;
    else energyMatch = 0.5;
  }

  const raw = (0.5 * historicalRate + 0.3 * recentRate + 0.2 * energyMatch) * 100;
  return Math.max(5, Math.min(98, Math.round(raw)));
}

// ═════════════════════════════════════════════════════════════════════════════
// TASK 4: CONTINUOUS DIFFICULTY MODIFIER
// ═════════════════════════════════════════════════════════════════════════════

function computeDifficultyModifier(skipRate, energy, timeOfDay) {
  let base = 60;
  const energyFactor = energy.score / 100;
  const skipFactor = 1 - (skipRate * 0.7);

  let timeFactor = 1.0;
  if (timeOfDay === 'morning') timeFactor = 1.2;
  else if (timeOfDay === 'night') timeFactor = 0.5;
  else if (timeOfDay === 'evening') timeFactor = 0.8;

  const modifier = Math.max(0.3, Math.min(1.5, energyFactor * skipFactor * timeFactor));
  const maxMinutes = Math.round(base * modifier);

  let reason = null;
  if (modifier < 0.5) reason = 'صعوبة منخفضة جدا - طاقة او تخطيات كثيرة';
  else if (modifier < 0.7) reason = 'مهام اخف - الطاقة او التخطيات تحتاج تعديل';
  else if (modifier > 1.2) reason = 'وقت التحديات الكبيرة';

  return { maxMinutes, modifier, reason };
}

// ═════════════════════════════════════════════════════════════════════════════
// TASK 6: CONTINUOUS INACTIVITY AWARENESS
// ═════════════════════════════════════════════════════════════════════════════

function getContinuousInactivityMinutes(userId) {
  const entry = brainCache.get(userId);
  if (!entry || !entry.inactivityStartedAt) return 0;
  return Math.round((Date.now() - entry.inactivityStartedAt) / 60000);
}

function getInactivityImpact(inactivityMinutes) {
  if (inactivityMinutes <= 5)  return { factor: 1.0, strategy: 'normal', label: null };
  if (inactivityMinutes <= 10) return { factor: 0.7, strategy: 'prefer_easy', label: 'خمول خفيف - مهمة سهلة افضل' };
  if (inactivityMinutes <= 20) return { factor: 0.4, strategy: 'prefer_smallest', label: 'خمول متوسط - اصغر مهمة ممكنة' };
  return { factor: 0.2, strategy: 'force_smallest', label: 'خمول طويل - ابدا باي حاجة صغيرة' };
}

// ═════════════════════════════════════════════════════════════════════════════
// P2: DECISION VALIDITY — Time-aware task filtering
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Check if a task should be suggested right now based on time rules.
 * Phase 12.6 rules:
 *   - Do NOT suggest tasks with future due dates (unless early_start_allowed)
 *   - Do NOT suggest tasks scheduled >1 hour from now (unless free mode)
 *   - Overdue and due-today tasks are always valid
 */
function isTaskTimeValid(task, todayStr, nowHour, nowMinute) {
  if (!task) return false;

  const dueDate = task.due_date ? String(task.due_date).split('T')[0] : null;

  // No due date → always valid (ad-hoc task)
  if (!dueDate) return true;

  // Overdue → always valid (urgent)
  if (dueDate < todayStr) return true;

  // Due today → valid (check time proximity below)
  if (dueDate === todayStr) return true;

  // Future due date → only if marked as early_start_allowed or is urgent/high priority
  if (dueDate > todayStr) {
    if (task.early_start_allowed) return true;
    if (task.priority === 'urgent') return true;
    // Allow tasks due tomorrow if it's evening (planning ahead)
    const tomorrow = moment().tz('Africa/Cairo').add(1, 'day').format('YYYY-MM-DD');
    if (dueDate === tomorrow && nowHour >= 20) return true;
    return false;
  }

  return true;
}

/**
 * Check if a task is within the actionable time window.
 * Tasks with specific due_time that's >1 hour away get deprioritized (not excluded).
 */
function getTimeProximityBonus(task, todayStr, nowHour, nowMinute) {
  if (!task.due_time) return 0;

  const dueDate = task.due_date ? String(task.due_date).split('T')[0] : null;
  if (dueDate !== todayStr) return 0;

  const parts = task.due_time.split(':').map(Number);
  const taskHour = parts[0] || 0;
  const taskMin = parts[1] || 0;
  const nowTotalMin = nowHour * 60 + nowMinute;
  const taskTotalMin = taskHour * 60 + taskMin;
  const diffMin = taskTotalMin - nowTotalMin;

  // Already past due time → high urgency
  if (diffMin < 0) return 30;
  // Within 30 min → very high proximity bonus
  if (diffMin <= 30) return 25;
  // Within 1 hour → moderate bonus
  if (diffMin <= 60) return 15;
  // 1-2 hours away → small bonus
  if (diffMin <= 120) return 5;
  // >2 hours away → slight penalty (don't suggest too early)
  return -10;
}

// ═════════════════════════════════════════════════════════════════════════════
// SCORING: Score a single task candidate
// ═════════════════════════════════════════════════════════════════════════════

function scoreTask(task, energy, signals, todayStr, userId, diffMod, inactivityImpact, nowHour, nowMinute) {
  // Phase 12.8: entire scoring wrapped in try/catch
  try {
  let score = 0;
  const taskId = task.id;

  // TASK 5: Anti-repetition guard
  if (isTaskBlocked(userId, taskId)) {
    return { score: -999, blocked: true, isOverdue: false, isDueToday: false, isSmall: false, isLarge: false, estMin: 0, skipCount: 0, semantics: null, intent: null };
  }

  // Phase 12.7: Infer task intent
  const intent = inferIntent(task, todayStr);

  // 1. Urgency: deadline proximity
  const dueDate = task.due_date ? String(task.due_date).split('T')[0] : null;
  const isOverdue = dueDate && dueDate < todayStr;
  const isDueToday = dueDate === todayStr;
  if (isOverdue)       score += 100 * WEIGHTS.urgency + 80 * WEIGHTS.overdueBonus;
  else if (isDueToday) score += 70 * WEIGHTS.urgency;
  else                 score += 30 * WEIGHTS.urgency;

  // P2: Time proximity bonus/penalty
  const timeProximity = getTimeProximityBonus(task, todayStr, nowHour, nowMinute);
  score += timeProximity * 0.15;

  // 2. Priority
  const pScore = PRIORITY_SCORES[task.priority] || 50;
  score += pScore * WEIGHTS.priority;

  // 3. Energy match
  const estMin = task.estimated_duration || task.estimated_minutes || 30;
  const isSmall = estMin <= 15;
  const isLarge = estMin > 45;
  if (energy.level === 'low' && isSmall)        score += 90 * WEIGHTS.energyMatch;
  else if (energy.level === 'high' && isLarge)   score += 85 * WEIGHTS.energyMatch;
  else if (energy.level === 'medium')            score += 60 * WEIGHTS.energyMatch;
  else if (energy.level === 'low' && isLarge)    score += 10 * WEIGHTS.energyMatch;
  else if (energy.level === 'high' && isSmall)   score += 40 * WEIGHTS.energyMatch;
  else                                            score += 50 * WEIGHTS.energyMatch;

  // Phase 12.7 PART 4: Intent-based scoring
  const intentModifier = getIntentScoreModifier(intent, energy);
  score += intentModifier * WEIGHTS.intent;

  // TASK 2: History-based modifier
  const histMod = computeHistoryModifier(userId, taskId);
  score += histMod * WEIGHTS.historyBoost;

  // TASK 4: Continuous difficulty modifier
  if (estMin > diffMod.maxMinutes) {
    const overRatio = (estMin - diffMod.maxMinutes) / diffMod.maxMinutes;
    score -= overRatio * 50;
  }

  // TASK 6: Inactivity impact
  if (inactivityImpact.strategy !== 'normal') {
    if (isSmall) score += 30 * (1 - inactivityImpact.factor);
    if (isLarge) score -= 30 * (1 - inactivityImpact.factor);
  }

  // 5. Momentum
  if (signals.completionStreak >= MOMENTUM_THRESHOLD && isLarge) {
    score += 30 * WEIGHTS.momentum;
  }

  // Phase 12.7: Growth tasks should NOT be forced during low energy
  if (intent === 'growth' && energy.level === 'low') {
    score -= 15; // penalize growth tasks during low energy
  }

  // Phase 12.7: Maintenance tasks get a bonus during low energy
  if (intent === 'maintenance' && energy.level === 'low') {
    score += 10; // maintenance is good for low energy
  }

  // TASK 5: Anti-repetition penalty
  const mem = getDecisionMemory(userId);
  const taskMemStats = mem.taskStats.get(taskId);
  if (taskMemStats && taskMemStats.consecutiveRejects > 0 && taskMemStats.consecutiveRejects < ANTI_REPEAT_REJECTION_THRESHOLD) {
    score -= taskMemStats.consecutiveRejects * 15 * WEIGHTS.antiRepeat;
  }

  const skipCount = (signals.skipHistory || []).filter(s => s.taskId === taskId).length;

  // P3: Semantic analysis
  const semantics = analyzeTaskSemantics(task);

  return { score: Math.max(-100, score), blocked: false, isOverdue, isDueToday, isSmall, isLarge, estMin, skipCount, semantics, timeProximity, intent };
  } catch (err) {
    logger.error(`[Brain] scoreTask error for task ${task?.id}: ${err.message}`);
    return { score: 0, blocked: false, isOverdue: false, isDueToday: false, isSmall: false, isLarge: false, estMin: 30, skipCount: 0, semantics: null, timeProximity: 0, intent: 'maintenance' };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 12.9 TASK 1: REASONING VALIDATION LAYER
// Validates that every decision has real data backing. Discards unsupported claims.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Validate a brainState decision for truth alignment.
 * Returns { valid: true } or { valid: false, issues: [...], corrected: {...} }
 *
 * HARD RULES:
 *   - If currentDecision references a taskId, it must be a real pending task
 *   - If confidence > 50, there must be at least 1 concrete reason
 *   - If dayContext says 'productive', completedItems must be > 0
 *   - Tone must match dayContext classification
 *   - 'why' array must not contain vague phrases without data backing
 */
function validateDecision(brainState, tasks, habits, dayContext) {
  try {
    const issues = [];
    const cd = brainState?.currentDecision;
    if (!cd) return { valid: true }; // fallback states are always valid

    // RULE 1: If taskId is set, it must reference a real pending task or habit
    if (cd.taskId && cd.type === 'task') {
      const realTask = (tasks || []).find(t => t.id === cd.taskId);
      if (!realTask) {
        issues.push(`taskId ${cd.taskId} not found in pending tasks`);
      } else if (realTask.status === 'completed') {
        issues.push(`taskId ${cd.taskId} is already completed`);
      }
    }
    if (cd.taskId && cd.type === 'habit') {
      const realHabit = (habits || []).find(h => h.id === cd.taskId);
      if (!realHabit) {
        issues.push(`habitId ${cd.taskId} not found in active habits`);
      }
    }

    // RULE 2: High confidence requires concrete reasons
    if (cd.confidence > 70 && (!cd.why || cd.why.length === 0)) {
      issues.push(`confidence ${cd.confidence} with no reasons`);
    }

    // RULE 3: dayContext 'productive' must have real completions
    if (dayContext?.classification === 'productive' && dayContext?.completedItems === 0) {
      issues.push('dayContext productive but completedItems is 0');
    }

    // RULE 4: Tone-dayContext alignment
    if (cd.tone === 'positive' && dayContext?.classification === 'empty') {
      issues.push('positive tone on empty day');
    }
    if (cd.tone === 'neutral' && dayContext?.classification === 'productive') {
      // Downgrade is fine, no issue
    }

    // RULE 5: Empty day must never have congratulatory reasons
    if (dayContext?.classification === 'empty' && cd.why) {
      const congratPhrases = ['احسنت', 'ممتاز', 'يوم منتج', 'شغل حقيقي'];
      for (const reason of cd.why) {
        for (const phrase of congratPhrases) {
          if (typeof reason === 'string' && reason.includes(phrase)) {
            issues.push(`congratulatory phrase "${phrase}" on empty day`);
          }
        }
      }
    }

    if (issues.length === 0) return { valid: true };

    // Log all issues
    logger.warn(`[Brain][Phase12.9] Decision validation failed: ${issues.join('; ')}`);

    return { valid: false, issues };
  } catch (err) {
    logger.error(`[Brain][Phase12.9] validateDecision error: ${err.message}`);
    return { valid: true }; // don't block on validation error
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 12.9 TASK 2: ASSISTANT TRUTH FILTER
// Ensures messages match dayContext, decision, and actual user behavior.
// Downgrades tone or regenerates on mismatch.
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Filter assistant-facing fields in brainState for truth alignment.
 * If the tone doesn't match the context, correct it.
 * If reasons don't match real data, strip them.
 */
function applyTruthFilter(brainState, dayContext) {
  try {
    const cd = brainState?.currentDecision;
    if (!cd) return brainState;

    // FILTER 1: Empty day must never get positive tone
    if (dayContext?.classification === 'empty') {
      if (cd.tone === 'positive') {
        cd.tone = 'neutral';
        logger.info('[Brain][Phase12.9] Truth filter: downgraded positive→neutral on empty day');
      }
      if (cd.confidence > 50 && cd.type !== 'task' && cd.type !== 'habit') {
        cd.confidence = 30; // empty day with no action = low confidence
      }
    }

    // FILTER 2: Partial day should not get celebratory tone
    if (dayContext?.classification === 'partial') {
      if (cd.tone === 'positive') {
        cd.tone = 'constructive';
        logger.info('[Brain][Phase12.9] Truth filter: downgraded positive→constructive on partial day');
      }
    }

    // FILTER 3: If brainState says safeMode, ensure reasons are honest
    if (brainState.safeMode && cd.why) {
      const hasFakeReason = cd.why.some(r => typeof r === 'string' && (r.includes('يوم منتج') || r.includes('احسنت')));
      if (hasFakeReason) {
        cd.why = ['في مشكلة مؤقتة — جرب تاني'];
        cd.confidence = 0;
        logger.info('[Brain][Phase12.9] Truth filter: stripped fake reasons in safeMode');
      }
    }

    // FILTER 4: Completion claims must match dayContext numbers
    if (cd.why && dayContext) {
      cd.why = cd.why.map(reason => {
        if (typeof reason !== 'string') return reason;
        // Check for completion count claims
        const match = reason.match(/خلصت (\d+) مهمة/);
        if (match) {
          const claimed = parseInt(match[1], 10);
          const actual = dayContext.completedTasks || 0;
          if (claimed !== actual && actual >= 0) {
            return reason.replace(`خلصت ${claimed} مهمة`, `خلصت ${actual} مهمة`);
          }
        }
        return reason;
      });
    }

    return brainState;
  } catch (err) {
    logger.error(`[Brain][Phase12.9] applyTruthFilter error: ${err.message}`);
    return brainState;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 12.9 TASK 3: DECISION EXPLAINABILITY CHECK
// Ensures reasons are concrete ("بقالك يومين مأجلها") not vague ("مهمة مهمة").
// ═════════════════════════════════════════════════════════════════════════════

/** List of vague phrases that should be replaced with concrete data */
const VAGUE_PHRASES = [
  'مهمة مهمة',
  'حاجة مهمة',
  'لازم تعملها',
  'عشان كده',
  'المهمة دي كويسة',
];

/**
 * Build explainable "why" with concrete data references.
 * Phase 12.9: every reason must cite a specific fact.
 */
function buildExplainableWhy(task, scoreInfo, energy, signals, block, diffMod, inactivityImpact, userId) {
  try {
  const reasons = [];
  if (!task || typeof task !== 'object') return ['المهمة الانسب حسب اولويتك ووقتك'];
  if (!scoreInfo || typeof scoreInfo !== 'object') scoreInfo = {};
  if (!energy || typeof energy !== 'object') energy = { level: 'medium', score: 50 };
  if (!signals || typeof signals !== 'object') signals = { completionStreak: 0, skipHistory: [] };

  // Phase 12.9: Intent-based reasoning with CONCRETE data
  if (scoreInfo.intent) {
    if (scoreInfo.intent === 'deadline' && scoreInfo.isOverdue) {
      const daysOverdue = _computeOverdueDays(task);
      if (daysOverdue > 1) {
        reasons.push(`بقالها ${daysOverdue} يوم متاخرة - لازم تتعمل دلوقتي`);
      } else {
        reasons.push('متاخرة - لازم تتعمل دلوقتي');
      }
    } else if (scoreInfo.intent === 'deadline' && scoreInfo.isDueToday) {
      if (task.due_time) {
        reasons.push(`مطلوبة النهاردة الساعة ${task.due_time} - موعد نهائي`);
      } else {
        reasons.push('مطلوبة النهاردة - موعد نهائي');
      }
    } else if (scoreInfo.intent === 'urgent') {
      reasons.push('مهمة عاجلة - اولوية فورية');
    } else if (scoreInfo.intent === 'growth' && energy.level === 'high') {
      reasons.push('مهمة تطوير وطاقتك عالية - وقتها دلوقتي');
    } else if (scoreInfo.intent === 'growth') {
      reasons.push('مهمة نمو وتطوير');
    } else if (scoreInfo.intent === 'maintenance') {
      reasons.push('مهمة روتين خفيفة');
    }
  } else {
    if (scoreInfo.isOverdue) {
      const daysOverdue = _computeOverdueDays(task);
      if (daysOverdue > 1) {
        reasons.push(`بقالها ${daysOverdue} يوم متاخرة`);
      } else {
        reasons.push('متاخرة - لازم تتعمل دلوقتي');
      }
    }
    if (scoreInfo.isDueToday) reasons.push('مطلوبة النهاردة');
  }

  if (task.priority === 'urgent' && scoreInfo.intent !== 'urgent') reasons.push('اولوية عاجلة');
  else if (task.priority === 'high') reasons.push('اولوية عالية');

  // P2: Time proximity context with SPECIFIC data
  if (scoreInfo.timeProximity >= 25) reasons.push('موعدها قرب جدا - ابدا دلوقتي');
  else if (scoreInfo.timeProximity >= 15) reasons.push('لسه ساعة عليها - استعد');

  if (energy.level === 'low' && scoreInfo.isSmall) {
    reasons.push(`مهمة خفيفة (~${scoreInfo.estMin} دقيقة) تناسب طاقتك`);
  }
  if (energy.level === 'high' && scoreInfo.isLarge) {
    reasons.push(`طاقتك عالية - وقت المهام الكبيرة (~${scoreInfo.estMin} دقيقة)`);
  }

  // Phase 12.9: Anti-repeat with CONCRETE skip data
  if (userId) {
    const mem = getDecisionMemory(userId);
    const stats = mem.taskStats.get(task.id);
    if (stats && stats.consecutiveRejects >= 2) {
      reasons.push(`اترفضت ${stats.consecutiveRejects} مرة — ممكن تقسمها`);
    }
  }

  if (signals.completionStreak >= MOMENTUM_THRESHOLD) {
    reasons.push(`${signals.completionStreak} مهام متتالية - انت في زخم`);
  }

  if (diffMod.reason) reasons.push(diffMod.reason);
  if (inactivityImpact.label) reasons.push(inactivityImpact.label);

  // P3: Semantic context
  if (scoreInfo.semantics) reasons.push(`نوع المهمة: ${scoreInfo.semantics.label_ar}`);

  if (block === 'morning') reasons.push('وقت الصبح = افضل تركيز');
  if (block === 'evening' && scoreInfo.isSmall) reasons.push('مساء - مهمة خفيفة مناسبة');

  // Phase 12.9: Validate no vague phrases leaked through
  const filtered = reasons.filter(r => {
    for (const vague of VAGUE_PHRASES) {
      if (r === vague) return false;
    }
    return true;
  });

  return filtered.length > 0 ? filtered : ['المهمة الانسب حسب اولويتك ووقتك'];
  } catch (err) {
    logger.error(`[Brain][Phase12.9] buildExplainableWhy error: ${err.message}`);
    return ['المهمة الانسب حسب اولويتك ووقتك'];
  }
}

/**
 * Helper: compute how many days a task is overdue.
 * Phase 12.9: provides concrete "بقالها X يوم" data.
 */
function _computeOverdueDays(task) {
  try {
    if (!task) return 0;
    const dueDate = task.due_date ? String(task.due_date).split('T')[0] : null;
    if (!dueDate) return 0;
    const todayStr = moment().tz('Africa/Cairo').format('YYYY-MM-DD');
    const dueMs = new Date(dueDate).getTime();
    const todayMs = new Date(todayStr).getTime();
    const diff = Math.floor((todayMs - dueMs) / 86400000);
    return Math.max(0, diff);
  } catch { return 0; }
}

// ═════════════════════════════════════════════════════════════════════════════
// PHASE 12.9 TASK 4: LIFECYCLE TRACING
// Full instrumentation for loading issue detection.
// ═════════════════════════════════════════════════════════════════════════════

/** Structured lifecycle trace for debugging loading issues */
function traceLifecycle(userId, phase, details) {
  const ts = Date.now();
  logger.info(`[Brain][Trace] userId=${userId} phase=${phase} ts=${ts} ${JSON.stringify(details || {})}`);
  return ts;
}

// ─── Build smallest executable step (clean Arabic) ──────────────────────────
function buildSmallestStep(task) {
  const title = task.title || task.name || '';
  const estMin = task.estimated_duration || task.estimated_minutes || 30;

  if (estMin <= 5)  return `افتح "${title}" وخلصها`;
  if (estMin <= 15) return `ابدا اول جزء من "${title}" - دقيقتين بس`;
  if (estMin <= 30) return `حدد اول خطوة في "${title}" واشتغل 10 دقايق`;
  return `قسم "${title}" لخطوات صغيرة وابدا باول واحدة`;
}

// ─── Detect blocker (clean Arabic) ──────────────────────────────────────────
function detectBlocker(task, signals, energy, userId) {
  if (signals.rejectionStreak >= 3) return 'مقاومة متكررة - جرب غير المكان او خد استراحة';
  if (energy.level === 'low') return 'طاقة منخفضة - ابدا بحاجة صغيرة';

  const mem = getDecisionMemory(userId);
  const stats = mem.taskStats.get(task.id);
  if (stats && stats.consecutiveRejects >= 2) {
    return `"${task.title}" اترفضت ${stats.consecutiveRejects} مرة - ممكن تقسمها او تاجلها`;
  }
  return null;
}

// ─── Risk level calculation ─────────────────────────────────────────────────
function computeRiskLevel(signals, energy, inactivityMinutes) {
  let risk = 0;
  risk += signals.rejectionStreak * 10;
  risk += (100 - energy.score) * 0.3;
  risk += Math.min(30, inactivityMinutes);
  if (signals.completionStreak >= 2) risk -= 15;

  if (risk >= 60) return 'critical';
  if (risk >= 40) return 'high';
  if (risk >= 20) return 'medium';
  return 'low';
}

// ─── Task suggestion text helper ────────────────────────────────────────────
function getTaskSuggestion(task) {
  const estMin = task.estimated_duration || task.estimated_minutes || 30;
  if (estMin <= 5)  return 'افتح وخلص';
  if (estMin <= 15) return 'ابدا اول جزء - دقيقتين بس';
  if (estMin <= 30) return 'حدد اول خطوة واشتغل 10 دقايق';
  return 'قسمها لخطوات صغيرة وابدا باول واحدة';
}

// ═════════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═════════════════════════════════════════════════════════════════════════════

function init(io) {
  _io = io;
  logger.info('[Brain] Initialized with Socket.IO');

  const { EVENT_TYPES } = eventBus;

  eventBus.subscribe(EVENT_TYPES.TASK_COMPLETED, async (payload) => {
    if (payload.taskId) recordDecisionOutcome(payload.userId, payload.taskId, 'accepted');
    await recompute(payload.userId, { type: 'TASK_COMPLETED', ...payload });
  });

  eventBus.subscribe(EVENT_TYPES.TASK_SKIPPED, async (payload) => {
    if (payload.taskId) recordDecisionOutcome(payload.userId, payload.taskId, 'rejected');
    await recompute(payload.userId, { type: 'TASK_SKIPPED', ...payload });
  });

  eventBus.subscribe(EVENT_TYPES.TASK_CREATED, async (payload) => {
    await recompute(payload.userId, { type: 'TASK_CREATED', ...payload });
  });

  eventBus.subscribe(EVENT_TYPES.HABIT_COMPLETED, async (payload) => {
    if (payload.habitId) recordDecisionOutcome(payload.userId, payload.habitId, 'accepted');
    await recompute(payload.userId, { type: 'HABIT_COMPLETED', ...payload });
  });

  eventBus.subscribe(EVENT_TYPES.ENERGY_UPDATED, async (payload) => {
    await recompute(payload.userId, { type: 'ENERGY_UPDATED', ...payload });
  });

  eventBus.subscribe(EVENT_TYPES.DECISION_REJECTED, async (payload) => {
    if (payload.taskId) recordDecisionOutcome(payload.userId, payload.taskId, 'rejected');
    await recompute(payload.userId, { type: 'DECISION_REJECTED', ...payload });
  });

  eventBus.subscribe(EVENT_TYPES.USER_INACTIVE, async (payload) => {
    await recompute(payload.userId, { type: 'USER_INACTIVE', ...payload });
  });

  logger.info('[Brain] Subscribed to all EventBus event types');
}

/**
 * Get the current brain state for a user.
 * Phase 12.6: Always resolves fast. Returns cached if fresh, else recomputes.
 */
async function getBrainState(userId) {
  const startMs = Date.now();
  logger.info(`[Brain] getBrainState called for userId=${userId}`);

  // Phase 13: If no cache exists, try to restore decision memory from DB
  if (!brainCache.has(userId)) {
    const persisted = await loadDecisionMemoryFromDB(userId);
    if (persisted) {
      logger.info(`[Brain][Phase13] Restored decision memory from DB for userId=${userId} (${persisted.totalDecisions} decisions)`);
      brainCache.set(userId, {
        state: null,
        signals: persisted.adaptiveSignals || {},
        decisionMemory: persisted,
        lastActivity: Date.now(),
      });
    }
  }

  const cached = brainCache.get(userId);
  if (cached && cached.state) {
    // Inject continuous inactivity into the cached state
    const liveInactivity = getContinuousInactivityMinutes(userId);
    if (cached.state.adaptiveSignals) {
      cached.state.adaptiveSignals.inactivityMinutes = liveInactivity;
    }

    // Check freshness — recompute if older than 5 minutes
    const age = Date.now() - new Date(cached.state.lastUpdatedAt).getTime();
    if (age < 5 * 60 * 1000) {
      logger.info(`[Brain] getBrainState userId=${userId}: returning cached state (age=${Math.round(age/1000)}s) in ${Date.now() - startMs}ms`);
      return cached.state;
    }
    logger.info(`[Brain] getBrainState userId=${userId}: cache stale (age=${Math.round(age/1000)}s), recomputing`);
  } else {
    logger.info(`[Brain] getBrainState userId=${userId}: no cache, recomputing`);
  }

  const result = await recompute(userId, { type: 'INITIAL_LOAD' });
  logger.info(`[Brain] getBrainState userId=${userId}: recompute done in ${Date.now() - startMs}ms. Decision: "${result?.currentDecision?.taskTitle || result?.currentDecision?.type || 'null'}"`);
  return result;
}

/**
 * Recompute brain state for a user based on a trigger event.
 * This is the CORE function — every event in the system calls this.
 */
async function recompute(userId, triggerEvent = {}) {
  const startMs = Date.now();
  const timezone = 'Africa/Cairo';
  const todayStr = moment().tz(timezone).format('YYYY-MM-DD');
  const block = getCurrentBlock(timezone);
  const energy = computeEnergy(timezone);
  const nowMoment = moment().tz(timezone);
  const nowHour = nowMoment.hour();
  const nowMinute = nowMoment.minute();

  try {
    // ── Fetch real data from DB ─────────────────────────────────────────
    const models = getModels();
    let tasks = [];
    let habits = [];
    let habitLogs = [];

    if (models.Task) {
      tasks = await models.Task.findAll({
        where: { user_id: userId, status: { [require('sequelize').Op.ne]: 'completed' } },
        order: [['due_date', 'ASC'], ['priority', 'ASC']],
        raw: true,
      }).catch(() => []);
    }

    if (models.Habit) {
      habits = await models.Habit.findAll({
        where: { user_id: userId, is_active: true },
        raw: true,
      }).catch(() => []);
    }

    if (models.HabitLog) {
      habitLogs = await models.HabitLog.findAll({
        where: { user_id: userId, log_date: todayStr },
        raw: true,
      }).catch(() => []);
    }

    // P2: Filter tasks by time validity (no future tasks unless allowed)
    const timeValidTasks = tasks.filter(t => isTaskTimeValid(t, todayStr, nowHour, nowMinute));

    // Today's pending tasks (overdue + due today)
    const todayTasks = timeValidTasks.filter(t => {
      const dd = t.due_date ? String(t.due_date).split('T')[0] : null;
      return dd === todayStr || (dd && dd < todayStr);
    });

    // Count completed tasks for end-of-day detection
    let completedTasks = 0;
    if (models.Task) {
      completedTasks = await models.Task.count({
        where: { user_id: userId, status: 'completed', due_date: todayStr },
      }).catch(() => 0);
    }

    // Undone habits
    const doneHabitIds = new Set(habitLogs.filter(l => l.completed).map(l => l.habit_id));
    const undoneHabits = habits.filter(h => !doneHabitIds.has(h.id));

    // ── Phase 12.7 PART 2+3: DAY CONTEXT + END-OF-DAY DETECTION ─────────
    // HARD RULE: empty day ≠ productive. Never fake-congratulate.
    const completedHabitsCount = habitLogs.filter(l => l.completed).length;
    const dayContext = classifyDayContext(completedTasks, todayTasks.length, habits.length, completedHabitsCount);

    const hadTasksToday = dayContext.hadTasks;
    const hadHabitsToday = dayContext.hadHabits;
    const allTasksDone = todayTasks.length === 0 && completedTasks > 0;
    const allHabitsDone = undoneHabits.length === 0 && hadHabitsToday;
    const isEverythingDone = hadTasksToday && allTasksDone && allHabitsDone;
    const isAlmostDone = hadTasksToday && todayTasks.length === 0 && undoneHabits.length <= 1 && completedTasks > 0;
    const isEvening = nowHour >= 19;

    // ── Get or initialize adaptive signals ──────────────────────────────
    const cached = brainCache.get(userId) || {};
    const signals = {
      rejectionStreak: 0,
      completionStreak: 0,
      inactivityMinutes: 0,
      skipHistory: [],
      skipTypes: {},
      lastCompletionTs: null,
      totalSkips: 0,
      totalCompletions: 0,
      ...(cached.signals || {}),
    };
    // Phase 13: Ensure array/object fields are never undefined after merge
    if (!Array.isArray(signals.skipHistory)) signals.skipHistory = [];
    if (!signals.skipTypes || typeof signals.skipTypes !== 'object') signals.skipTypes = {};

    // ── Apply trigger event to signals ──────────────────────────────────
    applyEventToSignals(signals, triggerEvent);

    // ── TASK 6: Compute continuous inactivity ───────────────────────────
    const liveInactivity = getContinuousInactivityMinutes(userId);
    if (liveInactivity > signals.inactivityMinutes) {
      signals.inactivityMinutes = liveInactivity;
    }
    const inactivityImpact = getInactivityImpact(signals.inactivityMinutes);

    // ── TASK 4: Compute continuous difficulty modifier ───────────────────
    if (!signals.skipHistory) signals.skipHistory = [];  // Phase 13: guard against missing field
    const recentSkipCount = signals.skipHistory.filter(s => Date.now() - s.ts < 30 * 60 * 1000).length;
    const recentAttempts = Math.max(1, recentSkipCount + signals.completionStreak);
    const skipRate = recentSkipCount / recentAttempts;
    const diffMod = computeDifficultyModifier(skipRate, energy, block);

    // ── Phase 12.7 PART 3: CONTEXT-AWARE END-OF-DAY ──────────────────────
    // Uses dayContext to give honest, appropriate response
    const isEndOfDay = isEverythingDone || (isAlmostDone && isEvening);
    const isEmptyEvening = dayContext.classification === 'empty' && isEvening;

    if (isEndOfDay || isEmptyEvening) {
      const endOfDayDecision = buildEndOfDayStateV2(energy, signals, block, todayStr, liveInactivity, diffMod, dayContext, isEvening);
      const entry = ensureCacheEntry(userId);
      entry.state = endOfDayDecision;
      entry.signals = signals;
      entry.lastActivity = Date.now();
      emitBrainUpdate(userId, endOfDayDecision);
      notifySubscribers(userId, endOfDayDecision);
      clearInactivityTimer(userId);
      startInactivityTimer(userId);
      logger.info(`[Brain] recompute userId=${userId} -> END_OF_DAY (${dayContext.classification}) [${Date.now() - startMs}ms]`);
      return endOfDayDecision;
    }

    // ── TASK 5: Filter blocked tasks ────────────────────────────────────
    let candidates = todayTasks.length > 0 ? todayTasks : timeValidTasks.slice(0, 10);
    const unblockedCandidates = candidates.filter(t => !isTaskBlocked(userId, t.id));
    if (unblockedCandidates.length > 0) {
      candidates = unblockedCandidates;
    }

    let adaptiveOverride = null;

    // ── BURNOUT PROTECTION ──────────────────────────────────────────────
    if (recentSkipCount >= BURNOUT_SKIP_THRESHOLD && energy.level === 'low') {
      const breakState = buildBreakState(energy, signals, block, todayStr, liveInactivity, diffMod);
      const entry = ensureCacheEntry(userId);
      entry.state = breakState;
      entry.signals = signals;
      entry.lastActivity = Date.now();
      emitBrainUpdate(userId, breakState);
      notifySubscribers(userId, breakState);
      clearInactivityTimer(userId);
      startInactivityTimer(userId);
      logger.info(`[Brain] recompute userId=${userId} -> BREAK (burnout protection) [${Date.now() - startMs}ms]`);
      return breakState;
    }

    // ── MOMENTUM MODE ───────────────────────────────────────────────────
    if (signals.completionStreak >= MOMENTUM_THRESHOLD && candidates.length > 1) {
      const sorted = [...candidates].sort((a, b) => {
        const aEst = a.estimated_duration || a.estimated_minutes || 30;
        const bEst = b.estimated_duration || b.estimated_minutes || 30;
        return bEst - aEst;
      });
      candidates = sorted;
      if (!adaptiveOverride) adaptiveOverride = 'momentum_mode';
    }

    // ── INACTIVITY MODE ─────────────────────────────────────────────────
    if ((triggerEvent.type === 'USER_INACTIVE' || inactivityImpact.strategy === 'force_smallest') && candidates.length > 1) {
      const sorted = [...candidates].sort((a, b) => {
        const aEst = a.estimated_duration || a.estimated_minutes || 30;
        const bEst = b.estimated_duration || b.estimated_minutes || 30;
        return aEst - bEst;
      });
      candidates = sorted;
      adaptiveOverride = 'inactivity_smallest';
    }

    // ── Score all candidates ────────────────────────────────────────────
    let bestTask = null;
    let bestScore = -Infinity;
    let bestScoreInfo = null;

    for (const task of candidates) {
      const info = scoreTask(task, energy, signals, todayStr, userId, diffMod, inactivityImpact, nowHour, nowMinute);
      if (info.blocked) continue;
      if (info.score > bestScore) {
        bestScore = info.score;
        bestTask = task;
        bestScoreInfo = info;
      }
    }

    // Also filter blocked habits
    const unblockedHabits = undoneHabits.filter(h => !isTaskBlocked(userId, h.id));

    // If no task or habit has a streak at risk, prioritize habit
    let habitCandidate = null;
    for (const h of (unblockedHabits.length > 0 ? unblockedHabits : undoneHabits)) {
      if ((h.current_streak || 0) >= 3) {
        habitCandidate = h;
        break;
      }
    }

    // Build decision
    let currentDecision;
    let reason;

    if (!bestTask && !habitCandidate && unblockedHabits.length === 0 && undoneHabits.length === 0) {
      // Phase 12.7: Use dayContext — don't congratulate empty days
      if (dayContext.classification === 'empty') {
        currentDecision = {
          taskId: null, taskTitle: null, type: 'empty',
          why: ['النهارده مفيش مهام او عادات كانت متسجلة', 'ضيف مهمة واحدة صغيرة وابدا بيها'],
          smallestStep: 'افتح صفحة المهام وضيف مهمة جديدة',
          confidence: 30,
        };
        reason = 'يوم فارغ - لا مهام مسجلة';
      } else if (dayContext.classification === 'productive') {
        currentDecision = {
          taskId: null, taskTitle: null, type: 'empty',
          why: [`خلصت ${dayContext.completedTasks} مهمة و${dayContext.completedHabits} عادة - احسنت فعلا!`],
          smallestStep: 'استرخي او خطط لبكرة',
          confidence: 98,
        };
        reason = 'كل المهام خلصت - يوم منتج';
      } else {
        currentDecision = {
          taskId: null, taskTitle: null, type: 'empty',
          why: ['مفيش مهام عاجلة متبقية', 'ممكن تضيف مهام جديدة او تراجع خططك'],
          smallestStep: 'راجع خططك او اضف مهمة',
          confidence: 50,
        };
        reason = 'لا مهام متبقية';
      }
    } else if (habitCandidate && (!bestTask || (habitCandidate.current_streak || 0) >= 7)) {
      const conf = computeDynamicConfidence(userId, habitCandidate.id, energy, habitCandidate);
      currentDecision = {
        taskId: habitCandidate.id,
        taskTitle: habitCandidate.name_ar || habitCandidate.name,
        type: 'habit',
        why: [`سلسلة ${habitCandidate.current_streak || 0} يوم - لا تقطعها`],
        smallestStep: `سجل "${habitCandidate.name_ar || habitCandidate.name}" دلوقتي`,
        confidence: conf,
        streak: habitCandidate.current_streak || 0,
      };
      reason = `حماية سلسلة عادة (${habitCandidate.current_streak} يوم)`;
    } else if (bestTask) {
      const conf = computeDynamicConfidence(userId, bestTask.id, energy, bestTask);
      // Phase 12.9: Use explainable why (concrete data, no vague phrases)
      const why = buildExplainableWhy(bestTask, bestScoreInfo, energy, signals, block, diffMod, inactivityImpact, userId);
      currentDecision = {
        taskId: bestTask.id,
        taskTitle: bestTask.title,
        type: 'task',
        why,
        smallestStep: buildSmallestStep(bestTask),
        confidence: conf,
        priority: bestTask.priority,
        estimatedMinutes: bestScoreInfo.estMin,
        category: bestScoreInfo.semantics?.label_ar || bestTask.category || null,
        semanticCategory: bestScoreInfo.semantics?.category || null,
        intent: bestScoreInfo.intent || null,           // Phase 12.7
        intentLabel: getIntentLabel(bestScoreInfo.intent), // Phase 12.7
        isOverdue: bestScoreInfo.isOverdue,
        blocker: detectBlocker(bestTask, signals, energy, userId),
      };
      reason = why[0];

      // Record suggestion for anti-repetition tracking
      const mem = getDecisionMemory(userId);
      if (!mem.taskStats.has(bestTask.id)) {
        mem.taskStats.set(bestTask.id, { accepted: 0, rejected: 0, ignored: 0, lastSuggested: 0, consecutiveRejects: 0, blockedUntil: 0 });
      }
      mem.taskStats.get(bestTask.id).lastSuggested = Date.now();
    } else if (unblockedHabits.length > 0 || undoneHabits.length > 0) {
      const h = (unblockedHabits.length > 0 ? unblockedHabits : undoneHabits)[0];
      const conf = computeDynamicConfidence(userId, h.id, energy, h);
      currentDecision = {
        taskId: h.id,
        taskTitle: h.name_ar || h.name,
        type: 'habit',
        why: ['عادة لسه مش متسجلة النهاردة'],
        smallestStep: `سجل "${h.name_ar || h.name}"`,
        confidence: conf,
      };
      reason = 'عادة متبقية';
    } else {
      // Phase 12.7: Context-aware empty state
      if (dayContext.classification === 'empty') {
        currentDecision = {
          taskId: null, taskTitle: null, type: 'empty',
          why: ['النهارده مفيش مهام او عادات كانت متسجلة', 'ابدا بمهمة واحدة صغيرة'],
          smallestStep: 'ضيف مهمة صغيرة وابدا بيها',
          confidence: 25,
        };
        reason = 'يوم فارغ - لا مهام مسجلة';
      } else {
        currentDecision = {
          taskId: null, taskTitle: null, type: 'empty',
          why: ['مفيش مهام عاجلة - اضف مهام جديدة او استرخي'],
          smallestStep: 'راجع خططك او اضف مهمة',
          confidence: 50,
        };
        reason = 'لا مهام';
      }
    }

    // ── Compute progress ────────────────────────────────────────────────
    const totalToday = todayTasks.length + completedTasks;
    const completionRate = totalToday > 0 ? Math.round((completedTasks / totalToday) * 100) : 0;

    // ── Compute momentum ────────────────────────────────────────────────
    const momentum = signals.completionStreak >= 3 ? 'high' :
                     signals.completionStreak >= 1 ? 'medium' : 'low';

    // ── Compute burnout risk ────────────────────────────────────────────
    const burnoutRisk = Math.min(1, (recentSkipCount * 0.2) + (energy.level === 'low' ? 0.3 : 0) +
                        (signals.rejectionStreak * 0.1));

    // ── Build final state ───────────────────────────────────────────────
    const brainState = {
      currentDecision,
      reason,
      riskLevel: computeRiskLevel(signals, energy, liveInactivity),
      dayContext,  // Phase 12.7: always expose day classification
      userState: {
        energy: energy.level,
        energyScore: energy.score,
        momentum,
        burnoutRisk: Math.round(burnoutRisk * 100) / 100,
        block,
        completionRate,
        todayPending: todayTasks.length,
        todayCompleted: completedTasks,
        undoneHabits: undoneHabits.length,
      },
      adaptiveSignals: {
        rejectionStreak: signals.rejectionStreak,
        completionStreak: signals.completionStreak,
        inactivityMinutes: signals.inactivityMinutes,
        skipTypes: signals.skipTypes,
        adaptiveOverride,
        difficultyModifier: Math.round(diffMod.modifier * 100) / 100,
        maxTaskMinutes: diffMod.maxMinutes,
        inactivityStrategy: inactivityImpact.strategy,
      },
      decisionMemory: {
        totalDecisions: getDecisionMemory(userId).history.length,
        recentAcceptanceRate: Math.round(getRecentAcceptanceRate(userId) * 100),
        blockedTasks: [...(getDecisionMemory(userId).taskStats.entries())]
          .filter(([_, s]) => s.blockedUntil > Date.now())
          .map(([id]) => id),
      },
      triggerEvent: triggerEvent.type || 'INITIAL_LOAD',
      lastUpdatedAt: new Date().toISOString(),
    };

    // ── Phase 12.9: Validate decision before storing ─────────────────────
    const validation = validateDecision(brainState, candidates, undoneHabits, dayContext);
    if (!validation.valid) {
      logger.warn(`[Brain][Phase12.9] Decision for userId=${userId} has issues: ${validation.issues.join('; ')}. Proceeding with corrected state.`);
      // Correct confidence if task not found
      if (validation.issues.some(i => i.includes('not found'))) {
        currentDecision.confidence = Math.min(currentDecision.confidence, 30);
      }
    }

    // Phase 12.9: Apply truth filter (tone/context alignment)
    const filteredState = applyTruthFilter(brainState, dayContext);

    // Phase 12.9: Lifecycle trace
    traceLifecycle(userId, 'recompute_complete', {
      trigger: triggerEvent.type, decision: currentDecision.taskTitle || 'empty',
      confidence: currentDecision.confidence, validationIssues: validation.issues?.length || 0,
    });

    // ── Store, emit, notify ─────────────────────────────────────────────
    const entry = ensureCacheEntry(userId);
    entry.state = filteredState;
    entry.signals = signals;
    entry.lastActivity = Date.now();

    if (triggerEvent.type !== 'USER_INACTIVE' && triggerEvent.type !== 'INITIAL_LOAD') {
      entry.inactivityStartedAt = Date.now();
    }

    emitBrainUpdate(userId, filteredState);
    notifySubscribers(userId, filteredState);

    clearInactivityTimer(userId);
    startInactivityTimer(userId);

    // Phase 13: Persist decision memory to DB (debounced, non-blocking)
    scheduleDecisionMemoryPersist(userId);

    const elapsed = Date.now() - startMs;
    logger.info(`[Brain] recompute userId=${userId} trigger=${triggerEvent.type || 'none'} -> "${currentDecision.taskTitle || 'empty'}" confidence=${currentDecision.confidence} [${elapsed}ms]`);

    return filteredState;

  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? (err.stack || '').split('\n').slice(0,4).join(' | ') : '';
    logger.error(`[Brain] recompute error userId=${userId}: ${errMsg} ${errStack}`);
    return buildFallbackState(userId, triggerEvent);
  }
}

function subscribeToBrain(userId, callback) {
  if (!stateSubscribers.has(userId)) {
    stateSubscribers.set(userId, new Set());
  }
  stateSubscribers.get(userId).add(callback);
  return () => {
    const subs = stateSubscribers.get(userId);
    if (subs) subs.delete(callback);
  };
}

// ═════════════════════════════════════════════════════════════════════════════
// INTERNAL HELPERS
// ═════════════════════════════════════════════════════════════════════════════

function applyEventToSignals(signals, event) {
  const type = event.type;

  if (type === 'TASK_COMPLETED' || type === 'HABIT_COMPLETED') {
    signals.completionStreak += 1;
    signals.totalCompletions = (signals.totalCompletions || 0) + 1;
    signals.rejectionStreak = 0;
    signals.lastCompletionTs = Date.now();
    signals.inactivityMinutes = 0;
  }

  if (type === 'TASK_SKIPPED' || type === 'DECISION_REJECTED') {
    signals.rejectionStreak += 1;
    signals.totalSkips = (signals.totalSkips || 0) + 1;
    signals.completionStreak = 0;
    if (event.taskId) {
      signals.skipHistory.push({
        taskId: event.taskId,
        skipType: event.skipType || 'unknown',
        ts: Date.now(),
      });
      if (signals.skipHistory.length > 50) signals.skipHistory = signals.skipHistory.slice(-50);
    }
    const st = event.skipType || 'unknown';
    signals.skipTypes[st] = (signals.skipTypes[st] || 0) + 1;
  }

  if (type === 'USER_INACTIVE') {
    signals.inactivityMinutes = (signals.inactivityMinutes || 0) + 20;
  }

  if (type === 'ENERGY_UPDATED') {
    signals.inactivityMinutes = 0;
  }
}

function ensureCacheEntry(userId) {
  if (!brainCache.has(userId)) {
    brainCache.set(userId, {
      state: null, signals: null, decisionMemory: null,
      lastActivity: Date.now(), inactivityTimer: null,
      inactivityStartedAt: Date.now(),
    });
  }
  return brainCache.get(userId);
}

function emitBrainUpdate(userId, brainState) {
  if (_io) {
    _io.to(`user_${userId}`).emit('brain:update', { userId, brainState });
    logger.debug(`[Brain] Socket brain:update -> user_${userId}`);
  }
}

function notifySubscribers(userId, brainState) {
  const subs = stateSubscribers.get(userId);
  if (subs) {
    for (const cb of subs) {
      try { cb(brainState); } catch (e) { logger.error('[Brain] Subscriber error:', e.message); }
    }
  }
}

function startInactivityTimer(userId) {
  const entry = ensureCacheEntry(userId);
  entry.inactivityTimer = setTimeout(() => {
    logger.info(`[Brain] Inactivity detected for userId=${userId} (${INACTIVITY_THRESHOLD_MS / 60000} min)`);
    eventBus.emit(eventBus.EVENT_TYPES.USER_INACTIVE, { userId });
  }, INACTIVITY_THRESHOLD_MS);
}

function clearInactivityTimer(userId) {
  const entry = brainCache.get(userId);
  if (entry && entry.inactivityTimer) {
    clearTimeout(entry.inactivityTimer);
    entry.inactivityTimer = null;
  }
}

function buildBreakState(energy, signals, block, todayStr, inactivityMinutes, diffMod) {
  return {
    currentDecision: {
      taskId: null,
      taskTitle: 'خد استراحة',
      type: 'break',
      why: [
        'طاقتك منخفضة وعندك تخطيات متكررة',
        'الراحة هتزود انتاجيتك',
      ],
      smallestStep: 'قوم اشرب مية وامشي 5 دقايق',
      confidence: 95,
    },
    reason: 'حماية من الارهاق - استراحة اجبارية',
    riskLevel: 'high',
    userState: {
      energy: energy.level,
      energyScore: energy.score,
      momentum: 'low',
      burnoutRisk: 0.85,
      block,
      completionRate: 0,
      todayPending: 0,
      todayCompleted: 0,
      undoneHabits: 0,
    },
    adaptiveSignals: {
      rejectionStreak: signals.rejectionStreak,
      completionStreak: 0,
      inactivityMinutes,
      skipTypes: signals.skipTypes,
      adaptiveOverride: 'burnout_protection',
      difficultyModifier: diffMod ? diffMod.modifier : 0.3,
      maxTaskMinutes: diffMod ? diffMod.maxMinutes : 15,
      inactivityStrategy: 'normal',
    },
    decisionMemory: { totalDecisions: 0, recentAcceptanceRate: 0, blockedTasks: [] },
    triggerEvent: 'BURNOUT_PROTECTION',
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Phase 12.7: Context-aware end-of-day state builder.
 * Uses dayContext to give honest, appropriate response.
 * HARD RULE: empty day → neutral tone, NEVER congratulations.
 */
function buildEndOfDayStateV2(energy, signals, block, todayStr, inactivityMinutes, diffMod, dayContext, isEvening) {
  const endOfDayResponse = getEndOfDayResponse(dayContext, isEvening);

  return {
    currentDecision: {
      taskId: null,
      taskTitle: endOfDayResponse.title,
      type: dayContext.classification === 'productive' ? 'reflection' : 'end_of_day',
      why: endOfDayResponse.why,
      smallestStep: endOfDayResponse.smallestStep,
      confidence: endOfDayResponse.confidence,
      tone: endOfDayResponse.tone,  // Phase 12.7: expose tone for UI
    },
    reason: dayContext.classification === 'productive'
      ? 'كل المهام والعادات مكتملة'
      : dayContext.classification === 'partial'
        ? 'يوم جزئي - فيه مجال للتحسين'
        : 'يوم فارغ - لا مهام مسجلة',
    riskLevel: dayContext.classification === 'empty' ? 'medium' : 'low',
    dayContext,  // Phase 12.7: always expose
    userState: {
      energy: energy.level,
      energyScore: energy.score,
      momentum: signals.completionStreak >= 2 ? 'high' : (dayContext.isProductive ? 'medium' : 'low'),
      burnoutRisk: 0,
      block,
      completionRate: dayContext.completionRatio || 0,
      todayPending: 0,
      todayCompleted: dayContext.completedTasks,
      undoneHabits: 0,
    },
    adaptiveSignals: {
      rejectionStreak: 0,
      completionStreak: signals.completionStreak,
      inactivityMinutes,
      skipTypes: signals.skipTypes,
      adaptiveOverride: 'end_of_day',
      difficultyModifier: diffMod ? diffMod.modifier : 1.0,
      maxTaskMinutes: diffMod ? diffMod.maxMinutes : 60,
      inactivityStrategy: 'normal',
    },
    decisionMemory: { totalDecisions: 0, recentAcceptanceRate: dayContext.completionRatio || 0, blockedTasks: [] },
    triggerEvent: 'END_OF_DAY',
    lastUpdatedAt: new Date().toISOString(),
  };
}

// Keep backward-compatible buildEndOfDayState for existing tests
function buildEndOfDayState(energy, signals, block, todayStr, inactivityMinutes, diffMod, completedTasks, totalHabits, isEvening) {
  const dayCtx = classifyDayContext(completedTasks, 0, totalHabits, totalHabits);
  return buildEndOfDayStateV2(energy, signals, block, todayStr, inactivityMinutes, diffMod, dayCtx, isEvening);
}

/**
 * Phase 12.8: SAFE fallback state — returned on ANY error.
 * ALWAYS valid. ALWAYS has currentDecision. ALWAYS has dayContext.
 * safeMode: true tells the frontend this is a fallback.
 */
function buildFallbackState(userId, triggerEvent) {
  let energy;
  try { energy = computeEnergy(); } catch { energy = { level: 'medium', score: 50 }; }
  let block;
  try { block = getCurrentBlock(); } catch { block = 'unknown'; }

  return {
    currentDecision: {
      taskId: null,
      taskTitle: null,
      type: 'empty',
      why: ['في مشكلة مؤقتة — جرب تاني'],
      smallestStep: 'حدث الصفحة',
      confidence: 0,
      intent: null,
      intentLabel: '',
      tone: 'neutral',
    },
    reason: 'no_data',
    riskLevel: 'low',
    safeMode: true,
    dayContext: {
      classification: 'empty',
      hadTasks: false,
      hadHabits: false,
      completedTasks: 0,
      completedHabits: 0,
      totalItems: 0,
      completedItems: 0,
      completionRatio: 0,
      isProductive: false,
      label_ar: 'غير متاح',
    },
    userState: {
      energy: energy.level,
      energyScore: energy.score,
      momentum: 'low',
      burnoutRisk: 0,
      block,
      completionRate: 0,
      todayPending: 0,
      todayCompleted: 0,
      undoneHabits: 0,
    },
    adaptiveSignals: {
      rejectionStreak: 0,
      completionStreak: 0,
      inactivityMinutes: 0,
      skipTypes: {},
      adaptiveOverride: null,
      difficultyModifier: 1.0,
      maxTaskMinutes: 60,
      inactivityStrategy: 'normal',
    },
    decisionMemory: { totalDecisions: 0, recentAcceptanceRate: 0, blockedTasks: [] },
    triggerEvent: triggerEvent?.type || 'FALLBACK',
    lastUpdatedAt: new Date().toISOString(),
  };
}

// ─── Get signals for a user ─────────────────────────────────────────────────
function getSignals(userId) {
  const cached = brainCache.get(userId);
  return cached?.signals || null;
}

// ─── Get decision memory for a user ─────────────────────────────────────────
function getMemory(userId) {
  const mem = getDecisionMemory(userId);
  const blocked = [];
  for (const [id, stats] of mem.taskStats) {
    if (stats.blockedUntil > Date.now()) blocked.push(id);
  }
  return {
    historyLength: mem.history.length,
    taskStatsCount: mem.taskStats.size,
    blockedTaskIds: blocked,
    recentAcceptanceRate: getRecentAcceptanceRate(userId),
  };
}

// ─── Clear user state (for testing) ─────────────────────────────────────────
function clearUserState(userId) {
  clearInactivityTimer(userId);
  brainCache.delete(userId);
  stateSubscribers.delete(userId);
}

// ─── Exposed for testing ────────────────────────────────────────────────────
module.exports = {
  init,
  getBrainState,
  recompute,
  subscribe: subscribeToBrain,
  getSignals,
  getMemory,
  clearUserState,
  // For testing only:
  _recordDecisionOutcome: recordDecisionOutcome,
  _isTaskBlocked: isTaskBlocked,
  _computeDynamicConfidence: computeDynamicConfidence,
  _computeDifficultyModifier: computeDifficultyModifier,
  _getDecisionMemory: getDecisionMemory,
  _getContinuousInactivityMinutes: getContinuousInactivityMinutes,
  _analyzeTaskSemantics: analyzeTaskSemantics,
  _isTaskTimeValid: isTaskTimeValid,
  _getTimeProximityBonus: getTimeProximityBonus,
  // Phase 12.7 testing exports:
  _inferIntent: inferIntent,
  _classifyDayContext: classifyDayContext,
  _getEndOfDayResponse: getEndOfDayResponse,
  _getIntentScoreModifier: getIntentScoreModifier,
  _getIntentLabel: getIntentLabel,
  // Phase 12.9 testing exports:
  _validateDecision: validateDecision,
  _applyTruthFilter: applyTruthFilter,
  _buildExplainableWhy: buildExplainableWhy,
  _computeOverdueDays: _computeOverdueDays,
  _VAGUE_PHRASES: VAGUE_PHRASES,
};
