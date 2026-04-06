/**
 * QuickWidget — Quick Action Hub (زر الطاقة ⚡)
 * ================================
 * SINGLE CLEAR BEHAVIOR: Tap → toggle quick-actions menu
 * GUARANTEES:
 *   1. NEVER disappears — always visible as floating button
 *   2. Tap = toggle expand/collapse (no auto-hide, no timers)
 *   3. Visible feedback: pulse animation on tap, badge for pending
 *   4. Shows: daily summary + 4 quick actions (task, habit, focus, assistant)
 *   5. Progress uses REAL combined formula: (tasks+habits completed)/(total)
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown, CheckSquare, Target, Zap, TrendingUp, X, Plus, Timer, Sparkles, Heart } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { dashboardAPI } from '../../utils/api';

export default function QuickWidget() {
  const [expanded, setExpanded] = useState(false);
  const [feedbackPulse, setFeedbackPulse] = useState(false);

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

  // SINGLE BEHAVIOR: tap toggles expand/collapse with visible feedback
  const handleButtonClick = () => {
    setFeedbackPulse(true);
    setTimeout(() => setFeedbackPulse(false), 300);
    setExpanded(prev => !prev);
  };

  const handleDismissWidget = () => {
    setExpanded(false);
    // Widget NEVER disappears — just collapse it. Always visible.
  };

  // Quick action handler — dispatches CustomEvent for Dashboard to pick up
  const handleQuickAction = (action) => {
    setExpanded(false);
    window.dispatchEvent(new CustomEvent('lifeflow-navigate', { detail: { view: action } }));
  };

  // FIXED: Widget NEVER returns null — always visible with button showing
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
                  {(() => {
                    const totalItems = (tasks.total || 0) + (habits.total || 0);
                    const doneItems = (tasks.completed || 0) + (habits.completed || 0);
                    return totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;
                  })()}%
                </div>
                <div className="text-[10px] text-gray-500">نسبة الإنجاز</div>
              </div>
              <div className="bg-yellow-500/10 rounded-xl p-2.5 text-center">
                <Zap size={16} className="text-yellow-400 mx-auto mb-1" />
                <div className="text-lg font-bold text-white">{tasks.pending || 0}</div>
                <div className="text-[10px] text-gray-500">مهام متبقية</div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="px-3 pb-3">
              <p className="text-[10px] text-gray-500 font-bold mb-2">إجراءات سريعة</p>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => handleQuickAction('tasks')}
                  className="flex items-center gap-1.5 p-2 rounded-xl bg-blue-500/10 text-blue-400 text-[11px] font-medium hover:bg-blue-500/20 transition-all active:scale-95">
                  <Plus size={12} /> مهمة جديدة
                </button>
                <button onClick={() => handleQuickAction('habits')}
                  className="flex items-center gap-1.5 p-2 rounded-xl bg-green-500/10 text-green-400 text-[11px] font-medium hover:bg-green-500/20 transition-all active:scale-95">
                  <Target size={12} /> سجّل عادة
                </button>
                <button onClick={() => handleQuickAction('focus')}
                  className="flex items-center gap-1.5 p-2 rounded-xl bg-purple-500/10 text-purple-400 text-[11px] font-medium hover:bg-purple-500/20 transition-all active:scale-95">
                  <Timer size={12} /> تركيز
                </button>
                <button onClick={() => handleQuickAction('assistant')}
                  className="flex items-center gap-1.5 p-2 rounded-xl bg-primary-500/10 text-primary-400 text-[11px] font-medium hover:bg-primary-500/20 transition-all active:scale-95">
                  <Sparkles size={12} /> المساعد
                </button>
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

      {/* Toggle Button — ALWAYS VISIBLE, tap to expand/collapse with feedback */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        animate={feedbackPulse ? { scale: [1, 1.15, 1], boxShadow: ['0 0 0 0 rgba(108,99,255,0)', '0 0 0 12px rgba(108,99,255,0.3)', '0 0 0 0 rgba(108,99,255,0)'] } : {}}
        onClick={handleButtonClick}
        className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all"
        style={{
          background: expanded
            ? 'rgba(108, 99, 255, 0.4)'
            : 'linear-gradient(135deg, #6C63FF, #8B5CF6)',
          border: '2px solid rgba(108, 99, 255, 0.5)',
          boxShadow: expanded 
            ? '0 0 20px rgba(108, 99, 255, 0.4)'
            : '0 4px 20px rgba(108, 99, 255, 0.3)',
        }}
        title={expanded ? 'إغلاق الإجراءات السريعة' : 'إجراءات سريعة ⚡'}
        aria-label={expanded ? 'إغلاق' : 'إجراءات سريعة'}
      >
        {expanded ? (
          <X size={22} className="text-white" />
        ) : (
          <div className="relative">
            <Zap size={22} className="text-white" />
            {(tasks.pending || 0) > 0 && (
              <span className="absolute -top-2 -end-2 w-5 h-5 bg-red-500 rounded-full text-[9px] text-white flex items-center justify-center font-bold shadow-lg">
                {tasks.pending > 9 ? '9+' : tasks.pending}
              </span>
            )}
          </div>
        )}
      </motion.button>
    </div>
  );
}
