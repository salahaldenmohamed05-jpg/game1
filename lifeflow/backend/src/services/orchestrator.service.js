/**
 * Orchestrator Service — المنسق المركزي (Phase 13 — Full Layer Integration)
 * ==========================================================================
 * Central brain routing requests through the full AI pipeline:
 *
 *   Context Snapshot → Learning Engine → Prediction Engine
 *   → Planning Engine → Decision Engine → Explainability
 *   → Dispatcher → Execute → Feedback → Learn
 *
 * Returns unified response:
 *   { reply, mode, actions, suggestions, is_fallback,
 *     confidence, explanation, planningTip, snapshot }
 */

'use strict';

const logger          = require('../utils/logger');
const memory          = require('./memory.service');
const { buildProfile, buildPersonalizationBlock } = require('./personalization.service');
const adaptiveBehavior = require('./adaptive.behavior.service');
const { buildSystemPrompt, getSuggestions } = require('../config/personality.config');
const { safeExecute, DEFAULT_FALLBACK }    = require('./ai/ai.error.handler');
// Use ai.client for multi-provider retry + cache (Gemini → Groq multi-model fallback)
const { chat: chatClient, buildIntelligentFallback } = require('./ai/ai.client');
const { chat: chatFallback }               = require('../ai/ai.service'); // backup if client fails

