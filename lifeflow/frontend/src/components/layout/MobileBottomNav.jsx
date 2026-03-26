/**
 * Mobile Bottom Navigation + "More" Bottom Sheet
 * =================================================
 * Bottom nav: [ Home | Tasks | Habits | Assistant | More ]
 * "More" opens a bottom sheet giving access to ALL secondary pages:
 *   Analytics, Notifications, Calendar, Mood, Intelligence, Integrations,
 *   Logs, Subscription, Settings.
 *
 * This ensures zero navigation dead-ends on mobile.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, CheckSquare, Target, Sparkles, MoreHorizontal, X,
  BarChart2, Bell, Calendar, Heart, Globe, Link2, Activity,
  Crown, Settings, LogOut,
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

// ─── Primary bottom nav items (always visible) ───────────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard', icon: Home,        label: 'الرئيسية' },
  { id: 'tasks',     icon: CheckSquare, label: 'المهام',   badge: 'tasks' },
  { id: 'habits',    icon: Target,      label: 'العادات' },
  { id: 'assistant', icon: Sparkles,    label: 'المساعد' },
  { id: '__more__',  icon: MoreHorizontal, label: 'المزيد' },
];

// ─── "More" menu items — ALL routes the user must be able to reach ────────────
const MORE_ITEMS = [
  { id: 'analytics',     icon: BarChart2, label: 'التحليلات',      desc: 'الأداء والتقارير',  premium: true },
  { id: 'notifications', icon: Bell,      label: 'الإشعارات',      desc: 'كل الإشعارات',      badge: 'unread' },
  { id: 'calendar',      icon: Calendar,  label: 'التقويم',         desc: 'الأحداث والمواعيد' },
  { id: 'mood',          icon: Heart,     label: 'المزاج',          desc: 'تتبع المزاج اليومي' },
  { id: 'intelligence',  icon: Globe,     label: 'الذكاء العالمي',  desc: 'تحليل متقدم',       premium: true },
  { id: 'integrations',  icon: Link2,     label: 'التكاملات',       desc: 'ربط التطبيقات' },
  { id: 'logs',          icon: Activity,  label: 'سجلات النظام',   desc: 'سجل النشاطات' },
  { id: 'subscription',  icon: Crown,     label: 'الاشتراك',        desc: 'ترقية وإدارة الخطة' },
  { id: '__settings__',  icon: Settings,  label: 'الإعدادات',       desc: 'إعدادات التطبيق' },
];

export default function MobileBottomNav({ activeView, setActiveView, dashboardData }) {
  const [showMore, setShowMore] = useState(false);
  const { logout } = useAuthStore();

  const getBadge = (badgeType) => {
    if (!dashboardData) return 0;
    if (badgeType === 'tasks')  return dashboardData.summary?.tasks?.pending || 0;
    if (badgeType === 'unread') return dashboardData.summary?.unread_notifications || 0;
    return 0;
  };

  // Close on Escape key
  useEffect(() => {
    if (!showMore) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowMore(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showMore]);

  const handleNavClick = useCallback((id) => {
    if (id === '__more__') {
      setShowMore(prev => !prev);
    } else {
      setActiveView(id);
      setShowMore(false);
    }
  }, [setActiveView]);

  const handleMoreItemClick = useCallback((id) => {
    if (id === '__settings__') {
      // Settings doesn't have its own view yet — show toast
      toast('الإعدادات قادمة قريباً', { icon: '⚙️' });
    } else {
      setActiveView(id);
    }
    setShowMore(false);
  }, [setActiveView]);

  const handleLogout = async () => {
    setShowMore(false);
    await logout();
    toast.success('تم تسجيل الخروج بنجاح');
  };

  // Determine if "More" should show active state
  const isMoreActive = showMore || MORE_ITEMS.some(i => i.id === activeView);

  return (
    <>
      {/* ═══ Bottom Sheet Overlay + Menu ═══ */}
      <AnimatePresence>
        {showMore && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 bg-black/60 z-[98] md:hidden"
              onClick={() => setShowMore(false)}
            />

            {/* Bottom Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="fixed bottom-0 left-0 right-0 z-[99] md:hidden"
              dir="rtl"
            >
              <div className="mx-2 mb-[76px] rounded-2xl overflow-hidden"
                style={{
                  background: 'rgba(15, 15, 30, 0.97)',
                  backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
                }}>

                {/* Header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2">
                  <h3 className="text-sm font-bold text-white">المزيد</h3>
                  <button
                    onClick={() => setShowMore(false)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 transition-all active:scale-90"
                  >
                    <X size={16} />
                  </button>
                </div>

                {/* Menu Grid */}
                <div className="grid grid-cols-3 gap-1 px-3 pb-3">
                  {MORE_ITEMS.map(({ id, icon: Icon, label, desc, badge, premium }) => {
                    const badgeCount = badge ? getBadge(badge) : 0;
                    const isActive = activeView === id;

                    return (
                      <button
                        key={id}
                        onClick={() => handleMoreItemClick(id)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all active:scale-95 ${
                          isActive
                            ? 'bg-primary-500/15 border border-primary-500/30'
                            : 'hover:bg-white/5 border border-transparent'
                        }`}
                      >
                        <div className="relative">
                          <Icon
                            size={20}
                            className={isActive ? 'text-primary-400' : 'text-gray-400'}
                          />
                          {badgeCount > 0 && (
                            <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-red-500 rounded-full
                              text-[9px] text-white flex items-center justify-center font-bold leading-none">
                              {badgeCount > 9 ? '9+' : badgeCount}
                            </span>
                          )}
                          {premium && (
                            <Crown size={8} className="absolute -bottom-0.5 -left-1 text-yellow-400" />
                          )}
                        </div>
                        <span className={`text-[11px] font-medium leading-tight text-center ${
                          isActive ? 'text-primary-400' : 'text-gray-300'
                        }`}>
                          {label}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Logout */}
                <div className="border-t border-white/[0.06] px-4 py-2.5">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl
                      text-gray-400 hover:text-red-400 hover:bg-red-500/5 transition-all text-sm"
                  >
                    <LogOut size={16} />
                    <span>تسجيل الخروج</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══ Bottom Navigation Bar ═══ */}
      <nav className="bottom-nav md:hidden" role="navigation" aria-label="التنقل الرئيسي">
        {NAV_ITEMS.map(({ id, icon: Icon, label, badge }) => {
          const isActive = id === '__more__' ? isMoreActive : activeView === id;
          const badgeCount = badge ? getBadge(badge) : 0;

          return (
            <motion.button
              key={id}
              onClick={() => handleNavClick(id)}
              className={`bottom-nav-item ${isActive ? 'active' : ''}`}
              whileTap={{ scale: 0.88 }}
              aria-label={label}
              aria-current={isActive && id !== '__more__' ? 'page' : undefined}
            >
              {/* Active indicator dot */}
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-dot"
                  className="absolute -top-0.5 w-5 h-1 rounded-full bg-primary-500"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}

              <div className="relative">
                <Icon
                  size={22}
                  className={isActive ? 'text-primary-400' : 'text-gray-500'}
                  strokeWidth={isActive ? 2.5 : 1.8}
                />
                {badgeCount > 0 && (
                  <span className="bottom-nav-badge">{badgeCount > 9 ? '9+' : badgeCount}</span>
                )}
              </div>
              <span className={`text-[10px] font-semibold ${isActive ? 'text-primary-400' : 'text-gray-500'}`}>
                {label}
              </span>
            </motion.button>
          );
        })}
      </nav>
    </>
  );
}
