/**
 * Dashboard Home — Phase G+12.9: Context-Aware Execution Dashboard
 * ================================================================
 * Phase 12.9 — Truth Alignment:
 *   - UI consistency check: cognitive nudge card must match brain decision
 *   - No contradictions: dashboard, execution, assistant show same decision
 *   - Lifecycle tracing for loading detection
 *   - Truth-guarded rendering: empty day never gets positive feedback
 *
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
  Calendar, Target, Brain, Info, Play,
} from 'lucide-react';
import { taskAPI, habitAPI, dashboardAPI, assistantAPI, goalsAPI, analyticsAPI, phase6API } from '../../utils/api';
import { SMART_ACTIONS } from '../../constants/smartActions';
import useSyncStore from '../../store/syncStore';
import { useBrainStore } from '../../store/brainStore';
import toast from 'react-hot-toast';
import {
  analyzeBehavior,
  detectBehaviorState,
  computeRewardIntensity,
  generateIdentityStatement,
  computeAssistantTone,
  BEHAVIOR_STATES,
  REWARD_LEVELS,
} from '../../engine/behavioralEngine';
import { analyzeScenario } from '../../engine/scenarioEngine';
import {
  decide as cognitiveDecide,
  recordAction as cognitiveRecord,
  reactToCompletion,
  reactToSkip,
  getProfile as getCognitiveProfile,
  updateProfile,
} from '../../engine/cognitiveEngine';

// ═════════════════════════════════════════════════════════════════════════════
// EXECUTION STRIP — Phase 13: Unified to brainState (no dual source)
// Shows next action from brainState.currentDecision ONLY
// ═════════════════════════════════════════════════════════════════════════════
function ExecutionStrip({ onViewChange }) {
  // Phase 13: SINGLE SOURCE — read from brainState only, no engineAPI
  const { brainState, isLoading: brainLoading } = useBrainStore();
  const decision = brainState?.currentDecision;
  const dayContext = brainState?.dayContext;
  const isEmptyDay = dayContext?.classification === 'empty';
  const hasTask = decision?.taskId && decision?.type !== 'empty' && decision?.type !== 'break' && decision?.type !== 'reflection';
  const reasoning = decision?.why || [];
  const oneLineReason = reasoning.length > 0
    ? (typeof reasoning[0] === 'string' ? reasoning[0] : '').replace(/^[⏰📅🔴🟠⚡💪😴🎯💡🚀🧘📈⚠️🔥📱✅🌟]+\s*/g, '').slice(0, 60)
    : null;

  if (brainLoading && !brainState) {
    return (
      <div className="glass-card p-3 bg-gradient-to-l from-primary-500/10 to-purple-500/5 border border-primary-500/20">
        <div className="flex items-center gap-3">
          <div className="skeleton w-10 h-10 rounded-xl" />
          <div className="flex-1 space-y-1.5">
            <div className="skeleton h-4 w-3/4 rounded" />
            <div className="skeleton h-3 w-1/2 rounded" />
          </div>
          <div className="skeleton w-24 h-10 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!hasTask) {
    return (
      <motion.div
        initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
        className={`glass-card p-3 bg-gradient-to-l ${isEmptyDay ? 'from-gray-500/10 to-slate-500/5 border border-gray-500/20' : 'from-green-500/10 to-emerald-500/5 border border-green-500/20'}`}
        dir="rtl"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${isEmptyDay ? 'bg-gray-500/15' : 'bg-green-500/15'} flex items-center justify-center`}>
            {isEmptyDay ? <Plus size={18} className="text-gray-400" /> : <Check size={18} className="text-green-400" />}
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold text-white">{isEmptyDay ? 'مفيش مهام مسجلة' : 'يوم منجز!'}</p>
            <p className="text-[11px] text-gray-500">{isEmptyDay ? 'ضيف مهمة واحدة وابدا بيها' : 'لا توجد مهام معلقة — أحسنت'}</p>
          </div>
          <button onClick={() => onViewChange?.('tasks')}
            className="px-3 py-2 bg-white/5 text-gray-400 text-xs rounded-xl hover:bg-white/10 transition-all">
            + مهمة
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card p-3 bg-gradient-to-l from-primary-500/12 to-purple-600/8 border border-primary-500/25 cursor-pointer hover:border-primary-500/40 transition-all"
      dir="rtl"
      onClick={() => onViewChange?.('execution')}
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary-500/25">
          <Zap size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{decision.taskTitle}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {decision.estimatedMinutes && (
              <span className="text-[11px] text-gray-400 flex items-center gap-1">
                <Clock size={10} /> {decision.estimatedMinutes} دقيقة
              </span>
            )}
            {oneLineReason && (
              <span className="text-[10px] text-gray-500 truncate">— {oneLineReason}</span>
            )}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onViewChange?.('execution'); }}
          className="flex-shrink-0 px-4 py-2.5 bg-gradient-to-l from-primary-500 to-purple-600 text-white text-xs font-bold rounded-xl shadow-lg shadow-primary-500/25 hover:from-primary-600 hover:to-purple-700 active:scale-95 transition-all flex items-center gap-1.5"
        >
          <Play size={12} fill="white" /> ابدأ الآن
        </button>
      </div>
    </motion.div>
  );
}

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

// ─── Time-Aware Task Status (timezone-corrected, Phase 3 fix) ────────────────
// FIX: Tasks are NOT overdue if due_time hasn't passed yet today.
// A task due today at 14:00 is NOT overdue at 10:00.
// Only overdue if: (a) due_date is in the past, OR (b) due_date is today AND due_time has passed.
function getTaskTimeStatus(task) {
  if (!task || task.status === 'completed' || !task.due_date) return null;
  try {
    const now = getCairoNow();
    const todayStr = now.toISOString().split('T')[0];
    // Parse due_date as date-only string (YYYY-MM-DD)
    const dueDateStr = typeof task.due_date === 'string'
      ? task.due_date.split('T')[0].split(' ')[0]
      : new Date(task.due_date).toISOString().split('T')[0];

    // If due date is in the future (not today), not overdue
    if (dueDateStr > todayStr) return null;

    // If due date is in the past (before today)
    if (dueDateStr < todayStr) {
      return { label: 'متأخرة', color: 'text-red-400 bg-red-500/10', isOverdue: true };
    }

    // Due date IS today — check due_time
    if (task.due_time) {
      const parts = task.due_time.split(':').map(Number);
      const dueDate = new Date(now);
      dueDate.setHours(parts[0] || 0, parts[1] || 0, 0, 0);
      const diffMs = dueDate.getTime() - now.getTime();
      const diffMin = diffMs / 60000;

      // Only overdue if due_time has actually passed
      if (diffMin < -30) return { label: 'متأخرة', color: 'text-red-400 bg-red-500/10', isOverdue: true };
      if (diffMin < 0) return { label: 'الآن!', color: 'text-orange-400 bg-orange-500/10', isOverdue: false };
      if (diffMin < 30) return { label: 'الآن', color: 'text-yellow-400 bg-yellow-500/10', isOverdue: false };
      if (diffMin < 120) return { label: 'قادمة', color: 'text-blue-400 bg-blue-500/10', isOverdue: false };
      // More than 2 hours away — no status badge needed
      return null;
    }

    // Due today with no specific time — NOT overdue until end of day
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 0, 0);
    if (now > endOfDay) {
      return { label: 'متأخرة', color: 'text-red-400 bg-red-500/10', isOverdue: true };
    }
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
// DO NOW CARD — Merged ExecutionStrip + ContextAwareActionCard
// Single unified card: shows next action with time-aware reasoning,
// remaining time, "Why now?" explanation, and link to execution screen.
// ═════════════════════════════════════════════════════════════════════════════
function DoNowCard({ todayFlowData, isLoading, isError, refetch, onViewChange, onCompleteTask }) {
  // Phase 13: SINGLE SOURCE — read from brainState only, no engineAPI
  const { brainState } = useBrainStore();
  const brainDecision = brainState?.currentDecision || {};
  const action = todayFlowData?.nextAction || {};
  const [showWhy, setShowWhy] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Phase 13: Use brainState reasoning instead of engineAPI
  const reasoning = brainDecision.why || action.reason || [];

  // Phase 13: Use brainState for time data instead of engineAPI
  const taskDueTime = action.due_time;

  // Compute remaining time on frontend
  const timeRemaining = useMemo(() => {
    if (!taskDueTime) return null;
    const result = getTimeRemaining(action.due_date || new Date().toISOString().split('T')[0], taskDueTime);
    return result;
  }, [taskDueTime, action.due_date]);

  // Determine if task is approaching (within 60 min) or not due yet
  const isApproaching = timeRemaining && !timeRemaining.isOverdue;
  const isNotDueYet = false; // simplified — no engine data
  const isOverdueTask = timeRemaining?.isOverdue || (action.urgency === 'critical' && Array.isArray(action.reason) &&
    action.reason.some(r => typeof r === 'string' && r.includes('متأخرة')));
  const hasReschedule = !!action.reschedule_suggestion;

  const handleActNow = useCallback(async () => {
    if (completing) return;
    // Record accepted suggestion feedback for adaptive planning
    try {
      const { decisionAPI } = await import('../../utils/api');
      decisionAPI.sendFeedback({
        action: action.action || 'start_task',
        feedback: 'accepted',
        task_id: action.task_id || brainDecision.taskId || null,
      }).catch(() => {});
    } catch {}
    // Route task actions through the Execution Screen (engine flow)
    if (action.task_id || action.action === 'start_task') {
      onViewChange?.('execution');
    } else if (action.action === 'ask_assistant' || action.type === 'assistant') {
      onViewChange?.('assistant');
    } else if (action.action === 'log_mood') {
      onViewChange?.('mood');
    } else if (action.action === 'check_habit') {
      onViewChange?.('habits');
    } else {
      onViewChange?.('execution');
    }
  }, [completing, action, brainDecision, onViewChange]);

  const handleReschedule = useCallback(async () => {
    if (!action.task_id) return;
    try {
      // Record rejected suggestion feedback for adaptive planning
      try {
        const { decisionAPI } = await import('../../utils/api');
        decisionAPI.sendFeedback({
          action: action.action || 'start_task',
          feedback: 'rejected',
          task_id: action.task_id,
        }).catch(() => {});
      } catch {}
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

  // Safe string renderer — prevents React Error #31 (objects rendered as children)
  const safeStr = (v) => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number') return String(v);
    if (typeof v === 'object' && v.suggestion) return v.suggestion;
    if (typeof v === 'object' && v.title) return v.title;
    try { return JSON.stringify(v); } catch { return ''; }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4 sm:p-5 bg-gradient-to-br from-primary-500/15 to-purple-600/10 border border-primary-500/20 cursor-pointer"
      dir="rtl" role="region" aria-label="افعل الآن"
      onClick={() => onViewChange?.('execution')}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${actionStyle.gradient} flex items-center justify-center shadow-lg shadow-primary-500/25`}>
            {actionStyle.icon}
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              {action.action === 'take_break' ? 'وقت راحة' :
               action.action === 'log_mood' ? 'سجّل مزاجك' :
               action.action === 'check_habit' ? 'تتبّع العادة' :
               action.action === 'review_plan' ? 'راجع خطتك' :
               'افعل الآن'}
              {/* Remaining time badge */}
              {isNotDueYet && timeRemaining && (
                <span className="text-[10px] bg-purple-500/15 text-purple-400 px-2 py-0.5 rounded-full font-medium">
                  🕐 متبقي {timeRemaining.text} — استعد
                </span>
              )}
              {isApproaching && timeRemaining && (
                <span className="text-[10px] bg-yellow-500/15 text-yellow-400 px-2 py-0.5 rounded-full font-medium">
                  ⏳ متبقي {timeRemaining.text} — ابدأ!
                </span>
              )}
              {!isNotDueYet && !isApproaching && timeRemaining && !timeRemaining.isOverdue && (
                <span className="text-[10px] bg-blue-500/15 text-blue-400 px-2 py-0.5 rounded-full font-medium">
                  ⏳ متبقي {timeRemaining.text}
                </span>
              )}
              {timeRemaining?.isOverdue && (
                <span className="text-[10px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full font-medium">
                  ⏰ {timeRemaining.text}
                </span>
              )}
            </h2>
            <p className="text-[10px] text-gray-500">
              {action.ml_driven ? '🤖 اقتراح ذكي' : 'الإجراء الأهم'}
              {action.energy_match ? ' · ⚡ يناسب طاقتك' : ''}
              {taskDueTime ? ` · ${taskDueTime}` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={(e) => { e.stopPropagation(); setShowWhy(!showWhy); }}
            className="text-gray-500 hover:text-primary-400 p-1.5 transition-colors active:scale-90 rounded-lg hover:bg-white/5"
            aria-label="لماذا الآن؟" title="لماذا هذا الإجراء الآن؟">
            <Info size={12} />
          </button>
          <button onClick={(e) => { e.stopPropagation(); refetch?.(); }} className="text-gray-500 hover:text-yellow-400 p-1 transition-colors active:scale-90">
            <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* "Why this now?" explanation panel — uses engine reasoning */}
      <AnimatePresence>
        {showWhy && reasoning.length > 0 && (
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
              {reasoning.slice(0, 4).map((r, i) => (
                <p key={i} className="text-[11px] text-gray-400 leading-relaxed">💡 {safeStr(r)}</p>
              ))}
              {/* Time-aware context */}
              {isNotDueYet && (
                <p className="text-[11px] text-purple-400 leading-relaxed">🕐 الموعد لم يحن بعد — استعد أو اعمل شيء آخر</p>
              )}
              {isApproaching && !isNotDueYet && (
                <p className="text-[11px] text-yellow-400 leading-relaxed">⏳ الموعد قريب — ابدأ التحضير أو ابدأ الآن!</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {isError ? (
        <div className="text-center py-2" onClick={e => e.stopPropagation()}>
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
      ) : action.title || action.task_title || brainDecision.taskTitle ? (
        <div onClick={e => e.stopPropagation()}>
          <p className="text-base font-bold text-white mb-1.5 leading-snug">
            {action.title || action.task_title || brainDecision.taskTitle}
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
          {/* Safe rendering of reason — prevents React Error #31 */}
          {Array.isArray(action.reason) && action.reason.slice(0, 3).map((r, i) => (
            <p key={i} className="text-xs text-gray-400 leading-relaxed">→ {safeStr(r)}</p>
          ))}

          <div className="flex gap-2 mt-3">
            <button
              onClick={handleActNow}
              className="flex-1 py-2.5 bg-gradient-to-l from-primary-500 to-purple-600 text-white text-sm font-bold rounded-xl
                hover:from-primary-600 hover:to-purple-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Play size={14} fill="white" />
              {action.action === 'log_mood' ? 'سجّل الآن' :
                action.action === 'check_habit' ? 'سجّل العادة' :
                action.task_id ? 'ابدأ الآن' : 'افعل الآن'}
            </button>
            {(isOverdueTask || hasReschedule) && action.task_id && (
              <button onClick={handleReschedule}
                className="px-3 py-2.5 bg-orange-500/10 text-orange-400 text-sm rounded-xl hover:bg-orange-500/20 transition-all flex items-center gap-1 border border-orange-500/20">
                <Calendar size={12} /> أعد الجدولة
              </button>
            )}
            {!isOverdueTask && !hasReschedule && (
              <button onClick={() => onViewChange?.('execution')}
                className="px-3 py-2.5 bg-white/5 text-gray-400 text-sm rounded-xl hover:bg-white/10 transition-all flex items-center gap-1">
                <ArrowRight size={12} /> نفّذ
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-3" onClick={e => e.stopPropagation()}>
          {/* Phase 12.10 Fix M3: Check dayContext before showing congrats */}
          {(() => {
            const dc = useBrainStore.getState()?.brainState?.dayContext;
            const isEmpty = dc?.classification === 'empty';
            return isEmpty ? (
              <>
                <Plus size={24} className="text-gray-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-white mb-1">مفيش مهام مسجلة</p>
                <p className="text-xs text-gray-500 mb-2">ابدا بمهمة واحدة صغيرة</p>
              </>
            ) : (
              <>
                <Check size={24} className="text-green-400 mx-auto mb-2" />
                <p className="text-sm font-bold text-white mb-1">يوم منجز!</p>
                <p className="text-xs text-gray-500 mb-2">لا توجد مهام معلقة — أحسنت</p>
              </>
            );
          })()}
          <button onClick={() => onViewChange?.('tasks')}
            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 mx-auto">
            <Plus size={10} /> أضف مهمة جديدة
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
// ─── Mini Circular Progress Ring ─────────────────────────────────────────
function MiniProgressRing({ progress, size = 80, strokeWidth = 6 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;
  const color = progress >= 80 ? '#10B981' : progress >= 50 ? '#6C63FF' : '#F59E0B';

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius}
          stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth} fill="none" />
        <circle cx={size / 2} cy={size / 2} r={radius}
          stroke={color} strokeWidth={strokeWidth} fill="none"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 1s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-black text-white">{progress}%</span>
      </div>
    </div>
  );
}

// ─── Motivational Quotes ─────────────────────────────────────────────────
// Phase 9.0: Direct, motivational, no generic filler — every quote drives action
const MOTIVATIONAL_QUOTES = [
  { ar: 'المهمة اللي قدامك دلوقتي أهم من 10 مهام مستقبلية — ركّز', en: 'The task in front of you now matters most' },
  { ar: 'خطوة صغيرة دلوقتي > خطة كبيرة بكرة', en: 'One small step now > big plan tomorrow' },
  { ar: 'كل مهمة بتكملها بتبني ثقة — استمر', en: 'Every completed task builds confidence' },
  { ar: 'الانضباط مش عقاب — دا أنت بتبني هوية جديدة', en: 'Discipline builds your new identity' },
  { ar: 'لو حاسس بالتعب، خذ استراحة. مش لازم تكسر نفسك', en: 'Rest is part of performance' },
  { ar: 'قارن نفسك بنفسك إمبارح — أنت بتتحسن', en: 'Compare yourself to yesterday' },
  { ar: 'ابدأ بالأصعب لما طاقتك عالية — النتيجة هتفرق', en: 'Start hard when energy is high' },
  { ar: 'مش لازم يومك يكون مثالي — لازم يكون أفضل من إمبارح', en: 'Not perfect, just better than yesterday' },
];

function TodaySummaryCard({ dashboardData, onViewChange }) {
  const summary = dashboardData?.summary;

  const tasksTotal     = summary?.tasks?.total || 0;
  const tasksCompleted = summary?.tasks?.completed || 0;
  const habitsTotal    = summary?.habits?.total || 0;
  const habitsCompleted= summary?.habits?.completed || 0;
  const overdue        = summary?.tasks?.overdue || 0;

  // REAL PROGRESS: % = (completed tasks + completed habits) / (total tasks + total habits)
  // This updates INSTANTLY because invalidateAll() is called on every task/habit mutation
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

  // Daily quote based on day of year
  const dailyQuote = useMemo(() => {
    const dayOfYear = Math.floor((getCairoNow() - new Date(getCairoNow().getFullYear(), 0, 0)) / 86400000);
    return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
  }, []);

  if (!summary) return null;

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

      {/* Circular Progress + Stats Row */}
      <div className="flex items-center gap-4 mb-3">
        <MiniProgressRing progress={progressPct} />
        <div className="flex-1 grid grid-cols-3 gap-2">
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
      </div>

      {/* Focus Timer Quick Access */}
      <button onClick={() => onViewChange?.('focus')}
        className="w-full mb-3 py-2.5 bg-gradient-to-l from-primary-500/15 to-purple-500/10 text-sm text-primary-300 font-medium
          rounded-xl border border-primary-500/20 hover:border-primary-500/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
      >
        🍅 ابدأ جلسة تركيز بومودورو
      </button>

      {/* Motivational Quote */}
      <div className="p-3 rounded-xl bg-gradient-to-l from-primary-500/5 to-transparent border border-white/5">
        <p className="text-xs text-gray-300 leading-relaxed text-center italic">&ldquo;{dailyQuote.ar}&rdquo;</p>
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
  const safeHabits = Array.isArray(habits) ? habits : [];
  const completed = safeHabits.filter(h => h.completed_today);
  const uncompleted = safeHabits.filter(h => !h.completed_today);
  const completionRate = safeHabits.length > 0 ? Math.round((completed.length / safeHabits.length) * 100) : 0;
  const bestStreak = safeHabits.reduce((max, h) => Math.max(max, h.current_streak || 0), 0);

  const currentHour = getCairoNow().getHours();

  // Smart nudges and risk alerts
  // FIX: Don't show "missed" nudge if habit's scheduled time hasn't arrived yet
  const nudges = useMemo(() => {
    const n = [];
    uncompleted.forEach(h => {
      // Check if habit's time has passed or is near (don't nudge for future-scheduled habits)
      const targetTime = h.target_time || h.preferred_time || h.ai_best_time;
      let isTimeRelevant = true; // default: relevant if no specific time
      if (targetTime) {
        const parts = targetTime.split(':').map(Number);
        const hh = parts[0] || 0;
        // Habit is only relevant if current hour >= (target hour - 1)
        // i.e., don't nudge a 20:00 habit at 10:00
        isTimeRelevant = currentHour >= (hh - 1);
      }

      // Time-match nudge (highest priority when time matches)
      if (targetTime && isTimeRelevant) {
        const parts = targetTime.split(':').map(Number);
        const hh = parts[0] || 0;
        if (Math.abs(currentHour - hh) <= 1) {
          n.push({ habit: h, message: `⏰ الآن وقت ${h.name || h.name_ar || 'العادة'}`, type: 'time_match', priority: 0 });
        }
      }

      // Streak risk alert (only if time-relevant)
      if ((h.current_streak || 0) > 5 && !h.completed_today && isTimeRelevant) {
        n.push({ habit: h, message: `🔥 ${h.current_streak} يوم متتالي — لا تقطع السلسلة!`, type: 'streak_risk', priority: 1 });
      }

      // Habit drop risk: had a streak > 3 but it's now 0 (recently broken)
      if ((h.longest_streak || 0) > 3 && (h.current_streak || 0) === 0 && !h.completed_today && isTimeRelevant) {
        n.push({ habit: h, message: `⚠️ "${h.name || h.name_ar || 'العادة'}" — السلسلة انكسرت. ابدأ من جديد اليوم!`, type: 'habit_drop', priority: 2 });
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

  if (safeHabits.length === 0) return null;

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
          <span className="text-xs text-gray-400">{completed.length}/{safeHabits.length}</span>
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
        {safeHabits.slice(0, 10).map((habit, idx) => (
          <motion.div key={habit.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.03 }}
            onClick={() => !habit.completed_today && onLogHabit(habit.id)}
            role="button" tabIndex={0}
            aria-label={`${habit.name || habit.name_ar || 'عادة'} ${habit.completed_today ? '- مكتملة' : '- اضغط للتسجيل'}`}
            className={`p-2 rounded-xl text-center cursor-pointer transition-all select-none active:scale-95 ${
              habit.completed_today
                ? 'bg-gradient-to-br from-primary-500/25 to-green-500/15 border border-primary-500/30'
                : 'bg-white/5 hover:bg-white/10 border border-white/5'
            }`}
          >
            <div className="text-lg mb-0.5">{habit.icon || '⭐'}</div>
            <div className="text-[9px] text-gray-300 truncate">{habit.name || habit.name_ar || 'عادة'}</div>
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
// GOAL CONTEXT CARD — Shows active goals, progress, and linked tasks
// Makes goals VISIBLE in the daily flow (was completely hidden before)
// ═════════════════════════════════════════════════════════════════════════════
function GoalContextCard({ dashboardData, todayFlowData, onViewChange }) {
  // Try to get goals from todayFlow (enriched) or dashboard (basic)
  const flowGoals = todayFlowData?.goalContext?.activeGoals;
  const dashGoals = dashboardData?.active_goals;
  const goals = Array.isArray(flowGoals) && flowGoals.length > 0
    ? flowGoals
    : (Array.isArray(dashGoals) ? dashGoals : []);

  const goalSuggestions = todayFlowData?.goalContext?.suggestions || [];
  const summary = todayFlowData?.goalContext?.summary || {};

  if (goals.length === 0) return null;

  const QUADRANT_LABELS = {
    urgent_important: { label: 'عاجل ومهم', color: 'text-red-400 bg-red-500/10' },
    important: { label: 'مهم', color: 'text-blue-400 bg-blue-500/10' },
    urgent: { label: 'عاجل', color: 'text-orange-400 bg-orange-500/10' },
    neither: { label: 'عادي', color: 'text-gray-400 bg-white/5' },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4" dir="rtl" role="region" aria-label="أهدافك"
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Target size={14} className="text-green-400" /> أهدافك النشطة
          {summary.atRisk > 0 && (
            <span className="text-[9px] bg-red-500/15 text-red-400 px-2 py-0.5 rounded-full">
              {summary.atRisk} في خطر
            </span>
          )}
        </h2>
        <span className="text-[10px] text-gray-500">{goals.length} هدف</span>
      </div>

      <div className="space-y-2">
        {goals.slice(0, 3).map((goal, idx) => {
          const progress = goal.progress || 0;
          const quadrant = QUADRANT_LABELS[goal.eisenhower_quadrant] || QUADRANT_LABELS.important;
          const linked = goal.linkedTasks || goal.pendingTasks || 0;
          const completed = goal.completedTasks || 0;
          const daysLeft = goal.target_date
            ? Math.max(0, Math.ceil((new Date(goal.target_date) - getCairoNow()) / 86400000))
            : null;

          return (
            <motion.div
              key={goal.id || idx}
              initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="p-2.5 rounded-xl bg-white/5 border border-white/5 hover:bg-white/8 transition-all"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-medium text-white flex-1 truncate">{goal.title}</span>
                <span className={`text-[8px] px-1.5 py-0.5 rounded-md font-medium ${quadrant.color}`}>
                  {quadrant.label}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      progress >= 80 ? 'bg-green-500' : progress >= 40 ? 'bg-primary-500' : 'bg-yellow-500'
                    }`}
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
                <span className="text-[10px] text-gray-400 font-medium w-8 text-left">{progress}%</span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                {linked > 0 && (
                  <span className="text-[9px] text-gray-500">{completed}/{linked} مهمة</span>
                )}
                {daysLeft !== null && (
                  <span className={`text-[9px] ${daysLeft <= 3 ? 'text-red-400' : daysLeft <= 7 ? 'text-yellow-400' : 'text-gray-500'}`}>
                    {daysLeft === 0 ? 'ينتهي اليوم!' : `${daysLeft} يوم متبقي`}
                  </span>
                )}
                {goal.linkedBehaviors?.length > 0 && (
                  <span className="text-[9px] text-purple-400">
                    {goal.linkedBehaviors.length} عادة مرتبطة
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Goal suggestions */}
      {goalSuggestions.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/5">
          {goalSuggestions.slice(0, 2).map((s, i) => (
            <p key={i} className="text-[10px] text-gray-500 flex items-center gap-1 mb-1">
              <Sparkles size={9} className="text-primary-400 flex-shrink-0" />
              <span className="truncate">{s.message}</span>
            </p>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// HABIT SUGGESTION WIDGET — Smart suggestions based on time, patterns, failures
// Shows behavior_type (build/quit), links to decision engine
// ═════════════════════════════════════════════════════════════════════════════
function HabitSuggestionWidget({ onLogHabit, onViewChange }) {
  const { data: suggestionsRaw, isLoading } = useQuery({
    queryKey: ['habit-suggestions'],
    queryFn: habitAPI.getSuggestions,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  const suggestions = suggestionsRaw?.data?.data || [];

  if (isLoading || suggestions.length === 0) return null;

  const BEHAVIOR_TYPE_LABELS = {
    build: { label: 'بناء', icon: '🌱', color: 'text-green-400 bg-green-500/10' },
    break: { label: 'تخلص', icon: '🚫', color: 'text-red-400 bg-red-500/10' },
    maintain: { label: 'حافظ', icon: '🔄', color: 'text-blue-400 bg-blue-500/10' },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4 bg-gradient-to-br from-purple-500/8 to-primary-500/5 border border-purple-500/15"
      dir="rtl" role="region" aria-label="اقتراحات العادات"
    >
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Sparkles size={14} className="text-purple-400" /> اقتراحات ذكية
        </h2>
        <button onClick={() => onViewChange?.('habits')}
          className="text-[10px] text-primary-400 hover:text-primary-300">
          كل العادات
        </button>
      </div>

      <div className="space-y-1.5">
        {suggestions.slice(0, 3).map((s, idx) => {
          const bt = BEHAVIOR_TYPE_LABELS[s.behavior_type] || BEHAVIOR_TYPE_LABELS.build;
          return (
            <motion.div
              key={s.habit_id}
              initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.08 }}
              className="flex items-center gap-2.5 p-2 rounded-lg bg-white/5 hover:bg-white/8 transition-all"
            >
              <span className="text-lg flex-shrink-0">{s.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-xs text-white font-medium truncate">{s.name}</p>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-md ${bt.color}`}>
                    {bt.icon} {bt.label}
                  </span>
                  {s.current_streak > 0 && (
                    <span className="text-[8px] text-orange-400">🔥{s.current_streak}</span>
                  )}
                </div>
                <p className="text-[10px] text-gray-500 truncate">{s.reason}</p>
              </div>
              <button
                onClick={() => onLogHabit(s.habit_id)}
                className="text-[10px] px-2.5 py-1.5 bg-primary-500/15 text-primary-400 rounded-lg
                  hover:bg-primary-500/25 transition-all active:scale-95 flex-shrink-0"
              >
                سجّل
              </button>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
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

  // ── Completion celebration state ──
  const [celebration, setCelebration] = useState(null);
  const completionCountRef = useRef(0);

  // ═══ PHASE 12.6 v4.0: Brain Store — THE ONLY source of truth for decisions ═══
  // ═══ Phase 12.8: RESILIENT brain store access ═══
  // HARD RULE: The UI must NEVER stay in a loading state. Period.
  const { brainState, fetchBrainState, rejectDecision, isLoading: brainLoading } = useBrainStore();

  // Refresh brain state when dashboard data changes (NOT on mount — initBrain handles that)
  useEffect(() => {
    if (dashboardData?.today_tasks || dashboardData?.habits) {
      fetchBrainState(); // non-forced: uses cache if fresh
    }
  }, [dashboardData?.today_tasks, dashboardData?.habits]);

  // Phase 12.8: TWO-LAYER failsafe
  // Layer 1: brainStore has its own 3s failsafe (sets brainState to fallback)
  // Layer 2: THIS component has a 2s failsafe (stops showing skeleton, renders without brain)
  // RESULT: Maximum possible loading time = 2 seconds in this component
  const [brainTimedOut, setBrainTimedOut] = useState(false);
  useEffect(() => {
    if (brainState) {
      setBrainTimedOut(false);
      return;
    }
    // 2 seconds — shorter than brainStore's 3s, because we want the dashboard
    // to render SOMETHING even if the brain store failsafe hasn't fired yet
    const timer = setTimeout(() => {
      if (!useBrainStore.getState().brainState) {
        console.warn('[DashboardHome] Phase 12.8: Brain state not available after 2s — rendering without it');
        setBrainTimedOut(true);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [brainState]);

  // Convert brainState to cognitiveDecision-compatible shape — NO fallback
  // Phase 12.7: now includes intent, intentLabel, dayContext, tone
  // Phase 12.9: UI consistency — truth-guarded rendering
  const cognitiveDecision = useMemo(() => {
    if (!brainState?.currentDecision) return null; // Loading — show skeleton briefly
    const d = brainState.currentDecision;
    const us = brainState.userState || {};
    const as = brainState.adaptiveSignals || {};
    const dc = brainState.dayContext || null;

    // Phase 12.9 TASK 5: UI Consistency Guard
    // Ensure cognitiveDecision is truth-aligned before UI renders it
    let truthGuardedTone = d.tone || null;
    let truthGuardedConfidence = d.confidence || 0;
    let truthGuardedWhy = d.why || [];

    // GUARD: Empty day must never get positive tone in UI
    if (dc?.classification === 'empty') {
      if (truthGuardedTone === 'positive') truthGuardedTone = 'neutral';
      // Strip any congratulatory reasons that leaked through
      const congrats = ['احسنت', 'ممتاز', 'يوم منتج', 'شغل حقيقي'];
      truthGuardedWhy = truthGuardedWhy.filter(r =>
        typeof r !== 'string' || !congrats.some(c => r.includes(c))
      );
      if (truthGuardedWhy.length === 0) {
        truthGuardedWhy = ['النهارده مفيش مهام مسجلة'];
      }
    }

    // GUARD: safeMode states get reduced confidence
    if (brainState.safeMode) {
      truthGuardedConfidence = 0;
      truthGuardedTone = 'neutral';
    }

    return {
      chosen_task: d.taskId ? { id: d.taskId, title: d.taskTitle, type: d.type, is_habit: d.type === 'habit', priority: d.priority, estimatedMinutes: d.estimatedMinutes } : null,
      state: d.type === 'break' ? 'overwhelmed' :
             us.momentum === 'high' ? 'momentum' :
             us.burnoutRisk > 0.6 ? 'overwhelmed' :
             us.energy === 'low' ? 'low_energy' :
             as.rejectionStreak >= 2 ? 'procrastinating' : 'normal',
      assistant_message: truthGuardedWhy[0] || brainState.reason || '',
      smallest_step: d.smallestStep,
      blocker: d.blocker || null,
      energy: us.energy || 'medium',
      xp_reward: { total: 0 },
      why: truthGuardedWhy,
      confidence: truthGuardedConfidence,
      memory_summary: {
        consecutive_completions: as.completionStreak || 0,
        consecutive_skips: as.rejectionStreak || 0,
      },
      decisionMemory: brainState.decisionMemory || null,
      difficultyModifier: as.difficultyModifier || 1.0,
      inactivityStrategy: as.inactivityStrategy || 'normal',
      // Phase 12.7: Intent + Context
      intent: d.intent || null,
      intentLabel: d.intentLabel || '',
      tone: truthGuardedTone,
      dayContext: dc,
      _fromBrain: true,
    };
  }, [brainState]);

  // BEHAVIORAL ENGINE: Still used for identity + scenario (backward compat)
  const behaviorAnalysis = useMemo(() => {
    const safeHabits = Array.isArray(dashboardData?.habits) ? dashboardData.habits : [];
    const safeTasks = Array.isArray(dashboardData?.today_tasks) ? dashboardData.today_tasks : [];
    const bestStreak = safeHabits.reduce((max, h) => Math.max(max, h.current_streak || 0), 0);
    return analyzeBehavior({
      tasks: safeTasks,
      habits: safeHabits,
      streak: bestStreak,
      consecutiveCompletions: cognitiveDecision?.memory_summary?.consecutive_completions || completionCountRef.current,
      daysSinceLastActivity: 0,
      skips: cognitiveDecision?.memory_summary?.consecutive_skips || 0,
    });
  }, [dashboardData?.habits, dashboardData?.today_tasks, cognitiveDecision]);

  // SCENARIO ENGINE: Detect current scenario using cognitive state
  const currentScenario = useMemo(() => {
    if (!behaviorAnalysis) return null;
    return analyzeScenario(behaviorAnalysis.inputs, {
      nextTaskTitle: cognitiveDecision?.chosen_task?.title || behaviorAnalysis.nextAction?.action?.item?.title,
    });
  }, [behaviorAnalysis, cognitiveDecision]);

  // Update adaptive profile daily
  useEffect(() => {
    if (dashboardData?.today_tasks || dashboardData?.habits) {
      try {
        updateProfile({
          tasks: Array.isArray(dashboardData?.today_tasks) ? dashboardData.today_tasks : [],
          habits: Array.isArray(dashboardData?.habits) ? dashboardData.habits : [],
        });
      } catch { /* silent */ }
    }
  }, [dashboardData?.today_tasks, dashboardData?.habits]);

  // Cognitive Engine powered completion messages — context-aware XP
  const getCompletionCelebration = useCallback((type, taskObj) => {
    completionCountRef.current += 1;
    const safeTasks = Array.isArray(dashboardData?.today_tasks) ? dashboardData.today_tasks : [];
    const safeHabits = Array.isArray(dashboardData?.habits) ? dashboardData.habits : [];

    // Use cognitive engine for instant reaction
    if (taskObj) {
      try {
        const reaction = reactToCompletion(taskObj, safeTasks, safeHabits);
        return {
          text: reaction.celebration.text,
          emoji: reaction.celebration.emoji,
          count: completionCountRef.current,
          xp: reaction.xp_earned?.total || 0,
          nextTask: reaction.next_decision?.chosen_task?.title,
        };
      } catch { /* fallback below */ }
    }

    // Fallback: use behavioral engine
    const reward = computeRewardIntensity({
      streak: behaviorAnalysis?.inputs?.streak || 0,
      completedToday: completionCountRef.current,
      behaviorState: behaviorAnalysis?.behaviorState || 'steady',
      energyLevel: behaviorAnalysis?.energy?.level || 'medium',
      isFirstOfDay: completionCountRef.current === 1,
      isHabit: type === 'habit',
      taskPriority: 'medium',
    });

    return {
      text: reward.message,
      emoji: reward.emoji,
      count: completionCountRef.current,
      xp: reward.totalXP,
    };
  }, [behaviorAnalysis, dashboardData?.today_tasks, dashboardData?.habits]);

  // Mutations with cognitive engine integration
  const completeTask = useMutation({
    mutationFn: (id) => taskAPI.completeTask(id),
    onSuccess: (_, id) => {
      invalidateAll();
      recordAction('task_completed');
      // Find the task object for cognitive reaction
      const safeTasks = Array.isArray(dashboardData?.today_tasks) ? dashboardData.today_tasks : [];
      const taskObj = safeTasks.find(t => t.id === id) || { id, title: 'مهمة' };
      cognitiveRecord('complete', { task_id: id, task_title: taskObj.title, type: 'task' });
      const celeb = getCompletionCelebration('task', taskObj);
      setCelebration(celeb);
      const nextHint = celeb.nextTask ? ` → التالي: ${celeb.nextTask}` : '';
      toast(`${celeb.text}${celeb.xp ? ` (+${celeb.xp} XP)` : ''}${nextHint}`, {
        icon: celeb.emoji,
        duration: 3000,
        style: { background: '#0f2b1a', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', fontWeight: 700 },
      });
      setTimeout(() => setCelebration(null), 3000);
      refetchFlow();
    },
    onError: () => toast.error('فشل إنهاء المهمة'),
  });

  const logHabit = useMutation({
    mutationFn: (id) => habitAPI.checkIn(id, {}),
    onSuccess: (_, id) => {
      invalidateAll();
      recordAction('habit_checkin');
      const safeHabits = Array.isArray(dashboardData?.habits) ? dashboardData.habits : [];
      const habitObj = safeHabits.find(h => h.id === id) || { id, name: 'عادة' };
      cognitiveRecord('complete', { task_id: id, task_title: habitObj.name, type: 'habit' });
      const celeb = getCompletionCelebration('habit', habitObj);
      setCelebration(celeb);
      toast(`${celeb.text}${celeb.xp ? ` (+${celeb.xp} XP)` : ''}`, {
        icon: celeb.emoji,
        duration: 2500,
        style: { background: '#1a0f2b', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', fontWeight: 700 },
      });
      setTimeout(() => setCelebration(null), 3000);
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

  // ── Phase 6: Cross-Day Intelligence Queries ──
  const { data: streakWarningsRaw } = useQuery({
    queryKey: ['phase6-streak-warnings'],
    queryFn: phase6API.getStreakWarnings,
    staleTime: 5 * 60 * 1000,
    retry: 0,
  });
  const streakWarnings = streakWarningsRaw?.data?.data?.warnings || [];

  const { data: comebackRaw } = useQuery({
    queryKey: ['phase6-comeback'],
    queryFn: phase6API.getComebackStatus,
    staleTime: 10 * 60 * 1000,
    retry: 0,
  });
  const comebackStatus = comebackRaw?.data?.data;

  const { data: weeklyNarrativeRaw } = useQuery({
    queryKey: ['phase6-weekly-narrative'],
    queryFn: phase6API.getWeeklyNarrative,
    staleTime: 30 * 60 * 1000,
    retry: 0,
  });
  const weeklyNarrative = weeklyNarrativeRaw?.data?.data;

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

  // Compute identity statement using Behavioral Engine (MUST be before early returns)
  const identityStatement = useMemo(() => {
    const h = Array.isArray(dashboardData?.habits) ? dashboardData.habits : [];
    return generateIdentityStatement(h);
  }, [dashboardData?.habits]);

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

  // Defensive: no identityStatement hook needed here — moved before early returns
  // Count for daily-flow CTA visibility
  const pendingTasks = today_tasks.filter(t => t.status !== 'completed');
  const hasStartedDay = todayFlowData?.nextAction || todayFlowData?.lifeFeed?.length > 0;
  
  // REAL PROGRESS — used by Execute ↔ Your Day integration bar
  const summary = dashboardData?.summary;
  const totalItems = (summary?.tasks?.total || 0) + (summary?.habits?.total || 0);
  const doneItems = (summary?.tasks?.completed || 0) + (summary?.habits?.completed || 0);

  return (
    <div className="space-y-3 sm:space-y-4 max-w-5xl mx-auto">

      {/* ═══ COMPLETION CELEBRATION OVERLAY ═══ */}
      <AnimatePresence>
        {celebration && celebration.count >= 3 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed inset-0 z-[95] flex items-center justify-center pointer-events-none"
          >
            <div className="text-center">
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }}
                transition={{ duration: 0.5 }}
                className="text-7xl block mb-2"
              >
                {celebration.emoji}
              </motion.span>
              <motion.p
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-lg font-black text-white text-glow"
              >
                {celebration.text}
              </motion.p>
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-sm text-primary-400 font-bold mt-1"
              >
                {celebration.count} إنجاز متتالي اليوم!
              </motion.p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Burnout Alert (from unified today-flow) */}
      <BurnoutAlert todayFlowData={todayFlowData} />

      {/* ═══ Phase 6: COMEBACK SYSTEM — warm welcome for returning users ═══ */}
      {comebackStatus?.is_comeback && (
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 bg-gradient-to-l from-blue-500/15 to-purple-500/10 border border-blue-500/25"
          dir="rtl"
        >
          <div className="flex items-center gap-3 mb-2">
            <span className="text-2xl">💙</span>
            <div>
              <p className="text-sm font-bold text-white">{comebackStatus.welcome_message}</p>
              {comebackStatus.at_risk_streaks?.length > 0 && (
                <p className="text-[11px] text-orange-400 mt-0.5">
                  ⚠️ {comebackStatus.at_risk_streaks.length} سلسلة في خطر — سجّل اليوم!
                </p>
              )}
            </div>
          </div>
          {comebackStatus.recovery_plan && (
            <div className="flex gap-2 mt-2 flex-wrap">
              <button onClick={() => onViewChange?.('habits')} className="text-[10px] px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition">
                🔄 {comebackStatus.recovery_plan.step_1}
              </button>
              <button onClick={() => onViewChange?.('tasks')} className="text-[10px] px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/30 hover:bg-purple-500/30 transition">
                📋 {comebackStatus.recovery_plan.step_2}
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* ═══ Phase 6: STREAK WARNINGS — loss aversion ═══ */}
      {streakWarnings.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-3 border border-orange-500/25 bg-gradient-to-l from-orange-500/10 to-red-500/5"
          dir="rtl"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Flame size={14} className="text-orange-400" />
            <span className="text-xs font-bold text-orange-300">سلسلات في خطر!</span>
          </div>
          <div className="space-y-1">
            {streakWarnings.slice(0, 3).map((w, i) => (
              <button key={i}
                onClick={() => onViewChange?.('habits')}
                className="w-full flex items-center justify-between text-[11px] px-2 py-1 rounded bg-orange-500/10 hover:bg-orange-500/20 transition"
              >
                <span className="text-white">{w.message_ar}</span>
                <span className="text-orange-400 font-bold text-[10px] whitespace-nowrap mr-2">🔥 {w.streak} يوم</span>
              </button>
            ))}
          </div>
        </motion.div>
      )}

      {/* ═══ GREETING + IDENTITY FRAMING (moved to top, first thing user sees) ═══ */}
      {greeting && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between" dir="rtl"
        >
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white">{greeting}</h1>
            <p className="text-gray-500 text-xs mt-0.5">{date?.day_name} · {date?.formatted}</p>
            {/* Identity framing — behavioral psychology */}
            {identityStatement && (
              <motion.p
                initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
                className="text-[11px] text-primary-400 font-medium mt-1.5 flex items-center gap-1"
              >
                <Flame size={11} className="text-orange-400" /> {identityStatement}
              </motion.p>
            )}
          </div>
          <button onClick={() => onViewChange?.('analytics')}
            className="text-xs text-gray-500 hover:text-primary-400 transition-colors flex items-center gap-1">
            <TrendingUp size={12} /> التحليلات
          </button>
        </motion.div>
      )}

      {/* ═══ COGNITIVE ENGINE: Data-Driven Decision Nudge (Phase 12.7: Intent-Aware) ═══ */}
      {/* Shows the ONE most important action with real task name + intent label + specific reason */}
      {cognitiveDecision?.chosen_task && (
        <motion.div
          initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className={`glass-card p-3.5 border ${
            cognitiveDecision.state === 'momentum' ? 'border-green-500/20 bg-gradient-to-l from-green-500/8 to-emerald-500/5' :
            cognitiveDecision.state === 'procrastinating' ? 'border-yellow-500/20 bg-gradient-to-l from-yellow-500/8 to-orange-500/5' :
            cognitiveDecision.state === 'overwhelmed' ? 'border-amber-500/20 bg-gradient-to-l from-amber-500/8 to-red-500/5' :
            cognitiveDecision.state === 'low_energy' ? 'border-blue-500/20 bg-gradient-to-l from-blue-500/8 to-cyan-500/5' :
            'border-primary-500/20 bg-gradient-to-l from-primary-500/8 to-purple-500/5'
          }`}
          dir="rtl"
        >
          <div className="flex items-start gap-2.5">
            <span className="text-lg flex-shrink-0">
              {cognitiveDecision.state === 'momentum' ? '🚀' :
               cognitiveDecision.state === 'procrastinating' ? '💡' :
               cognitiveDecision.state === 'overwhelmed' ? '🧘' :
               cognitiveDecision.state === 'low_energy' ? '😴' :
               cognitiveDecision.state === 'late_start' ? '⏰' :
               cognitiveDecision.chosen_task.is_habit ? '🔥' :
               cognitiveDecision.intent === 'deadline' ? '⏰' :
               cognitiveDecision.intent === 'urgent' ? '🚨' :
               cognitiveDecision.intent === 'growth' ? '🌱' :
               cognitiveDecision.intent === 'maintenance' ? '🔧' : '🎯'}
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-white leading-relaxed">
                {cognitiveDecision.assistant_message}
              </p>
              {cognitiveDecision.smallest_step && (
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                  👉 {cognitiveDecision.smallest_step}
                </p>
              )}
              {cognitiveDecision.blocker && (
                <p className="text-[10px] text-amber-400/70 mt-1 flex items-center gap-1">
                  <AlertTriangle size={9} /> {cognitiveDecision.blocker}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {/* Phase 12.7: Intent badge */}
              {cognitiveDecision.intentLabel && (
                <span className={`text-[9px] px-2 py-0.5 rounded-full ${
                  cognitiveDecision.intent === 'deadline' ? 'bg-red-500/15 text-red-400' :
                  cognitiveDecision.intent === 'urgent' ? 'bg-orange-500/15 text-orange-400' :
                  cognitiveDecision.intent === 'growth' ? 'bg-emerald-500/15 text-emerald-400' :
                  'bg-gray-500/15 text-gray-400'
                }`}>
                  {cognitiveDecision.intent === 'deadline' ? '⏰' :
                   cognitiveDecision.intent === 'urgent' ? '🚨' :
                   cognitiveDecision.intent === 'growth' ? '🌱' : '🔧'} {cognitiveDecision.intentLabel}
                </span>
              )}
              <span className={`text-[9px] px-2 py-0.5 rounded-full ${
                cognitiveDecision.energy === 'high' ? 'bg-green-500/15 text-green-400' :
                cognitiveDecision.energy === 'medium' ? 'bg-yellow-500/15 text-yellow-400' :
                'bg-blue-500/15 text-blue-400'
              }`}>
                ⚡ {cognitiveDecision.energy === 'high' ? 'طاقة عالية' : cognitiveDecision.energy === 'medium' ? 'طاقة متوسطة' : 'طاقة منخفضة'}
              </span>
              {cognitiveDecision.xp_reward?.total > 0 && (
                <span className="text-[9px] text-primary-400 font-bold">
                  +{cognitiveDecision.xp_reward.total} XP
                </span>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Phase 12.8: Loading state — shows for MAX 2 seconds, then disappears */}
      {!cognitiveDecision?.chosen_task && brainLoading && !brainTimedOut && (
        <div className="glass-card p-3.5 border border-primary-500/20 bg-gradient-to-l from-primary-500/8 to-purple-500/5" dir="rtl">
          <div className="flex items-center gap-2.5">
            <div className="skeleton w-6 h-6 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 w-3/4 rounded" />
              <div className="skeleton h-3 w-1/2 rounded" />
            </div>
          </div>
        </div>
      )}

      {/* Phase 12.8: Fallback — brain didn't load. Show connection error + retry.
          HARD RULE: NEVER infinite loading. This card is the exit. */}
      {!cognitiveDecision && brainTimedOut && (
        <div className="glass-card p-3.5 border border-amber-500/20 bg-gradient-to-l from-amber-500/8 to-orange-500/5" dir="rtl">
          <div className="flex items-start gap-2.5">
            <span className="text-lg">⚠️</span>
            <div className="flex-1">
              <p className="text-xs font-bold text-white mb-1">في مشكلة مؤقتة في التوصيل</p>
              <p className="text-[11px] text-gray-400">المهام والعادات شغالة عادي — القرار الذكي بس متاخر</p>
              <button
                onClick={() => { setBrainTimedOut(false); fetchBrainState(true); }}
                className="mt-2 px-3 py-1.5 text-[11px] text-primary-400 hover:text-white bg-primary-500/10 hover:bg-primary-500/20 rounded-lg border border-primary-500/20 transition-all"
              >
                🔄 جرب تاني
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 12.7: Context-aware brain message for empty/reflection/break/end_of_day types */}
      {/* Tone adapts: productive=positive, partial=constructive, empty=neutral */}
      {cognitiveDecision && !cognitiveDecision.chosen_task && brainState?.currentDecision && (
        <motion.div
          initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
          className={`glass-card p-3.5 border ${
            cognitiveDecision.tone === 'positive' || brainState.dayContext?.classification === 'productive'
              ? 'border-green-500/20 bg-gradient-to-l from-green-500/8 to-emerald-500/5'
              : cognitiveDecision.tone === 'constructive' || brainState.dayContext?.classification === 'partial'
                ? 'border-yellow-500/20 bg-gradient-to-l from-yellow-500/8 to-amber-500/5'
                : brainState.currentDecision.type === 'break'
                  ? 'border-amber-500/20 bg-gradient-to-l from-amber-500/8 to-red-500/5'
                  : 'border-primary-500/20 bg-gradient-to-l from-primary-500/8 to-purple-500/5'
          }`}
          dir="rtl"
        >
          <div className="flex items-start gap-2.5">
            <span className="text-lg flex-shrink-0">
              {brainState.currentDecision.type === 'reflection' ? '🌙' :
               brainState.currentDecision.type === 'break' ? '🧘' :
               brainState.dayContext?.classification === 'productive' ? '🏆' :
               brainState.dayContext?.classification === 'partial' ? '📋' :
               brainState.dayContext?.classification === 'empty' ? '📝' : '✨'}
            </span>
            <div className="flex-1 min-w-0">
              {brainState.currentDecision.taskTitle && (
                <p className="text-xs font-bold text-white leading-relaxed mb-1">
                  {brainState.currentDecision.taskTitle}
                </p>
              )}
              {/* Phase 12.7: Show day context label */}
              {brainState.dayContext?.label_ar && (
                <span className={`inline-block text-[9px] px-2 py-0.5 rounded-full mb-1.5 ${
                  brainState.dayContext.classification === 'productive' ? 'bg-green-500/15 text-green-400' :
                  brainState.dayContext.classification === 'partial' ? 'bg-yellow-500/15 text-yellow-400' :
                  'bg-gray-500/15 text-gray-400'
                }`}>
                  {brainState.dayContext.classification === 'productive' ? '✅' :
                   brainState.dayContext.classification === 'partial' ? '🔄' : '📭'} {brainState.dayContext.label_ar}
                  {brainState.dayContext.completionRatio > 0 && ` (${brainState.dayContext.completionRatio}%)`}
                </span>
              )}
              {/* Show all why reasons (not just first) */}
              {brainState.currentDecision.why?.map((reason, i) => (
                <p key={i} className="text-xs text-gray-300 leading-relaxed">
                  {i === 0 ? '' : '• '}{reason}
                </p>
              ))}
              {!brainState.currentDecision.why?.length && brainState.reason && (
                <p className="text-xs text-gray-300 leading-relaxed">{brainState.reason}</p>
              )}
              {brainState.currentDecision.smallestStep && (
                <p className="text-[11px] text-gray-400 mt-1 leading-relaxed">
                  👉 {brainState.currentDecision.smallestStep}
                </p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* ═══ EXECUTE ↔ YOUR DAY INTEGRATION — Phase 9.0 ═══ */}
      {/* Smart CTA: context-aware transition between dashboard (يومك) and execution (نفّذ) */}
      {pendingTasks.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
          className="w-full glass-card overflow-hidden bg-gradient-to-l from-primary-500/12 to-purple-600/8 border border-primary-500/20"
          dir="rtl"
        >
          <button
            onClick={() => onViewChange?.('daily_flow')}
            className="w-full p-4 hover:bg-white/[0.02] active:scale-[0.99] transition-all"
          >
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary-500 to-purple-600 flex items-center justify-center shadow-lg shadow-primary-500/25 flex-shrink-0">
                <Play size={20} className="text-white" fill="white" />
              </div>
              <div className="flex-1 text-right min-w-0">
                <p className="text-sm font-bold text-white">
                  {hasStartedDay ? 'كمّل يومك — نفّذ' : 'ابدأ يومك المنظم'}
                </p>
                <p className="text-[11px] text-gray-400">
                  {pendingTasks.length} مهمة متبقية + {habits.filter(h => !h.completed_today).length} عادة — {hasStartedDay ? 'ارجع لخط التنفيذ' : 'النظام جاهز يقودك'}
                </p>
              </div>
              <ArrowRight size={16} className="text-primary-400 flex-shrink-0" />
            </div>
          </button>
          {/* Quick state bar: shows live progress between Execute ↔ Your Day */}
          <div className="px-4 pb-3 pt-0">
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${totalItems > 0 ? Math.round((doneItems / totalItems) * 100) : 0}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                  className="h-full bg-gradient-to-l from-primary-500 to-green-500 rounded-full"
                />
              </div>
              <span className="text-[10px] text-gray-500 font-bold">
                {doneItems}/{totalItems}
              </span>
            </div>
          </div>
        </motion.div>
      )}

      {/* Overdue Tasks Strategy Banner */}
      <OverdueStrategyBanner
        tasks={overdueTasks}
        onRescheduleAll={handleRescheduleOverdue}
        onViewChange={onViewChange}
      />

      {/* Merged "Do Now" Card — the most important action */}
      <DoNowCard
        todayFlowData={todayFlowData}
        isLoading={flowLoading}
        isError={flowError}
        refetch={refetchFlow}
        onViewChange={onViewChange}
        onCompleteTask={() => invalidateAll()}
      />

      {/* ═══ STREAK PRESSURE STRIP — always visible when streaks exist ═══ */}
      <StreakPressureStrip habits={habits} onViewChange={onViewChange} />

      {/* Today Summary */}
      <TodaySummaryCard dashboardData={dashboardData} onViewChange={onViewChange} />

      {/* Engagement Feedback + Achievements */}
      <EngagementBar dashboardData={dashboardData} />
      <WeeklyAchievement dashboardData={dashboardData} onViewChange={onViewChange} />

      {/* Dynamic Execution Timeline */}
      <DynamicExecutionTimeline
        tasks={today_tasks}
        onCompleteTask={(id) => completeTask.mutate(id)}
        isLoading={isLoading && !dashboardData}
        onViewChange={onViewChange}
      />

      {/* Behavior Intelligence Card */}
      <BehaviorIntelligenceCard
        habits={habits}
        onLogHabit={(id) => logHabit.mutate(id)}
        onViewChange={onViewChange}
      />

      {/* ═══ Goal Context Card ═══ */}
      <GoalContextCard
        dashboardData={dashboardData}
        todayFlowData={todayFlowData}
        onViewChange={onViewChange}
      />

      {/* ═══ Streak Celebration & Milestone ═══ */}
      <StreakCelebration habits={habits} dashboardData={dashboardData} />

      {/* Life Feed (collapsible) */}
      <LifeFeedWidget todayFlowData={todayFlowData} />

      {/* ═══ Phase 6: WEEKLY NARRATIVE — Cross-Day Intelligence ═══ */}
      {weeklyNarrative?.narrative && !weeklyNarrative?.error && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4 border border-purple-500/20 bg-gradient-to-l from-purple-500/8 to-indigo-500/5"
          dir="rtl"
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-lg">{weeklyNarrative.narrative.emoji}</span>
              <div>
                <p className="text-xs font-bold text-white">{weeklyNarrative.narrative.title}</p>
                <p className="text-[10px] text-gray-500">تقرير الأسبوع</p>
              </div>
            </div>
            <div className="text-center">
              <p className="text-lg font-black text-primary-400">{weeklyNarrative.narrative.overall_score}</p>
              <p className="text-[8px] text-gray-500">نقطة</p>
            </div>
          </div>
          <p className="text-[11px] text-gray-300 leading-relaxed mb-2">{weeklyNarrative.narrative.body}</p>

          {/* Achievements badges */}
          {weeklyNarrative.achievements?.length > 0 && (
            <div className="flex gap-2 flex-wrap mb-2">
              {weeklyNarrative.achievements.map((a, i) => (
                <span key={i} className="text-[9px] px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-300 border border-yellow-500/20">
                  {a.badge} {a.title_ar}
                </span>
              ))}
            </div>
          )}

          {/* Trends */}
          {weeklyNarrative.trends?.length > 0 && (
            <div className="space-y-1">
              {weeklyNarrative.trends.slice(0, 2).map((t, i) => (
                <p key={i} className={`text-[10px] flex items-center gap-1 ${t.type === 'positive' ? 'text-green-400' : t.type === 'concern' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {t.icon} {t.message_ar}
                </p>
              ))}
            </div>
          )}

          {/* Prediction */}
          {weeklyNarrative.prediction && (
            <div className="mt-2 p-2 rounded-lg bg-primary-500/10 border border-primary-500/15">
              <p className="text-[10px] text-primary-300 flex items-center gap-1">
                <Brain size={10} /> {weeklyNarrative.prediction.message_ar}
              </p>
            </div>
          )}

          <button
            onClick={() => onViewChange?.('analytics')}
            className="mt-2 w-full text-[10px] text-primary-400 hover:text-primary-300 text-center py-1"
          >
            عرض التحليلات الكاملة ←
          </button>
        </motion.div>
      )}

      {/* ═══ Evening Reflection CTA ═══ */}
      <EveningReflectionCTA dashboardData={dashboardData} onViewChange={onViewChange} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STREAK CELEBRATION — Gamification element
// Shows celebration when user hits streak milestones (3, 7, 14, 21, 30, 60, 100)
// ═════════════════════════════════════════════════════════════════════════════
function StreakCelebration({ habits, dashboardData }) {
  const safeHabits = Array.isArray(habits) ? habits : [];
  const bestStreak = safeHabits.reduce((max, h) => Math.max(max, h.current_streak || 0), 0);
  const streakHabit = safeHabits.find(h => (h.current_streak || 0) === bestStreak);
  const tasksCompleted = dashboardData?.summary?.tasks?.completed || 0;
  const totalScore = (bestStreak * 10) + (tasksCompleted * 5);

  const milestones = [3, 7, 14, 21, 30, 60, 100];
  const currentMilestone = milestones.filter(m => bestStreak >= m).pop();
  const nextMilestone = milestones.find(m => bestStreak < m);
  const progressToNext = nextMilestone ? Math.round((bestStreak / nextMilestone) * 100) : 100;

  const getMilestoneEmoji = (days) => {
    if (days >= 100) return '👑';
    if (days >= 60) return '💎';
    if (days >= 30) return '🏆';
    if (days >= 21) return '🌟';
    if (days >= 14) return '🔥';
    if (days >= 7) return '⭐';
    if (days >= 3) return '✨';
    return '🌱';
  };

  if (bestStreak < 2) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4 bg-gradient-to-r from-orange-500/8 to-yellow-500/5 border border-orange-500/15"
      dir="rtl"
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-400 to-yellow-500 flex items-center justify-center text-lg shadow-lg shadow-orange-500/20">
          {getMilestoneEmoji(bestStreak)}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-white">
              {bestStreak} يوم متتالي! 🔥
            </span>
            {currentMilestone && (
              <span className="text-[9px] bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full">
                مرحلة {currentMilestone}
              </span>
            )}
          </div>
          <p className="text-[10px] text-gray-500">
            {streakHabit?.name || 'أطول سلسلة'} · نقاطك: {totalScore}
          </p>
        </div>
        <div className="text-center">
          <div className="text-lg font-black text-orange-400">{totalScore}</div>
          <div className="text-[8px] text-gray-500">نقطة</div>
        </div>
      </div>

      {/* Progress to next milestone */}
      {nextMilestone && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressToNext}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="h-full bg-gradient-to-l from-orange-400 to-yellow-500 rounded-full"
            />
          </div>
          <span className="text-[10px] text-gray-500">
            {nextMilestone - bestStreak} يوم لـ {getMilestoneEmoji(nextMilestone)} {nextMilestone}
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// WEEKLY ACHIEVEMENT — Shows weekly progress summary
// ═════════════════════════════════════════════════════════════════════════════
function WeeklyAchievement({ dashboardData, onViewChange }) {
  const summary = dashboardData?.summary;
  if (!summary) return null;

  const tasksCompleted = summary?.tasks?.completed || 0;
  const habitsCompleted = summary?.habits?.completed || 0;
  const score = summary?.productivity_score || 0;
  const total = (summary?.tasks?.total || 0) + (summary?.habits?.total || 0);
  const done = tasksCompleted + habitsCompleted;

  // Only show if meaningful data
  if (total === 0) return null;

  const achievements = [];
  if (tasksCompleted >= 5) achievements.push({ emoji: '🏅', text: 'بطل المهام' });
  if (habitsCompleted >= 3) achievements.push({ emoji: '🎯', text: 'منضبط العادات' });
  if (score >= 80) achievements.push({ emoji: '⚡', text: 'إنتاجية عالية' });
  if (done >= total * 0.8) achievements.push({ emoji: '🌟', text: 'يوم مثالي' });

  if (achievements.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card p-3" dir="rtl"
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-gray-500 font-medium">إنجازات اليوم:</span>
        {achievements.map((a, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.15 }}
            className="inline-flex items-center gap-1 text-[10px] bg-primary-500/10 text-primary-300 px-2 py-1 rounded-full border border-primary-500/20"
          >
            {a.emoji} {a.text}
          </motion.span>
        ))}
      </div>
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STREAK PRESSURE STRIP — Always visible, creates urgency
// "Don't break the chain" — most powerful behavioral motivator
// ═════════════════════════════════════════════════════════════════════════════
function StreakPressureStrip({ habits, onViewChange }) {
  const safeHabits = Array.isArray(habits) ? habits : [];
  const atRisk = safeHabits.filter(h => (h.current_streak || 0) >= 3 && !h.completed_today);
  if (atRisk.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
      className="flex gap-2 overflow-x-auto scrollbar-hide pb-0.5" dir="rtl"
    >
      {atRisk.slice(0, 4).map((h) => (
        <motion.button
          key={h.id}
          whileTap={{ scale: 0.95 }}
          onClick={() => onViewChange?.('habits')}
          className="flex-shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl bg-gradient-to-l from-orange-500/15 to-red-500/10 border border-orange-500/20 hover:border-orange-500/40 transition-all"
        >
          <span className="text-sm">{h.icon || '🔥'}</span>
          <div className="text-right">
            <p className="text-[11px] text-white font-bold leading-tight">{h.name}</p>
            <p className="text-[9px] text-orange-400 font-medium">
              {h.current_streak} يوم — لا تكسر السلسلة!
            </p>
          </div>
          <Flame size={12} className="text-orange-400 animate-pulse" />
        </motion.button>
      ))}
    </motion.div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// EVENING REFLECTION CTA — Emotional day-closing experience
// ═════════════════════════════════════════════════════════════════════════════
function EveningReflectionCTA({ dashboardData, onViewChange }) {
  const hour = getCairoNow().getHours();
  const summary = dashboardData?.summary;
  if (hour < 18 || !summary) return null;

  const tasksCompleted = summary?.tasks?.completed || 0;
  const habitsCompleted = summary?.habits?.completed || 0;
  const total = (summary?.tasks?.total || 0) + (summary?.habits?.total || 0);
  const done = tasksCompleted + habitsCompleted;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const getMessage = () => {
    if (pct >= 80) return { text: 'يوم استثنائي! اختم بملخص رائع', emoji: '🌟', color: 'from-green-500/15 to-emerald-500/10 border-green-500/20' };
    if (pct >= 50) return { text: 'يوم جيد — شوف إنجازاتك قبل ما تنام', emoji: '🌙', color: 'from-blue-500/15 to-indigo-500/10 border-blue-500/20' };
    if (pct >= 20) return { text: 'كل إنجاز مهم — راجع يومك', emoji: '💭', color: 'from-purple-500/15 to-indigo-500/10 border-purple-500/20' };
    return { text: 'بكرة يوم جديد — خطط الآن', emoji: '📋', color: 'from-primary-500/15 to-purple-500/10 border-primary-500/20' };
  };

  const msg = getMessage();

  return (
    <motion.button
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      onClick={() => onViewChange?.('daily_flow')}
      className={`w-full glass-card p-4 bg-gradient-to-l ${msg.color} hover:opacity-90 active:scale-[0.99] transition-all`}
      dir="rtl"
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">{msg.emoji}</span>
        <div className="flex-1 text-right">
          <p className="text-sm font-bold text-white">{msg.text}</p>
          <p className="text-[10px] text-gray-400">
            {done}/{total} إنجاز اليوم — {pct}% مكتمل
          </p>
        </div>
        <ArrowRight size={14} className="text-gray-500" />
      </div>
    </motion.button>
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
