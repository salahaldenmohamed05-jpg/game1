/**
 * AI Command Engine — الذكاء الاصطناعي التنفيذي الموحد
 * ======================================================
 * Conversational AI Agent with Memory + Context Awareness
 *
 * Flow:
 *  1. Classify intent category (task_action / question / advice / general)
 *  2. If task_action → detect specific intent (JSON) → executeAction → processConversation
 *  3. If question/advice/general → processConversation (pure conversational AI)
 *  4. Always return: { reply, action_taken, suggestions, needs_confirmation }
 */

const logger = require('../utils/logger');
const { Op }  = require('sequelize');
// Use ai.client for multi-provider retry (Groq 3 models + Gemini fallback)
const { chat, buildIntelligentFallback } = require('./ai/ai.client');
const {
  processConversation,
  classifyIntent,
  getConversationHistory,
  clearConversation,
  SUGGESTION_CHIPS,
} = require('./conversation.service');

// ── Models (lazy) ──────────────────────────────────────────────────────────────
let Task, Habit, HabitLog, MoodEntry, Notification, sequelizeInst;
function getModels() {
  if (!Task) {
    const db  = require('../config/database');
    const seq = db.sequelize;
    Task         = seq.models.Task        || require('../models/task.model');
    Habit        = seq.models.Habit       || require('../models/habit.model');
    MoodEntry    = seq.models.MoodEntry   || require('../models/mood.model');
    Notification = seq.models.Notification;
    sequelizeInst = seq;
  }
  return { Task, Habit, MoodEntry, Notification };
}

// ── Intent Detection Prompt ────────────────────────────────────────────────────
const INTENT_SYSTEM = `أنت مساعد LifeFlow الذكي. مهمتك تحليل رسالة المستخدم وإرجاع JSON فقط بهذا الشكل بدون أي نص إضافي:
{
  "intent": "create_task|update_task|delete_task|complete_task|reschedule_task|log_mood|check_habit|schedule_exam|schedule_plan|ask_question|life_summary|plan_day|analyze|chat",
  "confidence": 0.0-1.0,
  "entities": {
    "task_title": "عنوان المهمة",
    "task_id": "id إن وجد",
    "priority": "urgent|high|medium|low",
    "due_date": "YYYY-MM-DD أو today أو tomorrow أو next week",
    "due_time": "HH:MM",
    "category": "university|work|health|fitness|finance|personal|social|learning|other",
    "mood_score": 1-10,
    "emotions": ["..."],
    "habit_name": "اسم العادة",
    "note": "ملاحظة",
    "reschedule_to": "التاريخ الجديد",
    "items_to_create": [{"title":"...","priority":"...","due_date":"...","category":"..."}],
    "exam_subjects": [{"subject":"اسم المادة","exam_date":"YYYY-MM-DD","lectures_count":5,"lecture_hours":2}],
    "study_start_date": "YYYY-MM-DD",
    "include_prayers": true,
    "schedule_title": "عنوان الجدول",
    "schedule_items": [{"title":"...","date":"YYYY-MM-DD","time":"HH:MM","duration_minutes":60,"category":"...","priority":"..."}]
  },
  "reply": "رد مختصر بالعربية",
  "needs_confirmation": true|false,
  "confirmation_message": "هل تريد أن أقوم بـ...؟"
}

قواعد:
- needs_confirmation = true للحذف أو التعديل الجماعي أو الجدولة الضخمة
- needs_confirmation = false للإضافة البسيطة والأسئلة
- اضف/عندي/لازم/محتاج → create_task
- خلص/انتهيت/عملت → complete_task
- كيف حالي/مزاجي/شعوري → log_mood
- اعطني خطة/نظم يومي → plan_day
- احذف/ألغِ → delete_task (needs_confirmation=true)
- أجّل/أخّر → reschedule_task (needs_confirmation=true)
- امتحان/اختبار/مذاكرة مع مواد → schedule_exam (needs_confirmation=true)
- جدول/نظم لي مع تفاصيل → schedule_plan (needs_confirmation=true)
- للجدولة الذكية: اسحب كل المعلومات من الرسالة
- الأولوية: urgent للامتحانات، high للمهمة اليومية المهمة
- إذا ذكر المستخدم الصلاة أو صلاة أو يريد إدراج الصلوات: include_prayers = true
- لا تضع في schedule_items أكثر من 8 ساعات دراسة يومياً (قاعدة صارمة)
- وزّع المحاضرات بالتساوي على عدد الأيام المتاحة قبل الامتحان
- lecture_hours هي مدة المحاضرة الواحدة (ليس إجمالي المادة)`;

