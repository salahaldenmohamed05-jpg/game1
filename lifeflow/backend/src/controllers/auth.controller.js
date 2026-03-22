/**
 * Auth Controller — المصادقة الكاملة
 * =====================================
 * يدعم: البريد الإلكتروني + رقم الهاتف، تأكيد OTP، نسيان كلمة المرور
 */

const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const User = require('../models/user.model');
const logger = require('../utils/logger');

/** Generate JWT access + refresh tokens */
const generateTokens = (userId) => {
  const accessToken = jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || 'lifeflow_secret',
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
  const refreshToken = jwt.sign(
    { id: userId },
    process.env.JWT_REFRESH_SECRET || 'lifeflow_refresh',
    { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d' }
  );
  return { accessToken, refreshToken };
};

/** Generate 6-digit OTP */
const generateOTP = () => String(Math.floor(100000 + Math.random() * 900000));

/**
 * Simulate email / SMS sending (logs OTP — no SMTP in sandbox).
 * In production: integrate nodemailer / Twilio here.
 */
const sendOTP = (contact, otp, type = 'reset') => {
  const label = type === 'verify' ? 'تفعيل الحساب' : 'إعادة تعيين كلمة المرور';
  logger.info(`[AUTH-OTP] ${label} | contact=${contact} | otp=${otp} | (sandbox — check server logs)`);
};

/* ─────────────────────────────────────────────
   POST /api/v1/auth/register
   Supports email OR phone number
   ───────────────────────────────────────────── */
exports.register = async (req, res) => {
  try {
    const { name, email, phone, password, timezone = 'Africa/Cairo', language = 'ar' } = req.body;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, message: 'الاسم مطلوب' });
    }
    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني أو رقم الهاتف مطلوب' });
    }
    if (!password || password.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    // Validate email format
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'صيغة البريد الإلكتروني غير صحيحة' });
    }

    // Check duplicates
    if (email) {
      const exists = await User.findOne({ where: { email } });
      if (exists) return res.status(400).json({ success: false, message: 'البريد الإلكتروني مسجل مسبقاً' });
    }
    if (phone) {
      const exists = await User.findOne({ where: { phone } });
      if (exists) return res.status(400).json({ success: false, message: 'رقم الهاتف مسجل مسبقاً' });
    }

    const verifyOTP = generateOTP();
    const verifyExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 min
    const userEmail = email || `phone_${phone.replace(/\D/g, '')}@lifeflow.app`;

    const user = await User.create({
      name: name.trim(),
      email: userEmail,
      phone: phone || null,
      password,
      timezone,
      language,
      is_verified: !email, // phone = auto-verified; email = needs OTP
      email_verify_token: email ? verifyOTP : null,
      email_verify_expires: email ? verifyExpires : null,
    });

    if (email) sendOTP(email, verifyOTP, 'verify');

    const { accessToken, refreshToken } = generateTokens(user.id);
    await user.update({ refresh_token: refreshToken });

    logger.info(`[AUTH] New user registered: ${email || phone}`);

    res.status(201).json({
      success: true,
      message: email
        ? `مرحباً ${name}! تم إنشاء حسابك. رمز التحقق أُرسل إلى بريدك 📧`
        : `مرحباً ${name}! تم إنشاء حسابك بنجاح 🎉`,
      data: {
        user: user.toSafeObject(),
        accessToken,
        refreshToken,
        verify_required: email ? !user.is_verified : false,
        // In sandbox: expose OTP for testing
        ...(process.env.NODE_ENV !== 'production' && email && { _sandbox_otp: verifyOTP }),
      },
    });
  } catch (error) {
    logger.error('[AUTH] Register error: ' + error.message);
    if (error.name === 'SequelizeValidationError') {
      return res.status(400).json({ success: false, message: error.errors?.[0]?.message || 'بيانات غير صالحة' });
    }
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(400).json({ success: false, message: 'المستخدم موجود مسبقاً' });
    }
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إنشاء الحساب' });
  }
};

