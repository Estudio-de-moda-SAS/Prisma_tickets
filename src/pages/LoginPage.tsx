import { useAuth } from '@/auth/AuthProvider';
import { Navigate } from 'react-router-dom';
import './LoginPage.css';

export function LoginPage() {
  const { account, signIn, ready } = useAuth();

  if (ready && account) return <Navigate to="/" replace />;

  return (
    <div className="lp-root">
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