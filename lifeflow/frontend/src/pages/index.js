/**
 * Home Page / Dashboard
 * ======================
 * الصفحة الرئيسية - لوحة التحكم
 * Dashboard is lazy-loaded so the login page renders fast on first visit.
 *
 * FIXES (Phase 7 + Pre-Launch Polish + Loading Screen Fix):
 * - NEVER block on health check — always proceed to dashboard
 * - Health check runs in background for diagnostics only
 * - Hydration: waits for Zustand persist's real onRehydrateStorage signal
 *   (replaced the unreliable 50ms timer with a proper callback + 2s safety net)
 * - Loading screen has "skip" button after 3 seconds
 * - Each dashboard component handles its own API errors gracefully
 * - Hard 5-second max timeout on loading screen — user ALWAYS gets unblocked
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import useAuthStore from '../store/authStore';
import { checkBackendHealth, profileAPI } from '../utils/api';
import LoginPage from './login';

// Lazy-load Dashboard — keeps login page bundle small
const Dashboard = dynamic(() => import('../components/dashboard/Dashboard'), {
  ssr: false,
  loading: () => <LoadingScreen message="جاري تحميل لوحة التحكم..." />,
});

// Lazy-load Onboarding
const OnboardingFlow = dynamic(() => import('../components/onboarding/OnboardingFlow'), {
  ssr: false,
});

// ── Loading Screen Component (reusable) ────────────────────────────────────
function LoadingScreen({ message, onSkip }) {
  const [showSkip, setShowSkip] = useState(false);

  useEffect(() => {
    // Show skip button after 3 seconds to prevent blocking
    const timer = setTimeout(() => setShowSkip(true), 3000);
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
            className="mt-6 px-5 py-2 text-xs text-gray-500 hover:text-primary-400 hover:bg-white/5 rounded-xl transition-all"
          >
            تخطي الانتظار →
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

  // ─── Step 1: Wait for REAL Zustand persist rehydration ──────────────────
  // Uses onRehydrateStorage callback (not a guessed timer).
  // Safety net: 2s max wait inside waitForHydration + 5s hard cap below.
  useEffect(() => {
    if (mountRef.current) return;
    mountRef.current = true;

    // If already hydrated synchronously (SSR or fast localStorage)
    if (useAuthStore.getState()._hasHydrated) {
      setHydrated(true);
      return;
    }

    // Wait for the persist middleware's real signal
    useAuthStore.waitForHydration().then(() => {
      setHydrated(true);
    });

    // Hard safety net — never show loading screen for more than 5 seconds
    const hardTimeout = setTimeout(() => {
      setHydrated(true);
    }, 5000);

    return () => clearTimeout(hardTimeout);
  }, []);

  // ─── Step 2: Background health check (never blocks UI) ──────────────────
  useEffect(() => {
    if (!hydrated) return;
    const isAuth = useAuthStore.getState().isAuthenticated;
    if (isAuth) {
      checkBackendHealth().then((health) => {
        if (!health.ok) {
          console.warn('[LifeFlow] Backend not reachable:', health.error, '— dashboard will show per-component errors');
        }
      }).catch(() => {});
    }
  }, [hydrated]);

  // ── Render ─────────────────────────────────────────────────────────────────

  // Pre-hydration: show loading (typically <100ms, max 5s with hard timeout)
  if (!hydrated) {
    return (
      <LoadingScreen
        message="جاري التحميل..."
        onSkip={() => setHydrated(true)}
      />
    );
  }

  // Route to login or dashboard
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

  if (!checked) return null; // Instant — no loading screen for localStorage check

  return (
    <>
      {showOnboarding && (
        <OnboardingFlow
          onComplete={handleOnboardingComplete}
          userName={user?.name?.split(' ')[0]}
        />
      )}
      <Dashboard />
    </>
  );
}
