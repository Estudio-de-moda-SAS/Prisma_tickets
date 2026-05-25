import { useQuery } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import { MOCK_BOARD } from '../mock/Mockboard';
import type { Equipo, BoardData, KanbanColumna, Request } from '../types';

/* ============================================================
   Query keys
   ============================================================ */
const ALL = ['requests'] as const;

export const requestKeys = {
  all:            ALL,
  byEquipo:       (equipo: Equipo) => [...ALL, 'equipo', equipo] as const,
  sinCategorizar: [...ALL, 'sin_categorizar']                    as const,
};

/* ============================================================
   Agrupa array plano en el shape del board
   ============================================================ */
function groupRequestsByColumn(requests: Request[]): BoardData {
  const board: BoardData = {
    sin_categorizar: [],
    icebox:          [],
    backlog:         [],
    todo:            [],
    en_progreso:     [],
    en_revision_qas: [],
    cliente_review:  [],
    ready_to_deploy: [],
    hecho:           [],
    historial:       [],
  };
  for (const r of requests) {
    const col = r.columna as KanbanColumna;
    if (col in board) board[col].push(r);
  }
  return board;
}

/* ============================================================
   Mock helpers
   ============================================================ */
function getMockBoardForTeam(equipo: Equipo): BoardData {
  const board: BoardData = {
    sin_categorizar: [],
    icebox:          [],
    backlog:         [],
    todo:            [],
    en_progreso:     [],
    en_revision_qas: [],
    cliente_review:  [],
    ready_to_deploy: [],
    hecho:           [],
    historial:       [],
  };
  for (const col of Object.keys(board) as KanbanColumna[]) {
    board[col] = (MOCK_BOARD[col] ?? []).filter((r) => r.equipo.includes(equipo));
  }
  return board;
}

function getMockBoardFull(): BoardData {
  const base = structuredClone(MOCK_BOARD) as Partial<BoardData>;
  // Asegurar que cliente_review exista aunque no esté en el mock antiguo
  return {
    sin_categorizar: base.sin_categorizar ?? [],
    icebox:          base.icebox          ?? [],
    backlog:         base.backlog         ?? [],
    todo:            base.todo            ?? [],
    en_progreso:     base.en_progreso     ?? [],
    en_revision_qas: base.en_revision_qas ?? [],
    cliente_review:  base.cliente_review  ?? [],
    ready_to_deploy: base.ready_to_deploy ?? [],
    hecho:           base.hecho           ?? [],
    historial:       base.historial       ?? [],
  };
}

/* ============================================================
   Hook — board de un equipo
   ============================================================ */
export function useBoardEquipo(equipo: Equipo) {
  const { Requests } = useGraphServices();

  return useQuery<BoardData>({
    queryKey: requestKeys.byEquipo(equipo),
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(getMockBoardForTeam(equipo))
      : () => Requests.fetchByTeamCode(equipo).then(groupRequestsByColumn),

    staleTime:            0,
    refetchOnMount:       true,
    refetchOnWindowFocus: true,
    refetchInterval:      config.USE_MOCK ? false : 20_000,
    retry:                config.USE_MOCK ? false : 1,
  });
}

/* ============================================================
   Hook — board completo (sin filtro de equipo, para admins)
   ============================================================ */
export function useBoardCompleto() {
  const { Requests } = useGraphServices();

  return useQuery<BoardData>({
    queryKey: [...ALL, 'completo'],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(getMockBoardFull())
      : () => Requests.fetchAllByBoard().then(groupRequestsByColumn),

    staleTime:            0,
    refetchOnMount:       true,
    refetchOnWindowFocus: true,
    refetchInterval:      config.USE_MOCK ? false : 20_000,
    retry:                config.USE_MOCK ? false : 1,
  });
}

/* ============================================================
   Hook — bandeja de entrada (sin categorizar)
   ============================================================ */
export function useSinCategorizar() {
  const { Requests } = useGraphServices();

  return useQuery<Request[]>({
    queryKey: requestKeys.sinCategorizar,
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_BOARD.sin_categorizar)
      : () => Requests.fetchUncategorized(),

    staleTime:            0,
    refetchOnMount:       true,
    refetchOnWindowFocus: true,
    refetchInterval:      config.USE_MOCK ? false : 20_000,
    retry:                config.USE_MOCK ? false : 1,
  });
}

/* ============================================================
   Hook — mis solicitudes (filtrado local por nombre)
   ============================================================ */
export function useMisSolicitudes(nombre: string) {
  return useQuery<Request[]>({
    queryKey: [...ALL, 'mis-solicitudes', nombre],
    queryFn:  () => Promise.resolve(
      Object.values(MOCK_BOARD).flat().filter((r) =>
        r.solicitante.toLowerCase().includes(
          nombre.split(' ')[0]?.toLowerCase() ?? '',
        ),
      ),
    ),
    enabled:              !!nombre,
    staleTime:            0,
    refetchOnMount:       true,
    refetchOnWindowFocus: true,
  });
}