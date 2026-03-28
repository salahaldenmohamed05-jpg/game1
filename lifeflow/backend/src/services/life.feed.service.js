/**
 * Life Feed Service — Phase 16
 * ==============================
 * Generates a real-time feed of AI insights, decisions, schedule events,
 * and mood changes for the user's personal dashboard.
 *
 * Output format:
 * [
 *   {
 *     id,
 *     time: "09:00",
 *     type: "insight" | "decision" | "event" | "mood" | "achievement" | "warning",
 *     title,
 *     message,
 *     icon,
 *     confidence?,
 *     action_url?   // deep link to relevant view
 *   }
 * ]
 */

'use strict';

const logger = require('../utils/logger');

// ─── Lazy loaders ─────────────────────────────────────────────────────────────
function getModels()   { try { return require('../config/database').sequelize.models; } catch (_e) { logger.debug(`[LIFE_FEED_SERVICE] Module not available: ${_e.message}`); return {}; } }
function getLearning() { try { return require('./learning.engine.service'); } catch (_e) { logger.debug(`[LIFE_FEED_SERVICE] Module './learning.engine.service' not available: ${_e.message}`); return null; } }
function getScheduler(){ try { return require('./scheduling.engine.service'); } catch (_e) { logger.debug(`[LIFE_FEED_SERVICE] Module './scheduling.engine.service' not available: ${_e.message}`); return null; } }

// ─── Date normalizer ──────────────────────────────────────────────────────────
function normDate(val) {
  if (!val) return null;
  if (typeof val === 'string') return val.split('T')[0].split(' ')[0];
  if (val instanceof Date)     return val.toISOString().split('T')[0];
  return String(val).split('T')[0].split(' ')[0];
}

