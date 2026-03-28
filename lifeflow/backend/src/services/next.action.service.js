/**
 * Context-Aware Action Engine — Phase G
 * ========================================
 * Determines the single best action the user should take RIGHT NOW.
 *
 * NEW PRIORITY ORDER (Phase G):
 *  1. Current time window (what's happening NOW — meetings, prayer times, scheduled tasks)
 *  2. User energy/behavior pattern (ML-driven energy level, best focus hours)
 *  3. Habit timing (habits with target times matching current hour)
 *  4. Goal alignment (tasks linked to active goals get priority boost)
 *  5. Task urgency (urgent/high priority tasks)
 *  6. Overdue handling (intelligent: recent → complete, old → reschedule)
 *
 * Each recommendation includes "Why this now?" explanation array.
 * Never suggests stale past-day tasks blindly — proposes rescheduling.
 *
 * Output:
 *  {
 *    action, task_id?, habit_id?, title, message,
 *    reason: [],        // Arabic bullet points
 *    explanation: [],    // "Why this now?" details
 *    confidence,        // 0-100
 *    urgency,           // low | medium | high | critical
 *    energy_match,      // boolean
 *    ml_driven,         // boolean
 *    suggestions,       // follow-up action strings
 *    reschedule_suggestion?, // { date, time } for overdue
 *  }
 */

'use strict';

const logger = require('../utils/logger');
const moment = require('moment-timezone');

// ─── Lazy loaders ─────────────────────────────────────────────────────────────
function getLearning()   { try { return require('./learning.engine.service'); } catch (_e) { return null; } }
function getScheduler()  { try { return require('./scheduling.engine.service'); } catch (_e) { return null; } }
function getGoalEngine() { try { return require('./goal.engine.service'); } catch (_e) { return null; } }
function getModels()     { try { return require('../config/database').sequelize.models; } catch (_e) { return {}; } }

// ─── Date normalization ───────────────────────────────────────────────────────
function normDate(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.split('T')[0].split(' ')[0];
  if (val instanceof Date)     return val.toISOString().split('T')[0];
  return String(val).split('T')[0].split(' ')[0];
}

// ─── Energy helpers ───────────────────────────────────────────────────────────
function getCurrentEnergyLevel(user, mlCtx, timezone = 'Africa/Cairo') {
  const hour = moment().tz(timezone).hour();
  const bestHour = mlCtx?.bestFocusHour ?? 10;
  const dist = Math.abs(hour - bestHour);

  if (dist <= 1) return { level: 'high',   score: 90, label: 'طاقة عالية ⚡' };
  if (dist <= 2) return { level: 'medium', score: 70, label: 'طاقة متوسطة 💪' };
  if (dist <= 4) return { level: 'medium', score: 55, label: 'طاقة معتدلة 🙂' };
  return           { level: 'low',    score: 35, label: 'طاقة منخفضة 😴' };
}

// ─── Suggestions builder ──────────────────────────────────────────────────────
function buildSuggestions(action, task) {
  const base = ['كيف طاقتي؟', 'وضعي اليوم', 'خطتي الأسبوعية'];
  if (action === 'start_task' && task) {
    return [`ابدأ "${task.title || 'المهمة'}"`, 'قسّم المهمة لخطوات أصغر', 'أجّل المهمة', ...base].slice(0, 4);
  }
  if (action === 'take_break') return ['متى تنتهي الاستراحة؟', 'تمارين سريعة', 'مهام بعد الاستراحة'];
  if (action === 'log_mood')   return ['سجّل مزاجي', 'نصيحة لرفع الطاقة', 'مهام خفيفة الآن'];
  if (action === 'check_habit') return ['سجّل العادة الآن', 'عرض سلسلة العادة', 'إضافة مهمة جديدة'];
  return base;
}

// ─── Confidence calculator ────────────────────────────────────────────────────
function buildActionConfidence(task, mlCtx, energyInfo) {
  let c = 60;
  if (task.priority === 'urgent') c += 20;
  else if (task.priority === 'high') c += 12;
  if (energyInfo.level === 'high') c += 10;
  if (mlCtx.completionBoost > 0.1) c += 8;
  if (mlCtx.burnoutRisk < 0.3) c += 5;
  return Math.max(40, Math.min(95, c));
}

