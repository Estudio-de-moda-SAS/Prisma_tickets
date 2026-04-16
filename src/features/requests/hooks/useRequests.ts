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
function groupByColumn(requests: Request[]): BoardData {
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
   Hook principal — board de un equipo
   ============================================================ */
export function useBoardEquipo(equipo: Equipo) {
  const { Requests } = useGraphServices();

  return useQuery<BoardData>({
    queryKey: requestKeys.byEquipo(equipo),
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_BOARD)
      : () => Requests.getByEquipo(equipo).then(groupByColumn),

    staleTime:            config.USE_MOCK ? Infinity : 15_000,
    refetchInterval:      config.USE_MOCK ? false    : 20_000,
    refetchOnWindowFocus: !config.USE_MOCK,
    retry:                config.USE_MOCK ? false    : 1,
  });
}

/* ============================================================
   Hook para bandeja global (sin categorizar)
   ============================================================ */
export function useSinCategorizar() {
  const { Requests } = useGraphServices();

  return useQuery<Request[]>({
    queryKey: requestKeys.sinCategorizar,
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_BOARD.sin_categorizar)
      : () => Requests.getSinCategorizar(),

    staleTime:            config.USE_MOCK ? Infinity : 15_000,
    refetchInterval:      config.USE_MOCK ? false    : 20_000,
    refetchOnWindowFocus: !config.USE_MOCK,
    retry:                config.USE_MOCK ? false    : 1,
  });
}