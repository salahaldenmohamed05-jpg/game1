/**
 * Energy Mapping Service
 * =======================
 * Analyses when the user is most productive based on task completion times.
 * Builds personalized work schedules and energy heatmaps.
 */

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

const getModels = () => ({
  Task:           require('../models/task.model'),
  MoodEntry:      require('../models/mood.model'),
  EnergyProfile:  require('../models/energy_profile.model'),
});

// Hour labels (Arabic)
const HOUR_LABELS = {
  5: 'الفجر', 6: 'الفجر', 7: 'الصباح الباكر', 8: 'الصباح الباكر',
  9: 'الصباح', 10: 'الصباح', 11: 'قبل الظهر', 12: 'الظهر',
  13: 'بعد الظهر', 14: 'بعد الظهر', 15: 'العصر', 16: 'العصر',
  17: 'المساء', 18: 'المساء', 19: 'المساء', 20: 'الليل',
  21: 'الليل', 22: 'الليل المتأخر', 23: 'منتصف الليل',
};

const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// ─────────────────────────────────────────────────────────────────────────────
// BUILD / REFRESH ENERGY PROFILE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Rebuild the full energy profile from historical task data.
 * @param {string} userId
 * @param {string} timezone
 * @param {number} daysBack  How many days of history to analyse
 */
