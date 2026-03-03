/**
 * Subscription View - Plans & Billing
 * =====================================
 * Full subscription management page with plan comparison,
 * Stripe checkout, and billing history.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Crown, Check, X, Zap, Star, Shield, ArrowRight,
  CreditCard, Calendar, AlertCircle, Loader2, Sparkles,
  Brain, TrendingUp, Target, Clock, BarChart2
} from 'lucide-react';
import api from '../../utils/api';
import toast from 'react-hot-toast';
import useAuthStore from '../../store/authStore';

// ─── Plan Features ───────────────────────────────────────────────────────────

const FREE_FEATURES = [
  { label: 'إدارة المهام الأساسية', included: true },
  { label: 'تتبع العادات (حتى 5 عادات)', included: true },
  { label: 'تسجيل المزاج اليومي', included: true },
  { label: 'إشعارات التذكير', included: true },
  { label: 'تقارير الأداء الذكية', included: false },
  { label: 'مراجعة الحياة الأسبوعية', included: false },
  { label: 'كشف المماطلة', included: false },
  { label: 'خريطة الطاقة', included: false },
  { label: 'مرشد الذكاء الاصطناعي', included: false },
  { label: 'تحليل سلوكي متقدم', included: false },
];

const PREMIUM_FEATURES = [
  { label: 'كل مزايا المجانية', included: true },
  { label: 'تقارير الأداء الذكية', included: true, highlight: true },
  { label: 'مراجعة الحياة الأسبوعية', included: true, highlight: true },
  { label: 'كشف المماطلة التلقائي', included: true, highlight: true },
  { label: 'خريطة الطاقة الشخصية', included: true, highlight: true },
  { label: 'مرشد الذكاء الاصطناعي', included: true, highlight: true },
  { label: 'تحليل سلوكي متقدم', included: true, highlight: true },
  { label: 'عادات غير محدودة', included: true },
  { label: 'تصدير التقارير', included: true },
  { label: 'دعم أولوية', included: true },
];

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SubscriptionView() {
  const { user, updateUser } = useAuthStore();
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [processingPlan, setProcessingPlan] = useState(null);

  const { data: subData, refetch: refetchSub } = useQuery({
    queryKey: ['subscription-full'],
    queryFn: () => api.get('/subscription/status'),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  const { data: plansData } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/subscription/plans'),
    retry: 1,
    staleTime: 60 * 60 * 1000,
  });

  const subscription = subData?.data;
  const plans = plansData?.data || {};
  const currentPlan = subscription?.plan || 'free';
  const isPremium = subscription?.is_premium;
  const trialDaysLeft = subscription?.trial_days_remaining;

  // Checkout mutation
  const checkoutMutation = useMutation({
    mutationFn: async (planData) => {
      const response = await api.post('/subscription/checkout', planData);
      return response.data;
    },
    onSuccess: (data) => {
      if (data.checkout_url) {
        window.location.href = data.checkout_url;
      } else if (data.subscription) {
        refetchSub();
        toast.success('تم تفعيل الاشتراك بنجاح! 🎉');
      }
      setProcessingPlan(null);
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'فشل في معالجة الطلب');
      setProcessingPlan(null);
    },
  });

  // Trial mutation
  const trialMutation = useMutation({
    mutationFn: () => api.post('/subscription/trial/start'),
    onSuccess: () => {
      refetchSub();
      toast.success('تم تفعيل التجربة المجانية لمدة 7 أيام! 🎉');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'فشل في تفعيل التجربة');
    },
  });

  // Cancel mutation
  const cancelMutation = useMutation({
    mutationFn: () => api.post('/subscription/cancel'),
    onSuccess: () => {
      refetchSub();
      toast.success('تم إلغاء الاشتراك. سيستمر الوصول حتى نهاية الفترة.');
    },
  });

  const handleSubscribe = async (planType) => {
    setProcessingPlan(planType);
    checkoutMutation.mutate({ plan: planType, billing_cycle: billingCycle });
  };

  const MONTHLY_PRICE = plans.premium?.pricing?.monthly_price_cents
    ? (plans.premium.pricing.monthly_price_cents / 100).toFixed(2)
    : '9.99';
  const YEARLY_PRICE = plans.premium?.pricing?.yearly_price_cents
    ? (plans.premium.pricing.yearly_price_cents / 100).toFixed(2)
    : '7.99';
  const YEARLY_SAVE = plans.premium?.pricing?.yearly_save_percent || 20;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-8" dir="rtl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center">
        <div className="inline-flex items-center gap-2 bg-purple-500/10 border border-purple-500/20 rounded-full px-4 py-2 mb-4">
          <Crown size={16} className="text-purple-400" />
          <span className="text-purple-400 text-sm font-medium">خطط LifeFlow</span>
        </div>
        <h1 className="text-4xl font-black text-white mb-3">اختر خطتك المثالية</h1>
        <p className="text-gray-400 max-w-xl mx-auto">
          ابدأ مجانًا وطوّر نفسك مع الأدوات الذكية للإنتاجية وتحليل السلوك
        </p>
      </motion.div>

      {/* Current Status Banner */}
      {currentPlan === 'trial' && trialDaysLeft > 0 && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-4 border border-yellow-500/30 bg-yellow-500/5"
        >
          <div className="flex items-center gap-3">
            <Zap className="text-yellow-400" size={20} />
            <div>
              <p className="text-yellow-300 font-semibold">أنت في فترة التجربة المجانية</p>
              <p className="text-gray-400 text-sm">تبقى {trialDaysLeft} يوم من التجربة المجانية — استمتع بجميع مزايا البريميوم</p>
            </div>
            <button
              onClick={() => handleSubscribe('premium')}
              className="mr-auto btn-primary text-sm whitespace-nowrap"
            >
              اشترك الآن
            </button>
          </div>
        </motion.div>
      )}

      {isPremium && currentPlan === 'premium' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-4 border border-green-500/30 bg-green-500/5"
        >
          <div className="flex items-center gap-3">
            <Check className="text-green-400" size={20} />
            <div>
              <p className="text-green-300 font-semibold">أنت مشترك في البريميوم ✨</p>
              <p className="text-gray-400 text-sm">
                {subscription?.period_end
                  ? `ينتهي في ${new Date(subscription.period_end).toLocaleDateString('ar-SA')}`
                  : 'اشتراك نشط'}
              </p>
            </div>
            {subscription?.cancel_at_period_end && (
              <span className="mr-auto text-xs text-orange-400 bg-orange-500/10 px-3 py-1 rounded-full">
                سيُلغى في نهاية الفترة
              </span>
            )}
          </div>
        </motion.div>
      )}

      {/* Billing Toggle */}
      {!isPremium && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              billingCycle === 'monthly'
                ? 'bg-primary-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            شهري
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              billingCycle === 'yearly'
                ? 'bg-primary-500 text-white'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            سنوي
            <span className="bg-green-500 text-white text-xs px-2 py-0.5 rounded-full">
              وفّر {YEARLY_SAVE}%
            </span>
          </button>
        </div>
      )}

      {/* Plan Cards */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Free Plan */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className={`glass-card p-6 relative ${currentPlan === 'free' ? 'border border-white/20' : ''}`}
        >
          {currentPlan === 'free' && (
            <div className="absolute top-4 left-4 bg-white/10 text-white text-xs px-3 py-1 rounded-full">
              خطتك الحالية
            </div>
          )}
          <div className="mb-6">
            <h2 className="text-2xl font-black text-white mb-1">مجاني</h2>
            <div className="flex items-end gap-1">
              <span className="text-4xl font-black text-white">$0</span>
              <span className="text-gray-400 mb-1">/شهريًا</span>
            </div>
            <p className="text-gray-400 text-sm mt-2">ابدأ رحلتك مجانًا</p>
          </div>

          <div className="space-y-3 mb-6">
            {FREE_FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                {f.included
                  ? <Check size={16} className="text-green-400 flex-shrink-0" />
                  : <X size={16} className="text-gray-600 flex-shrink-0" />
                }
                <span className={f.included ? 'text-gray-300 text-sm' : 'text-gray-600 text-sm'}>
                  {f.label}
                </span>
              </div>
            ))}
          </div>

          {currentPlan === 'free' && !trialDaysLeft && (
            <button
              onClick={() => trialMutation.mutate()}
              disabled={trialMutation.isPending}
              className="w-full py-3 rounded-xl border border-primary-500/50 text-primary-400 font-semibold hover:bg-primary-500/10 transition-all flex items-center justify-center gap-2"
            >
              {trialMutation.isPending ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Zap size={16} />
              )}
              جرّب البريميوم مجانًا 7 أيام
            </button>
          )}
        </motion.div>

        {/* Premium Plan */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className={`glass-card p-6 relative border-2 ${
            currentPlan === 'premium'
              ? 'border-green-500/50 bg-green-500/5'
              : 'border-primary-500/50 bg-primary-500/5'
          }`}
        >
          {/* Popular badge */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <div className="bg-gradient-to-r from-primary-500 to-purple-600 text-white text-xs px-4 py-1 rounded-full font-semibold flex items-center gap-1">
              <Star size={12} fill="white" /> الأكثر شيوعًا
            </div>
          </div>

          {currentPlan === 'premium' && (
            <div className="absolute top-4 left-4 bg-green-500/20 text-green-400 text-xs px-3 py-1 rounded-full">
              خطتك الحالية ✓
            </div>
          )}

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Crown size={20} className="text-purple-400" />
              <h2 className="text-2xl font-black text-white">بريميوم</h2>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-4xl font-black gradient-text">
                ${billingCycle === 'monthly' ? MONTHLY_PRICE : YEARLY_PRICE}
              </span>
              <span className="text-gray-400 mb-1">/شهريًا</span>
            </div>
            {billingCycle === 'yearly' && (
              <p className="text-green-400 text-xs mt-1">يُدفع سنويًا — وفّر {YEARLY_SAVE}%</p>
            )}
          </div>

          <div className="space-y-3 mb-6">
            {PREMIUM_FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <Check size={16} className={f.highlight ? 'text-primary-400 flex-shrink-0' : 'text-green-400 flex-shrink-0'} />
                <span className={`text-sm ${f.highlight ? 'text-white font-medium' : 'text-gray-300'}`}>
                  {f.label}
                </span>
              </div>
            ))}
          </div>

          {!isPremium ? (
            <button
              onClick={() => handleSubscribe('premium')}
              disabled={!!processingPlan}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-purple-600 text-white font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              {processingPlan === 'premium' ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <>
                  <Crown size={18} />
                  اشترك الآن — {billingCycle === 'monthly' ? 'شهري' : 'سنوي'}
                </>
              )}
            </button>
          ) : (
            !subscription?.cancel_at_period_end && (
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="w-full py-3 rounded-xl border border-red-500/30 text-red-400 font-semibold hover:bg-red-500/10 transition-all text-sm"
              >
                إلغاء الاشتراك
              </button>
            )
          )}
        </motion.div>
      </div>

      {/* Feature Highlights */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
      >
        {[
          { icon: <BarChart2 className="text-blue-400" size={24} />, title: 'تحليل الأداء', desc: 'تقارير ذكية يومية وأسبوعية' },
          { icon: <Brain className="text-purple-400" size={24} />, title: 'الذكاء الاصطناعي', desc: 'إرشاد شخصي وتحليل سلوكي' },
          { icon: <TrendingUp className="text-green-400" size={24} />, title: 'خريطة الطاقة', desc: 'اكتشف أوقات إنتاجيتك الذروة' },
          { icon: <Target className="text-orange-400" size={24} />, title: 'كشف المماطلة', desc: 'تنبيهات تلقائية وخطط بديلة' },
        ].map((item, i) => (
          <div key={i} className="glass-card p-4 text-center">
            <div className="flex justify-center mb-2">{item.icon}</div>
            <h3 className="text-white font-semibold text-sm">{item.title}</h3>
            <p className="text-gray-400 text-xs mt-1">{item.desc}</p>
          </div>
        ))}
      </motion.div>

      {/* FAQ / Trust */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.4 }}
        className="glass-card p-6"
      >
        <h3 className="text-white font-bold mb-4 text-center">الأسئلة الشائعة</h3>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { q: 'هل يمكنني الإلغاء في أي وقت؟', a: 'نعم، يمكنك إلغاء اشتراكك في أي وقت. سيستمر وصولك حتى نهاية الفترة المدفوعة.' },
            { q: 'هل بياناتي آمنة؟', a: 'نعم، نستخدم تشفير SSL وتخزين آمن لجميع بياناتك الشخصية.' },
            { q: 'كيف تعمل التجربة المجانية؟', a: '7 أيام كاملة بجميع مزايا البريميوم بدون بطاقة ائتمان.' },
            { q: 'هل يمكنني تغيير الخطة؟', a: 'يمكنك الترقية أو التخفيض في أي وقت ويُحتسب الفرق تلقائيًا.' },
          ].map((item, i) => (
            <div key={i} className="space-y-1">
              <p className="text-white font-medium text-sm">{item.q}</p>
              <p className="text-gray-400 text-xs leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Security badges */}
      <div className="flex items-center justify-center gap-6 text-xs text-gray-500">
        <div className="flex items-center gap-1"><Shield size={14} /> مدفوعات آمنة بـ Stripe</div>
        <div className="flex items-center gap-1"><CreditCard size={14} /> لا يلزم بطاقة للتجربة</div>
        <div className="flex items-center gap-1"><Calendar size={14} /> إلغاء بدون رسوم</div>
      </div>
    </div>
  );
}
