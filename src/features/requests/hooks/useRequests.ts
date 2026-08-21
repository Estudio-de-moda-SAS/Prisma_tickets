// src/features/requests/hooks/useRequests.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import { MOCK_BOARD } from '../mock/Mockboard';
import type { Equipo, BoardData, KanbanColumna, Request } from '../types';
import { useState, useEffect, useMemo, useCallback } from 'react';

/**
 * Hooks centrales de lectura de requests y el board.
 *
 * Define las query keys compartidas ({@link requestKeys}, usadas por casi todos
 * los demás hooks de la feature), utilidades para agrupar requests en el shape de
 * `BoardData`, helpers de mock, y los hooks de: board por equipo, board completo,
 * board para estadísticas, bandeja "sin categorizar", mis solicitudes, borrado,
 * conteo y paginación de historial, y búsqueda con debounce.
 *
 * @module useRequests
 */

/* ============================================================
   Query keys
   ============================================================ */

/** Prefijo raíz de todas las query keys de requests. */
const ALL = ['requests'] as const;

/** Fábrica de query keys de requests, compartida por la feature. */
export const requestKeys = {
  all:            ALL,
  byEquipo:       (equipo: Equipo) => [...ALL, 'equipo', equipo] as const,
  sinCategorizar: [...ALL, 'sin_categorizar']                    as const,
  completoStats:  [...ALL, 'completo-stats']                     as const,
};

/* ============================================================
   Agrupa array plano en el shape del board
   ============================================================ */

/**
 * Agrupa una lista plana de requests en el shape de `BoardData` (por columna).
 *
 * @remarks
 * Ignora los requests cuya `columna` no sea una columna válida del board.
 *
 * @param requests - Lista plana de requests.
 * @returns El `BoardData` con cada request en su columna.
 */
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

/**
 * Construye el board mock filtrado para un equipo.
 *
 * @param equipo - Equipo por el que filtrar las cards del mock.
 * @returns El `BoardData` mock con solo las cards del equipo.
 */
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

/**
 * Devuelve una copia completa del board mock (todas las columnas).
 *
 * @returns El `BoardData` mock completo (clonado).
 */
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

/**
 * Lee el board de un equipo, agrupado por columna.
 *
 * @remarks
 * En modo mock devuelve el board filtrado del equipo. En real, obtiene los
 * requests por código de equipo y los agrupa con {@link groupRequestsByColumn}.
 * `staleTime` de 60s (Infinity en mock), sin refetch al enfocar.
 *
 * @param equipo - Equipo cuyo board se lee.
 * @returns El resultado de `useQuery` con el `BoardData` del equipo.
 */
export function useBoardEquipo(equipo: Equipo) {
  const { Requests } = useGraphServices();

  return useQuery<BoardData>({
    queryKey: requestKeys.byEquipo(equipo),
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(getMockBoardForTeam(equipo))
      : () => Requests.fetchByTeamCode(equipo).then(groupRequestsByColumn),

    staleTime:            config.USE_MOCK ? Infinity : 60_000,
    refetchOnMount:       true,
    refetchOnWindowFocus: false,
    //refetchInterval:      config.USE_MOCK ? false : 0_0,
    retry:                config.USE_MOCK ? false : 1,
  });
}

/* ============================================================
   Hook — board completo (sin filtro de equipo, para admins)
   ============================================================ */

/**
 * Lee el board completo, sin filtrar por equipo (para admins).
 *
 * @remarks
 * `staleTime` de 30s (Infinity en mock).
 *
 * @returns El resultado de `useQuery` con el `BoardData` completo.
 */
export function useBoardCompleto() {
  const { Requests } = useGraphServices();

  return useQuery<BoardData>({
    queryKey: [...ALL, 'completo'],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(getMockBoardFull())
      : () => Requests.fetchAllByBoard().then(groupRequestsByColumn),

staleTime:            config.USE_MOCK ? Infinity : 30_000,
    refetchOnMount:       true,
    refetchOnWindowFocus: false,
    //refetchInterval:      config.USE_MOCK ? false : 180_000,
    retry:                config.USE_MOCK ? false : 1,  });
}

/* ============================================================
   Hook — board completo para ESTADÍSTICAS (dataset completo, liviano)
   No poliea agresivamente; Stats no necesita realtime de 15s.
   ============================================================ */

