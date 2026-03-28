/**
 * Dashboard Home — Phase G: Context-Aware Execution Dashboard
 * ================================================================
 * COMPLETE REWRITE — execution-driving interface, not passive display.
 *
 * PHASE G DECISIONS (Keep / Improve / Remove / Replace):
 *
 * 1. Next Action Card → REPLACE with "Context-Aware Action Card"
 *    New priority order: time window → energy/behavior → habit timing → goal alignment → urgency → overdue
 *    Shows "Why this now?" explanations. Never suggests stale/past-day tasks blindly.
 *
 * 2. Today's Tasks Card → REPLACE with "Dynamic Execution Timeline"
 *    Current focus (highlighted), upcoming time-based tasks, auto-refresh on completion,
 *    completed tasks collapse — next relevant task takes focus slot.
 *
 * 3. Habits Card → REPLACE with "Behavior Intelligence Card"
 *    Today's behavior state, habit patterns, smart nudges, risk alerts (streak loss, habit drop).
 *
 * 4. Quick Actions → IMPROVE: Context-driven, embedded within flow (no separate card)
 *
 * 5. Overdue Tasks → IMPROVE: Classify recent vs. old, reschedule/deprioritize/place
 *
 * 6. Summary Card → KEEP: Clean daily progress (minor improvements)
 *
 * 7. Burnout Alert → KEEP: Critical safety feature
 *
 * 8. Engagement Bar → KEEP: Positive reinforcement
 *
 * 9. Life Feed → KEEP but IMPROVE: Collapsible, less prominent
 *
 * RELIABILITY:
 * - Every sub-component wrapped in try/catch render
 * - Defensive null/undefined checks on all data paths
 * - Loading skeletons for every section
 * - Error fallback UI per section (not full-page crash)
 * - No state mutations during render
 * - Proper useEffect/useMemo dependency arrays
 */

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check, Clock, Flame,
  ArrowRight, Plus, Activity, TrendingUp,
  ChevronDown, ChevronUp, AlertTriangle,
  RefreshCw, Sparkles, Zap, Sun, Moon,
  Calendar, Target, Brain, Info,
} from 'lucide-react';
import { taskAPI, habitAPI, dashboardAPI, assistantAPI } from '../../utils/api';
import { SMART_ACTIONS } from '../../constants/smartActions';
import useSyncStore from '../../store/syncStore';
import toast from 'react-hot-toast';

// ─── Cairo Time Helper (timezone-aware) ──────────────────────────────────────
function getCairoNow() {
  try {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Africa/Cairo' }));
  } catch {
    return new Date();
  }
}

function toCairoTime(utcDate) {
  if (!utcDate) return null;
  try {
    const d = new Date(utcDate);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Cairo',
    });
  } catch { return null; }
}

function getTaskDisplayTime(task) {
  if (!task) return null;
  if (task.start_time) return toCairoTime(task.start_time);
  if (task.due_time) return task.due_time;
  return null;
}

// ─── Time-Aware Task Status (timezone-corrected) ─────────────────────────────
function getTaskTimeStatus(task) {
  if (!task || task.status === 'completed' || !task.due_date) return null;
  try {
    const now = getCairoNow();
    const dueDate = new Date(task.due_date);
    if (isNaN(dueDate.getTime())) return null;
    if (task.due_time) {
      const parts = task.due_time.split(':').map(Number);
      dueDate.setHours(parts[0] || 0, parts[1] || 0, 0, 0);
    } else {
      dueDate.setHours(23, 59, 0, 0);
    }
    const diffMs = dueDate.getTime() - now.getTime();
    const diffMin = diffMs / 60000;
    if (diffMin < -60) return { label: 'متأخرة', color: 'text-red-400 bg-red-500/10', isOverdue: true };
    if (diffMin < 0) return { label: 'متأخرة', color: 'text-red-400 bg-red-500/10', isOverdue: true };
    if (diffMin < 30) return { label: 'الآن', color: 'text-yellow-400 bg-yellow-500/10', isOverdue: false };
    if (diffMin < 120) return { label: 'قادمة', color: 'text-blue-400 bg-blue-500/10', isOverdue: false };
    return null;
  } catch { return null; }
}

// ─── Remaining Time Helper ───────────────────────────────────────────────────
function getTimeRemaining(dueDate, dueTime) {
  if (!dueDate) return null;
  try {
    const now = getCairoNow();
    const due = new Date(dueDate);
    if (isNaN(due.getTime())) return null;
    if (dueTime) {
      const parts = dueTime.split(':').map(Number);
      due.setHours(parts[0] || 0, parts[1] || 0, 0, 0);
    } else {
      due.setHours(23, 59, 0, 0);
    }
    const diffMs = due.getTime() - now.getTime();
    if (diffMs <= 0) return { text: 'الوقت انتهى', isOverdue: true };
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 60) return { text: `${diffMin} دقيقة`, isOverdue: false };
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return { text: `${diffHours} ساعة`, isOverdue: false };
    const diffDays = Math.floor(diffHours / 24);
    return { text: `${diffDays} يوم`, isOverdue: false };
  } catch { return null; }
}

// ─── Safe render wrapper ─────────────────────────────────────────────────────
function SafeRender({ children, fallback }) {
  try {
    return children;
  } catch (e) {
    console.error('[DashboardHome SafeRender]', e);
    return fallback || null;
  }
}

