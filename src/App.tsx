import * as React from "react";
import "./App.css";
import HomeIcon from "./assets/home.svg";
import addIcon from "./assets/add.svg";
import seeTickets from "./assets/tickets.svg";
import settingsIcon from "./assets/settings.svg";
import templateIcon from "./assets/template.svg";
import type { TicketsService } from "./services/Tickets.service";
import type { UsuariosSPService } from "./services/Usuarios.service";
import type { LogService } from "./services/Logs.service";
import DashBoardPage from "./Components/DashBoard/DashboardPage";
import NuevoTicketForm from "./Components/NuevoTicket/NuevoTicket";
import type { User } from "./Models/Usuarios";
import { AuthProvider, useAuth } from "./Auth/authContext";
import Welcome from "./Components/Welcome/Welcome";
import { useUserRole } from "./Funcionalidades/Usuarios";
import { GraphServicesProvider, useGraphServices } from "./graph/GrapServicesContext";
import { useTheme } from "./Funcionalidades/Theme";
import { logout } from "./Auth/msal";
import TablaTickets from "./Components/Tickets/Tickets";
import CrearPlantilla from "./Components/NuevaPlantilla/NuevaPlantilla";
import { Sidebar } from "./Components/Sidebar/Sidebar";

/* ============================================================
   Tipos de navegación y contexto de visibilidad
   ============================================================ */

type RenderCtx = { services?: { Tickets: TicketsService; Usuarios: UsuariosSPService; Logs: LogService } };

type Services = { Tickets: TicketsService; Usuarios: UsuariosSPService; Logs: LogService };

export type MenuItem = {
  id: string;
  label: string;
  icon?: React.ReactNode;
  to?: React.ReactNode | ((ctx: RenderCtx) => React.ReactNode);
  children?: MenuItem[];
  roles?: string[];
  flags?: string[];
  when?: (ctx: NavContext) => boolean;
  /** Si true, al seleccionarlo el sidebar se colapsa automáticamente */
  autocollapse?: boolean;
};

export type NavContext = {
  role: string;
  flags?: Set<string>;
  hasService?: (k: keyof Services) => boolean;
};

/* ============================================================
   Árbol único de navegación con reglas de visibilidad
   ============================================================ */

const NAV: MenuItem[] = [
  { id: "home", label: "Home", icon: <img src={HomeIcon} alt="" className="sb-icon" />, to: <DashBoardPage />, roles: ["Administrador", "Tecnico", "Listo"], autocollapse: true },
  { id: "ticketform", label: "Nuevo Ticket", icon: <img src={addIcon} alt="" className="sb-icon" />, to: () => <NuevoTicketForm />, },
  { id: "ticketTable", label: "Ver Tickets", icon: <img src={seeTickets} alt="" className="sb-icon" />, to: <TablaTickets />, autocollapse: true },
  { id: "admin", label: "Administración", icon: <img src={settingsIcon} className="sb-icon" />, roles: ["Administrador", "Tecnico", "Listo"], children: [
      { id: "plantillas", label: "Plantillas", icon: <img src={templateIcon} className="sb-icon" />, to: <CrearPlantilla />, roles: ["Administrador", "Tecnico", "Listo"] },
    ],
  },
];

/* ============================================================
   Utilidades de árbol: filtrado, búsqueda y primera hoja
   ============================================================ */

// Aplica reglas de visibilidad a un nodo
function isVisible(node: MenuItem, ctx: NavContext): boolean {
  if (node.roles && !node.roles.includes(ctx.role)) return false;
  if (node.flags && node.flags.some((f) => !ctx.flags?.has(f))) return false;
  if (node.when && !node.when(ctx)) return false;
  return true;
}

// Devuelve el árbol filtrado (oculta carpetas sin hijos visibles)
function filterNavTree(nodes: readonly MenuItem[], ctx: NavContext): MenuItem[] {
  return nodes
    .map((n) => {
      const children = n.children ? filterNavTree(n.children, ctx) : undefined;
      const self = isVisible(n, ctx);
      if (children && children.length === 0 && !self) return null;
      if (!self && !children) return null;
      return { ...n, children };
    })
    .filter(Boolean) as MenuItem[];
}

// Primer leaf para selección inicial
function firstLeafId(nodes: readonly MenuItem[]): string {
  const pick = (n: MenuItem): string => (n.children?.length ? pick(n.children[0]) : n.id);
  return nodes.length ? pick(nodes[0]) : "";
}

// Busca un ítem por id
function findById(nodes: readonly MenuItem[], id: string): MenuItem | undefined {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const hit = findById(n.children, id);
      if (hit) return hit;
    }
  }
  return undefined;
}

/* ============================================================
   Shell: controla autenticación básica y muestra LoggedApp
   ============================================================ */

