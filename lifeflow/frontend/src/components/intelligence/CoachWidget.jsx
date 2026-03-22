/**
 * CoachWidget — Phase 11
 * =======================
 * AI Life Coach insights panel: burnout warning, recommendations,
 * life balance radar, and action plan.
 */
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, AlertTriangle, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp } from 'lucide-react';
import { intelligenceAPIv2 } from '../../utils/api';

const RISK_CONFIG = {
  high:   { color: 'text-red-400',    bg: 'bg-red-500/20',    border: 'border-red-500/40',    label: 'خطر مرتفع' },
  medium: { color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/40', label: 'خطر متوسط' },
  low:    { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40', label: 'آمن' },
};

const PRIORITY_COLORS = {
  critical: 'border-red-500 bg-red-500/10',
  high:     'border-orange-500 bg-orange-500/10',
  medium:   'border-yellow-500 bg-yellow-500/10',
  low:      'border-gray-600 bg-gray-800/50',
};

function TrendIcon({ trend }) {
  if (trend === 'improving') return <TrendingUp className="w-4 h-4 text-emerald-400" />;
  if (trend === 'declining') return <TrendingDown className="w-4 h-4 text-red-400" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
}

function BalanceBar({ label, value, color }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300">{value}%</span>
      </div>
      <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${value}%` }}
          transition={{ duration: 0.7 }}
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
        />
      </div>
    </div>
  );
}

export default function CoachWidget() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    intelligenceAPIv2.getCoachInsights()
      .then(res => setData(res.data?.data || res.data))
      .catch(err => setError(err.message || 'خطأ في تحميل بيانات المدرب'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonCard />;
  if (error)   return <ErrorCard message={error} />;

  const burnout = data.burnout_warning;
  const bCfg    = RISK_CONFIG[burnout.risk_level] || RISK_CONFIG.low;
  const balance = data.life_balance;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-indigo-500/30 p-5 bg-gray-900/60 backdrop-blur"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-indigo-400" />
          <h3 className="text-white font-semibold text-sm">المدرب الذكي</h3>
        </div>
        <div className="flex items-center gap-2">
          <TrendIcon trend={data.summary.score_trend} />
          <span className={`text-xs px-2 py-1 rounded-full ${bCfg.bg} ${bCfg.color} font-medium border ${bCfg.border}`}>
            {burnout.urgent ? '⚠️ ' : ''}{bCfg.label}
          </span>
        </div>
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <SummaryCell label="متوسط الأداء" value={`${data.summary.avg_score_14d}/100`} />
        <SummaryCell label="متوسط المزاج" value={`${data.summary.avg_mood_14d}/10`} />
        <SummaryCell label="إتمام المهام" value={`${data.summary.task_completion_rate}%`} />
      </div>

      {/* Burnout warning banner */}
      {burnout.urgent && (
        <div className="mb-4 flex items-start gap-2 bg-red-500/10 border border-red-500/40 rounded-xl px-3 py-2.5">
          <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
          <div>
            <p className="text-red-300 text-xs font-semibold mb-1">تحذير إجهاد</p>
            <p className="text-red-200/80 text-xs">{burnout.factors.join(' · ')}</p>
          </div>
        </div>
      )}

      {/* Top recommendation */}
      {data.recommendations.length > 0 && (
        <div className={`mb-4 rounded-xl border px-3 py-2.5 ${PRIORITY_COLORS[data.recommendations[0].priority] || PRIORITY_COLORS.low}`}>
          <p className="text-white text-xs font-semibold mb-1">{data.recommendations[0].title}</p>
          <p className="text-gray-300 text-xs leading-relaxed">{data.recommendations[0].body}</p>
        </div>
      )}

      {/* Life Balance bars */}
      <div className="space-y-2 mb-3">
        <p className="text-xs text-gray-500 font-medium mb-2">توازن الحياة</p>
        <BalanceBar label="المهام"       value={balance.tasks}       color="#3b82f6" />
        <BalanceBar label="العادات"      value={balance.habits}      color="#10b981" />
        <BalanceBar label="المزاج"       value={balance.mood}        color="#ec4899" />
        <BalanceBar label="الاتساق"      value={balance.consistency} color="#8b5cf6" />
      </div>

      {/* Expand / collapse */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 transition-colors mt-2"
      >
        {expanded ? <><ChevronUp className="w-3.5 h-3.5" /> إخفاء التفاصيل</> : <><ChevronDown className="w-3.5 h-3.5" /> عرض التفاصيل</>}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {/* All recommendations */}
            <div className="mt-3 space-y-2">
              <p className="text-xs text-gray-500 font-medium">التوصيات</p>
              {data.recommendations.slice(1).map((r, i) => (
                <div key={i} className={`rounded-xl border px-3 py-2 ${PRIORITY_COLORS[r.priority] || PRIORITY_COLORS.low}`}>
                  <p className="text-white text-xs font-semibold mb-0.5">{r.title}</p>
                  <p className="text-gray-400 text-xs">{r.body}</p>
                </div>
              ))}
            </div>

            {/* Action Plan */}
            {data.action_plan?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 font-medium mb-2">خطة العمل</p>
                <div className="space-y-1.5">
                  {data.action_plan.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-indigo-400 font-medium shrink-0">{item.day}:</span>
                      <span className="text-gray-300">{item.task}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Highlights */}
            {data.highlights?.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 font-medium mb-2">إنجازاتك</p>
                <div className="space-y-1">
                  {data.highlights.map((h, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray-300">
                      <span>{h.emoji}</span><span>{h.text}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function SummaryCell({ label, value }) {
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
      {[1,2,3,4].map(i => <div key={i} className="h-3 bg-gray-700 rounded" />)}
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
