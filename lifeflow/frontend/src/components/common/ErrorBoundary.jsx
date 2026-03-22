/**
 * ErrorBoundary — يلتقط أخطاء React ويعرضها بشكل جميل
 * مع إرسال تقرير الخطأ للـ backend عند وجود token
 */

import React from 'react';

// Client-side error reporter
const reportError = (error, componentStack) => {
  try {
    const token = typeof window !== 'undefined' ? localStorage.getItem('lifeflow_token') : null;
    const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
    fetch(`${BASE}/logs/client-error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message: error?.message,
        stack: error?.stack,
        componentStack,
        url: typeof window !== 'undefined' ? window.location.href : '',
        timestamp: new Date().toISOString(),
      }),
    }).catch(() => {});
  } catch (_) {}
};

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    reportError(error, errorInfo?.componentStack);
    console.error('[LifeFlow Error Boundary]', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const { error, errorInfo } = this.state;
    const isDev = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_SHOW_ERRORS === 'true';

    return (
      <div
        className="flex flex-col items-center justify-center p-8 text-center min-h-[300px] bg-red-500/5 border border-red-500/20 rounded-2xl"
        dir="rtl"
      >
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-xl font-bold text-red-400 mb-2">حدث خطأ غير متوقع</h2>
        <p className="text-gray-400 text-sm mb-4 max-w-sm">
          {error?.message || 'حدث خطأ في هذا المكوّن. تم تسجيل الخطأ تلقائياً.'}
        </p>

        <div className="flex gap-3 flex-wrap justify-center mb-4">
          <button
            onClick={this.handleReset}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            🔄 إعادة المحاولة
          </button>
          <button
            onClick={() => typeof window !== 'undefined' && window.location.reload()}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium transition-colors"
          >
            ↺ تحديث الصفحة
          </button>
        </div>

        {isDev && errorInfo && (
          <details className="w-full max-w-2xl text-left mt-2">
            <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-300 mb-2">
              🔍 تفاصيل الخطأ (وضع التطوير)
            </summary>
            <pre className="bg-black/40 rounded-lg p-4 text-xs text-red-300 overflow-auto max-h-48 whitespace-pre-wrap text-left" dir="ltr">
              {error?.stack}
              {'\n\nComponent Stack:'}
              {errorInfo.componentStack}
            </pre>
          </details>
        )}
      </div>
    );
  }
}
