import { useBoardStore } from '@/store/boardStore';
import { useBoardEquipo } from '@/features/requests/hooks/useRequests';
import { useMoveRequest } from '@/features/requests/hooks/useMoveRequests';
import { KanbanBoard } from '@/features/requests/components/KanbanBoard';
import { BoardFilters } from '@/features/requests/components/BoardFilters';
import { BoardCustomizationTrigger } from '@/features/requests/components/BoardCustomization';
import { useFilteredBoard } from '@/features/requests/hooks/useFilteredBoard';
import { config } from '@/config';
import type { KanbanColumna } from '@/features/requests/types';

export function BoardPage() {
  const { equipoActivo }             = useBoardStore();
  const { data, isLoading, isError } = useBoardEquipo(equipoActivo);
  const { mutate: mover }            = useMoveRequest(equipoActivo);

  const filteredData = useFilteredBoard(equipoActivo, data);

  function handleMove(id: string, columna: KanbanColumna) {
    mover({ id, columna });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      {/* Barra superior */}
      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        flexWrap:       'wrap',
        gap:            8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <BoardFilters boardId={equipoActivo} />
          <BoardCustomizationTrigger />
        </div>

        {config.USE_MOCK && (
          <span style={{
            fontSize:      10,
            color:         'var(--warn)',
            background:    'rgba(255,165,2,0.08)',
            border:        '1px solid rgba(255,165,2,0.2)',
            borderRadius:  4,
            padding:       '3px 10px',
            letterSpacing: 1,
            textTransform: 'uppercase',
            fontWeight:    600,
            flexShrink:    0,
          }}>
            Modo Demo
          </span>
        )}
      </div>

      {isLoading && !data && (
        <p style={{ color: 'var(--txt-muted)', fontSize: 12 }}>Cargando board…</p>
      )}

      {isError && !config.USE_MOCK && (
        <p style={{ color: 'var(--danger)', fontSize: 12 }}>
          Error al cargar las solicitudes.
        </p>
      )}

      {filteredData && (
        <KanbanBoard board={filteredData} equipo={equipoActivo} onMove={handleMove} />
      )}
    </div>
  );
}