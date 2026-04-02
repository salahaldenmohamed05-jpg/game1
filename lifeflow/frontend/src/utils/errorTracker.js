/**
 * Error Tracker — Client-side error logging
 * =============================================
 * Captures and reports errors to the backend /logs/client-error endpoint.
 * Lightweight alternative to Sentry — works without external services.
 * 
 * Production: Replace with Sentry by adding:
 *   npm install @sentry/nextjs
 *   Sentry.init({ dsn: 'YOUR_DSN', tracesSampleRate: 0.1 })
 */

import { logsAPI } from './api';

const MAX_ERRORS_PER_SESSION = 50;
let errorCount = 0;

/**
 * Report an error to the backend
 */
export function trackError(error, context = {}) {
  if (typeof window === 'undefined') return;
  if (errorCount >= MAX_ERRORS_PER_SESSION) return;
  errorCount++;

  const payload = {
    message: error?.message || String(error),
    stack: error?.stack?.substring(0, 2000),
    url: window.location.href,
    userAgent: navigator.userAgent,
    timestamp: new Date().toISOString(),
    context: {
      ...context,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      online: navigator.onLine,
    },
  };

  // Fire-and-forget — never let error tracking crash the app
  try {
    logsAPI.reportClientError(payload).catch(() => {});
  } catch {}
}

/**
 * Track performance metrics
 */
export function trackPerformance() {
  if (typeof window === 'undefined') return;
  if (!('performance' in window)) return;

  // Wait for page to fully load
  window.addEventListener('load', () => {
    setTimeout(() => {
      try {
        const nav = performance.getEntriesByType('navigation')[0];
        if (!nav) return;

        const metrics = {
          dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
          tcp: Math.round(nav.connectEnd - nav.connectStart),
          ttfb: Math.round(nav.responseStart - nav.requestStart),
          dom_load: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
          page_load: Math.round(nav.loadEventEnd - nav.startTime),
          transfer_size: nav.transferSize,
        };

        // Log performance (non-blocking) — using performance type, not error
        logsAPI.reportClientError({
          message: 'performance_metrics',
          type: 'performance',
          severity: 'info',
          context: metrics,
          url: window.location.href,
          timestamp: new Date().toISOString(),
          stack: `Performance: DNS=${metrics.dns}ms TCP=${metrics.tcp}ms TTFB=${metrics.ttfb}ms DOM=${metrics.dom_load}ms Total=${metrics.page_load}ms`,
        }).catch(() => {});
      } catch {}
    }, 3000);
  });
}

/**
 * Initialize global error tracking
 */
export function initErrorTracking() {
  if (typeof window === 'undefined') return;

  // Track unhandled errors
  window.addEventListener('error', (event) => {
    trackError(event.error || new Error(event.message), {
      type: 'unhandled_error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });

  // Track unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    trackError(event.reason || new Error('Unhandled rejection'), {
      type: 'unhandled_rejection',
    });
  });

  // Track performance
  trackPerformance();
}

export default { trackError, trackPerformance, initErrorTracking };