// ─── Lazy Service Loaders ─────────────────────────────────────────────────────
function getContextSnapshot() {
  try { return require('./context.snapshot.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './context.snapshot.service' not available: ${_e.message}`); return null; }
}
function getLearning() {
  try { return require('./learning.engine.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './learning.engine.service' not available: ${_e.message}`); return null; }
}
function getPrediction() {
  try { return require('./prediction.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './prediction.service' not available: ${_e.message}`); return null; }
}
function getPlanning() {
  try { return require('./planning.engine.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './planning.engine.service' not available: ${_e.message}`); return null; }
}
function getDecisionEngine() {
  try { return require('./decision.engine.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './decision.engine.service' not available: ${_e.message}`); return null; }
}
function getUnifiedDecision() {
  try { return require('./unified.decision.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './unified.decision.service' not available: ${_e.message}`); return null; }
}
function getLLMOrchestrator() {
  try { return require('./llm.orchestrator.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './llm.orchestrator.service' not available: ${_e.message}`); return null; }
}
function getExplainability() {
  try { return require('./explainability.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './explainability.service' not available: ${_e.message}`); return null; }
}
function getDispatcher() {
  try { return require('./execution.dispatcher.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './execution.dispatcher.service' not available: ${_e.message}`); return null; }
}
function getPresenter() {
  try { return require('./assistant.presenter.service'); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Module './assistant.presenter.service' not available: ${_e.message}`); return null; }
}
// Step 1+3: Add behavior and energy service loaders
function getBehaviorModel() {
  try { return require('./behavior.model.service'); } catch (_e) { return null; }
}
function getEnergyService() {
  try { return require('./energy.service'); } catch (_e) { return null; }
}
function getExecutionEngine() {
  try { return require('./execution.engine.service'); } catch (_e) { return null; }
}

// ═══════════════════════════════════════════════════════════════════════════════
// DECISION-DRIVEN QUERY DETECTION
// Detect whether the user is asking "what should I do?" type questions
// These MUST be answered from the Decision Engine, never from LLM alone.
// ═══════════════════════════════════════════════════════════════════════════════
const DECISION_QUERY_PATTERNS = [
  // Arabic: what should I do / what's next / start my day
  'ايش اسوي', 'ايش أسوي', 'اعمل ايه', 'أعمل إيه', 'أعمل ايه', 'اعمل إيه',
  'ابدأ بايه', 'أبدأ بإيه', 'ابدأ بإيه', 'أبدأ بايه', 'ابدأ يومي', 'ابدأ اليوم',
  'ايه الأهم', 'ايش الاهم', 'إيه الأهم', 'الأهم الحين', 'المهم دلوقتي',
  'ايه اللي أعمله', 'ايش اسوي دحين', 'أبدأ بأيه',
  'شغلني', 'وجّهني', 'ايه الخطوة', 'الخطوة الجاية', 'ايه التالي', 'ايش التالي',
  'أعمل ايش', 'ابدأ من وين', 'اسوي ايش', 'ايش أسوي الحين',
  'ايش أبدأ', 'ابدأ بأي', 'ما المهمة', 'وش اسوي', 'وش أسوي',
  'ابدأ في ايه', 'ابدأ في إيه', 'ايه المهمة', 'المهمة الجاية',
  'عايز ابدأ', 'محتاج ابدأ', 'عاوز أشتغل',
  'ايه اهم حاجة', 'ايه أهم حاجة', 'اهم حاجة',
  // English fallbacks
  'what should i do', 'what next', 'start my day', 'what\'s next',
  'next task', 'what to do', 'guide me',
];

// Patterns that should NOT trigger decision query even if matched above
// (casual greetings, general questions)
const NON_DECISION_PATTERNS = [
  'مرحبا', 'أهلا', 'اهلا', 'السلام', 'كيف حالك', 'كيفك',
  'hello', 'hi', 'hey', 'good morning', 'good evening',
  'شكرا', 'يعطيك العافية', 'thank',
];

function isDecisionQuery(message) {
  const lower = message.toLowerCase().trim();
  // Skip if it's a casual/greeting message
  if (NON_DECISION_PATTERNS.some(p => lower.includes(p))) return false;
  return DECISION_QUERY_PATTERNS.some(p => lower.includes(p));
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESPONSE SANITIZATION — Phase Q
// Strips non-Arabic/non-Latin characters (Chinese, Japanese, Korean etc.)
// Removes canned bot phrases that make the assistant sound robotic.
// ═══════════════════════════════════════════════════════════════════════════════
const BANNED_PHRASES = [
  'أنا هنا عشان أساعدك', 'أنا هنا لمساعدتك', 'لا تتردد', 'بكل سرور',
  'يسعدني مساعدتك', 'يسعدني', 'هل تحتاج مساعدة أخرى', 'هل هناك شيء آخر',
  'إذا كنت تحتاج أي شيء', 'أتمنى لك يوماً سعيداً', 'أتمنى لك يومًا',
  'شكراً لاستخدامك', 'شكرا لاستخدامك',
  'في خدمتك', 'تحت أمرك دائماً',
];

function sanitizeReply(text) {
  if (!text || typeof text !== 'string') return text;

  // Remove Chinese/Japanese/Korean characters (CJK Unified Ideographs + extensions)
  let clean = text.replace(/[\u4E00-\u9FFF\u3400-\u4DBF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\uF900-\uFAFF\u2E80-\u2EFF]+/g, '');

  // Remove banned bot phrases
  for (const phrase of BANNED_PHRASES) {
    clean = clean.replace(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
  }

  // Clean up multiple spaces/newlines from removals
  clean = clean.replace(/\n{3,}/g, '\n\n').replace(/ {2,}/g, ' ').trim();

  return clean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SESSION-LEVEL REPETITION TRACKER (Phase N — Phase 6)
// Tracks recent reply structures per user to avoid repeating phrasing.
// ═══════════════════════════════════════════════════════════════════════════════
const _replyHistory = new Map(); // userId → { replies: string[], structureIdx: number, nudgeIdx: number }
const MAX_REPLY_HISTORY = 8;

function getReplySession(userId) {
  if (!_replyHistory.has(userId)) {
    _replyHistory.set(userId, { replies: [], structureIdx: 0, nudgeIdx: 0, greetIdx: 0, ts: Date.now() });
  }
  const s = _replyHistory.get(userId);
  // Reset if stale (>30 min)
  if (Date.now() - s.ts > 30 * 60 * 1000) {
    s.replies = []; s.structureIdx = 0; s.nudgeIdx = 0; s.greetIdx = 0;
  }
  s.ts = Date.now();
  return s;
}

function recordReply(userId, reply) {
  const s = getReplySession(userId);
  s.replies.push(reply.slice(0, 120)); // store fingerprint
  if (s.replies.length > MAX_REPLY_HISTORY) s.replies.shift();
}

function pickRotating(arr, session, key) {
  const idx = session[key] % arr.length;
  session[key] = (session[key] + 1) % (arr.length * 3); // cycle through 3x before repeating
  return arr[idx];
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEHAVIOR-AWARE EXECUTION COACH (Phase N — Phases 1-5)
// Replaces the old templated buildDecisionDrivenReply.
// Generates dynamic, human, situational, behavior-driven replies.
// No fixed templates. No repeated sentence structures.
// ═══════════════════════════════════════════════════════════════════════════════

// ── Micro-coaching nudges (Phase Q — more natural, less preachy) ──
const MICRO_NUDGES = [
  'اقفل الموبايل وركّز',
  'ابدأ 5 دقايق بس وشوف إيه اللي هيحصل',
  'اشرب ماية وابدأ على طول',
  'حط تايمر 10 دقايق وادخل فيها',
  'افتح المهمة واكتب أول سطر',
  'ماتفكرش كتير — ابدأ وبس',
  'لو خلصتها هتحس بارتياح',
  'الخطوة الأولى هي الأصعب وانت عملتها خلاص',
  'جرّب تشتغل 15 دقيقة بس',
  'ركّز على المهمة دي بس',
];

// ── Behavioral greeting pools (varied per state, Phase Q — pure Egyptian) ──
const GREETINGS = {
  avoidance: [
    (n, d) => `${n}، بلاش تأجيل… المهمة دي متأخرة ${d} يوم`,
    (n, d) => `${n}، لاحظت إنك بتأجل — عادي بس خلينا نبدأ دلوقتي`,
    (n) => `${n}، مش هسألك ليه — بس يلا نبدأ`,
    (n) => `${n}، كفاية تأجيل — نبدأ في حاجة صغيرة`,
    (n, d) => `${n}، المهمة مستنياك من ${d} يوم. يلا بينا`,
  ],
  overwhelmed: [
    (n) => `${n}، مش محتاج تعمل كل ده… نبدأ بحاجة صغيرة`,
    (n) => `${n}، الحمل كبير — بس المطلوب منك حاجة واحدة بس`,
    (n) => `${n}، سيب كل حاجة وركّز على اللي هقولك عليه`,
    (n) => `${n}، عارف إن الضغط كبير — خلينا نسهّلها عليك`,
  ],
  productive: [
    (n) => `${n}، ماشي كويس… يلا نرفع المستوى`,
    (n) => `${n}، الزخم ده ممتاز — استغله في حاجة صعبة`,
    (n) => `${n}، أداؤك النهارده قوي — كمّل كده`,
    (n) => `${n}، فرصة تخلص المهمة الصعبة وانت في أحسن حالاتك`,
  ],
  coasting: [
    (n) => `${n}، أنجزت مهام سهلة — بس الشغل الحقيقي لسه`,
    (n) => `${n}، كفاية مهام خفيفة. يلا ندخل في الجد`,
    (n) => `${n}، انت جاهز لتحدي أكبر — ماتضيعش طاقتك على السهل`,
  ],
  low_energy: [
    (n) => `${n}، طاقتك مش عالية — عشان كده اخترنا حاجة خفيفة`,
    (n) => `${n}، جسمك محتاج رفق — نشتغل بالراحة`,
    (n) => `${n}، مش لازم تحمّل نفسك فوق طاقتك`,
  ],
  focused: [
    (n) => `${n}، تركيزك عالي دلوقتي — ادخل في وضع الشغل العميق`,
    (n) => `${n}، استغل حالة التركيز دي — ماتضيعهاش`,
    (n) => `${n}، أحسن وقت للمهام الثقيلة — تركيزك في القمة`,
  ],
  starting: [
    (n) => `${n}، يلا نبدأ — دي أهم حاجة دلوقتي`,
    (n) => `${n}، جاهز؟ يلا نخلص الأهم الأول`,
    (n) => `${n}، يلا نبدأ يومك صح`,
  ],
};

// ── Response structure variants (Phase 3) ──
// Each returns a function(parts) → string to avoid template repetition
const RESPONSE_STRUCTURES = [
  // Structure A: Direct command → reason → nudge
  (p) => [p.greeting, p.taskDirective, p.reason, p.nudge].filter(Boolean).join('\n'),
  // Structure B: Greeting + task inline → signal + nudge
  (p) => [p.greeting, `${p.taskDirective}\n${p.reason}`, `${p.signalLine} — ${p.nudge}`].filter(Boolean).join('\n'),
  // Structure C: Short push → task → alternative
  (p) => [p.greeting, p.taskDirective, p.nudge, p.alternative].filter(Boolean).join('\n'),
  // Structure D: Reason first → task → nudge
  (p) => [p.reason, p.taskDirective, p.greeting, p.nudge].filter(Boolean).join('\n'),
  // Structure E: Challenge/question → task → signal
  (p) => [p.greeting, p.taskDirective, p.signalLine, p.nudge].filter(Boolean).join('\n'),
];

function buildDecisionDrivenReply(decision, userName, userId) {
  const name = userName || 'صديقي';
  const focus = decision.currentFocus;
  const why = decision.why || [];
  const nextSteps = focus?.next_steps || [];
  const signals = decision.signalsUsed || {};
  const behavior = decision.behaviorState || {};
  const alternatives = decision.alternatives || [];

  const session = getReplySession(userId || 'default');

  // ── Detect behavioral mode (Phase 2) ──
  const energy = signals.energy || 50;
  const focusVal = signals.focus || 50;
  const burnout = signals.burnout || 0;
  const procrastination = signals.procrastination || 0;
  const rawState = behavior.state || 'starting';

  let mode;
  if (rawState === 'avoidance' || procrastination >= 0.5) mode = 'avoidance';
  else if (rawState === 'overwhelmed' || (signals.overwhelm || 0) >= 0.6) mode = 'overwhelmed';
  else if (rawState === 'productive' && (signals.completion || 0) >= 0.6) mode = 'productive';
  else if (rawState === 'coasting') mode = 'coasting';
  else if (energy < 35 || burnout >= 0.5) mode = 'low_energy';
  else if (focusVal >= 70 && energy >= 60) mode = 'focused';
  else mode = rawState === 'productive' ? 'productive' : 'starting';

  // ── Build overdue days context (Phase 4) ──
  let daysOverdue = 0;
  if (focus.due_date) {
    const now = new Date();
    const due = new Date(focus.due_date);
    daysOverdue = Math.max(0, Math.floor((now - due) / 86400000));
  }

  // ── Greeting (Phase 2 — varied by mode) ──
  const greetPool = GREETINGS[mode] || GREETINGS.starting;
  const greetFn = pickRotating(greetPool, session, 'greetIdx');
  const greeting = greetFn(name, daysOverdue);

  // ── Task directive (Phase Q — natural Egyptian, not raw data) ──
  let taskDirective = '';
  if (focus.type === 'task') {
    const dur = focus.estimated_duration ? ` (${focus.estimated_duration} دقيقة)` : '';
    if (mode === 'avoidance' && daysOverdue > 0) {
      taskDirective = `📌 "${focus.title}"${dur} — متأخرة ${daysOverdue} يوم. ابدأها دلوقتي.`;
    } else if (mode === 'overwhelmed') {
      taskDirective = `دي بس: "${focus.title}"${dur}. سيب أي حاجة تانية.`;
    } else if (mode === 'productive') {
      taskDirective = `🎯 "${focus.title}"${dur} — التحدي اللي يستاهل طاقتك.`;
    } else if (mode === 'coasting') {
      taskDirective = `التحدي الحقيقي: "${focus.title}"${dur}. الوقت دلوقتي.`;
    } else if (mode === 'low_energy') {
      taskDirective = `مهمة خفيفة: "${focus.title}"${dur}.`;
    } else {
      taskDirective = `📌 "${focus.title}"${dur}`;
    }
  } else if (focus.type === 'habit') {
    taskDirective = `🔄 "${focus.title}" — سلسلة ${focus.streak || 0} يوم. ماتقطعهاش.`;
  } else if (focus.type === 'break') {
    taskDirective = '💆 جسمك محتاج راحة. وقّف كل حاجة وارتاح 15 دقيقة.';
  } else if (focus.type === 'celebration') {
    taskDirective = '🎉 خلّصت كل حاجة! كافئ نفسك — تستاهل.';
  }

  // ── Reason — one line, natural, not a data dump (Phase 4) ──
  let reason = '';
  if (why.length > 0) {
    // Pick the most relevant reason, not all of them
    const bestReason = why[0];
    // If reason has task name already, use it; otherwise add context
    reason = bestReason;
  }

  // ── Signal line — only when relevant, not always (Phase 4) ──
  let signalLine = '';
  if (mode === 'low_energy') {
    signalLine = `⚡ طاقة ${energy}% — عشان كده اخترنا حاجة تناسبك`;
  } else if (mode === 'focused') {
    signalLine = `🎯 تركيز ${focusVal}% + طاقة ${energy}% — حالتك مثالية للشغل العميق`;
  } else if (burnout >= 0.5) {
    signalLine = `⚠️ إجهاد ${Math.round(burnout * 100)}% — لازم تراعي نفسك`;
  }
  // For other modes, don't dump signals — keep it human

  // ── Micro-coaching nudge (Phase 5) ──
  const nudge = `💡 ${pickRotating(MICRO_NUDGES, session, 'nudgeIdx')}`;

  // ── Alternative (only sometimes) ──
  let alternative = '';
  if (alternatives.length > 0 && focus.type !== 'celebration' && Math.random() > 0.4) {
    alternative = `بديل: "${alternatives[0].title}"`;
  }

  // ── Pick response structure (Phase 3 + Phase 6) ──
  const structureFn = pickRotating(RESPONSE_STRUCTURES, session, 'structureIdx');
  const reply = structureFn({
    greeting,
    taskDirective,
    reason,
    signalLine,
    nudge,
    alternative,
  });

  // Record for repetition avoidance (Phase 6)
  recordReply(userId || 'default', reply);

  return reply;
}

// ─── Mode Detection ───────────────────────────────────────────────────────────
function detectMode(message, intentCategory) {
  const lower = message.toLowerCase();

  const emotionalSignals = [
    'تعبان', 'تعب', 'حزين', 'ضغط', 'توتر', 'متضايق', 'مش حلو', 'زهقت',
    'كيف حالي', 'كيف أنا', 'مشاعر', 'خايف', 'قلق', 'وحيد',
    'tired', 'stressed', 'sad', 'anxious', 'feel',
  ];

  const actionSignals = [
    'اضف', 'أضف', 'ضيف', 'احذف', 'حذف', 'عدّل', 'أجّل', 'خلص',
    'سجّل', 'انتهيت', 'امتحان', 'جدول', 'مهمة', 'عادة',
    'create', 'delete', 'schedule',
  ];

  const hasEmotional = emotionalSignals.some(s => lower.includes(s));
  const hasAction    = actionSignals.some(s => lower.includes(s));

  if (hasEmotional && !hasAction) return 'companion';
  if (hasAction && !hasEmotional) return 'manager';
  if (intentCategory === 'advice')      return 'companion';
  if (intentCategory === 'task_action') return 'manager';
  return 'hybrid';
}

// ─── Context Block Builder ────────────────────────────────────────────────────
function buildContextBlock(ctx, profile, historyStr, snapshot = null, learningProfile = null, prediction = null) {
  const parts = [];

  // User basics
  parts.push(`الاسم: ${ctx.name || 'صديقي'}`);
  parts.push(`التوقيت: ${ctx.greeting || 'مرحباً'}`);
  parts.push(`الطاقة: ${ctx.energy || 55}/100`);
  parts.push(`المزاج اليوم: ${ctx.todayMood ? ctx.todayMood + '/10' : 'لم يُسجَّل'}`);
  parts.push(`الإنتاجية (7 أيام): ${ctx.productivity || 55}/100`);

  // Tasks — Phase 6+Q: inject REAL task details with full context for AI awareness
  if (ctx.tasks?.length > 0) {
    parts.push(`مهام معلقة: ${ctx.tasks.length}`);
    // List actual task details so AI understands the NATURE of each task
    const taskDetails = ctx.tasks.slice(0, 5).map(t => {
      let info = `"${t.title}" (${t.priority || 'medium'})`;
      if (t.category) info += ` [${t.category}]`;
      if (t.description) info += ` — ${t.description.slice(0, 120)}`;
      if (t.estimated_duration) info += ` (${t.estimated_duration} دقيقة)`;
      if (t.start_time) info += ` الساعة ${new Date(t.start_time).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}`;
      if (t.subtasks?.length > 0) info += ` (${t.subtasks.length} خطوات فرعية)`;
      // Auto-classify task nature for AI awareness
      const titleLower = (t.title || '').toLowerCase();
      const descLower = (t.description || '').toLowerCase();
      const combined = titleLower + ' ' + descLower;
      if (/مذاكر|دراس|مراجع|امتحان|study|exam|review/.test(combined)) info += ' [طبيعة: مذاكرة]';
      else if (/كود|برمج|develop|code|debug|pr|deploy|git/.test(combined)) info += ' [طبيعة: برمجة]';
      else if (/رياض|تمرين|gym|sport|exercise|جري|مشي/.test(combined)) info += ' [طبيعة: رياضة]';
      else if (/اجتماع|meeting|call|مكالم|zoom/.test(combined)) info += ' [طبيعة: اجتماع]';
      else if (/قراء|كتاب|read|book/.test(combined)) info += ' [طبيعة: قراءة]';
      else if (/كتاب|مقال|تقرير|report|writ|blog/.test(combined)) info += ' [طبيعة: كتابة]';
      else if (/تصميم|design|creative|فوتوشوب|figma/.test(combined)) info += ' [طبيعة: تصميم]';
      return info;
    }).join('\n- ');
    parts.push(`قائمة المهام:\n- ${taskDetails}`);
  }
  if (ctx.urgentTasks?.length > 0) {
    parts.push(`مهام عاجلة: ${ctx.urgentTasks.length} (${ctx.urgentTasks.slice(0, 3).map(t => t.title).join('، ')})`);
  }
  if (ctx.overdueTasks?.length > 0) {
    parts.push(`مهام متأخرة: ⚠️ ${ctx.overdueTasks.length} (${ctx.overdueTasks.slice(0, 2).map(t => t.title).join('، ')})`);
  }
  if (ctx.todayTasks?.length > 0) {
    parts.push(`مهام اليوم: ${ctx.todayTasks.length}`);
  }
  // Phase 6: completed today — prevents AI from suggesting done tasks
  if (ctx.completedToday?.length > 0) {
    parts.push(`مهام مكتملة اليوم: ${ctx.completedToday.length} (${ctx.completedToday.slice(0, 3).map(t => t.title).join('، ')})`);
  }
  // Phase 6: habits status
  if (ctx.habits?.length > 0) {
    parts.push(`عادات نشطة: ${ctx.habits.length}`);
    if (ctx.completedHabitCount > 0) {
      parts.push(`عادات مكتملة اليوم: ${ctx.completedHabitCount}/${ctx.habits.length}`);
    }
  }
  // Phase 6: current Cairo time
  const moment = require('moment-timezone');
  const cairoNow = moment().tz('Africa/Cairo');
  parts.push(`الوقت الحالي (القاهرة): ${cairoNow.format('HH:mm')} — ${cairoNow.format('dddd')}`);
  parts.push(`التاريخ: ${cairoNow.format('YYYY-MM-DD')}`);

  // Context snapshot signals
  if (snapshot?.signals?.length > 0) {
    const sigTexts = snapshot.signals.slice(0, 2).map(s => s.label || s.message).join('، ');
    parts.push(`إشارات: ${sigTexts}`);
  }

  // Learning insights
  if (learningProfile?.insights?.length > 0) {
    parts.push(`رؤى التعلم: ${learningProfile.insights[0]}`);
  }
  if (learningProfile?.optimal_hour !== null && learningProfile?.optimal_hour !== undefined) {
    parts.push(`أفضل وقت للإنجاز: الساعة ${learningProfile.optimal_hour}:00`);
  }

  // Predictions
  if (prediction) {
    if (prediction.burnout_risk > 0.6) {
      parts.push(`⚠️ خطر الإجهاد: ${Math.round(prediction.burnout_risk * 100)}%`);
    }
    if (prediction.task_completion_probability < 0.4) {
      parts.push(`📉 احتمالية إتمام المهام منخفضة: ${Math.round(prediction.task_completion_probability * 100)}%`);
    }
  }

  // Personalization (now includes profile + settings from ProfileView/SettingsView)
  if (profile) {
    const personBlock = buildPersonalizationBlock(profile, ctx);
    if (personBlock) parts.push(personBlock);
  }

  // Memory summary
  const memSummary = memory.buildMemorySummary(ctx.userId || '');
  if (memSummary) parts.push(memSummary);

  // History
  if (historyStr) {
    parts.push(`\nسياق المحادثة الأخيرة:\n${historyStr}`);
  }

  // Step 1+3: Behavior profile data
  // (injected via userCtx.behaviorInsights by the orchestrate function)
  if (ctx.behaviorInsights) {
    parts.push(`\nرؤى السلوك: ${ctx.behaviorInsights}`);
  }

  return parts.join('\n');
}

// ─── Full Pipeline Orchestration ──────────────────────────────────────────────
/**
 * Full AI pipeline: Context → Learning → Prediction → Planning → Decision → Explain → Dispatch
 *
 * @returns {{ reply, mode, actions, suggestions, is_fallback, confidence, explanation, planningTip, snapshot }}
 */
async function orchestrate({
  userId,
  message,
  timezone     = 'Africa/Cairo',
  actionResult  = null,
  actionSummary = null,
  intentCategory = 'general',
  userCtx       = null,
}) {
  const startMs = Date.now();

  try {
    const mode = detectMode(message, intentCategory);

    // ── STEP 1: Context Snapshot ──────────────────────────────────────────────
    let snapshot = null;
    try {
      const ctxService = getContextSnapshot();
      if (ctxService) {
        snapshot = await ctxService.getOrGenerateSnapshot(userId, timezone);
      }
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

    // ── STEP 2: Learning Engine ───────────────────────────────────────────────
    let learningProfile = null;
    try {
      const learning = getLearning();
      if (learning) {
        learningProfile = learning.getUserLearningProfile(userId);
        // Record this decision event
        learning.recordDecision(userId, {
          action : intentCategory,
          risk   : 'low',
          energy : snapshot?.energy?.score || userCtx?.energy || 55,
          mood   : snapshot?.mood?.score   || userCtx?.todayMood || 5,
          mode,
          intent : intentCategory,
        });
      }
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

    // ── STEP 2b: Behavior Profile (Step 1+3 addition) ────────────────────────
    let behaviorInsights = null;
    try {
      const behaviorSvc = getBehaviorModel();
      if (behaviorSvc) {
        const profile = await behaviorSvc.getBehaviorProfile(userId);
        const patterns = await behaviorSvc.getBehaviorPatterns(userId);
        if (profile || patterns.length > 0) {
          const parts = [];
          if (profile?.focus_peak_hours?.length > 0) {
            parts.push(`ساعات الذروة: ${profile.focus_peak_hours.join(', ')}:00`);
          }
          if (profile?.data_quality) {
            parts.push(`جودة بيانات السلوك: ${profile.data_quality}`);
          }
          const procPattern = patterns.find(p => p.pattern_type === 'procrastination');
          if (procPattern && procPattern.correlation_score > 0.3) {
            parts.push(`تأجيل: ${procPattern.insight}`);
          }
          const workPattern = patterns.find(p => p.pattern_type === 'working_hours');
          if (workPattern) {
            parts.push(`${workPattern.insight}`);
          }
          if (parts.length > 0) {
            behaviorInsights = parts.join(' | ');
          }
        }
      }
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Behavior profile load failed: ${_e.message}`); }

    // ── STEP 3: Probabilistic Prediction ─────────────────────────────────────
    let prediction = null;
    try {
      const predService = getPrediction();
      if (predService) {
        prediction = await predService.getProbabilisticPrediction(userId, timezone);
      }
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

    // ── STEP 4: Planning Hint (async, non-blocking) ───────────────────────────
    let planningTip = null;
    try {
      const planning = getPlanning();
      if (planning && mode !== 'companion') {
        const plan = await planning.generateDailyPlan(userId, {
          timezone,
          energy     : snapshot?.energy?.score || 55,
          tasks      : userCtx?.tasks          || [],
          overdueTasks: userCtx?.overdueTasks  || [],
        });
        if (plan?.suggestions?.length > 0) {
          planningTip = plan.suggestions[0];
        }
      }
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

    // ═══════════════════════════════════════════════════════════════════════════
    // STEP 5: UNIFIED DECISION ENGINE — THE CORE BRAIN (Phase M upgrade)
    // ALWAYS called. Provides the ground truth for ALL assistant responses.
    // For decision queries → builds deterministic reply, no LLM.
    // For other queries → injects decision context into LLM prompt.
    // ═══════════════════════════════════════════════════════════════════════════
    let unifiedDecision = null;
    let confidence     = 70;
    let explanation    = [];
    const isDecisionQ  = isDecisionQuery(message);

    try {
      const unifiedSvc = getUnifiedDecision();
      if (unifiedSvc?.getUnifiedDecision) {
        unifiedDecision = await unifiedSvc.getUnifiedDecision(userId, {
          timezone,
          energy: snapshot?.energy?.score,
          mood:   snapshot?.mood?.score,
        });
        if (unifiedDecision) {
          confidence = unifiedDecision.confidence || 70;
          explanation = unifiedDecision.why || [];
          logger.info(`[ORCHESTRATOR] Decision Engine: focus=${unifiedDecision.currentFocus?.type}/${unifiedDecision.currentFocus?.action} behavior=${unifiedDecision.behaviorState?.state} tasks=${unifiedDecision.debug?.total_candidates} [${unifiedDecision.debug?.computation_ms}ms]`);
        }
      }
    } catch (_e) {
      logger.warn(`[ORCHESTRATOR] Unified Decision Engine failed: ${String(_e.message).slice(0, 200)}`);
    }

    // ── STEP 5b: SHORT-CIRCUIT for decision queries ──────────────────────────
    // If the user asks "what should I do?", return Decision Engine data directly.
    // Decision Engine provides the WHAT. Optional LLM provides PHRASING ONLY.
    if (isDecisionQ && unifiedDecision?.currentFocus) {
      const userName = userCtx?.name || 'صديقي';
      let directReply = buildDecisionDrivenReply(unifiedDecision, userName, userId);

      // ── Phase N (Phase 7): Optional LLM phrasing layer ──────────────────
      // LLM ONLY rephrases the coach reply for tone variation.
      // It NEVER changes the task, signals, or decision.
      // If LLM fails or is unavailable, the coach reply is already human-quality.
      let coaching = null;
      try {
        const llmOrch = getLLMOrchestrator();
        if (llmOrch) {
          coaching = await llmOrch.generateCoaching(unifiedDecision.signalsUsed || {});
          // Try to rephrase the reply for tone variation (non-blocking, fast)
          try {
            const rephrased = await llmOrch.rephraseCoachedReply?.(directReply, {
              behaviorState: unifiedDecision.behaviorState?.state,
              taskTitle: unifiedDecision.currentFocus?.title,
              energy: unifiedDecision.signalsUsed?.energy,
            });
            if (rephrased && rephrased.length > 20 && rephrased.includes(unifiedDecision.currentFocus?.title || '---')) {
              directReply = rephrased; // Only use if it still mentions the task
            }
          } catch (_re) { /* phrasing layer is optional */ }
        }
      } catch (_e) { /* non-critical */ }

      // Build contextual suggestions from alternatives
      const decisionSuggestions = [];
      if (unifiedDecision.alternatives?.length > 0) {
        decisionSuggestions.push(...unifiedDecision.alternatives.slice(0, 2).map(a => a.title));
      }
      decisionSuggestions.push('سجّل مزاجي');

      // Store in memory
      // Phase Q: sanitize decision reply
      directReply = sanitizeReply(directReply);
      memory.addShortTerm(userId, 'user', message, { intent: 'decision_query', mode });
      memory.addShortTerm(userId, 'assistant', directReply, { mode: 'decision_engine', is_fallback: false, confidence });
      memory.incrementStat(userId, 'totalMessages');

      const elapsed = Date.now() - startMs;
      logger.info(`[ORCHESTRATOR] Decision-driven reply: user=${userId} focus=${unifiedDecision.currentFocus?.title} confidence=${confidence}% [${elapsed}ms]`);

      return {
        reply       : directReply,
        mode        : 'decision_engine',
        actions     : [],
        suggestions : decisionSuggestions,
        is_fallback : false,
        intentCategory: 'decision_query',
        confidence,
        explanation,
        planningTip : coaching?.message || null,
        snapshot    : snapshot ? {
          energy : snapshot.energy,
          mood   : snapshot.mood,
          signals: snapshot.signals?.slice(0, 3) || [],
        } : null,
        prediction  : null,
        // Phase M: Decision Engine data in response
        decisionData: {
          currentFocus:   unifiedDecision.currentFocus,
          why:            unifiedDecision.why,
          signalsUsed:    unifiedDecision.signalsUsed,
          behaviorState:  unifiedDecision.behaviorState,
          alternatives:   unifiedDecision.alternatives?.slice(0, 3),
          rules_applied:  unifiedDecision.rules_applied,
          next_steps:     unifiedDecision.currentFocus?.next_steps,
        },
        pipeline_ms : elapsed,
      };
    }

    // ── STEP 5c: Legacy decision engine (for action enrichment) ───────────────
    let decisionResult = null;
    if (mode === 'manager' && intentCategory === 'task_action') {
      try {
        const engine = getDecisionEngine();
        if (engine) {
          decisionResult = engine.decide({
            action     : actionResult?.action || intentCategory,
            payload    : actionResult?.task   || {},
            userId,
            mode,
            energy     : snapshot?.energy?.score || 55,
            mood       : snapshot?.mood?.score   || 5,
            priority   : actionResult?.task?.priority || 'medium',
            itemCount  : 1,
          });
          if (!unifiedDecision) confidence = decisionResult?.confidence || 70;
        }
      } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }
    }

    // ── STEP 6: Explainability ────────────────────────────────────────────────
    if (explanation.length === 0) {
      try {
        const explSvc = getExplainability();
        if (explSvc && (decisionResult || mode !== 'companion')) {
          const explResult = explSvc.explainDecision({
            action      : actionResult?.action || intentCategory,
            userId,
            energy      : snapshot?.energy?.score || 55,
            mood        : snapshot?.mood?.score   || 5,
            priority    : actionResult?.task?.priority || 'medium',
            risk        : decisionResult?.risk || 'low',
            overdueCount: userCtx?.overdueTasks?.length || 0,
          });
          explanation = explResult?.why || [];
          if (explResult?.confidence && !unifiedDecision) confidence = explResult.confidence;
        }
      } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }
    }

    // ── STEP 7: Build Conversation Context ────────────────────────────────────
    const historyStr = memory.buildHistoryString(userId, 6);

    let profile = null;
    try { profile = await buildProfile(userId, timezone); } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

    const contextBlock = buildContextBlock(
      { ...(userCtx || {}), userId, behaviorInsights },
      profile,
      historyStr,
      snapshot,
      learningProfile,
      prediction
    );

    // ── STEP 8: Build System Prompt ───────────────────────────────────────────
    const systemPrompt = buildSystemPrompt({
      mode,
      intentCategory,
      tone        : profile?.preferredTone || 'supportive',
      contextBlock,
    });

    // ── STEP 9: Call AI ───────────────────────────────────────────────────────
    let userMsgForAI = message;

    if (actionSummary) {
      userMsgForAI = `[تم تنفيذ: ${actionSummary}]\n\nالمستخدم قال: ${message}`;
    } else if (actionResult && !actionResult.success) {
      userMsgForAI = `[محاولة تنفيذ فشلت: ${actionResult.message || ''}]\n\nالمستخدم قال: ${message}`;
    } else if (historyStr) {
      userMsgForAI = `[سياق:\n${historyStr}]\n\nالمستخدم الآن: ${message}`;
    }

    // Add planning tip to message if available
    if (planningTip && mode !== 'companion') {
      userMsgForAI += `\n\n[تلميح تخطيط: ${planningTip}]`;
    }

    // ── STEP 9b: Inject Decision Engine context into LLM prompt ────────────────
    // Even for non-decision queries, the LLM must know the current decision state.
    if (unifiedDecision?.currentFocus) {
      const df = unifiedDecision.currentFocus;
      const ds = unifiedDecision.signalsUsed || {};
      const db = unifiedDecision.behaviorState || {};
      const decisionContext = [
        `\n[═══ سياق محرك الذكاء ═══]`,
        `المهمة ذات الأولوية: "${df.title || df.action}" (${df.type})`,
        `الأسباب: ${(unifiedDecision.why || []).join(' | ')}`,
        `الحالة السلوكية: ${db.state || 'starting'} — ${db.description || ''}`,
        `الطاقة: ${ds.energy || 50}% | التركيز: ${ds.focus || 50}% | الإجهاد: ${Math.round((ds.burnout || 0) * 100)}%`,
        `[تعليمات: أجب على سؤال المستخدم مباشرة أولاً. يمكنك الإشارة للمهمة ذات الأولوية إذا كان السؤال عن ماذا يعمل. لا تكرر نفس النصيحة. نوّع أسلوبك. إذا سأل عن شيء مختلف أجبه عنه.]`,
      ].join('\n');
      userMsgForAI += decisionContext;
    }

    const { reply, is_fallback } = await safeExecute(
      async () => {
        // Try ai.client first (Groq multi-model + Gemini fallback with cache)
        try {
          const response = await chatClient(systemPrompt, userMsgForAI, {
            temperature: mode === 'companion' ? 0.8 : mode === 'manager' ? 0.5 : 0.7,
            maxTokens  : 500,
          });
          return response;
        } catch (clientErr) {
          const errMsg = clientErr.message || '';
          logger.warn('[ORCHESTRATOR] ai.client failed:', errMsg);

          // If rate limited on ALL providers, use intelligent local fallback
          // (not the generic ai.service fallback which returns "شكراً لاستخدامك LifeFlow!")
          if (errMsg.includes('RATE_LIMIT_ALL') || errMsg.includes('ALL_PROVIDERS_FAILED')) {
            logger.info('[ORCHESTRATOR] Building intelligent local fallback for rate limit');
            // Use the user's original message + context to generate meaningful response
            const intelligentReply = buildIntelligentFallback(message, {
              intentCategory,
              mode,
              userName: userCtx?.name,
              tasks   : userCtx?.urgentTasks || [],
            });
            // Return as object to signal it's a soft fallback (contextual, not error)
            // We still return is_fallback=true so the frontend can optionally show a note
            throw Object.assign(new Error('INTELLIGENT_FALLBACK'), {
              intelligentReply,
            });
          }

          // For other errors, try ai.service as last resort
          logger.warn('[ORCHESTRATOR] Trying ai.service as last resort');
          const response = await chatFallback(systemPrompt, userMsgForAI, {
            temperature: mode === 'companion' ? 0.8 : mode === 'manager' ? 0.5 : 0.7,
            maxTokens  : 500,
          });
          return response;
        }
      },
      { userName: userCtx?.name, intentCategory }
    );

    // If safeExecute caught INTELLIGENT_FALLBACK error, reply will be the contextual message
    // We need to check if we have a better intelligent reply available
    let finalReply = reply;
    let finalIsFallback = is_fallback;

    // Check if the reply is a generic error message — if so, use Decision Engine data
    const genericPhrases = [
      'حصل مشكلة مؤقتة',
      'حاول تاني',
      'نعالج طلبات كثيرة',
      'استغرق الرد',
      'تعذّر معالجة',
    ];
    const isGenericReply = genericPhrases.some(phrase => reply?.includes(phrase));

    // Phase M: ALWAYS prefer Decision Engine data over generic fallbacks
    if ((isGenericReply || (is_fallback && reply === DEFAULT_FALLBACK)) && unifiedDecision?.currentFocus) {
      // Use Decision Engine to build a real, specific reply
      const userName = userCtx?.name || 'صديقي';
      finalReply = buildDecisionDrivenReply(unifiedDecision, userName, userId);
      finalIsFallback = false; // This is real data, not a fallback!
      logger.info('[ORCHESTRATOR] Replaced generic fallback with Decision Engine reply');
    } else if (isGenericReply || (is_fallback && reply === DEFAULT_FALLBACK)) {
      finalReply = buildIntelligentFallback(message, {
        intentCategory,
        mode,
        userName: userCtx?.name,
        tasks   : userCtx?.urgentTasks || [],
      });
      finalIsFallback = true;
      logger.info('[ORCHESTRATOR] Replaced generic error with intelligent fallback');
    }

    // ── STEP 10: Adaptive Suggestions ────────────────────────────────────────
    const suggestions = adaptiveBehavior.getAdaptiveSuggestions(userId, intentCategory);

    // ── STEP 11: Build Actions Array ──────────────────────────────────────────
    const actions = [];
    if (actionResult?.success && actionResult?.task) {
      actions.push({ type: 'task_created', data: actionResult.task });
    }
    if (actionResult?.success && actionResult?.count > 0 && !actionResult?.task) {
      actions.push({ type: actionResult.action || 'update', count: actionResult.count });
    }

    // ── STEP 12: Dispatch (for tracking, non-blocking) ────────────────────────
    if (actions.length > 0) {
      try {
        const dispatcher = getDispatcher();
        if (dispatcher) {
          const dispatched = dispatcher.dispatch({
            action        : actions[0].type,
            userId,
            risk          : decisionResult?.risk || 'low',
            policyLevel   : 'suggestive',
            confidence,
            acceptanceRate: learningProfile?.suggestion_accept_rate || 60,
            payload       : actions[0].data || {},
          });
          if (dispatched) {
            actions[0]._dispatch = { executor: dispatched.executor, auto: dispatched.auto_execute };
          }
        }
      } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }
    }

    // ── STEP 13: Store in Memory ──────────────────────────────────────────────
    // Phase Q: sanitize reply before storing and returning
    finalReply = sanitizeReply(finalReply);
    memory.addShortTerm(userId, 'user', message, { intent: intentCategory, mode });
    memory.addShortTerm(userId, 'assistant', finalReply, { mode, is_fallback: !!finalIsFallback, confidence });
    memory.incrementStat(userId, 'totalMessages');

    // ── STEP 14: Record Outcome in Learning Engine ────────────────────────────
    if (!finalIsFallback) {
      try {
        const learning = getLearning();
        if (learning) {
          learning.recordOutcome(userId, {
            action   : intentCategory,
            success  : true,
            energy   : snapshot?.energy?.score || 55,
            mood     : snapshot?.mood?.score   || 5,
          });
        }
      } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }
    }

    // ── STEP 15: Policy Adaptation Check ─────────────────────────────────────
    try {
      const totalMessages = memory.getStats(userId)?.totalMessages || 0;
      if (totalMessages > 0 && totalMessages % 10 === 0) {
        adaptiveBehavior.adaptPolicy(userId);
      }
    } catch (_e) { logger.debug(`[ORCHESTRATOR_SERVICE] Non-critical operation failed: ${_e.message}`); }

    const elapsed = Date.now() - startMs;

    logger.info('[ORCHESTRATOR] Full pipeline complete', {
      userId,
      mode,
      intentCategory,
      is_fallback       : !!finalIsFallback,
      used_intelligent  : finalIsFallback && reply !== finalReply,
      confidence,
      elapsed_ms        : elapsed,
      has_snapshot      : !!snapshot,
      has_learning      : !!learningProfile,
      has_prediction    : !!prediction,
    });

    return {
      reply       : finalReply,
      mode,
      actions,
      suggestions,
      is_fallback : !!finalIsFallback,
      intentCategory,
      confidence,
      explanation   : explanation || [],
      planningTip,
      snapshot      : snapshot ? {
        energy : snapshot.energy,
        mood   : snapshot.mood,
        signals: snapshot.signals?.slice(0, 3) || [],
      } : null,
      prediction    : prediction ? {
        task_completion_probability: prediction.task_completion_probability,
        burnout_risk               : prediction.burnout_risk,
        focus_score                : prediction.focus_score,
      } : null,
      // Phase M: Decision Engine data in response
      decisionData  : unifiedDecision ? {
        currentFocus:   unifiedDecision.currentFocus,
        why:            unifiedDecision.why,
        signalsUsed:    unifiedDecision.signalsUsed,
        behaviorState:  unifiedDecision.behaviorState,
        alternatives:   unifiedDecision.alternatives?.slice(0, 3),
        rules_applied:  unifiedDecision.rules_applied,
        next_steps:     unifiedDecision.currentFocus?.next_steps,
      } : null,
      pipeline_ms   : elapsed,
    };

  } catch (err) {
    logger.error('[ORCHESTRATOR] Critical error:', err.message);

    // Phase M: Even on critical error, try Decision Engine
    let emergencyReply = DEFAULT_FALLBACK;
    try {
      const unifiedSvc = getUnifiedDecision();
      if (unifiedSvc?.getUnifiedDecision) {
        const emergencyDecision = await unifiedSvc.getUnifiedDecision(userId, { timezone });
        if (emergencyDecision?.currentFocus) {
          emergencyReply = buildDecisionDrivenReply(emergencyDecision, 'صديقي', userId);
        }
      }
    } catch (_e) { /* truly last resort */ }

    return {
      reply      : emergencyReply,
      mode       : 'hybrid',
      actions    : [],
      suggestions: getSuggestions('default'),
      is_fallback: emergencyReply === DEFAULT_FALLBACK,
      confidence : emergencyReply === DEFAULT_FALLBACK ? 0 : 60,
      explanation: [],
      planningTip: null,
      snapshot   : null,
      prediction : null,
      error      : err.message,
    };
  }
}

// ─── Quick Companion Mode ─────────────────────────────────────────────────────
async function companionChat(userId, message, timezone, userCtx = null) {
  return orchestrate({
    userId,
    message,
    timezone,
    actionResult  : null,
    actionSummary : null,
    intentCategory: detectIntentCategory(message),
    userCtx,
  });
}

// ─── Intent Classifier ───────────────────────────────────────────────────────
function detectIntentCategory(message) {
  const lower = message.toLowerCase().trim();

  // Task help — "how do I do this?" type questions (check FIRST)
  const taskHelpPatterns = [
    'أذاكر إزاي', 'اذاكر ازاي', 'أعملها إزاي', 'اعملها ازاي',
    'أبدأ فيها إزاي', 'ابدأ فيها ازاي', 'أنفذها إزاي', 'انفذها ازاي',
    'ساعدني في', 'ساعدني فيها', 'أعمل إيه في', 'اعمل ايه في',
    'طريقة المذاكرة', 'كيف أذاكر', 'كيف اذاكر', 'نصيحة للمذاكرة',
    'إزاي أخلص', 'ازاي اخلص', 'how to', 'how do i',
    'أعملها ازاي', 'أعملها إزاي', 'اشتغل عليها ازاي',
    'إزاي أعمل', 'ازاي اعمل', 'help me with', 'how should i',
    'طريقة عمل', 'خطوات', 'نصيحة لل', 'tips for',
    'أذاكر المادة', 'اذاكر المادة', 'اشتغل على',
    'أخلصها إزاي', 'اخلصها ازاي', 'أنجزها إزاي',
  ];

  const taskPatterns = [
    'اضف','أضف','ضيف','ضف','عندي مهمة','لازم','محتاج','اعمل مهمة',
    'خلص','انتهيت','عملت','أجّل','أجل','أخّر','احذف','حذف','ألغِ',
    'مهمة','task','امتحان','اختبار','مذاكرة','جدول','خطة','نظم',
    'ذكّرني','سجّل','طاقتي',
  ];

  const advicePatterns = [
    'نصيحة','نصائح','اقتراح','مساعدة','ساعدني','كيف أتحسن','كيف أرفع',
    'تعبان','تعب','ضغط','توتر','مش قادر','زهقت',
  ];

  const questionPatterns = [
    'ما','ماذا','كيف','هل','متى','أين','من','ليه','لماذا','?','؟','شرح','اشرح',
  ];

  if (taskHelpPatterns.some(p => lower.includes(p))) return 'task_help';
  if (taskPatterns.some(p => lower.includes(p)))   return 'task_action';
  if (advicePatterns.some(p => lower.includes(p))) return 'advice';
  if (questionPatterns.some(p => lower.includes(p))) return 'question';
  return 'general';
}

module.exports = {
  orchestrate,
  companionChat,
  detectMode,
  detectIntentCategory,
  buildContextBlock,
};
