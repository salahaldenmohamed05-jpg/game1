/**
 * Scheduler Service - Cron Jobs
 * ================================
 * جدولة المهام التلقائية:
 * - التذكيرات الذكية
 * - الملخص اليومي
 * - التقرير الأسبوعي
 * - تحديث معدلات العادات
 */

const cron = require('node-cron');
const { Op } = require('sequelize');
const User = require('../models/user.model');
const Task = require('../models/task.model');
const { Habit, HabitLog } = require('../models/habit.model');
const MoodEntry = require('../models/mood.model');
const { Notification } = require('../models/insight.model');
const { aiService } = require('../ai/ai.service');
const weeklyAuditService = require('./weekly-audit.service');
const logger = require('../utils/logger');
const moment = require('moment-timezone');

let ioInstance = null;

/**
 * Initialize all schedulers
 */
function initScheduler(io) {
  ioInstance = io;
  logger.info('⏰ Initializing LifeFlow Scheduler...');

  // Daily morning briefing - 7:30 AM Cairo time
  cron.schedule('30 7 * * *', () => sendMorningBriefing(), { timezone: 'Africa/Cairo' });

  // Habit reminders check - every hour
  cron.schedule('0 * * * *', () => checkHabitReminders(), { timezone: 'Africa/Cairo' });

  // Mood check-in prompt - 8:00 PM
  cron.schedule('0 20 * * *', () => sendMoodCheckPrompt(), { timezone: 'Africa/Cairo' });

  // Evening daily summary - 9:00 PM
  cron.schedule('0 21 * * *', () => sendEveningSummary(), { timezone: 'Africa/Cairo' });

  // Weekly report + audit generation - Sunday 9:00 AM
  cron.schedule('0 9 * * 0', () => generateWeeklyReports(), { timezone: 'Africa/Cairo' });

  // Weekly audit data generation - Monday 2:00 AM (generates audit for previous week)
  cron.schedule('0 2 * * 1', () => generateAllWeeklyAudits(), { timezone: 'Africa/Cairo' });

  // Overdue tasks check - every 2 hours during work hours
  cron.schedule('0 9,11,13,15,17 * * *', () => checkOverdueTasks(), { timezone: 'Africa/Cairo' });

  // Update habit streaks - midnight
  cron.schedule('0 0 * * *', () => updateAllHabitStreaks(), { timezone: 'Africa/Cairo' });

  // Smart suggestions - every 3 hours
  cron.schedule('0 9,12,15,18 * * *', () => sendSmartSuggestions(), { timezone: 'Africa/Cairo' });

  // Step 1: Rebuild behavior profiles daily at 3:00 AM
  cron.schedule('0 3 * * *', () => rebuildAllBehaviorProfiles(), { timezone: 'Africa/Cairo' });

  // Step 2: Run daily execution loop at 8:00 AM
  cron.schedule('0 8 * * *', () => runDailyExecutionLoop(), { timezone: 'Africa/Cairo' });

  logger.info('✅ All schedulers initialized');
}

/**
 * Send morning briefing to all users
 * إرسال ملخص الصباح لجميع المستخدمين
 */
async function sendMorningBriefing() {
  try {
    logger.info('📅 Running morning briefing...');
    const users = await User.findAll({ where: { is_active: true, notifications_enabled: true } });

    for (const user of users) {
      try {
        const timezone = user.timezone || 'Africa/Cairo';
        const today = moment().tz(timezone).format('YYYY-MM-DD');
        const dayName = moment().tz(timezone).locale('ar').format('dddd');

        // Get today's scheduled tasks
        const todayTasks = await Task.findAll({
          where: {
            user_id: user.id,
            status: 'pending',
            due_date: { [Op.between]: [`${today}T00:00:00`, `${today}T23:59:59`] },
          },
          order: [['ai_priority_score', 'DESC']],
          limit: 3,
        });

        // Get habits for today
        const habits = await Habit.findAll({
          where: { user_id: user.id, is_active: true },
        });

        const topTask = todayTasks[0]?.title || null;
        const habitCount = habits.length;

        const notification = await Notification.create({
          user_id: user.id,
          type: 'smart_suggestion',
          title: `صباح الخير ${user.name.split(' ')[0]}! ☀️`,
          body: `يوم ${dayName} مليء بالفرص! لديك ${todayTasks.length} مهام اليوم${topTask ? `، أهمها: "${topTask}"` : ''} و${habitCount} عادة لمتابعتها. بالتوفيق! 💪`,
          data: { type: 'morning_briefing', tasks_count: todayTasks.length, habits_count: habitCount },
          sent_at: new Date(),
          is_sent: true,
        });

        // Emit via Socket.IO
        ioInstance?.to(`user_${user.id}`).emit('notification', notification);
      } catch (userErr) {
        logger.error(`Morning briefing failed for user ${user.id}:`, userErr.message);
      }
    }
    logger.info(`✅ Morning briefing sent to ${users.length} users`);
  } catch (error) {
    logger.error('Morning briefing cron error:', error);
  }
}