async function detectIntent(userMessage, context = {}) {
  const contextStr = context.recentTasks?.length
    ? `\nمهام حالية: ${context.recentTasks.slice(0,5).map(t=>`${t.title}(${t.due_date||'?'})`).join(', ')}`
    : '';
  const dateStr = `\nالتاريخ الحالي: ${context.today || new Date().toISOString().split('T')[0]}`;
  const prompt  = `${userMessage}${contextStr}${dateStr}`;

  let raw = '';
  try {
    raw = await chat(INTENT_SYSTEM, prompt, { temperature: 0.1, maxTokens: 800 });
    let jsonStr = raw;
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) jsonStr = jsonMatch[0];
    const parsed = JSON.parse(jsonStr);
    logger.info(`[CMD-ENGINE] Detected intent: ${parsed.intent} (${parsed.confidence})`);
    return parsed;
  } catch (e) {
    logger.warn('[CMD-ENGINE] Intent detection failed:', e.message, '| Raw:', raw?.substring(0, 200));
    return { intent: 'chat', confidence: 0.5, entities: {}, reply: null, needs_confirmation: false };
  }
}

// ── Action Executors ──────────────────────────────────────────────────────────
async function executeAction(intent, entities, userId, timezone = 'Africa/Cairo') {
  const { Task, Habit, MoodEntry } = getModels();
  const moment = require('moment-timezone');
  const now = moment().tz(timezone);

  function resolveDate(dateStr) {
    if (!dateStr) return null;
    const lower = (dateStr || '').toLowerCase().trim();
    if (lower === 'today' || lower === 'اليوم')     return now.format('YYYY-MM-DD');
    if (['tomorrow','بكره','غداً','غدا'].includes(lower)) return now.clone().add(1,'day').format('YYYY-MM-DD');
    if (['next week','الأسبوع القادم'].includes(lower))  return now.clone().add(7,'days').format('YYYY-MM-DD');
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
    const parsed = moment(dateStr, ['YYYY-MM-DD','DD/MM/YYYY','D/M/YYYY'], true);
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : now.clone().add(1,'day').format('YYYY-MM-DD');
  }

  switch (intent) {

    case 'create_task': {
      const items = entities.items_to_create?.length > 0
        ? entities.items_to_create
        : [{ title: entities.task_title, priority: entities.priority, due_date: entities.due_date, category: entities.category }];

      const created = [];
      for (const item of items) {
        if (!item.title) continue;
        const task = await Task.create({
          user_id : userId,
          title   : item.title,
          priority: item.priority || 'medium',
          status  : 'pending',
          category: item.category || entities.category || 'personal',
          due_date: resolveDate(item.due_date || entities.due_date),
          notes   : entities.note || null,
        });
        created.push(task);
        logger.info(`[CMD-ENGINE] Created task: "${task.title}" for user ${userId}`);
      }
      return { success: true, action: 'create_task', data: created, count: created.length };
    }

    case 'complete_task': {
      const tasks = await Task.findAll({ where: { user_id: userId, status: { [Op.in]: ['pending','in_progress'] } } });
      const title = (entities.task_title || '').toLowerCase().trim();
      if (!title) return { success: false, message: 'لم تحدد اسم المهمة التي أنجزتها' };

      const match = tasks.find(t => {
        const tl = t.title.toLowerCase();
        return tl.includes(title) || title.includes(tl.substring(0, Math.min(10, tl.length)));
      });
      if (!match) {
        const taskList = tasks.slice(0,5).map(t=>`"${t.title}"`).join(', ');
        return { success: false, message: `لم أجد المهمة. مهامك الحالية: ${taskList || 'لا توجد مهام'}` };
      }
      await match.update({ status: 'completed', completed_at: new Date() });
      return { success: true, action: 'complete_task', data: match };
    }

    case 'reschedule_task': {
      const tasks = await Task.findAll({ where: { user_id: userId, status: { [Op.in]: ['pending','in_progress'] } } });
      const title = (entities.task_title || '').toLowerCase();
      const match = tasks.find(t => t.title.toLowerCase().includes(title));
      if (!match) return { success: false, message: 'لم أجد المهمة المحددة' };

      const newDate = resolveDate(entities.reschedule_to || entities.due_date);
      await match.update({ due_date: newDate, reschedule_count: (match.reschedule_count || 0) + 1 });
      return { success: true, action: 'reschedule_task', data: match, new_date: newDate };
    }

    case 'delete_task': {
      const tasks = await Task.findAll({ where: { user_id: userId } });
      const title = (entities.task_title || '').toLowerCase();
      const match = tasks.find(t => t.title.toLowerCase().includes(title));
      if (!match) return { success: false, message: 'لم أجد المهمة المحددة للحذف' };
      const titleCopy = match.title;
      await match.destroy();
      return { success: true, action: 'delete_task', data: { title: titleCopy } };
    }

    case 'log_mood': {
      const score = Math.min(10, Math.max(1, parseInt(entities.mood_score) || 5));
      const today = now.format('YYYY-MM-DD');
      const [entry, created_] = await MoodEntry.findOrCreate({
        where   : { user_id: userId, entry_date: today },
        defaults: {
          user_id    : userId,
          entry_date : today,
          mood_score : score,
          emotions   : Array.isArray(entities.emotions) ? entities.emotions : [],
          journal_entry: entities.note || null,
        }
      });
      if (!created_) {
        await entry.update({
          mood_score   : score,
          emotions     : Array.isArray(entities.emotions) ? entities.emotions : entry.emotions,
          journal_entry: entities.note || entry.journal_entry,
        });
      }
      return { success: true, action: 'log_mood', data: { mood_score: score, entry_date: today } };
    }

    case 'plan_day': {
      const today = now.format('YYYY-MM-DD');
      const [todayTasks, pendingTasks, habits] = await Promise.all([
        Task.findAll({ where: { user_id: userId, status: 'pending', due_date: today }, order: [['priority','ASC']], limit: 10 }),
        Task.findAll({ where: { user_id: userId, status: 'pending' }, order: [['due_date','ASC']], limit: 8 }),
        Habit.findAll({ where: { user_id: userId, is_active: true }, limit: 5 }),
      ]);
      return { success: true, action: 'plan_day', data: { today_tasks: todayTasks, pending_tasks: pendingTasks, habits } };
    }

    // ── Exam Scheduler ─────────────────────────────────────────────────────────
    case 'schedule_exam': {
      const subjects = entities.exam_subjects || [];
      if (!subjects.length) return { success: false, message: 'لم أفهم المواد والتواريخ. مثال: "مادة X امتحانها Y وعليها Z محاضرات"' };

      const MAX_STUDY_HOURS_PER_DAY = 8;  // أقصى ساعات دراسة يومية
      const MAX_STUDY_MINS_PER_DAY  = MAX_STUDY_HOURS_PER_DAY * 60;

      const createdTasks = [];
      const today      = now.format('YYYY-MM-DD');
      const startDate  = entities.study_start_date ? moment.tz(entities.study_start_date, timezone) : now.clone();

      // Track daily study minutes across ALL subjects to avoid overloading
      const dailyMinutesUsed = {}; // { 'YYYY-MM-DD': totalMinsUsed }

      for (const subject of subjects) {
        const examDate      = moment.tz(subject.exam_date, timezone);
        const lecturesCount = parseInt(subject.lectures_count) || 5;
        const lectureHours  = Math.min(parseFloat(subject.lecture_hours) || 2, 4); // cap per lecture at 4h
        const lectureMinutes = lectureHours * 60;
        const daysUntilExam = examDate.diff(startDate, 'days');
        if (daysUntilExam < 0) continue;

        const studyDays = Math.max(1, daysUntilExam - 1);
        // Calculate max lectures per day respecting the daily hour cap
        const maxLecturesPerDay = Math.max(1, Math.floor(MAX_STUDY_MINS_PER_DAY / lectureMinutes));
        // Distribute evenly but don't exceed the daily cap
        const lecturesPerDay = Math.min(
          Math.ceil(lecturesCount / studyDays),
          maxLecturesPerDay
        );

        let lectureIndex = 1;
        let dayOffset    = 0;

        while (lectureIndex <= lecturesCount && dayOffset < studyDays * 3) { // *3 overflow guard
          const studyDate    = startDate.clone().add(dayOffset, 'days');
          const studyDateStr = studyDate.format('YYYY-MM-DD');
          dayOffset++;

          if (studyDateStr < today) continue;
          // Skip the exam date itself for this subject
          if (studyDateStr === examDate.format('YYYY-MM-DD')) continue;

          // How many minutes already scheduled on this day across all subjects?
          const usedMins   = dailyMinutesUsed[studyDateStr] || 0;
          const available  = MAX_STUDY_MINS_PER_DAY - usedMins;
          if (available <= 0) continue; // day is full, try next

          // How many lectures can we fit today?
          const maxToday      = Math.max(1, Math.floor(available / lectureMinutes));
          const remaining     = lecturesCount - lectureIndex + 1;
          const toStudyToday  = Math.min(lecturesPerDay, maxToday, remaining);
          const endLecture    = lectureIndex + toStudyToday - 1;
          const minsToday     = toStudyToday * lectureMinutes;

          const task = await Task.create({
            user_id           : userId,
            title             : toStudyToday === 1
              ? `📖 مذاكرة ${subject.subject} - محاضرة ${lectureIndex}`
              : `📚 مذاكرة ${subject.subject} - محاضرات ${lectureIndex}-${endLecture}`,
            priority          : 'high',
            status            : 'pending',
            category          : 'university',
            due_date          : studyDateStr,
            notes             : `${subject.subject} | محاضرات: ${lectureIndex} إلى ${endLecture} | الامتحان: ${subject.exam_date} | المدة المقدرة: ${minsToday} دقيقة (${(minsToday/60).toFixed(1)} ساعة)`,
            estimated_minutes : minsToday,
          });
          createdTasks.push(task);
          dailyMinutesUsed[studyDateStr] = usedMins + minsToday;
          lectureIndex += toStudyToday;
        }

        // Review task (day before exam)
        const reviewDate = examDate.clone().subtract(1,'day').format('YYYY-MM-DD');
        if (reviewDate >= today) {
          const reviewTask = await Task.create({
            user_id           : userId,
            title             : `🔁 مراجعة شاملة - ${subject.subject}`,
            priority          : 'urgent',
            status            : 'pending',
            category          : 'university',
            due_date          : reviewDate,
            notes             : `مراجعة نهائية قبل امتحان ${subject.subject} يوم ${subject.exam_date}`,
            estimated_minutes : Math.min(lecturesCount * 30, 120), // max 2hrs review
          });
          createdTasks.push(reviewTask);
        }

        // Exam day task
        const examTask = await Task.create({
          user_id : userId,
          title   : `🎯 امتحان ${subject.subject}`,
          priority: 'urgent',
          status  : 'pending',
          category: 'university',
          due_date: examDate.format('YYYY-MM-DD'),
          notes   : `يوم الامتحان - ${subject.subject}`,
        });
        createdTasks.push(examTask);
      }

      // ── Add prayer tasks if requested or if schedule spans multiple days ──────
      if (entities.include_prayers) {
        const prayerDays = [...new Set(createdTasks.map(t => t.due_date))].filter(d => d >= today);
        const PRAYERS = [
          { name: '🕌 صلاة الفجر',   time: '05:00', mins: 15 },
          { name: '🕌 صلاة الظهر',   time: '12:30', mins: 15 },
          { name: '🕌 صلاة العصر',   time: '15:45', mins: 15 },
          { name: '🕌 صلاة المغرب',  time: '18:15', mins: 15 },
          { name: '🕌 صلاة العشاء',  time: '20:00', mins: 15 },
        ];
        for (const day of prayerDays) {
          for (const prayer of PRAYERS) {
            await Task.create({
              user_id           : userId,
              title             : prayer.name,
              priority          : 'urgent',
              status            : 'pending',
              category          : 'personal',
              due_date          : day,
              notes             : `وقت تقريبي: ${prayer.time}`,
              estimated_minutes : prayer.mins,
            });
          }
        }
        logger.info(`[CMD-ENGINE] Added prayers for ${prayerDays.length} study days`);
      }

      logger.info(`[CMD-ENGINE] Created ${createdTasks.length} exam study tasks for user ${userId}`);
      return {
        success : true,
        action  : 'schedule_exam',
        data    : createdTasks,
        count   : createdTasks.length,
        subjects: subjects.map(s => s.subject),
      };
    }

    // ── General Smart Scheduler ────────────────────────────────────────────────
    case 'schedule_plan': {
      const items = entities.schedule_items || [];
      if (!items.length) return { success: false, message: 'لم أفهم تفاصيل الجدول، حدد المهام والتواريخ' };

      // Validate: no more than 8 study hours per day across all items
      const MAX_STUDY_MINS_PER_DAY = 8 * 60;
      const dailyMins = {};
      const createdTasks = [];

      for (const item of items) {
        if (!item.title) continue;
        const dateKey    = resolveDate(item.date);
        const itemMins   = item.duration_minutes || 60;
        const isStudy    = (item.category === 'university' || item.category === 'learning' ||
                            /مذاكر|مراجع|درس|دراس/.test(item.title));

        // Skip if daily study limit exceeded
        if (isStudy) {
          dailyMins[dateKey] = (dailyMins[dateKey] || 0) + itemMins;
          if (dailyMins[dateKey] > MAX_STUDY_MINS_PER_DAY) {
            logger.warn(`[CMD-ENGINE] Skipping "${item.title}" on ${dateKey} — daily limit exceeded`);
            continue;
          }
        }

        const task = await Task.create({
          user_id           : userId,
          title             : item.title,
          priority          : item.priority || 'medium',
          status            : 'pending',
          category          : item.category || 'personal',
          due_date          : dateKey,
          notes             : item.time ? `الوقت: ${item.time}` : null,
          estimated_minutes : itemMins,
        });
        createdTasks.push(task);
      }

      // ── Add prayer tasks if requested ─────────────────────────────────────────
      if (entities.include_prayers) {
        const prayerDays = [...new Set(createdTasks.map(t => t.due_date))];
        const today      = now.format('YYYY-MM-DD');
        const PRAYERS    = [
          { name: '🕌 صلاة الفجر',   time: '05:00', mins: 15 },
          { name: '🕌 صلاة الظهر',   time: '12:30', mins: 15 },
          { name: '🕌 صلاة العصر',   time: '15:45', mins: 15 },
          { name: '🕌 صلاة المغرب',  time: '18:15', mins: 15 },
          { name: '🕌 صلاة العشاء',  time: '20:00', mins: 15 },
        ];
        for (const day of prayerDays) {
          if (day < today) continue;
          for (const prayer of PRAYERS) {
            await Task.create({
              user_id           : userId,
              title             : prayer.name,
              priority          : 'urgent',
              status            : 'pending',
              category          : 'personal',
              due_date          : day,
              notes             : `وقت تقريبي: ${prayer.time}`,
              estimated_minutes : prayer.mins,
            });
          }
        }
      }

      return { success: true, action: 'schedule_plan', data: createdTasks, count: createdTasks.length, title: entities.schedule_title || 'جدول جديد' };
    }

    case 'life_summary':
    case 'analyze': {
      const today   = now.format('YYYY-MM-DD');
      const weekAgo = now.clone().subtract(7,'days').format('YYYY-MM-DD');
      const [pendingTasks, completedThisWeek, todayMood, habits] = await Promise.all([
        Task.findAll({ where: { user_id: userId, status: 'pending' }, limit: 10 }),
        Task.findAll({ where: { user_id: userId, status: 'completed', completed_at: { [Op.gte]: new Date(weekAgo) } } }),
        MoodEntry.findOne({ where: { user_id: userId, entry_date: today } }),
        Habit.findAll({ where: { user_id: userId, is_active: true } }),
      ]);
      return {
        success: true, action: 'analyze',
        data: {
          pending_count       : pendingTasks.length,
          completed_this_week : completedThisWeek.length,
          today_mood          : todayMood?.mood_score,
          active_habits       : habits.length,
          urgent_tasks        : pendingTasks.filter(t => t.priority === 'urgent').length,
        }
      };
    }

    default:
      return { success: true, action: 'chat', data: null };
  }
}

