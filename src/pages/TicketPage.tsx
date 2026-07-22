// src/pages/TicketPage.tsx
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import type { Location } from 'react-router-dom';import { useTicketResolver } from '@/features/requests/hooks/useTicketResolver';
import { HomeRequestModal } from '@/features/requests/components/HomeRequestModal';
import { RequestModal } from '@/features/requests/components/RequestModal';
import { useBoardStore } from '@/store/boardStore';
import { useMoveRequest } from '@/features/requests/hooks/useMoveRequests';
import { useCloseRequest } from '@/features/requests/hooks/useCloseRequest';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useColumnMap } from '@/features/requests/hooks/useColumnMap';
import { config } from '@/config';
import { EQUIPOS } from '@/features/requests/types';
import type { KanbanColumna, Equipo } from '@/features/requests/types';

const COLUMN_ID_MAP: Record<KanbanColumna, number> = {
  sin_categorizar:  1,
  icebox:           2,
  backlog:          3,
  todo:             4,
  en_progreso:      5,
  en_revision_qas:  8,
  ready_to_deploy:  7,
  hecho:            6,
  historial:        9,
  cliente_review:   10,
};

function Loader() {
  return (
    <div style={{
      position: 'fixed', inset: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(59,130,246,0.04)', zIndex: 300,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: '50%',
        border: '3px solid var(--border-subtle)',
        borderTopColor: 'var(--accent)',
        animation: 'spin 0.7s linear infinite',
      }} />
    </div>
  );
}

function NotFound({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)', zIndex: 300, cursor: 'pointer',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)', border: '1px solid var(--border)',
          borderRadius: 12, padding: '32px 40px',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
          margin: 16, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box',
        }}
      >
        <span style={{ fontSize: 32 }}>🔍</span>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--txt)', fontWeight: 600 }}>
          Ticket no encontrado
        </p>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--txt-muted)' }}>
          El ticket solicitado no existe o no tienes acceso.
        </p>
        <button
          onClick={onClose}
          style={{
            marginTop: 8, padding: '8px 20px', borderRadius: 7,
            background: 'var(--accent-2)', border: 'none',
            color: 'white', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Volver
        </button>
      </div>
    </div>
  );
}

export function TicketPage() {
  const location   = useLocation();
const bgLocation = (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation;
  const { equipo: equipoParam, ticketId } = useParams<{ equipo: string; ticketId: string }>();
  const navigate                          = useNavigate();
  const result                            = useTicketResolver(ticketId);
  const { equipoActivo }                  = useBoardStore();
  const { data: currentUser }             = useCurrentUser();
  const columnMap                         = useColumnMap(config.DEFAULT_BOARD_ID);

// Valida el param de URL igual que en BoardPage
const equipoFromUrl = (equipoParam && equipoParam in EQUIPOS)
  ? (equipoParam as Equipo)
  : undefined;

const equipo: Equipo = result.kind === 'kanban'
  ? (result.request.equipo[0] ?? equipoFromUrl ?? equipoActivo)
  : (equipoFromUrl ?? equipoActivo);
  
  const { mutate: mover }        = useMoveRequest(equipo);
  const { mutate: closeRequest } = useCloseRequest(equipo);

function handleClose() {
  if (bgLocation || window.history.length > 2) {
    navigate(-1);
  } else {
    navigate('/home', { replace: true });
  }
}

  function handleMove(id: string, columna: KanbanColumna) {
    const columnId = columnMap?.[columna];
    if (!columnId && !config.USE_MOCK) return;
    mover({ id, columna, columnId });
  }

  function handleMoveWithClosure(
    id: string,
    columna: KanbanColumna,
    note: string,
    attachments: File[],
  ) {
    if (!currentUser) return;
    closeRequest({
      requestId:      id,
      closedBy:       currentUser.User_ID,
      closureNote:    note,
      targetColumnId: COLUMN_ID_MAP[columna],
      attachments,
    });
  }

  if (result.kind === 'loading')   return <Loader />;
  if (result.kind === 'not_found') return <NotFound onClose={handleClose} />;

  if (result.kind === 'home') {
    return (
      <HomeRequestModal
        request={result.request}
        onClose={handleClose}
      />
    );
  }

  return (
    <RequestModal
      request={result.request}
      equipo={equipo}
      onClose={handleClose}
      onMove={handleMove}
      onMoveWithClosure={handleMoveWithClosure}
      onOpenRequest={(id) => navigate(`/board/${equipo}/ticket/${id}`, { replace: true })}
    />
  );
}