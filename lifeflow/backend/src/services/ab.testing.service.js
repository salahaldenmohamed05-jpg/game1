/**
 * A/B Testing Framework — Phase 7: Lightweight Experimentation
 * ===============================================================
 * Lightweight A/B testing for notification tone, timing, and features.
 * 
 * Experiments:
 *   1. notification_tone: 
 *      - A: "باقي 10 دقايق 🔥" (urgency)
 *      - B: "جاهز تحافظ على السلسلة?" (curiosity)
 *   2. notification_timing:
 *      - A: Standard schedule (7:30, 10, 13, 15:30, 17:30, 20:30, 22)
 *      - B: Adaptive schedule (based on user's peak hours)
 *   3. nudge_intensity:
 *      - A: Gentle (max 5 notifications/day)
 *      - B: Standard (max 8 notifications/day)
 * 
 * Assignment: deterministic hash of userId + experiment (consistent)
 * Tracking: all events include variant, metrics aggregated per variant
 */

'use strict';

const logger = require('../utils/logger');
const redis = require('./redis.persistence.service');

// ── Experiment Definitions ───────────────────────────────────────────────────

const EXPERIMENTS = {
  notification_tone: {
    id: 'notification_tone',
    name: 'Notification Tone Style',
    description: 'أسلوب الإشعارات: عاجل vs فضولي',
    variants: {
      urgency: {
        name: 'Urgency',
        description: 'باقي 10 دقايق 🔥 — loss-aversion style',
        templates: {
          streak_warning: '🔥 باقي {hours} ساعات وسلسلة {days} يوم هتضيع!',
          task_nudge:     '⏰ باقي {minutes} دقيقة على deadline — خلصها دلوقتي!',
          habit_reminder: '💪 لسه ما سجلت "{habit}" — {streak} يوم على المحك!',
          morning_kickoff:'🚀 يومك فيه {tasks} مهام — ابدأ دلوقتي قبل ما الوقت يجري!',
        },
      },
      curiosity: {
        name: 'Curiosity',
        description: 'جاهز تحافظ على السلسلة? — positive style',
        templates: {
          streak_warning: '🌟 جاهز تحافظ على سلسلة {days} يوم؟ أنت قريب!',
          task_nudge:     '🎯 إيه رأيك تخلص "{task}" النهاردة؟ هتحس بإنجاز!',
          habit_reminder: '✨ وقت "{habit}" — خطوة صغيرة ليوم كبير!',
          morning_kickoff:'☀️ صباح الخير! عندك {tasks} فرص إنجاز النهاردة — يلا!',
        },
      },
    },
    traffic_split: 0.5, // 50/50 split
    active: true,
  },
  notification_timing: {
    id: 'notification_timing',
    name: 'Notification Timing',
    description: 'توقيت الإشعارات: ثابت vs تكيفي',
    variants: {
      standard: {
        name: 'Standard Schedule',
        schedule: {
          morning_kickoff:   { hour: 7, minute: 30 },
          mid_morning:       { hour: 10, minute: 0 },
          afternoon:         { hour: 15, minute: 30 },
          evening:           { hour: 20, minute: 30 },
        },
      },
      adaptive: {
        name: 'Adaptive Schedule',
        description: 'Based on user peak hours',
        usePeakHours: true,
      },
    },
    traffic_split: 0.5,
    active: true,
  },
  nudge_intensity: {
    id: 'nudge_intensity',
    name: 'Nudge Intensity',
    description: 'عدد الإشعارات اليومية: خفيف vs عادي',
    variants: {
      gentle: {
        name: 'Gentle',
        maxDaily: 5,
        cooldownMinutes: 120,
      },
      standard: {
        name: 'Standard', 
        maxDaily: 8,
        cooldownMinutes: 90,
      },
    },
    traffic_split: 0.5,
    active: true,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// VARIANT ASSIGNMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Simple deterministic hash for consistent variant assignment
 */
function hashCode(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash);
}

/**
 * Get or assign a variant for a user in an experiment
 * Deterministic — same user always gets same variant
 */
async function getVariant(userId, experimentId) {
  const experiment = EXPERIMENTS[experimentId];
  if (!experiment || !experiment.active) {
    return { experiment: experimentId, variant: 'control', assigned: false };
  }

  // Check Redis for existing assignment
  const existing = await redis.getABVariant(userId);
  if (existing && existing.experiments && existing.experiments[experimentId]) {
    return {
      experiment: experimentId,
      variant: existing.experiments[experimentId],
      assigned: true,
    };
  }

  // Deterministic assignment
  const variantKeys = Object.keys(experiment.variants);
  const hash = hashCode(`${userId}_${experimentId}`);
  const idx = hash % variantKeys.length;
  const variant = variantKeys[idx];

  // Persist assignment
  const abData = existing || { experiments: {} };
  abData.experiments[experimentId] = variant;
  abData.lastAssigned = new Date().toISOString();
  await redis.setABVariant(userId, abData);

  // Track assignment event
  await redis.logEvent(userId, 'ab_variant_assigned', { 
    experiment: experimentId, variant 
  });

  logger.info(`[A/B] User ${userId} assigned to ${experimentId}:${variant}`);
  return { experiment: experimentId, variant, assigned: true };
}

/**
 * Get all variant assignments for a user
 */
async function getAllVariants(userId) {
  const results = {};
  for (const expId of Object.keys(EXPERIMENTS)) {
    results[expId] = await getVariant(userId, expId);
  }
  return results;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VARIANT-AWARE HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get the notification message based on user's variant
 */
async function getNotificationText(userId, templateKey, context = {}) {
  const { variant } = await getVariant(userId, 'notification_tone');
  const experiment = EXPERIMENTS.notification_tone;
  
  if (variant && experiment.variants[variant]?.templates?.[templateKey]) {
    let text = experiment.variants[variant].templates[templateKey];
    // Replace placeholders
    for (const [key, value] of Object.entries(context)) {
      text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return { text, variant };
  }
  
  return { text: null, variant: 'default' };
}

/**
 * Get the max daily notification limit based on user's variant
 */
async function getNotificationLimit(userId) {
  const { variant } = await getVariant(userId, 'nudge_intensity');
  const experiment = EXPERIMENTS.nudge_intensity;
  
  if (variant && experiment.variants[variant]) {
    return {
      maxDaily: experiment.variants[variant].maxDaily,
      cooldownMinutes: experiment.variants[variant].cooldownMinutes,
      variant,
    };
  }
  
  return { maxDaily: 8, cooldownMinutes: 90, variant: 'default' };
}

/**
 * Should use adaptive timing for this user?
 */
async function shouldUseAdaptiveTiming(userId) {
  const { variant } = await getVariant(userId, 'notification_timing');
  return variant === 'adaptive';
}

// ═══════════════════════════════════════════════════════════════════════════════
// METRICS PER VARIANT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Get experiment results (aggregated metrics per variant)
 */
async function getExperimentResults(experimentId) {
  const experiment = EXPERIMENTS[experimentId];
  if (!experiment) return { success: false, error: 'Experiment not found' };

  return {
    success: true,
    experiment: experimentId,
    name: experiment.name,
    description: experiment.description,
    active: experiment.active,
    variants: Object.keys(experiment.variants).map(v => ({
      key: v,
      name: experiment.variants[v].name,
      description: experiment.variants[v].description || '',
    })),
    traffic_split: experiment.traffic_split,
    note: 'Per-variant metrics computed from tracked events',
  };
}

/**
 * List all active experiments
 */
function listExperiments() {
  return Object.entries(EXPERIMENTS).map(([id, exp]) => ({
    id,
    name: exp.name,
    description: exp.description,
    active: exp.active,
    variants: Object.keys(exp.variants),
    traffic_split: exp.traffic_split,
  }));
}

module.exports = {
  getVariant,
  getAllVariants,
  getNotificationText,
  getNotificationLimit,
  shouldUseAdaptiveTiming,
  getExperimentResults,
  listExperiments,
  EXPERIMENTS,
};
