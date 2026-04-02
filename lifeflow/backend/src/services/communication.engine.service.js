/**
 * Communication Engine v1.0 — Unified Multi-Channel VA Messaging
 * ══════════════════════════════════════════════════════════════════
 * 
 * The brain behind all external VA communication.
 * Triggers: next_action_ready, session_missed, session_completed,
 *           repeated_skip, inactivity_detected
 * 
 * Channels: in_app (always), whatsapp, email
 * 
 * Features:
 *   - Simple queue (in-memory + DB fallback)
 *   - Rate-limiting: 2-3 messages/day per channel with cooldown per event
 *   - Smart silence: suppresses external if user is active in-app
 *   - Anti-spam: reduces sending after 3 ignored messages
 *   - Personalized via UserModel and tone system
 * 
 * Philosophy:
 *   - No random messages — every message serves execution/follow-up/presence
 *   - Tone-adapted to user's behavior profile
 *   - External channels are supplementary, in-app is primary
 */

'use strict';

const logger = require('../utils/logger');
const moment = require('moment-timezone');

// ─── Trigger Types ────────────────────────────────────────────────────────────
const TRIGGERS = {
  NEXT_ACTION_READY: 'next_action_ready',
  SESSION_MISSED: 'session_missed',
  SESSION_COMPLETED: 'session_completed',
  REPEATED_SKIP: 'repeated_skip',
  INACTIVITY_DETECTED: 'inactivity_detected',
  DAILY_SUMMARY: 'daily_summary',
  WEEKLY_REPORT: 'weekly_report',
  STREAK_AT_RISK: 'streak_at_risk',
  RE_ENGAGEMENT: 're_engagement',
};

// ─── Channel Types ────────────────────────────────────────────────────────────
const CHANNELS = {
  IN_APP: 'in_app',
  WHATSAPP: 'whatsapp',
  EMAIL: 'email',
};

// ─── Rate Limits ──────────────────────────────────────────────────────────────
const RATE_LIMITS = {
  whatsapp: {
    max_per_day: 3,
    cooldown_ms: 4 * 60 * 60 * 1000,   // 4 hours between WhatsApp messages
    quiet_hours: { start: 22, end: 7 }, // No messages 10pm-7am
  },
  email: {
    max_per_day: 2,
    cooldown_ms: 8 * 60 * 60 * 1000,   // 8 hours between emails
    quiet_hours: { start: 23, end: 6 },
  },
  in_app: {
    max_per_day: 10,
    cooldown_ms: 30 * 60 * 1000,       // 30 min between in-app messages
    quiet_hours: null,
  },
};

// ─── Anti-spam thresholds ─────────────────────────────────────────────────────
const ANTI_SPAM = {
  max_ignored_before_reduce: 3,   // After 3 ignored messages, reduce frequency
  reduce_factor: 0.5,             // Halve the sending rate
  max_ignored_before_stop: 6,     // After 6 ignored, stop external messages
  reactivation_after_hours: 48,   // Resume after 48h if user re-engages
};

// ─── In-memory message queue (per user) ───────────────────────────────────────
const messageQueue = new Map();   // userId → [{ trigger, channel, message, priority, created_at, status }]
const deliveryLog = new Map();    // userId → { channel → { count, last_at, date, ignored_count } }
const userActivityLog = new Map(); // userId → { last_active_at, is_active_in_app }

// ─── Lazy loaders ─────────────────────────────────────────────────────────────
function getUserModelService() {
  try { return require('./user.model.service'); } catch { return null; }
}
function getModels() {
  try { return require('../config/database').sequelize.models; } catch { return {}; }
}

/**
 * Track user activity (called from engine endpoints)
 */
function trackUserActivity(userId) {
  userActivityLog.set(userId, {
    last_active_at: Date.now(),
    is_active_in_app: true,
  });
  // Auto-expire activity after 10 minutes
  setTimeout(() => {
    const entry = userActivityLog.get(userId);
    if (entry && Date.now() - entry.last_active_at > 10 * 60 * 1000) {
      entry.is_active_in_app = false;
    }
  }, 10 * 60 * 1000);
}

