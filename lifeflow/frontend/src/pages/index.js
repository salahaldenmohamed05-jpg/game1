/**
 * Home Page / Dashboard
 * ======================
 * الصفحة الرئيسية - لوحة التحكم
 */

import { useEffect, useState } from 'react';
import useAuthStore from '../store/authStore';
import Dashboard from '../components/dashboard/Dashboard';
import LoginPage from './login';

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  // Wait for Zustand persist to rehydrate from localStorage
  useEffect(() => {
    setHydrated(true);
  }, []);

  // Show nothing during SSR / hydration to avoid mismatch
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
