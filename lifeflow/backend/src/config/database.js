/**
 * Database Configuration - SQLite (demo) or PostgreSQL (production)
 */

const { Sequelize } = require('sequelize');
const path = require('path');
const logger = require('../utils/logger');

let sequelize;

// Use SQLite for demo mode when PostgreSQL is not available
if (process.env.NODE_ENV === 'development' && process.env.USE_SQLITE !== 'false') {
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../../lifeflow_demo.db'),
    logging: false,
  });
} else {
  sequelize = new Sequelize(
    process.env.DB_NAME || 'lifeflow_db',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || 'password',
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      dialect: 'postgres',
      logging: false,
      pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
      define: { underscored: true, timestamps: true, paranoid: true },
      dialectOptions: {
        ssl: process.env.DB_SSL === 'true' ? { require: true, rejectUnauthorized: false } : false,
      },
    }
  );
}

async function connectDB() {
  try {
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
