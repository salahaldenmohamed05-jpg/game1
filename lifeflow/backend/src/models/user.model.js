/**
 * User Model — Production Grade
 * ================================
 * Includes subscription management, trial period,
 * coaching preferences, and premium feature flags
 */

const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.STRING(36),
    defaultValue: () => uuidv4(),
    primaryKey: true,
  },
  name:     { type: DataTypes.STRING(100), allowNull: false },
  email:    { type: DataTypes.STRING(255), allowNull: false, unique: true, validate: { isEmail: true } },
  password: { type: DataTypes.STRING(255), allowNull: false },
  avatar:   { type: DataTypes.TEXT, allowNull: true },

  // ── Locale / Schedule ─────────────────────────────────────────────
  timezone:        { type: DataTypes.STRING(50), defaultValue: 'Africa/Cairo' },
  language:        { type: DataTypes.STRING(5),  defaultValue: 'ar' },
  wake_up_time:    { type: DataTypes.STRING(8),  defaultValue: '07:00' },
  sleep_time:      { type: DataTypes.STRING(8),  defaultValue: '23:00' },
  work_start_time: { type: DataTypes.STRING(8),  defaultValue: '09:00' },
  work_end_time:   { type: DataTypes.STRING(8),  defaultValue: '17:00' },

  // ── Account State ─────────────────────────────────────────────────
  is_active:   { type: DataTypes.BOOLEAN, defaultValue: true },
  is_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
  last_login:  { type: DataTypes.DATE,    allowNull: true },

  // ── Subscription ──────────────────────────────────────────────────
  subscription_plan: {
    type: DataTypes.STRING(20),
    defaultValue: 'free',          // 'free' | 'trial' | 'premium' | 'enterprise'
    validate: { isIn: [['free', 'trial', 'premium', 'enterprise']] },
  },
  subscription_status: {
    type: DataTypes.STRING(20),
    defaultValue: 'active',        // 'active' | 'cancelled' | 'past_due' | 'expired'
  },
  trial_starts_at:  { type: DataTypes.DATE, allowNull: true },
  trial_ends_at:    { type: DataTypes.DATE, allowNull: true },
  subscription_starts_at: { type: DataTypes.DATE, allowNull: true },
  subscription_ends_at:   { type: DataTypes.DATE, allowNull: true },

  // ── Stripe ────────────────────────────────────────────────────────
  stripe_customer_id:     { type: DataTypes.STRING(100), allowNull: true },
  stripe_subscription_id: { type: DataTypes.STRING(100), allowNull: true },
  stripe_price_id:        { type: DataTypes.STRING(100), allowNull: true },

  // ── Notifications & AI ────────────────────────────────────────────
  notifications_enabled: { type: DataTypes.BOOLEAN, defaultValue: true },
  smart_reminders:       { type: DataTypes.BOOLEAN, defaultValue: true },
  ai_personality:        { type: DataTypes.STRING(20), defaultValue: 'friendly' },
  // 'friendly' | 'strict' | 'soft' | 'analytical' | 'coach'
  coaching_tone: {
    type: DataTypes.STRING(20),
    defaultValue: 'friendly',
    validate: { isIn: [['friendly', 'strict', 'soft', 'analytical', 'coach']] },
  },
  fcm_token:     { type: DataTypes.TEXT, allowNull: true },
  refresh_token: { type: DataTypes.TEXT, allowNull: true },

  // ── Behavior Profile (JSON blob) ──────────────────────────────────
  behavior_profile: {
    type: DataTypes.TEXT,
    defaultValue: '{}',
    get() {
      try { return JSON.parse(this.getDataValue('behavior_profile') || '{}'); }
      catch { return {}; }
    },
    set(val) { this.setDataValue('behavior_profile', JSON.stringify(val)); },
  },

  // ── Onboarding ────────────────────────────────────────────────────
  onboarding_completed: { type: DataTypes.BOOLEAN, defaultValue: false },
  onboarding_step:      { type: DataTypes.INTEGER, defaultValue: 0 },
}, {
  tableName: 'users',
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) user.password = await bcrypt.hash(user.password, 12);
      // Auto-start 7-day trial on registration
      const now = new Date();
      user.trial_starts_at = now;
      user.trial_ends_at   = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      user.subscription_plan = 'trial';
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) user.password = await bcrypt.hash(user.password, 12);
    },
  },
});

// ── Instance Methods ───────────────────────────────────────────────────────

User.prototype.comparePassword = async function (pwd) {
  return bcrypt.compare(pwd, this.password);
};

User.prototype.toSafeObject = function () {
  const obj = this.toJSON();
  delete obj.password;
  delete obj.refresh_token;
  return obj;
};

/** Returns the effective plan respecting trial expiry */
User.prototype.getEffectivePlan = function () {
  if (this.subscription_plan === 'premium' || this.subscription_plan === 'enterprise') {
    return this.subscription_plan;
  }
  if (this.subscription_plan === 'trial' && this.trial_ends_at) {
    if (new Date() <= new Date(this.trial_ends_at)) return 'trial';
    // Trial expired → downgrade to free
    return 'free';
  }
  return 'free';
};

User.prototype.isPremium = function () {
  const plan = this.getEffectivePlan();
  return ['premium', 'enterprise', 'trial'].includes(plan);
};

User.prototype.trialDaysRemaining = function () {
  if (!this.trial_ends_at) return 0;
  const diff = new Date(this.trial_ends_at) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
};

module.exports = User;
