import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from '@/auth/AuthProvider';
import { AppLayout } from '@/components/layout/AppLayout';
import { BoardPage } from '@/pages/BoardPage';
import { NuevaSolicitudPage } from '@/pages/NewRequestPage';
import { MisSolicitudesPage } from '@/pages/MyRequestsPage';
import { RequestsPage } from '@/pages/RequestsPage';
import { LoginPage } from '@/pages/LoginPage';
import { AutomationsPage } from './pages/AutomationsPage';
import { StatsPage } from './pages/StatsPage';
import { useTheme } from '@/store/useTheme';

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

export default function App() {
  // Inyecta las variables CSS del tema activo en :root globalmente.
  // Al cambiar de tema, useTheme actualiza document.documentElement
  // y TODO el layout (sidebar, topbar, columnas, tarjetas) lo hereda.
  useTheme();

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<BoardPage />} />
        <Route path="new"          element={<NuevaSolicitudPage />} />
        <Route path="requests"     element={<RequestsPage />} />
        <Route path="my-requests"  element={<MisSolicitudesPage />} />
        <Route path="stats"        element={<StatsPage />} />
        <Route path="automations"      element={<AutomationsPage />} />
        <Route path="automations/logs" element={<AutomationsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}