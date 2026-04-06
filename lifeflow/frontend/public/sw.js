/**
 * LifeFlow Service Worker — Phase 6: Always-On System
 * =====================================================
 * Enhanced PWA + Offline + Push Notifications + Quick Actions + Background Sync
 *
 * Phase 6 Additions:
 *   - Rich push notifications with actionable buttons
 *   - Deep-link handling for quick actions (complete/skip/start)
 *   - Background sync for offline actions
 *   - Notification click routes to specific views
 *   - Quick action handling from notification buttons
 *   - Badge count management
 */

const CACHE_NAME = 'lifeflow-v2';
const STATIC_ASSETS = [
  '/',
  '/favicon.ico',
];

// ─── Install: cache essential assets ─────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        console.log('[SW] Some assets failed to cache — continuing');
      });
    })
  );
  self.skipWaiting();
});

// ─── Activate: clean old caches ─────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME && name !== 'lifeflow-pending').map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// ─── Fetch: Network-first strategy with cache fallback ──────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned);
          });
        }
        return response;
      })
      .catch(() => {
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATION — Phase 6 Enhanced
// ═══════════════════════════════════════════════════════════════════════════════

self.addEventListener('push', (event) => {
  let data = { title: 'LifeFlow', body: 'لديك إشعار جديد', url: '/' };

  try {
    if (event.data) {
      data = { ...data, ...event.data.json() };
    }
  } catch (e) {
    if (event.data) {
      data.body = event.data.text();
    }
  }

  // Determine notification icon based on type
  const typeIcons = {
    morning_kickoff: '☀️',
    task_nudge: '📋',
    habit_reminder: '🔥',
    focus_alert: '🎯',
    end_of_day_reminder: '🌙',
    comeback_nudge: '💙',
    energy_intervention: '😌',
    streak_warning: '⚠️',
    perfect_day: '🏆',
    weekly_narrative: '📊',
  };

  const typeIcon = typeIcons[data.type] || '💡';

  // Build notification actions based on data
  let actions = data.actions || [
    { action: 'open', title: 'فتح' },
    { action: 'dismiss', title: 'إغلاق' },
  ];

  // Phase 6: Quick action buttons in notifications
  if (data.data?.quick_action === 'check_habit' && data.data?.habit_id) {
    actions = [
      { action: `quick_check_habit_${data.data.habit_id}`, title: '✅ سجّل الآن' },
      { action: 'open', title: 'فتح التطبيق' },
      { action: 'dismiss', title: 'لاحقاً' },
    ];
  } else if (data.data?.task_id) {
    actions = [
      { action: `quick_complete_task_${data.data.task_id}`, title: '✅ أنجزها' },
      { action: 'open', title: 'فتح التطبيق' },
      { action: 'dismiss', title: 'لاحقاً' },
    ];
  }

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    dir: 'rtl',
    lang: 'ar',
    tag: data.tag || `lifeflow-${data.type || 'notification'}`,
    data: {
      url: data.url || data.actions?.[0]?.url || '/',
      type: data.type,
      ...data.data,
    },
    actions: actions.slice(0, 3), // Max 3 actions for push notifications
    vibrate: data.priority === 'urgent' ? [300, 100, 300, 100, 300] : [200, 100, 200],
    requireInteraction: data.requireInteraction || data.priority === 'high' || data.priority === 'urgent',
    renotify: true,
    silent: data.priority === 'low',
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'LifeFlow', options)
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// NOTIFICATION CLICK — Phase 6: Deep Link + Quick Action Handling
// ═══════════════════════════════════════════════════════════════════════════════

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};
  const baseUrl = self.location.origin;

  // Handle dismiss
  if (action === 'dismiss' || action === 'later') return;

  // Phase 6: Handle quick actions from notification buttons
  if (action.startsWith('quick_check_habit_')) {
    const habitId = action.replace('quick_check_habit_', '');
    event.waitUntil(
      performQuickAction('check_habit', habitId).then(() => {
        // Show a mini confirmation notification
        return self.registration.showNotification('✅ تم!', {
          body: 'تم تسجيل العادة بنجاح ⚡',
          icon: '/favicon.ico',
          tag: 'lifeflow-quick-confirm',
          silent: true,
          requireInteraction: false,
        });
      }).catch(() => {
        // Fallback: open the app
        return openApp(baseUrl + '/?view=habits');
      })
    );
    return;
  }

  if (action.startsWith('quick_complete_task_')) {
    const taskId = action.replace('quick_complete_task_', '');
    event.waitUntil(
      performQuickAction('complete_task', taskId).then(() => {
        return self.registration.showNotification('✅ تم!', {
          body: 'تم إكمال المهمة بنجاح ⚡',
          icon: '/favicon.ico',
          tag: 'lifeflow-quick-confirm',
          silent: true,
          requireInteraction: false,
        });
      }).catch(() => {
        return openApp(baseUrl + '/?view=tasks');
      })
    );
    return;
  }

  // Default: Navigate to the appropriate view
  let targetUrl = baseUrl + '/';
  if (data.url && data.url !== '/') {
    targetUrl = baseUrl + data.url;
  } else if (action === 'start_day') {
    targetUrl = baseUrl + '/?view=daily-flow';
  } else if (action === 'check_habits') {
    targetUrl = baseUrl + '/?view=habits';
  } else if (action === 'end_day') {
    targetUrl = baseUrl + '/?view=daily-flow&stage=end';
  } else if (action === 'start_focus') {
    targetUrl = baseUrl + '/?view=daily-flow';
  } else if (action === 'view_habits') {
    targetUrl = baseUrl + '/?view=habits';
  }

  event.waitUntil(openApp(targetUrl));
});

