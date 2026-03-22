/**
 * Login / Register / Forgot Password Page
 * =========================================
 * - تسجيل بالبريد الإلكتروني أو رقم الهاتف
 * - نسيت كلمة المرور (OTP)
 * - تأكيد البريد الإلكتروني
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { authAPI } from '../utils/api';

// ── Modes ──────────────────────────────────────────────────────────────────────
// 'login' | 'register' | 'forgot' | 'reset' | 'verify'
const MODES = { LOGIN: 'login', REGISTER: 'register', FORGOT: 'forgot', RESET: 'reset', VERIFY: 'verify' };

export default function LoginPage() {
  const [mode, setMode] = useState(MODES.LOGIN);
  const [usePhone, setUsePhone] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Form fields
  const [form, setForm] = useState({
    name: '', email: '', phone: '', password: '',
    confirmPassword: '', otp: '', newPassword: '', confirmNewPassword: '',
  });
  const [errors, setErrors] = useState({});

  // For reset flow: remember email
  const [resetEmail, setResetEmail] = useState('');
  // Sandbox OTP hint
  const [sandboxOtp, setSandboxOtp] = useState('');

  const { login, register: registerUser, demoLogin } = useAuthStore();

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
  };

  // ── Validation ────────────────────────────────────────────────────────────────
  const validate = () => {
    const errs = {};
    if (mode === MODES.REGISTER) {
      if (!form.name.trim()) errs.name = 'الاسم مطلوب';
      if (!usePhone) {
        if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'بريد إلكتروني غير صحيح';
      } else {
        if (!form.phone.trim() || form.phone.length < 7) errs.phone = 'رقم هاتف غير صحيح';
      }
      if (!form.password || form.password.length < 6) errs.password = 'كلمة المرور 6 أحرف على الأقل';
      if (form.password !== form.confirmPassword) errs.confirmPassword = 'كلمتا المرور غير متطابقتين';
    } else if (mode === MODES.LOGIN) {
      if (!usePhone) {
        if (!form.email.trim()) errs.email = 'البريد الإلكتروني مطلوب';
      } else {
        if (!form.phone.trim()) errs.phone = 'رقم الهاتف مطلوب';
      }
      if (!form.password) errs.password = 'كلمة المرور مطلوبة';
    } else if (mode === MODES.FORGOT) {
      if (!form.email.trim()) errs.email = 'البريد الإلكتروني مطلوب';
    } else if (mode === MODES.RESET) {
      if (!form.otp.trim()) errs.otp = 'رمز التحقق مطلوب';
      if (!form.newPassword || form.newPassword.length < 6) errs.newPassword = 'كلمة المرور 6 أحرف على الأقل';
      if (form.newPassword !== form.confirmNewPassword) errs.confirmNewPassword = 'كلمتا المرور غير متطابقتين';
    } else if (mode === MODES.VERIFY) {
      if (!form.otp.trim() || form.otp.length !== 6) errs.otp = 'الرمز 6 أرقام';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // ── Submit handlers ────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);

    try {
      if (mode === MODES.LOGIN) {
        const payload = usePhone
          ? { phone: form.phone, password: form.password }
          : { email: form.email, password: form.password };
        const result = await login(payload.email, payload.password, payload.phone);
        if (result.success) {
          toast.success('أهلاً بك! 👋');
          setTimeout(() => { window.location.href = '/'; }, 500);
        } else {
          toast.error(result.message || 'بيانات الدخول غير صحيحة');
        }
      }

      else if (mode === MODES.REGISTER) {
        const payload = {
          name: form.name,
          password: form.password,
          ...(usePhone ? { phone: form.phone } : { email: form.email }),
        };
        const result = await registerUser(payload);
        if (result.success) {
          setSandboxOtp(result._sandbox_otp || '');
          if (!usePhone && result.verify_required) {
            setResetEmail(form.email);
            setMode(MODES.VERIFY);
            toast.success('تم إنشاء حسابك! أدخل رمز التحقق من بريدك 📧');
          } else {
            toast.success('مرحباً! تم إنشاء حسابك بنجاح 🎉');
            setTimeout(() => { window.location.href = '/'; }, 600);
          }
        } else {
          toast.error(result.message || 'فشل إنشاء الحساب');
        }
      }

      else if (mode === MODES.FORGOT) {
        const res = await authAPI.forgotPassword(form.email);
        const d = res?.data;
        setSandboxOtp(d?._sandbox_otp || '');
        setResetEmail(form.email);
        setMode(MODES.RESET);
        toast.success(d?.message || 'تم إرسال رمز إعادة التعيين 📧');
      }

      else if (mode === MODES.RESET) {
        const res = await authAPI.resetPassword(resetEmail, form.otp, form.newPassword);
        if (res?.data?.success) {
          toast.success('تم تعيين كلمة المرور الجديدة! 🔑');
          setMode(MODES.LOGIN);
          setForm((f) => ({ ...f, otp: '', newPassword: '', confirmNewPassword: '' }));
        } else {
          toast.error(res?.data?.message || 'فشل إعادة التعيين');
        }
      }

      else if (mode === MODES.VERIFY) {
        const res = await authAPI.verifyEmail(resetEmail, form.otp);
        if (res?.data?.success) {
          toast.success('تم تفعيل حسابك بنجاح! 🎉');
          setTimeout(() => { window.location.href = '/'; }, 600);
        } else {
          toast.error(res?.data?.message || 'الرمز غير صحيح');
        }
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    try {
      const result = await demoLogin();
      setIsLoading(false);
      if (result.success) {
        toast.success('أهلاً بك في الحساب التجريبي! 🎯');
        setTimeout(() => { window.location.href = '/'; }, 500);
      } else {
        toast.error(result.message || 'فشل الدخول التجريبي');
      }
    } catch (err) {
      setIsLoading(false);
      toast.error('فشل الدخول التجريبي');
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setErrors({});
    setSandboxOtp('');
    setForm({ name: '', email: '', phone: '', password: '', confirmPassword: '', otp: '', newPassword: '', confirmNewPassword: '' });
  };

  // ── Input helper ───────────────────────────────────────────────────────────────
  const Field = ({ label, field, type = 'text', placeholder, dir = 'ltr', autoComplete }) => (
    <div>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      <input
        value={form[field]}
        onChange={set(field)}
        type={type}
        placeholder={placeholder}
        dir={dir}
        autoComplete={autoComplete}
        className={`input-field ${errors[field] ? 'border-red-500/50 bg-red-500/5' : ''}`}
      />
      {errors[field] && <p className="text-red-400 text-xs mt-1">{errors[field]}</p>}
    </div>
  );

  // ── Render body by mode ────────────────────────────────────────────────────────
  const renderBody = () => {
    if (mode === MODES.FORGOT) {
      return (
        <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🔑</div>
            <h2 className="text-xl font-bold text-white">نسيت كلمة المرور؟</h2>
            <p className="text-gray-400 text-sm mt-1">أدخل بريدك وسنرسل لك رمز التحقق</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="البريد الإلكتروني" field="email" type="email" placeholder="example@email.com" autoComplete="email" />
            <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
              {isLoading ? <Spinner /> : '📧 إرسال رمز التحقق'}
            </button>
          </form>
          <button onClick={() => switchMode(MODES.LOGIN)} className="mt-4 text-sm text-gray-400 hover:text-white w-full text-center transition-colors">
            ← العودة لتسجيل الدخول
          </button>
        </motion.div>
      );
    }

    if (mode === MODES.RESET) {
      return (
        <motion.div key="reset" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🔐</div>
            <h2 className="text-xl font-bold text-white">تعيين كلمة مرور جديدة</h2>
            <p className="text-gray-400 text-sm mt-1">تم الإرسال إلى <span className="text-primary-400">{resetEmail}</span></p>
          </div>
          {sandboxOtp && (
            <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
              <p className="text-yellow-400 text-xs mb-1">🧪 Sandbox Mode — رمز OTP:</p>
              <p className="text-yellow-300 font-mono font-bold text-lg tracking-widest">{sandboxOtp}</p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">رمز التحقق (6 أرقام)</label>
              <input
                value={form.otp}
                onChange={set('otp')}
                placeholder="123456"
                maxLength={6}
                dir="ltr"
                className={`input-field text-center tracking-widest text-lg font-mono ${errors.otp ? 'border-red-500/50' : ''}`}
              />
              {errors.otp && <p className="text-red-400 text-xs mt-1">{errors.otp}</p>}
            </div>
            <Field label="كلمة المرور الجديدة" field="newPassword" type="password" placeholder="••••••••" autoComplete="new-password" />
            <Field label="تأكيد كلمة المرور" field="confirmNewPassword" type="password" placeholder="••••••••" autoComplete="new-password" />
            <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
              {isLoading ? <Spinner /> : '🔑 تعيين كلمة المرور'}
            </button>
          </form>
          <button onClick={() => { switchMode(MODES.FORGOT); }} className="mt-4 text-sm text-gray-400 hover:text-white w-full text-center transition-colors">
            ← لم يصلك الرمز؟ أعد الإرسال
          </button>
        </motion.div>
      );
    }

    if (mode === MODES.VERIFY) {
      return (
        <motion.div key="verify" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">📧</div>
            <h2 className="text-xl font-bold text-white">تأكيد البريد الإلكتروني</h2>
            <p className="text-gray-400 text-sm mt-1">أرسلنا رمزاً إلى <span className="text-primary-400">{resetEmail}</span></p>
          </div>
          {sandboxOtp && (
            <div className="mb-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-center">
              <p className="text-yellow-400 text-xs mb-1">🧪 Sandbox Mode — رمز OTP:</p>
              <p className="text-yellow-300 font-mono font-bold text-lg tracking-widest">{sandboxOtp}</p>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">رمز التحقق (6 أرقام)</label>
              <input
                value={form.otp}
                onChange={set('otp')}
                placeholder="123456"
                maxLength={6}
                dir="ltr"
                className={`input-field text-center tracking-widest text-lg font-mono ${errors.otp ? 'border-red-500/50' : ''}`}
              />
              {errors.otp && <p className="text-red-400 text-xs mt-1">{errors.otp}</p>}
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
              {isLoading ? <Spinner /> : '✅ تفعيل الحساب'}
            </button>
          </form>
          <button onClick={() => switchMode(MODES.LOGIN)} className="mt-4 text-sm text-gray-400 hover:text-white w-full text-center transition-colors">
            ← العودة لتسجيل الدخول
          </button>
        </motion.div>
      );
    }

    // ── LOGIN / REGISTER ────────────────────────────────────────────────────────
    return (
      <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
        {/* Tab switcher */}
        <div className="flex rounded-xl bg-white/5 p-1 mb-6">
          <button
            onClick={() => switchMode(MODES.LOGIN)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${mode === MODES.LOGIN ? 'bg-primary-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
          >
            تسجيل الدخول
          </button>
          <button
            onClick={() => switchMode(MODES.REGISTER)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${mode === MODES.REGISTER ? 'bg-primary-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
          >
            حساب جديد
          </button>
        </div>

        {/* Phone / Email toggle */}
        <div className="flex rounded-lg bg-white/5 p-1 mb-4 text-xs">
          <button
            onClick={() => setUsePhone(false)}
            className={`flex-1 py-2 rounded-md font-medium transition-colors ${!usePhone ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            📧 بريد إلكتروني
          </button>
          <button
            onClick={() => setUsePhone(true)}
            className={`flex-1 py-2 rounded-md font-medium transition-colors ${usePhone ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'}`}
          >
            📱 رقم الهاتف
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Name — register only */}
          <AnimatePresence>
            {mode === MODES.REGISTER && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <Field label="الاسم الكامل" field="name" type="text" placeholder="أدخل اسمك" dir="rtl" autoComplete="name" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Email or Phone */}
          <AnimatePresence mode="wait">
            {!usePhone ? (
              <motion.div key="email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Field label="البريد الإلكتروني" field="email" type="email" placeholder="example@email.com" autoComplete="email" />
              </motion.div>
            ) : (
              <motion.div key="phone" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <label className="block text-sm text-gray-400 mb-1">رقم الهاتف</label>
                <div className="flex gap-2">
                  <span className="input-field w-16 flex items-center justify-center text-gray-400 text-sm flex-shrink-0">+20</span>
                  <input
                    value={form.phone}
                    onChange={set('phone')}
                    placeholder="01XXXXXXXXX"
                    dir="ltr"
                    type="tel"
                    autoComplete="tel"
                    className={`input-field flex-1 ${errors.phone ? 'border-red-500/50' : ''}`}
                  />
                </div>
                {errors.phone && <p className="text-red-400 text-xs mt-1">{errors.phone}</p>}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Password */}
          <Field label="كلمة المرور" field="password" type="password" placeholder="••••••••" autoComplete={mode === MODES.REGISTER ? 'new-password' : 'current-password'} />

          {/* Confirm Password — register only */}
          <AnimatePresence>
            {mode === MODES.REGISTER && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <Field label="تأكيد كلمة المرور" field="confirmPassword" type="password" placeholder="••••••••" autoComplete="new-password" />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Forgot password link */}
          {mode === MODES.LOGIN && !usePhone && (
            <div className="text-left">
              <button type="button" onClick={() => switchMode(MODES.FORGOT)} className="text-xs text-primary-400 hover:text-primary-300 transition-colors">
                نسيت كلمة المرور؟
              </button>
            </div>
          )}

          <button type="submit" disabled={isLoading} className="btn-primary w-full mt-2 flex items-center justify-center gap-2">
            {isLoading ? <Spinner /> : mode === MODES.REGISTER ? '✨ إنشاء الحساب' : '🚀 تسجيل الدخول'}
          </button>
        </form>

        {/* Demo login */}
        <div className="mt-6 pt-6 border-t border-white/10 text-center">
          <p className="text-xs text-gray-500 mb-3">أو جرّب التطبيق مباشرة</p>
          <button onClick={handleDemoLogin} disabled={isLoading} className="btn-ghost text-sm w-full">
            🎯 دخول كمستخدم تجريبي
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="min-h-screen animated-bg flex items-center justify-center p-4" dir="rtl">
      {/* Background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-72 h-72 bg-primary-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-20 left-20 w-56 h-56 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-secondary-500/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 200, delay: 0.1 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 mb-4 shadow-glow"
          >
            <span className="text-4xl">✨</span>
          </motion.div>
          <h1 className="text-4xl font-black gradient-text">LifeFlow</h1>
          <p className="text-gray-400 mt-2 text-sm">مساعدك الشخصي والمهني الذكي</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8 shadow-2xl">
          <AnimatePresence mode="wait">
            {renderBody()}
          </AnimatePresence>
        </div>

        {/* Features */}
        {(mode === MODES.LOGIN || mode === MODES.REGISTER) && (
          <div className="mt-6 grid grid-cols-3 gap-3 text-center">
            {[
              { icon: '📋', label: 'إدارة المهام' },
              { icon: '🧠', label: 'مساعد ذكي' },
              { icon: '🏃', label: 'تتبع العادات' },
            ].map((f) => (
              <motion.div key={f.label} whileHover={{ scale: 1.05 }} className="glass-card p-3">
                <div className="text-2xl mb-1">{f.icon}</div>
                <div className="text-xs text-gray-400">{f.label}</div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Tiny spinner ───────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <>
      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      جارٍ التحميل...
    </>
  );
}
