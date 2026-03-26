/**
 * _app.js - Next.js App Root
 * ============================
 * جذر التطبيق مع إعداد كامل
 */

import '../styles/globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useEffect } from 'react';
// socket.io-client is dynamically imported below to reduce initial bundle size
import useAuthStore from '../store/authStore';
import useThemeStore from '../store/themeStore';
import useSyncStore from '../store/syncStore';
import Head from 'next/head';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: true,
      staleTime: 30 * 1000, // 30 seconds — responsive to mutations
    },
  },
});

export default function LifeFlowApp({ Component, pageProps }) {
  const { user, isAuthenticated } = useAuthStore();
  const { isDark, setTheme } = useThemeStore();
  const { setQueryClient } = useSyncStore();

  // Wire sync store to QueryClient
  useEffect(() => {
    setQueryClient(queryClient);
  }, []);

  // Initialize theme on mount (hydrate from persisted store)
  useEffect(() => {
    const stored = localStorage.getItem('lifeflow-theme');
    if (stored) {
      try {
        const { state } = JSON.parse(stored);
        setTheme(state?.isDark !== false); // default dark
      } catch (_) {
        setTheme(true);
      }
    } else {
      setTheme(true); // default dark
    }
  }, []);

  // Connect to Socket.IO for real-time notifications (lazy-loaded to reduce bundle)
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    let socket;
    import('socket.io-client').then(({ io }) => {
      const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
      socket = io(SOCKET_URL, { autoConnect: true });

      socket.on('connect', () => {
        socket.emit('join_user_room', user.id);
      });

      socket.on('notification', (notification) => {
        import('react-hot-toast').then(({ default: toast }) => {
          toast(notification.body || notification.title, {
            icon: notification.type === 'habit_reminder' ? '🏃' :
                  notification.type === 'mood_prompt' ? '💭' :
                  notification.type === 'overdue_reminder' ? '⏰' :
                  notification.type === 'burnout_alert' ? '🌿' :
                  notification.type === 'morning_briefing' ? '☀️' :
                  notification.type === 'evening_review' ? '🌙' :
                  notification.type === 'daily_question' ? '🤔' :
                  notification.type === 'energy_alert' ? '⚡' :
                  notification.type === 'task_reminder' ? '📋' : '💡',
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
        });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      });

      socket.on('proactive_message', (msg) => {
        import('react-hot-toast').then(({ default: toast }) => {
          toast(`🤖 ${msg.body || msg.title || ''}`, {
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
        });
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      });
    }).catch(() => {
      // Socket.IO unavailable — non-critical, app works without it
    });

    return () => { if (socket) socket.disconnect(); };
  }, [isAuthenticated, user]);

  return (
    <>
      <Head>
        <title>LifeFlow - مساعدك الشخصي الذكي</title>
        <meta name="description" content="تطبيق LifeFlow - نظّم حياتك الشخصية والمهنية بالذكاء الاصطناعي" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta charSet="utf-8" />
        <link rel="icon" href="/favicon.ico" />

      </Head>

      <QueryClientProvider client={queryClient}>
        <Component {...pageProps} />
        <Toaster
          position="top-center"
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
