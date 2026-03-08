/**
 * Login / Register Page - صفحة تسجيل الدخول والتسجيل
 * =====================================================
 * Beautiful redesigned auth page with proper validation
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { login, register: registerUser } = useAuthStore();

  // Form state
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({});

  const validate = () => {
    const errs = {};
    if (isRegister && !form.name.trim()) errs.name = 'الاسم مطلوب';
    if (!form.email.trim() || !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = 'البريد الإلكتروني غير صحيح';
    if (!form.password || form.password.length < 6) errs.password = 'كلمة المرور يجب أن تكون 6 أحرف على الأقل';
    if (isRegister && form.password !== form.confirmPassword) errs.confirmPassword = 'كلمتا المرور غير متطابقتين';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;

    setIsLoading(true);
    try {
      if (isRegister) {
        const result = await registerUser({ name: form.name, email: form.email, password: form.password });
        if (result.success) {
          toast.success('مرحباً! تم إنشاء حسابك بنجاح 🎉');
          setTimeout(() => { window.location.href = '/'; }, 600);
        } else {
          toast.error(result.message || 'فشل في إنشاء الحساب، حاول مرة أخرى');
        }
      } else {
        const result = await login(form.email, form.password);
        if (result.success) {
          toast.success('أهلاً بك مجدداً! 👋');
          setTimeout(() => { window.location.href = '/'; }, 600);
        } else {
          toast.error(result.message || 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
        }
      }
    } catch (err) {
      toast.error(err.message || 'حدث خطأ غير متوقع');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoLogin = async () => {
    setIsLoading(true);
    const result = await login('demo@lifeflow.app', 'demo123456');
    setIsLoading(false);
    if (result.success) {
      toast.success('أهلاً بك في الحساب التجريبي! 🎯');
      setTimeout(() => { window.location.href = '/'; }, 600);
    } else {
      toast.error(result.message || 'فشل تسجيل الدخول التجريبي');
    }
  };

  const switchMode = (toRegister) => {
    setIsRegister(toRegister);
    setErrors({});
    setForm({ name: '', email: '', password: '', confirmPassword: '' });
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
          {/* Tab switcher */}
          <div className="flex rounded-xl bg-white/5 p-1 mb-6">
            <button
              onClick={() => switchMode(false)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                !isRegister ? 'bg-primary-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'
              }`}
            >
              تسجيل الدخول
            </button>
            <button
              onClick={() => switchMode(true)}
              className={`flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                isRegister ? 'bg-primary-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'
              }`}
            >
              حساب جديد
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {/* Name (register only) */}
            <AnimatePresence>
              {isRegister && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <label className="block text-sm text-gray-400 mb-1">الاسم الكامل</label>
                  <input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className={`input-field ${errors.name ? 'border-red-500/50' : ''}`}
                    placeholder="أدخل اسمك الكامل"
                    autoComplete="name"
                  />
                  {errors.name && <p className="text-red-400 text-xs mt-1">{errors.name}</p>}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">البريد الإلكتروني</label>
              <input
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className={`input-field ${errors.email ? 'border-red-500/50' : ''}`}
                type="email"
                placeholder="example@email.com"
                dir="ltr"
                autoComplete="email"
              />
              {errors.email && <p className="text-red-400 text-xs mt-1">{errors.email}</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">كلمة المرور</label>
              <input
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                className={`input-field ${errors.password ? 'border-red-500/50' : ''}`}
                type="password"
                placeholder="••••••••"
                dir="ltr"
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
              {errors.password && <p className="text-red-400 text-xs mt-1">{errors.password}</p>}
            </div>

            {/* Confirm Password (register only) */}
            <AnimatePresence>
              {isRegister && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <label className="block text-sm text-gray-400 mb-1">تأكيد كلمة المرور</label>
                  <input
                    value={form.confirmPassword}
                    onChange={e => setForm({ ...form, confirmPassword: e.target.value })}
                    className={`input-field ${errors.confirmPassword ? 'border-red-500/50' : ''}`}
                    type="password"
                    placeholder="••••••••"
                    dir="ltr"
                    autoComplete="new-password"
                  />
                  {errors.confirmPassword && <p className="text-red-400 text-xs mt-1">{errors.confirmPassword}</p>}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full mt-2 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  جارٍ التحميل...
                </>
              ) : (
                isRegister ? '✨ إنشاء الحساب' : '🚀 تسجيل الدخول'
              )}
            </button>
          </form>

          {/* Demo login */}
          <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <p className="text-xs text-gray-500 mb-3">أو جرّب التطبيق مباشرة</p>
            <button
              onClick={handleDemoLogin}
              disabled={isLoading}
              className="btn-ghost text-sm w-full"
            >
              🎯 دخول كمستخدم تجريبي
            </button>
          </div>
        </div>

        {/* Features */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: '📋', label: 'إدارة المهام' },
            { icon: '🧠', label: 'رؤى ذكية' },
            { icon: '🏃', label: 'تتبع العادات' },
          ].map((f) => (
            <motion.div
              key={f.label}
              whileHover={{ scale: 1.05 }}
              className="glass-card p-3"
            >
              <div className="text-2xl mb-1">{f.icon}</div>
              <div className="text-xs text-gray-400">{f.label}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