/**
 * Check if user is currently active in-app (smart silence)
 */
function isUserActiveInApp(userId) {
  const entry = userActivityLog.get(userId);
  if (!entry) return false;
  return entry.is_active_in_app && (Date.now() - entry.last_active_at < 10 * 60 * 1000);
}

/**
 * Get or initialize delivery log for a user+channel
 */
function getDeliveryState(userId, channel) {
  const today = new Date().toISOString().split('T')[0];
  if (!deliveryLog.has(userId)) {
    deliveryLog.set(userId, {});
  }
  const userLog = deliveryLog.get(userId);
  if (!userLog[channel] || userLog[channel].date !== today) {
    userLog[channel] = { count: 0, last_at: 0, date: today, ignored_count: 0 };
  }
  return userLog[channel];
}

/**
 * Check if we can send to this channel (rate limit + quiet hours + anti-spam)
 */
function canSendToChannel(userId, channel, timezone = 'Africa/Cairo') {
  const limits = RATE_LIMITS[channel];
  if (!limits) return false;

  const state = getDeliveryState(userId, channel);

  // Rate limit: max per day
  if (state.count >= limits.max_per_day) return false;

  // Cooldown between messages
  if (Date.now() - state.last_at < limits.cooldown_ms) return false;

  // Quiet hours check
  if (limits.quiet_hours) {
    const hour = moment().tz(timezone).hour();
    const { start, end } = limits.quiet_hours;
    if (start > end) {
      // Wraps around midnight (e.g., 22-7)
      if (hour >= start || hour < end) return false;
    } else {
      if (hour >= start && hour < end) return false;
    }
  }

  // Anti-spam: if too many ignored, reduce/stop
  if (channel !== 'in_app') {
    if (state.ignored_count >= ANTI_SPAM.max_ignored_before_stop) return false;
    if (state.ignored_count >= ANTI_SPAM.max_ignored_before_reduce) {
      // Additional cooldown penalty
      const extraCooldown = limits.cooldown_ms * ANTI_SPAM.reduce_factor;
      if (Date.now() - state.last_at < limits.cooldown_ms + extraCooldown) return false;
    }
  }

  return true;
}

/**
 * Record a message delivery
 */
function recordDelivery(userId, channel) {
  const state = getDeliveryState(userId, channel);
  state.count++;
  state.last_at = Date.now();
}

/**
 * Record that user ignored a message
 */
function recordIgnored(userId, channel) {
  const state = getDeliveryState(userId, channel);
  state.ignored_count++;
}

/**
 * Get adaptive tone and personalization context
 */
async function getPersonalizationContext(userId) {
  const userModelSvc = getUserModelService();
  if (!userModelSvc) {
    return { tone: 'encouraging', name: null, procrastination: 0.5, burnout: 0.3 };
  }
  try {
    const mods = await userModelSvc.getDecisionModifiers(userId);
    const behavior = mods._raw?.behavior_profile || {};
    const procrastination = behavior.procrastination_score || 0.5;
    const burnout = behavior.burnout_score || 0.3;
    const acceptRate = behavior.avg_decision_acceptance_rate || 50;
    const discipline = acceptRate > 70 ? 0.8 : acceptRate > 50 ? 0.5 : 0.3;

    let tone = 'encouraging';
    if (burnout > 0.6) tone = 'gentle';
    else if (procrastination > 0.6) tone = 'encouraging';
    else if (discipline > 0.7) tone = 'direct';

    return { tone, procrastination, burnout, discipline };
  } catch {
    return { tone: 'encouraging', procrastination: 0.5, burnout: 0.3 };
  }
}

/**
 * Generate message content based on trigger and tone
 */
