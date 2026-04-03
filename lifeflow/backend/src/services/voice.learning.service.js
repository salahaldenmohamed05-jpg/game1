/**
 * Voice Learning Service — نظام تعلم المساعد من كلام المستخدم
 * =============================================================
 * Learns from user voice interactions to improve:
 *   1. Communication style (formal vs casual, dialect awareness)
 *   2. Common commands & shortcuts (frequently used phrases)
 *   3. Preferred response length & detail level
 *   4. Emotional tone preferences (encouraging, neutral, direct)
 *   5. Topic interests (tasks, habits, mood, planning, etc.)
 *   6. Time-of-day interaction patterns
 *   7. Vocabulary preferences (which Arabic words the user uses)
 *
 * Storage: Per-user profile in DB (user_model) + in-memory cache
 * Used by: AI chat, voice TTS, assistant responses, proactive messages
 */

'use strict';

const logger = require('../utils/logger');

// ─── In-memory voice profiles (user_id → profile) ──────────────────────────
const voiceProfiles = new Map();
const MAX_INTERACTIONS = 200; // Keep last 200 interactions per user

// ─── Default voice learning profile ─────────────────────────────────────────
function getDefaultProfile() {
  return {
    // Communication style preferences
    style: {
      formality: 0.5,       // 0 = very casual (عامية), 1 = very formal (فصحى)
      verbosity: 0.5,       // 0 = brief/concise, 1 = detailed/verbose
      encouragement: 0.7,   // 0 = neutral/direct, 1 = very encouraging
      emoji_usage: 0.5,     // 0 = no emojis, 1 = heavy emojis
      dialect: 'egyptian',  // detected dialect: egyptian, gulf, levantine, general
    },
    
    // Common phrases the user uses
    vocabulary: {
      greetings: [],        // How user greets (e.g., "يا حبيبي", "هاي", "مرحبا")
      commands: [],         // Common command patterns
      topics: {},           // Topic frequency: { tasks: 15, habits: 8, mood: 5 }
      preferred_words: {},  // Word usage frequency
    },
    
    // Interaction patterns
    patterns: {
      avg_message_length: 0,
      preferred_hours: {},      // { 9: 15, 10: 20, ... } hour → interaction count
      session_frequency: 0,     // Average sessions per day
      voice_vs_text_ratio: 0.5, // 0 = all text, 1 = all voice
      response_satisfaction: [], // Last N satisfaction signals
    },
    
    // Learning metadata
    meta: {
      total_interactions: 0,
      first_interaction: null,
      last_interaction: null,
      profile_version: 1,
      last_analysis: null,
    },
    
    // Raw interaction log (ring buffer)
    interactions: [],
  };
}

// ─── Dialect Detection ──────────────────────────────────────────────────────
const DIALECT_MARKERS = {
  egyptian: [
    'ازاي', 'عايز', 'عاوز', 'كده', 'يعني', 'بتاع', 'بتاعت', 'خلاص',
    'حاجة', 'كويس', 'ايوه', 'لأ', 'يلا', 'بس', 'عشان', 'ليه', 'فين',
    'ده', 'دي', 'دول', 'مش', 'ازاى', 'تمام', 'اه', 'حلو', 'جامد',
    'يابا', 'ماشي', 'طب', 'هو', 'هي', 'كمان', 'ولا', 'انت', 'اوي',
  ],
  gulf: [
    'شلونك', 'وش', 'ابي', 'زين', 'حيل', 'مال', 'وايد', 'اشوا',
    'يبيله', 'حطه', 'يالله', 'خلنا', 'اقدر', 'باين',
  ],
  levantine: [
    'كيفك', 'شو', 'هلق', 'ليش', 'هيك', 'كتير', 'منيح', 'بعرف',
    'بدي', 'هاد', 'هاي', 'يعطيك', 'عفوا',
  ],
};

function detectDialect(text) {
  if (!text) return 'general';
  const lower = text.toLowerCase();
  const scores = {};

  for (const [dialect, markers] of Object.entries(DIALECT_MARKERS)) {
    scores[dialect] = markers.filter(m => lower.includes(m)).length;
  }

  const best = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return best[1] > 0 ? best[0] : 'general';
}

