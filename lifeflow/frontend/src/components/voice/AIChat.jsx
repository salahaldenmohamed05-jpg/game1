/**
 * AI Chat - Voice & Text Interaction
 * =====================================
 * المساعد الذكي - محادثة نصية وصوتية
 */

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, MicOff, Volume2, Loader, Brain, Sparkles } from 'lucide-react';
import { aiAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const QUICK_PROMPTS = [
  'لخّص لي يومي',
  'ما هي أولوياتي اليوم؟',
  'قدّم لي نصائح لزيادة إنتاجيتي',
  'حلّل مزاجي الأسبوع الماضي',
  'أقترح روتيناً صباحياً جيداً',
  'ساعدني في تقسيم مهمة كبيرة',
];

export default function AIChat() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: 'assistant',
      content: 'مرحباً! أنا LifeFlow، مساعدك الشخصي الذكي 🌟\n\nيمكنني مساعدتك في:\n• تلخيص يومك ومهامك\n• تحليل عاداتك ومزاجك\n• تقديم نصائح مخصصة\n• الإجابة على أسئلتك\n\nكيف يمكنني مساعدتك اليوم؟',
      timestamp: new Date(),
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async (text) => {
    const msg = text || input;
    if (!msg.trim()) return;

    const userMessage = { id: Date.now(), role: 'user', content: msg, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await aiAPI.chat(msg);
      // Backend returns { success, data: { reply, ... } } — Axios wraps in response.data
      const payload = response?.data?.data || response?.data;
      const aiMessage = {
        id: Date.now() + 1,
        role: 'assistant',
        content: payload?.reply || payload?.response || payload?.message || 'عذراً، لم أستطع معالجة طلبك. حاول مجدداً.',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, aiMessage]);

      // Auto-speak response (optional)
      // if (isSpeaking) speakText(aiMessage.content);
    } catch (error) {
      const errorMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        content: 'عذراً، حدث خطأ في الاتصال. تأكد من تكوين مفتاح OpenAI API.',
        timestamp: new Date(),
        isError: true,
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const startVoiceRecording = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('متصفحك لا يدعم التعرف على الصوت. استخدم Chrome');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-EG';
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsRecording(true);
    recognition.onend = () => setIsRecording(false);
    recognition.onerror = () => {
      setIsRecording(false);
      toast.error('فشل التعرف على الصوت');
    };
    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      toast.success(`تم تحويل الصوت: "${transcript}"`);
    };

    recognition.start();
  };

  const speakText = (text) => {
    if (!('speechSynthesis' in window)) return;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ar-SA';
    utterance.rate = 0.9;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-12rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-2xl font-black text-white flex items-center gap-2">
            <Sparkles size={24} className="text-primary-400" />
            المساعد الذكي
          </h2>
          <p className="text-sm text-gray-400">LifeFlow AI • يتحدث العربية</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsSpeaking(!isSpeaking)}
            className={`p-2 rounded-xl transition-all ${isSpeaking ? 'bg-primary-500/20 text-primary-400' : 'bg-white/5 text-gray-400'}`}
            title="تشغيل/إيقاف الصوت"
          >
            <Volume2 size={18} />
          </button>
        </div>
      </div>

      {/* Quick Prompts */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-3">
        {QUICK_PROMPTS.map(prompt => (
          <button key={prompt} onClick={() => sendMessage(prompt)}
            className="px-3 py-1.5 bg-white/5 hover:bg-primary-500/20 text-gray-400 hover:text-primary-400 rounded-full text-xs whitespace-nowrap transition-all border border-transparent hover:border-primary-500/30">
            {prompt}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        <AnimatePresence>
          {messages.map(msg => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
            >
              <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-2' : 'order-1'}`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-1 justify-end">
                    <span className="text-xs text-gray-500">LifeFlow AI</span>
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-primary-500 to-secondary-500 flex items-center justify-center text-xs">✨</div>
                  </div>
                )}

                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-primary-500/20 text-white border border-primary-500/20'
                    : msg.isError
                      ? 'bg-red-500/10 text-red-300 border border-red-500/20'
                      : 'bg-white/5 text-gray-200 border border-white/5'
                }`}>
                  <p className="text-sm leading-relaxed whitespace-pre-line">{msg.content}</p>
                  <p className="text-xs text-gray-600 mt-1">
                    {msg.timestamp.toLocaleTimeString('ar', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>

                {msg.role === 'assistant' && !msg.isError && (
                  <button onClick={() => speakText(msg.content)}
                    className="mt-1 text-xs text-gray-600 hover:text-primary-400 transition-colors flex items-center gap-1 mr-2">
                    <Volume2 size={10} /> استمع
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-end">
            <div className="bg-white/5 rounded-2xl px-4 py-3 flex items-center gap-2">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <motion.div key={i} className="w-2 h-2 bg-primary-400 rounded-full"
                    animate={{ y: [0, -8, 0] }} transition={{ duration: 0.6, delay: i * 0.1, repeat: Infinity }} />
                ))}
              </div>
              <span className="text-xs text-gray-400">LifeFlow يفكر...</span>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="glass-card p-3 flex items-center gap-2">
        <button
          onClick={startVoiceRecording}
          className={`p-2.5 rounded-xl transition-all flex-shrink-0 ${
            isRecording
              ? 'bg-red-500 text-white animate-pulse'
              : 'bg-white/5 text-gray-400 hover:text-primary-400 hover:bg-primary-500/10'
          }`}
          title={isRecording ? 'جارٍ التسجيل...' : 'تحدث'}
        >
          {isRecording ? <MicOff size={18} /> : <Mic size={18} />}
        </button>

        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          className="flex-1 bg-transparent text-white placeholder-gray-500 outline-none text-sm"
          placeholder="اكتب رسالتك أو اضغط على الميكروفون..."
          dir="rtl"
        />

        <button
          onClick={() => sendMessage()}
          disabled={!input.trim() || isLoading}
          className="p-2.5 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white rounded-xl transition-all flex-shrink-0"
        >
          {isLoading ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
    </div>
  );
}
