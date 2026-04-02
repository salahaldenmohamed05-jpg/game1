/**
 * Subscription View - Plans & Billing (Paymob + Stripe)
 * ========================================================
 * Full subscription management with Egyptian payment support:
 *   - Card payments (Visa/Mastercard) via Paymob
 *   - Fawry cash payments
 *   - Electronic wallets (Vodafone Cash, Orange, etc.)
 *   - Stripe (international)
 *   - Free trial
 */

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Crown, Check, X, Zap, Star, Shield, ArrowRight,
  CreditCard, Calendar, AlertCircle, Loader2, Sparkles,
  Brain, TrendingUp, Target, Clock, BarChart2,
  Smartphone, Store, Wallet, ChevronDown, ChevronUp,
  ExternalLink, Copy, Phone, CheckCircle2
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

// Payment method icons
const PAYMENT_ICONS = {
  card: <CreditCard size={20} className="text-blue-400" />,
  fawry: <Store size={20} className="text-orange-400" />,
  wallet: <Smartphone size={20} className="text-green-400" />,
  demo: <Zap size={20} className="text-yellow-400" />,
};

// ─── Payment Method Selector ────────────────────────────────────────────────

function PaymentMethodSelector({ methods, selected, onSelect }) {
  if (!methods || methods.length === 0) return null;

  return (
    <div className="space-y-2" dir="rtl">
      <h4 className="text-sm font-bold text-white mb-3">اختر طريقة الدفع</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {methods.map((method) => (
          <motion.button
            key={method.id}
            onClick={() => onSelect(method.id)}
            whileTap={{ scale: 0.98 }}
            className={`p-3 rounded-xl border transition-all text-right flex items-center gap-3 ${
              selected === method.id
                ? 'border-primary-500 bg-primary-500/10 ring-1 ring-primary-500/30'
                : 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/8'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              selected === method.id ? 'bg-primary-500/20' : 'bg-white/10'
            }`}>
              {PAYMENT_ICONS[method.id] || <Wallet size={20} className="text-gray-400" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${selected === method.id ? 'text-primary-400' : 'text-white'}`}>
                {method.name_ar}
              </p>
              <p className="text-[10px] text-gray-500 truncate">
                {method.description_ar}
              </p>
            </div>
            {selected === method.id && (
              <CheckCircle2 size={16} className="text-primary-400 flex-shrink-0" />
            )}
          </motion.button>
        ))}
      </div>
    </div>
  );
}

// ─── Fawry Payment Result ───────────────────────────────────────────────────

function FawryPaymentResult({ data, onClose }) {
  const copyRef = () => {
    navigator.clipboard?.writeText(data.fawry_ref || data.order_id);
    toast.success('تم نسخ رقم المرجع!');
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card p-6 border border-orange-500/30 bg-orange-500/5 text-center space-y-4"
      dir="rtl"
    >
      <Store size={48} className="text-orange-400 mx-auto" />
      <h3 className="text-lg font-bold text-white">ادفع عبر فوري</h3>
      <p className="text-gray-400 text-sm">اذهب لأقرب فرع فوري واستخدم رقم المرجع التالي:</p>
      
      <div className="bg-white/10 rounded-xl p-4 flex items-center justify-center gap-3">
        <span className="text-2xl font-mono font-bold text-orange-300 tracking-wider">
          {data.fawry_ref || data.order_id}
        </span>
        <button onClick={copyRef} className="p-2 bg-white/10 rounded-lg hover:bg-white/20 transition-all">
          <Copy size={16} className="text-gray-400" />
        </button>
      </div>

      <div className="space-y-1.5 text-sm text-gray-400">
        <p>💰 المبلغ: <span className="text-white font-bold">{data.amount} جنيه</span></p>
        <p>⏰ صالح لمدة: <span className="text-orange-300">{data.expiry || '48 ساعة'}</span></p>
      </div>

      <p className="text-[11px] text-gray-500">
        سيتم تفعيل اشتراكك تلقائيًا بعد الدفع
      </p>
      
      <button onClick={onClose}
        className="w-full py-2.5 bg-white/5 text-gray-400 rounded-xl hover:bg-white/10 transition-all text-sm">
        حسنًا، فهمت
      </button>
    </motion.div>
  );
}

// ─── Wallet Phone Input ─────────────────────────────────────────────────────

function WalletPhoneInput({ onSubmit, loading }) {
  const [phone, setPhone] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
      dir="rtl"
    >
      <p className="text-sm text-gray-400">أدخل رقم هاتف المحفظة الإلكترونية:</p>
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Phone size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            placeholder="01XXXXXXXXX"
            maxLength={11}
            className="w-full pr-9 pl-3 py-3 bg-white/5 border border-white/10 rounded-xl text-white
              placeholder:text-gray-600 focus:border-primary-500 focus:ring-1 focus:ring-primary-500/30
              transition-all outline-none text-left direction-ltr"
            dir="ltr"
          />
        </div>
        <button
          onClick={() => {
            if (phone.length < 11) {
              toast.error('أدخل رقم هاتف صحيح (11 رقم)');
              return;
            }
            onSubmit(phone);
          }}
          disabled={loading || phone.length < 11}
          className="px-5 py-3 bg-gradient-to-l from-green-500 to-emerald-600 text-white font-bold rounded-xl
            hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : <Wallet size={16} />}
          ادفع
        </button>
      </div>
      <p className="text-[10px] text-gray-600">
        فودافون كاش · أورنج · اتصالات · WE Pay · CIB
      </p>
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SubscriptionView() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showPaymentMethods, setShowPaymentMethods] = useState(false);
  const [paymentResult, setPaymentResult] = useState(null);
  const [walletStep, setWalletStep] = useState(false);

  // Fetch subscription status
  const { data: subData, refetch: refetchSub } = useQuery({
    queryKey: ['subscription-full'],
    queryFn: () => api.get('/subscription/status'),
    retry: 1,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch plans (includes Paymob methods)
  const { data: plansData } = useQuery({
    queryKey: ['plans'],
    queryFn: () => api.get('/subscription/plans'),
    retry: 1,
    staleTime: 60 * 60 * 1000,
  });

  // Fetch Paymob payment methods
  const { data: paymobData } = useQuery({
    queryKey: ['paymob-methods'],
    queryFn: () => api.get('/subscription/paymob/methods').catch(() => ({ data: { data: { methods: [] } } })),
    retry: 1,
    staleTime: 60 * 60 * 1000,
  });

  const subscription = subData?.data?.data || subData?.data;
  const plans = plansData?.data?.data || plansData?.data || {};
  const paymobMethods = paymobData?.data?.data?.methods || plans?.payment_gateways?.paymob?.methods || [];
  const currentPlan = subscription?.plan || 'free';
  const isPremium = subscription?.is_premium;
  const trialDaysLeft = subscription?.trial_days_remaining;

  // Pricing
  const pricing = plans?.premium?.pricing || {};
  const MONTHLY_PRICE_EGP = pricing.monthly_price_egp || 149.99;
  const YEARLY_PRICE_EGP = pricing.yearly_price_egp || 1199.99;
  const YEARLY_SAVE = pricing.yearly_save_percent || 33;

  // All payment methods
  const allPaymentMethods = useMemo(() => {
    const methods = [];
    // Paymob methods
    if (paymobMethods.length > 0) {
      methods.push(...paymobMethods);
    } else {
      // Default methods when API is loading
      methods.push(
        { id: 'card', name_ar: 'بطاقة ائتمان / خصم', description_ar: 'ادفع بفيزا أو ماستركارد', icon: '💳' },
        { id: 'fawry', name_ar: 'فوري', description_ar: 'ادفع كاش من أي فرع فوري', icon: '🏪' },
        { id: 'wallet', name_ar: 'محفظة إلكترونية', description_ar: 'فودافون كاش، أورنج، اتصالات', icon: '📱' },
        { id: 'demo', name_ar: 'تجربة مجانية', description_ar: 'جرّب البريميوم مجانًا لمدة 7 أيام', icon: '🎁' },
      );
    }
    return methods;
  }, [paymobMethods]);

  // Paymob payment mutation
  const paymobMutation = useMutation({
    mutationFn: async (data) => {
      const response = await api.post('/subscription/paymob/initiate', data);
      return response.data;
    },
    onSuccess: (data) => {
      const result = data.data || data;
      
      if (result.method === 'demo') {
        refetchSub();
        queryClient.invalidateQueries({ queryKey: ['subscription-full'] });
        toast.success(data.message || 'تم تفعيل التجربة المجانية! 🎉');
        setShowPaymentMethods(false);
        return;
      }

      if (result.type === 'redirect' && result.payment_url) {
        // Card: redirect to Paymob iframe
        window.open(result.payment_url, '_blank');
        toast.success('تم فتح صفحة الدفع الآمنة');
      } else if (result.type === 'reference') {
        // Fawry: show reference number
        setPaymentResult(result);
      } else if (result.type === 'wallet_redirect') {
        // Wallet: redirect
        toast.success(result.message_ar || 'جاري التحويل للمحفظة...');
      }
      
      setShowPaymentMethods(false);
    },
    onError: (err) => {
      const msg = err.response?.data?.message || 'فشل في بدء الدفع';
      toast.error(msg);
      if (err.response?.data?.setup_required) {
        toast('⚙️ بوابة الدفع تحتاج تهيئة — تواصل مع الدعم', { duration: 5000 });
      }
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

  const handleSubscribe = () => {
    setShowPaymentMethods(true);
    setSelectedPayment(null);
    setPaymentResult(null);
    setWalletStep(false);
  };

  const handlePaymentConfirm = (phone = null) => {
    const paymentData = {
      plan: 'premium',
      billing_cycle: billingCycle,
      payment_method: selectedPayment,
    };
    if (phone) paymentData.phone = phone;
    paymobMutation.mutate(paymentData);
  };

  // If we got a Fawry result, show it
  if (paymentResult?.type === 'reference') {
    return (
      <div className="p-6 max-w-lg mx-auto">
        <FawryPaymentResult data={paymentResult} onClose={() => setPaymentResult(null)} />
      </div>
    );
  }

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
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="glass-card p-4 border border-yellow-500/30 bg-yellow-500/5"
        >
          <div className="flex items-center gap-3">
            <Zap className="text-yellow-400" size={20} />
            <div>
              <p className="text-yellow-300 font-semibold">أنت في فترة التجربة المجانية</p>
              <p className="text-gray-400 text-sm">تبقى {trialDaysLeft} يوم — استمتع بجميع مزايا البريميوم</p>
            </div>
            <button onClick={handleSubscribe} className="mr-auto btn-primary text-sm whitespace-nowrap">
              اشترك الآن
            </button>
          </div>
        </motion.div>
      )}

      {isPremium && currentPlan === 'premium' && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
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
          </div>
        </motion.div>
      )}

      {/* Billing Toggle */}
      {!isPremium && (
        <div className="flex items-center justify-center gap-4">
          <button
            onClick={() => setBillingCycle('monthly')}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
              billingCycle === 'monthly' ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
            }`}
          >
            شهري
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className={`px-5 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
              billingCycle === 'yearly' ? 'bg-primary-500 text-white' : 'text-gray-400 hover:text-white'
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
          initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 }}
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
              <span className="text-4xl font-black text-white">0</span>
              <span className="text-gray-400 mb-1">جنيه/شهريًا</span>
            </div>
            <p className="text-gray-400 text-sm mt-2">ابدأ رحلتك مجانًا</p>
          </div>

          <div className="space-y-3 mb-6">
            {FREE_FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                {f.included
                  ? <Check size={16} className="text-green-400 flex-shrink-0" />
                  : <X size={16} className="text-gray-600 flex-shrink-0" />}
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
              className="w-full py-3 rounded-xl border border-primary-500/50 text-primary-400 font-semibold
                hover:bg-primary-500/10 transition-all flex items-center justify-center gap-2"
            >
              {trialMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
              جرّب البريميوم مجانًا 7 أيام
            </button>
          )}
        </motion.div>

        {/* Premium Plan */}
        <motion.div
          initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.2 }}
          className={`glass-card p-6 relative border-2 ${
            currentPlan === 'premium' ? 'border-green-500/50 bg-green-500/5' : 'border-primary-500/50 bg-primary-500/5'
          }`}
        >
          {/* Popular badge */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <div className="bg-gradient-to-r from-primary-500 to-purple-600 text-white text-xs px-4 py-1 rounded-full font-semibold flex items-center gap-1">
              <Star size={12} fill="white" /> الأكثر شيوعًا
            </div>
          </div>

          <div className="mb-6">
            <div className="flex items-center gap-2 mb-1">
              <Crown size={20} className="text-purple-400" />
              <h2 className="text-2xl font-black text-white">بريميوم</h2>
            </div>
            <div className="flex items-end gap-1">
              <span className="text-4xl font-black gradient-text">
                {billingCycle === 'monthly'
                  ? MONTHLY_PRICE_EGP.toFixed(0)
                  : (YEARLY_PRICE_EGP / 12).toFixed(0)}
              </span>
              <span className="text-gray-400 mb-1">جنيه/شهريًا</span>
            </div>
            {billingCycle === 'yearly' && (
              <p className="text-green-400 text-xs mt-1">
                يُدفع {YEARLY_PRICE_EGP.toFixed(0)} جنيه سنويًا — وفّر {YEARLY_SAVE}%
              </p>
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
              onClick={handleSubscribe}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-primary-500 to-purple-600 text-white font-bold
                hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <Crown size={18} />
              اشترك الآن — {billingCycle === 'monthly' ? 'شهري' : 'سنوي'}
            </button>
          ) : (
            !subscription?.cancel_at_period_end && (
              <button
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
                className="w-full py-3 rounded-xl border border-red-500/30 text-red-400 font-semibold
                  hover:bg-red-500/10 transition-all text-sm"
              >
                إلغاء الاشتراك
              </button>
            )
          )}
        </motion.div>
      </div>

      {/* ═══ Payment Methods Modal ═══ */}
      <AnimatePresence>
        {showPaymentMethods && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) setShowPaymentMethods(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="glass-card p-6 w-full max-w-md max-h-[85vh] overflow-y-auto space-y-5"
              dir="rtl"
            >
              {/* Header */}
              <div className="text-center">
                <Crown size={32} className="text-purple-400 mx-auto mb-2" />
                <h3 className="text-xl font-bold text-white">اشترك في بريميوم</h3>
                <p className="text-sm text-gray-400 mt-1">
                  {billingCycle === 'monthly'
                    ? `${MONTHLY_PRICE_EGP.toFixed(0)} جنيه/شهريًا`
                    : `${YEARLY_PRICE_EGP.toFixed(0)} جنيه/سنويًا (${(YEARLY_PRICE_EGP / 12).toFixed(0)} جنيه/شهر)`}
                </p>
              </div>

              {/* Payment Methods */}
              <PaymentMethodSelector
                methods={allPaymentMethods}
                selected={selectedPayment}
                onSelect={(id) => {
                  setSelectedPayment(id);
                  setWalletStep(id === 'wallet');
                }}
              />

              {/* Wallet phone step */}
              <AnimatePresence>
                {walletStep && selectedPayment === 'wallet' && (
                  <WalletPhoneInput
                    onSubmit={(phone) => handlePaymentConfirm(phone)}
                    loading={paymobMutation.isPending}
                  />
                )}
              </AnimatePresence>

              {/* Confirm Button (non-wallet) */}
              {selectedPayment && selectedPayment !== 'wallet' && (
                <motion.button
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  onClick={() => handlePaymentConfirm()}
                  disabled={paymobMutation.isPending}
                  className="w-full py-3.5 bg-gradient-to-l from-primary-500 to-purple-600 text-white font-bold rounded-xl
                    hover:opacity-90 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {paymobMutation.isPending ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      <Shield size={16} />
                      {selectedPayment === 'demo' ? 'تفعيل التجربة المجانية' :
                       selectedPayment === 'card' ? 'ادفع بالبطاقة' :
                       selectedPayment === 'fawry' ? 'احصل على رقم فوري' : 'تأكيد الدفع'}
                    </>
                  )}
                </motion.button>
              )}

              {/* Close */}
              <button
                onClick={() => setShowPaymentMethods(false)}
                className="w-full py-2 text-gray-500 text-sm hover:text-gray-300 transition-all"
              >
                إلغاء
              </button>

              {/* Security note */}
              <div className="flex items-center justify-center gap-2 text-[10px] text-gray-600">
                <Shield size={10} />
                <span>جميع المدفوعات مؤمنة بتشفير SSL عبر Paymob</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Feature Highlights */}
      <motion.div
        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
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

      {/* Accepted Payment Methods Banner */}
      <div className="glass-card p-4">
        <h4 className="text-sm font-bold text-white text-center mb-3">طرق الدفع المدعومة</h4>
        <div className="flex items-center justify-center gap-6 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <CreditCard size={18} className="text-blue-400" />
            <span>فيزا / ماستركارد</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Store size={18} className="text-orange-400" />
            <span>فوري</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Smartphone size={18} className="text-green-400" />
            <span>محافظ إلكترونية</span>
          </div>
        </div>
      </div>

      {/* FAQ */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="glass-card p-6">
        <h3 className="text-white font-bold mb-4 text-center">الأسئلة الشائعة</h3>
        <div className="grid md:grid-cols-2 gap-4">
          {[
            { q: 'هل يمكنني الدفع بفوري؟', a: 'نعم! ستحصل على رقم مرجع تدفع به في أي فرع فوري خلال 48 ساعة.' },
            { q: 'ما المحافظ الإلكترونية المدعومة؟', a: 'فودافون كاش، أورنج، اتصالات كاش، WE Pay، و CIB Smart Wallet.' },
            { q: 'هل يمكنني الإلغاء في أي وقت؟', a: 'نعم، يمكنك إلغاء اشتراكك في أي وقت. سيستمر الوصول حتى نهاية الفترة.' },
            { q: 'كيف تعمل التجربة المجانية؟', a: '7 أيام كاملة بجميع مزايا البريميوم بدون أي دفع مسبق.' },
          ].map((item, i) => (
            <div key={i} className="space-y-1">
              <p className="text-white font-medium text-sm">{item.q}</p>
              <p className="text-gray-400 text-xs leading-relaxed">{item.a}</p>
            </div>
          ))}
        </div>
      </motion.div>

      {/* Security badges */}
      <div className="flex items-center justify-center gap-6 text-xs text-gray-500 flex-wrap">
        <div className="flex items-center gap-1"><Shield size={14} /> مدفوعات آمنة بـ Paymob</div>
        <div className="flex items-center gap-1"><CreditCard size={14} /> لا يلزم بطاقة للتجربة</div>
        <div className="flex items-center gap-1"><Calendar size={14} /> إلغاء بدون رسوم</div>
      </div>
    </div>
  );
}
