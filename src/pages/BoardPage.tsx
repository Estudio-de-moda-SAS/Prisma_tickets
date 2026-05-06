import { useMemo, useState } from 'react';
import { useBoardStore } from '@/store/boardStore';
import { useBoardEquipo } from '@/features/requests/hooks/useRequests';
import { useMoveRequest } from '@/features/requests/hooks/useMoveRequests';
import { useColumnMap } from '@/features/requests/hooks/useColumnMap';
import { useUsers } from '@/features/requests/hooks/useUsers';
import { useSubTeams } from '@/features/requests/hooks/useSubTeams';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { useQuery } from '@tanstack/react-query';
import { KanbanBoard } from '@/features/requests/components/KanbanBoard';
import { BoardFilters, type FilterDynamicOptions } from '@/features/requests/components/BoardFilters';
import { BoardCustomizationTrigger } from '@/features/requests/components/BoardCustomization';
import { useFilteredBoard } from '@/features/requests/hooks/useFilteredBoard';
import { config } from '@/config';
import type { KanbanColumna, Request } from '@/features/requests/types';
import KanbanSkeleton from '@/features/requests/components/KanbanSkeleton';

export function BoardPage() {
  const { equipoActivo }             = useBoardStore();
  const { data, isLoading, isError } = useBoardEquipo(equipoActivo);
  const { mutate: mover }            = useMoveRequest(equipoActivo);
  const columnMap                    = useColumnMap(config.DEFAULT_BOARD_ID);
  const { Requests }                 = useGraphServices();

  // ID de la request que se quiere abrir pero no está en el board actual
  const [externalModalId, setExternalModalId] = useState<string | null>(null);

  const boardTeamId = useMemo(() => {
    const first = Object.values(data ?? {}).flat()[0];
    return first?.boardTeamId ?? null;
  }, [data]);

  const { data: users    = [] } = useUsers();
  const { data: subTeams = [] } = useSubTeams(boardTeamId);

  // Fetch de request externa (hija de otro equipo o padre no visible en board)
  const { data: externalRequest } = useQuery<Request>({
    queryKey: ['request', externalModalId],
    queryFn:  () => Requests.fetchById(Number(externalModalId)),
    enabled:  !!externalModalId && !config.USE_MOCK && (() => {
      // Solo fetcha si la request no está ya en el board local
      const inBoard = Object.values(data ?? {}).flat().some((r) => r.id === externalModalId);
      return !inBoard;
    })(),
    staleTime: 0,
    retry: 1,
  });

  const dynamicOptions = useMemo((): FilterDynamicOptions => {
    const allRequests = Object.values(data ?? {}).flat();

    const categoriaSet = new Set<string>();
    for (const r of allRequests) {
      for (const cat of r.categoria ?? []) {
        if (cat) categoriaSet.add(cat);
      }
    }

    return {
      assignee: users.map((u) => ({
        value: u.User_Name,
        label: u.User_Name,
      })),
      subequipo: subTeams.map((s) => ({
        value: s.Sub_Team_Name,
        label: s.Sub_Team_Name,
      })),
      categoria: Array.from(categoriaSet).sort().map((name) => ({
        value: name,
        label: name,
      })),
    };
  }, [data, users, subTeams]);

  const filteredData = useFilteredBoard(equipoActivo, data);

  function handleMove(id: string, columna: KanbanColumna) {
    const columnId = columnMap?.[columna];
    mover({ id, columna, columnId });
  }

  // Cuando el board notifica que cambió el modalId, verificar si está en el board
  // Si no está, guardar como externalModalId para fetcharlo
  function handleModalId(id: string | null) {
    if (!id) { setExternalModalId(null); return; }
    const inBoard = Object.values(data ?? {}).flat().some((r) => r.id === id);
    if (!inBoard) setExternalModalId(id);
    else setExternalModalId(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%' }}>

      <div style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'space-between',
        flexWrap:       'wrap',
        gap:            8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <BoardFilters boardId={equipoActivo} dynamicOptions={dynamicOptions} />
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

      {isLoading && !data && <KanbanSkeleton columns={4} />}

      {isError && !config.USE_MOCK && (
        <p style={{ color: 'var(--danger)', fontSize: 12 }}>
          Error al cargar las solicitudes.
        </p>
      )}

      {filteredData && (
        <KanbanBoard
          board={filteredData}
          equipo={equipoActivo}
          onMove={handleMove}
          extraRequest={externalRequest ?? null}
          onModalId={handleModalId}
        />
      )}
    </div>
  );
}