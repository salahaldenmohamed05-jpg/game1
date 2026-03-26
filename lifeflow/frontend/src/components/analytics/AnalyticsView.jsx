/**
 * AnalyticsView — Unified Analytics & Insights Dashboard
 * =========================================================
 * MERGE DECISION: Previously split between InsightsView and PerformanceView.
 * These two pages shared overlapping data (performance history, weekly audits,
 * insights) and caused user confusion about where to find analytics data.
 *
 * This unified view combines:
 *   - Productivity Score (from PerformanceView)
 *   - Weekly Trends chart (from PerformanceView)
 *   - AI Insights cards (from InsightsView)
 *   - Radar / dimension comparison (from InsightsView)
 *   - Energy Profile (from PerformanceView)
 *   - Weekly Audit History (from InsightsView)
 *   - Behavioral Flags (from PerformanceView)
 *   - Coaching message (from PerformanceView)
 *
 * Tab-based layout: "Overview" | "Insights" | "Performance" | "Audit"
 * Free users see basic insights + upgrade banner for premium sections.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Brain, TrendingUp, Calendar, ChevronDown, ChevronUp,
  Lightbulb, Star, AlertTriangle, Sparkles, Crown,
  BarChart2, RefreshCw, Zap, Target, Flame,
  ArrowUp, ArrowDown, Minus, Clock, Lock,
  ChevronRight,
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, RadialBarChart, RadialBar,
} from 'recharts';
import api from '../../utils/api';
import UpgradeModal from '../subscription/UpgradeModal';
import toast from 'react-hot-toast';

// ─── Tab Config ──────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',    label: 'نظرة عامة',  icon: BarChart2 },
  { id: 'insights',    label: 'رؤى ذكية',   icon: Lightbulb },
  { id: 'performance', label: 'الأداء',      icon: Target },
  { id: 'audit',       label: 'التدقيقات',   icon: Calendar },
];

// ─── Type Configs ────────────────────────────────────────────────────────────
const INSIGHT_TYPE_CONFIG = {
  suggestion:  { color: '#6C63FF', icon: Lightbulb,    bg: 'rgba(108,99,255,0.1)'  },
  achievement: { color: '#10B981', icon: Star,          bg: 'rgba(16,185,129,0.1)'  },
  warning:     { color: '#F59E0B', icon: AlertTriangle, bg: 'rgba(245,158,11,0.1)'  },
  celebration: { color: '#EC4899', icon: Sparkles,      bg: 'rgba(236,72,153,0.1)'  },
  analysis:    { color: '#3B82F6', icon: Brain,         bg: 'rgba(59,130,246,0.1)'  },
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function AnalyticsView({ userPlan }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [expandedAudit, setExpandedAudit] = useState(null);
  const isPremium = ['premium', 'enterprise', 'trial'].includes(userPlan);
  const queryClient = useQueryClient();

  // ─── Data Queries ─────────────────────────────────────────────────────────
  // Basic insights (all users)
  const insightsQuery = useQuery({
    queryKey: ['insights'],
    queryFn: () => api.get('/insights'),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  // Daily summary (all users)
  const dailySummaryQuery = useQuery({
    queryKey: ['insights-daily'],
    queryFn: () => api.get('/insights/daily'),
    retry: 1,
    staleTime: 10 * 60 * 1000,
  });

  // Performance dashboard (premium)
  const perfDashQuery = useQuery({
    queryKey: ['performance-dashboard'],
    queryFn: () => api.get('/performance/dashboard'),
    enabled: isPremium,
    refetchInterval: 5 * 60 * 1000,
    retry: 1,
  });

  // Performance history (premium, 30 days)
  const perfHistoryQuery = useQuery({
    queryKey: ['performance-history'],
    queryFn: () => api.get('/performance/history?days=30'),
    enabled: isPremium,
    retry: 1,
  });

  // Weekly audit history (premium)
  const auditQuery = useQuery({
    queryKey: ['audit-history'],
    queryFn: () => api.get('/performance/weekly-audit/history'),
    enabled: isPremium,
    retry: 1,
  });

  // Generate tips mutation
  const generateTipsMutation = useMutation({
    mutationFn: () => api.get('/insights/productivity-tips'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      toast.success('تم توليد رؤى جديدة!');
    },
    onError: () => toast.error('فشل في توليد الرؤى'),
  });

  // ─── Extract data ─────────────────────────────────────────────────────────
  const insights   = insightsQuery.data?.data?.data?.insights || insightsQuery.data?.data?.data || [];
  const perfDash   = perfDashQuery.data?.data?.data || perfDashQuery.data?.data || {};
  const history30  = perfHistoryQuery.data?.data?.data?.history || perfHistoryQuery.data?.data?.data || [];
  const audits     = auditQuery.data?.data?.data?.audits || auditQuery.data?.data?.data || [];
  const dailySum   = dailySummaryQuery.data?.data?.data;

  const history7 = perfDash?.history_7d || [];
  const todayScore = perfDash?.today_score;
  const coaching = perfDash?.coaching;
  const activeFlags = perfDash?.active_flags || [];
  const energyProfile = perfDash?.energy_profile;

  // Radar chart data from 30-day history
  const latestScores = history30[history30.length - 1];
  const radarData = latestScores ? [
    { subject: 'الإنتاجية', A: latestScores.productivity_score,  fullMark: 100 },
    { subject: 'التركيز',   A: latestScores.focus_score,          fullMark: 100 },
    { subject: 'الاتساق',  A: latestScores.consistency_score,     fullMark: 100 },
    { subject: 'المهام',    A: latestScores.task_completion_rate,  fullMark: 100 },
    { subject: 'العادات',  A: latestScores.habit_completion_rate, fullMark: 100 },
    { subject: 'المزاج',   A: (latestScores.mood_average || 0) * 10, fullMark: 100 },
  ] : [];

  const isLoading = insightsQuery.isLoading && perfDashQuery.isLoading;

  const handleRefresh = () => {
    insightsQuery.refetch();
    if (isPremium) {
      perfDashQuery.refetch();
      perfHistoryQuery.refetch();
      auditQuery.refetch();
    }
  };

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
            <BarChart2 className="text-primary-400" size={24} />
            التحليلات والرؤى
          </h1>
          <p className="text-gray-400 text-xs sm:text-sm mt-1">تحليل شامل لأدائك ورؤى ذكية</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => generateTipsMutation.mutate()}
            disabled={generateTipsMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 transition-colors text-xs sm:text-sm"
          >
            <Zap size={14} className={generateTipsMutation.isPending ? 'animate-pulse' : ''} />
            <span className="hidden sm:inline">{generateTipsMutation.isPending ? 'جارٍ...' : 'توليد رؤى'}</span>
          </button>
          <button
            onClick={handleRefresh}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm whitespace-nowrap transition-all ${
              activeTab === id
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30 font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.15 }}
        >
          {activeTab === 'overview' && (
            <OverviewTab
              todayScore={todayScore}
              coaching={coaching}
              dailySummary={dailySum}
              insights={insights}
              history7={history7}
              isPremium={isPremium}
              onUpgrade={() => setShowUpgrade(true)}
              onGenerate={() => generateTipsMutation.mutate()}
              isGenerating={generateTipsMutation.isPending}
            />
          )}
          {activeTab === 'insights' && (
            <InsightsTab
              insights={insights}
              radarData={radarData}
              history30={history30}
              isPremium={isPremium}
              onUpgrade={() => setShowUpgrade(true)}
              onGenerate={() => generateTipsMutation.mutate()}
              isGenerating={generateTipsMutation.isPending}
              isLoading={insightsQuery.isLoading}
            />
          )}
          {activeTab === 'performance' && (
            <PerformanceTab
              todayScore={todayScore}
              history7={history7}
              activeFlags={activeFlags}
              energyProfile={energyProfile}
              isPremium={isPremium}
              onUpgrade={() => setShowUpgrade(true)}
              isLoading={perfDashQuery.isLoading}
            />
          )}
          {activeTab === 'audit' && (
            <AuditTab
              audits={audits}
              expandedAudit={expandedAudit}
              setExpandedAudit={setExpandedAudit}
              isPremium={isPremium}
              onUpgrade={() => setShowUpgrade(true)}
              isLoading={auditQuery.isLoading}
            />
          )}
        </motion.div>
      </AnimatePresence>

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="advanced_insights"
        onTrialStart={() => window.location.reload()}
      />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB — quick snapshot of everything
// ═════════════════════════════════════════════════════════════════════════════

function OverviewTab({ todayScore, coaching, dailySummary, insights, history7, isPremium, onUpgrade, onGenerate, isGenerating }) {
  return (
    <div className="space-y-5">
      {/* Daily Summary */}
      {dailySummary && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 sm:p-5"
          style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(16,185,129,0.1))', border: '1px solid rgba(108,99,255,0.3)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-primary-400" />
            <h3 className="font-bold text-white text-sm">{dailySummary?.title || 'ملخص اليوم'}</h3>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">{dailySummary?.content}</p>
          {dailySummary?.data && (
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: 'المهام',  value: `${dailySummary.data?.tasks?.completed || 0}/${dailySummary.data?.tasks?.total || 0}`, color: '#6C63FF' },
                { label: 'العادات', value: `${dailySummary.data?.habits?.completed || 0}/${dailySummary.data?.habits?.total || 0}`, color: '#10B981' },
                { label: 'المزاج',  value: dailySummary.data?.mood ? `${dailySummary.data.mood}/10` : '-', color: '#F59E0B' },
              ].map(m => (
                <div key={m.label} className="text-center p-2 rounded-lg bg-white/5">
                  <div className="font-bold text-sm" style={{ color: m.color }}>{m.value}</div>
                  <div className="text-gray-500 text-xs">{m.label}</div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Today's Score (Premium) */}
      {isPremium && todayScore && <TodayScoreCard score={todayScore} compact />}

      {/* Coaching Message */}
      {isPremium && coaching && <CoachingCard coaching={coaching} />}

      {/* 7-Day Trend */}
      {isPremium && history7.length > 0 && <TrendChart history={history7} />}

      {/* Top Insights */}
      {insights.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <Lightbulb size={16} className="text-yellow-400" />
            أبرز الرؤى
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {insights.slice(0, 4).map((insight, i) => (
              <InsightCard key={insight.id || i} insight={insight} index={i} />
            ))}
          </div>
        </section>
      )}

      {/* Premium Banner for free users */}
      {!isPremium && <PremiumBanner onUpgrade={onUpgrade} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// INSIGHTS TAB
// ═════════════════════════════════════════════════════════════════════════════

function InsightsTab({ insights, radarData, history30, isPremium, onUpgrade, onGenerate, isGenerating, isLoading }) {
  return (
    <div className="space-y-5">
      {/* Insights Grid */}
      <section>
        <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
          <Lightbulb size={16} className="text-yellow-400" />
          رؤى اليوم
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
            ))
          ) : insights.length > 0 ? (
            insights.slice(0, 6).map((insight, i) => (
              <InsightCard key={insight.id || i} insight={insight} index={i} />
            ))
          ) : (
            <EmptyInsights onGenerate={onGenerate} isLoading={isGenerating} />
          )}
        </div>
      </section>

      {/* 30-Day Trend (Premium) */}
      {isPremium && history30.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-green-400" />
            منحنى الأداء (30 يوم)
          </h2>
          <ChartCard>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={history30.map(h => ({
                date:         h.score_date?.slice(5),
                overall:      h.overall_score,
                productivity: h.productivity_score,
                focus:        h.focus_score,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 10 }} interval={4} />
                <YAxis domain={[0, 100]} stroke="#6b7280" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="overall"      stroke="#6C63FF" strokeWidth={2}   dot={false} name="الإجمالي" />
                <Line type="monotone" dataKey="productivity" stroke="#10B981" strokeWidth={1.5} dot={false} name="الإنتاجية" />
                <Line type="monotone" dataKey="focus"        stroke="#F59E0B" strokeWidth={1.5} dot={false} name="التركيز" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>
      )}

      {/* Radar Chart (Premium) */}
      {isPremium && radarData.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <BarChart2 size={16} className="text-blue-400" />
            مقارنة الأبعاد
          </h2>
          <ChartCard>
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="rgba(255,255,255,0.1)" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 11, fontFamily: 'Cairo' }} />
                <Radar name="الأداء" dataKey="A" stroke="#6C63FF" fill="#6C63FF" fillOpacity={0.2} />
              </RadarChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>
      )}

      {!isPremium && <PremiumBanner onUpgrade={onUpgrade} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PERFORMANCE TAB
// ═════════════════════════════════════════════════════════════════════════════

function PerformanceTab({ todayScore, history7, activeFlags, energyProfile, isPremium, onUpgrade, isLoading }) {
  if (!isPremium) {
    return <LockedSection onUpgrade={onUpgrade} title="محرك الأداء الذكي" desc="تحليل يومي وأسبوعي شامل لأدائك" />;
  }
  if (isLoading) return <Skeleton count={3} />;

  return (
    <div className="space-y-5">
      {todayScore && <TodayScoreCard score={todayScore} />}
      {history7.length > 0 && <TrendChart history={history7} />}
      {activeFlags.length > 0 && <BehavioralFlagsCard flags={activeFlags} />}
      {energyProfile?.has_data && <EnergyProfileCard energy={energyProfile} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AUDIT TAB
// ═════════════════════════════════════════════════════════════════════════════

function AuditTab({ audits, expandedAudit, setExpandedAudit, isPremium, onUpgrade, isLoading }) {
  if (!isPremium) {
    return <LockedSection onUpgrade={onUpgrade} title="التدقيقات الأسبوعية" desc="تقارير أسبوعية مفصلة مع استراتيجيات تحسين" />;
  }
  if (isLoading) return <Skeleton count={2} />;
  if (!audits.length) {
    return (
      <div className="text-center py-12">
        <div className="text-4xl mb-3">📋</div>
        <p className="text-gray-400 text-sm">لا توجد تدقيقات أسبوعية بعد</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {audits.map((audit, i) => (
        <AuditAccordion
          key={audit.id || i}
          audit={audit}
          isExpanded={expandedAudit === (audit.id || i)}
          onToggle={() => setExpandedAudit(expandedAudit === (audit.id || i) ? null : (audit.id || i))}
          index={i}
        />
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

const TOOLTIP_STYLE = {
  background: '#1a1a2e',
  border: '1px solid #6C63FF',
  borderRadius: 8,
  direction: 'rtl',
  fontFamily: 'Cairo',
};

function ChartCard({ children }) {
  return (
    <div className="rounded-2xl p-4 sm:p-5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
      {children}
    </div>
  );
}

// ─── Today Score Card ────────────────────────────────────────────────────────
function TodayScoreCard({ score, compact = false }) {
  if (!score) return null;

  const subScores = [
    { key: 'productivity_score', label: 'الإنتاجية', color: '#6C63FF', icon: Target },
    { key: 'focus_score',        label: 'التركيز',   color: '#10B981', icon: Brain  },
    { key: 'consistency_score',  label: 'الاتساق',   color: '#F59E0B', icon: Flame  },
  ];

  const delta     = score.score_delta || 0;
  const DeltaIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const deltaColor = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-400';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 sm:p-5"
      style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(16,185,129,0.1))', border: '1px solid rgba(108,99,255,0.3)' }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Star size={16} className="text-yellow-400" />
        <h3 className="text-white font-semibold text-sm">أداء اليوم</h3>
        <span className="text-xs text-gray-500 mr-auto">{score.score_date}</span>
      </div>

      <div className={`grid ${compact ? 'grid-cols-4' : 'grid-cols-4'} gap-3 items-center`}>
        {/* Overall Radial */}
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto">
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
              <span className="text-xl font-bold text-white">{score.overall_score}</span>
              <span className="text-[10px] text-gray-400">/100</span>
            </div>
          </div>
          <p className={`text-xs font-medium flex items-center justify-center gap-0.5 mt-1 ${deltaColor}`}>
            <DeltaIcon size={10} />
            {Math.abs(delta).toFixed(0)}
          </p>
        </div>

        {/* Sub-scores */}
        <div className="col-span-3 grid grid-cols-3 gap-2">
          {subScores.map(({ key, label, color, icon: Icon }) => (
            <div
              key={key}
              className="rounded-xl p-2.5 text-center"
              style={{ background: `${color}15`, border: `1px solid ${color}30` }}
            >
              <Icon size={16} style={{ color }} className="mx-auto mb-1" />
              <div className="text-lg font-bold text-white">{score[key]}</div>
              <div className="text-[10px] text-gray-400">{label}</div>
            </div>
          ))}
          {!compact && (
            <div className="col-span-3 grid grid-cols-3 gap-2 mt-1">
              {[
                { label: 'إتمام المهام', value: `${score.task_completion_rate}%` },
                { label: 'إتمام العادات', value: `${score.habit_completion_rate}%` },
                { label: 'متوسط المزاج', value: `${score.mood_average}/10` },
              ].map(m => (
                <div key={m.label} className="text-center">
                  <div className="text-sm font-semibold text-gray-300">{m.value}</div>
                  <div className="text-[10px] text-gray-500">{m.label}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ─── Coaching Card ───────────────────────────────────────────────────────────
function CoachingCard({ coaching }) {
  const typeColors = {
    morning: 'from-yellow-500/20 to-orange-500/10',
    checkin: 'from-blue-500/20 to-purple-500/10',
    evening: 'from-purple-500/20 to-blue-500/10',
    motivational: 'from-green-500/20 to-teal-500/10',
    nudge: 'from-red-500/20 to-orange-500/10',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 bg-gradient-to-r ${typeColors[coaching.type] || typeColors.motivational}`}
      style={{ border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <div className="flex items-start gap-3">
        <div className="text-2xl">💡</div>
        <div className="flex-1">
          <p className="text-white text-sm leading-relaxed">{coaching.message}</p>
          {coaching.actions?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {coaching.actions.map((action, i) => (
                <button key={i} className="px-3 py-1 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors">
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

// ─── Trend Chart ─────────────────────────────────────────────────────────────
function TrendChart({ history }) {
  const chartData = history.map(h => ({
    date:         h.score_date?.slice(5),
    productivity: h.productivity_score,
    focus:        h.focus_score,
    consistency:  h.consistency_score,
    overall:      h.overall_score,
  }));

  return (
    <ChartCard>
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2 text-sm">
        <TrendingUp size={16} className="text-purple-400" />
        اتجاه الأداء ({history.length} يوم)
      </h3>
      <ResponsiveContainer width="100%" height={180}>
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 10 }} />
          <YAxis domain={[0, 100]} stroke="#6b7280" tick={{ fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
          <Line type="monotone" dataKey="overall"      stroke="#6C63FF" strokeWidth={2} dot={{ r: 2 }} name="الإجمالي" />
          <Line type="monotone" dataKey="productivity" stroke="#10B981" strokeWidth={1.5} dot={false}  name="الإنتاجية" />
          <Line type="monotone" dataKey="focus"        stroke="#F59E0B" strokeWidth={1.5} dot={false}  name="التركيز" />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Insight Card ────────────────────────────────────────────────────────────
function InsightCard({ insight, index }) {
  const cfg  = INSIGHT_TYPE_CONFIG[insight.type] || INSIGHT_TYPE_CONFIG.suggestion;
  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-xl p-3.5"
      style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}
    >
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${cfg.color}20` }}>
          <Icon size={16} style={{ color: cfg.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-xs mb-0.5">{insight.title}</h3>
          <p className="text-gray-400 text-xs leading-relaxed line-clamp-2">
            {insight.content || insight.description || insight.summary}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Behavioral Flags ────────────────────────────────────────────────────────
function BehavioralFlagsCard({ flags }) {
  const severityColors = { low: '#6b7280', medium: '#F59E0B', high: '#EF4444', critical: '#DC2626' };
  const typeEmojis = {
    procrastination: '⏰', avoidance: '🙈', burnout_risk: '🔥',
    overcommitment: '📚', energy_mismatch: '⚡', consistency_drop: '📉',
  };

  return (
    <ChartCard>
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2 text-sm">
        <AlertTriangle size={16} className="text-red-400" />
        تنبيهات سلوكية ({flags.length})
      </h3>
      <div className="space-y-2.5">
        {flags.slice(0, 4).map(flag => (
          <div key={flag.id} className="rounded-xl p-3 flex items-start gap-2.5" style={{ background: `${severityColors[flag.severity] || '#6b7280'}15` }}>
            <span className="text-lg">{typeEmojis[flag.flag_type] || '🚩'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs">{flag.description}</p>
              {flag.ai_recommendation && (
                <p className="text-gray-400 text-[11px] mt-1">💡 {flag.ai_recommendation.slice(0, 100)}...</p>
              )}
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: `${severityColors[flag.severity]}22`, color: severityColors[flag.severity] }}>
              {flag.severity === 'high' ? 'عالي' : flag.severity === 'medium' ? 'متوسط' : 'منخفض'}
            </span>
          </div>
        ))}
      </div>
    </ChartCard>
  );
}

// ─── Energy Profile ──────────────────────────────────────────────────────────
function EnergyProfileCard({ energy }) {
  const maxPct = Math.max(...(energy.hourly_heatmap?.map(h => h.percentage) || [1])) || 1;

  return (
    <ChartCard>
      <h3 className="text-white font-semibold mb-3 flex items-center gap-2 text-sm">
        <Zap size={16} className="text-green-400" />
        خريطة الطاقة الشخصية
      </h3>
      <div className="flex gap-0.5 h-14 items-end mb-3">
        {energy.hourly_heatmap?.filter((_, i) => i >= 6 && i <= 22).map(h => (
          <div
            key={h.hour}
            className="flex-1 rounded-t transition-all"
            style={{
              height: `${(h.percentage / maxPct) * 100}%`,
              minHeight: 2,
              background: energy.peak_hours?.includes(h.hour) ? '#10B981' : `rgba(16,185,129,${0.2 + (h.percentage / maxPct) * 0.5})`,
            }}
            title={`${h.label}: ${h.percentage}%`}
          />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="text-center p-2 rounded-lg bg-white/5">
          <div className="text-green-400 font-bold">{energy.best_work_window?.label || '--'}</div>
          <div className="text-gray-400 text-[10px]">وقت العمل المثالي</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white/5">
          <div className="text-yellow-400 font-bold">{energy.best_day || '--'}</div>
          <div className="text-gray-400 text-[10px]">أفضل يوم</div>
        </div>
        <div className="text-center p-2 rounded-lg bg-white/5">
          <div className="text-purple-400 font-bold">{energy.data_points}</div>
          <div className="text-gray-400 text-[10px]">نقطة بيانات</div>
        </div>
      </div>
    </ChartCard>
  );
}

// ─── Audit Accordion ─────────────────────────────────────────────────────────
function AuditAccordion({ audit, isExpanded, onToggle, index }) {
  const moodColor = audit.mood_trend === 'improving' ? '#10B981'
    : audit.mood_trend === 'declining' ? '#EF4444' : '#6b7280';

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      <button onClick={onToggle} className="w-full p-4 flex items-center gap-3 hover:bg-white/5 transition-colors">
        <div className="flex-1 text-right">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-sm">
              أسبوع {audit.week_number} — {audit.week_start}
            </span>
            {!audit.is_read && <span className="w-2 h-2 bg-blue-400 rounded-full" />}
          </div>
          <div className="flex items-center gap-3 mt-1.5">
            <span className="text-[11px] text-gray-400">المهام: <span className="text-white">{audit.task_completion_rate}%</span></span>
            <span className="text-[11px] text-gray-400">العادات: <span className="text-white">{audit.habit_completion_rate}%</span></span>
            <span className="text-[11px] text-gray-400">المزاج: <span style={{ color: moodColor }}>{audit.mood_trend === 'improving' ? '↑' : audit.mood_trend === 'declining' ? '↓' : '→'}</span></span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-center">
            <div className="text-lg font-bold text-white">{audit.avg_productivity_score}</div>
            <div className="text-[10px] text-gray-500">درجة</div>
          </div>
          {isExpanded ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-white/10 pt-3">
              {audit.coach_summary && (
                <div className="p-3 rounded-xl bg-white/5 text-xs text-gray-300 leading-relaxed">
                  {audit.coach_summary}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: 'مهام مكتملة', value: `${audit.completed_tasks}/${audit.total_tasks}`, color: '#6C63FF' },
                  { label: 'إتمام العادات', value: `${audit.habit_completion_rate}%`, color: '#10B981' },
                  { label: 'متوسط المزاج', value: `${audit.avg_mood}/10`, color: '#F59E0B' },
                  { label: 'تغيير الأداء', value: `${audit.week_score_vs_last_week > 0 ? '+' : ''}${audit.week_score_vs_last_week}`, color: audit.week_score_vs_last_week >= 0 ? '#10B981' : '#EF4444' },
                ].map(m => (
                  <div key={m.label} className="text-center p-2 rounded-lg bg-white/5">
                    <div className="font-bold text-sm" style={{ color: m.color }}>{m.value}</div>
                    <div className="text-gray-500 text-[10px]">{m.label}</div>
                  </div>
                ))}
              </div>
              {audit.improvement_strategies?.length > 0 && (
                <div>
                  <p className="text-gray-400 text-[11px] mb-1.5">استراتيجيات التحسين:</p>
                  <div className="space-y-1.5">
                    {audit.improvement_strategies.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/5">
                        <span className="text-sm mt-0.5">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                        <div>
                          <p className="text-white text-xs font-semibold">{s.title}</p>
                          <p className="text-gray-400 text-[11px]">{s.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Premium Banner ──────────────────────────────────────────────────────────
function PremiumBanner({ onUpgrade }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-6 text-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(16,185,129,0.1))', border: '1px solid rgba(108,99,255,0.3)' }}
    >
      <Crown size={28} className="text-yellow-400 mx-auto mb-3" />
      <h2 className="text-lg font-bold text-white mb-2">تحليلات متقدمة</h2>
      <p className="text-gray-400 text-sm max-w-md mx-auto mb-4">
        احصل على منحنى الأداء، مخطط الأبعاد، التدقيقات الأسبوعية، وخريطة الطاقة.
      </p>
      <motion.button
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
        onClick={onUpgrade}
        className="px-6 py-3 rounded-xl font-bold text-white inline-flex items-center gap-2 text-sm"
        style={{ background: 'linear-gradient(135deg, #6C63FF, #10B981)' }}
      >
        <Sparkles size={16} />
        جرّب مجاناً 7 أيام
      </motion.button>
    </motion.div>
  );
}

// ─── Locked Section ──────────────────────────────────────────────────────────
function LockedSection({ onUpgrade, title, desc }) {
  return (
    <div className="text-center py-12">
      <Lock size={32} className="text-gray-600 mx-auto mb-3" />
      <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
      <p className="text-gray-400 text-sm mb-4 max-w-md mx-auto">{desc}</p>
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onUpgrade}
        className="px-6 py-3 rounded-xl font-bold text-white inline-flex items-center gap-2 text-sm"
        style={{ background: 'linear-gradient(135deg, #6C63FF, #10B981)' }}
      >
        <Crown size={16} />
        فعّل التجربة المجانية
      </motion.button>
    </div>
  );
}

// ─── Empty / Skeleton ────────────────────────────────────────────────────────
function EmptyInsights({ onGenerate, isLoading }) {
  return (
    <div className="col-span-2 text-center py-8">
      <div className="text-4xl mb-3">🌱</div>
      <h3 className="text-white font-semibold text-sm mb-1">لا توجد رؤى بعد</h3>
      <p className="text-gray-400 text-xs mb-3">أضف مهام وعادات لتوليد رؤى مخصصة</p>
      <button onClick={onGenerate} disabled={isLoading}
        className="px-3 py-2 rounded-xl bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 text-xs flex items-center gap-1.5 mx-auto">
        <Zap size={14} />
        {isLoading ? 'جارٍ...' : 'توليد رؤى'}
      </button>
    </div>
  );
}

function Skeleton({ count = 3 }) {
  return (
    <div className="space-y-4 animate-pulse">
      {[...Array(count)].map((_, i) => (
        <div key={i} className="h-32 rounded-2xl bg-white/5" />
      ))}
    </div>
  );
}
