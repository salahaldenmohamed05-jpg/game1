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
  const { Task, Habit, Goal, MoodEntry, User } = getModels();
  const tz = timezone || 'Africa/Cairo';
  const todayStr = moment().tz(tz).format('YYYY-MM-DD');
  const dayStart = moment().tz(tz).startOf('day').toDate();
  const dayEnd   = moment().tz(tz).endOf('day').toDate();
  const m        = (message || '').toLowerCase();

  try {
    // ── Fetch real data ──────────────────────────────────────────────────────
    const [allTasks, habits, goals, user] = await Promise.all([
      Task.findAll({ where: { user_id: userId }, order: [['createdAt', 'DESC']] }),
      Habit.findAll({ where: { user_id: userId } }),
      Goal.findAll({ where: { user_id: userId } }),
      User.findByPk(userId, { attributes: ['name', 'email'] }),
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

    // Habit completion today (try to check via HabitLog or completed_today field)
    const completedHabits = habits.filter(h => h.completed_today === true);
    const pendingHabits   = habits.filter(h => !h.completed_today);

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
async function routeRequest(userId, message, intent, aiMode, timezone) {
  // ── action_request → commandEngine (always, regardless of AI) ────────────
  if (intent === 'action_request') {
    try {
      const commandEngine = require('./ai.command.engine');
      const result = await commandEngine.processCommand(userId, message, timezone, null);
      if (result && result.reply) {
        return normalize(result.reply, 'local', result.confidence || 90, 'command_engine', null, result.action_taken);
      }
    } catch (err) {
      logger.warn('[ORCHESTRATOR] commandEngine failed, falling back to data:', err.message);
    }
    // Fallback for action: data answer
    return answerFromData(userId, intent, message, timezone);
  }

  // ── data_question → LOCAL ONLY (brainState + DB, no AI needed) ───────────
  if (intent === 'data_question') {
    return answerFromData(userId, intent, message, timezone);
  }

  // ── If AI is not available for reasoning/emotional → fall back to data ────
  if (aiMode === 'data_only' || aiMode === 'offline') {
    const dataResp = await answerFromData(userId, intent, message, timezone);
    // Prepend honest disclosure
    return normalize(
      `واضح إن النظام الذكي مش متاح حالياً\nلكن أقدر أساعدك بناءً على بياناتك الحالية 👇\n\n${dataResp.text}`,
      'local',
      dataResp.confidence,
      'data_only_fallback',
      dataResp.dataSnapshot
    );
  }

  // ── reasoning_question → Gemini ───────────────────────────────────────────
  if (intent === 'reasoning_question') {
    try {
      const client = getAIClient();
      if (client) {
        const status = getAIStatus();
        const geminiOk = status?.gemini === true || status?.gemini?.available === true;
        if (geminiOk) {
          // Build context-aware prompt
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
    // Fallback to local data
    return answerFromData(userId, intent, message, timezone);
  }

  // ── emotional_support → Grok ──────────────────────────────────────────────
  if (intent === 'emotional_support') {
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
    // Fallback to empathetic data-based response
    return buildEmpatheticResponse(userId, message, timezone);
  }

  // ── casual_chat: if AI available use it, otherwise give useful data summary ─
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

  // Final fallback: always useful data summary
  return answerFromData(userId, 'casual_chat', message, timezone);
}

// ─── Build Empathetic Response (emotional_support fallback without AI) ─────────
async function buildEmpatheticResponse(userId, message, timezone) {
  try {
    const { Task } = getModels();
    const { User } = getModels();
    const user = await User.findByPk(userId, { attributes: ['name'] });
    const name = user?.name?.split(' ')[0] || 'صديقي';
    const pendingTasks = await Task.findAll({
      where: { user_id: userId, status: { [require('sequelize').Op.ne]: 'completed' } },
      limit: 3,
      order: [['priority', 'DESC']],
    });

    let text = `${name}، عادي تحس كده — إنت بتبذل مجهود كبير.\n\n`;
    text += `خد نفس عميق. الضغط مش بيحل بالإسراع — بيحل بخطوة واحدة صح.\n\n`;

    if (pendingTasks.length > 0) {
      text += `أسهل خطوة دلوقتي: "${pendingTasks[pendingTasks.length - 1].title}" — ابدأ بيها بس.\n`;
    } else {
      text += `مفيش مهام ضاغطة دلوقتي — هاتك دقيقتين راحة حقيقية. 💙\n`;
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
    const { Task, Habit, Goal, User } = getModels();
    const [tasks, habits, goals, user] = await Promise.all([
      Task.findAll({ where: { user_id: userId }, limit: 10, order: [['priority', 'DESC']] }),
      Habit.findAll({ where: { user_id: userId }, limit: 10 }),
      Goal.findAll({ where: { user_id: userId }, limit: 5 }),
      User.findByPk(userId, { attributes: ['name', 'email'] }),
    ]);

    const pending = tasks.filter(t => t.status !== 'completed');
    const overdue = pending.filter(t => t.due_date && new Date(t.due_date) < new Date());
    const todayStr = moment().tz(timezone).format('YYYY-MM-DD ddd');

    const system = `أنت مساعد LifeFlow الذكي. تحدث بالعربية المصرية.
لا تقل: "أنا هنا لمساعدتك" أو "يسعدني مساعدتك" — ابدأ مباشرة بالإجابة أو النصيحة.

سياق المستخدم (${user?.name || 'مستخدم'}):
- المهام المعلّقة: ${pending.length} (${overdue.length} متأخرة)
- العادات: ${habits.length} (${habits.filter(h => h.completed_today).length} مكتملة اليوم)
- الأهداف: ${goals.length}
- اليوم: ${todayStr}

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
