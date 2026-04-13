import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Plus,
  List,
  BarChart2,
  ChevronDown,
  LogOut,
  LayoutGrid,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
  Code2,
  Users,
  Server,
  LineChart,
} from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useBoardStore } from '@/store/boardStore';
import { EQUIPOS } from '@/features/requests/types';
import type { Equipo } from '@/features/requests/types';
import { ConfigPopover } from '@/components/ConfigPopover';

export const EQUIPO_COLORS: Record<Equipo, { dot: string; glow: string; border: string }> = {
  desarrollo: { dot: '#378ADD', glow: 'rgba(55,138,221,0.12)',  border: 'rgba(55,138,221,0.30)'  },
  crm:        { dot: '#1D9E75', glow: 'rgba(29,158,117,0.12)',  border: 'rgba(29,158,117,0.30)'  },
  sistemas:   { dot: '#EF9F27', glow: 'rgba(239,159,39,0.12)',  border: 'rgba(239,159,39,0.30)'  },
  analisis:   { dot: '#7F77DD', glow: 'rgba(127,119,221,0.12)', border: 'rgba(127,119,221,0.30)' },
};

const EQUIPO_ICONS: Record<Equipo, React.ElementType> = {
  desarrollo: Code2,
  crm:        Users,
  sistemas:   Server,
  analisis:   LineChart,
};

export function Sidebar() {
  const { account, signOut } = useAuth();
  const { sidebarAbierto, toggleSidebar, equipoActivo, setEquipoActivo } = useBoardStore();
  const navigate = useNavigate();
  const [solicitudesOpen,      setSolicitudesOpen]      = useState(false);
  const [automatizacionesOpen, setAutomatizacionesOpen] = useState(false);

  const initiales =
    account?.name?.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() ?? 'U';

  function handleEquipo(key: Equipo) {
    setEquipoActivo(key);
    navigate('/');
  }

  return (
    <aside className={['sidebar', sidebarAbierto ? 'sidebar--open' : 'sidebar--collapsed'].join(' ')}>
      <div className="sidebar__accent-line" />

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
        {sidebarAbierto && <span className="sidebar__nav-label">Principal</span>}

        <NavLink
          to="/new"
          end
          className={({ isActive }) =>
            ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
          }
        >
          <Plus size={16} />
          {sidebarAbierto && <span>Nueva Solicitud</span>}
        </NavLink>

        {sidebarAbierto ? (
          <div className="sidebar__nav-group">
            <button
              className="sidebar__nav-item sidebar__nav-item--group-header"
              onClick={() => setSolicitudesOpen((v) => !v)}
            >
              <List size={16} />
              <span style={{ flex: 1 }}>Solicitudes</span>
              <ChevronDown
                size={12}
                className={['sidebar__chevron', solicitudesOpen ? 'sidebar__chevron--open' : ''].join(' ')}
              />
            </button>
            {solicitudesOpen && (
              <div className="sidebar__nav-sub">
                <NavLink
                  to="/my-requests"
                  className={({ isActive }) =>
                    ['sidebar__nav-item sidebar__nav-item--sub', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
                  }
                >
                  <span className="sidebar__sub-dot" /><span>Mis solicitudes</span>
                </NavLink>
                <NavLink
                  to="/requests"
                  className={({ isActive }) =>
                    ['sidebar__nav-item sidebar__nav-item--sub', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
                  }
                >
                  <span className="sidebar__sub-dot" /><span>Todas las solicitudes</span>
                </NavLink>
              </div>
            )}
          </div>
        ) : (
          <NavLink
            to="/requests"
            title="Solicitudes"
            className={({ isActive }) =>
              ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
            }
          >
            <List size={16} />
          </NavLink>
        )}

        <NavLink
          to="/stats"
          className={({ isActive }) =>
            ['sidebar__nav-item', isActive ? 'sidebar__nav-item--active' : ''].join(' ')
          }
        >
          <BarChart2 size={16} />
          {sidebarAbierto && <span>Estadísticas</span>}
        </NavLink>

        {sidebarAbierto && (
          <span className="sidebar__nav-label sidebar__nav-label--top">Automatizaciones</span>
        )}

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

        {sidebarAbierto && (
          <span className="sidebar__nav-label sidebar__nav-label--top">Equipos</span>
        )}

        {(Object.entries(EQUIPOS) as [Equipo, string][]).map(([key, label]) => {
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
                  style={{ color: ia ? c.dot : undefined, opacity: ia ? 1 : 0.55, flexShrink: 0, transition: 'color 0.12s, opacity 0.12s' }}
                />
                {sidebarAbierto && (
                  <span style={{ color: ia ? c.dot : undefined }}>{label}</span>
                )}
              </button>

              {ia && sidebarAbierto && (
                <div className="sidebar__nav-sub">
                  <NavLink
                    to="/"
                    end
                    className={({ isActive: active }) =>
                      ['sidebar__nav-item sidebar__nav-item--sub', active ? 'sidebar__nav-item--active' : ''].join(' ')
                    }
                    style={({ isActive: active }) => active ? { color: c.dot } : {}}
                  >
                    <LayoutGrid size={12} /><span>Board</span>
                  </NavLink>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="sidebar__footer">
        {/* Fila: toggle + config */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <button
            className="sidebar__toggle-btn"
            onClick={toggleSidebar}
            title={sidebarAbierto ? 'Contraer panel' : 'Expandir panel'}
            style={{ flex: 1 }}
          >
            {sidebarAbierto
              ? <><PanelLeftClose size={14} /><span>Contraer</span></>
              : <PanelLeftOpen size={14} />
            }
          </button>

          {/* Botón de configuración — abre el popover de categorías y equipos */}
          <ConfigPopover />
        </div>

        {sidebarAbierto ? (
          <div className="sidebar__user">
            <div className="sidebar__avatar">{initiales}</div>
            <div className="sidebar__user-info">
              <span className="sidebar__user-name">{account?.name ?? 'Usuario'}</span>
              <span className="sidebar__user-role">Administrador</span>
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