/**
 * AssistantView — المساعد الذكي مع ذاكرة محادثات
 * =================================================
 *
 * LAYOUT ARCHITECTURE (DO NOT CHANGE WITHOUT READING):
 *
 * The parent chain is:
 *   Dashboard (flex h-screen overflow-hidden)
 *     → Main area (flex-1 flex flex-col min-h-0)
 *       → MobileLayout (flex-1 overflow-y-auto) ← THIS is the scroll container
 *         → motion.div (flex flex-col min-h-full pb-32 px-3)
 *           → AssistantView (THIS component)
 *
 * MobileLayout OWNS the scroll. AssistantView must NOT:
 *   - Create its own scroll container (no overflow-y-auto on messages)
 *   - Use flex-1 / min-h-0 (these fight the scroll parent)
 *   - Use overflow-hidden (this clips content)
 *
 * AssistantView MUST:
 *   - Be a simple block container with w-full
 *   - Let all content flow naturally (MobileLayout scrolls it)
 *   - Use max-w for desktop centering
 *   - Keep input sticky at bottom via CSS sticky (not flex)
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Send, Sparkles, Bot, Calendar, Plus, Trash2,
  MessageSquare, Clock, Zap, ArrowRight,
  RefreshCw, ChevronRight, X, User as UserIcon,
} from 'lucide-react';
import { assistantAPI, chatAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const QUICK_PROMPTS = [
  'اعطيني خطة اليوم',
  'ما مهامي المتأخرة؟',
  'أفضل إجراء الآن',
  'كيف طاقتي؟',
  'نصيحة للتركيز',
  'كيف حالي هذا الأسبوع؟',
];

const WELCOME_MSG = {
  id: 'welcome', role: 'assistant',
  content: 'أهلاً! أنا مساعدك الذكي في LifeFlow 🌟\n\nأعرف مهامك، عاداتك، مزاجك وطاقتك.\n\n• 📋 "اعطيني خطة اليوم"\n• ⚡ "أفضل إجراء الآن"\n• 📊 "كيف حالي هذا الأسبوع؟"\n\nكل ردودي مبنية على بياناتك الحقيقية.',
  suggestions: ['اعطيني خطة اليوم', 'أفضل إجراء الآن', 'كيف طاقتي؟'],
};

// ─── Typing indicator ────────────────────────────────────────────────────────
function TypingDots() {
  return (
    <div className="flex gap-2 items-end">
      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex-shrink-0 flex items-center justify-center">
        <Bot size={13} className="text-white" />
      </div>
      <div className="bg-white/5 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <motion.div key={i} animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
              className="w-2 h-2 bg-primary-400 rounded-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Single Message Bubble ──────────────────────────────────────────────────
function MsgBubble({ msg, onSuggestion }) {
  const isUser = msg.role === 'user';
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className={`flex gap-2 items-end ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center ${
        isUser ? 'bg-primary-500' : 'bg-gradient-to-br from-purple-500 to-blue-600'
      }`}>
        {isUser ? <UserIcon size={13} className="text-white" /> : <Bot size={13} className="text-white" />}
      </div>
      {/* Bubble — min-w-0 prevents flex overflow, max-w keeps it from filling full row */}
      <div className={`min-w-0 max-w-[85%] rounded-2xl px-3 sm:px-4 py-2.5 sm:py-3 break-words ${
        isUser ? 'bg-primary-500 text-white rounded-tr-sm' : 'bg-white/5 text-gray-200 rounded-tl-sm border border-white/5'
      }`}>
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
        {msg.confidence != null && (
          <div className="mt-1.5 text-xs text-gray-400 flex items-center gap-1">
            <Sparkles size={9} /> ثقة: {msg.confidence > 1 ? Math.round(msg.confidence) : Math.round(msg.confidence * 100)}%
          </div>
        )}
        {msg.suggestions && msg.suggestions.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {msg.suggestions.map((s, i) => (
              <button key={i} onClick={() => onSuggestion(typeof s === 'string' ? s : s.text || s)}
                className="text-xs bg-primary-500/10 text-primary-400 px-2.5 py-1 rounded-lg hover:bg-primary-500/20 transition-colors">
                {typeof s === 'string' ? s : s.text || s}
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Next Best Action Card ──────────────────────────────────────────────────
function NextActionCard() {
  const { data, refetch, isLoading } = useQuery({
    queryKey: ['next-action-assist'],
    queryFn: assistantAPI.getNextAction,
    refetchInterval: 180000,
    retry: false,
  });
  const action = data?.data?.data;
  if (!action || isLoading) return null;

  const urgencyColors = { critical: 'border-red-500/40 bg-red-500/8', high: 'border-orange-500/40 bg-orange-500/8', medium: 'border-blue-500/40 bg-blue-500/8', low: 'border-green-500/40 bg-green-500/8' };
  const color = urgencyColors[action.urgency] || urgencyColors.medium;

  return (
    <div className={`glass-card p-4 border ${color}`}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-primary-400" />
          <span className="text-xs font-bold text-primary-400">الإجراء التالي</span>
        </div>
        <button onClick={refetch} className="text-gray-500 hover:text-white p-1"><RefreshCw size={11} /></button>
      </div>
      <p className="text-sm font-bold text-white">{action.title}</p>
      <p className="text-xs text-gray-400 mt-1">{action.message}</p>
      {action.confidence != null && (
        <span className="text-xs text-gray-500 mt-1 inline-block">ثقة: {action.confidence}%</span>
      )}
    </div>
  );
}

// ─── Daily Timeline Mini ────────────────────────────────────────────────────
function DailyTimeline() {
  const { data, isLoading } = useQuery({
    queryKey: ['timeline-assist'],
    queryFn: assistantAPI.getSmartDailyPlan,
    refetchInterval: 600000,
    retry: false,
  });
  const plan = data?.data?.data || {};
  const schedule = plan.schedule || plan.timeline || [];
  if (isLoading || schedule.length === 0) return null;

  const icons = { task: '📋', habit: '🔥', prayer: '🕌', break: '☕', event: '📅' };
  return (
    <div className="glass-card p-4">
      <h4 className="text-xs font-bold text-white flex items-center gap-2 mb-2">
        <Calendar size={12} className="text-blue-400" /> جدول اليوم
      </h4>
      <div className="space-y-1.5 max-h-40 overflow-y-auto scrollbar-hide">
        {schedule.slice(0, 6).map((item, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span>{icons[item.type] || '📌'}</span>
            <span className="text-blue-400 font-mono w-12">{item.start_time}</span>
            <span className="text-gray-300 truncate flex-1">{item.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sessions Sidebar ───────────────────────────────────────────────────────
function SessionsSidebar({ sessions, activeId, onSelect, onCreate, onDelete }) {
  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-gray-400">المحادثات</span>
        <button onClick={onCreate} className="p-1.5 rounded-lg hover:bg-white/10 text-primary-400">
          <Plus size={14} />
        </button>
      </div>
      {sessions.map(s => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`w-full flex items-center gap-2 p-2.5 rounded-xl text-right text-sm transition-all ${
            activeId === s.id ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30' : 'hover:bg-white/5 text-gray-400'
          }`}
        >
          <MessageSquare size={13} className="flex-shrink-0" />
          <span className="flex-1 truncate">{s.title || 'محادثة جديدة'}</span>
          <span className="text-xs text-gray-600">{s.message_count || 0}</span>
          <button onClick={(e) => { e.stopPropagation(); onDelete(s.id); }}
            className="p-0.5 hover:text-red-400 text-gray-600"><Trash2 size={10} /></button>
        </button>
      ))}
      {sessions.length === 0 && (
        <p className="text-xs text-gray-600 text-center py-3">لا توجد محادثات</p>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function AssistantView() {
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([WELCOME_MSG]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  // Fetch sessions
  const { data: sessionsData, refetch: refetchSessions } = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: chatAPI.getSessions,
    refetchInterval: 60000,
  });
  const sessions = sessionsData?.data?.data?.sessions || sessionsData?.data?.data || [];

  // Auto-create session if none exists
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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isSending]);

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
    }
  };

  return (
    /**
     * ROOT container:
     *   - w-full: fill MobileLayout width (MobileLayout adds px-3 padding)
     *   - No flex-1, no min-h-0, no overflow — MobileLayout handles scroll
     *   - On desktop: max-w-3xl mx-auto centers the chat
     */
    <div className="w-full lg:max-w-3xl lg:mx-auto" dir="rtl">

      {/* Desktop: sidebar + chat side by side using grid */}
      <div className="md:flex md:gap-4">

        {/* Sessions Sidebar (desktop — md+) */}
        <div className="hidden md:block w-48 lg:w-56 flex-shrink-0 space-y-3">
          <SessionsSidebar
            sessions={sessions}
            activeId={activeSessionId}
            onSelect={id => setActiveSessionId(id)}
            onCreate={handleCreateSession}
            onDelete={handleDeleteSession}
          />
          <NextActionCard />
          <DailyTimeline />
        </div>

        {/* Chat Area — takes remaining width, content flows naturally */}
        <div className="flex-1 min-w-0">

          {/* Header */}
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
              <Sparkles size={18} className="text-primary-400" />
              المساعد الذكي
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowSessions(!showSessions)} className="md:hidden p-2 rounded-xl hover:bg-white/5 text-gray-400">
                <MessageSquare size={18} />
              </button>
              <button onClick={handleCreateSession} className="p-2 rounded-xl hover:bg-white/5 text-primary-400">
                <Plus size={18} />
              </button>
            </div>
          </div>

          {/* Mobile sessions dropdown */}
          <AnimatePresence>
            {showSessions && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                className="md:hidden mb-3 overflow-hidden">
                <SessionsSidebar sessions={sessions} activeId={activeSessionId}
                  onSelect={id => { setActiveSessionId(id); setShowSessions(false); }}
                  onCreate={handleCreateSession} onDelete={handleDeleteSession} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Mobile Next Action */}
          <div className="md:hidden mb-3">
            <NextActionCard />
          </div>

          {/* Messages area — simple block, no internal scroll, parent scrolls */}
          <div className="rounded-2xl glass-card p-3 sm:p-4 space-y-3 sm:space-y-4">
            {messages.map(m => (
              <MsgBubble key={m.id} msg={m} onSuggestion={text => handleSend(text)} />
            ))}
            {isSending && <TypingDots />}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick prompts */}
          <div className="flex gap-1.5 mt-3 overflow-x-auto scrollbar-hide pb-1">
            {QUICK_PROMPTS.map((p, i) => (
              <button key={i} onClick={() => handleSend(p)}
                className="flex-shrink-0 text-xs bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white px-3 py-1.5 rounded-xl transition-colors whitespace-nowrap">
                {p}
              </button>
            ))}
          </div>

          {/* Input — sticky at bottom so it stays visible while scrolling */}
          <div className="sticky bottom-0 pt-2 pb-1 -mx-3 px-3 sm:-mx-4 sm:px-4 bg-gradient-to-t from-dark via-dark/95 to-transparent">
            <div className="flex gap-2">
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="اكتب رسالتك..."
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50 text-base"
                disabled={isSending}
              />
              <button
                onClick={() => handleSend()}
                disabled={isSending || !input.trim()}
                className="px-4 py-3 bg-primary-500 hover:bg-primary-600 text-white rounded-xl transition-all disabled:opacity-50"
              >
                <Send size={18} />
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