/* ─────────────────────────────────────────────
   POST /api/v1/auth/verify-email
   ───────────────────────────────────────────── */
exports.verifyEmail = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني والرمز مطلوبان' });
    }
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    if (user.is_verified) return res.json({ success: true, message: 'الحساب مفعّل مسبقاً ✓' });

    if (user.email_verify_token !== String(otp)) {
      return res.status(400).json({ success: false, message: 'الرمز غير صحيح' });
    }
    if (user.email_verify_expires && new Date() > new Date(user.email_verify_expires)) {
      return res.status(400).json({ success: false, message: 'انتهت صلاحية الرمز. اطلب رمزاً جديداً' });
    }

    await user.update({ is_verified: true, email_verify_token: null, email_verify_expires: null });
    logger.info(`[AUTH] Email verified: ${email}`);
    res.json({ success: true, message: 'تم تفعيل حسابك بنجاح! 🎉' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'حدث خطأ' });
  }
};

/* ─────────────────────────────────────────────
   POST /api/v1/auth/resend-verification
   ───────────────────────────────────────────── */
exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    if (user.is_verified) return res.json({ success: true, message: 'الحساب مفعّل مسبقاً' });

    const otp = generateOTP();
    await user.update({
      email_verify_token: otp,
      email_verify_expires: new Date(Date.now() + 10 * 60 * 1000),
    });
    sendOTP(email, otp, 'verify');
    res.json({ success: true, message: 'تم إرسال رمز التحقق إلى بريدك الإلكتروني' });
  } catch (e) {
    res.status(500).json({ success: false, message: 'حدث خطأ' });
  }
};

/* ─────────────────────────────────────────────
   POST /api/v1/auth/forgot-password
   ───────────────────────────────────────────── */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'البريد الإلكتروني مطلوب' });

    const user = await User.findOne({ where: { email } });
    if (!user) {
      // Security: don't reveal if email exists
      return res.json({ success: true, message: 'إذا كان البريد مسجلاً، ستصلك رسالة OTP خلال دقائق' });
    }

    const otp = generateOTP();
    const expires = new Date(Date.now() + 15 * 60 * 1000); // 15 min

    await user.update({ reset_token: otp, reset_token_expires: expires });
    sendOTP(email, otp, 'reset');

    logger.info(`[AUTH] Password reset OTP: ${otp} for ${email}`);
    res.json({
      success: true,
      message: 'تم إرسال رمز إعادة التعيين إلى بريدك الإلكتروني',
      // Expose OTP in sandbox/dev for testing
      ...(process.env.NODE_ENV !== 'production' && { _sandbox_otp: otp }),
    });
  } catch (e) {
    logger.error('[AUTH] ForgotPassword error: ' + e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ' });
  }
};

/* ─────────────────────────────────────────────
   POST /api/v1/auth/reset-password
   ───────────────────────────────────────────── */