async function buildEnergyProfile(userId, timezone = 'Africa/Cairo', daysBack = 90) {
  const { Task, MoodEntry, EnergyProfile } = getModels();
  const tz    = timezone || 'Africa/Cairo';
  const since = moment.tz(tz).subtract(daysBack, 'days').toDate();

  try {
    // ── Fetch completed tasks ─────────────────────────────────────────────────
    const tasks = await Task.findAll({
      where: {
        user_id:    userId,
        status:     'completed',
        completed_at: { [Op.gte]: since },
      },
    });

    // ── Fetch mood entries for energy correlation ─────────────────────────────
    const moods = await MoodEntry.findAll({
      where: {
        user_id:    userId,
        createdAt: { [Op.gte]: since },
      },
    });

    if (tasks.length < 5) {
      logger.info(`Energy profile: insufficient data for user ${userId} (${tasks.length} tasks)`);
      return null;
    }

    // ── Build hourly heatmap ──────────────────────────────────────────────────
    const hourly = new Array(24).fill(0);
    const daily  = new Array(7).fill(0);

    tasks.forEach(t => {
      if (!t.completed_at) return;
      const dt   = moment(t.completed_at).tz(tz);
      hourly[dt.hour()]++;
      daily[dt.day()]++;
    });

    // ── Peak hours (top 3 hours by task count) ────────────────────────────────
    const hourlyRanked = hourly
      .map((v, i) => ({ hour: i, count: v }))
      .sort((a, b) => b.count - a.count);
    const peakHours = hourlyRanked.slice(0, 3).map(h => h.hour);

    // ── Deep work window (2-hour block with most completions) ─────────────────
    let bestWindowStart = 9;
    let bestWindowScore = 0;
    for (let h = 5; h <= 21; h++) {
      const score = (hourly[h] || 0) + (hourly[h + 1] || 0);
      if (score > bestWindowScore) {
        bestWindowScore = score;
        bestWindowStart = h;
      }
    }

    // ── Break times: 2 lowest-activity windows during work hours ─────────────
    const workHourly = hourlyRanked
      .filter(h => h.hour >= 8 && h.hour <= 20)
      .sort((a, b) => a.count - b.count);
    const breakTimes = workHourly
      .slice(0, 2)
      .map(h => `${String(h.hour).padStart(2, '0')}:00`);

    // ── Mood-energy correlation ───────────────────────────────────────────────
    const { highEnergyMoodAvg, lowEnergyMoodAvg, correlation } =
      computeMoodEnergyCorrelation(tasks, moods, peakHours, tz);

    // ── Upsert profile ────────────────────────────────────────────────────────
    const [profile] = await EnergyProfile.upsert({
      user_id:                 userId,
      hourly_task_completions: hourly,
      daily_task_completions:  daily,
      peak_hours:              peakHours,
      recommended_deep_work_start: `${String(bestWindowStart).padStart(2, '0')}:00`,
      recommended_deep_work_end:   `${String(Math.min(23, bestWindowStart + 2)).padStart(2, '0')}:00`,
      recommended_break_times: breakTimes,
      high_energy_mood_avg:    highEnergyMoodAvg,
      low_energy_mood_avg:     lowEnergyMoodAvg,
      energy_mood_correlation: correlation,
      data_points:             tasks.length,
      last_updated:            new Date(),
    });

    logger.info(`⚡ Energy profile built for user ${userId}: peak hours ${peakHours.join(', ')}`);
    return profile;

  } catch (error) {
    logger.error('Energy profile build error:', error.message);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET PROFILE WITH RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────────────────────

async function getEnergyInsights(userId) {
  const { EnergyProfile } = getModels();
  const profile = await EnergyProfile.findOne({ where: { user_id: userId } });

  if (!profile || profile.data_points < 5) {
    return {
      has_data: false,
      message: 'نحتاج إلى مزيد من البيانات لبناء خريطة طاقتك. أتمم بعض المهام وسنوفر لك تحليلاً خلال أسبوع!',
      minimum_tasks_needed: Math.max(0, 5 - (profile?.data_points || 0)),
    };
  }

  const peakHours       = profile.peak_hours || [];
  const hourly          = profile.hourly_task_completions || new Array(24).fill(0);
  const daily           = profile.daily_task_completions  || new Array(7).fill(0);
  const totalTasks      = hourly.reduce((s, v) => s + v, 0) || 1;

  // Normalize to percentages
  const hourlyPct  = hourly.map(v => Math.round((v / totalTasks) * 100));
  const dailyPct   = daily.map(v => Math.round((v / Math.max(1, daily.reduce((s, d) => s + d, 0))) * 100));

  // Best working day
  const bestDayIdx = daily.indexOf(Math.max(...daily));
  const bestDay    = DAY_NAMES[bestDayIdx] || 'غير محدد';

  // Recommended schedule
  const schedule = buildRecommendedSchedule(profile);

  return {
    has_data:  true,
    data_points: profile.data_points,
    last_updated: profile.last_updated,

    peak_hours:        peakHours,
    peak_hours_labels: peakHours.map(h => ({ hour: h, label: HOUR_LABELS[h] || `${h}:00` })),

    hourly_heatmap:  hourlyPct.map((pct, hour) => ({
      hour,
      label:      `${String(hour).padStart(2, '0')}:00`,
      percentage: pct,
      category:   HOUR_LABELS[hour] || '',
    })),

    daily_heatmap: dailyPct.map((pct, day) => ({
      day,
      label:      DAY_NAMES[day],
      percentage: pct,
    })),

    best_day:       bestDay,
    best_work_window: {
      start: profile.recommended_deep_work_start,
      end:   profile.recommended_deep_work_end,
      label: `${profile.recommended_deep_work_start} - ${profile.recommended_deep_work_end}`,
    },

    break_times:  profile.recommended_break_times || [],
    schedule,

    mood_energy: {
      high_energy_mood: profile.high_energy_mood_avg,
      low_energy_mood:  profile.low_energy_mood_avg,
      correlation:      profile.energy_mood_correlation,
      insight: buildMoodEnergyInsight(profile.energy_mood_correlation),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// RECOMMENDED DAILY SCHEDULE
// ─────────────────────────────────────────────────────────────────────────────

function buildRecommendedSchedule(profile) {
  const deepStart = profile.recommended_deep_work_start || '09:00';
  const deepEnd   = profile.recommended_deep_work_end   || '11:00';
  const breaks    = profile.recommended_break_times     || [];
  const peakH     = profile.peak_hours?.[0] || 9;

  const schedule = [
    {
      time:        '06:00 - 07:00',
      activity:    'إعداد الصباح',
      type:        'warmup',
      description: 'مراجعة المهام، التأمل، أو ممارسة الرياضة الخفيفة',
    },
    {
      time:        `${deepStart} - ${deepEnd}`,
      activity:    'وقت العمل العميق',
      type:        'deep_work',
      description: `ساعاتك الأعلى إنتاجية — خصص للمهام الصعبة والمهمة`,
    },
    {
      time:        breaks[0] ? `${breaks[0]}` : '11:00',
      activity:    'استراحة',
      type:        'break',
      description: '15 دقيقة: اشرب ماءً، تمشَّ، أبعد نظرك عن الشاشة',
    },
    {
      time:        '12:00 - 13:00',
      activity:    'المهام المتوسطة',
      type:        'medium_work',
      description: 'الرد على الرسائل، الاجتماعات، المهام الإدارية',
    },
    {
      time:        breaks[1] ? `${breaks[1]}` : '15:00',
      activity:    'استراحة بعد الظهر',
      type:        'break',
      description: 'قيلولة 20 دقيقة أو نزهة قصيرة',
    },
    {
      time:        '16:00 - 18:00',
      activity:    'المهام الإبداعية والتعلم',
      type:        'creative',
      description: 'قراءة، تطوير مهارات، مشاريع إبداعية',
    },
    {
      time:        '20:00 - 21:00',
      activity:    'مراجعة اليوم',
      type:        'review',
      description: 'راجع ما أتممت وخطط لغد',
    },
  ];

  return schedule;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function computeMoodEnergyCorrelation(tasks, moods, peakHours, tz) {
  if (moods.length === 0) return { highEnergyMoodAvg: 0, lowEnergyMoodAvg: 0, correlation: 0 };

  // Build day-level: task count and avg mood
  const dayData = {};

  tasks.forEach(t => {
    if (!t.completed_at) return;
    const day = moment(t.completed_at).tz(tz).format('YYYY-MM-DD');
    dayData[day] = dayData[day] || { tasks: 0, moods: [] };
    dayData[day].tasks++;
  });

  moods.forEach(m => {
    const day = moment(m.createdAt).tz(tz).format('YYYY-MM-DD');
    dayData[day] = dayData[day] || { tasks: 0, moods: [] };
    dayData[day].moods.push(m.mood_score || 5);
  });

  const days = Object.values(dayData).filter(d => d.moods.length > 0);
  if (days.length < 3) return { highEnergyMoodAvg: 0, lowEnergyMoodAvg: 0, correlation: 0 };

  const taskCounts = days.map(d => d.tasks);
  const moodAvgs   = days.map(d => d.moods.reduce((s, v) => s + v, 0) / d.moods.length);

  const median = taskCounts.sort((a, b) => a - b)[Math.floor(taskCounts.length / 2)];
  const highEnergy = days.filter(d => d.tasks >= median);
  const lowEnergy  = days.filter(d => d.tasks < median);

  const highEnergyMoodAvg = highEnergy.length > 0
    ? Math.round(highEnergy.reduce((s, d) => s + d.moods.reduce((ms, v) => ms + v, 0) / d.moods.length, 0) / highEnergy.length * 10) / 10
    : 0;
  const lowEnergyMoodAvg = lowEnergy.length > 0
    ? Math.round(lowEnergy.reduce((s, d) => s + d.moods.reduce((ms, v) => ms + v, 0) / d.moods.length, 0) / lowEnergy.length * 10) / 10
    : 0;

  // Pearson correlation approximation
  const n   = days.length;
  const tc  = days.map(d => d.tasks);
  const ma  = days.map(d => d.moods.reduce((s, v) => s + v, 0) / d.moods.length);
  const tcM = tc.reduce((s, v) => s + v, 0) / n;
  const maM = ma.reduce((s, v) => s + v, 0) / n;
  const num = tc.reduce((s, v, i) => s + (v - tcM) * (ma[i] - maM), 0);
  const den = Math.sqrt(
    tc.reduce((s, v) => s + (v - tcM) ** 2, 0) *
    ma.reduce((s, v) => s + (v - maM) ** 2, 0)
  );
  const correlation = den === 0 ? 0 : Math.round((num / den) * 100) / 100;

  return { highEnergyMoodAvg, lowEnergyMoodAvg, correlation };
}

function buildMoodEnergyInsight(correlation) {
  if (correlation > 0.5)  return 'مزاجك وإنتاجيتك مترابطان بقوة — كلما كان مزاجك أفضل، أتممت مهاماً أكثر';
  if (correlation > 0.2)  return 'هناك علاقة إيجابية بين مزاجك وطاقتك الإنتاجية';
  if (correlation < -0.3) return 'تنجح أحياناً في إنجاز مهام أكثر رغم المزاج المنخفض — مرونة رائعة!';
  return 'مزاجك وإنتاجيتك مستقلان نسبياً';
}

module.exports = {
  buildEnergyProfile,
  getEnergyInsights,
};
