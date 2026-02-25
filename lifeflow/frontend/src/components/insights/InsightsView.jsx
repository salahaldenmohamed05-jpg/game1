/**
 * Insights View - AI-powered reports
 * =====================================
 * الرؤى والتقارير بالذكاء الاصطناعي
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Brain, TrendingUp, BarChart2, Zap, RefreshCw } from 'lucide-react';
import { insightAPI } from '../../utils/api';
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function InsightsView() {
  const [activeTab, setActiveTab] = useState('daily');

  const { data: dailyData, isLoading: loadingDaily, refetch: refetchDaily } = useQuery({
    queryKey: ['insight-daily'], queryFn: insightAPI.getDailySummary,
    enabled: activeTab === 'daily',
  });

  const { data: weeklyData, isLoading: loadingWeekly, refetch: refetchWeekly } = useQuery({
    queryKey: ['insight-weekly'], queryFn: insightAPI.getWeeklyReport,
    enabled: activeTab === 'weekly',
  });

  const { data: behaviorData, isLoading: loadingBehavior } = useQuery({
    queryKey: ['insight-behavior'], queryFn: insightAPI.getBehaviorAnalysis,
    enabled: activeTab === 'behavior',
  });

  const { data: tipsData } = useQuery({
    queryKey: ['productivity-tips'], queryFn: insightAPI.getProductivityTips,
    enabled: activeTab === 'tips',
  });

  const tabs = [
    { id: 'daily', label: '📅 اليوم', icon: '📅' },
    { id: 'weekly', label: '📊 الأسبوع', icon: '📊' },
    { id: 'behavior', label: '🧠 السلوك', icon: '🧠' },
    { id: 'tips', label: '💡 نصائح', icon: '💡' },
  ];

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-black text-white">الرؤى والتقارير</h2>
        <p className="text-sm text-gray-400">تحليلات ذكية لحياتك</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-all ${activeTab === tab.id ? 'bg-primary-500 text-white' : 'bg-white/5 text-gray-400 hover:bg-white/10'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* DAILY SUMMARY */}
      {activeTab === 'daily' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {loadingDaily ? (
            <div className="space-y-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
          ) : dailyData?.data ? (
            <>
              <div className="glass-card p-6 bg-gradient-to-br from-primary-500/10 to-transparent">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-white">{dailyData.data.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">تم الإنشاء بواسطة LifeFlow AI</p>
                  </div>
                  <button onClick={refetchDaily} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all">
                    <RefreshCw size={14} />
                  </button>
                </div>
                <p className="text-sm text-gray-300 leading-relaxed">{dailyData.data.content}</p>
              </div>

              {/* Stats */}
              {dailyData.data.data && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-black text-primary-400">{dailyData.data.data.tasks?.completed || 0}</div>
                    <div className="text-xs text-gray-400">مهام مكتملة</div>
                    <div className="text-xs text-gray-600">/{dailyData.data.data.tasks?.total || 0}</div>
                  </div>
                  <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-black text-green-400">{dailyData.data.data.habits?.completed || 0}</div>
                    <div className="text-xs text-gray-400">عادات مكتملة</div>
                  </div>
                  <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-black gradient-text">{dailyData.data.data.productivity_score || 0}</div>
                    <div className="text-xs text-gray-400">نقاط إنتاجية</div>
                  </div>
                </div>
              )}

              {/* Recommendations */}
              {dailyData.data.recommendations?.length > 0 && (
                <div className="glass-card p-5">
                  <h4 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><Zap size={14} className="text-yellow-400" />توصيات لغداً</h4>
                  <ul className="space-y-2">
                    {dailyData.data.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-primary-400 mt-0.5">•</span> {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </motion.div>
      )}

      {/* WEEKLY REPORT */}
      {activeTab === 'weekly' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {loadingWeekly ? (
            <div className="skeleton h-64 rounded-2xl" />
          ) : weeklyData?.data ? (
            <>
              <div className="glass-card p-6 bg-gradient-to-br from-green-500/10 to-transparent">
                <h3 className="font-bold text-white mb-2">{weeklyData.data.title}</h3>
                <p className="text-sm text-gray-300 leading-relaxed">{weeklyData.data.content}</p>
              </div>

              {weeklyData.data.data && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-black text-primary-400">{weeklyData.data.data.tasks?.completion_rate}%</div>
                    <div className="text-xs text-gray-400">معدل إتمام المهام</div>
                  </div>
                  <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-black text-green-400">{weeklyData.data.data.habits?.consistency_rate}%</div>
                    <div className="text-xs text-gray-400">اتساق العادات</div>
                  </div>
                  <div className="glass-card p-4 text-center">
                    <div className="text-2xl font-black text-pink-400">{weeklyData.data.data.mood?.average || '--'}</div>
                    <div className="text-xs text-gray-400">متوسط المزاج</div>
                  </div>
                </div>
              )}

              {weeklyData.data.recommendations?.length > 0 && (
                <div className="glass-card p-5">
                  <h4 className="text-sm font-semibold text-white mb-3">توصيات للأسبوع القادم</h4>
                  <ul className="space-y-2">
                    {weeklyData.data.recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-green-400">✓</span> {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : null}
        </motion.div>
      )}

      {/* BEHAVIOR ANALYSIS */}
      {activeTab === 'behavior' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {loadingBehavior ? (
            <div className="skeleton h-64 rounded-2xl" />
          ) : behaviorData?.data ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="glass-card p-4 text-center">
                  <div className="text-2xl font-black text-primary-400">{behaviorData.data.task_completion_rate}%</div>
                  <div className="text-xs text-gray-400">معدل إتمام المهام</div>
                </div>
                <div className="glass-card p-4 text-center">
                  <div className="text-2xl font-black text-green-400">{behaviorData.data.habit_consistency}%</div>
                  <div className="text-xs text-gray-400">اتساق العادات</div>
                </div>
              </div>

              {behaviorData.data.peak_productivity_hours?.length > 0 && (
                <div className="glass-card p-5">
                  <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2"><TrendingUp size={14} className="text-primary-400" />ساعات الذروة الإنتاجية</h4>
                  <div className="flex gap-2 flex-wrap">
                    {behaviorData.data.peak_productivity_hours.map(h => (
                      <span key={h} className="px-3 py-1 bg-primary-500/20 text-primary-400 rounded-full text-sm font-semibold">{h}</span>
                    ))}
                  </div>
                </div>
              )}

              {behaviorData.data.ai_analysis && (
                <div className="glass-card p-5 bg-gradient-to-br from-primary-500/10 to-transparent">
                  <h4 className="text-sm font-semibold text-primary-400 mb-3 flex items-center gap-2"><Brain size={14} />تحليل AI لسلوكك</h4>
                  <p className="text-sm text-gray-300 mb-3">{behaviorData.data.ai_analysis.analysis}</p>
                  {behaviorData.data.ai_analysis.recommendations?.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-400 mb-2">التوصيات:</p>
                      <ul className="space-y-1">
                        {behaviorData.data.ai_analysis.recommendations.map((r, i) => (
                          <li key={i} className="text-xs text-gray-300 flex items-start gap-1.5"><span className="text-primary-400">→</span>{r}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </motion.div>
      )}

      {/* PRODUCTIVITY TIPS */}
      {activeTab === 'tips' && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
          {tipsData?.data?.tips ? (
            tipsData.data.tips.map((tip, idx) => (
              <motion.div key={idx} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.1 }}
                className="glass-card p-5">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center flex-shrink-0 text-lg">
                    {tip.category === 'time_management' ? '⏰' : tip.category === 'focus' ? '🎯' : tip.category === 'habits' ? '🏃' : '💡'}
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-sm mb-1">{tip.title}</h4>
                    <p className="text-xs text-gray-400">{tip.description}</p>
                    <div className="flex gap-2 mt-2">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${tip.difficulty === 'easy' ? 'bg-green-500/20 text-green-400' : tip.difficulty === 'medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}`}>
                        {{ easy: 'سهل', medium: 'متوسط', hard: 'صعب' }[tip.difficulty]}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-white/10 text-gray-400">{tip.category}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Brain size={40} className="mx-auto mb-3 text-gray-700" />
              <p>جارٍ تحليل بياناتك لتقديم نصائح مخصصة...</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
