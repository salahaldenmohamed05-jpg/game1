/**
 * OnboardingFlow v2.0 — Goal-Driven Onboarding
 * ═══════════════════════════════════════════════════
 * Redesigned: user selects life areas → system generates goals,
 * behaviors, and an immediate first action.
 *
 * Steps:
 *   1. Welcome — personalized greeting
 *   2. Life Areas — select focus areas (generates goals)
 *   3. Role — define context for behavior tuning
 *   4. First Action — show generated goal + behavior, offer to start
 *
 * Integration: calls POST /engine/onboarding to create real
 * goals + behaviors in the database.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowRight, ArrowLeft, BookOpen, Briefcase, Code,
  TrendingUp, Heart, Globe, Zap, Target, Sparkles, Rocket,
} from 'lucide-react';
import { engineAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const STEPS = [
  { id: 'welcome', title: 'مرحباً بك في LifeFlow', subtitle: 'مش مجرد تطبيق مهام — LifeFlow يفهمك ويتكيّف معاك' },
  { id: 'focus',   title: 'إيه أكتر حاجة عايز تغيّرها؟', subtitle: 'اختار المجالات اللي عايز تتحسن فيها — هنبني لك أهداف وسلوكيات' },
  { id: 'role',    title: 'عرّفنا عن يومك', subtitle: 'هنكيّف التوقيتات والصعوبة حسب طبيعة حياتك' },
  { id: 'ready',   title: 'خطتك جاهزة!', subtitle: 'تم بناء أهدافك وسلوكياتك — يلا نبدأ أول خطوة' },
];

const FOCUS_AREAS = [
  { id: 'productivity', label: 'الإنتاجية',  emoji: '⚡', desc: 'إنجاز أكثر بتركيز' },
  { id: 'study',        label: 'الدراسة',    emoji: '📚', desc: 'بناء روتين مذاكرة' },
  { id: 'health',       label: 'الصحة',      emoji: '❤️', desc: 'عادات صحية يومية' },
  { id: 'fitness',      label: 'الرياضة',    emoji: '💪', desc: 'تمارين منتظمة' },
  { id: 'work',         label: 'العمل',      emoji: '💼', desc: 'تنظيم مهني' },
  { id: 'creativity',   label: 'الإبداع',    emoji: '🎨', desc: 'ممارسة إبداعية' },
  { id: 'social',       label: 'العلاقات',   emoji: '🤝', desc: 'تواصل أفضل' },
  { id: 'finance',      label: 'المالية',    emoji: '💰', desc: 'وعي مالي' },
];

const ROLES = [
  { id: 'student',       label: 'طالب',        emoji: '🎓' },
  { id: 'employee',      label: 'موظف',        emoji: '💼' },
  { id: 'freelancer',    label: 'فريلانسر',    emoji: '💻' },
  { id: 'entrepreneur',  label: 'رائد أعمال',  emoji: '🚀' },
  { id: 'parent',        label: 'والد/ة',      emoji: '❤️' },
  { id: 'other',         label: 'أخرى',        emoji: '🌍' },
];

export default function OnboardingFlow({ onComplete, userName }) {
  const [step, setStep] = useState(0);
  const [selectedRole, setSelectedRole] = useState(null);
  const [selectedAreas, setSelectedAreas] = useState([]);
  const [onboardingResult, setOnboardingResult] = useState(null);

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  // Mutation to call backend onboarding endpoint
  const onboardingMutation = useMutation({
    mutationFn: (data) => engineAPI.onboarding(data),
    onSuccess: (res) => {
      const result = res?.data?.data;
      setOnboardingResult(result);
      setStep(3); // Go to ready step
    },
    onError: () => {
      toast.error('حدث خطأ — سيتم الإعداد لاحقاً');
      setStep(3);
    },
  });

  const canNext = (
    step === 0 ||
    (step === 1 && selectedAreas.length > 0) ||
    (step === 2 && selectedRole) ||
    step === 3
  );

  const handleNext = useCallback(() => {
    if (step === 2 && selectedRole) {
      // On role selection complete, trigger backend onboarding
      onboardingMutation.mutate({
        role: selectedRole,
        focus_areas: selectedAreas,
      });
      return;
    }
    if (isLast) {
      onComplete({
        role: selectedRole,
        focus_areas: selectedAreas,
        onboarding_result: onboardingResult,
      });
      return;
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1));
  }, [step, isLast, onComplete, selectedRole, selectedAreas, onboardingResult, onboardingMutation]);

  const handleBack = useCallback(() => {
    setStep(s => Math.max(s - 1, 0));
  }, []);

  const toggleArea = (id) => {
    setSelectedAreas(prev =>
      prev.includes(id) ? prev.filter(a => a !== id) : prev.length < 4 ? [...prev, id] : prev
    );
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-dark/95 backdrop-blur-xl" dir="rtl">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-72 h-72 bg-primary-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 left-20 w-56 h-56 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      <div className="w-full max-w-md mx-4 relative z-10">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div key={i} className={`h-1.5 rounded-full transition-all duration-300 ${
              i === step ? 'w-8 bg-primary-500' : i < step ? 'w-4 bg-primary-500/40' : 'w-4 bg-white/10'
            }`} />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            transition={{ duration: 0.3 }}
          >
            {/* Step 0: Welcome */}
            {step === 0 && (
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
                  className="inline-flex items-center justify-center w-24 h-24 rounded-3xl bg-gradient-to-br from-primary-500 to-purple-600 mb-6 shadow-glow"
                >
                  <span className="text-5xl">✨</span>
                </motion.div>
                <h1 className="text-3xl font-black gradient-text mb-2">{currentStep.title}</h1>
                {userName && <p className="text-lg text-primary-400 font-bold mb-2">يا {userName}!</p>}
                <p className="text-gray-400 text-sm mb-4">{currentStep.subtitle}</p>
                <div className="space-y-2 text-right mt-6">
                  {[
                    { emoji: '🧠', text: 'النظام يقرر — أنت تنفّذ' },
                    { emoji: '🎯', text: 'أهداف وسلوكيات مبنية تلقائياً' },
                    { emoji: '📈', text: 'يتكيّف مع طاقتك ونمطك' },
                    { emoji: '🔄', text: 'كل يوم أفضل من اللي قبله' },
                  ].map((tip, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.3 + i * 0.12 }}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                      <span className="text-xl">{tip.emoji}</span>
                      <span className="text-sm text-gray-300">{tip.text}</span>
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* Step 1: Focus Areas */}
            {step === 1 && (
              <div>
                <h2 className="text-xl font-black text-white text-center mb-2">{currentStep.title}</h2>
                <p className="text-gray-400 text-sm text-center mb-1">{currentStep.subtitle}</p>
                <p className="text-[10px] text-gray-500 text-center mb-6">اختار حتى 4 مجالات — هنبني لكل واحد هدف + سلوك يومي</p>
                <div className="grid grid-cols-2 gap-3">
                  {FOCUS_AREAS.map((a, i) => (
                    <motion.button key={a.id}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      onClick={() => toggleArea(a.id)}
                      className={`p-3.5 rounded-2xl text-center transition-all active:scale-95 ${
                        selectedAreas.includes(a.id)
                          ? 'bg-primary-500/20 border-2 border-primary-500/50 shadow-lg shadow-primary-500/10'
                          : 'bg-white/5 border-2 border-transparent hover:bg-white/8'
                      }`}
                    >
                      <div className="text-2xl mb-1">{a.emoji}</div>
                      <div className="text-sm font-bold text-white mb-0.5">{a.label}</div>
                      <div className="text-[10px] text-gray-500">{a.desc}</div>
                    </motion.button>
                  ))}
                </div>
                {selectedAreas.length > 0 && (
                  <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    className="text-center text-[11px] text-primary-400 mt-3">
                    {selectedAreas.length} مجال مختار → {selectedAreas.length} هدف + {selectedAreas.length} سلوك يومي
                  </motion.p>
                )}
              </div>
            )}

            {/* Step 2: Role */}
            {step === 2 && (
              <div>
                <h2 className="text-xl font-black text-white text-center mb-2">{currentStep.title}</h2>
                <p className="text-gray-400 text-sm text-center mb-6">{currentStep.subtitle}</p>
                <div className="grid grid-cols-2 gap-3">
                  {ROLES.map((r) => (
                    <button key={r.id} onClick={() => setSelectedRole(r.id)}
                      className={`p-4 rounded-2xl text-center transition-all active:scale-95 ${
                        selectedRole === r.id
                          ? 'bg-primary-500/20 border-2 border-primary-500/50 shadow-lg shadow-primary-500/10'
                          : 'bg-white/5 border-2 border-transparent hover:bg-white/8'
                      }`}>
                      <div className="text-3xl mb-2">{r.emoji}</div>
                      <div className="text-sm font-bold text-white">{r.label}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Ready — Show generated goals & first action */}
            {step === 3 && (
              <div className="text-center">
                <motion.div
                  initial={{ scale: 0 }} animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                  className="text-7xl mb-6"
                >
                  🚀
                </motion.div>
                <h2 className="text-2xl font-black text-white mb-2">{currentStep.title}</h2>
                <p className="text-gray-400 text-sm mb-6">{currentStep.subtitle}</p>

                {onboardingMutation.isPending && (
                  <div className="text-center py-4">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      className="inline-block"
                    >
                      <Sparkles size={24} className="text-primary-400" />
                    </motion.div>
                    <p className="text-sm text-gray-400 mt-2">جاري بناء خطتك...</p>
                  </div>
                )}

                {onboardingResult && (
                  <div className="space-y-3 text-right">
                    {/* Generated goals */}
                    {onboardingResult.goals?.length > 0 && (
                      <div className="glass-card p-4">
                        <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                          <Target size={12} className="text-primary-400" /> أهدافك:
                        </p>
                        {onboardingResult.goals.map((g, i) => (
                          <motion.div key={g.id || i}
                            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.15 }}
                            className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0"
                          >
                            <span className="text-green-400 text-lg">✓</span>
                            <span className="text-sm text-white font-medium">{g.title}</span>
                          </motion.div>
                        ))}
                      </div>
                    )}

                    {/* Generated behaviors */}
                    {onboardingResult.behaviors?.length > 0 && (
                      <div className="glass-card p-4">
                        <p className="text-xs text-gray-500 mb-2 flex items-center gap-1">
                          <Zap size={12} className="text-yellow-400" /> سلوكيات يومية:
                        </p>
                        {onboardingResult.behaviors.map((b, i) => (
                          <motion.div key={b.id || i}
                            initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 + i * 0.15 }}
                            className="flex items-center gap-2 py-2 border-b border-white/5 last:border-0"
                          >
                            <span className="text-yellow-400 text-lg">⚡</span>
                            <span className="text-sm text-white font-medium">{b.name}</span>
                          </motion.div>
                        ))}
                      </div>
                    )}

                    {/* First action preview */}
                    {onboardingResult.first_action && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="glass-card p-4 bg-gradient-to-r from-primary-500/10 to-purple-500/5 border border-primary-500/20"
                      >
                        <p className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                          <Rocket size={12} className="text-primary-400" /> أول خطوة:
                        </p>
                        <p className="text-sm font-bold text-white">{onboardingResult.first_action.title}</p>
                        <p className="text-[11px] text-gray-400 mt-1">{onboardingResult.first_action.message}</p>
                        {onboardingResult.first_action.estimated_minutes && (
                          <span className="text-[10px] text-primary-400 mt-1 inline-block">
                            ⏱️ {onboardingResult.first_action.estimated_minutes} دقيقة
                          </span>
                        )}
                      </motion.div>
                    )}

                    {/* Fallback if no result yet */}
                    {!onboardingResult.goals?.length && !onboardingMutation.isPending && (
                      <div className="space-y-2">
                        {[
                          { icon: '📋', text: 'سيتم إنشاء أهدافك في الخلفية' },
                          { icon: '🎯', text: 'ابدأ باستخدام التطبيق وسنكيّف كل شيء' },
                          { icon: '🧠', text: 'المساعد الذكي جاهز لمساعدتك' },
                        ].map((tip, i) => (
                          <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.15 }}
                            className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                            <span className="text-xl">{tip.icon}</span>
                            <span className="text-sm text-gray-300">{tip.text}</span>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {!onboardingResult && !onboardingMutation.isPending && (
                  <div className="space-y-2 text-right">
                    {[
                      { icon: '📋', text: 'أضف أول مهمة من صفحة المهام' },
                      { icon: '🎯', text: 'أنشئ عادة يومية تبدأ بيها' },
                      { icon: '🧠', text: 'اسأل المساعد الذكي عن أي حاجة' },
                    ].map((tip, i) => (
                      <motion.div key={i} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.15 }}
                        className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
                        <span className="text-xl">{tip.icon}</span>
                        <span className="text-sm text-gray-300">{tip.text}</span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-8">
          {step > 0 && step < 3 ? (
            <button onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-white/5 transition-all text-sm">
              <ArrowRight size={16} /> رجوع
            </button>
          ) : <div />}
          
          <button onClick={handleNext}
            disabled={!canNext || onboardingMutation.isPending}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition-all active:scale-95 ${
              canNext && !onboardingMutation.isPending
                ? 'bg-gradient-to-l from-primary-500 to-purple-600 text-white shadow-lg shadow-primary-500/20'
                : 'bg-white/5 text-gray-500 cursor-not-allowed'
            }`}>
            {onboardingMutation.isPending ? (
              <span className="flex items-center gap-2">
                <motion.span animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}>
                  <Sparkles size={14} />
                </motion.span>
                جاري الإعداد...
              </span>
            ) : isLast ? (
              'ابدأ الآن! 🚀'
            ) : step === 2 ? (
              <span className="flex items-center gap-2">
                <Sparkles size={14} /> ابنِ خطتي
              </span>
            ) : (
              <>التالي <ArrowLeft size={16} /></>
            )}
          </button>
        </div>

        {/* Skip button */}
        {!isLast && step < 3 && (
          <button onClick={() => onComplete({ role: selectedRole, focus_areas: selectedAreas })}
            className="w-full mt-4 text-center text-xs text-gray-500 hover:text-gray-400 transition-colors">
            تخطي الإعداد
          </button>
        )}
      </div>
    </div>
  );
}
