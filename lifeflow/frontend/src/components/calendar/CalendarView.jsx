/**
 * CalendarView Component
 * =======================
 * عرض التقويم - إدارة الأحداث والمهام المجدولة
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ChevronRight, ChevronLeft, Plus, Calendar, Clock,
  Check, X, Edit2, Repeat, Trash2, RefreshCw
} from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

// Helper to get auth headers
const getHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('lifeflow_token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

// Arabic month names
const MONTHS_AR = [
  'يناير','فبراير','مارس','أبريل','مايو','يونيو',
  'يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'
];

// Arabic day names
const DAYS_AR = ['أح','إث','ثل','أر','خم','جم','سب'];

const CATEGORY_COLORS = {
  work: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', dot: 'bg-blue-500' },
  personal: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', dot: 'bg-purple-500' },
  habit: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', dot: 'bg-green-500' },
  health: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', dot: 'bg-red-500' },
  social: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', border: 'border-yellow-500/30', dot: 'bg-yellow-500' },
};

export default function CalendarView() {
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null);
  const [viewMode, setViewMode] = useState('month'); // 'month' | 'week'

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Fetch tasks for current month (used as calendar events)
  const { data: tasksData, isLoading } = useQuery({
    queryKey: ['calendar_tasks', year, month],
    queryFn: async () => {
      const start = new Date(year, month, 1).toISOString();
      const end = new Date(year, month + 1, 0).toISOString();
      const { data } = await axios.get(`${API}/tasks`, {
        headers: getHeaders(),
        params: { limit: 100 }
      });
      return data;
    },
  });

  const tasks = tasksData?.data?.tasks || [];

  // Group tasks by date
  const tasksByDate = tasks.reduce((acc, task) => {
    if (task.due_date) {
      const dateKey = new Date(task.due_date).toDateString();
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(task);
    }
    return acc;
  }, {});

  // Get days in month grid
  const getDaysInMonth = () => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days = [];

    // Fill start with empty slots
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    // Fill with actual days
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  };

  const days = getDaysInMonth();
  const selectedDateTasks = tasksByDate[selectedDate.toDateString()] || [];

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const isToday = (date) => date && date.toDateString() === new Date().toDateString();
  const isSelected = (date) => date && date.toDateString() === selectedDate.toDateString();
  const hasEvents = (date) => date && tasksByDate[date.toDateString()]?.length > 0;

  // Mark task complete
  const completeMutation = useMutation({
    mutationFn: async (taskId) => {
      const { data } = await axios.patch(`${API}/tasks/${taskId}`,
        { status: 'completed' },
        { headers: getHeaders() }
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['calendar_tasks']);
      queryClient.invalidateQueries(['dashboard']);
      toast.success('تم إكمال المهمة ✓');
    },
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Calendar className="text-primary-400" size={24} />
            التقويم
          </h1>
          <p className="text-sm text-gray-400 mt-1">إدارة وجدولة مهامك وأحداثك</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View Mode Toggle */}
          <div className="flex bg-white/5 rounded-xl p-1">
            {['month', 'week'].map(mode => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                  viewMode === mode
                    ? 'bg-primary-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {mode === 'month' ? 'شهر' : 'أسبوع'}
              </button>
            ))}
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Plus size={16} />
            إضافة حدث
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-2">
          <div className="glass-card p-5">
            {/* Month Navigation */}
            <div className="flex items-center justify-between mb-6">
              <button onClick={prevMonth} className="p-2 hover:bg-white/10 rounded-lg transition-all text-gray-400 hover:text-white">
                <ChevronRight size={20} />
              </button>
              <h2 className="text-lg font-bold text-white">
                {MONTHS_AR[month]} {year}
              </h2>
              <button onClick={nextMonth} className="p-2 hover:bg-white/10 rounded-lg transition-all text-gray-400 hover:text-white">
                <ChevronLeft size={20} />
              </button>
            </div>

            {/* Day Headers */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {DAYS_AR.map(day => (
                <div key={day} className="text-center text-xs font-semibold text-gray-500 py-2">{day}</div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((date, idx) => (
                <motion.button
                  key={idx}
                  onClick={() => date && setSelectedDate(date)}
                  whileHover={date ? { scale: 1.05 } : {}}
                  whileTap={date ? { scale: 0.95 } : {}}
                  className={`
                    relative h-12 rounded-xl text-sm font-medium transition-all
                    ${!date ? 'invisible' : 'cursor-pointer'}
                    ${isSelected(date) ? 'bg-primary-500 text-white shadow-lg shadow-primary-500/30' :
                      isToday(date) ? 'bg-primary-500/20 text-primary-400 border border-primary-500/40' :
                      'text-gray-300 hover:bg-white/10'}
                  `}
                >
                  {date && (
                    <>
                      <span>{date.getDate()}</span>
                      {/* Event dots */}
                      {hasEvents(date) && (
                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                          {(tasksByDate[date.toDateString()] || []).slice(0, 3).map((task, i) => (
                            <div
                              key={i}
                              className={`w-1.5 h-1.5 rounded-full ${
                                task.category === 'work' ? 'bg-blue-400' :
                                task.category === 'habit' ? 'bg-green-400' :
                                task.priority === 'urgent' ? 'bg-red-400' : 'bg-purple-400'
                              }`}
                            />
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </motion.button>
              ))}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/5 flex-wrap">
              {[
                { label: 'عمل', color: 'bg-blue-400' },
                { label: 'شخصي', color: 'bg-purple-400' },
                { label: 'عادة', color: 'bg-green-400' },
                { label: 'عاجل', color: 'bg-red-400' },
              ].map(({ label, color }) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-gray-400">
                  <div className={`w-2 h-2 rounded-full ${color}`} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Selected Day Events */}
        <div className="space-y-4">
          {/* Selected Date Header */}
          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-white text-lg">
                {selectedDate.getDate()} {MONTHS_AR[selectedDate.getMonth()]}
              </h3>
              <button
                onClick={() => { setEditingEvent(null); setShowAddModal(true); }}
                className="text-primary-400 hover:text-primary-300 transition-colors"
              >
                <Plus size={18} />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              {selectedDateTasks.length} {selectedDateTasks.length === 1 ? 'حدث' : 'أحداث'}
            </p>
          </div>

          {/* Events List */}
          <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scroll">
            <AnimatePresence>
              {selectedDateTasks.length > 0 ? (
                selectedDateTasks.map((task, idx) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`glass-card p-4 border ${
                      CATEGORY_COLORS[task.category]?.border || 'border-white/10'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        onClick={() => task.status !== 'completed' && completeMutation.mutate(task.id)}
                        className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                          task.status === 'completed'
                            ? 'bg-green-500 border-green-500'
                            : 'border-white/30 hover:border-primary-500'
                        }`}
                      >
                        {task.status === 'completed' && <Check size={10} className="text-white" />}
                      </button>

                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${
                          task.status === 'completed' ? 'line-through text-gray-500' : 'text-white'
                        }`}>
                          {task.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {task.due_date && (
                            <span className="text-xs text-gray-500 flex items-center gap-1">
                              <Clock size={10} />
                              {new Date(task.due_date).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                          {task.category && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              CATEGORY_COLORS[task.category]?.bg || 'bg-white/10'
                            } ${CATEGORY_COLORS[task.category]?.text || 'text-gray-400'}`}>
                              {task.category === 'work' ? 'عمل' :
                               task.category === 'personal' ? 'شخصي' :
                               task.category === 'habit' ? 'عادة' :
                               task.category === 'health' ? 'صحة' : task.category}
                            </span>
                          )}
                          {task.is_recurring && (
                            <Repeat size={10} className="text-gray-500" />
                          )}
                        </div>
                      </div>

                      <div className={`w-2 h-2 rounded-full flex-shrink-0 mt-1.5 ${
                        task.priority === 'urgent' ? 'bg-red-500' :
                        task.priority === 'high' ? 'bg-orange-500' :
                        task.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-500'
                      }`} />
                    </div>
                  </motion.div>
                ))
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass-card p-8 text-center"
                >
                  <Calendar size={32} className="mx-auto mb-3 text-gray-600" />
                  <p className="text-sm text-gray-500">لا توجد أحداث في هذا اليوم</p>
                  <button
                    onClick={() => setShowAddModal(true)}
                    className="mt-3 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                  >
                    + إضافة حدث جديد
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Upcoming Events */}
          <UpcomingSection tasks={tasks} />
        </div>
      </div>

      {/* Add Event Modal */}
      <AnimatePresence>
        {showAddModal && (
          <AddEventModal
            onClose={() => { setShowAddModal(false); setEditingEvent(null); }}
            selectedDate={selectedDate}
            onSuccess={() => {
              queryClient.invalidateQueries(['calendar_tasks']);
              setShowAddModal(false);
              toast.success('تم إضافة الحدث ✓');
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// UpcomingSection component
function UpcomingSection({ tasks }) {
  const upcoming = tasks
    .filter(t => t.due_date && new Date(t.due_date) > new Date() && t.status !== 'completed')
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date))
    .slice(0, 5);

  if (upcoming.length === 0) return null;

  return (
    <div className="glass-card p-4">
      <h3 className="text-sm font-semibold text-gray-400 mb-3">القادم قريباً</h3>
      <div className="space-y-2">
        {upcoming.map(task => (
          <div key={task.id} className="flex items-center gap-2 py-1">
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              task.priority === 'urgent' ? 'bg-red-500' :
              task.priority === 'high' ? 'bg-orange-500' : 'bg-primary-500'
            }`} />
            <span className="text-xs text-gray-300 flex-1 truncate">{task.title}</span>
            <span className="text-xs text-gray-500 flex-shrink-0">
              {new Date(task.due_date).toLocaleDateString('ar', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// AddEventModal component
function AddEventModal({ onClose, selectedDate, onSuccess }) {
  const [form, setForm] = useState({
    title: '',
    description: '',
    due_date: selectedDate.toISOString().slice(0, 10),
    due_time: '09:00',
    priority: 'medium',
    category: 'personal',
    is_recurring: false,
    recurrence_pattern: 'daily',
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      toast.error('الرجاء إدخال عنوان الحدث');
      return;
    }
    try {
      const dueDate = new Date(`${form.due_date}T${form.due_time}:00`);
      await axios.post(`${API}/tasks`, {
        ...form,
        due_date: dueDate.toISOString(),
      }, { headers: getHeaders() });
      onSuccess();
    } catch (err) {
      toast.error('حدث خطأ، حاول مرة أخرى');
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="glass-card p-6 w-full max-w-md"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-white">إضافة حدث جديد</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">العنوان *</label>
            <input
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="عنوان الحدث أو المهمة..."
              className="input-field w-full"
              autoFocus
            />
          </div>

          {/* Date & Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">التاريخ</label>
              <input
                type="date"
                value={form.due_date}
                onChange={e => setForm({ ...form, due_date: e.target.value })}
                className="input-field w-full"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">الوقت</label>
              <input
                type="time"
                value={form.due_time}
                onChange={e => setForm({ ...form, due_time: e.target.value })}
                className="input-field w-full"
              />
            </div>
          </div>

          {/* Category & Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">الفئة</label>
              <select
                value={form.category}
                onChange={e => setForm({ ...form, category: e.target.value })}
                className="input-field w-full"
              >
                <option value="personal">شخصي</option>
                <option value="work">عمل</option>
                <option value="health">صحة</option>
                <option value="social">اجتماعي</option>
                <option value="habit">عادة</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">الأولوية</label>
              <select
                value={form.priority}
                onChange={e => setForm({ ...form, priority: e.target.value })}
                className="input-field w-full"
              >
                <option value="low">منخفضة</option>
                <option value="medium">متوسطة</option>
                <option value="high">عالية</option>
                <option value="urgent">عاجلة</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm text-gray-400 mb-1">الوصف (اختياري)</label>
            <textarea
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="وصف إضافي..."
              rows={2}
              className="input-field w-full resize-none"
            />
          </div>

          {/* Recurring */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_recurring}
              onChange={e => setForm({ ...form, is_recurring: e.target.checked })}
              className="w-4 h-4 accent-primary-500"
            />
            <span className="text-sm text-gray-300">حدث متكرر</span>
          </label>

          {form.is_recurring && (
            <select
              value={form.recurrence_pattern}
              onChange={e => setForm({ ...form, recurrence_pattern: e.target.value })}
              className="input-field w-full"
            >
              <option value="daily">يومي</option>
              <option value="weekly">أسبوعي</option>
              <option value="monthly">شهري</option>
              <option value="weekdays">أيام الأسبوع فقط</option>
            </select>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1">
              إضافة الحدث
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1">
              إلغاء
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
