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
    const sinceDate = moment.tz(tz).subtract(daysBack, 'days').format('YYYY-MM-DD');
    const moods = await MoodEntry.findAll({
      where: {
        user_id:    userId,
        entry_date: { [Op.gte]: sinceDate },
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
    const day = m.entry_date || moment(m.createdAt).tz(tz).format('YYYY-MM-DD');
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

// ─────────────────────────────────────────────────────────────────────────────
// DAILY ENERGY SCORE  (Phase 9 addition)
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Compute a daily energy score (0-100) based on:
 *   - Sleep hours (from user schedule)
 *   - Today's mood score
 *   - Habit completion rate
 *   - Task load (number of pending high-priority tasks)
 *   - Stress signals (behavioral flags)
 *
 * @returns { energy_score, level, focus_windows, low_energy_periods, tips }
 */
async function computeDailyEnergyScore(userId, timezone = 'Africa/Cairo') {
  const { Task, MoodEntry, EnergyProfile } = getModels();
  const BehavioralFlag = require('../models/behavioral_flag.model');
  const HabitLog       = require('../models/habit.model').HabitLog;
  const Habit          = require('../models/habit.model').Habit;
  const User           = require('../models/user.model');
  const { Op }         = require('sequelize');

  const tz    = timezone || 'Africa/Cairo';
  const today = moment.tz(tz).format('YYYY-MM-DD');

  const user = await User.findByPk(userId);

  // ── 1. Sleep Score (20 pts) ───────────────────────────────────────────────
  const wakeHour  = parseTimeHour(user?.locale?.wake_up_time  || '06:00', 6);
  const sleepHour = parseTimeHour(user?.locale?.sleep_time    || '23:00', 23);
  const sleepHours = 24 - sleepHour + wakeHour;           // approximate
  const sleepScore = Math.min(20, Math.round((sleepHours / 8) * 20));

  // ── 2. Mood Score (25 pts) ────────────────────────────────────────────────
  const todayMood = await MoodEntry.findOne({
    where: { user_id: userId, entry_date: today },
    order: [['entry_date', 'DESC']],
  });
  const moodRaw   = todayMood?.mood_score || 5;
  const moodScore = Math.round((moodRaw / 10) * 25);

  // ── 3. Habit Completion Rate (20 pts) ────────────────────────────────────
  const [habits, habitLogs] = await Promise.all([
    Habit.findAll({ where: { user_id: userId, is_active: true } }),
    HabitLog.findAll({ where: { user_id: userId, log_date: today } }),
  ]);
  const habitTotal     = habits.length || 1;
  const habitDone      = habitLogs.filter(l => l.completed).length;
  const habitRate      = habitDone / habitTotal;
  const habitScore     = Math.round(habitRate * 20);

  // ── 4. Task Load Score (20 pts) — fewer urgent pending = more energy ──────
  const pendingUrgent = await Task.count({
    where: {
      user_id: userId,
      status: { [Op.in]: ['pending', 'in_progress'] },
      priority: { [Op.in]: ['urgent', 'high'] },
    },
  });
  // 0 urgent = 20pts, 5+ urgent = 0pts
  const taskLoadScore = Math.max(0, 20 - pendingUrgent * 4);

  // ── 5. Stress / Burnout Signal (15 pts) ──────────────────────────────────
  const criticalFlags = await BehavioralFlag.count({
    where: {
      user_id: userId,
      is_resolved: false,
      is_dismissed: false,
      severity: { [Op.in]: ['high', 'critical'] },
    },
  });
  const stressScore = Math.max(0, 15 - criticalFlags * 5);

  // ── Total ─────────────────────────────────────────────────────────────────
  const rawScore    = sleepScore + moodScore + habitScore + taskLoadScore + stressScore;
  const energyScore = Math.min(100, Math.max(0, rawScore));

  // ── Energy Level Label ────────────────────────────────────────────────────
  const level = energyScore >= 80 ? 'high'
    : energyScore >= 55 ? 'medium'
    : energyScore >= 30 ? 'low'
    : 'critical';

  // ── Focus Windows from EnergyProfile ─────────────────────────────────────
  const profile     = await EnergyProfile.findOne({ where: { user_id: userId } });
  const peakHours   = profile?.peak_hours || [9, 10, 11];
  const focusWindows = buildFocusWindowsFromPeaks(peakHours);

  // ── Low Energy Periods ────────────────────────────────────────────────────
  const hourly        = profile?.hourly_task_completions || new Array(24).fill(0);
  const maxH          = Math.max(...hourly, 1);
  const lowEnergyPeriods = hourly
    .map((v, h) => ({ hour: h, ratio: v / maxH }))
    .filter(x => x.ratio < 0.25 && x.hour >= wakeHour && x.hour <= sleepHour)
    .map(x => ({ hour: x.hour, label: `${String(x.hour).padStart(2,'0')}:00`, reason: 'نشاط منخفض تاريخياً' }));

  // ── Tips ──────────────────────────────────────────────────────────────────
  const tips = buildEnergyTips(energyScore, moodRaw, habitRate, pendingUrgent, criticalFlags);

  return {
    energy_score:      energyScore,
    level,
    level_label:       { high:'طاقة عالية', medium:'طاقة متوسطة', low:'طاقة منخفضة', critical:'إرهاق شديد' }[level],
    breakdown: {
      sleep_score:    sleepScore,    sleep_hours: sleepHours,
      mood_score:     moodScore,     mood_raw: moodRaw,
      habit_score:    habitScore,    habit_rate: Math.round(habitRate * 100),
      task_load_score: taskLoadScore, pending_urgent: pendingUrgent,
      stress_score:   stressScore,   active_flags: criticalFlags,
    },
    focus_windows:     focusWindows,
    low_energy_periods: lowEnergyPeriods.slice(0, 5),
    tips,
    computed_at:       new Date().toISOString(),
  };
}

function buildFocusWindowsFromPeaks(peakHours) {
  if (!peakHours || peakHours.length === 0) return [];
  // Group consecutive peak hours into windows
  const sorted  = [...peakHours].sort((a, b) => a - b);
  const windows = [];
  let start = sorted[0], end = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] - end <= 1) { end = sorted[i]; }
    else {
      windows.push({ start, end: end + 1, label: `${String(start).padStart(2,'0')}:00 - ${String(end+1).padStart(2,'0')}:00` });
      start = sorted[i]; end = sorted[i];
    }
  }
  windows.push({ start, end: end + 1, label: `${String(start).padStart(2,'0')}:00 - ${String(end+1).padStart(2,'0')}:00` });
  return windows;
}

