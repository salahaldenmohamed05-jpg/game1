/**
 * useVoiceChat — Voice Chat Hook (STT + TTS)
 * ============================================
 * Browser-native voice interaction:
 *   - Speech-to-Text (STT): Mic button → spoken words → text → auto-send
 *   - Text-to-Speech (TTS): AI reply → spoken aloud with natural prosody
 *
 * Enhanced Arabic TTS:
 *   - Breaks text into natural sentence chunks
 *   - Adds pauses between sentences using SSML-like splitting
 *   - Prioritizes high-quality cloud voices (Google/Microsoft Neural)
 *   - Uses warm pitch and natural rate for realistic Arabic speech
 *   - Pre-processes text to add diacritics hints for common words
 *   - Queues sentences for smooth sequential playback
 *
 * Supports Arabic (ar-EG) and English (en-US).
 * Uses Web Speech API — works on Chrome, Edge, Safari.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

// Check browser support once
const HAS_STT = typeof window !== 'undefined' && (
  'SpeechRecognition' in window || 'webkitSpeechRecognition' in window
);
const HAS_TTS = typeof window !== 'undefined' && 'speechSynthesis' in window;

// Arabic pronunciation improvement map — helps TTS pronounce common words correctly
const ARABIC_PRONUNCIATION_MAP = {
  // Common greeting phrases
  'مرحبا': 'مَرحَبًا',
  'مرحباً': 'مَرحَبًا',
  'اهلا': 'أَهلًا',
  'أهلاً': 'أَهلًا',
  'شكرا': 'شُكرًا',
  'شكراً': 'شُكرًا',
  // Common task-related words
  'مهمة': 'مَهَمَّة',
  'مهام': 'مَهَامّ',
  'عادة': 'عَادَة',
  'عادات': 'عَادَات',
  'هدف': 'هَدَف',
  'أهداف': 'أَهدَاف',
  'إنتاجية': 'إِنتَاجِيَّة',
  'تركيز': 'تَركِيز',
  'طاقة': 'طَاقَة',
  'مزاج': 'مِزَاج',
  'يوم': 'يَوم',
  'اليوم': 'اليَوم',
  'غداً': 'غَدًا',
  'غدا': 'غَدًا',
  // Priority words
  'مهم': 'مُهِمّ',
  'عاجل': 'عَاجِل',
  'أولوية': 'أَولَوِيَّة',
  // Status words
  'مكتمل': 'مُكتَمِل',
  'قيد التنفيذ': 'قَيدَ التَنفِيذ',
  'متأخر': 'مُتَأَخِّر',
  // App-specific terms
  'المساعد الذكي': 'المُسَاعِد الذَّكِيّ',
  'جدولك': 'جَدوَلُك',
  'خطة': 'خُطَّة',
  'تقرير': 'تَقرِير',
  'تحليل': 'تَحلِيل',
  'نصيحة': 'نَصِيحَة',
  'نصائح': 'نَصَائِح',
  'روتين': 'رُوتِين',
  'إنجاز': 'إِنجَاز',
  'تقدم': 'تَقَدُّم',
};

export default function useVoiceChat({ language = 'ar', onTranscript = null, autoSend = true } = {}) {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false); // TTS auto-speak mode
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const utteranceRef = useRef(null);
  const speechQueueRef = useRef([]); // Queue for sequential sentence playback
  const isPlayingQueueRef = useRef(false);
  const bestVoiceRef = useRef(null); // Cache the best voice found

  // Map language code to STT lang
  const sttLang = language === 'en' ? 'en-US' : 'ar-EG';
  const ttsLang = language === 'en' ? 'en-US' : 'ar-SA';

  // ─── Voice Discovery & Caching ──────────────────────────────────────────
  const findBestVoice = useCallback(() => {
    if (!HAS_TTS) return null;
    if (bestVoiceRef.current?.lang?.startsWith(language === 'en' ? 'en' : 'ar')) {
      return bestVoiceRef.current;
    }

    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return null;

    const langPrefix = language === 'en' ? 'en' : 'ar';

    // Score each voice for quality
    const scoredVoices = voices
      .filter(v => v.lang.startsWith(langPrefix))
      .map(v => {
        let score = 0;
        const name = (v.name || '').toLowerCase();
        
        // Premium cloud voices (highest quality — sound natural, not robotic)
        if (/neural|wavenet|premium|enhanced|natural|hd/i.test(name)) score += 200;
        // Google voices (cloud-backed, great Arabic support)
        if (/google/i.test(name)) score += 80;
        // Microsoft voices (also good)
        if (/microsoft/i.test(name)) score += 70;
        // Apple voices
        if (/apple|samantha|siri/i.test(name)) score += 60;
        // Non-local (cloud) voices tend to be higher quality
        if (!v.localService) score += 50;
        // Arabic-specific: female voices are usually more natural
        if (language === 'ar' && /female|laila|zeina|amira|fatima|maryam|hala|salma|lina/i.test(name)) score += 40;
        // English-specific preferred voices
        if (language === 'en' && /samantha|victoria|karen|daniel|alex/i.test(name)) score += 30;
        // Avoid compact/eSpeak/default voices (robotic-sounding)
        if (/espeak|compact|default|agnes|vicki/i.test(name)) score -= 100;
        // Prefer matching exact locale
        if (v.lang === ttsLang) score += 15;
        // Prefer Saudi Arabic for general Arabic
        if (language === 'ar' && v.lang === 'ar-SA') score += 10;
        // Egyptian Arabic is also good
        if (language === 'ar' && v.lang === 'ar-EG') score += 8;
        
        return { voice: v, score };
      })
      .sort((a, b) => b.score - a.score);

    if (scoredVoices.length > 0) {
      bestVoiceRef.current = scoredVoices[0].voice;
      return scoredVoices[0].voice;
    }
    return null;
  }, [language, ttsLang]);

  // Pre-load voices when they become available
  useEffect(() => {
    if (!HAS_TTS) return;
    
    const loadVoices = () => findBestVoice();
    loadVoices();
    
    // Voices are loaded asynchronously in some browsers
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);
    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [findBestVoice]);

  // ─── Speech-to-Text (STT) ──────────────────────────────────────────────
  const startListening = useCallback(() => {
    if (!HAS_STT) {
      setError('browser_not_supported');
      return;
    }
    // Stop any ongoing speech
    if (HAS_TTS) window.speechSynthesis.cancel();

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = sttLang;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setTranscript('');
    };

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interimTranscript += t;
        }
      }

      if (finalTranscript) {
        setTranscript(finalTranscript);
        if (onTranscript) {
          onTranscript(finalTranscript, true); // true = isFinal
        }
      } else if (interimTranscript) {
        setTranscript(interimTranscript);
        if (onTranscript) {
          onTranscript(interimTranscript, false);
        }
      }
    };

    recognition.onerror = (event) => {
      setIsListening(false);
      if (event.error === 'no-speech') {
        setError('no_speech');
      } else if (event.error === 'not-allowed') {
        setError('mic_blocked');
      } else {
        setError('stt_error');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [sttLang, onTranscript]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  // ─── Text Pre-processing for Natural Arabic Speech ─────────────────────
  const preprocessForSpeech = useCallback((text) => {
    if (!text) return '';

    // 1. Remove non-speech characters
    let clean = text
      .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2702}-\u{27B0}]/gu, '') // emojis
      .replace(/[*_~`#>|→←↑↓]/g, '') // markdown chars
      .replace(/\[.*?\]/g, '') // bracketed text
      .replace(/https?:\/\/\S+/g, '') // URLs
      .replace(/\d{2,}[-/]\d{2,}[-/]\d{2,}/g, '') // dates
      .replace(/[{}[\]()]/g, '') // braces
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // zero-width
      .replace(/[\uFFFD]/g, '') // replacement chars
      .replace(/\?{2,}/g, '') // orphan question marks
      .replace(/[\u4E00-\u9FFF\u3400-\u4DBF]/g, '') // CJK characters
      .replace(/•/g, '،') // bullets to Arabic comma
      .trim();

    // 2. Apply Arabic pronunciation enhancements
    if (language === 'ar') {
      for (const [word, diacritized] of Object.entries(ARABIC_PRONUNCIATION_MAP)) {
        // Use word boundary matching
        const regex = new RegExp(`(^|\\s)${word}(\\s|$|[.،؟!:])`, 'g');
        clean = clean.replace(regex, `$1${diacritized}$2`);
      }
      
      // 3. Add natural pauses: convert dash-separated text, colons
      clean = clean
        .replace(/\s*[-—]\s*/g, '، ') // dashes to Arabic comma pause
        .replace(/:\s*/g, '، ') // colons to pause
        .replace(/،\s*،/g, '،') // collapse double commas
        .replace(/\s{2,}/g, ' '); // collapse whitespace
    }

    return clean;
  }, [language]);

  // ─── Split text into natural speech chunks ─────────────────────────────
  const splitIntoSpeechChunks = useCallback((text) => {
    if (!text) return [];

    // Split on natural sentence boundaries
    // Arabic: period, question mark (؟), exclamation, newline
    // Also split on Arabic comma (،) for very long segments
    const sentenceSplitters = /([.!؟\n]+)/;
    const rawParts = text.split(sentenceSplitters).filter(s => s.trim());

    // Re-join sentence text with their terminators
    const sentences = [];
    for (let i = 0; i < rawParts.length; i++) {
      const part = rawParts[i].trim();
      if (!part) continue;
      
      // If this is a terminator, append to last sentence
      if (/^[.!؟\n]+$/.test(part)) {
        if (sentences.length > 0) {
          sentences[sentences.length - 1] += part;
        }
      } else {
        sentences.push(part);
      }
    }

    // Further split very long sentences (>120 chars) on Arabic comma
    const chunks = [];
    for (const sentence of sentences) {
      if (sentence.length > 120) {
        const subParts = sentence.split('،').map(s => s.trim()).filter(s => s.length > 2);
        if (subParts.length > 1) {
          chunks.push(...subParts);
        } else {
          chunks.push(sentence);
        }
      } else if (sentence.length > 2) {
        chunks.push(sentence);
      }
    }

    // Cap at 8 chunks to prevent very long speech
    return chunks.slice(0, 8);
  }, []);

  // ─── Play speech queue sequentially ────────────────────────────────────
  const playNextInQueue = useCallback(() => {
    if (!HAS_TTS || speechQueueRef.current.length === 0) {
      isPlayingQueueRef.current = false;
      setIsSpeaking(false);
      return;
    }

    const chunk = speechQueueRef.current.shift();
    if (!chunk || chunk.length < 2) {
      playNextInQueue();
      return;
    }

    const voice = findBestVoice();
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = ttsLang;
    
    // Natural prosody settings — prevent robotic monotone
    if (language === 'ar') {
      utterance.rate = 0.85; // Slightly slower for clarity and natural pacing
      utterance.pitch = 1.08; // Warm, slightly higher pitch for Arabic
      utterance.volume = 1;
    } else {
      utterance.rate = 0.92;
      utterance.pitch = 1.0;
      utterance.volume = 1;
    }

    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      // Small natural pause between sentences (200ms)
      setTimeout(() => playNextInQueue(), 200);
    };
    utterance.onerror = () => {
      // Continue even on error
      playNextInQueue();
    };

    utteranceRef.current = utterance;
    window.speechSynthesis.speak(utterance);
  }, [findBestVoice, ttsLang, language]);

  // ─── Text-to-Speech (TTS) — Enhanced Natural Voice ─────────────────────
  const speak = useCallback((text) => {
    if (!HAS_TTS || !text) return;

    // Cancel any ongoing speech and clear queue
    window.speechSynthesis.cancel();
    speechQueueRef.current = [];
    isPlayingQueueRef.current = false;

    // Pre-process text for natural speech
    const processedText = preprocessForSpeech(text);
    if (!processedText || processedText.length < 2) return;

    // Split into natural chunks
    const chunks = splitIntoSpeechChunks(processedText);
    if (chunks.length === 0) return;

    // If only one short chunk, speak directly (no queue overhead)
    if (chunks.length === 1 && chunks[0].length < 100) {
      const voice = findBestVoice();
      const utterance = new SpeechSynthesisUtterance(chunks[0]);
      utterance.lang = ttsLang;
      utterance.rate = language === 'ar' ? 0.85 : 0.92;
      utterance.pitch = language === 'ar' ? 1.08 : 1.0;
      utterance.volume = 1;
      if (voice) utterance.voice = voice;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      utteranceRef.current = utterance;
      window.speechSynthesis.speak(utterance);
      return;
    }

    // Queue multiple chunks for sequential playback
    speechQueueRef.current = [...chunks];
    isPlayingQueueRef.current = true;
    playNextInQueue();
  }, [ttsLang, language, preprocessForSpeech, splitIntoSpeechChunks, findBestVoice, playNextInQueue]);

  const stopSpeaking = useCallback(() => {
    if (HAS_TTS) {
      window.speechSynthesis.cancel();
    }
    speechQueueRef.current = [];
    isPlayingQueueRef.current = false;
    setIsSpeaking(false);
  }, []);

  // Auto-speak: call speak() when voiceEnabled is on
  const autoSpeak = useCallback((text) => {
    if (voiceEnabled && text) {
      speak(text);
    }
  }, [voiceEnabled, speak]);

  const toggleVoiceMode = useCallback(() => {
    setVoiceEnabled(prev => !prev);
    if (voiceEnabled) {
      // Turning off — stop any ongoing speech
      stopSpeaking();
    }
  }, [voiceEnabled, stopSpeaking]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort();
      if (HAS_TTS) window.speechSynthesis.cancel();
      speechQueueRef.current = [];
    };
  }, []);

  return {
    // STT
    isListening,
    startListening,
    stopListening,
    toggleListening,
    transcript,

    // TTS
    isSpeaking,
    speak,
    stopSpeaking,
    autoSpeak,

    // Voice mode
    voiceEnabled,
    toggleVoiceMode,
    setVoiceEnabled,

    // Support flags
    hasSTT: HAS_STT,
    hasTTS: HAS_TTS,

    // Error
    error,
    setError,
  };
}
