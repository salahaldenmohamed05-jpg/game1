/**
 * Main Dashboard Component — Unified Layout
 * ============================================
 * UX DECISIONS:
 * 1. Mobile primary navigation = bottom nav (5 core items)
 * 2. Desktop primary navigation = sidebar (full feature set)
 * 3. Hamburger menu removed from mobile header — bottom nav is sufficient
 *    and hamburger was duplicating navigation items
 * 4. AssistantView gets special layout treatment (fullHeight) so it
 *    can manage its own 3-layer scroll architecture
 * 5. Analytics replaces separate Insights + Performance pages
 */

import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardAPI } from '../../utils/api';
import Sidebar from '../layout/Sidebar';
import Header from '../layout/Header';
import MobileLayout from '../layout/MobileLayout';
import DashboardHome from './DashboardHome';
import TasksView from '../tasks/TasksView';
import HabitsView from '../habits/HabitsView';
import MoodView from '../mood/MoodView';
// InsightsView and PerformanceView are preserved but no longer imported here.
// Both routes ('insights', 'performance') now map to AnalyticsView.
import CalendarView from '../calendar/CalendarView';
import NotificationsView from '../notifications/NotificationsView';
import SubscriptionView from '../subscription/SubscriptionView';
import GlobalIntelligenceView from '../global/GlobalIntelligenceView';
import IntegrationsView from '../integrations/IntegrationsView';
import AssistantView from '../assistant/AssistantView';
import LogsView from '../logs/LogsView';
import AnalyticsView from '../analytics/AnalyticsView';
import useAuthStore from '../../store/authStore';
import ErrorBoundary from '../common/ErrorBoundary';
import MobileBottomNav from '../layout/MobileBottomNav';

const VIEWS = {
  dashboard:     DashboardHome,
  tasks:         TasksView,
  habits:        HabitsView,
  mood:          MoodView,
  insights:      AnalyticsView,    // MERGED: insights now routes to unified analytics
  assistant:     AssistantView,
  calendar:      CalendarView,
  notifications: NotificationsView,
  performance:   AnalyticsView,    // MERGED: performance now routes to unified analytics
  analytics:     AnalyticsView,    // NEW: direct analytics route
  subscription:  SubscriptionView,
  intelligence:  GlobalIntelligenceView,
  integrations:  IntegrationsView,
  ai_chat:       AssistantView,
  copilot:       AssistantView,
  adaptive:      AssistantView,
  optimizer:     AssistantView,
  logs:          LogsView,
};

// Views that need fullHeight mode (own scroll management)
const FULL_HEIGHT_VIEWS = new Set(['assistant', 'ai_chat', 'copilot', 'adaptive', 'optimizer']);

export default function Dashboard() {
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false); // Default closed; desktop auto-opens
  const { user } = useAuthStore();
  const userPlan = user?.subscription_plan || 'free';

  const { data: dashboardData, isLoading, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardAPI.getDashboard,
    refetchInterval: 5 * 60 * 1000,
  });

  // Responsive sidebar: open on desktop, closed on mobile
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setSidebarOpen(true);
      } else {
        setSidebarOpen(false);
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const ActiveView = VIEWS[activeView] || DashboardHome;
  const isFullHeight = FULL_HEIGHT_VIEWS.has(activeView);

  return (
    <div className="flex h-screen bg-dark overflow-hidden" dir="rtl">
      {/* Animated background */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-0 right-0 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-secondary-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-primary-500/3 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — desktop: always visible; mobile: slide-in overlay */}
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

      {/* Main Content Area
          CRITICAL: min-w-0 prevents flex item from growing beyond parent.
          overflow-x-hidden clips accidental horizontal overflow. */}
      <div
        className={`flex-1 min-w-0 flex flex-col min-h-0 overflow-x-hidden transition-all duration-300 relative z-10 ${
          sidebarOpen ? 'md:mr-64' : 'md:mr-16'
        }`}
      >
        {/* Sticky Header */}
        <Header
          onViewChange={setActiveView}
          activeView={activeView}
          onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
        />

        {/* Scrollable Page Content via MobileLayout
            fullHeight mode for chat views (they manage their own scroll) */}
        <MobileLayout fullHeight={isFullHeight}>
          <ErrorBoundary>
            <ActiveView
              dashboardData={dashboardData?.data?.data}
              isLoading={isLoading}
              refetch={refetch}
              userPlan={userPlan}
              onViewChange={setActiveView}
            />
          </ErrorBoundary>
        </MobileLayout>

        {/* Mobile Bottom Navigation — always visible on mobile.
            The assistant input bar accounts for bottom-nav height. */}
        <MobileBottomNav
          activeView={activeView}
          setActiveView={setActiveView}
          dashboardData={dashboardData?.data?.data}
        />
      </div>
    </div>
  );
}
