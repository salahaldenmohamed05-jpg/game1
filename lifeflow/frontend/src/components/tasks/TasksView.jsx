/**
 * TasksView v5 — Todo List + Samsung Reminder Hybrid (Phase 9.0)
 * ================================================================
 * RESTRUCTURED into 3 clear sections:
 *   1. OVERDUE (red banner) — tasks past their due date/time
 *   2. PENDING TODAY (white) — today's active tasks
 *   3. COMPLETED TODAY (green) — with timestamps "اكتمل الساعة 14:32"
 *
 * KEY GUARANTEES:
 * - Completed tasks NEVER disappear — persisted in localStorage as backup
 * - Timestamp format: "اكتمل الساعة HH:MM" (24h Cairo timezone)
 * - Real progress % = completed / total (overdue + pending + completed)
 * - Circular progress ring (Samsung style) with instant updates
 * - Quick-add bar with keyboard-safe layout
 * - Smart split, edit, delete actions
 * - Category filter chips
 * - "All Tasks" view with upcoming + full completed history
 * - Mobile-first, RTL, 44px touch targets
 */

import { useState, useMemo, useCallback, memo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, CheckCircle, Clock, Trash2, X, ChevronDown,
  AlertCircle, Calendar, Check, Sun, List, Filter,
  Sparkles, Zap, ArrowRight, Edit3, Star, RefreshCw,
  Scissors, TrendingUp, Bell, CircleDot
} from 'lucide-react';
import { taskAPI } from '../../utils/api';
import useSyncStore from '../../store/syncStore';
import toast from 'react-hot-toast';

// ─── Completed Tasks Persistence (localStorage backup) ──────────────────────
const COMPLETED_STORAGE_KEY = 'lifeflow_completed_tasks_today';

function persistCompletedTasks(tasks) {
  try {
    const todayKey = getTodayCairo();
    const data = { date: todayKey, tasks: tasks.map(t => ({ id: t.id, title: t.title, completed_at: t.completed_at || t.completedAt, category: t.category, priority: t.priority })) };
    localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(data));
  } catch {}
}

function getPersistedCompletedTasks() {
  try {
    const raw = localStorage.getItem(COMPLETED_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (data.date !== getTodayCairo()) return [];
    return data.tasks || [];
  } catch { return []; }
}

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
    const m = String(task.due_time).match(/^(\d{1,2}:\d{2})/);
    return m ? m[1] : null;
  }
  return null;
}

function getTaskEndTime(task) {
  if (task.end_time) return toCairoTime(task.end_time);
  return null;
}

