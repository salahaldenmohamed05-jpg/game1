/**
 * Pattern Learning Service — Phase 10
 * ======================================
 * Automatically detects behavioral correlations and patterns over time.
 * Detects: sleep↔productivity, exercise↔mood, deep-work hours,
 *          burnout patterns, habit success triggers.
 */

'use strict';

const { Op } = require('sequelize');
const moment  = require('moment-timezone');
const logger  = require('../utils/logger');

function getModels() {
  const MoodEntry       = require('../models/mood.model');
  const ProductivityScore = require('../models/productivity_score.model');
  const BehavioralFlag  = require('../models/behavioral_flag.model');
  const EnergyLog       = require('../models/energy_log.model');
  const Task            = require('../models/task.model');
  return { MoodEntry, ProductivityScore, BehavioralFlag, EnergyLog, Task };
}

/**
 * detectPatterns(userId, timezone, daysBack)
 * Returns array of detected behavioral patterns with confidence scores.
 */
async function detectPatterns(userId, timezone = 'Africa/Cairo', daysBack = 60) {
  try {
    const { MoodEntry, ProductivityScore, BehavioralFlag, EnergyLog, Task } = getModels();
    const since = moment.tz(timezone).subtract(daysBack, 'days').toDate();

    const [moodEntries, scores, flags, energyLogs, tasks] = await Promise.all([
      MoodEntry.findAll({ where: { user_id: userId, entry_date: { [Op.gte]: since } }, raw: true, order: [['entry_date','ASC']] }),
      ProductivityScore.findAll({ where: { user_id: userId, score_date: { [Op.gte]: since } }, raw: true, order: [['score_date','ASC']] }),
      BehavioralFlag.findAll({ where: { user_id: userId, is_resolved: false }, raw: true }),
      EnergyLog.findAll({ where: { user_id: userId, log_date: { [Op.gte]: since } }, raw: true, order: [['log_date','ASC']] }),
      Task.findAll({ where: { user_id: userId, status: 'completed', completed_at: { [Op.gte]: since } }, raw: true }),
    ]);

    const patterns = [];

    // 1. Sleep ↔ Productivity Correlation
    const sleepProductivity = calcSleepProductivityCorrelation(energyLogs, scores);
    if (sleepProductivity.confidence > 0.4) {
      patterns.push({
        pattern_type:        'sleep_productivity',
        title:               'النوم والإنتاجية',
        description:         sleepProductivity.description,
        correlation_score:   sleepProductivity.correlation,
        confidence_level:    sleepProductivity.confidence,
        insight:             sleepProductivity.insight,
        actionable:          true,
        recommendation:      sleepProductivity.recommendation,
        icon:                '😴',
      });
    }

    // 2. Mood ↔ Task Completion Correlation
    const moodTask = calcMoodTaskCorrelation(moodEntries, tasks, timezone);
    if (moodTask.confidence > 0.3) {
      patterns.push({
        pattern_type:        'mood_productivity',
        title:               'المزاج والإنتاجية',
        description:         moodTask.description,
        correlation_score:   moodTask.correlation,
        confidence_level:    moodTask.confidence,
        insight:             moodTask.insight,
        actionable:          true,
        recommendation:      moodTask.recommendation,
        icon:                '😊',
      });
    }

    // 3. Deep Work Hours Pattern
    const deepWork = detectDeepWorkPattern(tasks, timezone);
    patterns.push({
      pattern_type:     'deep_work_hours',
      title:            'ساعات العمل العميق',
      description:      deepWork.description,
      correlation_score: deepWork.confidence,
      confidence_level: deepWork.confidence,
      insight:          deepWork.insight,
      actionable:       true,
      recommendation:   deepWork.recommendation,
      data:             deepWork.peak_hours,
      icon:             '🎯',
    });

    // 4. Burnout Pattern
    const burnout = detectBurnoutPattern(flags, scores, moodEntries);
    if (burnout.detected) {
      patterns.push({
        pattern_type:     'burnout_pattern',
        title:            'نمط الإجهاد والإرهاق',
        description:      burnout.description,
        correlation_score: burnout.severity_score,
        confidence_level: burnout.confidence,
        insight:          burnout.insight,
        actionable:       true,
        recommendation:   burnout.recommendation,
        urgent:           burnout.urgent,
        icon:             '🔴',
      });
    }

    // 5. Habit Success Triggers
    const habitTriggers = detectHabitSuccessTriggers(moodEntries, energyLogs, flags);
    patterns.push({
      pattern_type:     'habit_success_triggers',
      title:            'محركات نجاح العادات',
      description:      habitTriggers.description,
      correlation_score: habitTriggers.confidence,
      confidence_level: habitTriggers.confidence,
      insight:          habitTriggers.insight,
      actionable:       true,
      recommendation:   habitTriggers.recommendation,
      triggers:         habitTriggers.triggers,
      icon:             '💪',
    });

    // 6. Energy Trend Pattern
    if (energyLogs.length >= 7) {
      const energyTrend = detectEnergyTrend(energyLogs);
      patterns.push({
        pattern_type:     'energy_trend',
        title:            'اتجاه الطاقة اليومية',
        description:      energyTrend.description,
        correlation_score: energyTrend.score,
        confidence_level: energyTrend.confidence,
        insight:          energyTrend.insight,
        actionable:       true,
        recommendation:   energyTrend.recommendation,
        trend:            energyTrend.trend,
        icon:             '⚡',
      });
    }

    return {
      user_id:      userId,
      period_days:  daysBack,
      detected_at:  moment.tz(timezone).toISOString(),
      data_quality: assessDataQuality(moodEntries.length, scores.length, energyLogs.length),
      patterns:     patterns.sort((a, b) => b.confidence_level - a.confidence_level),
      summary: {
        total_patterns:   patterns.length,
        high_confidence:  patterns.filter(p => p.confidence_level > 0.7).length,
        actionable:       patterns.filter(p => p.actionable).length,
      },
    };
  } catch (err) {
    logger.error('detectPatterns error:', err.message);
    throw err;
  }
}

