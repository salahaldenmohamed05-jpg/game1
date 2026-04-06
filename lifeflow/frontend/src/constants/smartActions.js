/**
 * Smart Actions — Single Source of Truth (Phase H: Intent-Based Redesign)
 * ========================================================================
 * Used by: DashboardHome, AssistantView, QuickCommandInput
 *
 * PHASE H REDESIGN:
 * - Each action is an INTENT, not an auto-execution trigger.
 * - `type` determines behavior:
 *     'navigate' → navigates to a view (predictable, no side effects)
 *     'modal'    → opens a modal/form (user confirms before anything happens)
 *     'ai_chat'  → sends to assistant as a prompt (user can review response)
 * - No action auto-creates tasks, auto-sends commands, or causes destructive changes.
 * - Every action is REVERSIBLE or requires USER CONFIRMATION.
 */

// Full action set — intent-based entry points
export const SMART_ACTIONS = [
  {
    id: 'add_task',
    label: 'إضافة مهمة',
    icon: '📋',
    type: 'navigate',       // Opens tasks view where user fills modal
    target: 'tasks',
    description: 'افتح صفحة المهام وأضف مهمة جديدة',
  },
  {
    id: 'start_now',
    label: 'ابدأ الآن',
    icon: '⚡',
    type: 'navigate',       // Goes to execution engine (dashboard focus card)
    target: 'dashboard',
    description: 'انتقل للإجراء الأهم حالياً',
  },
  {
    id: 'mood_check',
    label: 'سجّل مزاجي',
    icon: '💙',
    type: 'navigate',       // Opens mood view
    target: 'mood',
    description: 'افتح صفحة المزاج وسجّل حالتك',
  },
  {
    id: 'habit_check',
    label: 'عاداتي',
    icon: '🔥',
    type: 'navigate',       // Opens habits view
    target: 'habits',
    description: 'افتح صفحة العادات لتسجيل إنجازاتك',
  },
  {
    id: 'day_plan',
    label: 'خطة اليوم',
    icon: '☀️',
    type: 'ai_chat',        // Sends to assistant for AI-generated plan
    command: 'ابدأ يومي وخطط لي جدولي',
    target: 'assistant',
    description: 'اسأل المساعد عن خطة يومك',
  },
  {
    id: 'reflect',
    label: 'تقييم يومي',
    icon: '🌙',
    type: 'ai_chat',        // Evening reflection via assistant
    command: 'كيف كان يومي؟ عايز أعمل تقييم',
    target: 'assistant',
    description: 'راجع يومك مع المساعد الذكي',
  },
];

// Quick prompts for AssistantView chat — Atomic Habits aligned
// Phase 10: Every prompt connects to identity, cues, or rewards
export const QUICK_PROMPTS = [
  { text: 'ابدأ يومي الآن',              icon: '🚀' },
  { text: 'إيه الأهم دلوقتي؟',         icon: '⚡' },
  { text: 'أنا مش لاقي حافز — ساعدني', icon: '💡' },
  { text: 'قسّم المهمة لخطوات',        icon: '✂️' },
  { text: 'تحليل أدائي وعاداتي',       icon: '📊' },
  { text: 'أنا تعبان — إيه الحل؟',     icon: '🧘' },
];

// Placeholder hints for QuickCommandInput (cycles randomly)
export const QUICK_HINTS = SMART_ACTIONS.map(a => a.label + '...');

// Welcome message for AssistantView
// Phase 10: Behavioral Engine powered — direct, motivational, context-aware.
// Uses Egyptian Arabic. NO formal Arabic (فصحى).
export const WELCOME_MSG = {
  id: 'welcome',
  role: 'assistant',
  content: 'أهلاً! 👋\n\nأنا مساعدك الشخصي. بستخدم نظام العادات الذرية عشان أساعدك تبني هوية جديدة — مش بس تخلّص مهام.\n\nقوللي عايز تعمل إيه وهنبدأ حالاً.',
  suggestions: ['ابدأ يومي الآن', 'إيه الأهم دلوقتي؟', 'تحليل أدائي'],
};
