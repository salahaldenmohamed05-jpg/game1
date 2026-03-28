/**
 * 404 Page — Phase H: Static, crash-proof "not found" page
 * ===========================================================
 * Resolves the Next.js warning:
 *   "A custom error page without a custom 404 page"
 * Uses inline styles only — no external dependencies.
 */

export default function Custom404() {
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
    background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(108,99,255,0.2))',
    border: '1px solid rgba(59,130,246,0.3)',
    marginBottom: '16px',
  };

  const codeStyle = {
    fontSize: '28px',
    fontWeight: 'bold',
    color: '#60A5FA',
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
          <span style={codeStyle}>404</span>
        </div>
        <h2 style={titleStyle}>الصفحة غير موجودة</h2>
        <p style={descStyle}>
          الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
        </p>
        <div style={btnGroupStyle}>
          <button
            onClick={() => { try { window.location.href = '/'; } catch(e) {} }}
            style={btnPrimaryStyle}
          >
            الصفحة الرئيسية
          </button>
          <button
            onClick={() => { try { window.history.back(); } catch(e) {} }}
            style={btnSecondaryStyle}
          >
            رجوع
          </button>
        </div>
      </div>
    </div>
  );
}
