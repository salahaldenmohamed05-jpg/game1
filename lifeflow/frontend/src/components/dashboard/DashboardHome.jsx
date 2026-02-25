/**
 * Dashboard Home - Main Overview
 * ================================
 * الصفحة الرئيسية للوحة التحكم
 */

import { motion } from 'framer-motion';
import {
  CheckCircle, Clock, Flame, TrendingUp, Brain, Star,
  ArrowUp, ArrowDown, Zap, Target
} from 'lucide-react';
import { RadialBarChart, RadialBar, ResponsiveContainer, LineChart, Line, XAxis, Tooltip, AreaChart, Area } from 'recharts';

export default function DashboardHome({ dashboardData, isLoading }) {
  if (isLoading || !dashboardData) return <DashboardSkeleton />;

  const { greeting, date, summary, today_tasks, habits, recent_insights, smart_suggestion } = dashboardData;

  const productivityData = [
    { name: 'المهام', value: summary?.tasks?.total > 0 ? Math.round((summary.tasks.completed / summary.tasks.total) * 100) : 0, fill: '#6C63FF' },
    { name: 'العادات', value: summary?.habits?.percentage || 0, fill: '#10B981' },
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Greeting Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-black text-white">{greeting}</h1>
          <p className="text-gray-400 mt-1">{date?.day_name} · {date?.formatted}</p>
        </div>
        <div className="text-left">
          <div className="text-4xl font-black gradient-text">{summary?.productivity_score || 0}</div>
          <div className="text-xs text-gray-400">نقاط الإنتاجية</div>
        </div>
      </motion.div>

      {/* Smart Suggestion Banner */}
      {smart_suggestion && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="glass-card p-4 border-l-4 border-primary-500">
          <div className="flex items-start gap-3">
            <div className="text-2xl">💡</div>
            <div>
              <div className="text-sm font-semibold text-primary-400 mb-1">اقتراح ذكي</div>
              <p className="text-sm text-gray-300">{smart_suggestion.suggestion}</p>
              {smart_suggestion.action && (
                <p className="text-xs text-gray-500 mt-1">{smart_suggestion.action}</p>
              )}
            </div>
          </div>
        </motion.div>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<CheckCircle className="text-primary-400" size={20} />}
          label="مهام اليوم"
          value={`${summary?.tasks?.completed || 0}/${summary?.tasks?.total || 0}`}
          subtitle={summary?.tasks?.overdue > 0 ? `${summary.tasks.overdue} متأخرة ⚠️` : 'ممتاز ✨'}
          color="primary"
        />
        <StatCard
          icon={<Flame className="text-orange-400" size={20} />}
          label="العادات"
          value={`${summary?.habits?.percentage || 0}%`}
          subtitle={`${summary?.habits?.completed || 0}/${summary?.habits?.total || 0} مكتملة`}
          color="orange"
        />
        <StatCard
          icon={<Brain className="text-pink-400" size={20} />}
          label="المزاج"
          value={summary?.mood?.has_checked_in ? `${summary.mood.score}/10` : '---'}
          subtitle={summary?.mood?.has_checked_in ? getMoodLabel(summary.mood.score) : 'لم يُسجَّل بعد'}
          color="pink"
        />
        <StatCard
          icon={<Target className="text-green-400" size={20} />}
          label="الإشعارات"
          value={summary?.unread_notifications || 0}
          subtitle="غير مقروءة"
          color="green"
        />
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tasks Column */}
        <div className="lg:col-span-2 space-y-4">
          {/* Today's Tasks */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <CheckCircle size={18} className="text-primary-400" />
                مهام اليوم
              </h2>
              <span className="text-xs text-gray-400 bg-white/5 px-3 py-1 rounded-full">
                {summary?.tasks?.pending || 0} معلقة
              </span>
            </div>

            {today_tasks?.length > 0 ? (
              <div className="space-y-2">
                {today_tasks.slice(0, 6).map((task, idx) => (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className={`flex items-center gap-3 p-3 rounded-lg bg-white/3 hover:bg-white/5 transition-all priority-${task.priority}`}
                  >
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      task.status === 'completed' ? 'bg-green-500' :
                      task.priority === 'urgent' ? 'bg-red-500' :
                      task.priority === 'high' ? 'bg-orange-500' :
                      task.priority === 'medium' ? 'bg-yellow-500' : 'bg-gray-500'
                    }`}></div>
                    <span className={`flex-1 text-sm ${task.status === 'completed' ? 'line-through text-gray-500' : 'text-gray-200'}`}>
                      {task.title}
                    </span>
                    {task.due_date && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <Clock size={10} />
                        {new Date(task.due_date).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    {task.status === 'completed' && (
                      <CheckCircle size={14} className="text-green-500" />
                    )}
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <CheckCircle size={32} className="mx-auto mb-2 text-gray-600" />
                <p className="text-sm">لا توجد مهام لليوم 🎉</p>
              </div>
            )}
          </div>

          {/* Habits Today */}
          <div className="glass-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Flame size={18} className="text-orange-400" />
                عادات اليوم
              </h2>
              <span className="text-xs text-gray-400">
                {habits?.filter(h => h.completed_today).length || 0}/{habits?.length || 0}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {habits?.slice(0, 6).map((habit, idx) => (
                <motion.div
                  key={habit.id}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.05 }}
                  className={`p-3 rounded-xl text-center cursor-pointer transition-all ${
                    habit.completed_today
                      ? 'bg-gradient-to-br from-primary-500/30 to-green-500/20 border border-primary-500/30'
                      : 'bg-white/5 hover:bg-white/10 border border-white/5'
                  }`}
                >
                  <div className="text-2xl mb-1">{habit.icon || '⭐'}</div>
                  <div className="text-xs font-medium text-gray-300 truncate">{habit.name}</div>
                  {habit.current_streak > 0 && (
                    <div className="streak-badge mt-1">
                      🔥 {habit.current_streak}
                    </div>
                  )}
                  {habit.completed_today && (
                    <div className="text-xs text-green-400 mt-1">✓ أنجزت</div>
                  )}
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Productivity Ring */}
          <div className="glass-card p-5">
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
                <div className="w-3 h-3 rounded-full bg-primary-500 mx-auto mb-1"></div>
                <div className="text-xs text-gray-400">المهام</div>
                <div className="text-xs font-bold text-white">
                  {summary?.tasks?.total > 0 ? Math.round((summary.tasks.completed / summary.tasks.total) * 100) : 0}%
                </div>
              </div>
              <div className="text-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mx-auto mb-1"></div>
                <div className="text-xs text-gray-400">العادات</div>
                <div className="text-xs font-bold text-white">{summary?.habits?.percentage || 0}%</div>
              </div>
            </div>
          </div>

          {/* Mood Card */}
          <div className="glass-card p-5">
            <h3 className="text-sm font-semibold text-gray-400 mb-3">مزاج اليوم</h3>
            {summary?.mood?.has_checked_in ? (
              <div className="text-center">
                <div className="text-4xl mb-2">{getMoodEmoji(summary.mood.score)}</div>
                <div className="text-2xl font-black gradient-text mb-1">{summary.mood.score}/10</div>
                <div className="text-sm text-gray-400">{getMoodLabel(summary.mood.score)}</div>
                {summary.mood.emotions?.length > 0 && (
                  <div className="flex flex-wrap gap-1 justify-center mt-2">
                    {summary.mood.emotions.slice(0, 3).map(e => (
                      <span key={e} className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-gray-300">{e}</span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-3">
                <div className="text-3xl mb-2">🌙</div>
                <p className="text-xs text-gray-400 mb-3">كيف كان مزاجك اليوم؟</p>
                <div className="text-xs text-primary-400 bg-primary-500/10 px-3 py-2 rounded-lg cursor-pointer hover:bg-primary-500/20 transition-all">
                  سجّل مزاجك الآن
                </div>
              </div>
            )}
          </div>

          {/* Recent Insights */}
          {recent_insights?.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-400 mb-3 flex items-center gap-2">
                <Brain size={14} className="text-primary-400" />
                آخر الرؤى
              </h3>
              <div className="space-y-2">
                {recent_insights.slice(0, 2).map(insight => (
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

// Helper components
function StatCard({ icon, label, value, subtitle, color }) {
  const colors = {
    primary: 'from-primary-500/20 to-primary-600/10 border-primary-500/20',
    orange: 'from-orange-500/20 to-orange-600/10 border-orange-500/20',
    pink: 'from-pink-500/20 to-pink-600/10 border-pink-500/20',
    green: 'from-green-500/20 to-green-600/10 border-green-500/20',
  };

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      className={`glass-card p-4 bg-gradient-to-br ${colors[color]} cursor-pointer`}
    >
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-xs text-gray-400">{label}</span>
      </div>
      <div className="text-2xl font-black text-white">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{subtitle}</div>
    </motion.div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-10 w-64 rounded-xl"></div>
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl"></div>)}
      </div>
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 skeleton h-96 rounded-2xl"></div>
        <div className="skeleton h-96 rounded-2xl"></div>
      </div>
    </div>
  );
}

// Helpers
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
