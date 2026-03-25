/**
 * Next Best Action Service — Phase 16
 * =====================================
 * Determines the single best action the user should take RIGHT NOW.
 *
 * Logic:
 *  1. Get user's current energy/time context
 *  2. Use ML predictions (completion probability, burnout risk)
 *  3. Use schedule (what's due next)
 *  4. Return ONE actionable recommendation with explanation
 *
 * Output:
 *  {
 *    action: "start_task" | "take_break" | "log_mood" | "review_plan" | "check_habit",
 *    task_id?,
 *    title,
 *    message,        // Arabic human message
 *    reason: [],     // why this action
 *    confidence,     // 0-100
 *    energy_match,   // how well current energy matches the task
 *    urgency,        // low | medium | high | critical
 *    explanation,    // AI explanation array
 *    suggestions,    // follow-up suggestions
 *    ml_driven,      // boolean — was this ML-powered
 *  }
 */

'use strict';

const logger = require('../utils/logger');

// ─── Lazy loaders ─────────────────────────────────────────────────────────────
function getLearning()   { try { return require('./learning.engine.service');  } catch (_) { return null; } }
function getScheduler()  { try { return require('./scheduling.engine.service'); } catch (_) { return null; } }
function getModels()     { try { return require('../config/database').sequelize.models; } catch (_) { return {}; } }

// ─── Date normalization helper ─────────────────────────────────────────────────
/**
 * Normalize any date value to 'YYYY-MM-DD' string for comparison
 * Handles SQLite DATETIME strings like '2026-03-23 00:00:00.000 +00:00'
 */
function normDate(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.split('T')[0].split(' ')[0];
  if (val instanceof Date)     return val.toISOString().split('T')[0];
  return String(val).split('T')[0].split(' ')[0];
}

// ─── Energy level helpers ─────────────────────────────────────────────────────
function getCurrentEnergyLevel(user, mlCtx) {
  const hour = new Date().getHours();
  const bestHour = mlCtx?.bestFocusHour ?? 10;
  const dist = Math.abs(hour - bestHour);

  if (dist <= 1) return { level: 'high',   score: 90, label: 'طاقة عالية ⚡' };
  if (dist <= 2) return { level: 'medium', score: 70, label: 'طاقة متوسطة 💪' };
  if (dist <= 4) return { level: 'medium', score: 55, label: 'طاقة معتدلة 🙂' };
  return           { level: 'low',    score: 35, label: 'طاقة منخفضة 😴' };
}

function matchEnergyToTask(taskPriority, energyLevel) {
  if (energyLevel === 'high')   return taskPriority === 'urgent' || taskPriority === 'high';
  if (energyLevel === 'medium') return taskPriority === 'medium' || taskPriority === 'high';
  return taskPriority === 'low';
}

// ─── Build suggestions for follow-up actions ──────────────────────────────────
function buildSuggestions(action, task) {
  const base = ['كيف طاقتي؟', 'وضعي اليوم', 'خطتي الأسبوعية'];
  if (action === 'start_task' && task) {
    return [`ابدأ "${task.title || 'المهمة'}"`, 'قسّم المهمة لخطوات أصغر', 'أجّل المهمة', ...base].slice(0, 4);
  }
  if (action === 'take_break') return ['متى تنتهي الاستراحة؟', 'تمارين سريعة', 'مهام بعد الاستراحة'];
  if (action === 'log_mood')   return ['سجّل مزاجي', 'نصيحة لرفع الطاقة', 'مهام خفيفة الآن'];
  return base;
}

// ─── Main: Get Next Best Action ────────────────────────────────────────────────
/**
 * @param {string} userId
 * @param {object} options
 * @param {string} options.timezone
 * @param {number} [options.currentEnergy]  - user-reported energy 0-100
 * @param {number} [options.currentMood]    - user-reported mood 1-10
 * @returns {Promise<object>}
 */
