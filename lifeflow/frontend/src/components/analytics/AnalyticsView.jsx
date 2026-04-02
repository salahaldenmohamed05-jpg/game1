/**
 * AnalyticsView — Unified Analytics & Insights Dashboard (Phase E)
 * =================================================================
 * ARCHITECTURE:
 *   - "Overview" tab: metrics, charts, today score — pure DATA
 *   - "Insights" tab: AI interpretations, recommendations, action buttons
 *   - "Performance" tab: productivity score, weekly trend, energy, flags
 *   - "Audit" tab: weekly audit history + on-demand generation
 *
 * CHANGES from Phase D:
 *   - Insights have structured format: title + summary + action buttons
 *   - "عرض المزيد" expand on insights
 *   - Action buttons: "طبّق الآن", "أنشئ مهمة", "عدّل العادة"
 *   - No raw AI paragraphs — all insights are cards
 *   - On-demand audit generation button
 *   - Performance data mapping fixed (API returns data correctly)
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Brain, TrendingUp, Calendar, ChevronDown, ChevronUp,
  Lightbulb, Star, AlertTriangle, Sparkles, Crown,
  BarChart2, RefreshCw, Zap, Target, Flame,
  ArrowUp, ArrowDown, Minus, Clock, Lock,
  ChevronRight, CheckCircle, PlusCircle, Settings2, Play,
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

// ─── Insight Type Configs ────────────────────────────────────────────────────
const INSIGHT_TYPE_CONFIG = {
  suggestion:  { color: '#6C63FF', icon: Lightbulb,    bg: 'rgba(108,99,255,0.1)', label: 'اقتراح' },
  achievement: { color: '#10B981', icon: Star,          bg: 'rgba(16,185,129,0.1)', label: 'إنجاز' },
  warning:     { color: '#F59E0B', icon: AlertTriangle, bg: 'rgba(245,158,11,0.1)', label: 'تنبيه' },
  celebration: { color: '#EC4899', icon: Sparkles,      bg: 'rgba(236,72,153,0.1)', label: 'احتفال' },
  analysis:    { color: '#3B82F6', icon: Brain,         bg: 'rgba(59,130,246,0.1)', label: 'تحليل' },
};

const TOOLTIP_STYLE = {
  background: '#1a1a2e', border: '1px solid #6C63FF',
  borderRadius: 8, direction: 'rtl', fontFamily: 'Cairo',
};

// ═════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═════════════════════════════════════════════════════════════════════════════

export default function AnalyticsView({ userPlan, onViewChange }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [expandedAudit, setExpandedAudit] = useState(null);
  const isPremium = ['premium', 'enterprise', 'trial'].includes(userPlan);
  const queryClient = useQueryClient();

  // ─── Data Queries ─────────────────────────────────────────────────────────
  const insightsQuery = useQuery({
    queryKey: ['insights'],
    queryFn: () => api.get('/insights'),
    retry: 1, staleTime: 5 * 60 * 1000,
  });

  const dailySummaryQuery = useQuery({
    queryKey: ['insights-daily'],
    queryFn: () => api.get('/insights/daily'),
    retry: 1, staleTime: 10 * 60 * 1000,
  });

  const perfDashQuery = useQuery({
    queryKey: ['performance-dashboard'],
    queryFn: () => api.get('/performance/dashboard'),
    refetchInterval: 5 * 60 * 1000, retry: 1,
  });

  const perfHistoryQuery = useQuery({
    queryKey: ['performance-history'],
    queryFn: () => api.get('/performance/history?days=30'),
    retry: 1,
  });

  const auditQuery = useQuery({
    queryKey: ['audit-history'],
    queryFn: () => api.get('/performance/weekly-audit/history'),
    retry: 1,
  });

  const generateTipsMutation = useMutation({
    mutationFn: () => api.get('/insights/productivity-tips'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      toast.success('تم توليد رؤى جديدة!');
    },
    onError: () => toast.error('فشل في توليد الرؤى'),
  });

  // On-demand audit generation
  const generateAuditMutation = useMutation({
    mutationFn: () => api.post('/performance/weekly-audit/generate'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['audit-history'] });
      toast.success('تم إنشاء التدقيق الأسبوعي!');
    },
    onError: () => toast.error('فشل في إنشاء التدقيق'),
  });

  // ─── Extract data (Phase I: defensive array guards) ─────────────────────────
  const rawInsights = insightsQuery.data?.data?.data?.insights || insightsQuery.data?.data?.data || [];
  const insights    = Array.isArray(rawInsights) ? rawInsights : [];
  const perfDash    = perfDashQuery.data?.data?.data || perfDashQuery.data?.data || {};
  const rawHistory30 = perfHistoryQuery.data?.data?.data?.history || perfHistoryQuery.data?.data?.data || [];
  const history30   = Array.isArray(rawHistory30) ? rawHistory30 : [];
  const rawAudits   = auditQuery.data?.data?.data?.audits || auditQuery.data?.data?.data || [];
  const audits      = Array.isArray(rawAudits) ? rawAudits : [];
  const dailySum    = dailySummaryQuery.data?.data?.data;

  const rawHistory7    = perfDash?.history_7d || [];
  const history7       = Array.isArray(rawHistory7) ? rawHistory7 : [];
  const todayScore     = perfDash?.today_score;
  const coaching       = perfDash?.coaching;
  const rawFlags       = perfDash?.active_flags || [];
  const activeFlags    = Array.isArray(rawFlags) ? rawFlags : [];
  const energyProfile  = perfDash?.energy_profile;
  const weeklyAudit    = perfDash?.weekly_audit;

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
          <button onClick={() => generateTipsMutation.mutate()}
            disabled={generateTipsMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 transition-colors text-xs sm:text-sm">
            <Zap size={14} className={generateTipsMutation.isPending ? 'animate-pulse' : ''} />
            <span className="hidden sm:inline">{generateTipsMutation.isPending ? 'جارٍ...' : 'توليد رؤى'}</span>
          </button>
          <button onClick={handleRefresh}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors">
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs sm:text-sm whitespace-nowrap transition-all ${
              activeTab === id
                ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30 font-semibold'
                : 'text-gray-400 hover:text-white hover:bg-white/5'
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <AnimatePresence mode="wait">
        <motion.div key={activeTab}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
          {activeTab === 'overview' && (
            <OverviewTab todayScore={todayScore} coaching={coaching} dailySummary={dailySum}
              insights={insights} history7={history7} isPremium={isPremium}
              onUpgrade={() => setShowUpgrade(true)} onViewChange={onViewChange} />
          )}
          {activeTab === 'insights' && (
            <InsightsTab insights={insights} radarData={radarData} history30={history30}
              isPremium={isPremium} onUpgrade={() => setShowUpgrade(true)}
              onGenerate={() => generateTipsMutation.mutate()}
              isGenerating={generateTipsMutation.isPending}
              isLoading={insightsQuery.isLoading} onViewChange={onViewChange} />
          )}
          {activeTab === 'performance' && (
            <PerformanceTab todayScore={todayScore} history7={history7}
              activeFlags={activeFlags} energyProfile={energyProfile}
              isPremium={isPremium} onUpgrade={() => setShowUpgrade(true)}
              isLoading={perfDashQuery.isLoading} />
          )}
          {activeTab === 'audit' && (
            <AuditTab audits={audits} expandedAudit={expandedAudit}
              setExpandedAudit={setExpandedAudit} isPremium={isPremium}
              onUpgrade={() => setShowUpgrade(true)} isLoading={auditQuery.isLoading}
              onGenerateAudit={() => generateAuditMutation.mutate()}
              isGeneratingAudit={generateAuditMutation.isPending}
              onViewChange={onViewChange} />
          )}
        </motion.div>
      </AnimatePresence>

      <UpgradeModal isOpen={showUpgrade} onClose={() => setShowUpgrade(false)}
        feature="advanced_insights" onTrialStart={() => window.location.reload()} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// OVERVIEW TAB — metrics + charts (pure data, no AI interpretations here)
// ═════════════════════════════════════════════════════════════════════════════

function OverviewTab({ todayScore, coaching, dailySummary, insights, history7, isPremium, onUpgrade, onViewChange }) {
  return (
    <div className="space-y-5">
      {dailySummary && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-4 sm:p-5"
          style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(16,185,129,0.1))', border: '1px solid rgba(108,99,255,0.3)' }}>
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={16} className="text-primary-400" />
            <h3 className="font-bold text-white text-sm">{dailySummary?.title || 'ملخص اليوم'}</h3>
          </div>
          {dailySummary?.data && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'المهام', value: `${dailySummary.data?.tasks?.completed || 0}/${dailySummary.data?.tasks?.total || 0}`, color: '#6C63FF' },
                { label: 'العادات', value: `${dailySummary.data?.habits?.completed || 0}/${dailySummary.data?.habits?.total || 0}`, color: '#10B981' },
                { label: 'المزاج', value: dailySummary.data?.mood ? `${dailySummary.data.mood}/10` : '-', color: '#F59E0B' },
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

      {isPremium && todayScore && <TodayScoreCard score={todayScore} compact />}
      {isPremium && coaching && <CoachingCard coaching={coaching} onViewChange={onViewChange} />}
      {isPremium && history7.length > 0 && <TrendChart history={history7} />}

      {/* Top Insights (preview — 2 cards, link to Insights tab) */}
      {insights.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-white flex items-center gap-2">
              <Lightbulb size={16} className="text-yellow-400" /> أبرز الرؤى
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {insights.slice(0, 2).map((insight, i) => (
              <InsightCard key={insight.id || i} insight={insight} index={i} onViewChange={onViewChange} />
            ))}
          </div>
        </section>
      )}

      {!isPremium && <PremiumBanner onUpgrade={onUpgrade} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// INSIGHTS TAB — AI interpretations + recommendations + action buttons
// ═════════════════════════════════════════════════════════════════════════════

function InsightsTab({ insights, radarData, history30, isPremium, onUpgrade, onGenerate, isGenerating, isLoading, onViewChange }) {
  const [showAll, setShowAll] = useState(false);
  const displayedInsights = showAll ? insights : insights.slice(0, 6);

  return (
    <div className="space-y-5">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-white flex items-center gap-2">
            <Lightbulb size={16} className="text-yellow-400" /> رؤى اليوم
          </h2>
          <span className="text-xs text-gray-500">{insights.length} رؤية</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isLoading ? (
            [...Array(4)].map((_, i) => <div key={i} className="h-28 rounded-xl bg-white/5 animate-pulse" />)
          ) : displayedInsights.length > 0 ? (
            displayedInsights.map((insight, i) => (
              <InsightCard key={insight.id || i} insight={insight} index={i} onViewChange={onViewChange} expandable />
            ))
          ) : (
            <EmptyInsights onGenerate={onGenerate} isLoading={isGenerating} />
          )}
        </div>
        {/* "Show More" button */}
        {insights.length > 6 && (
          <button onClick={() => setShowAll(!showAll)}
            className="mt-3 flex items-center gap-1.5 mx-auto text-xs text-primary-400 hover:text-primary-300 transition-colors">
            {showAll ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showAll ? 'عرض أقل' : `عرض المزيد (${insights.length - 6})`}
          </button>
        )}
      </section>

      {isPremium && history30.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <TrendingUp size={16} className="text-green-400" /> منحنى الأداء (30 يوم)
          </h2>
          <ChartCard>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={history30.map(h => ({
                date: h.score_date?.slice(5), overall: h.overall_score,
                productivity: h.productivity_score, focus: h.focus_score,
              }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 10 }} interval={4} />
                <YAxis domain={[0, 100]} stroke="#6b7280" tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="monotone" dataKey="overall" stroke="#6C63FF" strokeWidth={2} dot={false} name="الإجمالي" />
                <Line type="monotone" dataKey="productivity" stroke="#10B981" strokeWidth={1.5} dot={false} name="الإنتاجية" />
                <Line type="monotone" dataKey="focus" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="التركيز" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </section>
      )}

      {isPremium && radarData.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-white mb-3 flex items-center gap-2">
            <BarChart2 size={16} className="text-blue-400" /> مقارنة الأبعاد
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
  if (isLoading) return <Skeleton count={3} />;

  const hasData = todayScore || history7.length > 0 || activeFlags.length > 0 || energyProfile?.has_data;

  return (
    <div className="space-y-5">
      {!hasData && (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-gray-400 text-sm mb-2">لا توجد بيانات أداء كافية بعد</p>
          <p className="text-gray-500 text-xs mb-4">أكمل مهام وعادات وسجّل مزاجك لتوليد تحليل الأداء</p>
          <div className="flex flex-wrap justify-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-lg bg-primary-500/10 text-primary-300">✅ أكمل 3 مهام</span>
            <span className="px-3 py-1.5 rounded-lg bg-green-500/10 text-green-300">🎯 سجّل عادة واحدة</span>
            <span className="px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-300">💙 سجّل مزاجك</span>
          </div>
        </div>
      )}
      {todayScore && <TodayScoreCard score={todayScore} />}
      {history7.length > 0 && <TrendChart history={history7} />}
      {activeFlags.length > 0 && <BehavioralFlagsCard flags={activeFlags} />}
      {energyProfile?.has_data && <EnergyProfileCard energy={energyProfile} />}
      {!isPremium && hasData && <PremiumBanner onUpgrade={onUpgrade} />}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// AUDIT TAB — with on-demand generation button
// ═════════════════════════════════════════════════════════════════════════════

function AuditTab({ audits, expandedAudit, setExpandedAudit, isPremium, onUpgrade, isLoading, onGenerateAudit, isGeneratingAudit, onViewChange }) {
  const [reportType, setReportType] = useState('weekly');
  if (isLoading) return <Skeleton count={2} />;

  return (
    <div className="space-y-4">
      {/* Report type selector */}
      <div className="flex gap-2 p-1 bg-white/5 rounded-xl border border-white/5">
        {[
          { key: 'weekly', label: 'تقرير أسبوعي', icon: '📅' },
          { key: 'monthly', label: 'تقرير شهري', icon: '🗓️' },
        ].map(tab => (
          <button key={tab.key} onClick={() => setReportType(tab.key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold transition-all active:scale-95 ${
              reportType === tab.key
                ? 'bg-primary-500/20 text-primary-400 shadow-sm'
                : 'text-gray-400 hover:text-white'
            }`}>
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Header + generation button */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Calendar size={14} className="text-blue-400" />
          {reportType === 'weekly' ? 'التدقيقات الأسبوعية' : 'التدقيقات الشهرية'} ({audits.length})
        </h2>
        <button onClick={onGenerateAudit} disabled={isGeneratingAudit}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 transition-colors text-xs disabled:opacity-50">
          {isGeneratingAudit ? <RefreshCw size={12} className="animate-spin" /> : <Play size={12} />}
          {isGeneratingAudit ? 'جارٍ الإنشاء...' : `إنشاء تقرير ${reportType === 'weekly' ? 'أسبوعي' : 'شهري'}`}
        </button>
      </div>

      {audits.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-400 text-sm mb-2">لا توجد تقارير بعد</p>
          <p className="text-gray-500 text-xs mb-4">أنشئ أول تقرير لمتابعة تقدمك</p>
          <button onClick={onGenerateAudit} disabled={isGeneratingAudit}
            className="px-4 py-2.5 rounded-xl bg-primary-500 text-white hover:bg-primary-600 text-xs inline-flex items-center gap-1.5 shadow-lg shadow-primary-500/20">
            <Play size={12} /> إنشاء تقرير {reportType === 'weekly' ? 'أسبوعي' : 'شهري'}
          </button>
        </div>
      ) : (
        audits.map((audit, i) => (
          <AuditAccordion key={audit.id || i} audit={audit}
            isExpanded={expandedAudit === (audit.id || i)}
            onToggle={() => setExpandedAudit(expandedAudit === (audit.id || i) ? null : (audit.id || i))}
            index={i} onViewChange={onViewChange} />
        ))
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// SHARED SUB-COMPONENTS
// ═════════════════════════════════════════════════════════════════════════════

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
    { key: 'focus_score',        label: 'التركيز',   color: '#10B981', icon: Brain },
    { key: 'consistency_score',  label: 'الاتساق',   color: '#F59E0B', icon: Flame },
  ];
  const delta = score.score_delta || 0;
  const DeltaIcon = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus;
  const deltaColor = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-gray-400';

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 sm:p-5"
      style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(16,185,129,0.1))', border: '1px solid rgba(108,99,255,0.3)' }}>
      <div className="flex items-center gap-2 mb-3">
        <Star size={16} className="text-yellow-400" />
        <h3 className="text-white font-semibold text-sm">أداء اليوم</h3>
        <span className="text-xs text-gray-500 ms-auto">{score.score_date}</span>
      </div>
      <div className="grid grid-cols-4 gap-3 items-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="60%" outerRadius="100%"
                data={[{ value: score.overall_score, fill: '#6C63FF' }]}
                startAngle={90} endAngle={-270}>
                <RadialBar dataKey="value" background={{ fill: 'rgba(255,255,255,0.05)' }} />
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xl font-bold text-white">{score.overall_score}</span>
              <span className="text-[10px] text-gray-400">/100</span>
            </div>
          </div>
          <p className={`text-xs font-medium flex items-center justify-center gap-0.5 mt-1 ${deltaColor}`}>
            <DeltaIcon size={10} /> {Math.abs(delta).toFixed(0)}
          </p>
        </div>
        <div className="col-span-3 grid grid-cols-3 gap-2">
          {subScores.map(({ key, label, color, icon: Icon }) => (
            <div key={key} className="rounded-xl p-2.5 text-center"
              style={{ background: `${color}15`, border: `1px solid ${color}30` }}>
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

// ─── Coaching Card (with action buttons) ─────────────────────────────────────
function CoachingCard({ coaching, onViewChange }) {
  const typeColors = {
    morning: 'from-yellow-500/20 to-orange-500/10',
    checkin: 'from-blue-500/20 to-purple-500/10',
    evening: 'from-purple-500/20 to-blue-500/10',
    motivational: 'from-green-500/20 to-teal-500/10',
    nudge: 'from-red-500/20 to-orange-500/10',
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-4 bg-gradient-to-r ${typeColors[coaching.type] || typeColors.motivational}`}
      style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
      <div className="flex items-start gap-3">
        <div className="text-2xl">💡</div>
        <div className="flex-1">
          <p className="text-white text-sm leading-relaxed">{coaching.message}</p>
          {coaching.actions?.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {coaching.actions.map((action, i) => (
                <button key={i}
                  onClick={() => {
                    if (action.route) onViewChange?.(action.route);
                    else if (action.type === 'task') onViewChange?.('tasks');
                    else if (action.type === 'habit') onViewChange?.('habits');
                  }}
                  className="px-3 py-1 rounded-lg text-xs font-medium bg-white/10 text-white hover:bg-white/20 transition-colors flex items-center gap-1">
                  <Play size={10} /> {action.label}
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
    date: h.score_date?.slice(5), productivity: h.productivity_score,
    focus: h.focus_score, consistency: h.consistency_score, overall: h.overall_score,
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
          <Line type="monotone" dataKey="overall" stroke="#6C63FF" strokeWidth={2} dot={{ r: 2 }} name="الإجمالي" />
          <Line type="monotone" dataKey="productivity" stroke="#10B981" strokeWidth={1.5} dot={false} name="الإنتاجية" />
          <Line type="monotone" dataKey="focus" stroke="#F59E0B" strokeWidth={1.5} dot={false} name="التركيز" />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

// ─── Insight Card (structured: title + summary + actions) ────────────────────
function InsightCard({ insight, index, onViewChange, expandable = false }) {
  const [expanded, setExpanded] = useState(false);
  const cfg  = INSIGHT_TYPE_CONFIG[insight.type] || INSIGHT_TYPE_CONFIG.suggestion;
  const Icon = cfg.icon;
  const content = insight.content || insight.description || insight.summary || '';
  const isLong = content.length > 120;

  // Determine action buttons based on insight type/content
  const getActions = () => {
    const actions = [];
    if (insight.type === 'suggestion' || insight.type === 'analysis') {
      actions.push({ label: 'طبّق الآن', icon: Play, route: insight.related_type === 'habit' ? 'habits' : 'tasks' });
    }
    if (insight.type === 'warning') {
      actions.push({ label: 'عدّل العادة', icon: Settings2, route: 'habits' });
    }
    if (content.toLowerCase().includes('task') || content.includes('مهم')) {
      actions.push({ label: 'أنشئ مهمة', icon: PlusCircle, route: 'tasks' });
    }
    return actions.slice(0, 2); // Max 2 action buttons
  };

  const actions = getActions();

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      className="rounded-xl p-3.5"
      style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}>
      <div className="flex items-start gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${cfg.color}20` }}>
          <Icon size={16} style={{ color: cfg.color }} />
        </div>
        <div className="flex-1 min-w-0">
          {/* Type Badge */}
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] px-1.5 py-0.5 rounded-md font-medium" style={{ background: `${cfg.color}20`, color: cfg.color }}>
              {cfg.label}
            </span>
          </div>
          {/* Title */}
          <h3 className="text-white font-semibold text-xs mb-1">{insight.title}</h3>
          {/* Content — truncated with expand */}
          <p className={`text-gray-400 text-xs leading-relaxed ${!expanded && isLong && expandable ? 'line-clamp-2' : ''}`}>
            {content}
          </p>
          {isLong && expandable && (
            <button onClick={() => setExpanded(!expanded)}
              className="text-[10px] text-primary-400 hover:text-primary-300 mt-1 flex items-center gap-0.5">
              {expanded ? <><ChevronUp size={10} /> عرض أقل</> : <><ChevronDown size={10} /> عرض المزيد</>}
            </button>
          )}

          {/* Action Buttons */}
          {actions.length > 0 && (
            <div className="flex gap-1.5 mt-2 pt-2 border-t border-white/5">
              {actions.map((a, i) => (
                <button key={i} onClick={() => onViewChange?.(a.route)}
                  className="text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white transition-all flex items-center gap-1 active:scale-95">
                  <a.icon size={10} /> {a.label}
                </button>
              ))}
            </div>
          )}
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
        <AlertTriangle size={16} className="text-red-400" /> تنبيهات سلوكية ({flags.length})
      </h3>
      <div className="space-y-2.5">
        {flags.slice(0, 4).map(flag => (
          <div key={flag.id} className="rounded-xl p-3 flex items-start gap-2.5"
            style={{ background: `${severityColors[flag.severity] || '#6b7280'}15` }}>
            <span className="text-lg">{typeEmojis[flag.flag_type] || '🚩'}</span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs">{flag.description}</p>
              {flag.ai_recommendation && (
                <p className="text-gray-400 text-[11px] mt-1">💡 {flag.ai_recommendation.slice(0, 100)}...</p>
              )}
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium flex-shrink-0"
              style={{ background: `${severityColors[flag.severity]}22`, color: severityColors[flag.severity] }}>
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
        <Zap size={16} className="text-green-400" /> خريطة الطاقة الشخصية
      </h3>
      <div className="flex gap-0.5 h-14 items-end mb-3">
        {energy.hourly_heatmap?.filter((_, i) => i >= 6 && i <= 22).map(h => (
          <div key={h.hour} className="flex-1 rounded-t transition-all"
            style={{
              height: `${(h.percentage / maxPct) * 100}%`, minHeight: 2,
              background: energy.peak_hours?.includes(h.hour) ? '#10B981' : `rgba(16,185,129,${0.2 + (h.percentage / maxPct) * 0.5})`,
            }}
            title={`${h.label}: ${h.percentage}%`} />
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

// ─── Audit Accordion (with action buttons on strategies) ─────────────────────
function AuditAccordion({ audit, isExpanded, onToggle, index, onViewChange }) {
  const moodColor = audit.mood_trend === 'improving' ? '#10B981' : audit.mood_trend === 'declining' ? '#EF4444' : '#6b7280';

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.08 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}>
      <button onClick={onToggle} className="w-full p-4 flex items-center gap-3 hover:bg-white/5 transition-colors">
        <div className="flex-1 text-right">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-sm">أسبوع {audit.week_number} — {audit.week_start}</span>
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
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25 }} className="overflow-hidden">
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
                        <div className="flex-1">
                          <p className="text-white text-xs font-semibold">{s.title}</p>
                          <p className="text-gray-400 text-[11px]">{s.action}</p>
                          {/* Action button per strategy */}
                          <button onClick={() => onViewChange?.(s.type === 'habit' ? 'habits' : 'tasks')}
                            className="mt-1.5 text-[10px] px-2 py-0.5 rounded-lg bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-all flex items-center gap-1 active:scale-95">
                            <Play size={9} /> طبّق الآن
                          </button>
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
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-6 text-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(16,185,129,0.1))', border: '1px solid rgba(108,99,255,0.3)' }}>
      <Crown size={28} className="text-yellow-400 mx-auto mb-3" />
      <h2 className="text-lg font-bold text-white mb-2">تحليلات متقدمة</h2>
      <p className="text-gray-400 text-sm max-w-md mx-auto mb-4">
        احصل على منحنى الأداء، مخطط الأبعاد، التدقيقات الأسبوعية، وخريطة الطاقة.
      </p>
      <motion.button whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }} onClick={onUpgrade}
        className="px-6 py-3 rounded-xl font-bold text-white inline-flex items-center gap-2 text-sm"
        style={{ background: 'linear-gradient(135deg, #6C63FF, #10B981)' }}>
        <Sparkles size={16} /> جرّب مجاناً 7 أيام
      </motion.button>
    </motion.div>
  );
}

function LockedSection({ onUpgrade, title, desc }) {
  return (
    <div className="text-center py-12">
      <Lock size={32} className="text-gray-600 mx-auto mb-3" />
      <h3 className="text-white font-semibold text-lg mb-2">{title}</h3>
      <p className="text-gray-400 text-sm mb-4 max-w-md mx-auto">{desc}</p>
      <motion.button whileTap={{ scale: 0.95 }} onClick={onUpgrade}
        className="px-6 py-3 rounded-xl font-bold text-white inline-flex items-center gap-2 text-sm"
        style={{ background: 'linear-gradient(135deg, #6C63FF, #10B981)' }}>
        <Crown size={16} /> فعّل التجربة المجانية
      </motion.button>
    </div>
  );
}

function EmptyInsights({ onGenerate, isLoading }) {
  return (
    <div className="col-span-2 text-center py-8">
      <div className="text-4xl mb-3">🌱</div>
      <h3 className="text-white font-semibold text-sm mb-1">لا توجد رؤى بعد</h3>
      <p className="text-gray-400 text-xs mb-3">أضف مهام وعادات لتوليد رؤى مخصصة</p>
      <button onClick={onGenerate} disabled={isLoading}
        className="px-3 py-2 rounded-xl bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 text-xs flex items-center gap-1.5 mx-auto">
        <Zap size={14} /> {isLoading ? 'جارٍ...' : 'توليد رؤى'}
      </button>
    </div>
  );
}

function Skeleton({ count = 3 }) {
  return (
    <div className="space-y-4 animate-pulse">
      {[...Array(count)].map((_, i) => <div key={i} className="h-32 rounded-2xl bg-white/5" />)}
    </div>
  );
}
