/**
 * Life Context Detector — Phase 14 (Life OS Integration)
 * =========================================================
 * Detects today's life context from connected integrations + internal data.
 * Context types: meeting_heavy, recovery_day, deep_work_opportunity, travel_day, overload_day.
 * Also manages integration connection/sync.
 */

'use strict';

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

function getModels() {
  const ConnectedIntegration = require('../models/connected_integration.model');
  const ExternalEvent        = require('../models/external_event.model');
  const EnergyLog            = require('../models/energy_log.model');
  const BehavioralFlag       = require('../models/behavioral_flag.model');
  const Task                 = require('../models/task.model');
  return { ConnectedIntegration, ExternalEvent, EnergyLog, BehavioralFlag, Task };
}

// ── Context Detection ─────────────────────────────────────────────────────────

/**
 * detectTodayContext(userId, timezone)
 * Returns today's context type, recommendations, and schedule suggestions.
 */
async function detectTodayContext(userId, timezone = 'Africa/Cairo') {
  try {
    const { ConnectedIntegration, ExternalEvent, EnergyLog, BehavioralFlag, Task } = getModels();
    const today     = moment.tz(timezone).format('YYYY-MM-DD');
    const todayDate = moment.tz(timezone).startOf('day').toDate();
    const todayEnd  = moment.tz(timezone).endOf('day').toDate();

    const [integrations, externalEvents, latestEnergy, activeFlags, todayTasks] = await Promise.all([
      ConnectedIntegration.findAll({ where: { user_id: userId, is_active: true }, raw: true }),
      ExternalEvent.findAll({ where: { user_id: userId, event_date: today }, raw: true }),
      EnergyLog.findAll({ where: { user_id: userId }, raw: true, order: [['log_date','DESC']], limit: 1 }),
      BehavioralFlag.findAll({ where: { user_id: userId, is_resolved: false }, raw: true }),
      Task.findAll({ where: { user_id: userId, status: { [Op.ne]: 'completed' }, due_date: { [Op.between]: [todayDate, todayEnd] } }, raw: true }),
    ]);

    const energyScore   = latestEnergy[0]?.energy_score || 55;
    const energyLevel   = latestEnergy[0]?.level || 'medium';
    const meetingCount  = externalEvents.filter(e => e.event_type === 'meeting' || e.is_busy).length;
    const meetingMinutes= externalEvents.filter(e => e.is_busy).reduce((s, e) => s + (e.duration_minutes || 60), 0);
    const burnoutFlag   = activeFlags.some(f => f.flag_type === 'burnout_risk');
    const urgentTasks   = todayTasks.filter(t => t.priority === 'urgent').length;

    // ── Context Classification ────────────────────────────────────────────────
    let contextType, contextLabel, contextIcon, contextColor, focusHours, recommendations;

    if (burnoutFlag || energyScore < 30) {
      contextType  = 'recovery_day';
      contextLabel = 'يوم تعافٍ';
      contextIcon  = '🌿';
      contextColor = '#10b981';
      focusHours   = [];
      recommendations = [
        'ضع أدنى حد من المهام اليوم',
        'خذ استراحات قصيرة كل ساعة',
        'تجنب الاجتماعات الإضافية',
        'نم مبكراً الليلة',
      ];
    } else if (meetingMinutes >= 240 || meetingCount >= 4) {
      contextType  = 'meeting_heavy';
      contextLabel = 'يوم اجتماعات مكثفة';
      contextIcon  = '📅';
      contextColor = '#f59e0b';
      focusHours   = detectGapsBetweenMeetings(externalEvents, timezone);
      recommendations = [
        'ركّز على المهام السريعة بين الاجتماعات',
        'أعدّ أجندة لكل اجتماع قبله بـ 5 دقائق',
        'سجّل ملاحظاتك مباشرة بعد كل اجتماع',
        'خصص ساعة في نهاية اليوم لمراجعة القرارات',
      ];
    } else if (urgentTasks >= 5 || activeFlags.filter(f => f.flag_type === 'overcommitment').length > 0) {
      contextType  = 'overload_day';
      contextLabel = 'يوم ضغط عالٍ';
      contextIcon  = '⚠️';
      contextColor = '#ef4444';
      focusHours   = energyScore >= 60 ? [9, 10, 11] : [20, 21];
      recommendations = [
        'رتّب مهامك حسب الأولوية الآن',
        'فوّض أو أجّل ما يمكن تأجيله',
        'خذ استراحة 20 دقيقة للحفاظ على طاقتك',
        'لا تضف مهام جديدة اليوم',
      ];
    } else if (externalEvents.length === 0 && energyScore >= 65 && urgentTasks === 0) {
      contextType  = 'deep_work_opportunity';
      contextLabel = 'يوم عمل عميق مثالي';
      contextIcon  = '🎯';
      contextColor = '#6366f1';
      focusHours   = [9, 10, 11, 20, 21];
      recommendations = [
        'استغل هذا اليوم النظيف لمشروعك الأهم',
        'أغلق الإشعارات لـ 2-3 ساعات',
        'اعمل على المهمة الأصعب أولاً',
        'سجّل تقدمك في نهاية اليوم',
      ];
    } else {
      contextType  = 'balanced_day';
      contextLabel = 'يوم متوازن';
      contextIcon  = '⚖️';
      contextColor = '#3b82f6';
      focusHours   = [9, 10, 20];
      recommendations = [
        'وزّع مهامك على فترتين صباحاً ومساءً',
        'أكمل مهمة واحدة مهمة قبل الظهر',
        'خصّص 30 دقيقة للتطوير الشخصي',
      ];
    }

    return {
      user_id:        userId,
      date:           today,
      generated_at:   moment.tz(timezone).toISOString(),
      context_type:   contextType,
      context_label:  contextLabel,
      context_icon:   contextIcon,
      context_color:  contextColor,
      focus_hours:    focusHours,
      recommendations,
      metrics: {
        energy_score:    energyScore,
        energy_level:    energyLevel,
        meeting_count:   meetingCount,
        meeting_minutes: meetingMinutes,
        urgent_tasks:    urgentTasks,
        active_flags:    activeFlags.length,
        integrations:    integrations.length,
      },
      external_events: externalEvents.slice(0, 10).map(e => ({
        title:    e.title || e.event_type,
        source:   e.source,
        duration: e.duration_minutes,
        is_busy:  e.is_busy,
      })),
    };
  } catch (err) {
    logger.error('detectTodayContext error:', err.message);
    throw err;
  }
}