// ── Pattern Detection Helpers ────────────────────────────────────────────────

function calcSleepProductivityCorrelation(energyLogs, scores) {
  if (energyLogs.length < 5 || scores.length < 5) {
    return { correlation: 0, confidence: 0, description: 'بيانات غير كافية', insight: '', recommendation: '' };
  }

  // Align by date
  const scoreMap = {};
  scores.forEach(s => { scoreMap[s.score_date?.slice?.(0, 10) || ''] = s.overall_score || 0; });

  const pairs = energyLogs
    .filter(e => e.sleep_score != null && scoreMap[e.log_date?.slice?.(0, 10)])
    .map(e => ({ sleep: e.sleep_score, prod: scoreMap[e.log_date?.slice?.(0, 10)] }));

  if (pairs.length < 4) return { correlation: 0, confidence: 0, description: 'بيانات غير كافية', insight: '', recommendation: '' };

  const r = pearsonCorrelation(pairs.map(p => p.sleep), pairs.map(p => p.prod));
  const abs = Math.abs(r);
  const confidence = Math.min(abs * 1.2, 1);

  let description, insight, recommendation;
  if (r > 0.5) {
    description = 'علاقة قوية بين جودة النوم والإنتاجية';
    insight     = 'عندما تنام جيداً تكون إنتاجيتك أعلى بشكل ملحوظ';
    recommendation = 'احرص على النوم 7-8 ساعات لتحقيق أفضل إنتاجية';
  } else if (r > 0.2) {
    description = 'علاقة إيجابية معتدلة بين النوم والإنتاجية';
    insight     = 'النوم الجيد يحسن إنتاجيتك بشكل ملموس';
    recommendation = 'حاول تنظيم وقت النوم للحصول على نتائج أفضل';
  } else if (r < -0.3) {
    description = 'علاقة عكسية — النوم الزائد قد يقلل التركيز';
    insight     = 'النوم الطويل جداً يؤثر سلباً على إنتاجيتك';
    recommendation = 'النوم المعتدل (7-8 ساعات) هو الأمثل لك';
  } else {
    description = 'علاقة ضعيفة بين النوم والإنتاجية';
    insight     = 'عوامل أخرى تؤثر على إنتاجيتك أكثر من النوم';
    recommendation = 'ركز على تحسين العوامل الأخرى كالتغذية والرياضة';
  }

  return { correlation: parseFloat(r.toFixed(2)), confidence: parseFloat(confidence.toFixed(2)), description, insight, recommendation };
}