/**
 * Check habit reminders every hour
 */
async function checkHabitReminders() {
  try {
    const now = moment().tz('Africa/Cairo');
    const currentTime = now.format('HH:mm');
    const today = now.format('YYYY-MM-DD');

    // Find habits that should be reminded now
    const habits = await Habit.findAll({
      where: {
        is_active: true,
        reminder_enabled: true,
        target_time: { [Op.between]: [`${currentTime}:00`, `${currentTime}:59`] },
      },
    });

    for (const habit of habits) {
      try {
        // Check if already completed today
        const existingLog = await HabitLog.findOne({
          where: { habit_id: habit.id, log_date: today, completed: true },
        });

        if (!existingLog) {
          const notification = await Notification.create({
            user_id: habit.user_id,
            type: 'habit_reminder',
            title: `تذكير: ${habit.name} ${habit.icon}`,
            body: `حان وقت "${habit.name}"! ${habit.current_streak > 0 ? `تسلسلك الحالي ${habit.current_streak} يوم - لا تكسره! 🔥` : 'ابدأ عادة جديدة اليوم! 💪'}`,
            data: { habit_id: habit.id, habit_name: habit.name },
            sent_at: new Date(),
            is_sent: true,
          });

          ioInstance?.to(`user_${habit.user_id}`).emit('notification', notification);
        }
      } catch (err) {
        logger.error(`Habit reminder failed for habit ${habit.id}:`, err.message);
      }
    }
  } catch (error) {
    logger.error('Habit reminder cron error:', error);
  }
}

/**
 * Send mood check-in prompt at 8 PM
 * إرسال تذكير تسجيل المزاج مساءً
 */
async function sendMoodCheckPrompt() {
  try {
    const today = moment().tz('Africa/Cairo').format('YYYY-MM-DD');
    const users = await User.findAll({ where: { is_active: true, notifications_enabled: true } });

    for (const user of users) {
      try {
        // Check if already logged mood today
        const existingMood = await MoodEntry.findOne({
          where: { user_id: user.id, entry_date: today },
        });

        if (!existingMood) {
          const notification = await Notification.create({
            user_id: user.id,
            type: 'mood_check',
            title: '🌙 كيف كان يومك؟',
            body: 'حان وقت تسجيل مزاجك اليومي! خذ دقيقة لمشاركة كيف كان يومك. هذا يساعدك على فهم نمط حياتك بشكل أفضل.',
            data: { type: 'mood_check', date: today },
            sent_at: new Date(),
            is_sent: true,
          });

          ioInstance?.to(`user_${user.id}`).emit('notification', notification);
          ioInstance?.to(`user_${user.id}`).emit('mood_check_prompt', { date: today });
        }
      } catch (err) {
        logger.error(`Mood prompt failed for user ${user.id}:`, err.message);
      }
    }
  } catch (error) {
    logger.error('Mood check cron error:', error);
  }
}

/**
 * Send evening summary at 9 PM
 * إرسال ملخص المساء
 */
