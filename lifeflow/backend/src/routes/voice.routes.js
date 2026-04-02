/**
 * Voice Routes - Speech to Text & Text to Speech + Learning
 * ===========================================================
 * Enhanced for natural Arabic speech with user learning:
 * - /command: Process voice commands via AI (learns from interactions)
 * - /transcribe: Accept pre-transcribed text
 * - /speak: Return TTS-optimized text (diacritized, natural pacing)
 * - /learn: Record interaction feedback for learning
 * - /profile: Get user's learned voice profile & analytics
 * - /analyze: Voice session stats
 */
const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth.middleware');
const { writeLimiter } = require('../middleware/rateLimiter');
const logger = require('../utils/logger');
const aiCore = require('../services/ai.core.service');
const voiceLearning = require('../services/voice.learning.service');

router.use(protect);

/**
 * Common Arabic diacritics map
 */
const ARABIC_DIACRITICS = {
  'مرحبا': 'مَرحَبًا', 'مرحباً': 'مَرحَبًا', 'أهلاً': 'أَهلًا وسَهلًا',
  'اهلا': 'أَهلًا', 'شكراً': 'شُكرًا', 'شكرا': 'شُكرًا', 'مهمة': 'مَهَمَّة',
  'مهام': 'مَهَامّ', 'عادة': 'عَادَة', 'عادات': 'عَادَات', 'هدف': 'هَدَف',
  'أهداف': 'أَهدَاف', 'إنتاجية': 'إِنتَاجِيَّة', 'تركيز': 'تَركِيز',
  'طاقة': 'طَاقَة', 'مزاج': 'مِزَاج', 'اليوم': 'اليَوم', 'غداً': 'غَدًا',
  'مكتمل': 'مُكتَمِل', 'متأخر': 'مُتَأَخِّر', 'خطة': 'خُطَّة',
  'تقرير': 'تَقرِير', 'نصيحة': 'نَصِيحَة', 'إنجاز': 'إِنجَاز',
  'ممتاز': 'مُمتَاز', 'رائع': 'رَائِع', 'تمام': 'تَمَام', 'يلا': 'يَلَّا',
  'حلو': 'حِلو', 'كويس': 'كُوَيِّس',
  // Additional words for natural speech
  'أحسنت': 'أَحسَنت', 'ابدأ': 'اِبدَأ', 'استمر': 'اِستَمِرّ',
  'معلومات': 'مَعلُومَات', 'تفاصيل': 'تَفَاصِيل', 'نتائج': 'نَتَائِج',
  'مساعدة': 'مُسَاعَدَة', 'اقتراح': 'اِقتِرَاح', 'تحسين': 'تَحسِين',
  'برنامج': 'بَرنَامَج', 'تطبيق': 'تَطبِيق', 'حساب': 'حِسَاب',
  'إعدادات': 'إِعدَادَات', 'إشعارات': 'إِشعَارَات',
};

