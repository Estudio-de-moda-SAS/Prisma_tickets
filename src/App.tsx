import { Routes, Route, Navigate, useLocation, useNavigate, useParams } from "react-router";
import type { Location } from "react-router";
import { useEffect } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { savePostLoginRedirect } from "@/auth/supabaseAuth";
import { useRole, canSeeBoard, canSeeStats } from "@/auth/roles";
import { useMyBoardTeams } from "@/features/requests/hooks/useBoardMetadata";
import { AppLayout } from "@/components/layout/AppLayout";
import { BoardPage } from "@/pages/BoardPage";
import { HomePage } from "@/pages/HomePage";
import { NuevaSolicitudPage } from "@/pages/NewRequestPage";
import { MisSolicitudesPage } from "@/pages/MyRequestsPage";
import { MyMentionsPage } from "@/pages/MyMentionsPage";
import { ClientRequestsPage } from "@/pages/ClientRequestsPage";
import { TeamRequestsPage } from "@/pages/TeamRequestsPage";
import { RequestsPage } from "@/pages/RequestsPage";
import { StatsPage } from "@/pages/StatsPage";
import { AutomationsPage } from "@/pages/AutomationsPage";
import { LoginPage } from "@/pages/LoginPage";
import { OnboardingPage } from '@/pages/OnBoardingPage';
import { TicketPage } from "@/pages/TicketPage";
import { PrismaAdminPage } from '@/pages/PrismaAdminPage';
import { TasksPage } from '@/pages/TasksPage';
import { SolviRequestPage } from '@/pages/integrations/SolviRequestPage';
import { SolviTicketsPage } from '@/pages/integrations/SolviTicketsPage';
import { SolviTicketModal } from '@/features/requests/components/SolviTicketModal';
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
  const location = useLocation();
  if (!ready)   return null;
  if (!account) {
    savePostLoginRedirect(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }
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

function RequireStats({ children }: { children: React.ReactNode }) {
  const { dbReady, dbUser } = useAuth();
  const role = useRole();
  const { data: myTeams = [] } = useMyBoardTeams(dbUser?.User_ID ?? null);
  if (!dbReady) return null;
  // Opción B: admin/ti_member siempre; cualquiera con ≥1 kanban asignado también.
  if (!canSeeStats(role, myTeams.length > 0)) return <Navigate to="/home" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { dbReady } = useAuth();
  const role = useRole();
  if (!dbReady) return null;
  if (role.role !== 'admin') return <Navigate to="/home" replace />;
  return <>{children}</>;
}

// ─── Overlay de ticket ────────────────────────────────────────────────────────
// Se renderiza ENCIMA de la página de fondo cuando hay backgroundLocation.
// Las rutas aquí NO tienen AppLayout — el modal ya usa position:fixed.

function SolviTicketOverlay() {
  const navigate = useNavigate();
  const location = useLocation();
  const { ticketId } = useParams();
  const state = location.state as { backgroundLocation?: Location } | null;
  const id = Number(ticketId);
  if (!Number.isFinite(id)) return null;
  const close = () => {
    if (state?.backgroundLocation) navigate(-1);
    else navigate('/integracion/solvi/tickets', { replace: true });
  };
  return <SolviTicketModal ticketId={id} onClose={close} />;
}

function TicketOverlayRoutes() {
  return (
    <Routes>
      <Route path="/ticket/:ticketId"                    element={<TicketPage />} />
      <Route path="/board/:equipo/ticket/:ticketId"      element={<TicketPage />} />
      <Route path="/tasks/:equipo/ticket/:ticketId"      element={<TicketPage />} />
      <Route path="/integracion/solvi/tickets/:ticketId" element={<SolviTicketOverlay />} />
    </Routes>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const location = useLocation();
  const state    = location.state as { backgroundLocation?: Location } | null;

  return (
    <>
      {/*
       * Routes principal — cuando hay backgroundLocation, React Router renderiza
       * ESA ubicación (la página de fondo) en lugar de la actual.
       * Así TasksPage / BoardPage se mantienen montados debajo del modal.
       */}
      <Routes location={state?.backgroundLocation || location}>
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
          <Route index element={<Navigate to="/home" replace />} />

          <Route
            path="board/:equipo"
            element={<RequireTI><BoardPage /></RequireTI>}
          />

          {/*
           * Rutas de ticket dentro del layout — activas cuando el usuario entra
           * directamente por un link copiado / bookmark (sin backgroundLocation).
           * El modal queda sobre un AppLayout vacío, que es aceptable para deep links.
           */}
          <Route path="ticket/:ticketId"                 element={<TicketPage />} />
          <Route path="board/:equipo/ticket/:ticketId"   element={<TicketPage />} />
          <Route path="tasks/:equipo/ticket/:ticketId"   element={<TicketPage />} />

          <Route
            path="home"
            element={
              <>
                <ScrollToSection />
                <HomePage />
              </>
            }
          />

          <Route path="new"            element={<NuevaSolicitudPage />} />
          <Route path="integracion/solvi" element={<SolviRequestPage />} />
          <Route path="integracion/solvi/tickets" element={<RequireTI><SolviTicketsPage /></RequireTI>} />
          <Route path="integracion/solvi/tickets/:ticketId" element={<SolviTicketOverlay />} />
          <Route path="my-requests"    element={<MisSolicitudesPage />} />
          <Route path="mis-menciones"  element={<MyMentionsPage />} />
          <Route path="mis-solicitudes" element={<ClientRequestsPage />} />

          <Route path="stats" element={<RequireStats><StatsPage /></RequireStats>} />

          <Route path="requests/team/:equipo" element={<RequireAdmin><TeamRequestsPage /></RequireAdmin>} />
          <Route path="requests"              element={<RequireAdmin><RequestsPage /></RequireAdmin>} />
          <Route path="automations"           element={<RequireAdmin><AutomationsPage /></RequireAdmin>} />
          <Route path="automations/logs"      element={<RequireAdmin><AutomationsPage /></RequireAdmin>} />
          <Route path="prisma"                element={<RequireAdmin><PrismaAdminPage /></RequireAdmin>} />
          <Route path="tasks/:equipo"         element={<RequireTI><TasksPage /></RequireTI>} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/*
       * Overlay modal — solo cuando se navega desde dentro de la app con
       * state.backgroundLocation. Renderiza TicketPage encima de la página activa.
       */}
      {state?.backgroundLocation && <TicketOverlayRoutes />}
    </>
  );
}