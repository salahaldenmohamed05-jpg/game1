/**
 * LogsView — عارض السجلات المدمج في التطبيق
 * =============================================
 * يعرض: أخطاء العميل، سجلات الـ API، إحصائيات الصحة
 * مفيد للتشخيص أثناء الاستخدام دون الحاجة لخادم خارجي
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bug, Activity, Server, RefreshCw, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle, Clock, X, Cpu, MemoryStick
} from 'lucide-react';
import { logsAPI } from '../../utils/api';

const TABS = [
  { id: 'health',   label: 'الصحة',          icon: Activity },
  { id: 'client',   label: 'أخطاء العميل',   icon: Bug },
  { id: 'server',   label: 'سجلات الخادم',   icon: Server },
];

// ── Level badge ───────────────────────────────────────────────────────────────
function LevelBadge({ text }) {
  const t = text?.toLowerCase() || '';
  if (t.includes('error') || t.includes('خطأ') || t.includes('[error]'))
    return <span className="px-1.5 py-0.5 rounded text-xs bg-red-500/20 text-red-400">ERROR</span>;
  if (t.includes('warn'))
    return <span className="px-1.5 py-0.5 rounded text-xs bg-yellow-500/20 text-yellow-400">WARN</span>;
  if (t.includes('debug'))
    return <span className="px-1.5 py-0.5 rounded text-xs bg-gray-500/20 text-gray-400">DEBUG</span>;
  return <span className="px-1.5 py-0.5 rounded text-xs bg-green-500/20 text-green-400">INFO</span>;
}

// ── Log line ──────────────────────────────────────────────────────────────────
function LogLine({ item }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border-b border-white/5 py-1.5 hover:bg-white/5 rounded px-2 cursor-pointer" onClick={() => setExpanded(e => !e)}>
      <div className="flex items-start gap-2 flex-wrap">
        <LevelBadge text={item.line || item.message} />
        <span className="text-xs text-gray-300 flex-1 font-mono break-all">
          {(item.line || item.message || '')?.slice(0, 200)}
        </span>
        {expanded ? <ChevronUp size={12} className="text-gray-500 flex-shrink-0 mt-0.5" /> : <ChevronDown size={12} className="text-gray-500 flex-shrink-0 mt-0.5" />}
      </div>
      {expanded && (
        <motion.pre initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-xs text-gray-400 font-mono whitespace-pre-wrap break-all bg-black/30 rounded p-2" dir="ltr">
          {JSON.stringify(item, null, 2)}
        </motion.pre>
      )}
    </div>
  );
}

// ── Client Error card ─────────────────────────────────────────────────────────
function ClientErrorCard({ err }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-3 mb-2" dir="rtl">
      <div className="flex items-start justify-between gap-2 cursor-pointer" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start gap-2 flex-1">
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-red-300 font-medium">{err.message?.slice(0, 100)}</p>
            <p className="text-xs text-gray-500 mt-0.5">{err.timestamp ? new Date(err.timestamp).toLocaleString('ar') : ''}</p>
            {err.url && <p className="text-xs text-gray-600 mt-0.5 font-mono">{err.url}</p>}
          </div>
        </div>
        {expanded ? <ChevronUp size={14} className="text-gray-500 flex-shrink-0" /> : <ChevronDown size={14} className="text-gray-500 flex-shrink-0" />}
      </div>
      {expanded && (
        <motion.pre initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-xs text-red-300 font-mono whitespace-pre-wrap break-all bg-black/30 rounded p-2 max-h-40 overflow-auto" dir="ltr">
          {err.stack || err.componentStack || 'No stack trace'}
        </motion.pre>
      )}
    </div>
  );
}

// ── Health card ───────────────────────────────────────────────────────────────
function HealthCard({ health }) {
  if (!health) return null;
  const uptimeMin = Math.floor((health.uptime_seconds || 0) / 60);
  const uptimeH = Math.floor(uptimeMin / 60);
  const uptimeLabel = uptimeH > 0 ? `${uptimeH}h ${uptimeMin % 60}m` : `${uptimeMin}m`;

  return (
    <div className="grid grid-cols-2 gap-3" dir="rtl">
      {[
        { label: 'Uptime', value: uptimeLabel, icon: <Clock size={16} className="text-green-400" />, color: 'text-green-400' },
        { label: 'Memory', value: `${health.memory_mb || 0} MB`, icon: <Cpu size={16} className="text-blue-400" />, color: 'text-blue-400' },
        { label: 'أخطاء العميل', value: health.client_errors || 0, icon: <Bug size={16} className="text-red-400" />, color: 'text-red-400' },
        { label: 'Node.js', value: health.node_version || 'N/A', icon: <Server size={16} className="text-yellow-400" />, color: 'text-yellow-400' },
      ].map((item) => (
        <div key={item.label} className="bg-white/5 rounded-xl p-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0">
            {item.icon}
          </div>
          <div>
            <p className={`text-base font-bold ${item.color}`}>{item.value}</p>
            <p className="text-xs text-gray-500">{item.label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function LogsView() {
  const [tab, setTab] = useState('health');
  const [logFilter, setLogFilter] = useState('');

  const { data: healthData, refetch: refetchHealth, isLoading: loadingHealth } = useQuery({
    queryKey: ['logs-health'],
    queryFn: logsAPI.getLogsHealth,
    refetchInterval: 30000,
  });

  const { data: clientData, refetch: refetchClient, isLoading: loadingClient } = useQuery({
    queryKey: ['logs-client'],
    queryFn: logsAPI.getClientErrors,
    enabled: tab === 'client',
  });

  const { data: serverData, refetch: refetchServer, isLoading: loadingServer } = useQuery({
    queryKey: ['logs-server'],
    queryFn: () => logsAPI.getRecentLogs(200),
    enabled: tab === 'server',
    staleTime: 5000,
  });

  const health = healthData?.data?.data;
  const clientErrors = clientData?.data?.data?.errors || [];
  const serverLogs = serverData?.data?.data?.logs || [];

  const filteredLogs = serverLogs.filter(l =>
    !logFilter || (l.line || l.message || '').toLowerCase().includes(logFilter.toLowerCase())
  );

  const refetchMap = { health: refetchHealth, client: refetchClient, server: refetchServer };
  const isLoading = { health: loadingHealth, client: loadingClient, server: loadingServer };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2" dir="rtl">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2">
            <Activity size={22} className="text-blue-400" />
            سجلات النظام
          </h1>
          <p className="text-gray-400 text-sm mt-1">راقب أخطاء التطبيق وسجلات الخادم في الوقت الفعلي</p>
        </div>
        <button
          onClick={() => refetchMap[tab]?.()}
          className="flex items-center gap-2 px-3 py-2 bg-white/5 hover:bg-white/10 text-gray-300 rounded-lg text-sm transition-colors"
        >
          <RefreshCw size={14} className={isLoading[tab] ? 'animate-spin' : ''} />
          تحديث
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap" dir="rtl">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors
              ${tab === t.id ? 'bg-blue-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}
          >
            <t.icon size={14} />
            {t.label}
            {t.id === 'client' && clientErrors.length > 0 && (
              <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                {Math.min(clientErrors.length, 9)}
              </span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* ── HEALTH TAB ── */}
        {tab === 'health' && (
          <motion.div key="health" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="glass-card p-6">
              <div className="flex items-center gap-2 mb-4" dir="rtl">
                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                <span className="text-green-400 text-sm font-medium">الخادم يعمل بشكل طبيعي</span>
              </div>
              {loadingHealth ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : (
                <HealthCard health={health} />
              )}
              <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl" dir="rtl">
                <p className="text-xs text-blue-300">
                  💡 في حالة وجود أخطاء، انتقل إلى تبويب "أخطاء العميل" لمشاهدة تفاصيلها. يتم تسجيل كل خطأ تلقائياً عند حدوثه.
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── CLIENT ERRORS TAB ── */}
        {tab === 'client' && (
          <motion.div key="client" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="glass-card p-6">
              <div className="flex items-center justify-between mb-4" dir="rtl">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Bug size={16} className="text-red-400" />
                  أخطاء المتصفح ({clientErrors.length})
                </h3>
                {clientErrors.length === 0 && (
                  <span className="flex items-center gap-1 text-green-400 text-xs">
                    <CheckCircle size={12} /> لا توجد أخطاء
                  </span>
                )}
              </div>
              {loadingClient ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full" />
                </div>
              ) : clientErrors.length === 0 ? (
                <div className="text-center py-10" dir="rtl">
                  <CheckCircle size={32} className="text-green-400 mx-auto mb-3" />
                  <p className="text-gray-300 font-medium">لا توجد أخطاء مسجّلة</p>
                  <p className="text-gray-500 text-sm mt-1">سيظهر هنا أي خطأ يحدث في المتصفح</p>
                </div>
              ) : (
                <div className="space-y-1 max-h-96 overflow-y-auto">
                  {clientErrors.map((err, i) => <ClientErrorCard key={i} err={err} />)}
                </div>
              )}
            </div>
          </motion.div>
        )}

        {/* ── SERVER LOGS TAB ── */}
        {tab === 'server' && (
          <motion.div key="server" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="glass-card p-6">
              <div className="flex items-center gap-3 mb-4 flex-wrap" dir="rtl">
                <h3 className="font-semibold text-white flex items-center gap-2 flex-1">
                  <Server size={16} className="text-blue-400" />
                  سجلات الخادم ({filteredLogs.length})
                </h3>
                <input
                  value={logFilter}
                  onChange={e => setLogFilter(e.target.value)}
                  placeholder="ابحث في السجلات..."
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-gray-300 placeholder-gray-600 outline-none focus:border-blue-500/50 w-48"
                  dir="rtl"
                />
              </div>
              {loadingServer ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full" />
                </div>
              ) : filteredLogs.length === 0 ? (
                <div className="text-center py-10" dir="rtl">
                  <Server size={32} className="text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400">لا توجد سجلات متاحة</p>
                </div>
              ) : (
                <div className="font-mono text-xs max-h-[500px] overflow-y-auto space-y-0.5 bg-black/20 rounded-xl p-3" dir="ltr">
                  {filteredLogs.map((item, i) => <LogLine key={i} item={item} />)}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
