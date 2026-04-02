/**
 * Unified Navigation — BottomNav (mobile) + TopNav (desktop)
 * ==============================================================
 * FIXES:
 *   - "نفّذ" (Execute) merged into dashboard — replaced with "الرئيسية" (Home)
 *   - Active view persisted in localStorage → survives page reload
 *   - "المزيد" menu redesigned with grouped sections + better visual hierarchy
 *   - Desktop: clean horizontal top bar
 *   - Mobile: bottom tab bar (5 core items) + redesigned bottom sheet
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Home, CheckSquare, Target, Sparkles, MoreHorizontal, X,
  BarChart2, Bell, Calendar, Heart, Globe, Link2, Activity,
  Crown, Settings, LogOut, User, ChevronDown, Timer, Rocket, FileDown,
} from 'lucide-react';
import useAuthStore from '../../store/authStore';
import toast from 'react-hot-toast';

// ── View persistence ────────────────────────────────────────────────
const VIEW_STORAGE_KEY = 'lifeflow_active_view';

export function getPersistedView() {
  if (typeof window === 'undefined') return 'dashboard';
  return localStorage.getItem(VIEW_STORAGE_KEY) || 'dashboard';
}

export function persistView(view) {
  if (typeof window !== 'undefined') {
    localStorage.setItem(VIEW_STORAGE_KEY, view);
  }
}

// ─── Primary nav items (always visible) ───────────────────────────
const NAV_ITEMS = [
  { id: 'dashboard', icon: Home,        label: 'الرئيسية' },
  { id: 'tasks',     icon: CheckSquare, label: 'المهام',   badge: 'tasks' },
  { id: 'habits',    icon: Target,      label: 'العادات' },
  { id: 'assistant', icon: Sparkles,    label: 'المساعد' },
  { id: '__more__',  icon: MoreHorizontal, label: 'المزيد' },
];

// ─── "More" menu items — grouped for better UX ─────────────────────
const MORE_SECTIONS = [
  {
    title: 'الأدوات',
    items: [
      { id: 'execution',     icon: Rocket,    label: 'نفّذ الآن',       desc: 'وضع التنفيذ المركز' },
      { id: 'focus',         icon: Timer,     label: 'وقت التركيز',    desc: 'بومودورو تايمر' },
      { id: 'calendar',      icon: Calendar,  label: 'التقويم',         desc: 'الأحداث والمواعيد' },
      { id: 'mood',          icon: Heart,     label: 'المزاج',          desc: 'تتبع المزاج اليومي' },
    ],
  },
  {
    title: 'التحليلات',
    items: [
      { id: 'analytics',     icon: BarChart2, label: 'التحليلات',       desc: 'الأداء والتقارير',  premium: true },
      { id: 'export',         icon: FileDown,  label: 'تصدير البيانات',  desc: 'PDF / CSV / JSON' },
      { id: 'intelligence',  icon: Globe,     label: 'الذكاء العالمي',  desc: 'تحليل متقدم',       premium: true },
      { id: 'notifications', icon: Bell,      label: 'الإشعارات',      desc: 'كل الإشعارات',      badge: 'unread' },
    ],
  },
  {
    title: 'الحساب',
    items: [
      { id: 'profile',       icon: User,      label: 'الملف الشخصي',   desc: 'بياناتك وأهدافك' },
      { id: 'subscription',  icon: Crown,     label: 'الاشتراك',        desc: 'ترقية وإدارة الخطة' },
      { id: 'settings',      icon: Settings,  label: 'الإعدادات',       desc: 'إعدادات التطبيق' },
      { id: 'integrations',  icon: Link2,     label: 'التكاملات',       desc: 'ربط التطبيقات' },
      { id: 'logs',          icon: Activity,  label: 'سجل النشاطات',   desc: 'سجلات النظام' },
    ],
  },
];

// Flatten for checking active state
const ALL_MORE_IDS = MORE_SECTIONS.flatMap(s => s.items.map(i => i.id));

export default function MobileBottomNav({ activeView, setActiveView, dashboardData }) {
  const [showMore, setShowMore] = useState(false);
  const { logout } = useAuthStore();
  const moreRef = useRef(null);

  const getBadge = (badgeType) => {
    if (!dashboardData) return 0;
    if (badgeType === 'tasks')  return dashboardData.summary?.tasks?.pending || 0;
    if (badgeType === 'unread') return dashboardData.summary?.unread_notifications || 0;
    return 0;
  };

  // Persist active view on change
  useEffect(() => {
    persistView(activeView);
  }, [activeView]);

  // Close on Escape key
  useEffect(() => {
    if (!showMore) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowMore(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showMore]);

  // Close desktop dropdown on outside click
  useEffect(() => {
    if (!showMore) return;
    const handleClick = (e) => {
      if (moreRef.current && !moreRef.current.contains(e.target)) {
        setShowMore(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
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
    setActiveView(id);
    setShowMore(false);
  }, [setActiveView]);

  const handleLogout = async () => {
    setShowMore(false);
    localStorage.removeItem(VIEW_STORAGE_KEY);
    await logout();
    toast.success('تم تسجيل الخروج بنجاح');
  };

  // Determine if "More" should show active state
  const isMoreActive = showMore || ALL_MORE_IDS.includes(activeView);

  return (
    <>
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* DESKTOP TOP NAVIGATION BAR (md+) — replaces sidebar                  */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
      <nav className="hidden md:flex items-center gap-1 px-3 py-1.5 border-b border-white/5 bg-dark/95 backdrop-blur-md sticky top-[57px] z-30"
        role="navigation" aria-label="التنقل الرئيسي" dir="rtl">
        
        {/* Primary Nav Items */}
        {NAV_ITEMS.filter(n => n.id !== '__more__').map(({ id, icon: Icon, label, badge }) => {
          const isActive = activeView === id;
          const badgeCount = badge ? getBadge(badge) : 0;
          return (
            <button
              key={id}
              onClick={() => handleNavClick(id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm transition-all ${
                isActive
                  ? 'bg-primary-500/20 text-primary-400 font-semibold border border-primary-500/30'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className="relative">
                <Icon size={16} strokeWidth={isActive ? 2.5 : 1.8} />
                {badgeCount > 0 && (
                  <span className="absolute -top-1.5 -end-2 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold leading-none">
                    {badgeCount > 9 ? '9+' : badgeCount}
                  </span>
                )}
              </div>
              {label}
            </button>
          );
        })}

        {/* Divider */}
        <div className="w-px h-6 bg-white/10 mx-1" />

        {/* More Dropdown (Desktop) */}
        <div className="relative" ref={moreRef}>
          <button
            onClick={() => setShowMore(prev => !prev)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm transition-all ${
              isMoreActive
                ? 'bg-primary-500/20 text-primary-400 font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <MoreHorizontal size={16} />
            المزيد
            <ChevronDown size={12} className={`transition-transform ${showMore ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {showMore && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                className="absolute top-full start-0 mt-2 w-[340px] z-50"
                dir="rtl"
              >
                <div className="rounded-2xl overflow-hidden shadow-2xl"
                  style={{
                    background: 'rgba(15, 15, 30, 0.97)',
                    backdropFilter: 'blur(24px)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                  {MORE_SECTIONS.map((section, si) => (
                    <div key={si}>
                      <div className="px-4 pt-3 pb-1">
                        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{section.title}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-1 px-3 pb-2">
                        {section.items.map(({ id, icon: Icon, label, desc, badge, premium }) => {
                          const badgeCount = badge ? getBadge(badge) : 0;
                          const isActive = activeView === id;
                          return (
                            <button
                              key={id}
                              onClick={() => handleMoreItemClick(id)}
                              className={`flex items-center gap-2.5 p-2.5 rounded-xl text-right transition-all ${
                                isActive
                                  ? 'bg-primary-500/15 border border-primary-500/30'
                                  : 'hover:bg-white/5 border border-transparent'
                              }`}
                            >
                              <div className="relative flex-shrink-0">
                                <Icon size={16} className={isActive ? 'text-primary-400' : 'text-gray-400'} />
                                {badgeCount > 0 && (
                                  <span className="absolute -top-1 -end-1.5 w-3.5 h-3.5 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold">
                                    {badgeCount > 9 ? '9+' : badgeCount}
                                  </span>
                                )}
                                {premium && (
                                  <Crown size={7} className="absolute -bottom-0.5 -start-1 text-yellow-400" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className={`text-xs font-medium block ${isActive ? 'text-primary-400' : 'text-gray-300'}`}>{label}</span>
                                <span className="text-[10px] text-gray-500 block truncate">{desc}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      {si < MORE_SECTIONS.length - 1 && (
                        <div className="border-t border-white/[0.04] mx-3" />
                      )}
                    </div>
                  ))}
                  <div className="border-t border-white/[0.06] px-3 py-2">
                    <button onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/5 transition-all text-xs">
                      <LogOut size={14} /> تسجيل الخروج
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </nav>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MOBILE BOTTOM SHEET (md-hidden) — Redesigned grouped layout          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
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
              className="fixed bottom-0 inset-x-0 z-[99] md:hidden"
              dir="rtl"
            >
              <div className="mx-2 mb-[76px] rounded-2xl overflow-hidden max-h-[70vh] overflow-y-auto"
                style={{
                  background: 'rgba(15, 15, 30, 0.97)',
                  backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  boxShadow: '0 -8px 40px rgba(0,0,0,0.5)',
                }}>
                {/* Header */}
                <div className="flex items-center justify-between px-4 pt-4 pb-2 sticky top-0 z-10" style={{ background: 'inherit' }}>
                  <h3 className="text-sm font-bold text-white">المزيد</h3>
                  <button onClick={() => setShowMore(false)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-gray-400 transition-all active:scale-90">
                    <X size={16} />
                  </button>
                </div>

                {/* Grouped sections */}
                {MORE_SECTIONS.map((section, si) => (
                  <div key={si}>
                    <div className="px-4 pt-2 pb-1">
                      <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{section.title}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-1 px-3 pb-2">
                      {section.items.map(({ id, icon: Icon, label, badge, premium }) => {
                        const badgeCount = badge ? getBadge(badge) : 0;
                        const isActive = activeView === id;
                        return (
                          <button key={id} onClick={() => handleMoreItemClick(id)}
                            className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all active:scale-95 ${
                              isActive
                                ? 'bg-primary-500/15 border border-primary-500/30'
                                : 'hover:bg-white/5 border border-transparent'
                            }`}>
                            <div className="relative">
                              <Icon size={20} className={isActive ? 'text-primary-400' : 'text-gray-400'} />
                              {badgeCount > 0 && (
                                <span className="absolute -top-1.5 -end-2 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold leading-none">
                                  {badgeCount > 9 ? '9+' : badgeCount}
                                </span>
                              )}
                              {premium && (
                                <Crown size={8} className="absolute -bottom-0.5 -start-1 text-yellow-400" />
                              )}
                            </div>
                            <span className={`text-[11px] font-medium leading-tight text-center ${
                              isActive ? 'text-primary-400' : 'text-gray-300'
                            }`}>{label}</span>
                          </button>
                        );
                      })}
                    </div>
                    {si < MORE_SECTIONS.length - 1 && (
                      <div className="border-t border-white/[0.04] mx-3" />
                    )}
                  </div>
                ))}

                <div className="border-t border-white/[0.06] px-4 py-2.5">
                  <button onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-gray-400 hover:text-red-400 hover:bg-red-500/5 transition-all text-sm">
                    <LogOut size={16} /> تسجيل الخروج
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ═══════════════════════════════════════════════════════════════════════ */}
      {/* MOBILE BOTTOM NAVIGATION BAR                                          */}
      {/* ═══════════════════════════════════════════════════════════════════════ */}
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
              {isActive && (
                <motion.div
                  layoutId="bottom-nav-dot"
                  className="absolute -top-0.5 w-5 h-1 rounded-full bg-primary-500"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
              <div className="relative">
                <Icon size={22} className={isActive ? 'text-primary-400' : 'text-gray-500'} strokeWidth={isActive ? 2.5 : 1.8} />
                {badgeCount > 0 && (
                  <span className="bottom-nav-badge">{badgeCount > 9 ? '9+' : badgeCount}</span>
                )}
              </div>
              <span className={`text-[10px] font-semibold ${isActive ? 'text-primary-400' : 'text-gray-500'}`}>{label}</span>
            </motion.button>
          );
        })}
      </nav>
    </>
  );
}