// ── Context Builder ────────────────────────────────────────────────────────────
async function buildUserContext(userId, timezone) {
  const { Task, Habit, MoodEntry } = getModels();
  const moment = require('moment-timezone');
  const today  = moment().tz(timezone).format('YYYY-MM-DD');

  try {
    const [tasks, completedToday, todayMood, habits] = await Promise.all([
      Task.findAll({
        where: { user_id: userId, status: { [Op.in]: ['pending','in_progress'] } },
        order: [['due_date','ASC']],
        limit: 15,
      }),
      Task.findAll({
        where: {
          user_id: userId,
          status: 'completed',
          due_date: { [Op.gte]: new Date(today + 'T00:00:00.000Z'), [Op.lte]: new Date(today + 'T23:59:59.999Z') },
        },
        limit: 10,
      }),
      MoodEntry.findOne({ where: { user_id: userId, entry_date: today } }),
      Habit.findAll({ where: { user_id: userId, is_active: true }, limit: 10 }),
    ]);
    const allTodayTasks = [...tasks, ...completedToday].filter(t => {
      if (!t.due_date) return false;
      const d = typeof t.due_date === 'string' ? t.due_date.substring(0, 10) : (t.due_date instanceof Date ? t.due_date.toISOString().substring(0, 10) : '');
      return d === today;
    });
    return {
      recentTasks  : tasks.map(t => ({ id: t.id, title: t.title, priority: t.priority, due_date: t.due_date, status: t.status, category: t.category })),
      completedToday: completedToday.length,
      todayTasks   : allTodayTasks.length,
      todayMood    : todayMood?.mood_score || null,
      habits       : habits.map(h => ({ id: h.id, name: h.name_ar || h.name, category: h.category })),
      today,
    };
  } catch (e) {
    logger.error('[CMD-ENGINE] buildUserContext error:', e.message);
    return { recentTasks: [], todayMood: null, habits: [], today };
  }
}

