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
import { FullPageLoader } from '@/components/states/FullPageLoader';
import { ForbiddenPage } from '@/components/states/ForbiddenPage';

import { StatesPreviewPage } from '@/pages/StatesPreviewPage';
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
   Guard — valida sesión y, opcionalmente, roles permitidos
   ============================================================ */
function RequireAuth({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: string[];
}) {
  const { ready, account, role } = useAuth();

  if (!ready) {
    return <FullPageLoader message="Validando sesión..." />;
  }

  if (!account) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles?.length && (!role || !allowedRoles.includes(role))) {
    return <Navigate to="/forbidden" replace />;
  }

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

<Route path="/states-preview" element={<StatesPreviewPage />} />

      {/* Sin permisos */}
      <Route path="/forbidden" element={<ForbiddenPage />} />

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
        <Route
          path="requests"
          element={
            <RequireAuth allowedRoles={['admin', 'resolutor']}>
              <RequestsPage />
            </RequireAuth>
          }
        />

        {/* Estadísticas */}
        <Route
          path="stats"
          element={
            <RequireAuth allowedRoles={['admin', 'lider']}>
              <StatsPage />
            </RequireAuth>
          }
        />

        {/* Automatizaciones */}
        <Route
          path="automations"
          element={
            <RequireAuth allowedRoles={['admin']}>
              <AutomationsPage />
            </RequireAuth>
          }
        />

        <Route
          path="automations/logs"
          element={
            <RequireAuth allowedRoles={['admin']}>
              <AutomationsPage />
            </RequireAuth>
          }
        />
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}