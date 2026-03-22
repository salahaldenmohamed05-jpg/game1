/**
 * Auth Routes — مسارات المصادقة
 * ================================
 * POST /register        — إنشاء حساب (email أو هاتف)
 * POST /login           — تسجيل الدخول
 * POST /refresh         — تحديث رمز الوصول
 * POST /logout          — تسجيل الخروج
 * GET  /me              — بيانات المستخدم الحالي
 * POST /verify-email    — تأكيد البريد بـ OTP
 * POST /resend-verification — إعادة إرسال OTP
 * POST /forgot-password — طلب إعادة تعيين كلمة المرور
 * POST /reset-password  — تعيين كلمة المرور الجديدة
 */
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth.middleware');

// Public routes
router.post('/register',            authController.register);
router.post('/login',               authController.login);
router.post('/demo',                authController.demoLogin);   // ← NEW: instant demo access
router.post('/refresh',             authController.refreshToken);
router.post('/verify-email',        authController.verifyEmail);
router.post('/resend-verification', authController.resendVerification);
router.post('/forgot-password',     authController.forgotPassword);
router.post('/reset-password',      authController.resetPassword);

// Protected routes
router.post('/logout', protect, authController.logout);
router.get('/me',      protect, authController.getMe);

module.exports = router;
