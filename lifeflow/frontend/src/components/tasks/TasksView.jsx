/**
 * TasksView — Mobile-First Task Manager (Backend Smart View)
 * =============================================================
 * - Uses GET /tasks/smart-view for grouping + AI scoring + recommendation
 * - No frontend computeAIScore — all intelligence is on the backend
 * - Logs recommendation display, clicks, and completions
 * - Mobile-optimized: 44px tap targets, solid modals, sticky CTA, RTL
 * - Proper bottom padding for nav overlap prevention
 */

import { useState, useMemo, useCallback, memo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, CheckCircle, Clock, Trash2, X, ChevronDown,
  AlertCircle, Calendar, Check, Sun, List, Filter,
  Sparkles, Zap, ArrowRight, Edit3, Star, RefreshCw
} from 'lucide-react';
import { taskAPI } from '../../utils/api';
import useSyncStore from '../../store/syncStore';
import toast from 'react-hot-toast';

// ─── Constants ──────────────────────────────────────────────────────────────

const PRIORITIES = {
  urgent: { label: 'عاجل', color: 'text-red-400', bg: 'bg-red-500/15', dot: '#EF4444', ring: 'ring-red-500/30', order: 0 },
  high:   { label: 'عالي', color: 'text-orange-400', bg: 'bg-orange-500/15', dot: '#F97316', ring: 'ring-orange-500/30', order: 1 },
  medium: { label: 'متوسط', color: 'text-yellow-400', bg: 'bg-yellow-500/15', dot: '#EAB308', ring: 'ring-yellow-500/30', order: 2 },
  low:    { label: 'منخفض', color: 'text-green-400', bg: 'bg-green-500/15', dot: '#22C55E', ring: 'ring-green-500/30', order: 3 },
};

const CATEGORIES = {
  university: { label: 'الجامعة', emoji: '🎓' },
  work:       { label: 'العمل',   emoji: '💼' },
  health:     { label: 'الصحة',  emoji: '❤️' },
  fitness:    { label: 'الرياضة', emoji: '💪' },
  finance:    { label: 'المالية', emoji: '💰' },
  personal:   { label: 'شخصي',   emoji: '✨' },
  social:     { label: 'اجتماعي', emoji: '🤝' },
  learning:   { label: 'التطوير', emoji: '📚' },
  other:      { label: 'أخرى',   emoji: '📌' },
};

// ─── Cairo Timezone Helpers ─────────────────────────────────────────────────

function toCairoTime(utcDate) {
  if (!utcDate) return null;
  try {
    const d = new Date(utcDate);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Cairo'
    });
  } catch { return null; }
}

function toCairoDate(utcDate) {
  if (!utcDate) return null;
  try {
    const d = new Date(utcDate);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('ar-EG', {
      day: 'numeric', month: 'short', timeZone: 'Africa/Cairo'
    });
  } catch { return null; }
}

function getTodayCairo() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

function getTaskTime(task) {
  if (task.start_time) return toCairoTime(task.start_time);
  if (task.due_time) {
    // due_time may be "HH:mm" or "HH:mm:ss" — normalize to HH:mm
    const m = String(task.due_time).match(/^(\d{1,2}:\d{2})/);
    return m ? m[1] : null;
  }
  return null;
}

function getTaskEndTime(task) {
  if (task.end_time) return toCairoTime(task.end_time);
  return null;
}

/**
 * Convert an HH:mm string to total minutes for numeric sorting.
 * Returns Infinity for null/invalid so missing times sort last.
 */
