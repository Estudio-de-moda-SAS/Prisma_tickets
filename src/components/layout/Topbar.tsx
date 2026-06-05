import { useState } from 'react';
import { useAuth } from '@/auth/AuthProvider';
import { useBoardStore } from '@/store/boardStore';
import { EQUIPOS } from '@/features/requests/types';
import { EQUIPO_COLORS } from '@/components/layout/siderbarConstants';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import { NotificationBell } from './NotificationBell';
import { BugReportModal } from './BugReportModal';
import { useLocation } from 'react-router-dom';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { Bug } from 'lucide-react';

// ─── Controla qué roles ven el botón de reportar fallo ───────────────────────
// 'all' | 'admin' | 'ti' — cambia en una línea
const BUG_REPORT_VISIBLE_TO: 'all' | 'admin' | 'ti' = 'all';
// ─────────────────────────────────────────────────────────────────────────────

type TopbarProps = { titulo: string };

export function Topbar({ titulo }: TopbarProps) {
  const { account }      = useAuth();
  const { equipoActivo } = useBoardStore();
  const { pathname }     = useLocation();
  const { data: currentUser } = useCurrentUser();

  const [bugOpen, setBugOpen] = useState(false);

  const hoy = format(new Date(), "EEE d MMM yyyy", { locale: es });

  const initiales = account?.name
    ?.split(' ').slice(0, 2).map((n) => n[0]).join('').toUpperCase() ?? 'U';

  const c           = EQUIPO_COLORS[equipoActivo];
  const isBoard     = pathname.startsWith('/board') || pathname === '/';
  const badgeLabel  = isBoard ? EQUIPOS[equipoActivo] : 'PRISMA TICKETS';
  const badgeColor  = isBoard ? c.dot    : 'var(--accent)';
  const badgeBg     = isBoard ? c.glow   : 'rgba(0,200,255,0.06)';
  const badgeBorder = isBoard ? c.border : 'rgba(0,200,255,0.20)';

  const role = currentUser?.User_Role ?? 'member';
  const showBugBtn =
    BUG_REPORT_VISIBLE_TO === 'all'  ? true :
    BUG_REPORT_VISIBLE_TO === 'admin' ? role === 'admin' :
    BUG_REPORT_VISIBLE_TO === 'ti'   ? role === 'admin' || role === 'ti_member' :
    true;

  return (
    <>
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
              style={{ background: badgeColor, boxShadow: `0 0 6px ${badgeColor}99` }}
            />
            <span className="topbar__status-label" style={{ color: badgeColor }}>
              {badgeLabel}
            </span>
          </div>
        </div>

        <div className="topbar__right">
          <span className="topbar__date">{hoy}</span>
          <div className="topbar__divider" />

          {showBugBtn && (
            <>
              <button
                className="topbar__bug-btn"
                onClick={() => setBugOpen(true)}
                title="Reportar un fallo del sistema"
              >
                <Bug size={13} />
                <span>Reportar fallo</span>
              </button>
              <div className="topbar__divider" />
            </>
          )}

          <NotificationBell userId={currentUser?.User_ID ?? null} />
          {/* El modo oscuro necesita cambios en el sidebar
          import { ThemeToggle } from './ThemeToggle'; //este arriba con los demas imports
          <div className="topbar__divider" />
          <ThemeToggle />
          */}
          <div className="topbar__divider" />
          <div className="topbar__avatar">{initiales}</div>
        </div>
      </header>

      {bugOpen && <BugReportModal onClose={() => setBugOpen(false)} />}
    </>
  );
}