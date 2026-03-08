/**
 * Main Dashboard Component
 * =========================
 * لوحة التحكم الرئيسية - الصفحة المحورية للتطبيق
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { dashboardAPI } from '../../utils/api';
import Sidebar from '../layout/Sidebar';
import Header from '../layout/Header';
import DashboardHome from './DashboardHome';
import TasksView from '../tasks/TasksView';
import HabitsView from '../habits/HabitsView';
import MoodView from '../mood/MoodView';
import InsightsView from '../insights/InsightsView';
import CalendarView from '../calendar/CalendarView';
import NotificationsView from '../notifications/NotificationsView';
import PerformanceView from '../performance/PerformanceView';
import SubscriptionView from '../subscription/SubscriptionView';
import useAuthStore from '../../store/authStore';

// Lazy-load heavy components
const AIChat = ({ userPlan }) => {
  const [loaded, setLoaded] = useState(false);
  const [Component, setComponent] = useState(null);
  useEffect(() => {
    import('../voice/AIChat').then(m => { setComponent(() => m.default); setLoaded(true); });
  }, []);
  if (!loaded) return <div className="flex items-center justify-center h-64"><div className="loading-spinner" /></div>;
  return <Component userPlan={userPlan} />;
};

const VIEWS = {
  dashboard: DashboardHome,
  tasks: TasksView,
  habits: HabitsView,
  mood: MoodView,
  insights: InsightsView,
  ai_chat: AIChat,
  calendar: CalendarView,
  notifications: NotificationsView,
  performance: PerformanceView,
  subscription: SubscriptionView,
};

export default function Dashboard() {
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user } = useAuthStore();
  const userPlan = user?.subscription_plan || 'free';

  const { data: dashboardData, isLoading, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardAPI.getDashboard,
    refetchInterval: 5 * 60 * 1000,
  });

  // Close sidebar on mobile by default
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setSidebarOpen(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const ActiveView = VIEWS[activeView] || DashboardHome;

  return (
    <div className="flex h-screen bg-dark overflow-hidden" style={{ direction: 'rtl' }}>
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-secondary-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-primary-500/3 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Mobile sidebar overlay - tap to close */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile unless open */}
      <div className={`fixed right-0 top-0 h-full z-40 transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : 'translate-x-full md:translate-x-0'
      }`}>
        <Sidebar
          activeView={activeView}
          setActiveView={(view) => {
            setActiveView(view);
            if (window.innerWidth < 768) setSidebarOpen(false);
          }}
          isOpen={sidebarOpen}
          setIsOpen={setSidebarOpen}
          dashboardData={dashboardData?.data}
          userPlan={userPlan}
        />
      </div>

      {/* Main Content - full width on mobile, shift on desktop */}
      <div
        className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
          sidebarOpen ? 'md:mr-64' : 'md:mr-16'
        }`}
      >
        <Header
          onViewChange={setActiveView}
          activeView={activeView}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 relative z-10">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <ActiveView
              dashboardData={dashboardData?.data}
              isLoading={isLoading}
              refetch={refetch}
              userPlan={userPlan}
              onViewChange={setActiveView}
            />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
