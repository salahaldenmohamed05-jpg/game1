/**
 * AI Orchestrator Service — Phase 13: Truth + Orchestration
 * ==========================================================
 * Core principle: The system is ALWAYS useful.
 * If AI is unavailable → serve real data from DB/brainState.
 * NEVER return fake intelligence, generic greetings, or unrelated replies.
 *
 * Architecture:
 *   User Message
 *     → detectIntent()           (classify what the user wants)
 *     → determineAiMode()        (full_ai | hybrid | data_only | offline)
 *     → routeRequest()           (local DB | Gemini | Grok | commandEngine)
 *     → normalizeResponse()      (unified format with source + confidence)
 *
 * Response contract:
 *   { text, source, confidence, reasoning, aiMode, dataSnapshot? }
 */

'use strict';

const logger  = require('../utils/logger');
const moment  = require('moment-timezone');

// ─── Model Loaders (lazy to avoid circular deps) ──────────────────────────────
const getModels = () => ({
  Task:      require('../models/task.model'),
  Habit:     require('../models/habit.model').Habit,
  HabitLog:  require('../models/habit.model').HabitLog || null,
  Goal:      require('../models/goal.model'),
  MoodEntry: require('../models/mood.model'),
  User:      require('../models/user.model'),
});

// ─── AI client loaders (optional) ─────────────────────────────────────────────
function getAIStatus() {
  try { return require('./ai/ai.client').getAIStatus(); } catch (_) { return { gemini: false, groq: false }; }
}
function getAIClient() {
  try { return require('./ai/ai.client'); } catch (_) { return null; }
}

// ─── STEP 1: Intent Detection ─────────────────────────────────────────────────
/**
 * Classify user message into one of five intents.
 * Order matters: check action patterns before data patterns.
 *
 * @param {string} message
 * @returns {'action_request'|'data_question'|'reasoning_question'|'emotional_support'|'casual_chat'}
 */
function detectIntent(message) {
  if (!message || typeof message !== 'string') return 'casual_chat';
  const m = message.toLowerCase().trim();

  // ── Action requests: create / update / delete / schedule ──────────────────
  const actionPatterns = [
    // Arabic
    'أضف', 'اضف', 'أنشئ', 'انشئ', 'سجل', 'احذف', 'امسح', 'عدّل', 'غيّر',
    'حدث', 'ابدأ مهمة', 'أنهي مهمة', 'اكتملت', 'خلصت', 'رتب', 'جدول',
    'أنجزت', 'انجزت', 'سجل مزاج', 'سجل عادة', 'أضف هدف', 'اضف مهمة',
    'كمّل', 'انهي', 'أرجئ', 'ارجأ', 'حذف', 'مسح',
    // English
    'add task', 'create task', 'delete', 'complete task', 'schedule', 'log mood',
    'mark done', 'remove task', 'update task',
  ];
  if (actionPatterns.some(p => m.includes(p))) return 'action_request';

  // ── Emotional support: feelings, stress, burnout ──────────────────────────
  const emotionalPatterns = [
    'تعبان', 'تعبت', 'تعب', 'أحس بتعب', 'حاسس بتعب',
    'مرهق', 'إرهاق', 'ضغط', 'ضاغط', 'توتر', 'متوتر', 'توتر',
    'حزين', 'زهقت', 'زهقان', 'مش قادر', 'خايف', 'قلقان', 'قلق',
    'مكتئب', 'اكتئاب', 'إحباط', 'محبط', 'فاشل', 'فشلت',
    'مش عارف أكمل', 'مش لاقي حل', 'مش كويس', 'مش تمام',
    'ضغطان', 'مضغوط', 'وحيد', 'خايب', 'يأس',
    'tired', 'stressed', 'sad', 'anxious', 'burned out', 'depressed', 'overwhelmed',
    'feeling down', 'not okay', 'struggling',
  ];
  if (emotionalPatterns.some(p => m.includes(p))) return 'emotional_support';

  // ── Data questions: what do I have? what is overdue? what did I do? ────────
  const dataPatterns = [
    // Today's tasks/goals
    'أهدافي اليوم', 'مهامي اليوم', 'إيه عندي', 'ايه عندي', 'عندي إيه',
    'مهامي', 'مهام اليوم', 'أهداف اليوم', 'شغلي النهاردة',
    // Goals standalone (عرضلي أهدافي / أهدافي / اعرض أهدافي / ارني أهدافي)
    'أهدافي', 'اهدافي', 'أهدافك', 'عرضلي أهدافي', 'ارني أهدافي', 'اعرض أهدافي',
    // Overdue
    'متأخر في إيه', 'متأخر في ايه', 'إيه المتأخر', 'ايه اللي متأخر',
    'المتأخر', 'متأخرة', 'overdue',
    // Done today
    'عملت إيه', 'عملت ايه', 'أنجزت إيه', 'اللي خلصته', 'اليوم عملت',
    'ملخص يومي', 'تقرير اليوم', 'ماذا أنجزت',
    // Habits
    'عاداتي', 'سجلت عاداتي', 'العادات اللي خلصتها',
    // What next / next action (data-driven, not reasoning)
    'أعمل إيه دلوقتي', 'اعمل ايه دلوقتي', 'أعمل إيه الآن',
    'الخطوة الجاية', 'المهمة الجاية', 'next task', 'what now',
    // Status / progress
    'وضعي', 'تقدمي', 'نسبتي', 'كم أنجزت', 'how am i doing',
    // English
    "what are my tasks", "my goals today", "what's overdue", "what did i do",
    "my progress", "summary",
  ];
  if (dataPatterns.some(p => m.includes(p))) return 'data_question';

  // ── Reasoning: analysis, advice, strategy, prediction ─────────────────────
  const reasoningPatterns = [
    'ليه', 'لماذا', 'كيف', 'إزاي', 'طريقة', 'نصيحة', 'اقتراح', 'اقترح',
    'خطة', 'خطط', 'استراتيجية', 'analyze', 'strategy', 'advice', 'suggest',
    'حلل', 'قيّم', 'فكر', 'رأيك', 'ما رأيك', 'هل يجب', 'افضل', 'الأفضل',
    'why', 'how to', 'what if', 'should i', 'which is better',
    'أولوية', 'priorities', 'تحسّن', 'تحسين', 'improve', 'better',
    'أزيد', 'أقلل', 'ابدأ', 'أكيف', 'أتعامل', 'أفعل لو',
    'ما الحل', 'كيف أتعامل', 'إيه الحل', 'ايه الحل',
    // Best time, optimal, when to start patterns
    'أفضل وقت', 'افضل وقت', 'وقت مناسب', 'أنسب وقت', 'متى أبدأ', 'متى ابدأ',
    'best time', 'when should', 'how can i', 'how do i', 'optimal',
    'أحسّن', 'احسن من', 'أزوّد', 'ازود', 'أقدر أحسّن',
  ];
  if (reasoningPatterns.some(p => m.includes(p))) return 'reasoning_question';

  return 'casual_chat';
}