// ─── Helper: Open or focus app window ────────────────────────────────────────
function openApp(url) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    for (const client of clients) {
      if (client.url.includes(self.location.origin) && 'focus' in client) {
        client.focus();
        if (url !== self.location.origin + '/') {
          client.navigate(url);
        }
        return;
      }
    }
    return self.clients.openWindow(url);
  });
}

// ─── Helper: Perform quick action via API ────────────────────────────────────
async function performQuickAction(action, itemId) {
  // Get auth token from IndexedDB or cache
  const token = await getStoredToken();
  if (!token) throw new Error('No auth token');

  const baseApiUrl = getApiBaseUrl();

  const response = await fetch(`${baseApiUrl}/phase6/quick-action`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ action, item_id: itemId }),
  });

  if (!response.ok) throw new Error('Quick action failed');
  return response.json();
}

// ─── Helper: Get stored auth token ──────────────────────────────────────────
async function getStoredToken() {
  try {
    // Try to get from clients (most reliable)
    const allClients = await self.clients.matchAll();
    for (const client of allClients) {
      try {
        // PostMessage to get token from main thread
        const channel = new MessageChannel();
        const tokenPromise = new Promise((resolve) => {
          channel.port1.onmessage = (event) => resolve(event.data?.token);
          setTimeout(() => resolve(null), 2000);
        });
        client.postMessage({ type: 'GET_AUTH_TOKEN' }, [channel.port2]);
        const token = await tokenPromise;
        if (token) return token;
      } catch (_) {}
    }

    // Fallback: try localStorage via cache
    const cache = await caches.open('lifeflow-auth');
    const tokenResp = await cache.match('auth-token');
    if (tokenResp) {
      const data = await tokenResp.json();
      return data.token;
    }
  } catch (_) {}
  return null;
}

// ─── Helper: Get API base URL ───────────────────────────────────────────────
function getApiBaseUrl() {
  const hostname = self.location.hostname;
  if (hostname.includes('.e2b.dev')) {
    return `https://${hostname.replace(/^\d+-/, '5000-')}/api/v1`;
  }
  if (hostname.includes('.sandbox.novita.ai')) {
    return `https://${hostname.replace(/^\d+-/, '5000-')}/api/v1`;
  }
  return 'http://localhost:5000/api/v1';
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACKGROUND SYNC — Phase 6: Offline Action Queue
// ═══════════════════════════════════════════════════════════════════════════════

self.addEventListener('sync', (event) => {
  if (event.tag === 'lifeflow-sync') {
    event.waitUntil(syncPendingActions());
  }
  if (event.tag === 'lifeflow-habit-sync') {
    event.waitUntil(syncPendingHabits());
  }
  if (event.tag === 'lifeflow-task-sync') {
    event.waitUntil(syncPendingTasks());
  }
});

async function syncPendingActions() {
  try {
    const cache = await caches.open('lifeflow-pending');
    const requests = await cache.keys();

    for (const request of requests) {
      try {
        const cached = await cache.match(request);
        const data = await cached.json();
        await fetch(data.url, {
          method: data.method,
          headers: data.headers,
          body: data.body ? JSON.stringify(data.body) : undefined,
        });
        await cache.delete(request);
      } catch (e) {
        console.log('[SW] Sync failed for:', request.url);
      }
    }
  } catch (e) {
    console.log('[SW] Background sync error:', e);
  }
}

async function syncPendingHabits() {
  try {
    const cache = await caches.open('lifeflow-pending-habits');
    const requests = await cache.keys();
    const token = await getStoredToken();
    if (!token) return;

    const baseApiUrl = getApiBaseUrl();
    for (const request of requests) {
      try {
        const cached = await cache.match(request);
        const data = await cached.json();
        await fetch(`${baseApiUrl}/phase6/quick-action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'check_habit', item_id: data.habit_id }),
        });
        await cache.delete(request);
      } catch (_) {}
    }
  } catch (_) {}
}

async function syncPendingTasks() {
  try {
    const cache = await caches.open('lifeflow-pending-tasks');
    const requests = await cache.keys();
    const token = await getStoredToken();
    if (!token) return;

    const baseApiUrl = getApiBaseUrl();
    for (const request of requests) {
      try {
        const cached = await cache.match(request);
        const data = await cached.json();
        await fetch(`${baseApiUrl}/phase6/quick-action`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ action: 'complete_task', item_id: data.task_id }),
        });
        await cache.delete(request);
      } catch (_) {}
    }
  } catch (_) {}
}

// ─── Message handler: receive token from main thread ─────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'STORE_AUTH_TOKEN' && event.data?.token) {
    caches.open('lifeflow-auth').then((cache) => {
      cache.put('auth-token', new Response(JSON.stringify({ token: event.data.token })));
    });
  }

  if (event.data?.type === 'GET_AUTH_TOKEN' && event.ports?.[0]) {
    caches.open('lifeflow-auth').then(async (cache) => {
      const resp = await cache.match('auth-token');
      if (resp) {
        const data = await resp.json();
        event.ports[0].postMessage({ token: data.token });
      } else {
        event.ports[0].postMessage({ token: null });
      }
    });
  }
});
