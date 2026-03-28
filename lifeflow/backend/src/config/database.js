/**
 * Database Configuration
 * =======================
 * SQLite for dev/demo, PostgreSQL for production
 * Registers all models and sets up associations
 */

const { Sequelize } = require('sequelize');
const path   = require('path');
const logger = require('../utils/logger');

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
  // Profile & Settings system
  require('../models/user_profile.model');
  require('../models/user_settings.model');
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

      // Chat sessions: add pin + auto_title support
      await addColumnIfMissing('chat_sessions', 'is_pinned',   'TINYINT(1) DEFAULT 0');
      await addColumnIfMissing('chat_sessions', 'auto_title',  'TINYINT(1) DEFAULT 1');
      await addColumnIfMissing('chat_sessions', 'mode',        'VARCHAR(20) DEFAULT "manager"');

      // Mood entries: ensure energy_level column exists
      await addColumnIfMissing('mood_entries', 'energy_level',  'INTEGER DEFAULT 50');
      await addColumnIfMissing('mood_entries', 'stress_level',  'INTEGER');
      await addColumnIfMissing('mood_entries', 'focus_level',   'INTEGER');

    } else {
      await sequelize.sync({ alter: true });
      logger.info('📊 Database tables synchronized');
    }
    return sequelize;
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    throw error;
  }
}

module.exports = { sequelize, connectDB };
