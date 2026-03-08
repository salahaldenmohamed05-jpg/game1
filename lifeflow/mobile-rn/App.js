/**
 * LifeFlow Mobile App - Entry Point
 * ===================================
 * نقطة الدخول الرئيسية لتطبيق LifeFlow Mobile
 * React Native + Expo + SQLite Local Storage
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet, I18nManager } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'react-native-gesture-handler';

import { initDatabase } from './src/database/database';
import useAuthStore from './src/store/authStore';
import useThemeStore from './src/store/themeStore';
import AppNavigator from './src/navigation/AppNavigator';
import { getTheme } from './src/theme/theme';

// Force RTL for Arabic UI
I18nManager.forceRTL(true);

// React Query client - configured for offline-first usage
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,
      retryDelay: 1000,
      staleTime: 5 * 60 * 1000, // 5 minutes
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Return stale data while revalidating (good for offline)
      placeholderData: (previousData) => previousData,
    },
    mutations: {
      retry: 1,
    },
  },
});

export default function App() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [initError, setInitError] = useState(null);
  
  const { hydrate: hydrateAuth } = useAuthStore();
  const { hydrate: hydrateTheme, isDark } = useThemeStore();

  useEffect(() => {
    const initialize = async () => {
      try {
        // 1. Initialize SQLite database (creates tables if not exist)
        await initDatabase();
        console.log('[App] Database initialized');

        // 2. Hydrate theme from local storage
        await hydrateTheme();
        console.log('[App] Theme hydrated');

        // 3. Hydrate auth from secure store
        await hydrateAuth();
        console.log('[App] Auth hydrated');

        setIsInitialized(true);
      } catch (error) {
        console.error('[App] Initialization error:', error);
        setInitError(error.message);
        // Even on error, mark as initialized so user can see the login screen
        setIsInitialized(true);
      }
    };

    initialize();
  }, []);

  if (!isInitialized) {
    return (
      <View style={styles.splash}>
        <Text style={styles.splashLogo}>🌊</Text>
        <Text style={styles.splashTitle}>LifeFlow</Text>
        <Text style={styles.splashSubtitle}>مساعدك الشخصي الذكي</Text>
        <ActivityIndicator color="#6C63FF" style={{ marginTop: 32 }} size="large" />
        {initError && (
          <Text style={styles.errorText}>خطأ: {initError}</Text>
        )}
      </View>
    );
  }

  const theme = getTheme(isDark);

  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppNavigator />
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: '#1A1A2E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashLogo: {
    fontSize: 80,
    marginBottom: 16,
  },
  splashTitle: {
    fontSize: 40,
    fontWeight: '900',
    color: '#6C63FF',
    letterSpacing: 2,
  },
  splashSubtitle: {
    fontSize: 18,
    color: '#94A3B8',
    marginTop: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 13,
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
});
