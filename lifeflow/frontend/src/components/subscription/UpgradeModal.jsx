/**
 * Upgrade Modal — Premium Feature Gate
 * =======================================
 * Shows when users try to access premium features.
 * Includes feature preview, trial offer, and subscription CTA.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation } from '@tanstack/react-query';
import {
  X, Crown, Zap, Check, ArrowRight, Loader2,
  Lock, Star, Brain, TrendingUp, Target, BarChart2
} from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';

// Feature descriptions for each premium area
const FEATURE_INFO = {
  performance_scores: {
    icon: '📊',
    title: 'محرك الأداء الذكي',
    description: 'احصل على درجات يومية لإنتاجيتك وتركيزك واتساقك مع تحليل متعمق وتوصيات مخصصة.',
    benefits: [
      'درجات يومية: الإنتاجية، التركيز، الاتساق',
      'مقارنة أسبوعية ومتابعة التقدم',
      'تقارير أسبوعية تفصيلية',
      'تحليل نمط أدائك عبر الزمن',
    ],
    color: 'from-blue-500 to-cyan-500',
  },
  weekly_audit: {
    icon: '📋',
    title: 'مراجعة الحياة الأسبوعية',
    description: 'مراجعة تفصيلية كل أسبوع: ما أنجزته، ما فاتك، وما تحتاج تحسينه.',
    benefits: [
      'تحليل المهام المكتملة وغير المكتملة',
      'تحديد أنماط الطاقة الأسبوعية',
      'استراتيجيات تحسين مُولَّدة بالذكاء الاصطناعي',
      'ملخص مدرب ذكي شخصي',
    ],
    color: 'from-purple-500 to-pink-500',
  },
  procrastination: {
    icon: '⚡',
    title: 'كشف المماطلة',
    description: 'اكتشف تلقائيًا المهام التي تؤجلها وامنع التأخير بخطط مخصصة.',
    benefits: [
      'رصد تلقائي للمهام المعاد جدولتها مرتين+',
      'اقتراح تقسيم المهام الكبيرة',
      'التوقيت الأمثل لكل مهمة',
      'كشف نمط المماطلة وعلاجه',
    ],
    color: 'from-orange-500 to-yellow-500',
  },
  energy_mapping: {
    icon: '⚡',
    title: 'خريطة الطاقة الشخصية',
    description: 'اكتشف متى تكون في أفضل حالاتك وخطط جدولك اليومي وفق منحنى طاقتك.',
    benefits: [
      'خريطة حرارة لإنتاجيتك كل ساعة',
      'توصيات جدول العمل المثالي',
      'أوقات التعمق الفكري الأنسب',
      'ارتباط المزاج بالطاقة الإنتاجية',
    ],
    color: 'from-green-500 to-teal-500',
  },
  coaching: {
    icon: '🧠',
    title: 'مرشد الذكاء الاصطناعي',
    description: 'مرشد شخصي يرافقك يومًا بيوم بنصائح صغيرة وتحفيز مُكيَّف مع سلوكك.',
    benefits: [
      'ملاحظات يومية قصيرة وفعّالة',
      'نبضات تحفيزية قائمة على سلوكك',
      'نبرة مُكيَّفة تناسب شخصيتك',
      'تتبع تطور عاداتك وتحسنها',
    ],
    color: 'from-violet-500 to-purple-500',
  },
  default: {
    icon: '👑',
    title: 'مزايا البريميوم',
    description: 'افتح كامل إمكانيات LifeFlow وحوّل إنتاجيتك مع أدوات الذكاء الاصطناعي المتقدمة.',
    benefits: [
      'محرك الأداء الذكي مع درجات يومية',
      'مراجعة الحياة الأسبوعية التفصيلية',
      'كشف المماطلة وخريطة الطاقة',
      'مرشد ذكاء اصطناعي شخصي',
    ],
    color: 'from-primary-500 to-purple-500',
  },
};

export default function UpgradeModal({ isOpen, onClose, feature = 'default', onTrialStart }) {
  const [mode, setMode] = useState('info'); // 'info' | 'trial-confirm'
  const info = FEATURE_INFO[feature] || FEATURE_INFO.default;

  const trialMutation = useMutation({
    mutationFn: () => api.post('/subscription/trial/start'),
    onSuccess: () => {
      toast.success('🎉 تم تفعيل التجربة المجانية لمدة 7 أيام!');
      onTrialStart?.();
      onClose();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'فشل في تفعيل التجربة');
    },
  });

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)' }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="w-full max-w-md glass-card overflow-hidden"
          dir="rtl"
        >
          {/* Gradient header */}
          <div className={`bg-gradient-to-br ${info.color} p-6 relative`}>
            <button
              onClick={onClose}
              className="absolute top-4 left-4 p-1.5 rounded-lg bg-black/20 hover:bg-black/40 text-white transition-colors"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-2xl">
                {info.icon}
              </div>
              <div>
                <div className="flex items-center gap-2 text-white/70 text-xs mb-0.5">
                  <Lock size={12} />
                  <span>مزية بريميوم</span>
                </div>
                <h2 className="text-xl font-black text-white">{info.title}</h2>
              </div>
            </div>
            <p className="text-white/80 text-sm leading-relaxed">{info.description}</p>
          </div>

          {/* Benefits */}
          <div className="p-6 space-y-3">
            <p className="text-gray-400 text-xs font-medium uppercase tracking-wider">ما الذي ستحصل عليه</p>
            {info.benefits.map((benefit, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className="flex items-start gap-3"
              >
                <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check size={11} className="text-green-400" />
                </div>
                <span className="text-gray-300 text-sm">{benefit}</span>
              </motion.div>
            ))}

            {/* Trial offer banner */}
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl flex items-center gap-3">
              <Zap size={20} className="text-yellow-400 flex-shrink-0" />
              <div>
                <p className="text-yellow-300 font-semibold text-sm">جرّب مجانًا لمدة 7 أيام</p>
                <p className="text-gray-400 text-xs">لا يلزم بطاقة ائتمان — وصول فوري لكل المزايا</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => trialMutation.mutate()}
                disabled={trialMutation.isPending}
                className="flex-1 py-3 rounded-xl bg-gradient-to-r from-primary-500 to-purple-600 text-white font-bold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
              >
                {trialMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <>
                    <Zap size={16} />
                    ابدأ التجربة المجانية
                  </>
                )}
              </button>
              <button
                onClick={onClose}
                className="px-4 py-3 rounded-xl border border-white/10 text-gray-400 hover:text-white hover:border-white/20 transition-all text-sm"
              >
                لاحقًا
              </button>
            </div>

            <button
              onClick={() => {/* navigate to subscription */}}
              className="w-full text-center text-xs text-primary-400 hover:text-primary-300 py-1"
            >
              عرض الخطط والأسعار ←
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