// ── Build Action Summary String ────────────────────────────────────────────────
function buildActionSummary(actionResult) {
  if (!actionResult?.success || actionResult.action === 'chat') return null;
  const a = actionResult;
  switch (a.action) {
    case 'create_task':    return `✅ تمت إضافة ${a.count} مهمة: ${(a.data||[]).slice(0,2).map(t=>t.title).join('، ')}`;
    case 'complete_task':  return `✅ تم إنهاء المهمة: "${a.data?.title}"`;
    case 'reschedule_task':return `✅ تم تأجيل "${a.data?.title}" إلى ${a.new_date}`;
    case 'delete_task':    return `✅ تم حذف "${a.data?.title}"`;
    case 'log_mood':       return `✅ تم تسجيل المزاج ${a.data?.mood_score}/10`;
    case 'plan_day': {
      const t = a.data?.today_tasks?.length || 0;
      return `✅ خطة اليوم جاهزة: ${t} مهمة اليوم`;
    }
    case 'schedule_exam': {
      const tasksByDay = {};
      (a.data||[]).forEach(t => {
        if (!tasksByDay[t.due_date]) tasksByDay[t.due_date] = 0;
        tasksByDay[t.due_date] += (t.estimated_minutes || 0);
      });
      const maxDayHrs = Math.max(...Object.values(tasksByDay).map(m=>m/60), 0);
      return `✅ تم إنشاء ${a.count} مهمة لمواد: ${(a.subjects||[]).join('، ')} | أقصى حمل يومي: ${maxDayHrs.toFixed(1)} ساعة`;
    }
    case 'schedule_plan':  return `✅ تم إنشاء جدول "${a.title}" بـ ${a.count} مهمة`;
    case 'analyze': {
      const d = a.data || {};
      return `📊 تحليلك: ${d.pending_count} معلقة | ${d.completed_this_week} منجزة هذا الأسبوع | مزاج ${d.today_mood||'غير مسجل'}/10`;
    }
    default: return null;
  }
}

