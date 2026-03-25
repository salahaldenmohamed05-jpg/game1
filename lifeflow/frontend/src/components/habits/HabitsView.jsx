/**
 * HabitsView — Professional Mobile-First Habit Tracker
 * =====================================================
 * ✅ Real data from DB (no mock)
 * ✅ Working check-in (fixed habit_logs unique constraint)
 * ✅ Progress tracking with animated bars
 * ✅ Daily/weekly/monthly/custom frequencies
 * ✅ Smooth bottom-sheet modal for habit creation
 * ✅ Professional mobile-first responsive UI
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Flame, Trash2, Clock, Check, Target, TrendingUp } from 'lucide-react';
import { habitAPI } from '../../utils/api';
import useSyncStore from '../../store/syncStore';
import toast from 'react-hot-toast';

const ICONS = ['💧', '🏃', '📚', '🧘', '🥗', '💊', '✍️', '🎯', '🏋️', '🕌', '☀️', '🍎', '💻', '🎨', '🛏️', '🎵'];
const COLORS = ['#6C63FF', '#FF6584', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899', '#F97316'];
const CATEGORIES = { health: 'صحة', fitness: 'رياضة', learning: 'تعلم', mindfulness: 'تأمل', social: 'اجتماعي', work: 'عمل', religion: 'دين', other: 'أخرى' };
const DAYS_AR = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const FREQ_LABELS = { daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري', custom: 'مخصص' };

// ─── Habit Card with working check-in ───────────────────────────────────────

function HabitCard({ habit, onCheckIn, onLogValue, onDelete, isChecking }) {
  const isBoolean = habit.habit_type === 'boolean' || !habit.habit_type;
  const isDone = habit.completed_today;
  const currentVal = habit.current_value || 0;
  const target = habit.target_value || 1;
  const progress = isBoolean ? (isDone ? 100 : 0) : Math.min(100, Math.round((currentVal / target) * 100));
  const freqLabel = FREQ_LABELS[habit.frequency_type] || 'يومي';

  let scheduleInfo = freqLabel;
  try {
    const customDays = typeof habit.custom_days === 'string' ? JSON.parse(habit.custom_days || '[]') : (habit.custom_days || []);
    const monthlyDays = typeof habit.monthly_days === 'string' ? JSON.parse(habit.monthly_days || '[]') : (habit.monthly_days || []);
    if ((habit.frequency_type === 'weekly' || habit.frequency_type === 'custom') && customDays.length) {
      scheduleInfo = customDays.map(d => DAYS_AR[d]).join(' · ');
    } else if (habit.frequency_type === 'monthly' && monthlyDays.length) {
      scheduleInfo = 'يوم ' + monthlyDays.join(', ');
    }
  } catch {}

  const handleClick = (e) => {
    if (e) e.stopPropagation();
    if (isDone || isChecking) return;
    if (isBoolean) {
      onCheckIn(habit.id);
    } else if (currentVal < target) {
      onLogValue(habit.id, 1);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 transition-all active:scale-[0.98] ${
        isDone
          ? 'bg-gradient-to-br from-green-500/10 to-primary-500/10 border border-green-500/20'
          : 'bg-white/5 border border-white/5 hover:bg-white/8'
      }`}
      style={{ borderRight: `4px solid ${habit.color || '#6C63FF'}` }}
    >
      <div className="flex items-start gap-3">
        {/* Icon / check-in button */}
        <button
          onClick={handleClick}
          disabled={isDone || isChecking}
          className={`w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center text-xl flex-shrink-0 transition-all active:scale-90 ${
            isDone
              ? 'bg-green-500/20 shadow-lg shadow-green-500/10'
              : isChecking
              ? 'bg-white/5 animate-pulse'
              : 'bg-white/5 hover:bg-white/10 cursor-pointer'
          }`}
        >
          {isDone ? (
            <Check size={22} className="text-green-400" strokeWidth={3} />
          ) : isChecking ? (
            <div className="w-5 h-5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <span className="text-2xl">{habit.icon || '⭐'}</span>
          )}
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className={`text-sm font-bold leading-snug ${isDone ? 'line-through text-gray-500' : 'text-white'}`}>
                {habit.name_ar || habit.name}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-md">{scheduleInfo}</span>
                {habit.preferred_time && (
                  <span className="text-xs text-blue-400 flex items-center gap-0.5">
                    <Clock size={9} /> {habit.preferred_time}
                  </span>
                )}
                {habit.current_streak > 0 && (
                  <span className="text-xs text-orange-400 flex items-center gap-0.5 font-bold">
                    <Flame size={10} /> {habit.current_streak}
                  </span>
                )}
              </div>
            </div>
            <button onClick={() => onDelete(habit.id)}
              className="p-1.5 text-gray-600 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-all flex-shrink-0">
              <Trash2 size={13} />
            </button>
          </div>

          {/* Progress bar */}
          <div className="mt-2.5">
            {isBoolean ? (
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5, ease: 'easeOut' }}
                  className="h-full rounded-full"
                  style={{ background: isDone ? '#10B981' : (habit.color || '#6C63FF') }}
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
                  <motion.div
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                    className="h-full rounded-full"
                    style={{ background: habit.color || '#6C63FF' }}
                  />
                </div>
                <span className="text-xs text-gray-400 font-bold whitespace-nowrap">
                  {currentVal}/{target} {habit.count_label || ''}
                </span>
              </div>
            )}
          </div>

          {/* Check-in button for non-completed */}
          {!isDone && !isChecking && (
            <button
              onClick={handleClick}
              className="mt-2 text-xs text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-1.5 rounded-lg transition-all active:scale-95 font-medium"
            >
              {isBoolean ? '✅ تسجيل الإنجاز' : `➕ إضافة (${currentVal + 1}/${target})`}
            </button>
          )}
          {isDone && (
            <p className="mt-1.5 text-xs text-green-400 font-medium">✓ أنجزت اليوم</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Add Habit Modal (Bottom Sheet) ─────────────────────────────────────────

function AddHabitModal({ isOpen, onClose, onSubmit, isPending }) {
  const [form, setForm] = useState({
    name_ar: '', category: 'health', icon: '⭐', color: '#6C63FF',
    habit_type: 'boolean', target_value: 1, count_label: 'مرة',
    preferred_time: '', frequency_type: 'daily', custom_days: [], monthly_days: [],
    reminder_before: 15,
  });

  const toggleDay = (day) => setForm(prev => ({
    ...prev,
    custom_days: prev.custom_days.includes(day)
      ? prev.custom_days.filter(d => d !== day)
      : [...prev.custom_days, day].sort(),
  }));

  const toggleMonthDay = (day) => setForm(prev => ({
    ...prev,
    monthly_days: prev.monthly_days.includes(day)
      ? prev.monthly_days.filter(d => d !== day)
      : [...prev.monthly_days, day].sort((a, b) => a - b),
  }));

  const handleSubmit = () => {
    if (!form.name_ar.trim()) return toast.error('أدخل اسم العادة');
    onSubmit({
      name: form.name_ar, name_ar: form.name_ar, category: form.category,
      icon: form.icon, color: form.color, habit_type: form.habit_type,
      target_value: form.habit_type === 'count' ? (form.target_value || 1) : 1,
      count_label: form.count_label, preferred_time: form.preferred_time || null,
      frequency_type: form.frequency_type,
      custom_days: (form.frequency_type === 'weekly' || form.frequency_type === 'custom') ? form.custom_days : null,
      monthly_days: form.frequency_type === 'monthly' ? form.monthly_days : null,
      reminder_before: form.reminder_before, reminder_enabled: true,
    });
    setForm({
      name_ar: '', category: 'health', icon: '⭐', color: '#6C63FF',
      habit_type: 'boolean', target_value: 1, count_label: 'مرة',
      preferred_time: '', frequency_type: 'daily', custom_days: [], monthly_days: [],
      reminder_before: 15,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center" onClick={onClose}>
      {/* Backdrop — darker for contrast */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      {/* Modal — SOLID bg, shadow-xl, high contrast, rounded */}
      <motion.div
        initial={{ opacity: 0, y: 100 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        className="relative w-full sm:max-w-lg bg-neutral-900 rounded-t-3xl sm:rounded-2xl shadow-xl border border-white/10 max-h-[92vh] overflow-hidden z-10"
        dir="rtl"
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Scrollable form content — leave room for sticky CTA */}
        <div className="p-5 overflow-y-auto" style={{ maxHeight: 'calc(92vh - 80px)' }}>
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-black text-white">🎯 عادة جديدة</h3>
            <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 text-gray-400 active:scale-90"><X size={18} /></button>
          </div>

          <div className="space-y-4">
            {/* Name */}
            <input value={form.name_ar} onChange={e => setForm({ ...form, name_ar: e.target.value })}
              placeholder="اسم العادة..." autoFocus
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50 text-base" />

            {/* Icon */}
            <div>
              <label className="text-xs text-gray-300 mb-1.5 block font-medium">الأيقونة</label>
              <div className="flex gap-1.5 flex-wrap">
                {ICONS.map(ic => (
                  <button key={ic} onClick={() => setForm({ ...form, icon: ic })}
                    className={`w-10 h-10 rounded-lg text-lg flex items-center justify-center active:scale-90 transition-all ${
                      form.icon === ic ? 'bg-primary-500/20 border border-primary-500/30 shadow-sm' : 'bg-white/5'
                    }`}>
                    {ic}
                  </button>
                ))}
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="text-xs text-gray-300 mb-1.5 block font-medium">نوع التتبع</label>
              <div className="flex gap-2">
                {[{ key: 'boolean', label: '✅ تم / لم يتم' }, { key: 'count', label: '🔢 عددي' }].map(t => (
                  <button key={t.key} onClick={() => setForm({ ...form, habit_type: t.key })}
                    className={`flex-1 py-3 rounded-xl text-sm font-bold active:scale-95 transition-all min-h-[44px] ${
                      form.habit_type === t.key ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-white/5 text-gray-400'
                    }`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Count settings */}
            {form.habit_type === 'count' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-gray-300 mb-1 block">الهدف</label>
                  <input type="number" value={form.target_value} min="1"
                    onChange={e => setForm({ ...form, target_value: parseInt(e.target.value) || 1 })}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none" />
                </div>
                <div>
                  <label className="text-xs text-gray-300 mb-1 block">الوحدة</label>
                  <input value={form.count_label} onChange={e => setForm({ ...form, count_label: e.target.value })}
                    placeholder="كأس, صلاة..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none" />
                </div>
              </div>
            )}

            {/* Frequency */}
            <div>
              <label className="text-xs text-gray-300 mb-1.5 block font-medium">التكرار</label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(FREQ_LABELS).map(([key, label]) => (
                  <button key={key} onClick={() => setForm({ ...form, frequency_type: key, custom_days: [], monthly_days: [] })}
                    className={`py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all min-h-[44px] ${
                      form.frequency_type === key ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-white/5 text-gray-400'
                    }`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Weekly/custom days */}
            {(form.frequency_type === 'weekly' || form.frequency_type === 'custom') && (
              <div>
                <label className="text-xs text-gray-300 mb-1.5 block font-medium">أيام الأسبوع</label>
                <div className="flex gap-1.5">
                  {DAYS_AR.map((day, i) => (
                    <button key={i} onClick={() => toggleDay(i)}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-bold active:scale-95 transition-all min-h-[44px] ${
                        form.custom_days.includes(i)
                          ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                          : 'bg-white/5 text-gray-500'
                      }`}>{day}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly days */}
            {form.frequency_type === 'monthly' && (
              <div>
                <label className="text-xs text-gray-300 mb-1.5 block font-medium">أيام الشهر</label>
                <div className="grid grid-cols-7 gap-1">
                  {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                    <button key={d} onClick={() => toggleMonthDay(d)}
                      className={`py-2 rounded-lg text-xs font-bold active:scale-95 transition-all ${
                        form.monthly_days.includes(d)
                          ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                          : 'bg-white/5 text-gray-500'
                      }`}>{d}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Time & Reminder */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-300 mb-1.5 block font-medium">🕐 الوقت المفضل</label>
                <input type="time" value={form.preferred_time}
                  onChange={e => setForm({ ...form, preferred_time: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none" />
              </div>
              <div>
                <label className="text-xs text-gray-300 mb-1.5 block font-medium">🔔 تذكير قبل</label>
                <div className="flex gap-1.5">
                  {[5, 15, 30].map(m => (
                    <button key={m} onClick={() => setForm({ ...form, reminder_before: m })}
                      className={`flex-1 py-3 rounded-xl text-xs font-bold active:scale-95 transition-all min-h-[44px] ${
                        form.reminder_before === m ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'bg-white/5 text-gray-400'
                      }`}>
                      {m}د
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Color */}
            <div>
              <label className="text-xs text-gray-300 mb-1.5 block font-medium">اللون</label>
              <div className="flex gap-2.5">
                {COLORS.map(c => (
                  <button key={c} onClick={() => setForm({ ...form, color: c })}
                    className={`w-9 h-9 rounded-full transition-all active:scale-90 ${
                      form.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-neutral-900 scale-110' : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Sticky CTA at bottom — always visible */}
        <div className="sticky bottom-0 p-5 pt-3 bg-neutral-900 border-t border-white/5">
          <button onClick={handleSubmit} disabled={isPending || !form.name_ar.trim()}
            className="w-full py-4 bg-primary-500 hover:bg-primary-600 text-white font-bold rounded-xl transition-all disabled:opacity-50 text-base active:scale-[0.98] shadow-lg shadow-primary-500/20 min-h-[48px]">
            {isPending ? 'جاري الإنشاء...' : '🎯 إضافة العادة'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function HabitsView() {
  const [showAdd, setShowAdd] = useState(false);
  const [checkingId, setCheckingId] = useState(null);
  const queryClient = useQueryClient();
  const { invalidateAll, recordAction } = useSyncStore();

  // Fetch today's habits from DB
  const { data: todayData, isLoading } = useQuery({
    queryKey: ['habits-today'],
    queryFn: () => habitAPI.getTodaySummary(),
    refetchInterval: 30000,
    select: (res) => {
      const d = res?.data?.data || res?.data || {};
      return { habits: d.habits || d || [], total: d.total || 0, completed: d.completed || 0 };
    },
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (d) => habitAPI.createHabit(d),
    onSuccess: () => {
      invalidateAll();
      recordAction('habit_created');
      toast.success('تم إنشاء العادة 🎯');
      setShowAdd(false);
    },
    onError: (e) => toast.error(e.message || 'فشل'),
  });

  const checkInMutation = useMutation({
    mutationFn: (id) => {
      setCheckingId(id);
      return habitAPI.checkIn(id, {});
    },
    onSuccess: (res) => {
      invalidateAll();
      recordAction('habit_checkin');
      toast.success(res?.data?.message || 'أحسنت! 💪');
      setCheckingId(null);
    },
    onError: () => {
      toast.error('فشل في تسجيل العادة');
      setCheckingId(null);
    },
  });

  const logValueMutation = useMutation({
    mutationFn: ({ id, value }) => {
      setCheckingId(id);
      return habitAPI.logValue(id, { value });
    },
    onSuccess: (res) => {
      invalidateAll();
      recordAction('habit_log');
      toast.success(res?.data?.message || 'تم التسجيل ✅');
      setCheckingId(null);
    },
    onError: () => {
      toast.error('فشل');
      setCheckingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => habitAPI.deleteHabit(id),
    onSuccess: () => {
      invalidateAll();
      toast.success('تم حذف العادة');
    },
  });

  // Filter active habits for today
  const displayHabits = useMemo(() => {
    const habits = todayData?.habits || [];
    if (!Array.isArray(habits)) return [];
    return habits.filter(h => h.is_active !== false);
  }, [todayData]);

  const completedCount = displayHabits.filter(h => h.completed_today).length;
  const totalProgress = displayHabits.length > 0 ? Math.round((completedCount / displayHabits.length) * 100) : 0;

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4" dir="rtl">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            🎯 العادات
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {completedCount}/{displayHabits.length} مكتملة اليوم · {totalProgress}%
          </p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-primary-500 hover:bg-primary-600 text-white font-bold rounded-xl transition-all text-sm active:scale-95 shadow-lg shadow-primary-500/20 flex-shrink-0">
          <Plus size={16} /> جديد
        </button>
      </div>

      {/* Progress bar */}
      <div className="bg-white/5 border border-white/5 rounded-2xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-300 font-medium flex items-center gap-1.5">
            <TrendingUp size={14} className="text-primary-400" />
            تقدم اليوم
          </span>
          <span className="text-sm font-black text-primary-400">{totalProgress}%</span>
        </div>
        <div className="h-3 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${totalProgress}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full rounded-full bg-gradient-to-l from-primary-500 to-green-500"
          />
        </div>
        <div className="flex justify-between mt-1.5 text-xs text-gray-500">
          <span>{completedCount} مكتملة</span>
          <span>{displayHabits.length - completedCount} متبقية</span>
        </div>
      </div>

      {/* Habits list */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-2xl bg-white/5 animate-pulse" />)}
        </div>
      ) : displayHabits.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-6xl mb-4">🎯</div>
          <h3 className="text-lg font-semibold text-gray-400 mb-2">لا توجد عادات لليوم</h3>
          <p className="text-sm text-gray-600 mb-4">أضف عادة جديدة لتبدأ رحلتك</p>
          <button onClick={() => setShowAdd(true)}
            className="px-6 py-3 bg-primary-500 text-white rounded-xl font-bold text-sm active:scale-95 shadow-lg shadow-primary-500/20">
            <Plus size={16} className="inline ml-1" /> إضافة عادة
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {displayHabits.map(h => (
              <HabitCard key={h.id} habit={h}
                isChecking={checkingId === h.id}
                onCheckIn={id => checkInMutation.mutate(id)}
                onLogValue={(id, val) => logValueMutation.mutate({ id, value: val })}
                onDelete={id => deleteMutation.mutate(id)} />
            ))}
          </AnimatePresence>
        </div>
      )}

      <AnimatePresence>
        {showAdd && (
          <AddHabitModal isOpen={showAdd} onClose={() => setShowAdd(false)}
            onSubmit={d => createMutation.mutate(d)} isPending={createMutation.isPending} />
        )}
      </AnimatePresence>
    </div>
  );
}
