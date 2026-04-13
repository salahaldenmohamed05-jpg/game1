/**
 * AssistantView — 3-Layer Chat Architecture (Phase H: Hardened)
 * ==============================================================
 * UX DECISION: Chat is fundamentally different from other views.
 * Other views (tasks, habits, dashboard) scroll their entire content
 * through MobileLayout. Chat needs:
 *   Layer 1: Fixed header (session title, session switcher)
 *   Layer 2: Scrollable messages area (only this scrolls)
 *   Layer 3: Fixed input bar (always visible, even with keyboard)
 *
 * PHASE H HARDENING:
 *   - All data access uses optional chaining + fallbacks
 *   - Every sub-component wrapped in try/catch render
 *   - Race conditions mitigated with send-lock flags
 *   - ErrorBoundary wraps timeline and sidebar
 *   - Defensive guards on messages array and session objects
 *   - Safe-area bottom padding for mobile navbar
 */

import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Send, Sparkles, Bot, Calendar, Plus, Trash2,
  MessageSquare, Clock,
  RefreshCw, X, User as UserIcon,
  ChevronDown, MoreHorizontal,
  AlertTriangle,
  Mic, MicOff, Volume2, VolumeX, Globe,
} from 'lucide-react';
import { assistantAPI, chatAPI, dashboardAPI, taskAPI, habitAPI } from '../../utils/api';
import { QUICK_PROMPTS, WELCOME_MSG } from '../../constants/smartActions';
import toast from 'react-hot-toast';
import ErrorBoundary from '../common/ErrorBoundary';
import useVoiceChat from '../../hooks/useVoiceChat';
import { analyzeScenario } from '../../engine/scenarioEngine';
import { analyzeBehavior, computeAssistantTone } from '../../engine/behavioralEngine';
import {
  decide as cognitiveDecide,
  recordAction as cognitiveRecord,
  getProfile as getCognitiveProfile,
  getLastActions,
} from '../../engine/cognitiveEngine';
import { useBrainStore } from '../../store/brainStore';

// Safe fallback for WELCOME_MSG in case import fails
const SAFE_WELCOME = WELCOME_MSG && typeof WELCOME_MSG === 'object'
  ? WELCOME_MSG
  : { id: 'welcome', role: 'assistant', content: 'أهلاً! قولّي عايز تعمل إيه 👋' };

const SAFE_WELCOME_EN = { id: 'welcome-en', role: 'assistant', content: "Hey! I'm your LifeFlow assistant 👋 What would you like to do?" };

// Safe QUICK_PROMPTS fallback
const SAFE_PROMPTS = Array.isArray(QUICK_PROMPTS) ? QUICK_PROMPTS : [];

const SAFE_PROMPTS_EN = [
  { icon: '🚀', text: 'Start my day' },
  { icon: '🎯', text: "What's most important now?" },
  { icon: '➕', text: 'Add a task' },
  { icon: '😊', text: 'Log my mood' },
  { icon: '⚡', text: "How's my energy?" },
  { icon: '📊', text: 'Daily review' },
];

// ─── Typing indicator ─────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex gap-2 items-end px-1">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex-shrink-0 flex items-center justify-center">
        <Bot size={13} className="text-white" />
      </div>
      <div className="bg-white/5 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <motion.div key={i} animate={{ opacity: [0.3, 1, 0.3] }}
              transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              className="w-2 h-2 bg-primary-400 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Single Message Bubble (hardened) ────────────────────────────────────
