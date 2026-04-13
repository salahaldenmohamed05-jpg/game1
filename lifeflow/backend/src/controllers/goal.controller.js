/**
 * Goal Controller — LifeFlow
 * Uses raw SQL for maximum compatibility with the existing schema
 */
'use strict';

const { randomUUID } = require('crypto');
const logger = require('../utils/logger');

function getDb() {
  return require('../config/database').sequelize;
}

/**
 * GET /api/v1/goals
 */
exports.listGoals = async (req, res) => {
  try {
    const db = getDb();
    const { status, category } = req.query;
    let sql = `SELECT * FROM goals WHERE user_id = ?`;
    const params = [req.user.id];
    if (status)   { sql += ` AND status = ?`;   params.push(status); }
    if (category) { sql += ` AND category = ?`; params.push(category); }
    sql += ` ORDER BY createdAt DESC LIMIT 100`;

    const [rows] = await db.query(sql, { replacements: params });
    // Parse JSON fields
    const goals = rows.map(g => ({
      ...g,
      milestones:       tryParse(g.milestones,       []),
      tags:             tryParse(g.tags,             []),
      success_metric:   tryParse(g.success_metric,   {}),
      smart_criteria:   tryParse(g.smart_criteria,   {}),
      linked_behaviors: tryParse(g.linked_behaviors, []),
    }));
    res.json({ success: true, data: goals, count: goals.length });
  } catch (error) {
    logger.error('[GOALS] listGoals error:', error.message);
    res.status(500).json({ success: false, message: 'فشل في جلب الأهداف' });
  }
};

/**
 * POST /api/v1/goals
 */
