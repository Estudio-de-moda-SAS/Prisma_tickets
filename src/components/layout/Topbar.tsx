import { useAuth } from '@/auth/AuthProvider';
import { useBoardStore } from '@/store/boardStore';
import { EQUIPOS } from '@/features/requests/types';
import { EQUIPO_COLORS } from '@/components/layout/Sidebar';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

type TopbarProps = {
  titulo: string;
};

export function Topbar({ titulo }: TopbarProps) {
  const { account } = useAuth();
  const { equipoActivo } = useBoardStore();

  const hoy = format(new Date(), "EEE d MMM yyyy", { locale: es });

  const initiales = account?.name
    ?.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() ?? 'U';

  const c = EQUIPO_COLORS[equipoActivo];

  return (
    <header className="topbar">
      <div className="topbar__left">
        <h1 className="topbar__title">{titulo}</h1>

        {/* Badge de equipo con color dinámico */}
        <div
          className="topbar__status"
          style={{
            background:   c.glow,
            border:       `1px solid ${c.border}`,
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <span
            className="topbar__status-dot"
            style={{
              background: c.dot,
              boxShadow:  `0 0 6px ${c.dot}99`,
            }}
          />
          <span
            className="topbar__status-label"
            style={{ color: c.dot }}
          >
            {EQUIPOS[equipoActivo]}
          </span>
        </div>
      </div>

      <div className="topbar__right">
        <span className="topbar__date">{hoy}</span>
        <div className="topbar__divider" />
        <div className="topbar__avatar">{initiales}</div>
      </div>
    </header>
  );
}