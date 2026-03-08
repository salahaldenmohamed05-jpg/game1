/**
 * LifeFlow Mobile - Database Layer
 * ==================================
 * SQLite local storage with full offline capability
 * مساعدك الشخصي الذكي - التخزين المحلي
 */

import * as SQLite from 'expo-sqlite';

let db;

export const getDatabase = async () => {
  if (!db) {
    db = await SQLite.openDatabaseAsync('lifeflow.db');
  }
  return db;
};

/**
 * Initialize all database tables
 */
export const initDatabase = async () => {
  const database = await getDatabase();
  
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      avatar TEXT,
      timezone TEXT DEFAULT 'Africa/Cairo',
      language TEXT DEFAULT 'ar',
      subscription_plan TEXT DEFAULT 'free',
      wake_up_time TEXT DEFAULT '07:00',
      sleep_time TEXT DEFAULT '23:00',
      work_start_time TEXT DEFAULT '09:00',
      work_end_time TEXT DEFAULT '17:00',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Tasks table
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending','in_progress','completed','cancelled')),
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('urgent','high','medium','low')),
      category TEXT DEFAULT 'personal',
      due_date TEXT,
      estimated_duration INTEGER,
      actual_duration INTEGER,
      ai_priority_score REAL DEFAULT 0,
      tags TEXT DEFAULT '[]',
      reminders TEXT DEFAULT '[]',
      ai_suggestions TEXT DEFAULT '[]',
      is_synced INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      completed_at TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Habits table
    CREATE TABLE IF NOT EXISTS habits (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      name_ar TEXT,
      description TEXT,
      category TEXT DEFAULT 'health',
      icon TEXT DEFAULT '⭐',
      color TEXT DEFAULT '#6C63FF',
      frequency TEXT DEFAULT 'daily',
      target_time TEXT,
      duration_minutes INTEGER DEFAULT 30,
      current_streak INTEGER DEFAULT 0,
      longest_streak INTEGER DEFAULT 0,
      completion_rate REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      is_synced INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Habit check-ins table
    CREATE TABLE IF NOT EXISTS habit_checkins (
      id TEXT PRIMARY KEY,
      habit_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      checked_at TEXT DEFAULT (datetime('now')),
      notes TEXT,
      value REAL,
      is_synced INTEGER DEFAULT 0,
      FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
    );

    -- Mood entries table
    CREATE TABLE IF NOT EXISTS mood_entries (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      mood_score INTEGER NOT NULL CHECK(mood_score BETWEEN 1 AND 10),
      emotions TEXT DEFAULT '[]',
      note TEXT,
      journal_entry TEXT,
      ai_insight TEXT,
      ai_recommendation TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      is_synced INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Notifications table
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      data TEXT DEFAULT '{}',
      is_read INTEGER DEFAULT 0,
      read_at TEXT,
      action_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Sync queue table (for offline-first sync)
    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      table_name TEXT NOT NULL,
      record_id TEXT NOT NULL,
      operation TEXT NOT NULL CHECK(operation IN ('CREATE','UPDATE','DELETE')),
      payload TEXT NOT NULL,
      retry_count INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Settings table
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);
    CREATE INDEX IF NOT EXISTS idx_habit_checkins_habit_id ON habit_checkins(habit_id);
    CREATE INDEX IF NOT EXISTS idx_habit_checkins_user_id ON habit_checkins(user_id);
    CREATE INDEX IF NOT EXISTS idx_mood_entries_user_id ON mood_entries(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
  `);

  console.log('[DB] Database initialized successfully');
  return database;
};

// ─── Task CRUD Operations ──────────────────────────────────────────────────

export const taskDB = {
  getAll: async (userId, filters = {}) => {
    const database = await getDatabase();
    let query = `SELECT * FROM tasks WHERE user_id = ?`;
    const params = [userId];
    
    if (filters.status && filters.status !== 'all') {
      query += ` AND status = ?`;
      params.push(filters.status);
    }
    if (filters.category) {
      query += ` AND category = ?`;
      params.push(filters.category);
    }
    if (filters.priority) {
      query += ` AND priority = ?`;
      params.push(filters.priority);
    }
    
    query += ` ORDER BY ai_priority_score DESC, due_date ASC, created_at DESC`;
    
    const result = await database.getAllAsync(query, params);
    return result.map(row => ({
      ...row,
      tags: JSON.parse(row.tags || '[]'),
      reminders: JSON.parse(row.reminders || '[]'),
      ai_suggestions: JSON.parse(row.ai_suggestions || '[]'),
    }));
  },

  create: async (task) => {
    const database = await getDatabase();
    const id = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await database.runAsync(
      `INSERT INTO tasks (id, user_id, title, description, status, priority, category, due_date, estimated_duration, tags, ai_suggestions, is_synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, task.user_id, task.title, task.description || null,
        task.status || 'pending', task.priority || 'medium',
        task.category || 'personal', task.due_date || null,
        task.estimated_duration || null,
        JSON.stringify(task.tags || []),
        JSON.stringify(task.ai_suggestions || []),
        0,
      ]
    );
    return { ...task, id };
  },

  update: async (id, updates) => {
    const database = await getDatabase();
    const fields = Object.keys(updates).filter(k => !['id'].includes(k));
    const values = fields.map(k => {
      const v = updates[k];
      return Array.isArray(v) ? JSON.stringify(v) : v;
    });
    
    if (fields.length === 0) return;
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    await database.runAsync(
      `UPDATE tasks SET ${setClause}, updated_at = datetime('now'), is_synced = 0 WHERE id = ?`,
      [...values, id]
    );
  },

  complete: async (id) => {
    const database = await getDatabase();
    await database.runAsync(
      `UPDATE tasks SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now'), is_synced = 0 WHERE id = ?`,
      [id]
    );
  },

  delete: async (id) => {
    const database = await getDatabase();
    await database.runAsync(`DELETE FROM tasks WHERE id = ?`, [id]);
  },

  getTodayTasks: async (userId) => {
    const database = await getDatabase();
    const today = new Date().toISOString().split('T')[0];
    return await database.getAllAsync(
      `SELECT * FROM tasks WHERE user_id = ? AND date(due_date) = ? AND status != 'completed'
       ORDER BY priority ASC`,
      [userId, today]
    );
  },
};

