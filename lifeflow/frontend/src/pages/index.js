/**
 * Home Page / Dashboard
 * ======================
 * الصفحة الرئيسية - لوحة التحكم
 * Dashboard is lazy-loaded so the login page renders fast on first visit.
 */

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import useAuthStore from '../store/authStore';
import LoginPage from './login';

// Lazy-load Dashboard — keeps login page bundle small (~170 KB instead of ~1.3 MB)
const Dashboard = dynamic(() => import('../components/dashboard/Dashboard'), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen animated-bg flex items-center justify-center">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 mb-4 shadow-glow animate-pulse">
          <span className="text-3xl">✨</span>
        </div>
        <p className="text-gray-400 text-sm">جاري تحميل لوحة التحكم...</p>
      </div>
    </div>
  ),
});

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  // Wait for Zustand persist to rehydrate from localStorage
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Show loading during SSR / hydration to avoid mismatch
  if (!hydrated) {
    return (
      <div className="min-h-screen animated-bg flex items-center justify-center">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 mb-4 shadow-glow animate-pulse">
            <span className="text-3xl">✨</span>
          </div>
          <p className="text-gray-400 text-sm">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <Dashboard />;
}
