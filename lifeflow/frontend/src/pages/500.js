/**
 * 500 Error Page — Phase H: Crash-proof static error page
 * =========================================================
 * CRITICAL: This page MUST render even when the app is completely broken.
 * - Zero external imports (no React components, no utilities)
 * - Inline styles only (CSS/Tailwind may not be available)
 * - No hooks, no state, no side effects
 * - Button handlers wrapped in try/catch
 */

export default function Custom500() {
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
    fontSize: '28px',
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

  const btnStyle = {
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

  return (
    <div style={containerStyle}>
      <div style={cardStyle}>
        <div style={iconBoxStyle}>
          <span style={codeStyle}>500</span>
        </div>
        <h2 style={titleStyle}>حدث خطأ في الخادم</h2>
        <p style={descStyle}>
          عذراً، حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى.
        </p>
        <button
          onClick={() => { try { window.location.reload(); } catch(e) {} }}
          style={btnStyle}
        >
          إعادة المحاولة
        </button>
      </div>
    </div>
  );
}
