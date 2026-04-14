import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { AppLayout } from '@/components/layout/AppLayout';
import { BoardPage } from '@/pages/BoardPage';
import { HomePage } from '@/pages/HomePage';
import { NuevaSolicitudPage } from '@/pages/NewRequestPage';
import { MisSolicitudesPage } from '@/pages/MyRequestsPage';
import { RequestsPage } from '@/pages/RequestsPage';
import { StatsPage } from '@/pages/StatsPage';
import { AutomationsPage } from '@/pages/AutomationsPage';
import { LoginPage } from '@/pages/LoginPage';

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
        <Route path="home" element={<HomePage />} />

        {/* Crear nueva solicitud */}
        <Route path="new" element={<NuevaSolicitudPage />} />

        {/* Mis solicitudes — lista personal */}
        <Route path="my-requests" element={<MisSolicitudesPage />} />

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