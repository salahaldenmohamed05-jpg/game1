/**
 * Habits View — إدارة العادات اليومية
 * =====================================
 * يدعم:
 * - إضافة عادات بسيطة (تم/لم يتم) وعادات عددية (شرب ماء، صلوات)
 * - تتبع التقدم اليومي مع شريط إنجاز
 * - حذف العادات
 * - تعديل العادات
 * - إحصائيات مفصلة
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, X, Flame, CheckCircle2, Trash2, Edit3,
  Droplets, Moon, BookOpen, TrendingUp, MoreVertical,
  ChevronUp, ChevronDown,
} from 'lucide-react';
import { habitAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const HABIT_ICONS = ['💧', '🏃', '📚', '🧘', '🥗', '💊', '✍️', '🎯', '🎵', '💰', '🛏️', '🌿', '🏋️', '🧠', '📝', '🕌', '☀️', '🍎', '💻', '🎨'];
const HABIT_COLORS = ['#6C63FF', '#FF6584', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];
const CATEGORIES_AR = {
  health: 'صحة', fitness: 'رياضة', learning: 'تعلم',
  mindfulness: 'تأمل', social: 'اجتماعي', work: 'عمل',
  finance: 'مالي', creativity: 'إبداع', religion: 'دين', other: 'أخرى',
};

// ── Preset Templates ────────────────────────────────────────────────────────
const PRESET_HABITS = [
  { name_ar: 'شرب الماء', icon: '💧', category: 'health', habit_type: 'count', target_value: 8, count_label: 'كأس', color: '#3B82F6' },
  { name_ar: 'الصلوات الخمس', icon: '🕌', category: 'religion', habit_type: 'count', target_value: 5, count_label: 'صلاة', color: '#10B981' },
  { name_ar: 'القراءة', icon: '📚', category: 'learning', habit_type: 'count', target_value: 30, count_label: 'دقيقة', color: '#8B5CF6' },
  { name_ar: 'الرياضة', icon: '🏃', category: 'fitness', habit_type: 'boolean', color: '#F97316' },
  { name_ar: 'التأمل', icon: '🧘', category: 'mindfulness', habit_type: 'boolean', color: '#14B8A6' },
  { name_ar: 'النوم المبكر', icon: '🛏️', category: 'health', habit_type: 'boolean', color: '#6C63FF' },
];

const DEFAULT_NEW_HABIT = {
  name_ar: '', category: 'health', icon: '⭐', color: '#6C63FF',
  habit_type: 'boolean', target_value: 1, count_label: 'مرة',
  target_time: '', duration_minutes: 30, description: '',
};

export default function HabitsView() {
  const [showAdd, setShowAdd] = useState(false);
  const [editHabit, setEditHabit] = useState(null);
  const [newHabit, setNewHabit] = useState(DEFAULT_NEW_HABIT);
  const [activeMenu, setActiveMenu] = useState(null);
  const queryClient = useQueryClient();

  const { data: habitsData, isLoading } = useQuery({
    queryKey: ['habits-today'],
    queryFn: habitAPI.getTodaySummary,
  });

  // ── Check-in (boolean) ──────────────────────────────────────────────────────
  const checkInMutation = useMutation({
    mutationFn: (habitId) => habitAPI.checkIn(habitId, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['habits-today'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(data?.data?.message || data?.message || 'تم! 🎉');
    },
    onError: () => toast.error('فشل في تسجيل العادة'),
  });

  // ── Increment count ─────────────────────────────────────────────────────────
  const incrementMutation = useMutation({
    mutationFn: ({ id, delta }) => habitAPI.logValue(id, { value: delta }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['habits-today'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const msg = data?.data?.message || data?.message;
      if (msg) toast.success(msg);
    },
    onError: () => toast.error('فشل في التحديث'),
  });

  // ── Create habit ────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: habitAPI.createHabit,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['habits-today'] });
      toast.success(data?.data?.message || data?.message || '💪 تمت إضافة العادة!');
      setShowAdd(false);
      setNewHabit(DEFAULT_NEW_HABIT);
    },
    onError: (err) => toast.error('فشل في إضافة العادة: ' + (err?.message || '')),
  });

  // ── Delete habit ────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: (habitId) => habitAPI.deleteHabit(habitId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['habits-today'] });
      toast.success(data?.data?.message || data?.message || 'تم حذف العادة');
      setActiveMenu(null);
    },
    onError: () => toast.error('فشل في حذف العادة'),
  });

  const summary = habitsData?.data?.data || habitsData?.data;
  const habits = summary?.habits || [];

  const applyPreset = (preset) => {
    setNewHabit({ ...DEFAULT_NEW_HABIT, ...preset });
  };

  const handleHabitClick = (habit) => {
    if (activeMenu === habit.id) { setActiveMenu(null); return; }
    if (habit.completed_today) return;
    if (habit.habit_type === 'count') return; // count habits use +/- buttons
    checkInMutation.mutate(habit.id);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto" onClick={() => setActiveMenu(null)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">العادات اليومية</h2>
          <p className="text-sm text-gray-400">بناء حياة أفضل خطوة بخطوة</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm flex items-center gap-1">
          <Plus size={16} /> إضافة عادة
        </button>
      </div>

      {/* Progress Summary */}
      {summary && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5 bg-gradient-to-br from-primary-500/10 to-green-500/5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">إنجاز اليوم</h3>
            <span className="text-2xl font-black gradient-text">{summary.completion_percentage}%</span>
          </div>
          <div className="progress-bar mb-3">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${summary.completion_percentage}%` }}
              transition={{ duration: 1, ease: 'easeOut' }}
              className="progress-fill"
            />
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div>
              <div className="text-lg font-bold text-green-400">{summary.completed}</div>
              <div className="text-xs text-gray-400">مكتملة</div>
            </div>
            <div>
              <div className="text-lg font-bold text-yellow-400">{summary.pending}</div>
              <div className="text-xs text-gray-400">متبقية</div>
            </div>
            <div>
              <div className="text-lg font-bold text-primary-400">{summary.total}</div>
              <div className="text-xs text-gray-400">إجمالي</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Habits Grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
        </div>
      ) : habits.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-5xl mb-3">🌱</div>
          <p className="text-gray-400 mb-2">لا توجد عادات بعد</p>
          <p className="text-gray-500 text-sm">ابدأ بإضافة عادة يومية لبناء حياة أفضل!</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <AnimatePresence>
            {habits.map((habit, idx) => (
              <HabitCard
                key={habit.id}
                habit={habit}
                idx={idx}
                activeMenu={activeMenu}
                setActiveMenu={setActiveMenu}
                onCheckIn={() => handleHabitClick(habit)}
                onIncrement={(delta) => incrementMutation.mutate({ id: habit.id, delta })}
                onDelete={() => {
                  if (confirm(`حذف عادة "${habit.name_ar || habit.name}"؟`)) {
                    deleteMutation.mutate(habit.id);
                  }
                }}
                isCheckingIn={checkInMutation.isPending}
                isIncrementing={incrementMutation.isPending}
              />
            ))}
          </AnimatePresence>

          {/* Add habit card */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            onClick={() => setShowAdd(true)}
            className="glass-card p-4 cursor-pointer border-dashed flex flex-col items-center justify-center text-gray-500 hover:text-primary-400 hover:border-primary-500/30 min-h-36 transition-all"
          >
            <Plus size={32} className="mb-2" />
            <span className="text-sm">عادة جديدة</span>
          </motion.div>
        </div>
      )}

      {/* Add Habit Modal */}
      <AnimatePresence>
        {showAdd && (
          <AddHabitModal
            newHabit={newHabit}
            setNewHabit={setNewHabit}
            onClose={() => { setShowAdd(false); setNewHabit(DEFAULT_NEW_HABIT); }}
            onSubmit={() => createMutation.mutate(newHabit)}
            isPending={createMutation.isPending}
            applyPreset={applyPreset}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Habit Card Component ──────────────────────────────────────────────────────
function HabitCard({ habit, idx, activeMenu, setActiveMenu, onCheckIn, onIncrement, onDelete, isCheckingIn, isIncrementing }) {
  const isCount = habit.habit_type === 'count';
  const targetValue = habit.target_value || 1;
  const currentValue = habit.current_value || 0;
  const progressPercent = isCount
    ? Math.min(100, Math.round((currentValue / targetValue) * 100))
    : (habit.completed_today ? 100 : 0);

  return (
    <motion.div
      key={habit.id}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: idx * 0.05 }}
      className={`glass-card p-4 relative transition-all ${
        habit.completed_today
          ? 'bg-gradient-to-br from-primary-500/20 to-green-500/10 border-primary-500/30'
          : 'hover:border-primary-500/20'
      }`}
      onClick={(e) => {
        e.stopPropagation();
        if (!isCount) onCheckIn();
      }}
    >
      {/* Menu button */}
      <button
        className="absolute top-2 left-2 p-1 text-gray-500 hover:text-white rounded-lg hover:bg-white/10 z-10"
        onClick={(e) => {
          e.stopPropagation();
          setActiveMenu(activeMenu === habit.id ? null : habit.id);
        }}
      >
        <MoreVertical size={14} />
      </button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {activeMenu === habit.id && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -5 }}
            className="absolute top-8 left-2 z-20 bg-gray-800 border border-gray-700 rounded-xl shadow-xl overflow-hidden min-w-[130px]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="flex items-center gap-2 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 w-full transition-colors"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <Trash2 size={13} /> حذف العادة
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Icon + Streak */}
      <div className="flex items-center justify-between mb-3">
        <div
          className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl transition-transform
            ${habit.completed_today ? 'scale-110' : 'scale-100'}`}
          style={{ background: habit.completed_today ? 'rgba(16,185,129,0.15)' : `${habit.color}22` }}
        >
          {habit.completed_today && !isCount ? '✅' : habit.icon || '⭐'}
        </div>
        {habit.current_streak > 0 && (
          <div className="flex items-center gap-1 bg-orange-500/20 px-2 py-0.5 rounded-full">
            <Flame size={11} className="text-orange-400" />
            <span className="text-xs text-orange-400 font-bold">{habit.current_streak}</span>
          </div>
        )}
      </div>

      {/* Name */}
      <h4 className="font-semibold text-sm text-white mb-1 truncate">{habit.name_ar || habit.name}</h4>
      <p className="text-xs text-gray-500">{CATEGORIES_AR[habit.category] || habit.category}</p>

      {/* Count habit progress */}
      {isCount ? (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-400">
              {currentValue}/{targetValue} {habit.count_label || habit.unit || 'مرة'}
            </span>
            <span className="text-xs font-bold" style={{ color: progressPercent >= 100 ? '#10B981' : '#6C63FF' }}>
              {progressPercent}%
            </span>
          </div>
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden mb-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.5 }}
              className="h-full rounded-full"
              style={{ background: progressPercent >= 100 ? '#10B981' : habit.color || '#6C63FF' }}
            />
          </div>
          {/* +/- buttons */}
          <div className="flex items-center justify-between gap-1">
            <button
              className="flex-1 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-gray-300 text-xs flex items-center justify-center gap-1 transition-colors"
              onClick={(e) => { e.stopPropagation(); if (currentValue > 0) onIncrement(-1); }}
              disabled={currentValue <= 0 || isIncrementing}
            >
              <ChevronDown size={12} /> سحب
            </button>
            <button
              className="flex-1 py-1 rounded-lg text-white text-xs flex items-center justify-center gap-1 transition-colors disabled:opacity-50"
              style={{ background: habit.completed_today ? '#10B981' : habit.color || '#6C63FF' }}
              onClick={(e) => { e.stopPropagation(); onIncrement(1); }}
              disabled={isIncrementing}
            >
              <ChevronUp size={12} /> أضف
            </button>
          </div>
        </div>
      ) : (
        /* Boolean habit status */
        <div className="mt-3">
          {habit.completed_today ? (
            <div className="text-xs text-green-400 flex items-center gap-1">
              <CheckCircle2 size={12} /> أنجزت اليوم ✓
            </div>
          ) : (
            <div
              className="text-xs px-2 py-1.5 rounded-lg text-center cursor-pointer transition-all hover:opacity-80"
              style={{ background: `${habit.color}22`, color: habit.color || '#6C63FF' }}
            >
              {isCheckingIn ? '...' : 'اضغط للإنجاز'}
            </div>
          )}

          {/* Completion rate bar */}
          {habit.completion_rate > 0 && (
            <div className="mt-2 flex items-center gap-2">
              <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{
                  width: `${habit.completion_rate}%`,
                  background: habit.color || '#6C63FF',
                }} />
              </div>
              <span className="text-xs text-gray-500">{Math.round(habit.completion_rate)}%</span>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

// ── Add Habit Modal ───────────────────────────────────────────────────────────
function AddHabitModal({ newHabit, setNewHabit, onClose, onSubmit, isPending, applyPreset }) {
  const update = (field, value) => setNewHabit(prev => ({ ...prev, [field]: value }));

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
        className="glass-card p-5 w-full sm:max-w-lg max-h-screen sm:max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl">

        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-white">عادة جديدة 💪</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white"><X size={20} /></button>
        </div>

        {/* Preset Templates */}
        <div className="mb-4">
          <label className="text-xs text-gray-400 block mb-2">قوالب سريعة</label>
          <div className="flex flex-wrap gap-2">
            {PRESET_HABITS.map((p, i) => (
              <button key={i}
                onClick={() => applyPreset(p)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all flex items-center gap-1
                  ${newHabit.name_ar === p.name_ar
                    ? 'bg-primary-500/30 border-primary-500 text-primary-300'
                    : 'border-white/10 text-gray-400 hover:border-white/30'}`}
              >
                {p.icon} {p.name_ar}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-4">
          {/* Habit Name + Category */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">اسم العادة *</label>
              <input value={newHabit.name_ar}
                onChange={e => update('name_ar', e.target.value)}
                className="input-field" placeholder="مثال: شرب الماء" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">التصنيف</label>
              <select value={newHabit.category} onChange={e => update('category', e.target.value)} className="input-field">
                {Object.entries(CATEGORIES_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {/* Habit Type */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">نوع العادة</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => update('habit_type', 'boolean')}
                className={`p-3 rounded-xl text-sm border transition-all ${
                  newHabit.habit_type === 'boolean'
                    ? 'bg-primary-500/30 border-primary-500 text-white'
                    : 'border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                ✅ تم / لم يتم
                <div className="text-xs mt-0.5 opacity-70">مثل: النوم المبكر</div>
              </button>
              <button
                onClick={() => update('habit_type', 'count')}
                className={`p-3 rounded-xl text-sm border transition-all ${
                  newHabit.habit_type === 'count'
                    ? 'bg-primary-500/30 border-primary-500 text-white'
                    : 'border-white/10 text-gray-400 hover:border-white/20'
                }`}
              >
                🔢 عدد مرات
                <div className="text-xs mt-0.5 opacity-70">مثل: شرب الماء</div>
              </button>
            </div>
          </div>

          {/* Count settings */}
          {newHabit.habit_type === 'count' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 block mb-1">الهدف اليومي</label>
                <input type="number" min="1" value={newHabit.target_value}
                  onChange={e => update('target_value', parseInt(e.target.value) || 1)}
                  className="input-field" />
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-1">الوحدة</label>
                <input value={newHabit.count_label}
                  onChange={e => update('count_label', e.target.value)}
                  className="input-field" placeholder="كأس، صلاة، دقيقة..." />
              </div>
            </div>
          )}

          {/* Icon picker */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">الأيقونة</label>
            <div className="flex flex-wrap gap-2">
              {HABIT_ICONS.map(icon => (
                <button key={icon} onClick={() => update('icon', icon)}
                  className={`text-2xl p-2 rounded-lg transition-all ${
                    newHabit.icon === icon
                      ? 'bg-primary-500/30 border border-primary-500'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}>
                  {icon}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="text-xs text-gray-400 block mb-2">اللون</label>
            <div className="flex gap-2">
              {HABIT_COLORS.map(c => (
                <button key={c} onClick={() => update('color', c)}
                  className={`w-8 h-8 rounded-full transition-all ${newHabit.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-800 scale-110' : ''}`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>

          {/* Time + Description */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">وقت الهدف</label>
              <input type="time" value={newHabit.target_time}
                onChange={e => update('target_time', e.target.value)}
                className="input-field" dir="ltr" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">المدة (دقيقة)</label>
              <input type="number" value={newHabit.duration_minutes}
                onChange={e => update('duration_minutes', parseInt(e.target.value))}
                className="input-field" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">وصف العادة</label>
            <textarea value={newHabit.description}
              onChange={e => update('description', e.target.value)}
              className="input-field h-16 resize-none"
              placeholder="لماذا تريد هذه العادة؟" />
          </div>

          {/* Preview */}
          {newHabit.name_ar && (
            <div className="rounded-xl p-3 border border-white/10 bg-white/5">
              <div className="text-xs text-gray-400 mb-1">معاينة:</div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{newHabit.icon}</span>
                <div>
                  <div className="text-sm font-medium text-white">{newHabit.name_ar}</div>
                  <div className="text-xs text-gray-400">
                    {newHabit.habit_type === 'count'
                      ? `هدف: ${newHabit.target_value} ${newHabit.count_label} يومياً`
                      : 'عادة يومية (تم/لم يتم)'}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={onClose} className="btn-secondary flex-1">إلغاء</button>
            <button
              onClick={onSubmit}
              disabled={!newHabit.name_ar || isPending}
              className="btn-primary flex-1"
            >
              {isPending ? '...' : 'إضافة العادة 💪'}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
