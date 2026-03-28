/**
 * Home Page / Dashboard
 * ======================
 * الصفحة الرئيسية - لوحة التحكم
 * Dashboard is lazy-loaded so the login page renders fast on first visit.
 *
 * FIXES (Phase 7):
 * - Loading timeout: shows error after 12s instead of infinite spinner
 * - Health check on mount: detects backend offline immediately
 * - Hydration guard: waits for Zustand persist to rehydrate
 * - Diagnostics: console logs in dev mode for debugging
 */

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import useAuthStore from '../store/authStore';
import { checkBackendHealth } from '../utils/api';
import LoginPage from './login';

// Lazy-load Dashboard — keeps login page bundle small
const Dashboard = dynamic(() => import('../components/dashboard/Dashboard'), {
  ssr: false,
  loading: () => <LoadingScreen message="جاري تحميل لوحة التحكم..." />,
});

// ── Loading Screen Component (reusable) ────────────────────────────────────
function LoadingScreen({ message }) {
  return (
    <div className="min-h-screen animated-bg flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 mb-4 shadow-glow animate-pulse">
          <span className="text-3xl">✨</span>
        </div>
        <p className="text-gray-400 text-sm">{message}</p>
      </div>
    </div>
  );
}

// ── Error Screen Component ─────────────────────────────────────────────────
function ErrorScreen({ title, detail, onRetry, diagnostics }) {
  return (
    <div className="min-h-screen animated-bg flex items-center justify-center p-4" dir="rtl">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 mb-4 border border-red-500/30">
          <span className="text-3xl">⚠️</span>
        </div>
        <h2 className="text-lg font-bold text-white mb-2">{title}</h2>
        <p className="text-gray-400 text-sm mb-4 leading-relaxed">{detail}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="px-6 py-2.5 bg-primary-500/20 text-primary-400 text-sm rounded-xl
              hover:bg-primary-500/30 active:scale-95 transition-all inline-flex items-center gap-2 mb-4"
          >
            🔄 إعادة المحاولة
          </button>
        )}
        {diagnostics && (
          <div className="mt-4 p-3 bg-white/5 rounded-xl text-left text-xs text-gray-500 font-mono leading-relaxed border border-white/5">
            <p className="text-gray-400 mb-1 text-right font-sans">معلومات تقنية:</p>
            {Object.entries(diagnostics).map(([k, v]) => (
              <div key={k}>{k}: {String(v)}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Constants ──────────────────────────────────────────────────────────────
const HYDRATION_TIMEOUT_MS = 500;    // max wait for Zustand hydration
const HEALTH_CHECK_TIMEOUT_MS = 10000; // max wait for backend health check
const LOADING_TIMEOUT_MS = 15000;    // absolute max before showing error

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);
  const [appState, setAppState] = useState('loading'); // loading | ready | error | timeout
  const [errorInfo, setErrorInfo] = useState(null);
  const mountRef = useRef(false);

  // Step 1: Wait for Zustand persist to rehydrate from localStorage
  useEffect(() => {
    // Zustand persist rehydrates synchronously on mount; give it a tick
    const timer = setTimeout(() => {
      setHydrated(true);
      if (process.env.NODE_ENV === 'development') {
        console.log('[LifeFlow] Zustand hydrated. isAuthenticated:', useAuthStore.getState().isAuthenticated);
      }
    }, 50);
    return () => clearTimeout(timer);
  }, []);

  // Step 2: Once hydrated, run health check + set final state
  useEffect(() => {
    if (!hydrated || mountRef.current) return;
    mountRef.current = true;

    const init = async () => {
      const isAuth = useAuthStore.getState().isAuthenticated;

      // If not authenticated, go straight to login — no backend check needed
      if (!isAuth) {
        if (process.env.NODE_ENV === 'development') {
          console.log('[LifeFlow] Not authenticated → showing login');
        }
        setAppState('ready');
        return;
      }

      // Authenticated — check backend health before loading dashboard
      if (process.env.NODE_ENV === 'development') {
        console.log('[LifeFlow] Authenticated → checking backend health...');
      }

      const health = await checkBackendHealth();

      if (process.env.NODE_ENV === 'development') {
        console.log('[LifeFlow] Health check result:', health);
      }

      if (health.ok) {
        setAppState('ready');
      } else {
        // Backend offline — show error with diagnostics
        setErrorInfo({
          title: 'لا يمكن الاتصال بالخادم',
          detail: 'تعذر الوصول إلى خادم LifeFlow. تأكد من أن الخادم يعمل وأن اتصالك بالإنترنت مستقر.',
          diagnostics: {
            api_url: health.baseUrl,
            error: health.error,
            latency: `${health.latency}ms`,
          },
        });
        setAppState('error');
      }
    };

    // Absolute safety net — never stay loading forever
    const absoluteTimeout = setTimeout(() => {
      setAppState((prev) => {
        if (prev === 'loading') {
          setErrorInfo({
            title: 'استغرق التحميل وقتاً طويلاً',
            detail: 'لم يتمكن التطبيق من الاتصال بالخادم في الوقت المحدد. حاول تحديث الصفحة.',
            diagnostics: { timeout: `${LOADING_TIMEOUT_MS}ms` },
          });
          return 'timeout';
        }
        return prev;
      });
    }, LOADING_TIMEOUT_MS);

    init();

    return () => clearTimeout(absoluteTimeout);
  }, [hydrated]);

  // ── Render ─────────────────────────────────────────────────────────────────

  // Pre-hydration: show loading (max ~50ms)
  if (!hydrated) {
    return <LoadingScreen message="جاري التحميل..." />;
  }

  // Error or timeout state
  if (appState === 'error' || appState === 'timeout') {
    return (
      <ErrorScreen
        title={errorInfo?.title || 'حدث خطأ'}
        detail={errorInfo?.detail || 'حدث خطأ غير متوقع'}
        onRetry={() => window.location.reload()}
        diagnostics={errorInfo?.diagnostics}
      />
    );
  }

  // Still loading (health check in progress)
  if (appState === 'loading') {
    return <LoadingScreen message="جاري الاتصال بالخادم..." />;
  }

  // Ready — route to login or dashboard
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <Dashboard />;
}
