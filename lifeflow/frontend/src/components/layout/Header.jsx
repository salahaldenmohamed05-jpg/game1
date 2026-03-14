/**
 * Header Component
 * ==================
 * Top navigation bar with user info, notifications, plan badge
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Crown, Zap, ChevronDown, LogOut, User, Settings, X, Menu, Sun, Moon } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import useAuthStore from '../../store/authStore';
import useThemeStore from '../../store/themeStore';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function Header({ onViewChange, onMenuToggle }) {
  const { user, logout } = useAuthStore();
  const { isDark, toggleTheme } = useThemeStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notifRef = useRef(null);
  const userRef = useRef(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setShowNotifications(false);
      }
      if (userRef.current && !userRef.current.contains(e.target)) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const { data: notifData } = useQuery({
    queryKey: ['header-notifications'],
    queryFn: () => api.get('/notifications?limit=5&unread_only=true'),  // fixed: was unread=true
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, Crown, Zap, ChevronDown, LogOut, User, Settings, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import useAuthStore from '../../store/authStore';
import api from '../../utils/api';
import toast from 'react-hot-toast';

export default function Header({ onViewChange }) {
  const { user, logout } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);

  const { data: notifData } = useQuery({
    queryKey: ['header-notifications'],
    queryFn: () => api.get('/notifications?limit=5&unread=true'),
    refetchInterval: 60000,
    retry: 1,
  });

  const { data: subData } = useQuery({
    queryKey: ['subscription-header'],
    queryFn: () => api.get('/subscription/status'),
    retry: 1,
    staleTime: 10 * 60 * 1000,
  });

  const notifications = notifData?.data?.notifications || [];
  const unreadCount = notifData?.data?.unread || notifData?.data?.unread_count || 0;  // backend uses 'unread'
  const unreadCount = notifData?.data?.unread_count || 0;
  const plan = subData?.data?.plan || user?.subscription_plan || 'free';
  const isPremium = ['premium', 'enterprise', 'trial'].includes(plan);
  const trialDays = subData?.data?.trial_days_remaining;

  const handleLogout = async () => {
    await logout();
    toast.success('تم تسجيل الخروج');
  };

  const PLAN_LABELS = {
    free: { label: 'مجاني', color: 'text-gray-400 bg-gray-500/20', icon: null },
    trial: { label: `تجريبي (${trialDays || 0} يوم)`, color: 'text-yellow-400 bg-yellow-500/20', icon: <Zap size={12} /> },
    premium: { label: 'بريميوم', color: 'text-purple-400 bg-purple-500/20', icon: <Crown size={12} /> },
    enterprise: { label: 'مؤسسي', color: 'text-blue-400 bg-blue-500/20', icon: <Crown size={12} /> },
  };

  const planInfo = PLAN_LABELS[plan] || PLAN_LABELS.free;

  return (
    <header className="sticky top-0 z-40 glass-card border-b border-white/5 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Mobile hamburger menu */}
        <div className="flex items-center gap-2">
          <button
            onClick={onMenuToggle}
            className="p-2 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-colors md:hidden"
          >
            <Menu size={20} />
          </button>

          {/* Left: Plan Badge */}
          <div className="flex items-center gap-2">
            <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${planInfo.color}`}>
              {planInfo.icon}
              {planInfo.label}
            </div>
            {!isPremium && (
              <button
                onClick={() => onViewChange?.('subscription')}
                className="text-xs text-primary-400 hover:text-primary-300 transition-colors hidden sm:block"
              >
                ترقية ←
              </button>
            )}
          </div>
        </div>

        {/* Right: Notifications + Theme Toggle + User */}
        <div className="flex items-center gap-3">
          {/* Theme Toggle */}
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={toggleTheme}
            className="relative p-2 rounded-xl hover:bg-white/5 transition-colors"
            title={isDark ? 'تبديل للثيم النهاري' : 'تبديل للثيم الليلي'}
          >
            <AnimatePresence mode="wait">
              {isDark ? (
                <motion.div key="sun" initial={{ opacity: 0, rotate: -90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: 90 }} transition={{ duration: 0.2 }}>
                  <Sun size={20} className="text-yellow-400" />
                </motion.div>
              ) : (
                <motion.div key="moon" initial={{ opacity: 0, rotate: 90 }} animate={{ opacity: 1, rotate: 0 }} exit={{ opacity: 0, rotate: -90 }} transition={{ duration: 0.2 }}>
                  <Moon size={20} className="text-primary-400" />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.button>
          {/* Notifications Bell */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-xl hover:bg-white/5 transition-colors"
            >
              <Bell size={20} className="text-gray-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute left-0 top-full mt-2 w-80 glass-card p-4 shadow-2xl z-50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-white text-sm">الإشعارات</h3>
                    <button onClick={() => setShowNotifications(false)}>
                      <X size={16} className="text-gray-400" />
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-4">لا توجد إشعارات جديدة</p>
                  ) : (
                    <div className="space-y-2">
                      {notifications.map(n => (
                        <div key={n.id} className={`p-3 rounded-xl text-sm ${n.is_read ? 'bg-white/3' : 'bg-primary-500/10 border border-primary-500/20'}`}>
                          <p className="text-white font-medium">{n.title}</p>
                          <p className="text-gray-400 text-xs mt-1">{n.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => { onViewChange?.('notifications'); setShowNotifications(false); }}
                    className="w-full mt-3 text-xs text-primary-400 hover:text-primary-300 text-center"
                  >
                    عرض كل الإشعارات
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User Menu */}
          <div className="relative" ref={userRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                {user?.name?.[0] || 'م'}
              </div>
              <span className="text-sm text-gray-300 hidden md:block">{user?.name || 'المستخدم'}</span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>


  return (
    <header className="sticky top-0 z-40 glass-card border-b border-white/5 px-4 py-3">
      <div className="flex items-center justify-between max-w-7xl mx-auto">
        {/* Left: Plan Badge & Score */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${planInfo.color}`}>
            {planInfo.icon}
            {planInfo.label}
          </div>
          {!isPremium && (
            <button
              onClick={() => onViewChange?.('subscription')}
              className="text-xs text-primary-400 hover:text-primary-300 transition-colors"
            >
              ترقية ←
            </button>
          )}
        </div>

        {/* Right: Notifications + User */}
        <div className="flex items-center gap-3">
          {/* Notifications Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              className="relative p-2 rounded-xl hover:bg-white/5 transition-colors"
            >
              <Bell size={20} className="text-gray-300" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full text-xs text-white flex items-center justify-center font-bold">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <AnimatePresence>
              {showNotifications && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute left-0 top-full mt-2 w-80 glass-card p-4 shadow-2xl z-50"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-white text-sm">الإشعارات</h3>
                    <button onClick={() => setShowNotifications(false)}>
                      <X size={16} className="text-gray-400" />
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-4">لا توجد إشعارات جديدة</p>
                  ) : (
                    <div className="space-y-2">
                      {notifications.map(n => (
                        <div key={n.id} className={`p-3 rounded-xl text-sm ${n.is_read ? 'bg-white/3' : 'bg-primary-500/10 border border-primary-500/20'}`}>
                          <p className="text-white font-medium">{n.title}</p>
                          <p className="text-gray-400 text-xs mt-1">{n.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={() => { onViewChange?.('notifications'); setShowNotifications(false); }}
                    className="w-full mt-3 text-xs text-primary-400 hover:text-primary-300 text-center"
                  >
                    عرض كل الإشعارات
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* User Menu */}
          <div className="relative">
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-white/5 transition-colors"
            >
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center text-white text-sm font-bold">
                {user?.name?.[0] || 'م'}
              </div>
              <span className="text-sm text-gray-300 hidden md:block">{user?.name || 'المستخدم'}</span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute left-0 top-full mt-2 w-56 glass-card p-2 shadow-2xl z-50"
                >
                  <div className="p-3 border-b border-white/5 mb-2">
                    <p className="text-white font-medium text-sm">{user?.name}</p>
                    <p className="text-gray-400 text-xs">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => { onViewChange?.('profile'); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-gray-300 text-sm transition-colors"
                  >
                    <User size={16} /> الملف الشخصي
                  </button>
                  <button
                    onClick={() => { onViewChange?.('settings'); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-white/5 text-gray-300 text-sm transition-colors"
                  >
                    <Settings size={16} /> الإعدادات
                  </button>
                  {!isPremium && (
                    <button
                      onClick={() => { onViewChange?.('subscription'); setShowUserMenu(false); }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-purple-500/20 text-purple-400 text-sm transition-colors"
                    >
                      <Crown size={16} /> ترقية للبريميوم
                    </button>
                  )}
                  <div className="border-t border-white/5 mt-2 pt-2">
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-red-500/10 text-red-400 text-sm transition-colors"
                    >
                      <LogOut size={16} /> تسجيل الخروج
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}
