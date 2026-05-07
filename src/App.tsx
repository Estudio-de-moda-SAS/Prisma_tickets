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
import { OnboardingPage } from '@/pages/OnBoardingPage';

function ScrollToSection() {
  const { search } = useLocation();
  useEffect(() => {
    const params  = new URLSearchParams(search);
    const section = params.get('section');
    if (!section) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(section);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const prev = el.style.transition;
        el.style.transition = 'box-shadow 0.3s';
        el.style.boxShadow  = '0 0 0 2px rgba(0,200,255,0.45)';
        setTimeout(() => {
          el.style.boxShadow  = '';
          el.style.transition = prev;
        }, 1200);
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [search]);
  return null;
}

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
  return (
    <Routes>
      {/* Pública */}
      <Route path="/login" element={<LoginPage />} />

      {/* Onboarding — protegida pero fuera del AppLayout */}
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />

      {/* Protegidas — todas dentro del AppLayout */}
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<BoardPage />} />
        <Route
          path="home"
          element={
            <>
              <ScrollToSection />
              <HomePage />
            </>
          }
        />
        <Route path="new"                        element={<NuevaSolicitudPage />} />
        <Route path="my-requests"                element={<MisSolicitudesPage />} />
        <Route path="requests/team/:equipo"      element={<TeamRequestsPage />} />
        <Route path="requests"                   element={<RequestsPage />} />
        <Route path="stats"                      element={<StatsPage />} />
        <Route path="automations"                element={<AutomationsPage />} />
        <Route path="automations/logs"           element={<AutomationsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}