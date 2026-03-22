/**
 * Dashboard Home - Main Overview (Interactive)
 * ================================================
 * الصفحة الرئيسية مع إجراءات تفاعلية:
 * - إنهاء المهام مباشرة
 * - تسجيل عادة بنقرة
 * - تسجيل المزاج
 * - روابط سريعة للأقسام
 */

import { motion } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle, Clock, Flame, Brain, Target,
  ArrowRight, Plus, Sparkles, Activity, Bell
} from 'lucide-react';
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';
import { taskAPI, habitAPI } from '../../utils/api';
import toast from 'react-hot-toast';

export default function DashboardHome({ dashboardData, isLoading, onViewChange }) {
  const queryClient = useQueryClient();

  const invalidateDash = () => {
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['tasks'] });
    queryClient.invalidateQueries({ queryKey: ['habits'] });
  };

  // ── Quick complete task ──────────────────────────────────────────────────────
  const completeTask = useMutation({
    mutationFn: (id) => taskAPI.completeTask(id),
    onSuccess: () => { invalidateDash(); toast.success('أحسنت! تم إنهاء المهمة 🎉'); },
    onError: () => toast.error('فشل إنهاء المهمة'),
  });

  // ── Quick log habit ──────────────────────────────────────────────────────────
  const logHabit = useMutation({
    mutationFn: (id) => habitAPI.checkIn(id, {}),
    onSuccess: () => { invalidateDash(); toast.success('رائع! تم تسجيل العادة ✅'); },
    onError: () => toast.error('فشل تسجيل العادة'),
  });

  if (isLoading || !dashboardData) return <DashboardSkeleton />;

  const { greeting, date, summary, today_tasks, habits, recent_insights, smart_suggestion } = dashboardData;

  const productivityData = [
    { name: 'المهام', value: summary?.tasks?.total > 0 ? Math.round((summary.tasks.completed / summary.tasks.total) * 100) : 0, fill: '#6C63FF' },
    { name: 'العادات', value: summary?.habits?.percentage || 0, fill: '#10B981' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── Greeting ─────────────────────────────────────────────────────────── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between flex-wrap gap-3" dir="rtl">
        <div>
          <h1 className="text-3xl font-black text-white">{greeting}</h1>
          <p className="text-gray-400 mt-1">{date?.day_name} · {date?.formatted}</p>
        </div>
        <div className="text-left flex flex-col items-end">
          <div className="text-4xl font-black gradient-text">{summary?.productivity_score || 0}</div>
          <div className="text-xs text-gray-400">نقاط الإنتاجية</div>
        </div>
      </motion.div>

      {/* ── Smart suggestion ─────────────────────────────────────────────────── */}
      {smart_suggestion && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-4 border-l-4 border-primary-500" dir="rtl">
          <div className="flex items-start gap-3">
            <div className="text-2xl">💡</div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-primary-400 mb-1">اقتراح ذكي</div>
              <p className="text-sm text-gray-300">{smart_suggestion.suggestion}</p>
            </div>
            <button onClick={() => onViewChange?.('assistant')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 flex-shrink-0">
              <Sparkles size={12} /> المساعد
            </button>
          </div>
        </motion.div>
      )}

      {/* ── Stats cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3" dir="rtl">
        <StatCard
          icon={<CheckCircle className="text-primary-400" size={20} />}
          label="مهام اليوم"
          value={`${summary?.tasks?.completed || 0}/${summary?.tasks?.total || 0}`}
          subtitle={summary?.tasks?.overdue > 0 ? `${summary.tasks.overdue} متأخرة ⚠️` : 'ممتاز ✨'}
          color="primary"
          onClick={() => onViewChange?.('tasks')}
        />
        <StatCard
          icon={<Flame className="text-orange-400" size={20} />}
          label="العادات"
          value={`${summary?.habits?.percentage || 0}%`}
          subtitle={`${summary?.habits?.completed || 0}/${summary?.habits?.total || 0} مكتملة`}
          color="orange"
          onClick={() => onViewChange?.('habits')}
        />
        <StatCard
          icon={<Brain className="text-pink-400" size={20} />}
          label="المزاج"
          value={summary?.mood?.has_checked_in ? `${summary.mood.score}/10` : '---'}
          subtitle={summary?.mood?.has_checked_in ? getMoodLabel(summary.mood.score) : 'اضغط لتسجيل'}
          color="pink"
          onClick={() => onViewChange?.('mood')}
        />
        <StatCard
          icon={<Bell className="text-green-400" size={20} />}
          label="الإشعارات"
          value={summary?.unread_notifications || 0}
          subtitle="غير مقروءة"
          color="green"
          onClick={() => onViewChange?.('notifications')}
        />
      </div>

      {/* ── Main grid ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Tasks + Habits column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Today Tasks */}
          <div className="glass-card p-5" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle size={18} className="text-primary-400" /> مهام اليوم
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 bg-white/5 px-3 py-1 rounded-full">{summary?.tasks?.pending || 0} معلقة</span>
                <button onClick={() => onViewChange?.('tasks')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                  كل المهام <ArrowRight size={12} />
                </button>
              </div>
            </div>

            {today_tasks?.length > 0 ? (
              <div className="space-y-2">
                {today_tasks.slice(0, 6).map((task, idx) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-all group ${task.status === 'completed' ? 'opacity-60' : ''}`}
                  >
                    <button
                      onClick={() => task.status !== 'completed' && completeTask.mutate(task.id)}
                      disabled={task.status === 'completed' || completeTask.isPending}
                      className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                        task.status === 'completed'
                          ? 'bg-green-500 border-green-500'
                          : 'border-gray-500 hover:border-primary-400 hover:bg-primary-500/20'
                      }`}
                    >
                      {task.status === 'completed' && <CheckCircle size={12} className="text-white" />}
                    </button>
                    <span className={`flex-1 text-sm ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                      {task.title}
                    </span>
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      task.priority === 'urgent' ? 'bg-red-500' :
                      task.priority === 'high' ? 'bg-orange-500' :
                      task.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-500'
                    }`} />
                    {task.due_date && (
                      <span className="text-xs text-gray-500 flex items-center gap-1 hidden sm:flex">
                        <Clock size={10} />
                        {new Date(task.due_date).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <CheckCircle size={32} className="mx-auto mb-2 text-gray-600" />
                <p className="text-sm">لا توجد مهام لليوم 🎉</p>
                <button onClick={() => onViewChange?.('tasks')} className="mt-2 text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 mx-auto">
                  <Plus size={12} /> أضف مهمة
                </button>
              </div>
            )}
          </div>

          {/* Habits Today */}
          <div className="glass-card p-5" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Flame size={18} className="text-orange-400" /> عادات اليوم
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{habits?.filter(h => h.completed_today).length || 0}/{habits?.length || 0}</span>
                <button onClick={() => onViewChange?.('habits')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                  كل العادات <ArrowRight size={12} />
                </button>
              </div>
            </div>
            {habits?.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {habits.slice(0, 6).map((habit, idx) => (
                  <motion.div
                    key={habit.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    whileHover={{ scale: 1.03 }}
                    onClick={() => !habit.completed_today && logHabit.mutate(habit.id)}
                    className={`p-3 rounded-xl text-center cursor-pointer transition-all select-none ${
                      habit.completed_today
                        ? 'bg-gradient-to-br from-primary-500/30 to-green-500/20 border border-primary-500/30'
                        : 'bg-white/5 hover:bg-white/10 border border-white/5 hover:border-primary-500/30'
                    }`}
                  >
                    <div className="text-2xl mb-1">{habit.icon || '⭐'}</div>
                    <div className="text-xs font-medium text-gray-300 truncate">{habit.name}</div>
                    {habit.current_streak > 0 && (
                      <div className="text-xs text-orange-400 mt-1">🔥 {habit.current_streak}</div>
                    )}
                    {habit.completed_today
                      ? <div className="text-xs text-green-400 mt-1">✓ أنجزت</div>
                      : <div className="text-xs text-gray-500 mt-1">اضغط</div>
                    }
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-sm text-gray-500">لا توجد عادات نشطة</p>
                <button onClick={() => onViewChange?.('habits')} className="mt-2 text-xs text-primary-400 flex items-center gap-1 mx-auto">
                  <Plus size={12} /> أضف عادة
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          {/* Productivity ring */}
          <div className="glass-card p-5" dir="rtl">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">الإنتاجية الإجمالية</h3>
            <div className="flex items-center justify-center">
              <div className="relative">
                <ResponsiveContainer width={140} height={140}>
                  <RadialBarChart innerRadius="60%" outerRadius="90%" data={productivityData} startAngle={180} endAngle={-180}>
                    <RadialBar dataKey="value" cornerRadius={8} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex items-center justify-center flex-col">
                  <span className="text-2xl font-black gradient-text">{summary?.productivity_score || 0}</span>
                  <span className="text-xs text-gray-500">نقطة</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <div className="text-center">
                <div className="w-3 h-3 rounded-full bg-primary-500 mx-auto mb-1" />
                <div className="text-xs text-gray-400">المهام</div>
                <div className="text-xs font-bold text-white">
                  {summary?.tasks?.total > 0 ? Math.round((summary.tasks.completed / summary.tasks.total) * 100) : 0}%
                </div>
              </div>
              <div className="text-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mx-auto mb-1" />
                <div className="text-xs text-gray-400">العادات</div>
                <div className="text-xs font-bold text-white">{summary?.habits?.percentage || 0}%</div>
              </div>
            </div>
          </div>

          {/* Mood card */}
          <div className="glass-card p-5" dir="rtl">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">مزاج اليوم</h3>
            {summary?.mood?.has_checked_in ? (
              <div className="text-center">
                <div className="text-4xl mb-2">{getMoodEmoji(summary.mood.score)}</div>
                <div className="text-2xl font-black gradient-text mb-1">{summary.mood.score}/10</div>
                <div className="text-sm text-gray-400">{getMoodLabel(summary.mood.score)}</div>
              </div>
            ) : (
              <div className="text-center py-2">
                <div className="text-3xl mb-2">🌙</div>
                <p className="text-xs text-gray-400 mb-3">كيف مزاجك اليوم؟</p>
                <button
                  onClick={() => onViewChange?.('mood')}
                  className="text-xs text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-2 rounded-lg transition-all w-full"
                >
                  سجّل مزاجك الآن ✨
                </button>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="glass-card p-4" dir="rtl">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">إجراءات سريعة</h3>
            <div className="space-y-2">
              {[
                { icon: '🤖', label: 'تحدث مع المساعد', view: 'assistant' },
                { icon: '📋', label: 'إضافة مهمة', view: 'tasks' },
                { icon: '📊', label: 'عرض التحليلات', view: 'insights' },
                { icon: '📅', label: 'التقويم', view: 'calendar' },
              ].map((item) => (
                <button
                  key={item.view}
                  onClick={() => onViewChange?.(item.view)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-sm text-right"
                >
                  <span className="text-base">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  <ArrowRight size={12} className="text-gray-500" />
                </button>
              ))}
            </div>
          </div>

          {/* Recent insights */}
          {recent_insights?.length > 0 && (
            <div className="glass-card p-5" dir="rtl">
              <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
                <Brain size={14} className="text-primary-400" /> آخر الرؤى
              </h3>
              <div className="space-y-2">
                {recent_insights.slice(0, 2).map((insight) => (
                  <div key={insight.id} className="p-3 bg-white/5 rounded-lg">
                    <div className="text-xs font-semibold text-primary-400 mb-1">{insight.title}</div>
                    <p className="text-xs text-gray-400 line-clamp-2">{insight.content}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, subtitle, color, onClick }) {
  const colors = {
    primary: 'from-primary-500/20 to-primary-600/10 border-primary-500/20',
    orange:  'from-orange-500/20 to-orange-600/10 border-orange-500/20',
    pink:    'from-pink-500/20 to-pink-600/10 border-pink-500/20',
    green:   'from-green-500/20 to-green-600/10 border-green-500/20',
  };
  return (
    <motion.div
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className={`glass-card p-4 bg-gradient-to-br ${colors[color]} cursor-pointer`}
      dir="rtl"
    >
      <div className="flex items-center gap-2 mb-2">{icon}<span className="text-xs text-gray-400">{label}</span></div>
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
    </motion.div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-10 w-64 rounded-xl" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 skeleton h-96 rounded-2xl" />
        <div className="skeleton h-96 rounded-2xl" />
      </div>
    </div>
  );
}

function getMoodEmoji(score) {
  if (score >= 9) return '🤩';
  if (score >= 7) return '😊';
  if (score >= 5) return '😐';
  if (score >= 3) return '😔';
  return '😞';
}

function getMoodLabel(score) {
  if (score >= 9) return 'رائع جداً!';
  if (score >= 7) return 'جيد';
  if (score >= 5) return 'معتدل';
  if (score >= 3) return 'ليس جيداً';
  return 'سيء';
}
