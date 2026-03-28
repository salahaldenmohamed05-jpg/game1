/**
 * Profile & Settings Routes — Core System Layers
 * ==================================================
 * GET  /profile              — full profile + AI snapshot
 * PUT  /profile              — update profile fields
 * PUT  /profile/identity     — update name/email
 * PUT  /profile/context      — update role, focus areas, bio
 * PUT  /profile/energy       — update energy preferences
 * PUT  /profile/goals        — update weekly/monthly goals
 * GET  /profile/ai-snapshot  — AI-generated insights about the user
 *
 * GET  /settings             — full settings
 * PUT  /settings             — update settings (partial)
 * PUT  /settings/notifications — update notification prefs only
 * PUT  /settings/ai          — update AI behavior settings only
 * PUT  /settings/privacy     — update privacy settings
 * PUT  /settings/password    — change password
 * POST /settings/delete-account — request account deletion
 * POST /settings/export-data — request data export
 */

const express = require('express');
const router  = express.Router();
const { protect } = require('../middleware/auth.middleware');
const User          = require('../models/user.model');
const UserProfile   = require('../models/user_profile.model');
const UserSettings  = require('../models/user_settings.model');
const logger        = require('../utils/logger');
const { validateUpdateProfile, validateUpdateSettings } = require('../middleware/validators');
const { writeLimiter } = require('../middleware/rateLimiter');

// Models that feed the AI snapshot
const EnergyProfile     = require('../models/energy_profile.model');
const ProductivityScore = require('../models/productivity_score.model');
const Task              = require('../models/task.model');
const { Habit }         = require('../models/habit.model');
const { Op }            = require('sequelize');

router.use(protect);

// ─── Helper: ensure profile + settings exist ────────────────────────────────
async function getOrCreateProfile(userId) {
  let profile = await UserProfile.findOne({ where: { user_id: userId } });
  if (!profile) {
    profile = await UserProfile.create({ user_id: userId });
  }
  return profile;
}

async function getOrCreateSettings(userId) {
  let settings = await UserSettings.findOne({ where: { user_id: userId } });
  if (!settings) {
    // Seed from User model defaults where applicable
    const user = await User.findByPk(userId);
    settings = await UserSettings.create({
      user_id: userId,
      language: user?.language || 'ar',
      notifications_enabled: user?.notifications_enabled ?? true,
      smart_reminders: user?.smart_reminders ?? true,
      ai_coaching_tone: user?.coaching_tone || user?.ai_personality || 'friendly',
    });
  }
  return settings;
}

function computeCompleteness(profile, user) {
  let score = 0;
  const checks = [
    user?.name,
    user?.email,
    profile?.role && profile.role !== 'employee',
    profile?.focus_areas?.length > 0,
    profile?.preferred_work_time,
    profile?.energy_level && profile.energy_level !== 'medium',
    profile?.weekly_goals?.length > 0,
    profile?.monthly_goals?.length > 0,
    profile?.bio,
    user?.avatar,
  ];
  checks.forEach(c => { if (c) score += 10; });
  return Math.min(100, score);
}

// ═══════════════════════════════════════════════════════════════════════════════
// PROFILE ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /profile — full profile with user identity + AI snapshot summary
router.get('/profile', async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    const completeness = computeCompleteness(profile, req.user);
    if (profile.profile_completeness !== completeness) {
      await profile.update({ profile_completeness: completeness });
    }

    res.json({
      success: true,
      data: {
        // Identity
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar,
        phone: req.user.phone,
        // Life Context
        role: profile.role,
        focus_areas: profile.focus_areas,
        bio: profile.bio,
        // Energy
        preferred_work_time: profile.preferred_work_time,
        energy_level: profile.energy_level,
        deep_work_duration: profile.deep_work_duration,
        break_frequency: profile.break_frequency,
        wake_up_time: req.user.wake_up_time,
        sleep_time: req.user.sleep_time,
        work_start_time: req.user.work_start_time,
        work_end_time: req.user.work_end_time,
        // Goals
        weekly_goals: profile.weekly_goals,
        monthly_goals: profile.monthly_goals,
        // Meta
        profile_completeness: completeness,
        last_ai_sync: profile.last_ai_sync,
        subscription_plan: req.user.subscription_plan,
        created_at: req.user.createdAt,
      },
    });
  } catch (e) {
    logger.error('[PROFILE] GET error:', e.message);
    res.status(500).json({ success: false, message: 'فشل في جلب الملف الشخصي' });
  }
});

