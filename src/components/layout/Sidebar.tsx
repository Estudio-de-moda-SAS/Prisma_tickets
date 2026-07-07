// src/components/layout/Sidebar.tsx
import { useState } from 'react';
import { NavLink, useNavigate, useMatch } from 'react-router-dom';
import {
  BarChart2, Home, LogOut, Plus, Star,
  LayoutGrid, LayoutList, Zap, PanelLeftClose, PanelLeftOpen, Shield, ClipboardList
} from 'lucide-react';

import { useAuth } from '@/auth/AuthProvider';
import { useRole, canSeeBoard, canSeeConfig, canSeeStats, canSeeAutomations } from '@/auth/roles';
import { useBoardStore } from '@/store/boardStore';
import { ConfigPanelTrigger } from '@/components/ConfigPanel';
import { useBoardTeams } from '@/features/requests/hooks/useBoardMetadata';
import { teamSidebarColors, getTeamIcon } from './siderbarConstants';
import { config } from '@/config';
import { SatisfactionModal } from './SatisfactionModal';

export function Sidebar() {
  const { account, signOut } = useAuth();
  const role = useRole();

const {
  sidebarAbierto,
  toggleSidebar,
  setEquipoActivo,
} = useBoardStore();

const boardMatch        = useMatch('/board/:equipo');
const tasksMatch        = useMatch('/tasks/:equipo');
const teamReqMatch      = useMatch('/requests/team/:equipo');
const activeTeamKey     = boardMatch?.params?.equipo
                       ?? tasksMatch?.params?.equipo
                       ?? teamReqMatch?.params?.equipo;
  const navigate = useNavigate();
  const [automatizacionesOpen, setAutomatizacionesOpen] = useState(false);
  const [satisfactionOpen,     setSatisfactionOpen]     = useState(false);
  const [teamSubOpen, setTeamSubOpen] = useState(true);

  const isAdmin       = role.role === 'admin';
  const isTIMember    = role.role === 'ti_member';
  const isRegularUser = !isAdmin && !isTIMember;
  const showBoard     = canSeeBoard(role);
  const showConfig    = canSeeConfig(role);
  const showStats     = canSeeStats(role);
  const showAuto      = canSeeAutomations(role);

  const initiales =
    account?.name
      ?.split(' ')
      .slice(0, 2)
      .map((n) => n[0])
      .join('')
      .toUpperCase() ?? 'U';

  const { data: boardTeams = [] } = useBoardTeams(config.DEFAULT_BOARD_ID);
  const equiposVisibles = (isAdmin || isTIMember)
    ? boardTeams.filter((t) => isAdmin || !t.Board_Team_Is_Admin_Only)
    : [];
  
function handleEquipo(key: string) {
  if (activeTeamKey === key) {
    setTeamSubOpen(v => !v);   // ya estamos en este board → solo colapsa/expande
  } else {
    setEquipoActivo(key);
    navigate(`/board/${key}`);
    setTeamSubOpen(true);
  }
}

  const roleLabel = isAdmin
    ? 'Administrador'
    : isTIMember
      ? 'TI'
      : 'Usuario';

  function NavLabel({ children, top = false }: { children: string; top?: boolean }) {
    if (sidebarAbierto) {
      return (
        <span className={['sidebar__nav-label', top ? 'sidebar__nav-label--top' : ''].join(' ')}>
          {children}
        </span>
      );
    }
    return (
      <span className={['sidebar__nav-sep', top ? 'sidebar__nav-sep--top' : ''].join(' ')} />
    );
  }

  return (
    <>
      <aside className={['sidebar', sidebarAbierto ? 'sidebar--open' : 'sidebar--collapsed'].join(' ')}>
        <div className="sidebar__accent-line" />

        {/* ── Logo ── */}
        <div className="sidebar__logo">
          <div className="-icon">
            <img src="/favicon.svg" width="40" height="35" alt="Prisma" />
          </div>
          {sidebarAbierto && (
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="sidebar__logo-title">Prisma</span>
              <span className="sidebar__logo-sub">Support System</span>
            </div>
          )}
        </div>

        <nav className="sidebar__nav">
          {/* ── INICIO ── */}
          <NavLink
            to="/home"
            className={({ isActive }) =>
              ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
            }
          >
            <Home size={16} />
            {sidebarAbierto && <span>Home</span>}
          </NavLink>

          {/* ── NUEVA SOLICITUD (usuarios regulares) ── */}
          {isRegularUser && (
            <NavLink
              to="/new"
              title={sidebarAbierto ? undefined : 'Nueva Solicitud'}
              className={({ isActive }) =>
                ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
              }
            >
              <Plus size={16} />
              {sidebarAbierto && <span>Nueva Solicitud</span>}
            </NavLink>
          )}

          {/* ── MIS SOLICITUDES (usuarios regulares) ── */}
            <NavLink
              to="/mis-solicitudes"
              title={sidebarAbierto ? undefined : 'Mis Solicitudes'}
              className={({ isActive }) =>
                ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
              }
            >
              <ClipboardList size={16} />
              {sidebarAbierto && <span>Mis Solicitudes</span>}
            </NavLink>



          {/* ── EQUIPOS ── */}
          {showBoard && equiposVisibles.length > 0 && (
            <>
              <NavLabel top>Equipos</NavLabel>

              {equiposVisibles.map((team) => {
                const key   = team.Board_Team_Code;
                const label = team.Board_Team_Name;
                const c     = teamSidebarColors(team.Board_Team_Color);
const ia = activeTeamKey === key;
                const Icon = getTeamIcon(team.Board_Team_Icon);

                return (
                  <div key={key} className="sidebar__nav-group">
                    <button
                      onClick={() => handleEquipo(key)}
                      title={sidebarAbierto ? undefined : label}
                      className="sidebar__nav-item sidebar__nav-item--team"
                      style={ia ? { background: c.glow, borderColor: c.border, color: c.dot } : {}}
                    >
                      <Icon size={15} style={{ opacity: ia ? 1 : 0.55, flexShrink: 0, transition: 'opacity 0.12s' }} />
                      {sidebarAbierto && (
                        <span style={{ color: ia ? c.dot : undefined }}>{label}</span>
                      )}
                    </button>
                                        {ia && sidebarAbierto && teamSubOpen && (
                      <div
                        className="sidebar__nav-sub sidebar__nav-sub--team"
                        style={{
                          '--team-color':  c.dot,
                          '--team-glow':   c.glow,
                          '--team-border': c.border,
                        } as React.CSSProperties}
                      >
                        <NavLink
                          to={`/board/${key}`} // ← CAMBIO: era to="/" end
                          end
                          className={({ isActive: active }) =>
                            ['sidebar__nav-item sidebar__nav-item--sub', active ? 'sidebar__nav-item--active' : ''].join(' ')
                          }
                        >
                          <LayoutGrid size={12} />
                          <span>Board</span>
                        </NavLink>

<NavLink
  to={`/tasks/${key}`}
  className={({ isActive: active }) =>
    ['sidebar__nav-item sidebar__nav-item--sub', active ? 'sidebar__nav-item--active' : ''].join(' ')
  }
>
  <LayoutList size={12} />
  <span>Listado de Tareas</span>
</NavLink>

                        <NavLink
                          to={`/requests/team/${key}`}
                          className={({ isActive: active }) =>
                            ['sidebar__nav-item sidebar__nav-item--sub', active ? 'sidebar__nav-item--active' : ''].join(' ')
                          }
                        >
                          <ClipboardList size={12} />
                          <span>Mis solicitudes</span>
                        </NavLink>
                      </div>
                    )}
                  </div>
                );
              })}
              <NavLabel> </NavLabel>
              <NavLabel>Usuario</NavLabel>

              {/* ── ESTADÍSTICAS ── */}
              {showStats && (
                <NavLink
                  to="/stats"
                  className={({ isActive }) =>
                    ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
                  }
                >
                  <BarChart2 size={16} />
                  {sidebarAbierto && <span>Dashboard</span>}
                </NavLink>
              )}

              {/* ── AUTOMATIZACIONES ── */}
              {showAuto && (
                <>
                  {sidebarAbierto ? (
                    <div className="sidebar__nav-group">
                      <button
                        className="sidebar__nav-item sidebar__nav-item--group-header"
                        onClick={() => setAutomatizacionesOpen((v) => !v)}
                      >
                        <Zap size={16} />
                        <span style={{ flex: 1 }}>Automatizaciones</span>
                        <span
                          className={['sidebar__chevron', automatizacionesOpen ? 'sidebar__chevron--open' : ''].join(' ')}
                        />
                      </button>

                      {automatizacionesOpen && (
                        <div className="sidebar__nav-sub">
                          <NavLink to="/automations" end
                            className={({ isActive }) =>
                              ['sidebar__nav-item sidebar__nav-item--sub', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
                            }
                          >
                            <span  />
                            <span>Reglas</span>
                          </NavLink>
                        </div>
                      )}
                    </div>
                  ) : (
                    <NavLink to="/automations" title="Automatizaciones"
                      className={({ isActive }) =>
                        ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
                      }
                    >
                      <Zap size={16} />
                    </NavLink>
                  )}
                </>
              )}
            </>
          )}

          {/* ── PRISMA ADMIN (solo admin) ── */}
          {isAdmin && (
            <>
              <NavLabel>PRISMA</NavLabel>
              <NavLink
                to="/prisma"
                title={sidebarAbierto ? undefined : 'PRISMA Admin'}
                className={({ isActive }) =>
                  ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
                }
              >
                <Shield size={16} />
                {sidebarAbierto && <span>Bugs/Feedback</span>}
              </NavLink>
            </>
          )}
        </nav>

        {/* ── Footer ── */}
        <div className="sidebar__footer">
          {sidebarAbierto ? (
            <>
              <button
                className="sidebar__satisfaction-btn"
                onClick={() => setSatisfactionOpen(true)}
                title="Califica tu experiencia con PRISMA"
              >
                <Star size={13} />
                <span>Califícanos</span>
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <button className="sidebar__toggle-btn" onClick={toggleSidebar} title="Contraer panel" style={{ flex: 1 }}>
                  <PanelLeftClose size={14} />
                  <span>Contraer</span>
                </button>
                {showConfig && <ConfigPanelTrigger />}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <button
                className="sidebar__satisfaction-btn"
                onClick={() => setSatisfactionOpen(true)}
                title="Tu opinión"
                style={{ width: '100%' }}
              >
                <Star size={14} />
              </button>

              <button className="sidebar__toggle-btn" onClick={toggleSidebar} title="Expandir panel" style={{ flex: 1, width: '100%' }}>
                <PanelLeftOpen size={14} />
              </button>
              {showConfig && <ConfigPanelTrigger />}
            </div>
          )}

          {sidebarAbierto ? (
            <div className="sidebar__user">
              <div className="sidebar__avatar">{initiales}</div>
              <div className="sidebar__user-info">
                <span className="sidebar__user-name">{account?.name ?? 'Usuario'}</span>
                <span className="sidebar__user-role">{roleLabel}</span>
              </div>
              <button onClick={signOut} className="sidebar__logout-btn" title="Cerrar sesión">
                <LogOut size={14} />
              </button>
            </div>
          ) : (
            <button onClick={signOut} className="sidebar__nav-item" title="Cerrar sesión">
              <LogOut size={16} />
            </button>
          )}
        </div>
      </aside>

      {satisfactionOpen && <SatisfactionModal onClose={() => setSatisfactionOpen(false)} />}
    </>
  );
}