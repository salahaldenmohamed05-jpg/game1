/**
 * Home Page / Dashboard
 * ======================
 * الصفحة الرئيسية - لوحة التحكم
 */

import { useEffect } from 'react';
import { useRouter } from 'next/router';
import useAuthStore from '../store/authStore';
import Dashboard from '../components/dashboard/Dashboard';
import LoginPage from './login';

export default function HomePage() {
  const { isAuthenticated } = useAuthStore();
  const router = useRouter();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return <Dashboard />;
}