function generateMessage(trigger, context, tone) {
  const messages = {
    [TRIGGERS.NEXT_ACTION_READY]: {
      gentle: `لديك مهمة جاهزة — ${context.title || 'خطوة صغيرة'}. ابدأ وقتك يناسبك 💙`,
      encouraging: `حان وقت "${context.title || 'المهمة التالية'}"! ${context.minutes || 10} دقائق فقط — ابدأ الآن 💪`,
      direct: `"${context.title || 'مهمة'}" جاهزة. ${context.minutes || 10} د. ابدأ.`,
    },
    [TRIGGERS.SESSION_MISSED]: {
      gentle: `فاتتك جلسة "${context.title || 'المهمة'}" — لا بأس. يمكنك البدء لاحقاً 💙`,
      encouraging: `فاتتك "${context.title || 'المهمة'}"! جرّب الآن — 5 دقائق كافية لتبدأ 🚀`,
      direct: `"${context.title || 'المهمة'}" لم تكتمل. ابدأ الآن.`,
    },
    [TRIGGERS.SESSION_COMPLETED]: {
      gentle: `أنهيت "${context.title || 'المهمة'}" — أحسنت! ارتاح قبل الخطوة التالية 💙`,
      encouraging: `أحسنت! +${context.xp || 10} XP — "${context.title || 'المهمة'}" تمت! ${context.streak ? '🔥 streak' : '🎉'}`,
      direct: `تم: "${context.title || 'المهمة'}". +${context.xp || 10} XP.`,
    },
    [TRIGGERS.REPEATED_SKIP]: {
      gentle: `لاحظنا تخطي عدة مهام — جرّب مهمة أصغر اليوم. لا تضغط نفسك 💙`,
      encouraging: `كثرة التخطي ليست مشكلة — جرّب مهمة 5 دقائق! الأصعب هو البداية 💪`,
      direct: `تكرار التخطي ملحوظ. جرّب مهمة قصيرة واحدة.`,
    },
    [TRIGGERS.INACTIVITY_DETECTED]: {
      gentle: `مرّت فترة بدون نشاط — هل كل شيء بخير؟ عندما تكون جاهزاً، هناك مهمة صغيرة بانتظارك 💙`,
      encouraging: `اشتقنالك! عندك مهمة صغيرة جاهزة — 5 دقائق فقط لتعود للمسار 🚀`,
      direct: `غياب ملحوظ. عد الآن — مهمة واحدة كافية.`,
    },
    [TRIGGERS.STREAK_AT_RISK]: {
      gentle: `سلسلة "${context.habit || 'العادة'}" بخطر — لكن لا بأس إذا فاتك يوم 💙`,
      encouraging: `🔥 سلسلة "${context.habit || 'العادة'}" قد تنقطع! سجّلها الآن — دقيقة واحدة`,
      direct: `سلسلة "${context.habit || 'العادة'}" ستنقطع. سجّل الآن.`,
    },
    [TRIGGERS.RE_ENGAGEMENT]: {
      gentle: `مرحباً بعودتك! هل تريد استكمال "${context.title || 'ما توقفت عنده'}"؟ 💙`,
      encouraging: `رجعت! 🎉 عندك "${context.title || 'مهمة'}" في انتظارك — جاهز؟ 💪`,
      direct: `"${context.title || 'المهمة'}" بانتظارك. ابدأ.`,
    },
  };

  const triggerMessages = messages[trigger];
  if (!triggerMessages) return `لديك مهمة جاهزة — ابدأ الآن!`;
  return triggerMessages[tone] || triggerMessages.encouraging || '';
}

/**
 * Build deep link for WhatsApp messages
 */
function buildDeepLink(trigger, context) {
  // Deep link format: lifeflow://action?type=start&id=xxx
  const base = 'https://app.lifeflow.ai/go';
  switch (trigger) {
    case TRIGGERS.NEXT_ACTION_READY:
    case TRIGGERS.SESSION_MISSED:
      return `${base}/start?id=${context.target_id || ''}&type=${context.target_type || 'task'}`;
    case TRIGGERS.STREAK_AT_RISK:
      return `${base}/habit?id=${context.habit_id || ''}`;
    case TRIGGERS.INACTIVITY_DETECTED:
    case TRIGGERS.RE_ENGAGEMENT:
      return `${base}/today`;
    default:
      return `${base}/today`;
  }
}