// ─── Time window explanation ──────────────────────────────────────────────────
function getTimeWindowLabel(hour) {
  if (hour >= 5 && hour < 9)   return 'وقت الصباح الباكر — أفضل فترة تركيز';
  if (hour >= 9 && hour < 12)  return 'ساعات العمل الصباحية';
  if (hour >= 12 && hour < 14) return 'فترة ما بعد الظهر';
  if (hour >= 14 && hour < 17) return 'ساعات العمل المسائية';
  if (hour >= 17 && hour < 20) return 'المساء — وقت مناسب للعادات والمهام الخفيفة';
  if (hour >= 20 && hour < 23) return 'وقت الراحة والمراجعة';
  return 'وقت متأخر — احرص على النوم';
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN: Context-Aware Action Engine
// ═════════════════════════════════════════════════════════════════════════════
async function getNextBestAction(userId, options = {}) {
  const { timezone = 'Africa/Cairo', currentEnergy, currentMood } = options;

  try {
    const models   = getModels();
    const learning = getLearning();
    const scheduler = getScheduler();
    const { Task, Habit, HabitLog, MoodEntry } = models;

    const nowTz    = moment().tz(timezone);
    const hour     = nowTz.hour();
    const todayStr = nowTz.format('YYYY-MM-DD');
    const { Op }   = require('sequelize');

    // ── 1. ML Context ─────────────────────────────────────────────────────
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
      } catch (_e) { /* non-critical */ }
    }

    // ── 2. Current Energy ─────────────────────────────────────────────────
    const energyInfo = getCurrentEnergyLevel(null, mlCtx, timezone);
    const effectiveEnergy = currentEnergy ?? energyInfo.score;
    const timeWindow = getTimeWindowLabel(hour);

    // ── 2b. Goal Context ──────────────────────────────────────────────────
    let goalContext = null;
    try {
      const goalEngine = getGoalEngine();
      if (goalEngine?.getGoalContext) {
        goalContext = await goalEngine.getGoalContext(userId, timezone);
      }
    } catch (_e) { /* non-critical */ }

    // ── PRIORITY 0: Burnout guard ─────────────────────────────────────────
    if (mlCtx.burnoutRisk > 0.75) {
      return {
        action: 'take_break',
        title: '💆 خذ استراحة الآن',
        message: 'نظام الذكاء الاصطناعي اكتشف علامات إجهاد عالية. استرح 15-20 دقيقة.',
        reason: [
          '⚠️ خطر إجهاد مرتفع (' + Math.round(mlCtx.burnoutRisk * 100) + '%)',
          '🔋 جسمك يحتاج للراحة',
          '📊 ML اكتشف نمط إجهاد',
        ],
        explanation: [
          'الذكاء الاصطناعي رصد أنماط تدل على الإجهاد بناءً على نشاطك الأخير',
          'الاستراحة تزيد الإنتاجية بنسبة 30% حسب الدراسات',
          `الوقت الحالي: ${timeWindow}`,
        ],
        confidence: Math.round(mlCtx.burnoutRisk * 100),
        urgency: 'high',
        energy_match: false,
        ml_driven: true,
        suggestions: buildSuggestions('take_break'),
      };
    }

    // ── PRIORITY 1: Time Window — check for habits due NOW ────────────────
    let habitsDueNow = [];
    if (Habit && HabitLog) {
      try {
        const activeHabits = await Habit.findAll({
          where: { user_id: userId, is_active: true },
          limit: 20,
        });
        // Find today's completed habit logs
        const todayLogs = await HabitLog.findAll({
          where: { user_id: userId, log_date: todayStr, completed: true },
          attributes: ['habit_id'],
          raw: true,
        });
        const doneIds = new Set(todayLogs.map(l => l.habit_id));

        habitsDueNow = activeHabits
          .map(h => h.toJSON ? h.toJSON() : h)
          .filter(h => {
            if (doneIds.has(h.id)) return false;
            const targetTime = h.target_time || h.preferred_time || h.ai_best_time;
            if (!targetTime) return false;
            const parts = targetTime.split(':').map(Number);
            const hh = parts[0] || 0;
            return Math.abs(hour - hh) <= 1; // within 1 hour of target
          });
      } catch (_e) { /* non-critical */ }
    }

    // If a habit is due right now AND has a streak worth protecting
    if (habitsDueNow.length > 0) {
      const bestHabit = habitsDueNow.sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0))[0];
      const streak = bestHabit.current_streak || 0;
      const targetTime = bestHabit.target_time || bestHabit.preferred_time || bestHabit.ai_best_time;

      // Only prioritize if streak is significant or it's exactly the right time
      if (streak > 3 || Math.abs(hour - parseInt(targetTime)) === 0) {
        return {
          action: 'check_habit',
          habit_id: bestHabit.id,
          title: `🔄 ${bestHabit.name_ar || bestHabit.name || 'عادتك'}`,
          message: `الآن وقت "${bestHabit.name_ar || bestHabit.name}"${streak > 0 ? ` — سلسلة ${streak} يوم!` : ''}`,
          reason: [
            `⏰ الوقت المحدد: ${targetTime}`,
            streak > 0 ? `🔥 سلسلة ${streak} يوم — لا تقطعها!` : '⭐ عادة مهمة لروتينك',
            `📍 ${timeWindow}`,
          ],
          explanation: [
            `هذه العادة مجدولة للساعة ${targetTime} بناءً على نمطك اليومي`,
            streak > 3 ? `لديك سلسلة ${streak} يوم — قطعها سيكلفك أكثر مما تتخيل` : 'الاتساق يبني عادات دائمة',
            `مستوى طاقتك: ${energyInfo.label}`,
          ],
          confidence: Math.min(95, 70 + streak * 2),
          urgency: streak > 5 ? 'high' : 'medium',
          energy_match: true,
          ml_driven: streak > 0,
          suggestions: buildSuggestions('check_habit'),
        };
      }
    }

    // ── Load tasks ────────────────────────────────────────────────────────
    let tasks = [];
    let overdueTasks = [];
    if (Task) {
      const allPending = await Task.findAll({
        where: {
          user_id: userId,
          status: { [Op.in]: ['pending', 'in_progress'] },
        },
        order: [['priority', 'ASC'], ['due_date', 'ASC'], ['createdAt', 'ASC']],
        limit: 20,
      });

      tasks = allPending.map(t => {
        const j = t.toJSON ? t.toJSON() : t;
        j._dueDateNorm = normDate(j.due_date);
        return j;
      });

      // Sort by priority weight + goal boost
      const WEIGHT = { urgent: 4, high: 3, medium: 2, low: 1 };
      const goalEngine = getGoalEngine();
      tasks.sort((a, b) => {
        let wa = WEIGHT[a.priority] || 1;
        let wb = WEIGHT[b.priority] || 1;
        if (goalContext && goalEngine?.getGoalBoostForTask) {
          wa += (goalEngine.getGoalBoostForTask(a, goalContext) / 10);
          wb += (goalEngine.getGoalBoostForTask(b, goalContext) / 10);
        }
        if (Math.abs(wa - wb) > 0.1) return wb - wa;
        if (a._dueDateNorm && b._dueDateNorm) return a._dueDateNorm.localeCompare(b._dueDateNorm);
        return 0;
      });

      overdueTasks = tasks.filter(t => t._dueDateNorm && t._dueDateNorm < todayStr);
    }

    // ── PRIORITY 2: Energy-optimal task (high energy → hard task) ─────────
    const todayTasks  = tasks.filter(t => !t._dueDateNorm || t._dueDateNorm === todayStr);
    const futureTasks = tasks.filter(t => t._dueDateNorm && t._dueDateNorm > todayStr);
    const urgentTasks = tasks.filter(t => t.priority === 'urgent' || t.priority === 'high');
    const isInFocusWindow = Math.abs(hour - (mlCtx.bestFocusHour || 10)) <= 1;

    if (energyInfo.level === 'high' && urgentTasks.length > 0) {
      const best = urgentTasks[0];
      return {
        action: 'start_task',
        task_id: best.id,
        title: best.title,
        message: `طاقتك عالية الآن${isInFocusWindow ? ' وده أفضل وقت تركيز ليك' : ''}! اشتغل على "${best.title}".`,
        reason: [
          energyInfo.label,
          isInFocusWindow ? `⭐ أفضل ساعة تركيز (${mlCtx.bestFocusHour}:00)` : '💪 طاقة كافية',
          `🎯 أولوية ${best.priority === 'urgent' ? 'عاجلة' : 'عالية'}`,
          mlCtx.completionBoost > 0.1 ? '📈 نسبة إنجازك مرتفعة حالياً' : '✅ مهمة مهمة',
        ],
        explanation: [
          `${timeWindow} — أفضل فترة لإنجاز المهام الصعبة`,
          `مستوى طاقتك (${effectiveEnergy}%) يناسب هذه المهمة تماماً`,
          isInFocusWindow ? `أنت الآن في أفضل ساعة تركيز (${mlCtx.bestFocusHour}:00) حسب بياناتك` : 'طاقتك كافية للمهام المهمة',
          `احتمالية الإنجاز: ${buildActionConfidence(best, mlCtx, energyInfo)}%`,
        ],
        confidence: buildActionConfidence(best, mlCtx, energyInfo),
        urgency: best.priority === 'urgent' ? 'critical' : 'high',
        energy_match: true,
        category: best.category,
        ml_driven: true,
        suggestions: buildSuggestions('start_task', best),
      };
    }

    // ── PRIORITY 3: Overdue tasks — intelligent handling ──────────────────
    if (overdueTasks.length > 0) {
      const oldest = overdueTasks[0];
      const dueDateNorm = oldest._dueDateNorm;
      const daysOverdue = Math.floor((new Date(todayStr) - new Date(dueDateNorm)) / 86400000);
      const suggestedHour = Math.max(hour + 1, mlCtx.bestFocusHour || 10);
      const suggestedTime = `${String(Math.min(suggestedHour, 21)).padStart(2, '0')}:00`;

      // Old overdue (>2 days) → suggest rescheduling
      if (daysOverdue > 2) {
        return {
          action: 'start_task',
          task_id: oldest.id,
          title: oldest.title,
          message: `"${oldest.title}" متأخرة ${daysOverdue} يوم. أعد جدولتها إلى ${suggestedTime} أو أكملها الآن.`,
          reason: [
            `⏰ متأخرة ${daysOverdue} يوم`,
            `📅 اقتراح: أعد الجدولة إلى ${suggestedTime}`,
            overdueTasks.length > 1 ? `📋 و${overdueTasks.length - 1} مهام متأخرة أخرى` : '⚡ أو أكملها الآن',
          ],
          explanation: [
            `هذه المهمة تجاوزت موعدها بـ ${daysOverdue} يوم`,
            'إعادة الجدولة أفضل من تراكم الضغط النفسي',
            `الوقت المقترح (${suggestedTime}) يتوافق مع أفضل أوقات تركيزك`,
            `${timeWindow}`,
          ],
          confidence: 90,
          urgency: 'critical',
          energy_match: effectiveEnergy > 40,
          category: oldest.category,
          ml_driven: false,
          reschedule_suggestion: { date: todayStr, time: suggestedTime },
          suggestions: [`أعد جدولة "${oldest.title}"`, 'قسّم المهمة لخطوات', 'أجّل المهمة', 'كيف طاقتي؟'],
        };
      }

      // Recent overdue (≤2 days) → push to complete now
      return {
        action: 'start_task',
        task_id: oldest.id,
        title: oldest.title,
        message: `عندك مهمة متأخرة ${daysOverdue > 0 ? daysOverdue + ' يوم' : 'منذ اليوم'}! ابدأ بـ "${oldest.title}" الآن.`,
        reason: [
          daysOverdue > 0 ? `⏰ متأخرة ${daysOverdue} يوم` : '⏰ موعدها كان اليوم',
          `🔴 أولوية: ${oldest.priority === 'urgent' ? 'عاجلة' : oldest.priority === 'high' ? 'عالية' : oldest.priority || 'عالية'}`,
          overdueTasks.length > 1 ? `📋 و${overdueTasks.length - 1} مهام متأخرة أخرى` : '⚡ ابدأ الآن',
        ],
        explanation: [
          'المهمة تجاوزت موعدها النهائي مؤخراً — لا يزال بالإمكان إنجازها اليوم',
          'البدء الآن يمنع تراكم المهام ويخفف الضغط',
          `مستوى طاقتك: ${energyInfo.label}`,
        ],
        confidence: 95,
        urgency: 'critical',
        energy_match: effectiveEnergy > 40,
        category: oldest.category,
        ml_driven: false,
        suggestions: buildSuggestions('start_task', oldest),
      };
    }

    // ── PRIORITY 4: Today's tasks by energy match ─────────────────────────
    if (energyInfo.level === 'low') {
      // Low energy → easy/short tasks or mood logging
      const easyTask = tasks.find(t =>
        t.priority === 'low' ||
        (t.estimated_duration && t.estimated_duration <= 15) ||
        (t.estimated_minutes && t.estimated_minutes <= 15)
      );
      if (easyTask) {
        const dur = easyTask.estimated_duration || easyTask.estimated_minutes || 15;
        return {
          action: 'start_task',
          task_id: easyTask.id,
          title: easyTask.title,
          message: `طاقتك منخفضة — ابدأ بـ "${easyTask.title}" (${dur} دقيقة).`,
          reason: ['😴 طاقة منخفضة الآن', '⚡ مهمة سريعة وسهلة', '✅ إنجاز صغير يرفع المعنويات'],
          explanation: [
            `${timeWindow} — المهام الخفيفة أنسب الآن`,
            'إنجاز مهمة صغيرة يعطيك دفعة نفسية إيجابية',
            `هذه المهمة تحتاج فقط ${dur} دقيقة`,
          ],
          confidence: 65,
          urgency: 'low',
          energy_match: true,
          category: easyTask.category,
          ml_driven: true,
          suggestions: buildSuggestions('start_task', easyTask),
        };
      }

      // No easy tasks → check if mood already logged
      let moodAlreadyLogged = false;
      try {
        if (MoodEntry) {
          const todayMood = await MoodEntry.findOne({ where: { user_id: userId, entry_date: todayStr } });
          if (todayMood) moodAlreadyLogged = true;
        }
      } catch (_e) { /* non-critical */ }

      if (!moodAlreadyLogged) {
        return {
          action: 'log_mood',
          title: '📊 سجّل مزاجك',
          message: 'طاقتك منخفضة. سجّل مزاجك — هيساعدنا نعطيك توصيات أدق.',
          reason: ['😴 وقت طاقة منخفض', '📊 بيانات المزاج تحسّن التوصيات', '🔋 ارتاح بعدها'],
          explanation: [
            `${timeWindow}`,
            'تسجيل المزاج يساعد الذكاء الاصطناعي على تحسين توصياته لك',
            'لا يحتاج أكثر من دقيقة واحدة',
          ],
          confidence: 60,
          urgency: 'low',
          energy_match: true,
          ml_driven: true,
          suggestions: buildSuggestions('log_mood'),
        };
      }

      return {
        action: 'review_plan',
        title: '📋 راجع خطتك',
        message: 'طاقتك منخفضة ومزاجك مسجّل. خذ استراحة ثم راجع ما تبقى.',
        reason: ['😴 وقت طاقة منخفض', '✅ المزاج مسجّل بالفعل', '📋 مراجعة الخطة تساعد'],
        explanation: [`${timeWindow}`, 'كل شيء على المسار — استرح قليلاً'],
        confidence: 55,
        urgency: 'low',
        energy_match: true,
        ml_driven: false,
        suggestions: buildSuggestions('review_plan'),
      };
    }

    // ── PRIORITY 5: Medium energy → next today task ───────────────────────
    const allTasksForToday = todayTasks.length > 0 ? todayTasks : futureTasks;
    if (allTasksForToday.length > 0) {
      const next = allTasksForToday[0];
      const isDueToday = next._dueDateNorm === todayStr;
      const hasTime = next.due_time || next.start_time;

      return {
        action: 'start_task',
        task_id: next.id,
        title: next.title,
        message: `الخطوة التالية: "${next.title}"${isDueToday ? ' — موعدها اليوم!' : ''}.`,
        reason: [
          energyInfo.label,
          isDueToday ? '📅 مستحقة اليوم' : `📅 موعدها ${next._dueDateNorm || 'قريباً'}`,
          hasTime ? `🕐 الوقت: ${next.due_time || toCairoTime(next.start_time)}` : '',
          tasks.length > 1 ? `📊 عندك ${tasks.length} مهام متبقية` : '✅ آخر مهمة',
        ].filter(Boolean),
        explanation: [
          `${timeWindow}`,
          `هذه المهمة الأنسب لمستوى طاقتك الحالي (${effectiveEnergy}%)`,
          'الذكاء الاصطناعي رتّب المهام حسب الأولوية والطاقة والأهداف',
          goalContext ? 'هذه المهمة مرتبطة بأحد أهدافك النشطة' : '',
        ].filter(Boolean),
        confidence: buildActionConfidence(next, mlCtx, energyInfo),
        urgency: isDueToday ? 'medium' : 'low',
        energy_match: true,
        category: next.category,
        ml_driven: true,
        suggestions: buildSuggestions('start_task', next),
      };
    }

    // ── PRIORITY 6: No tasks → unchecked habits ───────────────────────────
    if (Habit) {
      try {
        const rawHabits = await Habit.findAll({
          where: { user_id: userId, is_active: true },
          limit: 5,
        });
        let habits = rawHabits.map(h => h.toJSON ? h.toJSON() : h);

        // Filter already completed
        if (HabitLog) {
          try {
            const todayLogs = await HabitLog.findAll({
              where: { user_id: userId, log_date: todayStr, completed: true },
              attributes: ['habit_id'],
              raw: true,
            });
            const doneIds = new Set(todayLogs.map(l => l.habit_id));
            habits = habits.filter(h => !doneIds.has(h.id));
          } catch (_e) { /* non-critical */ }
        }

        if (habits.length > 0) {
          const h = habits[0];
          return {
            action: 'check_habit',
            habit_id: h.id,
            title: `🔄 ${h.name_ar || h.name || 'عادة اليوم'}`,
            message: `مافيش مهام متبقية! حان وقت "${h.name_ar || h.name}".`,
            reason: ['✅ خلصت مهامك', '🔄 حافظ على سلسلة العادة', '⭐ الاستمرارية تبني النجاح'],
            explanation: [
              'أنجزت جميع مهامك — الآن وقت العادات',
              `${timeWindow}`,
            ],
            confidence: 75,
            urgency: 'low',
            energy_match: true,
            ml_driven: false,
            suggestions: buildSuggestions('check_habit'),
          };
        }
      } catch (_e) { /* non-critical */ }
    }

    // ── Everything done! ──────────────────────────────────────────────────
    return {
      action: 'review_plan',
      title: '🎉 يوم منجز!',
      message: 'أحسنت! خلّصت كل مهامك وعاداتك. راجع خطة الغد أو استرح 🌟',
      reason: ['✅ كل المهام مكتملة', '🌟 إنجاز رائع', '📅 خطط للغد إذا أردت'],
      explanation: [
        'لا توجد مهام أو عادات متبقية لليوم',
        'استمر في هذا الإيقاع الرائع!',
      ],
      confidence: 100,
      urgency: 'low',
      energy_match: true,
      ml_driven: false,
      suggestions: ['خطط لغد', 'راجع الأهداف الأسبوعية', 'سجّل إنجاز اليوم'],
    };

  } catch (err) {
    logger.error('[NEXT-ACTION] Error:', err.message);
    return {
      action: 'review_plan',
      title: '📋 راجع خطتك',
      message: 'تحقق من مهامك وعاداتك وابدأ بالأهم.',
      reason: ['⚠️ تعذّر تحميل البيانات'],
      explanation: ['حدث خطأ مؤقت في التحليل — الخدمة تعمل بشكل طبيعي'],
      confidence: 50,
      urgency: 'medium',
      energy_match: true,
      ml_driven: false,
      suggestions: ['تحديث الصفحة', 'عرض المهام', 'التحدث مع المساعد'],
    };
  }
}

module.exports = { getNextBestAction };
