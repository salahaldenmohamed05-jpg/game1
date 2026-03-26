/**
 * Sidebar Navigation Component
 * ==============================
 * الشريط الجانبي للتنقل بين الأقسام
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, CheckSquare, Target, Heart, Brain, MessageSquare,
  Calendar, Bell, BarChart2, Crown, Settings, LogOut,
  Menu, ChevronLeft, Zap, Bot, Rocket, Globe, Link2, Sparkles, Activity
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

/**
 * NAV_ITEMS — Sidebar Navigation Structure
 * MERGE DECISION: 'performance' + 'insights' collapsed into single 'analytics' entry.
 * Both old routes still work in Dashboard.jsx (they map to AnalyticsView),
 * but the sidebar now shows one unified "analytics" item to avoid duplication.
 */
const NAV_ITEMS = [
  { id: 'dashboard',     icon: Home,          label: 'الرئيسية',        badge: null },
  { id: 'tasks',         icon: CheckSquare,   label: 'المهام',           badge: 'tasks' },
  { id: 'habits',        icon: Target,        label: 'العادات',          badge: null },
  { id: 'mood',          icon: Heart,         label: 'المزاج',           badge: null },
  // MERGED: single analytics entry replaces separate performance + insights
  { id: 'analytics',     icon: BarChart2,     label: 'التحليلات',        badge: null,   premium: true },
  // ── Unified Personal Assistant (replaces ai_chat + copilot + adaptive + optimizer) ──
  { id: 'assistant',     icon: Sparkles,      label: 'المساعد الشخصي',  badge: null,   divider: true, highlight: true },
  { id: 'calendar',      icon: Calendar,      label: 'التقويم',          badge: null },
  { id: 'notifications', icon: Bell,          label: 'الإشعارات',        badge: 'unread' },
  { id: 'intelligence',  icon: Globe,         label: 'الذكاء العالمي',   badge: null,   premium: true },
  { id: 'integrations',  icon: Link2,         label: 'التكاملات',        badge: null },
  { id: 'logs',          icon: Activity,      label: 'سجلات النظام',    badge: null },
];

export default function Sidebar({ activeView, setActiveView, isOpen, setIsOpen, dashboardData, userPlan }) {
  const { user, logout } = useAuthStore();
  const isPremium = ['premium', 'enterprise', 'trial'].includes(userPlan || user?.subscription_plan);

  const handleLogout = async () => {
    await logout();
    toast.success('تم تسجيل الخروج بنجاح');
  };

  const getBadgeCount = (badgeType) => {
    if (!dashboardData) return 0;
    if (badgeType === 'tasks')  return dashboardData.summary?.tasks?.pending || 0;
    if (badgeType === 'unread') return dashboardData.summary?.unread_notifications || 0;
    return 0;
  };

  return (
    <motion.aside
      initial={false}
      animate={{ width: isOpen ? 256 : 64 }}
      transition={{ type: 'spring', stiffness: 300, damping: 35 }}
      className="h-full flex flex-col overflow-hidden"
      style={{
        background: 'var(--sidebar-bg, rgba(10,10,20,0.95))',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid var(--border, rgba(255,255,255,0.06))',
      }}
    >
      {/* Toggle Button */}
      <div className="flex items-center justify-between p-4 border-b border-white/5 flex-shrink-0">
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <div className="w-7 h-7 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center">
                <Zap size={14} className="text-white" />
              </div>
              <div>
                <div className="text-white font-black text-sm leading-none">LifeFlow</div>
                <div className="text-gray-500 text-xs">مساعدك الذكي</div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-1.5 rounded-lg hover:bg-white/5 text-gray-400 hover:text-white transition-all flex-shrink-0"
        >
          {isOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* User Info */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="p-4 border-b border-white/5"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                {user?.name?.[0] || 'م'}
              </div>
              <div className="overflow-hidden">
                <div className="text-white font-semibold text-sm truncate">{user?.name || 'المستخدم'}</div>
                <div className="text-gray-500 text-xs truncate">{user?.email}</div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {NAV_ITEMS.map(({ id, icon: Icon, label, badge, premium, divider, highlight }) => {
          const isActive   = activeView === id;
          const badgeCount = badge ? getBadgeCount(badge) : 0;
          const isLocked   = premium && !isPremium;

          return (
            <div key={id}>
              {divider && isOpen && (
                <div className="border-t border-white/5 my-2 mx-1">
                  <p className="text-gray-600 text-xs px-2 py-1">الذكاء المتقدم</p>
                </div>
              )}
              {divider && !isOpen && <div className="border-t border-white/5 my-2 mx-1" />}

              <button
                onClick={() => setActiveView(id)}
                title={!isOpen ? label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-sm relative group ${
                  isActive
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : highlight
                    ? 'text-purple-300 hover:text-white bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className="relative flex-shrink-0">
                  <Icon size={18} className={highlight && !isActive ? 'text-purple-400' : ''} />
                  {badgeCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full text-xs text-white flex items-center justify-center font-bold leading-none">
                      {badgeCount > 9 ? '9+' : badgeCount}
                    </span>
                  )}
                </div>

                <AnimatePresence>
                  {isOpen && (
                    <motion.span
                      initial={{ opacity: 0, width: 0 }}
                      animate={{ opacity: 1, width: 'auto' }}
                      exit={{ opacity: 0, width: 0 }}
                      className="flex-1 text-right truncate"
                    >
                      {label}
                    </motion.span>
                  )}
                </AnimatePresence>

                {isOpen && isLocked && (
                  <Crown size={12} className="text-yellow-400 opacity-60 flex-shrink-0" />
                )}
              </button>
            </div>
          );
        })}
      </nav>

      {/* Bottom: Settings + Logout */}
      <div className="p-2 border-t border-white/5 space-y-0.5">
        {!isPremium && (
          <button
            onClick={() => setActiveView('subscription')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-yellow-400 hover:bg-yellow-500/10 transition-all ${
              activeView === 'subscription' ? 'bg-yellow-500/10' : ''
            }`}
          >
            <Crown size={18} className="flex-shrink-0" />
            <AnimatePresence>
              {isOpen && (
                <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  ترقية للبريميوم
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        )}

        <button
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all text-sm"
        >
          <Settings size={18} className="flex-shrink-0" />
          <AnimatePresence>
            {isOpen && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                الإعدادات
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/5 transition-all text-sm"
        >
          <LogOut size={18} className="flex-shrink-0" />
          <AnimatePresence>
            {isOpen && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                تسجيل الخروج
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </motion.aside>
  );
}