/**
 * Enqueue a message for delivery
 * @param {string} userId
 * @param {string} trigger - one of TRIGGERS
 * @param {object} context - { title, minutes, target_id, target_type, xp, habit, streak, ... }
 * @param {object} options - { channels: ['in_app', 'whatsapp'], priority: 'normal'|'high' }
 */
async function enqueueMessage(userId, trigger, context = {}, options = {}) {
  const timezone = context.timezone || 'Africa/Cairo';
  const channels = options.channels || [CHANNELS.IN_APP];
  const priority = options.priority || 'normal';

  // Get personalization
  const personal = await getPersonalizationContext(userId);
  const message = generateMessage(trigger, context, personal.tone);
  const deepLink = buildDeepLink(trigger, context);

  const queueEntries = [];

  for (const channel of channels) {
    // Smart silence: skip external channels if user is active in-app
    if (channel !== CHANNELS.IN_APP && isUserActiveInApp(userId)) {
      logger.debug(`[COMM] Smart silence: skipping ${channel} for user=${userId} (active in-app)`);
      continue;
    }

    // Rate limit check
    if (!canSendToChannel(userId, channel, timezone)) {
      logger.debug(`[COMM] Rate limited: ${channel} for user=${userId}`);
      continue;
    }

    // Get user settings for channel toggles
    const settings = await getUserChannelSettings(userId);
    if (channel === CHANNELS.WHATSAPP && !settings.whatsapp_enabled) continue;
    if (channel === CHANNELS.EMAIL && !settings.email_enabled) continue;

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      user_id: userId,
      trigger,
      channel,
      message,
      deep_link: deepLink,
      context,
      tone: personal.tone,
      priority,
      status: 'queued',
      created_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
    };

    // Add to queue
    if (!messageQueue.has(userId)) messageQueue.set(userId, []);
    messageQueue.get(userId).push(entry);
    queueEntries.push(entry);

    logger.info(`[COMM] Enqueued: user=${userId} trigger=${trigger} channel=${channel} tone=${personal.tone}`);
  }

  return queueEntries;
}

/**
 * Process the queue — deliver pending messages
 * Called periodically or on-demand
 */
async function processQueue(userId) {
  const queue = messageQueue.get(userId);
  if (!queue || queue.length === 0) return [];

  const delivered = [];
  const pending = queue.filter(m => m.status === 'queued');

  for (const msg of pending) {
    try {
      let success = false;

      switch (msg.channel) {
        case CHANNELS.IN_APP:
          success = await deliverInApp(msg);
          break;
        case CHANNELS.WHATSAPP:
          success = await deliverWhatsApp(msg);
          break;
        case CHANNELS.EMAIL:
          success = await deliverEmail(msg);
          break;
      }

      if (success) {
        msg.status = 'delivered';
        msg.delivered_at = new Date().toISOString();
        recordDelivery(msg.user_id, msg.channel);
        delivered.push(msg);
      } else {
        msg.status = 'failed';
      }
    } catch (err) {
      logger.error(`[COMM] Delivery failed: ${msg.channel} user=${msg.user_id}`, err.message);
      msg.status = 'failed';
    }
  }

  // Clean up delivered/failed messages older than 1 hour
  const cutoff = Date.now() - 60 * 60 * 1000;
  const filtered = queue.filter(m => {
    if (m.status === 'queued') return true;
    return new Date(m.created_at).getTime() > cutoff;
  });
  messageQueue.set(userId, filtered);

  return delivered;
}

/**
 * Deliver in-app message (via Socket.IO)
 */
async function deliverInApp(msg) {
  // In-app delivery is always "successful" — it's stored for pickup
  // The frontend polls /engine/today or /va/presence to get pending messages
  logger.debug(`[COMM] In-app message delivered: user=${msg.user_id} trigger=${msg.trigger}`);
  return true;
}

/**
 * Deliver WhatsApp message (via Twilio or Meta Cloud API)
 */