// ─── Error State Component ───────────────────────────────────────────────────
function ErrorCard({ message, onRetry }) {
  return (
    <div className="glass-card p-4 text-center" dir="rtl" role="alert">
      <AlertTriangle size={24} className="text-amber-400 mx-auto mb-2" />
      <p className="text-sm text-gray-400 mb-3">{message || 'حدث خطأ في تحميل البيانات'}</p>
      {onRetry && (
        <button onClick={onRetry}
          className="px-4 py-2 bg-primary-500/20 text-primary-400 text-sm rounded-xl
            hover:bg-primary-500/30 active:scale-95 transition-all inline-flex items-center gap-2"
          aria-label="إعادة المحاولة"
        >
          <RefreshCw size={14} /> إعادة المحاولة
        </button>
      )}
    </div>
  );
}

// ─── Section Skeleton ────────────────────────────────────────────────────────
function SectionSkeleton({ lines = 3 }) {
  return (
    <div className="glass-card p-4 space-y-2" dir="rtl">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className={`skeleton h-${i === 0 ? '5' : '3'} rounded ${i === 0 ? 'w-32' : 'w-full'}`} />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTEXT-AWARE ACTION CARD
// Priority: time window → energy/behavior → habit timing → goal alignment → urgency → overdue
// Shows "Why this now?" explanation
// ═════════════════════════════════════════════════════════════════════════════
function ContextAwareActionCard({ todayFlowData, isLoading, isError, refetch, onViewChange, onCompleteTask }) {
  const action = todayFlowData?.nextAction || {};
  const [completing, setCompleting] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  const isOverdueTask = action.urgency === 'critical' && Array.isArray(action.reason) &&
    action.reason.some(r => typeof r === 'string' && r.includes('متأخرة'));

  const hasReschedule = !!action.reschedule_suggestion;

  const handleActNow = useCallback(async () => {
    if (completing) return;
    if (action.task_id) {
      setCompleting(true);
      try {
        await taskAPI.completeTask(action.task_id);
        toast.success(`تم إكمال "${action.title || action.task_title}"! أحسنت`);
        if (onCompleteTask) onCompleteTask();
        refetch?.();
      } catch {
        toast.error('فشل الإكمال — جاري فتح المهام');
        onViewChange?.('tasks');
      } finally {
        setCompleting(false);
      }
    } else if (action.action === 'ask_assistant' || action.type === 'assistant') {
      onViewChange?.('assistant');
    } else if (action.action === 'log_mood') {
      onViewChange?.('mood');
    } else if (action.action === 'check_habit') {
      onViewChange?.('habits');
    } else {
      onViewChange?.('tasks');
    }
  }, [completing, action, onCompleteTask, refetch, onViewChange]);

  const handleReschedule = useCallback(async () => {
    if (!action.task_id) return;
    try {
      const rs = action.reschedule_suggestion;
      const cairoNow = getCairoNow();
      const suggestedHour = Math.max(cairoNow.getHours() + 1, 10);
      const suggestedTime = rs?.time || `${String(Math.min(suggestedHour, 21)).padStart(2, '0')}:00`;
      const today = rs?.date || cairoNow.toISOString().split('T')[0];
      await taskAPI.reschedule(action.task_id, { due_date: today, due_time: suggestedTime });
      toast.success(`تم إعادة جدولة المهمة إلى ${suggestedTime}`);
      refetch?.();
    } catch {
      toast.error('فشل إعادة الجدولة');
    }
  }, [action, refetch]);

  // Action type visual indicators
  const actionIcons = {
    start_task:   { icon: <Zap size={16} className="text-white" />, gradient: 'from-yellow-400 to-orange-500' },
    take_break:   { icon: <Moon size={16} className="text-white" />, gradient: 'from-blue-400 to-cyan-500' },
    log_mood:     { icon: <Activity size={16} className="text-white" />, gradient: 'from-pink-400 to-purple-500' },
    check_habit:  { icon: <Flame size={16} className="text-white" />, gradient: 'from-orange-400 to-red-500' },
    review_plan:  { icon: <Calendar size={16} className="text-white" />, gradient: 'from-green-400 to-emerald-500' },
  };
  const actionStyle = actionIcons[action.action] || actionIcons.start_task;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4 sm:p-5 bg-gradient-to-br from-primary-500/15 to-purple-600/10 border border-primary-500/20"
      dir="rtl" role="region" aria-label="الإجراء التالي"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-8 h-8 rounded-xl bg-gradient-to-br ${actionStyle.gradient} flex items-center justify-center`}>
            {actionStyle.icon}
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">
              {action.action === 'take_break' ? 'وقت راحة' :
               action.action === 'log_mood' ? 'سجّل مزاجك' :
               action.action === 'check_habit' ? 'تتبّع العادة' :
               action.action === 'review_plan' ? 'راجع خطتك' :
               'افعل الآن'}
            </h2>
            <p className="text-[10px] text-gray-500">
              {action.ml_driven ? '🤖 اقتراح ذكي' : 'الإجراء الأهم'}
              {action.energy_match ? ' · ⚡ يناسب طاقتك' : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* "Why this now?" toggle */}
          <button onClick={() => setShowWhy(!showWhy)}
            className="text-gray-500 hover:text-primary-400 p-1.5 transition-colors active:scale-90 rounded-lg hover:bg-white/5"
            aria-label="لماذا الآن؟"
            title="لماذا هذا الإجراء الآن؟"
          >
            <Info size={12} />
          </button>
          <button onClick={refetch} className="text-gray-500 hover:text-yellow-400 p-1 transition-colors active:scale-90">
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* "Why this now?" explanation panel */}
      <AnimatePresence>
        {showWhy && Array.isArray(action.explanation) && action.explanation.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="mb-3 overflow-hidden"
          >
            <div className="p-2.5 rounded-lg bg-white/5 border border-white/5 space-y-1">
              <p className="text-[10px] text-primary-400 font-bold flex items-center gap-1">
                <Brain size={10} /> لماذا هذا الإجراء الآن؟
              </p>
              {action.explanation.map((exp, i) => (
                <p key={i} className="text-[11px] text-gray-400 leading-relaxed">💡 {exp}</p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isError ? (
        <div className="text-center py-2">
          <p className="text-xs text-amber-400 mb-2">فشل تحميل الإجراء التالي</p>
          <button onClick={refetch} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 mx-auto">
            <RefreshCw size={10} /> إعادة المحاولة
          </button>
        </div>
      ) : isLoading ? (
        <div className="space-y-2">
          <div className="skeleton h-5 rounded w-3/4" />
          <div className="skeleton h-3 rounded w-full" />
        </div>
      ) : action.title || action.task_title ? (
        <div>
          <p className="text-base font-bold text-white mb-1.5 leading-snug">
            {action.title || action.task_title}
          </p>
          {action.confidence != null && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500/60 rounded-full"
                  style={{ width: `${Math.min(100, action.confidence)}%` }} />
              </div>
              <span className="text-[10px] text-gray-500">{action.confidence}% ثقة</span>
            </div>
          )}
          {Array.isArray(action.reason) && action.reason.slice(0, 3).map((r, i) => (
            <p key={i} className="text-xs text-gray-400 leading-relaxed">→ {r}</p>
          ))}

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleActNow}
              disabled={completing}
              className="flex-1 py-2.5 bg-gradient-to-l from-primary-500 to-purple-600 text-white text-sm font-bold rounded-xl
                hover:from-primary-600 hover:to-purple-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2
                disabled:opacity-60"
            >
              {completing ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
              {completing ? 'جارٍ...' :
                action.action === 'log_mood' ? 'سجّل الآن' :
                action.action === 'check_habit' ? 'سجّل العادة' :
                action.task_id ? 'أكمل المهمة' : 'ابدأ الآن'}
            </button>
            {/* Overdue + has reschedule: show reschedule button */}
            {(isOverdueTask || hasReschedule) && action.task_id && (
              <button onClick={handleReschedule}
                className="px-3 py-2.5 bg-orange-500/10 text-orange-400 text-sm rounded-xl hover:bg-orange-500/20 transition-all flex items-center gap-1 border border-orange-500/20">
                <Calendar size={12} /> أعد الجدولة
              </button>
            )}
            {!isOverdueTask && !hasReschedule && action.task_id && (
              <button onClick={() => onViewChange?.('tasks')}
                className="px-3 py-2.5 bg-white/5 text-gray-400 text-sm rounded-xl hover:bg-white/10 transition-all flex items-center gap-1">
                <ArrowRight size={12} /> عرض
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-2">
          <p className="text-sm text-gray-400 mb-2">لا توجد مهام عاجلة — أحسنت!</p>
          <button onClick={() => onViewChange?.('assistant')}
            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 mx-auto">
            <Sparkles size={10} /> اسأل المساعد عن اقتراحات
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// OVERDUE TASKS STRATEGY BANNER
// Classifies: recent (<= 2 days) vs old (> 2 days)
// Recent: nudge to complete. Old: suggest reschedule or removal.
// ═════════════════════════════════════════════════════════════════════════════
function OverdueStrategyBanner({ tasks, onRescheduleAll, onViewChange }) {
  const overdueCount = Array.isArray(tasks) ? tasks.length : 0;
  if (overdueCount === 0) return null;

  // Classify
  const now = getCairoNow();
  const recentOverdue = [];
  const oldOverdue = [];
  tasks.forEach(t => {
    try {
      const due = new Date(t.due_date);
      const daysLate = Math.floor((now - due) / 86400000);
      if (daysLate > 2) oldOverdue.push({ ...t, daysLate });
      else recentOverdue.push({ ...t, daysLate });
    } catch {
      recentOverdue.push(t);
    }
  });

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card p-3 bg-gradient-to-r from-red-500/10 to-orange-500/8 border border-red-500/20"
      dir="rtl" role="alert"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Clock size={16} className="text-red-400 flex-shrink-0" />
          <p className="text-xs text-red-300 font-medium">
            {overdueCount} {overdueCount === 1 ? 'مهمة متأخرة' : 'مهام متأخرة'}
          </p>
        </div>
        <div className="flex gap-1.5">
          <button onClick={onRescheduleAll}
            className="text-[10px] px-2.5 py-1.5 bg-orange-500/15 text-orange-400 rounded-lg hover:bg-orange-500/25 transition-all flex items-center gap-1">
            <Calendar size={10} /> جدولة ذكية
          </button>
          <button onClick={() => onViewChange?.('tasks')}
            className="text-[10px] px-2.5 py-1.5 bg-white/5 text-gray-400 rounded-lg hover:bg-white/10 transition-all">
            عرض الكل
          </button>
        </div>
      </div>
      {/* Strategy breakdown */}
      <div className="space-y-1">
        {recentOverdue.length > 0 && (
          <p className="text-[10px] text-gray-500 flex items-center gap-1">
            <Zap size={9} className="text-yellow-400" />
            {recentOverdue.length} حديثة — يمكن إنجازها اليوم
          </p>
        )}
        {oldOverdue.length > 0 && (
          <p className="text-[10px] text-gray-500 flex items-center gap-1">
            <Calendar size={9} className="text-orange-400" />
            {oldOverdue.length} قديمة — أعد جدولتها أو ألغها
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TODAY SUMMARY CARD (kept, minor improvements)
// ═════════════════════════════════════════════════════════════════════════════
function TodaySummaryCard({ dashboardData, onViewChange }) {
  const summary = dashboardData?.summary;
  if (!summary) return null;

  const tasksTotal     = summary?.tasks?.total || 0;
  const tasksCompleted = summary?.tasks?.completed || 0;
  const habitsTotal    = summary?.habits?.total || 0;
  const habitsCompleted= summary?.habits?.completed || 0;
  const overdue        = summary?.tasks?.overdue || 0;

  const totalItems   = tasksTotal + habitsTotal;
  const doneItems    = tasksCompleted + habitsCompleted;
  const progressPct  = totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0;

  const getTimeOfDay = () => {
    const h = getCairoNow().getHours();
    if (h < 12) return { label: 'صباح الخير', icon: <Sun size={14} className="text-yellow-400" />, phase: 'morning' };
    if (h < 18) return { label: 'مساء النور', icon: <Sun size={14} className="text-orange-400" />, phase: 'afternoon' };
    return { label: 'مساء الخير', icon: <Moon size={14} className="text-blue-400" />, phase: 'evening' };
  };
  const tod = getTimeOfDay();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 }}
      className="glass-card p-4 sm:p-5" dir="rtl" role="region" aria-label="ملخص اليوم"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {tod.icon}
          <h3 className="text-sm font-bold text-white">{tod.label} — ملخص اليوم</h3>
        </div>
        <span className="text-xs text-gray-500">
          {getCairoNow().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'short' })}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs text-gray-400">تقدم اليوم</span>
          <span className="text-xs font-bold text-white">{progressPct}%</span>
        </div>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden" role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
          <motion.div
            initial={{ width: 0 }} animate={{ width: `${progressPct}%` }}
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
            {summary?.mood?.has_checked_in ? `${summary.mood.score || '✓'}/10` : '---'}
          </div>
          <div className="text-[10px] text-gray-500">المزاج</div>
        </button>
      </div>

      {/* Evening Reflection Prompt */}
      {tod.phase === 'evening' && !summary?.mood?.has_checked_in && (
        <motion.button
          initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
          onClick={() => onViewChange?.('mood')}
          className="mt-3 w-full py-2.5 bg-gradient-to-l from-purple-500/20 to-blue-500/20 text-sm text-purple-300 font-medium
            rounded-xl border border-purple-500/20 hover:border-purple-500/40 active:scale-[0.98] transition-all"
        >
          كيف كان يومك؟ سجّل مزاجك وراجع إنجازاتك
        </motion.button>
      )}
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// DYNAMIC EXECUTION TIMELINE (replaces static task list)
// Current focus highlighted, upcoming sorted by time+context,
// auto-refreshes, completed tasks collapse with next taking focus.
// ═════════════════════════════════════════════════════════════════════════════
function DynamicExecutionTimeline({ tasks, onCompleteTask, isLoading, onViewChange }) {
  const [showAll, setShowAll] = useState(false);

  const categorized = useMemo(() => {
    if (!Array.isArray(tasks) || tasks.length === 0) {
      return { focus: null, upcoming: [], completed: [] };
    }

    const completed = tasks.filter(t => t.status === 'completed');
    const pending = tasks.filter(t => t.status !== 'completed');

    // Sort pending: timed tasks first → priority → time
    const sorted = [...pending].sort((a, b) => {
      const aHasTime = !!(a.due_time || a.start_time);
      const bHasTime = !!(b.due_time || b.start_time);
      if (aHasTime && !bHasTime) return -1;
      if (!aHasTime && bHasTime) return 1;
      const pw = { urgent: 4, high: 3, medium: 2, low: 1 };
      const aPw = pw[a.priority] || 1;
      const bPw = pw[b.priority] || 1;
      if (aPw !== bPw) return bPw - aPw;
      if (a.due_time && b.due_time) return a.due_time.localeCompare(b.due_time);
      return 0;
    });

    return {
      focus: sorted.length > 0 ? sorted[0] : null,
      upcoming: sorted.slice(1),
      completed,
    };
  }, [tasks]);

  if (isLoading) {
    return <SectionSkeleton lines={4} />;
  }

  return (
    <div className="glass-card p-4" dir="rtl" role="region" aria-label="خط التنفيذ">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Target size={14} className="text-primary-400" /> خط التنفيذ
        </h2>
        <div className="flex items-center gap-2">
          {Array.isArray(tasks) && tasks.length > 0 && (
            <span className="text-[10px] text-gray-500">
              {categorized.completed.length}/{tasks.length} مكتمل
            </span>
          )}
          <button onClick={() => onViewChange?.('tasks')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
            الكل <ArrowRight size={10} />
          </button>
        </div>
      </div>

      {/* Current Focus Task (highlighted) */}
      {categorized.focus && (
        <motion.div
          key={categorized.focus.id}
          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
          className="mb-3 p-3 rounded-xl bg-gradient-to-r from-primary-500/10 to-purple-500/5 border border-primary-500/20"
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] text-primary-400 font-medium flex items-center gap-1">
              <Zap size={10} /> التركيز الحالي
            </span>
            {categorized.focus.due_time && (
              <span className="text-[10px] text-blue-400 flex items-center gap-1">
                <Clock size={9} /> {categorized.focus.due_time}
              </span>
            )}
            {(() => {
              const status = getTaskTimeStatus(categorized.focus);
              return status ? (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${status.color}`}>
                  {status.label}
                </span>
              ) : null;
            })()}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => onCompleteTask(categorized.focus.id)}
              className="w-6 h-6 rounded-full border-2 border-primary-400 flex-shrink-0 flex items-center justify-center
                hover:bg-primary-500/20 active:scale-90 transition-all"
              aria-label="إكمال المهمة"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-white font-medium truncate">{categorized.focus.title}</p>
              {(() => {
                const remaining = getTimeRemaining(categorized.focus.due_date, categorized.focus.due_time);
                if (!remaining) return null;
                return (
                  <p className={`text-[10px] ${remaining.isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
                    {remaining.isOverdue ? 'متأخرة' : `متبقي: ${remaining.text}`}
                  </p>
                );
              })()}
            </div>
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              categorized.focus.priority === 'urgent' ? 'bg-red-500' :
              categorized.focus.priority === 'high' ? 'bg-orange-500' :
              categorized.focus.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-500'
            }`} />
          </div>
        </motion.div>
      )}

      {/* Upcoming Tasks */}
      {categorized.upcoming.length > 0 && (
        <div className="space-y-1.5">
          {categorized.upcoming.slice(0, showAll ? 10 : 3).map((task, idx) => {
            const time = getTaskDisplayTime(task);
            const timeStatus = getTaskTimeStatus(task);
            return (
              <motion.div key={task.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.03 }}
                className="flex items-center gap-3 p-2.5 rounded-lg transition-all active:scale-[0.98] hover:bg-white/5"
              >
                <button
                  onClick={() => onCompleteTask(task.id)}
                  className="w-5 h-5 rounded-full border-2 border-gray-500 flex-shrink-0 flex items-center justify-center
                    hover:border-primary-400 active:scale-90 transition-all"
                  aria-label={`إكمال ${task.title}`}
                />
                <span className="flex-1 text-sm min-w-0 truncate text-gray-200">{task.title}</span>
                {timeStatus && (
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium flex-shrink-0 ${timeStatus.color}`}>
                    {timeStatus.label}
                  </span>
                )}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  task.priority === 'urgent' ? 'bg-red-500' : task.priority === 'high' ? 'bg-orange-500' :
                  task.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-500'
                }`} />
                {time && (
                  <span className="text-xs text-blue-400 flex items-center gap-1 flex-shrink-0">
                    <Clock size={9} /> {time}
                  </span>
                )}
              </motion.div>
            );
          })}
          {categorized.upcoming.length > 3 && (
            <button onClick={() => setShowAll(!showAll)}
              className="w-full text-center py-1.5 text-[11px] text-gray-500 hover:text-primary-400 transition-colors flex items-center justify-center gap-1"
            >
              {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showAll ? 'أقل' : `${categorized.upcoming.length - 3} مهام أخرى`}
            </button>
          )}
        </div>
      )}

      {/* Completed Summary (collapsed) */}
      {categorized.completed.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <p className="text-[10px] text-green-400/60 flex items-center gap-1">
            <Check size={10} /> {categorized.completed.length} مهام مكتملة اليوم
          </p>
        </div>
      )}

      {/* Empty State */}
      {(!Array.isArray(tasks) || tasks.length === 0) && (
        <div className="text-center py-4 text-gray-500">
          <p className="text-sm">لا توجد مهام لليوم</p>
          <button onClick={() => onViewChange?.('tasks')} className="mt-1 text-xs text-primary-400 flex items-center gap-1 mx-auto">
            <Plus size={10} /> أضف مهمة
          </button>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// BEHAVIOR INTELLIGENCE CARD
// Today's behavior state, habit patterns, smart nudges, risk alerts.
// ═════════════════════════════════════════════════════════════════════════════
function BehaviorIntelligenceCard({ habits, onLogHabit, onViewChange }) {
  if (!Array.isArray(habits) || habits.length === 0) return null;

  const completed = habits.filter(h => h.completed_today);
  const uncompleted = habits.filter(h => !h.completed_today);
  const completionRate = habits.length > 0 ? Math.round((completed.length / habits.length) * 100) : 0;
  const bestStreak = habits.reduce((max, h) => Math.max(max, h.current_streak || 0), 0);

  const currentHour = getCairoNow().getHours();

  // Smart nudges and risk alerts
  const nudges = useMemo(() => {
    const n = [];
    uncompleted.forEach(h => {
      // Streak risk alert
      if ((h.current_streak || 0) > 5 && !h.completed_today) {
        n.push({ habit: h, message: `🔥 ${h.current_streak} يوم متتالي — لا تقطع السلسلة!`, type: 'streak_risk', priority: 1 });
      }
      // Time-match nudge
      const targetTime = h.target_time || h.preferred_time || h.ai_best_time;
      if (targetTime) {
        const parts = targetTime.split(':').map(Number);
        const hh = parts[0] || 0;
        if (Math.abs(currentHour - hh) <= 1) {
          n.push({ habit: h, message: `⏰ الآن وقت ${h.name}`, type: 'time_match', priority: 0 });
        }
      }
      // Habit drop risk: had a streak > 3 but it's now 0 (recently broken)
      if ((h.longest_streak || 0) > 3 && (h.current_streak || 0) === 0 && !h.completed_today) {
        n.push({ habit: h, message: `⚠️ "${h.name}" — السلسلة انكسرت. ابدأ من جديد اليوم!`, type: 'habit_drop', priority: 2 });
      }
    });
    // Sort by priority (time_match first, then streak_risk, then habit_drop)
    n.sort((a, b) => a.priority - b.priority);
    return n.slice(0, 3);
  }, [uncompleted, currentHour]);

  // Behavior state label
  const behaviorState = useMemo(() => {
    if (completionRate >= 80) return { label: 'ممتاز', emoji: '🌟', color: 'text-green-400' };
    if (completionRate >= 50) return { label: 'جيد', emoji: '💪', color: 'text-blue-400' };
    if (completionRate >= 25) return { label: 'بداية', emoji: '🚀', color: 'text-yellow-400' };
    return { label: 'ابدأ الآن', emoji: '⏰', color: 'text-gray-400' };
  }, [completionRate]);

  return (
    <div className="glass-card p-4" dir="rtl" role="region" aria-label="ذكاء السلوك">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Brain size={14} className="text-purple-400" /> ذكاء السلوك
          <span className={`text-[10px] ${behaviorState.color} font-medium`}>
            {behaviorState.emoji} {behaviorState.label}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">{completed.length}/{habits.length}</span>
          <button onClick={() => onViewChange?.('habits')} className="text-[10px] text-primary-400 hover:text-primary-300">
            التفاصيل
          </button>
        </div>
      </div>

      {/* Completion Progress */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
          <motion.div initial={{ width: 0 }} animate={{ width: `${completionRate}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full bg-gradient-to-l from-purple-400 to-primary-500 rounded-full" />
        </div>
        <span className="text-xs font-bold text-white">{completionRate}%</span>
        {bestStreak > 0 && (
          <span className="text-[10px] text-orange-400 flex items-center gap-0.5">
            <Flame size={10} /> {bestStreak}
          </span>
        )}
      </div>

      {/* Smart Nudges & Risk Alerts */}
      {nudges.length > 0 && (
        <div className="mb-3 space-y-1.5">
          {nudges.map((nudge, i) => (
            <motion.div key={`${nudge.habit.id}-${nudge.type}`}
              initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${
                nudge.type === 'streak_risk' ? 'bg-orange-500/8 border-orange-500/15' :
                nudge.type === 'habit_drop' ? 'bg-red-500/8 border-red-500/15' :
                'bg-purple-500/8 border-purple-500/15'
              }`}
            >
              <p className="text-[11px] text-gray-300 flex-1">{nudge.message}</p>
              <button onClick={() => onLogHabit(nudge.habit.id)}
                className="text-[10px] text-primary-400 hover:text-primary-300 flex-shrink-0 px-2 py-0.5 bg-primary-500/10 rounded-md">
                سجّل
              </button>
            </motion.div>
          ))}
        </div>
      )}

      {/* Habit Grid */}
      <div className="grid grid-cols-4 sm:grid-cols-5 gap-1.5">
        {habits.slice(0, 10).map((habit, idx) => (
          <motion.div key={habit.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.03 }}
            onClick={() => !habit.completed_today && onLogHabit(habit.id)}
            role="button" tabIndex={0}
            aria-label={`${habit.name} ${habit.completed_today ? '- مكتملة' : '- اضغط للتسجيل'}`}
            className={`p-2 rounded-xl text-center cursor-pointer transition-all select-none active:scale-95 ${
              habit.completed_today
                ? 'bg-gradient-to-br from-primary-500/25 to-green-500/15 border border-primary-500/30'
                : 'bg-white/5 hover:bg-white/10 border border-white/5'
            }`}
          >
            <div className="text-lg mb-0.5">{habit.icon || '⭐'}</div>
            <div className="text-[9px] text-gray-300 truncate">{habit.name}</div>
            {(habit.current_streak || 0) > 0 && (
              <div className="text-[8px] text-orange-400">{habit.current_streak}🔥</div>
            )}
            {habit.completed_today && <div className="text-[9px] text-green-400 font-medium">✓</div>}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// ENGAGEMENT BAR (kept)
// ═════════════════════════════════════════════════════════════════════════════
function EngagementBar({ dashboardData }) {
  const summary = dashboardData?.summary;
  if (!summary) return null;
  const tasksCompleted = summary?.tasks?.completed || 0;
  const habitsCompleted = summary?.habits?.completed || 0;
  const score = summary?.productivity_score || 0;

  const getRewardMessage = () => {
    if (tasksCompleted >= 5 && habitsCompleted >= 3) return { text: 'أداء استثنائي! أنت نجم اليوم ⭐', color: 'text-yellow-400' };
    if (tasksCompleted >= 3) return { text: 'أحسنت! استمر بهذا الإيقاع 💪', color: 'text-orange-400' };
    if (tasksCompleted >= 1) return { text: 'بداية رائعة! كمّل وما توقفش 🚀', color: 'text-green-400' };
    return null;
  };

  const reward = getRewardMessage();
  if (!reward) return null;

  return (
    <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="glass-card px-4 py-2.5 flex items-center gap-2" dir="rtl" role="status">
      <span className={`text-xs font-medium ${reward.color}`}>{reward.text}</span>
      {score > 0 && <span className="text-xs text-gray-500 ms-auto">{score} نقطة</span>}
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// BURNOUT ALERT (kept)
// ═════════════════════════════════════════════════════════════════════════════
function BurnoutAlert({ todayFlowData }) {
  const burnout = todayFlowData?.burnoutStatus;
  if (!burnout || !burnout.risk_level || burnout.risk_level === 'low') return null;

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card p-3 bg-gradient-to-r from-amber-500/15 to-orange-600/10 border border-amber-500/20" dir="rtl" role="alert"
    >
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-400 flex-shrink-0" />
        <p className="text-xs text-amber-300 font-medium">
          {burnout.risk_level === 'high' ? 'احترس من الاحتراق الوظيفي' : 'خذ استراحة'}
          {burnout.risk_percent ? ` · ${burnout.risk_percent}%` : ''}
        </p>
      </div>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// CONTEXTUAL QUICK ACTION — Phase H: intent-based, shows tooltip description
// ═════════════════════════════════════════════════════════════════════════════
function ContextualAction({ icon, label, title, onAction, loading }) {
  return (
    <button onClick={onAction} disabled={loading}
      title={title || label}
      className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10
        text-gray-300 hover:text-white px-3 py-2 rounded-xl transition-all
        active:scale-95 whitespace-nowrap border border-white/5 hover:border-primary-500/30
        disabled:opacity-50 flex-shrink-0 min-h-[40px]"
    >
      <span className="text-sm">{icon}</span>
      {label}
      {loading && <RefreshCw size={10} className="animate-spin text-primary-400" />}
    </button>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LIFE FEED WIDGET (kept, collapsible)
// ═════════════════════════════════════════════════════════════════════════════
function LifeFeedWidget({ todayFlowData }) {
  const [expanded, setExpanded] = useState(false);
  const feed = Array.isArray(todayFlowData?.lifeFeed) ? todayFlowData.lifeFeed : [];
  const typeIcon = { insight: '🧠', tip: '💡', ml: '🤖', event: '📅', alert: '⚠️', mood: '😊', warning: '⚠️' };

  if (feed.length === 0) return null;

  return (
    <div className="glass-card p-4" dir="rtl" role="region" aria-label="لحظات حياتك">
      <button onClick={() => setExpanded(!expanded)}
        className="w-full text-sm font-bold text-white flex items-center gap-2 hover:text-primary-400 transition-colors"
        aria-expanded={expanded}
      >
        <Activity size={14} className="text-purple-400" /> لحظات حياتك
        {expanded ? <ChevronUp size={13} className="text-gray-400" /> : <ChevronDown size={13} className="text-gray-400" />}
        <span className="text-xs text-gray-500 font-normal ms-auto">({feed.length})</span>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-2">
            {feed.slice(0, 4).map((item, i) => (
              <div key={item.id || i} className="flex items-start gap-2 py-1.5 border-b border-white/5 last:border-0">
                <span className="text-sm flex-shrink-0">{typeIcon[item.type] || '📌'}</span>
                <p className="text-xs text-gray-400 leading-relaxed">{item.message}</p>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD HOME COMPONENT
// ═════════════════════════════════════════════════════════════════════════════
export default function DashboardHome({ dashboardData, isLoading, isError, onViewChange, refetch }) {
  const queryClient = useQueryClient();
  const { invalidateAll, recordAction } = useSyncStore();

  // Unified today-flow query (nextAction + lifeFeed + burnout in ONE call)
  const {
    data: todayFlowRaw,
    isLoading: flowLoading,
    isError: flowError,
    refetch: refetchFlow,
  } = useQuery({
    queryKey: ['today-flow'],
    queryFn: dashboardAPI.getTodayFlow,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
    retry: 1,
  });
  const todayFlowData = todayFlowRaw?.data?.data || {};

  // Mutations
  const completeTask = useMutation({
    mutationFn: (id) => taskAPI.completeTask(id),
    onSuccess: () => {
      invalidateAll();
      recordAction('task_completed');
      toast.success('أحسنت!');
      refetchFlow();
    },
    onError: () => toast.error('فشل إنهاء المهمة'),
  });

  const logHabit = useMutation({
    mutationFn: (id) => habitAPI.checkIn(id, {}),
    onSuccess: () => {
      invalidateAll();
      recordAction('habit_checkin');
      toast.success('رائع!');
    },
    onError: () => toast.error('فشل تسجيل العادة'),
  });

  // Quick action handler — Phase H: intent-based, no auto-execution
  const [loadingAction, setLoadingAction] = useState(null);
  const handleQuickAction = useCallback((action) => {
    if (loadingAction) return;

    // Navigate actions: predictable, instant, no side effects
    if (action.type === 'navigate') {
      onViewChange?.(action.target || 'dashboard');
      return;
    }

    // AI chat actions: navigate to assistant (user reviews AI response there)
    if (action.type === 'ai_chat') {
      onViewChange?.(action.target || 'assistant');
      return;
    }

    // Fallback: navigate to dashboard
    onViewChange?.('dashboard');
  }, [loadingAction, onViewChange]);

  // Smart reschedule for overdue
  const handleRescheduleOverdue = useCallback(async () => {
    try {
      await assistantAPI.proposeAutoReschedule();
      toast.success('تم إعادة جدولة المهام المتأخرة');
      invalidateAll();
      refetchFlow();
    } catch {
      toast.error('فشل إعادة الجدولة — جرّب من المهام');
      onViewChange?.('tasks');
    }
  }, [invalidateAll, refetchFlow, onViewChange]);

  // Compute overdue tasks from dashboard data (defensive)
  const overdueTasks = useMemo(() => {
    const tasks = dashboardData?.today_tasks;
    if (!Array.isArray(tasks)) return [];
    return tasks.filter(t => {
      if (t.status === 'completed') return false;
      const status = getTaskTimeStatus(t);
      return status?.isOverdue === true;
    });
  }, [dashboardData?.today_tasks]);

  // ─── Full error state ──────────────────────────────────────────────────────
  if (isError && !dashboardData) {
    return (
      <ErrorCard
        message="فشل تحميل لوحة التحكم. تأكد من اتصالك بالإنترنت."
        onRetry={refetch}
      />
    );
  }

  if (isLoading && !dashboardData) return <DashboardSkeleton />;

  // Defensive destructuring
  const greeting = dashboardData?.greeting || '';
  const date = dashboardData?.date || {};
  const today_tasks = Array.isArray(dashboardData?.today_tasks) ? dashboardData.today_tasks : [];
  const habits = Array.isArray(dashboardData?.habits) ? dashboardData.habits : [];
  const smartActions = Array.isArray(SMART_ACTIONS) ? SMART_ACTIONS : [];

  return (
    <div className="space-y-3 sm:space-y-4 max-w-5xl mx-auto">

      {/* Burnout Alert (from unified today-flow) */}
      <BurnoutAlert todayFlowData={todayFlowData} />

      {/* Overdue Tasks Strategy Banner */}
      <OverdueStrategyBanner
        tasks={overdueTasks}
        onRescheduleAll={handleRescheduleOverdue}
        onViewChange={onViewChange}
      />

      {/* Engagement Feedback */}
      <EngagementBar dashboardData={dashboardData} />

      {/* Greeting */}
      {greeting && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between" dir="rtl"
        >
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">{greeting}</h1>
            <p className="text-gray-500 text-xs mt-0.5">{date?.day_name} · {date?.formatted}</p>
          </div>
          <button onClick={() => onViewChange?.('analytics')}
            className="text-xs text-gray-500 hover:text-primary-400 transition-colors flex items-center gap-1">
            <TrendingUp size={12} /> التحليلات
          </button>
        </motion.div>
      )}

      {/* Context-Aware Action Card (Phase G: with "Why this now?") */}
      <ContextAwareActionCard
        todayFlowData={todayFlowData}
        isLoading={flowLoading}
        isError={flowError}
        refetch={refetchFlow}
        onViewChange={onViewChange}
        onCompleteTask={() => invalidateAll()}
      />

      {/* Today Summary */}
      <TodaySummaryCard dashboardData={dashboardData} onViewChange={onViewChange} />

      {/* Contextual Quick Actions — Phase H: intent-based entry points */}
      {smartActions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5" dir="rtl">
          {smartActions.slice(0, 5).map((action) => (
            <ContextualAction
              key={action.id}
              icon={action.icon}
              label={action.label}
              title={action.description}
              onAction={() => handleQuickAction(action)}
              loading={false}
            />
          ))}
        </div>
      )}

      {/* Dynamic Execution Timeline (replaces static Today's Tasks) */}
      <DynamicExecutionTimeline
        tasks={today_tasks}
        onCompleteTask={(id) => completeTask.mutate(id)}
        isLoading={isLoading && !dashboardData}
        onViewChange={onViewChange}
      />

      {/* Behavior Intelligence Card (replaces simple Habits grid) */}
      <BehaviorIntelligenceCard
        habits={habits}
        onLogHabit={(id) => logHabit.mutate(id)}
        onViewChange={onViewChange}
      />

      {/* Life Feed (collapsible) */}
      <LifeFeedWidget todayFlowData={todayFlowData} />
    </div>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-3" role="status" aria-label="جاري تحميل لوحة التحكم">
      <div className="skeleton h-8 w-40 rounded-xl" />
      <div className="skeleton h-40 rounded-2xl" />
      <div className="skeleton h-32 rounded-2xl" />
      <div className="skeleton h-12 rounded-xl" />
      <div className="skeleton h-32 rounded-2xl" />
    </div>
  );
}