/**
 * Lee el board completo en su variante liviana para estadísticas.
 *
 * @remarks
 * Usa un dataset completo pero liviano (`fetchAllByBoardStats`). No hace polling
 * (`refetchInterval: false`) porque Stats no necesita realtime; `refetchOnMount:
 * 'always'` y `staleTime` de 30s.
 *
 * @returns El resultado de `useQuery` con el `BoardData` para estadísticas.
 */
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

/**
 * Lee la bandeja de entrada: requests sin categorizar.
 *
 * @remarks
 * `staleTime` de 30s (Infinity en mock).
 *
 * @returns El resultado de `useQuery` con los requests sin categorizar.
 */
export function useSinCategorizar() {
  const { Requests } = useGraphServices();

  return useQuery<Request[]>({
    queryKey: requestKeys.sinCategorizar,
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_BOARD.sin_categorizar)
      : () => Requests.fetchUncategorized(),

staleTime:            config.USE_MOCK ? Infinity : 30_000,
    refetchOnMount:       true,
    refetchOnWindowFocus: false,
    //refetchInterval:      config.USE_MOCK ? false : 180_000,
    retry:                config.USE_MOCK ? false : 1,  });
}

/* ============================================================
   Hook — mis solicitudes (filtrado local por nombre)
   ============================================================ */

/**
 * Lista "mis solicitudes" filtrando localmente por nombre del solicitante.
 *
 * @remarks
 * Trabaja sobre el board mock (filtrado en cliente por el primer nombre). Se
 * deshabilita si no hay `nombre`.
 *
 * @param nombre - Nombre por el que filtrar (se usa su primera palabra).
 * @returns El resultado de `useQuery` con las solicitudes del usuario.
 */
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

/**
 * Elimina una solicitud.
 *
 * @remarks
 * En `onSuccess` remueve la caché de detalle del request e invalida todo el
 * listado.
 *
 * @returns El objeto de mutación de React Query. Variables: `{ id, deletedBy? }`.
 */
export function useDeleteRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, deletedBy }: { id: string; deletedBy?: number }) =>
      apiClient.call<{ ok: boolean }>('deleteRequest', { id, deletedBy }),
    onSuccess: (_, { id }) => {
      queryClient.removeQueries({ queryKey: ['request', id] });
      queryClient.invalidateQueries({ queryKey: requestKeys.all });
    },
  });
}

/**
 * Lee el conteo total de historial de un equipo.
 *
 * @remarks
 * Se deshabilita en modo mock. `staleTime` y `refetchInterval` de 30s.
 *
 * @param equipo - Equipo cuyo conteo de historial se pide.
 * @returns El resultado de `useQuery` con `{ total }`.
 */
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

/** Tamaño de página del historial. Mantener en sync con `HISTORIAL_INITIAL_LIMIT` del Edge Function. */
const HISTORIAL_PAGE_SIZE = 50; // mantener en sync con HISTORIAL_INITIAL_LIMIT del Edge Function

/**
 * Paginación incremental ("cargar más") del historial de un equipo.
 *
 * @remarks
 * Mantiene, además del `baseHistorial` recibido, las páginas extra cargadas bajo
 * demanda, deduplicando por `id`. Resetea las páginas extra al cambiar de equipo.
 * `hasMore` es `true` mientras no se haya agotado y la base tenga al menos una
 * página completa. `loadMore` usa el último elemento como cursor
 * (`createdAt` + `id`) y marca `exhausted` cuando la página devuelta es menor al
 * tamaño esperado. No opera en modo mock.
 *
 * @param equipo - Equipo cuyo historial se pagina.
 * @param baseHistorial - Historial base ya cargado (primera página).
 * @returns `{ historial, loadMore, hasMore, loading }`.
 */
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

/**
 * Busca requests de un equipo con debounce.
 *
 * @remarks
 * Aplica un debounce de 250ms sobre `query`. La búsqueda se habilita solo fuera
 * de mock y con al menos 2 caracteres. Usa `placeholderData` para conservar el
 * resultado previo y evitar parpadeo entre tecleos. `staleTime` de 30s.
 *
 * @param equipo - Equipo en cuyo ámbito se busca.
 * @param query - Texto de búsqueda (sin debounce; el hook lo aplica).
 * @returns El resultado de `useQuery` con los requests que coinciden.
 */
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