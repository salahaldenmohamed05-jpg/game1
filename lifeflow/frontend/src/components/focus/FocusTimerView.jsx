/**
 * FocusTimerView — Pomodoro Focus Timer
 * =======================================
 * Premium-worthy feature: Pomodoro timer with:
 * - Configurable work/break durations
 * - Visual circular progress ring
 * - Session tracking (daily focus minutes)
 * - Task linking (focus on a specific task)
 * - Ambient sound toggle
 * - Auto-break detection
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  Play, Pause, SkipForward, RotateCcw,
  Coffee, Brain, Zap, Settings, X,
  Volume2, VolumeX, Target, Flame,
  Clock, CheckCircle, ChevronDown,
} from 'lucide-react';
import { taskAPI } from '../../utils/api';
import toast from 'react-hot-toast';

// Timer presets
const PRESETS = [
  { id: 'classic', label: 'كلاسيك', work: 25, shortBreak: 5, longBreak: 15, icon: '🍅' },
  { id: 'deep', label: 'تركيز عميق', work: 50, shortBreak: 10, longBreak: 20, icon: '🧠' },
  { id: 'sprint', label: 'سبرنت', work: 15, shortBreak: 3, longBreak: 10, icon: '⚡' },
  { id: 'study', label: 'مذاكرة', work: 45, shortBreak: 10, longBreak: 25, icon: '📚' },
];

// SVG Circular Progress
function CircularProgress({ progress, size = 280, strokeWidth = 8, children }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        {/* Background circle */}
        <circle cx={size / 2} cy={size / 2} r={radius}
          stroke="rgba(255,255,255,0.05)" strokeWidth={strokeWidth} fill="none" />
        {/* Progress circle */}
        <circle cx={size / 2} cy={size / 2} r={radius}
          stroke="url(#focusGradient)" strokeWidth={strokeWidth} fill="none"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }} />
        <defs>
          <linearGradient id="focusGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#6C63FF" />
            <stop offset="100%" stopColor="#FF6584" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {children}
      </div>
    </div>
  );
}

