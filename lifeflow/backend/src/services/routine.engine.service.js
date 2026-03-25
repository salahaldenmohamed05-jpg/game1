/**
 * Routine Engine Service  —  Phase 3
 * =====================================
 * IF → THEN rule engine for automated life routines.
 * Integrates with proactive and decision engines.
 *
 * Rule structure:
 * {
 *   id, name, description,
 *   trigger: { type, params },   // condition side
 *   action:  { type, params },   // action side
 *   enabled, priority, last_fired
 * }
 *
 * Trigger types:
 *   time           – at HH:MM (daily)
 *   energy_below   – user energy < threshold
 *   mood_below     – mood score < threshold
 *   overdue_tasks  – overdue count >= threshold
 *   habit_streak   – habit streak >= n
 *   task_completed – any / specific task completed
 *   hour_of_day    – current hour in [hours]
 *
 * Action types:
 *   create_task      – auto-create a task
 *   send_notification – push notification
 *   suggest_break    – suggest a break
 *   ai_message       – send an AI coach message
 *   update_priority  – re-prioritize pending tasks
 */

'use strict';

const moment = require('moment-timezone');
const logger  = require('../utils/logger');
const { getNow } = require('../utils/time.util');

/* ─── In-memory rule store (per user) ────────────────────────────
   Rules are stored in DB (notifications/chat tables) but evaluated
   in-memory for speed.                                            */
const ruleStore = new Map();        // userId → Rule[]
const firedLog  = new Map();        // ruleId → last fired ISO string

/* ─── Built-in rule templates ─────────────────────────────────── */
const BUILT_IN_RULES = [
  {
    id: 'builtin_morning_review',
    name: 'مراجعة الصباح',
    description: 'في الساعة 8:00 صباحاً — اقترح مراجعة مهام اليوم',
    trigger: { type: 'time', params: { time: '08:00' } },
    action:  { type: 'ai_message', params: {
      message: 'صباح الخير! 🌅 لنراجع مهامك لهذا اليوم ونضع خطة عمل فعّالة.',
      suggestions: ['اعرض مهام اليوم', 'رتّب أولوياتي', 'ما العادات المتبقية؟'],
    }},
    priority: 1, enabled: true,
  },
  {
    id: 'builtin_evening_reflection',
    name: 'تأمل المساء',
    description: 'في الساعة 21:00 — اقترح مراجعة إنجازات اليوم',
    trigger: { type: 'time', params: { time: '21:00' } },
    action:  { type: 'ai_message', params: {
      message: 'مساء الخير! 🌙 كيف كان يومك؟ لنراجع ما أنجزته اليوم ونخطط لغد أفضل.',
      suggestions: ['ماذا أنجزت اليوم؟', 'دوّن مزاجي', 'مهام الغد'],
    }},
    priority: 1, enabled: true,
  },
  {
    id: 'builtin_overdue_alert',
    name: 'تنبيه المهام المتأخرة',
    description: 'عند وجود 3+ مهام متأخرة',
    trigger: { type: 'overdue_tasks', params: { threshold: 3 } },
    action:  { type: 'send_notification', params: {
      title: '⚠️ مهام متأخرة تحتاج انتباهك',
      body:  'لديك عدة مهام متأخرة. هل تريد إعادة جدولتها؟',
      priority: 'high',
    }},
    priority: 2, enabled: true,
  },
  {
    id: 'builtin_low_energy',
    name: 'طاقة منخفضة',
    description: 'عندما تكون الطاقة < 40 — اقترح استراحة',
    trigger: { type: 'energy_below', params: { threshold: 40 } },
    action:  { type: 'suggest_break', params: {
      duration_minutes: 15,
      message: '🔋 طاقتك منخفضة. خذ استراحة 15 دقيقة، اشرب ماءً وتمدد قليلاً.',
    }},
    priority: 3, enabled: true,
  },
  {
    id: 'builtin_low_mood',
    name: 'مزاج منخفض',
    description: 'عندما يكون المزاج < 4 — رسالة تحفيزية',
    trigger: { type: 'mood_below', params: { threshold: 4 } },
    action:  { type: 'ai_message', params: {
      message: '💙 أشعر أن يومك صعب قليلاً. كل شيء سيكون بخير. ما الذي يزعجك؟',
      suggestions: ['تحدث عن مشاعري', 'اقترح تأمل', 'مهام خفيفة الآن'],
    }},
    priority: 3, enabled: true,
  },
];

/* ─── Public API ──────────────────────────────────────────────── */

/**
 * getRulesForUser(userId)
 * Returns built-in rules + any user-defined rules.
 */
function getRulesForUser(userId) {
  const userRules = ruleStore.get(userId) || [];
  return [...BUILT_IN_RULES, ...userRules].filter(r => r.enabled !== false);
}

/**
 * addRule(userId, rule)
 * Add a user-defined rule.
 */