// ── Main Process Command (Unified Entry) ──────────────────────────────────────
async function processCommand(userId, message, timezone = 'Africa/Cairo', pendingConfirmation = null) {
  try {
    const context       = await buildUserContext(userId, timezone);
    const intentCategory = classifyIntent(message);

    // ── Handle pending confirmation ─────────────────────────────────────────
    if (pendingConfirmation) {
      const confirmWords = ['نعم','أيوه','يلا','اعمل','موافق','ok','yes','أكد','تمام','كمّل','طيب','حلو','ابدأ'];
      const rejectWords  = ['لا','مش عايز','ألغِ','cancel','no','بلاش','لأ'];
      const msgLower     = message.trim().toLowerCase();

      if (confirmWords.some(w => msgLower.includes(w))) {
        const result = await executeAction(pendingConfirmation.intent, pendingConfirmation.entities, userId, timezone);
        const actionSummary = buildActionSummary(result);
        const convResult    = await processConversation(userId, message, timezone, result, actionSummary);
        return {
          reply              : convResult.reply,
          action_taken       : result,
          needs_confirmation : false,
          pending_action     : null,
          intent             : pendingConfirmation.intent,
          suggestions        : convResult.suggestions,
          context_used       : convResult.context,
        };
      }

      if (rejectWords.some(w => msgLower.includes(w))) {
        const convResult = await processConversation(userId, 'ألغيت الأمر', timezone, null, null);
        return {
          reply              : convResult.reply,
          action_taken       : null,
          needs_confirmation : false,
          pending_action     : null,
          suggestions        : convResult.suggestions,
        };
      }
    }

    // ── Route by intent category ────────────────────────────────────────────
    if (intentCategory === 'task_action') {
      // Detect specific intent via AI
      const intentData = await detectIntent(message, context);
      logger.info(`[CMD-ENGINE] Specific intent: ${intentData.intent} | confidence: ${intentData.confidence}`);

      // Needs confirmation (bulk ops, delete, schedule)
      if (intentData.needs_confirmation) {
        let previewMsg = intentData.confirmation_message || `هل تريد أن أقوم بـ ${intentData.intent.replace(/_/g,' ')}؟`;

        if (intentData.intent === 'schedule_exam' && intentData.entities?.exam_subjects?.length) {
          const subjects   = intentData.entities.exam_subjects;
          const totalLectures = subjects.reduce((s,x)=> s + (parseInt(x.lectures_count)||0), 0);
          const totalHours    = subjects.reduce((s,x)=> s + (parseInt(x.lectures_count)||0) * (parseFloat(x.lecture_hours)||2), 0);
          const previewLines  = subjects.map(s =>
            `📚 ${s.subject}: امتحان ${s.exam_date} | ${s.lectures_count} محاضرات × ${s.lecture_hours}ساعة = ${(parseInt(s.lectures_count||0)*parseFloat(s.lecture_hours||2)).toFixed(0)} ساعة إجمالي`
          ).join('\n');
          const prayerNote = intentData.entities?.include_prayers ? '\n🕌 + إضافة الصلوات الخمس يومياً' : '';
          previewMsg = `سأنشئ جدول مذاكرة ذكي (بحد أقصى 8 ساعات/يوم):\n${previewLines}\n📊 إجمالي: ${totalLectures} محاضرة = ${totalHours.toFixed(0)} ساعة موزعة على أيام${prayerNote}\n\nهل تؤكد؟`;
        } else if (intentData.intent === 'delete_task') {
          previewMsg = `هل تريد حذف "${intentData.entities.task_title}"؟ هذا الإجراء لا يمكن التراجع عنه.`;
        } else if (intentData.intent === 'schedule_plan' && intentData.entities?.schedule_items?.length) {
          const items = intentData.entities.schedule_items;
          previewMsg = `سأنشئ جدول "${intentData.entities.schedule_title || 'جديد'}" بـ ${items.length} بنود:\n${items.slice(0,3).map(i=>`• ${i.title} (${i.date})`).join('\n')}\n\nهل تؤكد؟`;
        }

        // Store user msg in conversation history (no action yet)
        await processConversation(userId, message, timezone, null, null);

        return {
          reply              : previewMsg,
          action_taken       : null,
          needs_confirmation : true,
          pending_action     : { intent: intentData.intent, entities: intentData.entities },
          intent             : intentData.intent,
          suggestions        : SUGGESTION_CHIPS.task_action,
        };
      }

      // Execute immediately
      let actionResult = null;
      const actionableIntents = ['create_task','complete_task','reschedule_task','delete_task','log_mood','plan_day','schedule_exam','schedule_plan','life_summary','analyze','check_habit'];
      if (actionableIntents.includes(intentData.intent) && intentData.confidence > 0.55) {
        actionResult = await executeAction(intentData.intent, intentData.entities, userId, timezone);
      }

      const actionSummary = buildActionSummary(actionResult);
      const convResult    = await processConversation(userId, message, timezone, actionResult, actionSummary);

      return {
        reply              : convResult.reply,
        action_taken       : actionResult,
        needs_confirmation : false,
        pending_action     : null,
        intent             : intentData.intent,
        suggestions        : convResult.suggestions,
        context_used       : convResult.context,
      };

    } else {
      // Pure conversational: question / advice / general
      const convResult = await processConversation(userId, message, timezone, null, null);
      return {
        reply              : convResult.reply,
        action_taken       : null,
        needs_confirmation : false,
        pending_action     : null,
        intent             : intentCategory,
        suggestions        : convResult.suggestions,
        context_used       : convResult.context,
      };
    }

  } catch (err) {
    logger.error('[CMD-ENGINE] Critical error:', err.message, err.stack?.substring(0, 300));
    return {
      reply              : 'عذراً، حدث خطأ في المعالجة. يرجى المحاولة مرة أخرى أو إعادة صياغة الطلب.',
      action_taken       : null,
      needs_confirmation : false,
      suggestions        : SUGGESTION_CHIPS.general,
    };
  }
}

