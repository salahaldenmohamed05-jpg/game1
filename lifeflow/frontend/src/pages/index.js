/**
 * Home Page / Dashboard — Phase 4: Daily Execution Flow Entry Point
 * ===================================================================
 * FIXES:
 * - Hard 2-second max on loading screen (was 5s — too long)
 * - Skip button after 1 second
 * - Hydration check simplified — if localStorage has token, proceed immediately
 * - NEVER block user from dashboard
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import useAuthStore from '../store/authStore';
import { checkBackendHealth, profileAPI } from '../utils/api';
import LoginPage from './login';

// Lazy-load Dashboard
const Dashboard = dynamic(() => import('../components/dashboard/Dashboard'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen animated-bg flex items-center justify-center" dir="rtl">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 mb-4 shadow-glow">
          <span className="text-3xl animate-pulse">✨</span>
        </div>
        <p className="text-gray-400 text-sm">جاري تحميل لوحة التحكم...</p>
        <div className="flex justify-center mt-3">
          <div className="w-6 h-6 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
        </div>
      </div>
    </div>
  ),
});

// Lazy-load Onboarding
const OnboardingFlow = dynamic(() => import('../components/onboarding/OnboardingFlow'), {
  ssr: false,
});

// ── Loading Screen Component ────────────────────────────────────────────────
function LoadingScreen({ message, onSkip }) {
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowSkip(true), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen animated-bg flex items-center justify-center" dir="rtl">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 mb-4 shadow-glow">
          <span className="text-3xl animate-pulse">✨</span>
        </div>
        <p className="text-gray-400 text-sm mb-2">{message}</p>
        <div className="flex justify-center mt-3">
          <div className="w-6 h-6 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
        </div>
        {showSkip && onSkip && (
          <button
            onClick={onSkip}
            className="mt-4 px-5 py-2 text-xs text-gray-500 hover:text-primary-400 hover:bg-white/5 rounded-xl transition-all"
          >
            تخطي ←
          </button>
        )}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);
  const mountRef = useRef(false);

  useEffect(() => {
    if (mountRef.current) return;
    mountRef.current = true;

    // Quick check: if store already hydrated, proceed
    if (useAuthStore.getState()._hasHydrated) {
      setHydrated(true);
      return;
    }

    // Also check localStorage directly — if token exists, hydration will catch up
    try {
      const stored = localStorage.getItem('lifeflow-auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.state?.isAuthenticated) {
          // Token exists — proceed immediately, store will sync
          setHydrated(true);
          return;
        }
      }
    } catch (_) {}

    // No auth — also proceed immediately (will show login page)
    try {
      const stored = localStorage.getItem('lifeflow-auth');
      if (!stored) {
        setHydrated(true);
        return;
      }
    } catch (_) {}

    // Wait for persist middleware signal
    useAuthStore.waitForHydration().then(() => setHydrated(true));

    // Phase 13: HARD CAP reduced to 800ms (from 2s) — never block app for 2s
    const hardTimeout = setTimeout(() => setHydrated(true), 800);
    return () => clearTimeout(hardTimeout);
  }, []);

  // Background health check (never blocks)
  useEffect(() => {
    if (!hydrated) return;
    if (useAuthStore.getState().isAuthenticated) {
      checkBackendHealth().catch(() => {});
    }
  }, [hydrated]);

  if (!hydrated) {
    return <LoadingScreen message="جاري التحميل..." onSkip={() => setHydrated(true)} />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <DashboardWithOnboarding />;
}

// ── Dashboard with Onboarding Wrapper ────────────────────────────────────
function DashboardWithOnboarding() {
  const { user } = useAuthStore();
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const onboardingDone = localStorage.getItem('lifeflow_onboarding_done');
    if (!onboardingDone) {
      setShowOnboarding(true);
    }
    setChecked(true);
  }, []);

  const handleOnboardingComplete = useCallback(async (data) => {
    localStorage.setItem('lifeflow_onboarding_done', 'true');
    setShowOnboarding(false);
    try {
      if (data.role || (data.focus_areas && data.focus_areas.length > 0)) {
        await profileAPI.updateProfile({
          role: data.role || undefined,
          focus_areas: data.focus_areas || undefined,
        });
      }
    } catch {}
  }, []);

  if (!checked) return null;

  if (showOnboarding) {
    return (
      <OnboardingFlow
        onComplete={handleOnboardingComplete}
        userName={user?.name?.split(' ')[0]}
      />
    );
  }

  return <Dashboard />;
}