function addRule(userId, rule) {
  const rules = ruleStore.get(userId) || [];
  const newRule = {
    id:          rule.id || `rule_${Date.now()}`,
    name:        rule.name,
    description: rule.description || '',
    trigger:     rule.trigger,
    action:      rule.action,
    priority:    rule.priority || 5,
    enabled:     rule.enabled !== false,
    created_at:  new Date().toISOString(),
    last_fired:  null,
  };
  rules.push(newRule);
  ruleStore.set(userId, rules);
  return newRule;
}

/**
 * removeRule(userId, ruleId)
 */
function removeRule(userId, ruleId) {
  const rules = (ruleStore.get(userId) || []).filter(r => r.id !== ruleId);
  ruleStore.set(userId, rules);
}

/**
 * evaluateRules(userId, context)
 * Evaluate all rules for a user against their current context.
 * Returns array of fired actions.
 *
 * @param {string} userId
 * @param {object} context  { energy, mood, overdue_count, hour, timezone, ... }
 */
async function evaluateRules(userId, context = {}) {
  const rules = getRulesForUser(userId);
  const fired  = [];
  const tz     = context.timezone || 'Africa/Cairo';
  const now    = moment().tz(tz);
  const hourNow   = now.hour();
  const minuteNow = now.minute();
  const timeStr   = `${String(hourNow).padStart(2,'0')}:${String(minuteNow).padStart(2,'0')}`;

  for (const rule of rules) {
    try {
      if (!shouldFire(rule, now, firedLog)) continue;
      if (!evaluateTrigger(rule.trigger, context, timeStr, hourNow)) continue;

      // Record last fired
      firedLog.set(rule.id, now.toISOString());
      logger.info(`[ROUTINE] Rule fired: "${rule.name}" for user ${userId}`);

      fired.push({
        rule_id:     rule.id,
        rule_name:   rule.name,
        triggered_at: now.toISOString(),
        action:      rule.action,
      });
    } catch (err) {
      logger.warn(`[ROUTINE] Rule eval error (${rule.id}):`, err.message);
    }
  }

  return fired;
}

/* ─── Trigger evaluator ───────────────────────────────────────── */

function evaluateTrigger(trigger, context, timeStr, hourNow) {
  const { type, params } = trigger;

  switch (type) {
    case 'time': {
      // Fire within a 5-minute window of the configured time
      const [th, tm] = (params.time || '08:00').split(':').map(Number);
      const nowMinutes = hourNow * 60 + parseInt(timeStr.split(':')[1]);
      const ruleMinutes = th * 60 + tm;
      return Math.abs(nowMinutes - ruleMinutes) <= 5;
    }

    case 'hour_of_day':
      return (params.hours || []).includes(hourNow);

    case 'energy_below':
      return (context.energy ?? 100) < (params.threshold ?? 40);

    case 'mood_below':
      return (context.mood ?? 10) < (params.threshold ?? 4);

    case 'overdue_tasks':
      return (context.overdue_count ?? 0) >= (params.threshold ?? 3);

    case 'habit_streak':
      return (context.best_streak ?? 0) >= (params.min_streak ?? 7);

    case 'task_completed':
      return context.last_completed_task != null;

    default:
      return false;
  }
}

/**
 * Prevent double-firing the same rule within a cooldown window.
 */
function shouldFire(rule, now, log) {
  const lastFired = log.get(rule.id);
  if (!lastFired) return true;
  const cooldownMinutes = rule.cooldown_minutes ?? 60;
  const minutesSince = now.diff(moment(lastFired), 'minutes');
  return minutesSince >= cooldownMinutes;
}

/* ─── Action executor ─────────────────────────────────────────── */

/**
 * executeActions(firedRules, context)
 * Convert fired rule actions into structured response items.
 */
function executeActions(firedRules, context = {}) {
  return firedRules.map(f => {
    const { action, rule_name, triggered_at } = f;
    switch (action.type) {
      case 'ai_message':
        return {
          type:        'ai_message',
          rule:        rule_name,
          message:     action.params.message,
          suggestions: action.params.suggestions || [],
          triggered_at,
        };

      case 'send_notification':
        return {
          type:        'notification',
          rule:        rule_name,
          title:       action.params.title,
          body:        action.params.body,
          priority:    action.params.priority || 'medium',
          triggered_at,
        };

      case 'suggest_break':
        return {
          type:              'break',
          rule:              rule_name,
          duration_minutes:  action.params.duration_minutes || 10,
          message:           action.params.message,
          triggered_at,
        };

      case 'create_task':
        return {
          type:        'create_task',
          rule:        rule_name,
          task_data:   action.params,
          triggered_at,
        };

      case 'update_priority':
        return {
          type:        'update_priority',
          rule:        rule_name,
          triggered_at,
        };

      default:
        return { type: action.type, rule: rule_name, triggered_at };
    }
  });
}

/* ─── Exports ─────────────────────────────────────────────────── */
module.exports = {
  getRulesForUser,
  addRule,
  removeRule,
  evaluateRules,
  executeActions,
  BUILT_IN_RULES,
};
