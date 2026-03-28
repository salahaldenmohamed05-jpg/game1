/**
 * ErrorBoundary — Phase H: Robust error catching & recovery
 * ==========================================================
 * HARDENING IMPROVEMENTS:
 * - Auto-retry with exponential backoff (transient errors)
 * - SSR-safe (no window/document access in constructor)
 * - Error reporting wrapped in try/catch (fire-and-forget)
 * - Maximum retry limit to prevent infinite loops
 * - Inline fallback styles (works even if CSS fails to load)
 * - Dev mode: full stack trace display
 */

import React from 'react';

const MAX_AUTO_RETRIES = 2;
const AUTO_RETRY_DELAY = 3000; // ms

// Client-side error reporter (fire-and-forget, never throws)
const reportError = (error, componentStack) => {
  try {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('lifeflow_token');
    let BASE = 'http://localhost:5000/api/v1';
    const h = window.location.hostname;
    if (h.includes('.e2b.dev')) BASE = `https://${h.replace(/^\d+-/, '5000-')}/api/v1`;
    else if (h.includes('.sandbox.novita.ai')) BASE = `https://${h.replace(/^\d+-/, '5000-')}/api/v1`;
    fetch(`${BASE}/logs/client-error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        message: error?.message,
        stack: error?.stack?.substring(0, 2000),
        componentStack: componentStack?.substring(0, 2000),
        url: typeof window !== 'undefined' ? window.location.href : '',
        timestamp: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      }),
    }).catch(() => {});
  } catch (_) {
    // Silently fail — error reporting should never crash the app
  }
};

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      autoRetryCount: 0,
    };
    this._mounted = true;
    this._autoRetryTimer = null;
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (this._mounted) {
      this.setState({ errorInfo });
    }
    reportError(error, errorInfo?.componentStack);
    console.error('[LifeFlow ErrorBoundary]', error, errorInfo);

    // Auto-retry for transient errors (up to MAX_AUTO_RETRIES)
    if (this._mounted && this.state.autoRetryCount < MAX_AUTO_RETRIES) {
      this._autoRetryTimer = setTimeout(() => {
        if (this._mounted) {
          this.setState(prev => ({
            hasError: false,
            error: null,
            errorInfo: null,
            autoRetryCount: prev.autoRetryCount + 1,
          }));
        }
      }, AUTO_RETRY_DELAY * (this.state.autoRetryCount + 1));
    }
  }

  componentWillUnmount() {
    this._mounted = false;
    if (this._autoRetryTimer) {
      clearTimeout(this._autoRetryTimer);
    }
  }

  handleReset = () => {
    if (this._autoRetryTimer) clearTimeout(this._autoRetryTimer);
    this.setState(prev => ({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: prev.retryCount + 1,
      autoRetryCount: 0,
    }));
  };

  handleReload = () => {
    try {
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    } catch {}
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const { error, errorInfo, retryCount, autoRetryCount } = this.state;
    const isDev = typeof process !== 'undefined' &&
      (process.env?.NODE_ENV === 'development' || process.env?.NEXT_PUBLIC_SHOW_ERRORS === 'true');
    const isAutoRetrying = autoRetryCount < MAX_AUTO_RETRIES;

    // Compact mode for nested boundaries (e.g., inside dashboard cards)
    if (this.props.compact) {
      return (
        <div
          style={{
            padding: '12px',
            textAlign: 'center',
            borderRadius: '12px',
            background: 'rgba(239, 68, 68, 0.05)',
            border: '1px solid rgba(239, 68, 68, 0.1)',
            direction: 'rtl',
          }}
        >
          <p style={{ fontSize: '12px', color: '#94A3B8', marginBottom: '8px' }}>
            {isAutoRetrying ? 'جاري إعادة المحاولة...' : 'حدث خطأ في هذا القسم'}
          </p>
          {!isAutoRetrying && (
            <button
              onClick={this.handleReset}
              style={{
                fontSize: '12px',
                color: '#A78BFA',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                fontFamily: 'inherit',
              }}
            >
              🔄 إعادة المحاولة
            </button>
          )}
        </div>
      );
    }

    // Full error screen with inline styles (works even if CSS fails)
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '32px',
          textAlign: 'center',
          minHeight: '300px',
          background: 'rgba(239, 68, 68, 0.05)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          borderRadius: '16px',
          direction: 'rtl',
          fontFamily: 'Cairo, Tajawal, system-ui, sans-serif',
        }}
      >
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>⚠️</div>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#F87171', marginBottom: '8px' }}>
          حدث خطأ غير متوقع
        </h2>
        <p style={{ color: '#94A3B8', fontSize: '14px', marginBottom: '16px', maxWidth: '350px' }}>
          {isAutoRetrying
            ? 'جاري إعادة المحاولة تلقائياً...'
            : (error?.message || 'حدث خطأ في هذا المكوّن. تم تسجيل الخطأ تلقائياً.')}
        </p>

        {!isAutoRetrying && (
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center', marginBottom: '16px' }}>
            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 16px',
                background: '#3B82F6',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              🔄 إعادة المحاولة {retryCount > 0 ? `(${retryCount})` : ''}
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '8px 16px',
                background: '#374151',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              ↺ تحديث الصفحة
            </button>
          </div>
        )}

        {isDev && errorInfo && (
          <details style={{ width: '100%', maxWidth: '640px', textAlign: 'left', marginTop: '8px' }}>
            <summary style={{ cursor: 'pointer', fontSize: '12px', color: '#6B7280', marginBottom: '8px' }}>
              🔍 تفاصيل الخطأ (وضع التطوير)
            </summary>
            <pre style={{
              background: 'rgba(0,0,0,0.4)',
              borderRadius: '8px',
              padding: '16px',
              fontSize: '12px',
              color: '#FCA5A5',
              overflow: 'auto',
              maxHeight: '200px',
              whiteSpace: 'pre-wrap',
              textAlign: 'left',
              direction: 'ltr',
            }}>
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
