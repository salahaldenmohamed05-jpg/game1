/**
 * _app.js - Next.js App Root
 * ============================
 * جذر التطبيق مع إعداد كامل
 */

import '../styles/globals.css';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useEffect } from 'react';
import { io } from 'socket.io-client';
import useAuthStore from '../store/authStore';
import useThemeStore from '../store/themeStore';
import Head from 'next/head';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

export default function LifeFlowApp({ Component, pageProps }) {
  const { user, isAuthenticated } = useAuthStore();
  const { isDark, setTheme } = useThemeStore();

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

  // Connect to Socket.IO for real-time notifications
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:5000';
    const socket = io(SOCKET_URL, { autoConnect: true });

    socket.on('connect', () => {
      socket.emit('join_user_room', user.id);
    });

    socket.on('notification', (notification) => {
      // Show toast notification
      import('react-hot-toast').then(({ default: toast }) => {
        toast(notification.body, {
          icon: notification.type === 'habit_reminder' ? '🏃' :
                notification.type === 'mood_check' ? '🌙' :
                notification.type === 'task_reminder' ? '📋' : '💡',
          duration: 5000,
          style: {
            background: '#16213E',
            color: '#E2E8F0',
            border: '1px solid rgba(108, 99, 255, 0.3)',
            direction: 'rtl',
            fontFamily: 'Cairo, sans-serif',
          },
        });
      });
    });

    return () => { socket.disconnect(); };
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
