/**
 * QuickWidget — ملخص يومي سريع (زر الطاقة ⚡)
 * ================================
 * Floating collapsible widget showing daily summary.
 * FIXED: Click the Zap button → it disappears for 30s then reappears.
 * The expanded widget can be dismissed for the session.
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, CheckSquare, Target, Zap, TrendingUp, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { dashboardAPI } from '../../utils/api';

const REAPPEAR_DELAY_MS = 30000; // 30 seconds

export default function QuickWidget() {
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const hideTimerRef = useRef(null);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: dashboardAPI.getDashboard,
    staleTime: 3 * 60 * 1000,
    retry: 1,
  });

  const dashboard = data?.data?.data || null;
  const summary = dashboard?.summary || {};
  const tasks = summary?.tasks || {};
  const habits = summary?.habits || {};

  // Handle click on the Zap button:
  // If expanded, collapse. Otherwise, hide completely and reappear after delay.
  const handleButtonClick = () => {
    if (expanded) {
      // Just collapse the widget
      setExpanded(false);
    } else {
      // Hide the button entirely, reappear after 30s
      setHidden(true);
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      hideTimerRef.current = setTimeout(() => setHidden(false), REAPPEAR_DELAY_MS);
    }
  };

  // Long press or second tap to expand
  const handleExpandToggle = () => {
    setExpanded(prev => !prev);
  };

  const handleDismissWidget = () => {
    setExpanded(false);
    setHidden(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setHidden(false), REAPPEAR_DELAY_MS);
  };

  // Don't render anything when hidden
  if (hidden) return null;

  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 z-[80]" dir="rtl">
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className="mb-2 w-64 rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: 'rgba(15, 15, 30, 0.98)',
              border: '1px solid rgba(108, 99, 255, 0.15)',
              backdropFilter: 'blur(20px)',
            }}
          >
            {/* Widget Header */}
            <div className="flex items-center justify-between px-4 pt-3 pb-2">
              <span className="text-xs font-bold text-white">ملخص اليوم</span>
              <button onClick={handleDismissWidget} className="text-gray-500 hover:text-white transition-colors">
                <X size={14} />
              </button>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-2 px-3 pb-3">
              <div className="bg-blue-500/10 rounded-xl p-2.5 text-center">
                <CheckSquare size={16} className="text-blue-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-white">{tasks.completed || 0}/{tasks.total || 0}</div>
                <div className="text-[10px] text-gray-500">مهام مكتملة</div>
              </div>
              <div className="bg-emerald-500/10 rounded-xl p-2.5 text-center">
                <Target size={16} className="text-emerald-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-white">{habits.completed || 0}/{habits.total || 0}</div>
                <div className="text-[10px] text-gray-500">عادات أُنجزت</div>
              </div>
              <div className="bg-primary-500/10 rounded-xl p-2.5 text-center">
                <TrendingUp size={16} className="text-primary-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-white">
                  {tasks.total > 0 ? Math.round(((tasks.completed || 0) / tasks.total) * 100) : 0}%
                </div>
                <div className="text-[10px] text-gray-500">نسبة الإنجاز</div>
              </div>
              <div className="bg-yellow-500/10 rounded-xl p-2.5 text-center">
                <Zap size={16} className="text-yellow-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-white">{tasks.pending || 0}</div>
                <div className="text-[10px] text-gray-500">مهام متبقية</div>
              </div>
            </div>

            {/* Smart Suggestion */}
            {dashboard?.smart_suggestion && (
              <div className="px-3 pb-3">
                <div className="bg-primary-500/5 rounded-xl p-2.5 border border-primary-500/10">
                  <p className="text-[11px] text-primary-400 leading-relaxed line-clamp-2">
                    💡 {dashboard.smart_suggestion}
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle Button — single tap hides for 30s, double tap or long press expands */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={handleButtonClick}
        onDoubleClick={handleExpandToggle}
        className="w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-all"
        style={{
          background: expanded
            ? 'rgba(108, 99, 255, 0.3)'
            : 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
          border: '1px solid rgba(108, 99, 255, 0.4)',
        }}
        title="اضغط لإخفاء 30 ثانية — اضغط مرتين لعرض الملخص"
      >
        {expanded ? (
          <ChevronDown size={20} className="text-white" />
        ) : (
          <div className="relative">
            <Zap size={20} className="text-white" />
            {(tasks.pending || 0) > 0 && (
              <span className="absolute -top-1.5 -end-1.5 w-4 h-4 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold">
                {tasks.pending > 9 ? '9+' : tasks.pending}
              </span>
            )}
          </div>
        )}
      </motion.button>
    </div>
  );
}
