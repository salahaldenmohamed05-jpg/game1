/**
 * Integration Manager Service — Phase 14 (Life OS)
 * ==================================================
 * Central hub for managing all external integrations:
 * Calendars (Google/Apple/Outlook), Health (Apple/Samsung/GoogleFit),
 * Task managers (Notion/Todoist/Trello).
 * Handles connect, disconnect, sync status, and data normalization.
 */

'use strict';

const moment = require('moment-timezone');
const logger  = require('../utils/logger');

function getModels() {
  const ConnectedIntegration = require('../models/connected_integration.model');
  const ExternalEvent        = require('../models/external_event.model');
  return { ConnectedIntegration, ExternalEvent };
}

// Supported integrations catalog
const INTEGRATION_CATALOG = {
  // Calendars
  google_calendar: {
    name: 'Google Calendar',
    category: 'calendar',
    icon: '📅',
    description: 'مزامنة أحداث Google Calendar مع LifeFlow',
    capabilities: ['read_events', 'create_events', 'sync_schedule'],
    auth_type: 'oauth2',
    available: true,
  },
  apple_calendar: {
    name: 'Apple Calendar',
    category: 'calendar',
    icon: '🍎',
    description: 'مزامنة تقويم Apple مع LifeFlow',
    capabilities: ['read_events', 'sync_schedule'],
    auth_type: 'caldav',
    available: true,
  },
  outlook: {
    name: 'Microsoft Outlook',
    category: 'calendar',
    icon: '📧',
    description: 'مزامنة Outlook Calendar',
    capabilities: ['read_events', 'create_events'],
    auth_type: 'oauth2',
    available: true,
  },
  // Health
  apple_health: {
    name: 'Apple Health',
    category: 'health',
    icon: '❤️',
    description: 'استيراد بيانات النوم والنشاط من Apple Health',
    capabilities: ['sleep_data', 'steps', 'heart_rate', 'workout'],
    auth_type: 'healthkit',
    available: true,
  },
  google_fit: {
    name: 'Google Fit',
    category: 'health',
    icon: '🏃',
    description: 'مزامنة بيانات اللياقة من Google Fit',
    capabilities: ['steps', 'workout', 'calories'],
    auth_type: 'oauth2',
    available: true,
  },
  samsung_health: {
    name: 'Samsung Health',
    category: 'health',
    icon: '💙',
    description: 'مزامنة بيانات Samsung Health',
    capabilities: ['sleep_data', 'steps', 'stress_level'],
    auth_type: 'oauth2',
    available: true,
  },
  // Task managers
  notion: {
    name: 'Notion',
    category: 'tasks',
    icon: '📝',
    description: 'مزامنة صفحات وقواعد بيانات Notion',
    capabilities: ['import_tasks', 'export_tasks', 'sync_database'],
    auth_type: 'oauth2',
    available: true,
  },
  todoist: {
    name: 'Todoist',
    category: 'tasks',
    icon: '✅',
    description: 'مزامنة مهام Todoist',
    capabilities: ['import_tasks', 'export_tasks', 'sync_projects'],
    auth_type: 'oauth2',
    available: true,
  },
  trello: {
    name: 'Trello',
    category: 'tasks',
    icon: '📋',
    description: 'مزامنة بطاقات Trello',
    capabilities: ['import_tasks', 'sync_boards'],
    auth_type: 'oauth2',
    available: true,
  },
};

/**
 * getAvailableIntegrations()
 * Returns the full catalog of supported integrations.
 */
function getAvailableIntegrations() {
  return {
    catalog: INTEGRATION_CATALOG,
    categories: {
      calendar: Object.entries(INTEGRATION_CATALOG).filter(([,v]) => v.category === 'calendar').map(([k,v]) => ({ id: k, ...v })),
      health:   Object.entries(INTEGRATION_CATALOG).filter(([,v]) => v.category === 'health').map(([k,v]) => ({ id: k, ...v })),
      tasks:    Object.entries(INTEGRATION_CATALOG).filter(([,v]) => v.category === 'tasks').map(([k,v]) => ({ id: k, ...v })),
    },
    total: Object.keys(INTEGRATION_CATALOG).length,
  };
}

/**
 * connectIntegration(userId, integrationType, accessToken, displayName)
 */
