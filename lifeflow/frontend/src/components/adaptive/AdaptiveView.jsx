/**
 * AdaptiveView — Phase 10: Adaptive Life Model
 * Shows behavior profile, patterns, life simulation, and recommendations
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { adaptiveAPI } from '../../utils/api';

const StatCard = ({ label, value, icon, color = 'primary' }) => (
  <div className="card p-4 flex items-center gap-3">
    <div className={`w-10 h-10 rounded-xl bg-${color}-500/20 flex items-center justify-center text-xl`}>
      {icon}
    </div>
    <div>
      <p className="text-gray-400 text-xs">{label}</p>
      <p className="text-white font-bold text-lg">{value ?? '—'}</p>
    </div>
  </div>
);

export default function AdaptiveView() {
  const [simParams, setSimParams] = useState({ sleep_change: 0, exercise_change: 0, workload_change: 0 });

  const { data: profileData, isLoading: profileLoading } = useQuery({
    queryKey: ['behavior-profile'],
    queryFn: () => adaptiveAPI.getBehaviorProfile(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: recsData, isLoading: recsLoading } = useQuery({
    queryKey: ['recommendations'],
    queryFn: () => adaptiveAPI.getRecommendations(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: simData, isLoading: simLoading, refetch: runSim } = useQuery({
    queryKey: ['simulate-life', simParams],
    queryFn: () => adaptiveAPI.simulateLife(simParams),
    staleTime: 60 * 1000,
  });

  const profile = profileData?.data?.data;
  const recs = recsData?.data?.data;
  const sim = simData?.data?.data;

  return (
    <div className="space-y-6 p-4" dir="rtl">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl">🧠</span>
        <div>
          <h1 className="text-2xl font-bold text-white">النموذج التكيفي للحياة</h1>
          <p className="text-gray-400 text-sm">Phase 10 — Adaptive Life Model</p>
        </div>
      </div>

      {/* Behavior Profile */}
      <div className="card p-5">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span>🔍</span> ملف السلوك الشخصي
        </h2>
        {profileLoading ? (
          <div className="flex justify-center py-8"><div className="loading-spinner" /></div>
        ) : profile ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="معدل إنجاز المهام" value={`${profile.productivity_profile?.task_completion_rate ?? 0}%`} icon="✅" color="green" />
            <StatCard label="متوسط المزاج" value={`${profile.mood_pattern?.avg_mood ?? '—'}/10`} icon="😊" color="blue" />
            <StatCard label="استقرار المزاج" value={profile.mood_pattern?.stability_label ?? '—'} icon="📊" color="purple" />
            <StatCard label="نقاط الإنتاجية" value={profile.productivity_profile?.avg_score_30d ?? 0} icon="⚡" color="yellow" />
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">لا توجد بيانات كافية بعد — أضف مهامك ومزاجك يومياً</p>
        )}
        {profile?.focus_windows && profile.focus_windows.length > 0 && (
          <div className="mt-4">
            <p className="text-gray-400 text-sm mb-2">نوافذ التركيز المثالية:</p>
            <div className="flex flex-wrap gap-2">
              {profile.focus_windows.map((w, i) => (
                <span key={i} className="badge bg-primary-500/20 text-primary-300 px-3 py-1 rounded-full text-xs">
                  {w.label || `${w.start}:00–${w.end}:00`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Adaptive Recommendations */}
      <div className="card p-5">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span>💡</span> توصيات تكيفية
        </h2>
        {recsLoading ? (
          <div className="flex justify-center py-6"><div className="loading-spinner" /></div>
        ) : recs?.recommendations?.length > 0 ? (
          <div className="space-y-3">
            {recs.recommendations.slice(0, 5).map((rec, i) => (
              <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }}
                className="flex items-start gap-3 p-3 rounded-xl bg-surface-700/50">
                <span className="text-xl">{rec.icon || '💡'}</span>
                <div className="flex-1">
                  <p className="text-white font-medium text-sm">{rec.title}</p>
                  <p className="text-gray-400 text-xs mt-1">{rec.description}</p>
                </div>
                {rec.priority === 'high' && (
                  <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">مهم</span>
                )}
              </motion.div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">جاري تحليل بياناتك لتوليد توصيات مخصصة...</p>
        )}
      </div>

      {/* Life Simulation */}
      <div className="card p-5">
        <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <span>🔮</span> محاكاة الحياة
        </h2>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            { key: 'sleep_change', label: 'تغيير النوم', unit: 'ساعة', min: -3, max: 3 },
            { key: 'exercise_change', label: 'تغيير التمرين', unit: 'مرة/أسبوع', min: -5, max: 7 },
            { key: 'workload_change', label: 'تغيير عبء العمل', unit: '%', min: -50, max: 50 },
          ].map(({ key, label, unit, min, max }) => (
            <div key={key}>
              <label className="text-gray-400 text-xs block mb-1">{label} ({unit})</label>
              <input type="range" min={min} max={max} value={simParams[key]}
                onChange={e => setSimParams(p => ({ ...p, [key]: parseInt(e.target.value) }))}
                className="w-full accent-primary-500" />
              <span className="text-primary-400 text-xs">{simParams[key] > 0 ? '+' : ''}{simParams[key]} {unit}</span>
            </div>
          ))}
        </div>
        {sim ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            {sim.scenarios?.map((s, i) => (
              <div key={i} className={`p-3 rounded-xl ${s.delta >= 0 ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                <p className="text-xs text-gray-400">{s.dimension || s.name}</p>
                <p className={`font-bold text-lg ${s.delta >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {s.delta >= 0 ? '+' : ''}{s.delta?.toFixed(1) ?? '—'}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm text-center">حرك المؤشرات لرؤية تأثير التغييرات على حياتك</p>
        )}
      </div>
    </div>
  );
}
