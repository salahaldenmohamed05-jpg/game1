/**
 * AI Routes - Direct AI interactions
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { aiService, chat } = require('../ai/ai.service');

router.use(protect);

// General AI chat
router.post('/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ success: false, message: 'الرسالة مطلوبة' });

    const systemPrompt = `أنت LifeFlow، مساعد شخصي ذكي للمستخدم ${req.user.name}. تحدث بالعربية دائماً وكن مفيداً وإيجابياً.`;
    const response = await chat(systemPrompt, message, { maxTokens: 500 });

    res.json({ success: true, data: { response, user: req.user.name } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في معالجة طلبك' });
  }
});

// Get productivity tips
router.get('/productivity-tips', async (req, res) => {
  try {
    const tips = await aiService.getProductivityTips(req.user);
    res.json({ success: true, data: tips });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في جلب النصائح' });
  }
});

// AI goal breakdown
router.post('/goal-breakdown', async (req, res) => {
  try {
    const { goal_name, goal_description, deadline } = req.body;
    const breakdown = await aiService.breakdownTask(goal_name, goal_description, req.user);
    res.json({ success: true, data: breakdown });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في تحليل الهدف' });
  }
});

module.exports = router;
