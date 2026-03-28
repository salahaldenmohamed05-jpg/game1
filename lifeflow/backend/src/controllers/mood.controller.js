/**
 * Mood Controller
 * ================
 * يتحكم في تتبع وتحليل المزاج اليومي
 * "كيف كان مزاجك اليوم؟"
 */

const MoodEntry = require('../models/mood.model');
const { aiService } = require('../ai/ai.service');
const logger = require('../utils/logger');
const moment = require('moment-timezone');
const { Op } = require('sequelize');

/**
 * @route   POST /api/v1/mood/check-in
 * @desc    Log today's mood | تسجيل مزاج اليوم
 */
exports.checkIn = async (req, res) => {
  try {
    const {
      mood_score: rawMoodScore, score, emotions = [], energy_level,
      stress_level, focus_level, factors,
      journal_entry, period,
    } = req.body;
    const mood_score = rawMoodScore || score;  // Accept both 'mood_score' and 'score'

    const timezone = req.user.timezone || 'Africa/Cairo';
    const today = moment().tz(timezone).format('YYYY-MM-DD');
    const now = moment().tz(timezone);

    // Determine period of day
    const hour = now.hour();
    const autoPeriod = period || (
      hour < 12 ? 'morning' :
      hour < 17 ? 'afternoon' :
      hour < 21 ? 'evening' : 'night'
    );

    // Check if already logged today, update if so
    const [entry, created] = await MoodEntry.findOrCreate({
      where: { user_id: req.user.id, entry_date: today },
      defaults: {
        user_id: req.user.id,
        entry_date: today,
        entry_time: now.format('HH:mm:ss'),
        mood_score,
        emotions,
        energy_level,
        stress_level,
        focus_level,
        factors: factors || { positive: [], negative: [] },
        journal_entry,
        period: autoPeriod,
      },
    });

    if (!created) {
      await entry.update({ mood_score, emotions, energy_level, stress_level, focus_level, factors, journal_entry, period: autoPeriod });
    }

    // Get AI analysis & recommendation
    try {
      const aiAnalysis = await aiService.analyzeMood(entry, req.user);
      await entry.update({
        ai_analysis: aiAnalysis.analysis,
        ai_recommendation: aiAnalysis.recommendation,
      });
    } catch (aiErr) {
      logger.warn('AI mood analysis failed:', aiErr.message);
    }

    const moodEmoji = getMoodEmoji(mood_score);
    const moodMessage = getMoodMessage(mood_score);

    res.status(created ? 201 : 200).json({
      success: true,
      message: `${moodEmoji} ${moodMessage}`,
      data: entry,
    });
  } catch (error) {
    logger.error('Mood check-in error:', error);
    res.status(500).json({ success: false, message: 'فشل في تسجيل المزاج' });
  }
};

/**
 * @route   GET /api/v1/mood/today
 * @desc    Get today's mood entry
 */
exports.getTodayMood = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const today = moment().tz(timezone).format('YYYY-MM-DD');

    const entry = await MoodEntry.findOne({
      where: { user_id: req.user.id, entry_date: today },
    });

    res.json({
      success: true,
      data: entry,
      has_checked_in: !!entry,
      prompt: 'كيف كان مزاجك اليوم؟',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب مزاج اليوم' });
  }
};

/**
 * @route   GET /api/v1/mood/history
 * @desc    Get mood history with analytics
 */
exports.getMoodHistory = async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const timezone = req.user.timezone || 'Africa/Cairo';
    const startDate = moment().tz(timezone).subtract(parseInt(days), 'days').format('YYYY-MM-DD');

    const entries = await MoodEntry.findAll({
      where: {
        user_id: req.user.id,
        entry_date: { [Op.gte]: startDate },
      },
      order: [['entry_date', 'DESC']],
    });

    const analytics = analyzeMoodTrend(entries);

    res.json({ success: true, data: { entries, analytics } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب سجل المزاج' });
  }
};

/**
 * @route   GET /api/v1/mood/analytics
 * @desc    Deep mood analytics | تحليل معمق للمزاج
 */