// ── Autonomous Life Manager ────────────────────────────────────────────────────
async function runAutonomousCheck(userId, timezone = 'Africa/Cairo') {
  const { Task, MoodEntry } = getModels();
  const moment = require('moment-timezone');
  const now    = moment().tz(timezone);
  const today  = now.format('YYYY-MM-DD');
  const suggestions = [];

  try {
    // 1. Overdue tasks
    const overdue = await Task.findAll({
      where: { user_id: userId, status: 'pending', due_date: { [Op.lt]: today } },
      limit: 5,
    });
    if (overdue.length > 0) {
      suggestions.push({
        type      : 'overdue_tasks',
        priority  : 'high',
        message   : `لديك ${overdue.length} مهمة متأخرة: ${overdue.map(t=>t.title).join('، ')}`,
        action    : 'reschedule',
        task_ids  : overdue.map(t => t.id),
        tasks     : overdue.map(t => ({ id: t.id, title: t.title })),
        suggestion: 'هل تريد تأجيلهم لليوم؟',
      });
    }

    // 2. Overloaded day
    const todayTasks = await Task.findAll({ where: { user_id: userId, status: 'pending', due_date: today } });
    if (todayTasks.length > 7) {
      suggestions.push({
        type      : 'overloaded_day',
        priority  : 'medium',
        message   : `يومك مكتظ بـ ${todayTasks.length} مهام`,
        suggestion: 'أقترح نقل بعض المهام لغد. هل توافق؟',
        task_ids  : todayTasks.slice(5).map(t => t.id),
        tasks     : todayTasks.slice(5).map(t => ({ id: t.id, title: t.title })),
      });
    }

    // 3. Mood reminder (after 2pm)
    const moodToday = await MoodEntry.findOne({ where: { user_id: userId, entry_date: today } });
    if (!moodToday && now.hour() >= 14) {
      suggestions.push({
        type      : 'mood_reminder',
        priority  : 'low',
        message   : 'لم تسجل مزاجك اليوم 💭',
        suggestion: 'كيف مزاجك الآن؟ (1-10)',
      });
    }

    // 4. Tomorrow prep (after 8pm)
    const tomorrow  = now.clone().add(1,'day').format('YYYY-MM-DD');
    const tmrTasks  = await Task.findAll({ where: { user_id: userId, status: 'pending', due_date: tomorrow } });
    if (now.hour() >= 20 && tmrTasks.length > 0) {
      suggestions.push({
        type      : 'tomorrow_prep',
        priority  : 'low',
        message   : `غداً عندك ${tmrTasks.length} مهام: ${tmrTasks.slice(0,3).map(t=>t.title).join('، ')}`,
        suggestion: 'نراجع خطة الغد؟',
      });
    }

    // 5. Urgent alert
    const urgentTasks = await Task.findAll({ where: { user_id: userId, status: 'pending', priority: 'urgent' } });
    if (urgentTasks.length > 0) {
      suggestions.push({
        type      : 'urgent_alert',
        priority  : 'high',
        message   : `⚡ لديك ${urgentTasks.length} مهمة عاجلة: ${urgentTasks.slice(0,2).map(t=>t.title).join('، ')}`,
        suggestion: 'ركّز عليها الآن!',
      });
    }

    return suggestions;
  } catch (e) {
    logger.error('[AUTONOMOUS] Error:', e.message);
    return [];
  }
}

module.exports = {
  processCommand,
  runAutonomousCheck,
  buildUserContext,
  detectIntent,
  getConversationHistory,
  clearConversation,
};
