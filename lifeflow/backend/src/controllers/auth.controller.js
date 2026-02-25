/**
 * Auth Controller
 * ================
 * يتحكم في عمليات التسجيل وتسجيل الدخول
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const logger = require('../utils/logger');

/**
 * Generate JWT Tokens
 */
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

/**
 * @route   POST /api/v1/auth/register
 * @desc    Register new user | تسجيل مستخدم جديد
 */
exports.register = async (req, res) => {
  try {
    const { name, email, password, timezone = 'Africa/Cairo', language = 'ar' } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'البريد الإلكتروني مسجل مسبقاً',
      });
    }

    // Create user
    const user = await User.create({ name, email, password, timezone, language });

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user.id);

    // Save refresh token
    await user.update({ refresh_token: refreshToken });

    logger.info(`New user registered: ${email}`);

    res.status(201).json({
      success: true,
      message: 'مرحباً! تم إنشاء حسابك بنجاح 🎉',
      data: {
        user: user.toSafeObject(),
        accessToken,
        refreshToken,
      },
    });
  } catch (error) {
    logger.error('Register error:', error);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إنشاء الحساب' });
  }
};

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login user | تسجيل الدخول
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user with password
    const user = await User.findOne({ where: { email } });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({ success: false, message: 'الحساب معطل' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id);
    await user.update({ refresh_token: refreshToken, last_login: new Date() });

    logger.info(`User logged in: ${email}`);

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
    logger.error('Login error:', error);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تسجيل الدخول' });
  }
};

/**
 * @route   POST /api/v1/auth/refresh
 * @desc    Refresh access token
 */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(401).json({ success: false, message: 'رمز التحديث مطلوب' });
    }

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET || 'lifeflow_refresh');
    const user = await User.findOne({ where: { id: decoded.id, refresh_token: refreshToken } });

    if (!user) {
      return res.status(401).json({ success: false, message: 'رمز التحديث غير صالح' });
    }

    const tokens = generateTokens(user.id);
    await user.update({ refresh_token: tokens.refreshToken });

    res.json({ success: true, data: tokens });
  } catch (error) {
    res.status(401).json({ success: false, message: 'انتهت صلاحية رمز التحديث' });
  }
};

/**
 * @route   POST /api/v1/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    await req.user.update({ refresh_token: null });
    res.json({ success: true, message: 'تم تسجيل الخروج بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ' });
  }
};

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile
 */
exports.getMe = async (req, res) => {
  res.json({ success: true, data: req.user.toSafeObject() });
};
