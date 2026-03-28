/**
 * QuickCommandInput — Persistent Assistant Trigger
 * ===================================================
 * Phase D: Always-visible floating command input.
 * Appears on every screen (except AssistantView itself).
 * Sends command to AI and shows inline result (no navigation).
 * 
 * UX: Answers "I need to tell the AI something" from ANY screen.
 */

import { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Send, X, RefreshCw, Check } from 'lucide-react';
import { assistantAPI } from '../../utils/api';
import { QUICK_HINTS } from '../../constants/smartActions';
import toast from 'react-hot-toast';

const HIDDEN_VIEWS = ['assistant', 'ai_chat', 'copilot', 'adaptive', 'optimizer'];

export default function QuickCommandInput({ onViewChange, activeView }) {
  // ALL hooks MUST be called before any early return — Rules of Hooks
  const [expanded, setExpanded] = useState(false);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [aiResponse, setAiResponse] = useState(null);
  const inputRef = useRef(null);

  // Safe hint index — computed once per mount, no Math.random() in useState
  const hintIdx = useMemo(
    () => (QUICK_HINTS.length > 0 ? Math.floor(Math.random() * QUICK_HINTS.length) : 0),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleOpen = () => {
    setExpanded(true);
    setAiResponse(null);
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const handleClose = () => {
    setExpanded(false);
    setInput('');
    setAiResponse(null);
  };

  const handleSend = async () => {
    const msg = input.trim();
    if (!msg || isSending) return;
    setIsSending(true);
    setAiResponse(null);

    try {
      // Send directly to assistant command endpoint and show result inline
      const res = await assistantAPI.sendCommand(msg);
      const data = res?.data?.data || res?.data || {};
      const reply = data.reply || data.content || data.message || '';

      setAiResponse({
        reply: reply || 'done',
        suggestions: data.suggestions || [],
        action_taken: data.action_taken,
      });
      setInput('');
    } catch (err) {
      const errMsg = err?.response?.data?.message || err?.message || 'فشل الاتصال بالمساعد';
      toast.error(errMsg);
      console.error('[QuickCommand] error:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === 'Escape') handleClose();
  };

  // Early return AFTER all hooks have been called
  if (HIDDEN_VIEWS.includes(activeView)) {
    return null;
  }

  return (
    <>
      {/* Floating Assistant Trigger Button — Phase H: positioned above bottom nav */}
      <AnimatePresence>
        {!expanded && (
          <motion.button
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            whileTap={{ scale: 0.9 }}
            onClick={handleOpen}
            className="fixed start-4 z-50 
              w-12 h-12 rounded-full bg-gradient-to-br from-primary-500 to-purple-600
              shadow-lg shadow-primary-500/30 flex items-center justify-center
              hover:shadow-primary-500/50 transition-shadow"
            style={{ bottom: 'max(96px, calc(80px + env(safe-area-inset-bottom, 0px) + 16px))' }}
            aria-label="open assistant"
          >
            <Sparkles size={20} className="text-white" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Expanded Input Bar + Inline Response */}
      <AnimatePresence>
        {expanded && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/40 z-50"
              onClick={handleClose}
            />

            {/* Input Bar — Phase H: positioned above bottom nav with safe area */}
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 50, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="fixed start-4 end-4 z-50 max-w-lg mx-auto"
              style={{ bottom: 'max(96px, calc(80px + env(safe-area-inset-bottom, 0px) + 16px))' }}
              dir="rtl"
            >
              <div className="glass-card p-3 shadow-2xl border border-primary-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-primary-400" />
                  <span className="text-xs font-bold text-primary-400">{'\u0627\u0644\u0645\u0633\u0627\u0639\u062f \u0627\u0644\u0630\u0643\u064a'}</span>
                  <button onClick={handleClose} className="ms-auto p-1 text-gray-500 hover:text-white transition-colors" aria-label="close">
                    <X size={14} />
                  </button>
                </div>

                {/* Inline AI Response (shows result without navigating) */}
                <AnimatePresence>
                  {aiResponse && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden mb-2"
                    >
                      <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                        <div className="whitespace-pre-wrap text-sm text-gray-200 leading-relaxed">
                          {aiResponse.reply}
                        </div>
                        {aiResponse.action_taken && (
                          <div className="mt-1.5 text-xs text-green-400/70 flex items-center gap-1">
                            <Check size={10} /> {'\u062a\u0645 \u062a\u0646\u0641\u064a\u0630'}: {aiResponse.action_taken}
                          </div>
                        )}
                        {aiResponse.suggestions?.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap mt-2 pt-2 border-t border-white/5">
                            {aiResponse.suggestions.map((s, i) => (
                              <span key={i} className="text-xs bg-primary-500/10 text-primary-400 px-2 py-0.5 rounded-lg">
                                {typeof s === 'string' ? s : s.text || s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex gap-2 items-end">
                  <input
                    ref={inputRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={QUICK_HINTS[hintIdx]}
                    className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-xl px-3 py-2.5
                      text-white placeholder-gray-500 focus:outline-none focus:border-primary-500/50
                      text-sm transition-colors"
                    disabled={isSending}
                    autoComplete="off"
                    aria-label="assistant input"
                  />
                  <button
                    onClick={handleSend}
                    disabled={isSending || !input.trim()}
                    className="px-3 py-2.5 bg-primary-500 hover:bg-primary-600 text-white rounded-xl
                      transition-all disabled:opacity-40 active:scale-90 flex-shrink-0"
                    aria-label="send"
                  >
                    {isSending ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>

                {/* Link to full conversation */}
                <button
                  onClick={() => { onViewChange?.('assistant'); handleClose(); }}
                  className="mt-2 text-[10px] text-gray-500 hover:text-primary-400 transition-colors"
                >
                  {'\u0623\u0648 \u0627\u0641\u062a\u062d \u0627\u0644\u0645\u062d\u0627\u062f\u062b\u0629 \u0627\u0644\u0643\u0627\u0645\u0644\u0629'} &larr;
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
