/**
 * Performance View - AI Performance Engine
 * ==========================================
 * Shows productivity/focus/consistency scores,
 * weekly trends, and coaching message.
 * Premium-gated with upgrade modal.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  RadialBarChart, RadialBar, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell,
} from 'recharts';
import {
  Zap, Target, TrendingUp, Brain, Star, ArrowUp, ArrowDown,
  Minus, Crown, Lock, ChevronRight, AlertTriangle, Lightbulb,
  Clock, Flame, RefreshCw,
} from 'lucide-react';
import api from '../../utils/api';
import UpgradeModal from '../subscription/UpgradeModal';

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export default function PerformanceView({ userPlan }) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeFeature, setUpgradeFeature] = useState('performance_scores');

  const isPremium = ['premium', 'enterprise', 'trial'].includes(userPlan);

  // Premium data queries
  const dashboardQuery = useQuery({
    queryKey: ['performance-dashboard'],
    queryFn: () => api.get('/performance/dashboard'),
    enabled: isPremium,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  const handlePremiumFeature = (feature) => {
    if (!isPremium) {
      setUpgradeFeature(feature);
      setShowUpgrade(true);
    }
  };

  if (!isPremium) {
    return (
      <>
        <LockedPerformanceView onUpgrade={(f) => { setUpgradeFeature(f); setShowUpgrade(true); }} />
        <UpgradeModal
          isOpen={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          feature={upgradeFeature}
          onTrialStart={() => window.location.reload()}
        />
      </>
    );
  }

  const data       = dashboardQuery.data?.data;
  const isLoading  = dashboardQuery.isLoading;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="text-yellow-400" size={24} />
            محرك الأداء الذكي
          </h1>
          <p className="text-gray-400 text-sm mt-1">تحليل شامل لأدائك اليومي والأسبوعي</p>
        </div>
        <button
          onClick={() => dashboardQuery.refetch()}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <RefreshCw size={18} className={dashboardQuery.isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {isLoading ? (
        <PerformanceSkeleton />
      ) : (
        <>
          {/* Today's Scores */}
          <TodayScoreCard score={data?.today_score} />

          {/* Coaching Message */}
          {data?.coaching && <CoachingCard coaching={data.coaching} />}

          {/* 7-Day Trend */}
          {data?.history_7d?.length > 0 && (
            <TrendChart history={data.history_7d} />
          )}

          {/* Active Behavioral Flags */}
          {data?.active_flags?.length > 0 && (
            <BehavioralFlagsCard flags={data.active_flags} />
          )}

          {/* Energy Profile */}
          {data?.energy_profile?.has_data && (
            <EnergyProfileCard energy={data.energy_profile} />
          )}

          {/* Weekly Audit Preview */}
          {data?.weekly_audit && (
            <WeeklyAuditCard audit={data.weekly_audit} />
          )}
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TODAY'S SCORE CARD
// ─────────────────────────────────────────────────────────────────────────────

