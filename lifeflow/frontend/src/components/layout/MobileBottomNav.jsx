/**
 * Mobile Bottom Navigation Bar
 * ==============================
 * - شريط تنقل سفلي للهواتف (يظهر فقط على الشاشات الصغيرة)
 * - 5 أزرار رئيسية: الرئيسية، المهام، العادات، المساعد، الإشعارات
 * - دعم شارة الإشعارات غير المقروءة
 * - انيميشن ناعم عند الانتقال
 */

import { motion } from 'framer-motion';
import { Home, CheckSquare, Target, Sparkles, Bell } from 'lucide-react';

const NAV_ITEMS = [
  { id: 'dashboard',     icon: Home,        label: 'الرئيسية' },
  { id: 'tasks',         icon: CheckSquare, label: 'المهام',    badge: 'tasks' },
  { id: 'habits',        icon: Target,      label: 'العادات' },
  { id: 'assistant',     icon: Sparkles,    label: 'المساعد' },
  { id: 'notifications', icon: Bell,        label: 'الإشعارات', badge: 'unread' },
];

export default function MobileBottomNav({ activeView, setActiveView, dashboardData }) {
  const getBadge = (badgeType) => {
    if (!dashboardData) return 0;
    if (badgeType === 'tasks')  return dashboardData.summary?.tasks?.pending || 0;
    if (badgeType === 'unread') return dashboardData.summary?.unread_notifications || 0;
    return 0;
  };

  return (
    <nav className="bottom-nav md:hidden" role="navigation" aria-label="التنقل الرئيسي">
      {NAV_ITEMS.map(({ id, icon: Icon, label, badge }) => {
        const isActive   = activeView === id;
        const badgeCount = badge ? getBadge(badge) : 0;

        return (
          <motion.button
            key={id}
            onClick={() => setActiveView(id)}
            className={`bottom-nav-item ${isActive ? 'active' : ''}`}
            whileTap={{ scale: 0.88 }}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
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
  );
}
