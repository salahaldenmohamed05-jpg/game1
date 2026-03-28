/**
 * TodayFlow — "What should I do now?" Component
 * =================================================
 * Phase C: The heartbeat of LifeFlow.
 * Three sections in priority order:
 *   1. Next Action — the ONE thing to do right now
 *   2. Today Summary — morning plan / progress bar
 *   3. Key Stats — 3 essential numbers
 *
 * Each section answers: "What should I do now?"
 * One primary CTA per section. No clutter.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Zap, Brain, CheckCircle, Flame, ArrowLeft,
  Clock, Sun, Moon, RefreshCw, Sparkles,
} from 'lucide-react';
import { assistantAPI, taskAPI, habitAPI, dashboardAPI } from '../../utils/api';
import { SMART_ACTIONS } from '../../constants/smartActions';
import useSyncStore from '../../store/syncStore';
import toast from 'react-hot-toast';

// ─── Next Action Card ──────────────────────────────────────────────────────────
function NextActionCard({ onViewChange }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['next-action-flow'],
    queryFn: assistantAPI.getNextAction,
    refetchInterval: 120000,
    retry: false,
  });

  const action = data?.data?.data || data?.data || {};

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4 sm:p-5 bg-gradient-to-br from-primary-500/15 to-purple-600/10 border border-primary-500/20"
      dir="rtl"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center">
            <Zap size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">افعل الآن</h2>
            <p className="text-[10px] text-gray-500">الإجراء الأهم</p>
          </div>
        </div>
        <button onClick={refetch} className="text-gray-500 hover:text-yellow-400 p-1 transition-colors active:scale-90">
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="skeleton h-5 rounded w-3/4" />
          <div className="skeleton h-3 rounded w-full" />
        </div>
      ) : action.title || action.task_title ? (
        <div>
          <p className="text-base font-bold text-white mb-1.5 leading-snug">
            {action.title || action.task_title}
          </p>
          {action.reason?.slice(0, 1).map((r, i) => (
            <p key={i} className="text-xs text-gray-400 leading-relaxed">→ {r}</p>
          ))}
          <button
            onClick={() => onViewChange?.('tasks')}
            className="mt-3 w-full py-2.5 bg-gradient-to-l from-primary-500 to-purple-600 text-white text-sm font-bold rounded-xl
              hover:from-primary-600 hover:to-purple-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            ابدأ الآن <ArrowLeft size={14} />
          </button>
        </div>
      ) : (
        <div className="text-center py-2">
          <p className="text-sm text-gray-400 mb-2">لا توجد مهام عاجلة — أحسنت! 🎉</p>
          <button
            onClick={() => onViewChange?.('assistant')}
            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 mx-auto"
          >
            <Sparkles size={10} /> اسأل المساعد عن اقتراحات
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Today Summary Card ────────────────────────────────────────────────────────
function TodaySummaryCard({ dashboardData, onViewChange }) {
  const summary = dashboardData?.summary;
  const tasksTotal     = summary?.tasks?.total || 0;
  const tasksCompleted = summary?.tasks?.completed || 0;
  const habitsTotal    = summary?.habits?.total || 0;
  const habitsCompleted= summary?.habits?.completed || 0;
  const overdue        = summary?.tasks?.overdue || 0;

  const totalItems   = tasksTotal + habitsTotal;
  const doneItems    = tasksCompleted + habitsCompleted;
  const progressPct  = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const getTimeOfDay = () => {
    const h = new Date().getHours();
    if (h < 12) return { label: 'صباح الخير', icon: <Sun size={14} className="text-yellow-400" />, phase: 'morning' };
    if (h < 18) return { label: 'مساء النور', icon: <Sun size={14} className="text-orange-400" />, phase: 'afternoon' };
    return { label: 'مساء الخير', icon: <Moon size={14} className="text-blue-400" />, phase: 'evening' };
  };

  const tod = getTimeOfDay();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="glass-card p-4 sm:p-5"
      dir="rtl"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {tod.icon}
          <h3 className="text-sm font-bold text-white">{tod.label} — ملخص اليوم</h3>
        </div>
        <span className="text-xs text-gray-500">
          {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' })}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-400">تقدم اليوم</span>
          <span className="text-xs font-bold text-white">{progressPct}%</span>
        </div>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${progressPct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className={`h-full rounded-full ${
              progressPct >= 80 ? 'bg-gradient-to-l from-green-400 to-emerald-500' :
              progressPct >= 50 ? 'bg-gradient-to-l from-blue-400 to-primary-500' :
              'bg-gradient-to-l from-orange-400 to-yellow-500'
            }`}
          />
        </div>
      </div>

      {/* Mini Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <button onClick={() => onViewChange?.('tasks')} className="text-center p-2 rounded-lg bg-white/5 hover:bg-white/8 transition-all active:scale-95">
          <div className="text-lg font-black text-white">{tasksCompleted}/{tasksTotal}</div>
          <div className="text-[10px] text-gray-500">مهام</div>
          {overdue > 0 && <div className="text-[9px] text-red-400 mt-0.5">{overdue} متأخرة</div>}
        </button>
        <button onClick={() => onViewChange?.('habits')} className="text-center p-2 rounded-lg bg-white/5 hover:bg-white/8 transition-all active:scale-95">
          <div className="text-lg font-black text-white">{habitsCompleted}/{habitsTotal}</div>
          <div className="text-[10px] text-gray-500">عادات</div>
        </button>
        <button onClick={() => onViewChange?.('mood')} className="text-center p-2 rounded-lg bg-white/5 hover:bg-white/8 transition-all active:scale-95">
          <div className="text-lg font-black text-white">
            {summary?.mood?.has_checked_in ? `${summary.mood.score}/10` : '---'}
          </div>
          <div className="text-[10px] text-gray-500">المزاج</div>
        </button>
      </div>

      {/* Evening Reflection Prompt */}
      {tod.phase === 'evening' && !summary?.mood?.has_checked_in && (
        <motion.button
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => onViewChange?.('mood')}
          className="mt-3 w-full py-2.5 bg-gradient-to-l from-purple-500/20 to-blue-500/20 text-sm text-purple-300 font-medium
            rounded-xl border border-purple-500/20 hover:border-purple-500/40 active:scale-[0.98] transition-all"
        >
          🌙 كيف كان يومك؟ سجّل مزاجك وراجع إنجازاتك
        </motion.button>
      )}
    </motion.div>
  );
}