function prepareTTSText(text, userId = null) {
  if (!text || typeof text !== 'string') return '';

  let tts = text
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '')
    .replace(/[*_~`#>|]/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/•\s*/g, '، ')
    .replace(/\s*[-—]\s*/g, '، ')
    .replace(/:\s*/g, '، ')
    .trim();

  for (const [plain, diacritized] of Object.entries(ARABIC_DIACRITICS)) {
    const regex = new RegExp(`(^|\\s)${plain}(\\s|$|[.،؟!:])`, 'g');
    tts = tts.replace(regex, `$1${diacritized}$2`);
  }

  tts = tts.replace(/،\s*،/g, '،').replace(/\s{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return tts;
}

/**
 * @route   POST /api/v1/voice/command
 * @desc    Process voice command text via unified AI core + learning
 */
router.post('/command', writeLimiter, async (req, res) => {
  try {
    const { text, timezone = 'Africa/Cairo', source = 'text' } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'النص مطلوب' });

    // Load and get personalized prompt
    await voiceLearning.loadProfile(req.user.id);
    const personalizedPrompt = voiceLearning.getPersonalizedPrompt(req.user.id);

    // Route through AI core with personalized context
    const result = await aiCore.command(req.user.id, text, timezone, personalizedPrompt);

    // Record interaction for learning
    voiceLearning.recordInteraction(req.user.id, {
      text,
      source,
      response: result?.reply || null,
      context: { timezone, hour: new Date().getHours() },
    });

    // Add TTS-optimized version
    if (result?.reply) {
      result.tts_text = prepareTTSText(result.reply, req.user.id);
    }

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('Voice command error: ' + error.message);
    res.status(500).json({ success: false, message: 'فشل في معالجة الأمر الصوتي' });
  }
});

/**
 * @route   POST /api/v1/voice/transcribe
 */
router.post('/transcribe', writeLimiter, async (req, res) => {
  try {
    const { text, language = 'ar' } = req.body;
    
    // Record voice transcription for learning
    if (text) {
      voiceLearning.recordInteraction(req.user.id, {
        text,
        source: 'voice',
        context: { language },
      });
    }

    if (text) {
      res.json({ success: true, data: { text, language, source: 'client' } });
    } else {
      res.json({
        success: true,
        data: { text: '', language, note: 'استخدام Web Speech API', source: 'browser_api' },
      });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في معالجة الطلب' });
  }
});

/**
 * @route   POST /api/v1/voice/speak
 * @desc    Convert text to TTS with personalized settings
 */
router.post('/speak', writeLimiter, async (req, res) => {
  try {
    const { text, voice, speed } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'النص مطلوب' });

    // Get personalized TTS settings
    const ttsSettings = voiceLearning.getTTSSettings(req.user.id);
    const ttsText = prepareTTSText(text, req.user.id);
    
    const chunks = ttsText.split(/[.!؟\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 2);

    const finalVoice = voice || ttsSettings.preferred_lang || 'ar-SA';
    const finalSpeed = speed || ttsSettings.rate || 0.85;

    res.json({
      success: true,
      data: {
        original_text: text,
        tts_text: ttsText,
        chunks,
        voice: finalVoice,
        speed: finalSpeed,
        pitch: ttsSettings.pitch || 1.08,
        method: 'browser_speech_synthesis',
        personalized: true,
        settings: {
          lang: finalVoice,
          rate: finalSpeed,
          pitch: ttsSettings.pitch || 1.08,
          volume: 1,
          prefer_voices: ['Google', 'Microsoft', 'Neural', 'Premium'],
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'فشل في معالجة الطلب' });
  }
});

/**
 * @route   POST /api/v1/voice/learn
 * @desc    Record user feedback on AI response (like/dislike/correction)
 */
router.post('/learn', writeLimiter, async (req, res) => {
  try {
    const { text, response, satisfaction, action_taken, correction } = req.body;

    await voiceLearning.recordInteraction(req.user.id, {
      text: text || '',
      source: 'feedback',
      response,
      satisfaction, // 'positive', 'negative', 'neutral'
      action_taken,
    });

    // If user provided a correction, learn the preferred phrasing
    if (correction && text) {
      await voiceLearning.recordInteraction(req.user.id, {
        text: correction,
        source: 'correction',
        context: { original_text: text },
      });
    }

    res.json({
      success: true,
      message: 'شكرًا على ملاحظتك! المساعد بيتعلم من كلامك',
      data: { learned: true },
    });
  } catch (error) {
    logger.error('Voice learn error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في تسجيل الملاحظة' });
  }
});

/**
 * @route   GET /api/v1/voice/profile
 * @desc    Get user's learned voice profile and analytics
 */
router.get('/profile', async (req, res) => {
  try {
    await voiceLearning.loadProfile(req.user.id);
    const analytics = voiceLearning.getAnalytics(req.user.id);
    const personalizedPrompt = voiceLearning.getPersonalizedPrompt(req.user.id);

    res.json({
      success: true,
      data: {
        analytics,
        personalized_prompt_preview: personalizedPrompt,
        tts_settings: voiceLearning.getTTSSettings(req.user.id),
      },
    });
  } catch (error) {
    logger.error('Voice profile error:', error.message);
    res.status(500).json({ success: false, message: 'خطأ في تحميل البروفايل' });
  }
});

/**
 * @route   GET /api/v1/voice/analyze
 */
router.get('/analyze', async (req, res) => {
  try {
    const analytics = voiceLearning.getAnalytics(req.user.id);

    res.json({
      success: true,
      data: {
        ...analytics,
        supported_commands: [
          'اضف مهمة ...', 'مزاجي اليوم ...', 'اعطني خطة اليوم',
          'ما مهامي المتأخرة؟', 'خلّص مهمة ...', 'أجّل مهمة ...',
        ],
        tts_features: {
          diacritics: true,
          natural_pacing: true,
          sentence_chunking: true,
          voice_selection: 'auto_best_quality',
          personalized: true,
          dialect_aware: true,
        },
        learning_features: {
          dialect_detection: true,
          formality_adaptation: true,
          topic_preference_tracking: true,
          satisfaction_learning: true,
          voice_text_ratio_tracking: true,
        },
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

module.exports = router;