function calcMoodTaskCorrelation(moodEntries, tasks, timezone) {
  if (moodEntries.length < 5) {
    return { correlation: 0, confidence: 0, description: 'بيانات غير كافية', insight: '', recommendation: '' };
  }

  const moodByDay = {};
  moodEntries.forEach(m => {
    const day = moment.tz(m.entry_date || m.createdAt, timezone).format('YYYY-MM-DD');
    if (!moodByDay[day]) moodByDay[day] = [];
    moodByDay[day].push(m.mood_score || 5);
  });

  const tasksByDay = {};
  tasks.forEach(t => {
    if (t.completed_at) {
      const day = moment.tz(t.completed_at, timezone).format('YYYY-MM-DD');
      tasksByDay[day] = (tasksByDay[day] || 0) + 1;
    }
  });

  const days  = Object.keys(moodByDay).filter(d => tasksByDay[d] !== undefined);
  if (days.length < 4) return { correlation: 0, confidence: 0.3, description: 'بيانات جزئية', insight: 'المزاج الجيد يرتبط بإنجاز أكثر', recommendation: 'تتبّع مزاجك يومياً لاكتشاف الأنماط' };

  const moods = days.map(d => moodByDay[d].reduce((a, b) => a + b, 0) / moodByDay[d].length);
  const completions = days.map(d => tasksByDay[d] || 0);
  const r = pearsonCorrelation(moods, completions);
  const confidence = Math.min(Math.abs(r) * 1.3, 0.95);

  return {
    correlation:    parseFloat(r.toFixed(2)),
    confidence:     parseFloat(confidence.toFixed(2)),
    description:    r > 0.3 ? 'مزاجك الجيد يرتبط بإنجاز مهام أكثر' : 'علاقة معتدلة بين المزاج والإنجاز',
    insight:        r > 0.3 ? 'في الأيام ذات المزاج المرتفع تُنجز ضعف المهام' : 'المزاج يؤثر على إنجازاتك',
    recommendation: 'ابدأ يومك بنشاط يرفع مزاجك كالرياضة أو القراءة',
  };
}

function detectDeepWorkPattern(tasks, timezone) {
  if (tasks.length < 5) {
    return { peak_hours: [9, 10, 20, 21], confidence: 0.5, description: 'نمط ساعات العمل الافتراضي', insight: 'أضف مزيداً من المهام لاكتشاف نمطك الحقيقي', recommendation: 'جرّب العمل في أوقات مختلفة لمعرفة أفضل أوقاتك' };
  }

  const hourCounts = Array(24).fill(0);
  tasks.forEach(t => {
    if (t.completed_at) {
      hourCounts[moment.tz(new Date(t.completed_at).toISOString(), timezone).hour()]++;
    }
  });

  const maxCount = Math.max(...hourCounts, 1);
  const peakHours = hourCounts
    .map((count, h) => ({ hour: h, count, ratio: count / maxCount }))
    .filter(x => x.ratio >= 0.6)
    .map(x => x.hour);

  const topHour = hourCounts.indexOf(Math.max(...hourCounts));
  const labelMap = { 6:'الصباح الباكر', 7:'الصباح', 8:'الضحى', 9:'منتصف الصباح', 10:'قبل الظهر', 20:'العشاء', 21:'الليل', 22:'منتصف الليل' };

  return {
    peak_hours:  peakHours.length > 0 ? peakHours : [topHour],
    confidence:  Math.min(tasks.length / 20, 0.95),
    description: `أكثر أوقاتك إنجازاً هي ساعة ${topHour}:00 (${labelMap[topHour] || ''})`,
    insight:     `أنجزت ${hourCounts[topHour]} مهمة في هذا الوقت`,
    recommendation: `خصّص ساعة ${topHour}:00 لمهامك الأهم وأصعبها`,
  };
}

function detectBurnoutPattern(flags, scores, moodEntries) {
  const burnoutFlags   = flags.filter(f => f.flag_type === 'burnout_risk').length;
  const overFlags      = flags.filter(f => f.flag_type === 'overcommitment').length;
  const lateNightFlags = flags.filter(f => f.flag_type === 'late_night_work').length;
  const total          = burnoutFlags + overFlags + lateNightFlags;

  if (total === 0 && scores.length >= 3) {
    const recent3 = scores.slice(-3).map(s => s.overall_score || 0);
    const avg3    = recent3.reduce((a, b) => a + b, 0) / recent3.length;
    if (avg3 >= 60) return { detected: false };
  }

  const severityScore = Math.min((burnoutFlags * 3 + overFlags * 2 + lateNightFlags) / 10, 1);

  if (total === 0) return { detected: false };

  const urgent = severityScore > 0.6 || burnoutFlags >= 2;
  return {
    detected:       true,
    severity_score: parseFloat(severityScore.toFixed(2)),
    confidence:     Math.min(0.4 + severityScore * 0.5, 0.95),
    description:    `رصدنا ${total} إشارة إجهاد خلال الفترة`,
    insight:        urgent ? 'الإجهاد المتراكم يهدد أداءك على المدى البعيد' : 'بوادر إجهاد تحتاج متابعة',
    recommendation: urgent ? 'خذ يوم راحة كامل وراجع جدولك للأسبوع القادم' : 'قلّل المهام الإضافية وحافظ على وقت الراحة',
    urgent,
  };
}