// ─── Habit CRUD Operations ────────────────────────────────────────────────

export const habitDB = {
  getAll: async (userId) => {
    const database = await getDatabase();
    const habits = await database.getAllAsync(
      `SELECT h.*, 
        (SELECT COUNT(*) FROM habit_checkins WHERE habit_id = h.id AND date(checked_at) = date('now')) as completed_today
       FROM habits h WHERE h.user_id = ? AND h.is_active = 1
       ORDER BY h.created_at ASC`,
      [userId]
    );
    return habits.map(h => ({ ...h, completed_today: h.completed_today > 0 }));
  },

  create: async (habit) => {
    const database = await getDatabase();
    const id = habit.id || `habit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await database.runAsync(
      `INSERT INTO habits (id, user_id, name, name_ar, description, category, icon, color, frequency, target_time, duration_minutes, is_synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, habit.user_id, habit.name, habit.name_ar || habit.name,
        habit.description || null, habit.category || 'health',
        habit.icon || '⭐', habit.color || '#6C63FF',
        habit.frequency || 'daily', habit.target_time || null,
        habit.duration_minutes || 30, 0,
      ]
    );
    return { ...habit, id };
  },

  checkIn: async (habitId, userId, notes = null) => {
    const database = await getDatabase();
    const id = `checkin_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Check if already checked in today
    const existing = await database.getFirstAsync(
      `SELECT id FROM habit_checkins WHERE habit_id = ? AND date(checked_at) = date('now')`,
      [habitId]
    );
    
    if (existing) {
      throw new Error('تم تسجيل هذه العادة اليوم بالفعل');
    }
    
    await database.runAsync(
      `INSERT INTO habit_checkins (id, habit_id, user_id, notes, is_synced) VALUES (?, ?, ?, ?, ?)`,
      [id, habitId, userId, notes, 0]
    );
    
    // Update streak
    await database.runAsync(
      `UPDATE habits SET current_streak = current_streak + 1, updated_at = datetime('now'), is_synced = 0 WHERE id = ?`,
      [habitId]
    );
    
    return { id, habit_id: habitId };
  },

  getTodaySummary: async (userId) => {
    const database = await getDatabase();
    const habits = await habitDB.getAll(userId);
    const total = habits.length;
    const completed = habits.filter(h => h.completed_today).length;
    const pending = total - completed;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    
    return { habits, total, completed, pending, completion_percentage: percentage };
  },

  delete: async (id) => {
    const database = await getDatabase();
    await database.runAsync(`DELETE FROM habits WHERE id = ?`, [id]);
  },
};

// ─── Mood CRUD Operations ─────────────────────────────────────────────────

export const moodDB = {
  getTodayMood: async (userId) => {
    const database = await getDatabase();
    const entry = await database.getFirstAsync(
      `SELECT * FROM mood_entries WHERE user_id = ? AND date(created_at) = date('now') ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );
    return {
      has_checked_in: !!entry,
      data: entry ? {
        ...entry,
        emotions: JSON.parse(entry.emotions || '[]'),
      } : null,
    };
  },

  logMood: async (userId, { mood_score, emotions = [], note = '' }) => {
    const database = await getDatabase();
    
    // Check if already logged today
    const existing = await database.getFirstAsync(
      `SELECT id FROM mood_entries WHERE user_id = ? AND date(created_at) = date('now')`,
      [userId]
    );
    
    if (existing) {
      // Update existing
      await database.runAsync(
        `UPDATE mood_entries SET mood_score = ?, emotions = ?, note = ?, is_synced = 0 WHERE id = ?`,
        [mood_score, JSON.stringify(emotions), note, existing.id]
      );
      return { id: existing.id, mood_score, message: 'تم تحديث مزاجك' };
    }
    
    const id = `mood_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    await database.runAsync(
      `INSERT INTO mood_entries (id, user_id, mood_score, emotions, note, is_synced) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, userId, mood_score, JSON.stringify(emotions), note, 0]
    );
    
    return { id, mood_score, message: 'تم تسجيل مزاجك 💙' };
  },

  getHistory: async (userId, days = 30) => {
    const database = await getDatabase();
    const entries = await database.getAllAsync(
      `SELECT * FROM mood_entries WHERE user_id = ? AND created_at >= datetime('now', ?)
       ORDER BY created_at DESC`,
      [userId, `-${days} days`]
    );
    return entries.map(e => ({ ...e, emotions: JSON.parse(e.emotions || '[]') }));
  },

  getStats: async (userId, days = 30) => {
    const database = await getDatabase();
    const entries = await moodDB.getHistory(userId, days);
    
    if (entries.length === 0) return null;
    
    const total = entries.length;
    const avg = entries.reduce((sum, e) => sum + e.mood_score, 0) / total;
    
    // Group by day
    const byDay = {};
    entries.forEach(e => {
      const day = e.created_at.split('T')[0];
      byDay[day] = e.mood_score;
    });
    
    const moodTrend = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, score]) => ({ date, score }));
    
    return {
      average_mood: Math.round(avg * 10) / 10,
      total_entries: total,
      mood_trend: moodTrend,
    };
  },
};

