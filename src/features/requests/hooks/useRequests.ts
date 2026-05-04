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
    hecho:           [],
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
    hecho:           [],
  };
  for (const col of Object.keys(board) as KanbanColumna[]) {
    board[col] = MOCK_BOARD[col].filter((r) => r.equipo.includes(equipo));
  }
  return board;
}

function getMockBoardFull(): BoardData {
  return structuredClone(MOCK_BOARD);
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