function buildEnergyTips(score, mood, habitRate, urgentTasks, flags) {
  const tips = [];
  if (score < 40)  tips.push({ type: 'warning', text: 'طاقتك منخفضة جداً — ركّز على مهمة واحدة مهمة فقط اليوم' });
  if (mood < 5)    tips.push({ type: 'mood',    text: 'مزاجك يؤثر على طاقتك — خذ استراحة وتحدث مع شخص تثق به' });
  if (habitRate < 0.5) tips.push({ type: 'habit', text: 'أتمام عاداتك يرفع طاقتك — ابدأ بالعادة الأسهل' });
  if (urgentTasks > 5) tips.push({ type: 'overload', text: 'لديك مهام عاجلة كثيرة — قسّمها أو فوّض بعضها' });
  if (flags > 0)   tips.push({ type: 'stress',  text: 'كشفنا إشارات إجهاد — خذ يوم راحة جزئي إذا أمكن' });
  if (score >= 75) tips.push({ type: 'boost',   text: 'طاقتك عالية اليوم! الآن هو أفضل وقت للمهام الصعبة' });
  return tips;
}

function parseTimeHour(str, fallback) {
  if (!str) return fallback;
  return parseInt((str || '').split(':')[0], 10) || fallback;
}

module.exports = {
  buildEnergyProfile,
  getEnergyInsights,
  computeDailyEnergyScore,
};