// ─── STEP 2: Determine AI Mode ────────────────────────────────────────────────
/**
 * Determine which mode to operate in based on AI key availability.
 *
 * @returns {'full_ai'|'hybrid'|'data_only'|'offline'}
 */
function determineAiMode() {
  try {
    const status = getAIStatus();
    const geminiAvailable = status?.gemini === true || status?.gemini?.available === true;
    const groqAvailable   = status?.groq   === true || status?.groq?.available === true;

    if (geminiAvailable && groqAvailable) return 'full_ai';
    if (geminiAvailable || groqAvailable) return 'hybrid';
    return 'data_only';
  } catch (e) {
    return 'offline';
  }
}

// ─── STEP 3: Real Data Intelligence Layer ─────────────────────────────────────
/**
 * Core data engine: answers questions directly from DB without AI.
 * This is ALWAYS available — the guaranteed intelligence layer.
 *
 * @param {string} userId
 * @param {string} intent
 * @param {string} message
 * @param {string} timezone
 * @returns {{ text, source, confidence, reasoning, dataSnapshot }}
 */
async function answerFromData(userId, intent, message, timezone = 'Africa/Cairo') {
  const { Task, Habit, HabitLog, Goal, MoodEntry, User } = getModels();
  const tz = timezone || 'Africa/Cairo';
  const todayStr = moment().tz(tz).format('YYYY-MM-DD');
  const dayStart = moment().tz(tz).startOf('day').toDate();
  const dayEnd   = moment().tz(tz).endOf('day').toDate();
  const m        = (message || '').toLowerCase();

  try {
    // ── Fetch real data ──────────────────────────────────────────────────────
    const [allTasks, habits, goals, user, todayHabitLogs] = await Promise.all([
      Task.findAll({ where: { user_id: userId }, order: [['createdAt', 'DESC']] }),
      Habit.findAll({ where: { user_id: userId } }),
      Goal.findAll({ where: { user_id: userId } }),
      User.findByPk(userId, { attributes: ['name', 'email'] }),
      HabitLog
        ? HabitLog.findAll({ where: { user_id: userId, log_date: moment().tz(tz).format('YYYY-MM-DD'), completed: true }, attributes: ['habit_id'] })
        : Promise.resolve([]),
    ]);

    const userName = user?.name?.split(' ')[0] || 'صديقي';

    // Categorize tasks
    const pendingTasks    = allTasks.filter(t => t.status !== 'completed');
    const completedToday  = allTasks.filter(t =>
      t.status === 'completed' &&
      (t.updatedAt || t.updated_at) >= dayStart &&
      (t.updatedAt || t.updated_at) <= dayEnd
    );
    const overdueTasks    = allTasks.filter(t => {
      if (t.status === 'completed') return false;
      if (!t.due_date) return false;
      return new Date(t.due_date) < new Date();
    });
    const todayTasks      = allTasks.filter(t => {
      if (t.status === 'completed') return false;
      if (!t.due_date) return false;
      const due = new Date(t.due_date);
      return due >= dayStart && due <= dayEnd;
    });
    const highPriority    = pendingTasks.filter(t => t.priority === 'high');

    // Habit completion today — use HabitLog (completed_today is NOT a DB column)
    const completedHabitIdSet = new Set((todayHabitLogs || []).map(l => l.habit_id));
    const completedHabits = habits.filter(h => completedHabitIdSet.has(h.id));
    const pendingHabits   = habits.filter(h => !completedHabitIdSet.has(h.id));

    // Snapshot for context
    const dataSnapshot = {
      tasks: {
        total: allTasks.length,
        pending: pendingTasks.length,
        completedToday: completedToday.length,
        overdue: overdueTasks.length,
        today: todayTasks.length,
        highPriority: highPriority.length,
      },
      habits: {
        total: habits.length,
        completedToday: completedHabits.length,
        pending: pendingHabits.length,
      },
      goals: { total: goals.length },
    };

    // ── Answer based on intent ───────────────────────────────────────────────

    // OVERDUE TASKS
    if (
      m.includes('متأخر') || m.includes('overdue') ||
      m.includes('المتأخر') || m.includes('متأخرة')
    ) {
      if (overdueTasks.length === 0) {
        return normalize(
          `${userName}، مفيش مهام متأخرة دلوقتي — إنت على المسار الصح ✅`,
          'local', 100, 'no_overdue', dataSnapshot
        );
      }
      const list = overdueTasks
        .slice(0, 5)
        .map((t, i) => {
          const daysAgo = t.due_date
            ? Math.floor((Date.now() - new Date(t.due_date)) / (1000 * 60 * 60 * 24))
            : null;
          const delay = daysAgo !== null ? ` (متأخرة ${daysAgo} يوم)` : '';
          const priority = t.priority === 'high' ? ' ⚠️ عالية' : t.priority === 'medium' ? ' متوسطة' : '';
          return `${i + 1}. "${t.title}"${priority}${delay}`;
        })
        .join('\n');
      const more = overdueTasks.length > 5 ? `\n... و${overdueTasks.length - 5} مهام أخرى` : '';
      return normalize(
        `${userName}، عندك ${overdueTasks.length} مهمة متأخرة:\n\n${list}${more}\n\n→ ابدأ بالأهم وابعد عن الإرهاق الذهني.`,
        'local', 100, 'overdue_tasks', dataSnapshot
      );
    }

    // WHAT DID I DO TODAY
    if (
      m.includes('عملت إيه') || m.includes('عملت ايه') ||
      m.includes('أنجزت') || m.includes('خلصته') ||
      m.includes('what did i do') || m.includes('ماذا أنجزت')
    ) {
      if (completedToday.length === 0) {
        const suggestions = pendingTasks.length > 0
          ? `\n\nلسه عندك ${pendingTasks.length} مهمة — أبدأ بـ "${pendingTasks[0].title}"`
          : '';
        return normalize(
          `${userName}، لحد دلوقتي ما اكتملتش أي مهمة النهارده.${suggestions}`,
          'local', 100, 'completed_today_empty', dataSnapshot
        );
      }
      const list = completedToday
        .slice(0, 5)
        .map((t, i) => `${i + 1}. ✅ "${t.title}"`)
        .join('\n');
      return normalize(
        `${userName}، النهارده أنجزت ${completedToday.length} مهمة:\n\n${list}\n\nكمّل كده! 💪`,
        'local', 100, 'completed_today', dataSnapshot
      );
    }

    // TODAY'S TASKS / MY GOALS TODAY
    if (
      m.includes('أهدافي') || m.includes('مهامي') || m.includes('مهام اليوم') ||
      m.includes('شغلي') || m.includes('my tasks') || m.includes('my goals') ||
      m.includes('goals today') || m.includes('tasks today') ||
      m.includes('عندي إيه') || m.includes('ايه عندي') || m.includes('what are my')
    ) {
      if (allTasks.length === 0 && goals.length === 0) {
        return normalize(
          `${userName}، مش لاقي مهام أو أهداف مسجّلة ليك.\n\nاضغط "جديد" في شاشة المهام وابدأ بمهمة واحدة بس — وأنا هساعدك ترتّب اليوم كله.`,
          'local', 100, 'no_data', dataSnapshot
        );
      }

      let text = '';

      // Today's tasks
      if (todayTasks.length > 0) {
        const tList = todayTasks
          .slice(0, 5)
          .map((t, i) => {
            const p = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
            return `${i + 1}. ${p} "${t.title}"`;
          })
          .join('\n');
        text += `📅 مهام اليوم (${todayTasks.length}):\n${tList}\n`;
      } else if (pendingTasks.length > 0) {
        const tList = pendingTasks
          .slice(0, 5)
          .map((t, i) => {
            const p = t.priority === 'high' ? '🔴' : t.priority === 'medium' ? '🟡' : '🟢';
            return `${i + 1}. ${p} "${t.title}"`;
          })
          .join('\n');
        text += `📋 المهام المعلّقة (${pendingTasks.length}):\n${tList}\n`;
      }

      // Goals summary
      if (goals.length > 0) {
        const gList = goals
          .slice(0, 3)
          .map(g => `🎯 "${g.title}" — ${g.progress || 0}%`)
          .join('\n');
        text += `\n${gList}`;
      }

      // Overdue warning
      if (overdueTasks.length > 0) {
        text += `\n\n⚠️ تنبيه: عندك ${overdueTasks.length} مهمة متأخرة — ابدأ بيها.`;
      }

      return normalize(
        `${userName}،\n\n${text.trim()}`,
        'local', 100, 'tasks_and_goals', dataSnapshot
      );
    }

    // WHAT SHOULD I DO NOW (next action)
    if (
      m.includes('أعمل إيه دلوقتي') || m.includes('اعمل ايه') ||
      m.includes('أعمل إيه الآن') || m.includes('next task') ||
      m.includes('what now') || m.includes('ابدأ بإيه') ||
      m.includes('أبدأ بإيه') || m.includes('الأهم دلوقتي')
    ) {
      // Priority: overdue first, then high priority, then today's tasks
      const nextTask =
        overdueTasks.find(t => t.priority === 'high') ||
        overdueTasks[0] ||
        highPriority[0] ||
        todayTasks[0] ||
        pendingTasks[0];

      if (!nextTask) {
        return normalize(
          `${userName}، مفيش مهام معلّقة دلوقتي. إذا عندك حاجة محتاج تعملها — سجّلها وهنرتّبها سوا.`,
          'local', 100, 'no_tasks', dataSnapshot
        );
      }

      const isOverdue = overdueTasks.some(t => t.id === nextTask.id);
      const prefix = isOverdue ? '⚠️ متأخرة — ' : '';
      return normalize(
        `${userName}، الأهم دلوقتي:\n\n${prefix}"${nextTask.title}"\n${nextTask.description ? `→ ${nextTask.description}\n` : ''}الأولوية: ${priorityAr(nextTask.priority)}`,
        'local', 100, 'next_action', dataSnapshot
      );
    }

    // MY HABITS / PROGRESS
    if (
      m.includes('عاداتي') || m.includes('عادات') || m.includes('habits') ||
      m.includes('تقدمي') || m.includes('وضعي') || m.includes('progress') ||
      m.includes('نسبتي')
    ) {
      let text = `${userName}، تقدمك النهارده:\n\n`;
      text += `📋 المهام: ${completedToday.length}/${allTasks.length} مكتملة`;
      if (overdueTasks.length > 0) text += ` ⚠️ (${overdueTasks.length} متأخرة)`;
      text += `\n🎯 العادات: ${completedHabits.length}/${habits.length} مكتملة`;
      if (goals.length > 0) {
        const avgProgress = goals.reduce((sum, g) => sum + (g.progress || 0), 0) / goals.length;
        text += `\n🏆 الأهداف: ${goals.length} هدف — متوسط التقدم ${Math.round(avgProgress)}%`;
      }
      return normalize(text, 'local', 100, 'progress_summary', dataSnapshot);
    }

    // CASUAL / GENERAL (data_only mode — still useful)
    // Provide a useful data-first response instead of a greeting
    if (pendingTasks.length > 0) {
      const topTask = overdueTasks[0] || highPriority[0] || todayTasks[0] || pendingTasks[0];
      const habitsLeft = pendingHabits.length;
      let text = `${userName}، إليك ملخص سريع:\n\n`;
      text += `📋 ${pendingTasks.length} مهمة معلّقة`;
      if (overdueTasks.length > 0) text += ` (${overdueTasks.length} متأخرة ⚠️)`;
      text += `\n🎯 ${completedHabits.length}/${habits.length} عادة مكتملة النهاردة`;
      text += `\n\n→ الأهم دلوقتي: "${topTask?.title || 'لا يوجد'}"`;
      if (habitsLeft > 0) text += `\n→ باقي ${habitsLeft} عادة`;
      return normalize(text, 'local', 90, 'general_summary', dataSnapshot);
    }

    // Truly empty system
    return normalize(
      `${userName}، مش لاقي مهام أو عادات مسجّلة.\n\nابدأ بمهمة واحدة — اضغط "جديد" في شاشة المهام وقولي إيه اللي محتاج تنجزه.`,
      'local', 100, 'empty_system', dataSnapshot
    );

  } catch (err) {
    logger.error('[ORCHESTRATOR] answerFromData error:', err.message);
    return normalize(
      'حصل خطأ في تحميل البيانات. جرب تاني بعد ثواني.',
      'local', 0, 'db_error', {}
    );
  }
}

