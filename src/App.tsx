import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { useRole, canSeeBoard } from "@/auth/roles";
import { AppLayout } from "@/components/layout/AppLayout";
import { BoardPage } from "@/pages/BoardPage";
import { HomePage } from "@/pages/HomePage";
import { NuevaSolicitudPage } from "@/pages/NewRequestPage";
import { MisSolicitudesPage } from "@/pages/MyRequestsPage";
import { TeamRequestsPage } from "@/pages/TeamRequestsPage";
import { RequestsPage } from "@/pages/RequestsPage";
import { StatsPage } from "@/pages/StatsPage";
import { AutomationsPage } from "@/pages/AutomationsPage";
import { LoginPage } from "@/pages/LoginPage";
import { TicketModalPreviewPage } from "@/pages/TicketModalPreviewPage";
import { OnboardingPage } from '@/pages/OnBoardingPage';
import { TicketPage } from "@/pages/TicketPage";
import { PrismaAdminPage } from '@/pages/PrismaAdminPage';

// ─── Scroll helper ────────────────────────────────────────────────────────────

function ScrollToSection() {
  const { search } = useLocation();

  useEffect(() => {
    const params  = new URLSearchParams(search);
    const section = params.get("section");
    if (!section) return;

    const timer = setTimeout(() => {
      const el = document.getElementById(section);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const prev = el.style.transition;
      el.style.transition = 'box-shadow 0.3s';
      el.style.boxShadow  = '0 0 0 2px rgba(0,200,255,0.45)';
      setTimeout(() => {
        el.style.boxShadow  = '';
        el.style.transition = prev;
      }, 1200);
    }, 120);

    return () => clearTimeout(timer);
  }, [search]);

  return null;
}

// ─── Guards ───────────────────────────────────────────────────────────────────

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { ready, account } = useAuth();
  if (!ready)   return null;
  if (!account) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireOnboarding({ children }: { children: React.ReactNode }) {
  const { dbReady, dbUser } = useAuth();
  if (!dbReady)  return null;
  if (!dbUser)   return <>{children}</>;
  if (dbUser.Is_New) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function RequireTI({ children }: { children: React.ReactNode }) {
  const { dbReady } = useAuth();
  const role = useRole();
  if (!dbReady) return null;
  if (!canSeeBoard(role)) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { dbReady } = useAuth();
  const role = useRole();
  if (!dbReady) return null;
  if (role.role !== 'admin') return <Navigate to="/home" replace />;
  return <>{children}</>;
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  return (
    <Routes>
      {/* Pública */}
      <Route path="/login" element={<LoginPage />} />

      {/* Onboarding */}
      <Route
        path="/onboarding"
        element={
          <RequireAuth>
            <OnboardingPage />
          </RequireAuth>
        }
      />

      {/* Rutas de app */}
      <Route
        element={
          <RequireAuth>
            <RequireOnboarding>
              <AppLayout />
            </RequireOnboarding>
          </RequireAuth>
        }
      >
        {/* Raíz: redirige al board activo en la sesión */}
// DESPUÉS
<Route index element={<Navigate to="/home" replace />} />
        {/* Board por equipo — cada kanban tiene su propia ruta */}
        <Route
          path="board/:equipo"
          element={
            <RequireTI>
              <BoardPage />
            </RequireTI>
          }
        />
<Route path="ticket/:ticketId" element={<TicketPage />} />
        {/* Deep link de ticket — accesible por todos los roles autenticados.
            El resolver interno decide qué modal mostrar según permisos. */}
<Route path="board/:equipo/ticket/:ticketId" element={<TicketPage />} />

        {/* Inicio — todos */}
        <Route
          path="home"
          element={
            <>
              <ScrollToSection />
              <HomePage />
            </>
          }
        />

        {/* Nueva solicitud — todos */}
        <Route path="new"         element={<NuevaSolicitudPage />} />
        <Route path="my-requests" element={<MisSolicitudesPage />} />

        {/* TI (admin + member) */}
        <Route path="stats" element={<RequireTI><StatsPage /></RequireTI>} />

        {/* Solo admin */}
        <Route path="requests/team/:equipo"       element={<RequireAdmin><TeamRequestsPage /></RequireAdmin>} />
        <Route path="requests"                    element={<RequireAdmin><RequestsPage /></RequireAdmin>} />
        <Route path="automations"                 element={<RequireAdmin><AutomationsPage /></RequireAdmin>} />
        <Route path="automations/logs"            element={<RequireAdmin><AutomationsPage /></RequireAdmin>} />
        <Route path="preview/create-ticket-modal" element={<RequireAdmin><TicketModalPreviewPage /></RequireAdmin>} />
        <Route path="prisma" element={<RequireAdmin><PrismaAdminPage /></RequireAdmin>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}