// ── Integration Management ────────────────────────────────────────────────────

const SUPPORTED_INTEGRATIONS = [
  { type: 'google_calendar', label: 'Google Calendar', icon: '📅', category: 'calendar', available: true },
  { type: 'apple_calendar',  label: 'Apple Calendar',  icon: '🍎', category: 'calendar', available: true },
  { type: 'outlook',         label: 'Outlook Calendar', icon: '📧', category: 'calendar', available: true },
  { type: 'google_fit',      label: 'Google Fit',      icon: '🏃', category: 'health', available: true },
  { type: 'apple_health',    label: 'Apple Health',    icon: '❤️', category: 'health', available: true },
  { type: 'samsung_health',  label: 'Samsung Health',  icon: '💙', category: 'health', available: true },
  { type: 'notion',          label: 'Notion',          icon: '📝', category: 'productivity', available: false },
  { type: 'todoist',         label: 'Todoist',         icon: '✅', category: 'productivity', available: false },
  { type: 'trello',          label: 'Trello',          icon: '🃏', category: 'productivity', available: false },
];

/**
 * connectIntegration(userId, integrationType, accessToken, displayName)
 */
async function connectIntegration(userId, integrationType, accessToken = null, displayName = null) {
  try {
    const { ConnectedIntegration } = getModels();
    const supported = SUPPORTED_INTEGRATIONS.find(i => i.type === integrationType);
    if (!supported) throw new Error(`نوع التكامل غير مدعوم: ${integrationType}`);

    const [integration, created] = await ConnectedIntegration.upsert({
      user_id:          userId,
      integration_type: integrationType,
      display_name:     displayName || supported.label,
      access_token:     accessToken,
      is_active:        true,
      connected_at:     new Date(),
    }, { conflictFields: ['user_id', 'integration_type'] });

    return {
      success:  true,
      created,
      integration: {
        type:    integrationType,
        label:   supported.label,
        icon:    supported.icon,
        status:  'connected',
        message: created ? `تم ربط ${supported.label} بنجاح` : `تم تحديث ربط ${supported.label}`,
      },
    };
  } catch (err) {
    logger.error('connectIntegration error:', err.message);
    throw err;
  }
}