// ─── STEP 4: Route Request ────────────────────────────────────────────────────
/**
 * Main routing function — STRICT rules per intent + aiMode.
 *
 * @param {string} userId
 * @param {string} message
 * @param {string} intent
 * @param {string} aiMode
 * @param {string} timezone
 * @returns {Promise<NormalizedResponse>}
 */
// Markers indicating the commandEngine returned a generic/unhelpful response
const COMMAND_ENGINE_GENERIC_MARKERS = [
  'قولي إيش المهمة',
  'قولّي إيش المهمة',
  'حدّد المهمة بالضبط',
  'أنا جاهز! قولي اسم المهمة',
  'عذراً، حدث خطأ في المعالجة',
];

function isCommandEngineGeneric(reply) {
  if (!reply) return true;
  return COMMAND_ENGINE_GENERIC_MARKERS.some(m => reply.includes(m));
}

async function routeRequest(userId, message, intent, aiMode, timezone) {
  // ── action_request → commandEngine (always, regardless of AI) ────────────
  if (intent === 'action_request') {
    try {
      const commandEngine = require('./ai.command.engine');
      const result = await commandEngine.processCommand(userId, message, timezone, null);
      if (result && result.reply && !isCommandEngineGeneric(result.reply)) {
        return normalize(result.reply, 'local', result.confidence || 90, 'command_engine', null, result.action_taken);
      }
    } catch (err) {
      logger.warn('[ORCHESTRATOR] commandEngine failed, trying inline complete:', err.message);
    }
    // Inline complete/add when commandEngine fails or returns generic response
    return handleActionInline(userId, message, timezone);
  }

  // ── data_question → LOCAL ONLY (brainState + DB, no AI needed) ───────────
  if (intent === 'data_question') {
    return answerFromData(userId, intent, message, timezone);
  }

  // ── emotional_support: always use empathetic response first (AI if available, else local) ──
  if (intent === 'emotional_support') {
    // Try Grok first (when available)
    if (aiMode === 'full_ai' || aiMode === 'hybrid') {
      try {
        const client = getAIClient();
        if (client) {
          const status = getAIStatus();
          const groqOk = status?.groq === true || status?.groq?.available === true;
          if (groqOk) {
            const contextPrompt = await buildContextPrompt(userId, message, timezone);
            const aiResp = await client.chat(contextPrompt.system, contextPrompt.user, {
              provider: 'groq',
              temperature: 0.8,
              maxTokens: 400,
            });
            if (aiResp && aiResp.reply && !isGenericReply(aiResp.reply)) {
              return normalize(aiResp.reply, 'grok', 80, 'grok_emotional', null);
            }
          }
        }
      } catch (err) {
        logger.warn('[ORCHESTRATOR] Grok emotional failed:', err.message);
      }
    }
    // Always fallback to empathetic local response (NOT the data summary)
    return buildEmpatheticResponse(userId, message, timezone);
  }

  // ── reasoning_question → Gemini (when available) ─────────────────────────
  if (intent === 'reasoning_question') {
    if (aiMode === 'full_ai' || aiMode === 'hybrid') {
      try {
        const client = getAIClient();
        if (client) {
          const status = getAIStatus();
          const geminiOk = status?.gemini === true || status?.gemini?.available === true;
          if (geminiOk) {
            const contextPrompt = await buildContextPrompt(userId, message, timezone);
            const aiResp = await client.chat(contextPrompt.system, contextPrompt.user, {
              provider: 'gemini',
              temperature: 0.6,
              maxTokens: 600,
            });
            if (aiResp && aiResp.reply && !isGenericReply(aiResp.reply)) {
              return normalize(aiResp.reply, 'gemini', 85, 'gemini_reasoning', null);
            }
          }
        }
      } catch (err) {
        logger.warn('[ORCHESTRATOR] Gemini reasoning failed:', err.message);
      }
    }
    // AI not available → honest disclosure + local data-based advice
    return buildLocalReasoningResponse(userId, message, timezone);
  }

  // ── casual_chat (greetings, small talk) ──────────────────────────────────
  // Try AI if available
  if (aiMode === 'full_ai' || aiMode === 'hybrid') {
    try {
      const client = getAIClient();
      if (client) {
        const contextPrompt = await buildContextPrompt(userId, message, timezone);
        const aiResp = await client.chat(contextPrompt.system, contextPrompt.user, {
          temperature: 0.7,
          maxTokens: 400,
        });
        if (aiResp && aiResp.reply && !isGenericReply(aiResp.reply)) {
          return normalize(aiResp.reply, aiResp.provider || 'gemini', 75, 'ai_chat', null);
        }
      }
    } catch (err) {
      logger.warn('[ORCHESTRATOR] casual AI chat failed:', err.message);
    }
  }

  // casual_chat with no AI → warm greeting + data summary
  return buildCasualResponse(userId, message, timezone);
}

