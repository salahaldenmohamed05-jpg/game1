/**
 * AssistantView — المساعد الشخصي الذكي الموحد
 * =============================================
 * Conversational AI Agent with:
 * - Multi-turn memory & context awareness
 * - Typing indicator (animated dots)
 * - Suggestion chips (dynamic per intent)
 * - Action badges (task created, mood logged, etc.)
 * - Confirmation flow (yes/no buttons)
 * - Proactive monitor alerts tab
 * - RTL Arabic layout + dark mode
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send, Sparkles, CheckCircle2, Clock,
  AlertTriangle, RefreshCw, ThumbsUp, ThumbsDown,
  Bot, Calendar, BarChart2, Lightbulb, Play,
  User as UserIcon, Target, Zap, Trash2,
  BellRing, MessageSquare, ChevronRight,
} from 'lucide-react';
import { assistantAPI } from '../../utils/api';
import toast from 'react-hot-toast';

// ── Quick Prompts ──────────────────────────────────────────────────────────────
const QUICK_PROMPTS = [
  'اعطني خطة اليوم',
  'ما مهامي المتأخرة؟',
  'سجّل مزاجي 8',
  'اضف مهمة مراجعة المشروع بكره',
  'عندي امتحان في مادتين...',
  'كيف حالي هذا الأسبوع؟',
  'نصيحة للتركيز',
  'تعبت من الضغط',
];

// ── Typing Indicator ───────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="flex gap-2 items-end"
    >
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex-shrink-0 flex items-center justify-center">
        <Bot size={13} className="text-white" />
      </div>
      <div className="bg-white dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700">
        <div className="flex gap-1 items-center">
          {[0, 1, 2].map(i => (
            <motion.div
              key={i}
              className="w-2 h-2 rounded-full bg-blue-400"
              animate={{ y: [0, -5, 0], opacity: [0.5, 1, 0.5] }}
              transition={{ repeat: Infinity, duration: 0.7, delay: i * 0.18 }}
            />
          ))}
          <span className="text-xs text-gray-400 mr-1">يكتب...</span>
        </div>
      </div>
    </motion.div>
  );
}

// ── Message Bubble ─────────────────────────────────────────────────────────────
function MessageBubble({ msg, onConfirm, onReject, onSuggestion }) {
  const isUser = msg.role === 'user';

  // Mode badge config
  const modeBadge = {
    companion: { label: 'رفيق', color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-300' },
    manager  : { label: 'مدير', color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300' },
    hybrid   : { label: 'هجين', color: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' },
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-2 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs
        ${isUser ? 'bg-blue-500' : 'bg-gradient-to-br from-purple-500 to-blue-600'}`}>
        {isUser
          ? <UserIcon size={13} className="text-white" />
          : <Bot size={13} className="text-white" />
        }
      </div>

      <div className={`max-w-[84%] flex flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        {/* Bubble */}
        <div
          className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
            ${isUser
              ? 'bg-blue-500 text-white rounded-tr-sm'
              : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 rounded-tl-sm shadow-sm border border-gray-100 dark:border-gray-700'
            }`}
          dir="rtl"
        >
          {msg.content}
        </div>

        {/* Mode badge + fallback indicator + confidence badge (Phase 15) */}
        {!isUser && (msg.mode || msg.is_fallback || msg.confidence != null) && (
          <div className="flex items-center flex-wrap gap-1.5 px-1">
            {msg.mode && modeBadge[msg.mode] && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${modeBadge[msg.mode].color}`}>
                {modeBadge[msg.mode].label}
              </span>
            )}
            {msg.confidence != null && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium
                ${msg.confidence >= 75 ? 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400 border border-green-200 dark:border-green-800'
                : msg.confidence >= 50 ? 'bg-yellow-50 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400 border border-yellow-200 dark:border-yellow-800'
                : 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400 border border-red-200 dark:border-red-800'}`}>
                ثقة {msg.confidence}٪
              </span>
            )}
            {msg.is_fallback && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-500 dark:bg-amber-900/20 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                ⚠️ رد احتياطي
              </span>
            )}
          </div>
        )}

        {/* Phase 15: Explanation "why" tooltip — show first reason if available */}
        {!isUser && msg.explanation?.why?.length > 0 && (
          <div className="px-1">
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">
              💡 {msg.explanation.why[0]}
            </span>
          </div>
        )}

        {/* Action badge */}
        {msg.action_taken?.action && msg.action_taken.action !== 'chat' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400 px-1"
          >
            <CheckCircle2 size={11} />
            <span>
              {msg.action_taken.action === 'create_task'    && `تمت إضافة ${msg.action_taken.count || 1} مهمة ✓`}
              {msg.action_taken.action === 'complete_task'  && 'تم إنهاء المهمة ✓'}
              {msg.action_taken.action === 'reschedule_task'&& `تم التأجيل إلى ${msg.action_taken.new_date || ''} ✓`}
              {msg.action_taken.action === 'delete_task'    && 'تم الحذف ✓'}
              {msg.action_taken.action === 'log_mood'       && `تم تسجيل المزاج ${msg.action_taken.data?.mood_score}/10 ✓`}
              {msg.action_taken.action === 'plan_day'       && 'تم تجهيز الخطة ✓'}
              {msg.action_taken.action === 'schedule_exam'  && `✅ تم إنشاء ${msg.action_taken.count} مهمة مذاكرة`}
              {msg.action_taken.action === 'schedule_plan'  && `✅ تم إنشاء ${msg.action_taken.count} مهمة مجدولة`}
              {msg.action_taken.action === 'analyze'        && '📊 تم التحليل'}
            </span>
          </motion.div>
        )}

        {/* Actions array badges (new format) */}
        {!isUser && msg.actions?.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-wrap gap-1 px-1"
          >
            {msg.actions.map((act, i) => (
              <span key={i} className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                <CheckCircle2 size={10} />
                {act.type === 'task_created' && `مهمة أُضيفت ✓`}
                {act.type === 'update' && `${act.count} عنصر محدّث ✓`}
              </span>
            ))}
          </motion.div>
        )}

        {/* Confirmation buttons */}
        {msg.needs_confirmation && !msg.confirmed && (
          <div className="flex gap-2 mt-0.5" dir="rtl">
            <button
              onClick={() => onConfirm(msg.id)}
              className="flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-lg text-xs hover:bg-green-600 transition-colors"
            >
              <ThumbsUp size={11} /> نعم، نفّذ
            </button>
            <button
              onClick={() => onReject(msg.id)}
              className="flex items-center gap-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg text-xs hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              <ThumbsDown size={11} /> ألغِ
            </button>
          </div>
        )}

        {/* Suggestion chips from AI */}
        {!isUser && msg.suggestions?.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-0.5" dir="rtl">
            {msg.suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSuggestion(s)}
                className="text-xs px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors border border-blue-200 dark:border-blue-700"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        {msg.timestamp && (
          <span className="text-xs text-gray-400 px-1">
            {new Date(msg.timestamp).toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
      </div>
    </motion.div>
  );
}

// ── Suggestion Card (Autonomous) ───────────────────────────────────────────────
function SuggestionCard({ s, onExecute, isExecuting }) {
  const iconMap = {
    overdue_tasks  : <AlertTriangle size={16} className="text-red-500" />,
    overloaded_day : <Clock size={16} className="text-orange-500" />,
    mood_reminder  : <Sparkles size={16} className="text-purple-500" />,
    tomorrow_prep  : <Calendar size={16} className="text-blue-500" />,
    urgent_alert   : <Zap size={16} className="text-yellow-500" />,
    energy_drop    : <Zap size={16} className="text-orange-500" />,
    mood_drop      : <Sparkles size={16} className="text-pink-500" />,
    burnout_risk   : <AlertTriangle size={16} className="text-red-600" />,
    habit_streak_break: <Target size={16} className="text-green-500" />,
    milestone      : <CheckCircle2 size={16} className="text-green-500" />,
  };
  const borderMap = {
    high  : 'border-l-red-400',
    medium: 'border-l-orange-400',
    low   : 'border-l-blue-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      className={`bg-white dark:bg-gray-800 rounded-xl p-4 border-l-4 ${borderMap[s.priority] || 'border-l-gray-300'} shadow-sm`}
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0">
          {iconMap[s.type] || <Lightbulb size={16} className="text-yellow-500" />}
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-100">{s.message}</p>
          {s.suggestion && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{s.suggestion}</p>
          )}
        </div>
      </div>
      {s.action && (
        <button
          onClick={() => onExecute(s)}
          disabled={isExecuting}
          className="mt-3 w-full flex items-center justify-center gap-2 py-2 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded-lg transition-colors disabled:opacity-50"
        >
          <Play size={11} />
          {isExecuting ? 'جاري التنفيذ...' : 'تنفيذ الاقتراح'}
        </button>
      )}
    </motion.div>
  );
}

// ── Monitor Alert Card ─────────────────────────────────────────────────────────
function AlertCard({ alert }) {
  const priorityColors = {
    high  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
    medium: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
    low   : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl p-3 border ${priorityColors[alert.priority] || priorityColors.medium}`}
      dir="rtl"
    >
      <p className="text-sm text-gray-800 dark:text-gray-100">{alert.message}</p>
      <p className="text-xs text-gray-400 mt-1">{alert.type?.replace(/_/g,' ')}</p>
    </motion.div>
  );
}

// ── Context Card ───────────────────────────────────────────────────────────────
function ContextCard({ ctx }) {
  if (!ctx) return null;
  return (
    <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl p-3 mb-3" dir="rtl">
      <p className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-2">{ctx.greeting}</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'مهام اليوم',   val: ctx.tasks_today   ?? '—', color: 'text-blue-600 dark:text-blue-400' },
          { label: 'قيد الانتظار', val: ctx.tasks_pending ?? '—', color: 'text-orange-500' },
          { label: 'المزاج',       val: ctx.mood_today ? `${ctx.mood_today}/10` : '—', color: 'text-purple-600 dark:text-purple-400' },
        ].map(item => (
          <div key={item.label} className="bg-white/60 dark:bg-gray-800/40 rounded-lg p-2 text-center">
            <p className={`text-base font-bold ${item.color}`}>{item.val}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── TABS ───────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'chat',      label: 'المحادثة',  icon: MessageSquare },
  { id: 'autonomous',label: 'اقتراحات', icon: Sparkles },
  { id: 'alerts',    label: 'تنبيهات',  icon: BellRing },
  { id: 'insights',  label: 'نظرة',     icon: BarChart2 },
];

// ── Welcome Message ────────────────────────────────────────────────────────────
const WELCOME_MSG = {
  id        : 'welcome',
  role      : 'assistant',
  content   : 'أهلاً! أنا مساعدك الشخصي في LifeFlow 🌟\n\nأقدر أساعدك في:\n• 📋 إضافة وتنظيم المهام\n• 💭 تسجيل مزاجك وطاقتك\n• 📅 وضع خطة يومية ذكية\n• 🎓 جدولة المذاكرة للامتحانات\n• 📊 تحليل حياتك وتقديم رؤى\n• 💡 نصائح للإنتاجية والتركيز\n\nجرّب: "اضف مهمة مذاكرة بكرة الساعة 3"\nأو: "عندي امتحان في الرياضيات يوم 2026-04-20 وعليا 8 محاضرات كل محاضرة ساعتين"',
  timestamp : Date.now(),
  suggestions: ['اعطني خطة اليوم', 'كيف طاقتي؟', 'وضعي العام'],
};

// ── Main Component ─────────────────────────────────────────────────────────────
export default function AssistantView() {
  const [tab, setTab]           = useState('chat');
  const [input, setInput]       = useState('');
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [pendingAction, setPendingAction] = useState(null);
  const [isTyping, setIsTyping] = useState(false);

  const bottomRef  = useRef(null);
  const inputRef   = useRef(null);
  const queryClient = useQueryClient();

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Context
  const { data: ctxData } = useQuery({
    queryKey    : ['assistant-context'],
    queryFn     : assistantAPI.getContext,
    refetchInterval: 60000,
    retry       : false,
  });

  // Autonomous suggestions
  const { data: autoData, refetch: refetchAuto, isLoading: autoLoading } = useQuery({
    queryKey    : ['assistant-autonomous'],
    queryFn     : assistantAPI.getAutonomous,
    refetchInterval: 120000,
    retry       : false,
  });

  // Monitor alerts
  const { data: monitorData, refetch: refetchMonitor, isLoading: monitorLoading } = useQuery({
    queryKey    : ['assistant-monitor'],
    queryFn     : assistantAPI.getMonitorAlerts,
    refetchInterval: 300000,
    retry       : false,
  });

  // Send command mutation
  const sendMutation = useMutation({
    mutationFn: ({ message, pending }) => assistantAPI.sendCommand(message, pending),
    onMutate: ({ message }) => {
      const userMsg = {
        id       : `u_${Date.now()}`,
        role     : 'user',
        content  : message,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, userMsg]);
      setIsTyping(true);
    },
    onSuccess: (response) => {
      setIsTyping(false);
      const d = response?.data;
      if (!d) return;

      const assistantMsg = {
        id                : `a_${Date.now()}`,
        role              : 'assistant',
        content           : d.reply || 'حدث خطأ في الرد',
        action_taken      : d.action_taken,
        actions           : d.actions || [],           // new format: array of actions
        needs_confirmation: d.needs_confirmation,
        pending_action    : d.pending_action,
        intent            : d.intent,
        mode              : d.mode,                    // 'companion' | 'manager' | 'hybrid'
        is_fallback       : d.is_fallback || false,    // fallback flag
        suggestions       : d.suggestions || [],
        // Phase 15: confidence + explainability
        confidence        : d.confidence ?? null,
        explanation       : d.explanation || null,
        learningInsight   : d.learningInsight || null,
        planningTip       : d.planningTip || null,
        timestamp         : Date.now(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      setPendingAction(d.needs_confirmation ? d.pending_action : null);

      // Invalidate queries if action was taken
      const hasAction = (d.action_taken?.action && d.action_taken.action !== 'chat') || d.actions?.length > 0;
      if (hasAction) {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['mood-today'] });
        queryClient.invalidateQueries({ queryKey: ['assistant-context'] });
        queryClient.invalidateQueries({ queryKey: ['habits'] });
      }
    },
    onError: () => {
      setIsTyping(false);
      setMessages(prev => [...prev, {
        id       : `e_${Date.now()}`,
        role     : 'assistant',
        content  : 'عذراً، حدث خطأ. حاول مرة أخرى! 🔄',
        timestamp: Date.now(),
        suggestions: ['أعد المحاولة', 'كيف حالي؟'],
      }]);
    },
  });

  // Execute suggestion mutation
  const execMutation = useMutation({
    mutationFn: (suggestion) => assistantAPI.executeSuggestion(suggestion),
    onSuccess: (res) => {
      toast.success(res?.data?.data?.message || 'تم تنفيذ الاقتراح! ✅');
      refetchAuto();
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
    onError: () => toast.error('فشل تنفيذ الاقتراح'),
  });

  // Clear history mutation
  const clearMutation = useMutation({
    mutationFn: assistantAPI.clearHistory,
    onSuccess: () => {
      setMessages([WELCOME_MSG]);
      setPendingAction(null);
      toast.success('تم مسح المحادثة ✓');
    },
  });

  const handleSend = useCallback(() => {
    const msg = input.trim();
    if (!msg || sendMutation.isPending) return;
    setInput('');
    sendMutation.mutate({ message: msg, pending: pendingAction });
  }, [input, sendMutation, pendingAction]);

  const handleConfirm = useCallback((msgId) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, confirmed: true } : m));
    sendMutation.mutate({ message: 'نعم، تأكيد', pending: pendingAction });
    setPendingAction(null);
  }, [pendingAction, sendMutation]);

  const handleReject = useCallback((msgId) => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, confirmed: true } : m));
    setMessages(prev => [...prev, {
      id       : `r_${Date.now()}`,
      role     : 'assistant',
      content  : 'حسناً، تم الإلغاء. 😊 هل تريد شيئاً آخر؟',
      timestamp: Date.now(),
      suggestions: ['اضف مهمة أخرى', 'وضعي اليوم', 'نصيحة'],
    }]);
    setPendingAction(null);
  }, []);

  // Clicking a suggestion chip auto-sends it
  const handleSuggestion = useCallback((suggestion) => {
    if (sendMutation.isPending) return;
    setInput('');
    sendMutation.mutate({ message: suggestion, pending: null });
  }, [sendMutation]);

  const ctx         = ctxData?.data;
  const suggestions = autoData?.data?.suggestions || [];
  const alerts      = monitorData?.data?.alerts || [];
  const alertCount  = alerts.filter(a => a.priority === 'high').length;

  return (
    <div className="flex flex-col bg-gray-50 dark:bg-gray-900 rounded-2xl overflow-hidden" style={{ height: 'calc(100vh - 120px)' }}>

      {/* ── Header ── */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3 flex-shrink-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center">
                <Bot size={18} className="text-white" />
              </div>
              {isTyping && (
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white dark:border-gray-800 animate-pulse" />
              )}
            </div>
            <div>
              <h2 className="font-bold text-gray-800 dark:text-white text-sm">LifeFlow AI</h2>
              <p className="text-xs text-green-500 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
                {isTyping ? 'يكتب...' : 'متصل • يعرف سياقك الكامل'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {TABS.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors
                  ${tab === t.id ? 'bg-blue-500 text-white' : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
              >
                <t.icon size={12} />
                <span className="hidden sm:inline">{t.label}</span>
                {t.id === 'alerts' && alertCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center">
                    {alertCount}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <AnimatePresence mode="wait">

        {/* ── CHAT TAB ── */}
        {tab === 'chat' && (
          <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col flex-1 overflow-hidden"
          >
            {/* Messages area */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {ctx && <ContextCard ctx={ctx} />}

              <AnimatePresence>
                {messages.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    msg={msg}
                    onConfirm={handleConfirm}
                    onReject={handleReject}
                    onSuggestion={handleSuggestion}
                  />
                ))}
              </AnimatePresence>

              <AnimatePresence>
                {isTyping && <TypingIndicator />}
              </AnimatePresence>

              <div ref={bottomRef} />
            </div>

            {/* Quick prompts */}
            <div className="px-4 py-2 flex gap-2 overflow-x-auto flex-shrink-0 border-t border-gray-100 dark:border-gray-700 scrollbar-hide">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => handleSuggestion(p)}
                  disabled={sendMutation.isPending}
                  className="whitespace-nowrap text-xs px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 rounded-full hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors flex-shrink-0 disabled:opacity-40"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* Input area */}
            <div className="px-4 py-3 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center gap-2">
                {/* Clear history button */}
                <button
                  onClick={() => clearMutation.mutate()}
                  disabled={clearMutation.isPending}
                  title="مسح المحادثة"
                  className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0"
                >
                  <Trash2 size={14} />
                </button>

                <input
                  ref={inputRef}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="اكتب رسالتك... مثال: اضف مهمة مذاكرة بكرة الساعة 3"
                  className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full px-4 py-2.5 text-sm text-gray-800 dark:text-gray-100 outline-none placeholder-gray-400 dark:placeholder-gray-500"
                  dir="rtl"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sendMutation.isPending}
                  className="w-9 h-9 rounded-full bg-blue-500 flex items-center justify-center text-white disabled:opacity-40 hover:bg-blue-600 transition-colors flex-shrink-0"
                >
                  <Send size={15} />
                </button>
              </div>
              {pendingAction && (
                <p className="text-xs text-orange-500 text-center mt-1" dir="rtl">
                  ⏳ في انتظار تأكيدك للإجراء السابق
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* ── AUTONOMOUS TAB ── */}
        {tab === 'autonomous' && (
          <motion.div key="auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto px-4 py-4"
          >
            <div className="flex items-center justify-between mb-3" dir="rtl">
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">اقتراحات ذكية</h3>
              <button onClick={refetchAuto} className="text-blue-500 hover:text-blue-600 p-1">
                <RefreshCw size={15} className={autoLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {autoLoading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : suggestions.length > 0 ? (
              <div className="space-y-3">
                {suggestions.map((s, i) => (
                  <SuggestionCard
                    key={i}
                    s={s}
                    onExecute={execMutation.mutate}
                    isExecuting={execMutation.isPending}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center" dir="rtl">
                <div className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-3">
                  <CheckCircle2 size={24} className="text-green-500" />
                </div>
                <p className="text-gray-600 dark:text-gray-300 font-medium">كل شيء على ما يرام!</p>
                <p className="text-gray-400 text-xs mt-1">لا توجد اقتراحات حالياً</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── ALERTS TAB ── */}
        {tab === 'alerts' && (
          <motion.div key="alerts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto px-4 py-4"
          >
            <div className="flex items-center justify-between mb-3" dir="rtl">
              <h3 className="font-semibold text-gray-800 dark:text-white text-sm">تنبيهات استباقية</h3>
              <button onClick={refetchMonitor} className="text-blue-500 hover:text-blue-600 p-1">
                <RefreshCw size={15} className={monitorLoading ? 'animate-spin' : ''} />
              </button>
            </div>

            {monitorLoading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full" />
              </div>
            ) : alerts.length > 0 ? (
              <div className="space-y-3">
                {alerts.map((a, i) => <AlertCard key={i} alert={a} />)}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 text-center" dir="rtl">
                <BellRing size={32} className="text-gray-300 mb-3" />
                <p className="text-gray-500 text-sm">لا توجد تنبيهات جديدة</p>
                <p className="text-gray-400 text-xs mt-1">سأخبرك عند حدوث شيء يستحق الانتباه</p>
              </div>
            )}
          </motion.div>
        )}

        {/* ── INSIGHTS TAB ── */}
        {tab === 'insights' && (
          <motion.div key="ins" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
          >
            {ctx ? (
              <div dir="rtl">
                <ContextCard ctx={ctx} />

                {ctx.recent_tasks?.length > 0 && (
                  <div className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-3 shadow-sm">
                    <h4 className="font-semibold text-gray-700 dark:text-gray-200 text-sm mb-3 flex items-center gap-2">
                      <Target size={15} className="text-blue-500" />
                      أحدث المهام المعلقة
                    </h4>
                    <div className="space-y-2">
                      {ctx.recent_tasks.slice(0, 6).map((t, i) => (
                        <div key={i} className="flex items-center gap-3 py-1">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0
                            ${t.priority === 'urgent' ? 'bg-red-500' : t.priority === 'high' ? 'bg-orange-500' : 'bg-yellow-400'}`} />
                          <span className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{t.title}</span>
                          {t.due_date && <span className="text-xs text-gray-400">{t.due_date}</span>}
                          <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl p-4 text-white shadow-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb size={15} />
                    <span className="font-semibold text-sm">نصيحة اليوم</span>
                  </div>
                  <p className="text-sm opacity-90 leading-relaxed">
                    ركّز على أهم 3 مهام فقط كل يوم. الإنسان يُنجز أفضل عند التركيز على عدد قليل من الأهداف بدلاً من الانتشار. جرّب مبدأ "الثلاثة الكبرى" اليوم! 🎯
                  </p>
                </div>

                <div className="mt-3 bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
                  <h4 className="font-semibold text-gray-700 dark:text-gray-200 text-sm mb-2 flex items-center gap-2">
                    <Sparkles size={15} className="text-purple-500" />
                    أوامر مفيدة جرّبها
                  </h4>
                  <div className="space-y-1.5">
                    {[
                      '"اعطني خطة اليوم" — تنظيم مهامك',
                      '"سجّل مزاجي 7" — تسجيل مزاجك',
                      '"اضف مهمة X بكره" — إضافة مهمة',
                      '"عندي امتحان في X يوم Y" — جدولة',
                      '"تعبت من الضغط" — نصيحة فورية',
                    ].map((tip, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <span className="text-blue-400 font-bold">•</span>
                        <span>{tip}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex justify-center py-10">
                <div className="animate-spin w-7 h-7 border-2 border-blue-500 border-t-transparent rounded-full" />
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