function detectHabitSuccessTriggers(moodEntries, energyLogs, flags) {
  const breakingFlags  = flags.filter(f => f.flag_type === 'habit_breaking').length;
  const consistencyDrop = flags.filter(f => f.flag_type === 'consistency_drop').length;
  const avgMood = moodEntries.length > 0
    ? moodEntries.reduce((s, m) => s + (m.mood_score || 5), 0) / moodEntries.length : 5;
  const avgEnergy = energyLogs.length > 0
    ? energyLogs.reduce((s, e) => s + (e.energy_score || 50), 0) / energyLogs.length : 50;

  const triggers = [];
  if (avgMood >= 7)   triggers.push({ factor: 'مزاج مرتفع',     impact: 'عالي',    description: 'المزاج الجيد يزيد من التزامك بالعادات' });
  if (avgEnergy >= 60) triggers.push({ factor: 'طاقة كافية',    impact: 'عالي',    description: 'الطاقة الجيدة تسهل الحفاظ على العادات' });
  if (breakingFlags === 0) triggers.push({ factor: 'اتساق متواصل', impact: 'متوسط', description: 'عدم انقطاعك يبني زخماً إيجابياً' });

  const confidence = Math.min(0.4 + (moodEntries.length + energyLogs.length) / 100, 0.9);
  const problems   = breakingFlags + consistencyDrop;

  return {
    triggers,
    confidence:     parseFloat(confidence.toFixed(2)),
    description:    problems > 0 ? `${problems} عادة تحتاج دعماً` : 'عاداتك في حالة جيدة',
    insight:        avgMood >= 7 && avgEnergy >= 60 ? 'ظروفك الحالية مثالية للحفاظ على العادات' : 'تحسين المزاج والطاقة يقوّي عاداتك',
    recommendation: problems > 0 ? 'ابدأ بعادة واحدة في اليوم وأضف باقي العادات تدريجياً' : 'استمر في نهجك الحالي — أنت تسير بشكل ممتاز',
  };
}

function detectEnergyTrend(energyLogs) {
  const scores = energyLogs.map(e => e.energy_score || 50);
  const n      = scores.length;
  const recent = scores.slice(Math.max(0, n - 7));
  const older  = scores.slice(0, Math.min(7, n));
  const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const olderAvg  = older.reduce((a, b) => a + b, 0) / older.length;
  const diff      = recentAvg - olderAvg;

  let trend, description, insight, recommendation;
  if (diff > 8) {
    trend = 'improving'; description = 'طاقتك في تحسن ملحوظ'; insight = `ارتفعت طاقتك ${Math.round(diff)} نقطة`; recommendation = 'استمر في نهجك الحالي';
  } else if (diff < -8) {
    trend = 'declining'; description = 'طاقتك في تراجع'; insight = `انخفضت طاقتك ${Math.round(Math.abs(diff))} نقطة`; recommendation = 'راجع عادات نومك وتغذيتك';
  } else {
    trend = 'stable'; description = 'طاقتك مستقرة'; insight = `متوسط طاقتك ${Math.round(recentAvg)} نقطة`; recommendation = 'حاول تحسين جودة النوم لرفع طاقتك';
  }

  return { trend, description, insight, recommendation, score: parseFloat((recentAvg / 100).toFixed(2)), confidence: Math.min(n / 30, 0.95) };
}

function assessDataQuality(moodCount, scoreCount, energyCount) {
  const total = moodCount + scoreCount + energyCount;
  if (total >= 60) return { level: 'excellent', label: 'ممتاز', description: 'بيانات كافية لتحليل دقيق' };
  if (total >= 30) return { level: 'good',      label: 'جيد',   description: 'بيانات جيدة لاكتشاف الأنماط' };
  if (total >= 10) return { level: 'fair',      label: 'مقبول', description: 'بيانات مبدئية — واصل الاستخدام لنتائج أفضل' };
  return { level: 'poor', label: 'محدود', description: 'أضف مزيداً من البيانات لتحسين الدقة' };
}

function pearsonCorrelation(xs, ys) {
  const n = xs.length;
  if (n < 2) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx2 = 0, dy2 = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx, dy = ys[i] - my;
    num += dx * dy; dx2 += dx * dx; dy2 += dy * dy;
  }
  const denom = Math.sqrt(dx2 * dy2);
  return denom === 0 ? 0 : num / denom;
}

module.exports = { detectPatterns };