// ─── Handle Action Inline (when commandEngine fails or is too generic) ────────
async function handleActionInline(userId, message, timezone) {
  const { Task, User } = getModels();
  const Op = require('sequelize').Op;
  try {
    const user = await User.findByPk(userId, { attributes: ['name'] });
    const name = user?.name?.split(' ')[0] || 'صديقي';
    const m = message.toLowerCase();

    // ── Complete/Done patterns ────────────────────────────────────────────────
    const completePatterns = ['اكتملت', 'أنجزت', 'انجزت', 'خلصت', 'خلصت مهمة', 'تمت', 'أتممت', 'كملت'];
    const isComplete = completePatterns.some(p => m.includes(p));

    if (isComplete) {
      // Extract task name after the keyword
      let taskName = message
        .replace(/اكتملت|أنجزت|انجزت|خلصت|تمت|أتممت|كملت/g, '')
        .replace(/مهمة|مهام|task/gi, '')
        .replace(/:/g, '')
        .trim();

      if (taskName.length > 1) {
        // Find matching task by title similarity
        const tasks = await Task.findAll({
          where: { user_id: userId, status: { [Op.ne]: 'completed' } },
        });
        // Arabic-aware stem: strip common prefixes/suffixes
        const stemAr = (s) => s
          .replace(/^(ال|وال|بال|لل|كال)/g, '')
          .replace(/(ات|ين|ون|ة|ي|ها|ه)$/g, '');
        const taskNameLower = taskName.toLowerCase();
        const taskNameStem  = stemAr(taskNameLower);

        const match = tasks.find(t => {
          if (!t.title) return false;
          const tl = t.title.toLowerCase();
          // Exact / substring check
          if (tl.includes(taskNameLower) || taskNameLower.includes(tl)) return true;
          // Word-level stem check (handles broken Arabic plurals)
          return tl.split(/\s+/).some(w => {
            const ws = stemAr(w);
            if (ws.length < 3 || taskNameStem.length < 3) return false;
            return ws.includes(taskNameStem) || taskNameStem.includes(ws) ||
              (ws.substring(0,3) === taskNameStem.substring(0,3) && ws.length >= 4 && taskNameStem.length >= 4);
          });
        });
        if (match) {
          await match.update({ status: 'completed' });
          return normalize(
            `✅ "${match.title}" — تم تسجيلها كمكتملة! 🎉\n\nكمّل كده يا ${name}، إنت بتعمل حاجات كويسة.`,
            'local', 100, 'task_completed_inline', {}
          );
        }
        const taskList = tasks.slice(0,5).map(t => `"${t.title}"`).join('، ');
        return normalize(
          `${name}، مش لاقيت مهمة باسم "${taskName}".\nجرب: "خلصت مهمة [الاسم الكامل]"\n\nمهامك الحالية: ${taskList || 'لا توجد مهام معلّقة'}`,
          'local', 70, 'task_not_found', {}
        );
      }
    }

    // ── Add task patterns ─────────────────────────────────────────────────────
    const addPatterns = ['أضف مهمة', 'اضف مهمة', 'أنشئ مهمة', 'انشئ مهمة', 'مهمة جديدة', 'add task'];
    const isAdd = addPatterns.some(p => m.includes(p));
    if (isAdd) {
      const titleRaw = message
        .replace(/أضف مهمة|اضف مهمة|أنشئ مهمة|انشئ مهمة|مهمة جديدة|add task/gi, '')
        .replace(/:/g, '')
        .trim();
      if (titleRaw.length > 0) {
        const newTask = await Task.create({
          user_id: userId,
          title: titleRaw,
          status: 'pending',
          priority: 'medium',
        });
        return normalize(
          `✅ تمت إضافة المهمة: "${newTask.title}"\n\nيلا ${name}، إنت عارف تبدأ متى. 💪`,
          'local', 100, 'task_added_inline', {}
        );
      }
    }

    // Generic action prompt
    return normalize(
      `${name}، قولي المهمة اللي عايز تضيفها أو تخليها مكتملة.\nمثال: "خلصت مهمة مراجعة الكود" أو "أضف مهمة: التقرير الأسبوعي"`,
      'local', 70, 'action_clarification', {}
    );
  } catch (e) {
    logger.error('[ORCHESTRATOR] handleActionInline error:', e.message);
    return normalize(
      'مش قدرت أنفّذ الإجراء دلوقتي. جرب من شاشة المهام مباشرة.',
      'local', 0, 'action_error', {}
    );
  }
}