function timeToMinutes(timeStr) {
  if (!timeStr) return Infinity;
  const m = String(timeStr).match(/^(\d{1,2}):(\d{2})/);
  if (!m) return Infinity;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

const PRIORITY_ORDER = { urgent: 0, high: 1, medium: 2, low: 3 };

function sortTasksByTime(tasks) {
  return [...tasks].sort((a, b) => {
    const ta = timeToMinutes(getTaskTime(a));
    const tb = timeToMinutes(getTaskTime(b));
    if (ta !== tb) return ta - tb;
    const pa = PRIORITY_ORDER[a.priority] ?? 3;
    const pb = PRIORITY_ORDER[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
}

// ─── Circular Progress Ring (Samsung Reminder Style) ────────────────────────

function CircularProgress({ completed, total, overdue }) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (pct / 100) * circumference;
  const color = pct >= 80 ? '#22C55E' : pct >= 50 ? '#6C63FF' : pct >= 20 ? '#EAB308' : '#6B7280';
  const remaining = total - completed;

  return (
    <div className="bg-white/5 border border-white/5 rounded-2xl p-4 flex items-center gap-4">
      {/* SVG Ring */}
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" />
          <motion.circle
            cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="8"
            strokeLinecap="round" strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-white">{pct}%</span>
        </div>
      </div>
      {/* Stats */}
      <div className="flex-1 min-w-0">
        <p className="text-base font-bold text-white mb-1">تقدم اليوم</p>
        <p className="text-lg font-black" style={{ color }}>
          {completed} / {total}
        </p>
        <p className="text-xs text-gray-500 mt-0.5">
          {remaining > 0 ? `${remaining} متبقية` : 'تم إنجاز الكل! 🎉'}
        </p>
        {overdue > 0 && (
          <p className="text-xs text-red-400 font-bold mt-0.5">
            ⚠️ {overdue} متأخرة
          </p>
        )}
        {/* Mini progress bar */}
        <div className="h-1.5 bg-white/5 rounded-full overflow-hidden mt-2">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full"
            style={{ backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Inline Subtasks Component ───────────────────────────────────────────────

function InlineSubtasks({ taskId }) {
  const [expanded, setExpanded] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const queryClient = useQueryClient();

  const { data: subtaskData, isLoading } = useQuery({
    queryKey: ['subtasks', taskId],
    queryFn: () => taskAPI.getSubtasks(taskId),
    enabled: expanded,
    select: (res) => {
      const d = res?.data?.data || {};
      return { subtasks: d.subtasks || [], stats: d.stats || {} };
    },
  });

  const completeMutation = useMutation({
    mutationFn: (subtaskId) => taskAPI.completeSubtask(taskId, subtaskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] });
      queryClient.invalidateQueries({ queryKey: ['tasks-smart-view'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-all'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('تم إكمال الخطوة');
    },
  });

  const createMutation = useMutation({
    mutationFn: (data) => taskAPI.createSubtask(taskId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] });
      setNewTitle('');
      setShowAdd(false);
      toast.success('تمت إضافة خطوة');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (subtaskId) => taskAPI.deleteSubtask(taskId, subtaskId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subtasks', taskId] });
    },
  });

  const handleAddSubtask = () => {
    if (!newTitle.trim()) return;
    createMutation.mutate({ title: newTitle.trim() });
  };

  const subtasks = subtaskData?.subtasks || [];
  const stats = subtaskData?.stats || {};

  return (
    <div className="mt-2 mr-12">
      {/* Toggle / summary row */}
      <button onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-[11px] text-gray-400 hover:text-primary-400 transition-colors py-1">
        <ChevronDown size={11} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        <span>الخطوات</span>
        {stats.total > 0 && (
          <span className="text-[10px] bg-primary-500/10 text-primary-400 px-1.5 py-0.5 rounded-full font-bold">
            {stats.completed}/{stats.total}
          </span>
        )}
        {stats.completion_pct > 0 && stats.completion_pct < 100 && (
          <div className="w-12 h-1 bg-white/10 rounded-full overflow-hidden ml-1">
            <div className="h-full bg-primary-500 rounded-full" style={{ width: `${stats.completion_pct}%` }} />
          </div>
        )}
        {stats.completion_pct === 100 && (
          <span className="text-[9px] text-green-400">✅ مكتمل</span>
        )}
      </button>

      {/* Expanded subtasks */}
      {expanded && (
        <div className="space-y-1 mt-1">
          {isLoading ? (
            <div className="py-2"><div className="h-3 w-24 bg-white/5 rounded animate-pulse" /></div>
          ) : (
            <>
              {subtasks.map(st => (
                <div key={st.id} className="flex items-center gap-2 py-1 group">
                  <button
                    onClick={() => !st.completed && completeMutation.mutate(st.id)}
                    disabled={st.completed}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                      st.completed ? 'bg-green-500 border-green-500' : 'border-gray-600 hover:border-primary-400'
                    }`}
                  >
                    {st.completed && <Check size={10} className="text-white" strokeWidth={3} />}
                  </button>
                  <span className={`text-xs flex-1 ${st.completed ? 'line-through text-gray-500' : 'text-gray-300'}`}>
                    {st.title}
                  </span>
                  {st.estimated_time && (
                    <span className="text-[9px] text-gray-600">{st.estimated_time}د</span>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(st.id)}
                    className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 p-0.5 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}

              {/* Add new subtask */}
              {showAdd ? (
                <div className="flex items-center gap-1.5 mt-1">
                  <input
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddSubtask()}
                    placeholder="خطوة جديدة..."
                    className="flex-1 bg-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-primary-500/30"
                    autoFocus
                  />
                  <button onClick={handleAddSubtask} disabled={!newTitle.trim() || createMutation.isPending}
                    className="text-primary-400 hover:text-primary-300 p-1">
                    <Check size={14} />
                  </button>
                  <button onClick={() => { setShowAdd(false); setNewTitle(''); }}
                    className="text-gray-500 hover:text-gray-300 p-1">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1 text-[11px] text-gray-500 hover:text-primary-400 transition-colors py-1 mt-0.5">
                  <Plus size={10} /> إضافة خطوة
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Task Card (Samsung Reminder + Todo hybrid) ─────────────────────────────

const TaskCard = memo(function TaskCard({ task, onComplete, onDelete, onEdit, onSplit, isRecommended, showTimestamp }) {
  const time = getTaskTime(task);
  const endTime = getTaskEndTime(task);
  const pri = PRIORITIES[task.priority] || PRIORITIES.medium;
  const cat = CATEGORIES[task.category] || CATEGORIES.other;
  const isDone = task.status === 'completed';
  const isOverdue = task._overdue;
  
  // Format completion timestamp as "اكتمل الساعة HH:MM"
  const completedAt = useMemo(() => {
    if (!isDone) return null;
    const raw = task.completed_at || task.completedAt;
    if (!raw) return null;
    const t = toCairoTime(raw);
    return t ? `اكتمل الساعة ${t}` : null;
  }, [isDone, task.completed_at, task.completedAt]);
  
  const hasReminder = task.reminder_before && task.reminder_before > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -60, height: 0, marginBottom: 0, overflow: 'hidden' }}
      transition={{ duration: 0.25 }}
      className={[
        'rounded-2xl transition-all relative overflow-hidden',
        isDone
          ? 'bg-green-500/5 border border-green-500/10'
          : isOverdue
          ? 'bg-red-500/8 border border-red-500/20'
          : isRecommended
          ? 'bg-gradient-to-br from-primary-500/8 to-purple-500/5 border border-primary-500/20'
          : 'bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.06]',
      ].join(' ')}
    >
      {/* Priority left stripe */}
      <div className="absolute top-0 right-0 w-1 h-full rounded-r-full" style={{ backgroundColor: pri.dot, opacity: isDone ? 0.3 : 0.8 }} />

      <div className="flex items-start gap-3 p-3.5 sm:p-4 pr-5">
        {/* Checkbox */}
        <button
          onClick={() => !isDone && onComplete(task.id)}
          disabled={isDone}
          className={[
            'flex-shrink-0 w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all active:scale-90 mt-0.5',
            isDone
              ? 'bg-green-500 border-green-500'
              : isOverdue
              ? 'border-red-400 hover:bg-red-500/10'
              : 'border-gray-600 hover:border-primary-400 hover:bg-primary-500/10',
          ].join(' ')}
          aria-label={isDone ? 'مكتملة' : 'إكمال المهمة'}
        >
          {isDone && <Check size={15} className="text-white" strokeWidth={3} />}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-sm font-semibold leading-snug ${isDone ? 'line-through text-gray-500' : 'text-white'}`}>
              {task.title}
            </p>
            {/* AI badge */}
            {isRecommended && !isDone && (
              <span className="flex items-center gap-0.5 bg-primary-500/20 text-primary-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0">
                <Sparkles size={8} /> ذكي
              </span>
            )}
          </div>

          {/* Time + meta row */}
          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
            {/* Time block (Samsung style) */}
            {time && (
              <span className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${
                isDone ? 'text-gray-500 bg-white/5' : 'text-blue-400 bg-blue-500/10'
              }`}>
                <Clock size={10} />
                {time}
                {endTime && <span className="opacity-70"> - {endTime}</span>}
              </span>
            )}

            {/* Priority chip */}
            <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${isDone ? 'bg-white/5 text-gray-500' : `${pri.bg} ${pri.color}`}`}>
              {pri.label}
            </span>

            {/* Category */}
            <span className="text-xs text-gray-500">{cat.emoji} {cat.label}</span>

            {/* Reminder indicator */}
            {hasReminder && !isDone && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-md">
                <Bell size={8} /> {task.reminder_before}د
              </span>
            )}

            {/* Overdue */}
            {isOverdue && !isDone && (
              <span className="flex items-center gap-0.5 text-[10px] text-red-400 font-bold bg-red-500/10 px-1.5 py-0.5 rounded-md">
                <AlertCircle size={9} /> متأخرة
              </span>
            )}

            {/* Completion timestamp — KEY FIX: "اكتمل الساعة 14:32" */}
            {isDone && showTimestamp && completedAt && (
              <span className="flex items-center gap-1 text-[10px] text-green-400/80 bg-green-500/10 px-2 py-0.5 rounded-md">
                <Check size={8} /> {completedAt}
              </span>
            )}

            {/* Due date */}
            {task.due_date && !isDone && !time && (
              <span className="text-[10px] text-gray-500 flex items-center gap-0.5">
                <Calendar size={8} /> {toCairoDate(task.due_date)}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-0.5 flex-shrink-0">
          {!isDone && onSplit && (
            <button onClick={(e) => { e.stopPropagation(); onSplit(task); }}
              className="w-9 h-9 rounded-lg text-gray-600 hover:text-purple-400 hover:bg-purple-500/10 transition-all flex items-center justify-center active:scale-90"
              title="تقسيم ذكي">
              <Scissors size={14} />
            </button>
          )}
          {!isDone && (
            <button onClick={(e) => { e.stopPropagation(); onEdit?.(task); }}
              className="w-9 h-9 rounded-lg text-gray-600 hover:text-primary-400 hover:bg-primary-500/10 transition-all flex items-center justify-center active:scale-90">
              <Edit3 size={14} />
            </button>
          )}
          <button onClick={() => onDelete(task.id)}
            className="w-9 h-9 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center active:scale-90">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Inline subtasks — visible for non-completed tasks */}
      {!isDone && <InlineSubtasks taskId={task.id} />}
    </motion.div>
  );
});

// ─── Section Header ─────────────────────────────────────────────────────────

const SectionHeader = memo(function SectionHeader({ icon, label, count, color = 'text-gray-400', collapsed, onToggle, badge }) {
  return (
    <button onClick={onToggle} className="flex items-center gap-2 py-2 px-1 w-full text-right group">
      <span className={`text-base ${color}`}>{icon}</span>
      <span className={`text-sm font-bold ${color}`}>{label}</span>
      <span className="text-[10px] bg-white/5 px-2 py-0.5 rounded-full text-gray-500 font-bold">{count}</span>
      {badge && (
        <span className={`text-[9px] px-1.5 py-0.5 rounded-md font-bold ${badge.color}`}>{badge.text}</span>
      )}
      <ChevronDown size={13} className={`text-gray-500 mr-auto transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} />
    </button>
  );
});

// ─── Quick Add Bar (Samsung style inline add) — keyboard-safe ───────────────

function QuickAddBar({ onAdd, isPending }) {
  const [title, setTitle] = useState('');

  const handleSubmit = () => {
    if (!title.trim()) return;
    onAdd({ title: title.trim(), category: 'personal', priority: 'medium', due_date: getTodayCairo() });
    setTitle('');
  };

  return (
    <div className="flex items-center gap-2 bg-white/[0.04] border border-white/[0.06] rounded-2xl px-3 py-2 keyboard-safe-input">
      <Plus size={18} className="text-primary-400 flex-shrink-0" />
      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        placeholder="أضف مهمة سريعة..."
        className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none min-h-[36px]"
        dir="rtl"
      />
      {title.trim() && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          onClick={handleSubmit}
          disabled={isPending}
          className="w-9 h-9 rounded-xl bg-primary-500 text-white flex items-center justify-center active:scale-90 flex-shrink-0"
        >
          {isPending ? <RefreshCw size={14} className="animate-spin" /> : <ArrowRight size={14} className="rotate-180" />}
        </motion.button>
      )}
    </div>
  );
}

// ─── Smart Task Split Modal ─────────────────────────────────────────────────

function SmartSplitModal({ isOpen, onClose, task, onSplit }) {
  const [subtasks, setSubtasks] = useState(['', '', '']);

  useEffect(() => {
    if (isOpen && task) {
      setSubtasks([
        `تحضير وتجهيز: ${task.title}`,
        `تنفيذ: ${task.title}`,
        `مراجعة وإنهاء: ${task.title}`,
      ]);
    }
  }, [isOpen, task]);

  const handleSubmit = () => {
    const valid = subtasks.filter(s => s.trim());
    if (valid.length < 2) { toast.error('أضف على الأقل مهمتين فرعيتين'); return; }
    onSplit(task, valid);
    onClose();
  };

  if (!isOpen || !task) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80" />
      <motion.div
        initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full sm:max-w-lg modal-solid rounded-t-3xl sm:rounded-2xl shadow-2xl border border-white/10 max-h-[85vh] overflow-hidden z-10 mb-[76px] sm:mb-0" dir="rtl"
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
        <div className="p-5 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 88px)' }}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Scissors size={18} className="text-primary-400" /> تقسيم ذكي
            </h3>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-400"><X size={18} /></button>
          </div>
          <div className="bg-white/5 rounded-xl p-3 mb-4 border border-white/5">
            <p className="text-xs text-gray-500 mb-1">المهمة الأصلية:</p>
            <p className="text-sm font-bold text-white">{task.title}</p>
          </div>
          <p className="text-xs text-gray-400 mb-3">قسّم المهمة لخطوات أصغر وأوضح:</p>
          <div className="space-y-2">
            {subtasks.map((st, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 w-6 text-center font-bold">{idx + 1}</span>
                <input value={st} onChange={e => setSubtasks(prev => prev.map((s, i) => i === idx ? e.target.value : s))}
                  placeholder={`خطوة ${idx + 1}...`} className="flex-1 rounded-xl px-4 py-3 text-sm focus:outline-none" />
                {subtasks.length > 2 && (
                  <button onClick={() => setSubtasks(prev => prev.filter((_, i) => i !== idx))} className="p-2 text-gray-600 hover:text-red-400"><X size={14} /></button>
                )}
              </div>
            ))}
          </div>
          <button onClick={() => setSubtasks(prev => [...prev, ''])} className="mt-2 text-xs text-primary-400 flex items-center gap-1 hover:text-primary-300">
            <Plus size={12} /> إضافة خطوة
          </button>
        </div>
        <div className="sticky bottom-0 p-5 pt-3 border-t border-white/5" style={{ background: 'inherit' }}>
          <button onClick={handleSubmit}
            className="w-full py-4 font-bold rounded-xl text-base active:scale-[0.98] shadow-lg min-h-[48px] bg-primary-500 hover:bg-primary-600 text-white shadow-primary-500/20">
            <Scissors size={16} className="inline ml-2" /> قسّم المهمة
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Add Task Modal ─────────────────────────────────────────────────────────

function AddTaskModal({ isOpen, onClose, onSubmit, isPending }) {
  const [form, setForm] = useState({
    title: '', category: 'personal', priority: 'medium',
    due_date: getTodayCairo(), due_time: '', start_time: '', end_time: '', reminder_before: 15,
  });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'أدخل عنوان المهمة';
    if (form.start_time && form.end_time && form.start_time >= form.end_time) errs.end_time = 'وقت النهاية بعد البداية';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    const data = { title: form.title.trim(), category: form.category, priority: form.priority, reminder_before: form.reminder_before };
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
    setForm({ title: '', category: 'personal', priority: 'medium', due_date: getTodayCairo(), due_time: '', start_time: '', end_time: '', reminder_before: 15 });
    setErrors({});
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={() => { setErrors({}); onClose(); }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80" />
      <motion.div
        initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full sm:max-w-lg modal-solid rounded-t-3xl sm:rounded-2xl shadow-2xl border border-white/10 max-h-[85vh] sm:max-h-[90vh] overflow-hidden z-10 mb-[76px] sm:mb-0" dir="rtl"
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
        <div className="p-5 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 88px)' }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-black text-white flex items-center gap-2"><Plus size={18} className="text-primary-400" /> مهمة جديدة</h3>
            <button onClick={() => { setErrors({}); onClose(); }} className="p-2 rounded-xl hover:bg-white/10 text-gray-400"><X size={18} /></button>
          </div>
          <div className="space-y-4">
            <div>
              <input value={form.title} onChange={e => { setForm({ ...form, title: e.target.value }); setErrors({}); }}
                placeholder="عنوان المهمة..." className={`w-full rounded-xl px-4 py-3.5 text-base focus:outline-none ${errors.title ? 'border-red-500 ring-2 ring-red-500/20' : ''}`} autoFocus maxLength={200} />
              {errors.title && <p className="text-xs text-red-400 mt-1"><AlertCircle size={11} className="inline" /> {errors.title}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-gray-400 mb-1.5 block">التاريخ</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full rounded-xl px-4 py-3 focus:outline-none" /></div>
              <div><label className="text-xs text-gray-400 mb-1.5 block">الموعد</label><input type="time" value={form.due_time} onChange={e => setForm({ ...form, due_time: e.target.value })} className="w-full rounded-xl px-4 py-3 focus:outline-none" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-gray-400 mb-1.5 block">البداية</label><input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="w-full rounded-xl px-4 py-3 focus:outline-none" /></div>
              <div><label className="text-xs text-gray-400 mb-1.5 block">النهاية</label>
                <input type="time" value={form.end_time} onChange={e => { setForm({ ...form, end_time: e.target.value }); setErrors({}); }}
                  className={`w-full rounded-xl px-4 py-3 focus:outline-none ${errors.end_time ? 'border-red-500 ring-2 ring-red-500/20' : ''}`} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">تذكير قبل</label>
              <div className="flex gap-2">
                {[5, 10, 15, 30, 60].map(min => (
                  <button key={min} onClick={() => setForm({ ...form, reminder_before: min })}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-bold min-h-[44px] ${form.reminder_before === min ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-white/5 text-gray-400'}`}>
                    {min >= 60 ? `${min/60} س` : `${min} د`}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">الأولوية</label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(PRIORITIES).map(([key, p]) => (
                  <button key={key} onClick={() => setForm({ ...form, priority: key })}
                    className={`py-2.5 rounded-xl text-xs font-bold min-h-[44px] ${form.priority === key ? `${p.bg} ${p.color} border border-current/30` : 'bg-white/5 text-gray-400'}`}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">التصنيف</label>
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(CATEGORIES).map(([key, c]) => (
                  <button key={key} onClick={() => setForm({ ...form, category: key })}
                    className={`py-2.5 rounded-xl text-xs min-h-[44px] ${form.category === key ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-white/5 text-gray-400'}`}>
                    {c.emoji} {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 p-5 pt-3 border-t border-white/5" style={{ background: 'inherit' }}>
          <button onClick={handleSubmit} disabled={isPending || !form.title.trim()}
            className="w-full py-4 font-bold rounded-xl text-base active:scale-[0.98] shadow-lg min-h-[48px] bg-primary-500 hover:bg-primary-600 text-white shadow-primary-500/20 disabled:opacity-50">
            {isPending ? <span className="flex items-center justify-center gap-2"><RefreshCw size={16} className="animate-spin" /> جاري الإنشاء...</span> : 'إضافة المهمة'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Edit Task Modal ────────────────────────────────────────────────────────

function EditTaskModal({ isOpen, onClose, task, onSubmit, isPending }) {
  const [form, setForm] = useState({ title: '', category: 'personal', priority: 'medium', due_date: '', due_time: '', start_time: '', end_time: '' });
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (task && isOpen) {
      setForm({
        title: task.title || '', category: task.category || 'personal', priority: task.priority || 'medium',
        due_date: task.due_date ? new Date(task.due_date).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' }) : '',
        due_time: task.due_time || '', start_time: task.start_time ? toCairoTime(task.start_time) || '' : '', end_time: task.end_time ? toCairoTime(task.end_time) || '' : '',
      });
      setErrors({});
    }
  }, [task, isOpen]);

  const handleSubmit = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'ادخل عنوان المهمة';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;
    const data = { title: form.title.trim(), category: form.category, priority: form.priority };
    if (form.start_time) {
      const date = form.due_date || getTodayCairo();
      data.start_time = `${date}T${form.start_time}:00`; data.due_date = date;
      if (form.end_time) data.end_time = `${date}T${form.end_time}:00`;
    } else if (form.due_date) { data.due_date = form.due_date; if (form.due_time) data.due_time = form.due_time; }
    onSubmit(task.id, data);
  };

  if (!isOpen || !task) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center" onClick={onClose}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80" />
      <motion.div
        initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full sm:max-w-lg modal-solid rounded-t-3xl sm:rounded-2xl shadow-2xl border border-white/10 max-h-[85vh] overflow-hidden z-10 mb-[76px] sm:mb-0" dir="rtl"
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
        <div className="p-5 overflow-y-auto" style={{ maxHeight: 'calc(85vh - 88px)' }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-black text-white flex items-center gap-2"><Edit3 size={18} className="text-primary-400" /> تعديل المهمة</h3>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-400"><X size={18} /></button>
          </div>
          <div className="space-y-4">
            <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="عنوان المهمة..." className={`w-full rounded-xl px-4 py-3.5 text-base focus:outline-none ${errors.title ? 'border-red-500 ring-2 ring-red-500/20' : ''}`} autoFocus />
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-gray-400 mb-1.5 block">التاريخ</label><input type="date" value={form.due_date} onChange={e => setForm({ ...form, due_date: e.target.value })} className="w-full rounded-xl px-4 py-3 focus:outline-none" /></div>
              <div><label className="text-xs text-gray-400 mb-1.5 block">الموعد</label><input type="time" value={form.due_time} onChange={e => setForm({ ...form, due_time: e.target.value })} className="w-full rounded-xl px-4 py-3 focus:outline-none" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="text-xs text-gray-400 mb-1.5 block">البداية</label><input type="time" value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} className="w-full rounded-xl px-4 py-3 focus:outline-none" /></div>
              <div><label className="text-xs text-gray-400 mb-1.5 block">النهاية</label><input type="time" value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} className="w-full rounded-xl px-4 py-3 focus:outline-none" /></div>
            </div>
            <div><label className="text-xs text-gray-400 mb-1.5 block">الأولوية</label>
              <div className="grid grid-cols-4 gap-2">{Object.entries(PRIORITIES).map(([key, p]) => (
                <button key={key} onClick={() => setForm({ ...form, priority: key })} className={`py-2.5 rounded-xl text-xs font-bold min-h-[44px] ${form.priority === key ? `${p.bg} ${p.color}` : 'bg-white/5 text-gray-400'}`}>{p.label}</button>
              ))}</div>
            </div>
            <div><label className="text-xs text-gray-400 mb-1.5 block">التصنيف</label>
              <div className="grid grid-cols-3 gap-2">{Object.entries(CATEGORIES).map(([key, c]) => (
                <button key={key} onClick={() => setForm({ ...form, category: key })} className={`py-2.5 rounded-xl text-xs min-h-[44px] ${form.category === key ? 'bg-primary-500/20 text-primary-400' : 'bg-white/5 text-gray-400'}`}>{c.emoji} {c.label}</button>
              ))}</div>
            </div>
          </div>
        </div>
        <div className="sticky bottom-0 p-5 pt-3 border-t border-white/5" style={{ background: 'inherit' }}>
          <button onClick={handleSubmit} disabled={isPending || !form.title.trim()}
            className="w-full py-4 font-bold rounded-xl text-base active:scale-[0.98] shadow-lg min-h-[48px] bg-primary-500 hover:bg-primary-600 text-white shadow-primary-500/20 disabled:opacity-50">
            {isPending ? <span className="flex items-center justify-center gap-2"><RefreshCw size={16} className="animate-spin" /> جاري الحفظ...</span> : 'حفظ التعديلات'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// MAIN TasksView v4
// ═════════════════════════════════════════════════════════════════════════════

export default function TasksView() {
  const [viewMode, setViewMode] = useState('today');
  const [showAdd, setShowAdd] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [splittingTask, setSplittingTask] = useState(null);
  const [collapsedSections, setCollapsedSections] = useState({});
  const [categoryFilter, setCategoryFilter] = useState(null);
  const queryClient = useQueryClient();
  const { invalidateAll, recordAction } = useSyncStore();

  // Smart view for "Today" mode
  const { data, isLoading } = useQuery({
    queryKey: ['tasks-smart-view'],
    queryFn: () => taskAPI.getSmartView(),
    refetchInterval: 30000,
    select: (res) => {
      const d = res?.data?.data || res?.data || {};
      return {
        overdue: d.overdue || [], today: d.today || [], upcoming: d.upcoming || [],
        completed: d.completed || [], recommendedTaskId: d.recommendedTaskId || null,
        scores: d.scores || {}, stats: d.stats || {},
      };
    },
  });

  // "All Tasks" query for All view — Phase 13.1
  const { data: allData, isLoading: allLoading } = useQuery({
    queryKey: ['tasks-all'],
    queryFn: () => taskAPI.getAllTasks(),
    refetchInterval: 60000,
    enabled: viewMode === 'all',
    select: (res) => {
      const d = res?.data?.data || res?.data || {};
      return {
        overdue: d.overdue || [], today: d.today || [], upcoming: d.upcoming || [],
        noDueDate: d.no_due_date || [], completed: d.completed || [], stats: d.stats || {},
      };
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (d) => taskAPI.createTask(d),
    onSuccess: () => { invalidateAll(); recordAction('task_created'); toast.success('تم إنشاء المهمة'); setShowAdd(false); },
    onError: (e) => toast.error(e.message || 'فشل في الإنشاء'),
  });

  const completeMutation = useMutation({
    mutationFn: (id) => taskAPI.completeTask(id),
    onSuccess: () => { invalidateAll(); recordAction('task_completed'); toast.success('أحسنت! 🎉'); },
    onError: () => toast.error('فشل في إتمام المهمة'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => taskAPI.deleteTask(id),
    onSuccess: () => { invalidateAll(); recordAction('task_deleted'); toast.success('تم حذف المهمة'); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => taskAPI.updateTask(id, data),
    onSuccess: () => { invalidateAll(); recordAction('task_updated'); toast.success('تم تعديل المهمة'); setEditingTask(null); },
    onError: (e) => toast.error(e.message || 'فشل في التعديل'),
  });

  const handleComplete = useCallback((id) => completeMutation.mutate(id), [completeMutation]);
  const handleDelete = useCallback((id) => { if (window.confirm('هل أنت متأكد من حذف هذه المهمة؟')) deleteMutation.mutate(id); }, [deleteMutation]);
  const handleEdit = useCallback((task) => setEditingTask(task), []);
  const handleUpdate = useCallback((id, data) => updateMutation.mutate({ id, data }), [updateMutation]);

  // Smart task split — creates REAL subtasks (not separate tasks)
  const handleSplitTask = useCallback(async (task, subtaskTitles) => {
    try {
      for (const title of subtaskTitles) {
        await taskAPI.createSubtask(task.id, { title });
      }
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: ['subtasks', task.id] });
      toast.success(`تم تقسيم المهمة إلى ${subtaskTitles.length} خطوات`);
    } catch { toast.error('فشل في تقسيم المهمة'); }
  }, [invalidateAll, queryClient]);

  const toggleSection = useCallback((key) => setCollapsedSections(prev => ({ ...prev, [key]: !prev[key] })), []);

  // ══════════════════════════════════════════════════════════════════════════
  // DATA PROCESSING — COMPLETED TASKS NEVER DISAPPEAR
  // Backend puts completed tasks in `completed[]` array, NOT in `today[]`.
  // We merge from BOTH arrays + localStorage backup to guarantee persistence.
  // ══════════════════════════════════════════════════════════════════════════
  const overdueTasks = data?.overdue || [];
  const allTodayTasks = data?.today || [];
  const completedArray = data?.completed || [];
  const todayCairo = getTodayCairo();

  // 1. Pending tasks from today
  const todayPending = useMemo(() => {
    let tasks = allTodayTasks.filter(t => t.status !== 'completed');
    if (categoryFilter) tasks = tasks.filter(t => t.category === categoryFilter);
    return sortTasksByTime(tasks);
  }, [allTodayTasks, categoryFilter]);

  // 2. Completed today: from today[] + completed[] + localStorage backup
  //    GUARANTEE: completed tasks NEVER disappear
  const todayCompleted = useMemo(() => {
    const fromToday = allTodayTasks.filter(t => t.status === 'completed');
    const fromCompletedArr = completedArray.filter(t => {
      if (!t.completed_at) return false;
      try {
        const d = new Date(t.completed_at).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
        return d === todayCairo;
      } catch { return false; }
    });
    // Also include persisted tasks from localStorage as backup
    const persisted = getPersistedCompletedTasks();
    
    // Deduplicate by ID — merge all sources
    const seen = new Set();
    const merged = [];
    const addTask = (t) => {
      const id = String(t.id);
      if (!seen.has(id)) { merged.push(t); seen.add(id); }
    };
    fromToday.forEach(addTask);
    fromCompletedArr.forEach(addTask);
    // Persisted tasks as fallback (only if not already present)
    persisted.forEach(t => {
      if (!seen.has(String(t.id))) {
        merged.push({ ...t, status: 'completed' });
        seen.add(String(t.id));
      }
    });
    
    // Sort by completion time (most recent first)
    const sorted = merged.sort((a, b) => {
      const ta = new Date(a.completed_at || a.completedAt || 0).getTime();
      const tb = new Date(b.completed_at || b.completedAt || 0).getTime();
      return tb - ta;
    });
    
    // Persist to localStorage for backup
    if (sorted.length > 0) persistCompletedTasks(sorted);
    
    return sorted;
  }, [allTodayTasks, completedArray, todayCairo]);

  const upcomingTasks = data?.upcoming || [];
  const allCompleted = useMemo(() => {
    const todayIds = new Set(todayCompleted.map(t => t.id));
    return completedArray.filter(t => !todayIds.has(t.id));
  }, [completedArray, todayCompleted]);

  const recommendedId = data?.recommendedTaskId;
  const actualCompletedToday = todayCompleted.length;
  const totalTodayTasks = todayPending.length + todayCompleted.length;
  const overdueWithFlag = useMemo(() => overdueTasks.map(t => ({ ...t, _overdue: true })), [overdueTasks]);

  // Category counts for filter chips
  const categoryCounts = useMemo(() => {
    const counts = {};
    allTodayTasks.filter(t => t.status !== 'completed').forEach(t => {
      const cat = t.category || 'other';
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [allTodayTasks]);

  const hasCategories = Object.keys(categoryCounts).length > 1;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4" dir="rtl">

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-black text-white">المهام</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {todayPending.length > 0 && <span>{todayPending.length} نشطة</span>}
            {actualCompletedToday > 0 && <span className="text-green-400"> · {actualCompletedToday} مكتملة</span>}
            {overdueTasks.length > 0 && <span className="text-red-400 font-bold"> · {overdueTasks.length} متأخرة</span>}
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-bold rounded-xl text-sm active:scale-95 shadow-lg shadow-primary-500/20 flex-shrink-0 min-h-[44px]">
          <Plus size={16} /> جديد
        </button>
      </div>

      {/* ── Circular Progress (Samsung style) ───────────────────── */}
      {(totalTodayTasks > 0 || overdueTasks.length > 0) && (
        <CircularProgress 
          completed={actualCompletedToday} 
          total={totalTodayTasks + overdueTasks.length} 
          overdue={overdueTasks.length}
        />
      )}

      {/* ── Quick Add Bar ───────────────────────────────────────── */}
      <QuickAddBar onAdd={d => createMutation.mutate(d)} isPending={createMutation.isPending} />

      {/* ── View Toggle ─────────────────────────────────────────── */}
      <div className="flex gap-1.5 p-1 bg-white/5 rounded-xl border border-white/5">
        {[
          { key: 'today', icon: <Sun size={14} />, label: 'اليوم' },
          { key: 'all', icon: <List size={14} />, label: 'كل المهام' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setViewMode(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold min-h-[44px] transition-all ${
              viewMode === tab.key ? 'bg-primary-500/20 text-primary-400' : 'text-gray-400 hover:text-white'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* ── Category Filter Chips ──────────────────────────────── */}
      {hasCategories && viewMode === 'today' && (
        <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          <button
            onClick={() => setCategoryFilter(null)}
            className={`flex-shrink-0 text-[11px] px-3 py-1.5 rounded-full font-medium transition-all ${
              !categoryFilter ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-white/5 text-gray-400'
            }`}
          >
            الكل
          </button>
          {Object.entries(categoryCounts).map(([cat, count]) => {
            const c = CATEGORIES[cat] || CATEGORIES.other;
            return (
              <button key={cat}
                onClick={() => setCategoryFilter(categoryFilter === cat ? null : cat)}
                className={`flex-shrink-0 text-[11px] px-3 py-1.5 rounded-full font-medium transition-all whitespace-nowrap ${
                  categoryFilter === cat ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-white/5 text-gray-400'
                }`}
              >
                {c.emoji} {c.label} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* ── Task Lists ──────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-3">

          {/* SECTION 1: Overdue Tasks (RED) */}
          {overdueWithFlag.length > 0 && (
            <div>
              <SectionHeader icon="⚠️" label="متأخرة" count={overdueWithFlag.length} color="text-red-400"
                collapsed={collapsedSections.overdue} onToggle={() => toggleSection('overdue')}
                badge={{ text: 'تحتاج اهتمام', color: 'text-red-400 bg-red-500/10' }} />
              {!collapsedSections.overdue && (
                <div className="space-y-2">
                  <AnimatePresence mode="popLayout">
                    {overdueWithFlag.map(t => (
                      <TaskCard key={t.id} task={t} isRecommended={recommendedId === t.id}
                        onComplete={handleComplete} onDelete={handleDelete} onEdit={handleEdit} onSplit={setSplittingTask} />
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          {/* SECTION 2: Today's Pending Tasks */}
          <div>
            <SectionHeader icon="📅" label="مهام اليوم" count={todayPending.length} color="text-white"
              collapsed={collapsedSections.today} onToggle={() => toggleSection('today')} />
            {!collapsedSections.today && todayPending.length > 0 && (
              <div className="space-y-2">
                <AnimatePresence mode="popLayout">
                  {todayPending.map(t => (
                    <TaskCard key={t.id} task={t} isRecommended={recommendedId === t.id}
                      onComplete={handleComplete} onDelete={handleDelete} onEdit={handleEdit} onSplit={setSplittingTask} />
                  ))}
                </AnimatePresence>
              </div>
            )}
            {!collapsedSections.today && todayPending.length === 0 && overdueTasks.length === 0 && todayCompleted.length === 0 && (
              <div className="text-center py-10">
                <div className="text-5xl mb-3">☀️</div>
                <p className="text-sm text-gray-400 mb-1">يومك فاضي</p>
                <p className="text-xs text-gray-600">أضف مهمة جديدة للبدء</p>
              </div>
            )}
          </div>

          {/* SECTION 3: Completed Today — ALWAYS VISIBLE, NEVER DISAPPEAR */}
          {/* This section renders even if todayCompleted is empty to show "no completions yet" */}
          <div>
            <SectionHeader icon="✅" label="مكتملة اليوم" count={actualCompletedToday} color="text-green-500"
              collapsed={!!collapsedSections.todayDone} onToggle={() => toggleSection('todayDone')}
              badge={actualCompletedToday > 0 ? { text: `${actualCompletedToday} مهمة`, color: 'text-green-400 bg-green-500/10' } : undefined} />
            {!collapsedSections.todayDone && (
              <div className="space-y-2">
                {todayCompleted.length > 0 ? (
                  <>
                    <AnimatePresence mode="popLayout">
                      {todayCompleted.map(t => (
                        <TaskCard key={t.id} task={t} isRecommended={false} showTimestamp
                          onComplete={() => {}} onDelete={handleDelete} onEdit={handleEdit} />
                      ))}
                    </AnimatePresence>
                    <p className="text-center text-xs text-green-400/60 py-1">
                      ✅ {actualCompletedToday === 1 ? 'مهمة واحدة مكتملة' : `${actualCompletedToday} مهام مكتملة`} اليوم — لن تختفي
                    </p>
                  </>
                ) : (
                  <div className="text-center py-4 bg-white/[0.02] rounded-xl border border-white/[0.03]">
                    <p className="text-xs text-gray-500">لم تكتمل مهام اليوم بعد — أنجز مهمة وستظهر هنا</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ═════ ALL TASKS MODE ═════ Phase 13.1: Dedicated All Tasks View */}
          {viewMode === 'all' && !allLoading && allData && (
            <>
              {/* ALL: Overdue */}
              {allData.overdue.length > 0 && (
                <div>
                  <SectionHeader icon="⚠️" label="متأخرة" count={allData.overdue.length} color="text-red-400"
                    collapsed={collapsedSections.allOverdue} onToggle={() => toggleSection('allOverdue')}
                    badge={{ text: 'تحتاج اهتمام', color: 'text-red-400 bg-red-500/10' }} />
                  {!collapsedSections.allOverdue && (
                    <div className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {allData.overdue.map(t => (
                          <TaskCard key={t.id} task={{ ...t, _overdue: true }} isRecommended={false}
                            onComplete={handleComplete} onDelete={handleDelete} onEdit={handleEdit} onSplit={setSplittingTask} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}

              {/* ALL: Today */}
              {allData.today.length > 0 && (
                <div>
                  <SectionHeader icon="📅" label="اليوم" count={allData.today.length} color="text-white"
                    collapsed={collapsedSections.allToday} onToggle={() => toggleSection('allToday')} />
                  {!collapsedSections.allToday && (
                    <div className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {allData.today.map(t => (
                          <TaskCard key={t.id} task={t} isRecommended={false}
                            onComplete={handleComplete} onDelete={handleDelete} onEdit={handleEdit} onSplit={setSplittingTask} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}

              {/* ALL: Upcoming */}
              {allData.upcoming.length > 0 && (
                <div>
                  <SectionHeader icon="🔜" label="قادمة" count={allData.upcoming.length} color="text-blue-400"
                    collapsed={collapsedSections.allUpcoming} onToggle={() => toggleSection('allUpcoming')} />
                  {!collapsedSections.allUpcoming && (
                    <div className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {allData.upcoming.map(t => (
                          <TaskCard key={t.id} task={t} isRecommended={false}
                            onComplete={handleComplete} onDelete={handleDelete} onEdit={handleEdit} onSplit={setSplittingTask} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}

              {/* ALL: No Due Date */}
              {allData.noDueDate.length > 0 && (
                <div>
                  <SectionHeader icon="📋" label="بدون تاريخ" count={allData.noDueDate.length} color="text-gray-400"
                    collapsed={collapsedSections.allNoDueDate} onToggle={() => toggleSection('allNoDueDate')} />
                  {!collapsedSections.allNoDueDate && (
                    <div className="space-y-2">
                      <AnimatePresence mode="popLayout">
                        {allData.noDueDate.map(t => (
                          <TaskCard key={t.id} task={t} isRecommended={false}
                            onComplete={handleComplete} onDelete={handleDelete} onEdit={handleEdit} onSplit={setSplittingTask} />
                        ))}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              )}

              {/* ALL: Completed */}
              {allData.completed.length > 0 && (
                <div>
                  <SectionHeader icon="🏆" label="مكتملة" count={allData.completed.length} color="text-green-500"
                    collapsed={collapsedSections.allDone !== false} onToggle={() => toggleSection('allDone')} />
                  {collapsedSections.allDone === false && (
                    <div className="space-y-2">
                      {allData.completed.slice(0, 30).map(t => (
                        <TaskCard key={t.id} task={t} isRecommended={false} showTimestamp
                          onComplete={() => {}} onDelete={handleDelete} onEdit={handleEdit} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Empty state */}
              {allData.overdue.length === 0 && allData.today.length === 0 && allData.upcoming.length === 0 && allData.noDueDate.length === 0 && (
                <div className="text-center py-10">
                  <div className="text-5xl mb-3">📝</div>
                  <p className="text-sm text-gray-400 mb-1">لا توجد مهام</p>
                  <p className="text-xs text-gray-600">أضف مهمة جديدة للبدء</p>
                </div>
              )}
            </>
          )}
          {viewMode === 'all' && allLoading && (
            <div className="space-y-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />)}
            </div>
          )}
        </div>
      )}

      {/* ── Modals ──────────────────────────────────────────────── */}
      <AnimatePresence>
        {showAdd && <AddTaskModal isOpen={showAdd} onClose={() => setShowAdd(false)} onSubmit={d => createMutation.mutate(d)} isPending={createMutation.isPending} />}
      </AnimatePresence>
      <AnimatePresence>
        {editingTask && <EditTaskModal isOpen={!!editingTask} onClose={() => setEditingTask(null)} task={editingTask} onSubmit={handleUpdate} isPending={updateMutation.isPending} />}
      </AnimatePresence>
      <AnimatePresence>
        {splittingTask && <SmartSplitModal isOpen={!!splittingTask} onClose={() => setSplittingTask(null)} task={splittingTask} onSplit={handleSplitTask} />}
      </AnimatePresence>
    </div>
  );
}