// PUT /profile — partial update (any fields)
router.put('/profile', writeLimiter, validateUpdateProfile, async (req, res) => {
  try {
    const profile = await getOrCreateProfile(req.user.id);
    const {
      // Identity (goes to User model)
      name, avatar,
      // Life Context
      role, focus_areas, bio,
      // Energy
      preferred_work_time, energy_level, deep_work_duration, break_frequency,
      wake_up_time, sleep_time, work_start_time, work_end_time,
      // Goals
      weekly_goals, monthly_goals,
    } = req.body;

    // Update User model fields
    const userUpdates = {};
    if (name !== undefined) userUpdates.name = name;
    if (avatar !== undefined) userUpdates.avatar = avatar;
    if (wake_up_time !== undefined) userUpdates.wake_up_time = wake_up_time;
    if (sleep_time !== undefined) userUpdates.sleep_time = sleep_time;
    if (work_start_time !== undefined) userUpdates.work_start_time = work_start_time;
    if (work_end_time !== undefined) userUpdates.work_end_time = work_end_time;
    if (Object.keys(userUpdates).length > 0) {
      await req.user.update(userUpdates);
    }

    // Update Profile model fields
    const profileUpdates = {};
    if (role !== undefined) profileUpdates.role = role;
    if (focus_areas !== undefined) profileUpdates.focus_areas = focus_areas;
    if (bio !== undefined) profileUpdates.bio = bio;
    if (preferred_work_time !== undefined) profileUpdates.preferred_work_time = preferred_work_time;
    if (energy_level !== undefined) profileUpdates.energy_level = energy_level;
    if (deep_work_duration !== undefined) profileUpdates.deep_work_duration = deep_work_duration;
    if (break_frequency !== undefined) profileUpdates.break_frequency = break_frequency;
    if (weekly_goals !== undefined) profileUpdates.weekly_goals = weekly_goals;
    if (monthly_goals !== undefined) profileUpdates.monthly_goals = monthly_goals;
    profileUpdates.last_ai_sync = new Date();  // mark that profile was updated → AI should re-read

    await profile.update(profileUpdates);

    const completeness = computeCompleteness(profile, req.user);
    await profile.update({ profile_completeness: completeness });

    // Sync key fields to User.behavior_profile so AI engine picks them up
    const behaviorData = req.user.behavior_profile || {};
    behaviorData.role = profile.role;
    behaviorData.focus_areas = profile.focus_areas;
    behaviorData.preferred_work_time = profile.preferred_work_time;
    behaviorData.energy_level = profile.energy_level;
    behaviorData.deep_work_duration = profile.deep_work_duration;
    behaviorData.weekly_goals = profile.weekly_goals;
    behaviorData.monthly_goals = profile.monthly_goals;
    await req.user.update({ behavior_profile: behaviorData });

    logger.info('[PROFILE] Updated', { userId: req.user.id, fields: Object.keys(profileUpdates) });

    res.json({
      success: true,
      message: 'تم تحديث الملف الشخصي',
      data: {
        name: req.user.name,
        email: req.user.email,
        avatar: req.user.avatar,
        role: profile.role,
        focus_areas: profile.focus_areas,
        bio: profile.bio,
        preferred_work_time: profile.preferred_work_time,
        energy_level: profile.energy_level,
        deep_work_duration: profile.deep_work_duration,
        break_frequency: profile.break_frequency,
        wake_up_time: req.user.wake_up_time,
        sleep_time: req.user.sleep_time,
        work_start_time: req.user.work_start_time,
        work_end_time: req.user.work_end_time,
        weekly_goals: profile.weekly_goals,
        monthly_goals: profile.monthly_goals,
        profile_completeness: completeness,
      },
    });
  } catch (e) {
    logger.error('[PROFILE] PUT error:', e.message);
    res.status(500).json({ success: false, message: 'فشل في تحديث الملف الشخصي' });
  }
});

