/**
 * EnergyWidget — Phase 11
 * ========================
 * Displays daily energy score, level badge, breakdown bars,
 * focus windows, and actionable tips.
 */
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Zap, Clock, AlertTriangle, TrendingUp } from 'lucide-react';
import { intelligenceAPIv2 } from '../../utils/api';

const LEVEL_CONFIG = {
  high:     { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', label: 'طاقة عالية',    icon: '⚡' },
  medium:   { color: 'text-yellow-400',  bg: 'bg-yellow-500/20',  border: 'border-yellow-500/40',  label: 'طاقة متوسطة',   icon: '🔋' },
  low:      { color: 'text-orange-400',  bg: 'bg-orange-500/20',  border: 'border-orange-500/40',  label: 'طاقة منخفضة',   icon: '🪫' },
  critical: { color: 'text-red-400',     bg: 'bg-red-500/20',     border: 'border-red-500/40',     label: 'إرهاق شديد',    icon: '😮‍💨' },
};

const BREAKDOWN_LABELS = {
  sleep_score:     { label: 'النوم',       max: 20, color: '#6366f1' },
  mood_score:      { label: 'المزاج',      max: 25, color: '#ec4899' },
  habit_score:     { label: 'العادات',     max: 20, color: '#10b981' },
  task_load_score: { label: 'تحميل المهام', max: 20, color: '#f59e0b' },
  stress_score:    { label: 'الإجهاد',     max: 15, color: '#8b5cf6' },
};

export default function EnergyWidget() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    intelligenceAPIv2.getEnergyScore()
      .then(res => setData(res.data?.data || res.data))
      .catch(err => setError(err.message || 'خطأ في تحميل بيانات الطاقة'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonCard />;
  if (error)   return <ErrorCard message={error} />;

  const cfg = LEVEL_CONFIG[data.level] || LEVEL_CONFIG.medium;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border p-5 bg-gray-900/60 backdrop-blur ${cfg.border}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className={`w-5 h-5 ${cfg.color}`} />
          <h3 className="text-white font-semibold text-sm">طاقة اليوم</h3>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${cfg.bg} ${cfg.color} font-medium`}>
          {cfg.icon} {cfg.label}
        </span>
      </div>

      {/* Score Arc */}
      <div className="flex items-center justify-center mb-4">
        <div className="relative w-28 h-28">
          <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
            <circle cx="50" cy="50" r="40" fill="none" stroke="#1f2937" strokeWidth="10" />
            <circle
              cx="50" cy="50" r="40" fill="none"
              stroke={cfg.color.replace('text-', '').includes('emerald') ? '#10b981'
                : cfg.color.includes('yellow') ? '#eab308'
                : cfg.color.includes('orange') ? '#f97316' : '#ef4444'}
              strokeWidth="10"
              strokeDasharray={`${(data.energy_score / 100) * 251} 251`}
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${cfg.color}`}>{data.energy_score}</span>
            <span className="text-gray-400 text-xs">/ 100</span>
          </div>
        </div>
      </div>

      {/* Breakdown bars */}
      <div className="space-y-2 mb-4">
        {Object.entries(BREAKDOWN_LABELS).map(([key, cfg2]) => {
          const val = data.breakdown[key] || 0;
          const pct = Math.round((val / cfg2.max) * 100);
          return (
            <div key={key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">{cfg2.label}</span>
                <span className="text-gray-300">{val}/{cfg2.max}</span>
              </div>
              <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                  transition={{ delay: 0.1, duration: 0.6 }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: cfg2.color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Focus Windows */}
      {data.focus_windows?.length > 0 && (
        <div className="mb-3">
          <div className="flex items-center gap-1 mb-2">
            <Clock className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-xs text-gray-400 font-medium">نوافذ التركيز</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {data.focus_windows.map((w, i) => (
              <span key={i} className="text-xs bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                {w.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tips */}
      {data.tips?.length > 0 && (
        <div className="space-y-1.5">
          {data.tips.slice(0, 2).map((tip, i) => (
            <div key={i} className="flex items-start gap-2 bg-gray-800/50 rounded-lg px-3 py-2">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
              <p className="text-xs text-gray-300 leading-relaxed">{tip.text}</p>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-gray-700 p-5 bg-gray-900/60 animate-pulse">
      <div className="h-4 bg-gray-700 rounded w-1/3 mb-4" />
      <div className="w-28 h-28 rounded-full bg-gray-700 mx-auto mb-4" />
      <div className="space-y-2">
        {[1,2,3,4,5].map(i => <div key={i} className="h-3 bg-gray-700 rounded" />)}
      </div>
    </div>
  );
}

function ErrorCard({ message }) {
  return (
    <div className="rounded-2xl border border-red-500/30 p-5 bg-red-500/10 flex items-center gap-3">
      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
      <p className="text-red-300 text-sm">{message}</p>
    </div>
  );
}
