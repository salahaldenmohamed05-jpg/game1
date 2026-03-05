/**
 * Subscription Middleware — Feature Flags
 * =========================================
 * Enforces plan-based access control on all premium endpoints.
 *
 * Usage:
 *   router.get('/weekly-audit', requirePremium, handler)
 *   router.get('/basic-summary', requireFreeOrAbove, handler)
 */

const User = require('../models/user.model');

// ── Plan hierarchy ─────────────────────────────────────────────────────────
const PLAN_LEVEL = { free: 0, trial: 1, premium: 2, enterprise: 3 };

/**
 * Feature → minimum plan level required
 * (0=free, 1=trial, 2=premium, 3=enterprise)
 */
const FEATURE_FLAGS = {
  // Free features
  tasks:            0,
  habits:           0,
  mood:             0,
  basic_reminders:  0,
  basic_summary:    0,
  ai_chat:          0,

  // Trial / Premium features
  performance_scores: 1,   // Available from trial
  weekly_audit:       1,
  procrastination:    1,
  energy_mapping:     1,
  coaching_mode:      1,
  behavioral_flags:   1,
  advanced_insights:  1,
  export_data:        2,   // Premium only
  api_access:         2,
};

/**
 * Check if a plan can access a feature
 */
function canAccess(plan, feature) {
  const effectivePlan = plan || 'free';
  const planLevel     = PLAN_LEVEL[effectivePlan] ?? 0;
  const required      = FEATURE_FLAGS[feature] ?? 0;
  return planLevel >= required;
}

/**
 * Generic gate middleware factory
 * @param {string} feature - key from FEATURE_FLAGS
 */
function requireFeature(feature) {
  return async (req, res, next) => {
    try {
      const user = req.user;
      if (!user) return res.status(401).json({ success: false, message: 'غير مصرح' });

      // Reload user to get latest subscription state
      const freshUser = await User.findByPk(user.id);
      if (!freshUser || !freshUser.is_active) {
        return res.status(403).json({ success: false, message: 'الحساب غير نشط' });
      }

      const effectivePlan = freshUser.getEffectivePlan();
      if (!canAccess(effectivePlan, feature)) {
        return res.status(403).json({
          success: false,
          code: 'PREMIUM_REQUIRED',
          message: 'هذه الميزة متاحة فقط للمشتركين في الخطة المميزة',
          feature,
          current_plan: effectivePlan,
          upgrade_url: '/upgrade',
          trial_available: effectivePlan === 'free',
          // Send a locked preview snippet
          preview: getFeaturePreview(feature),
        });
      }

      // Attach plan info to request
      req.userPlan   = effectivePlan;
      req.isPremium  = freshUser.isPremium();
      req.trialDays  = freshUser.trialDaysRemaining();
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Shorthand middleware
const requirePremium  = requireFeature('performance_scores');
const requireFree     = (req, res, next) => next(); // always passes

// Specific feature gates
const requirePerformanceScores = requireFeature('performance_scores');
const requireWeeklyAudit       = requireFeature('weekly_audit');
const requireProcrastination   = requireFeature('procrastination');
const requireEnergyMapping     = requireFeature('energy_mapping');
const requireCoaching          = requireFeature('coaching_mode');
const requireBehavioralFlags   = requireFeature('behavioral_flags');
const requireAdvancedInsights  = requireFeature('advanced_insights');
const requireExport            = requireFeature('export_data');

/**
 * Soft gate — attaches plan info but doesn't block.
 * Useful for mixed endpoints that return different data per plan.
 */
async function softPlanCheck(req, res, next) {
  try {
    if (!req.user) return next();
    const freshUser = await User.findByPk(req.user.id);
    if (freshUser) {
      req.userPlan  = freshUser.getEffectivePlan();
      req.isPremium = freshUser.isPremium();
      req.trialDays = freshUser.trialDaysRemaining();
    }
    next();
  } catch { next(); }
}

/**
 * Returns a locked preview for the UI upgrade modal
 */
function getFeaturePreview(feature) {
  const previews = {
    performance_scores: {
      title: 'محرك الأداء الذكي',
      description: 'احصل على درجة الإنتاجية، التركيز، والاتساق يومياً',
      sample: { productivity_score: '?? / 100', focus_score: '?? / 100', consistency_score: '?? / 100' },
    },
    weekly_audit: {
      title: 'التدقيق الأسبوعي للحياة',
      description: 'تحليل شامل لأسبوعك: المهام، العادات، المزاج، و3 استراتيجيات تحسين',
      sample: { completion_rate: '?? %', top_strategy: 'ابدأ بـ...' },
    },
    procrastination: {
      title: 'كشف المماطلة',
      description: 'نكتشف المهام التي تتجنبها ونقترح خطوات صغيرة لإنجازها',
      sample: { flagged_tasks: ['??', '??'], suggestion: 'قسّم المهمة إلى...' },
    },
    energy_mapping: {
      title: 'خريطة الطاقة الشخصية',
      description: 'اكتشف أوقات ذروة إنتاجيتك وابنِ جدولاً مثالياً',
      sample: { peak_hours: ['?? - ??', '?? - ??'], best_day: '??' },
    },
    coaching_mode: {
      title: 'وضع التدريب الذكي',
      description: 'تغذية راجعة يومية تحفيزية مع نبضات سلوكية متكيّفة',
      sample: { daily_message: '💡 أنت على المسار الصحيح...' },
    },
  };
  return previews[feature] || null;
}

module.exports = {
  requireFeature,
  requirePremium,
  requireFree,
  requirePerformanceScores,
  requireWeeklyAudit,
  requireProcrastination,
  requireEnergyMapping,
  requireCoaching,
  requireBehavioralFlags,
  requireAdvancedInsights,
  requireExport,
  softPlanCheck,
  canAccess,
  FEATURE_FLAGS,
  PLAN_LEVEL,
};
