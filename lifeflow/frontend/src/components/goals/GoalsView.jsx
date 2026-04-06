/**
 * GoalsView — Goals Management Page (Phase 9.0)
 * ================================================
 * PROGRESS LINKED TO REAL DATA:
 * - Auto-computed: progress = (completed linked tasks + completed habits) / total linked
 * - Manual fallback: slider to set progress when no items linked
 * - Changes reflect immediately via invalidateAll()
 * - Eisenhower quadrant classification
 * - Mobile-first, Arabic RTL
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Target, X, Calendar, Check, Trash2,
  TrendingUp, Link, AlertCircle, Edit3, ChevronDown, Flag
} from 'lucide-react';
import { goalsAPI, taskAPI, habitAPI } from '../../utils/api';
import useSyncStore from '../../store/syncStore';
import toast from 'react-hot-toast';

const QUADRANTS = {
  urgent_important: { label: 'عاجل ومهم', color: 'bg-red-500/15 text-red-400 border-red-500/30', emoji: '🔴' },
  important:        { label: 'مهم', color: 'bg-blue-500/15 text-blue-400 border-blue-500/30', emoji: '🔵' },
  urgent:           { label: 'عاجل', color: 'bg-orange-500/15 text-orange-400 border-orange-500/30', emoji: '🟠' },
  neither:          { label: 'عادي', color: 'bg-gray-500/15 text-gray-400 border-gray-500/30', emoji: '⚪' },
};

function getCairoToday() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' });
}

// ─── Goal Card ──────────────────────────────────────────────────────────

function GoalCard({ goal, onEdit, onDelete, onViewChange, onUpdateProgress }) {
  const q = QUADRANTS[goal.eisenhower_quadrant] || QUADRANTS.important;
  const linkedTasks = goal.linked_tasks || [];
  const linkedHabits = goal.linked_habits || [];
  const totalLinked = linkedTasks.length + linkedHabits.length;
  const completedLinked = linkedTasks.filter(t => t.status === 'completed').length + linkedHabits.filter(h => h.completed_today).length;

  // Progress: auto-computed from linked items, or manual fallback
  const progress = totalLinked > 0 
    ? Math.round((completedLinked / totalLinked) * 100) 
    : (goal.progress || goal.manual_progress || 0);

  const daysLeft = goal.target_date
    ? Math.max(0, Math.ceil((new Date(goal.target_date) - new Date()) / 86400000))
    : null;
  
  const isAutoProgress = totalLinked > 0;
  const [showSlider, setShowSlider] = useState(false);
  const [manualPct, setManualPct] = useState(goal.manual_progress || goal.progress || 0);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white/5 border border-white/5 rounded-2xl p-4 hover:bg-white/8 transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <Target size={16} className="text-primary-400 flex-shrink-0" />
            <h3 className="text-sm font-bold text-white truncate">{goal.title}</h3>
          </div>
          {goal.description && (
            <p className="text-xs text-gray-500 line-clamp-2 mt-0.5">{goal.description}</p>
          )}
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <span className={`text-[10px] px-2 py-1 rounded-lg font-medium border ${q.color}`}>
            {q.emoji} {q.label}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-400">التقدم</span>
          <span className="font-bold text-primary-400">{progress}%</span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, progress)}%` }}
            transition={{ duration: 0.8 }}
            className={`h-full rounded-full ${
              progress >= 80 ? 'bg-green-500' : progress >= 40 ? 'bg-primary-500' : 'bg-yellow-500'
            }`}
          />
        </div>
      </div>

      {/* Linked items + deadline */}
      <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
        {totalLinked > 0 && (
          <span className="flex items-center gap-1">
            <Link size={10} /> {completedLinked}/{totalLinked} مرتبطة
          </span>
        )}
        {daysLeft !== null && (
          <span className={`flex items-center gap-1 ${daysLeft <= 3 ? 'text-red-400 font-bold' : daysLeft <= 7 ? 'text-yellow-400' : ''}`}>
            <Calendar size={10} />
            {daysLeft === 0 ? 'ينتهي اليوم!' : `${daysLeft} يوم متبقي`}
          </span>
        )}
        {linkedTasks.length > 0 && <span>📋 {linkedTasks.length} مهمة</span>}
        {linkedHabits.length > 0 && <span>🎯 {linkedHabits.length} عادة</span>}
      </div>

      {/* Progress source indicator */}
      <div className="flex items-center gap-2 text-[10px] mt-1">
        {isAutoProgress ? (
          <span className="text-green-400 flex items-center gap-1">
            <Link size={9} /> مرتبط بالمهام/العادات ({completedLinked}/{totalLinked})
          </span>
        ) : (
          <button 
            onClick={(e) => { e.stopPropagation(); setShowSlider(!showSlider); }}
            className="text-primary-400 flex items-center gap-1 hover:text-primary-300">
            <TrendingUp size={9} /> {showSlider ? 'إغلاق' : 'تحديث يدوي'}
          </button>
        )}
      </div>

      {/* Manual progress slider (when no linked items) */}
      {showSlider && !isAutoProgress && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <div className="flex items-center gap-2">
            <input 
              type="range" min="0" max="100" value={manualPct}
              onChange={(e) => setManualPct(Number(e.target.value))}
              className="flex-1 h-2 accent-primary-500"
            />
            <span className="text-xs text-primary-400 font-bold w-10 text-left">{manualPct}%</span>
          </div>
          <button 
            onClick={() => { onUpdateProgress(goal.id, manualPct); setShowSlider(false); }}
            className="mt-1 w-full py-1.5 text-[11px] text-white bg-primary-500/20 rounded-lg hover:bg-primary-500/30 transition-all">
            حفظ التقدم
          </button>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-white/5">
        <button onClick={() => onEdit(goal)}
          className="flex-1 py-2 text-xs text-primary-400 bg-primary-500/10 rounded-xl hover:bg-primary-500/20 transition-all flex items-center justify-center gap-1 active:scale-95">
          <Edit3 size={12} /> تعديل
        </button>
        <button onClick={() => onDelete(goal.id)}
          className="py-2 px-3 text-xs text-red-400 bg-red-500/10 rounded-xl hover:bg-red-500/20 transition-all flex items-center justify-center gap-1 active:scale-95">
          <Trash2 size={12} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Add/Edit Goal Modal ────────────────────────────────────────────────

function GoalModal({ isOpen, onClose, onSubmit, isPending, goal, tasks, habits }) {
  const [form, setForm] = useState({
    title: '', description: '', target_date: '',
    eisenhower_quadrant: 'important',
    linked_task_ids: [], linked_habit_ids: [],
  });
  const [errors, setErrors] = useState({});
  const [showLinkTasks, setShowLinkTasks] = useState(false);
  const [showLinkHabits, setShowLinkHabits] = useState(false);

  // Populate form when editing — using useEffect (not useState!)
  useEffect(() => {
    if (goal) {
      setForm({
        title: goal.title || '', description: goal.description || '',
        target_date: goal.target_date ? new Date(goal.target_date).toLocaleDateString('en-CA') : '',
        eisenhower_quadrant: goal.eisenhower_quadrant || 'important',
        linked_task_ids: (goal.linked_tasks || []).map(t => t.id || t),
        linked_habit_ids: (goal.linked_habits || []).map(h => h.id || h),
      });
    }
  }, [goal]);

  const handleSubmit = () => {
    const errs = {};
    if (!form.title.trim()) errs.title = 'أدخل عنوان الهدف';
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    onSubmit({
      ...form,
      title: form.title.trim(),
      description: form.description.trim(),
      target_date: form.target_date || null,
    });
  };

  const toggleTaskLink = (id) => {
    setForm(prev => ({
      ...prev,
      linked_task_ids: prev.linked_task_ids.includes(id)
        ? prev.linked_task_ids.filter(x => x !== id)
        : [...prev.linked_task_ids, id],
    }));
  };

  const toggleHabitLink = (id) => {
    setForm(prev => ({
      ...prev,
      linked_habit_ids: prev.linked_habit_ids.includes(id)
        ? prev.linked_habit_ids.filter(x => x !== id)
        : [...prev.linked_habit_ids, id],
    }));
  };

  if (!isOpen) return null;

  const safeTasks = Array.isArray(tasks) ? tasks : [];
  const safeHabits = Array.isArray(habits) ? habits : [];

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
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Target size={18} className="text-primary-400" />
              {goal ? 'تعديل الهدف' : 'هدف جديد'}
            </h3>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-400"><X size={18} /></button>
          </div>

          <div className="space-y-4">
            <div>
              <input value={form.title} onChange={e => { setForm({ ...form, title: e.target.value }); setErrors({}); }}
                placeholder="عنوان الهدف..." autoFocus
                className={`w-full rounded-xl px-4 py-3.5 text-base focus:outline-none ${errors.title ? 'border-red-500 ring-2 ring-red-500/20' : ''}`} />
              {errors.title && <p className="text-xs text-red-400 mt-1"><AlertCircle size={11} className="inline" /> {errors.title}</p>}
            </div>

            <div>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                placeholder="وصف الهدف (اختياري)..." rows={2}
                className="w-full rounded-xl px-4 py-3 text-sm focus:outline-none resize-none" />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">📅 الموعد النهائي</label>
              <input type="date" value={form.target_date} onChange={e => setForm({ ...form, target_date: e.target.value })}
                className="w-full rounded-xl px-4 py-3 focus:outline-none" />
            </div>

            <div>
              <label className="text-xs text-gray-400 mb-1.5 block font-medium">🎯 الأولوية (أيزنهاور)</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(QUADRANTS).map(([key, q]) => (
                  <button key={key} onClick={() => setForm({ ...form, eisenhower_quadrant: key })}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all active:scale-95 min-h-[44px] border ${
                      form.eisenhower_quadrant === key ? q.color : 'bg-white/5 text-gray-400 border-transparent'
                    }`}>
                    {q.emoji} {q.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Link Tasks */}
            <div>
              <button onClick={() => setShowLinkTasks(!showLinkTasks)}
                className="text-xs text-primary-400 flex items-center gap-1 mb-2 hover:text-primary-300">
                <Link size={12} /> ربط مهام ({form.linked_task_ids.length})
                <ChevronDown size={12} className={`transition-transform ${showLinkTasks ? 'rotate-180' : ''}`} />
              </button>
              {showLinkTasks && (
                <div className="max-h-32 overflow-y-auto space-y-1 bg-white/5 rounded-xl p-2">
                  {safeTasks.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-2">لا توجد مهام</p>
                  ) : safeTasks.slice(0, 20).map(t => (
                    <button key={t.id} onClick={() => toggleTaskLink(t.id)}
                      className={`w-full text-right text-xs p-2 rounded-lg transition-all ${
                        form.linked_task_ids.includes(t.id) ? 'bg-primary-500/15 text-primary-400' : 'hover:bg-white/5 text-gray-300'
                      }`}>
                      {form.linked_task_ids.includes(t.id) ? '✅' : '⬜'} {t.title}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Link Habits */}
            <div>
              <button onClick={() => setShowLinkHabits(!showLinkHabits)}
                className="text-xs text-purple-400 flex items-center gap-1 mb-2 hover:text-purple-300">
                <Link size={12} /> ربط عادات ({form.linked_habit_ids.length})
                <ChevronDown size={12} className={`transition-transform ${showLinkHabits ? 'rotate-180' : ''}`} />
              </button>
              {showLinkHabits && (
                <div className="max-h-32 overflow-y-auto space-y-1 bg-white/5 rounded-xl p-2">
                  {safeHabits.length === 0 ? (
                    <p className="text-xs text-gray-500 text-center py-2">لا توجد عادات</p>
                  ) : safeHabits.map(h => (
                    <button key={h.id} onClick={() => toggleHabitLink(h.id)}
                      className={`w-full text-right text-xs p-2 rounded-lg transition-all ${
                        form.linked_habit_ids.includes(h.id) ? 'bg-purple-500/15 text-purple-400' : 'hover:bg-white/5 text-gray-300'
                      }`}>
                      {form.linked_habit_ids.includes(h.id) ? '✅' : '⬜'} {h.icon || '🎯'} {h.name || h.name_ar}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 p-5 pt-3 border-t border-white/5" style={{ background: 'inherit' }}>
          <button onClick={handleSubmit} disabled={isPending || !form.title.trim()}
            className="w-full py-4 font-bold rounded-xl text-base bg-primary-500 hover:bg-primary-600 text-white shadow-lg shadow-primary-500/20 disabled:opacity-50 active:scale-[0.98] min-h-[48px]">
            {isPending ? 'جاري الحفظ...' : goal ? 'حفظ التعديلات' : 'إنشاء الهدف'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main GoalsView ─────────────────────────────────────────────────────

export default function GoalsView({ onViewChange }) {
  const [showModal, setShowModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const queryClient = useQueryClient();
  const { invalidateAll } = useSyncStore();

  // Fetch goals — backend returns { data: { activeGoals: [...] } }
  const { data: goalsData, isLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: () => goalsAPI.getGoals().catch(() => ({ data: { data: { activeGoals: [] } } })),
    refetchInterval: 60000,
    select: (res) => {
      const d = res?.data?.data || res?.data || {};
      // Handle both shapes: { activeGoals: [...] } and { goals: [...] } and [...]
      if (Array.isArray(d)) return d;
      return d.activeGoals || d.goals || [];
    },
  });

  // Fetch tasks and habits for linking
  const { data: tasksData } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => taskAPI.getTasks().catch(() => ({ data: { data: { tasks: [] } } })),
    select: (res) => {
      const d = res?.data?.data || res?.data || {};
      return Array.isArray(d) ? d : (d.tasks || []);
    },
  });

  const { data: habitsData } = useQuery({
    queryKey: ['habits-today'],
    queryFn: () => habitAPI.getTodaySummary().catch(() => ({ data: { data: { habits: [] } } })),
    select: (res) => {
      const d = res?.data?.data || res?.data || {};
      return Array.isArray(d.habits) ? d.habits : (Array.isArray(d) ? d : []);
    },
  });

  const goals = goalsData || [];
  const tasks = tasksData || [];
  const habits = habitsData || [];

  // Compute progress for each goal based on linked items
  const goalsWithProgress = useMemo(() => {
    return goals.map(g => {
      const linkedTaskIds = new Set((g.linked_task_ids || []).map(String));
      const linkedHabitIds = new Set((g.linked_habit_ids || []).map(String));

      const linkedTasks = tasks.filter(t => linkedTaskIds.has(String(t.id)));
      const linkedHabits = habits.filter(h => linkedHabitIds.has(String(h.id)));

      const total = linkedTasks.length + linkedHabits.length;
      const completed = linkedTasks.filter(t => t.status === 'completed').length +
                       linkedHabits.filter(h => h.completed_today).length;
      const progress = total > 0 ? Math.round((completed / total) * 100) : (g.progress || 0);

      return { ...g, linked_tasks: linkedTasks, linked_habits: linkedHabits, progress };
    });
  }, [goals, tasks, habits]);

  // Mutations
  const createMutation = useMutation({
    mutationFn: (data) => goalsAPI.createGoal(data).catch(() => {
      // If API doesn't exist, store locally
      const existing = JSON.parse(localStorage.getItem('lifeflow_goals') || '[]');
      const newGoal = { ...data, id: 'goal_' + Date.now(), createdAt: new Date().toISOString() };
      localStorage.setItem('lifeflow_goals', JSON.stringify([...existing, newGoal]));
      return { data: { data: newGoal } };
    }),
    onSuccess: () => {
      invalidateAll();
      toast.success('تم إنشاء الهدف');
      setShowModal(false);
    },
    onError: () => toast.error('فشل في إنشاء الهدف'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => goalsAPI.deleteGoal(id).catch(() => {
      const existing = JSON.parse(localStorage.getItem('lifeflow_goals') || '[]');
      localStorage.setItem('lifeflow_goals', JSON.stringify(existing.filter(g => g.id !== id)));
    }),
    onSuccess: () => { invalidateAll(); toast.success('تم حذف الهدف'); },
  });

  const handleCreate = useCallback((data) => createMutation.mutate(data), [createMutation]);
  const handleDelete = useCallback((id) => {
    if (window.confirm('هل أنت متأكد من حذف هذا الهدف؟')) deleteMutation.mutate(id);
  }, [deleteMutation]);
  const handleEdit = useCallback((goal) => { setEditingGoal(goal); setShowModal(true); }, []);
  
  // Manual progress update
  const handleUpdateProgress = useCallback(async (id, progress) => {
    try {
      await goalsAPI.updateGoal(id, { manual_progress: progress, progress }).catch(() => {
        // Fallback: update locally
        const existing = JSON.parse(localStorage.getItem('lifeflow_goals') || '[]');
        const updated = existing.map(g => g.id === id ? { ...g, progress, manual_progress: progress } : g);
        localStorage.setItem('lifeflow_goals', JSON.stringify(updated));
      });
      invalidateAll();
      toast.success(`تم تحديث التقدم إلى ${progress}%`);
    } catch {
      toast.error('فشل في تحديث التقدم');
    }
  }, [invalidateAll]);

  // Stats
  const totalGoals = goalsWithProgress.length;
  const completedGoals = goalsWithProgress.filter(g => g.progress >= 100).length;
  const avgProgress = totalGoals > 0 ? Math.round(goalsWithProgress.reduce((sum, g) => sum + g.progress, 0) / totalGoals) : 0;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            🎯 الأهداف
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {totalGoals} هدف · {completedGoals} مكتمل · {avgProgress}% متوسط التقدم
          </p>
        </div>
        <button onClick={() => { setEditingGoal(null); setShowModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-bold rounded-xl transition-all text-sm active:scale-95 shadow-lg shadow-primary-500/20 flex-shrink-0 min-h-[44px]">
          <Plus size={16} /> هدف جديد
        </button>
      </div>

      {/* Overall Progress */}
      {totalGoals > 0 && (
        <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-300 font-medium flex items-center gap-1.5">
              <TrendingUp size={14} className="text-primary-400" /> تقدم الأهداف الإجمالي
            </span>
            <span className="text-sm font-black text-primary-400">{avgProgress}%</span>
          </div>
          <div className="h-3 bg-white/5 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${avgProgress}%` }}
              transition={{ duration: 0.8 }} className="h-full rounded-full bg-gradient-to-l from-primary-500 to-green-500" />
          </div>
        </div>
      )}

      {/* Goals List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-32 rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      ) : goalsWithProgress.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🎯</div>
          <h3 className="text-lg font-semibold text-gray-400 mb-2">لا توجد أهداف بعد</h3>
          <p className="text-sm text-gray-600 mb-4">حدد أهدافك واربطها بمهامك وعاداتك</p>
          <button onClick={() => { setEditingGoal(null); setShowModal(true); }}
            className="px-6 py-3 bg-primary-500 text-white rounded-xl font-bold text-sm active:scale-95 shadow-lg">
            <Plus size={16} className="inline ml-1" /> إنشاء هدف
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {goalsWithProgress.map(goal => (
            <GoalCard key={goal.id} goal={goal} onEdit={handleEdit} onDelete={handleDelete} onViewChange={onViewChange} onUpdateProgress={handleUpdateProgress} />
          ))}
        </div>
      )}

      {/* Modal */}
      <AnimatePresence>
        {showModal && (
          <GoalModal
            isOpen={showModal}
            onClose={() => { setShowModal(false); setEditingGoal(null); }}
            onSubmit={handleCreate}
            isPending={createMutation.isPending}
            goal={editingGoal}
            tasks={tasks}
            habits={habits}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
