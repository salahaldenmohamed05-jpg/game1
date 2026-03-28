/**
 * Voice Routes - Speech to Text & Text to Speech
 * Uses Groq for AI processing (OpenAI references removed)
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { writeLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');
// Phase B: Use ai.core.service as single AI entry point
const aiCore = require('../services/ai.core.service');

router.use(protect);

/**
 * @route   POST /api/v1/voice/command
 * @desc    Process voice command text via the unified AI core
 */
router.post('/command', writeLimiter, async (req, res) => {
  try {
    const { text, timezone = 'Africa/Cairo' } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'النص مطلوب' });

    // Phase B: Route through ai.core.service
    const result = await aiCore.command(req.user.id, text, timezone, null);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Voice command error: ' + error.message);
    res.status(500).json({ success: false, message: 'فشل في معالجة الأمر الصوتي' });
  }
});

/**
 * @route   POST /api/v1/voice/transcribe
 * @desc    Transcribe audio to text
 * Note: Browser Web Speech API handles transcription client-side.
 * This endpoint accepts already-transcribed text for processing.
 */
router.post('/transcribe', writeLimiter, async (req, res) => {
  try {
    const { text, language = 'ar' } = req.body;

    if (text) {
      // If text already provided (from Web Speech API), just return it
      res.json({
        success: true,
        data: { text, language, source: 'client' },
      });
    } else {
      res.json({
        success: true,
        data: {
          text: '',
          language,
          note: 'استخدام Web Speech API في المتصفح للتحويل الصوتي',
          source: 'browser_api',
        },
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في معالجة الطلب' });
  }
});

/**
 * @route   POST /api/v1/voice/speak
 * @desc    Convert text to speech (client-side Web Speech Synthesis)
 */
router.post('/speak', writeLimiter, async (req, res) => {
  try {
    const { text, voice = 'ar-SA', speed = 1.0 } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'النص مطلوب' });

    // Use browser SpeechSynthesis API on the client side
    res.json({
      success: true,
      data: {
        text,
        voice,
        speed,
        method: 'browser_speech_synthesis',
        note: 'استخدام Speech Synthesis API في المتصفح',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في معالجة الطلب' });
  }
});

/**
 * @route   GET /api/v1/voice/analyze
 * @desc    Voice session analysis
 */
router.get('/analyze', async (req, res) => {
  try {
    res.json({
      success: true,
      data: {
        sessions_count: 0,
        avg_session_length: 0,
        most_used_commands: [],
        supported_commands: [
          'اضف مهمة ...',
          'مزاجي اليوم ...',
          'اعطني خطة اليوم',
          'ما مهامي المتأخرة؟',
          'خلّص مهمة ...',
          'أجّل مهمة ...',
        ],
        note: 'المساعد الصوتي يعمل عبر Web Speech API في المتصفح',
      }
    });
  } catch(e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
