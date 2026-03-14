/**
 * InsightsView — AI Insights & Reports (Premium Layer)
 * ======================================================
 * Shows AI-generated insights, weekly reports, and behavioral analysis.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Brain, TrendingUp, Calendar, ChevronDown, ChevronUp,
  Lightbulb, Star, AlertTriangle, Check, Sparkles, Crown,
  BookOpen, BarChart2, Download, RefreshCw, Zap
import { useQuery } from '@tanstack/react-query';
import {
  Brain, TrendingUp, Calendar, ChevronDown, ChevronUp,
  Lightbulb, Star, AlertTriangle, Check, Sparkles, Crown,
  BookOpen, BarChart2, Download, RefreshCw
} from 'lucide-react';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, BarChart, Bar, Cell
} from 'recharts';
import api from '../../utils/api';
import UpgradeModal from '../subscription/UpgradeModal';
import toast from 'react-hot-toast';

export default function InsightsView({ userPlan }) {
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [expandedAudit, setExpandedAudit] = useState(null);
  const isPremium = ['premium', 'enterprise', 'trial'].includes(userPlan);
  const queryClient = useQueryClient();

  // Fetch insights (basic - available to all)
  const insightsQuery = useQuery({
    queryKey: ['insights'],
    queryFn: () => api.get('/insights'),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch daily summary
  const dailySummaryQuery = useQuery({
    queryKey: ['insights-daily'],
    queryFn: () => api.get('/insights/daily'),
    retry: 1,
    staleTime: 10 * 60 * 1000,
  });

  // Fetch performance history (premium)
  const performanceQuery = useQuery({
    queryKey: ['performance-history'],
    queryFn: () => api.get('/performance/history?days=30'),
  // Fetch performance history (premium)
  const performanceQuery = useQuery({
    queryKey: ['performance-history'],
    queryFn: () => api.get('/performance/history?days=30'),
    enabled: isPremium,
    retry: 1,
  });

  // Fetch weekly audit history (premium)
  const auditQuery = useQuery({
    queryKey: ['audit-history'],
    queryFn: () => api.get('/performance/weekly-audit/history'),
    enabled: isPremium,
    retry: 1,
  });

  // Fetch weekly audit history (premium)
  const auditQuery = useQuery({
    queryKey: ['audit-history'],
    queryFn: () => api.get('/performance/weekly-audit/history'),
    enabled: isPremium,
    retry: 1,
  });

  // Generate productivity tips mutation
  const generateTipsMutation = useMutation({
    mutationFn: () => api.get('/insights/productivity-tips'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['insights'] });
      toast.success('تم توليد رؤى جديدة! 🧠');
    },
    onError: () => toast.error('فشل في توليد الرؤى'),
  });

  const insights  = insightsQuery.data?.data?.insights || insightsQuery.data?.data || [];
  const history   = performanceQuery.data?.data?.history || performanceQuery.data?.data || [];
  const audits    = auditQuery.data?.data?.audits || auditQuery.data?.data || [];

  // Build radar chart data from latest scores
  const latestScores = history[history.length - 1];
  const radarData = latestScores ? [
    { subject: 'الإنتاجية', A: latestScores.productivity_score, fullMark: 100 },
    { subject: 'التركيز',   A: latestScores.focus_score,        fullMark: 100 },
    { subject: 'الاتساق',  A: latestScores.consistency_score,   fullMark: 100 },
    { subject: 'المهام',    A: latestScores.task_completion_rate, fullMark: 100 },
    { subject: 'العادات',  A: latestScores.habit_completion_rate, fullMark: 100 },
    { subject: 'المزاج',   A: (latestScores.mood_average || 0) * 10, fullMark: 100 },
  ] : [];

  const insights  = insightsQuery.data?.data || [];
  const history   = performanceQuery.data?.data || [];
  const audits    = auditQuery.data?.data || [];

  // Build radar chart data from latest scores
  const latestScores = history[history.length - 1];
  const radarData = latestScores ? [
    { subject: 'الإنتاجية', A: latestScores.productivity_score, fullMark: 100 },
    { subject: 'التركيز',   A: latestScores.focus_score,        fullMark: 100 },
    { subject: 'الاتساق',  A: latestScores.consistency_score,   fullMark: 100 },
    { subject: 'المهام',    A: latestScores.task_completion_rate, fullMark: 100 },
    { subject: 'العادات',  A: latestScores.habit_completion_rate, fullMark: 100 },
    { subject: 'المزاج',   A: (latestScores.mood_average || 0) * 10, fullMark: 100 },
  ] : [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Brain className="text-purple-400" size={26} />
            الرؤى والتقارير
          </h1>
          <p className="text-gray-400 text-sm mt-1">تحليل ذكي لأنماطك وسلوكياتك</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => generateTipsMutation.mutate()}
            disabled={generateTipsMutation.isPending}
            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 transition-colors text-sm"
          >
            <Zap size={16} className={generateTipsMutation.isPending ? 'animate-pulse' : ''} />
            {generateTipsMutation.isPending ? 'جارٍ التوليد...' : 'توليد رؤى'}
          </button>
          {isPremium && (
            <button
              onClick={() => { performanceQuery.refetch(); auditQuery.refetch(); }}
              className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <RefreshCw size={18} className={performanceQuery.isFetching ? 'animate-spin' : ''} />
            </button>
          )}
        </div>
      </div>

      {/* Daily Summary Card */}
      {dailySummaryQuery.data?.data && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5"
          style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.15), rgba(16,185,129,0.1))', border: '1px solid rgba(108,99,255,0.3)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={18} className="text-primary-400" />
            <h3 className="font-bold text-white text-sm">{dailySummaryQuery.data.data.title}</h3>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed">{dailySummaryQuery.data.data.content}</p>
          {dailySummaryQuery.data.data.data && (
            <div className="grid grid-cols-3 gap-3 mt-4">
              {[
                { label: 'المهام', value: `${dailySummaryQuery.data.data.data.tasks?.completed}/${dailySummaryQuery.data.data.data.tasks?.total}`, color: '#6C63FF' },
                { label: 'العادات', value: `${dailySummaryQuery.data.data.data.habits?.completed}/${dailySummaryQuery.data.data.data.habits?.total}`, color: '#10B981' },
                { label: 'المزاج', value: dailySummaryQuery.data.data.data.mood ? `${dailySummaryQuery.data.data.data.mood}/10` : '-', color: '#F59E0B' },
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

      {/* Basic Insights (All Users) */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Lightbulb size={18} className="text-yellow-400" />
          رؤى اليوم
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insightsQuery.isLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-white/5 animate-pulse" />
            ))
          ) : insights.length > 0 ? (
            insights.slice(0, 6).map((insight, i) => (
              <InsightCard key={insight.id || i} insight={insight} index={i} />
            ))
          ) : (
            <EmptyInsights onGenerate={() => generateTipsMutation.mutate()} isLoading={generateTipsMutation.isPending} />
          )}
        </div>
      </section>

      {/* Premium Section */}
      {isPremium ? (
        <>
          {/* 30-Day Performance Chart */}
          {history.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-green-400" />
                منحنى الأداء (30 يوم)
              </h2>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={history.map(h => ({
                    date:         h.score_date?.slice(5),
                    overall:      h.overall_score,
                    productivity: h.productivity_score,
                    focus:        h.focus_score,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 10 }} interval={4} />
                    <YAxis domain={[0, 100]} stroke="#6b7280" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: '#1a1a2e', border: '1px solid #6C63FF', borderRadius: 8, direction: 'rtl', fontFamily: 'Cairo' }}
                    />
                    <Line type="monotone" dataKey="overall"      stroke="#6C63FF" strokeWidth={2} dot={false} name="الإجمالي" />
                    <Line type="monotone" dataKey="productivity" stroke="#10B981" strokeWidth={1.5} dot={false} name="الإنتاجية" />
                    <Line type="monotone" dataKey="focus"        stroke="#F59E0B" strokeWidth={1.5} dot={false} name="التركيز" />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            </section>
          )}

          {/* Radar Chart */}
          {radarData.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart2 size={18} className="text-blue-400" />
                مقارنة الأبعاد
              </h2>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-5 flex justify-center"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.1)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 12, fontFamily: 'Cairo' }} />
                    <Radar
                      name="الأداء" dataKey="A"
                      stroke="#6C63FF" fill="#6C63FF" fillOpacity={0.2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </motion.div>
            </section>
          )}

          {/* Weekly Audit History */}
          {audits.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar size={18} className="text-yellow-400" />
                <Crown size={15} className="text-yellow-400" />
                التدقيقات الأسبوعية
              </h2>
              <div className="space-y-4">
                {audits.map((audit, i) => (
                  <AuditAccordion
                    key={audit.id}
                    audit={audit}
                    isExpanded={expandedAudit === audit.id}
                    onToggle={() => setExpandedAudit(expandedAudit === audit.id ? null : audit.id)}
                    index={i}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        /* Premium Lock Banner */
        <PremiumInsightsBanner onUpgrade={() => setShowUpgrade(true)} />
      )}

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="advanced_insights"
        onTrialStart={() => window.location.reload()}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHT CARD
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  suggestion:   { color: '#6C63FF', icon: Lightbulb, bg: 'rgba(108,99,255,0.1)' },
  achievement:  { color: '#10B981', icon: Star,      bg: 'rgba(16,185,129,0.1)'  },
  warning:      { color: '#F59E0B', icon: AlertTriangle, bg: 'rgba(245,158,11,0.1)' },
  celebration:  { color: '#EC4899', icon: Sparkles,  bg: 'rgba(236,72,153,0.1)'  },
  analysis:     { color: '#3B82F6', icon: Brain,     bg: 'rgba(59,130,246,0.1)'  },
};

        {isPremium && (
          <button
            onClick={() => { performanceQuery.refetch(); auditQuery.refetch(); }}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <RefreshCw size={18} className={performanceQuery.isFetching ? 'animate-spin' : ''} />
          </button>
        )}
      </div>

      {/* Basic Insights (All Users) */}
      <section>
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Lightbulb size={18} className="text-yellow-400" />
          رؤى اليوم
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {insightsQuery.isLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-white/5 animate-pulse" />
            ))
          ) : insights.length > 0 ? (
            insights.slice(0, 6).map((insight, i) => (
              <InsightCard key={insight.id || i} insight={insight} index={i} />
            ))
          ) : (
            <EmptyInsights />
          )}
        </div>
      </section>

      {/* Premium Section */}
      {isPremium ? (
        <>
          {/* 30-Day Performance Chart */}
          {history.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <TrendingUp size={18} className="text-green-400" />
                منحنى الأداء (30 يوم)
              </h2>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-5"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={history.map(h => ({
                    date:         h.score_date?.slice(5),
                    overall:      h.overall_score,
                    productivity: h.productivity_score,
                    focus:        h.focus_score,
                  }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" stroke="#6b7280" tick={{ fontSize: 10 }} interval={4} />
                    <YAxis domain={[0, 100]} stroke="#6b7280" tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: '#1a1a2e', border: '1px solid #6C63FF', borderRadius: 8, direction: 'rtl', fontFamily: 'Cairo' }}
                    />
                    <Line type="monotone" dataKey="overall"      stroke="#6C63FF" strokeWidth={2} dot={false} name="الإجمالي" />
                    <Line type="monotone" dataKey="productivity" stroke="#10B981" strokeWidth={1.5} dot={false} name="الإنتاجية" />
                    <Line type="monotone" dataKey="focus"        stroke="#F59E0B" strokeWidth={1.5} dot={false} name="التركيز" />
                  </LineChart>
                </ResponsiveContainer>
              </motion.div>
            </section>
          )}

          {/* Radar Chart */}
          {radarData.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <BarChart2 size={18} className="text-blue-400" />
                مقارنة الأبعاد
              </h2>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-2xl p-5 flex justify-center"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}
              >
                <ResponsiveContainer width="100%" height={280}>
                  <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.1)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: '#9ca3af', fontSize: 12, fontFamily: 'Cairo' }} />
                    <Radar
                      name="الأداء" dataKey="A"
                      stroke="#6C63FF" fill="#6C63FF" fillOpacity={0.2}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </motion.div>
            </section>
          )}

          {/* Weekly Audit History */}
          {audits.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <Calendar size={18} className="text-yellow-400" />
                <Crown size={15} className="text-yellow-400" />
                التدقيقات الأسبوعية
              </h2>
              <div className="space-y-4">
                {audits.map((audit, i) => (
                  <AuditAccordion
                    key={audit.id}
                    audit={audit}
                    isExpanded={expandedAudit === audit.id}
                    onToggle={() => setExpandedAudit(expandedAudit === audit.id ? null : audit.id)}
                    index={i}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      ) : (
        /* Premium Lock Banner */
        <PremiumInsightsBanner onUpgrade={() => setShowUpgrade(true)} />
      )}

      <UpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="advanced_insights"
        onTrialStart={() => window.location.reload()}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHT CARD
// ─────────────────────────────────────────────────────────────────────────────

const TYPE_CONFIG = {
  suggestion:   { color: '#6C63FF', icon: Lightbulb, bg: 'rgba(108,99,255,0.1)' },
  achievement:  { color: '#10B981', icon: Star,      bg: 'rgba(16,185,129,0.1)'  },
  warning:      { color: '#F59E0B', icon: AlertTriangle, bg: 'rgba(245,158,11,0.1)' },
  celebration:  { color: '#EC4899', icon: Sparkles,  bg: 'rgba(236,72,153,0.1)'  },
  analysis:     { color: '#3B82F6', icon: Brain,     bg: 'rgba(59,130,246,0.1)'  },
};

function InsightCard({ insight, index }) {
  const cfg    = TYPE_CONFIG[insight.type] || TYPE_CONFIG.suggestion;
  const Icon   = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="rounded-xl p-4"
      style={{ background: cfg.bg, border: `1px solid ${cfg.color}30` }}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${cfg.color}20` }}>
          <Icon size={18} style={{ color: cfg.color }} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm mb-1">{insight.title}</h3>
          <p className="text-gray-400 text-xs leading-relaxed line-clamp-3">
            {insight.content || insight.description || insight.summary}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT ACCORDION
// ─────────────────────────────────────────────────────────────────────────────

function AuditAccordion({ audit, isExpanded, onToggle, index }) {
  const moodColor = audit.mood_trend === 'improving' ? '#10B981'
    : audit.mood_trend === 'declining' ? '#EF4444' : '#6b7280';

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)' }}
    >
      {/* Header */}
      <button onClick={onToggle} className="w-full p-5 flex items-center gap-4 hover:bg-white/5 transition-colors">
        <div className="flex-1 text-right">
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-sm">
              أسبوع {audit.week_number} — {audit.week_start}
            </span>
            {!audit.is_read && (
              <span className="w-2 h-2 bg-blue-400 rounded-full" />
            )}
          </div>
          <div className="flex items-center gap-4 mt-2">
            <span className="text-xs text-gray-400">
              المهام: <span className="text-white">{audit.task_completion_rate}%</span>
            </span>
            <span className="text-xs text-gray-400">
              العادات: <span className="text-white">{audit.habit_completion_rate}%</span>
            </span>
            <span className="text-xs text-gray-400">
              المزاج: <span style={{ color: moodColor }}>{audit.mood_trend === 'improving' ? '↑' : audit.mood_trend === 'declining' ? '↓' : '→'}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-center">
            <div className="text-xl font-bold text-white">{audit.avg_productivity_score}</div>
            <div className="text-xs text-gray-500">درجة</div>
          </div>
          {isExpanded ? (
            <ChevronUp size={18} className="text-gray-400" />
          ) : (
            <ChevronDown size={18} className="text-gray-400" />
          )}
        </div>
      </button>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 space-y-4 border-t border-white/10 pt-4">
              {/* Coach Summary */}
              {audit.coach_summary && (
                <div className="p-3 rounded-xl bg-white/5 text-sm text-gray-300 leading-relaxed">
                  {audit.coach_summary}
                </div>
              )}

              {/* Stats Grid */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { label: 'مهام مكتملة', value: `${audit.completed_tasks}/${audit.total_tasks}`, color: '#6C63FF' },
                  { label: 'إتمام العادات', value: `${audit.habit_completion_rate}%`, color: '#10B981' },
                  { label: 'متوسط المزاج', value: `${audit.avg_mood}/10`, color: '#F59E0B' },
                  { label: 'تغيير الأداء', value: `${audit.week_score_vs_last_week > 0 ? '+' : ''}${audit.week_score_vs_last_week}`, color: audit.week_score_vs_last_week >= 0 ? '#10B981' : '#EF4444' },
                ].map(m => (
                  <div key={m.label} className="text-center p-2 rounded-lg bg-white/5">
                    <div className="font-bold" style={{ color: m.color }}>{m.value}</div>
                    <div className="text-gray-500 text-xs">{m.label}</div>
                  </div>
                ))}
              </div>

              {/* Achievements & Challenges */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {audit.top_achievement && (
                  <div className="flex items-start gap-2 p-3 rounded-xl"
                    style={{ background: 'rgba(16,185,129,0.1)' }}>
                    <Star size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-green-400 font-semibold mb-0.5">أبرز إنجاز</p>
                      <p className="text-white text-xs">{audit.top_achievement}</p>
                    </div>
                  </div>
                )}
                {audit.biggest_challenge && (
                  <div className="flex items-start gap-2 p-3 rounded-xl"
                    style={{ background: 'rgba(245,158,11,0.1)' }}>
                    <AlertTriangle size={16} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs text-yellow-400 font-semibold mb-0.5">أكبر تحدٍّ</p>
                      <p className="text-white text-xs">{audit.biggest_challenge}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Improvement Strategies */}
              {audit.improvement_strategies?.length > 0 && (
                <div>
                  <p className="text-gray-400 text-xs mb-2">استراتيجيات التحسين:</p>
                  <div className="space-y-2">
                    {audit.improvement_strategies.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-white/5">
                        <span className="text-base mt-0.5">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</span>
                        <div>
                          <p className="text-white text-xs font-semibold">{s.title}</p>
                          <p className="text-gray-400 text-xs">{s.action}</p>
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

// ─────────────────────────────────────────────────────────────────────────────
// PREMIUM INSIGHTS BANNER
// ─────────────────────────────────────────────────────────────────────────────

function PremiumInsightsBanner({ onUpgrade }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-8 text-center relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.15) 0%, rgba(16,185,129,0.1) 100%)', border: '1px solid rgba(108,99,255,0.3)' }}
    >
      {/* Decorative elements */}
      <div className="absolute top-4 right-4 text-4xl opacity-20">📊</div>
      <div className="absolute bottom-4 left-4 text-4xl opacity-20">🧠</div>

      <Crown size={36} className="text-yellow-400 mx-auto mb-4" />
      <h2 className="text-2xl font-bold text-white mb-2">رؤى متقدمة وتقارير ذكية</h2>
      <p className="text-gray-400 max-w-md mx-auto mb-6">
        احصل على تحليل عميق لأنماطك على مدى 30 يوماً، ومقارنة أداءك الأسبوعي، وتقارير تفصيلية مع استراتيجيات تحسين.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 text-right">
        {[
          { icon: '📈', title: 'منحنى الأداء', desc: '30 يوم من بيانات الإنتاجية والتركيز' },
          { icon: '🕸️', title: 'مخطط الأبعاد', desc: 'تحليل رادار شامل لجوانب حياتك' },
          { icon: '📋', title: 'التدقيق الأسبوعي', desc: 'تقارير أسبوعية مع استراتيجيات تحسين' },
        ].map((f, i) => (
          <div key={i} className="p-4 rounded-xl bg-white/5">
            <div className="text-2xl mb-2">{f.icon}</div>
            <p className="text-white text-sm font-semibold">{f.title}</p>
            <p className="text-gray-400 text-xs">{f.desc}</p>
          </div>
        ))}
      </div>

      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onUpgrade}
        className="px-8 py-4 rounded-xl font-bold text-white inline-flex items-center gap-2"
        style={{ background: 'linear-gradient(135deg, #6C63FF 0%, #10B981 100%)' }}
      >
        <Sparkles size={20} />
        فعّل التجربة المجانية 7 أيام
      </motion.button>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPTY STATE
// ─────────────────────────────────────────────────────────────────────────────

function EmptyInsights({ onGenerate, isLoading }) {
function EmptyInsights() {
  return (
    <div className="col-span-2 text-center py-12">
      <div className="text-5xl mb-4">🌱</div>
      <h3 className="text-white font-semibold mb-2">لا توجد رؤى بعد</h3>
      <p className="text-gray-400 text-sm mb-4">أضف بعض المهام والعادات لتوليد رؤى مخصصة لك</p>
      <button
        onClick={onGenerate}
        disabled={isLoading}
        className="px-4 py-2 rounded-xl bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 transition-colors text-sm flex items-center gap-2 mx-auto"
      >
        <Zap size={16} />
        {isLoading ? 'جارٍ التوليد...' : 'توليد رؤى الآن'}
      </button>
      <p className="text-gray-400 text-sm">أضف بعض المهام والعادات لتوليد رؤى مخصصة لك</p>
    </div>
  );
}