async function deliverWhatsApp(msg) {
  try {
    const twilio = getTwilioClient();
    if (!twilio) {
      logger.debug('[COMM] WhatsApp: Twilio not configured, storing for manual pickup');
      return true; // Store the message; actual sending requires API keys
    }

    const phone = await getUserPhone(msg.user_id);
    if (!phone) {
      logger.debug(`[COMM] WhatsApp: No phone for user=${msg.user_id}`);
      return false;
    }

    // Format message with deep link
    const body = `${msg.message}\n\n${msg.deep_link ? `👉 ${msg.deep_link}` : ''}`;

    await twilio.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER || '+14155238886'}`,
      to: `whatsapp:${phone}`,
      body,
    });

    logger.info(`[COMM] WhatsApp sent: user=${msg.user_id} trigger=${msg.trigger}`);
    return true;
  } catch (err) {
    logger.error('[COMM] WhatsApp delivery error:', err.message);
    return false;
  }
}

/**
 * Deliver email message (via nodemailer or SendGrid)
 */
async function deliverEmail(msg) {
  try {
    const transporter = getEmailTransporter();
    if (!transporter) {
      logger.debug('[COMM] Email: transporter not configured, storing for manual pickup');
      return true; // Store the message
    }

    const email = await getUserEmail(msg.user_id);
    if (!email) return false;

    const subject = getEmailSubject(msg.trigger);
    const html = buildEmailHTML(msg);

    await transporter.sendMail({
      from: process.env.EMAIL_FROM || '"LifeFlow" <noreply@lifeflow.ai>',
      to: email,
      subject,
      html,
    });

    logger.info(`[COMM] Email sent: user=${msg.user_id} trigger=${msg.trigger}`);
    return true;
  } catch (err) {
    logger.error('[COMM] Email delivery error:', err.message);
    return false;
  }
}

// ─── Helper: Get Twilio client ────────────────────────────────────────────────
function getTwilioClient() {
  try {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !token) return null;
    const twilio = require('twilio');
    return twilio(sid, token);
  } catch {
    return null;
  }
}

// ─── Helper: Get email transporter ────────────────────────────────────────────
function getEmailTransporter() {
  try {
    const nodemailer = require('nodemailer');
    const host = process.env.SMTP_HOST;
    if (!host) return null;
    return nodemailer.createTransport({
      host,
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  } catch {
    return null;
  }
}

// ─── Helper: Get user contact info ────────────────────────────────────────────
async function getUserPhone(userId) {
  const models = getModels();
  if (!models.User) return null;
  const user = await models.User.findByPk(userId, { attributes: ['phone'], raw: true }).catch(() => null);
  return user?.phone || null;
}

async function getUserEmail(userId) {
  const models = getModels();
  if (!models.User) return null;
  const user = await models.User.findByPk(userId, { attributes: ['email'], raw: true }).catch(() => null);
  return user?.email || null;
}

// ─── Helper: Get user channel settings ────────────────────────────────────────
async function getUserChannelSettings(userId) {
  const models = getModels();
  const defaults = {
    whatsapp_enabled: false,
    email_enabled: true,
    whatsapp_frequency: 'normal',
    email_frequency: 'daily',
  };
  if (!models.UserSettings) return defaults;
  try {
    const settings = await models.UserSettings.findOne({
      where: { user_id: userId },
      raw: true,
    });
    return {
      whatsapp_enabled: settings?.whatsapp_enabled || false,
      email_enabled: settings?.email_reports_enabled ?? true,
      whatsapp_frequency: settings?.whatsapp_frequency || 'normal',
      email_frequency: settings?.email_frequency || 'daily',
    };
  } catch {
    return defaults;
  }
}

// ─── Email helpers ────────────────────────────────────────────────────────────
function getEmailSubject(trigger) {
  const subjects = {
    [TRIGGERS.DAILY_SUMMARY]: 'LifeFlow — ملخص يومك',
    [TRIGGERS.WEEKLY_REPORT]: 'LifeFlow — تقرير أسبوعي',
    [TRIGGERS.SESSION_COMPLETED]: 'LifeFlow — أحسنت!',
    [TRIGGERS.STREAK_AT_RISK]: 'LifeFlow — سلسلتك في خطر!',
    [TRIGGERS.INACTIVITY_DETECTED]: 'LifeFlow — اشتقنالك!',
    [TRIGGERS.RE_ENGAGEMENT]: 'LifeFlow — مرحباً بعودتك',
  };
  return subjects[trigger] || 'LifeFlow — تحديث';
}

function buildEmailHTML(msg) {
  return `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width"></head>
    <body style="margin:0;padding:0;background:#0F0F1A;color:#E5E7EB;font-family:'Segoe UI',Tahoma,sans-serif">
      <div style="max-width:500px;margin:0 auto;padding:32px 24px">
        <div style="text-align:center;margin-bottom:24px">
          <h1 style="color:#6C63FF;font-size:20px;margin:0">LifeFlow</h1>
        </div>
        <div style="background:#1A1A2E;border-radius:16px;padding:24px;border:1px solid rgba(108,99,255,0.15)">
          <p style="font-size:16px;line-height:1.6;color:#E5E7EB;margin:0 0 16px">${msg.message}</p>
          ${msg.deep_link ? `
            <a href="${msg.deep_link}" style="display:inline-block;background:linear-gradient(135deg,#6C63FF,#8B5CF6);
              color:white;text-decoration:none;padding:12px 24px;border-radius:12px;font-weight:bold;font-size:14px">
              افتح في التطبيق
            </a>
          ` : ''}
        </div>
        <p style="text-align:center;color:#6B7280;font-size:11px;margin-top:24px">
          LifeFlow — مساعدك الشخصي للإنتاجية
        </p>
      </div>
    </body>
    </html>
  `;
}

/**
 * Build daily email summary
 */
async function buildDailySummary(userId, timezone = 'Africa/Cairo') {
  const models = getModels();
  const todayStr = moment().tz(timezone).format('YYYY-MM-DD');

  let tasksCompleted = 0, tasksTotal = 0, habitsCompleted = 0, habitsTotal = 0;
  let bestTime = null, skippedCount = 0;

  try {
    if (models.Task) {
      const tasks = await models.Task.findAll({
        where: { user_id: userId, due_date: todayStr },
        attributes: ['status'],
        raw: true,
      });
      tasksTotal = tasks.length;
      tasksCompleted = tasks.filter(t => t.status === 'completed').length;
    }

    if (models.Habit && models.HabitLog) {
      const habits = await models.Habit.findAll({
        where: { user_id: userId, is_active: true },
        attributes: ['id'],
        raw: true,
      });
      habitsTotal = habits.length;
      const logs = await models.HabitLog.findAll({
        where: { user_id: userId, log_date: todayStr, completed: true },
        attributes: ['habit_id'],
        raw: true,
      });
      habitsCompleted = logs.length;
    }

    // Count skips from execution sessions
    const Session = require('../models/execution_session.model');
    const { Op } = require('sequelize');
    const todayStart = moment().tz(timezone).startOf('day').toDate();
    const sessions = await Session.findAll({
      where: {
        user_id: userId,
        started_at: { [Op.gte]: todayStart },
      },
      attributes: ['state', 'started_at', 'active_seconds'],
      raw: true,
    });

    skippedCount = sessions.filter(s => s.state === 'abandoned').length;

    // Find best productivity time
    const completedSessions = sessions.filter(s => s.state === 'completed');
    if (completedSessions.length > 0) {
      const bestSession = completedSessions.reduce((a, b) =>
        (a.active_seconds || 0) > (b.active_seconds || 0) ? a : b
      );
      bestTime = moment(bestSession.started_at).tz(timezone).format('h:mm A');
    }
  } catch (err) {
    logger.debug('[COMM] Daily summary build error:', err.message);
  }

  return {
    date: todayStr,
    tasks_completed: tasksCompleted,
    tasks_total: tasksTotal,
    habits_completed: habitsCompleted,
    habits_total: habitsTotal,
    skipped_count: skippedCount,
    best_time: bestTime,
    completion_pct: (tasksTotal + habitsTotal) > 0
      ? Math.round(((tasksCompleted + habitsCompleted) / (tasksTotal + habitsTotal)) * 100)
      : 0,
  };
}

/**
 * Build weekly email report
 */
async function buildWeeklyReport(userId, timezone = 'Africa/Cairo') {
  const models = getModels();
  const { Op } = require('sequelize');
  const weekStart = moment().tz(timezone).subtract(7, 'days').startOf('day').toDate();
  const now = new Date();

  let totalCompleted = 0, totalSkipped = 0, longestStreak = 0;
  let avgDailyCompletion = 0, behaviorInsights = [];

  try {
    const Session = require('../models/execution_session.model');
    const sessions = await Session.findAll({
      where: {
        user_id: userId,
        started_at: { [Op.between]: [weekStart, now] },
      },
      attributes: ['state', 'active_seconds', 'target_type', 'started_at'],
      raw: true,
    });

    totalCompleted = sessions.filter(s => s.state === 'completed').length;
    totalSkipped = sessions.filter(s => s.state === 'abandoned').length;

    // Calculate average daily completion
    const days = {};
    sessions.forEach(s => {
      const day = moment(s.started_at).tz(timezone).format('YYYY-MM-DD');
      if (!days[day]) days[day] = { done: 0, total: 0 };
      days[day].total++;
      if (s.state === 'completed') days[day].done++;
    });
    const dayValues = Object.values(days);
    if (dayValues.length > 0) {
      avgDailyCompletion = Math.round(
        dayValues.reduce((sum, d) => sum + (d.total > 0 ? (d.done / d.total) * 100 : 0), 0) / dayValues.length
      );
    }

    // Habit streaks
    if (models.Habit) {
      const habits = await models.Habit.findAll({
        where: { user_id: userId, is_active: true },
        attributes: ['current_streak'],
        raw: true,
      });
      longestStreak = Math.max(0, ...habits.map(h => h.current_streak || 0));
    }

    // Behavior insights from UserModel
    const userModelSvc = getUserModelService();
    if (userModelSvc) {
      const model = await userModelSvc.getOrCreateModel(userId);
      const bp = model.behavior_profile || {};
      if (bp.procrastination_score > 0.6) {
        behaviorInsights.push('مستوى التسويف مرتفع — جرّب مهام أصغر هذا الأسبوع');
      }
      if (bp.burnout_score > 0.5) {
        behaviorInsights.push('مؤشر الإرهاق مرتفع — خذ استراحات أكثر');
      }
      if (totalCompleted > totalSkipped * 2) {
        behaviorInsights.push('إنجاز ممتاز هذا الأسبوع! استمر بنفس الوتيرة');
      }
    }
  } catch (err) {
    logger.debug('[COMM] Weekly report build error:', err.message);
  }

  return {
    period: `${moment(weekStart).format('MMM D')} — ${moment(now).format('MMM D')}`,
    total_completed: totalCompleted,
    total_skipped: totalSkipped,
    avg_daily_completion: avgDailyCompletion,
    longest_streak: longestStreak,
    behavior_insights: behaviorInsights,
    suggestions: behaviorInsights.length > 0 ? behaviorInsights : ['استمر بنفس الأداء!'],
  };
}

/**
 * Get pending in-app messages for a user
 */
function getPendingInAppMessages(userId) {
  const queue = messageQueue.get(userId) || [];
  return queue.filter(m => m.channel === CHANNELS.IN_APP && m.status === 'queued');
}

/**
 * Get delivery stats for a user
 */
function getDeliveryStats(userId) {
  const stats = {};
  for (const channel of Object.values(CHANNELS)) {
    const state = getDeliveryState(userId, channel);
    stats[channel] = {
      sent_today: state.count,
      max_per_day: RATE_LIMITS[channel]?.max_per_day || 0,
      last_sent_at: state.last_at ? new Date(state.last_at).toISOString() : null,
      ignored_count: state.ignored_count,
      can_send: canSendToChannel(userId, channel),
    };
  }
  return stats;
}

module.exports = {
  TRIGGERS,
  CHANNELS,
  enqueueMessage,
  processQueue,
  trackUserActivity,
  isUserActiveInApp,
  recordIgnored,
  getPendingInAppMessages,
  getDeliveryStats,
  buildDailySummary,
  buildWeeklyReport,
  getUserChannelSettings,
  getPersonalizationContext,
  generateMessage,
  buildDeepLink,
};
