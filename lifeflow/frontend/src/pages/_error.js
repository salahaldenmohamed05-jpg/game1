/**
 * Custom Error Page — Phase I: Static, crash-proof error handler
 * ================================================================
 * CRITICAL: This page MUST never throw an error itself.
 * - No external imports (no component libraries, no API calls)
 * - No dynamic data access (no query params, no localStorage)
 * - Inline styles only (CSS classes might not be available if build fails)
 * - Pure function component with zero dependencies
 * - NO getInitialProps — allows Next.js to statically optimize 404.js
 *
 * NOTE: statusCode is derived client-side from the Next.js error object.
 * The dedicated 404.js handles 404 errors specifically.
 */

function ErrorPage({ statusCode }) {
  // Derive status code safely — works on both server and client
  const code = statusCode || 500;

  const containerStyle = {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    direction: 'rtl',
    fontFamily: 'Cairo, Tajawal, system-ui, sans-serif',
    background: 'linear-gradient(135deg, #1A1A2E 0%, #16213E 50%, #0F3460 100%)',
    color: '#E2E8F0',
  };

  const cardStyle = {
    textAlign: 'center',
    maxWidth: '400px',
    width: '100%',
  };

  const iconBoxStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '64px',
    height: '64px',
    borderRadius: '16px',
    background: 'linear-gradient(135deg, rgba(239,68,68,0.2), rgba(249,115,22,0.2))',
    border: '1px solid rgba(239,68,68,0.3)',
    marginBottom: '16px',
  };

  const codeStyle = {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#F87171',
  };

  const titleStyle = {
    fontSize: '18px',
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: '8px',
  };

  const descStyle = {
    color: '#94A3B8',
    fontSize: '14px',
    marginBottom: '20px',
    lineHeight: '1.6',
  };

  const btnGroupStyle = {
    display: 'flex',
    gap: '12px',
    justifyContent: 'center',
    flexWrap: 'wrap',
  };

  const btnPrimaryStyle = {
    padding: '10px 24px',
    background: 'rgba(108, 99, 255, 0.2)',
    color: '#A78BFA',
    fontSize: '14px',
    borderRadius: '12px',
    border: '1px solid rgba(108, 99, 255, 0.3)',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
    fontFamily: 'inherit',
  };

  const btnSecondaryStyle = {
    ...btnPrimaryStyle,
    background: 'rgba(255,255,255,0.05)',
    color: '#CBD5E1',
    borderColor: 'rgba(255,255,255,0.1)',
  };

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={iconBoxStyle}>
          <span style={codeStyle}>{code}</span>
        </div>
        <h2 style={titleStyle}>
          حدث خطأ غير متوقع
        </h2>
        <p style={descStyle}>
          عذراً، حدث خطأ في التطبيق. يرجى تحديث الصفحة أو المحاولة لاحقاً.
        </p>
        <div style={btnGroupStyle}>
          <button
            onClick={() => { try { window.location.reload(); } catch(e) {} }}
            style={btnPrimaryStyle}
          >
            تحديث الصفحة
          </button>
          <button
            onClick={() => { try { window.location.href = '/'; } catch(e) {} }}
            style={btnSecondaryStyle}
          >
            الصفحة الرئيسية
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * getInitialProps — Required by Next.js for _error page to receive statusCode.
 * Wrapped in try/catch for safety. Without this, statusCode is always undefined.
 */
ErrorPage.getInitialProps = ({ res, err }) => {
  try {
    const statusCode = res ? res.statusCode : err ? err.statusCode : 500;
    return { statusCode: statusCode || 500 };
  } catch {
    return { statusCode: 500 };
  }
};

export default ErrorPage;