async function getNextBestAction(userId, options = {}) {
  const { timezone = 'Africa/Cairo', currentEnergy, currentMood } = options;

  try {
    const models   = getModels();
    const learning = getLearning();
    const scheduler = getScheduler();
    const { Task, Habit } = models;

    const now      = new Date();
    const hour     = now.getHours();
    const todayStr = now.toISOString().split('T')[0];   // 'YYYY-MM-DD'
    const { Op }   = require('sequelize');

    // ── Step 1: ML context ──────────────────────────────────────────────────
    let mlCtx = { bestFocusHour: 10, burnoutRisk: 0, completionBoost: 0 };
    if (scheduler && typeof scheduler.getMLContext === 'function') {
      mlCtx = scheduler.getMLContext(userId) || mlCtx;
    } else if (learning) {
      try {
        const profile = learning.getUserLearningProfile(userId);
        const optHour = learning.getOptimalHour ? learning.getOptimalHour(userId) : 10;
        mlCtx = {
          bestFocusHour : optHour ?? 10,
          burnoutRisk   : profile?.stats?.burnout_risk ?? 0,
          completionBoost: (profile?.stats?.overall_success_rate ?? 0.6) - 0.5,
        };
      } catch (_) {}
    }

    // ── Step 2: Current energy ──────────────────────────────────────────────
    const energyInfo = getCurrentEnergyLevel(null, mlCtx);
    const effectiveEnergy = currentEnergy ?? energyInfo.score;

    // ── Step 3: Burnout check ───────────────────────────────────────────────
    if (mlCtx.burnoutRisk > 0.75) {
      return {
        action      : 'take_break',
        title       : '💆 خذ استراحة الآن',
        message     : 'نظام الذكاء الاصطناعي اكتشف علامات إجهاد عالية. استرح 15-20 دقيقة الآن — ستكون أكثر إنتاجية بعدها.',
        reason      : ['⚠️ خطر إجهاد مرتفع (' + Math.round(mlCtx.burnoutRisk * 100) + '%)', '🔋 جسمك يحتاج للراحة', '📊 ML اكتشف نمط إجهاد'],
        confidence  : Math.round(mlCtx.burnoutRisk * 100),
        urgency     : 'high',
        energy_match: false,
        ml_driven   : true,
        explanation : ['الذكاء الاصطناعي رصد أنماط تدل على الإجهاد', 'الاستراحة تزيد الإنتاجية بنسبة 30%'],
        suggestions : buildSuggestions('take_break'),
      };
    }

    // ── Step 4: Load tasks ───────────────────────────────────────────────────
    let tasks = [];
    let overdueTasks = [];
    if (Task) {
      const allPending = await Task.findAll({
        where: {
          user_id: userId,
          status : { [Op.in]: ['pending', 'in_progress'] },
        },
        order: [
          ['priority', 'ASC'],  // urgent first (lexicographic: high < low < medium < urgent — use weight below)
          ['due_date', 'ASC'],
          ['createdAt', 'ASC'],
        ],
        limit: 20,
      });

      tasks = allPending.map(t => {
        const j = t.toJSON ? t.toJSON() : t;
        j._dueDateNorm = normDate(j.due_date);   // normalized date for comparison
        return j;
      });

      // Sort by priority weight (urgent=4, high=3, medium=2, low=1)
      const WEIGHT = { urgent: 4, high: 3, medium: 2, low: 1 };
      tasks.sort((a, b) => {
        const wa = WEIGHT[a.priority] || 1;
        const wb = WEIGHT[b.priority] || 1;
        if (wa !== wb) return wb - wa;  // higher weight first
        if (a._dueDateNorm && b._dueDateNorm) return a._dueDateNorm.localeCompare(b._dueDateNorm);
        return 0;
      });

      // Overdue: normalized date < today
      overdueTasks = tasks.filter(t => t._dueDateNorm && t._dueDateNorm < todayStr);
    }

    // ── Step 5: Overdue task → critical action ──────────────────────────────
    if (overdueTasks.length > 0) {
      const oldest = overdueTasks[0];
      const dueDateNorm = oldest._dueDateNorm;
      const daysOverdue = Math.floor((new Date(todayStr) - new Date(dueDateNorm)) / 86400000);

      return {
        action      : 'start_task',
        task_id     : oldest.id,
        title       : oldest.title,
        message     : `عندك مهمة متأخرة ${daysOverdue > 0 ? daysOverdue + ' يوم' : 'منذ اليوم'}! ابدأ بـ "${oldest.title}" الآن — كل تأخير يزيد الضغط.`,
        reason      : [
          daysOverdue > 0 ? `⏰ متأخرة ${daysOverdue} يوم` : '⏰ موعدها كان اليوم',
          `🔴 أولوية: ${oldest.priority === 'urgent' ? 'عاجلة' : oldest.priority === 'high' ? 'عالية' : oldest.priority || 'عالية'}`,
          overdueTasks.length > 1 ? `📋 و${overdueTasks.length - 1} مهام متأخرة أخرى` : '⚡ ابدأ الآن',
        ],
        confidence  : 95,
        urgency     : 'critical',
        energy_match: effectiveEnergy > 40,
        category    : oldest.category,
        ml_driven   : false,
        explanation : ['المهمة تجاوزت موعدها النهائي', 'البدء الآن يمنع تراكم المهام'],
        suggestions : buildSuggestions('start_task', oldest),
      };
    }

    // ── Step 6: Today's tasks sorted by priority ────────────────────────────
    // Today = exact match OR no due_date (flexible tasks)
    const todayTasks  = tasks.filter(t => !t._dueDateNorm || t._dueDateNorm === todayStr);
    // Future tasks (due tomorrow or later)
    const futureTasks = tasks.filter(t => t._dueDateNorm && t._dueDateNorm > todayStr);
    const urgentTasks = tasks.filter(t => t.priority === 'urgent' || t.priority === 'high');

    // Best energy → best focus task
    if (energyInfo.level === 'high' && urgentTasks.length > 0) {
      const best = urgentTasks[0];
      const isInFocusWindow = Math.abs(hour - mlCtx.bestFocusHour) <= 1;

      return {
        action      : 'start_task',
        task_id     : best.id,
        title       : best.title,
        message     : `طاقتك عالية الآن${isInFocusWindow ? ' وده أفضل وقت تركيز ليك' : ''}! اشتغل على "${best.title}" — هتخلص منها بسرعة.`,
        reason      : [
          energyInfo.label,
          isInFocusWindow ? `⭐ أفضل ساعة تركيز (${mlCtx.bestFocusHour}:00)` : '💪 طاقة كافية',
          `🎯 أولوية ${best.priority === 'urgent' ? 'عاجلة' : 'عالية'}`,
          mlCtx.completionBoost > 0.1 ? '📈 نسبة إنجازك مرتفعة حالياً' : '✅ مهمة مهمة',
        ],
        confidence  : buildActionConfidence(best, mlCtx, energyInfo),
        urgency     : best.priority === 'urgent' ? 'critical' : 'high',
        energy_match: true,
        category    : best.category,
        ml_driven   : true,
        explanation : [
          `أفضل ساعة تركيز اليوم: ${mlCtx.bestFocusHour}:00`,
          'الطاقة العالية مثالية للمهام الصعبة',
          `احتمالية الإنجاز: ${Math.round((buildActionConfidence(best, mlCtx, energyInfo) / 100) * 100)}%`,
        ],
        suggestions : buildSuggestions('start_task', best),
      };
    }

    // Low energy → suggest easy tasks or mood logging
    if (energyInfo.level === 'low') {
      const easyTask = tasks.find(t =>
        t.priority === 'low' ||
        (t.estimated_duration && t.estimated_duration <= 15) ||
        (t.estimated_minutes && t.estimated_minutes <= 15)
      );
      if (easyTask) {
        const dur = easyTask.estimated_duration || easyTask.estimated_minutes || 15;
        return {
          action      : 'start_task',
          task_id     : easyTask.id,
          title       : easyTask.title,
          message     : `طاقتك منخفضة — خلّي الأمور البسيطة. ابدأ بـ "${easyTask.title}" (${dur} دقيقة).`,
          reason      : ['😴 طاقة منخفضة الآن', '⚡ مهمة سريعة وسهلة', '✅ إنجاز صغير يرفع المعنويات'],
          confidence  : 65,
          urgency     : 'low',
          energy_match: true,
          category    : easyTask.category,
          ml_driven   : true,
          explanation : ['المهام الخفيفة مناسبة لأوقات الطاقة المنخفضة', 'الإنجازات الصغيرة تبني الزخم'],
          suggestions : buildSuggestions('start_task', easyTask),
        };
      }
      // Phase 8: check if mood already logged today before suggesting it
      let moodAlreadyLogged = false;
      try {
        const MoodEntry = models.MoodEntry;
        if (MoodEntry) {
          const todayMood = await MoodEntry.findOne({ where: { user_id: userId, entry_date: todayStr } });
          if (todayMood) moodAlreadyLogged = true;
        }
      } catch(_) {}

      if (!moodAlreadyLogged) {
        return {
          action      : 'log_mood',
          title       : '📊 سجّل مزاجك',
          message     : 'طاقتك منخفضة الآن. سجّل مزاجك الحالي — هيساعدنا نعطيك توصيات أدق لبقية اليوم.',
          reason      : ['😴 وقت طاقة منخفض', '📊 بيانات المزاج تحسّن التوصيات', '🔋 ارتاح بعدها'],
          confidence  : 60,
          urgency     : 'low',
          energy_match: true,
          ml_driven   : true,
          explanation : ['تسجيل المزاج يساعد الذكاء الاصطناعي على تحسين التوصيات'],
          suggestions : buildSuggestions('log_mood'),
        };
      }
      // Mood already logged — suggest reviewing plan instead
      return {
        action      : 'review_plan',
        title       : '📋 راجع خطتك',
        message     : 'طاقتك منخفضة الآن ومزاجك مسجّل. خذ استراحة قصيرة ثم راجع ما تبقى.',
        reason      : ['😴 وقت طاقة منخفض', '✅ المزاج مسجّل بالفعل', '📋 مراجعة الخطة تساعد'],
        confidence  : 55,
        urgency     : 'low',
        energy_match: true,
        ml_driven   : false,
        explanation : ['كل شيء على المسار — استرح قليلاً'],
        suggestions : buildSuggestions('review_plan'),
      };
    }

    // Medium energy → next today task or habit check
    const allTasksForToday = todayTasks.length > 0 ? todayTasks : futureTasks;
    if (allTasksForToday.length > 0) {
      const next = allTasksForToday[0];
      const isDueToday = next._dueDateNorm === todayStr;

      return {
        action      : 'start_task',
        task_id     : next.id,
        title       : next.title,
        message     : `الخطوة التالية: "${next.title}"${isDueToday ? ' — موعدها اليوم!' : ''}. طاقتك ${energyInfo.label} — وقت مناسب للتقدم.`,
        reason      : [
          energyInfo.label,
          isDueToday ? '📅 مستحقة اليوم' : `📅 موعدها ${next._dueDateNorm || 'قريباً'}`,
          tasks.length > 1 ? `📊 عندك ${tasks.length} مهام متبقية` : '✅ آخر مهمة في قائمتك',
        ],
        confidence  : buildActionConfidence(next, mlCtx, energyInfo),
        urgency     : isDueToday ? 'medium' : 'low',
        energy_match: true,
        category    : next.category,
        ml_driven   : true,
        explanation : [
          `هذه المهمة الأنسب لمستوى طاقتك الحالي (${effectiveEnergy}%)`,
          'الذكاء الاصطناعي رتّب المهام حسب الأولوية والطاقة',
        ],
        suggestions : buildSuggestions('start_task', next),
      };
    }

    // ── Step 7: No tasks → suggest habit check or plan review ───────────────
    let habits = [];
    if (Habit) {
      try {
        const rawHabits = await Habit.findAll({
          where : { user_id: userId, is_active: true },
          limit : 5,
        });
        habits = rawHabits.map(h => h.toJSON ? h.toJSON() : h);
      } catch (_) {}
    }

    // Phase 8: filter out already-completed habits before suggesting
    if (habits.length > 0) {
      let uncheckedHabits = habits;
      try {
        const HabitLog = models.HabitLog;
        if (HabitLog) {
          const todayLogs = await HabitLog.findAll({
            where: { user_id: userId, log_date: todayStr, completed: true },
            attributes: ['habit_id'],
            raw: true,
          });
          const doneIds = new Set(todayLogs.map(l => l.habit_id));
          uncheckedHabits = habits.filter(h => !doneIds.has(h.id));
        }
      } catch(_) {}

      if (uncheckedHabits.length > 0) {
        const h = uncheckedHabits[0];
        return {
          action      : 'check_habit',
          habit_id    : h.id,
          title       : `🔄 ${h.name_ar || h.name || 'عادة اليوم'}`,
          message     : `مافيش مهام متبقية! حان وقت عادتك: "${h.name_ar || h.name}". حافظ على الاستمرارية.`,
          reason      : ['✅ خلصت مهامك', '🔄 حافظ على سلسلة العادة', '⭐ الاستمرارية تبني النجاح'],
          confidence  : 75,
          urgency     : 'low',
          energy_match: true,
          ml_driven   : false,
          explanation : ['الاتساق في العادات يبني نتائج طويلة المدى'],
          suggestions : ['سجّل العادة الآن', 'عرض سلسلة العادة', 'إضافة مهمة جديدة'],
        };
      }
    }

    // Everything done!
    return {
      action      : 'review_plan',
      title       : '🎉 يوم منجز!',
      message     : 'أحسنت! خلّصت كل مهامك وعاداتك. راجع خطة الغد أو استرح — أنت تستاهل! 🌟',
      reason      : ['✅ كل المهام مكتملة', '🌟 إنجاز رائع', '📅 خطط للغد إذا أردت'],
      confidence  : 100,
      urgency     : 'low',
      energy_match: true,
      ml_driven   : false,
      explanation : ['لا توجد مهام متبقية', 'استمر في هذا الإيقاع الرائع'],
      suggestions : ['خطط لغد', 'راجع الأهداف الأسبوعية', 'سجّل إنجاز اليوم'],
    };

  } catch (err) {
    logger.error('[NEXT-ACTION] Error:', err.message);
    return {
      action      : 'review_plan',
      title       : '📋 راجع خطتك',
      message     : 'تحقق من مهامك وعاداتك وابدأ بالأهم.',
      reason      : ['⚠️ تعذّر تحميل البيانات'],
      confidence  : 50,
      urgency     : 'medium',
      energy_match: true,
      ml_driven   : false,
      explanation : ['حدث خطأ مؤقت في التحليل'],
      suggestions : ['تحديث الصفحة', 'عرض المهام', 'التحدث مع المساعد'],
    };
  }
}

function buildActionConfidence(task, mlCtx, energyInfo) {
  let c = 60;
  if (task.priority === 'urgent') c += 20;
  else if (task.priority === 'high') c += 12;
  if (energyInfo.level === 'high') c += 10;
  if (mlCtx.completionBoost > 0.1) c += 8;
  if (mlCtx.burnoutRisk < 0.3) c += 5;
  return Math.max(40, Math.min(95, c));
}

module.exports = { getNextBestAction };
