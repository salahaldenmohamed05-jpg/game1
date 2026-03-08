/**
 * Enhanced Tasks View - Daily Task Tracker with Sub-tasks & Life Organization
 * =============================================================================
 * إدارة المهام اليومية المتكاملة مع المهام الفرعية وشريط التقدم
 * تغطي مجالات الحياة: الجامعة، العمل، الصحة، التطوير الشخصي
 */

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, CheckCircle, Clock, Trash2, Brain, X, ChevronDown, ChevronRight,
  Tag, Target, BookOpen, Briefcase, Heart, Dumbbell, DollarSign,
  Users, Star, AlertCircle, MoreVertical, GripVertical, Layers,
  TrendingUp, Calendar, Filter, BarChart3, Zap, Check
} from 'lucide-react';
import { taskAPI } from '../../utils/api';
import toast from 'react-hot-toast';

// ─── Constants ────────────────────────────────────────────────────────────────

const LIFE_AREAS = {
  university: { label: 'الجامعة', icon: BookOpen, color: '#6C63FF', bg: 'rgba(108,99,255,0.15)', emoji: '🎓' },
  work:       { label: 'العمل',   icon: Briefcase, color: '#10B981', bg: 'rgba(16,185,129,0.15)', emoji: '💼' },
  health:     { label: 'الصحة',  icon: Heart,     color: '#EF4444', bg: 'rgba(239,68,68,0.15)', emoji: '❤️' },
  fitness:    { label: 'الرياضة', icon: Dumbbell, color: '#F59E0B', bg: 'rgba(245,158,11,0.15)', emoji: '💪' },
  finance:    { label: 'المالية', icon: DollarSign,color: '#84CC16', bg: 'rgba(132,204,22,0.15)', emoji: '💰' },
  personal:   { label: 'شخصي',   icon: Star,      color: '#EC4899', bg: 'rgba(236,72,153,0.15)', emoji: '✨' },
  social:     { label: 'اجتماعي', icon: Users,     color: '#06B6D4', bg: 'rgba(6,182,212,0.15)', emoji: '🤝' },
  learning:   { label: 'التطوير', icon: Brain,     color: '#8B5CF6', bg: 'rgba(139,92,246,0.15)', emoji: '📚' },
  other:      { label: 'أخرى',   icon: Tag,       color: '#6B7280', bg: 'rgba(107,114,128,0.15)', emoji: '📌' },
};

const PRIORITIES = {
  urgent: { label: 'عاجل',    color: 'text-red-400',    bg: 'bg-red-500/15',    border: 'border-red-500/30',  dot: '#EF4444' },
  high:   { label: 'عالي',    color: 'text-orange-400', bg: 'bg-orange-500/15', border: 'border-orange-500/30', dot: '#F97316' },
  medium: { label: 'متوسط',   color: 'text-yellow-400', bg: 'bg-yellow-500/15', border: 'border-yellow-500/30', dot: '#EAB308' },
  low:    { label: 'منخفض',   color: 'text-green-400',  bg: 'bg-green-500/15',  border: 'border-green-500/30',  dot: '#22C55E' },
};

