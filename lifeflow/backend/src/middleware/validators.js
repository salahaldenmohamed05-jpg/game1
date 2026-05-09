/**
 * Input Validators — Phase A Stabilization
 * ==========================================
 * Express-validator rules for core data endpoints.
 *
 * Each export is an array of validation middlewares + a finalizer
 * that checks for errors and returns a structured 400 response.
 *
 * Usage in routes:
 *   const { validateCreateTask } = require('../middleware/validators');
 *   router.post('/', protect, validateCreateTask, handler);
 */

'use strict';

const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// ─── Validation Result Handler ──────────────────────────────────────────────
const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    logger.warn('[VALIDATION] Input validation failed', {
      url:    req.originalUrl,
      method: req.method,
      userId: req.user?.id || 'anonymous',
      errors: errors.array().map(e => ({ field: e.path, msg: e.msg })),
    });
    return res.status(400).json({
      success:   false,
      errorCode: 'VALIDATION_ERROR',
      message:   'بيانات غير صالحة',
      errors:    errors.array().map(e => ({
        field:   e.path,
        message: e.msg,
      })),
    });
  }
  next();
};

// ─── Task Validators ─────────────────────────────────────────────────────────
const validateCreateTask = [
  body('title')
    .trim()
    .notEmpty().withMessage('عنوان المهمة مطلوب')
    .isLength({ min: 2, max: 500 }).withMessage('العنوان يجب أن يكون بين 2 و 500 حرف')
    .not().matches(/('|--|;|DROP\s+TABLE|DELETE\s+FROM|INSERT\s+INTO|UNION\s+SELECT|1\s*=\s*1)/i)
    .withMessage('العنوان يحتوي على محتوى غير مسموح'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 }).withMessage('الوصف طويل جداً'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent']).withMessage('الأولوية غير صالحة'),
  body('status')
    .optional()
    .isIn(['pending', 'in_progress', 'completed', 'cancelled']).withMessage('الحالة غير صالحة'),
  body('category')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('الفئة طويلة جداً'),
  body('estimated_minutes')
    .optional()
    .isInt({ min: 1, max: 1440 }).withMessage('الوقت المقدر غير صالح (1-1440 دقيقة)'),
  body('due_date')
    .optional()
    .isISO8601().withMessage('تاريخ الاستحقاق غير صالح'),
  handleValidation,
];

const validateUpdateTask = [
  body('title')
    .optional()
    .trim()
    .notEmpty().withMessage('العنوان لا يمكن أن يكون فارغاً')
    .isLength({ max: 500 }).withMessage('العنوان طويل جداً'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 5000 }).withMessage('الوصف طويل جداً'),
  body('priority')
    .optional()
    .isIn(['low', 'medium', 'high', 'urgent']).withMessage('الأولوية غير صالحة'),
  body('status')
    .optional()
    .isIn(['pending', 'in_progress', 'completed', 'cancelled']).withMessage('الحالة غير صالحة'),
  body('estimated_minutes')
    .optional()
    .isInt({ min: 1, max: 1440 }).withMessage('الوقت المقدر غير صالح'),
  handleValidation,
];

// ─── Habit Validators ────────────────────────────────────────────────────────
const validateCreateHabit = [
  body('name')
    .trim()
    .notEmpty().withMessage('اسم العادة مطلوب')
    .isLength({ max: 200 }).withMessage('الاسم طويل جداً'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('الوصف طويل جداً'),
  body('category')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('الفئة طويلة جداً'),
  body('frequency')
    .optional()
    .isIn(['daily', 'weekly', 'custom']).withMessage('التكرار غير صالح'),
  body('target_value')
    .optional()
    .isInt({ min: 1, max: 10000 }).withMessage('القيمة المستهدفة غير صالحة'),
  body('duration_minutes')
    .optional()
    .isInt({ min: 1, max: 1440 }).withMessage('المدة غير صالحة'),
  handleValidation,
];

const validateUpdateHabit = [
  body('name')
    .optional()
    .trim()
    .notEmpty().withMessage('الاسم لا يمكن أن يكون فارغاً')
    .isLength({ max: 200 }).withMessage('الاسم طويل جداً'),
  body('description')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('الوصف طويل جداً'),
  body('frequency')
    .optional()
    .isIn(['daily', 'weekly', 'custom']).withMessage('التكرار غير صالح'),
  handleValidation,
];

// ─── Mood Validators ─────────────────────────────────────────────────────────
const validateMoodCheckIn = [
  // Accept either 'score' or 'mood_score' — at least one must be present
  body('score').optional().isInt({ min: 1, max: 10 }).withMessage('التقييم يجب أن يكون بين 1 و 10'),
  body('mood_score').optional().isInt({ min: 1, max: 10 }).withMessage('التقييم يجب أن يكون بين 1 و 10'),
  body().custom((_, { req }) => {
    if (!req.body.score && !req.body.mood_score) throw new Error('تقييم المزاج مطلوب (score أو mood_score)');
    return true;
  }),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 2000 }).withMessage('الملاحظات طويلة جداً'),
  body('energy')
    .optional()
    .isInt({ min: 1, max: 10 }).withMessage('مستوى الطاقة يجب أن يكون بين 1 و 10'),
  body('energy_level')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('مستوى الطاقة غير صالح'),
  handleValidation,
];

// ─── Chat/Assistant Validators ───────────────────────────────────────────────
const validateAssistantMessage = [
  body('message')
    .trim()
    .notEmpty().withMessage('الرسالة مطلوبة')
    .isLength({ max: 5000 }).withMessage('الرسالة طويلة جداً (الحد الأقصى 5000 حرف)'),
  handleValidation,
];

// ─── Profile Validators ─────────────────────────────────────────────────────
const validateUpdateProfile = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 }).withMessage('الاسم غير صالح'),
  body('role')
    .optional()
    .isIn(['student', 'employee', 'freelancer', 'entrepreneur', 'homemaker', 'other'])
    .withMessage('الدور غير صالح'),
  body('energy_level')
    .optional()
    .isIn(['low', 'medium', 'high', 'very_high'])
    .withMessage('مستوى الطاقة غير صالح'),
  body('deep_work_duration')
    .optional()
    .isInt({ min: 10, max: 480 }).withMessage('مدة العمل العميق غير صالحة'),
  handleValidation,
];

// ─── Settings Validators ─────────────────────────────────────────────────────
const validateUpdateSettings = [
  body('language')
    .optional()
    .isIn(['ar', 'en']).withMessage('اللغة غير صالحة'),
  body('theme')
    .optional()
    .isIn(['light', 'dark', 'system']).withMessage('المظهر غير صالح'),
  body('ai_intervention_level')
    .optional()
    .isIn(['low', 'medium', 'high']).withMessage('مستوى التدخل غير صالح'),
  body('ai_coaching_tone')
    .optional()
    .isIn(['friendly', 'coach', 'strict']).withMessage('نبرة التدريب غير صالحة'),
  handleValidation,
];

module.exports = {
  handleValidation,
  validateCreateTask,
  validateUpdateTask,
  validateCreateHabit,
  validateUpdateHabit,
  validateMoodCheckIn,
  validateAssistantMessage,
  validateUpdateProfile,
  validateUpdateSettings,
};
