/**
 * Sidebar Component
 * ==================
 * الشريط الجانبي للتنقل
 */

import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, CheckSquare, Activity, Heart, Brain,
  Bell, Calendar, Mic, Settings, LogOut, ChevronLeft, Menu
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

const NAV_ITEMS = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'الرئيسية', badge: null },
  { id: 'tasks', icon: CheckSquare, label: 'المهام', badge: 'tasks' },
  { id: 'habits', icon: Activity, label: 'العادات', badge: null },
  { id: 'mood', icon: Heart, label: 'المزاج', badge: null },
  { id: 'calendar', icon: Calendar, label: 'التقويم', badge: null },
  { id: 'insights', icon: Brain, label: 'الرؤى والتقارير', badge: null },
  { id: 'notifications', icon: Bell, label: 'الإشعارات', badge: 'unread' },
  { id: 'ai_chat', icon: Mic, label: 'مساعد ذكي', badge: null },
];

export default function Sidebar({ activeView, setActiveView, isOpen, setIsOpen, dashboardData }) {
  const { user, logout } = useAuthStore();

  const handleLogout = async () => {
    await logout();
    toast.success('تم تسجيل الخروج');
  };

  return (
    <motion.aside
      animate={{ width: isOpen ? 256 : 64 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="fixed right-0 top-0 h-full z-40 overflow-hidden"
      style={{
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(20px)',
        borderLeft: '1px solid rgba(108, 99, 255, 0.2)',
      }}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <AnimatePresence>
            {isOpen && (
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-lg flex-shrink-0">
                  ✨
                </div>
                <div>
                  <span className="font-black text-lg gradient-text">LifeFlow</span>
                  <p className="text-xs text-gray-500">مساعدك الذكي</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-all"
          >
            {isOpen ? <ChevronLeft size={18} /> : <Menu size={18} />}
          </button>
        </div>

        {/* User Info */}
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="p-4 border-b border-white/5"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-secondary-500 flex items-center justify-center text-lg font-bold text-white flex-shrink-0">
                {user?.name?.charAt(0) || 'م'}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-white truncate">{user?.name}</p>
                <p className="text-xs text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const badge = item.badge === 'tasks'
              ? dashboardData?.summary?.tasks?.pending
              : item.badge === 'unread'
              ? dashboardData?.summary?.unread_notifications
              : null;

            return (
              <motion.button
                key={item.id}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setActiveView(item.id)}
                className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
                  isActive
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <div className={`relative flex-shrink-0 ${isActive ? 'text-primary-400' : ''}`}>
                  <Icon size={20} />
                  {badge > 0 && (
                    <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </div>
                <AnimatePresence>
                  {isOpen && (
                    <motion.span
                      initial={{ opacity: 0, x: 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="text-sm font-medium whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t border-white/10 space-y-1">
          <button className="w-full flex items-center gap-3 p-3 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all">
            <Settings size={20} />
            {isOpen && <span className="text-sm">الإعدادات</span>}
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut size={20} />
            {isOpen && <span className="text-sm">تسجيل الخروج</span>}
          </button>
        </div>
      </div>
    </motion.aside>
  );
}
