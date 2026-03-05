/**
 * Mood View - Daily Mood Tracking
 * =================================
 * تتبع المزاج اليومي مع التحليل والتاريخ
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, TrendingUp, Calendar, ChevronDown, ChevronUp, Plus, Smile } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Area, AreaChart } from 'recharts';
import { moodAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const MOOD_EMOJIS = [
  { score: 1, emoji: '😭', label: 'مروّع', color: '#EF4444' },
  { score: 2, emoji: '😢', label: 'حزين جداً', color: '#F97316' },
  { score: 3, emoji: '😞', label: 'محبط', color: '#F59E0B' },
  { score: 4, emoji: '😕', label: 'متعب', color: '#EAB308' },
  { score: 5, emoji: '😐', label: 'عادي', color: '#84CC16' },
  { score: 6, emoji: '🙂', label: 'لا بأس', color: '#22C55E' },
  { score: 7, emoji: '😊', label: 'جيد', color: '#10B981' },
  { score: 8, emoji: '😄', label: 'سعيد', color: '#06B6D4' },
  { score: 9, emoji: '😁', label: 'ممتاز', color: '#6366F1' },
  { score: 10, emoji: '🤩', label: 'رائع!', color: '#8B5CF6' },
];

const EMOTION_TAGS = [
  '😰 قلق', '😤 متوتر', '😌 هادئ', '💪 متحمس', '🎯 مركّز',
  '😴 متعب', '🤔 متفكر', '🥳 سعيد', '😔 حزين', '🔥 نشيط',
  '🌟 ملهَم', '😎 واثق', '🤯 مرهق', '🕊️ مرتاح', '💭 مشتت',
];

export default function MoodView() {
  const [selectedScore, setSelectedScore] = useState(7);
  const [selectedEmotions, setSelectedEmotions] = useState([]);
  const [note, setNote] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const queryClient = useQueryClient();

  // Today's mood
  const { data: todayData } = useQuery({
    queryKey: ['mood-today'],
    queryFn: () => moodAPI.getTodayMood(),
  });

  // Mood history/stats
  const { data: statsData } = useQuery({
    queryKey: ['mood-stats'],
    queryFn: () => moodAPI.getMoodStats(30),
  });

  // Mood log
  const { data: logData } = useQuery({
    queryKey: ['mood-log'],
    queryFn: () => moodAPI.getMoodLog(14),
    enabled: showHistory,
  });

  const logMoodMutation = useMutation({
    mutationFn: () => moodAPI.logMood({
      mood_score: selectedScore,
      emotions: selectedEmotions,
      note,
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['mood-today'] });
      queryClient.invalidateQueries({ queryKey: ['mood-stats'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success(data?.message || 'تم تسجيل مزاجك 💙');
      setNote('');
      setSelectedEmotions([]);
    },
    onError: () => toast.error('فشل في تسجيل المزاج'),
  });

  const todayMood = todayData?.data;
  const stats = statsData?.data;
  const chartData = stats?.trend?.map(d => ({
    date: d.date,
    score: d.mood_score,
  })) || [];

  const toggleEmotion = (emotion) => {
    setSelectedEmotions(prev =>
      prev.includes(emotion)
        ? prev.filter(e => e !== emotion)
        : [...prev, emotion]
    );
  };

  const currentEmoji = MOOD_EMOJIS.find(m => m.score === selectedScore);

  return (
    <div className="space-y-6 max-w-3xl mx-auto" dir="rtl">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-black text-white">تتبع المزاج</h2>
        <p className="text-sm text-gray-400">كيف حالك اليوم؟</p>
      </div>

      {/* Today's Entry OR Log Form */}
      {todayMood?.logged_today ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-6 text-center"
        >
          <div className="text-6xl mb-3">
            {MOOD_EMOJIS.find(m => m.score === todayMood.mood_score)?.emoji || '😊'}
          </div>
          <h3 className="text-xl font-bold text-white mb-1">
            {MOOD_EMOJIS.find(m => m.score === todayMood.mood_score)?.label}
          </h3>
          <p className="text-gray-400 text-sm">سجّلت مزاجك اليوم</p>
          {todayMood.note && (
            <p className="mt-3 text-gray-300 text-sm glass-card p-3">{todayMood.note}</p>
          )}
          {todayMood.ai_insight && (
            <div className="mt-4 p-3 bg-primary-500/10 border border-primary-500/20 rounded-xl text-sm text-primary-300">
              💡 {todayMood.ai_insight}
            </div>
          )}
        </motion.div>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-6 space-y-5"
        >
          {/* Score Selector */}
          <div className="text-center">
            <div className="text-7xl mb-2 transition-all duration-300">{currentEmoji?.emoji}</div>
            <p className="text-white font-bold text-lg">{currentEmoji?.label}</p>
          </div>

          {/* Slider */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>😭 سيء</span>
              <span className="font-bold" style={{ color: currentEmoji?.color }}>{selectedScore}/10</span>
              <span>🤩 رائع</span>
            </div>
            <input
              type="range"
              min="1"
              max="10"
              value={selectedScore}
              onChange={(e) => setSelectedScore(Number(e.target.value))}
              className="w-full h-3 rounded-full appearance-none cursor-pointer"
              style={{ accentColor: currentEmoji?.color }}
            />
            <div className="flex justify-between">
              {MOOD_EMOJIS.map(m => (
                <button
                  key={m.score}
                  onClick={() => setSelectedScore(m.score)}
                  className={`text-lg transition-all ${selectedScore === m.score ? 'scale-150' : 'opacity-40 hover:opacity-70'}`}
                >
                  {m.emoji}
                </button>
              ))}
            </div>
          </div>

          {/* Emotion Tags */}
          <div>
            <p className="text-sm text-gray-400 mb-2">ما الذي تشعر به؟</p>
            <div className="flex flex-wrap gap-2">
              {EMOTION_TAGS.map(emotion => (
                <button
                  key={emotion}
                  onClick={() => toggleEmotion(emotion)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                    selectedEmotions.includes(emotion)
                      ? 'border-primary-500 bg-primary-500/20 text-primary-300'
                      : 'border-white/10 text-gray-400 hover:border-white/20'
                  }`}
                >
                  {emotion}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="ملاحظة اختيارية... ما الذي يؤثر في مزاجك اليوم؟"
            className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-gray-300 placeholder-gray-600 resize-none focus:outline-none focus:border-primary-500/50"
            rows={3}
          />

          <button
            onClick={() => logMoodMutation.mutate()}
            disabled={logMoodMutation.isPending}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2"
          >
            <Heart size={18} />
            {logMoodMutation.isPending ? 'جاري الحفظ...' : 'تسجيل المزاج'}
          </button>
        </motion.div>
      )}

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-3">
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-black gradient-text">{stats.average?.toFixed(1) || '-'}</div>
            <div className="text-xs text-gray-400 mt-1">متوسط المزاج</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-black text-green-400">{stats.streak || 0}</div>
            <div className="text-xs text-gray-400 mt-1">أيام متتالية 🔥</div>
          </div>
          <div className="glass-card p-4 text-center">
            <div className="text-2xl font-black text-purple-400">{stats.total_entries || 0}</div>
            <div className="text-xs text-gray-400 mt-1">إجمالي السجلات</div>
          </div>
        </div>
      )}

      {/* Mood Trend Chart */}
      {chartData.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card p-5"
        >
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={18} className="text-primary-400" />
            <h3 className="font-bold text-white text-sm">اتجاه المزاج - 30 يوم</h3>
          </div>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6C63FF" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#6C63FF" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 10 }} tickFormatter={d => d?.slice(5)} />
              <YAxis domain={[1, 10]} tick={{ fill: '#9CA3AF', fontSize: 10 }} width={20} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid rgba(108,99,255,0.3)', borderRadius: 8 }}
                labelStyle={{ color: '#9CA3AF' }}
                formatter={(v) => [v, 'المزاج']}
              />
              <Area type="monotone" dataKey="score" stroke="#6C63FF" fill="url(#moodGrad)" strokeWidth={2} dot={{ fill: '#6C63FF', r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* History Toggle */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="w-full glass-card p-3 text-gray-400 text-sm flex items-center justify-center gap-2 hover:text-white transition-colors"
      >
        <Calendar size={16} />
        {showHistory ? 'إخفاء السجل' : 'عرض سجل المزاج'}
        {showHistory ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>

      <AnimatePresence>
        {showHistory && logData?.data?.entries && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-2"
          >
            {logData.data.entries.map((entry, i) => {
              const moodInfo = MOOD_EMOJIS.find(m => m.score === entry.mood_score);
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="glass-card p-4 flex items-center gap-4"
                >
                  <span className="text-3xl">{moodInfo?.emoji}</span>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-semibold text-sm">{moodInfo?.label}</span>
                      <span className="text-xs text-gray-500">
                        {new Date(entry.created_at || entry.createdAt).toLocaleDateString('ar-SA', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                    </div>
                    {entry.emotions?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {entry.emotions.map((e, j) => (
                          <span key={j} className="text-xs text-gray-500 bg-white/5 px-2 py-0.5 rounded-full">{e}</span>
                        ))}
                      </div>
                    )}
                    {entry.note && <p className="text-xs text-gray-400 mt-1">{entry.note}</p>}
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-black" style={{ color: moodInfo?.color }}>{entry.mood_score}</div>
                    <div className="text-xs text-gray-500">/10</div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
