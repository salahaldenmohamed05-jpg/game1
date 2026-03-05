/**
 * Tasks View - Full Task Management
 * ====================================
 * إدارة المهام الكاملة
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, CheckCircle, Clock, Trash2, Brain, X, Calendar, Tag } from 'lucide-react';
import { taskAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const CATEGORIES = ['work', 'personal', 'health', 'learning', 'finance', 'social', 'other'];
const CATEGORIES_AR = { work: 'عمل', personal: 'شخصي', health: 'صحة', learning: 'تعلم', finance: 'مالي', social: 'اجتماعي', other: 'أخرى' };
const PRIORITIES = ['urgent', 'high', 'medium', 'low'];
const PRIORITIES_AR = { urgent: 'عاجل', high: 'عالي', medium: 'متوسط', low: 'منخفض' };
const PRIORITY_COLORS = { urgent: 'text-red-400 bg-red-500/10', high: 'text-orange-400 bg-orange-500/10', medium: 'text-yellow-400 bg-yellow-500/10', low: 'text-green-400 bg-green-500/10' };

export default function TasksView() {
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState('all');
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [breakdownTask, setBreakdownTask] = useState({ title: '', description: '' });
  const [newTask, setNewTask] = useState({ title: '', description: '', category: 'personal', priority: 'medium', due_date: '', estimated_duration: '' });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filter],
    queryFn: () => taskAPI.getTasks(filter !== 'all' ? { status: filter } : {}),
  });

  const createMutation = useMutation({
    mutationFn: taskAPI.createTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('تم إنشاء المهمة ✅');
      setShowAdd(false);
      setNewTask({ title: '', description: '', category: 'personal', priority: 'medium', due_date: '', estimated_duration: '' });
    },
    onError: (err) => toast.error(err.message || 'فشل في إنشاء المهمة'),
  });

  const completeMutation = useMutation({
    mutationFn: (id) => taskAPI.completeTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('أحسنت! تم إتمام المهمة 🎉');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: taskAPI.deleteTask,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('تم حذف المهمة');
    },
  });

  const breakdownMutation = useMutation({
    mutationFn: (data) => taskAPI.aiBreakdown(data),
    onSuccess: (data) => {
      toast.success('تم تقسيم المهمة بالذكاء الاصطناعي 🧠');
    },
  });

  const tasks = data?.data?.tasks || [];

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">المهام</h2>
          <p className="text-sm text-gray-400">{tasks.length} مهمة</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBreakdown(true)}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-gray-300 px-4 py-2 rounded-xl text-sm transition-all"
          >
            <Brain size={16} />
            تقسيم ذكي
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
            <Plus size={16} /> مهمة جديدة
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['all', 'pending', 'in_progress', 'completed'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-all ${
              filter === f ? 'bg-primary-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {{ all: 'الكل', pending: 'معلقة', in_progress: 'جارية', completed: 'مكتملة' }[f]}
          </button>
        ))}
      </div>

      {/* Tasks List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : tasks.length > 0 ? (
        <AnimatePresence>
          {tasks.map((task, idx) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ delay: idx * 0.03 }}
              className={`glass-card p-4 priority-${task.priority}`}
            >
              <div className="flex items-start gap-3">
                <button
                  onClick={() => completeMutation.mutate(task.id)}
                  disabled={task.status === 'completed'}
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all mt-0.5 ${
                    task.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-gray-600 hover:border-primary-500'
                  }`}
                >
                  {task.status === 'completed' && <CheckCircle size={14} className="text-white" />}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`font-medium text-sm ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-white'}`}>
                      {task.title}
                    </p>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLORS[task.priority]}`}>
                        {PRIORITIES_AR[task.priority]}
                      </span>
                    </div>
                  </div>

                  {task.description && (
                    <p className="text-xs text-gray-500 mt-1 truncate">{task.description}</p>
                  )}

                  <div className="flex items-center gap-3 mt-2 flex-wrap">
                    <span className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">
                      {CATEGORIES_AR[task.category] || task.category}
                    </span>
                    {task.due_date && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock size={10} />
                        {new Date(task.due_date).toLocaleDateString('ar')}
                      </span>
                    )}
                    {task.estimated_duration && (
                      <span className="text-xs text-gray-500">⏱ {task.estimated_duration} دقيقة</span>
                    )}
                    {task.ai_priority_score > 0 && (
                      <span className="text-xs text-primary-400 flex items-center gap-1">
                        <Brain size={10} /> {Math.round(task.ai_priority_score)}
                      </span>
                    )}
                  </div>
                </div>

                <button
                  onClick={() => deleteMutation.mutate(task.id)}
                  className="p-1 text-gray-600 hover:text-red-400 transition-colors flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      ) : (
        <div className="text-center py-16">
          <CheckCircle size={48} className="mx-auto mb-4 text-gray-700" />
          <h3 className="text-lg font-semibold text-gray-400">لا توجد مهام</h3>
          <p className="text-sm text-gray-600 mt-1">أضف مهمة جديدة للبدء</p>
        </div>
      )}

      {/* Add Task Modal */}
      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setShowAdd(false)}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
              className="glass-card p-6 w-full max-w-lg">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white">مهمة جديدة ✨</h3>
                <button onClick={() => setShowAdd(false)} className="p-1 text-gray-400 hover:text-white"><X size={20} /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">عنوان المهمة *</label>
                  <input value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})}
                    className="input-field" placeholder="ما الذي تريد إنجازه؟" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">الوصف</label>
                  <textarea value={newTask.description} onChange={e => setNewTask({...newTask, description: e.target.value})}
                    className="input-field h-20 resize-none" placeholder="تفاصيل إضافية..." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">التصنيف</label>
                    <select value={newTask.category} onChange={e => setNewTask({...newTask, category: e.target.value})}
                      className="input-field">
                      {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORIES_AR[c]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">الأولوية</label>
                    <select value={newTask.priority} onChange={e => setNewTask({...newTask, priority: e.target.value})}
                      className="input-field">
                      {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITIES_AR[p]}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">الموعد النهائي</label>
                    <input type="datetime-local" value={newTask.due_date}
                      onChange={e => setNewTask({...newTask, due_date: e.target.value})}
                      className="input-field" dir="ltr" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">الوقت المقدر (دقائق)</label>
                    <input type="number" value={newTask.estimated_duration}
                      onChange={e => setNewTask({...newTask, estimated_duration: e.target.value})}
                      className="input-field" placeholder="30" />
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1">إلغاء</button>
                  <button
                    onClick={() => createMutation.mutate(newTask)}
                    disabled={!newTask.title || createMutation.isPending}
                    className="btn-primary flex-1"
                  >
                    {createMutation.isPending ? '...' : 'إضافة المهمة ✅'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* AI Breakdown Modal */}
      <AnimatePresence>
        {showBreakdown && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={(e) => e.target === e.currentTarget && setShowBreakdown(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
              className="glass-card p-6 w-full max-w-lg">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Brain size={18} className="text-primary-400" /> تقسيم ذكي للمهمة</h3>
                <button onClick={() => setShowBreakdown(false)} className="p-1 text-gray-400 hover:text-white"><X size={20} /></button>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">عنوان المهمة الكبيرة</label>
                  <input value={breakdownTask.title} onChange={e => setBreakdownTask({...breakdownTask, title: e.target.value})}
                    className="input-field" placeholder="مثال: إتمام مشروع العمل" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">وصف المهمة</label>
                  <textarea value={breakdownTask.description} onChange={e => setBreakdownTask({...breakdownTask, description: e.target.value})}
                    className="input-field h-20 resize-none" placeholder="صف المهمة بالتفصيل..." />
                </div>

                {breakdownMutation.data?.data?.subtasks && (
                  <div className="bg-white/5 rounded-xl p-3">
                    <p className="text-xs font-semibold text-primary-400 mb-2">المهام الفرعية المقترحة:</p>
                    <div className="space-y-2">
                      {breakdownMutation.data.data.subtasks.map((st, i) => (
                        <div key={i} className="flex items-center gap-2 text-sm text-gray-300">
                          <span className="w-5 h-5 rounded-full bg-primary-500/20 text-primary-400 text-xs flex items-center justify-center">{i+1}</span>
                          <span>{st.title}</span>
                          {st.estimated_duration && <span className="text-xs text-gray-500 mr-auto">{st.estimated_duration} د</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  onClick={() => breakdownMutation.mutate(breakdownTask)}
                  disabled={!breakdownTask.title || breakdownMutation.isPending}
                  className="btn-primary w-full"
                >
                  {breakdownMutation.isPending ? '⏳ جارٍ التحليل...' : '🧠 تقسيم بالذكاء الاصطناعي'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
