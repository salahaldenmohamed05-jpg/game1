/**
 * Voice Routes - Speech to Text & Text to Speech
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { aiService } = require('../ai/ai.service');
const logger = require('../utils/logger');

router.use(protect);

/**
 * @route   POST /api/v1/voice/command
 * @desc    Process voice command text | معالجة أمر صوتي
 */
router.post('/command', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'النص مطلوب' });

    const result = await aiService.processVoiceCommand(text, req.user);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Voice command error:', error);
    res.status(500).json({ success: false, message: 'فشل في معالجة الأمر الصوتي' });
  }
});

/**
 * @route   POST /api/v1/voice/transcribe
 * @desc    Transcribe audio to text (uses OpenAI Whisper)
 */
router.post('/transcribe', async (req, res) => {
  try {
    const { audio_base64, language = 'ar' } = req.body;

    // In production: use OpenAI Whisper API
    // const OpenAI = require('openai');
    // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // const transcription = await openai.audio.transcriptions.create({
    //   file: audioFile,
    //   model: 'whisper-1',
    //   language: language,
    // });

    res.json({
      success: true,
      data: {
        text: 'سيتم تحويل الصوت إلى نص باستخدام OpenAI Whisper',
        language,
        note: 'يحتاج مفتاح OpenAI API',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في تحويل الصوت إلى نص' });
  }
});

/**
 * @route   POST /api/v1/voice/speak
 * @desc    Convert text to speech
 */
router.post('/speak', async (req, res) => {
  try {
    const { text, voice = 'alloy', speed = 1.0 } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'النص مطلوب' });

    // In production: use OpenAI TTS API
    res.json({
      success: true,
      data: {
        text,
        voice,
        note: 'يحتاج مفتاح OpenAI API لإنشاء الصوت',
        voices_available: ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'],
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في تحويل النص إلى صوت' });
  }
});

module.exports = router;
