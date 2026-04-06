/**
 * Main Dashboard Component — Phase G: Unified Layout
 * =====================================================
 * FIXES:
 * 1. Dashboard-first: DashboardHome is the DEFAULT landing page
 * 2. Active view persisted in localStorage — reload preserves current page
 * 3. "نفّذ" (Execute) moved to "More" menu, nav starts with "الرئيسية"
 * 4. Modals use pb-safe to avoid being cut off by bottom nav
 *
 * PHASE G: Reliability improvements:
 * - Each section wrapped in ErrorBoundary (compact mode)
 * - Defensive data access (optional chaining everywhere)
 * - Loading/error states for dashboard query
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
import FocusTimerView from '../focus/FocusTimerView';
import ExecutionScreen from '../execution/ExecutionScreen';
import DailyExecutionFlow from '../execution/DailyExecutionFlow';
import ExportView from '../export/ExportView';
import GoalsView from '../goals/GoalsView';
import useAuthStore from '../../store/authStore';
import ErrorBoundary from '../common/ErrorBoundary';
import MobileBottomNav, { getPersistedView } from '../layout/MobileBottomNav';
import QuickCommandInput from '../flow/QuickCommandInput';
import GlobalSearch from '../search/GlobalSearch';
import InterventionBanner from '../common/InterventionBanner';
// QuickWidget REMOVED — Phase 10: floating button completely eliminated per user request

// Merged: "execution" and "daily_flow" point to the SAME DailyExecutionFlow
const VIEWS = {
  dashboard:     DashboardHome,
  daily_flow:    DailyExecutionFlow,
  execution:     DailyExecutionFlow,  // merged with daily_flow
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
  focus:         FocusTimerView,
  export:        ExportView,
  goals:         GoalsView,
};

// Views that need fullHeight mode (own scroll management)
const FULL_HEIGHT_VIEWS = new Set(['assistant', 'ai_chat', 'copilot', 'adaptive', 'optimizer']);

export default function Dashboard() {
  // Restore persisted view on mount (survives page reload)
  const [activeView, setActiveView] = useState(() => {
    const saved = getPersistedView();
    return VIEWS[saved] ? saved : 'dashboard';
  });
  const [searchOpen, setSearchOpen] = useState(false);
  const { user } = useAuthStore();

  // Keyboard shortcut Cmd+K / Ctrl+K for global search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Listen for navigation events from QuickWidget
  useEffect(() => {
    const handleNav = (e) => {
      const view = e?.detail?.view;
      if (view && VIEWS[view]) setActiveView(view);
    };
    window.addEventListener('lifeflow-navigate', handleNav);
    return () => window.removeEventListener('lifeflow-navigate', handleNav);
  }, []);
  const userPlan = user?.subscription_plan || 'free';

  const { data: dashboardData, isLoading: queryLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardAPI.getDashboard,
    staleTime: 3 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1, // Phase 13: Reduced from 2 to 1 to prevent long loading
  });

  // Phase 13: CRITICAL FIX — Dashboard loading timeout.
  // If dashboardAPI takes >3s, render the page anyway with null data.
  // This prevents the app from staying stuck on the skeleton forever.
  const [dashLoadTimedOut, setDashLoadTimedOut] = useState(false);
  const dashTimerRef = useRef(null);
  useEffect(() => {
    if (!queryLoading) {
      setDashLoadTimedOut(false);
      if (dashTimerRef.current) { clearTimeout(dashTimerRef.current); dashTimerRef.current = null; }
      return;
    }
    // If already timed out, don't restart timer
    if (dashLoadTimedOut) return;
    dashTimerRef.current = setTimeout(() => {
      if (!dashboardData) {
        console.warn('[Dashboard][Phase13] Dashboard query timed out after 3s — rendering with empty data');
        setDashLoadTimedOut(true);
      }
    }, 3000);
    return () => { if (dashTimerRef.current) clearTimeout(dashTimerRef.current); };
  }, [queryLoading, dashboardData, dashLoadTimedOut]);

  // Phase 13: isLoading is false if timed out
  const isLoading = queryLoading && !dashLoadTimedOut;

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

        {/* Phase 15: Proactive Intervention Banners — non-intrusive overlay */}
        <InterventionBanner />

        {/* QuickWidget REMOVED — Phase 10: floating ⚡ button completely eliminated */}

        {/* Global Search Modal */}
        <GlobalSearch
          isOpen={searchOpen}
          onClose={() => setSearchOpen(false)}
          onNavigate={setActiveView}
        />

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