async function connectIntegration(userId, integrationType, accessToken = null, displayName = null) {
  try {
    const { ConnectedIntegration } = getModels();

    if (!INTEGRATION_CATALOG[integrationType]) {
      throw new Error(`نوع التكامل غير مدعوم: ${integrationType}`);
    }

    const catalog = INTEGRATION_CATALOG[integrationType];

    // Upsert connection
    const [conn, created] = await ConnectedIntegration.findOrCreate({
      where: { user_id: userId, integration_type: integrationType },
      defaults: {
        user_id: userId,
        integration_type: integrationType,
        display_name: displayName || catalog.name,
        access_token: accessToken || 'demo_token',
        is_active: true,
        connected_at: new Date(),
        sync_settings: JSON.stringify({ auto_sync: true, sync_interval_hours: 6 }),
      },
    });

    if (!created) {
      await conn.update({
        access_token: accessToken || conn.access_token,
        display_name: displayName || conn.display_name,
        is_active: true,
        connected_at: new Date(),
      });
    }

    return {
      success: true,
      integration_id: conn.id,
      type: integrationType,
      name: catalog.name,
      category: catalog.category,
      capabilities: catalog.capabilities,
      status: 'connected',
      message: `تم ربط ${catalog.name} بنجاح`,
    };
  } catch (err) {
    logger.error('connect integration error:', err.message);
    throw err;
  }
}

/**
 * disconnectIntegration(userId, integrationType)
 */
async function disconnectIntegration(userId, integrationType) {
  try {
    const { ConnectedIntegration } = getModels();
    const conn = await ConnectedIntegration.findOne({ where: { user_id: userId, integration_type: integrationType } });
    if (!conn) throw new Error('التكامل غير موجود');

    await conn.update({ is_active: false });
    return { success: true, message: `تم إلغاء ربط ${INTEGRATION_CATALOG[integrationType]?.name || integrationType}` };
  } catch (err) {
    logger.error('disconnect integration error:', err.message);
    throw err;
  }
}

/**
 * getConnectionStatus(userId)
 * Returns status of all integrations for a user.
 */
async function getConnectionStatus(userId) {
  try {
    const { ConnectedIntegration } = getModels();
    const connections = await ConnectedIntegration.findAll({ where: { user_id: userId }, raw: true });

    const connMap = {};
    connections.forEach(c => { connMap[c.integration_type] = c; });

    const status = {};
    for (const [type, catalog] of Object.entries(INTEGRATION_CATALOG)) {
      const conn = connMap[type];
      status[type] = {
        name: catalog.name,
        category: catalog.category,
        icon: catalog.icon,
        connected: conn ? Boolean(conn.is_active) : false,
        last_synced: conn?.last_synced_at || null,
        connected_at: conn?.connected_at || null,
      };
    }

    const connected = Object.values(status).filter(s => s.connected).length;

    return {
      integrations: status,
      summary: {
        total_available: Object.keys(INTEGRATION_CATALOG).length,
        connected,
        disconnected: Object.keys(INTEGRATION_CATALOG).length - connected,
      },
    };
  } catch (err) {
    logger.error('get connection status error:', err.message);
    throw err;
  }
}

/**
 * syncIntegrationData(userId, integrationType, externalData)
 * Syncs external data into LifeFlow.
 */
async function syncIntegrationData(userId, integrationType, externalData = []) {
  try {
    const { ConnectedIntegration, ExternalEvent } = getModels();

    const conn = await ConnectedIntegration.findOne({ where: { user_id: userId, integration_type: integrationType, is_active: true } });
    if (!conn) throw new Error('التكامل غير متصل');

    const catalog = INTEGRATION_CATALOG[integrationType];
    let synced = 0;

    // Process external data
    for (const item of externalData) {
      try {
        await ExternalEvent.create({
          user_id: userId,
          source: integrationType,
          event_type: item.type || catalog.category,
          event_data: JSON.stringify(item),
          event_date: item.date ? new Date(item.date) : new Date(),
          title: item.title || item.name || 'حدث خارجي',
          duration_minutes: item.duration || 0,
          is_busy: item.is_busy !== false,
          external_id: item.external_id || item.id || null,
        });
        synced++;
      } catch (e) {
        // Skip duplicates
      }
    }

    // Update last synced
    await conn.update({ last_synced_at: new Date() });

    return {
      success: true,
      integration_type: integrationType,
      synced_items: synced,
      total_provided: externalData.length,
      last_synced: new Date().toISOString(),
      message: `تمت المزامنة: ${synced} عنصر من ${catalog.name}`,
    };
  } catch (err) {
    logger.error('sync integration error:', err.message);
    throw err;
  }
}

module.exports = {
  getAvailableIntegrations,
  connectIntegration,
  disconnectIntegration,
  getConnectionStatus,
  syncIntegrationData,
  INTEGRATION_CATALOG,
};
