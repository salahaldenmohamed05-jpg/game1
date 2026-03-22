/**
 * OptimizerView — Phase 12: Life Optimization
 * Goals management, life optimizer scores, schedule adjustment
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { adaptiveAPI } from '../../utils/api';

const DimCard = ({ name, score, icon, color }) => {
  const pct = Math.min(100, Math.max(0, score ?? 50));
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-gray-300 text-sm">{icon} {name}</span>
        <span className="text-white font-bold">{pct}</span>
      </div>
      <div className="w-full bg-surface-600 rounded-full h-2">
        <div className={`h-2 rounded-full bg-${color}-500 transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};

const GoalCard = ({ goal }) => {
  const prog = goal.progress ?? 0;
  const isActive = goal.status === 'active';
  return (
    <motion.div whileHover={{ scale: 1.01 }} className={`card p-4 ${!isActive ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1">
          <p className="text-white font-semibold text-sm">{goal.title}</p>
          <p className="text-gray-400 text-xs mt-0.5">{goal.category} · {goal.days_remaining != null ? `${goal.days_remaining} يوم متبقي` : ''}</p>
        </div>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          goal.status === 'completed' ? 'bg-green-500/20 text-green-400' :
          goal.status === 'active' ? 'bg-blue-500/20 text-blue-400' :
          'bg-gray-500/20 text-gray-400'
        }`}>{goal.status === 'completed' ? 'مكتمل' : goal.status === 'active' ? 'نشط' : 'متوقف'}</span>
      </div>
      <div className="w-full bg-surface-600 rounded-full h-2 mt-2">
        <div className="h-2 rounded-full bg-primary-500 transition-all duration-700" style={{ width: `${prog}%` }} />
      </div>
      <p className="text-gray-400 text-xs mt-1 text-left">{prog}%</p>
    </motion.div>
  );
};

export default function OptimizerView() {
  const [showAddGoal, setShowAddGoal] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', category: 'personal', target_date: '' });
  const [activeTab, setActiveTab] = useState('optimizer');
  const queryClient = useQueryClient();

  const { data: optData, isLoading: optLoading } = useQuery({
    queryKey: ['life-optimizer'],
    queryFn: () => adaptiveAPI.getLifeOptimizer(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: goalsData, isLoading: goalsLoading } = useQuery({
    queryKey: ['goals'],
    queryFn: () => adaptiveAPI.getGoals(),
    staleTime: 3 * 60 * 1000,
    enabled: activeTab === 'goals',
  });

  const { data: schedData, isLoading: schedLoading } = useQuery({
    queryKey: ['schedule-adjustment'],
    queryFn: () => adaptiveAPI.getScheduleAdjust(),
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === 'schedule',
  });

  const createGoalMut = useMutation({
    mutationFn: (data) => adaptiveAPI.createGoal(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['goals'] });
      setShowAddGoal(false);
      setNewGoal({ title: '', category: 'personal', target_date: '' });
    },
  });

  const opt = optData?.data?.data;
  const goals = goalsData?.data?.data;
  const sched = schedData?.data?.data;

  const DIMS = [
    { key: 'productivity', name: 'الإنتاجية', icon: '⚡', color: 'yellow' },
    { key: 'health',       name: 'الصحة',     icon: '💪', color: 'green' },
    { key: 'mood',         name: 'المزاج',    icon: '😊', color: 'blue' },
    { key: 'habits',       name: 'العادات',   icon: '🔄', color: 'purple' },
    { key: 'goals',        name: 'الأهداف',   icon: '🎯', color: 'red' },
    { key: 'stress',       name: 'الضغط',     icon: '🧘', color: 'teal' },
  ];

  const tabs = [
    { id: 'optimizer', label: 'المحسّن', icon: '🚀' },
    { id: 'goals',     label: 'الأهداف', icon: '🎯' },
    { id: 'schedule',  label: 'الجدول',  icon: '📋' },
  ];

  return (
    <div className="space-y-5 p-4" dir="rtl">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🚀</span>
        <div>
          <h1 className="text-2xl font-bold text-white">محسّن الحياة</h1>
          <p className="text-gray-400 text-sm">Phase 12 — Life Optimization</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
              ${activeTab === t.id ? 'bg-primary-500 text-white' : 'bg-surface-700 text-gray-400 hover:text-white'}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* OPTIMIZER */}
        {activeTab === 'optimizer' && (
          <motion.div key="opt" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
            {optLoading ? <div className="flex justify-center py-10"><div className="loading-spinner" /></div> : (
              <>
                {/* Overall Score */}
                <div className="card p-6 text-center">
                  <p className="text-gray-400 text-sm mb-1">نقاط الحياة الإجمالية</p>
                  <motion.p initial={{ scale: 0 }} animate={{ scale: 1 }} className="text-6xl font-black text-white">
                    {opt?.overall_score ?? 50}
                  </motion.p>
                  <p className="text-gray-400 text-xs mt-1">{opt?.summary?.overall ?? 'جاري التحليل...'}</p>
                  {opt?.optimization_potential > 0 && (
                    <p className="text-green-400 text-sm mt-2">+{opt.optimization_potential} نقطة إمكانية التحسين</p>
                  )}
                </div>

                {/* Dimensions */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {DIMS.map(d => (
                    <DimCard key={d.key} name={d.name} icon={d.icon} color={d.color}
                      score={opt?.dimensions?.[d.key]?.score} />
                  ))}
                </div>

                {/* Recommendations */}
                {opt?.recommendations?.length > 0 && (
                  <div className="card p-4 space-y-3">
                    <h3 className="text-white font-bold text-sm">أولويات التحسين</h3>
                    {opt.recommendations.slice(0, 4).map((r, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 bg-surface-700/50 rounded-xl">
                        <span className="text-lg">{r.icon || '💡'}</span>
                        <div>
                          <p className="text-white text-sm font-medium">{r.title}</p>
                          <p className="text-gray-400 text-xs">{r.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </motion.div>
        )}

        {/* GOALS */}
        {activeTab === 'goals' && (
          <motion.div key="goals" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-gray-400 text-sm">{goals?.summary?.total ?? 0} هدف · {goals?.summary?.active ?? 0} نشط</p>
              <button onClick={() => setShowAddGoal(true)} className="btn-primary text-sm px-4 py-2 rounded-xl">
                + هدف جديد
              </button>
            </div>
            {showAddGoal && (
              <div className="card p-4 space-y-3">
                <h3 className="text-white font-bold text-sm">إضافة هدف جديد</h3>
                <input value={newGoal.title} onChange={e => setNewGoal(p => ({ ...p, title: e.target.value }))}
                  placeholder="عنوان الهدف" className="input-field text-sm w-full" />
                <select value={newGoal.category} onChange={e => setNewGoal(p => ({ ...p, category: e.target.value }))}
                  className="input-field text-sm w-full">
                  {['health','productivity','learning','finance','relationships','personal','general'].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input type="date" value={newGoal.target_date} onChange={e => setNewGoal(p => ({ ...p, target_date: e.target.value }))}
                  className="input-field text-sm w-full" />
                <div className="flex gap-3">
                  <button onClick={() => createGoalMut.mutate(newGoal)} className="btn-primary text-sm px-4 py-2 rounded-xl flex-1">
                    حفظ
                  </button>
                  <button onClick={() => setShowAddGoal(false)} className="btn-secondary text-sm px-4 py-2 rounded-xl">
                    إلغاء
                  </button>
                </div>
              </div>
            )}
            {goalsLoading ? <div className="flex justify-center py-8"><div className="loading-spinner" /></div> :
              goals?.goals?.length > 0 ? (
                <div className="space-y-3">
                  {goals.goals.map((g, i) => <GoalCard key={g.id ?? i} goal={g} />)}
                </div>
              ) : (
                <div className="text-center py-10 text-gray-500">
                  <p className="text-4xl mb-3">🎯</p>
                  <p>لا توجد أهداف بعد — أضف هدفك الأول!</p>
                </div>
              )
            }
          </motion.div>
        )}

        {/* SCHEDULE */}
        {activeTab === 'schedule' && (
          <motion.div key="sched" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            {schedLoading ? <div className="flex justify-center py-8"><div className="loading-spinner" /></div> :
              sched?.adjustments?.length > 0 ? (
                sched.adjustments.map((adj, i) => (
                  <div key={i} className="card p-4 flex items-start gap-3">
                    <span className="text-2xl">{adj.icon || '📋'}</span>
                    <div>
                      <p className="text-white font-medium text-sm">{adj.title}</p>
                      <p className="text-gray-400 text-xs mt-1">{adj.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-10 text-gray-500">
                  <p className="text-4xl mb-3">📋</p>
                  <p>جدولك محسّن بالفعل!</p>
                </div>
              )
            }
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