// ─── Build Local Reasoning Response (reasoning fallback without AI) ───────────
async function buildLocalReasoningResponse(userId, message, timezone) {
  const { Task, Habit, HabitLog, Goal, User } = getModels();
  const Op = require('sequelize').Op;
  const safeTimezone = timezone || 'Africa/Cairo';
  try {
    const user = await User.findByPk(userId, { attributes: ['name'] });
    const name = user?.name?.split(' ')[0] || 'صديقي';
    const todayStrLocal = moment().tz(safeTimezone).format('YYYY-MM-DD');
    const [tasks, habits, goals, habitLogsToday] = await Promise.all([
      Task.findAll({ where: { user_id: userId, status: { [Op.ne]: 'completed' } }, limit: 5, order: [['priority','DESC']] }),
      Habit.findAll({ where: { user_id: userId }, limit: 5 }),
      Goal.findAll({ where: { user_id: userId }, limit: 3 }),
      HabitLog
        ? HabitLog.findAll({ where: { user_id: userId, log_date: todayStrLocal, completed: true }, attributes: ['habit_id'] })
        : Promise.resolve([]),
    ]);
    const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date());
    const completedHabitIds = new Set((habitLogsToday || []).map(l => l.habit_id));

    let text = `واضح إن النظام الذكي مش متاح حالياً — لكن بناءً على بياناتك:\n\n`;

    if (overdue.length > 0) {
      text += `⚠️ الأهم دلوقتي: إنهاء "${overdue[0].title}" اللي بتتأخر.\n`;
    } else if (tasks.length > 0) {
      text += `🎯 ركّز على: "${tasks[0].title}" — ده أعلى أولوية.\n`;
    }

    const incompleteHabits = habits.filter(h => !completedHabitIds.has(h.id));
    if (incompleteHabits.length > 0) {
      text += `📌 عندك ${incompleteHabits.length} عادة لسه ما سجّلتهاش النهارده.\n`;
    }

    if (goals.length > 0) {
      const avgProgress = Math.round(goals.reduce((s, g) => s + (g.progress || 0), 0) / goals.length);
      text += `🏆 أهدافك: ${goals.length} هدف — متوسط التقدم ${avgProgress}%.\n`;
    }

    text += `\nلما تتاح مفاتيح الذكاء الاصطناعي، هيقدر يعطيك تحليل أعمق. 💡`;
    return normalize(text, 'local', 80, 'local_reasoning', {});
  } catch (e) {
    return normalize(
      'واضح إن النظام الذكي مش متاح حالياً.\nجرب تسأل عن مهامك أو عاداتك وهرد من البيانات الحقيقية.',
      'local', 60, 'reasoning_error', {}
    );
  }
}