function Shell() {
  const { ready, account, signIn, signOut } = useAuth();
  const [loadingAuth, setLoadingAuth] = React.useState(false);

  // mapea la cuenta MSAL a tipo User para el header
  const user: User = account ? { displayName: account.name ?? account.username ?? "Usuario", mail: account.username ?? "", jobTitle: "" } : null;

  const isLogged = Boolean(account);

  const handleAuthClick = async () => {
    if (!ready || loadingAuth) return;
    setLoadingAuth(true);
    try {
      if (isLogged) await signOut();
      else await signIn("popup");
    } finally {
      setLoadingAuth(false);
    }
  };

  // estado no logueado: solo header con botón de acción
  if (!ready || !isLogged) {
    return (
      <div className="page layout">
        <section className="page-view">
          <Welcome onLogin={handleAuthClick}/>
        </section>
      </div>
    );
  }

  // estado logueado
  return <LoggedApp user={user as User} />;
}

/* ============================================================
   LoggedApp: calcula árbol visible y renderiza el contenido
   ============================================================ */

function LoggedApp({ user }: { user: User }) {
  const { role, changeUser } = useUserRole(user!.mail);
  const services = useGraphServices() ;
  const { theme, toggle } = useTheme();

  const navCtx = React.useMemo<NavContext>(() => {
    const safeRole: string = role === "Administrador" || role === "Tecnico" || role === "Jefe de zona" || role === "Usuario" ? (role as string) : "Usuario";
    return {
      role: safeRole,
      flags: new Set<string>([]),
      hasService: (k) => {
        if (k === "Usuarios") return Boolean(services?.Usuarios);
        if (k === "Tickets") return Boolean(services?.Tickets);
        if (k === "Logs") return Boolean(services?.Logs);
        return false;
      },
    };
  }, [role, services]);

  const navs = React.useMemo(() => filterNavTree(NAV, navCtx), [navCtx]);

  const [selected, setSelected] = React.useState<string>(() => firstLeafId(navs));

  React.useEffect(() => {
    if (!findById(navs, selected)) setSelected(firstLeafId(navs));
  }, [navs, selected]);

  const item = React.useMemo(() => findById(navs, selected), [navs, selected]);
  const element = React.useMemo(() => {
    if (!item) return null;
    if (typeof item.to === "function") {
      return (item.to as (ctx: RenderCtx) => React.ReactNode)({ services });
    }
    return item.to ?? null;
  }, [item, services]);

  // === NEW: sidebar plegable (con persistencia simple)
  const [collapsed, setCollapsed] = React.useState<boolean>(() => {
    try {
      return localStorage.getItem("sb-collapsed") === "1";
    } catch {
      return false;
    }
  });

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem("sb-collapsed", next ? "1" : "0");
      } catch {}
      return next;
    });
  }, []);

  const handleSelect = React.useCallback(
    (id: string) => {
      setSelected(id);
      const it = findById(navs, id);
      if (!it) return;

      // regla: si el ítem tiene autocollapse, colapsa.
      // (Opcional) Solo en pantallas pequeñas:
      const isNarrow = typeof window !== "undefined" && window.innerWidth < 1100;

      if (it.autocollapse && (isNarrow || true /* quita esto si quieres sólo en móvil */)) {
        setCollapsed(true);
        try {
          localStorage.setItem("sb-collapsed", "1");
        } catch {}
      }
    },
    [navs]
  );

  return (
    <div className={`page layout layout--withSidebar ${collapsed ? "is-collapsed" : ""}`}>
      <Sidebar navs={navs} selected={selected} onSelect={handleSelect} user={user} role={role} collapsed={collapsed} onToggle={toggleCollapsed} />
      <main className="content content--withSidebar">
        <div className="page-viewport">
            <div className="content-toolbar" role="toolbar" aria-label="Acciones de vista">
              <button className="btn btn-transparent-final btn-s" onClick={toggle} aria-label={`Cambiar a modo ${theme === "dark" ? "claro" : "oscuro"}`} aria-pressed={theme === "dark"} title={theme === "dark" ? "Modo oscuro activado" : "Modo claro activado"}>
                <span className="" aria-hidden="true">
                  {theme === "dark" ? "🌙" : "☀️"}
                </span>
              </button>
              {(user?.mail === "cesanchez@estudiodemoda.com.co" || user?.mail === "dpalacios@estudiodemoda.com.co") &&
                <button className="btn btn-transparent-final btn-m" onClick={() => changeUser()} aria-label="Cambiar de rol">
                  <span>Cambiar de rol</span>
                </button>
              }
              <button className="btn btn-transparent-final btn-s" onClick={() => logout()} aria-label="Cerrar sesión">
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                  <path d="M10 17l-1.4-1.4 3.6-3.6-3.6-3.6L10 7l5 5-5 5zM4 19h8v2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8v2H4v14z" fill="currentColor"/>
                </svg>
                <span>Salir</span>
              </button>
            </div>
            <div className="page page--fluid">{element}</div>
        </div>

      </main>

      {/* Modal de anuncio del día */}
    </div>
  );
}
/* ============================================================
   App root y gate de servicios
   ============================================================ */

export default function App() {
  return (
    <AuthProvider>
      <GraphServicesGate>
        <Shell />
      </GraphServicesGate>
    </AuthProvider>
  );
}

// Provee GraphServices solo si hay sesión iniciada
function GraphServicesGate({ children }: { children: React.ReactNode }) {
  const { ready, account } = useAuth();
  if (!ready || !account) return <>{children}</>;
  return <GraphServicesProvider>{children}</GraphServicesProvider>;
}
