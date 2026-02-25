/**
 * Login Page - صفحة تسجيل الدخول
 */

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import useAuthStore from '../store/authStore';

export default function LoginPage() {
  const [isRegister, setIsRegister] = useState(false);
  const { login, register: registerUser, isLoading } = useAuthStore();
  const { register, handleSubmit, formState: { errors } } = useForm();

  const onSubmit = async (data) => {
    let result;
    if (isRegister) {
      result = await registerUser(data);
      if (result.success) {
        toast.success('مرحباً! تم إنشاء حسابك بنجاح 🎉');
      }
    } else {
      result = await login(data.email, data.password);
      if (result.success) {
        toast.success('أهلاً بك مجدداً! 👋');
      }
    }
    if (!result.success) {
      toast.error(result.message || 'حدث خطأ');
    }
  };

  return (
    <div className="min-h-screen animated-bg flex items-center justify-center p-4">
      {/* Background decorative elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-20 w-64 h-64 bg-primary-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-20 left-20 w-48 h-48 bg-secondary-500/10 rounded-full blur-3xl"></div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-500 to-secondary-500 mb-4 shadow-glow">
            <span className="text-4xl">✨</span>
          </div>
          <h1 className="text-4xl font-black gradient-text">LifeFlow</h1>
          <p className="text-gray-400 mt-2 text-sm">مساعدك الشخصي والمهني الذكي</p>
        </div>

        {/* Card */}
        <div className="glass-card p-8">
          {/* Tab switcher */}
          <div className="flex rounded-xl bg-white/5 p-1 mb-6">
            <button
              onClick={() => setIsRegister(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${!isRegister ? 'bg-primary-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
              تسجيل الدخول
            </button>
            <button
              onClick={() => setIsRegister(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${isRegister ? 'bg-primary-500 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
            >
              حساب جديد
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Name field (register only) */}
            {isRegister && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}>
                <label className="block text-sm text-gray-400 mb-1">الاسم الكامل</label>
                <input
                  {...register('name', { required: isRegister })}
                  className="input-field"
                  placeholder="أدخل اسمك"
                />
              </motion.div>
            )}

            {/* Email */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">البريد الإلكتروني</label>
              <input
                {...register('email', { required: true, pattern: /^\S+@\S+$/i })}
                className="input-field"
                type="email"
                placeholder="example@email.com"
                dir="ltr"
              />
              {errors.email && <p className="text-red-400 text-xs mt-1">البريد الإلكتروني غير صحيح</p>}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm text-gray-400 mb-1">كلمة المرور</label>
              <input
                {...register('password', { required: true, minLength: 6 })}
                className="input-field"
                type="password"
                placeholder="••••••••"
                dir="ltr"
              />
              {errors.password && <p className="text-red-400 text-xs mt-1">كلمة المرور يجب أن تكون 6 أحرف على الأقل</p>}
            </div>

            {/* Submit button */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full mt-6"
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  جارٍ التحميل...
                </span>
              ) : (
                isRegister ? 'إنشاء الحساب ✨' : 'تسجيل الدخول 🚀'
              )}
            </button>
          </form>

          {/* Demo account */}
          <div className="mt-6 pt-6 border-t border-white/10 text-center">
            <p className="text-xs text-gray-500 mb-3">حساب تجريبي للاختبار</p>
            <button
              onClick={() => onSubmit({ email: 'demo@lifeflow.app', password: 'demo123' })}
              className="btn-ghost text-sm w-full"
            >
              🎯 دخول كمستخدم تجريبي
            </button>
          </div>
        </div>

        {/* Features preview */}
        <div className="mt-6 grid grid-cols-3 gap-3 text-center">
          {[
            { icon: '📋', label: 'إدارة المهام' },
            { icon: '🧠', label: 'رؤى ذكية' },
            { icon: '🏃', label: 'تتبع العادات' },
          ].map((f) => (
            <div key={f.label} className="glass-card p-3">
              <div className="text-2xl mb-1">{f.icon}</div>
              <div className="text-xs text-gray-400">{f.label}</div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