// ─── Build Casual Response (greetings & small talk without AI) ────────────────
async function buildCasualResponse(userId, message, timezone) {
  const { Task, Habit, HabitLog, User } = getModels();
  const Op = require('sequelize').Op;
  const safeTimezone = timezone || 'Africa/Cairo';
  try {
    const user = await User.findByPk(userId, { attributes: ['name'] });
    const name = user?.name?.split(' ')[0] || 'صديقي';
    const todayStrCasual = moment().tz(safeTimezone).format('YYYY-MM-DD');

    const [pending, habits, todayLogsC] = await Promise.all([
      Task.count({ where: { user_id: userId, status: { [Op.ne]: 'completed' } } }),
      Habit.findAll({ where: { user_id: userId }, attributes: ['id', 'name', 'name_ar'], limit: 20 }),
      HabitLog
        ? HabitLog.findAll({ where: { user_id: userId, log_date: todayStrCasual, completed: true }, attributes: ['habit_id'] })
        : Promise.resolve([]),
    ]);

    const completedHabitIdsC = new Set((todayLogsC || []).map(l => l.habit_id));
    const completedHabits = habits.filter(h => completedHabitIdsC.has(h.id)).length;
    const pendingHabits   = habits.length - completedHabits;

    // Warm greeting with quick useful snapshot
    let greeting = '';
    const hour = moment().tz(safeTimezone).hour();
    if (hour < 12)       greeting = `صباح الخير يا ${name}! ☀️`;
    else if (hour < 17)  greeting = `أهلاً يا ${name}! 👋`;
    else if (hour < 21)  greeting = `مساء الخير يا ${name}! 🌆`;
    else                 greeting = `أهلاً يا ${name}! 🌙`;

    let text = `${greeting}\n\n`;
    if (pending === 0 && pendingHabits === 0 && habits.length > 0) {
      text += `ما شاء الله — كل حاجة تمام النهارده! ما تستاهل تاخد راحة. 🎉`;
    } else {
      text += `📋 عندك ${pending} مهمة معلّقة`;
      text += pendingHabits > 0 ? ` و${pendingHabits} عادة لسه.\n` : '.\n';
      text += `\nقولّي: "أهدافي اليوم" أو "أعمل إيه دلوقتي" — وهفيدك من بياناتك الحقيقية.`;
    }
    return normalize(text, 'local', 90, 'casual_greeting', {});
  } catch (e) {
    logger.warn('[ORCHESTRATOR] buildCasualResponse error:', e.message);
    // Minimal fallback — still uses user name if possible
    try {
      const { User: U2 } = getModels();
      const user2 = await U2.findByPk(userId, { attributes: ['name'] });
      const name2 = user2?.name?.split(' ')[0] || 'صديقي';
      const hour2 = moment().tz(safeTimezone).hour();
      const g2 = hour2 < 12 ? `صباح الخير يا ${name2}! ☀️` : hour2 < 17 ? `أهلاً يا ${name2}! 👋` : hour2 < 21 ? `مساء الخير يا ${name2}! 🌆` : `أهلاً يا ${name2}! 🌙`;
      return normalize(`${g2}\n\nقولّي إيه اللي تحتاجه — مهام، عادات، تقرير اليوم، أو نصيحة.`, 'local', 80, 'casual_greeting_simple', {});
    } catch (_) {
      return normalize(
        'أهلاً! قولّي إيه اللي تحتاجه — مهام، عادات، تقرير اليوم، أو نصيحة.',
        'local', 80, 'casual_static', {}
      );
    }
  }
}

