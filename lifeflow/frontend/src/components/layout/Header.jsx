/**
 * Header Component
 */
import { Bell, Search, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { notificationAPI } from '../../utils/api';
import useAuthStore from '../../store/authStore';

const VIEW_TITLES = {
  dashboard: { title: 'لوحة التحكم', subtitle: 'نظرة عامة على يومك' },
  tasks: { title: 'المهام', subtitle: 'إدارة وتتبع مهامك' },
  habits: { title: 'العادات', subtitle: 'بناء عادات صحية يومية' },
  mood: { title: 'المزاج', subtitle: 'تتبع وتحليل مزاجك اليومي' },
  insights: { title: 'الرؤى والتقارير', subtitle: 'تقارير ذكية بالذكاء الاصطناعي' },
  ai_chat: { title: 'المساعد الذكي', subtitle: 'تحدث مع LifeFlow' },
};

export default function Header({ activeView, sidebarOpen, setSidebarOpen, dashboardData }) {
  const { user } = useAuthStore();
  const [showNotifs, setShowNotifs] = useState(false);

  const { data: notifsData } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => notificationAPI.getNotifications({ unread_only: true, limit: 5 }),
    refetchInterval: 60000,
  });

  const unreadCount = notifsData?.data?.unread || 0;
  const viewInfo = VIEW_TITLES[activeView] || VIEW_TITLES.dashboard;

  return (
    <header className="relative z-20 px-6 py-4 flex items-center justify-between"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div>
        <h2 className="text-xl font-bold text-white">{viewInfo.title}</h2>
        <p className="text-xs text-gray-500">{viewInfo.subtitle}</p>
      </div>

      <div className="flex items-center gap-3">
        {/* Time display */}
        <div className="hidden md:block text-sm text-gray-400 bg-white/5 px-3 py-1.5 rounded-lg">
          {dashboardData?.date?.time || new Date().toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotifs(!showNotifs)}
            className="relative p-2 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {showNotifs && (
            <div className="absolute left-0 top-12 w-80 glass-card p-4 z-50 shadow-2xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">الإشعارات</h3>
                {unreadCount > 0 && (
                  <button className="text-xs text-primary-400 hover:text-primary-300"
                    onClick={() => notificationAPI.markAllRead()}>
                    تعليم الكل كمقروء
                  </button>
                )}
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {notifsData?.data?.notifications?.slice(0, 5).map(n => (
                  <div key={n.id} className={`p-3 rounded-lg text-sm ${n.is_read ? 'bg-white/3' : 'bg-primary-500/10 border border-primary-500/20'}`}>
                    <div className="font-medium text-white text-xs">{n.title}</div>
                    <p className="text-gray-400 text-xs mt-0.5 line-clamp-2">{n.body}</p>
                  </div>
                )) || (
                  <p className="text-center text-gray-500 text-xs py-4">لا توجد إشعارات جديدة</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* User avatar */}
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-sm font-bold text-white cursor-pointer">
          {user?.name?.charAt(0) || 'م'}
        </div>
      </div>
    </header>
  );
}
