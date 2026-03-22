/**
 * DayPlannerWidget — Phase 11
 * ============================
 * Displays the AI-generated daily schedule with time blocks,
 * focus windows, warnings, and energy match stats.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, AlertCircle, Coffee, CheckSquare, Star, Clock } from 'lucide-react';
import { intelligenceAPIv2 } from '../../utils/api';

const BLOCK_TYPE_CONFIG = {
  task:    { icon: CheckSquare, bgClass: 'bg-blue-500/15 border-blue-500/30' },
  habit:   { icon: Star,        bgClass: 'bg-purple-500/15 border-purple-500/30' },
  break:   { icon: Coffee,      bgClass: 'bg-emerald-500/15 border-emerald-500/30' },
  routine: { icon: Clock,       bgClass: 'bg-yellow-500/15 border-yellow-500/30' },
  review:  { icon: CheckSquare, bgClass: 'bg-indigo-500/15 border-indigo-500/30' },
};

const PRIORITY_DOT = {
  urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-blue-500', low: 'bg-gray-500',
};

export default function DayPlannerWidget() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [generating, setGenerating] = useState(false);

  const loadPlan = () => {
    setGenerating(true);
    intelligenceAPIv2.planDay()
      .then(res => setData(res.data?.data || res.data))
      .catch(err => setError(err.message || 'خطأ في بناء خطة اليوم'))
      .finally(() => { setLoading(false); setGenerating(false); });
  };

  useEffect(() => { loadPlan(); }, []);

  if (loading && !data) return <SkeletonCard />;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-violet-500/30 p-5 bg-gray-900/60 backdrop-blur"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-violet-400" />
          <h3 className="text-white font-semibold text-sm">خطة اليوم الذكية</h3>
        </div>
        <button
          onClick={loadPlan}
          disabled={generating}
          className="text-xs text-violet-400 hover:text-violet-300 transition-colors disabled:opacity-50"
        >
          {generating ? 'جاري التحديث...' : '↻ تحديث'}
        </button>
      </div>

      {error && (
        <div className="mb-3 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
          <AlertCircle className="w-4 h-4 text-red-400" />
          <p className="text-red-300 text-xs">{error}</p>
        </div>
      )}

      {data && (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            <StatCell label="المهام المجدولة" value={data.stats?.scheduled_tasks || 0} />
            <StatCell label="تطابق الطاقة" value={`${data.stats?.energy_match_score || 0}%`} />
            <StatCell label="دقائق العمل" value={data.stats?.estimated_work_minutes || 0} />
          </div>

          {/* Warnings */}
          {data.warnings?.length > 0 && (
            <div className="mb-3 space-y-1.5">
              {data.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 text-yellow-400 mt-0.5 shrink-0" />
                  <p className="text-yellow-200/90 text-xs">{w.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* Focus windows */}
          {data.focus_windows?.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-gray-500 font-medium mb-2">نوافذ التركيز العميق</p>
              <div className="flex flex-wrap gap-1.5">
                {data.focus_windows.map((w, i) => (
                  <span key={i} className="text-xs bg-violet-500/20 text-violet-300 px-2 py-1 rounded-full border border-violet-500/30">
                    ⚡ {w.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Schedule timeline */}
          <div className="space-y-2 max-h-80 overflow-y-auto scrollbar-thin scrollbar-track-gray-800 scrollbar-thumb-gray-600 pr-1">
            {(data.schedule || []).map((block, i) => {
              const cfg = BLOCK_TYPE_CONFIG[block.type] || BLOCK_TYPE_CONFIG.task;
              const Icon = cfg.icon;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`flex items-start gap-3 rounded-xl border px-3 py-2 ${cfg.bgClass}`}
                >
                  {/* Time */}
                  <span className="text-gray-400 text-xs font-mono shrink-0 w-11 pt-0.5">
                    {block.time_label}
                  </span>
                  {/* Icon */}
                  <Icon className="w-3.5 h-3.5 text-gray-400 shrink-0 mt-0.5" style={{ color: block.color }} />
                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      {block.priority && (
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PRIORITY_DOT[block.priority] || 'bg-gray-500'}`} />
                      )}
                      <p className="text-white text-xs font-medium truncate">{block.title}</p>
                      {block.duration && (
                        <span className="text-gray-500 text-xs shrink-0 ml-auto">{block.duration}د</span>
                      )}
                    </div>
                    {block.description && (
                      <p className="text-gray-500 text-xs mt-0.5 truncate">{block.description}</p>
                    )}
                    {block.energy_match !== undefined && (
                      <p className="text-xs mt-0.5" style={{ color: block.energy_match >= 70 ? '#10b981' : block.energy_match >= 50 ? '#eab308' : '#f97316' }}>
                        تطابق طاقة: {block.energy_match}%
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Mood adjustment note */}
          {data.mood_adjustments && (
            <div className="mt-3 bg-gray-800/60 rounded-xl px-3 py-2 text-xs text-gray-400">
              💡 {data.mood_adjustments.recommendation}
            </div>
          )}
        </>
      )}
    </motion.div>
  );
}

function StatCell({ label, value }) {
  return (
    <div className="bg-gray-800/60 rounded-xl p-2 text-center">
      <p className="text-white text-sm font-bold">{value}</p>
      <p className="text-gray-500 text-xs mt-0.5">{label}</p>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-700 p-5 bg-gray-900/60 animate-pulse space-y-3">
      <div className="h-4 bg-gray-700 rounded w-1/3" />
      <div className="grid grid-cols-3 gap-2">
        {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-700 rounded-xl" />)}
      </div>
      {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-700 rounded-xl" />)}
    </div>
  );
}
