/**
 * LifeFlow Service Worker — PWA + Offline + Push Notifications
 * ==============================================================
 * - Caches essential assets for offline use
 * - Handles push notifications
 * - Background sync for pending actions
 */

const CACHE_NAME = 'lifeflow-v1';
const STATIC_ASSETS = [
  '/',
  '/favicon.ico',
];

// Install: cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Non-critical — some assets may not be available during dev
        console.log('[SW] Some assets failed to cache — continuing');
      });
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: Network-first strategy with cache fallback
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and API calls
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.startsWith('/_next/webpack-hmr')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        // Cache successful responses
        if (response.status === 200) {
          const cloned = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, cloned);
          });
        }
        return response;
      })
      .catch(() => {
        // Offline fallback
        return caches.match(request).then((cached) => {
          if (cached) return cached;
          // For navigation requests, return cached home page
          if (request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
        });
      })
  );
});

// Push Notification handler
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

  const options = {
    body: data.body,
    icon: data.icon || '/favicon.ico',
    badge: '/favicon.ico',
    dir: 'rtl',
    lang: 'ar',
    tag: data.tag || 'lifeflow-notification',
    data: { url: data.url || '/' },
    actions: data.actions || [
      { action: 'open', title: 'فتح' },
      { action: 'dismiss', title: 'إغلاق' },
    ],
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';
  
  if (event.action === 'dismiss') return;

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if available
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Open new window
      return self.clients.openWindow(url);
    })
  );
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'lifeflow-sync') {
    event.waitUntil(syncPendingActions());
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
        // Will retry on next sync
        console.log('[SW] Sync failed for:', request.url);
      }
    }
  } catch (e) {
    console.log('[SW] Background sync error:', e);
  }
}
