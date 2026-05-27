// src/pages/TicketPage.tsx
//
// Este componente se usa SOLO cuando alguien llega directo a /ticket/:ticketId
// (link compartido, pestaña nueva). Renderiza el modal con position:fixed
// sobre el layout existente — el board o home siguen montados debajo.
//
// Cuando el modal se abre desde KanbanBoard u HomePage, NO se usa este componente:
// esos componentes actualizan la URL con history.replaceState y manejan
// su propio estado de modal internamente.

import { useParams, useNavigate } from 'react-router-dom';
import { useTicketResolver } from '@/features/requests/hooks/useTicketResolver';
import { HomeRequestModal } from '@/features/requests/components/HomeRequestModal';
import { RequestModal } from '@/features/requests/components/RequestModal';
import { useBoardStore } from '@/store/boardStore';
import { useMoveRequest } from '@/features/requests/hooks/useMoveRequests';
import { useCloseRequest } from '@/features/requests/hooks/useCloseRequest';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useColumnMap } from '@/features/requests/hooks/useColumnMap';
import { config } from '@/config';
import type { KanbanColumna } from '@/features/requests/types';

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
      background: 'rgba(0,0,0,0.55)', zIndex: 300,
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
  const { ticketId }           = useParams<{ ticketId: string }>();
  const navigate               = useNavigate();
  const result                 = useTicketResolver(ticketId);
  const { equipoActivo }       = useBoardStore();
  const { data: currentUser }  = useCurrentUser();
  const columnMap              = useColumnMap(config.DEFAULT_BOARD_ID);

  const equipo = result.kind === 'kanban'
    ? (result.request.equipo[0] ?? equipoActivo)
    : equipoActivo;

  const { mutate: mover }        = useMoveRequest(equipo);
  const { mutate: closeRequest } = useCloseRequest(equipo);

  // Al cerrar: volver a la página anterior del historial.
  // Si no hay historial (link directo), ir a /home.
  function handleClose() {
    if (window.history.length > 2) {
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

  // Estos estados son transitorios — TicketPage solo existe para
  // links directos, no para la navegación normal dentro de la app.
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
      onOpenRequest={(id) => navigate(`/ticket/${id}`, { replace: true })}
    />
  );
}