// ─── Smart Action Buttons ──────────────────────────────────────────────────────
export function SmartActionButtons({ onSendCommand, compact = false }) {
  const [loadingAction, setLoadingAction] = useState(null);

  const handleAction = async (action) => {
    if (loadingAction) return;
    setLoadingAction(action.id);
    try {
      await onSendCommand(action.command);
    } finally {
      setLoadingAction(null);
    }
  };

  const visibleActions = compact ? SMART_ACTIONS.slice(0, 4) : SMART_ACTIONS;

  return (
    <div className={`flex gap-2 ${compact ? 'overflow-x-auto scrollbar-hide pb-0.5' : 'flex-wrap'}`}>
      {visibleActions.map((action) => (
        <button
          key={action.id}
          onClick={() => handleAction(action)}
          disabled={!!loadingAction}
          className={`flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10
            text-gray-300 hover:text-white px-3 py-2 rounded-xl transition-all
            active:scale-95 whitespace-nowrap border border-white/5 hover:border-primary-500/30
            disabled:opacity-50 ${compact ? 'flex-shrink-0' : ''}`}
        >
          <span className="text-sm">{action.icon}</span>
          {action.label}
          {loadingAction === action.id && (
            <RefreshCw size={10} className="animate-spin text-primary-400" />
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Engagement Feedback (Streak + Reward) ──────────────────────────────────────
function EngagementBar({ dashboardData }) {
  const summary = dashboardData?.summary;
  const tasksCompleted = summary?.tasks?.completed || 0;
  const habitsCompleted = summary?.habits?.completed || 0;
  const score = summary?.productivity_score || 0;

  // Reward messages
  const getRewardMessage = () => {
    if (tasksCompleted >= 5 && habitsCompleted >= 3) return { text: 'أداء استثنائي! أنت نجم اليوم ⭐', color: 'text-yellow-400' };
    if (tasksCompleted >= 3) return { text: 'أحسنت! استمر بهذا الإيقاع 🔥', color: 'text-orange-400' };
    if (tasksCompleted >= 1) return { text: 'بداية رائعة! كمّل وما توقفش 💪', color: 'text-green-400' };
    return null;
  };

  const reward = getRewardMessage();
  if (!reward) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card px-4 py-2.5 flex items-center gap-2"
      dir="rtl"
    >
      <span className={`text-xs font-medium ${reward.color}`}>{reward.text}</span>
      {score > 0 && (
        <span className="text-xs text-gray-500 ms-auto">{score} نقطة</span>
      )}
    </motion.div>
  );
}

// ─── Main TodayFlow Export ──────────────────────────────────────────────────────
export default function TodayFlow({ dashboardData, isLoading, onViewChange, onSendCommand }) {
  if (isLoading || !dashboardData) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-40 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-12 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Engagement Feedback */}
      <EngagementBar dashboardData={dashboardData} />

      {/* Next Action — THE primary card */}
      <NextActionCard onViewChange={onViewChange} />

      {/* Today Summary */}
      <TodaySummaryCard dashboardData={dashboardData} onViewChange={onViewChange} />

      {/* Smart Action Buttons */}
      <div className="glass-card p-3 sm:p-4" dir="rtl">
        <h3 className="text-xs font-bold text-gray-400 mb-2.5">إجراءات سريعة</h3>
        <SmartActionButtons onSendCommand={onSendCommand} />
      </div>
    </div>
  );
}
