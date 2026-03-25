/**
 * Dashboard Home - Professional Mobile-First Overview
 * =====================================================
 * ✅ Interactive tasks + habits with real data
 * ✅ Smart Daily Plan linked to real tasks/habits
 * ✅ Correct Cairo timezone (no midnight→02:00 bug)
 * ✅ Next Best Action card
 * ✅ Life Feed, Burnout Alert
 * ✅ Mobile-first responsive grid
 * ✅ System sync on all actions
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check, CheckCircle, Clock, Flame, Brain, Target,
  ArrowRight, Plus, Sparkles, Activity, Bell,
  Zap, Calendar, ChevronDown, ChevronUp,
  RefreshCw, Bot, AlertTriangle, TrendingUp,
} from 'lucide-react';
import { RadialBarChart, RadialBar, ResponsiveContainer } from 'recharts';
import { taskAPI, habitAPI, assistantAPI } from '../../utils/api';
import useSyncStore from '../../store/syncStore';
import toast from 'react-hot-toast';

// ─── Cairo Time Helper (correct — no midnight→02:00) ─────────────────────────
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

/** Only return time if the task has an explicit start_time — not from due_date */
function getTaskDisplayTime(task) {
  if (task.start_time) return toCairoTime(task.start_time);
  if (task.due_time) return task.due_time;
  return null;
}

