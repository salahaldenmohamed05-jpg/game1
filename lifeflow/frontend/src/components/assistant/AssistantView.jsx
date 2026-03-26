/**
 * AssistantView — 3-Layer Chat Architecture
 * ============================================
 * UX DECISION: Chat is fundamentally different from other views.
 * Other views (tasks, habits, dashboard) scroll their entire content
 * through MobileLayout. Chat needs:
 *   Layer 1: Fixed header (session title, session switcher)
 *   Layer 2: Scrollable messages area (only this scrolls)
 *   Layer 3: Fixed input bar (always visible, even with keyboard)
 *
 * This component uses `noPadding` on MobileLayout and manages its
 * own layout as a flex column filling the available height.
 *
 * PARENT CHAIN:
 *   Dashboard (flex h-screen) → Main area → MobileLayout (noPadding for assistant)
 *     → AssistantView (flex column, fills parent, manages own scroll)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Send, Sparkles, Bot, Calendar, Plus, Trash2,
  MessageSquare, Clock,
  RefreshCw, X, User as UserIcon,
  ChevronDown, MoreHorizontal,
} from 'lucide-react';
import { assistantAPI, chatAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const QUICK_PROMPTS = [
  { text: 'خطة اليوم', icon: '📋' },
  { text: 'مهامي المتأخرة', icon: '⏰' },
  { text: 'أفضل إجراء الآن', icon: '⚡' },
  { text: 'كيف طاقتي؟', icon: '🔋' },
  { text: 'نصيحة للتركيز', icon: '🎯' },
  { text: 'تقرير الأسبوع', icon: '📊' },
];

const WELCOME_MSG = {
  id: 'welcome', role: 'assistant',
  content: 'أهلاً! أنا مساعدك الذكي في LifeFlow 🌟\n\nأعرف مهامك، عاداتك، مزاجك وطاقتك. اسألني أي شيء!',
  suggestions: ['اعطيني خطة اليوم', 'أفضل إجراء الآن', 'كيف طاقتي؟'],
};

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

// ─── Single Message Bubble ────────────────────────────────────────────────
function MsgBubble({ msg, onSuggestion, isLast }) {
  const isUser = msg.role === 'user';
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
          : 'bg-white/[0.06] text-gray-200 rounded-tl-sm border border-white/[0.06]'
      }`}>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>

        {msg.confidence != null && (
          <div className="mt-1.5 text-[11px] text-gray-400/80 flex items-center gap-1">
            <Sparkles size={9} /> ثقة: {msg.confidence > 1 ? Math.round(msg.confidence) : Math.round(msg.confidence * 100)}%
          </div>
        )}

        {msg.suggestions?.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2.5 pt-2 border-t border-white/[0.06]">
            {msg.suggestions.map((s, i) => (
              <button key={i} onClick={() => onSuggestion(typeof s === 'string' ? s : s.text || s)}
                className="text-xs bg-primary-500/10 text-primary-400 px-2.5 py-1 rounded-lg
                  hover:bg-primary-500/20 active:scale-95 transition-all">
                {typeof s === 'string' ? s : s.text || s}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Interactive Smart Daily Timeline ─────────────────────────────────────
// Fully reactive: tasks can be completed inline, overdue items surface with
// suggested reschedule times, and AI suggestions have accept/reject actions.
function DailyTimeline() {
  const queryClient = useQueryClient();
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['smart-timeline'],
    queryFn: assistantAPI.getSmartTimeline,
    refetchInterval: 120000, // refresh every 2 min (was 10)
    retry: false,
  });
  const smart = data?.data?.data || {};
  const schedule = smart.timeline || [];
  const overdue = smart.overdue || [];
  const suggestions = smart.suggestions || [];
  const freeSlots = smart.freeSlots || [];
  const stats = smart.stats || {};

  // Local state for optimistic removal of completed items
  const [completedIds, setCompletedIds] = useState(new Set());
  const [completingId, setCompletingId] = useState(null);

  const handleCompleteTask = async (item) => {
    if (!item.source_id || completingId) return;
    setCompletingId(item.source_id);
    try {
      await assistantAPI.completeTimelineTask(item.source_id);
      // Optimistic: instantly mark as completed locally
      setCompletedIds(prev => new Set(prev).add(item.source_id));
      toast.success(`تم إكمال "${item.title}"`);
      // Refresh timeline data to get updated overdue/suggestions
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

  // Filter out optimistically completed items
  const visibleSchedule = schedule.filter(i =>
    !(i.source_id && completedIds.has(i.source_id)) && i.status !== 'completed'
  );
  const completedSchedule = schedule.filter(i =>
    i.status === 'completed' || (i.source_id && completedIds.has(i.source_id))
  );

  return (
    <div className="glass-card p-3.5 space-y-3">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <h4 className="text-[11px] font-bold text-white flex items-center gap-1.5">
          <Calendar size={12} className="text-blue-400" /> الجدول الذكي
        </h4>
        <div className="flex items-center gap-2">
          {stats.completed > 0 && (
            <span className="text-[10px] text-green-400/70">{stats.completed} مكتمل</span>
          )}
          <button onClick={() => refetch()} className="text-gray-500 hover:text-white p-0.5 active:scale-90 transition-all">
            <RefreshCw size={10} />
          </button>
        </div>
      </div>

      {/* Active Schedule Items (interactive) */}
      {visibleSchedule.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
          <AnimatePresence>
            {visibleSchedule.slice(0, 8).map((item) => (
              <motion.div
                key={item.source_id || item.title}
                layout
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                transition={{ duration: 0.25 }}
                className="flex items-center gap-2 text-xs group"
              >
                {/* Completion checkbox for tasks */}
                {item.type === 'task' && item.source_id ? (
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
                  <span className="text-sm flex-shrink-0 w-4 text-center">{icons[item.type] || '📌'}</span>
                )}
                <span className="text-blue-400 font-mono w-10 text-[11px] flex-shrink-0">{item.start_time}</span>
                <span className="truncate flex-1 text-gray-300">{item.title}</span>
                {item.priority === 'high' && <span className="text-[9px] text-red-400">!</span>}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Completed (collapsed summary) */}
      {completedSchedule.length > 0 && (
        <div className="text-[10px] text-green-400/60 flex items-center gap-1">
          <span>✅</span>
          <span>{completedSchedule.length} مهمة مكتملة</span>
        </div>
      )}

      {/* Overdue Tasks (with complete action) */}
      {overdue.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold text-red-400 flex items-center gap-1.5 mb-1.5">
            <Clock size={11} className="text-red-400" /> متأخرة ({overdue.length})
          </h4>
          <div className="space-y-1.5">
            <AnimatePresence>
              {overdue.slice(0, 4).map((t) => (
                <motion.div
                  key={t.id}
                  layout
                  exit={{ opacity: 0, height: 0 }}
                  className="flex items-center gap-2 text-xs bg-red-500/[0.05] rounded-lg px-2 py-1.5"
                >
                  <button
                    onClick={() => handleCompleteTask({ source_id: t.id, title: t.title, type: 'task' })}
                    disabled={completingId === t.id}
                    className="w-3.5 h-3.5 rounded border border-red-500/40 flex-shrink-0 hover:bg-red-500/20 active:scale-90 transition-all"
                  />
                  <span className="truncate flex-1 text-red-300/80">{t.title}</span>
                  <span className="text-[10px] text-red-400/60 flex-shrink-0">{t.days_overdue} يوم</span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* AI Suggestions (accept/reject with proposed times) */}
      {suggestions.length > 0 && (
        <div>
          <h4 className="text-[11px] font-bold text-primary-400 flex items-center gap-1.5 mb-1.5">
            <Sparkles size={11} /> اقتراحات ذكية
          </h4>
          <div className="space-y-1.5">
            {suggestions.slice(0, 3).map((s) => (
              <SmartSuggestion key={s.id} suggestion={s} />
            ))}
          </div>
        </div>
      )}

      {/* Free Slots Summary */}
      {freeSlots.length > 0 && (
        <div className="text-[10px] text-gray-500 flex items-center gap-1.5">
          <span>⏱️</span>
          <span>{freeSlots.reduce((sum, s) => sum + s.duration_min, 0)} دقيقة حرة</span>
          <span className="text-gray-600">·</span>
          <span>{freeSlots.length} فترة</span>
        </div>
      )}
    </div>
  );
}

// ─── Smart Suggestion with Accept/Reject + Proposed Time ──────────────────
function SmartSuggestion({ suggestion }) {
  const [status, setStatus] = useState(null); // null | 'accepted' | 'rejected' | 'loading'
  const queryClient = useQueryClient();

  const handleAccept = async () => {
    setStatus('loading');
    try {
      await assistantAPI.acceptSuggestion(suggestion.id, suggestion.action);
      setStatus('accepted');
      toast.success('تم تنفيذ الاقتراح');
      // Refresh all related data
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
      ✅ {suggestion.title}
    </motion.div>
  );
  if (status === 'rejected') return null;

  // Extract proposed time from action for reschedule suggestions
  const proposedTime = suggestion.action?.proposed_time;

  const typeStyles = {
    reschedule:    'border-orange-500/20 bg-orange-500/[0.04]',
    break:         'border-blue-500/20 bg-blue-500/[0.04]',
    habit_reminder:'border-green-500/20 bg-green-500/[0.04]',
    focus_block:   'border-purple-500/20 bg-purple-500/[0.04]',
  };

  const typeIcons = {
    reschedule:    '📅',
    break:         '☕',
    habit_reminder:'🔥',
    focus_block:   '🎯',
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
          <p className="text-[11px] text-gray-200 font-medium leading-snug">{suggestion.title}</p>
          <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">{suggestion.reason}</p>
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

// ─── Sessions Sidebar ─────────────────────────────────────────────────────
function SessionsSidebar({ sessions, activeId, onSelect, onCreate, onDelete }) {
  return (
    <div className="glass-card p-3 space-y-1.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-bold text-gray-400">المحادثات</span>
        <button onClick={onCreate} className="p-1 rounded-lg hover:bg-white/10 text-primary-400 active:scale-90 transition-all">
          <Plus size={14} />
        </button>
      </div>
      <div className="max-h-48 overflow-y-auto scrollbar-hide space-y-1">
        {sessions.map(s => (
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
        ))}
      </div>
      {sessions.length === 0 && (
        <p className="text-[11px] text-gray-600 text-center py-2">لا توجد محادثات</p>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────

export default function AssistantView({ onViewChange }) {
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const inputRef = useRef(null);
  const queryClient = useQueryClient();

  // Fetch sessions
  const { data: sessionsData, refetch: refetchSessions } = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: chatAPI.getSessions,
    refetchInterval: 60000,
  });
  const sessions = sessionsData?.data?.data?.sessions || sessionsData?.data?.data || [];

  // Auto-select first session
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id);
    }
  }, [sessions, activeSessionId]);

  // Load messages when session changes
  const { data: sessionMsgs } = useQuery({
    queryKey: ['chat-messages', activeSessionId],
    queryFn: () => chatAPI.getMessages(activeSessionId),
    enabled: !!activeSessionId,
  });

  useEffect(() => {
    if (sessionMsgs?.data?.data) {
      const msgs = sessionMsgs.data.data.messages || sessionMsgs.data.data || [];
      if (msgs.length > 0) {
        setMessages([WELCOME_MSG, ...msgs.map(m => ({
          id: m.id, role: m.role, content: m.content,
          confidence: m.confidence, suggestions: m.suggestions,
          timestamp: m.createdAt,
        }))]);
      } else {
        setMessages([WELCOME_MSG]);
      }
    }
  }, [sessionMsgs]);

  // Smart auto-scroll: only scroll if user is near bottom
  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
    if (isNearBottom || behavior === 'auto') {
      messagesEndRef.current?.scrollIntoView({ behavior });
    }
  }, []);

  useEffect(() => {
    scrollToBottom('auto');
  }, [messages, isSending, scrollToBottom]);

  // Create session
  const handleCreateSession = async () => {
    try {
      const res = await chatAPI.createSession();
      const s = res.data?.data;
      if (s?.id) {
        setActiveSessionId(s.id);
        setMessages([WELCOME_MSG]);
        refetchSessions();
        toast.success('محادثة جديدة');
      }
    } catch { toast.error('فشل في إنشاء المحادثة'); }
  };

  // Delete session
  const handleDeleteSession = async (id) => {
    try {
      await chatAPI.deleteSession(id);
      if (activeSessionId === id) {
        setActiveSessionId(null);
        setMessages([WELCOME_MSG]);
      }
      refetchSessions();
    } catch { toast.error('فشل في الحذف'); }
  };

  // Send message
  const handleSend = async (text = null) => {
    const msg = (text || input).trim();
    if (!msg || isSending) return;
    setInput('');

    // Ensure we have a session
    let sid = activeSessionId;
    if (!sid) {
      try {
        const res = await chatAPI.createSession();
        sid = res.data?.data?.id;
        setActiveSessionId(sid);
        refetchSessions();
      } catch {
        toast.error('فشل في إنشاء محادثة');
        return;
      }
    }

    // Add user message
    const userMsg = { id: 'u-' + Date.now(), role: 'user', content: msg, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setIsSending(true);

    // Force scroll to bottom when user sends a message
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);

    try {
      const res = await chatAPI.sendMessage(sid, msg);
      const data = res.data?.data || res.data;
      const reply = data?.reply || data?.message || data?.content || data?.response || 'تم استلام رسالتك';
      const aiMsg = {
        id: 'a-' + Date.now(),
        role: 'assistant',
        content: typeof reply === 'string' ? reply : reply?.content || JSON.stringify(reply),
        confidence: data?.confidence,
        suggestions: data?.suggestions || [],
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMsg]);
      refetchSessions();
      queryClient.invalidateQueries({ queryKey: ['chat-messages', sid] });
    } catch (err) {
      setMessages(prev => [...prev, {
        id: 'e-' + Date.now(), role: 'assistant',
        content: 'عذراً، حدث خطأ. حاول مرة أخرى.',
      }]);
    } finally {
      setIsSending(false);
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

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER: 3-layer architecture
  // The component fills the MobileLayout height via flex-1 + flex column.
  // MobileLayout passes noPadding=true for this view, so we control all spacing.
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full min-h-0" dir="rtl">
      {/* ═══ Desktop: sidebar + chat side by side ═══ */}
      <div className="flex flex-1 min-h-0 gap-0 md:gap-4">

        {/* Desktop Sidebar (md+) */}
        <div className="hidden md:flex md:flex-col w-48 lg:w-56 flex-shrink-0 gap-3 py-3 pr-3 lg:pr-4 overflow-y-auto scrollbar-hide">
          <SessionsSidebar
            sessions={sessions}
            activeId={activeSessionId}
            onSelect={id => setActiveSessionId(id)}
            onCreate={handleCreateSession}
            onDelete={handleDeleteSession}
          />
          <DailyTimeline />
        </div>

        {/* ═══ Chat Column: 3 layers ═══ */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">

          {/* ─── Layer 1: Chat Header (fixed, not scrolling) ─── */}
          <div className="flex-shrink-0 px-3 sm:px-4 pt-3 pb-2">
            <div className="flex items-center justify-between">
              <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                <Sparkles size={16} className="text-primary-400" />
                المساعد الذكي
              </h2>
              <div className="flex items-center gap-1.5">
                {/* Mobile: toggle sessions dropdown */}
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
                  <SessionsSidebar
                    sessions={sessions}
                    activeId={activeSessionId}
                    onSelect={id => { setActiveSessionId(id); setShowSessions(false); }}
                    onCreate={handleCreateSession}
                    onDelete={handleDeleteSession}
                  />
                </motion.div>
              )}
            </AnimatePresence>

          </div>

          {/* ─── Layer 2: Scrollable Messages Area ─── */}
          <div
            ref={messagesContainerRef}
            className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden px-3 sm:px-4 scrollbar-hide"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="max-w-3xl mx-auto space-y-3 py-2">
              {messages.map((m, idx) => (
                <MsgBubble
                  key={m.id}
                  msg={m}
                  isLast={idx === messages.length - 1}
                  onSuggestion={text => handleSend(text)}
                />
              ))}
              {isSending && <TypingDots />}
              <div ref={messagesEndRef} className="h-1" />
            </div>
          </div>

          {/* ─── Layer 3: Fixed Input Area (always visible) ───
              pb-[88px] on mobile accounts for the bottom nav height (~72px) + breathing room.
              On desktop (md+) the bottom nav is hidden so we use smaller padding. */}
          <div className="flex-shrink-0 border-t border-white/[0.06] bg-dark/95 backdrop-blur-sm
            px-3 sm:px-4 pt-2 pb-[88px] md:pb-3">

            {/* Quick Prompts */}
            <div className="flex gap-1.5 mb-2 overflow-x-auto scrollbar-hide pb-0.5">
              {QUICK_PROMPTS.map((p, i) => (
                <button key={i} onClick={() => handleSend(p.text)}
                  className="flex-shrink-0 flex items-center gap-1 text-xs bg-white/5 hover:bg-white/10
                    text-gray-400 hover:text-white px-2.5 py-1.5 rounded-xl transition-all
                    active:scale-95 whitespace-nowrap">
                  <span className="text-sm">{p.icon}</span>
                  {p.text}
                </button>
              ))}
            </div>

            {/* Input Row */}
            <div className="flex gap-2 max-w-3xl mx-auto items-end">
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="اكتب رسالتك..."
                className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5
                  text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50
                  text-sm transition-colors"
                disabled={isSending}
                autoComplete="off"
              />
              <button
                onClick={() => handleSend()}
                disabled={isSending || !input.trim()}
                className="px-3.5 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl
                  transition-all disabled:opacity-40 active:scale-90 flex-shrink-0"
              >
                <Send size={16} />
              </button>
            </div>

          </div>

        </div>
      </div>
    </div>
  );
}
