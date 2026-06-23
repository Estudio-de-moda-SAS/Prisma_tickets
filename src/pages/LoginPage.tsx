import { useAuth } from '@/auth/AuthProvider';
import { Navigate } from 'react-router-dom';
import '@/styles/LoginPage.css';
import { usePublicAnnouncements } from '@/features/requests/hooks/useAnnouncements';

export function LoginPage() {
const { account, signIn, ready, dbReady } = useAuth();
  // DESPUÉS
if (ready && dbReady && account) return <Navigate to="/home" replace />;
function LoginAnnouncementStrip() {
  const { data: list = [] } = usePublicAnnouncements();
  if (list.length === 0) return null;
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 1000, display: 'flex', flexDirection: 'column' }}>
      {list.map((a) => {
        const TYPE_COLOR: Record<string, string> = { info: '#00c8ff', warning: '#EF9F27', critical: '#ff4757', success: '#4CAF50' };
        const TYPE_ICON:  Record<string, string> = { info: 'ℹ️', warning: '⚠️', critical: '🚨', success: '✅' };
        const color  = TYPE_COLOR[a.type] ?? '#00c8ff';
        const border = color + '35';
        return (
  <div key={a.id} style={{
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    padding: '9px 20px',
    background: color + '18',
    backdropFilter: 'blur(10px)',
    borderBottom: `1px solid ${border}`,
    borderLeft: `3px solid ${color}`
  }}>
    <span style={{ fontSize: 12 }}>{TYPE_ICON[a.type]}</span>
    <span style={{ fontSize: 12, fontWeight: 700, color }}>{a.title}</span>
    {a.body && <span style={{ fontSize: 12 }}>· {a.body}</span>}
  </div>
        );
      })}
    </div>
  );
}
  return (
    <div className="lp-root">
      <LoginAnnouncementStrip />
      {/* Geometric background */}
      <div className="lp-bg" aria-hidden="true">
        <svg className="lp-bg__grid" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="hex-grid" x="0" y="0" width="60" height="52" patternUnits="userSpaceOnUse">
              <polygon points="30,2 56,16 56,44 30,58 4,44 4,16" fill="none" stroke="currentColor" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hex-grid)" />
        </svg>
        <div className="lp-bg__orb lp-bg__orb--1" />
        <div className="lp-bg__orb lp-bg__orb--2" />
      </div>

      {/* Main card */}
      <div className="lp-card">

        {/* Left panel — brand */}
        <div className="lp-card__brand">
          <div className="brand__logo">
            <img
              src="/favicon.ico"
              alt="Prisma logo"
              width={50}
              height={50}
              style={{ objectFit: 'contain' }}
              onError={(e) => {
                const el = e.currentTarget;
                if (el.src.endsWith('.ico')) {
                  el.src = '/favicon.png';
                } else if (el.src.endsWith('.png')) {
                  el.src = '/favicon.svg';
                }
              }}
            />
          </div>

          <div className="lp-brand__text">
            <span className="lp-brand__name">Prisma</span>
            <span className="lp-brand__product">Support System</span>
          </div>

          <div className="lp-brand__divider" />

          <p className="lp-brand__tagline">
            Gestiona tickets, escala incidentes y da seguimiento a cada solicitud — todo desde un solo lugar.
          </p>

          <div className="lp-brand__features">
            <div className="lp-feature">
              <span className="lp-feature__dot" />
              Tickets en tiempo real
            </div>
            <div className="lp-feature">
              <span className="lp-feature__dot" />
              Escalado automático
            </div>
            <div className="lp-feature">
              <span className="lp-feature__dot" />
              Reportes y métricas
            </div>
          </div>
        </div>

        {/* Right panel — auth */}
        <div className="lp-card__auth">
          <div className="lp-auth__header">
            <p className="lp-auth__eyebrow">Acceso corporativo</p>
            <h1 className="lp-auth__title">Bienvenido</h1>
            <p className="lp-auth__sub">
              Inicia sesión con tu cuenta de Microsoft para continuar.
            </p>
          </div>

          <button
            className="lp-auth__btn"
            onClick={() => signIn('popup')}
          >
            <svg
              className="lp-auth__btn-icon"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 21 21"
              width="20"
              height="20"
              aria-hidden="true"
            >
              <rect x="1" y="1" width="9" height="9" fill="#F25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
              <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
              <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
            </svg>
            Continuar con Microsoft 365
          </button>

          <div className="lp-auth__notice">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Protegido con autenticación multifactor · Solo personal autorizado
          </div>
        </div>
      </div>

      <footer className="lp-footer">
        Prisma Support System · Uso interno exclusivo
      </footer>
    </div>
  );
}