exports.createGoal = async (req, res) => {
  try {
    const db = getDb();
    const {
      title, description = null, category = 'general',
      target_date = null, target_value = null, unit = null,
      color = '#6C63FF', icon = '🎯',
      goal_type = 'outcome', time_horizon = 'monthly',
      tags = [], status = 'active',
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'عنوان الهدف مطلوب' });
    }

    const id = randomUUID();
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO goals
        (id, user_id, name, title, description, category, status, progress,
         target_date, target_value, unit, color, icon,
         goal_type, time_horizon, source,
         milestones, tags, success_metric, smart_criteria, linked_behaviors,
         auto_progress, priority_score, eisenhower_quadrant,
         createdAt, updatedAt)
       VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?,?,'user_created','[]',?,?,?,?,1,50,'important',?,?)`,
      {
        replacements: [
          id, req.user.id, title.trim(), title.trim(), description, category, status,
          target_date, target_value, unit, color, icon,
          goal_type, time_horizon,
          JSON.stringify(tags || []),
          '{}', '{}', '[]',
          now, now,
        ],
      }
    );

    const [[goal]] = await db.query(`SELECT * FROM goals WHERE id = ?`, { replacements: [id] });
    res.status(201).json({ success: true, data: goal, message: 'تم إنشاء الهدف بنجاح ✅' });
  } catch (error) {
    logger.error('[GOALS] createGoal error:', error.message);
    res.status(500).json({ success: false, message: 'فشل في إنشاء الهدف' });
  }
};

/**
 * GET /api/v1/goals/:id
 */
exports.getGoal = async (req, res) => {
  try {
    const db = getDb();
    const [[goal]] = await db.query(
      `SELECT * FROM goals WHERE id = ? AND user_id = ?`,
      { replacements: [req.params.id, req.user.id] }
    );
    if (!goal) return res.status(404).json({ success: false, message: 'الهدف غير موجود' });
    goal.milestones       = tryParse(goal.milestones, []);
    goal.tags             = tryParse(goal.tags, []);
    goal.success_metric   = tryParse(goal.success_metric, {});
    goal.smart_criteria   = tryParse(goal.smart_criteria, {});
    goal.linked_behaviors = tryParse(goal.linked_behaviors, []);
    res.json({ success: true, data: goal });
  } catch (error) {
    logger.error('[GOALS] getGoal error:', error.message);
    res.status(500).json({ success: false, message: 'فشل في جلب الهدف' });
  }
};

/**
 * PUT /api/v1/goals/:id
 */
exports.updateGoal = async (req, res) => {
  try {
    const db = getDb();
    const [[existing]] = await db.query(
      `SELECT * FROM goals WHERE id = ? AND user_id = ?`,
      { replacements: [req.params.id, req.user.id] }
    );
    if (!existing) return res.status(404).json({ success: false, message: 'الهدف غير موجود' });

    const allowed = ['title','description','category','target_date','target_value',
      'current_value','unit','color','icon','status','progress',
      'goal_type','time_horizon','last_update_note','reflections','tags'];

    const sets = [];
    const vals = [];
    allowed.forEach(k => {
      if (req.body[k] !== undefined) {
        sets.push(`${k} = ?`);
        vals.push(Array.isArray(req.body[k]) ? JSON.stringify(req.body[k]) : req.body[k]);
      }
    });

    // Auto-complete if progress hits 100
    if (req.body.progress === 100 && existing.status !== 'completed') {
      sets.push(`status = ?`);
      vals.push('completed');
    }

    if (sets.length === 0) {
      return res.json({ success: true, data: existing, message: 'لم يتم تغيير أي بيانات' });
    }

    sets.push(`updatedAt = ?`);
    vals.push(new Date().toISOString());
    vals.push(req.params.id, req.user.id);

    await db.query(
      `UPDATE goals SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`,
      { replacements: vals }
    );

    const [[updated]] = await db.query(`SELECT * FROM goals WHERE id = ?`, { replacements: [req.params.id] });
    res.json({ success: true, data: updated, message: 'تم تحديث الهدف ✅' });
  } catch (error) {
    logger.error('[GOALS] updateGoal error:', error.message);
    res.status(500).json({ success: false, message: 'فشل في تحديث الهدف' });
  }
};

/**
 * DELETE /api/v1/goals/:id
 */
exports.deleteGoal = async (req, res) => {
  try {
    const db = getDb();
    const [[goal]] = await db.query(
      `SELECT title FROM goals WHERE id = ? AND user_id = ?`,
      { replacements: [req.params.id, req.user.id] }
    );
    if (!goal) return res.status(404).json({ success: false, message: 'الهدف غير موجود' });

    await db.query(`DELETE FROM goals WHERE id = ? AND user_id = ?`,
      { replacements: [req.params.id, req.user.id] });
    res.json({ success: true, message: `تم حذف الهدف "${goal.title}" ✅` });
  } catch (error) {
    logger.error('[GOALS] deleteGoal error:', error.message);
    res.status(500).json({ success: false, message: 'فشل في حذف الهدف' });
  }
};

/**
 * PATCH /api/v1/goals/:id/progress
 */
exports.updateProgress = async (req, res) => {
  try {
    const db = getDb();
    const [[goal]] = await db.query(
      `SELECT * FROM goals WHERE id = ? AND user_id = ?`,
      { replacements: [req.params.id, req.user.id] }
    );
    if (!goal) return res.status(404).json({ success: false, message: 'الهدف غير موجود' });

    const progress = Math.min(100, Math.max(0, parseInt(req.body.progress ?? goal.progress)));
    const status   = progress === 100 ? 'completed' : goal.status;
    const sets     = ['progress = ?', 'status = ?', 'updatedAt = ?'];
    const vals     = [progress, status, new Date().toISOString()];

    if (req.body.current_value !== undefined) { sets.push('current_value = ?'); vals.push(req.body.current_value); }
    if (req.body.note)                        { sets.push('last_update_note = ?'); vals.push(req.body.note); }

    vals.push(req.params.id, req.user.id);
    await db.query(`UPDATE goals SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`, { replacements: vals });

    const [[updated]] = await db.query(`SELECT * FROM goals WHERE id = ?`, { replacements: [req.params.id] });
    res.json({ success: true, data: updated, message: `تقدم الهدف: ${progress}%` });
  } catch (error) {
    logger.error('[GOALS] updateProgress error:', error.message);
    res.status(500).json({ success: false, message: 'فشل في تحديث التقدم' });
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function tryParse(val, fallback) {
  if (val == null) return fallback;
  if (typeof val !== 'string') return val;
  try { return JSON.parse(val); } catch { return fallback; }
}
