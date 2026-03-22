/**
 * Calendar View
 * ===============
 * عرض التقويم مع المهام والعادات والمزاج
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { ChevronRight, ChevronLeft, Calendar, Clock, CheckCircle } from 'lucide-react';
import api from '../../utils/api';

const DAYS_AR = ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'];
const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

export default function CalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const startOfMonth = new Date(year, month, 1);
  const endOfMonth = new Date(year, month + 1, 0);
  const startDay = startOfMonth.getDay();
  const daysInMonth = endOfMonth.getDate();

  // Fetch tasks for the month
  const { data: tasksData } = useQuery({
    queryKey: ['calendar-tasks', year, month],
    queryFn: () => api.get(`/tasks?month=${year}-${String(month+1).padStart(2,'0')}&limit=100`),
  });

  // tasksData = Axios response: { data: { success, data: { tasks: [...] } } }
  const tasks = tasksData?.data?.data?.tasks || tasksData?.data?.tasks || [];

  // Group tasks by date
  const tasksByDate = {};
  tasks.forEach(task => {
    if (task.due_date) {
      const d = new Date(task.due_date).toDateString();
      if (!tasksByDate[d]) tasksByDate[d] = [];
      tasksByDate[d].push(task);
    }
  });

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const selectedKey = selectedDate.toDateString();
  const selectedTasks = tasksByDate[selectedKey] || [];

  const today = new Date();

  const cells = [];
  // Empty cells before month start
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="space-y-6 max-w-4xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-black text-white flex items-center gap-2">
          <Calendar size={22} />
          التقويم
        </h2>
      </div>

      <div className="glass-card p-5">
        {/* Month Navigation */}
        <div className="flex items-center justify-between mb-5">
          <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
            <ChevronRight size={20} />
          </button>
          <h3 className="text-white font-bold text-lg">{MONTHS_AR[month]} {year}</h3>
          <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-colors">
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* Day Headers */}
        <div className="grid grid-cols-7 mb-2">
          {DAYS_AR.map(d => (
            <div key={d} className="text-center text-xs text-gray-500 font-medium py-2">{d}</div>
          ))}
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (!day) return <div key={`empty-${i}`} />;

            const date = new Date(year, month, day);
            const dateKey = date.toDateString();
            const isToday = dateKey === today.toDateString();
            const isSelected = dateKey === selectedKey;
            const dayTasks = tasksByDate[dateKey] || [];
            const hasCompleted = dayTasks.some(t => t.status === 'completed');
            const hasPending = dayTasks.some(t => t.status !== 'completed');

            return (
              <motion.button
                key={day}
                whileHover={{ scale: 1.05 }}
                onClick={() => setSelectedDate(date)}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-xl text-sm font-medium transition-all ${
                  isSelected
                    ? 'bg-primary-500 text-white'
                    : isToday
                    ? 'bg-primary-500/20 text-primary-400 border border-primary-500/50'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
              >
                <span>{day}</span>
                {dayTasks.length > 0 && (
                  <div className="absolute bottom-1 flex gap-0.5">
                    {hasCompleted && <div className="w-1 h-1 rounded-full bg-green-400" />}
                    {hasPending && <div className="w-1 h-1 rounded-full bg-orange-400" />}
                  </div>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Selected Day Tasks */}
      <div className="glass-card p-5">
        <h3 className="text-white font-bold mb-4">
          مهام {selectedDate.toLocaleDateString('ar-SA', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h3>
        {selectedTasks.length === 0 ? (
          <p className="text-gray-400 text-sm text-center py-6">لا توجد مهام في هذا اليوم</p>
        ) : (
          <div className="space-y-2">
            {selectedTasks.map(task => (
              <div key={task.id} className={`flex items-center gap-3 p-3 rounded-xl border ${
                task.status === 'completed'
                  ? 'border-green-500/20 bg-green-500/5 opacity-70'
                  : 'border-white/5 bg-white/3'
              }`}>
                <CheckCircle
                  size={18}
                  className={task.status === 'completed' ? 'text-green-400' : 'text-gray-600'}
                />
                <div className="flex-1">
                  <p className={`text-sm font-medium ${task.status === 'completed' ? 'text-gray-400 line-through' : 'text-white'}`}>
                    {task.title}
                  </p>
                  {task.due_time && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <Clock size={10} /> {task.due_time}
                    </p>
                  )}
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  task.priority === 'urgent' ? 'bg-red-500/20 text-red-400' :
                  task.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                  task.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                  'bg-gray-500/20 text-gray-400'
                }`}>
                  {task.priority === 'urgent' ? 'عاجل' : task.priority === 'high' ? 'عالي' : task.priority === 'medium' ? 'متوسط' : 'منخفض'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
