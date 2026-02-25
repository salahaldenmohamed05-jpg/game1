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
import AIChat from '../voice/AIChat';
import CalendarView from '../calendar/CalendarView';
import NotificationsView from '../notifications/NotificationsView';

const VIEWS = {
  dashboard: DashboardHome,
  tasks: TasksView,
  habits: HabitsView,
  mood: MoodView,
  insights: InsightsView,
  ai_chat: AIChat,
  calendar: CalendarView,
  notifications: NotificationsView,
};

export default function Dashboard() {
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const { data: dashboardData, isLoading, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardAPI.getDashboard,
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  const ActiveView = VIEWS[activeView] || DashboardHome;

  return (
    <div className="flex h-screen bg-dark overflow-hidden" style={{ direction: 'rtl' }}>
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-secondary-500/5 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-primary-500/3 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2"></div>
      </div>

      {/* Sidebar */}
      <Sidebar
        activeView={activeView}
        setActiveView={setActiveView}
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        dashboardData={dashboardData?.data}
      />

      {/* Main Content */}
      <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${sidebarOpen ? 'mr-64' : 'mr-16'}`}>
        <Header
          activeView={activeView}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          dashboardData={dashboardData?.data}
        />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto p-6 relative z-10">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <ActiveView
              dashboardData={dashboardData?.data}
              isLoading={isLoading}
              refetch={refetch}
            />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
