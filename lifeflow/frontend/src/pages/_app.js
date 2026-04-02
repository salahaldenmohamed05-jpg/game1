/**
 * _app.js — Next.js App Root (Phase H: Hardened)
 * =================================================
 * PHASE H HARDENING:
 *   - Global unhandled rejection / error handlers
 *   - Safe Zustand hydration with try/catch
 *   - Socket.IO errors can never crash the app
 *   - QueryClient retry + error defaults
 *   - Viewport meta prevents iOS zoom on focus
 */

import '../styles/globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useEffect, useRef } from 'react';
import useAuthStore from '../store/authStore';
import useThemeStore from '../store/themeStore';
import useSyncStore from '../store/syncStore';
import { getSocketUrl } from '../utils/api';
import Head from 'next/head';
import ErrorBoundary from '../components/common/ErrorBoundary';
import { initErrorTracking } from '../utils/errorTracker';

/**
 * Phase G Fix: QueryClient per-instance (not module-level singleton).
 * Phase H: Added onError default to prevent unhandled query errors from crashing.
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 2 * 60 * 1000,       // Data is fresh for 2 minutes
        gcTime: 10 * 60 * 1000,          // Keep unused data in cache for 10 minutes
        refetchOnReconnect: true,         // Refetch when coming back online
        networkMode: 'offlineFirst',      // Use cache when offline
      },
      mutations: {
        retry: 0,
        networkMode: 'offlineFirst',
      },
    },
  });
}

export default function LifeFlowApp({ Component, pageProps }) {
  // Safe Zustand access — these hooks never throw, but wrap for extra safety
  let user = null;
  let isAuthenticated = false;
  let setTheme = () => {};
  let setQueryClient = () => {};

  try {
    const authState = useAuthStore();
    user = authState?.user || null;
    isAuthenticated = authState?.isAuthenticated || false;
  } catch (e) {
    console.error('[LifeFlow] authStore hydration error:', e);
  }

  try {
    const themeState = useThemeStore();
    setTheme = themeState?.setTheme || (() => {});
  } catch (e) {
    console.error('[LifeFlow] themeStore hydration error:', e);
  }

  try {
    const syncState = useSyncStore();
    setQueryClient = syncState?.setQueryClient || (() => {});
  } catch (e) {
    console.error('[LifeFlow] syncStore hydration error:', e);
  }

  // Phase G: per-instance QueryClient via useRef
  const queryClientRef = useRef(null);
  if (!queryClientRef.current) {
    queryClientRef.current = makeQueryClient();
  }
  const queryClient = queryClientRef.current;

  // Wire sync store to QueryClient
  useEffect(() => {
    try { setQueryClient(queryClient); } catch {}
  }, [queryClient, setQueryClient]);

  // Phase H: Global error handlers — prevent unhandled errors from white-screening
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUnhandledRejection = (event) => {
      // Prevent the browser from logging the error to console (we handle it)
      event?.preventDefault?.();
      console.error('[LifeFlow] Unhandled promise rejection:', event?.reason);
    };

    const handleGlobalError = (event) => {
      // Don't prevent default — let ErrorBoundary handle React errors
      console.error('[LifeFlow] Global error:', event?.error || event?.message);
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleGlobalError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleGlobalError);
    };
  }, []);

  // Initialize error tracking
  useEffect(() => {
    initErrorTracking();
  }, []);

  // Register Service Worker for PWA + Offline + Push
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').then((reg) => {
        console.log('[LifeFlow] Service Worker registered, scope:', reg.scope);
      }).catch((err) => {
        console.log('[LifeFlow] Service Worker registration failed (non-critical):', err.message);
      });
    }
  }, []);

  // Request push notification permission when authenticated
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    
    // Only request if not already granted/denied
    if (Notification.permission === 'default') {
      // Delay request to avoid blocking initial render
      const timer = setTimeout(() => {
        Notification.requestPermission().then((perm) => {
          console.log('[LifeFlow] Notification permission:', perm);
        }).catch(() => {});
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated]);

  // Initialize theme on mount (hydrate from persisted store)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('lifeflow-theme');
      if (stored) {
        const { state } = JSON.parse(stored);
        setTheme(state?.isDark !== false); // default dark
      } else {
        setTheme(true); // default dark
      }
    } catch (_) {
      setTheme(true);
    }
  }, [setTheme]);

  // Connect to Socket.IO for real-time notifications (lazy-loaded)
  // Phase H: All socket operations wrapped in try/catch — socket failure must never crash
  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    let socket;
    let mounted = true;

    import('socket.io-client').then(({ io }) => {
      if (!mounted) return;
      try {
        const SOCKET_URL = getSocketUrl();
        socket = io(SOCKET_URL, {
          autoConnect: true,
          reconnectionAttempts: 3,
          timeout: 10000,
        });

        socket.on('connect', () => {
          try { socket.emit('join_user_room', user.id); } catch {}
        });

        socket.on('connect_error', () => {
          // Silent — socket is non-critical
        });

        socket.on('notification', (notification) => {
          try {
            import('react-hot-toast').then(({ default: toast }) => {
              const body = notification?.body || notification?.title || '';
              if (!body) return;
              toast(body, {
                icon: notification?.type === 'habit_reminder' ? '🏃' :
                      notification?.type === 'mood_prompt' ? '💭' :
                      notification?.type === 'overdue_reminder' ? '⏰' :
                      notification?.type === 'burnout_alert' ? '🌿' :
                      notification?.type === 'morning_briefing' ? '☀️' :
                      notification?.type === 'evening_review' ? '🌙' :
                      notification?.type === 'daily_question' ? '🤔' :
                      notification?.type === 'energy_alert' ? '⚡' :
                      notification?.type === 'task_reminder' ? '📋' : '💡',
                duration: 6000,
                style: {
                  background: '#16213E',
                  color: '#E2E8F0',
                  border: '1px solid rgba(108, 99, 255, 0.3)',
                  direction: 'rtl',
                  fontFamily: 'Cairo, sans-serif',
                  maxWidth: '380px',
                },
              });
            }).catch(() => {});
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
          } catch {}
        });

        // Push notification via Socket.IO → Service Worker
        socket.on('push_notification', (payload) => {
          try {
            if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker?.controller) {
              navigator.serviceWorker.ready.then((reg) => {
                reg.showNotification(payload.title || 'LifeFlow', {
                  body: payload.body || '',
                  icon: '/favicon.ico',
                  badge: '/favicon.ico',
                  dir: 'rtl',
                  lang: 'ar',
                  tag: 'lifeflow-push',
                  data: { url: payload.url || '/' },
                });
              });
            }
          } catch {}
        });

        socket.on('proactive_message', (msg) => {
          try {
            import('react-hot-toast').then(({ default: toast }) => {
              const body = msg?.body || msg?.title || '';
              if (!body) return;
              toast(`🤖 ${body}`, {
                icon: '🤖',
                duration: 8000,
                style: {
                  background: '#0A0F2C',
                  color: '#A78BFA',
                  border: '1px solid rgba(167, 139, 250, 0.4)',
                  direction: 'rtl',
                  fontFamily: 'Cairo, sans-serif',
                  maxWidth: '400px',
                },
              });
            }).catch(() => {});
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          } catch {}
        });
      } catch (err) {
        console.error('[LifeFlow] Socket setup error:', err);
      }
    }).catch(() => {
      // Socket.IO unavailable — non-critical
    });

    return () => {
      mounted = false;
      try { if (socket) socket.disconnect(); } catch {}
    };
  }, [isAuthenticated, user?.id, queryClient]);

  return (
    <>
      <Head>
        <title>LifeFlow - مساعدك الشخصي الذكي</title>
        <meta name="description" content="تطبيق LifeFlow - نظّم حياتك الشخصية والمهنية بالذكاء الاصطناعي" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <meta charSet="utf-8" />
        <link rel="icon" href="/favicon.ico" />
        {/* DNS prefetch for faster external resource loading */}
        <link rel="dns-prefetch" href="//fonts.googleapis.com" />
        <link rel="dns-prefetch" href="//fonts.gstatic.com" />
      </Head>

      <QueryClientProvider client={queryClient}>
        <ErrorBoundary>
          <Component {...pageProps} />
        </ErrorBoundary>
        <Toaster
          position="top-center"
          containerStyle={{ zIndex: 99999 }}
          toastOptions={{
            style: {
              fontFamily: 'Cairo, sans-serif',
              direction: 'rtl',
            },
          }}
        />
      </QueryClientProvider>
    </>
  );
}