// ─── Feed item builder ────────────────────────────────────────────────────────
function buildItem(type, data) {
  const ICONS = {
    insight    : '💡',
    decision   : '⚡',
    event      : '📅',
    mood       : '😊',
    achievement: '🎉',
    warning    : '⚠️',
    habit      : '🔄',
    task       : '✅',
    tip        : '💡',
    ml         : '🤖',
  };

  return {
    id         : `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    time       : data.time || new Date().toISOString(),
    type,
    title      : data.title,
    message    : data.message,
    icon       : data.icon || ICONS[type] || '📌',
    confidence : data.confidence,
    action_url : data.action_url,
    priority   : data.priority || 'normal',
  };
}

// ─── Feed generators ──────────────────────────────────────────────────────────

async function getTaskFeedItems(userId, todayStr, { Task, Op }) {
  const items = [];
  if (!Task) return items;

  try {
    // Look for tasks updated in the last 48h OR due today/overdue
    const tasks = await Task.findAll({
      where: {
        user_id: userId,
        status  : { [Op.in]: ['pending', 'in_progress', 'completed'] },
      },
      order: [['updatedAt', 'DESC']],
      limit: 15,
    });

    const now48h = new Date(Date.now() - 48 * 60 * 60 * 1000);

    for (const t of tasks) {
      const task = t.toJSON ? t.toJSON() : t;
      const dueDateNorm = normDate(task.due_date);
      const updatedAt   = task.updatedAt || task.updated_at;
      const recentlyUpdated = updatedAt && new Date(updatedAt) >= now48h;

      if (task.status === 'completed' && recentlyUpdated) {
        items.push(buildItem('achievement', {
          time      : updatedAt,
          title     : `أنجزت: ${task.title}`,
          message   : `أحسنت! خلّصت "${task.title}"${dueDateNorm === todayStr ? ' — في الموعد المحدد 🎯' : ''} 🎉`,
          icon      : '✅',
          confidence: 100,
          action_url: '/tasks',
          priority  : task.priority === 'urgent' || task.priority === 'high' ? 'high' : 'normal',
        }));
      } else if (dueDateNorm && dueDateNorm < todayStr && task.status !== 'completed') {
        items.push(buildItem('warning', {
          time      : dueDateNorm + 'T09:00:00Z',
          title     : `مهمة متأخرة: ${task.title}`,
          message   : `"${task.title}" تجاوزت موعدها النهائي (${dueDateNorm}). اتخذ إجراءً الآن.`,
          icon      : '⏰',
          confidence: 90,
          action_url: '/tasks',
          priority  : 'high',
        }));
      } else if (dueDateNorm === todayStr && task.status !== 'completed') {
        items.push(buildItem('event', {
          time      : task.start_time || (todayStr + 'T10:00:00Z'),
          title     : `مستحقة اليوم: ${task.title}`,
          message   : `لا تنسَ "${task.title}" — موعدها اليوم! أولوية: ${task.priority === 'urgent' ? '⚡ عاجلة' : task.priority === 'high' ? '🔴 عالية' : '🔵 عادية'}`,
          icon      : '📅',
          confidence: 85,
          action_url: '/tasks',
          priority  : task.priority === 'urgent' || task.priority === 'high' ? 'high' : 'normal',
        }));
      } else if (recentlyUpdated && task.status === 'in_progress') {
        items.push(buildItem('task', {
          time      : updatedAt,
          title     : `جارٍ: ${task.title}`,
          message   : `مهمة "${task.title}" قيد التنفيذ — واصل الإنجاز! 💪`,
          icon      : '🔄',
          confidence: 75,
          action_url: '/tasks',
          priority  : 'normal',
        }));
      }
    }
  } catch (e) {
    logger.warn('[LIFE-FEED] Task feed error:', e.message);
  }
  return items;
}

async function getMoodFeedItems(userId, { MoodEntry, Op }) {
  const items = [];
  if (!MoodEntry) return items;

  try {
    const moods = await MoodEntry.findAll({
      where: {
        user_id: userId,
        [Op.or]: [
          { createdAt : { [Op.gte]: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
          { created_at: { [Op.gte]: new Date(Date.now() - 48 * 60 * 60 * 1000) } },
        ],
      },
      order: [['createdAt', 'DESC'], ['created_at', 'DESC']],
      limit: 5,
    });

    for (const m of moods) {
      const mood  = m.toJSON ? m.toJSON() : m;
      const score = mood.score || mood.mood_score || 5;
      const emoji = score >= 8 ? '😄' : score >= 6 ? '🙂' : score >= 4 ? '😐' : '😔';

      items.push(buildItem('mood', {
        time      : mood.createdAt || mood.created_at,
        title     : `مزاج ${emoji} — ${score}/10`,
        message   : score >= 7
          ? 'مزاجك جيد — وقت مثالي لإنجاز مهمة مهمة!'
          : score <= 4
          ? 'مزاجك منخفض. اهتم بنفسك أولاً — مهامك ممكن تنتظر قليلاً.'
          : 'مزاج معتدل — ابدأ بمهام خفيفة وارفع طاقتك تدريجياً.',
        icon      : emoji,
        confidence: 80,
        action_url: '/mood',
      }));
    }
  } catch (e) {
    logger.warn('[LIFE-FEED] Mood feed error:', e.message);
  }
  return items;
}

function getMLInsights(userId) {
  const items = [];
  const learning = getLearning();
  const scheduler = getScheduler();

  try {
    let mlCtx   = { bestFocusHour: 10, burnoutRisk: 0 };
    let profile = null;

    if (scheduler && typeof scheduler.getMLContext === 'function') {
      mlCtx = scheduler.getMLContext(userId) || mlCtx;
    }
    if (learning) {
      profile = learning.getUserLearningProfile(userId);
    }

    const nowHour  = new Date().getHours();
    const focusHour = mlCtx.bestFocusHour || 10;

    // Burnout warning
    if (mlCtx.burnoutRisk > 0.5) {
      items.push(buildItem('warning', {
        time      : new Date().toISOString(),
        title     : '⚠️ تنبيه إجهاد',
        message   : `نسبة خطر الإجهاد ${Math.round(mlCtx.burnoutRisk * 100)}%${mlCtx.burnoutRisk > 0.7 ? ' — مرتفعة!' : ''}. قلّل الحمل واستَرِح بين المهام.`,
        icon      : '⚠️',
        confidence: Math.round(mlCtx.burnoutRisk * 100),
        action_url: '/assistant',
        priority  : mlCtx.burnoutRisk > 0.7 ? 'high' : 'normal',
      }));
    }

    // Focus time insight — always add, not just when in window
    if (Math.abs(nowHour - focusHour) <= 1) {
      items.push(buildItem('insight', {
        time      : new Date().toISOString(),
        title     : `⭐ أفضل وقت تركيز الآن!`,
        message   : `الذكاء الاصطناعي رصد أن الساعة ${focusHour}:00 هي أفضل وقت تركيز ليك. ابدأ أهم مهمة الآن!`,
        icon      : '⭐',
        confidence: 88,
        action_url: '/assistant/daily-plan',
        priority  : 'high',
      }));
    } else {
      items.push(buildItem('tip', {
        time      : new Date().toISOString(),
        title     : `💡 نصيحة ذكاء اصطناعي`,
        message   : `أفضل وقت تركيزك اليوم: الساعة ${focusHour}:00. ${nowHour < focusHour ? `باقي ${focusHour - nowHour} ساعة — جهّز المهام الكبيرة.` : `لا تزال فعّالاً — حافظ على الزخم!`}`,
        icon      : '💡',
        confidence: 78,
        action_url: '/assistant',
      }));
    }

    // ML success rate
    const successRate = profile?.stats?.overall_success_rate ?? -1;
    if (successRate >= 0.6) {
      items.push(buildItem('achievement', {
        time      : new Date().toISOString(),
        title     : `📈 أداء ${Math.round(successRate * 100)}%`,
        message   : successRate >= 0.8
          ? `نسبة إنجازك ${Math.round(successRate * 100)}% — ممتاز! أنت في أفضل حالاتك.`
          : `نسبة إنجازك ${Math.round(successRate * 100)}% — جيد! مع قليل من التنظيم ستصل للـ 80%.`,
        icon      : successRate >= 0.8 ? '🏆' : '📈',
        confidence: Math.round(successRate * 100),
        action_url: '/performance',
      }));
    }

    // Best focus hours from ML
    const optHour = mlCtx.bestFocusHour;
    if (optHour) {
      items.push(buildItem('ml', {
        time      : new Date().toISOString(),
        title     : `🤖 تحليل ML`,
        message   : `الذكاء الاصطناعي درس أنماطك وحدّد الساعة ${optHour}:00 كأفضل وقت تركيز. الخطة اليومية مُحسَّنة وفقاً لذلك.`,
        icon      : '🤖',
        confidence: 82,
        action_url: '/assistant/daily-plan',
      }));
    }

  } catch (e) {
    logger.warn('[LIFE-FEED] ML insights error:', e.message);
    // Return at least one useful item on error
    items.push(buildItem('tip', {
      time   : new Date().toISOString(),
      title  : '💡 تحسين مستمر',
      message: 'الذكاء الاصطناعي يتعلم من أنماطك لتقديم توصيات أفضل كل يوم.',
      icon   : '💡',
      confidence: 70,
    }));
  }

  return items;
}

async function getHabitFeedItems(userId, { HabitLog, Habit, Op, todayStr }) {
  const items = [];
  if (!Habit) return items;

  try {
    const habits = await Habit.findAll({
      where : { user_id: userId, is_active: true },
      limit : 5,
    });

    for (const h of habits) {
      const habit = h.toJSON ? h.toJSON() : h;
      const habitName = habit.name_ar || habit.name || 'العادة';

      // Check if logged today (if HabitLog is available)
      let logged = false;
      if (HabitLog) {
        try {
          const logEntry = await HabitLog.findOne({
            where: {
              habit_id: habit.id,
              user_id : userId,
              [Op.or]: [
                { log_date  : todayStr },
                { createdAt : { [Op.gte]: new Date(todayStr) } },
              ],
            },
          });
          logged = !!logEntry;
        } catch (_e) { logger.debug(`[LIFE_FEED_SERVICE] Non-critical operation failed: ${_e.message}`); }
      }

      if (logged) {
        items.push(buildItem('habit', {
          time      : new Date().toISOString(),
          title     : `عادة مكتملة: ${habitName}`,
          message   : `أحسنت! سجّلت "${habitName}" اليوم. حافظ على السلسلة! 🔥`,
          icon      : '🔥',
          confidence: 100,
          action_url: '/habits',
        }));
      } else {
        // Check if it's near preferred time
        const prefHour = habit.preferred_time
          ? parseInt((habit.preferred_time || '20:00').split(':')[0])
          : null;
        const nowHour  = new Date().getHours();

        if (prefHour !== null && Math.abs(nowHour - prefHour) <= 1) {
          items.push(buildItem('event', {
            time      : new Date().toISOString(),
            title     : `🔔 حان وقت عادتك: ${habitName}`,
            message   : `حان وقت "${habitName}". لا تكسر السلسلة — كل يوم يحسب!`,
            icon      : '🔔',
            confidence: 82,
            action_url: '/habits',
            priority  : 'high',
          }));
        } else {
          items.push(buildItem('habit', {
            time      : new Date().toISOString(),
            title     : `لم تُسجَّل بعد: ${habitName}`,
            message   : `تذكّر تسجيل عادة "${habitName}" اليوم. لا تقطع سلسلة إنجازاتك!`,
            icon      : '⏰',
            confidence: 70,
            action_url: '/habits',
          }));
        }
      }
    }
  } catch (e) {
    logger.warn('[LIFE-FEED] Habit feed error:', e.message);
  }

  return items;
}

// ─── Daily AI message ─────────────────────────────────────────────────────────
function getDailyAIMessage() {
  const hour = new Date().getHours();
  let greeting, advice;

  if (hour < 9) {
    greeting = '🌅 صباح الخير!';
    advice = 'ابدأ يومك بمهمة صغيرة لبناء الزخم. كل يوم جديد فرصة جديدة.';
  } else if (hour < 12) {
    greeting = '☀️ وقت الإنجاز!';
    advice = 'الصباح وقت الطاقة العالية — خصّصه لأهم مهامك.';
  } else if (hour < 15) {
    greeting = '🌤️ استمر في التقدم!';
    advice = 'منتصف النهار مثالي للمهام المتوسطة. حافظ على الإيقاع.';
  } else if (hour < 18) {
    greeting = '⚡ اختم اليوم بقوة!';
    advice = 'اختم المهام المتبقية وجهّز قائمة الغد.';
  } else {
    greeting = '🌙 مرحلة المراجعة';
    advice = 'راجع ما أنجزته اليوم وخطط للغد. الراحة الجيدة تبني يوماً أفضل.';
  }

  return buildItem('insight', {
    time      : new Date().toISOString(),
    title     : greeting,
    message   : advice,
    icon      : '🤖',
    confidence: 90,
    action_url: '/assistant',
    priority  : 'normal',
  });
}

// ─── Main: Generate Life Feed ─────────────────────────────────────────────────
/**
 * @param {string} userId
 * @param {object} options
 * @param {string} options.timezone
 * @param {number} [options.limit]  - max feed items (default 20)
 * @returns {Promise<Array>}
 */
async function getLifeFeed(userId, options = {}) {
  const { timezone = 'Africa/Cairo', limit = 20 } = options;

  try {
    const { Op }    = require('sequelize');
    const models    = getModels();
    const todayStr  = new Date().toISOString().split('T')[0];

    const { Task, Habit, HabitLog, MoodEntry } = models;

    // Gather all feed items in parallel (use allSettled so one failure doesn't block others)
    const [taskResult, moodResult, habitResult] = await Promise.allSettled([
      getTaskFeedItems(userId, todayStr, { Task, Op }),
      getMoodFeedItems(userId, { MoodEntry, Op }),
      getHabitFeedItems(userId, { HabitLog, Habit, Op, todayStr }),
    ]);

    const mlItems  = getMLInsights(userId);         // sync, always succeeds
    const dailyMsg = getDailyAIMessage();            // always add a daily greeting

    const allItems = [
      dailyMsg,
      ...(taskResult.status  === 'fulfilled' ? taskResult.value  : []),
      ...(moodResult.status  === 'fulfilled' ? moodResult.value  : []),
      ...(habitResult.status === 'fulfilled' ? habitResult.value : []),
      ...mlItems,
    ];

    // Sort by priority (high → normal), then time (newest first)
    const sorted = allItems.sort((a, b) => {
      if (a.priority === 'high' && b.priority !== 'high') return -1;
      if (b.priority === 'high' && a.priority !== 'high') return  1;
      return new Date(b.time) - new Date(a.time);
    });

    // Deduplicate by same title (keep most recent)
    const seen  = new Set();
    const dedup = sorted.filter(item => {
      const key = `${item.type}:${item.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const feed = dedup.slice(0, limit);

    logger.info(`[LIFE-FEED] Generated ${feed.length} items for user ${userId}`);
    return feed;

  } catch (err) {
    logger.error('[LIFE-FEED] Error:', err.message);
    // Always return at least a basic daily message
    return [getDailyAIMessage()];
  }
}

module.exports = { getLifeFeed };
