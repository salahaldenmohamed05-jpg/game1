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
    storage: path.join(__dirname, '../../lifeflow_dev.db'),
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
}

async function connectDB() {
  try {
    registerModels();
    await sequelize.authenticate();
    const dialect = sequelize.getDialect();
    logger.info(`📦 Database connected (${dialect})`);
    await sequelize.sync({ alter: true });
    logger.info('📊 Database tables synchronized');
    return sequelize;
  } catch (error) {
    logger.error('❌ Database connection failed:', error.message);
    throw error;
  }
}

module.exports = { sequelize, connectDB };