const EMPTY_TASK = {
  title: '', description: '', category: 'personal', priority: 'medium',
  due_date: '', estimated_duration: '', tags: '', notes: '',
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function TasksView() {
  const [filter, setFilter] = useState('all');
  const [areaFilter, setAreaFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [addingSubtaskFor, setAddingSubtaskFor] = useState(null);
  const [expandedTasks, setExpandedTasks] = useState(new Set());
  const [newTask, setNewTask] = useState(EMPTY_TASK);
  const [newSubtask, setNewSubtask] = useState({ title: '', estimated_duration: '' });
  const [breakdownTask, setBreakdownTask] = useState({ title: '', description: '' });
  const queryClient = useQueryClient();

  // ── Queries ──
  const { data, isLoading } = useQuery({
    queryKey: ['tasks', filter, areaFilter],
    queryFn: () => {
      const params = {};
      if (filter !== 'all') params.status = filter;
      if (areaFilter !== 'all') params.category = areaFilter;
      return taskAPI.getTasks(Object.keys(params).length ? params : {});
    },
  });

  // ── Mutations ──
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const createMutation = useMutation({
    mutationFn: taskAPI.createTask,
    onSuccess: () => { invalidate(); toast.success('تم إنشاء المهمة ✅'); setShowAdd(false); setNewTask(EMPTY_TASK); },
    onError: (e) => toast.error(e.message || 'فشل في إنشاء المهمة'),
  });

  const createSubtaskMutation = useMutation({
    mutationFn: (data) => taskAPI.createTask(data),
    onSuccess: () => { invalidate(); toast.success('تم إضافة المهمة الفرعية'); setAddingSubtaskFor(null); setNewSubtask({ title: '', estimated_duration: '' }); },
    onError: (e) => toast.error(e.message || 'فشل في إضافة المهمة الفرعية'),
  });

  const completeMutation = useMutation({
    mutationFn: (id) => taskAPI.completeTask(id),
    onSuccess: () => { invalidate(); toast.success('أحسنت! 🎉'); },
  });

  const deleteMutation = useMutation({
    mutationFn: taskAPI.deleteTask,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); toast.success('تم الحذف'); },
  });

  const breakdownMutation = useMutation({
    mutationFn: (data) => taskAPI.aiBreakdown(data),
    onSuccess: () => toast.success('تم التقسيم 🧠'),
  });

  // ── Derived data ──
  const allTasks = data?.data?.tasks || [];

  // Separate parent tasks and subtasks
  const parentTasks = allTasks.filter(t => !t.parent_task_id);
  const subtasksByParent = allTasks.reduce((acc, t) => {
    if (t.parent_task_id) {
      if (!acc[t.parent_task_id]) acc[t.parent_task_id] = [];
      acc[t.parent_task_id].push(t);
    }
    return acc;
  }, {});

  // Progress stats
  const stats = useMemo(() => {
    const total = parentTasks.length;
    const completed = parentTasks.filter(t => t.status === 'completed').length;
    const urgent = parentTasks.filter(t => t.priority === 'urgent' && t.status !== 'completed').length;
    const today = parentTasks.filter(t => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    }).length;
    return { total, completed, urgent, today, rate: total > 0 ? Math.round((completed / total) * 100) : 0 };
  }, [parentTasks]);

  const toggleExpand = (id) => {
    setExpandedTasks(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAddSubtask = (parentTask) => {
    if (!newSubtask.title.trim()) return;
    createSubtaskMutation.mutate({
      title: newSubtask.title,
      estimated_duration: newSubtask.estimated_duration || undefined,
      category: parentTask.category,
      priority: parentTask.priority,
      parent_task_id: parentTask.id,
    });
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto" dir="rtl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Target size={24} className="text-primary-400" />
            إدارة المهام
          </h2>
          <p className="text-sm text-gray-400 mt-0.5">
            {stats.completed}/{stats.total} مهمة مكتملة
            {stats.urgent > 0 && <span className="text-red-400 mr-2">· {stats.urgent} عاجلة</span>}
            {stats.today > 0 && <span className="text-yellow-400 mr-2">· {stats.today} لليوم</span>}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowBreakdown(true)}
            className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-gray-300 px-3 py-2 rounded-xl text-sm transition-all"
          >
            <Brain size={15} />
            <span className="hidden sm:inline">تقسيم ذكي</span>
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-primary text-sm flex items-center gap-1.5">
            <Plus size={16} /> مهمة جديدة
          </button>
        </div>
      </div>

      {/* ── Progress Bar ── */}
      {stats.total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-400 flex items-center gap-1.5">
              <BarChart3 size={14} className="text-primary-400" />
              التقدم اليومي
            </span>
            <span className="text-sm font-bold" style={{ color: stats.rate >= 70 ? '#10B981' : stats.rate >= 40 ? '#F59E0B' : '#EF4444' }}>
              {stats.rate}%
            </span>
          </div>
          <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${stats.rate}%` }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: `linear-gradient(90deg, ${stats.rate >= 70 ? '#10B981' : stats.rate >= 40 ? '#F59E0B' : '#6C63FF'}, ${stats.rate >= 70 ? '#34D399' : stats.rate >= 40 ? '#FCD34D' : '#8B5CF6'})` }}
            />
          </div>
          <div className="grid grid-cols-4 gap-2 mt-3">
            {[
              { label: 'الكل', val: stats.total, color: 'text-gray-400' },
              { label: 'مكتملة', val: stats.completed, color: 'text-green-400' },
              { label: 'عاجلة', val: stats.urgent, color: 'text-red-400' },
              { label: 'اليوم', val: stats.today, color: 'text-yellow-400' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <div className={`text-lg font-bold ${s.color}`}>{s.val}</div>
                <div className="text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Life Area Filters ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        <button
          onClick={() => setAreaFilter('all')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${areaFilter === 'all' ? 'bg-primary-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
        >
          🌟 الكل
        </button>
        {Object.entries(LIFE_AREAS).map(([key, area]) => (
          <button
            key={key}
            onClick={() => setAreaFilter(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
              areaFilter === key ? 'text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
            style={areaFilter === key ? { background: area.color } : {}}
          >
            {area.emoji} {area.label}
          </button>
        ))}
      </div>

      {/* ── Status Filters ── */}
      <div className="flex gap-2">
        {[
          { key: 'all', label: 'الكل' },
          { key: 'pending', label: 'معلقة' },
          { key: 'in_progress', label: 'جارية' },
          { key: 'completed', label: 'مكتملة' },
        ].map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-all ${filter === f.key ? 'bg-primary-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* ── Task List ── */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : parentTasks.length > 0 ? (
        <AnimatePresence mode="popLayout">
          {parentTasks.map((task, idx) => {
            const subtasks = subtasksByParent[task.id] || [];
            const area = LIFE_AREAS[task.category] || LIFE_AREAS.other;
            const priority = PRIORITIES[task.priority] || PRIORITIES.medium;
            const isExpanded = expandedTasks.has(task.id);
            const subtasksDone = subtasks.filter(s => s.status === 'completed').length;
            const subtaskProgress = subtasks.length > 0 ? Math.round((subtasksDone / subtasks.length) * 100) : null;
            const isOverdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== 'completed';

            return (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20, height: 0 }}
                transition={{ delay: idx * 0.02 }}
                className="glass-card overflow-hidden"
                style={{ borderLeft: `3px solid ${area.color}` }}
              >
                {/* Main task row */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Complete button */}
                    <button
                      onClick={() => task.status !== 'completed' && completeMutation.mutate(task.id)}
                      className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all mt-0.5 ${
                        task.status === 'completed'
                          ? 'bg-green-500 border-green-500'
                          : `border-gray-600 hover:border-[${area.color}]`
                      }`}
                      style={{ borderColor: task.status !== 'completed' ? undefined : undefined }}
                    >
                      {task.status === 'completed' && <Check size={13} className="text-white" />}
                    </button>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`font-semibold text-sm leading-snug ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-white'}`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {/* Priority badge */}
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${priority.color} ${priority.bg} ${priority.border}`}>
                            {priority.label}
                          </span>
                          {isOverdue && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/30">
                              متأخرة!
                            </span>
                          )}
                        </div>
                      </div>

                      {task.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>
                      )}

                      {/* Meta row */}
                      <div className="flex items-center gap-3 mt-2 flex-wrap">
                        {/* Area badge */}
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: area.bg, color: area.color }}>
                          {area.emoji} {area.label}
                        </span>
                        {task.due_date && (
                          <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-400' : 'text-gray-500'}`}>
                            <Calendar size={10} />
                            {new Date(task.due_date).toLocaleDateString('ar', { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                        {task.estimated_duration && (
                          <span className="text-xs text-gray-500 flex items-center gap-1">
                            <Clock size={10} />
                            {task.estimated_duration} د
                          </span>
                        )}
                        {task.ai_priority_score > 0 && (
                          <span className="text-xs text-primary-400 flex items-center gap-1">
                            <Zap size={10} /> {Math.round(task.ai_priority_score)}
                          </span>
                        )}
                      </div>

                      {/* Sub-tasks progress bar */}
                      {subtasks.length > 0 && (
                        <div className="mt-2.5">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-gray-500">المهام الفرعية: {subtasksDone}/{subtasks.length}</span>
                            <span className="text-xs font-semibold" style={{ color: subtaskProgress >= 100 ? '#10B981' : '#6C63FF' }}>
                              {subtaskProgress}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${subtaskProgress}%`, background: subtaskProgress >= 100 ? '#10B981' : '#6C63FF' }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {subtasks.length > 0 && (
                        <button
                          onClick={() => toggleExpand(task.id)}
                          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                      )}
                      <button
                        onClick={() => { setAddingSubtaskFor(addingSubtaskFor === task.id ? null : task.id); }}
                        className="p-1.5 rounded-lg text-gray-500 hover:text-primary-400 hover:bg-primary-500/10 transition-colors"
                        title="إضافة مهمة فرعية"
                      >
                        <Layers size={13} />
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(task.id)}
                        className="p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Add Sub-task inline form */}
                <AnimatePresence>
                  {addingSubtaskFor === task.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="px-4 pb-3 border-t border-white/5 pt-3"
                      style={{ marginRight: '2.75rem' }}
                    >
                      <div className="flex gap-2">
                        <input
                          value={newSubtask.title}
                          onChange={e => setNewSubtask({ ...newSubtask, title: e.target.value })}
                          onKeyDown={e => e.key === 'Enter' && handleAddSubtask(task)}
                          placeholder="عنوان المهمة الفرعية..."
                          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/50"
                          autoFocus
                        />
                        <input
                          value={newSubtask.estimated_duration}
                          onChange={e => setNewSubtask({ ...newSubtask, estimated_duration: e.target.value })}
                          placeholder="د"
                          type="number"
                          className="w-14 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-primary-500/50"
                        />
                        <button
                          onClick={() => handleAddSubtask(task)}
                          disabled={!newSubtask.title.trim() || createSubtaskMutation.isPending}
                          className="px-3 py-1.5 bg-primary-500/20 text-primary-300 rounded-lg text-xs hover:bg-primary-500/30 transition-colors"
                        >
                          <Plus size={14} />
                        </button>
                        <button
                          onClick={() => setAddingSubtaskFor(null)}
                          className="px-2 py-1.5 text-gray-500 hover:text-white transition-colors"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Sub-tasks list */}
                <AnimatePresence>
                  {(isExpanded || subtasks.length > 0) && subtasks.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: isExpanded ? 'auto' : subtasks.length > 0 ? 0 : 0 }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      {isExpanded && (
                        <div className="border-t border-white/5 pb-2">
                          {subtasks.map((subtask, si) => (
                            <div key={subtask.id} className="flex items-center gap-2.5 px-4 py-2 hover:bg-white/3 transition-colors group">
                              {/* indent line */}
                              <div className="w-4 flex-shrink-0 flex items-center justify-center">
                                <div className="w-px h-4 bg-white/10" />
                              </div>
                              <button
                                onClick={() => subtask.status !== 'completed' && completeMutation.mutate(subtask.id)}
                                className={`flex-shrink-0 w-4.5 h-4.5 rounded-full border flex items-center justify-center transition-all ${
                                  subtask.status === 'completed' ? 'bg-green-500 border-green-500' : 'border-gray-600 hover:border-primary-500'
                                }`}
                                style={{ width: '18px', height: '18px' }}
                              >
                                {subtask.status === 'completed' && <Check size={10} className="text-white" />}
                              </button>
                              <span className={`flex-1 text-xs ${subtask.status === 'completed' ? 'line-through text-gray-600' : 'text-gray-300'}`}>
                                {subtask.title}
                              </span>
                              {subtask.estimated_duration && (
                                <span className="text-xs text-gray-600">{subtask.estimated_duration}د</span>
                              )}
                              <button
                                onClick={() => deleteMutation.mutate(subtask.id)}
                                className="opacity-0 group-hover:opacity-100 p-1 text-gray-600 hover:text-red-400 transition-all"
                              >
                                <X size={11} />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-16"
        >
          <div className="text-6xl mb-4">📋</div>
          <h3 className="text-lg font-semibold text-gray-400 mb-2">
            {areaFilter !== 'all'
              ? `لا توجد مهام في ${LIFE_AREAS[areaFilter]?.label}`
              : 'لا توجد مهام'}
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            {filter === 'completed' ? 'لم تُكمل أي مهمة بعد' : 'أضف مهمة جديدة للبدء'}
          </p>
          {filter !== 'completed' && (
            <button onClick={() => setShowAdd(true)} className="btn-primary text-sm">
              <Plus size={16} /> إضافة مهمة
            </button>
          )}
        </motion.div>
      )}

      {/* ── Add Task Modal ── */}
      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={e => e.target === e.currentTarget && setShowAdd(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 20 }}
              className="glass-card p-6 w-full sm:max-w-xl rounded-t-2xl sm:rounded-2xl overflow-y-auto max-h-[95vh] sm:max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Plus size={18} className="text-primary-400" />
                  مهمة جديدة
                </h3>
                <button onClick={() => setShowAdd(false)} className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-4">
                {/* Title */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">عنوان المهمة *</label>
                  <input
                    value={newTask.title}
                    onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                    className="input-field text-base"
                    placeholder="ما الذي تريد إنجازه؟"
                    autoFocus
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">الوصف</label>
                  <textarea
                    value={newTask.description}
                    onChange={e => setNewTask({ ...newTask, description: e.target.value })}
                    className="input-field h-20 resize-none"
                    placeholder="تفاصيل إضافية..."
                  />
                </div>

                {/* Life Area */}
                <div>
                  <label className="text-xs text-gray-400 block mb-2">مجال الحياة</label>
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(LIFE_AREAS).map(([key, area]) => (
                      <button
                        key={key}
                        onClick={() => setNewTask({ ...newTask, category: key })}
                        className={`p-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-1.5 ${
                          newTask.category === key ? 'text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'
                        }`}
                        style={newTask.category === key ? { background: area.color } : {}}
                      >
                        <span>{area.emoji}</span>
                        <span>{area.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Priority */}
                <div>
                  <label className="text-xs text-gray-400 block mb-2">الأولوية</label>
                  <div className="flex gap-2">
                    {Object.entries(PRIORITIES).map(([key, p]) => (
                      <button
                        key={key}
                        onClick={() => setNewTask({ ...newTask, priority: key })}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${
                          newTask.priority === key ? `${p.color} ${p.bg} ${p.border}` : 'border-white/10 text-gray-500 hover:border-white/20'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Date & Duration */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">الموعد النهائي</label>
                    <input
                      type="datetime-local"
                      value={newTask.due_date}
                      onChange={e => setNewTask({ ...newTask, due_date: e.target.value })}
                      className="input-field text-sm"
                      dir="ltr"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">الوقت المقدر (دقيقة)</label>
                    <input
                      type="number"
                      value={newTask.estimated_duration}
                      onChange={e => setNewTask({ ...newTask, estimated_duration: e.target.value })}
                      className="input-field"
                      placeholder="30"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs text-gray-400 block mb-1">ملاحظات</label>
                  <input
                    value={newTask.notes}
                    onChange={e => setNewTask({ ...newTask, notes: e.target.value })}
                    className="input-field"
                    placeholder="ملاحظة سريعة..."
                  />
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowAdd(false)} className="btn-secondary flex-1">إلغاء</button>
                  <button
                    onClick={() => createMutation.mutate({
                      ...newTask,
                      tags: newTask.tags ? newTask.tags.split(',').map(t => t.trim()) : [],
                      estimated_duration: newTask.estimated_duration ? parseInt(newTask.estimated_duration) : undefined,
                      due_date: newTask.due_date || undefined,
                      notes: newTask.notes || undefined,
                    })}
                    disabled={!newTask.title || createMutation.isPending}
                    className="btn-primary flex-1"
                  >
                    {createMutation.isPending ? '...' : '✅ إضافة المهمة'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── AI Breakdown Modal ── */}
      <AnimatePresence>
        {showBreakdown && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
            onClick={e => e.target === e.currentTarget && setShowBreakdown(false)}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="glass-card p-6 w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl"
            >
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Brain size={18} className="text-primary-400" />
                  تقسيم ذكي للمهمة
                </h3>
                <button onClick={() => setShowBreakdown(false)} className="p-1.5 text-gray-400 hover:text-white"><X size={18} /></button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-1">المهمة الكبيرة</label>
                  <input
                    value={breakdownTask.title}
                    onChange={e => setBreakdownTask({ ...breakdownTask, title: e.target.value })}
                    className="input-field"
                    placeholder="مثال: إعداد تقرير المشروع النهائي"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-1">وصف المهمة</label>
                  <textarea
                    value={breakdownTask.description}
                    onChange={e => setBreakdownTask({ ...breakdownTask, description: e.target.value })}
                    className="input-field h-20 resize-none"
                    placeholder="صف المهمة بالتفصيل..."
                  />
                </div>

                {breakdownMutation.data?.data?.subtasks && (
                  <div className="bg-white/5 rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-primary-400 mb-3 flex items-center gap-1.5">
                      <Sparkles size={13} /> المهام الفرعية المقترحة:
                    </p>
                    {breakdownMutation.data.data.subtasks.map((st, i) => (
                      <div key={i} className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-white/5 transition-colors">
                        <span className="w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold flex-shrink-0"
                          style={{ background: 'rgba(108,99,255,0.2)', color: '#6C63FF' }}>
                          {i + 1}
                        </span>
                        <span className="flex-1 text-sm text-gray-300">{st.title}</span>
                        {st.estimated_duration && (
                          <span className="text-xs text-gray-500">{st.estimated_duration} د</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => breakdownMutation.mutate(breakdownTask)}
                  disabled={!breakdownTask.title || breakdownMutation.isPending}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  {breakdownMutation.isPending ? (
                    <><span className="animate-spin">⏳</span> جارٍ التحليل...</>
                  ) : (
                    <><Brain size={16} /> تقسيم بالذكاء الاصطناعي</>
                  )}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Missing Sparkles import used above
function Sparkles({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" {...props}>
      <path d="M12 3v1m0 16v1M3 12h1m16 0h1M5.636 5.636l.707.707m11.314 11.314.707.707M5.636 18.364l.707-.707m11.314-11.314.707-.707"/>
      <circle cx="12" cy="12" r="4"/>
    </svg>
  );
}
