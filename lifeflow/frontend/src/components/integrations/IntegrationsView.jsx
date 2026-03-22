/**
 * IntegrationsView — Life OS Integration Hub
 * ============================================
 * Phase 14: Connect LifeFlow with external apps
 * Shows real OAuth status, demo connections, and setup guides
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { adaptiveAPI } from '../../utils/api';
import toast from 'react-hot-toast';
import {
  ExternalLink, RefreshCw, CheckCircle2, XCircle, Link2,
  ChevronDown, ChevronUp, Info, Settings, Zap
} from 'lucide-react';

const INTEGRATION_META = {
  google_calendar:  { name: 'Google Calendar',  icon: '📅', category: 'calendar', color: 'blue',   desc: 'مزامنة مواعيدك وأحداثك تلقائياً',         setupUrl: 'https://console.cloud.google.com/', requiresOAuth: true },
  apple_calendar:   { name: 'Apple Calendar',   icon: '🍎', category: 'calendar', color: 'gray',   desc: 'استيراد أحداث Apple Calendar',              setupUrl: 'https://developer.apple.com/',        requiresOAuth: false },
  outlook_calendar: { name: 'Outlook Calendar', icon: '📧', category: 'calendar', color: 'blue',   desc: 'ربط Microsoft Outlook مع جدولك اليومي',     setupUrl: 'https://portal.azure.com/',           requiresOAuth: true },
  apple_health:     { name: 'Apple Health',     icon: '❤️', category: 'health',   color: 'red',    desc: 'بيانات النوم والخطوات ومعدل ضربات القلب',   setupUrl: 'https://developer.apple.com/health-fitness/', requiresOAuth: false },
  google_fit:       { name: 'Google Fit',        icon: '🏃', category: 'health',   color: 'green',  desc: 'مزامنة نشاطك البدني اليومي',               setupUrl: 'https://developers.google.com/fit',   requiresOAuth: true },
  samsung_health:   { name: 'Samsung Health',   icon: '💚', category: 'health',   color: 'green',  desc: 'بيانات الصحة والنشاط من Samsung',           setupUrl: null, requiresOAuth: false },
  notion:           { name: 'Notion',            icon: '📓', category: 'tasks',    color: 'gray',   desc: 'استيراد وتصدير المهام والمشاريع',           setupUrl: 'https://www.notion.so/my-integrations', requiresOAuth: true },
  todoist:          { name: 'Todoist',           icon: '✅', category: 'tasks',    color: 'red',    desc: 'مزامنة قائمة مهامك مع Todoist',            setupUrl: 'https://app.todoist.com/app/settings/integrations', requiresOAuth: true },
  trello:           { name: 'Trello',            icon: '📋', category: 'tasks',    color: 'blue',   desc: 'استيراد بطاقات Trello كمهام',               setupUrl: 'https://trello.com/app-key',          requiresOAuth: true },
};

const CATEGORIES = [
  { id: 'calendar', label: 'التقويم والمواعيد', icon: '📅', desc: 'ربط تطبيقات التقويم لتحليل وقتك' },
  { id: 'health',   label: 'الصحة واللياقة',    icon: '❤️', desc: 'بيانات صحتك لتحسين الطاقة والأداء' },
  { id: 'tasks',    label: 'إدارة المهام',       icon: '✅', desc: 'استيراد مهامك من تطبيقات أخرى' },
];

export default function IntegrationsView() {
  const queryClient = useQueryClient();
  const [expandedSetup, setExpandedSetup] = useState(null);

  const { data: statusData, isLoading: statusLoading } = useQuery({
    queryKey: ['integrations-status'],
    queryFn: () => adaptiveAPI.getIntegrationStatus(),
    staleTime: 2 * 60 * 1000,
  });

  const { data: ctxData, isLoading: ctxLoading } = useQuery({
    queryKey: ['today-context'],
    queryFn: () => adaptiveAPI.getTodayContext(),
    staleTime: 10 * 60 * 1000,
  });

  const connectMut = useMutation({
    mutationFn: ({ type, name }) => adaptiveAPI.connectIntegration(type, name),
    onSuccess: (data, { name }) => {
      queryClient.invalidateQueries({ queryKey: ['integrations-status'] });
      toast.success(`✅ تم ربط ${name} بنجاح!`);
    },
    onError: (err) => toast.error(err.message || 'فشل الاتصال'),
  });

  const disconnectMut = useMutation({
    mutationFn: (type) => adaptiveAPI.disconnectIntegration(type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['integrations-status'] });
      toast.success('تم قطع الاتصال');
    },
  });

  const syncMut = useMutation({
    mutationFn: (type) => adaptiveAPI.syncIntegration(type),
    onSuccess: () => toast.success('تمت المزامنة! 🔄'),
    onError: () => toast.error('فشل المزامنة'),
  });

  const status = statusData?.data?.data;
  const ctx = ctxData?.data?.data;
  const summary = status?.summary || {};
  const integrations = status?.integrations || {};

  const isConnected = (type) => {
    return integrations[type]?.connected || false;
  };

  const getIntegrationInfo = (type) => {
    return integrations[type] || {};
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto" dir="rtl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-2xl">🔗</div>
          <div>
            <h1 className="text-2xl font-bold text-white">تكاملات الحياة</h1>
            <p className="text-gray-400 text-sm">ربط LifeFlow مع تطبيقاتك المفضلة</p>
          </div>
        </div>
        {!statusLoading && (
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-2xl font-black text-green-400">{summary.connected || 0}</div>
              <div className="text-xs text-gray-500">متصل</div>
            </div>
            <div className="text-gray-600">/</div>
            <div className="text-center">
              <div className="text-2xl font-black text-gray-400">{summary.total_available || 9}</div>
              <div className="text-xs text-gray-500">متاح</div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Demo Mode Notice */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
        className="glass-card p-4 border border-yellow-500/20 bg-yellow-500/5">
        <div className="flex items-start gap-3">
          <span className="text-2xl">🧪</span>
          <div>
            <p className="text-yellow-400 font-semibold text-sm">وضع الاختبار (Demo Mode)</p>
            <p className="text-gray-400 text-xs mt-1">
              التكاملات في هذا البيئة تعمل في وضع المحاكاة. في الإنتاج، ستحتاج إلى ربط OAuth credentials
              (Google، Microsoft، Notion) من لوحة إعدادات الخادم.
            </p>
          </div>
        </div>
      </motion.div>

      {/* Today's Context */}
      {!ctxLoading && ctx && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className={`glass-card p-4 border ${
            ctx.context_type === 'deep_work' ? 'border-blue-500/30 bg-blue-500/5' :
            ctx.context_type === 'recovery' ? 'border-green-500/30 bg-green-500/5' :
            ctx.context_type === 'meeting_heavy' ? 'border-purple-500/30 bg-purple-500/5' :
            'border-surface-600'
          }`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">
              {ctx.context_type === 'deep_work' ? '🎯' :
               ctx.context_type === 'recovery' ? '🌿' :
               ctx.context_type === 'meeting_heavy' ? '📞' : '☀️'}
            </span>
            <div>
              <p className="text-white font-bold">{ctx.context_label || 'سياق اليوم'}</p>
              <p className="text-gray-400 text-xs">{ctx.recommendation || 'اربط تطبيقاتك لتحليل سياق يومك بدقة'}</p>
            </div>
          </div>
          {ctx.smart_recommendations?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {ctx.smart_recommendations.slice(0, 3).map((r, i) => (
                <span key={i} className="text-xs bg-surface-700 text-gray-300 px-3 py-1 rounded-full">{r}</span>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Integration Categories */}
      {CATEGORIES.map((cat, catIdx) => (
        <motion.div key={cat.id}
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 * catIdx }}
          className="glass-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-white font-bold flex items-center gap-2">
              <span className="text-xl">{cat.icon}</span>
              {cat.label}
            </h2>
            <p className="text-gray-500 text-xs hidden md:block">{cat.desc}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.entries(INTEGRATION_META)
              .filter(([, meta]) => meta.category === cat.id)
              .map(([type, meta]) => {
                const connected = isConnected(type);
                const info = getIntegrationInfo(type);
                const syncing = syncMut.isPending && syncMut.variables === type;
                const connecting = connectMut.isPending && connectMut.variables?.type === type;
                const isExpanded = expandedSetup === type;

                return (
                  <div key={type} className={`rounded-xl border transition-all ${
                    connected
                      ? 'border-green-500/30 bg-green-500/5'
                      : 'border-surface-600 bg-surface-700/30'
                  }`}>
                    {/* Card Header */}
                    <div className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{meta.icon}</span>
                          <div>
                            <p className="text-white text-sm font-medium">{meta.name}</p>
                            <p className="text-gray-500 text-xs">{meta.desc}</p>
                          </div>
                        </div>
                        {connected
                          ? <CheckCircle2 size={16} className="text-green-400 flex-shrink-0" />
                          : <XCircle size={16} className="text-gray-600 flex-shrink-0" />
                        }
                      </div>

                      {/* Last synced */}
                      {connected && info.last_synced && (
                        <p className="text-xs text-gray-500 mb-2">
                          آخر مزامنة: {new Date(info.last_synced).toLocaleDateString('ar-EG')}
                        </p>
                      )}

                      {/* Action Buttons */}
                      <div className="flex gap-2">
                        {connected ? (
                          <>
                            <button
                              onClick={() => syncMut.mutate(type)}
                              disabled={syncing}
                              className="flex-1 text-xs bg-blue-500/20 text-blue-400 py-1.5 rounded-lg hover:bg-blue-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                            >
                              {syncing ? <RefreshCw size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                              مزامنة
                            </button>
                            <button
                              onClick={() => disconnectMut.mutate(type)}
                              className="text-xs bg-red-500/20 text-red-400 px-3 py-1.5 rounded-lg hover:bg-red-500/30 transition-colors"
                            >
                              قطع
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => connectMut.mutate({ type, name: meta.name })}
                              disabled={connecting}
                              className="flex-1 text-xs bg-primary-500/20 text-primary-400 py-1.5 rounded-lg hover:bg-primary-500/30 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                            >
                              {connecting ? <RefreshCw size={11} className="animate-spin" /> : <Link2 size={11} />}
                              {connecting ? 'جاري...' : 'اتصال'}
                            </button>
                            {meta.requiresOAuth && meta.setupUrl && (
                              <button
                                onClick={() => setExpandedSetup(isExpanded ? null : type)}
                                className="text-xs bg-surface-600 text-gray-400 px-2 py-1.5 rounded-lg hover:bg-surface-500 transition-colors"
                              >
                                {isExpanded ? <ChevronUp size={12} /> : <Info size={12} />}
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    {/* Setup Guide */}
                    <AnimatePresence>
                      {isExpanded && !connected && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="border-t border-surface-600 overflow-hidden"
                        >
                          <div className="p-3 space-y-2">
                            <p className="text-xs text-gray-400 font-medium">خطوات الإعداد:</p>
                            <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside">
                              {meta.name === 'Google Calendar' && <>
                                <li>افتح Google Cloud Console</li>
                                <li>أنشئ مشروعاً جديداً</li>
                                <li>فعّل Google Calendar API</li>
                                <li>أضف GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET في .env</li>
                              </>}
                              {meta.name === 'Notion' && <>
                                <li>اذهب إلى Notion Integrations</li>
                                <li>أنشئ Integration جديدة</li>
                                <li>احفظ الـ API Key</li>
                                <li>أضف NOTION_API_KEY في .env</li>
                              </>}
                              {meta.name === 'Todoist' && <>
                                <li>اذهب إلى إعدادات Todoist</li>
                                <li>اختر Integrations → API</li>
                                <li>انسخ الـ API Token</li>
                                <li>أضف TODOIST_API_KEY في .env</li>
                              </>}
                              {!['Google Calendar', 'Notion', 'Todoist'].includes(meta.name) && <>
                                <li>زر صفحة المطور للحصول على بيانات API</li>
                                <li>أضف بيانات الاعتماد في ملف .env</li>
                                <li>أعد تشغيل الخادم</li>
                              </>}
                            </ol>
                            {meta.setupUrl && (
                              <a
                                href={meta.setupUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300 transition-colors"
                              >
                                <ExternalLink size={10} />
                                افتح صفحة الإعداد
                              </a>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
          </div>
        </motion.div>
      ))}

      {/* Features unlocked by integrations */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
        className="glass-card p-5">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <Zap className="text-yellow-400" size={18} />
          ماذا يتيح لك الربط؟
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { icon: '📅', title: 'تحليل الوقت', desc: 'LifeFlow يحلل كيف تقضي وقتك من تقويمك ويقترح تحسينات' },
            { icon: '💪', title: 'تحليل الطاقة', desc: 'بيانات النوم والنشاط البدني تحسّن توصيات الطاقة' },
            { icon: '🎯', title: 'مزامنة المهام', desc: 'استيراد مهامك من Notion/Todoist تلقائياً للتحليل' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-xl bg-surface-700/30">
              <span className="text-2xl">{item.icon}</span>
              <div>
                <p className="text-white text-sm font-medium">{item.title}</p>
                <p className="text-gray-500 text-xs mt-1">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