// ─── Formality Detection ────────────────────────────────────────────────────
function detectFormality(text) {
  if (!text) return 0.5;
  
  const formalMarkers = ['أرجو', 'يرجى', 'أود', 'من فضلك', 'لو سمحت', 'حضرتك', 'سيادتك', 'أستاذ'];
  const casualMarkers = ['يا معلم', 'يابا', 'يا حبيبي', 'يلا', 'تمام', 'اوكي', 'ok', 'يصطا', 'يسطا'];
  
  const formalScore = formalMarkers.filter(m => text.includes(m)).length;
  const casualScore = casualMarkers.filter(m => text.includes(m)).length;
  
  if (formalScore + casualScore === 0) return 0.5;
  return formalScore / (formalScore + casualScore);
}

// ─── Topic Detection ────────────────────────────────────────────────────────
const TOPIC_KEYWORDS = {
  tasks:    ['مهمة', 'مهام', 'شغل', 'تاسك', 'واجب', 'اعمل', 'خلص', 'أكمل', 'أنهي'],
  habits:   ['عادة', 'عادات', 'روتين', 'يومي', 'تمرين', 'رياضة', 'قراءة', 'صلاة'],
  mood:     ['مزاج', 'مزاجي', 'حاسس', 'مبسوط', 'زعلان', 'قلقان', 'تعبان', 'نفسيتي'],
  planning: ['خطة', 'جدول', 'برنامج', 'اليوم', 'بكرة', 'غدا', 'الأسبوع', 'رتب'],
  analysis: ['تحليل', 'تقرير', 'إحصائيات', 'أداء', 'إنجاز', 'تقدم', 'نسبة'],
  help:     ['ساعدني', 'مساعدة', 'إزاي', 'كيف', 'نصيحة', 'اقتراح', 'رأيك'],
  goals:    ['هدف', 'أهداف', 'حلم', 'أحلام', 'طموح', 'خطة مستقبل'],
};

function detectTopics(text) {
  if (!text) return [];
  const topics = [];
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some(k => text.includes(k))) {
      topics.push(topic);
    }
  }
  return topics;
}

