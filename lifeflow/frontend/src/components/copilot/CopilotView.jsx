/**
 * CopilotView — Phase 11: AI Life Copilot
 * Conversational AI coach with daily plan generator
 */
import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { adaptiveAPI } from '../../utils/api';

export default function CopilotView() {
  const [messages, setMessages] = useState([
    { role: 'assistant', text: 'مرحباً! أنا مساعدك الذكي للحياة 🤖\nكيف يمكنني مساعدتك اليوم؟', ts: Date.now() }
  ]);
  const [input, setInput] = useState('');
  const [activeTab, setActiveTab] = useState('chat');
  const bottomRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: coachData, isLoading: coachLoading } = useQuery({
    queryKey: ['ai-coach'],
    queryFn: () => adaptiveAPI.getAICoach(),
    staleTime: 5 * 60 * 1000,
  });

  const { data: planData, isLoading: planLoading } = useQuery({
    queryKey: ['daily-plan'],
    queryFn: () => adaptiveAPI.getDailyPlan(),
    staleTime: 3 * 60 * 1000,
    enabled: activeTab === 'plan',
  });

  const chatMutation = useMutation({
    mutationFn: (msg) => adaptiveAPI.sendMessage(msg),
    onSuccess: (res) => {
      const reply = res.data?.data?.reply;
      if (reply) {
        setMessages(prev => [...prev, { role: 'assistant', text: reply, ts: Date.now() }]);
      }
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = () => {
    if (!input.trim()) return;
    const msg = input.trim();
    setMessages(prev => [...prev, { role: 'user', text: msg, ts: Date.now() }]);
    setInput('');
    chatMutation.mutate(msg);
  };

  const coach = coachData?.data?.data;
  const plan = planData?.data?.data;

  const tabs = [
    { id: 'chat', label: 'المحادثة', icon: '💬' },
    { id: 'suggestions', label: 'اقتراحات', icon: '💡' },
    { id: 'plan', label: 'خطة اليوم', icon: '📅' },
  ];

  return (
    <div className="flex flex-col h-full p-4 space-y-4" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-2xl shadow-glow">
          🤖
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">المساعد الذكي</h1>
          <p className="text-gray-400 text-sm">Phase 11 — AI Life Copilot</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all
              ${activeTab === t.id ? 'bg-primary-500 text-white shadow-glow' : 'bg-surface-700 text-gray-400 hover:text-white'}`}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {/* CHAT TAB */}
        {activeTab === 'chat' && (
          <motion.div key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col flex-1 min-h-0 gap-4">
            <div className="flex-1 overflow-y-auto space-y-3 max-h-[400px] pr-1">
              {messages.map((m, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`flex ${m.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-line
                    ${m.role === 'user'
                      ? 'bg-primary-500/20 text-primary-100 rounded-tl-none'
                      : 'bg-surface-700 text-gray-100 rounded-tr-none'}`}>
                    {m.text}
                  </div>
                </motion.div>
              ))}
              {chatMutation.isPending && (
                <div className="flex justify-end">
                  <div className="bg-surface-700 px-4 py-3 rounded-2xl rounded-tr-none">
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
            <div className="flex gap-3">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="اكتب رسالتك هنا..."
                className="flex-1 input-field text-sm" />
              <button onClick={sendMessage} disabled={!input.trim() || chatMutation.isPending}
                className="btn-primary px-5 py-2 rounded-xl disabled:opacity-50">
                إرسال
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {['ما مستوى طاقتي؟', 'كيف إنتاجيتي؟', 'هل أنا محترق؟', 'أعطني خطة اليوم'].map(q => (
                <button key={q} onClick={() => { setInput(q); setTimeout(sendMessage, 0); }}
                  className="text-xs px-3 py-1.5 bg-surface-700 text-gray-300 rounded-full hover:bg-surface-600 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* SUGGESTIONS TAB */}
        {activeTab === 'suggestions' && (
          <motion.div key="suggestions" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-3">
            {coachLoading ? (
              <div className="flex justify-center py-10"><div className="loading-spinner" /></div>
            ) : coach?.suggestions?.length > 0 ? (
              coach.suggestions.map((s, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1 }}
                  className="card p-4 flex items-start gap-3">
                  <span className="text-2xl">{s.icon || '💡'}</span>
                  <div className="flex-1">
                    <p className="text-white font-semibold text-sm">{s.title}</p>
                    <p className="text-gray-400 text-xs mt-1">{s.description || s.message}</p>
                    {s.action && <p className="text-primary-400 text-xs mt-1 font-medium">{s.action}</p>}
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    s.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                    s.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-green-500/20 text-green-400'
                  }`}>{s.priority === 'high' ? 'عاجل' : s.priority === 'medium' ? 'مهم' : 'عادي'}</span>
                </motion.div>
              ))
            ) : (
              <div className="text-center py-10 text-gray-500">
                <p className="text-4xl mb-3">🤖</p>
                <p>لا توجد اقتراحات جديدة الآن</p>
              </div>
            )}
          </motion.div>
        )}

        {/* DAILY PLAN TAB */}
        {activeTab === 'plan' && (
          <motion.div key="plan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-3">
            {planLoading ? (
              <div className="flex justify-center py-10"><div className="loading-spinner" /></div>
            ) : plan?.schedule?.length > 0 ? (
              <>
                <div className="card p-4 flex gap-4 text-sm">
                  <div className="text-center"><p className="text-gray-400 text-xs">المهام المجدولة</p><p className="text-white font-bold text-xl">{plan.stats?.scheduled_tasks ?? 0}</p></div>
                  <div className="text-center"><p className="text-gray-400 text-xs">توافق الطاقة</p><p className="text-primary-400 font-bold text-xl">{plan.stats?.energy_match_score ?? 0}%</p></div>
                  <div className="text-center"><p className="text-gray-400 text-xs">وقت العمل</p><p className="text-white font-bold text-xl">{Math.round((plan.stats?.estimated_work_minutes ?? 0) / 60)}h</p></div>
                </div>
                <div className="space-y-2">
                  {plan.schedule.map((block, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.08 }}
                      className={`card p-3 flex items-center gap-3 border-r-4 ${
                        block.type === 'deep_work' ? 'border-blue-500' :
                        block.type === 'break' ? 'border-green-500' :
                        block.type === 'review' ? 'border-purple-500' : 'border-gray-500'
                      }`}>
                      <span className="text-xl">{block.icon || '⏰'}</span>
                      <div className="flex-1">
                        <p className="text-white font-medium text-sm">{block.title}</p>
                        <p className="text-gray-400 text-xs">{block.time_label} · {block.duration} دقيقة</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-10 text-gray-500">
                <p className="text-4xl mb-3">📅</p>
                <p>أضف مهامك أولاً لتوليد خطة يومية ذكية</p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