// ─── Build Empathetic Response (emotional_support fallback without AI) ─────────
async function buildEmpatheticResponse(userId, message, timezone) {
  const Op = require('sequelize').Op;
  try {
    const { Task, User } = getModels();
    const user = await User.findByPk(userId, { attributes: ['name'] });
    const name = user?.name?.split(' ')[0] || 'صديقي';

    // Analyse the emotion type from message
    const m = message.toLowerCase();
    const isTired    = m.includes('تعب') || m.includes('مرهق') || m.includes('إرهاق');
    const isStressed = m.includes('ضغط') || m.includes('توتر') || m.includes('مضغوط');
    const isSad      = m.includes('حزين') || m.includes('زهقت') || m.includes('مكتئب');
    const isCantCont = m.includes('مش قادر') || m.includes('مش عارف') || m.includes('يأس');

    // Fetch the lightest pending task as an actionable suggestion
    const pendingTasks = await Task.findAll({
      where: { user_id: userId, status: { [Op.ne]: 'completed' } },
      limit: 5,
      order: [['priority', 'ASC']], // lowest priority = easiest to start
    });
    const easiest = pendingTasks.length > 0 ? pendingTasks[pendingTasks.length - 1] : null;
    const overdue  = pendingTasks.filter(t => t.due_date && new Date(t.due_date) < new Date());

    // Build empathetic, personalised reply
    let text = '';

    if (isTired) {
      text += `${name}، طبيعي تحس بتعب — ده مش ضعف، ده علامة إنك شتغلت.\n\n`;
      text += `💡 الجسم لما يتعب بيطلب راحة — خد 10 دقايق بعيد عن الشاشة.\n`;
    } else if (isStressed) {
      text += `${name}، الضغط ده حقيقي ومفهوم.\n\n`;
      text += `💡 الضغط مش بيخف بالتفكير فيه — بيخف بخطوة واحدة صغيرة.\n`;
    } else if (isSad) {
      text += `${name}، إنت مش لازم تكون كويس طول الوقت.\n\n`;
      text += `💙 أحياناً الشعور ده بيجي وبيروح. إنت مش وحدك.\n`;
    } else if (isCantCont) {
      text += `${name}، اللي بتحس بيه ده صعب — وإنت مش ضعيف عشان حسيت بيه.\n\n`;
      text += `💪 أول خطوة دايماً هي الأصعب. ابدأ بأسهل حاجة ممكنة.\n`;
    } else {
      text += `${name}، عادي تحس كده — إنت بتبذل مجهود كبير.\n\n`;
      text += `خد نفس عميق. الضغط مش بيحل بالإسراع — بيحل بخطوة واحدة صح.\n`;
    }

    // Add context-aware actionable tip
    if (overdue.length > 0) {
      text += `\n⚠️ عندك ${overdue.length} مهمة متأخرة — لكن مش لازم تحلها كلها دلوقتي. ابدأ بواحدة بس.`;
    } else if (easiest) {
      text += `\n→ لو حاسس إنك عايز تعمل حاجة: "${easiest.title}" — ده أسهل حاجة دلوقتي.`;
    } else {
      text += `\nمفيش مهام ضاغطة دلوقتي — ده فرصة تاخد راحة حقيقية. 💙`;
    }

    return normalize(text, 'local', 85, 'empathetic_local', {});
  } catch (e) {
    return normalize(
      'عادي تتعب — ده مش ضعف. اشرب مية، خد راحة قصيرة، وابدأ بخطوة واحدة. 💙',
      'local', 80, 'empathetic_static', {}
    );
  }
}

