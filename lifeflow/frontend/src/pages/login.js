/**
 * Login / Register / Forgot Password Page — Phase 13.2
 * Fixes: demo as primary CTA, semantic HTML, tab clarity,
 *        contrast, forgot-password visibility, value prop,
 *        removed feature icons noise.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';
import { authAPI } from '../utils/api';

const MODES = { LOGIN: 'login', REGISTER: 'register', FORGOT: 'forgot', RESET: 'reset', VERIFY: 'verify' };

export default function LoginPage() {
  const [mode, setMode] = useState(MODES.LOGIN);
  const [isLoading, setIsLoading] = useState(false);

  const [form, setForm] = useState({
    name: '', email: '', password: '',
    confirmPassword: '', otp: '', newPassword: '', confirmNewPassword: '',
  });
  const [errors, setErrors] = useState({});
  const [resetEmail, setResetEmail] = useState('');
  const [sandboxOtp, setSandboxOtp] = useState('');

  const { login, register: registerUser, demoLogin } = useAuthStore();

  const set = (field) => (e) => {
    setForm((f) => ({ ...f, [field]: e.target.value }));
    setErrors((er) => ({ ...er, [field]: undefined }));
  };

  const validate = () => {
    const errs = {};
    if (mode === MODES.REGISTER) {
      if (!form.name.trim()) errs.name = 'الاسم مطلوب';
      if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'بريد إلكتروني غير صحيح';
      if (!form.password || form.password.length < 6) errs.password = 'كلمة المرور 6 أحرف على الأقل';
      if (form.password !== form.confirmPassword) errs.confirmPassword = 'كلمتا المرور غير متطابقتين';
    } else if (mode === MODES.LOGIN) {
      if (!form.email.trim()) errs.email = 'البريد الإلكتروني مطلوب';
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    setIsLoading(true);
    try {
      if (mode === MODES.LOGIN) {
        const result = await login(form.email, form.password);
        if (result.success) {
          toast.success('أهلاً بك! 👋');
          setTimeout(() => { window.location.href = '/'; }, 500);
        } else {
          toast.error(result.message || 'بيانات الدخول غير صحيحة');
        }
      } else if (mode === MODES.REGISTER) {
        const payload = { name: form.name, email: form.email, password: form.password };
        const result = await registerUser(payload);
        if (result.success) {
          setSandboxOtp(result._sandbox_otp || '');
          setResetEmail(form.email);
          setMode(MODES.VERIFY);
          toast.success('تم إنشاء حسابك! أدخل رمز التحقق من بريدك 📧');
        } else {
          toast.error(result.message || 'فشل إنشاء الحساب');
        }
      } else if (mode === MODES.FORGOT) {
        const res = await authAPI.forgotPassword(form.email);
        const d = res?.data;
        setSandboxOtp(d?._sandbox_otp || '');
        setResetEmail(form.email);
        setMode(MODES.RESET);
        toast.success(d?.message || 'تم إرسال رمز إعادة التعيين 📧');
      } else if (mode === MODES.RESET) {
        const res = await authAPI.resetPassword(resetEmail, form.otp, form.newPassword);
        if (res?.data?.success) {
          toast.success('تم تعيين كلمة المرور الجديدة! 🔑');
          setMode(MODES.LOGIN);
          setForm((f) => ({ ...f, otp: '', newPassword: '', confirmNewPassword: '' }));
        } else {
          toast.error(res?.data?.message || 'فشل إعادة التعيين');
        }
      } else if (mode === MODES.VERIFY) {
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

  // FIX #3: demo is now the primary action
  const handleDemoLogin = async () => {
    setIsLoading(true);
    try {
      const result = await demoLogin();
      if (result.success) {
        toast.success('أهلاً بك في الحساب التجريبي! 🎯');
        setTimeout(() => { window.location.href = '/'; }, 500);
      } else {
        toast.error(result.message || 'فشل الدخول التجريبي');
      }
    } catch (err) {
      toast.error('فشل الدخول التجريبي');
    } finally {
      setIsLoading(false);
    }
  };

  const switchMode = (m) => {
    setMode(m);
    setErrors({});
    setSandboxOtp('');
    setForm({ name: '', email: '', password: '', confirmPassword: '', otp: '', newPassword: '', confirmNewPassword: '' });
  };

  // FIX #1: Field now has htmlFor/id linkage, required, proper types passed through
  const Field = ({ label, field, type = 'text', placeholder, dir = 'ltr', autoComplete, required = false, inputMode }) => (
    <div>
      <label htmlFor={`field-${field}`} className="block text-sm font-medium text-gray-300 mb-1.5">
        {label}
      </label>
      <input
        id={`field-${field}`}
        name={field}
        value={form[field]}
        onChange={set(field)}
        type={type}
        placeholder={placeholder}
        dir={dir}
        autoComplete={autoComplete}
        required={required}
        inputMode={inputMode}
        className={`input-field placeholder-gray-500 ${errors[field] ? 'border-red-500/50 bg-red-500/5' : ''}`}
      />
      {errors[field] && <p className="text-red-400 text-xs mt-1">{errors[field]}</p>}
    </div>
  );

  const renderBody = () => {
    if (mode === MODES.FORGOT) {
      return (
        <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
          <div className="text-center mb-6">
            <div className="text-4xl mb-2">🔑</div>
            <h2 className="text-xl font-bold text-white">نسيت كلمة المرور؟</h2>
            <p className="text-gray-400 text-sm mt-1">أدخل بريدك وسنرسل لك رمز التحقق</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* FIX #1: type=email, autoComplete, inputMode, required */}
            <Field label="البريد الإلكتروني" field="email" type="email" placeholder="example@email.com" autoComplete="email" inputMode="email" required />
            <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
              {isLoading ? <Spinner /> : '📧 إرسال رمز التحقق'}
            </button>
          </form>
          <button onClick={() => switchMode(MODES.LOGIN)} className="mt-4 text-sm text-gray-300 hover:text-white w-full text-center transition-colors hover:underline">
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
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="field-otp" className="block text-sm font-medium text-gray-300 mb-1.5">رمز التحقق (6 أرقام)</label>
              <input
                id="field-otp"
                name="otp"
                value={form.otp}
                onChange={set('otp')}
                type="text"
                placeholder="123456"
                maxLength={6}
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className={`input-field text-center tracking-widest text-lg font-mono placeholder-gray-500 ${errors.otp ? 'border-red-500/50' : ''}`}
              />
              {errors.otp && <p className="text-red-400 text-xs mt-1">{errors.otp}</p>}
            </div>
            <Field label="كلمة المرور الجديدة" field="newPassword" type="password" placeholder="••••••••" autoComplete="new-password" required />
            <Field label="تأكيد كلمة المرور" field="confirmNewPassword" type="password" placeholder="••••••••" autoComplete="new-password" required />
            <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
              {isLoading ? <Spinner /> : '🔑 تعيين كلمة المرور'}
            </button>
          </form>
          <button onClick={() => switchMode(MODES.FORGOT)} className="mt-4 text-sm text-gray-300 hover:text-white w-full text-center transition-colors hover:underline">
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
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <label htmlFor="field-otp-verify" className="block text-sm font-medium text-gray-300 mb-1.5">رمز التحقق (6 أرقام)</label>
              <input
                id="field-otp-verify"
                name="otp"
                value={form.otp}
                onChange={set('otp')}
                type="text"
                placeholder="123456"
                maxLength={6}
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className={`input-field text-center tracking-widest text-lg font-mono placeholder-gray-500 ${errors.otp ? 'border-red-500/50' : ''}`}
              />
              {errors.otp && <p className="text-red-400 text-xs mt-1">{errors.otp}</p>}
            </div>
            <button type="submit" disabled={isLoading} className="btn-primary w-full flex items-center justify-center gap-2">
              {isLoading ? <Spinner /> : '✅ تفعيل الحساب'}
            </button>
          </form>
          <button onClick={() => switchMode(MODES.LOGIN)} className="mt-4 text-sm text-gray-300 hover:text-white w-full text-center transition-colors hover:underline">
            ← العودة لتسجيل الدخول
          </button>
        </motion.div>
      );
    }

    // ── LOGIN / REGISTER ─────────────────────────────────────────────────────────
    return (
      <motion.div key="auth" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

        {/* FIX #3: Demo is PRIMARY CTA — top of form, full styled button */}
        <button
          onClick={handleDemoLogin}
          disabled={isLoading}
          className="btn-primary w-full flex items-center justify-center gap-2 mb-5 text-base font-bold py-3"
        >
          {isLoading ? <Spinner /> : '🚀 جرب التطبيق الآن'}
        </button>

        {/* Divider */}
        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-xs text-gray-500">أو سجّل دخولك</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        {/* FIX #4: Tab switcher — clear active state */}
        <div className="flex rounded-xl bg-white/5 p-1 mb-5">
          <button
            type="button"
            onClick={() => switchMode(MODES.LOGIN)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              mode === MODES.LOGIN
                ? 'bg-primary-500 text-white shadow-lg underline-offset-2'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            تسجيل الدخول
          </button>
          <button
            type="button"
            onClick={() => switchMode(MODES.REGISTER)}
            className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
              mode === MODES.REGISTER
                ? 'bg-primary-500 text-white shadow-lg'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            حساب جديد
          </button>
        </div>

        {/* FIX #8: Value prop — minimal, above form */}
        <p className="text-center text-gray-400 text-xs mb-4 leading-relaxed">
          نظم يومك، ركز على الأهم، واتخذ قرارات أفضل بمساعدة الذكاء الاصطناعي
        </p>

        {/* FIX #1: All inputs have correct type, name, autoComplete, required, htmlFor */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <AnimatePresence>
            {mode === MODES.REGISTER && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <Field label="الاسم الكامل" field="name" type="text" placeholder="أدخل اسمك" dir="rtl" autoComplete="name" required />
              </motion.div>
            )}
          </AnimatePresence>

          {/* FIX #1: type=email, inputMode=email, autoComplete=email */}
          <Field
            label="البريد الإلكتروني"
            field="email"
            type="email"
            placeholder="example@email.com"
            autoComplete="email"
            inputMode="email"
            required
          />

          {/* FIX #1: type=password, autoComplete proper */}
          <Field
            label="كلمة المرور"
            field="password"
            type="password"
            placeholder="••••••••"
            autoComplete={mode === MODES.REGISTER ? 'new-password' : 'current-password'}
            required
          />

          <AnimatePresence>
            {mode === MODES.REGISTER && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.2 }}>
                <Field label="تأكيد كلمة المرور" field="confirmPassword" type="password" placeholder="••••••••" autoComplete="new-password" required />
              </motion.div>
            )}
          </AnimatePresence>

          {/* FIX #6: Forgot password — bigger, hover underline, better contrast */}
          {mode === MODES.LOGIN && (
            <div className="text-left">
              <button
                type="button"
                onClick={() => switchMode(MODES.FORGOT)}
                className="text-sm text-primary-400 hover:text-primary-300 transition-colors hover:underline font-medium"
              >
                نسيت كلمة المرور؟
              </button>
            </div>
          )}

          {/* FIX #2: Secondary login button — disabled + spinner while loading */}
          <button
            type="submit"
            disabled={isLoading}
            className="btn-ghost w-full mt-2 flex items-center justify-center gap-2 border border-white/20 hover:border-white/40"
          >
            {isLoading
              ? <Spinner />
              : mode === MODES.REGISTER
                ? '✨ إنشاء الحساب'
                : 'تسجيل الدخول بالبريد الإلكتروني'
            }
          </button>
        </form>

        {/* FIX #7: Feature icons section REMOVED */}
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

        {/* FIX #7: Feature icons section DELETED — was here, now gone */}
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
