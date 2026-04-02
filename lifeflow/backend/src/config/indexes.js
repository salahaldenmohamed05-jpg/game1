/**
 * Database Indexes — Performance Optimization
 * =============================================
 * Adds indexes on frequently queried columns:
 *   - tasks: user_id, status, due_date, priority
 *   - habits: user_id, is_active
 *   - mood_entries: user_id, created_at
 *   - notifications: user_id, is_read, created_at
 *   - insights: user_id, type, created_at
 * 
 * Safe for SQLite and PostgreSQL — uses CREATE INDEX IF NOT EXISTS
 */

const logger = require('../utils/logger');

async function createIndexes(sequelize) {
  const dialect = sequelize.getDialect();
  const qi = sequelize.getQueryInterface();
  
  const indexes = [
    // Tasks
    { table: 'tasks', name: 'idx_tasks_user_status',   fields: ['user_id', 'status'] },
    { table: 'tasks', name: 'idx_tasks_user_due',      fields: ['user_id', 'due_date'] },
    { table: 'tasks', name: 'idx_tasks_user_priority',  fields: ['user_id', 'priority'] },
    { table: 'tasks', name: 'idx_tasks_status_due',     fields: ['status', 'due_date'] },
    
    // Habits
    { table: 'habits', name: 'idx_habits_user_active',  fields: ['user_id', 'is_active'] },
    { table: 'habits', name: 'idx_habits_user_id',      fields: ['user_id'] },
    
    // Mood entries
    { table: 'mood_entries', name: 'idx_mood_user_date', fields: ['user_id', 'created_at'] },
    
    // Notifications
    { table: 'notifications', name: 'idx_notif_user_read',    fields: ['user_id', 'is_read'] },
    { table: 'notifications', name: 'idx_notif_user_created', fields: ['user_id', 'created_at'] },
    
    // Insights
    { table: 'insights', name: 'idx_insights_user_type',   fields: ['user_id', 'type'] },
    { table: 'insights', name: 'idx_insights_user_created', fields: ['user_id', 'created_at'] },
    
    // Productivity scores
    { table: 'productivity_scores', name: 'idx_prod_user_date', fields: ['user_id', 'date'] },
    
    // Chat sessions
    { table: 'chat_sessions', name: 'idx_chat_user_updated', fields: ['user_id', 'updated_at'] },
    
    // Goals
    { table: 'goals', name: 'idx_goals_user_status', fields: ['user_id', 'status'] },
  ];

  let created = 0;
  let skipped = 0;

  for (const idx of indexes) {
    try {
      if (dialect === 'sqlite') {
        // SQLite: use raw SQL with IF NOT EXISTS
        const cols = idx.fields.join(', ');
        await sequelize.query(`CREATE INDEX IF NOT EXISTS ${idx.name} ON ${idx.table} (${cols})`);
      } else {
        // PostgreSQL: use query interface
        await qi.addIndex(idx.table, idx.fields, {
          name: idx.name,
          concurrently: false,
        });
      }
      created++;
    } catch (e) {
      // Index already exists or table doesn't exist — skip silently
      skipped++;
    }
  }

  logger.info(`📇 Database indexes: ${created} created, ${skipped} already exist`);
}

module.exports = { createIndexes };
