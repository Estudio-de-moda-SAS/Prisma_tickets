import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  BarChart2, ChevronDown, Home, LogOut,
  LayoutGrid, Zap, PanelLeftClose, PanelLeftOpen,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useRole } from '@/auth/roles';
import { useBoardStore } from '@/store/boardStore';
import { EQUIPOS } from '@/features/requests/types';
import type { Equipo } from '@/features/requests/types';
import { ConfigPopover } from '@/components/ConfigPopover';
import { EQUIPO_COLORS, EQUIPO_ICONS } from './siderbarConstants';

export function Sidebar() {
  const { account, signOut } = useAuth();
  const role = useRole();
  const { sidebarAbierto, toggleSidebar, equipoActivo, setEquipoActivo } = useBoardStore();
  const navigate = useNavigate();
  const [automatizacionesOpen, setAutomatizacionesOpen] = useState(false);

  const initiales =
    account?.name?.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() ?? 'U';

  const isAdmin  = role.role === 'admin';
  const isMember = role.role === 'member';

  const equiposVisibles = (Object.entries(EQUIPOS) as [Equipo, string][]).filter(([key]) =>
    isAdmin || (isMember && role.team === key)
  );

  function handleEquipo(key: Equipo) {
    setEquipoActivo(key);
    navigate('/');
  }

  function handleHomeEquipo(key: Equipo) {
    navigate(`/home?section=equipo-${key}`);
  }

  const roleLabel =
    isAdmin  ? 'Administrador' :
    isMember ? EQUIPOS[role.team] :
               'Cliente';

  // Helper: renderiza el label de sección o un separador si está colapsado
  function NavLabel({ children, top = false }: { children: string; top?: boolean }) {
    if (sidebarAbierto) {
      return (
        <span className={['sidebar__nav-label', top ? 'sidebar__nav-label--top' : ''].join(' ')}>
          {children}
        </span>
      );
    }
    return <span className={['sidebar__nav-sep', top ? 'sidebar__nav-sep--top' : ''].join(' ')} />;
  }

  return (
    <aside className={['sidebar', sidebarAbierto ? 'sidebar--open' : 'sidebar--collapsed'].join(' ')}>
      <div className="sidebar__accent-line" />

      {/* ── Logo ── */}
      <div className="sidebar__logo">
        <div className="-icon">
          <img src="/favicon.svg" width="38" height="35" alt="Prisma" />
        </div>
        {sidebarAbierto && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <span className="sidebar__logo-title">Prisma</span>
            <span className="sidebar__logo-sub">Support System</span>
          </div>
        )}
      </div>

      <nav className="sidebar__nav">
        <NavLabel>Principal</NavLabel>

        {/* ── INICIO ── */}
        <NavLink
          to="/home"
          className={({ isActive }) =>
            ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
          }
        >
          <Home size={16} />
          {sidebarAbierto && <span>Inicio</span>}
        </NavLink>

        {/* ── ESTADÍSTICAS ── */}
        {(isAdmin || isMember) && (
          <NavLink
            to="/stats"
            className={({ isActive }) =>
              ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
            }
          >
            <BarChart2 size={16} />
            {sidebarAbierto && <span>Estadísticas</span>}
          </NavLink>
        )}

        {/* ── AUTOMATIZACIONES ── */}
        {isAdmin && (
          <>
            <NavLabel top>Automatizaciones</NavLabel>

            {sidebarAbierto ? (
              <div className="sidebar__nav-group">
                <button
                  className="sidebar__nav-item sidebar__nav-item--group-header"
                  onClick={() => setAutomatizacionesOpen((v) => !v)}
                >
                  <Zap size={16} />
                  <span style={{ flex: 1 }}>Automatizaciones</span>
                  <ChevronDown
                    size={12}
                    className={['sidebar__chevron', automatizacionesOpen ? 'sidebar__chevron--open' : ''].join(' ')}
                  />
                </button>
                {automatizacionesOpen && (
                  <div className="sidebar__nav-sub">
                    <NavLink
                      to="/automations"
                      end
                      className={({ isActive }) =>
                        ['sidebar__nav-item sidebar__nav-item--sub', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
                      }
                    >
                      <span className="sidebar__sub-dot" /><span>Todas las reglas</span>
                    </NavLink>
                    <NavLink
                      to="/automations/logs"
                      className={({ isActive }) =>
                        ['sidebar__nav-item sidebar__nav-item--sub', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
                      }
                    >
                      <span className="sidebar__sub-dot" /><span>Historial</span>
                    </NavLink>
                  </div>
                )}
              </div>
            ) : (
              <NavLink
                to="/automations"
                title="Automatizaciones"
                className={({ isActive }) =>
                  ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
                }
              >
                <Zap size={16} />
              </NavLink>
            )}
          </>
        )}

        {/* ── EQUIPOS ── */}
        {(isAdmin || isMember) && equiposVisibles.length > 0 && (
          <>
            <NavLabel top>Equipos</NavLabel>

            {equiposVisibles.map(([key, label]) => {
              const c    = EQUIPO_COLORS[key];
              const ia   = equipoActivo === key;
              const Icon = EQUIPO_ICONS[key];
              return (
                <div key={key} className="sidebar__nav-group">
                  <button
                    onClick={() => handleEquipo(key)}
                    title={sidebarAbierto ? undefined : label}
                    className="sidebar__nav-item sidebar__nav-item--team"
                    style={ia ? { background: c.glow, borderColor: c.border, color: c.dot } : {}}
                  >
                    <Icon
                      size={15}
                      style={{
                        color: ia ? c.dot : undefined,
                        opacity: ia ? 1 : 0.55,
                        flexShrink: 0,
                        transition: 'color 0.12s, opacity 0.12s',
                      }}
                    />
                    {sidebarAbierto && (
                      <span style={{ color: ia ? c.dot : undefined }}>{label}</span>
                    )}
                  </button>

                  {ia && sidebarAbierto && (
                    <div className="sidebar__nav-sub">
                      <NavLink
                        to="/"
                        className={({ isActive: active }) =>
                          ['sidebar__nav-item sidebar__nav-item--sub', active ? 'sidebar__nav-item--active' : ''].join(' ')
                        }
                        style={({ isActive: active }) => active ? { color: c.dot } : {}}
                      >
                        <LayoutGrid size={12} /><span>Board</span>
                      </NavLink>
                      <button
                        onClick={() => handleHomeEquipo(key)}
                        className="sidebar__nav-item sidebar__nav-item--sub"
                      >
                        <span className="sidebar__sub-dot" />
                        <span>Mis solicitudes</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </nav>

      {/* ── Footer ── */}
      <div className="sidebar__footer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <button className="sidebar__toggle-btn" onClick={toggleSidebar}
            title={sidebarAbierto ? 'Contraer panel' : 'Expandir panel'} style={{ flex: 1 }}>
            {sidebarAbierto
              ? <><PanelLeftClose size={14} /><span>Contraer</span></>
              : <PanelLeftOpen size={14} />}
          </button>
          <ConfigPopover />
        </div>
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
  );
}