const MsgBubble = memo(function MsgBubble({ msg, onSuggestion, onRetry, onConfirmAction, isLast }) {
  // Guard: if msg is null/undefined, render nothing
  if (!msg || typeof msg !== 'object') return null;

  const isUser = msg.role === 'user';
  const content = typeof msg.content === 'string' ? msg.content : String(msg.content || '');
  const suggestions = Array.isArray(msg.suggestions) ? msg.suggestions : [];
  // Phase 13.1: Message delivery status
  const status = msg.status || 'sent'; // 'sending' | 'sent' | 'failed'
  // Phase 13.1: Proposed actions that need confirmation
  const proposedActions = Array.isArray(msg.proposedActions) ? msg.proposedActions : [];

  return (
    <motion.div
      initial={isLast ? { opacity: 0, y: 8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex gap-2 items-end ${isUser ? 'flex-row-reverse' : ''}`}
    >
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${
        isUser ? 'bg-primary-500' : 'bg-gradient-to-br from-purple-500 to-blue-600'
      }`}>
        {isUser ? <UserIcon size={13} className="text-white" /> : <Bot size={13} className="text-white" />}
      </div>

      {/* Bubble */}
      <div className={`min-w-0 max-w-[85%] rounded-2xl px-3.5 py-2.5 break-words ${
        isUser
          ? 'bg-primary-500 text-white rounded-tr-sm'
          : msg.isError
            ? 'bg-red-500/10 text-red-300 rounded-tl-sm border border-red-500/20'
            : 'bg-white/[0.06] text-gray-200 rounded-tl-sm border border-white/[0.06]'
      }`}>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{content}</div>

        {/* Source + confidence badge — never show for user messages */}
        {!isUser && (msg.source || msg.confidence != null) && (
          <div className="mt-1.5 text-[10px] text-gray-500/70 flex items-center gap-2 flex-wrap">
            {msg.source && (
              <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-medium ${
                msg.source === 'gemini' ? 'bg-blue-500/10 text-blue-400/80' :
                msg.source === 'grok'   ? 'bg-purple-500/10 text-purple-400/80' :
                                          'bg-green-500/10 text-green-400/70'
              }`}>
                {msg.source === 'gemini' ? '🤖 Gemini' :
                 msg.source === 'grok'   ? '🟣 Grok' :
                                          '📊 بيانات حقيقية'}
              </span>
            )}
            {msg.confidence != null && !isNaN(Number(msg.confidence)) && (
              <span className="flex items-center gap-0.5">
                <Sparkles size={8} /> {Number(msg.confidence) > 1 ? Math.round(Number(msg.confidence)) : Math.round(Number(msg.confidence) * 100)}%
              </span>
            )}
          </div>
        )}

        {/* Phase 13.1: Proposed actions — suggest → confirm → execute */}
        {proposedActions.length > 0 && (
          <div className="mt-2.5 pt-2 border-t border-white/[0.06] space-y-1.5">
            <p className="text-[10px] text-gray-500 font-medium">إجراءات مقترحة — اضغط لتأكيد:</p>
            {proposedActions.map((action, i) => (
              <button key={i} onClick={() => onConfirmAction?.(msg.id, action)}
                disabled={action.confirmed}
                className={`w-full text-right text-xs px-3 py-2 rounded-lg transition-all flex items-center gap-2 ${
                  action.confirmed
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 border border-primary-500/20 active:scale-[0.98]'
                }`}>
                <span>{action.confirmed ? '✅' : '▶️'}</span>
                <span className="flex-1">{action.label || action.type}</span>
                {action.confirmed && <span className="text-[9px] text-green-400/70">تم التنفيذ</span>}
              </button>
            ))}
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2.5 pt-2 border-t border-white/[0.06]">
            {suggestions.map((s, i) => {
              const text = typeof s === 'string' ? s : (s?.text || String(s || ''));
              if (!text) return null;
              return (
                <button key={i} onClick={() => onSuggestion?.(text)}
                  className="text-xs bg-primary-500/10 text-primary-400 px-2.5 py-1 rounded-lg
                    hover:bg-primary-500/20 active:scale-95 transition-all">
                  {text}
                </button>
              );
            })}
          </div>
        )}

        {/* Phase 13.1: Message status indicator */}
        {isUser && (
          <div className="mt-1 flex items-center justify-end gap-1">
            {status === 'sending' && <span className="text-[9px] text-gray-500">جاري الإرسال...</span>}
            {status === 'sent' && <span className="text-[9px] text-green-400/60">✓ تم الإرسال</span>}
            {status === 'failed' && (
              <button onClick={() => onRetry?.(msg)} className="text-[9px] text-red-400 flex items-center gap-0.5 hover:text-red-300">
                <AlertTriangle size={8} /> فشل — إعادة المحاولة
              </button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
});

// ─── Interactive Smart Daily Timeline ─────────────────────────────────────
function DailyTimeline() {
  // ALL hooks MUST be called before any conditional return — Rules of Hooks
  const queryClient = useQueryClient();
  const [completedIds, setCompletedIds] = useState(new Set());
  const [completingId, setCompletingId] = useState(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['smart-timeline'],
    queryFn: () => assistantAPI.getSmartTimeline().catch(() => ({ data: {} })),
    refetchInterval: 120000,
    retry: false,
  });

  // Deeply defensive data extraction
  const smart = data?.data?.data || {};
  const schedule = Array.isArray(smart.timeline) ? smart.timeline : [];
  const overdue = Array.isArray(smart.overdue) ? smart.overdue : [];
  const suggestions = Array.isArray(smart.suggestions) ? smart.suggestions : [];
  const freeSlots = Array.isArray(smart.freeSlots) ? smart.freeSlots : [];
  const stats = smart.stats || {};

  // Early return AFTER all hooks
  if (isError) return null;

  const handleCompleteTask = async (item) => {
    if (!item?.source_id || completingId) return;
    setCompletingId(item.source_id);
    try {
      await assistantAPI.completeTimelineTask(item.source_id);
      setCompletedIds(prev => new Set(prev).add(item.source_id));
      toast.success(`تم إكمال "${item.title || 'المهمة'}"`);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['smart-timeline'] });
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }, 500);
    } catch {
      toast.error('فشل إكمال المهمة');
    } finally {
      setCompletingId(null);
    }
  };

  if (isLoading || (schedule.length === 0 && overdue.length === 0 && suggestions.length === 0)) return null;

  const icons = { task: '📋', habit: '🔥', prayer: '🕌', break: '☕', event: '📅' };

  const visibleSchedule = schedule.filter(i =>
    !(i?.source_id && completedIds.has(i.source_id)) && i?.status !== 'completed'
  );
  const completedSchedule = schedule.filter(i =>
    i?.status === 'completed' || (i?.source_id && completedIds.has(i.source_id))
  );

  return (
    <div className="glass-card p-3.5 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-bold text-white flex items-center gap-1.5">
          <Calendar size={12} className="text-blue-400" /> الجدول الذكي
        </h4>
        <div className="flex items-center gap-2">
          {(stats.completed || 0) > 0 && (
            <span className="text-[10px] text-green-400/70">{stats.completed} مكتمل</span>
          )}
          <button onClick={() => refetch()} className="text-gray-500 hover:text-white p-0.5 active:scale-90 transition-all">
            <RefreshCw size={10} />
          </button>
        </div>
      </div>

      {visibleSchedule.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
          <AnimatePresence>
            {visibleSchedule.slice(0, 8).map((item, idx) => (
              <motion.div
                key={item?.source_id || item?.title || `timeline-${idx}`}
                layout
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-2 text-xs group"
              >
                {item?.type === 'task' && item?.source_id ? (
                  <button
                    onClick={() => handleCompleteTask(item)}
                    disabled={completingId === item.source_id}
                    className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all
                      ${completingId === item.source_id
                        ? 'border-green-400 bg-green-500/20 animate-pulse'
                        : 'border-gray-600 hover:border-primary-400 hover:bg-primary-500/10 active:scale-90'
                      }`}
                  >
                    {completingId === item.source_id && <span className="text-[8px]">...</span>}
                  </button>
                ) : (
                  <span className="text-sm flex-shrink-0 w-4 text-center">{icons[item?.type] || '📌'}</span>
                )}
                <span className="text-blue-400 font-mono w-10 text-[11px] flex-shrink-0">{item?.start_time || '--:--'}</span>
                <span className="truncate flex-1 text-gray-300">{item?.title || ''}</span>
                {item?.priority === 'high' && <span className="text-[9px] text-red-400">!</span>}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {completedSchedule.length > 0 && (
        <div className="text-[10px] text-green-400/60 flex items-center gap-1">
          <span>✅</span>
          <span>{completedSchedule.length} مهمة مكتملة</span>
        </div>
      )}

      {overdue.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold text-red-400 flex items-center gap-1.5 mb-1.5">
            <Clock size={11} className="text-red-400" /> متأخرة ({overdue.length})
          </h4>
          <div className="space-y-1.5">
            <AnimatePresence>
              {overdue.slice(0, 4).map((t, idx) => (
                <motion.div
                  key={t?.id || `overdue-${idx}`}
                  layout
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-xs bg-red-500/[0.05] rounded-lg px-2 py-1.5"
                >
                  <button
                    onClick={() => handleCompleteTask({ source_id: t?.id, title: t?.title, type: 'task' })}
                    disabled={completingId === t?.id}
                    className="w-3.5 h-3.5 rounded border border-red-500/40 flex-shrink-0 hover:bg-red-500/20 active:scale-90 transition-all"
                  />
                  <span className="truncate flex-1 text-red-300/80">{t?.title || ''}</span>
                  <span className="text-[10px] text-red-400/60 flex-shrink-0">{t?.days_overdue || 0} يوم</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {suggestions.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold text-primary-400 flex items-center gap-1.5 mb-1.5">
            <Sparkles size={11} /> اقتراحات ذكية
          </h4>
          <div className="space-y-1.5">
            {suggestions.slice(0, 3).map((s, idx) => (
              <SmartSuggestion key={s?.id || `suggestion-${idx}`} suggestion={s} />
            ))}
          </div>
        </div>
      )}

      {freeSlots.length > 0 && (
        <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
          <span>⏱️</span>
          <span>{freeSlots.reduce((sum, s) => sum + (s?.duration_min || 0), 0)} دقيقة حرة</span>
          <span className="text-gray-600">·</span>
          <span>{freeSlots.length} فترة</span>
        </div>
      )}
    </div>
  );
}

// ─── Smart Suggestion with Accept/Reject ──────────────────────────────────
function SmartSuggestion({ suggestion }) {
  const [status, setStatus] = useState(null);
  const queryClient = useQueryClient();

  if (!suggestion || typeof suggestion !== 'object') return null;

  const handleAccept = async () => {
    setStatus('loading');
    try {
      await assistantAPI.acceptSuggestion(suggestion.id, suggestion.action);
      setStatus('accepted');
      toast.success('تم تنفيذ الاقتراح');
      queryClient.invalidateQueries({ queryKey: ['smart-timeline'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch {
      toast.error('فشل تنفيذ الاقتراح');
      setStatus(null);
    }
  };

  if (status === 'accepted') return (
    <motion.div
      initial={{ opacity: 1 }} animate={{ opacity: 0.6 }}
      className="text-[11px] text-green-400/70 flex items-center gap-1 py-0.5"
    >
      ✅ {suggestion.title || ''}
    </motion.div>
  );
  if (status === 'rejected') return null;

  const proposedTime = suggestion.action?.proposed_time;

  const typeStyles = {
    reschedule:     'border-orange-500/20 bg-orange-500/[0.04]',
    break:          'border-blue-500/20 bg-blue-500/[0.04]',
    habit_reminder: 'border-green-500/20 bg-green-500/[0.04]',
    focus_block:    'border-purple-500/20 bg-purple-500/[0.04]',
  };

  const typeIcons = {
    reschedule:     '📅',
    break:          '☕',
    habit_reminder: '🔥',
    focus_block:    '🎯',
  };

  return (
    <motion.div
      layout
      exit={{ opacity: 0, height: 0 }}
      className={`rounded-lg p-2.5 border ${typeStyles[suggestion.type] || 'border-white/[0.06] bg-white/[0.03]'}`}
    >
      <div className="flex items-start gap-2">
        <span className="text-sm flex-shrink-0">{typeIcons[suggestion.type] || '💡'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-200 font-medium leading-snug">{suggestion.title || ''}</p>
          <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{suggestion.reason || ''}</p>
          {proposedTime && (
            <p className="text-[10px] text-primary-400/80 mt-1 flex items-center gap-1">
              <Clock size={9} /> الوقت المقترح: {proposedTime}
            </p>
          )}
        </div>
      </div>
      <div className="flex gap-1.5 mt-2">
        <button
          onClick={handleAccept}
          disabled={status === 'loading'}
          className="text-[10px] px-2.5 py-1 rounded-lg bg-primary-500/20 text-primary-300
            hover:bg-primary-500/30 active:scale-95 transition-all disabled:opacity-50 flex items-center gap-1"
        >
          {status === 'loading' ? '...' : '✓ قبول'}
        </button>
        <button
          onClick={() => setStatus('rejected')}
          className="text-[10px] px-2.5 py-1 rounded-lg bg-white/5 text-gray-400
            hover:bg-white/10 active:scale-95 transition-all"
        >
          تخطي
        </button>
      </div>
    </motion.div>
  );
}

// ─── Sessions Sidebar (hardened) ─────────────────────────────────────────
function SessionsSidebar({ sessions, activeId, onSelect, onCreate, onDelete }) {
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  return (
    <div className="glass-card p-3 space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-gray-400">المحادثات</span>
        <button onClick={onCreate} className="p-1 rounded-lg hover:bg-white/10 text-primary-400 active:scale-90 transition-all">
          <Plus size={14} />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto scrollbar-hide space-y-1">
        {safeSessions.map(s => {
          if (!s || !s.id) return null;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`w-full flex items-center gap-2 p-2 rounded-xl text-right text-xs transition-all ${
                activeId === s.id
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'hover:bg-white/5 text-gray-400'
              }`}
            >
              <MessageSquare size={12} className="flex-shrink-0" />
              <span className="flex-1 truncate">{s.title || 'محادثة جديدة'}</span>
              <span className="text-[10px] text-gray-600">{s.message_count || 0}</span>
              <button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
                className="p-0.5 hover:text-red-400 text-gray-600 active:scale-90 transition-all">
                <Trash2 size={10} />
              </button>
            </button>
          );
        })}
      </div>
      {safeSessions.length === 0 && (
        <p className="text-[11px] text-gray-600 text-center py-2">لا توجد محادثات</p>
      )}
    </div>
  );
}

// ─── View Error Fallback ────────────────────────────────────────────────
function ViewErrorFallback({ error, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center" dir="rtl">
      <AlertTriangle size={32} className="text-amber-400 mb-3" />
      <h3 className="text-sm font-bold text-white mb-2">حدث خطأ في المساعد</h3>
      <p className="text-xs text-gray-400 mb-4 max-w-xs">{error || 'حدث خطأ غير متوقع. جاري إعادة المحاولة...'}</p>
      <button onClick={onRetry}
        className="px-4 py-2 bg-primary-500/20 text-primary-400 text-sm rounded-xl hover:bg-primary-500/30 transition-all flex items-center gap-2"
      >
        <RefreshCw size={14} /> إعادة المحاولة
      </button>
    </div>
  );
}

// ─── Main Component (Phase H: Hardened) ──────────────────────────────────

export default function AssistantView({ onViewChange }) {
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([SAFE_WELCOME]);
  const [viewError, setViewError] = useState(null);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [language, setLanguage] = useState('ar'); // 'ar' or 'en'
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const sendLockRef = useRef(false); // Prevent double-send race condition
  const handleSendRef = useRef(null); // Ref for voice callback
  const queryClient = useQueryClient();

  // ── Voice Chat Integration ─────────────────────────────────────────────
  const handleVoiceTranscript = useCallback((text, isFinal) => {
    if (isFinal && text.trim() && handleSendRef.current) {
      // Auto-send voice message
      handleSendRef.current(text.trim());
    }
  }, []);

  const voice = useVoiceChat({
    language,
    onTranscript: handleVoiceTranscript,
    autoSend: true,
  });

  // Wait for client-side mount to avoid hydration issues
  useEffect(() => { setMounted(true); }, []);

  // ── COGNITIVE LAYER: Fetch real data for context-aware assistant ─────────
  const { data: dashRaw } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardAPI.getDashboard().catch(() => ({ data: { data: {} } })),
    staleTime: 60 * 1000,
    retry: 0,
    enabled: mounted,
  });
  const dashData = dashRaw?.data?.data || {};

  // Phase 12.5: Brain store is THE ONLY source of truth — no fallback
  const { brainState, fetchBrainState: fetchBrain } = useBrainStore();

  // Fetch brain state on mount
  useEffect(() => {
    if (mounted) fetchBrain();
  }, [mounted]);

  // Generate cognitive welcome using brain state ONLY (no local cognitive engine)
  const cognitiveWelcome = useMemo(() => {
    if (!mounted) return null;
    try {
      if (!brainState?.currentDecision) return null; // Loading — no fallback

      const d = brainState.currentDecision;
      const us = brainState.userState || {};
      let content = '';
      if (d.taskId) {
        content = `${d.why?.[0] || brainState.reason || ''}\n\n`;
        if (d.smallestStep) content += `👉 ${d.smallestStep}\n\n`;
        content += `📊 ${us.todayCompleted || 0} مكتمل | ${us.todayPending || 0} متبقي | ⚡ ${
          us.energy === 'high' ? 'طاقة عالية' : us.energy === 'medium' ? 'طاقة متوسطة' : 'طاقة منخفضة'
        }`;
        if (d.confidence) content += ` | 🎯 ${d.confidence}% ثقة`;
      } else {
        content = d.why?.[0] || 'أهلاً! قولّي عايز تعمل إيه 👋';
      }
      return { id: 'brain-welcome', role: 'assistant', content, suggestions: [] };
    } catch (e) {
      console.error('[AssistantView] cognitiveWelcome error:', e);
      return null;
    }
  }, [mounted, brainState]);

  // Fetch sessions — with error handling to prevent crash
  const { data: sessionsData, refetch: refetchSessions, isError: sessionsError } = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: () => chatAPI.getSessions().catch(err => {
      console.error('[AssistantView] getSessions failed:', err);
      return { data: { data: { sessions: [] } } };
    }),
    refetchInterval: 60000,
    retry: 1,
    enabled: mounted,
  });

  // Deeply defensive session extraction
  const rawSessions = sessionsData?.data?.data?.sessions || sessionsData?.data?.data || [];
  const sessions = Array.isArray(rawSessions) ? rawSessions.filter(s => s && s.id) : [];

  // Auto-select first session
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Load messages when session changes
  const { data: sessionMsgs } = useQuery({
    queryKey: ['chat-messages', activeSessionId],
    queryFn: () => chatAPI.getMessages(activeSessionId).catch(err => {
      console.error('[AssistantView] getMessages failed:', err);
      return { data: { data: { messages: [] } } };
    }),
    enabled: !!activeSessionId && mounted,
  });

  useEffect(() => {
    // Don't update messages while sending to prevent race condition
    if (isSending) return;

    if (sessionMsgs?.data?.data) {
      const msgs = sessionMsgs.data.data.messages || sessionMsgs.data.data || [];
      if (Array.isArray(msgs) && msgs.length > 0) {
        setMessages([SAFE_WELCOME, ...msgs.map((m, i) => ({
          id: m?.id || `msg-${i}-${m?.createdAt || i}`,
          role: m?.role || 'assistant',
          content: m?.content || '',
          confidence: m?.confidence,
          suggestions: Array.isArray(m?.suggestions) ? m.suggestions : [],
          timestamp: m?.createdAt,
        }))]);
      } else {
        setMessages([SAFE_WELCOME]);
      }
    }
  }, [sessionMsgs, isSending]);

  // Smart auto-scroll
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distFromBottom < 200;
    if (isNearBottom || behavior === 'auto') {
      requestAnimationFrame(() => {
        messagesEndRef.current?.scrollIntoView({ behavior });
      });
    }
  }, []);

  useEffect(() => {
    scrollToBottom('auto');
  }, [messages, isSending, scrollToBottom]);

  // Extract session ID from various API response shapes
  const extractSessionId = useCallback((resData) => {
    try {
      const d = resData?.data?.data || resData?.data || {};
      return d.session?.session_id || d.session?.id || d.session_id || d.id || null;
    } catch {
      return null;
    }
  }, []);

  const handleCreateSession = async () => {
    try {
      const res = await chatAPI.createSession();
      const sid = extractSessionId(res);
      if (sid) {
        setActiveSessionId(sid);
        setMessages([SAFE_WELCOME]);
        refetchSessions();
        toast.success('محادثة جديدة');
      } else {
        toast.error('فشل في إنشاء المحادثة — لا يوجد معرف جلسة');
      }
    } catch (err) {
      toast.error('فشل في إنشاء المحادثة');
      console.error('[AssistantView] createSession error:', err);
    }
  };

  const handleDeleteSession = async (id) => {
    try {
      await chatAPI.deleteSession(id);
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([SAFE_WELCOME]);
      }
      refetchSessions();
      toast.success('تم حذف المحادثة');
    } catch (err) {
      toast.error('فشل في الحذف');
      console.error('[AssistantView] deleteSession error:', err);
    }
  };

  // Send message (with double-send protection)
  const handleSend = async (text = null) => {
    const msg = (text || input).trim();
    if (!msg || isSending || sendLockRef.current) return;

    sendLockRef.current = true;
    setInput('');
    // Stop listening if still active
    if (voice.isListening) voice.stopListening();

    // Ensure we have a session
    let sid = activeSessionId;
    if (!sid) {
      try {
        const res = await chatAPI.createSession();
        sid = extractSessionId(res);
        if (!sid) {
          toast.error('فشل في إنشاء محادثة — لا يوجد معرف');
          sendLockRef.current = false;
          return;
        }
        setActiveSessionId(sid);
        refetchSessions();
      } catch (err) {
        toast.error('فشل في إنشاء محادثة');
        console.error('[AssistantView] createSession in send:', err);
        sendLockRef.current = false;
        return;
      }
    }

    // Add user message with status tracking (Phase 13.1)
    const userMsg = { id: 'u-' + Date.now(), role: 'user', content: msg, timestamp: new Date(), status: 'sending' };
    setMessages(prev => {
      const safe = Array.isArray(prev) ? prev : [SAFE_WELCOME];
      return [...safe, userMsg];
    });
    setIsSending(true);

    // Force scroll to bottom when user sends a message
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    try {
      const res = await chatAPI.sendMessage(sid, msg);
      const data = res?.data?.data || res?.data || {};
      const reply = data?.reply || data?.message || data?.content || data?.response || 'تم استلام رسالتك';

      // Phase 13.1: Parse proposed actions from assistant response
      const proposedActions = Array.isArray(data?.actions) && data.actions.length > 0
        ? data.actions.map(a => ({
            type: a.type || a.action || 'unknown',
            label: a.label || a.description || a.type || 'إجراء',
            params: a.params || a,
            confirmed: false,
          }))
        : [];

      const aiMsg = {
        id: 'a-' + Date.now(),
        role: 'assistant',
        content: typeof reply === 'string' ? reply : (reply?.content || JSON.stringify(reply)),
        confidence: data?.confidence,
        source: data?.source || null,        // 'local' | 'gemini' | 'grok'
        aiMode: data?.aiMode   || null,       // 'full_ai' | 'hybrid' | 'data_only' | 'offline'
        suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
        proposedActions,
        timestamp: new Date(),
      };

      // Mark user message as sent, add AI response
      setMessages(prev => {
        const safe = Array.isArray(prev) ? prev : [SAFE_WELCOME];
        return safe.map(m => m.id === userMsg.id ? { ...m, status: 'sent' } : m).concat(aiMsg);
      });
      // Auto-speak AI response if voice mode is on
      if (voice.voiceEnabled && aiMsg.content) {
        voice.autoSpeak(aiMsg.content);
      }
      refetchSessions();
      queryClient.invalidateQueries({ queryKey: ['chat-messages', sid] });

      // Phase 15: If assistant executed an action (task creation, completion, etc.),
      // invalidate ALL relevant queries so dashboard/tasks/habits views update instantly
      const hasAction = data?.action_taken || (Array.isArray(data?.actions) && data.actions.length > 0);
      if (hasAction) {
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['tasks-all'] });
        queryClient.invalidateQueries({ queryKey: ['tasks-smart-view'] });
        queryClient.invalidateQueries({ queryKey: ['habits'] });
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        queryClient.invalidateQueries({ queryKey: ['today-flow'] });
        queryClient.invalidateQueries({ queryKey: ['mood'] });
        queryClient.invalidateQueries({ queryKey: ['goals'] });
      }
    } catch (err) {
      const errMsg = err?.response?.data?.message || err?.message || 'خطأ غير معروف';
      // Phase 13.1: Mark user message as failed
      setMessages(prev => {
        const safe = Array.isArray(prev) ? prev : [SAFE_WELCOME];
        return safe.map(m => m.id === userMsg.id ? { ...m, status: 'failed' } : m).concat({
          id: 'e-' + Date.now(), role: 'assistant',
          content: `عذراً، حدث خطأ: ${errMsg}. حاول مرة أخرى.`,
          isError: true,
        });
      });
      console.error('[AssistantView] sendMessage error:', err);
    } finally {
      setIsSending(false);
      sendLockRef.current = false;
      // Refocus input after send
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Phase 13.1: Retry failed messages
  const handleRetry = useCallback((failedMsg) => {
    // Remove the failed message and the error response, then resend
    setMessages(prev => {
      const safe = Array.isArray(prev) ? prev : [SAFE_WELCOME];
      return safe.filter(m => m.id !== failedMsg.id);
    });
    handleSend(failedMsg.content);
  }, []);

  // Phase 13.1: Confirm and execute proposed action (suggest → confirm → execute)
  const handleConfirmAction = useCallback(async (msgId, action) => {
    try {
      // Mark action as confirmed in UI
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        return {
          ...m,
          proposedActions: (m.proposedActions || []).map(a =>
            a.type === action.type ? { ...a, confirmed: true } : a
          ),
        };
      }));

      // Execute via assistant API
      toast.success(`جاري تنفيذ: ${action.label}`);

      // Re-fetch relevant data
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['tasks-smart-view'] });
      queryClient.invalidateQueries({ queryKey: ['habits'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err) {
      toast.error('فشل في تنفيذ الإجراء');
      // Revert confirmation
      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        return {
          ...m,
          proposedActions: (m.proposedActions || []).map(a =>
            a.type === action.type ? { ...a, confirmed: false } : a
          ),
        };
      }));
    }
  }, [queryClient]);

  // Keep handleSendRef in sync for voice callback
  handleSendRef.current = handleSend;

  // Update welcome message when language changes or cognitive data arrives
  useEffect(() => {
    const baseWelcome = language === 'en' ? SAFE_WELCOME_EN : SAFE_WELCOME;
    // Use cognitive welcome if available and language is Arabic
    const welcome = (cognitiveWelcome && language === 'ar') ? cognitiveWelcome : baseWelcome;
    setMessages(prev => {
      if (prev.length <= 1) return [welcome];
      // Replace only the welcome message, keep conversation
      return [welcome, ...prev.slice(1)];
    });
  }, [language, cognitiveWelcome]);

  // Error state
  if (viewError) {
    return <ViewErrorFallback error={viewError} onRetry={() => setViewError(null)} />;
  }

  // Ensure messages is always a safe array
  const safeMessages = Array.isArray(messages) ? messages : [SAFE_WELCOME];

  return (
    <div className="flex flex-col h-full min-h-0" dir={language === 'en' ? 'ltr' : 'rtl'}>
      <div className="flex flex-1 min-h-0 gap-0 md:gap-4">

        {/* Desktop Sidebar (md+) wrapped in ErrorBoundary */}
        <div className="hidden md:flex md:flex-col w-48 lg:w-56 flex-shrink-0 gap-3 py-3 pr-3 lg:pr-4 overflow-y-auto scrollbar-hide">
          <ErrorBoundary compact>
            <SessionsSidebar
              sessions={sessions}
              activeId={activeSessionId}
              onSelect={id => setActiveSessionId(id)}
              onCreate={handleCreateSession}
              onDelete={handleDeleteSession}
            />
          </ErrorBoundary>
          <ErrorBoundary compact>
            <DailyTimeline />
          </ErrorBoundary>
        </div>

        {/* Chat Column: 3 layers */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">

          {/* Layer 1: Chat Header */}
          <div className="flex-shrink-0 px-3 sm:px-4 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <Sparkles size={16} className="text-primary-400" />
                {language === 'en' ? 'Smart Assistant' : 'المساعد الذكي'}
                {/* AI Mode Badge — sourced from brainState */}
                {brainState?.aiMode && (() => {
                  const mode = brainState.aiMode;
                  const cfg = {
                    full_ai:   { label: 'AI كامل',    cls: 'bg-blue-500/15 text-blue-400 border-blue-500/20' },
                    hybrid:    { label: 'هجين',       cls: 'bg-purple-500/15 text-purple-400 border-purple-500/20' },
                    data_only: { label: 'بيانات فقط', cls: 'bg-green-500/15 text-green-400 border-green-500/20' },
                    offline:   { label: 'غير متصل',   cls: 'bg-gray-500/15 text-gray-400 border-gray-500/20' },
                  }[mode];
                  if (!cfg) return null;
                  return (
                    <span className={`text-[9px] px-1.5 py-0.5 rounded-md border font-medium ${cfg.cls}`}>
                      {cfg.label}
                    </span>
                  );
                })()}
              </h2>
              <div className="flex items-center gap-1.5">
                {/* Language Toggle */}
                <button
                  onClick={() => setLanguage(prev => prev === 'ar' ? 'en' : 'ar')}
                  className="p-2 rounded-xl hover:bg-white/5 active:scale-90 text-gray-400 transition-all flex items-center gap-1"
                  title={language === 'ar' ? 'Switch to English' : 'التحويل للعربي'}
                >
                  <Globe size={14} />
                  <span className="text-[10px] font-bold">{language === 'ar' ? 'EN' : 'ع'}</span>
                </button>
                {/* Voice Mode Toggle (TTS) */}
                <button
                  onClick={voice.toggleVoiceMode}
                  className={`p-2 rounded-xl active:scale-90 transition-all ${
                    voice.voiceEnabled
                      ? 'bg-primary-500/20 text-primary-400'
                      : 'hover:bg-white/5 text-gray-400'
                  }`}
                  title={voice.voiceEnabled
                    ? (language === 'en' ? 'Disable voice replies' : 'إيقاف الردود الصوتية')
                    : (language === 'en' ? 'Enable voice replies' : 'تشغيل الردود الصوتية')
                  }
                >
                  {voice.voiceEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
                <button
                  onClick={() => setShowSessions(!showSessions)}
                  className="md:hidden p-2 rounded-xl hover:bg-white/5 active:scale-90 text-gray-400 transition-all"
                >
                  <MessageSquare size={16} />
                </button>
                <button
                  onClick={handleCreateSession}
                  className="p-2 rounded-xl hover:bg-white/5 active:scale-90 text-primary-400 transition-all"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Mobile sessions dropdown */}
            <AnimatePresence>
              {showSessions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="md:hidden mt-2 overflow-hidden"
                >
                  <ErrorBoundary compact>
                    <SessionsSidebar
                      sessions={sessions}
                      activeId={activeSessionId}
                      onSelect={id => { setActiveSessionId(id); setShowSessions(false); }}
                      onCreate={handleCreateSession}
                      onDelete={handleDeleteSession}
                    />
                  </ErrorBoundary>
                </motion.div>
              )}
            </AnimatePresence>

          </div>

          {/* Layer 2: Scrollable Messages Area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 scrollbar-hide"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="max-w-3xl mx-auto space-y-3 py-2 pb-4">
              {safeMessages.map((m, idx) => (
                <MsgBubble
                  key={m?.id || `msg-${idx}`}
                  msg={m}
                  isLast={idx === safeMessages.length - 1}
                  onSuggestion={text => handleSend(text)}
                  onRetry={handleRetry}
                  onConfirmAction={handleConfirmAction}
                />
              ))}
              {isSending && <TypingDots />}
              <div ref={messagesEndRef} className="h-4" aria-hidden="true" />
            </div>
          </div>

          {/* Layer 3: Fixed Input Area */}
          <div className="flex-shrink-0 border-t border-white/[0.06] bg-dark/95 backdrop-blur-sm
            px-3 sm:px-4 pt-2 md:pb-3"
            style={{ paddingBottom: 'max(12px, calc(80px + env(safe-area-inset-bottom, 0px)))' }}
          >

            {/* Quick Prompts */}
            {(() => {
              const prompts = language === 'en' ? SAFE_PROMPTS_EN : SAFE_PROMPTS;
              return prompts.length > 0 && (
              <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-hide pb-0.5">
                {prompts.map((p, i) => (
                  <button key={i} onClick={() => handleSend(p?.text || '')}
                    disabled={isSending}
                    className="flex-shrink-0 flex items-center gap-1 text-xs bg-white/5 hover:bg-white/10
                      text-gray-400 hover:text-white px-2.5 py-1.5 rounded-xl transition-all
                      active:scale-95 whitespace-nowrap disabled:opacity-50">
                    <span className="text-sm">{p?.icon || '💬'}</span>
                    {p?.text || ''}
                  </button>
                ))}
              </div>
            );
            })()}

            {/* Input Row */}
            <div className="flex gap-2 max-w-3xl mx-auto items-end">
              {/* Mic Button — Voice Input */}
              {voice.hasSTT && (
                <button
                  onClick={voice.toggleListening}
                  disabled={isSending}
                  className={`px-3 py-2.5 rounded-xl transition-all flex-shrink-0 ${
                    voice.isListening
                      ? 'bg-red-500 text-white animate-pulse shadow-lg shadow-red-500/30'
                      : 'bg-white/5 border border-white/10 text-gray-400 hover:text-primary-400 hover:border-primary-500/50'
                  }`}
                  title={voice.isListening
                    ? (language === 'en' ? 'Stop recording' : 'إيقاف التسجيل')
                    : (language === 'en' ? 'Speak' : 'تحدث')
                  }
                >
                  {voice.isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
              <input
                ref={inputRef}
                value={voice.isListening ? voice.transcript : input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={voice.isListening
                  ? (language === 'en' ? 'Listening...' : 'جاري الاستماع...')
                  : (language === 'en' ? 'Type your message...' : 'اكتب رسالتك...')}
                className={`flex-1 min-w-0 bg-white/5 border rounded-xl px-4 py-2.5
                  text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50
                  text-sm transition-colors ${
                    voice.isListening ? 'border-red-500/50 bg-red-500/5' : 'border-white/10'
                  }`}
                disabled={isSending || voice.isListening}
                autoComplete="off"
                dir={language === 'en' ? 'ltr' : 'rtl'}
              />
              <button
                onClick={() => handleSend()}
                disabled={isSending || !input.trim() || voice.isListening}
                className="px-3.5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl
                  transition-all disabled:opacity-40 active:scale-90 flex-shrink-0"
              >
                <Send size={16} />
              </button>
            </div>

            {/* Voice status indicator */}
            {voice.isListening && (
              <div className="flex items-center justify-center gap-2 mt-2 text-red-400 text-xs animate-pulse">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-ping" />
                {language === 'en' ? 'Listening... speak now' : 'جاري الاستماع... اتكلم دلوقتي'}
              </div>
            )}
            {voice.isSpeaking && (
              <div className="flex items-center justify-center gap-2 mt-2 text-primary-400 text-xs">
                <Volume2 size={12} className="animate-pulse" />
                {language === 'en' ? 'Speaking...' : 'جاري الرد صوتياً...'}
                <button onClick={voice.stopSpeaking} className="text-gray-500 hover:text-red-400 transition-colors">
                  <X size={12} />
                </button>
              </div>
            )}

          </div>

        </div>
      </div>
    </div>
  );
}
