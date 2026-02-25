/**
 * Mood View - Daily Mood Tracking
 * =================================
 * تتبع المزاج اليومي مع التحليل
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Heart, TrendingUp, BarChart3 } from 'lucide-react';
import { moodAPI } from '../../utils/api';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import toast from 'react-hot-toast';

const EMOTIONS_AR = ['سعيد 😊', 'متحمس 🔥', 'هادئ 😌', 'ممتن 🙏', 'مركّز 🎯', 'قلق 😟', 'تعب 😴', 'محبط 😞', 'غاضب 😠', 'متوتر 😰', 'حزين 😢', 'بخير 🙂'];
const FACTORS_POSITIVE = ['إنجاز مهمة', 'مارست رياضة', 'نوم جيد', 'وقت مع الأهل', 'تقدم في العمل', 'طعام صحي', 'قراءة', 'تأمل'];
const FACTORS_NEGATIVE = ['ضغط عمل', 'قلة نوم', 'مشاكل شخصية', 'كثرة مهام', 'إجهاد', 'خلافات', 'أخبار سيئة', 'جو سيئ'];

export default function MoodView() {
  const [selectedEmotions, setSelectedEmotions] = useState([]);
  const [posFactors, setPosFactors] = useState([]);
  const [negFactors, setNegFactors] = useState([]);
  const [moodScore, setMoodScore] = useState(7);
  const [energyLevel, setEnergyLevel] = useState(3);
  const [stressLevel, setStressLevel] = useState(2);
  const [journalEntry, setJournalEntry] = useState('');
  const [activeTab, setActiveTab] = useState('today');
  const queryClient = useQueryClient();

  const { data: todayMood } = useQuery({ queryKey: ['mood-today'], queryFn: moodAPI.getToday });
  const { data: historyData } = useQuery({ queryKey: ['mood-history'], queryFn: () => moodAPI.getHistory({ days: 30 }) });
  const { data: analyticsData } = useQuery({ queryKey: ['mood-analytics'], queryFn: moodAPI.getAnalytics });

  const checkInMutation = useMutation({
    mutationFn: moodAPI.checkIn,
    onSuccess: (data) => {
      queryClient.invalidateQueries(['mood-today', 'mood-history', 'dashboard']);
      toast.success(data?.message || 'تم تسجيل مزاجك 💙');
    },
  });

  const toggleEmotion = (e) => {
    setSelectedEmotions(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  };
  const toggleFactor = (f, type) => {
    if (type === 'positive') setPosFactors(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
    else setNegFactors(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  };

  const handleSubmit = () => {
    checkInMutation.mutate({
      mood_score: moodScore,
      emotions: selectedEmotions.map(e => e.split(' ')[0]),
      energy_level: energyLevel,
      stress_level: stressLevel,
      factors: { positive: posFactors, negative: negFactors },
      journal_entry: journalEntry,
    });
  };

  const todayEntry = todayMood?.data;
  const moodHistory = historyData?.data?.entries || [];
  const analytics = analyticsData?.data;

  const chartData = moodHistory.slice(0, 14).reverse().map(e => ({
    date: new Date(e.entry_date).toLocaleDateString('ar', { day: '2-digit', month: '2-digit' }),
    مزاج: e.mood_score,
    طاقة: e.energy_level || 0,
  }));

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div>
        <h2 className="text-2xl font-black text-white">المزاج اليومي</h2>
        <p className="text-sm text-gray-400">كيف كان مزاجك اليوم؟</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2">
        {['today', 'history', 'analytics'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-4 py-1.5 rounded-full text-sm transition-all ${activeTab === tab ? 'bg-primary-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            {{ today: '📝 اليوم', history: '📊 السجل', analytics: '🧠 تحليل' }[tab]}
          </button>
        ))}
      </div>

      {/* TODAY TAB */}
      {activeTab === 'today' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
          {todayEntry ? (
            <div className="glass-card p-6 text-center">
              <div className="text-5xl mb-3">{getMoodEmoji(todayEntry.mood_score)}</div>
              <div className="text-3xl font-black gradient-text mb-1">{todayEntry.mood_score}/10</div>
              <p className="text-gray-400 mb-4">{getMoodLabel(todayEntry.mood_score)}</p>
              {todayEntry.ai_recommendation && (
                <div className="bg-primary-500/10 border border-primary-500/20 rounded-xl p-4 text-sm text-gray-300 text-right">
                  <p className="text-xs text-primary-400 font-semibold mb-1 flex items-center gap-1">🧠 رأي LifeFlow</p>
                  {todayEntry.ai_recommendation}
                </div>
              )}
              <button onClick={() => queryClient.setQueryData(['mood-today'], { data: null })}
                className="mt-4 text-xs text-gray-500 hover:text-primary-400">تحديث تسجيل اليوم</button>
            </div>
          ) : (
            <div className="glass-card p-6 space-y-5">
              {/* Mood Score Slider */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <label className="text-sm font-semibold text-white">كيف مزاجك؟</label>
                  <span className="text-2xl">{getMoodEmoji(moodScore)} <span className="text-xl font-black gradient-text">{moodScore}</span></span>
                </div>
                <input type="range" min="1" max="10" value={moodScore}
                  onChange={e => setMoodScore(parseInt(e.target.value))}
                  className="mood-slider w-full" />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>سيء جداً 😞</span><span>رائع جداً 🤩</span>
                </div>
              </div>

              {/* Emotions */}
              <div>
                <label className="text-sm font-semibold text-white block mb-2">ما شعورك؟ (اختر كل ما ينطبق)</label>
                <div className="flex flex-wrap gap-2">
                  {EMOTIONS_AR.map(e => (
                    <button key={e} onClick={() => toggleEmotion(e)}
                      className={`px-3 py-1 rounded-full text-xs transition-all ${selectedEmotions.includes(e) ? 'bg-primary-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
                      {e}
                    </button>
                  ))}
                </div>
              </div>

              {/* Energy & Stress */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-400 block mb-2">مستوى الطاقة ⚡</label>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onClick={() => setEnergyLevel(n)}
                        className={`flex-1 h-8 rounded-lg text-xs transition-all ${energyLevel >= n ? 'bg-yellow-500' : 'bg-white/10'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs text-gray-400 block mb-2">مستوى التوتر 🌀</label>
                  <div className="flex gap-1">
                    {[1,2,3,4,5].map(n => (
                      <button key={n} onClick={() => setStressLevel(n)}
                        className={`flex-1 h-8 rounded-lg text-xs transition-all ${stressLevel >= n ? 'bg-red-500' : 'bg-white/10'}`}>
                        {n}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Factors */}
              <div>
                <label className="text-xs text-gray-400 block mb-2">ما أثّر عليك إيجاباً؟ 🌟</label>
                <div className="flex flex-wrap gap-1.5">
                  {FACTORS_POSITIVE.map(f => (
                    <button key={f} onClick={() => toggleFactor(f, 'positive')}
                      className={`px-2 py-1 rounded-lg text-xs transition-all ${posFactors.includes(f) ? 'bg-green-500/30 border border-green-500/50 text-green-300' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 block mb-2">ما أثّر عليك سلباً؟ 😔</label>
                <div className="flex flex-wrap gap-1.5">
                  {FACTORS_NEGATIVE.map(f => (
                    <button key={f} onClick={() => toggleFactor(f, 'negative')}
                      className={`px-2 py-1 rounded-lg text-xs transition-all ${negFactors.includes(f) ? 'bg-red-500/30 border border-red-500/50 text-red-300' : 'bg-white/5 text-gray-500 hover:bg-white/10'}`}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* Journal */}
              <div>
                <label className="text-xs text-gray-400 block mb-1">يوميات (اختياري) 📓</label>
                <textarea value={journalEntry} onChange={e => setJournalEntry(e.target.value)}
                  className="input-field h-20 resize-none" placeholder="شارك أكثر عن يومك..." />
              </div>

              <button onClick={handleSubmit} disabled={checkInMutation.isPending} className="btn-primary w-full">
                {checkInMutation.isPending ? '⏳ جارٍ الحفظ...' : `${getMoodEmoji(moodScore)} تسجيل مزاجي`}
              </button>
            </div>
          )}
        </motion.div>
      )}

      {/* HISTORY TAB */}
      {activeTab === 'history' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
          {chartData.length > 0 ? (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-4">مزاجك خلال آخر 14 يوم</h3>
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="moodGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6C63FF" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6C63FF" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94A3B8' }} />
                  <YAxis domain={[0, 10]} tick={{ fontSize: 10, fill: '#94A3B8' }} />
                  <Tooltip contentStyle={{ background: '#16213E', border: '1px solid rgba(108,99,255,0.3)', borderRadius: '8px', color: '#E2E8F0', direction: 'rtl' }} />
                  <Area type="monotone" dataKey="مزاج" stroke="#6C63FF" fill="url(#moodGrad)" strokeWidth={2} dot={{ fill: '#6C63FF', r: 3 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Heart size={40} className="mx-auto mb-3 text-gray-700" />
              <p>سجّل مزاجك يومياً لرؤية المخطط</p>
            </div>
          )}

          <div className="space-y-2">
            {moodHistory.slice(0, 10).map(entry => (
              <div key={entry.id} className="glass-card p-4 flex items-center gap-3">
                <div className="text-2xl">{getMoodEmoji(entry.mood_score)}</div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white">{new Date(entry.entry_date).toLocaleDateString('ar', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                    <span className="font-bold gradient-text">{entry.mood_score}/10</span>
                  </div>
                  {entry.emotions?.length > 0 && (
                    <div className="flex gap-1 mt-1 flex-wrap">
                      {entry.emotions.slice(0, 3).map(e => (
                        <span key={e} className="text-xs bg-white/5 px-2 py-0.5 rounded-full text-gray-400">{e}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ANALYTICS TAB */}
      {activeTab === 'analytics' && analytics && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'متوسط المزاج', value: analytics.average_mood, unit: '/10', icon: '❤️' },
              { label: 'متوسط الطاقة', value: analytics.average_energy, unit: '/5', icon: '⚡' },
              { label: 'متوسط التوتر', value: analytics.average_stress, unit: '/5', icon: '🌀' },
              { label: 'أفضل يوم', value: analytics.best_day_of_week, unit: '', icon: '🌟' },
            ].map(stat => (
              <div key={stat.label} className="glass-card p-4 text-center">
                <div className="text-2xl mb-1">{stat.icon}</div>
                <div className="text-xl font-black gradient-text">{stat.value}{stat.unit}</div>
                <div className="text-xs text-gray-400">{stat.label}</div>
              </div>
            ))}
          </div>

          {analytics.ai_insight && (
            <div className="glass-card p-5 bg-gradient-to-br from-primary-500/10 to-transparent">
              <div className="text-sm font-semibold text-primary-400 mb-2 flex items-center gap-2">
                <span>🧠</span> تحليل LifeFlow الذكي
              </div>
              <p className="text-sm text-gray-300 leading-relaxed">{analytics.ai_insight}</p>
            </div>
          )}

          {analytics.common_emotions?.length > 0 && (
            <div className="glass-card p-5">
              <h3 className="text-sm font-semibold text-gray-300 mb-3">المشاعر الأكثر تكراراً</h3>
              <div className="space-y-2">
                {analytics.common_emotions.map(e => (
                  <div key={e.name} className="flex items-center gap-2">
                    <span className="text-xs text-gray-400 w-20">{e.name}</span>
                    <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-primary-500 rounded-full" style={{ width: `${(e.count / analytics.common_emotions[0].count) * 100}%` }}></div>
                    </div>
                    <span className="text-xs text-gray-500">{e.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

function getMoodEmoji(score) {
  if (score >= 9) return '🤩';
  if (score >= 7) return '😊';
  if (score >= 5) return '😐';
  if (score >= 3) return '😔';
  return '😞';
}
function getMoodLabel(score) {
  if (score >= 9) return 'رائع جداً!';
  if (score >= 7) return 'جيد';
  if (score >= 5) return 'معتدل';
  if (score >= 3) return 'ليس جيداً';
  return 'سيء';
}