// ─── Build Context Prompt for AI calls ────────────────────────────────────────
async function buildContextPrompt(userId, message, timezone) {
  try {
    const { Task, Habit, HabitLog, Goal, User } = getModels();
    const safeTimezone = timezone || 'Africa/Cairo';
    const todayStrCtx = moment().tz(safeTimezone).format('YYYY-MM-DD');
    const [tasks, habits, goals, user, habitLogsTodayCtx] = await Promise.all([
      Task.findAll({ where: { user_id: userId }, limit: 10, order: [['priority', 'DESC']] }),
      Habit.findAll({ where: { user_id: userId }, limit: 10 }),
      Goal.findAll({ where: { user_id: userId }, limit: 5 }),
      User.findByPk(userId, { attributes: ['name', 'email'] }),
      HabitLog
        ? HabitLog.findAll({ where: { user_id: userId, log_date: todayStrCtx, completed: true }, attributes: ['habit_id'] })
        : Promise.resolve([]),
    ]);

    const pending = tasks.filter(t => t.status !== 'completed');
    const overdue = pending.filter(t => t.due_date && new Date(t.due_date) < new Date());
    const completedHabitIdsCtx = new Set((habitLogsTodayCtx || []).map(l => l.habit_id));
    const completedHabitsCtxCount = habits.filter(h => completedHabitIdsCtx.has(h.id)).length;
    const todayStrFormatted = moment().tz(safeTimezone).format('YYYY-MM-DD ddd');

    const system = `أنت مساعد LifeFlow الذكي. تحدث بالعربية المصرية.
لا تقل: "أنا هنا لمساعدتك" أو "يسعدني مساعدتك" — ابدأ مباشرة بالإجابة أو النصيحة.

سياق المستخدم (${user?.name || 'مستخدم'}):
- المهام المعلّقة: ${pending.length} (${overdue.length} متأخرة)
- العادات: ${habits.length} (${completedHabitsCtxCount} مكتملة اليوم)
- الأهداف: ${goals.length}
- اليوم: ${todayStrFormatted}

أهم مهمة: "${pending[0]?.title || 'لا يوجد'}"`;

    return { system, user: message };
  } catch (e) {
    return {
      system: 'أنت مساعد LifeFlow. أجب بالعربية المصرية مباشرة وبدون مقدمات.',
      user: message,
    };
  }
}

// ─── MAIN ENTRY POINT ─────────────────────────────────────────────────────────
/**
 * processMessage — single entry point for ALL assistant interactions.
 * Replaces the fake-AI orchestrator.companionChat() for all chat calls.
 *
 * @param {string} userId
 * @param {string} message
 * @param {string} timezone
 * @returns {Promise<NormalizedResponse>}
 */
async function processMessage(userId, message, timezone = 'Africa/Cairo') {
  const startMs = Date.now();

  // Guard: empty message
  if (!message || !message.trim()) {
    const { Task, User } = getModels();
    try {
      const user = await User.findByPk(userId, { attributes: ['name'] });
      const name = user?.name?.split(' ')[0] || 'صديقي';
      const pending = await Task.count({ where: { user_id: userId, status: { [require('sequelize').Op.ne]: 'completed' } } });
      return normalize(
        `${name}، إزيك؟ عندك ${pending} مهمة معلّقة.\nقولّي إيه اللي تحتاجه — مهام، عادات، تقرير اليوم، أو نصيحة.`,
        'local', 100, 'empty_message', {}
      );
    } catch (_) {
      return normalize('قولّي إيه اللي تحتاجه.', 'local', 100, 'empty_message', {});
    }
  }

  // Determine mode and intent
  const aiMode = determineAiMode();
  const intent = detectIntent(message);

  logger.info(`[AI-ORCHESTRATOR] userId=${userId} intent=${intent} aiMode=${aiMode} msg="${message.substring(0, 60)}"`);

  // Route request
  const result = await routeRequest(userId, message, intent, aiMode, timezone);

  logger.info(`[AI-ORCHESTRATOR] done in ${Date.now() - startMs}ms source=${result.source} confidence=${result.confidence}`);

  return {
    ...result,
    aiMode,
    intent,
    pipeline_ms: Date.now() - startMs,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function normalize(text, source, confidence, reasoning, dataSnapshot = null, actionTaken = null) {
  return {
    text:         (text && typeof text === 'string') ? text.trim() : 'لا توجد بيانات متاحة.',
    source:       source || 'local',
    confidence:   typeof confidence === 'number' ? confidence : 80,
    reasoning:    reasoning || 'direct',
    dataSnapshot: dataSnapshot || undefined,
    actionTaken:  actionTaken || undefined,
  };
}

function priorityAr(p) {
  if (p === 'high') return 'عالية 🔴';
  if (p === 'medium') return 'متوسطة 🟡';
  return 'منخفضة 🟢';
}

const GENERIC_REPLY_MARKERS = [
  'أهلاً! قولّي',
  'أهلا! قولي',
  'مرحباً! كيف يمكنني',
  'شكراً لاستخدامك',
  'يسعدني مساعدتك',
  'أنا هنا لمساعدتك',
  'hello', // raw English fallback
  'Hi there',
];

function isGenericReply(text) {
  if (!text) return true;
  return GENERIC_REPLY_MARKERS.some(m => text.includes(m));
}

// ─── Status export (for brain route and UI display) ───────────────────────────
function getOrchestratorStatus() {
  const aiMode = determineAiMode();
  const status = (() => { try { return getAIStatus(); } catch (_) { return {}; } })();
  return {
    aiMode,
    gemini: status?.gemini === true || status?.gemini?.available === true,
    groq:   status?.groq   === true || status?.groq?.available === true,
    local:  true, // always available
    capabilities: {
      data_questions:     true,
      action_requests:    true,
      emotional_support:  aiMode !== 'offline' && aiMode !== 'data_only',
      reasoning:          aiMode !== 'offline' && aiMode !== 'data_only',
      full_ai:            aiMode === 'full_ai',
    },
  };
}

module.exports = {
  processMessage,
  detectIntent,
  determineAiMode,
  answerFromData,
  routeRequest,
  getOrchestratorStatus,
  normalize,
};