// ─── Voice Learning Service ─────────────────────────────────────────────────
const VoiceLearningService = {

  /**
   * Record a voice/text interaction and learn from it
   */
  async recordInteraction(userId, {
    text,
    source = 'text',     // 'voice' | 'text'
    response = null,      // AI response text
    satisfaction = null,  // 'positive' | 'negative' | 'neutral' | null
    action_taken = null,  // What the user did after (e.g., 'completed_task', 'ignored')
    context = {},         // Additional context (hour, page, etc.)
  }) {
    try {
      if (!userId || !text) return;

      const profile = this.getProfile(userId);
      const now = Date.now();
      const hour = new Date().getHours();

      // Create interaction record
      const interaction = {
        text: text.slice(0, 500), // Limit stored text
        source,
        topics: detectTopics(text),
        dialect: detectDialect(text),
        formality: detectFormality(text),
        length: text.length,
        hour,
        timestamp: now,
        satisfaction,
        action_taken,
      };

      // Add to ring buffer
      profile.interactions.push(interaction);
      if (profile.interactions.length > MAX_INTERACTIONS) {
        profile.interactions = profile.interactions.slice(-MAX_INTERACTIONS);
      }

      // Update style preferences (exponential moving average)
      const alpha = 0.15; // Learning rate
      profile.style.formality = profile.style.formality * (1 - alpha) + interaction.formality * alpha;
      
      // Detect verbosity preference
      const verbosity = Math.min(1, interaction.length / 200);
      profile.style.verbosity = profile.style.verbosity * (1 - alpha) + verbosity * alpha;

      // Update dialect
      if (interaction.dialect !== 'general') {
        profile.style.dialect = interaction.dialect;
      }

      // Update vocabulary
      interaction.topics.forEach(topic => {
        profile.vocabulary.topics[topic] = (profile.vocabulary.topics[topic] || 0) + 1;
      });

      // Extract key words
      const words = text.split(/\s+/).filter(w => w.length > 2);
      words.forEach(w => {
        profile.vocabulary.preferred_words[w] = (profile.vocabulary.preferred_words[w] || 0) + 1;
      });
      // Keep top 100 words only
      const wordEntries = Object.entries(profile.vocabulary.preferred_words)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 100);
      profile.vocabulary.preferred_words = Object.fromEntries(wordEntries);

      // Update interaction patterns
      profile.patterns.preferred_hours[hour] = (profile.patterns.preferred_hours[hour] || 0) + 1;
      
      const totalLen = profile.patterns.avg_message_length * profile.meta.total_interactions;
      profile.meta.total_interactions++;
      profile.patterns.avg_message_length = (totalLen + interaction.length) / profile.meta.total_interactions;

      if (source === 'voice') {
        profile.patterns.voice_vs_text_ratio = 
          profile.patterns.voice_vs_text_ratio * 0.9 + 0.1;
      } else {
        profile.patterns.voice_vs_text_ratio = 
          profile.patterns.voice_vs_text_ratio * 0.9;
      }

      // Track satisfaction
      if (satisfaction) {
        profile.patterns.response_satisfaction.push({
          value: satisfaction === 'positive' ? 1 : satisfaction === 'negative' ? -1 : 0,
          timestamp: now,
        });
        // Keep last 50
        if (profile.patterns.response_satisfaction.length > 50) {
          profile.patterns.response_satisfaction = profile.patterns.response_satisfaction.slice(-50);
        }
      }

      // Detect emoji preference from response satisfaction
      const hasEmoji = /[\u{1F300}-\u{1F9FF}]/u.test(text);
      if (hasEmoji) {
        profile.style.emoji_usage = Math.min(1, profile.style.emoji_usage + 0.05);
      }

      // Detect encouragement preference
      if (satisfaction === 'positive' && response) {
        const encouraging = /أحسنت|برافو|ممتاز|رائع|عظيم|جميل/u.test(response);
        if (encouraging) {
          profile.style.encouragement = Math.min(1, profile.style.encouragement + 0.03);
        }
      }

      // Update metadata
      if (!profile.meta.first_interaction) {
        profile.meta.first_interaction = now;
      }
      profile.meta.last_interaction = now;

      // Save to map
      voiceProfiles.set(userId, profile);

      // Persist to DB asynchronously
      this._persistProfile(userId, profile);

      logger.debug(`[VOICE_LEARN] Recorded interaction for ${userId}: ${source}, topics: ${interaction.topics.join(',')}`);
    } catch (err) {
      logger.error('[VOICE_LEARN] recordInteraction error:', err.message);
    }
  },

  /**
   * Get user's learned voice profile
   */
  getProfile(userId) {
    if (voiceProfiles.has(userId)) {
      return voiceProfiles.get(userId);
    }
    // Create default
    const profile = getDefaultProfile();
    voiceProfiles.set(userId, profile);
    return profile;
  },

  /**
   * Generate AI system prompt based on learned user preferences
   * This shapes how the AI responds to this specific user
   */
  getPersonalizedPrompt(userId) {
    const profile = this.getProfile(userId);
    const parts = [];

    // Dialect instruction
    if (profile.style.dialect === 'egyptian') {
      parts.push('المستخدم يتكلم مصري. رد عليه بالعامية المصرية بشكل طبيعي.');
    } else if (profile.style.dialect === 'gulf') {
      parts.push('المستخدم يتكلم خليجي. رد عليه باللهجة الخليجية.');
    } else if (profile.style.dialect === 'levantine') {
      parts.push('المستخدم يتكلم شامي. رد عليه باللهجة الشامية.');
    } else {
      parts.push('رد بالعربية الفصحى المبسطة مع لمسة مصرية خفيفة.');
    }

    // Formality
    if (profile.style.formality < 0.3) {
      parts.push('أسلوبك كاجوال وودود جدًا كأنك صاحبه.');
    } else if (profile.style.formality > 0.7) {
      parts.push('أسلوبك رسمي ومهذب ومحترم.');
    } else {
      parts.push('أسلوبك ودود ومحترم بدون تكلف.');
    }

    // Verbosity
    if (profile.style.verbosity < 0.3) {
      parts.push('ردودك مختصرة ومباشرة بدون كلام كتير.');
    } else if (profile.style.verbosity > 0.7) {
      parts.push('ردودك مفصلة وتشرح بالتفصيل.');
    }

    // Encouragement
    if (profile.style.encouragement > 0.6) {
      parts.push('شجّع المستخدم كتير واحتفل بإنجازاته.');
    }

    // Emoji
    if (profile.style.emoji_usage > 0.6) {
      parts.push('استخدم إيموجي في ردودك.');
    } else if (profile.style.emoji_usage < 0.2) {
      parts.push('لا تستخدم إيموجي.');
    }

    // Top topics interest
    const topTopics = Object.entries(profile.vocabulary.topics)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
    
    if (topTopics.length > 0) {
      const topicNames = {
        tasks: 'المهام', habits: 'العادات', mood: 'المزاج',
        planning: 'التخطيط', analysis: 'التحليل', help: 'المساعدة', goals: 'الأهداف',
      };
      const names = topTopics.map(t => topicNames[t] || t).join(' و');
      parts.push(`المستخدم مهتم أكثر بـ: ${names}. ركّز على هذه المواضيع.`);
    }

    // Active hours
    const peakHour = Object.entries(profile.patterns.preferred_hours)
      .sort((a, b) => b[1] - a[1])[0];
    if (peakHour) {
      parts.push(`المستخدم أنشط الساعة ${peakHour[0]}:00. خد ده في اعتبارك في جدولته.`);
    }

    return parts.join('\n');
  },

  /**
   * Get TTS settings personalized for this user
   */
  getTTSSettings(userId) {
    const profile = this.getProfile(userId);
    
    return {
      // Adjust TTS speed based on user's message length preference
      rate: profile.style.verbosity > 0.6 ? 0.82 : 0.88,
      pitch: 1.08,
      // Choose voice dialect
      preferred_lang: profile.style.dialect === 'egyptian' ? 'ar-EG' : 'ar-SA',
      // Break into smaller chunks for casual style
      max_chunk_length: profile.style.formality < 0.4 ? 80 : 120,
    };
  },

  /**
   * Get voice learning analytics for user
   */
  getAnalytics(userId) {
    const profile = this.getProfile(userId);
    
    const avgSatisfaction = profile.patterns.response_satisfaction.length > 0
      ? profile.patterns.response_satisfaction.reduce((sum, s) => sum + s.value, 0) / profile.patterns.response_satisfaction.length
      : 0;

    return {
      total_interactions: profile.meta.total_interactions,
      detected_dialect: profile.style.dialect,
      formality_level: Math.round(profile.style.formality * 100),
      verbosity_level: Math.round(profile.style.verbosity * 100),
      encouragement_preference: Math.round(profile.style.encouragement * 100),
      top_topics: Object.entries(profile.vocabulary.topics)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([topic, count]) => ({ topic, count })),
      peak_hours: Object.entries(profile.patterns.preferred_hours)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([hour, count]) => ({ hour: parseInt(hour), count })),
      voice_text_ratio: Math.round(profile.patterns.voice_vs_text_ratio * 100),
      avg_message_length: Math.round(profile.patterns.avg_message_length),
      satisfaction_score: Math.round((avgSatisfaction + 1) * 50), // 0-100
      first_interaction: profile.meta.first_interaction,
      last_interaction: profile.meta.last_interaction,
    };
  },

  /**
   * Persist profile to database
   */
  async _persistProfile(userId, profile) {
    setImmediate(async () => {
      try {
        const UserModel = (() => {
          try { return require('../models/user_model.model'); } catch { return null; }
        })();
        if (!UserModel) return;

        const serialized = {
          style: profile.style,
          vocabulary: {
            topics: profile.vocabulary.topics,
            preferred_words: Object.fromEntries(
              Object.entries(profile.vocabulary.preferred_words).slice(0, 50)
            ),
          },
          patterns: {
            preferred_hours: profile.patterns.preferred_hours,
            avg_message_length: profile.patterns.avg_message_length,
            voice_vs_text_ratio: profile.patterns.voice_vs_text_ratio,
          },
          meta: profile.meta,
        };

        await UserModel.update(
          { voice_learning: JSON.stringify(serialized) },
          { where: { user_id: userId } }
        ).catch(() => {
          // Column might not exist — non-fatal
        });
      } catch (e) {
        // Non-fatal
      }
    });
  },

  /**
   * Load profile from database
   */
  async loadProfile(userId) {
    try {
      const UserModel = (() => {
        try { return require('../models/user_model.model'); } catch { return null; }
      })();
      if (!UserModel) return;

      const record = await UserModel.findOne({ where: { user_id: userId }, raw: true });
      if (record?.voice_learning) {
        const saved = JSON.parse(record.voice_learning);
        const profile = getDefaultProfile();
        // Merge saved data
        if (saved.style) Object.assign(profile.style, saved.style);
        if (saved.vocabulary) {
          Object.assign(profile.vocabulary.topics, saved.vocabulary.topics || {});
          Object.assign(profile.vocabulary.preferred_words, saved.vocabulary.preferred_words || {});
        }
        if (saved.patterns) Object.assign(profile.patterns, saved.patterns);
        if (saved.meta) Object.assign(profile.meta, saved.meta);
        voiceProfiles.set(userId, profile);
        logger.debug(`[VOICE_LEARN] Loaded profile for ${userId}`);
      }
    } catch (e) {
      // Non-fatal
    }
  },
};

module.exports = VoiceLearningService;
