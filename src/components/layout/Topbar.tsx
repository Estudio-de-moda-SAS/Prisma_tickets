import { useAuth } from '@/auth/AuthProvider';
import { useBoardStore } from '@/store/boardStore';
import { EQUIPOS } from '@/features/requests/types';
import { EQUIPO_COLORS } from '@/components/layout/siderbarConstants';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ThemeToggle } from './ThemeToggle';
import { useLocation } from 'react-router-dom';

type TopbarProps = {
  titulo: string;
};

export function Topbar({ titulo }: TopbarProps) {
  const { account }      = useAuth();
  const { equipoActivo } = useBoardStore();
  const { pathname }     = useLocation();

  const hoy = format(new Date(), "EEE d MMM yyyy", { locale: es });

  const initiales = account?.name
    ?.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() ?? 'U';

  const c          = EQUIPO_COLORS[equipoActivo];
  const isBoard    = pathname.startsWith('/board') || pathname === '/';
  // Muestra badge de equipo solo en el board; en home y demás páginas muestra "PRISMA TICKETS"
  const badgeLabel = isBoard ? EQUIPOS[equipoActivo] : 'PRISMA TICKETS';
  const badgeColor = isBoard ? c.dot    : 'var(--accent)';
  const badgeBg    = isBoard ? c.glow   : 'rgba(0,200,255,0.06)';
  const badgeBorder= isBoard ? c.border : 'rgba(0,200,255,0.20)';

  return (
    <header className="topbar">
      <div className="topbar__left">
        <h1 className="topbar__title">{titulo}</h1>

        <div
          className="topbar__status"
          style={{
            background:   badgeBg,
            border:       `1px solid ${badgeBorder}`,
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <span
            className="topbar__status-dot"
            style={{
              background: badgeColor,
              boxShadow:  `0 0 6px ${badgeColor}99`,
            }}
          />
          <span
            className="topbar__status-label"
            style={{ color: badgeColor }}
          >
            {badgeLabel}
          </span>
        </div>
      </div>

      <div className="topbar__right">
        <span className="topbar__date">{hoy}</span>
        <div className="topbar__divider" />
        <ThemeToggle />
        <div className="topbar__divider" />
        <div className="topbar__avatar">{initiales}</div>
      </div>
    </header>
  );
}