async function sendEveningSummary() {
  try {
    const today = moment().tz('Africa/Cairo').format('YYYY-MM-DD');
    const users = await User.findAll({ where: { is_active: true, notifications_enabled: true } });

    for (const user of users) {
      try {
        const [tasks, habitLogs] = await Promise.all([
          Task.findAll({ where: {
            user_id: user.id,
            due_date: { [Op.between]: [`${today}T00:00:00`, `${today}T23:59:59`] },
          }}),
          HabitLog.findAll({ where: { user_id: user.id, log_date: today } }),
        ]);

        const completedTasks = tasks.filter(t => t.status === 'completed').length;
        const completedHabits = habitLogs.filter(l => l.completed).length;
        const totalHabits = await Habit.count({ where: { user_id: user.id, is_active: true } });

        let message = `إليك ملخص يومك:\n`;
        message += `✅ المهام: ${completedTasks}/${tasks.length} مكتملة\n`;
        message += `🏃 العادات: ${completedHabits}/${totalHabits} مكتملة`;

        if (completedTasks === tasks.length && tasks.length > 0) {
          message += '\n\n🎉 أنجزت كل مهامك اليوم! يوم مثالي!';
        } else if (completedTasks > tasks.length / 2) {
          message += '\n\nجيد جداً! غداً يوم جديد للإنجاز المزيد.';
        } else {
          message += '\n\nلا تقلق، غداً فرصة جديدة. راجع أولوياتك وحاول مجدداً!';
        }

        const notification = await Notification.create({
          user_id: user.id,
          type: 'smart_suggestion',
          title: `🌙 ملخص يوم ${user.name.split(' ')[0]}`,
          body: message,
          data: { type: 'evening_summary', completed_tasks: completedTasks, total_tasks: tasks.length },
          sent_at: new Date(),
          is_sent: true,
        });

        ioInstance?.to(`user_${user.id}`).emit('notification', notification);
      } catch (err) {
        logger.error(`Evening summary failed for user ${user.id}:`, err.message);
      }
    }
  } catch (error) {
    logger.error('Evening summary cron error:', error);
  }
}

/**
 * Check for overdue tasks
 */
async function checkOverdueTasks() {
  try {
    const now = new Date();
    const todayStr = moment().tz('Africa/Cairo').format('YYYY-MM-DD');

    // Fetch pending/in_progress tasks with due_date up to today
    const candidateTasks = await Task.findAll({
      where: {
        status: { [Op.in]: ['pending', 'in_progress'] },
        due_date: { [Op.lte]: `${todayStr}T23:59:59` },
      },
    });

    // Apply time-aware overdue check: combine due_date + due_time, timezone-aware
    const overdueTasks = candidateTasks.filter(task => {
      if (!task.due_date) return false;
      // Get user's timezone (default Cairo)
      const tz = 'Africa/Cairo';
      let dueMoment;
      try {
        const moment = require('moment-timezone');
        dueMoment = moment.tz(task.due_date, 'YYYY-MM-DD', tz);
        if (task.due_time) {
          const [h, m] = task.due_time.split(':').map(Number);
          dueMoment = dueMoment.hour(h || 0).minute(m || 0).second(0);
        } else {
          dueMoment = dueMoment.endOf('day');
        }
        return dueMoment.isBefore(moment().tz(tz));
      } catch {
        // Fallback to UTC comparison
        const dueDate = new Date(task.due_date);
        if (task.due_time) {
          const [h, m] = task.due_time.split(':').map(Number);
          dueDate.setHours(h || 0, m || 0, 0, 0);
        }
        return dueDate < now;
      }
    });

    const userGroups = {};
    overdueTasks.forEach(task => {
      const userId = task.user_id;
      if (!userGroups[userId]) userGroups[userId] = [];
      userGroups[userId].push(task);
    });

    for (const [userId, tasks] of Object.entries(userGroups)) {
      try {
        const notification = await Notification.create({
          user_id: userId,
          type: 'task_reminder',
          title: `⚠️ مهام متأخرة (${tasks.length})`,
          body: `لديك ${tasks.length} مهمة متأخرة. أهمها: "${tasks[0].title}". هل تريد المتابعة؟`,
          data: { type: 'overdue_tasks', task_ids: tasks.map(t => t.id) },
          sent_at: new Date(),
          is_sent: true,
        });

        ioInstance?.to(`user_${userId}`).emit('notification', notification);
      } catch (err) {
        logger.error(`Overdue tasks notification failed for user ${userId}:`, err.message);
      }
    }
  } catch (error) {
    logger.error('Overdue tasks cron error:', error);
  }
}

