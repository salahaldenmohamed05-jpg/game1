/**
 * JWT Authentication Middleware
 * ==============================
 * وسيط التحقق من هوية المستخدم عبر JWT
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const logger = require('../utils/logger');

/**
 * Protect routes - verify JWT token
 */
const protect = async (req, res, next) => {
  try {
    let token;

    // Extract token from Authorization header
    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'يرجى تسجيل الدخول للوصول إلى هذه الصفحة',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'lifeflow_secret');

    // Find user
    const user = await User.findByPk(decoded.id, {
      attributes: { exclude: ['password', 'refresh_token'] },
    });

    if (!user || !user.is_active) {
      return res.status(401).json({
        success: false,
        message: 'المستخدم غير موجود أو الحساب غير نشط',
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ success: false, message: 'رمز التحقق غير صالح' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'انتهت صلاحية الجلسة، يرجى تسجيل الدخول مجدداً' });
    }
    logger.error('Auth middleware error:', error);
    next(error);
  }
};

/**
 * Optional auth - doesn't fail if no token
 */
const optionalAuth = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'lifeflow_secret');
      const user = await User.findByPk(decoded.id, {
        attributes: { exclude: ['password', 'refresh_token'] },
      });
      if (user?.is_active) req.user = user;
    }
    next();
  } catch {
    next();
  }
};

module.exports = { protect, optionalAuth };