// ─── AI Timeline Widget ─────────────────────────────────────────────────────
function AiTimeline({ onViewChange }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['daily-plan-dash'],
    queryFn: assistantAPI.getSmartDailyPlan,
    refetchInterval: 600000,
    retry: false,
  });

  const plan = data?.data?.data || data?.data || {};
  const schedule = plan.schedule || plan.timeline || [];
  const focusScore = plan.focus_score || plan.stats?.focus_score;

  const typeIcon = { task: '📋', habit: '🔥', prayer: '🕌', break: '☕', event: '📅' };
  const typeColor = {
    task:   'border-blue-400',
    habit:  'border-green-400',
    prayer: 'border-purple-400',
    break:  'border-gray-400',
    event:  'border-yellow-400',
  };

  return (
    <div className="glass-card p-4 sm:p-5" dir="rtl">
      <div className="flex items-center justify-between mb-3 sm:mb-4">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Calendar size={15} className="text-blue-400" /> جدول اليوم الذكي
        </h3>
        <div className="flex items-center gap-2">
          {focusScore != null && (
            <span className="text-xs bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full">
              🎯 {focusScore}
            </span>
          )}
          <button onClick={refetch} className="text-gray-400 hover:text-blue-400 p-1 transition-colors active:scale-90">
            <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
        </div>
      ) : schedule.length > 0 ? (
        <div className="space-y-2 max-h-52 overflow-y-auto scrollbar-hide">
          {schedule.slice(0, 6).map((item, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-2.5 p-2.5 rounded-lg bg-white/5 border-r-2 ${typeColor[item.type] || 'border-gray-400'}`}>
              <span className="text-base flex-shrink-0">{typeIcon[item.type] || '📌'}</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-200 truncate">{item.title}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                  <Clock size={9} /> {item.start_time} — {item.end_time}
                  {item.energy_required && (
                    <span className={`mr-2 ${
                      item.energy_required === 'high' ? 'text-red-400' : item.energy_required === 'medium' ? 'text-yellow-400' : 'text-green-400'
                    }`}>
                      ⚡{item.energy_required === 'high' ? 'عالية' : item.energy_required === 'medium' ? 'متوسطة' : 'منخفضة'}
                    </span>
                  )}
                </p>
              </div>
            </motion.div>
          ))}
          {schedule.length > 6 && (
            <button onClick={() => onViewChange?.('assistant')}
              className="w-full text-xs text-blue-400 text-center py-1.5 hover:text-blue-300 transition-colors">
              + {schedule.length - 6} عنصر آخر
            </button>
          )}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500">
          <Calendar size={24} className="mx-auto mb-2 text-gray-600" />
          <p className="text-xs">أضف مهام لتوليد جدولك اليومي</p>
          <button onClick={() => onViewChange?.('tasks')}
            className="mt-2 text-xs text-blue-400 flex items-center gap-1 mx-auto hover:text-blue-300">
            <Plus size={10} /> أضف مهمة
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Next Best Action Widget ────────────────────────────────────────────────
function NextActionWidget({ onViewChange }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['next-action-dash'],
    queryFn: assistantAPI.getNextAction,
    refetchInterval: 180000,
    retry: false,
  });

  const action = data?.data?.data || data?.data || {};
  const urgencyColor = {
    urgent: 'from-red-500/20 to-red-600/10 border-red-500/30',
    high:   'from-orange-500/20 to-orange-600/10 border-orange-500/30',
    medium: 'from-blue-500/20 to-blue-600/10 border-blue-500/30',
    low:    'from-gray-500/10 to-gray-600/5 border-gray-500/20',
  };

  return (
    <div className={`glass-card p-4 sm:p-5 bg-gradient-to-br ${urgencyColor[action.urgency] || urgencyColor.medium}`} dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-white flex items-center gap-2">
          <Zap size={15} className="text-yellow-400" /> الإجراء الأفضل الآن
        </h3>
        <button onClick={refetch} className="text-gray-400 hover:text-yellow-400 p-1 transition-colors active:scale-90">
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="skeleton h-5 rounded w-3/4" />
          <div className="skeleton h-3 rounded w-full" />
        </div>
      ) : action.title || action.task_title ? (
        <div>
          <p className="text-sm font-bold text-white mb-2">{action.title || action.task_title}</p>
          {action.reason?.slice(0, 2).map((r, i) => (
            <p key={i} className="text-xs text-gray-400 leading-relaxed">• {r}</p>
          ))}
          <div className="flex items-center justify-between mt-3 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {action.confidence != null && (
                <span className="text-xs text-gray-400">ثقة {action.confidence}٪</span>
              )}
              {action.ml_driven && (
                <span className="text-xs text-purple-400 flex items-center gap-1">
                  <Brain size={9} /> AI
                </span>
              )}
            </div>
            <button onClick={() => onViewChange?.('tasks')}
              className="text-xs text-yellow-400 hover:text-yellow-300 flex items-center gap-1">
              ابدأ الآن <ArrowRight size={10} />
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center py-2">
          <p className="text-xs text-gray-400">لا توجد مهام حالياً</p>
          <button onClick={() => onViewChange?.('tasks')}
            className="mt-1 text-xs text-yellow-400 flex items-center gap-1 mx-auto hover:text-yellow-300">
            <Plus size={10} /> أضف مهمة
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Life Feed Widget ───────────────────────────────────────────────────────
function LifeFeedWidget({ onViewChange }) {
  const [expanded, setExpanded] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['life-feed-dash'],
    queryFn: assistantAPI.getLifeFeed,
    refetchInterval: 300000,
    retry: false,
  });

  const feedData = data?.data?.data || data?.data || {};
  const feed = feedData.feed || [];

  const typeIcon = { insight: '🧠', tip: '💡', ml: '🤖', event: '📅', alert: '⚠️', mood: '😊' };

  if (isLoading || !feed.length) return null;

  return (
    <div className="glass-card p-4 sm:p-5" dir="rtl">
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setExpanded(!expanded)}
          className="text-sm font-bold text-white flex items-center gap-2 hover:text-primary-400 transition-colors">
          <Activity size={15} className="text-purple-400" /> لحظات حياتك
          {expanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
          <span className="text-xs text-gray-500 font-normal">({feed.length})</span>
        </button>
      </div>

      <AnimatePresence>
        {(expanded ? feed : feed.slice(0, 2)).map((item, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-start gap-2.5 py-2 border-b border-white/5 last:border-0">
            <span className="text-base flex-shrink-0">{typeIcon[item.type] || '📌'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-300 leading-relaxed">{item.message}</p>
              {item.time && (
                <p className="text-xs text-gray-600 mt-0.5">
                  {new Date(item.time).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}
                </p>
              )}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

// ─── Burnout Alert ──────────────────────────────────────────────────────────
function BurnoutAlert() {
  const { data } = useQuery({
    queryKey: ['burnout-dash'],
    queryFn: assistantAPI.getBurnoutStatus,
    refetchInterval: 600000,
    retry: false,
  });

  const burnout = data?.data?.data || data?.data || {};
  if (!burnout.risk_level || burnout.risk_level === 'low') return null;

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
      className="glass-card p-4 bg-gradient-to-r from-amber-500/20 to-orange-600/10 border border-amber-500/30" dir="rtl">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-300">
            {burnout.risk_level === 'high' ? '⚠️ خطر الاحتراق الوظيفي مرتفع' : '⚡ احذر من الإرهاق'}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            نسبة الخطر: {burnout.risk_percent}٪ · أفضل وقت للتركيز: {burnout.best_focus_hour}:00
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Stat Card ──────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, subtitle, color, onClick }) {
  const colors = {
    primary: 'from-primary-500/20 to-primary-600/10 border-primary-500/20',
    orange:  'from-orange-500/20 to-orange-600/10 border-orange-500/20',
    pink:    'from-pink-500/20 to-pink-600/10 border-pink-500/20',
    green:   'from-green-500/20 to-green-600/10 border-green-500/20',
  };
  return (
    <motion.div whileTap={{ scale: 0.96 }} onClick={onClick}
      className={`glass-card p-3 sm:p-4 bg-gradient-to-br ${colors[color]} cursor-pointer`} dir="rtl">
      <div className="flex items-center gap-2 mb-1.5">{icon}<span className="text-xs text-gray-400">{label}</span></div>
      <div className="text-xl sm:text-2xl font-black text-white">{value}</div>
      <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>
    </motion.div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────
export default function DashboardHome({ dashboardData, isLoading, onViewChange }) {
  const queryClient = useQueryClient();
  const { invalidateAll, recordAction } = useSyncStore();

  const completeTask = useMutation({
    mutationFn: (id) => taskAPI.completeTask(id),
    onSuccess: () => { invalidateAll(); recordAction('task_completed'); toast.success('أحسنت! 🎉'); },
    onError: () => toast.error('فشل إنهاء المهمة'),
  });

  const logHabit = useMutation({
    mutationFn: (id) => habitAPI.checkIn(id, {}),
    onSuccess: () => { invalidateAll(); recordAction('habit_checkin'); toast.success('رائع! 💪'); },
    onError: () => toast.error('فشل تسجيل العادة'),
  });

  if (isLoading || !dashboardData) return <DashboardSkeleton />;

  const { greeting, date, summary, today_tasks, habits, recent_insights, smart_suggestion } = dashboardData;

  const productivityData = [
    { name: 'المهام', value: summary?.tasks?.total > 0 ? Math.round((summary.tasks.completed / summary.tasks.total) * 100) : 0, fill: '#6C63FF' },
    { name: 'العادات', value: summary?.habits?.percentage || 0, fill: '#10B981' },
  ];

  return (
    <div className="space-y-4 sm:space-y-5 max-w-7xl mx-auto">

      {/* Burnout Alert */}
      <BurnoutAlert />

      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between flex-wrap gap-3" dir="rtl">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white">{greeting}</h1>
          <p className="text-gray-400 mt-1 text-sm">{date?.day_name} · {date?.formatted}</p>
        </div>
        <div className="text-left flex flex-col items-end">
          <div className="text-3xl sm:text-4xl font-black gradient-text">{summary?.productivity_score || 0}</div>
          <div className="text-xs text-gray-400">نقاط الإنتاجية</div>
        </div>
      </motion.div>

      {/* Smart suggestion */}
      {smart_suggestion && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-3.5 sm:p-4 border-l-4 border-primary-500" dir="rtl">
          <div className="flex items-start gap-3">
            <div className="text-xl sm:text-2xl">💡</div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-primary-400 mb-1">اقتراح ذكي</div>
              <p className="text-sm text-gray-300">{smart_suggestion.suggestion}</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Stats cards — 2x2 grid on mobile */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3" dir="rtl">
        <StatCard icon={<CheckCircle className="text-primary-400" size={18} />} label="مهام اليوم"
          value={`${summary?.tasks?.completed || 0}/${summary?.tasks?.total || 0}`}
          subtitle={summary?.tasks?.overdue > 0 ? `${summary.tasks.overdue} متأخرة ⚠️` : 'ممتاز ✨'}
          color="primary" onClick={() => onViewChange?.('tasks')} />
        <StatCard icon={<Flame className="text-orange-400" size={18} />} label="العادات"
          value={`${summary?.habits?.percentage || 0}%`}
          subtitle={`${summary?.habits?.completed || 0}/${summary?.habits?.total || 0} مكتملة`}
          color="orange" onClick={() => onViewChange?.('habits')} />
        <StatCard icon={<Brain className="text-pink-400" size={18} />} label="المزاج"
          value={summary?.mood?.has_checked_in ? `${summary.mood.score}/10` : '---'}
          subtitle={summary?.mood?.has_checked_in ? getMoodLabel(summary.mood.score) : 'سجّل مزاجك'}
          color="pink" onClick={() => onViewChange?.('mood')} />
        <StatCard icon={<Bell className="text-green-400" size={18} />} label="الإشعارات"
          value={summary?.unread_notifications || 0} subtitle="غير مقروءة"
          color="green" onClick={() => onViewChange?.('notifications')} />
      </div>

      {/* AI Row: Next Action + Timeline — stacked on mobile */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        <NextActionWidget onViewChange={onViewChange} />
        <AiTimeline onViewChange={onViewChange} />
      </div>

      {/* Main grid — stacked on mobile, 2-col on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Tasks + Habits column */}
        <div className="lg:col-span-2 space-y-3 sm:space-y-4">

          {/* Today Tasks */}
          <div className="glass-card p-4 sm:p-5" dir="rtl">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle size={16} className="text-primary-400" /> مهام اليوم
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400 bg-white/5 px-2.5 py-1 rounded-full">{summary?.tasks?.pending || 0} معلقة</span>
                <button onClick={() => onViewChange?.('tasks')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                  الكل <ArrowRight size={10} />
                </button>
              </div>
            </div>

            {today_tasks?.length > 0 ? (
              <div className="space-y-2">
                {today_tasks.slice(0, 5).map((task, idx) => {
                  const time = getTaskDisplayTime(task);
                  return (
                    <motion.div key={task.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                      className={`flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98] ${
                        task.status === 'completed' ? 'opacity-50' : 'hover:bg-white/5'
                      }`}>
                      <button
                        onClick={() => task.status !== 'completed' && completeTask.mutate(task.id)}
                        disabled={task.status === 'completed'}
                        className={`w-6 h-6 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-all active:scale-90 ${
                          task.status === 'completed'
                            ? 'bg-green-500 border-green-500'
                            : 'border-gray-500 hover:border-primary-400'
                        }`}>
                        {task.status === 'completed' && <Check size={12} className="text-white" strokeWidth={3} />}
                      </button>
                      <span className={`flex-1 text-sm min-w-0 truncate ${
                        task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-200'
                      }`}>
                        {task.title}
                      </span>
                      {/* Priority dot */}
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        task.priority === 'urgent' ? 'bg-red-500' : task.priority === 'high' ? 'bg-orange-500' :
                        task.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-500'
                      }`} />
                      {/* Time — FIXED: only show real scheduled time */}
                      {time && (
                        <span className="text-xs text-blue-400 flex items-center gap-1 flex-shrink-0 font-medium">
                          <Clock size={10} /> {time}
                        </span>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <CheckCircle size={28} className="mx-auto mb-2 text-gray-600" />
                <p className="text-sm">لا توجد مهام لليوم 🎉</p>
                <button onClick={() => onViewChange?.('tasks')} className="mt-2 text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 mx-auto">
                  <Plus size={12} /> أضف مهمة
                </button>
              </div>
            )}
          </div>

          {/* Habits Today */}
          <div className="glass-card p-4 sm:p-5" dir="rtl">
            <div className="flex items-center justify-between mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <Flame size={16} className="text-orange-400" /> عادات اليوم
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">{habits?.filter(h => h.completed_today).length || 0}/{habits?.length || 0}</span>
                <button onClick={() => onViewChange?.('habits')} className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1">
                  الكل <ArrowRight size={10} />
                </button>
              </div>
            </div>
            {habits?.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 sm:gap-3">
                {habits.slice(0, 6).map((habit, idx) => (
                  <motion.div key={habit.id} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05 }}
                    onClick={() => !habit.completed_today && logHabit.mutate(habit.id)}
                    className={`p-3 rounded-xl text-center cursor-pointer transition-all select-none active:scale-95 ${
                      habit.completed_today
                        ? 'bg-gradient-to-br from-primary-500/30 to-green-500/20 border border-primary-500/30'
                        : 'bg-white/5 hover:bg-white/10 border border-white/5 hover:border-primary-500/30'
                    }`}>
                    <div className="text-2xl mb-1">{habit.icon || '⭐'}</div>
                    <div className="text-xs font-medium text-gray-300 truncate">{habit.name}</div>
                    {habit.current_streak > 0 && <div className="text-xs text-orange-400 mt-0.5">🔥 {habit.current_streak}</div>}
                    {habit.completed_today ? (
                      <div className="text-xs text-green-400 mt-0.5 font-medium">✓ تم</div>
                    ) : (
                      <div className="text-xs text-gray-500 mt-0.5">اضغط</div>
                    )}
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

          {/* Life Feed */}
          <LifeFeedWidget onViewChange={onViewChange} />
        </div>

        {/* Right column */}
        <div className="space-y-3 sm:space-y-4">
          {/* Productivity ring */}
          <div className="glass-card p-4 sm:p-5" dir="rtl">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">الإنتاجية الإجمالية</h3>
            <div className="flex items-center justify-center">
              <div className="relative">
                <ResponsiveContainer width={130} height={130}>
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
          <div className="glass-card p-4 sm:p-5" dir="rtl">
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
                <button onClick={() => onViewChange?.('mood')}
                  className="text-xs text-primary-400 bg-primary-500/10 hover:bg-primary-500/20 px-3 py-2.5 rounded-lg transition-all w-full active:scale-95 font-medium">
                  سجّل مزاجك الآن ✨
                </button>
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="glass-card p-4" dir="rtl">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">إجراءات سريعة</h3>
            <div className="space-y-1.5">
              {[
                { icon: '🤖', label: 'تحدث مع المساعد', view: 'assistant' },
                { icon: '📋', label: 'إضافة مهمة', view: 'tasks' },
                { icon: '📊', label: 'عرض التحليلات', view: 'insights' },
                { icon: '📅', label: 'التقويم', view: 'calendar' },
              ].map((item) => (
                <button key={item.view} onClick={() => onViewChange?.(item.view)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white transition-all text-sm text-right active:scale-[0.98]">
                  <span className="text-base">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  <ArrowRight size={12} className="text-gray-500" />
                </button>
              ))}
            </div>
          </div>

          {/* Recent insights */}
          {recent_insights?.length > 0 && (
            <div className="glass-card p-4 sm:p-5" dir="rtl">
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

// ── Skeleton ────────────────────────────────────────────────────────────────
function DashboardSkeleton() {
  return (
    <div className="space-y-4">
      <div className="skeleton h-10 w-48 rounded-xl" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 sm:h-24 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="skeleton h-32 rounded-2xl" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
      <div className="skeleton h-48 rounded-2xl" />
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