// GET /profile/ai-snapshot — AI-computed insights for the user
router.get('/profile/ai-snapshot', async (req, res) => {
  try {
    const userId = req.user.id;
    const moment = require('moment-timezone');
    const tz = req.user.timezone || 'Africa/Cairo';
    const today = moment().tz(tz).format('YYYY-MM-DD');
    const thirtyDaysAgo = moment().tz(tz).subtract(30, 'days').toDate();

    // Parallel fetch all data sources
    const [energyProfile, recentScores, taskStats, habitStats, profile] = await Promise.all([
      EnergyProfile.findOne({ where: { user_id: userId } }),
      ProductivityScore.findAll({
        where: { user_id: userId, score_date: { [Op.gte]: thirtyDaysAgo } },
        order: [['score_date', 'DESC']],
        limit: 30,
      }),
      Task.findAll({
        where: { user_id: userId },
        attributes: ['status', 'priority', 'category', 'due_date', 'createdAt'],
      }),
      Habit.findAll({
        where: { user_id: userId, is_active: true },
        attributes: ['name', 'name_ar', 'category', 'current_streak', 'longest_streak', 'total_completions'],
      }),
      getOrCreateProfile(userId),
    ]);

    // ── Compute AI Snapshot ──────────────────────────────────────
    // Best focus time
    const peakHours = energyProfile?.peak_hours || [];
    const hourlyCompletions = energyProfile?.hourly_task_completions || new Array(24).fill(0);
    const bestFocusTime = peakHours.length > 0
      ? peakHours.map(h => `${h}:00`).join(' - ')
      : (hourlyCompletions.indexOf(Math.max(...hourlyCompletions)) + ':00');

    // Productivity pattern
    const avgScore = recentScores.length > 0
      ? Math.round(recentScores.reduce((s, r) => s + (r.overall_score || 0), 0) / recentScores.length)
      : null;
    const trend = recentScores.length >= 7
      ? (recentScores[0]?.overall_score || 0) > (recentScores[6]?.overall_score || 0) ? 'improving' : 'declining'
      : 'not_enough_data';

    // Task analysis
    const totalTasks = taskStats.length;
    const completedTasks = taskStats.filter(t => t.status === 'completed').length;
    const overdueTasks = taskStats.filter(t => t.status !== 'completed' && t.due_date && new Date(t.due_date) < new Date()).length;
    const completionRate = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
    const topCategory = taskStats.reduce((acc, t) => {
      acc[t.category || 'general'] = (acc[t.category || 'general'] || 0) + 1;
      return acc;
    }, {});
    const mostActiveCategory = Object.entries(topCategory).sort((a, b) => b[1] - a[1])[0]?.[0] || 'general';

    // Habit streaks
    const topHabits = habitStats
      .sort((a, b) => (b.current_streak || 0) - (a.current_streak || 0))
      .slice(0, 3)
      .map(h => ({ name: h.name_ar || h.name, streak: h.current_streak, best: h.longest_streak }));

    // Generate smart insights
    const insights = [];
    if (peakHours.length > 0) {
      insights.push({
        type: 'focus',
        icon: '🎯',
        title: 'وقت التركيز الأمثل',
        description: `أنت أكثر إنتاجية في الساعة ${peakHours.map(h => `${h}:00`).join(' و ')}`,
      });
    }
    if (completionRate >= 80) {
      insights.push({ type: 'achievement', icon: '🏆', title: 'معدل إنجاز ممتاز', description: `تنجز ${completionRate}% من مهامك — أداء رائع!` });
    } else if (completionRate >= 50) {
      insights.push({ type: 'tip', icon: '💡', title: 'فرصة للتحسين', description: `معدل الإنجاز ${completionRate}%. جرب تقسيم المهام الكبيرة.` });
    } else if (totalTasks > 5) {
      insights.push({ type: 'warning', icon: '⚠️', title: 'تحتاج خطة', description: `معدل الإنجاز ${completionRate}%. لنضع خطة مناسبة لك.` });
    }
    if (overdueTasks > 3) {
      insights.push({ type: 'warning', icon: '🔴', title: 'مهام متأخرة', description: `لديك ${overdueTasks} مهمة متأخرة. هل تريد إعادة جدولتها؟` });
    }
    if (topHabits.length > 0 && topHabits[0].streak >= 7) {
      insights.push({ type: 'streak', icon: '🔥', title: 'سلسلة رائعة!', description: `${topHabits[0].name} — ${topHabits[0].streak} يوم متتالي!` });
    }
    if (trend === 'improving') {
      insights.push({ type: 'trend', icon: '📈', title: 'أداء متصاعد', description: 'إنتاجيتك في تحسن مستمر هذا الأسبوع!' });
    }

    // Deep work recommendation
    const deepWorkRec = profile.preferred_work_time === 'morning'
      ? 'جدول أهم مهامك بين 8-11 صباحاً'
      : profile.preferred_work_time === 'evening'
      ? 'خصص ساعات المساء للمهام العميقة'
      : 'استغل فترة ذروة تركيزك في المهام الصعبة';

    res.json({
      success: true,
      data: {
        // Productivity patterns
        productivity: {
          average_score: avgScore,
          trend,
          completion_rate: completionRate,
          total_tasks: totalTasks,
          completed: completedTasks,
          overdue: overdueTasks,
          most_active_category: mostActiveCategory,
        },
        // Best focus time
        focus: {
          peak_hours: peakHours,
          best_time: bestFocusTime,
          recommended_deep_work: energyProfile?.recommended_deep_work_start
            ? `${energyProfile.recommended_deep_work_start} - ${energyProfile.recommended_deep_work_end}`
            : deepWorkRec,
          data_points: energyProfile?.data_points || 0,
        },
        // Top habit streaks
        habits: {
          top_streaks: topHabits,
          total_active: habitStats.length,
        },
        // AI insights
        insights,
        // Meta
        last_updated: new Date().toISOString(),
      },
    });
  } catch (e) {
    logger.error('[PROFILE] AI snapshot error:', e.message, e.stack?.split('\n').slice(0, 3).join(' | '));
    // Graceful fallback — return 200 with empty snapshot so frontend doesn't break
    res.json({
      success: true,
      data: {
        productivity: { average_score: null, trend: 'not_enough_data', completion_rate: 0, total_tasks: 0, completed: 0, overdue: 0 },
        focus: { peak_hours: [], best_time: null, recommended_deep_work: 'ابدأ بمتابعة مهامك لنتعرف على نمطك' },
        habits: { top_streaks: [], total_active: 0 },
        insights: [{ type: 'welcome', icon: '👋', title: 'مرحباً!', description: 'أكمل ملفك الشخصي ليتعرف عليك المساعد الذكي' }],
        last_updated: new Date().toISOString(),
      },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// SETTINGS ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /settings — full settings
router.get('/settings', async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user.id);
    res.json({ success: true, data: settings.toJSON() });
  } catch (e) {
    logger.error('[SETTINGS] GET error:', e.message);
    res.status(500).json({ success: false, message: 'فشل في جلب الإعدادات' });
  }
});

// PUT /settings — partial update
router.put('/settings', writeLimiter, validateUpdateSettings, async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user.id);
    const allowedFields = [
      'language', 'theme', 'time_format', 'start_of_week',
      'notifications_enabled', 'notification_sound', 'quiet_hours_start', 'quiet_hours_end',
      'notify_tasks', 'notify_habits', 'notify_mood', 'notify_ai_suggestions', 'notify_weekly_report',
      'ai_intervention_level', 'recommendation_style', 'auto_reschedule', 'ai_coaching_tone', 'smart_reminders',
      'data_collection', 'share_anonymous_stats',
    ];

    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    await settings.update(updates);

    // Sync critical fields back to User model so existing AI code picks them up
    const userSync = {};
    if (updates.language !== undefined) userSync.language = updates.language;
    if (updates.notifications_enabled !== undefined) userSync.notifications_enabled = updates.notifications_enabled;
    if (updates.smart_reminders !== undefined) userSync.smart_reminders = updates.smart_reminders;
    if (updates.ai_coaching_tone !== undefined) {
      userSync.coaching_tone = updates.ai_coaching_tone;
      userSync.ai_personality = updates.ai_coaching_tone;
    }
    if (Object.keys(userSync).length > 0) {
      await req.user.update(userSync);
    }

    logger.info('[SETTINGS] Updated', { userId: req.user.id, fields: Object.keys(updates) });

    res.json({
      success: true,
      message: 'تم تحديث الإعدادات',
      data: settings.toJSON(),
    });
  } catch (e) {
    logger.error('[SETTINGS] PUT error:', e.message);
    res.status(500).json({ success: false, message: 'فشل في تحديث الإعدادات' });
  }
});

