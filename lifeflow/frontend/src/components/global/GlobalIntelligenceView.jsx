/**
 * GlobalIntelligenceView — Phase 13: Global Intelligence
 * Benchmark comparisons, global patterns, collective insights
 */
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { adaptiveAPI } from '../../utils/api';

const BenchmarkBar = ({ label, userVal, globalVal, unit = '' }) => {
  const max = Math.max(userVal ?? 0, globalVal ?? 0, 1);
  const userPct = Math.min(100, ((userVal ?? 0) / max) * 100);
  const globalPct = Math.min(100, ((globalVal ?? 0) / max) * 100);
  const better = (userVal ?? 0) >= (globalVal ?? 0);
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className={better ? 'text-green-400' : 'text-yellow-400'}>
          أنت: {userVal ?? '—'}{unit} | عالمي: {globalVal ?? '—'}{unit}
        </span>
      </div>
      <div className="flex gap-1 h-2">
        <div className="flex-1 bg-surface-600 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all duration-700 ${better ? 'bg-green-500' : 'bg-yellow-500'}`}
            style={{ width: `${userPct}%` }} />
        </div>
        <div className="flex-1 bg-surface-600 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-gray-500 transition-all duration-700" style={{ width: `${globalPct}%` }} />
        </div>
      </div>
    </div>
  );
};

export default function GlobalIntelligenceView() {
  const { data: benchData, isLoading: benchLoading } = useQuery({
    queryKey: ['benchmark'],
    queryFn: () => adaptiveAPI.getBenchmark(),
    staleTime: 10 * 60 * 1000,
  });

  const { data: globalData, isLoading: globalLoading } = useQuery({
    queryKey: ['global-insights'],
    queryFn: () => adaptiveAPI.getGlobalInsights(),
    staleTime: 30 * 60 * 1000,
  });

  const bench = benchData?.data?.data;
  const global = globalData?.data?.data;

  return (
    <div className="space-y-5 p-4" dir="rtl">
      <div className="flex items-center gap-3">
        <span className="text-3xl">🌍</span>
        <div>
          <h1 className="text-2xl font-bold text-white">الذكاء العالمي</h1>
          <p className="text-gray-400 text-sm">Phase 13 — Global Intelligence</p>
        </div>
      </div>

      {/* Overall Benchmark Score */}
      {!benchLoading && bench && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="card p-6 text-center">
          <p className="text-gray-400 text-sm mb-1">ترتيبك العالمي</p>
          <div className="flex justify-center items-end gap-2">
            <span className="text-6xl font-black text-white">{bench.overall_percentile ?? bench.overall_score ?? '—'}</span>
            {bench.overall_percentile && <span className="text-gray-400 text-lg mb-1">%</span>}
          </div>
          <p className="text-gray-400 text-xs mt-1">
            {bench.overall_percentile
              ? `أنت أفضل من ${bench.overall_percentile}% من المستخدمين عالمياً`
              : 'اجمع المزيد من البيانات لتحديد ترتيبك'}
          </p>
        </motion.div>
      )}

      {/* Benchmark Comparisons */}
      <div className="card p-5 space-y-4">
        <h2 className="text-white font-bold text-sm flex items-center gap-2">
          <span>📊</span> مقارنة مع المتوسط العالمي
        </h2>
        {benchLoading ? (
          <div className="flex justify-center py-6"><div className="loading-spinner" /></div>
        ) : bench?.comparison ? (
          <div className="space-y-4">
            {Object.entries(bench.comparison).slice(0, 6).map(([key, val]) => (
              <BenchmarkBar key={key}
                label={key === 'productivity' ? 'الإنتاجية' : key === 'mood' ? 'المزاج' : key === 'energy' ? 'الطاقة' :
                       key === 'tasks' ? 'المهام' : key === 'habits' ? 'العادات' : key}
                userVal={typeof val === 'object' ? val.user : val}
                globalVal={typeof val === 'object' ? val.global : bench.global_averages?.[key]} />
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-center py-4">جاري تحليل بياناتك مقارنةً بالمعايير العالمية...</p>
        )}
      </div>

      {/* Insights */}
      {bench?.insights?.length > 0 && (
        <div className="card p-5 space-y-3">
          <h2 className="text-white font-bold text-sm">💡 رؤى مخصصة</h2>
          {bench.insights.map((ins, i) => (
            <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className="flex items-start gap-3 p-3 bg-surface-700/50 rounded-xl">
              <span className="text-xl">{ins.icon || '💡'}</span>
              <div>
                <p className="text-white text-sm font-medium">{ins.title}</p>
                <p className="text-gray-400 text-xs">{ins.message || ins.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Global Benchmarks Summary */}
      {!globalLoading && global && (
        <div className="card p-5">
          <h2 className="text-white font-bold text-sm mb-4">📈 إحصائيات المنصة العالمية</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-center">
            {[
              { label: 'متوسط الإنتاجية', val: `${global.benchmarks?.avg_productivity_score ?? global.global?.avg_productivity ?? '—'}` },
              { label: 'متوسط المزاج', val: `${global.benchmarks?.avg_mood_score ?? '—'}/10` },
              { label: 'انتشار الاحتراق', val: global.benchmarks?.burnout_prevalence ?? '34%' },
              { label: 'ساعات نوم الذروة', val: `${global.benchmarks?.sleep_hours_peak ?? 7.5}h` },
              { label: 'إنجاز المهام', val: `${global.benchmarks?.avg_task_completion ?? '—'}%` },
              { label: 'تأثير التمرين', val: global.benchmarks?.best_exercise_impact ?? '+12%' },
            ].map((s, i) => (
              <div key={i} className="p-3 bg-surface-700/50 rounded-xl">
                <p className="text-gray-400 text-xs">{s.label}</p>
                <p className="text-white font-bold text-lg">{s.val}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