function timeToMinutes(timeStr) {
  if (!timeStr) return Infinity;
  const m = String(timeStr).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return Infinity;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/**
 * Compute a numeric sort key for a task's display time.
 * Uses start_time (ISO → Cairo HH:mm) or due_time (plain HH:mm).
 * Tasks without any time get Infinity (sort last).
 */
function taskTimeSortKey(task) {
  const display = getTaskTime(task);
  return timeToMinutes(display);
}

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

/**
 * Sort tasks by: time (numeric minutes) → priority → createdAt.
 * Tasks with no time are placed after tasks that have a time.
 */
function sortTasksByTime(tasks) {
  return [...tasks].sort((a, b) => {
    // 1. Time ascending (missing time → Infinity → last)
    const ta = taskTimeSortKey(a);
    const tb = taskTimeSortKey(b);
    if (ta !== tb) return ta - tb;
    // 2. Priority ascending (urgent=0 first)
    const pa = PRIORITY_ORDER[a.priority] ?? 3;
    const pb = PRIORITY_ORDER[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    // 3. createdAt ascending (oldest first)
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
}

// ─── Task Item (Memoized) ──────────────────────────────────────────────────

const TaskItem = memo(function TaskItem({ task, onComplete, onDelete, isRecommended, onRecommendClick }) {
  const time = getTaskTime(task);
  const endTime = getTaskEndTime(task);
  const pri = PRIORITIES[task.priority] || PRIORITIES.medium;
  const cat = CATEGORIES[task.category] || CATEGORIES.other;
  const isDone = task.status === 'completed';
  const isOverdue = task._overdue;

  const handleRecommendedClick = () => {
    if (isRecommended && onRecommendClick) onRecommendClick(task.id);
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -40, height: 0, marginBottom: 0 }}
      transition={{ duration: 0.2 }}
      onClick={handleRecommendedClick}
      className={[
        'flex items-start gap-3 p-3.5 sm:p-4 rounded-2xl transition-all relative',
        isDone
          ? 'opacity-40 bg-white/3'
          : isOverdue
          ? 'bg-red-500/8 border border-red-500/20'
          : isRecommended
          ? 'bg-gradient-to-br from-primary-500/8 to-purple-500/5 border border-primary-500/20'
          : 'bg-white/5 hover:bg-white/8 border border-white/5',
      ].join(' ')}
    >
      {/* AI Recommended Badge */}
      {isRecommended && !isDone && (
        <div className="absolute top-2 left-2 sm:top-3 sm:left-3 flex items-center gap-1 bg-primary-500/20 text-primary-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
          <Sparkles size={9} /> موصى به
        </div>
      )}

      {/* Checkbox — 44px touch target */}
      <button
        onClick={() => !isDone && onComplete(task.id)}
        disabled={isDone}
        className={[
          'flex-shrink-0 w-11 h-11 rounded-full border-2 flex items-center justify-center transition-all active:scale-90',
          isDone
            ? 'bg-green-500 border-green-500'
            : 'border-gray-600 hover:border-primary-400 hover:bg-primary-500/10',
        ].join(' ')}
        aria-label={isDone ? 'مكتملة' : 'إكمال المهمة'}
      >
        {isDone && <Check size={16} className="text-white" strokeWidth={3} />}
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${isDone ? 'line-through text-gray-600' : 'text-white'}`}>
          {task.title}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
          {/* Time badge */}
          {time && (
            <span className="flex items-center gap-1 text-xs font-bold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-lg">
              <Clock size={10} />
              {time}
              {endTime && <span className="text-blue-300"> — {endTime}</span>}
            </span>
          )}

          {/* Priority */}
          <span className={`text-xs px-1.5 py-0.5 rounded-md ${pri.bg} ${pri.color} font-medium`}>
            {pri.label}
          </span>

          {/* Category */}
          <span className="text-xs text-gray-500">{cat.emoji}</span>

          {/* Overdue badge */}
          {isOverdue && !isDone && (
            <span className="flex items-center gap-0.5 text-xs text-red-400 font-bold">
              <AlertCircle size={10} />
              متأخرة
            </span>
          )}

          {/* Due date */}
          {task.due_date && (
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Calendar size={9} />
              {toCairoDate(task.due_date)}
            </span>
          )}
        </div>
      </div>

      {/* Quick Actions — 44px touch target */}
      <div className="flex flex-col gap-1 flex-shrink-0">
        <button
          onClick={() => onDelete(task.id)}
          className="w-11 h-11 rounded-xl text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center active:scale-90"
          aria-label="حذف المهمة"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </motion.div>
  );
});

// ─── Section Header ─────────────────────────────────────────────────────────

const SectionHeader = memo(function SectionHeader({ icon, label, count, color = 'text-gray-400', collapsed, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 py-2.5 px-1 w-full text-right"
    >
      <span className={`text-lg ${color}`}>{icon}</span>
      <span className={`text-sm font-bold ${color}`}>{label}</span>
      <span className="text-xs bg-white/5 px-2 py-0.5 rounded-full text-gray-500">{count}</span>
      {onToggle && (
        <ChevronDown size={14} className={`text-gray-500 mr-auto transition-transform ${collapsed ? '' : 'rotate-180'}`} />
      )}
    </button>
  );
});

// ─── Add Task Modal (Bottom Sheet — Phase H: solid bg, high contrast, validation) ──

function AddTaskModal({ isOpen, onClose, onSubmit, isPending }) {
  const [form, setForm] = useState({
    title: '', category: 'personal', priority: 'medium',
    due_date: getTodayCairo(), due_time: '', start_time: '', end_time: '', reminder_before: 15,
  });
  const [errors, setErrors] = useState({});
  const [success, setSuccess] = useState(false);

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'أدخل عنوان المهمة';
    if (form.title.trim().length > 0 && form.title.trim().length < 2) errs.title = 'العنوان قصير جداً';
    if (form.start_time && form.end_time && form.start_time >= form.end_time) errs.end_time = 'وقت النهاية يجب أن يكون بعد البداية';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;

    const data = {
      title: form.title.trim(),
      category: form.category,
      priority: form.priority,
      reminder_before: form.reminder_before,
    };

    if (form.start_time) {
      const date = form.due_date || getTodayCairo();
      data.start_time = `${date}T${form.start_time}:00`;
      data.due_date = date;
      data.due_time = form.due_time || form.start_time;
      if (form.end_time) data.end_time = `${date}T${form.end_time}:00`;
    } else if (form.due_date) {
      data.due_date = form.due_date;
      if (form.due_time) data.due_time = form.due_time;
    }

    onSubmit(data);
    setSuccess(true);
    setTimeout(() => {
      setSuccess(false);
      setForm({
        title: '', category: 'personal', priority: 'medium',
        due_date: getTodayCairo(), due_time: '', start_time: '', end_time: '', reminder_before: 15,
      });
      setErrors({});
    }, 300);
  };

  const handleClose = () => {
    setErrors({});
    setSuccess(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={handleClose}>
      {/* Backdrop — solid dark overlay */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/80"
      />
      {/* Modal — SOLID opaque bg, no backdrop-filter, high contrast text */}
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full sm:max-w-lg modal-solid rounded-t-3xl sm:rounded-2xl shadow-2xl border border-white/10 max-h-[90vh] overflow-hidden z-10"
        dir="rtl"
      >
        {/* Drag handle (mobile) */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Scrollable form content — leave room for sticky CTA */}
        <div className="p-5 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 88px)' }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Plus size={18} className="text-primary-400" />
              مهمة جديدة
            </h3>
            <button onClick={handleClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 active:scale-90">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-4">
            {/* Title — with validation error */}
            <div>
              <input
                value={form.title}
                onChange={e => { setForm({ ...form, title: e.target.value }); if (errors.title) setErrors(prev => ({ ...prev, title: undefined })); }}
                placeholder="عنوان المهمة..."
                className={`w-full rounded-xl px-4 py-3.5 text-base focus:outline-none transition-all ${
                  errors.title ? 'border-red-500 ring-2 ring-red-500/20' : ''
                }`}
                autoFocus
                maxLength={200}
              />
              {errors.title && (
                <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                  <AlertCircle size={11} /> {errors.title}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">📅 التاريخ</label>
                <input type="date" value={form.due_date}
                  onChange={e => setForm({ ...form, due_date: e.target.value })}
                  className="w-full rounded-xl px-4 py-3 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">⏰ الموعد النهائي</label>
                <input type="time" value={form.due_time}
                  onChange={e => setForm({ ...form, due_time: e.target.value })}
                  className="w-full rounded-xl px-4 py-3 focus:outline-none"
                  placeholder="اختياري" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">🕐 وقت البداية</label>
                <input type="time" value={form.start_time}
                  onChange={e => setForm({ ...form, start_time: e.target.value })}
                  className="w-full rounded-xl px-4 py-3 focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1.5 block font-medium">🏁 وقت النهاية</label>
                <input type="time" value={form.end_time}
                  onChange={e => { setForm({ ...form, end_time: e.target.value }); if (errors.end_time) setErrors(prev => ({ ...prev, end_time: undefined })); }}
                  className={`w-full rounded-xl px-4 py-3 focus:outline-none ${errors.end_time ? 'border-red-500 ring-2 ring-red-500/20' : ''}`} />
                {errors.end_time && (
                  <p className="text-xs text-red-400 mt-1 flex items-center gap-1">
                    <AlertCircle size={11} /> {errors.end_time}
                  </p>
                )}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">🔔 تذكير قبل</label>
              <div className="flex gap-2">
                {[5, 10, 15, 30, 60].map(min => (
                  <button key={min} onClick={() => setForm({ ...form, reminder_before: min })}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 min-h-[44px] ${
                      form.reminder_before === min
                        ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                        : 'bg-white/5 text-gray-400 hover:text-white'
                    }`}>
                    {min >= 60 ? `${min/60} س` : `${min} د`}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">⚡ الأولوية</label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(PRIORITIES).map(([key, p]) => (
                  <button key={key} onClick={() => setForm({ ...form, priority: key })}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 min-h-[44px] ${
                      form.priority === key ? `${p.bg} ${p.color} border border-current/30` : 'bg-white/5 text-gray-400'
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">📂 التصنيف</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(CATEGORIES).map(([key, c]) => (
                  <button key={key} onClick={() => setForm({ ...form, category: key })}
                    className={`py-2.5 rounded-xl text-xs transition-all active:scale-95 min-h-[44px] ${
                      form.category === key ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-white/5 text-gray-400'
                    }`}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky CTA at bottom — solid bg to prevent blur-through */}
        <div className="sticky bottom-0 p-5 pt-3 border-t border-white/5" style={{ background: 'inherit' }}>
          <button onClick={handleSubmit} disabled={isPending || !form.title.trim()}
            className={`w-full py-4 font-bold rounded-xl transition-all text-base active:scale-[0.98] shadow-lg min-h-[48px] ${
              success
                ? 'bg-green-500 text-white shadow-green-500/20'
                : 'bg-primary-500 hover:bg-primary-600 text-white shadow-primary-500/20 disabled:opacity-50'
            }`}>
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <RefreshCw size={16} className="animate-spin" /> جاري الإنشاء...
              </span>
            ) : success ? (
              <span className="flex items-center justify-center gap-2">
                <Check size={16} /> تم الإنشاء!
              </span>
            ) : (
              '✅ إضافة المهمة'
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main TasksView ─────────────────────────────────────────────────────────

export default function TasksView() {
  const [viewMode, setViewMode] = useState('today');
  const [showAdd, setShowAdd] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState({});
  const queryClient = useQueryClient();
  const { invalidateAll, recordAction } = useSyncStore();

  // Fetch from backend smart-view endpoint (all intelligence on backend)
  const { data, isLoading } = useQuery({
    queryKey: ['tasks-smart-view'],
    queryFn: () => taskAPI.getSmartView(),
    refetchInterval: 30000,
    select: (res) => {
      const d = res?.data?.data || res?.data || {};
      return {
        overdue: d.overdue || [],
        today: d.today || [],
        upcoming: d.upcoming || [],
        completed: d.completed || [],
        recommendedTaskId: d.recommendedTaskId || null,
        scores: d.scores || {},
        stats: d.stats || {},
      };
    },
  });

  // Log recommendation display when data loads
  useEffect(() => {
    if (data?.recommendedTaskId) {
      taskAPI.logSmartEvent('display', data.recommendedTaskId, data.scores?.[data.recommendedTaskId]).catch(() => {});
    }
  }, [data?.recommendedTaskId]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (d) => taskAPI.createTask(d),
    onSuccess: () => {
      invalidateAll();
      recordAction('task_created');
      toast.success('تم إنشاء المهمة ✅');
      setShowAdd(false);
    },
    onError: (e) => toast.error(e.message || 'فشل في الإنشاء'),
  });

  const completeMutation = useMutation({
    mutationFn: (id) => {
      // Log if completing recommended task
      if (data?.recommendedTaskId === id) {
        taskAPI.logSmartEvent('complete', id, data.scores?.[id]).catch(() => {});
      }
      return taskAPI.completeTask(id);
    },
    onSuccess: () => {
      invalidateAll();
      recordAction('task_completed');
      toast.success('أحسنت! 🎉');
    },
    onError: () => toast.error('فشل في إتمام المهمة'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => taskAPI.deleteTask(id),
    onSuccess: () => {
      invalidateAll();
      recordAction('task_deleted');
      toast.success('تم حذف المهمة');
    },
  });

  const handleComplete = useCallback((id) => completeMutation.mutate(id), [completeMutation]);
  const handleDelete = useCallback((id) => deleteMutation.mutate(id), [deleteMutation]);

  // Log recommendation click
  const handleRecommendClick = useCallback((id) => {
    if (data?.recommendedTaskId === id) {
      taskAPI.logSmartEvent('click', id, data.scores?.[id]).catch(() => {});
    }
  }, [data]);

  const toggleSection = useCallback((key) => {
    setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // Extract data from backend response and re-sort by time
  const overdueTasks = data?.overdue || [];
  const todayTasks = useMemo(() => sortTasksByTime(data?.today || []), [data?.today]);
  const upcomingTasks = data?.upcoming || [];
  const completedTasks = data?.completed || [];
  const recommendedId = data?.recommendedTaskId;
  const stats = data?.stats || {};

  // Mark overdue tasks for display
  const overdueWithFlag = useMemo(() =>
    overdueTasks.map(t => ({ ...t, _overdue: true })),
    [overdueTasks]
  );

  // Determine visible groups based on viewMode
  const showUpcoming = viewMode === 'all';
  const showCompleted = viewMode === 'all';

  const isEmpty = overdueTasks.length === 0 && todayTasks.length === 0 &&
    (!showUpcoming || upcomingTasks.length === 0);

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            📋 المهام
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {stats.today || 0} اليوم
            {stats.overdue > 0 && <span className="text-red-400 font-bold"> · {stats.overdue} متأخرة</span>}
            {stats.upcoming > 0 && <span> · {stats.upcoming} قادمة</span>}
            {' · '}{stats.completed || 0} مكتملة
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-bold rounded-xl transition-all text-sm active:scale-95 shadow-lg shadow-primary-500/20 flex-shrink-0 min-h-[44px]">
          <Plus size={16} />
          <span className="hidden sm:inline">مهمة جديدة</span>
          <span className="sm:hidden">جديد</span>
        </button>
      </div>

      {/* Today / All Toggle */}
      <div className="flex gap-1.5 p-1 bg-white/5 rounded-xl border border-white/5">
        {[
          { key: 'today', icon: <Sun size={14} />, label: 'اليوم' },
          { key: 'all', icon: <List size={14} />, label: 'كل المهام' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setViewMode(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold transition-all active:scale-95 min-h-[44px] ${
              viewMode === tab.key
                ? 'bg-primary-500/20 text-primary-400 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">

          {/* Overdue section */}
          {overdueWithFlag.length > 0 && (
            <div>
              <SectionHeader
                icon="⚠️"
                label="متأخرة"
                count={overdueWithFlag.length}
                color="text-red-400"
                collapsed={collapsedSections.overdue}
                onToggle={() => toggleSection('overdue')}
              />
              {!collapsedSections.overdue && (
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {overdueWithFlag.map(t => (
                      <TaskItem key={t.id} task={t}
                        isRecommended={recommendedId === t.id}
                        onComplete={handleComplete}
                        onDelete={handleDelete}
                        onRecommendClick={handleRecommendClick} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          {/* Today section */}
          <div>
            <SectionHeader
              icon="📅"
              label="اليوم"
              count={todayTasks.length}
              color="text-white"
              collapsed={collapsedSections.today}
              onToggle={() => toggleSection('today')}
            />
            {!collapsedSections.today && todayTasks.length > 0 && (
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {todayTasks.map(t => (
                    <TaskItem key={t.id} task={t}
                      isRecommended={recommendedId === t.id}
                      onComplete={handleComplete}
                      onDelete={handleDelete}
                      onRecommendClick={handleRecommendClick} />
                  ))}
                </AnimatePresence>
              </div>
            )}
            {!collapsedSections.today && todayTasks.length === 0 && overdueTasks.length === 0 && (
              <div className="text-center py-8">
                <div className="text-4xl mb-3">☀️</div>
                <p className="text-sm text-gray-400">لا توجد مهام لليوم</p>
                <button onClick={() => setShowAdd(true)}
                  className="mt-2 text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 mx-auto min-h-[44px]">
                  <Plus size={12} /> أضف مهمة
                </button>
              </div>
            )}
          </div>

          {/* Upcoming section (all mode only) */}
          {showUpcoming && upcomingTasks.length > 0 && (
            <div>
              <SectionHeader
                icon="🔜"
                label="قادمة"
                count={upcomingTasks.length}
                color="text-blue-400"
                collapsed={collapsedSections.upcoming}
                onToggle={() => toggleSection('upcoming')}
              />
              {!collapsedSections.upcoming && (
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {upcomingTasks.map(t => (
                      <TaskItem key={t.id} task={t}
                        isRecommended={false}
                        onComplete={handleComplete}
                        onDelete={handleDelete}
                        onRecommendClick={handleRecommendClick} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          {/* Completed section (all mode, collapsible) */}
          {showCompleted && completedTasks.length > 0 && (
            <div>
              <SectionHeader
                icon="✅"
                label="مكتملة"
                count={completedTasks.length}
                color="text-gray-500"
                collapsed={collapsedSections.completed !== false}
                onToggle={() => toggleSection('completed')}
              />
              {collapsedSections.completed === false && (
                <div className="space-y-2">
                  {completedTasks.slice(0, 10).map(t => (
                    <TaskItem key={t.id} task={t}
                      isRecommended={false}
                      onComplete={() => {}}
                      onDelete={handleDelete}
                      onRecommendClick={() => {}} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Global empty state */}
          {isEmpty && (
            <div className="text-center py-16">
              <div className="text-6xl mb-4">{viewMode === 'today' ? '☀️' : '📋'}</div>
              <h3 className="text-lg font-semibold text-gray-400 mb-2">
                {viewMode === 'today' ? 'يومك فاضي!' : 'لا توجد مهام'}
              </h3>
              <p className="text-sm text-gray-600 mb-4">أضف مهمة جديدة للبدء</p>
              <button onClick={() => setShowAdd(true)}
                className="px-6 py-3 bg-primary-500 text-white rounded-xl font-bold text-sm active:scale-95 shadow-lg shadow-primary-500/20 min-h-[48px]">
                <Plus size={16} className="inline ml-1" /> إضافة مهمة
              </button>
            </div>
          )}
        </div>
      )}

      {/* Add Task Modal */}
      <AnimatePresence>
        {showAdd && (
          <AddTaskModal isOpen={showAdd} onClose={() => setShowAdd(false)}
            onSubmit={d => createMutation.mutate(d)} isPending={createMutation.isPending} />
        )}
      </AnimatePresence>
    </div>
  );
}