// PUT /settings/password — change password
router.put('/settings/password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) {
      return res.status(400).json({ success: false, message: 'يجب إدخال كلمة المرور الحالية والجديدة' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل' });
    }
    const user = await User.findByPk(req.user.id);
    if (!(await user.comparePassword(current_password))) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
    }
    await user.update({ password: new_password });
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (e) {
    logger.error('[SETTINGS] password error:', e.message);
    res.status(500).json({ success: false, message: 'فشل في تغيير كلمة المرور' });
  }
});

// POST /settings/delete-account — soft-delete request
router.post('/settings/delete-account', async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user.id);
    await settings.update({ delete_requested_at: new Date() });
    logger.warn('[SETTINGS] Account deletion requested', { userId: req.user.id });
    res.json({
      success: true,
      message: 'تم تسجيل طلب حذف الحساب. سيتم حذف بياناتك خلال 30 يوماً.',
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'فشل في تسجيل الطلب' });
  }
});

// POST /settings/export-data — request data export
router.post('/settings/export-data', async (req, res) => {
  try {
    const settings = await getOrCreateSettings(req.user.id);
    await settings.update({ export_data_requested: new Date() });
    res.json({
      success: true,
      message: 'تم تسجيل طلب تصدير البيانات. ستتلقى رابط التحميل عبر البريد.',
    });
  } catch (e) {
    res.status(500).json({ success: false, message: 'فشل في تسجيل الطلب' });
  }
});

module.exports = router;
