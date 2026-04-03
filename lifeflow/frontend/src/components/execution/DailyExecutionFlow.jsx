/**
 * DailyExecutionFlow — Phase 4: Full Daily Companion
 * =====================================================
 * 5 interconnected stages that lead the user's entire day:
 *
 *   Stage 1: START DAY    — Greeting + snapshot + "ابدأ يومك"
 *   Stage 2: DAILY PLAN   — Timeline of blocks (focus/habit/break/task)
 *   Stage 3: EXECUTION    — Focus → Complete → Reward → Next → Repeat
 *   Stage 4: HABIT LOOP   — Cue → Action → Reward (streaks, recovery, identity)
 *   Stage 5: DAY NARRATIVE — End-day summary + reflection + tomorrow CTA
 *
 * System leads by default; user can override.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Play, Pause, Check, CheckSquare, X, Clock, Timer, Flame, Award,
  SkipForward, Target, ChevronDown, ChevronUp,
  Sun, Moon, Sunrise, Zap, TrendingUp, Star,
  Coffee, BookOpen, ArrowRight, RefreshCw, Heart, RotateCcw,
} from 'lucide-react';
import { dailyFlowAPI } from '../../utils/api';
import toast from 'react-hot-toast';

// ═══════════════════════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════
const SKIP_REASONS = [
  { type: 'overwhelmed', label: 'مرهق',           emoji: '😰' },
  { type: 'busy',        label: 'مشغول',          emoji: '⏰' },
  { type: 'wrong_task',  label: 'مهمة خاطئة',     emoji: '🔄' },
  { type: 'low_energy',  label: 'طاقتي منخفضة',   emoji: '😴' },
  { type: 'lazy',        label: 'مش حاسس',        emoji: '🛋️' },
];

const BLOCK_ICONS = {
  focus: '🎯', task: '📋', habit: '🔄', break: '☕', review: '📊',
  deep_work: '🧠', morning: '🌅', evening: '🌙', exercise: '🏃',
};

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 1: START DAY SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function StartDayScreen({ onStartDay, isLoading, stats }) {
  const hour = new Date().getHours();
  const timeIcon = hour < 12 ? <Sunrise size={24} className="text-amber-400" /> :
                   hour < 17 ? <Sun size={24} className="text-yellow-400" /> :
                   <Moon size={24} className="text-indigo-400" />;

  const taskCount = stats?.total_tasks || 0;
  const habitCount = stats?.total_habits || 0;
  const overdueCount = stats?.overdue_count || 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center"
      dir="rtl"
    >
      {/* Animated glow background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-primary-500/10 rounded-full blur-3xl animate-pulse" />
      </div>

      {/* Time icon */}
      <motion.div
        initial={{ y: -20 }}
        animate={{ y: 0 }}
        transition={{ delay: 0.2 }}
        className="w-20 h-20 rounded-3xl bg-gradient-to-br from-primary-500/20 to-secondary-500/20 border border-primary-500/30 flex items-center justify-center mb-6"
      >
        {timeIcon}
      </motion.div>

      {/* Greeting */}
      <motion.h1
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-2xl font-bold text-white mb-2"
      >
        {hour < 12 ? 'صباح الخير 🌅' : hour < 17 ? 'مساء النور ☀️' : 'مساء الخير 🌆'}
      </motion.h1>

      <motion.p
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="text-gray-400 mb-8 text-sm"
      >
        جاهز نبدأ يوم بسيط ومنظم؟ 💪
      </motion.p>

      {/* Day snapshot cards — real data */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="flex gap-3 mb-8 flex-wrap justify-center"
      >
        <div className="glass-card px-4 py-3 text-center min-w-[80px]">
          <CheckSquare size={16} className="text-blue-400 mx-auto mb-1" />
          <p className="text-xs text-gray-500">المهام</p>
          <p className="text-sm font-bold text-white">{taskCount}</p>
        </div>
        <div className="glass-card px-4 py-3 text-center min-w-[80px]">
          <Target size={16} className="text-green-400 mx-auto mb-1" />
          <p className="text-xs text-gray-500">العادات</p>
          <p className="text-sm font-bold text-white">{habitCount}</p>
        </div>
        {overdueCount > 0 && (
          <div className="glass-card px-4 py-3 text-center min-w-[80px] border-red-500/20">
            <Flame size={16} className="text-red-400 mx-auto mb-1" />
            <p className="text-xs text-gray-500">متأخرة</p>
            <p className="text-sm font-bold text-red-400">{overdueCount}</p>
          </div>
        )}
        <div className="glass-card px-4 py-3 text-center min-w-[80px]">
          <Zap size={16} className="text-amber-400 mx-auto mb-1" />
          <p className="text-xs text-gray-500">الطاقة</p>
          <p className="text-sm font-bold text-white">{hour < 14 ? 'عالية' : hour < 18 ? 'متوسطة' : 'هادئة'}</p>
        </div>
      </motion.div>

      {/* START DAY BUTTON */}
      <motion.button
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6 }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={onStartDay}
        disabled={isLoading}
        className="px-10 py-4 bg-gradient-to-l from-primary-500 to-secondary-500 text-white font-bold text-lg rounded-2xl shadow-glow hover:shadow-xl transition-all disabled:opacity-50"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <RefreshCw size={18} className="animate-spin" />
            جاري التجهيز...
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <Play size={18} />
            ابدأ يومك الآن
          </span>
        )}
      </motion.button>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 2: DAILY PLAN TIMELINE
