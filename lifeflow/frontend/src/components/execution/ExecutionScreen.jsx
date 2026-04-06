/**
 * ExecutionScreen v5.0 — Full Adaptive VA with Presence Layer
 * ═════════════════════════════════════════════════════════════
 * The app "remembers me and continues"
 *
 * Phases:
 *   1. ACTION  — VA Greeting + Resume Prompt + Daily Narrative + Next Action
 *   2. FOCUS   — Full-screen timer with exit prompt (enforcement)
 *   3. DONE    — Celebration + next action preview
 *   4. FOLLOWUP — Micro-adaptation UI (skip/delay/abandon/idle)
 *
 * VA Presence (v5 additions):
 *   - Session memory: last_action, last_status, last_failure_reason, last_active
 *   - Resume prompt: "You started [task]... continue?" with resume/restart
 *   - Time-of-day awareness: morning/afternoon/evening contextual greeting
 *   - Contextual greeting based on recent activity or idle time
 *   - One-line daily narrative ("today's plan" summary)
 *   - Multi-step escalation (gentle → direct → offer easier)
 *   - Idle detection with escalation levels
 *
 * Rules:
 *   - No random features; every element serves execution/follow-up/presence
 *   - UI stays ultra-simple; internal state is invisible
 *   - Only new suggestions and tone changes shown
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Play, Pause, Check, X, Clock, Timer, Flame, Award,
  SkipForward, Target, RotateCcw, Zap, AlertTriangle,
  RefreshCw, ChevronDown, Sun, Moon, Sunrise,
} from 'lucide-react';
import { engineAPI, habitAPI, vaAPI } from '../../utils/api';
import useSyncStore from '../../store/syncStore';
import toast from 'react-hot-toast';
import { recordAction as cognitiveRecord, reactToCompletion, reactToSkip } from '../../engine/cognitiveEngine';
import { useBrainStore } from '../../store/brainStore';

// ─── Skip reasons ─────────────────────────────────────────────────────────────
const SKIP_REASONS = [
  { type: 'overwhelmed', label: 'مرهق',           emoji: '😰' },
  { type: 'busy',        label: 'مشغول',          emoji: '⏰' },
  { type: 'wrong_task',  label: 'مهمة خاطئة',     emoji: '🔄' },
  { type: 'low_energy',  label: 'طاقتي منخفضة',   emoji: '😴' },
  { type: 'lazy',        label: 'مش حاسس',        emoji: '🛋️' },
];

// ─── Idle detection constants ─────────────────────────────────────────────────
const IDLE_NUDGE_THRESHOLD_MS = 3 * 60 * 1000; // 3 minutes → trigger nudge

// ─── Time-of-day icon ─────────────────────────────────────────────────────────
function TimeIcon({ timeOfDay }) {
  if (timeOfDay === 'morning') return <Sunrise size={16} className="text-amber-400" />;
  if (timeOfDay === 'afternoon') return <Sun size={16} className="text-yellow-400" />;
  return <Moon size={16} className="text-indigo-400" />;
}

// ─── Live Timer (full-screen focus) ──────────────────────────────────────────
function FocusTimer({ startedAt, activeSeconds, isPaused, estimatedMinutes }) {
  const [display, setDisplay] = useState('00:00');
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (isPaused) {
      const m = Math.floor(activeSeconds / 60);
      const s = activeSeconds % 60;
      setDisplay(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      if (estimatedMinutes) setPct(Math.min(100, Math.round((activeSeconds / (estimatedMinutes * 60)) * 100)));
      return;
    }

    const startBase = activeSeconds || 0;
    const resumeTime = Date.now();

    const tick = () => {
      const extra = Math.round((Date.now() - resumeTime) / 1000);
      const total = startBase + extra;
      const m = Math.floor(total / 60);
      const s = total % 60;
      setDisplay(`${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`);
      if (estimatedMinutes) setPct(Math.min(100, Math.round((total / (estimatedMinutes * 60)) * 100)));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [startedAt, activeSeconds, isPaused, estimatedMinutes]);

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: 200, height: 200 }}>
        <svg width={200} height={200} className="transform -rotate-90">
          <circle cx={100} cy={100} r={90} stroke="rgba(255,255,255,0.06)" strokeWidth={8} fill="none" />
          <motion.circle
            cx={100} cy={100} r={90}
            stroke={isPaused ? '#F59E0B' : '#6C63FF'}
            strokeWidth={8} fill="none" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 90}
            animate={{ strokeDashoffset: 2 * Math.PI * 90 * (1 - pct / 100) }}
            transition={{ duration: 0.5 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-5xl font-black text-white tabular-nums">{display}</span>
          {estimatedMinutes && (
            <span className="text-xs text-gray-500 mt-1">من {estimatedMinutes} دقيقة</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════════
// MAIN: ADAPTIVE ACTION MACHINE v5 — with VA Presence
// ═════════════════════════════════════════════════════════════════════════════════
export default function ExecutionScreen({ onViewChange }) {
  const queryClient = useQueryClient();
  const { invalidateAll, recordAction } = useSyncStore();
  const { brainState, forceRecompute } = useBrainStore();

  // ── State ──────────────────────────────────────────────────────────────────
  const [phase, setPhase] = useState('action');       // 'action' | 'focus' | 'done' | 'followup'
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [showSkipReasons, setShowSkipReasons] = useState(false);
  const [completionData, setCompletionData] = useState(null);
  // Follow-up state
  const [followupData, setFollowupData] = useState(null);
  const [idleNudge, setIdleNudge] = useState(null);
  const pulseRef = useRef(null);
  const idleTimerRef = useRef(null);
  const lastInteractionRef = useRef(Date.now());

  // ── Fetch today's action ──────────────────────────────────────────────────
  const { data: rawData, isLoading, refetch } = useQuery({
    queryKey: ['engine-today'],
    queryFn: engineAPI.getToday,
    staleTime: 30 * 1000,
    refetchInterval: phase === 'focus' ? false : 2 * 60 * 1000,
    retry: 2,
  });

  // ── Fetch VA Presence ─────────────────────────────────────────────────────
  const { data: presenceRaw } = useQuery({
    queryKey: ['va-presence'],
    queryFn: vaAPI.getPresence,
    staleTime: 60 * 1000,
    refetchInterval: phase === 'focus' ? false : 3 * 60 * 1000,
    retry: 1,
  });

  const presenceData = presenceRaw?.data?.data || {};
  const {
    greeting,
    time_of_day: timeOfDay,
    daily_narrative: dailyNarrative,
    resume_prompt: resumePrompt,
    progress: vaProgress,
  } = presenceData;

  const engineData = rawData?.data?.data || {};
  const {
    next_action: action, reasoning = [], confidence = 0,
    mode = 'focus', energy = {}, active_session,
    goal_context: goalCtx,
  } = engineData;

  // ── Detect active session (persist across refresh) ────────────────────────
  useEffect(() => {
    if (active_session && (active_session.state === 'active' || active_session.state === 'paused')) {
      setPhase('focus');
    }
  }, [active_session?.id]);

  // ── IDLE DETECTION: Nudge after 3 min inactivity on action screen ─────────
  useEffect(() => {
    if (phase !== 'action' || !action?.id) {
      if (idleTimerRef.current) clearInterval(idleTimerRef.current);
      return;
    }

    lastInteractionRef.current = Date.now();

    const checkIdle = () => {
      const idleMs = Date.now() - lastInteractionRef.current;
      if (idleMs >= IDLE_NUDGE_THRESHOLD_MS && !idleNudge) {
        engineAPI.nudge({
          current_action_id: action?.id,
          current_action_title: action?.title,
          idle_seconds: Math.round(idleMs / 1000),
        }).then(res => {
          const data = res?.data?.data;
          if (data?.nudge && data?.can_nudge) {
            setIdleNudge(data.nudge);
          }
        }).catch(() => {});
      }
    };

    idleTimerRef.current = setInterval(checkIdle, 30000);
    return () => { if (idleTimerRef.current) clearInterval(idleTimerRef.current); };
  }, [phase, action?.id, idleNudge]);

  // Reset idle on any user interaction
  const resetIdle = useCallback(() => {
    lastInteractionRef.current = Date.now();
    setIdleNudge(null);
  }, []);

  // ── Pulse heartbeat during focus mode ─────────────────────────────────────
  useEffect(() => {
    if (phase !== 'focus' || !active_session) return;
    if (active_session.state === 'paused') return;

    const sendPulse = async () => {
      try {
        const res = await engineAPI.pulse({ session_id: active_session?.id });
        const pd = res?.data?.data;
        if (pd?.adaptation?.type === 'suggest_break') {
          toast('خذ استراحة قصيرة 💆', { duration: 5000 });
        }
      } catch {}
    };

    const timeout = setTimeout(() => {
      sendPulse();
      pulseRef.current = setInterval(sendPulse, 45000);
    }, 60000);

    return () => {
      clearTimeout(timeout);
      if (pulseRef.current) clearInterval(pulseRef.current);
    };
  }, [phase, active_session?.id, active_session?.state]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const startMutation = useMutation({
    mutationFn: (data) => engineAPI.start(data),
    onSuccess: () => {
      setPhase('focus');
      setFollowupData(null);
      setIdleNudge(null);
      recordAction('execution_started');
      refetch();
    },
    onError: () => toast.error('فشل بدء التنفيذ'),
  });

  const pauseMutation = useMutation({
    mutationFn: () => engineAPI.pause(),
    onSuccess: () => { recordAction('execution_paused'); refetch(); },
  });

  const resumeMutation = useMutation({
    mutationFn: () => engineAPI.resume(),
    onSuccess: () => { recordAction('execution_resumed'); refetch(); },
  });

  const completeMutation = useMutation({
    mutationFn: (data) => engineAPI.complete(data),
    onSuccess: (res) => {
      const d = res?.data?.data;
      setCompletionData(d);
      setPhase('done');
      setFollowupData(null);
      invalidateAll();
      recordAction('task_completed');
      // Record in cognitive memory for learning
      cognitiveRecord('complete', {
        task_id: action?.id,
        task_title: action?.title,
        type: 'task',
      });
    },
    onError: () => toast.error('فشل تسجيل الإنجاز'),
  });

  const skipMutation = useMutation({
    mutationFn: (data) => engineAPI.skip(data),
    onSuccess: (res, data) => {
      setShowSkipReasons(false);
      resetIdle();
      const d = res?.data?.data;
      if (d?.lighter_action) {
        setFollowupData({ type: 'skip', lighter_action: d.lighter_action, next: d.next });
        setPhase('followup');
      } else {
        setPhase('action');
        refetch();
      }
      invalidateAll();
      recordAction('task_skipped');
      // Record skip in cognitive memory with reason for learning
      cognitiveRecord('skip', {
        task_id: action?.id,
        task_title: action?.title,
        reason: data?.reason || 'unknown',
      });
    },
  });

  const delayMutation = useMutation({
    mutationFn: (data) => engineAPI.delay(data),
    onSuccess: (res) => {
      resetIdle();
      const d = res?.data?.data;
      if (d?.suggested_time) {
        setFollowupData({ type: 'delay', delay_info: d, next: d.next });
        setPhase('followup');
      } else {
        setPhase('action');
        refetch();
      }
      invalidateAll();
      recordAction('task_delayed');
    },
  });

  const abandonMutation = useMutation({
    mutationFn: (data) => engineAPI.abandon(data),
    onSuccess: (res) => {
      setShowExitConfirm(false);
      const d = res?.data?.data;
      if (d?.re_engagement) {
        setFollowupData({ type: 'abandon', re_engagement: d.re_engagement, next: d.next });
        setPhase('followup');
      } else {
        setPhase('action');
        refetch();
      }
      invalidateAll();
      recordAction('session_abandoned');
    },
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleStart = useCallback(() => {
    resetIdle();
    if (!action) return;

    if (action.cta_action === 'navigate') {
      if (action.type === 'mood') { onViewChange?.('mood'); return; }
      if (action.type === 'break') { toast('خذ استراحة 15-20 دقيقة 💆', { icon: '☕', duration: 5000 }); return; }
      onViewChange?.('tasks');
      return;
    }

    if (action.cta_action === 'log' && action.type === 'habit') {
      habitAPI.checkIn(action.id, {}).then(() => {
        invalidateAll();
        recordAction('habit_checkin');
        toast.success('تم تسجيل العادة! 🔥');
        refetch();
      }).catch(() => toast.error('فشل تسجيل العادة'));
      return;
    }

    startMutation.mutate({
      target_type: action.type || 'task',
      target_id: action.id,
      title: action.title,
      estimated_minutes: action.estimated_minutes,
      mode,
      energy_score: energy?.score,
      confidence,
      time_to_start_ms: Date.now(),
    });
  }, [action, mode, energy, confidence, startMutation, onViewChange, invalidateAll, recordAction, refetch, resetIdle]);

  // Start a specific action (from lighter suggestion, re-engagement, or resume prompt)
  const handleStartSpecific = useCallback((actionData) => {
    resetIdle();
    startMutation.mutate({
      target_type: actionData.type || 'task',
      target_id: actionData.id,
      title: actionData.title,
      estimated_minutes: actionData.estimated_minutes || actionData.suggested_minutes,
      mode: 'focus',
    });
    setFollowupData(null);
  }, [startMutation, resetIdle]);

  // Resume from VA presence prompt
  const handleResumeFromPrompt = useCallback(() => {
    resetIdle();
    if (resumePrompt?.target_id) {
      if (resumePrompt.type === 'resume') {
        // Resume existing session
        engineAPI.resume().then(() => {
          setPhase('focus');
          refetch();
          recordAction('execution_resumed');
        }).catch(() => {
          // If resume fails, restart
          handleStartSpecific({
            type: resumePrompt.target_type,
            id: resumePrompt.target_id,
            title: resumePrompt.title,
            estimated_minutes: null,
          });
        });
      } else {
        handleStartSpecific({
          type: resumePrompt.target_type,
          id: resumePrompt.target_id,
          title: resumePrompt.title,
          estimated_minutes: null,
        });
      }
    }
  }, [resumePrompt, resetIdle, handleStartSpecific, refetch, recordAction]);

  const handleComplete = useCallback(() => {
    completeMutation.mutate({ completion_quality: 'full' });
  }, [completeMutation]);

  const handleSkip = useCallback((skipType) => {
    resetIdle();
    skipMutation.mutate({
      task_id: action?.id || active_session?.target_id,
      skip_type: skipType,
    });
  }, [action, active_session, skipMutation, resetIdle]);

  const handleDelay = useCallback(() => {
    resetIdle();
    delayMutation.mutate({
      task_id: action?.id || active_session?.target_id,
    });
  }, [action, active_session, delayMutation, resetIdle]);

  const handleExitFocus = useCallback(() => {
    setShowExitConfirm(true);
  }, []);

  const handleConfirmExit = useCallback(() => {
    abandonMutation.mutate({ reason: 'user_exit' });
  }, [abandonMutation]);

  const handleNextFromDone = useCallback(() => {
    setCompletionData(null);
    setFollowupData(null);
    setPhase('action');
    refetch();
  }, [refetch]);

  const handleStartNextFromDone = useCallback(() => {
    const nextAction = completionData?.next?.next_action;
    if (!nextAction || !nextAction.id) {
      handleNextFromDone();
      return;
    }
    handleStartSpecific({
      type: nextAction.type || 'task',
      id: nextAction.id,
      title: nextAction.title,
      estimated_minutes: nextAction.estimated_minutes,
    });
    setCompletionData(null);
  }, [completionData, handleStartSpecific, handleNextFromDone]);

  const handleDismissFollowup = useCallback(() => {
    setFollowupData(null);
    setPhase('action');
    refetch();
  }, [refetch]);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]" dir="rtl">
        <div className="text-center">
          <motion.div animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
            <RefreshCw size={24} className="text-primary-400" />
          </motion.div>
          <p className="text-sm text-gray-500 mt-3">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE: FOLLOW-UP — Micro-Adaptation UI
  // ═══════════════════════════════════════════════════════════════════════════════
  if (phase === 'followup' && followupData) {
    return (
      <div className="max-w-md mx-auto px-4 flex flex-col items-center justify-center min-h-[70vh]" dir="rtl">
        <AnimatePresence mode="wait">
          {/* Skip Follow-up */}
          {followupData.type === 'skip' && followupData.lighter_action && (
            <motion.div key="skip-followup"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="w-full text-center">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
                className="glass-card p-5 mb-6 border border-primary-500/20 bg-gradient-to-r from-primary-500/5 to-purple-500/5">
                <p className="text-lg font-black text-white mb-2">{followupData.lighter_action.title}</p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-green-500/10 border border-green-500/15 mb-3">
                  <Clock size={12} className="text-green-400" />
                  <span className="text-sm text-green-300 font-bold">{followupData.lighter_action.estimated_minutes} دقيقة</span>
                  {followupData.lighter_action.original_minutes && (
                    <span className="text-[10px] text-gray-500 line-through mr-1">{followupData.lighter_action.original_minutes}</span>
                  )}
                </div>
                <p className="text-sm text-gray-400 leading-relaxed">{followupData.lighter_action.message}</p>
              </motion.div>
              <motion.button whileTap={{ scale: 0.96 }}
                onClick={() => handleStartSpecific(followupData.lighter_action)}
                disabled={startMutation.isPending}
                className="w-full max-w-xs mx-auto py-4 bg-gradient-to-l from-green-500 to-emerald-600 text-white text-base font-black rounded-2xl shadow-lg shadow-green-500/25 flex items-center justify-center gap-2 mb-3">
                {startMutation.isPending ? <RefreshCw size={18} className="animate-spin" /> : <Play size={18} fill="white" />}
                ابدأ الآن
              </motion.button>
              <button onClick={handleDismissFollowup}
                className="text-gray-500 text-xs hover:text-gray-400 transition-colors">اقتراح آخر</button>
            </motion.div>
          )}

          {/* Delay Follow-up */}
          {followupData.type === 'delay' && followupData.delay_info && (
            <motion.div key="delay-followup"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="w-full text-center">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
                className="glass-card p-6 mb-6 border border-yellow-500/20 bg-gradient-to-r from-yellow-500/5 to-orange-500/5">
                <Clock size={40} className="text-yellow-400 mx-auto mb-3" />
                <p className="text-lg font-black text-white mb-2">{followupData.delay_info.message}</p>
                {followupData.delay_info.suggested_time && (
                  <div className="inline-flex items-center gap-2 px-4 py-2 bg-yellow-500/15 rounded-xl border border-yellow-500/25 mt-2">
                    <span className="text-2xl font-black text-yellow-300">{followupData.delay_info.suggested_time.time}</span>
                    {followupData.delay_info.suggested_time.is_tomorrow && (
                      <span className="text-xs text-yellow-400">غدا</span>
                    )}
                  </div>
                )}
              </motion.div>
              <div className="space-y-2 max-w-xs mx-auto">
                <button onClick={handleDismissFollowup}
                  className="w-full py-3 bg-yellow-500/15 text-yellow-300 text-sm font-bold rounded-2xl hover:bg-yellow-500/25 transition-all flex items-center justify-center gap-2">
                  <Check size={14} /> تم — سأعود
                </button>
                {followupData.next?.next_action?.id && (
                  <button onClick={() => handleStartSpecific(followupData.next.next_action)}
                    className="w-full py-3 bg-primary-500/15 text-primary-300 text-sm font-bold rounded-2xl hover:bg-primary-500/25 transition-all flex items-center justify-center gap-2">
                    <Play size={14} /> ابدأ مهمة أخرى الآن
                  </button>
                )}
              </div>
            </motion.div>
          )}

          {/* Abandon Follow-up */}
          {followupData.type === 'abandon' && followupData.re_engagement && (
            <motion.div key="abandon-followup"
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="w-full text-center">
              <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }}
                className="glass-card p-6 mb-6 border border-blue-500/20 bg-gradient-to-r from-blue-500/5 to-cyan-500/5">
                <RotateCcw size={36} className="text-blue-400 mx-auto mb-3" />
                <p className="text-lg font-black text-white mb-2">{followupData.re_engagement.prompt}</p>
                {followupData.re_engagement.suggested_minutes && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/15 border border-blue-500/25 mt-2">
                    <Timer size={12} className="text-blue-400" />
                    <span className="text-sm text-blue-300 font-bold">{followupData.re_engagement.suggested_minutes} دقيقة فقط</span>
                  </div>
                )}
              </motion.div>
              <div className="space-y-2 max-w-xs mx-auto">
                <motion.button whileTap={{ scale: 0.96 }}
                  onClick={() => handleStartSpecific({
                    type: followupData.re_engagement.target_type,
                    id: followupData.re_engagement.target_id,
                    title: followupData.re_engagement.target_title,
                    estimated_minutes: followupData.re_engagement.suggested_minutes,
                  })}
                  disabled={startMutation.isPending}
                  className="w-full py-4 bg-gradient-to-l from-blue-500 to-cyan-600 text-white text-base font-black rounded-2xl shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2">
                  {startMutation.isPending ? <RefreshCw size={18} className="animate-spin" /> : <Play size={18} fill="white" />}
                  أكمل الآن
                </motion.button>
                <button onClick={handleDismissFollowup}
                  className="w-full py-3 bg-white/5 text-gray-400 text-sm rounded-2xl hover:bg-white/10 transition-all">
                  لا — اقتراح آخر
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 2: FOCUS MODE — Full-Screen Enforcement
  // ═══════════════════════════════════════════════════════════════════════════════
  if (phase === 'focus' && active_session) {
    const isPaused = active_session.state === 'paused';

    return (
      <div className="fixed inset-0 z-[90] bg-dark flex flex-col items-center justify-center px-6" dir="rtl">
        <button onClick={handleExitFocus}
          className="absolute top-4 left-4 p-2 text-gray-600 hover:text-gray-400 transition-colors z-10" title="خروج">
          <X size={20} />
        </button>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <span className={`text-xs font-bold px-4 py-1.5 rounded-xl ${
            isPaused ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/25'
                     : 'bg-green-500/15 text-green-300 border border-green-500/25'
          }`}>{isPaused ? '⏸️ متوقف' : '▶️ جاري التنفيذ'}</span>
        </motion.div>

        <motion.h1 initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="text-xl font-black text-white text-center mb-8 max-w-sm">{active_session.title}</motion.h1>

        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 150 }}>
          <FocusTimer
            startedAt={active_session.started_at}
            activeSeconds={active_session.active_seconds || 0}
            isPaused={isPaused}
            estimatedMinutes={active_session.estimated_minutes}
          />
        </motion.div>

        <div className="mt-10 w-full max-w-xs space-y-3">
          {isPaused ? (
            <motion.button whileTap={{ scale: 0.97 }}
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              className="w-full py-4 bg-gradient-to-l from-green-500 to-emerald-600 text-white text-base font-black rounded-2xl shadow-lg shadow-green-500/25 flex items-center justify-center gap-2">
              <Play size={18} fill="white" /> استأنف
            </motion.button>
          ) : (
            <motion.button whileTap={{ scale: 0.97 }}
              onClick={handleComplete}
              disabled={completeMutation.isPending}
              className="w-full py-4 bg-gradient-to-l from-primary-500 to-purple-600 text-white text-base font-black rounded-2xl shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2">
              {completeMutation.isPending ? <RefreshCw size={18} className="animate-spin" /> : <Check size={18} />}
              أنهيت ✓
            </motion.button>
          )}

          <div className="flex gap-2">
            {!isPaused && (
              <button onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}
                className="flex-1 py-3 bg-white/5 text-yellow-300 text-sm font-bold rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-2">
                <Pause size={14} /> إيقاف مؤقت
              </button>
            )}
            <button onClick={() => setShowSkipReasons(true)}
              className={`${!isPaused ? 'flex-1' : 'w-full'} py-3 bg-white/5 text-gray-500 text-sm rounded-2xl hover:bg-white/10 hover:text-gray-400 transition-all flex items-center justify-center gap-2`}>
              <SkipForward size={14} /> تخطي
            </button>
          </div>
        </div>

        {/* Exit Confirmation Modal */}
        <AnimatePresence>
          {showExitConfirm && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/70 z-[100] flex items-center justify-center px-6"
              onClick={() => setShowExitConfirm(false)}>
              <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm bg-dark-card rounded-3xl p-6 border border-white/10 text-center" dir="rtl">
                <AlertTriangle size={40} className="text-yellow-400 mx-auto mb-4" />
                <h3 className="text-lg font-black text-white mb-2">متأكد تريد الخروج؟</h3>
                <p className="text-sm text-gray-400 mb-6">الجلسة لسه شغالة. الخروج يعني التوقف المؤقت.</p>
                <div className="flex gap-3">
                  <button onClick={handleConfirmExit} disabled={abandonMutation.isPending}
                    className="flex-1 py-3 bg-red-500/20 text-red-400 font-bold rounded-xl hover:bg-red-500/30 transition-all">
                    {abandonMutation.isPending ? '...' : 'نعم، اخرج'}
                  </button>
                  <button onClick={() => setShowExitConfirm(false)}
                    className="flex-1 py-3 bg-primary-500/20 text-primary-400 font-bold rounded-xl hover:bg-primary-500/30 transition-all">
                    أكمل الجلسة
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Skip Reasons Modal */}
        <AnimatePresence>
          {showSkipReasons && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/80 z-[100] flex items-end justify-center"
              onClick={() => setShowSkipReasons(false)}>
              <motion.div initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg rounded-t-3xl p-5 pb-8 border-t border-white/10 shadow-2xl shadow-black/50" dir="rtl"
                style={{ background: '#0f0f1e' }}>
                <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
                <h3 className="text-base font-bold text-white mb-1">ليه تريد تتخطى؟</h3>
                <p className="text-xs text-gray-400 mb-4">هذا يساعدنا نقترح أفضل المرة الجاية</p>
                <div className="space-y-2">
                  {SKIP_REASONS.map(opt => (
                    <button key={opt.type} onClick={() => handleSkip(opt.type)} disabled={skipMutation.isPending}
                      className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-primary-500/15 border border-white/10 hover:border-primary-500/30 transition-all active:scale-[0.98] text-right shadow-sm">
                      <span className="text-xl">{opt.emoji}</span>
                      <span className="text-sm text-white font-medium">{opt.label}</span>
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowSkipReasons(false)}
                  className="w-full mt-3 py-2.5 text-gray-400 text-xs hover:text-white transition-colors">إلغاء — سأكمل</button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 3: DONE — Completion Celebration + Next Action
  // ═══════════════════════════════════════════════════════════════════════════════
  if (phase === 'done' && completionData) {
    const reward = completionData.reward || {};
    const summary = completionData.session_summary || {};
    const nextAction = completionData.next?.next_action;

    return (
      <div className="max-w-md mx-auto px-4 pt-8" dir="rtl">
        <motion.div initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 12 }} className="text-center mb-6">
          {/* Multi-step celebration animation */}
          <motion.div
            initial={{ rotate: -10 }} animate={{ rotate: [0, 10, -10, 5, 0] }}
            transition={{ duration: 0.8, delay: 0.2 }}
          >
            <Award size={56} className="text-yellow-400 mx-auto mb-3" />
          </motion.div>
          <motion.h1
            initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-2xl font-black text-white mb-1"
          >
            {(reward.xp || 10) >= 25 ? 'أداء استثنائي!' : 'أحسنت!'}
          </motion.h1>
          {/* Identity reinforcement based on action type */}
          <motion.p
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 0.45 }}
            className="text-xs text-gray-400 mb-3"
          >
            {reward.streak_continued ? `🔥 ${reward.streak || 1} يوم متتالي — أنت بتبني هوية الانضباط`
              : 'كل خطوة بتقربك من أهدافك'}
          </motion.p>
          <motion.div
            initial={{ scale: 0 }} animate={{ scale: [0, 1.2, 1] }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-l from-yellow-500/20 to-orange-500/15 rounded-xl border border-yellow-500/30"
          >
            <Zap size={18} className="text-yellow-400" />
            <span className="text-lg font-black text-yellow-300">+{reward.xp || 10} XP</span>
            {reward.streak_continued && <Flame size={16} className="text-orange-400" />}
          </motion.div>
          {reward.achievement && (
            <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/15 rounded-full border border-purple-500/25">
              <span className="text-sm">🏅</span>
              <span className="text-xs text-purple-300 font-bold">{reward.achievement}</span>
            </motion.div>
          )}
        </motion.div>

        {summary.active_minutes != null && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="glass-card p-4 mb-4">
            <div className="flex items-center justify-center gap-6 text-center">
              <div>
                <div className="text-lg font-black text-white">{summary.active_minutes}</div>
                <div className="text-[10px] text-gray-500">دقيقة</div>
              </div>
              <div className="w-px h-8 bg-white/10" />
              <div>
                <div className="text-lg font-black text-white">{summary.pause_count || 0}</div>
                <div className="text-[10px] text-gray-500">توقفات</div>
              </div>
            </div>
          </motion.div>
        )}

        {nextAction && nextAction.id && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
            className="glass-card p-4 bg-gradient-to-r from-primary-500/10 to-purple-500/5 border border-primary-500/20 mb-4">
            <p className="text-[10px] text-gray-500 mb-1">التالي:</p>
            <p className="text-sm font-bold text-white">{nextAction.title}</p>
            {nextAction.estimated_minutes && (
              <span className="text-[10px] text-gray-400 flex items-center gap-1 mt-1">
                <Timer size={9} /> {nextAction.estimated_minutes} دقيقة
              </span>
            )}
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
          className="space-y-2">
          {nextAction && nextAction.id && (
            <motion.button whileTap={{ scale: 0.97 }}
              onClick={handleStartNextFromDone}
              className="w-full py-4 bg-gradient-to-l from-primary-500 to-purple-600 text-white text-base font-black rounded-2xl shadow-lg shadow-primary-500/25 flex items-center justify-center gap-2">
              ابدأ التالي 🚀
            </motion.button>
          )}
          <button onClick={handleNextFromDone}
            className="w-full py-3 bg-white/5 text-gray-400 text-sm rounded-2xl hover:bg-white/10 transition-all flex items-center justify-center gap-2">
            <Check size={14} /> {nextAction?.id ? 'رجوع للاقتراحات' : 'العودة'}
          </button>
        </motion.div>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PHASE 1: ACTION — VA Presence + Single Next Action
  // The app remembers. The app continues.
  // ═══════════════════════════════════════════════════════════════════════════════
  const oneLineReason = reasoning.length > 0
    ? reasoning[0].replace(/^[⏰📅🔴🟠⚡💪😴🎯💡🚀🧘📈⚠️🔥📱✅🌟]+\s*/g, '').slice(0, 80)
    : null;

  const progressPct = vaProgress?.completion_pct || 0;

  return (
    <div className="max-w-md mx-auto px-4 flex flex-col items-center justify-center min-h-[70vh]" dir="rtl"
      onClick={resetIdle} onTouchStart={resetIdle}>

      {/* IDLE NUDGE BANNER */}
      <AnimatePresence>
        {idleNudge && (
          <motion.div initial={{ opacity: 0, y: -40 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -40 }}
            className="fixed top-4 left-4 right-4 z-50 max-w-md mx-auto">
            <div className="glass-card p-4 border border-primary-500/20 bg-gradient-to-r from-primary-500/10 to-cyan-500/5 rounded-2xl shadow-lg">
              <p className="text-sm text-white font-bold mb-2">{idleNudge.message}</p>
              <div className="flex gap-2">
                <button onClick={() => { resetIdle(); handleStart(); }}
                  className="flex-1 py-2 bg-primary-500/20 text-primary-300 text-xs font-bold rounded-xl hover:bg-primary-500/30 transition-all">
                  ابدأ {idleNudge.suggested_minutes} دقيقة
                </button>
                <button onClick={resetIdle}
                  className="py-2 px-3 text-gray-500 text-xs hover:text-gray-400 transition-colors">لاحقا</button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ═══ VA PRESENCE HEADER — Greeting + Resume + Narrative ═══ */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
        className="w-full mb-6 text-center">

        {/* Contextual Greeting */}
        {greeting && (
          <div className="flex items-center justify-center gap-2 mb-2">
            <TimeIcon timeOfDay={timeOfDay} />
            <p className="text-sm text-gray-400 font-medium">{greeting}</p>
          </div>
        )}

        {/* Daily Narrative + Progress Bar */}
        {dailyNarrative && (
          <div className="mb-3">
            <p className="text-xs text-gray-500 mb-1.5">{dailyNarrative}</p>
            {progressPct > 0 && (
              <div className="w-full max-w-[200px] mx-auto h-1 bg-white/5 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-l from-primary-500 to-purple-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPct}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut' }}
                />
              </div>
            )}
          </div>
        )}

        {/* Resume Prompt — "You started [task]... continue?" */}
        <AnimatePresence>
          {resumePrompt && !action?.id && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="glass-card p-4 mb-4 border border-amber-500/20 bg-gradient-to-r from-amber-500/5 to-orange-500/5 text-center"
            >
              <p className="text-sm text-white font-bold mb-2">{resumePrompt.message}</p>
              <div className="flex items-center justify-center gap-2">
                {resumePrompt.options?.map(opt => (
                  <button key={opt.action}
                    onClick={opt.action === 'resume' || opt.action === 'restart'
                      ? handleResumeFromPrompt
                      : handleDismissFollowup}
                    className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                      opt.action === 'resume' || opt.action === 'restart'
                        ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                    }`}>
                    {opt.icon} {opt.label}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Resume prompt when there IS also a next action */}
        <AnimatePresence>
          {resumePrompt && action?.id && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mb-3"
            >
              <button
                onClick={handleResumeFromPrompt}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/15 text-xs text-amber-300 font-medium hover:bg-amber-500/20 transition-all"
              >
                <RotateCcw size={10} />
                أكمل &ldquo;{resumePrompt.title}&rdquo; {resumePrompt.active_minutes > 0 ? `(${resumePrompt.active_minutes} د)` : ''}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* ═══ NEXT ACTION CARD ═══ */}
      {action ? (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full text-center">
          {goalCtx && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.1 }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-primary-500/10 border border-primary-500/15 mb-4">
              <Target size={10} className="text-primary-400" />
              <span className="text-[10px] text-primary-300">{goalCtx.title}</span>
              {goalCtx.progress != null && (
                <span className="text-[9px] text-gray-500">({goalCtx.progress}%)</span>
              )}
            </motion.div>
          )}

          <h1 className="text-2xl sm:text-3xl font-black text-white leading-tight mb-3">{action.title}</h1>

          {action.estimated_minutes && (
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10 mb-4">
              <Clock size={12} className="text-gray-400" />
              <span className="text-sm text-gray-300">{action.estimated_minutes} دقيقة</span>
            </div>
          )}

          {oneLineReason && (
            <p className="text-sm text-gray-400 mb-8 max-w-xs mx-auto leading-relaxed">{oneLineReason}</p>
          )}

          {/* THE BIG BUTTON */}
          <motion.button whileTap={{ scale: 0.96 }}
            onClick={handleStart}
            disabled={startMutation.isPending}
            className="w-full max-w-xs mx-auto py-5 bg-gradient-to-l from-primary-500 to-purple-600 text-white rounded-2xl hover:from-primary-600 hover:to-purple-700 active:scale-[0.98] transition-all shadow-xl shadow-primary-500/30 flex flex-col items-center justify-center disabled:opacity-60 disabled:cursor-not-allowed">
            {startMutation.isPending ? (
              <RefreshCw size={22} className="animate-spin" />
            ) : (
              <>
                <span className="flex items-center gap-2 text-xl font-black">
                  <Play size={20} fill="white" /> ابدأ الآن
                </span>
                {action.estimated_minutes && (
                  <span className="text-[11px] text-white/50 mt-1">{action.estimated_minutes} دقيقة تركيز</span>
                )}
              </>
            )}
          </motion.button>

          {action.id && action.cta_action !== 'navigate' && (
            <div className="flex items-center justify-center gap-4 mt-4">
              <button onClick={() => setShowSkipReasons(true)}
                className="text-gray-500 text-xs hover:text-gray-400 transition-colors flex items-center gap-1">
                <SkipForward size={11} /> تخطي
              </button>
              <span className="text-gray-700">·</span>
              <button onClick={handleDelay} disabled={delayMutation.isPending}
                className="text-gray-500 text-xs hover:text-gray-400 transition-colors flex items-center gap-1">
                <Clock size={11} /> مش الآن
              </button>
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="text-center">
          <Award size={48} className="text-yellow-400 mx-auto mb-4" />
          <h2 className="text-2xl font-black text-white mb-2">يوم منجز! 🎉</h2>
          <p className="text-sm text-gray-400 mb-6">أكملت كل مهامك وعاداتك اليوم</p>
          <button onClick={() => onViewChange?.('tasks')}
            className="px-6 py-3 bg-primary-500/20 text-primary-400 rounded-xl hover:bg-primary-500/30 transition-all text-sm font-medium">
            أضف مهمة جديدة
          </button>
        </motion.div>
      )}

      {/* Skip Reasons Modal (shared action phase) */}
      <AnimatePresence>
        {showSkipReasons && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 z-50 flex items-end justify-center"
            onClick={() => setShowSkipReasons(false)}>
            <motion.div initial={{ y: 200 }} animate={{ y: 0 }} exit={{ y: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg rounded-t-3xl p-5 pb-8 border-t border-white/10 shadow-2xl shadow-black/50" dir="rtl"
              style={{ background: '#0f0f1e' }}>
              <div className="w-10 h-1 bg-white/20 rounded-full mx-auto mb-4" />
              <h3 className="text-base font-bold text-white mb-1">ليه مش الآن؟</h3>
              <p className="text-xs text-gray-400 mb-4">هذا يساعدنا نقترح أفضل المرة الجاية</p>
              <div className="space-y-2">
                {SKIP_REASONS.map(opt => (
                  <button key={opt.type} onClick={() => handleSkip(opt.type)} disabled={skipMutation.isPending}
                    className="w-full flex items-center gap-3 p-3.5 rounded-xl bg-white/[0.06] hover:bg-primary-500/15 border border-white/10 hover:border-primary-500/30 transition-all active:scale-[0.98] text-right shadow-sm">
                    <span className="text-xl">{opt.emoji}</span>
                    <span className="text-sm text-white font-medium">{opt.label}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setShowSkipReasons(false)}
                className="w-full mt-3 py-2.5 text-gray-400 text-xs hover:text-white transition-colors">إلغاء</button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