function TodayScoreCard({ score }) {
  if (!score) return null;

  const scores = [
    { key: 'productivity_score', label: 'الإنتاجية', color: '#6C63FF', icon: Target },
    { key: 'focus_score',        label: 'التركيز',   color: '#10B981', icon: Brain  },
    { key: 'consistency_score',  label: 'الاتساق',   color: '#F59E0B', icon: Flame  },
  ];

  const delta    = score.score_delta || 0;
  const DeltaIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const deltaColor = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-400';

  const radialData = [
    { name: 'النتيجة', value: score.overall_score, fill: '#6C63FF' },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-6"
      style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.15) 0%, rgba(16,185,129,0.1) 100%)', border: '1px solid rgba(108,99,255,0.3)' }}
    >
      <div className="flex items-center gap-2 mb-4">
        <Star size={18} className="text-yellow-400" />
        <h3 className="text-white font-semibold">أداء اليوم</h3>
        <span className="text-xs text-gray-500 mr-auto">{score.score_date}</span>
      </div>

      <div className="grid grid-cols-4 gap-4 items-center">
        {/* Overall Score Radial */}
        <div className="text-center col-span-1">
          <div className="relative w-24 h-24 mx-auto">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart
                cx="50%" cy="50%" innerRadius="60%" outerRadius="100%"
                data={[{ value: score.overall_score, fill: '#6C63FF' }]}
                startAngle={90} endAngle={-270}
              >
                <RadialBar dataKey="value" background={{ fill: 'rgba(255,255,255,0.05)' }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-bold text-white">{score.overall_score}</span>
              <span className="text-xs text-gray-400">/100</span>
            </div>
          </div>
          <p className="text-gray-400 text-xs mt-1">الإجمالي</p>
          <p className={`text-xs font-medium flex items-center justify-center gap-1 ${deltaColor}`}>
            <DeltaIcon size={12} />
            {Math.abs(delta).toFixed(0)}
          </p>
        </div>

        {/* Sub-scores */}
        <div className="col-span-3 grid grid-cols-3 gap-3">
          {scores.map(({ key, label, color, icon: Icon }) => (
            <div
              key={key}
              className="rounded-xl p-3 text-center"
              style={{ background: `${color}15`, border: `1px solid ${color}30` }}
            >
              <Icon size={18} style={{ color }} className="mx-auto mb-1" />
              <div className="text-xl font-bold text-white">{score[key]}</div>
              <div className="text-xs text-gray-400">{label}</div>
            </div>
          ))}

          {/* Sub-metrics */}
          <div className="col-span-3 grid grid-cols-3 gap-2 mt-1">
            {[
              { label: 'إتمام المهام', value: `${score.task_completion_rate}%` },
              { label: 'إتمام العادات', value: `${score.habit_completion_rate}%` },
              { label: 'متوسط المزاج', value: `${score.mood_average}/10` },
            ].map(m => (
              <div key={m.label} className="text-center">
                <div className="text-sm font-semibold text-gray-300">{m.value}</div>
                <div className="text-xs text-gray-500">{m.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COACHING CARD
// ─────────────────────────────────────────────────────────────────────────────

function CoachingCard({ coaching }) {
  const typeColors = {
    morning:      'from-yellow-500/20 to-orange-500/10',
    checkin:      'from-blue-500/20 to-purple-500/10',
    evening:      'from-purple-500/20 to-blue-500/10',
    winddown:     'from-indigo-500/20 to-purple-500/10',
    motivational: 'from-green-500/20 to-teal-500/10',
    nudge:        'from-red-500/20 to-orange-500/10',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className={`rounded-2xl p-5 bg-gradient-to-r ${typeColors[coaching.type] || typeColors.motivational}`}
      style={{ border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <div className="flex items-start gap-3">
        <div className="text-3xl">💡</div>
        <div className="flex-1">
          <p className="text-white text-sm leading-relaxed">{coaching.message}</p>
          {coaching.actions?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-3">
              {coaching.actions.map((action, i) => (
                <button
                  key={i}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors"
                >
                  {action.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// TREND CHART
// ─────────────────────────────────────────────────────────────────────────────

function TrendChart({ history }) {
  const chartData = history.map(h => ({
    date:         h.score_date?.slice(5),
    productivity: h.productivity_score,
    focus:        h.focus_score,
    consistency:  h.consistency_score,
    overall:      h.overall_score,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="rounded-2xl p-5"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
        <TrendingUp size={18} className="text-purple-400" />
        الاتجاه خلال 7 أيام
      </h3>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 11 }} />
          <YAxis domain={[0, 100]} stroke="#6b7280" tick={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: '#1a1a2e', border: '1px solid #6C63FF', borderRadius: 8, direction: 'rtl' }}
            labelStyle={{ color: '#fff', fontFamily: 'Cairo' }}
          />
          <Line type="monotone" dataKey="overall"      stroke="#6C63FF" strokeWidth={2} dot={{ r: 3 }} name="الإجمالي" />
          <Line type="monotone" dataKey="productivity" stroke="#10B981" strokeWidth={1.5} dot={false} name="الإنتاجية" />
          <Line type="monotone" dataKey="focus"        stroke="#F59E0B" strokeWidth={1.5} dot={false} name="التركيز" />
        </LineChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// BEHAVIORAL FLAGS
// ─────────────────────────────────────────────────────────────────────────────

function BehavioralFlagsCard({ flags }) {
  const severityColors = { low: '#6b7280', medium: '#F59E0B', high: '#EF4444', critical: '#DC2626' };
  const typeEmojis = {
    procrastination: '⏰', avoidance: '🙈', burnout_risk: '🔥',
    overcommitment: '📚', energy_mismatch: '⚡', consistency_drop: '📉',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-2xl p-5"
      style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)' }}
    >
      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
        <AlertTriangle size={18} className="text-red-400" />
        تنبيهات سلوكية ({flags.length})
      </h3>
      <div className="space-y-3">
        {flags.slice(0, 4).map(flag => (
          <div
            key={flag.id}
            className="rounded-xl p-3 flex items-start gap-3"
            style={{ background: `${severityColors[flag.severity] || '#6b7280'}15` }}
          >
            <span className="text-xl">{typeEmojis[flag.flag_type] || '🚩'}</span>
            <div className="flex-1">
              <p className="text-white text-sm">{flag.description}</p>
              {flag.ai_recommendation && (
                <p className="text-gray-400 text-xs mt-1">
                  💡 {flag.ai_recommendation.slice(0, 100)}...
                </p>
              )}
            </div>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{
                background: `${severityColors[flag.severity]}22`,
                color: severityColors[flag.severity],
              }}
            >
              {flag.severity === 'high' ? 'عالي' : flag.severity === 'medium' ? 'متوسط' : 'منخفض'}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ENERGY PROFILE CARD
// ─────────────────────────────────────────────────────────────────────────────

function EnergyProfileCard({ energy }) {
  const maxPct = Math.max(...(energy.hourly_heatmap?.map(h => h.percentage) || [1])) || 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 }}
      className="rounded-2xl p-5"
      style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)' }}
    >
      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
        <Zap size={18} className="text-green-400" />
        خريطة الطاقة الشخصية
      </h3>

      {/* Hourly bar chart */}
      <div className="flex gap-0.5 h-16 items-end mb-4">
        {energy.hourly_heatmap?.filter((_, i) => i >= 6 && i <= 22).map((h) => (
          <div
            key={h.hour}
            className="flex-1 rounded-t transition-all"
            style={{
              height: `${(h.percentage / maxPct) * 100}%`,
              minHeight: 2,
              background: energy.peak_hours?.includes(h.hour)
                ? '#10B981'
                : `rgba(16,185,129,${0.2 + (h.percentage / maxPct) * 0.5})`,
            }}
            title={`${h.label}: ${h.percentage}%`}
          />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 text-sm">
        <div className="text-center p-2 rounded-lg bg-white/5">
          <div className="text-green-400 font-bold">
            {energy.best_work_window?.label || '--'}
          </div>
          <div className="text-gray-400 text-xs">وقت العمل المثالي</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white/5">
          <div className="text-yellow-400 font-bold">{energy.best_day || '--'}</div>
          <div className="text-gray-400 text-xs">أفضل يوم</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white/5">
          <div className="text-purple-400 font-bold">{energy.data_points}</div>
          <div className="text-gray-400 text-xs">نقطة بيانات</div>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WEEKLY AUDIT CARD (preview)
// ─────────────────────────────────────────────────────────────────────────────

function WeeklyAuditCard({ audit }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5 }}
      className="rounded-2xl p-5"
      style={{ background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold flex items-center gap-2">
          <Crown size={18} className="text-yellow-400" />
          التدقيق الأسبوعي
        </h3>
        <span className="text-xs text-gray-400">
          {audit.week_start} – {audit.week_end}
        </span>
      </div>

      {audit.coach_summary && (
        <p className="text-gray-300 text-sm mb-4 leading-relaxed bg-white/5 p-3 rounded-xl">
          {audit.coach_summary}
        </p>
      )}

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'إتمام المهام',  value: `${audit.task_completion_rate}%`, color: '#6C63FF' },
          { label: 'إتمام العادات', value: `${audit.habit_completion_rate}%`, color: '#10B981' },
          { label: 'متوسط المزاج',  value: `${audit.avg_mood}/10`, color: '#F59E0B' },
        ].map(m => (
          <div key={m.label} className="text-center p-2 rounded-xl bg-white/5">
            <div className="text-lg font-bold" style={{ color: m.color }}>{m.value}</div>
            <div className="text-gray-400 text-xs">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Improvement strategies */}
      {audit.improvement_strategies?.length > 0 && (
        <div className="space-y-2">
          <p className="text-gray-400 text-xs">استراتيجيات التحسين:</p>
          {audit.improvement_strategies.map((s, i) => (
            <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/5">
              <Lightbulb size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-white text-xs font-medium">{s.title}</p>
                <p className="text-gray-400 text-xs">{s.action}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCKED VIEW (Free users)
// ─────────────────────────────────────────────────────────────────────────────

function LockedPerformanceView({ onUpgrade }) {
  const features = [
    {
      key: 'performance_scores', icon: '🎯', title: 'محرك الأداء الذكي',
      description: 'درجات يومية للإنتاجية والتركيز والاتساق',
    },
    {
      key: 'weekly_audit', icon: '📊', title: 'التدقيق الأسبوعي',
      description: 'تحليل شامل لأسبوعك مع استراتيجيات تحسين',
    },
    {
      key: 'procrastination', icon: '🚩', title: 'كشف المماطلة',
      description: 'اكتشف أنماط التأجيل وتغلّب عليها',
    },
    {
      key: 'energy_mapping', icon: '⚡', title: 'خريطة الطاقة',
      description: 'احصل على جدول عمل مخصص لذروة طاقتك',
    },
    {
      key: 'coaching_mode', icon: '💡', title: 'التدريب الذكي',
      description: 'رسائل تحفيزية يومية مخصصة لك',
    },
  ];

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto" dir="rtl">
      <div className="text-center py-8">
        <motion.div
          animate={{ rotate: [0, -5, 5, 0] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="text-6xl mb-4"
        >
          🚀
        </motion.div>
        <h1 className="text-3xl font-bold text-white mb-3">محرك الأداء الذكي</h1>
        <p className="text-gray-400 max-w-md mx-auto">
          حوّل LifeFlow من مجرد منظّم مهام إلى مدرّب حياة شخصي يحلّل أداءك ويساعدك على التحسين المستمر.
        </p>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => onUpgrade('performance_scores')}
          className="mt-6 px-8 py-4 rounded-xl font-bold text-white text-lg inline-flex items-center gap-3"
          style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #10B981 100%)' }}
        >
          <Crown size={22} />
          جرّب مجاناً 7 أيام
        </motion.button>
        <p className="text-gray-600 text-sm mt-2">لا بطاقة ائتمان مطلوبة</p>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature, i) => (
          <motion.div
            key={feature.key}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            onClick={() => onUpgrade(feature.key)}
            className="rounded-2xl p-5 cursor-pointer group hover:scale-105 transition-transform relative overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <div className="absolute top-3 left-3">
              <Lock size={14} className="text-yellow-400" />
            </div>
            <div className="text-3xl mb-3">{feature.icon}</div>
            <h3 className="text-white font-semibold mb-1">{feature.title}</h3>
            <p className="text-gray-400 text-sm">{feature.description}</p>
            <div className="mt-3 flex items-center gap-1 text-purple-400 text-sm group-hover:gap-2 transition-all">
              <span>عرض المعاينة</span>
              <ChevronRight size={14} />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SKELETON
// ─────────────────────────────────────────────────────────────────────────────

function PerformanceSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="h-40 rounded-2xl bg-white/5" />
      ))}
    </div>
  );
}