/**
 * Update habit streaks at midnight
 */
async function updateAllHabitStreaks() {
  try {
    const yesterday = moment().tz('Africa/Cairo').subtract(1, 'day').format('YYYY-MM-DD');
    const habits = await Habit.findAll({ where: { is_active: true } });

    for (const habit of habits) {
      try {
        const yesterdayLog = await HabitLog.findOne({
          where: { habit_id: habit.id, log_date: yesterday, completed: true },
        });

        // Break streak if not completed yesterday
        if (!yesterdayLog && habit.current_streak > 0) {
          await habit.update({ current_streak: 0 });

          // Notify user of broken streak
          if (habit.current_streak > 3) {
            const notification = await Notification.create({
              user_id: habit.user_id,
              type: 'habit_reminder',
              title: `💔 انكسر تسلسل "${habit.name}"`,
              body: `للأسف انكسر تسلسلك الذي كان ${habit.current_streak} يوم. لكن لا تيأس، ابدأ مجدداً اليوم! كل يوم هو بداية جديدة.`,
              data: { habit_id: habit.id, broken_streak: habit.current_streak },
              sent_at: new Date(),
              is_sent: true,
            });
            ioInstance?.to(`user_${habit.user_id}`).emit('notification', notification);
          }
        }
      } catch (err) {
        logger.error(`Streak update failed for habit ${habit.id}:`, err.message);
      }
    }
    logger.info('✅ Habit streaks updated');
  } catch (error) {
    logger.error('Streak update cron error:', error);
  }
}

/**
 * Generate weekly reports for all users
 */
async function generateWeeklyReports() {
  try {
    logger.info('📊 Generating weekly reports...');
    const users = await User.findAll({ where: { is_active: true } });

    for (const user of users) {
      try {
        const notification = await Notification.create({
          user_id: user.id,
          type: 'insight',
          title: '📊 تقرير الأسبوع جاهز!',
          body: 'تقريرك الأسبوعي الشامل متاح الآن. تحقق من إنجازاتك، عاداتك، ومزاجك خلال الأسبوع الماضي.',
          data: { type: 'weekly_report' },
          sent_at: new Date(),
          is_sent: true,
        });
        ioInstance?.to(`user_${user.id}`).emit('notification', notification);
        ioInstance?.to(`user_${user.id}`).emit('weekly_report_ready');
      } catch (err) {
        logger.error(`Weekly report notification failed for user ${user.id}:`, err.message);
      }
    }
    logger.info(`✅ Weekly report notifications sent to ${users.length} users`);
  } catch (error) {
    logger.error('Weekly report cron error:', error);
  }
}

/**
 * Send smart contextual suggestions
 */
async function sendSmartSuggestions() {
  try {
    const now = moment().tz('Africa/Cairo');
    const hour = now.hour();
    const today = now.format('YYYY-MM-DD');

    const users = await User.findAll({
      where: { is_active: true, smart_reminders: true },
    });

    for (const user of users) {
      try {
        const tasks = await Task.findAll({
          where: { user_id: user.id, status: 'pending',
            due_date: { [Op.between]: [`${today}T00:00:00`, `${today}T23:59:59`] },
          },
          limit: 5,
        });

        if (tasks.length > 0) {
          const suggestion = getContextualSuggestion(hour, tasks, user);
          if (suggestion) {
            const notification = await Notification.create({
              user_id: user.id,
              type: 'smart_suggestion',
              title: suggestion.title,
              body: suggestion.body,
              data: { type: 'smart_suggestion' },
              sent_at: new Date(),
              is_sent: true,
            });
            ioInstance?.to(`user_${user.id}`).emit('notification', notification);
          }
        }
      } catch (err) {
        // Silent fail for smart suggestions
      }
    }
  } catch (error) {
    logger.error('Smart suggestions cron error:', error);
  }
}