export default function FocusTimerView() {
  const [preset, setPreset] = useState(PRESETS[0]);
  const [phase, setPhase] = useState('idle'); // idle, work, shortBreak, longBreak
  const [timeLeft, setTimeLeft] = useState(25 * 60); // seconds
  const [isRunning, setIsRunning] = useState(false);
  const [sessionsCompleted, setSessions] = useState(0);
  const [totalFocusToday, setTotalFocusToday] = useState(0);
  const [linkedTask, setLinkedTask] = useState(null);
  const [showTaskPicker, setShowTaskPicker] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);

  // Fetch tasks for linking
  const { data: tasksData } = useQuery({
    queryKey: ['tasks-for-focus'],
    queryFn: () => taskAPI.getSmartView(),
    select: (res) => {
      const d = res?.data?.data || res?.data || {};
      return [...(d.today || []), ...(d.overdue || [])].filter(t => t.status !== 'completed').slice(0, 10);
    },
  });

  const totalDuration = useMemo(() => {
    if (phase === 'work') return preset.work * 60;
    if (phase === 'shortBreak') return preset.shortBreak * 60;
    if (phase === 'longBreak') return preset.longBreak * 60;
    return preset.work * 60;
  }, [phase, preset]);

  const progress = useMemo(() => {
    if (phase === 'idle') return 0;
    return Math.max(0, ((totalDuration - timeLeft) / totalDuration) * 100);
  }, [timeLeft, totalDuration, phase]);

  // Timer logic
  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft(prev => {
          if (prev <= 1) {
            clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(intervalRef.current);
  }, [isRunning, timeLeft]);

  // Handle timer completion
  useEffect(() => {
    if (timeLeft === 0 && phase !== 'idle') {
      setIsRunning(false);
      if (soundEnabled) {
        try {
          const ctx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 800;
          gain.gain.value = 0.3;
          osc.start();
          setTimeout(() => { osc.stop(); ctx.close(); }, 500);
        } catch {}
      }

      if (phase === 'work') {
        const newSessions = sessionsCompleted + 1;
        setSessions(newSessions);
        setTotalFocusToday(prev => prev + preset.work);
        toast.success(`جلسة تركيز كاملة! 🎉 (${newSessions})`);

        // Auto switch to break
        if (newSessions % 4 === 0) {
          setPhase('longBreak');
          setTimeLeft(preset.longBreak * 60);
        } else {
          setPhase('shortBreak');
          setTimeLeft(preset.shortBreak * 60);
        }
      } else {
        // Break ended
        toast('وقت الراحة انتهى! جاهز لجلسة جديدة؟ 💪');
        setPhase('work');
        setTimeLeft(preset.work * 60);
      }
    }
  }, [timeLeft, phase, sessionsCompleted, preset, soundEnabled]);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleStart = useCallback(() => {
    if (phase === 'idle') {
      setPhase('work');
      setTimeLeft(preset.work * 60);
      startTimeRef.current = Date.now();
    }
    setIsRunning(true);
  }, [phase, preset]);

  const handlePause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const handleReset = useCallback(() => {
    setIsRunning(false);
    setPhase('idle');
    setTimeLeft(preset.work * 60);
    clearInterval(intervalRef.current);
  }, [preset]);

  const handleSkip = useCallback(() => {
    setIsRunning(false);
    if (phase === 'work') {
      setPhase('shortBreak');
      setTimeLeft(preset.shortBreak * 60);
    } else {
      setPhase('work');
      setTimeLeft(preset.work * 60);
    }
  }, [phase, preset]);

  const handlePresetChange = useCallback((p) => {
    setPreset(p);
    if (phase === 'idle' || !isRunning) {
      setTimeLeft(p.work * 60);
      setPhase('idle');
    }
    setShowSettings(false);
  }, [phase, isRunning]);

  const phaseLabel = phase === 'work' ? 'وقت التركيز' : phase === 'shortBreak' ? 'استراحة قصيرة' : phase === 'longBreak' ? 'استراحة طويلة' : 'جاهز للبدء';
  const phaseColor = phase === 'work' ? 'text-primary-400' : phase === 'idle' ? 'text-gray-400' : 'text-green-400';
  const phaseIcon = phase === 'work' ? <Brain size={20} /> : phase === 'idle' ? <Target size={20} /> : <Coffee size={20} />;

  return (
    <div className="w-full max-w-lg mx-auto space-y-6 pb-8" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
            🍅 وقت التركيز
          </h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {sessionsCompleted} جلسات اليوم · {totalFocusToday} دقيقة تركيز
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all active:scale-95">
            {soundEnabled ? <Volume2 size={16} className="text-gray-300" /> : <VolumeX size={16} className="text-gray-500" />}
          </button>
          <button onClick={() => setShowSettings(!showSettings)}
            className="p-2.5 rounded-xl bg-white/5 hover:bg-white/10 transition-all active:scale-95">
            <Settings size={16} className="text-gray-300" />
          </button>
        </div>
      </div>

      {/* Preset Settings Panel */}
      <AnimatePresence>
        {showSettings && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden">
            <div className="glass-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">نمط التركيز</h3>
                <button onClick={() => setShowSettings(false)} className="p-1 rounded-lg hover:bg-white/10"><X size={14} className="text-gray-400" /></button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {PRESETS.map(p => (
                  <button key={p.id} onClick={() => handlePresetChange(p)}
                    className={`p-3 rounded-xl text-right transition-all active:scale-95 ${
                      preset.id === p.id ? 'bg-primary-500/20 border border-primary-500/30' : 'bg-white/5 border border-white/5 hover:bg-white/8'
                    }`}>
                    <div className="text-lg mb-1">{p.icon}</div>
                    <div className="text-sm font-bold text-white">{p.label}</div>
                    <div className="text-[10px] text-gray-400">{p.work}د عمل · {p.shortBreak}د راحة</div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Linked Task */}
      <div className="glass-card p-3">
        {linkedTask ? (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary-500/20 flex items-center justify-center flex-shrink-0">
              <Target size={14} className="text-primary-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400">التركيز على:</p>
              <p className="text-sm text-white font-medium truncate">{linkedTask.title}</p>
            </div>
            <button onClick={() => setLinkedTask(null)} className="p-1.5 rounded-lg hover:bg-white/10"><X size={12} className="text-gray-400" /></button>
          </div>
        ) : (
          <button onClick={() => setShowTaskPicker(!showTaskPicker)}
            className="w-full flex items-center gap-3 text-right">
            <div className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center flex-shrink-0">
              <Target size={14} className="text-gray-400" />
            </div>
            <p className="text-sm text-gray-400 flex-1">اربط مهمة بالجلسة (اختياري)</p>
            <ChevronDown size={14} className="text-gray-500" />
          </button>
        )}
      </div>

      {/* Task Picker Dropdown */}
      <AnimatePresence>
        {showTaskPicker && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden">
            <div className="glass-card p-3 space-y-1 max-h-48 overflow-y-auto">
              {(tasksData || []).length === 0 ? (
                <p className="text-xs text-gray-500 text-center py-2">لا توجد مهام</p>
              ) : (
                tasksData.map(t => (
                  <button key={t.id} onClick={() => { setLinkedTask(t); setShowTaskPicker(false); }}
                    className="w-full text-right p-2.5 rounded-lg hover:bg-white/5 transition-all flex items-center gap-2">
                    <span className="text-sm text-white truncate flex-1">{t.title}</span>
                    {t.priority && <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      t.priority === 'urgent' ? 'bg-red-500' : t.priority === 'high' ? 'bg-orange-500' : 'bg-yellow-500'
                    }`} />}
                  </button>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Timer Ring */}
      <div className="flex justify-center">
        <CircularProgress progress={progress} size={280} strokeWidth={8}>
          <motion.div
            animate={{ scale: isRunning ? [1, 1.02, 1] : 1 }}
            transition={{ duration: 2, repeat: isRunning ? Infinity : 0, ease: 'easeInOut' }}
            className="text-center"
          >
            <div className={`flex items-center gap-2 justify-center mb-2 ${phaseColor}`}>
              {phaseIcon}
              <span className="text-sm font-bold">{phaseLabel}</span>
            </div>
            <div className="text-5xl sm:text-6xl font-black text-white tracking-tight font-mono" dir="ltr">
              {formatTime(timeLeft)}
            </div>
            {phase !== 'idle' && (
              <div className="flex items-center justify-center gap-2 mt-2">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className={`w-2.5 h-2.5 rounded-full transition-all ${
                    i < (sessionsCompleted % 4) ? 'bg-primary-500 scale-110' : 'bg-white/10'
                  }`} />
                ))}
              </div>
            )}
          </motion.div>
        </CircularProgress>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-4">
        <button onClick={handleReset} disabled={phase === 'idle'}
          className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all active:scale-90 disabled:opacity-30">
          <RotateCcw size={18} className="text-gray-300" />
        </button>

        <motion.button
          whileTap={{ scale: 0.92 }}
          onClick={isRunning ? handlePause : handleStart}
          className={`w-20 h-20 rounded-full flex items-center justify-center shadow-2xl transition-all ${
            isRunning
              ? 'bg-gradient-to-br from-orange-500 to-red-500 shadow-orange-500/30'
              : 'bg-gradient-to-br from-primary-500 to-purple-600 shadow-primary-500/30'
          }`}
        >
          {isRunning
            ? <Pause size={28} className="text-white" fill="white" />
            : <Play size={28} className="text-white ms-1" fill="white" />
          }
        </motion.button>

        <button onClick={handleSkip} disabled={phase === 'idle'}
          className="w-12 h-12 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-all active:scale-90 disabled:opacity-30">
          <SkipForward size={18} className="text-gray-300" />
        </button>
      </div>

      {/* Today's Stats */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
          <Flame size={14} className="text-orange-400" /> إحصائيات اليوم
        </h3>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 rounded-xl bg-white/5">
            <div className="text-2xl font-black text-white">{sessionsCompleted}</div>
            <div className="text-[10px] text-gray-500">جلسات</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-white/5">
            <div className="text-2xl font-black text-white">{totalFocusToday}</div>
            <div className="text-[10px] text-gray-500">دقيقة</div>
          </div>
          <div className="text-center p-3 rounded-xl bg-white/5">
            <div className="text-2xl font-black text-white">{Math.round(totalFocusToday / 60 * 10) / 10}</div>
            <div className="text-[10px] text-gray-500">ساعات</div>
          </div>
        </div>
      </div>

      {/* Tips */}
      <div className="glass-card p-4">
        <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
          <Zap size={14} className="text-yellow-400" /> نصائح التركيز
        </h3>
        <div className="space-y-2">
          {[
            'اغلق كل الإشعارات قبل بدء الجلسة',
            'اشرب ماء في كل استراحة',
            'بعد 4 جلسات خذ استراحة طويلة 15-20 دقيقة',
            'حدد هدف واحد لكل جلسة تركيز',
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-2">
              <CheckCircle size={12} className="text-green-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-gray-400">{tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
