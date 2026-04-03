/**
 * Database Configuration
 * =======================
 * SQLite for dev/demo, PostgreSQL for production
 * Registers all models and sets up associations
 */

const { Sequelize } = require('sequelize');
const path   = require('path');
const logger = require('../utils/logger');
const { createIndexes } = require('./indexes');

let sequelize;

if (process.env.NODE_ENV !== 'production' && process.env.USE_SQLITE !== 'false') {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: process.env.SQLITE_PATH || path.resolve('/home/user/webapp/lifeflow/backend/lifeflow_dev.db'),
    logging: false,
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME     || 'lifeflow_db',
    process.env.DB_USER     || 'postgres',
    process.env.DB_PASSWORD || 'password',
    {
      host:    process.env.DB_HOST || 'localhost',
      port:    parseInt(process.env.DB_PORT) || 5432,
      dialect: 'postgres',
      logging: false,
      pool: { max: 20, min: 2, acquire: 30000, idle: 10000 },
      dialectOptions: {
        ssl: process.env.DB_SSL === 'true'
          ? { require: true, rejectUnauthorized: false }
          : false,
      },
    }
  );
}

// ── Register all models so Sequelize knows them ────────────────────────────
function registerModels() {
  require('../models/user.model');
  require('../models/task.model');
  require('../models/habit.model');
  require('../models/mood.model');
  require('../models/insight.model');
  require('../models/productivity_score.model');
  require('../models/weekly_audit.model');
  require('../models/energy_profile.model');
  require('../models/behavioral_flag.model');
  require('../models/subscription.model');
  // Phase 10 — intelligence models
  require('../models/day_plan.model');
  require('../models/energy_log.model');
  require('../models/coach_session.model');
  // Phase 10 — adaptive life model
  require('../models/behavior_profile.model');
  require('../models/behavior_pattern.model');
  require('../models/life_prediction.model');
  // Phase 12 — goal engine
  require('../models/goal.model');
  // Phase 14 — life OS
  require('../models/connected_integration.model');
  require('../models/external_event.model');
  // Phase 15/16 — ML persistence
  require('../models/learning_outcome.model');
  // Phase 16 — chat memory
  require('../models/chat_session.model');
  require('../models/chat_message.model');
  // Phase P — persistent evolving user model
  require('../models/user_model.model');
  // Profile & Settings system
  require('../models/user_profile.model');
  require('../models/user_settings.model');
  // Execution Engine — persistent session tracking
  require('../models/execution_session.model');
}

