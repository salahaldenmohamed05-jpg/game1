/**
 * LLM Orchestrator Service v2.0 — LifeFlow Behavior-Aware Coaching
 * ==================================================================
 * Upgrade from Phase K → Phase L
 *
 * CHANGES from v1.0:
 *   1. NEW: Behavior-state-aware coaching (avoidance, overwhelm, momentum, coasting)
 *   2. NEW: Proactive action commands (not passive suggestions)
 *   3. NEW: Context-rich explanations with specific task/signal references
 *   4. ENHANCED: Coaching templates match behavioral state, not just signal thresholds
 *   5. ENHANCED: LLM prompts include behavioral context for smarter responses
 *
 * Architecture (unchanged):
 *   LLM ONLY for:
 *     1. Human-readable explanations of ML decisions
 *     2. Coaching messages based on user state
 *     3. Natural language formatting of signals
 *   LLM NEVER makes decisions, overrides, or selects candidates.
 *   Every LLM call has a STATIC FALLBACK — system works 100% without LLM.
 */

'use strict';

const logger = require('../utils/logger');

function getAIService() {
  try { return require('../ai/ai.service'); } catch (_e) { return null; }
}

// ─── Behavior-Aware Coaching Templates ──────────────────────────────────────

const COACHING_TEMPLATES = {
  // Behavioral state templates (Phase Q — natural Egyptian Arabic)
  avoidance: [
    'لاحظنا تأخير في البداية — ده طبيعي. ابدأ بأي حاجة لمدة 5 دقايق بس.',
    'التسويف مش كسل — ده ردّ فعل عادي. ابدأ دلوقتي بأصغر خطوة.',
    'قاعدة الخمس دقايق: ابدأ 5 دقايق بس. 80% من الناس بيكملوا بعدها.',
  ],
  overwhelmed: [
    'المهام كتير — ده مفهوم. سيب كل حاجة وركّز على مهمة واحدة بس.',
    'الإحساس بالإرهاق طبيعي لما المهام تتراكم. اختار أسهل حاجة وابدأ فيها.',
    'ماتحاولش تحل كل حاجة مرة واحدة. خطوة واحدة بس.',
  ],
  productive: [
    'زخمك ممتاز! استغل الحالة دي — ده أحسن وقت للحاجات الصعبة.',
    'انت في أحسن حالاتك — ماتضيعش الوقت ده على مهام سهلة.',
    'أداؤك النهارده رائع. كل مهمة تنجزها بتزوّد قوتك.',
  ],
  coasting: [
    'أنجزت حاجات كويسة — بس لاحظنا إنها سهلة. يلا ندخل في الجد.',
    'الإنتاجية الحقيقية مش في عدد المهام — في أهميتها.',
    'بنيت زخم كويس — دلوقتي استخدمه في حاجة مهمة فعلاً.',
  ],
  winding_down: [
    'قرّب وقت الراحة. راجع إيه اللي عملته النهارده.',
    'يوم كويس! خطّط لبكرة بسرعة وبعدين ارتاح.',
    'خلّص اللي تقدر عليه وأجّل الباقي لبكرة. النوم الكويس = شغل أحسن.',
  ],

  // Signal-based templates (Phase Q — Egyptian Arabic)
  burnout_high: [
    'جسمك بيبعتلك إشارات إرهاق. الراحة مش كسل — دي استثمار في إنتاجيتك.',
    'الإجهاد عالي. خد 15-20 دقيقة راحة حقيقية وبعدين ارجع.',
    'صحتك أهم من أي مهمة. ارتاح دلوقتي.',
  ],
  energy_high: [
    'طاقتك عالية! ده أحسن وقت للحاجات الصعبة.',
    'استغل الطاقة دي — ابدأ بأصعب مهمة عندك.',
    'انت في أحسن حالاتك. ماتضيعش الوقت على السهل.',
  ],
  energy_low: [
    'طاقتك واطية — عادي. ابدأ بحاجة صغيرة وسهلة.',
    'مافيش مشكلة في الطاقة الواطية. اختار حاجة خفيفة.',
    'الطاقة الواطية = وقت كويس للحاجات الروتينية والعادات.',
  ],
  procrastination_high: [
    'لاحظنا تأخير في البداية. ابدأ 5 دقايق بس!',
    'كلنا بنأجّل ساعات. السر: ابدأ بأصغر حاجة.',
    'التسويف بيختفي بعد أول دقيقة شغل. يلا ابدأ.',
  ],
  all_done: [
    'برافو! خلّصت كل حاجة النهارده. ارتاح بقى.',
    'يوم ممتاز! خد وقتك للراحة أو خطّط لبكرة.',
    'كل المهام خلصت — يا بطل! دلوقتي ارتاح واشحن طاقتك.',
  ],
};

