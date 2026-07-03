// src/features/requests/hooks/useRequests.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import { MOCK_BOARD } from '../mock/Mockboard';
import type { Equipo, BoardData, KanbanColumna, Request } from '../types';
import { useState, useEffect, useMemo, useCallback } from 'react';

/* ============================================================
   Query keys
   ============================================================ */
const ALL = ['requests'] as const;

export const requestKeys = {
  all:            ALL,
  byEquipo:       (equipo: Equipo) => [...ALL, 'equipo', equipo] as const,
  sinCategorizar: [...ALL, 'sin_categorizar']                    as const,
  completoStats:  [...ALL, 'completo-stats']                     as const,
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

    staleTime:            config.USE_MOCK ? Infinity : 10_000,
    refetchOnMount:       true,
    refetchOnWindowFocus: true,
    refetchInterval:      config.USE_MOCK ? false : 15_000,
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

    staleTime:            config.USE_MOCK ? Infinity : 10_000,
    refetchOnMount:       true,
    refetchOnWindowFocus: true,
    refetchInterval:      config.USE_MOCK ? false : 15_000,
    retry:                config.USE_MOCK ? false : 1,
  });
}
/* ============================================================
   Hook — board completo para ESTADÍSTICAS (dataset completo, liviano)
   No poliea agresivamente; Stats no necesita realtime de 15s.
   ============================================================ */
export function useBoardCompletoStats() {
  const { Requests } = useGraphServices();

  return useQuery<BoardData>({
    queryKey: requestKeys.completoStats,
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(getMockBoardFull())
      : () => Requests.fetchAllByBoardStats().then(groupRequestsByColumn),

    staleTime:            config.USE_MOCK ? Infinity : 30_000,
    refetchOnMount:       'always',
    refetchOnWindowFocus: false,
    refetchInterval:      false,
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

    staleTime:            config.USE_MOCK ? Infinity : 10_000,
    refetchOnMount:       true,
    refetchOnWindowFocus: true,
    refetchInterval:      config.USE_MOCK ? false : 15_000,
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

/* ============================================================
   Hook — eliminar solicitud
   ============================================================ */
export function useDeleteRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      apiClient.call<{ ok: boolean }>('deleteRequest', { id }),
    onSuccess: (_, id) => {
      queryClient.removeQueries({ queryKey: ['request', id] });
      queryClient.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}

export function useHistorialCount(equipo: Equipo) {
  return useQuery<{ total: number }>({
    queryKey: [...ALL, 'historial-count', equipo],
    queryFn:  () => apiClient.call<{ total: number }>('fetchTeamHistorialCount', {
      boardId:  config.DEFAULT_BOARD_ID,
      teamCode: equipo,
    }),
    enabled:         !config.USE_MOCK,
    staleTime:       30_000,
    refetchInterval: 30_000,
  });
}

const HISTORIAL_PAGE_SIZE = 50; // mantener en sync con HISTORIAL_INITIAL_LIMIT del Edge Function

export function useHistorialLoadMore(equipo: Equipo, baseHistorial: Request[]) {
  const { Requests } = useGraphServices();
  const [extra,     setExtra]     = useState<Request[]>([]);
  const [exhausted, setExhausted] = useState(false);
  const [loading,   setLoading]   = useState(false);

  // Resetea las páginas extra al cambiar de equipo
  useEffect(() => { setExtra([]); setExhausted(false); }, [equipo]);

  const historial = useMemo(() => {
    if (extra.length === 0) return baseHistorial;
    const seen = new Set(baseHistorial.map((r) => r.id));
    return [...baseHistorial, ...extra.filter((r) => !seen.has(r.id))];
  }, [baseHistorial, extra]);

  const hasMore = !exhausted && baseHistorial.length >= HISTORIAL_PAGE_SIZE;

  const loadMore = useCallback(async () => {
    if (loading || exhausted || config.USE_MOCK) return;
    const last = historial[historial.length - 1];
    if (!last) return;
    setLoading(true);
    try {
      const page = await Requests.fetchTeamHistorialPage(equipo, {
        createdAt: last.fechaApertura,
        id:        last.id,
      });
      if (page.length < HISTORIAL_PAGE_SIZE) setExhausted(true);
      setExtra((prev) => [...prev, ...page]);
    } finally {
      setLoading(false);
    }
  }, [historial, equipo, loading, exhausted, Requests]);

  return { historial, loadMore, hasMore, loading };
}

export function useSearchRequests(equipo: Equipo, query: string) {
  const { Requests } = useGraphServices();
  const [debounced, setDebounced] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  return useQuery<Request[]>({
    queryKey: [...ALL, 'search', equipo, debounced],
    queryFn:  () => Requests.searchRequests(equipo, debounced),
    enabled:  !config.USE_MOCK && debounced.trim().length >= 2,
    staleTime: 30_000,
    placeholderData: (prev) => prev, // evita parpadeo entre tecleos
  });
}