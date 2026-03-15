/**
 * User Routes - Profile management
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const User = require('../models/user.model');

router.use(protect);

// Get profile (GET /users/profile)
router.get('/profile', async (req, res) => {
  try {
    res.json({ success: true, data: req.user.toSafeObject() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب الملف الشخصي' });
  }
});

// Update profile
router.put('/profile', async (req, res) => {
  try {
    const { name, timezone, language, wake_up_time, sleep_time, work_start_time, work_end_time, ai_personality, notifications_enabled, smart_reminders } = req.body;
    await req.user.update({ name, timezone, language, wake_up_time, sleep_time, work_start_time, work_end_time, ai_personality, notifications_enabled, smart_reminders });
    res.json({ success: true, message: 'تم تحديث الملف الشخصي', data: req.user.toSafeObject() });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في تحديث الملف الشخصي' });
  }
});

// Update FCM token for push notifications
router.patch('/fcm-token', async (req, res) => {
  try {
    await req.user.update({ fcm_token: req.body.token });
    res.json({ success: true, message: 'تم تحديث رمز الإشعارات' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل' });
  }
});

// Change password (also support /password alias for frontend compatibility)
router.put('/password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await User.findByPk(req.user.id);
    if (!(await user.comparePassword(current_password))) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
    }
    await user.update({ password: new_password });
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في تغيير كلمة المرور' });
  }
});

// Change password
router.put('/change-password', async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await User.findByPk(req.user.id);
    if (!(await user.comparePassword(current_password))) {
      return res.status(400).json({ success: false, message: 'كلمة المرور الحالية غير صحيحة' });
    }
    await user.update({ password: new_password });
    res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في تغيير كلمة المرور' });
  }
});

module.exports = router;