function pickTemplate(key) {
  const templates = COACHING_TEMPLATES[key] || COACHING_TEMPLATES.productive;
  return templates[Math.floor(Math.random() * templates.length)];
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC API
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate explanation for a decision — behavior-aware.
 */
async function explainDecision(context) {
  const { currentFocus, why, signals } = context;
  const staticExplanation = buildStaticExplanation(currentFocus, why, signals);

  const aiSvc = getAIService();
  if (!aiSvc) return staticExplanation;

  try {
    const momentum = signals.momentum || 'starting';
    const systemPrompt = `أنت مساعد ذكي اسمه LifeFlow. مهمتك: اشرح للمستخدم لماذا اخترنا له هذا الإجراء الآن.
القواعد:
1. تحدث بالعربية فقط
2. كن مختصراً (2-3 جمل)
3. اذكر الأسباب الرئيسية بطريقة طبيعية ومشجعة
4. لا تستخدم كلمات تقنية مثل "ML" أو "signals" أو "algorithm"
5. اجعل الرد شخصياً ودافئاً وعملياً
6. إذا كان المستخدم في حالة تجنّب، شجّعه بلطف
7. إذا كان في زخم إنتاجي، حفّزه للاستمرار
8. استخدم أسلوب الأمر الودي: "ابدأ..." بدل "يمكنك..."`;

    const userMessage = `
الإجراء المُختار: ${currentFocus.title || currentFocus.action}
الأسباب: ${why.join('، ')}
حالة المستخدم: ${momentum}
مستوى الطاقة: ${signals.energy || 50}%
مستوى التركيز: ${signals.focus || 50}%
خطر الإجهاد: ${Math.round((signals.burnout || 0) * 100)}%
الإرهاق: ${Math.round((signals.overwhelm || 0) * 100)}%
اشرح للمستخدم لماذا هذا هو الإجراء الأفضل الآن.`;

    const response = await aiSvc.chat(systemPrompt, userMessage, {
      maxTokens: 200,
      temperature: 0.7,
    });

    if (typeof response === 'string' && response.length > 10) {
      return response;
    }
    return staticExplanation;
  } catch (e) {
    logger.debug('[LLM-ORCHESTRATOR] Explanation LLM failed, using static:', String(e.message).slice(0, 100));
    return staticExplanation;
  }
}

/**
 * Generate coaching message — behavior-state-driven.
 */
async function generateCoaching(signals) {
  // Determine category from behavioral state first, then signals
  let category;
  const momentum = signals.momentum || 'starting';

  // Behavioral state takes priority
  if (['avoidance', 'overwhelmed', 'productive', 'coasting', 'winding_down'].includes(momentum)) {
    category = momentum;
  }
  // Fall back to signal-based
  else if ((signals.burnout || 0) >= 0.65) category = 'burnout_high';
  else if ((signals.energy || 50) >= 70) category = 'energy_high';
  else if ((signals.energy || 50) < 35) category = 'energy_low';
  else if ((signals.procrastination || 0) >= 0.5) category = 'procrastination_high';
  else category = 'productive';

  const staticCoaching = pickTemplate(category);

  const aiSvc = getAIService();
  if (!aiSvc) return { message: staticCoaching, category, source: 'template' };

  try {
    const systemPrompt = `أنت مدرب حياة ذكي. قدّم رسالة تحفيزية قصيرة (جملة واحدة أو اثنتين) بالعربية.
القواعد:
- استخدم أسلوب الأمر الودي: "ابدأ الآن" بدل "يمكنك أن تبدأ"
- كن عملياً وواقعياً
- إذا كان المستخدم متجنّب، لا توبّخه — شجّعه بلطف
- إذا كان مرهق، لا تضغط عليه — اقترح الراحة
- حالة المستخدم: ${momentum}`;
    const userMessage = `الطاقة: ${signals.energy || 50}%، التركيز: ${signals.focus || 50}%، الإجهاد: ${Math.round((signals.burnout || 0) * 100)}%، التسويف: ${Math.round((signals.procrastination || 0) * 100)}%، الزخم: ${momentum}`;

    const response = await aiSvc.chat(systemPrompt, userMessage, {
      maxTokens: 100,
      temperature: 0.8,
    });

    if (typeof response === 'string' && response.length > 10) {
      return { message: response, category, source: 'llm' };
    }
    return { message: staticCoaching, category, source: 'template' };
  } catch (e) {
    return { message: staticCoaching, category, source: 'template_fallback' };
  }
}

/**
 * Format intelligence signals as human-readable Arabic text.
 * v2: includes behavioral state.
 */
function formatSignalsForUser(signals) {
  const lines = [];

  // Behavioral state (NEW — most important for user)
  const momentum = signals.momentum || 'starting';
  const momentumLabels = {
    avoidance: '🔄 حالتك: تأخير في البدء',
    overwhelmed: '😰 حالتك: ضغط مرتفع',
    productive: '🚀 حالتك: زخم إنتاجي',
    coasting: '📋 حالتك: إنجاز مهام سهلة',
    winding_down: '🌙 حالتك: نهاية اليوم',
    starting: '🌅 حالتك: بداية يوم جديد',
  };
  if (momentumLabels[momentum]) lines.push(momentumLabels[momentum]);

  const energy = signals.energy || 50;
  if (energy >= 70) lines.push(`⚡ طاقتك عالية (${energy}%)`);
  else if (energy >= 45) lines.push(`💪 طاقتك متوسطة (${energy}%)`);
  else lines.push(`😴 طاقتك منخفضة (${energy}%)`);

  const focus = signals.focus || 50;
  if (focus >= 70) lines.push(`🎯 تركيز ممتاز (${focus}%)`);
  else if (focus >= 45) lines.push(`🙂 تركيز جيد (${focus}%)`);
  else lines.push(`📱 التركيز منخفض (${focus}%)`);

  const burnout = Math.round((signals.burnout || 0) * 100);
  if (burnout >= 60) lines.push(`⚠️ خطر إجهاد (${burnout}%)`);
  else if (burnout >= 35) lines.push(`🟡 انتبه للإجهاد (${burnout}%)`);
  else lines.push(`✅ وضع صحي (خطر ${burnout}%)`);

  const completion = Math.round((signals.completion || 0.5) * 100);
  lines.push(`📊 احتمالية الإنجاز: ${completion}%`);

  const overwhelm = Math.round((signals.overwhelm || 0) * 100);
  if (overwhelm >= 50) lines.push(`📦 مستوى الضغط: ${overwhelm}%`);

  return lines;
}

// ─── Static Explanation Builder ─────────────────────────────────────────────
function buildStaticExplanation(currentFocus, why, signals) {
  const momentum = signals.momentum || 'starting';

  // Behavioral state takes priority
  if (['avoidance', 'overwhelmed', 'productive', 'coasting', 'winding_down'].includes(momentum)) {
    return pickTemplate(momentum);
  }

  const type = currentFocus.type || currentFocus.action;
  if (type === 'break' || currentFocus.action === 'take_break') return pickTemplate('burnout_high');
  if (type === 'celebration' || currentFocus.action === 'review_plan') return pickTemplate('all_done');

  const energy = signals.energy || 50;
  if (energy >= 70) return pickTemplate('energy_high');
  if (energy < 35) return pickTemplate('energy_low');

  const procrastination = signals.procrastination || 0;
  if (procrastination >= 0.5) return pickTemplate('procrastination_high');

  return pickTemplate('productive');
}

/**
 * Phase N (Phase 7): Rephrase a coach reply for tone variation.
 * LLM ONLY changes phrasing/style — NEVER the task, data, or decision.
 * Returns null on failure (caller uses original reply).
 */
async function rephraseCoachedReply(coachReply, context = {}) {
  const aiSvc = getAIService();
  if (!aiSvc) return null;

  try {
    const systemPrompt = `أنت كوتش مصري ذكي. هتاخد رد جاهز فيه بيانات حقيقية وهتعيد صياغته بأسلوب مختلف.

قواعد صارمة:
1. لازم تحتفظ بنفس اسم المهمة بالظبط: "${context.taskTitle || ''}"
2. لازم تحتفظ بنفس الأرقام (أيام تأخير، طاقة، تركيز)
3. غيّر الأسلوب والبنية — لا تعيد نفس الجمل
4. حالة المستخدم السلوكية: ${context.behaviorState || 'starting'}
5. طاقته: ${context.energy || 50}%
6. خليك مختصر (3-4 سطور ماكس)
7. استخدم أسلوب مصري خفيف ودافئ
8. ماتضيفش معلومات مالهاش أصل في الرد الأصلي`;

    const response = await aiSvc.chat(systemPrompt, `أعد صياغة هذا الرد:\n\n${coachReply}`, {
      maxTokens: 250,
      temperature: 0.85,
    });

    if (typeof response === 'string' && response.length > 20) {
      return response;
    }
    return null;
  } catch (e) {
    logger.debug('[LLM-ORCHESTRATOR] Rephrase failed (non-critical):', String(e.message).slice(0, 100));
    return null;
  }
}

module.exports = {
  explainDecision,
  generateCoaching,
  rephraseCoachedReply,
  formatSignalsForUser,
  _buildStaticExplanation: buildStaticExplanation,
  COACHING_TEMPLATES,
};
