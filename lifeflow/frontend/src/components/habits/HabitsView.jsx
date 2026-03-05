/**
 * Habits View - Full Habit Tracking
 * ====================================
 * تتبع العادات اليومية مع التسلسل والإحصائيات
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Flame, TrendingUp, CheckCircle2 } from 'lucide-react';
import { habitAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const HABIT_ICONS = ['💧', '🏃', '📚', '🧘', '🥗', '💊', '✍️', '🎯', '🎵', '💰', '🛏️', '🌿', '🏋️', '🧠', '📝'];
const HABIT_COLORS = ['#6C63FF', '#FF6584', '#10B981', '#F59E0B', '#3B82F6', '#8B5CF6', '#EC4899'];
const CATEGORIES_AR = { health: 'صحة', fitness: 'رياضة', learning: 'تعلم', mindfulness: 'تأمل', social: 'اجتماعي', work: 'عمل', finance: 'مالي', creativity: 'إبداع', other: 'أخرى' };

export default function HabitsView() {
  const [showAdd, setShowAdd] = useState(false);
  const [selectedHabit, setSelectedHabit] = useState(null);
  const [newHabit, setNewHabit] = useState({
    name: '', name_ar: '', category: 'health', icon: '⭐', color: '#6C63FF',
    frequency: 'daily', target_time: '', duration_minutes: 30,
    target_value: null, unit: '', description: '',
  });
  const queryClient = useQueryClient();

  const { data: habitsData, isLoading } = useQuery({
    queryKey: ['habits-today'],
    queryFn: habitAPI.getTodaySummary,
  });

  const checkInMutation = useMutation({
    mutationFn: (habitId) => habitAPI.checkIn(habitId, {}),
    onSuccess: (data, habitId) => {
      queryClient.invalidateQueries({ queryKey: ['habits-today'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(data?.message || 'تم تسجيل العادة 🎉');
    },
    onError: () => toast.error('فشل في تسجيل العادة'),
  });

  const createMutation = useMutation({
    mutationFn: habitAPI.createHabit,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['habits-today'] });
      toast.success(data?.message || 'تمت إضافة العادة 💪');
      setShowAdd(false);
      setNewHabit({ name: '', name_ar: '', category: 'health', icon: '⭐', color: '#6C63FF', frequency: 'daily', target_time: '', duration_minutes: 30, target_value: null, unit: '', description: '' });
    },
  });

  const summary = habitsData?.data;
  const habits = summary?.habits || [];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">العادات اليومية</h2>
          <p className="text-sm text-gray-400">بناء حياة أفضل خطوة بخطوة</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
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
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-36 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <AnimatePresence>
            {habits.map((habit, idx) => (
              <motion.div
                key={habit.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.05 }}
                className={`glass-card p-4 cursor-pointer transition-all ${
                  habit.completed_today
                    ? 'bg-gradient-to-br from-primary-500/20 to-green-500/10 border-primary-500/30'
                    : 'hover:border-primary-500/20'
                }`}
                onClick={() => !habit.completed_today && checkInMutation.mutate(habit.id)}
              >
                {/* Habit Icon */}
                <div className="flex items-center justify-between mb-3">
                  <div className={`habit-circle ${habit.completed_today ? 'completed' : ''}`}>
                    {habit.completed_today ? '✅' : habit.icon || '⭐'}
                  </div>
                  {habit.current_streak > 0 && (
                    <div className="streak-badge">
                      🔥 {habit.current_streak}
                    </div>
                  )}
                </div>

                {/* Habit Name */}
                <h4 className="font-semibold text-sm text-white mb-1 truncate">{habit.name_ar || habit.name}</h4>
                <p className="text-xs text-gray-500">{CATEGORIES_AR[habit.category] || habit.category}</p>

                {/* Target */}
                {habit.target_time && (
                  <p className="text-xs text-gray-500 mt-1">⏰ {habit.target_time}</p>
                )}

                {/* Status */}
                <div className="mt-3">
                  {habit.completed_today ? (
                    <div className="text-xs text-green-400 flex items-center gap-1">
                      <CheckCircle2 size={12} /> أنجزت اليوم
                    </div>
                  ) : (
                    <div className="text-xs text-primary-400 bg-primary-500/10 px-2 py-1 rounded-lg text-center">
                      اضغط للإنجاز
                    </div>
                  )}
                </div>

                {/* Completion rate */}
                {habit.completion_rate > 0 && (
                  <div className="mt-2 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${habit.completion_rate}%` }}></div>
                    </div>
                    <span className="text-xs text-gray-500">{Math.round(habit.completion_rate)}%</span>
                  </div>
                )}
              </motion.div>
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
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="glass-card p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white">عادة جديدة 💪</h3>
                <button onClick={() => setShowAdd(false)} className="p-1 text-gray-400 hover:text-white"><X size={20} /></button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">الاسم بالعربية</label>
                    <input value={newHabit.name_ar} onChange={e => setNewHabit({...newHabit, name_ar: e.target.value, name: e.target.value})}
                      className="input-field" placeholder="مثال: شرب الماء" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">التصنيف</label>
                    <select value={newHabit.category} onChange={e => setNewHabit({...newHabit, category: e.target.value})}
                      className="input-field">
                      {Object.entries(CATEGORIES_AR).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                </div>

                {/* Icon picker */}
                <div>
                  <label className="text-xs text-gray-400 block mb-2">الأيقونة</label>
                  <div className="flex flex-wrap gap-2">
                    {HABIT_ICONS.map(icon => (
                      <button key={icon} onClick={() => setNewHabit({...newHabit, icon})}
                        className={`text-2xl p-2 rounded-lg transition-all ${newHabit.icon === icon ? 'bg-primary-500/30 border border-primary-500' : 'bg-white/5 hover:bg-white/10'}`}>
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">وقت الهدف</label>
                    <input type="time" value={newHabit.target_time} onChange={e => setNewHabit({...newHabit, target_time: e.target.value})}
                      className="input-field" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">المدة (دقيقة)</label>
                    <input type="number" value={newHabit.duration_minutes} onChange={e => setNewHabit({...newHabit, duration_minutes: parseInt(e.target.value)})}
                      className="input-field" />
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1">وصف العادة</label>
                  <textarea value={newHabit.description} onChange={e => setNewHabit({...newHabit, description: e.target.value})}
                    className="input-field h-16 resize-none" placeholder="لماذا تريد هذه العادة؟" />
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1">إلغاء</button>
                  <button onClick={() => createMutation.mutate(newHabit)} disabled={!newHabit.name_ar || createMutation.isPending}
                    className="btn-primary flex-1">
                    {createMutation.isPending ? '...' : 'إضافة العادة 💪'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