// ─── Settings Operations ──────────────────────────────────────────────────

export const settingsDB = {
  get: async (key, defaultValue = null) => {
    const database = await getDatabase();
    const row = await database.getFirstAsync(
      `SELECT value FROM app_settings WHERE key = ?`,
      [key]
    );
    if (!row) return defaultValue;
    try { return JSON.parse(row.value); } catch { return row.value; }
  },

  set: async (key, value) => {
    const database = await getDatabase();
    const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);
    await database.runAsync(
      `INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`,
      [key, strValue]
    );
  },

  getAll: async () => {
    const database = await getDatabase();
    const rows = await database.getAllAsync(`SELECT key, value FROM app_settings`);
    const result = {};
    rows.forEach(row => {
      try { result[row.key] = JSON.parse(row.value); } catch { result[row.key] = row.value; }
    });
    return result;
  },
};

// ─── Notifications CRUD ───────────────────────────────────────────────────

export const notificationDB = {
  getAll: async (userId, limit = 50) => {
    const database = await getDatabase();
    return await database.getAllAsync(
      `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ?`,
      [userId, limit]
    );
  },

  create: async (notification) => {
    const database = await getDatabase();
    const id = notification.id || `notif_${Date.now()}`;
    await database.runAsync(
      `INSERT OR REPLACE INTO notifications (id, user_id, type, title, body, data, is_read, action_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, notification.user_id, notification.type, notification.title, notification.body || null,
       JSON.stringify(notification.data || {}), notification.is_read ? 1 : 0, notification.action_url || null]
    );
    return { ...notification, id };
  },

  markRead: async (id) => {
    const database = await getDatabase();
    await database.runAsync(
      `UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE id = ?`,
      [id]
    );
  },

  markAllRead: async (userId) => {
    const database = await getDatabase();
    await database.runAsync(
      `UPDATE notifications SET is_read = 1, read_at = datetime('now') WHERE user_id = ? AND is_read = 0`,
      [userId]
    );
  },

  getUnreadCount: async (userId) => {
    const database = await getDatabase();
    const row = await database.getFirstAsync(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0`,
      [userId]
    );
    return row?.count || 0;
  },
};