exports.resetPassword = async (req, res) => {
  try {
    const { email, otp, new_password } = req.body;
    if (!email || !otp || !new_password) {
      return res.status(400).json({ success: false, message: 'جميع الحقول مطلوبة' });
    }
    if (new_password.length < 6) {
      return res.status(400).json({ success: false, message: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });

    if (user.reset_token !== String(otp)) {
      return res.status(400).json({ success: false, message: 'الرمز غير صحيح' });
    }
    if (!user.reset_token_expires || new Date() > new Date(user.reset_token_expires)) {
      return res.status(400).json({ success: false, message: 'انتهت صلاحية الرمز. اطلب رمزاً جديداً' });
    }

    await user.update({ password: new_password, reset_token: null, reset_token_expires: null });
    logger.info(`[AUTH] Password reset successful for: ${email}`);
    res.json({ success: true, message: 'تم تعيين كلمة المرور الجديدة بنجاح! يمكنك تسجيل الدخول الآن 🔑' });
  } catch (e) {
    logger.error('[AUTH] ResetPassword error: ' + e.message);
    res.status(500).json({ success: false, message: 'حدث خطأ' });
  }
};

/* ─────────────────────────────────────────────
   POST /api/v1/auth/login
   Supports email OR phone
   ───────────────────────────────────────────── */
exports.login = async (req, res) => {
  try {
    const { email, phone, password } = req.body;

    if (!password || (!email && !phone)) {
      return res.status(400).json({ success: false, message: 'بيانات الدخول مطلوبة' });
    }

    const whereClause = email ? { email } : { phone };
    const user = await User.findOne({ where: whereClause });

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: email
          ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة'
          : 'رقم الهاتف أو كلمة المرور غير صحيحة',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'الحساب معطل. تواصل مع الدعم' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);
    await user.update({ refresh_token: refreshToken, last_login: new Date() });

    logger.info(`[AUTH] User logged in: ${email || phone}`);

    res.json({
      success: true,
      message: `أهلاً ${user.name}! 👋`,
      data: {
        user: user.toSafeObject(),
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error('[AUTH] Login error: ' + error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تسجيل الدخول' });
  }
};

/* ─────────────────────────────────────────────
   POST /api/v1/auth/refresh
   ───────────────────────────────────────────── */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(401).json({ success: false, message: 'رمز التحديث مطلوب' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'lifeflow_refresh');
    const user = await User.findOne({ where: { id: decoded.id, refresh_token: refreshToken } });
    if (!user) return res.status(401).json({ success: false, message: 'رمز التحديث غير صالح' });

    const tokens = generateTokens(user.id);
    await user.update({ refresh_token: tokens.refreshToken });
    res.json({ success: true, data: tokens });
  } catch (error) {
    res.status(401).json({ success: false, message: 'انتهت صلاحية رمز التحديث' });
  }
};

/* ─────────────────────────────────────────────
   POST /api/v1/auth/logout
   ───────────────────────────────────────────── */
exports.logout = async (req, res) => {
  try {
    await req.user.update({ refresh_token: null });
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ' });
  }
};

/* ─────────────────────────────────────────────
   GET /api/v1/auth/me
   ───────────────────────────────────────────── */
exports.getMe = async (req, res) => {
  res.json({ success: true, data: req.user.toSafeObject() });
};

/* ─────────────────────────────────────────────
   POST /api/v1/auth/demo
   Creates or retrieves the demo account and seeds sample data
   ───────────────────────────────────────────── */
exports.demoLogin = async (req, res) => {
  try {
    const DEMO_EMAIL    = 'demo@lifeflow.app';
    const DEMO_PASSWORD = 'Demo@2026!';
    const DEMO_NAME     = 'أحمد التجريبي';

    // Find or create demo user
    let user = await User.findOne({ where: { email: DEMO_EMAIL } });

    if (!user) {
      user = await User.create({
        name:       DEMO_NAME,
        email:      DEMO_EMAIL,
        password:   DEMO_PASSWORD,
        timezone:   'Africa/Cairo',
        language:   'ar',
        is_verified: true,
        subscription_plan: 'premium',
        subscription_status: 'active',
        wake_up_time:    '07:00',
        sleep_time:      '23:00',
        work_start_time: '09:00',
        work_end_time:   '17:00',
      });
    } else {
      // Update demo user password to known value
      await user.update({ password: DEMO_PASSWORD, is_verified: true, subscription_plan: 'premium' });
    }

    // Seed demo data if empty
    try {
      const Task  = require('../models/task.model');
      const Habit = require('../models/habit.model');
      const Mood  = require('../models/mood.model');

      const taskCount = await Task.count({ where: { user_id: user.id } });
      if (taskCount === 0) {
        const today = new Date();
        const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

        await Task.bulkCreate([
          { user_id: user.id, title: 'مراجعة تقرير الأداء الأسبوعي', priority: 'high',   status: 'pending',   due_date: today,     estimated_minutes: 60,  category: 'work',     ai_tags: JSON.stringify(['تقارير','أداء']) },
          { user_id: user.id, title: 'الرد على رسائل البريد الإلكتروني', priority: 'medium', status: 'pending', due_date: today,     estimated_minutes: 30,  category: 'work' },
          { user_id: user.id, title: 'تمرين رياضي 30 دقيقة', priority: 'medium', status: 'pending',   due_date: today,     estimated_minutes: 30,  category: 'health' },
          { user_id: user.id, title: 'قراءة كتاب Atomic Habits', priority: 'low',    status: 'completed', due_date: today,     estimated_minutes: 45,  category: 'personal', completed_at: new Date() },
          { user_id: user.id, title: 'تحضير عرض تقديمي للاجتماع', priority: 'urgent', status: 'pending',  due_date: tomorrow,  estimated_minutes: 120, category: 'work' },
          { user_id: user.id, title: 'شراء المستلزمات الأسبوعية', priority: 'low',    status: 'completed', due_date: yesterday, estimated_minutes: 45,  category: 'personal', completed_at: new Date() },
          { user_id: user.id, title: 'مكالمة مع أهل', priority: 'medium', status: 'pending', due_date: today, estimated_minutes: 20, category: 'personal' },
        ]);
      }

      const habitCount = await Habit.count({ where: { user_id: user.id } });
      if (habitCount === 0) {
        await Habit.bulkCreate([
          { user_id: user.id, name: 'تمرين يومي', description: '30 دقيقة كل يوم', frequency: 'daily',  target_value: 30, unit: 'دقيقة',  icon: '💪', color: '#10B981', current_streak: 5,  longest_streak: 12, is_active: true },
          { user_id: user.id, name: 'شرب الماء', description: '8 أكواب يومياً',   frequency: 'daily',  target_value: 8,  unit: 'كوب',    icon: '💧', color: '#3B82F6', current_streak: 14, longest_streak: 14, is_active: true },
          { user_id: user.id, name: 'قراءة', description: '20 دقيقة قبل النوم',   frequency: 'daily',  target_value: 20, unit: 'دقيقة',  icon: '📚', color: '#8B5CF6', current_streak: 3,  longest_streak: 21, is_active: true },
          { user_id: user.id, name: 'تأمل ذهني', description: '10 دقائق صباحاً',  frequency: 'daily',  target_value: 10, unit: 'دقيقة',  icon: '🧘', color: '#F59E0B', current_streak: 7,  longest_streak: 7,  is_active: true },
          { user_id: user.id, name: 'صلاة الفجر في وقتها', description: '',        frequency: 'daily',  target_value: 1,  unit: 'مرة',    icon: '🕌', color: '#6366F1', current_streak: 21, longest_streak: 30, is_active: true },
        ]);
      }

      const moodCount = await Mood.count({ where: { user_id: user.id } });
      if (moodCount === 0) {
        const moods = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(); d.setDate(d.getDate() - i);
          moods.push({ user_id: user.id, mood_score: Math.floor(6 + Math.random() * 4), energy_level: Math.floor(50 + Math.random() * 40), notes: i === 0 ? 'يوم ممتاز وإنتاجي!' : null, recorded_at: d });
        }
        await Mood.bulkCreate(moods);
      }
    } catch (seedError) {
      logger.warn('[AUTH-DEMO] Seed error (non-fatal):', seedError.message);
    }

    const { accessToken, refreshToken } = generateTokens(user.id);
    await user.update({ refresh_token: refreshToken });

    logger.info('[AUTH] Demo login success');

    res.json({
      success: true,
      message: `أهلاً بك في الحساب التجريبي! 🎯 جرّب جميع الميزات المتاحة`,
      data: {
        user: user.toSafeObject(),
        accessToken,
        refreshToken,
        is_demo: true,
      },
    });
  } catch (error) {
    logger.error('[AUTH] Demo login error: ' + error.message);
    res.status(500).json({ success: false, message: 'فشل الدخول التجريبي' });
  }
};
