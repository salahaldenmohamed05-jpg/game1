/**
 * Main Dashboard Component — Phase G: Unified Layout
 * =====================================================
 * UX DECISIONS:
 * 1. Dashboard-first: DashboardHome is the DEFAULT landing page
 * 2. SIDEBAR REMOVED — replaced by unified BottomNav (mobile) + TopNav (desktop)
 * 3. Mobile: bottom nav (5 core) + "More" bottom sheet
 * 4. Desktop: horizontal top bar (same items) + "More" dropdown
 * 5. Persistent QuickCommandInput on every screen (except assistant)
 * 6. Analytics replaces separate Insights + Performance pages
 *
 * PHASE G: Reliability improvements:
 * - Each section wrapped in ErrorBoundary (compact mode)
 * - Defensive data access (optional chaining everywhere)
 * - Loading/error states for dashboard query
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { dashboardAPI } from '../../utils/api';
import Header from '../layout/Header';
import MobileLayout from '../layout/MobileLayout';
import DashboardHome from './DashboardHome';
import TasksView from '../tasks/TasksView';
import HabitsView from '../habits/HabitsView';
import MoodView from '../mood/MoodView';
import CalendarView from '../calendar/CalendarView';
import NotificationsView from '../notifications/NotificationsView';
import SubscriptionView from '../subscription/SubscriptionView';
import GlobalIntelligenceView from '../global/GlobalIntelligenceView';
import IntegrationsView from '../integrations/IntegrationsView';
import AssistantView from '../assistant/AssistantView';
import LogsView from '../logs/LogsView';
import AnalyticsView from '../analytics/AnalyticsView';
import ProfileView from '../profile/ProfileView';
import SettingsView from '../settings/SettingsView';
import useAuthStore from '../../store/authStore';
import ErrorBoundary from '../common/ErrorBoundary';
import MobileBottomNav from '../layout/MobileBottomNav';
import QuickCommandInput from '../flow/QuickCommandInput';

const VIEWS = {
  dashboard:     DashboardHome,
  tasks:         TasksView,
  habits:        HabitsView,
  mood:          MoodView,
  insights:      AnalyticsView,
  assistant:     AssistantView,
  calendar:      CalendarView,
  notifications: NotificationsView,
  performance:   AnalyticsView,
  analytics:     AnalyticsView,
  subscription:  SubscriptionView,
  intelligence:  GlobalIntelligenceView,
  integrations:  IntegrationsView,
  ai_chat:       AssistantView,
  copilot:       AssistantView,
  adaptive:      AssistantView,
  optimizer:     AssistantView,
  logs:          LogsView,
  profile:       ProfileView,
  settings:      SettingsView,
};

// Views that need fullHeight mode (own scroll management)
const FULL_HEIGHT_VIEWS = new Set(['assistant', 'ai_chat', 'copilot', 'adaptive', 'optimizer']);

export default function Dashboard() {
  const [activeView, setActiveView] = useState('dashboard');
  const { user } = useAuthStore();
  const userPlan = user?.subscription_plan || 'free';

  const { data: dashboardData, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardAPI.getDashboard,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 2,
  });

  // Safe view resolution — prevent crash if view name is invalid
  const ActiveView = VIEWS[activeView] || DashboardHome;
  const isFullHeight = FULL_HEIGHT_VIEWS.has(activeView);

  // Safely extract dashboard data
  const safeData = dashboardData?.data?.data || null;

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-dark overflow-hidden" dir="rtl">
        {/* Animated background */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <div className="absolute top-0 end-0 w-96 h-96 bg-primary-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-0 start-0 w-80 h-80 bg-secondary-500/5 rounded-full blur-3xl" />
          <div className="absolute top-1/2 start-1/2 w-64 h-64 bg-primary-500/3 rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2" />
        </div>

        {/* Header */}
        <ErrorBoundary compact>
          <Header onViewChange={setActiveView} activeView={activeView} />
        </ErrorBoundary>

        {/* Desktop TopNav (rendered inside MobileBottomNav for md+ screens) */}
        <ErrorBoundary compact>
          <MobileBottomNav
            activeView={activeView}
            setActiveView={setActiveView}
            dashboardData={safeData}
          />
        </ErrorBoundary>

        {/* Main Content Area — full width, no sidebar margin */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-x-hidden relative z-10">
          <MobileLayout fullHeight={isFullHeight}>
            {/* key={activeView} resets ErrorBoundary when switching views */}
            <ErrorBoundary key={activeView}>
              <ActiveView
                dashboardData={safeData}
                isLoading={isLoading}
                isError={isError}
                refetch={refetch}
                userPlan={userPlan}
                onViewChange={setActiveView}
              />
            </ErrorBoundary>
          </MobileLayout>
        </div>

        {/* Persistent floating assistant trigger */}
        <ErrorBoundary compact>
          <QuickCommandInput
            onViewChange={setActiveView}
            activeView={activeView}
          />
        </ErrorBoundary>
      </div>
    </ErrorBoundary>
  );
}