async function connectDB() {
  try {
    registerModels();
    await sequelize.authenticate();
    const dialect = sequelize.getDialect();
    logger.info(`📦 Database connected (${dialect})`);

    if (dialect === 'sqlite') {
      // SQLite: use force:false which creates missing tables without altering existing ones
      try {
        // First pass: create any missing tables (safe — won't drop existing tables)
        await sequelize.sync({ force: false });
        logger.info('📊 Database tables synchronized (SQLite)');
      } catch (syncErr) {
        logger.warn('⚠️  SQLite sync warning:', syncErr.message);
        // Retry with alter:false as last resort
        try { await sequelize.sync({ alter: false }); } catch (_e) { logger.debug(`[DATABASE] Non-critical operation failed: ${_e.message}`); }
      }

      // Phase 16: Safe column migrations for SQLite (ALTER TABLE IF NOT EXISTS column)
      const addColumnIfMissing = async (table, column, definition) => {
        try {
          const [cols] = await sequelize.query(`PRAGMA table_info(${table})`);
          if (!cols.find(c => c.name === column)) {
            await sequelize.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
            logger.info(`✅ Added column ${table}.${column}`);
          }
        } catch (e) {
          // Ignore - column already exists or table doesn't exist
        }
      };

      // Notifications: add Phase 16 smart fields
      await addColumnIfMissing('notifications', 'reminder_before',    'INTEGER');
      await addColumnIfMissing('notifications', 'dynamic_message',    'TEXT');
      await addColumnIfMissing('notifications', 'priority',           'VARCHAR(10) DEFAULT "medium"');
      await addColumnIfMissing('notifications', 'related_item_id',    'VARCHAR(36)');
      await addColumnIfMissing('notifications', 'related_item_type',  'VARCHAR(10)');

      // Tasks: add goal linkage for goal-driven planning
      await addColumnIfMissing('tasks', 'goal_id',           'VARCHAR(36)');

      // Tasks: add Phase 16 energy-aware fields
      await addColumnIfMissing('tasks', 'energy_level',        'VARCHAR(10)');
      await addColumnIfMissing('tasks', 'focus_required',      'TINYINT(1) DEFAULT 0');
      await addColumnIfMissing('tasks', 'burnout_risk_flag',   'TINYINT(1) DEFAULT 0');

      // Users: add Phase 16 AI mode + reminder preferences
      await addColumnIfMissing('users', 'ai_mode',             'VARCHAR(20) DEFAULT "suggestive"');
      await addColumnIfMissing('users', 'default_reminder_before', 'INTEGER DEFAULT 30');
      await addColumnIfMissing('users', 'push_subscription',  'TEXT');
      await addColumnIfMissing('users', 'fcm_token',          'TEXT');

      // Chat sessions: add pin + auto_title support
      await addColumnIfMissing('chat_sessions', 'is_pinned',   'TINYINT(1) DEFAULT 0');
      await addColumnIfMissing('chat_sessions', 'auto_title',  'TINYINT(1) DEFAULT 1');
      await addColumnIfMissing('chat_sessions', 'mode',        'VARCHAR(20) DEFAULT "manager"');

      // Mood entries: ensure energy_level column exists
      await addColumnIfMissing('mood_entries', 'energy_level',  'INTEGER DEFAULT 50');
      await addColumnIfMissing('mood_entries', 'stress_level',  'INTEGER');
      await addColumnIfMissing('mood_entries', 'focus_level',   'INTEGER');

      // Phase P — UserModel: migrate from old schema to new
      await addColumnIfMissing('user_models', 'feedback_stats',    'TEXT DEFAULT "{}"');
      await addColumnIfMissing('user_models', 'data_points',       'INTEGER DEFAULT 0');
      await addColumnIfMissing('user_models', 'confidence',        'VARCHAR(20) DEFAULT "cold_start"');
      await addColumnIfMissing('user_models', 'last_computed_at',  'DATETIME');

      // Behavior Engine: extend goals table
      await addColumnIfMissing('goals', 'goal_type',           'VARCHAR(30) DEFAULT "outcome"');
      await addColumnIfMissing('goals', 'time_horizon',        'VARCHAR(20) DEFAULT "monthly"');
      await addColumnIfMissing('goals', 'success_metric',      'TEXT DEFAULT "{}"');
      await addColumnIfMissing('goals', 'linked_behaviors',    'TEXT DEFAULT "[]"');
      await addColumnIfMissing('goals', 'source',              'VARCHAR(30) DEFAULT "user_created"');
      await addColumnIfMissing('goals', 'auto_progress',       'TINYINT(1) DEFAULT 1');
      await addColumnIfMissing('goals', 'priority_score',      'REAL DEFAULT 50');
      await addColumnIfMissing('goals', 'smart_criteria',      'TEXT DEFAULT "{}"');
      await addColumnIfMissing('goals', 'eisenhower_quadrant', 'VARCHAR(20) DEFAULT "important"');

      // Behavior Engine: extend habits table
      await addColumnIfMissing('habits', 'behavior_spec',      'TEXT DEFAULT "{}"');
      await addColumnIfMissing('habits', 'goal_id',            'VARCHAR(36)');
      await addColumnIfMissing('habits', 'current_difficulty',  'VARCHAR(20) DEFAULT "standard"');
      await addColumnIfMissing('habits', 'behavior_type',       'VARCHAR(20) DEFAULT "build"');
      await addColumnIfMissing('habits', 'replaces_behavior',   'TEXT');
      // Migrate data from old columns if they exist
      try {
        const [cols] = await sequelize.query('PRAGMA table_info(user_models)');
        const hasOldFeedback = cols.find(c => c.name === 'feedback_loop');
        const hasOldEvents = cols.find(c => c.name === 'total_events');
        if (hasOldFeedback) {
          await sequelize.query('UPDATE user_models SET feedback_stats = feedback_loop WHERE feedback_stats = "{}" AND feedback_loop IS NOT NULL AND feedback_loop != "{}"');
        }
        if (hasOldEvents) {
          await sequelize.query('UPDATE user_models SET data_points = total_events WHERE data_points = 0 AND total_events > 0');
        }
      } catch (_e) { /* ignore migration errors */ }

    } else {
      await sequelize.sync({ alter: true });
      logger.info('📊 Database tables synchronized');
    }

    // Create performance indexes
    try {
      await createIndexes(sequelize);
    } catch (e) {
      logger.warn('⚠️ Index creation warning:', e.message);
    }

    return sequelize;
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    throw error;
  }
}

module.exports = { sequelize, connectDB };
