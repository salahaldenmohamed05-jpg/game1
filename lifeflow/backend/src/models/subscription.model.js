/**
 * Subscription Model
 * ===================
 * Tracks Stripe subscriptions, payment history, invoices
 */
const { DataTypes } = require('sequelize');
const { sequelize }  = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const Subscription = sequelize.define('Subscription', {
  id:      { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id: { type: DataTypes.STRING(36), allowNull: false },

  // ── Stripe IDs ──────────────────────────────────────────────────
  stripe_subscription_id: { type: DataTypes.STRING(100), unique: true, allowNull: true },
  stripe_customer_id:     { type: DataTypes.STRING(100), allowNull: true },
  stripe_price_id:        { type: DataTypes.STRING(100), allowNull: true },
  stripe_payment_method:  { type: DataTypes.STRING(100), allowNull: true },

  // ── Plan Details ────────────────────────────────────────────────
  plan: {
    type: DataTypes.STRING(20),
    defaultValue: 'premium',
    validate: { isIn: [['premium', 'enterprise']] },
  },
  billing_cycle: {
    type: DataTypes.STRING(10),
    defaultValue: 'monthly',
    validate: { isIn: [['monthly', 'annual']] },
  },
  amount_cents:  { type: DataTypes.INTEGER, defaultValue: 0 },
  currency:      { type: DataTypes.STRING(3), defaultValue: 'usd' },

  // ── Status ──────────────────────────────────────────────────────
  status: {
    type: DataTypes.STRING(20),
    defaultValue: 'active',
    validate: { isIn: [['active', 'trialing', 'past_due', 'cancelled', 'unpaid', 'incomplete']] },
  },

  // ── Dates ───────────────────────────────────────────────────────
  current_period_start: { type: DataTypes.DATE, allowNull: true },
  current_period_end:   { type: DataTypes.DATE, allowNull: true },
  cancelled_at:         { type: DataTypes.DATE, allowNull: true },
  cancel_at_period_end: { type: DataTypes.BOOLEAN, defaultValue: false },

  // ── Metadata ────────────────────────────────────────────────────
  metadata: {
    type: DataTypes.TEXT,
    defaultValue: '{}',
    get()  { try { return JSON.parse(this.getDataValue('metadata') || '{}'); } catch { return {}; } },
    set(v) { this.setDataValue('metadata', JSON.stringify(v)); },
  },
}, {
  tableName: 'subscriptions',
  underscored: false,
  indexes: [{ fields: ['user_id'] }, { fields: ['stripe_subscription_id'] }],
});

// ── Payment Events (webhook log) ──────────────────────────────────────────
const PaymentEvent = sequelize.define('PaymentEvent', {
  id:          { type: DataTypes.STRING(36), defaultValue: () => uuidv4(), primaryKey: true },
  user_id:     { type: DataTypes.STRING(36), allowNull: true },
  stripe_event_id: { type: DataTypes.STRING(100), unique: true },
  event_type:  { type: DataTypes.STRING(80) },
  payload: {
    type: DataTypes.TEXT,
    defaultValue: '{}',
    get()  { try { return JSON.parse(this.getDataValue('payload') || '{}'); } catch { return {}; } },
    set(v) { this.setDataValue('payload', JSON.stringify(v)); },
  },
  processed:   { type: DataTypes.BOOLEAN, defaultValue: false },
  processed_at:{ type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'payment_events',
});

module.exports = { Subscription, PaymentEvent };