exports.getMoodAnalytics = async (req, res) => {
  try {
    const timezone = req.user.timezone || 'Africa/Cairo';
    const thirtyDaysAgo = moment().tz(timezone).subtract(30, 'days').format('YYYY-MM-DD');

    const entries = await MoodEntry.findAll({
      where: {
        user_id: req.user.id,
        entry_date: { [Op.gte]: thirtyDaysAgo },
      },
      order: [['entry_date', 'ASC']],
    });

    const analytics = {
      average_mood: calculateAverage(entries, 'mood_score'),
      average_energy: calculateAverage(entries, 'energy_level'),
      average_stress: calculateAverage(entries, 'stress_level'),
      average_focus: calculateAverage(entries, 'focus_level'),
      mood_trend: getMoodTrend(entries),
      best_day_of_week: getBestDayOfWeek(entries),
      worst_day_of_week: getWorstDayOfWeek(entries),
      common_emotions: getCommonEmotions(entries),
      common_positive_factors: getCommonFactors(entries, 'positive'),
      common_negative_factors: getCommonFactors(entries, 'negative'),
      mood_by_day: entries.map(e => ({ date: e.entry_date, score: e.mood_score })),
    };

    // AI insight
    try {
      analytics.ai_insight = await aiService.getMoodInsight(entries, req.user);
    } catch (e) {
      logger.warn('AI mood insight failed');
    }

    res.json({ success: true, data: analytics });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في تحليل المزاج' });
  }
};

// =============================================
// Helper functions
// =============================================

function getMoodEmoji(score) {
  if (score >= 9) return '🤩';
  if (score >= 7) return '😊';
  if (score >= 5) return '😐';
  if (score >= 3) return '😔';
  return '😞';
}

function getMoodMessage(score) {
  if (score >= 9) return 'رائع! يوم استثنائي!';
  if (score >= 7) return 'يوم جيد، استمر كذلك!';
  if (score >= 5) return 'يوم معتدل، كل يوم هو فرصة جديدة';
  if (score >= 3) return 'آسف لسماع ذلك، هل يمكنك مشاركة ما تشعر به؟';
  return 'يبدو أن اليوم كان صعباً، لا تنسَ الاعتناء بنفسك';
}

function analyzeMoodTrend(entries) {
  if (!entries.length) return null;
  const avg = entries.reduce((sum, e) => sum + e.mood_score, 0) / entries.length;
  const recent = entries.slice(0, 7);
  const recentAvg = recent.reduce((sum, e) => sum + e.mood_score, 0) / (recent.length || 1);
  return {
    overall_average: avg.toFixed(1),
    recent_average: recentAvg.toFixed(1),
    trend: recentAvg > avg ? 'improving' : recentAvg < avg ? 'declining' : 'stable',
    total_entries: entries.length,
  };
}

function calculateAverage(entries, field) {
  const valid = entries.filter(e => e[field] !== null);
  if (!valid.length) return null;
  return (valid.reduce((sum, e) => sum + e[field], 0) / valid.length).toFixed(1);
}

function getMoodTrend(entries) {
  return entries.map(e => ({ date: e.entry_date, score: e.mood_score }));
}

function getBestDayOfWeek(entries) {
  const days = {};
  entries.forEach(e => {
    const day = moment(e.entry_date).day();
    if (!days[day]) days[day] = { total: 0, count: 0 };
    days[day].total += e.mood_score;
    days[day].count++;
  });
  const names = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const avgs = Object.entries(days).map(([d, v]) => ({ day: names[d], avg: v.total / v.count }));
  return avgs.sort((a, b) => b.avg - a.avg)[0]?.day || null;
}

function getWorstDayOfWeek(entries) {
  const days = {};
  entries.forEach(e => {
    const day = moment(e.entry_date).day();
    if (!days[day]) days[day] = { total: 0, count: 0 };
    days[day].total += e.mood_score;
    days[day].count++;
  });
  const names = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const avgs = Object.entries(days).map(([d, v]) => ({ day: names[d], avg: v.total / v.count }));
  return avgs.sort((a, b) => a.avg - b.avg)[0]?.day || null;
}

function getCommonEmotions(entries) {
  const map = {};
  entries.forEach(e => {
    (e.emotions || []).forEach(em => { map[em] = (map[em] || 0) + 1; });
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
}

function getCommonFactors(entries, type) {
  const map = {};
  entries.forEach(e => {
    const factors = e.factors?.[type] || [];
    factors.forEach(f => { map[f] = (map[f] || 0) + 1; });
  });
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count }));
}
