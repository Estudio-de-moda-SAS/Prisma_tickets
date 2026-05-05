import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { AppLayout } from '@/components/layout/AppLayout';
import { BoardPage } from '@/pages/BoardPage';
import { HomePage } from '@/pages/HomePage';
import { NuevaSolicitudPage } from '@/pages/NewRequestPage';
import { MisSolicitudesPage } from '@/pages/MyRequestsPage';
import { TeamRequestsPage } from '@/pages/TeamRequestsPage';
import { RequestsPage } from '@/pages/RequestsPage';
import { StatsPage } from '@/pages/StatsPage';
import { AutomationsPage } from '@/pages/AutomationsPage';
import { LoginPage } from '@/pages/LoginPage';
import EmailPreviewPage from '@/pages/EmailPreview';

/* ============================================================
   ScrollToEquipo — cuando la URL tiene ?section=equipo-XXX
   hace scroll suave al elemento con ese id una vez que el
   DOM está disponible.
   ============================================================ */
function ScrollToSection() {
  const { search } = useLocation();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const section = params.get('section');

    if (!section) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(section);

      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });

        const prev = el.style.transition;
        el.style.transition = 'box-shadow 0.3s';
        el.style.boxShadow = '0 0 0 2px rgba(0,200,255,0.45)';

        setTimeout(() => {
          el.style.boxShadow = '';
          el.style.transition = prev;
        }, 1200);
      }
    }, 120);

    return () => clearTimeout(timer);
  }, [search]);

  return null;
}

/* ============================================================
   Guard — redirige a /login si no hay sesión activa
   ============================================================ */
function RequireAuth({ children }: { children: React.ReactNode }) {
  const { ready, account } = useAuth();

  if (!ready) {
    return (
      <div className="login-page">
        <span style={{ color: 'var(--txt-muted)', fontSize: 12, letterSpacing: 1 }}>
          Iniciando...
        </span>
      </div>
    );
  }

  if (!account) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

/* ============================================================
   App
   ============================================================ */
export default function App() {
  return (
    <Routes>
      {/* Pública */}
      <Route path="/login" element={<LoginPage />} />

      {/* Preview de correos */}
      <Route path="/email-preview" element={<EmailPreviewPage />} />

      {/* Protegidas — todas dentro del AppLayout */}
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        {/* Board de equipo (raíz) */}
        <Route index element={<BoardPage />} />

        {/* Inicio — panel con resumen por equipo + CTA */}
        <Route
          path="home"
          element={
            <>
              <ScrollToSection />
              <HomePage />
            </>
          }
        />

        {/* Crear nueva solicitud */}
        <Route path="new" element={<NuevaSolicitudPage />} />

        {/* Mis solicitudes — lista personal global */}
        <Route path="my-requests" element={<MisSolicitudesPage />} />

        {/* Solicitudes por equipo — con filtro mes/año */}
        <Route path="requests/team/:equipo" element={<TeamRequestsPage />} />

        {/* Todas las solicitudes — vista admin/resolutor */}
        <Route path="requests" element={<RequestsPage />} />

        {/* Estadísticas */}
        <Route path="stats" element={<StatsPage />} />

        {/* Automatizaciones */}
        <Route path="automations" element={<AutomationsPage />} />
        <Route path="automations/logs" element={<AutomationsPage />} />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}