function getContextualSuggestion(hour, tasks, user) {
  const topTask = tasks[0];
  if (!topTask) return null;

  if (hour === 9) {
    return {
      title: '☀️ صباح الإنجاز!',
      body: `الصباح أفضل وقت للتركيز. هل تبدأ بـ "${topTask.title}"؟ لديك ${tasks.length} مهام اليوم.`,
    };
  } else if (hour === 12) {
    return {
      title: '🌤️ نصف اليوم',
      body: `لديك ${tasks.length} مهام معلقة. بعد الغداء هو وقت رائع لإنجاز مهام أخرى!`,
    };
  } else if (hour === 15) {
    return {
      title: '⚡ دفعة طاقة!',
      body: `الساعة 3 عصراً وقت جيد لمهمة متوسطة. جرب إتمام "${topTask.title}"`,
    };
  } else if (hour === 18) {
    return {
      title: '🌇 قبل نهاية العمل',
      body: `لديك ${tasks.length} مهام لم تكتمل اليوم. هل تريد إتمام شيء قبل المساء؟`,
    };
  }
  return null;
}

/**
 * Generate weekly audits for all premium users
 * Runs Monday 2 AM — creates audit for the previous week
 */
async function generateAllWeeklyAudits() {
  try {
    logger.info('📊 Generating weekly audits for all premium users...');
    const users = await User.findAll({ where: { is_active: true } });

    let success = 0;
    let skipped = 0;
    for (const user of users) {
      try {
        // Check if user has premium/trial/enterprise plan
        const plan = user.subscription_plan || 'free';
        if (!['premium', 'enterprise', 'trial'].includes(plan)) {
          skipped++;
          continue;
        }
        const timezone = user.timezone || 'Africa/Cairo';
        await weeklyAuditService.generateWeeklyAudit(user.id, null, timezone);
        success++;
      } catch (err) {
        logger.warn(`Weekly audit generation failed for user ${user.id}:`, err.message);
      }
    }
    logger.info(`✅ Weekly audits generated: ${success} success, ${skipped} skipped (non-premium)`);
  } catch (error) {
    logger.error('Weekly audit generation cron error:', error);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 1: Rebuild Behavior Profiles for All Users (daily at 3 AM)
// ──────────────────────────────────────────────────────────────────────────────
async function rebuildAllBehaviorProfiles() {
  logger.info('🧠 [CRON] Starting daily behavior profile rebuild...');
  try {
    const behaviorService = require('./behavior.model.service');
    const users = await User.findAll({ where: { is_active: true }, attributes: ['id', 'timezone'] });

    let built = 0, failed = 0;
    for (const user of users) {
      try {
        const tz = user.timezone || 'Africa/Cairo';
        await behaviorService.buildBehaviorModel(user.id, tz, 30);
        built++;
      } catch (err) {
        failed++;
        logger.debug(`[CRON] Behavior profile build failed for user ${user.id}: ${err.message}`);
      }
    }
    logger.info(`🧠 [CRON] Behavior profiles rebuilt: ${built} success, ${failed} failed`);
  } catch (error) {
    logger.error('Behavior profile cron error:', error.message);
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Step 2: Daily Execution Loop (8 AM) — Observe → Decide → Act → Track → Learn
// ──────────────────────────────────────────────────────────────────────────────
async function runDailyExecutionLoop() {
  logger.info('🔄 [CRON] Starting daily execution loop...');
  try {
    let executionEngine;
    try { executionEngine = require('./execution.engine.service'); } catch (_) { return; }

    const users = await User.findAll({ where: { is_active: true }, attributes: ['id', 'timezone'] });

    let processed = 0;
    for (const user of users) {
      try {
        const tz = user.timezone || 'Africa/Cairo';
        await executionEngine.runDailyLoop(user.id, tz, ioInstance);
        processed++;
      } catch (err) {
        logger.debug(`[CRON] Execution loop failed for user ${user.id}: ${err.message}`);
      }
    }
    logger.info(`🔄 [CRON] Daily execution loop complete: ${processed} users processed`);
  } catch (error) {
    logger.error('Daily execution loop cron error:', error.message);
  }
}

module.exports = { initScheduler };