// ═══════════════════════════════════════════════════════════════════════════════
function DailyPlanTimeline({ plan, currentBlock, progress, onSelectBlock, onEndDay }) {
  const [showAll, setShowAll] = useState(false);
  const blocks = plan?.blocks || [];
  const completed = blocks.filter(b => b.status === 'completed');
  const pending = blocks.filter(b => b.status === 'pending');
  const visibleBlocks = showAll ? blocks : blocks.slice(0, 8);

  return (
    <div className="px-3 pb-4" dir="rtl">
      {/* Progress header */}
      <div className="glass-card p-4 mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-primary-400" />
            <span className="text-sm font-semibold text-white">تقدم اليوم</span>
          </div>
          <span className="text-xs text-primary-400 font-bold">{progress?.percentage || 0}%</span>
        </div>
        <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-l from-primary-500 to-secondary-500 rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress?.percentage || 0}%` }}
            transition={{ duration: 0.8 }}
          />
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>{progress?.completed || 0} مكتمل</span>
          <span>{progress?.xp_earned || 0} XP ⚡</span>
          <span>{pending.length} متبقي</span>
        </div>
      </div>

      {/* Timeline blocks */}
      <div className="space-y-2">
        {visibleBlocks.map((block, idx) => {
          const isCurrent = currentBlock?.id === block.id;
          const isDone = block.status === 'completed';
          const isSkipped = block.status === 'skipped';
          const icon = block.icon || BLOCK_ICONS[block.type] || '📋';

          return (
            <motion.div
              key={block.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              onClick={() => !isDone && !isSkipped && onSelectBlock(block)}
              className={`
                relative flex items-center gap-3 p-3 rounded-xl transition-all cursor-pointer
                ${isCurrent
                  ? 'bg-gradient-to-l from-primary-500/20 to-secondary-500/10 border border-primary-500/40 shadow-glow'
                  : isDone
                    ? 'bg-green-500/5 border border-green-500/20 opacity-60'
                    : isSkipped
                      ? 'bg-red-500/5 border border-red-500/10 opacity-40'
                      : 'bg-white/[0.03] border border-white/5 hover:bg-white/[0.06]'
                }
              `}
            >
              {/* Timeline dot */}
              <div className={`
                w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0
                ${isDone ? 'bg-green-500/20' : isCurrent ? 'bg-primary-500/20 animate-pulse' : 'bg-white/5'}
              `}>
                {isDone ? <Check size={16} className="text-green-400" /> : icon}
              </div>

              {/* Block info */}
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium truncate ${isDone ? 'text-green-400 line-through' : isCurrent ? 'text-white' : 'text-gray-300'}`}>
                  {block.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500">{block.duration}د</span>
                  {block.streak > 0 && (
                    <span className="text-xs text-orange-400 flex items-center gap-0.5">
                      <Flame size={10} /> {block.streak}
                    </span>
                  )}
                  {block.priority && (
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      block.priority === 'urgent' ? 'bg-red-500/20 text-red-400' :
                      block.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>{block.priority}</span>
                  )}
                </div>
              </div>

              {/* Current indicator */}
              {isCurrent && (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="flex-shrink-0"
                >
                  <Play size={16} className="text-primary-400" />
                </motion.div>
              )}
              {isDone && (
                <span className="text-xs text-green-400">✓</span>
              )}
            </motion.div>
          );
        })}
      </div>

      {blocks.length > 8 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="w-full mt-3 py-2 text-xs text-gray-500 hover:text-primary-400 flex items-center justify-center gap-1 transition-colors"
        >
          {showAll ? <><ChevronUp size={14} /> إخفاء</> : <><ChevronDown size={14} /> عرض الكل ({blocks.length})</>}
        </button>
      )}

      {/* End Day button — shows when many blocks are done */}
      {completed.length > 0 && (
        <button
          onClick={onEndDay}
          className="w-full mt-4 py-3 bg-gradient-to-l from-indigo-500/20 to-purple-500/10 border border-indigo-500/30 text-indigo-300 font-semibold rounded-xl hover:bg-indigo-500/30 transition-all flex items-center justify-center gap-2"
        >
          <Moon size={16} />
          اختم يومك
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 3: EXECUTION LOOP — Focus → Complete → Reward → Next
// ═══════════════════════════════════════════════════════════════════════════════
function ExecutionLoop({ block, onComplete, onSkip, onBack }) {
  const [timer, setTimer] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [showSkipReasons, setShowSkipReasons] = useState(false);
  const intervalRef = useRef(null);

  // Timer
  useEffect(() => {
    if (isPaused) return;
    intervalRef.current = setInterval(() => setTimer(t => t + 1), 1000);
    return () => clearInterval(intervalRef.current);
  }, [isPaused]);

  const mins = Math.floor(timer / 60);
  const secs = timer % 60;
  const estimatedSecs = (block?.duration || 25) * 60;
  const pct = Math.min(100, Math.round((timer / estimatedSecs) * 100));

  const icon = block?.icon || BLOCK_ICONS[block?.type] || '📋';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center min-h-[60vh] px-4"
      dir="rtl"
    >
      {/* Back button */}
      <button onClick={onBack} className="self-start mb-6 text-xs text-gray-500 hover:text-white flex items-center gap-1">
        <ArrowRight size={14} /> العودة للخطة
      </button>

      {/* Block title */}
      <motion.div
        initial={{ y: -10 }}
        animate={{ y: 0 }}
        className="text-center mb-8"
      >
        <span className="text-4xl mb-3 block">{icon}</span>
        <h2 className="text-xl font-bold text-white mb-1">{block?.title || 'تركيز'}</h2>
        <p className="text-xs text-gray-500">
          {block?.type === 'habit' ? 'عادة يومية' : block?.type === 'break' ? 'استراحة' : 'مهمة'}
          {block?.duration && ` • ${block.duration} دقيقة`}
        </p>
      </motion.div>

      {/* Circular timer */}
      <div className="relative mb-8" style={{ width: 180, height: 180 }}>
        <svg width={180} height={180} className="transform -rotate-90">
          <circle cx={90} cy={90} r={80} stroke="rgba(255,255,255,0.06)" strokeWidth={6} fill="none" />
          <motion.circle
            cx={90} cy={90} r={80}
            stroke={isPaused ? '#F59E0B' : '#6C63FF'}
            strokeWidth={6} fill="none" strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 80}
            animate={{ strokeDashoffset: 2 * Math.PI * 80 * (1 - pct / 100) }}
            transition={{ duration: 0.5 }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-4xl font-black text-white tabular-nums">
            {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
          </span>
          <span className="text-xs text-gray-500 mt-1">{pct}% من الوقت المقدر</span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        {/* Pause/Resume */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsPaused(!isPaused)}
          className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          {isPaused ? <Play size={20} className="text-amber-400" /> : <Pause size={20} className="text-gray-400" />}
        </motion.button>

        {/* Complete */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => onComplete(block)}
          className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500/30 to-emerald-500/20 border border-green-500/30 flex items-center justify-center hover:from-green-500/40 transition-all"
        >
          <Check size={22} className="text-green-400" />
        </motion.button>

        {/* Skip */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setShowSkipReasons(!showSkipReasons)}
          className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
        >
          <SkipForward size={20} className="text-gray-400" />
        </motion.button>
      </div>

      {/* Skip reasons */}
      <AnimatePresence>
        {showSkipReasons && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="mt-4 flex flex-wrap gap-2 justify-center"
          >
            {SKIP_REASONS.map(r => (
              <button
                key={r.type}
                onClick={() => { onSkip(block, r.type); setShowSkipReasons(false); }}
                className="px-3 py-2 text-xs bg-white/5 border border-white/10 rounded-xl hover:bg-white/10 text-gray-400 transition-colors"
              >
                {r.emoji} {r.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Momentum indicator */}
      {pct >= 80 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 text-center"
        >
          <p className="text-sm text-orange-400 font-medium">🔥 أنت داخل في flow!</p>
        </motion.div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REWARD MOMENT — Shows after completing a block
// ═══════════════════════════════════════════════════════════════════════════════
function RewardMoment({ reward, goalProgress, nextBlock, momentum, onNext, onEndDay, allDone }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', stiffness: 200 }}
      className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center"
      dir="rtl"
    >
      {/* Celebration */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring' }}
        className="w-24 h-24 rounded-3xl bg-gradient-to-br from-yellow-500/30 to-orange-500/20 border border-yellow-500/30 flex items-center justify-center mb-6"
      >
        <span className="text-5xl">{allDone ? '🏆' : '🎉'}</span>
      </motion.div>

      <motion.h2
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="text-xl font-bold text-white mb-2"
      >
        {reward?.message || 'أحسنت! 🎉'}
      </motion.h2>

      {/* XP earned */}
      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="flex items-center gap-4 mb-4"
      >
        <div className="glass-card px-4 py-2 text-center">
          <span className="text-lg font-bold text-yellow-400">+{reward?.xp || 0}</span>
          <p className="text-xs text-gray-500">XP</p>
        </div>
        {reward?.streak > 0 && (
          <div className="glass-card px-4 py-2 text-center">
            <span className="text-lg font-bold text-orange-400 flex items-center gap-1">
              <Flame size={16} /> {reward.streak}
            </span>
            <p className="text-xs text-gray-500">سلسلة</p>
          </div>
        )}
        <div className="glass-card px-4 py-2 text-center">
          <span className="text-lg font-bold text-primary-400">{reward?.total_xp || 0}</span>
          <p className="text-xs text-gray-500">إجمالي XP</p>
        </div>
      </motion.div>

      {/* Goal progress */}
      {goalProgress && (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="glass-card p-3 mb-4 w-full max-w-xs"
        >
          <p className="text-sm text-white mb-1">📈 {goalProgress.message}</p>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full" style={{ width: `${goalProgress.progress || 0}%` }} />
          </div>
        </motion.div>
      )}

      {/* Momentum */}
      {momentum && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="text-sm text-primary-400 mb-6"
        >
          {momentum}
        </motion.p>
      )}

      {/* Next action */}
      {allDone ? (
        <motion.button
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
          whileTap={{ scale: 0.95 }}
          onClick={onEndDay}
          className="px-8 py-3 bg-gradient-to-l from-indigo-500 to-purple-500 text-white font-bold rounded-2xl shadow-glow"
        >
          <span className="flex items-center gap-2"><Moon size={16} /> اختم يومك</span>
        </motion.button>
      ) : nextBlock ? (
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.7 }}
          className="text-center"
        >
          <p className="text-sm text-gray-400 mb-3">جاهز للخطوة التالية؟ 👉</p>
          <button
            onClick={onNext}
            className="px-8 py-3 bg-gradient-to-l from-primary-500 to-secondary-500 text-white font-bold rounded-2xl shadow-glow hover:shadow-xl transition-all"
          >
            <span className="flex items-center gap-2"><Play size={16} /> {nextBlock.title}</span>
          </button>
        </motion.div>
      ) : null}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STAGE 5: DAY NARRATIVE — End of Day Summary
// ═══════════════════════════════════════════════════════════════════════════════
function DayNarrative({ narrative, onRestart }) {
  const [reflectionText, setReflectionText] = useState('');
  const [submitted, setSubmitted] = useState(!!narrative?.reflection);

  if (!narrative) return null;

  const { title, score, xp_earned, achievements, goal_progress, highlights, tomorrow_preview } = narrative;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="px-4 pb-8"
      dir="rtl"
    >
      {/* Title */}
      <div className="text-center mb-6 pt-4">
        <motion.h1
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="text-3xl font-bold text-white mb-2"
        >
          {title}
        </motion.h1>
        <p className="text-sm text-gray-400">ملخص يومك</p>
      </div>

      {/* Score ring */}
      <div className="flex justify-center mb-6">
        <div className="relative w-32 h-32">
          <svg width={128} height={128} className="transform -rotate-90">
            <circle cx={64} cy={64} r={56} stroke="rgba(255,255,255,0.06)" strokeWidth={8} fill="none" />
            <motion.circle
              cx={64} cy={64} r={56}
              stroke={score >= 60 ? '#10B981' : score >= 30 ? '#F59E0B' : '#EF4444'}
              strokeWidth={8} fill="none" strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 56}
              initial={{ strokeDashoffset: 2 * Math.PI * 56 }}
              animate={{ strokeDashoffset: 2 * Math.PI * 56 * (1 - score / 100) }}
              transition={{ duration: 1.5, delay: 0.3 }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black text-white">{score}</span>
            <span className="text-xs text-gray-500">نقاط</span>
          </div>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="glass-card p-3 text-center">
          <p className="text-lg font-bold text-green-400">{achievements?.tasks?.completed || 0}/{achievements?.tasks?.total || 0}</p>
          <p className="text-xs text-gray-500">مهام</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-lg font-bold text-blue-400">{achievements?.habits?.completed || 0}/{achievements?.habits?.total || 0}</p>
          <p className="text-xs text-gray-500">عادات</p>
        </div>
        <div className="glass-card p-3 text-center">
          <p className="text-lg font-bold text-yellow-400">{xp_earned || 0}</p>
          <p className="text-xs text-gray-500">XP ⚡</p>
        </div>
      </div>

      {/* Highlights */}
      {highlights && highlights.length > 0 && (
        <div className="glass-card p-4 mb-4">
          <h3 className="text-sm font-semibold text-white mb-2">إنجازات اليوم</h3>
          {highlights.map((h, i) => (
            <p key={i} className="text-sm text-gray-300 mb-1">{h}</p>
          ))}
        </div>
      )}

      {/* Goal progress */}
      {goal_progress && goal_progress.length > 0 && (
        <div className="glass-card p-4 mb-4">
          <h3 className="text-sm font-semibold text-white mb-2">📈 تقدم الأهداف</h3>
          {goal_progress.map((g, i) => (
            <div key={i} className="mb-2 last:mb-0">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-300">{g.title}</span>
                <span className="text-primary-400">{g.progress}%</span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div className="h-full bg-primary-500 rounded-full transition-all" style={{ width: `${g.progress}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reflection */}
      {!submitted && (
        <div className="glass-card p-4 mb-4">
          <h3 className="text-sm font-semibold text-white mb-2">💭 إيه أكتر حاجة نجحت فيها النهارده؟</h3>
          <textarea
            value={reflectionText}
            onChange={e => setReflectionText(e.target.value)}
            placeholder="اكتب هنا..."
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white placeholder-gray-600 resize-none h-20 focus:outline-none focus:border-primary-500/50"
          />
          <button
            onClick={() => setSubmitted(true)}
            className="mt-2 px-4 py-2 bg-primary-500/20 text-primary-400 text-xs font-medium rounded-lg hover:bg-primary-500/30 transition-colors"
          >
            حفظ
          </button>
        </div>
      )}

      {/* Tomorrow CTA */}
      <div className="text-center mt-6">
        <p className="text-sm text-gray-400 mb-3">{tomorrow_preview || 'بكرة يوم جديد — جاهز تبدأ؟'}</p>
        <button
          onClick={onRestart}
          className="px-8 py-3 bg-gradient-to-l from-primary-500 to-secondary-500 text-white font-bold rounded-2xl shadow-glow hover:shadow-xl transition-all"
        >
          <span className="flex items-center gap-2"><RotateCcw size={16} /> ابدأ يوم جديد</span>
        </button>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MASTER COMPONENT: DailyExecutionFlow
// ═══════════════════════════════════════════════════════════════════════════════
export default function DailyExecutionFlow({ onViewChange }) {
  const queryClient = useQueryClient();

  // ── Flow stages ──────────────────────────────────────────────────────────
  // 'start' → 'plan' → 'execute' → 'reward' → 'plan' (loop) → 'narrative'
  const [stage, setStage] = useState('loading');
  const [dayData, setDayData] = useState(null);
  const [plan, setPlan] = useState(null);
  const [currentBlock, setCurrentBlock] = useState(null);
  const [progress, setProgress] = useState(null);
  const [lastReward, setLastReward] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [dayStats, setDayStats] = useState(null);

  // ── Check day status on mount ─────────────────────────────────────────────
  const loadDayStatus = useCallback(async () => {
    try {
      const resp = await dailyFlowAPI.getStatus();
      const data = resp?.data?.data || {};
      setDayStats(data.stats);
      if (data.state === 'completed') {
        // Day ended — show narrative
        const narResp = await dailyFlowAPI.getNarrative();
        setNarrative(narResp?.data?.data || null);
        setStage('narrative');
      } else if (data.state === 'active' || data.plan_exists) {
        // Day started — load plan
        const planResp = await dailyFlowAPI.getPlan();
        const planData = planResp?.data?.data;
        if (planData?.plan) {
          setPlan(planData.plan);
          setCurrentBlock(planData.current_block);
          setProgress(planData.progress);
          setStage('plan');
        } else {
          setStage('start');
        }
      } else {
        setStage('start');
      }
    } catch (err) {
      console.warn('[DailyFlow] Status check failed:', err.message);
      setStage('start');
    }
  }, []);

  useEffect(() => { loadDayStatus(); }, [loadDayStatus]);

  // ── Start Day ──────────────────────────────────────────────────────────────
  const startDayMutation = useMutation({
    mutationFn: () => dailyFlowAPI.startDay(),
    onSuccess: (resp) => {
      const data = resp?.data?.data;
      if (data) {
        setDayData(data);
        setPlan(data.plan);
        setCurrentBlock(data.plan?.blocks?.find(b => b.status === 'pending') || null);
        setProgress({ completed: 0, total: data.plan?.blocks?.length || 0, percentage: 0, xp_earned: 0 });
        setStage('plan');
        toast.success(data.greeting || 'يومك بدأ! 🚀');
      }
    },
    onError: () => toast.error('فشل بدء اليوم — حاول مرة تانية'),
  });

  // ── Complete Block ──────────────────────────────────────────────────────────
  const completeBlockMutation = useMutation({
    mutationFn: (block) => dailyFlowAPI.completeBlock({ block_id: block.id }),
    onSuccess: (resp) => {
      const data = resp?.data?.data;
      if (data) {
        setLastReward(data);
        setProgress(data.progress);
        // Update plan blocks locally
        if (plan) {
          const updatedBlocks = plan.blocks.map(b =>
            b.id === data.completed_block?.id ? { ...b, status: 'completed' } : b
          );
          setPlan({ ...plan, blocks: updatedBlocks });
        }
        setCurrentBlock(data.next_block);
        setStage('reward');
      }
    },
    onError: () => toast.error('فشل إكمال البلوك'),
  });

  // ── Skip Block ─────────────────────────────────────────────────────────────
  const skipBlockMutation = useMutation({
    mutationFn: ({ block, reason }) => dailyFlowAPI.skipBlock({ block_id: block.id, reason }),
    onSuccess: (resp) => {
      const data = resp?.data?.data;
      if (data) {
        if (plan) {
          const updatedBlocks = plan.blocks.map(b =>
            b.id === data.skipped_block?.id ? { ...b, status: 'skipped' } : b
          );
          setPlan({ ...plan, blocks: updatedBlocks });
        }
        setCurrentBlock(data.next_block);
        toast(data.recovery_message || 'مفيش مشكلة — نكمل! 💪', { icon: '💪' });
        setStage('plan');
      }
    },
  });

  // ── End Day ────────────────────────────────────────────────────────────────
  const endDayMutation = useMutation({
    mutationFn: (reflectionText) => dailyFlowAPI.endDay({ reflection_text: reflectionText }),
    onSuccess: (resp) => {
      const data = resp?.data?.data;
      if (data) {
        setNarrative(data);
        setStage('narrative');
        toast.success(data.title || 'يومك انتهى! 🌙');
        queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      }
    },
    onError: () => toast.error('فشل إنهاء اليوم'),
  });

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleStartDay = useCallback(() => startDayMutation.mutate(), []);

  const handleSelectBlock = useCallback((block) => {
    setCurrentBlock(block);
    setStage('execute');
  }, []);

  const handleCompleteBlock = useCallback((block) => {
    completeBlockMutation.mutate(block);
  }, []);

  const handleSkipBlock = useCallback((block, reason) => {
    skipBlockMutation.mutate({ block, reason });
  }, []);

  const handleNextFromReward = useCallback(() => {
    if (lastReward?.next_block) {
      setCurrentBlock(lastReward.next_block);
      setStage('execute');
    } else {
      setStage('plan');
    }
  }, [lastReward]);

  const handleEndDay = useCallback(() => {
    endDayMutation.mutate('');
  }, []);

  const handleRestart = useCallback(async () => {
    // Reset day state and go back to start screen
    try {
      await dailyFlowAPI.resetDay();
      setStage('loading');
      setPlan(null);
      setCurrentBlock(null);
      setProgress(null);
      setLastReward(null);
      setNarrative(null);
      // Reload fresh
      loadDayStatus();
      toast.success('يوم جديد — يلا نبدأ! 🔄');
    } catch {
      setStage('start');
    }
  }, [loadDayStatus]);

  const handleBackToPlan = useCallback(() => {
    setStage('plan');
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (stage === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (stage === 'start') {
    return <StartDayScreen onStartDay={handleStartDay} isLoading={startDayMutation.isPending} stats={dayStats} />;
  }

  if (stage === 'plan') {
    return (
      <DailyPlanTimeline
        plan={plan}
        currentBlock={currentBlock}
        progress={progress}
        onSelectBlock={handleSelectBlock}
        onEndDay={handleEndDay}
      />
    );
  }

  if (stage === 'execute') {
    return (
      <ExecutionLoop
        block={currentBlock}
        onComplete={handleCompleteBlock}
        onSkip={handleSkipBlock}
        onBack={handleBackToPlan}
      />
    );
  }

  if (stage === 'reward') {
    return (
      <RewardMoment
        reward={lastReward?.reward}
        goalProgress={lastReward?.goal_progress}
        nextBlock={lastReward?.next_block}
        momentum={lastReward?.momentum}
        onNext={handleNextFromReward}
        onEndDay={handleEndDay}
        allDone={lastReward?.all_done}
      />
    );
  }

  if (stage === 'narrative') {
    return <DayNarrative narrative={narrative} onRestart={handleRestart} />;
  }

  return null;
}