/**
 * getIntegrationStatus(userId)
 */
async function getIntegrationStatus(userId) {
  try {
    const { ConnectedIntegration } = getModels();
    const connected = await ConnectedIntegration.findAll({ where: { user_id: userId }, raw: true });
    const connectedTypes = connected.filter(c => c.is_active).map(c => c.integration_type);

    return {
      user_id:   userId,
      connected: connectedTypes.length,
      integrations: SUPPORTED_INTEGRATIONS.map(i => ({
        ...i,
        is_connected: connectedTypes.includes(i.type),
        last_synced:  connected.find(c => c.integration_type === i.type)?.last_synced_at || null,
        status:       !i.available ? 'coming_soon' : connectedTypes.includes(i.type) ? 'connected' : 'available',
        status_label: !i.available ? 'قريباً' : connectedTypes.includes(i.type) ? 'متصل' : 'ربط',
      })),
      categories: {
        calendar:     SUPPORTED_INTEGRATIONS.filter(i => i.category === 'calendar' && connectedTypes.includes(i.type)).length,
        health:       SUPPORTED_INTEGRATIONS.filter(i => i.category === 'health'   && connectedTypes.includes(i.type)).length,
        productivity: SUPPORTED_INTEGRATIONS.filter(i => i.category === 'productivity' && connectedTypes.includes(i.type)).length,
      },
    };
  } catch (err) {
    logger.error('getIntegrationStatus error:', err.message);
    throw err;
  }
}

/**
 * syncIntegration(userId, integrationType, eventsData)
 * Imports external events/health data into ExternalEvent table.
 */
async function syncIntegration(userId, integrationType, eventsData = []) {
  try {
    const { ConnectedIntegration, ExternalEvent } = getModels();

    // Update last_synced_at
    await ConnectedIntegration.update(
      { last_synced_at: new Date() },
      { where: { user_id: userId, integration_type: integrationType } }
    );

    let imported = 0;
    for (const evt of eventsData.slice(0, 100)) {
      try {
        await ExternalEvent.findOrCreate({
          where: {
            user_id:     userId,
            source:      integrationType,
            external_id: evt.external_id || `${integrationType}_${Date.now()}_${imported}`,
          },
          defaults: {
            event_type:       evt.event_type || 'event',
            event_data:       evt.data || {},
            event_date:       evt.date || new Date().toISOString().slice(0, 10),
            title:            evt.title || '',
            duration_minutes: evt.duration_minutes || null,
            is_busy:          evt.is_busy || false,
          },
        });
        imported++;
      } catch (e) { logger.debug('[LIFE-CONTEXT] Duplicate detection skipped:', e.message); }
    }

    return {
      success:  true,
      imported,
      message:  `تم استيراد ${imported} حدث من ${integrationType}`,
      synced_at: new Date().toISOString(),
    };
  } catch (err) {
    logger.error('syncIntegration error:', err.message);
    throw err;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function detectGapsBetweenMeetings(events, timezone) {
  const busyEvents = events
    .filter(e => e.is_busy && e.event_data?.start_time)
    .sort((a, b) => a.event_data.start_time.localeCompare(b.event_data.start_time));

  if (busyEvents.length === 0) return [9, 10];

  const gaps = [];
  let lastEnd = 8; // Assume work starts at 8

  busyEvents.forEach(e => {
    const start = parseInt(e.event_data.start_time?.split(':')[0] || '9');
    const dur   = Math.ceil((e.duration_minutes || 60) / 60);
    if (start - lastEnd >= 2) {
      for (let h = lastEnd; h < start; h++) gaps.push(h);
    }
    lastEnd = start + dur;
  });

  return gaps.slice(0, 4);
}

module.exports = { detectTodayContext, connectIntegration, getIntegrationStatus, syncIntegration };
