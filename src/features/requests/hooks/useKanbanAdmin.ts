// src/features/requests/hooks/useKanbanAdmin.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * Hooks de administración del kanban.
 *
 * Cubre la gestión de equipos/boards (crear, actualizar, reordenar), de columnas
 * globales (crear, actualizar, reordenar), de la configuración de columnas por
 * equipo (visibilidad, evidencia, colores, columna de cierre) y de la columna de
 * inicio de estadísticas. Varias mutaciones usan actualización optimista con
 * rollback por snapshot.
 *
 * @module useKanbanAdmin
 */

/* ============================================================
   Tipos
   ============================================================ */

/** Equipo/board del kanban tal como viene de la base. */
export type KanbanTeam = {
  Board_Team_ID:            number;
  Board_Team_Name:          string;
  Board_Team_Code:          string;
  Board_Team_Color:         string;
  Board_Team_Description:   string | null;
  Board_Team_Icon:          string;
  Board_Team_Is_Admin_Only: boolean;
  Board_Team_Is_External:   boolean;
  Board_Team_External_URL:  string | null;
  Board_Team_Is_Integration: boolean;
  Board_Team_Integration_Key: string | null;
  Board_Team_Is_Active:     boolean;
  Board_Team_Sort_Order:    number;
  Department_ID:            number | null;
};

/** Columna del board junto con su configuración específica de equipo. */
export type ColumnWithConfig = {
  Board_Column_ID:       number;
  Board_Column_Name:     string;
  Board_Column_Slug:     string;
  Board_Column_Position: number;
  Board_Column_Color:    string;
  Board_Column_Limit:    number;
  Config_ID:             number | null;
  Is_Visible:            boolean;
  Evidence_Required:     boolean;
  Evidence_Label:        string | null;
  Is_Close_Column:         boolean;
  Is_Stats_Start:          boolean;
  Team_Column_Color:       string | null;
  Team_Column_Title_Color: string | null;
};

/* ── Query keys ── */

/** Fábrica de query keys del módulo (equipos, columnas, config por equipo, stats-start). */
const keys = {
  teams:      ()                 => ['boardTeams']                   as const,
  columns:    (boardId: number)  => ['boardColumns',     boardId]    as const,
  config:     (teamId:  number)  => ['teamColumnConfig', teamId]     as const,
  statsStart: (boardId: number)  => ['statsStartConfig', boardId]    as const,
};

/* ============================================================
   Crear equipo kanban
   ============================================================ */

/**
 * Crea un equipo/board del kanban.
 *
 * @remarks
 * En `onSuccess` invalida la lista de equipos y fuerza el refetch de
 * `myBoardTeams` (sidebar).
 *
 * @returns El objeto de mutación de React Query.
 */
export function useCreateKanbanTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { name: string; code: string; color: string; description: string; icon: string; isAdminOnly: boolean; isExternal: boolean; externalUrl: string; isActive: boolean; departmentId: number | null; isIntegration: boolean; integrationKey: string | null }) =>      apiClient.call<KanbanTeam>('createKanbanTeam', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.teams() });
      qc.refetchQueries({ queryKey: ['myBoardTeams'], exact: false });
    },
  });
}

/* ============================================================
   Actualizar equipo kanban
   ============================================================ */

/**
 * Actualiza un equipo/board del kanban.
 *
 * @remarks
 * En `onSuccess` invalida la lista de equipos y refetchea `myBoardTeams`.
 *
 * @returns El objeto de mutación de React Query.
 */
export function useUpdateKanbanTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { id: number; name: string; code: string; color: string; description: string; icon: string; isAdminOnly: boolean; isExternal: boolean; externalUrl: string; isActive: boolean; departmentId: number | null; isIntegration: boolean; integrationKey: string | null }) =>
      apiClient.call('updateKanbanTeam', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.teams() });
      qc.refetchQueries({ queryKey: ['myBoardTeams'], exact: false });
    },
  });
}

/* ============================================================
   Config de columnas para un equipo (columnas + config por equipo)
   ============================================================ */

/**
 * Lee las columnas de un board junto con la configuración de un equipo.
 *
 * @remarks
 * Se deshabilita si `teamId` es `null`. `staleTime` de 30s.
 *
 * @param boardId - Board de contexto.
 * @param teamId - Equipo cuya configuración se lee, o `null` para no consultar.
 * @returns El resultado de `useQuery` con las columnas y su config por equipo.
 */
export function useTeamColumnConfig(boardId: number, teamId: number | null) {
  return useQuery<ColumnWithConfig[]>({
    queryKey: keys.config(teamId ?? 0),
    queryFn:  () => apiClient.call<ColumnWithConfig[]>('fetchTeamColumnConfig', { boardId, teamId }),
    enabled:  teamId !== null,
    staleTime: 30_000,
  });
}

/* ============================================================
   Upsert config de columna (optimistic)
   ============================================================ */

/**
 * Crea o actualiza la configuración de una columna para un equipo (optimista).
 *
 * @remarks
 * `onMutate` aplica los cambios en la columna correspondiente (respetando los
 * campos opcionales: solo se sobrescriben si vienen definidos); `onError`
 * restaura el snapshot; `onSettled` invalida la config del equipo y toda la caché
 * `teamColumnConfig`.
 *
 * @param teamId - Equipo cuya configuración se modifica (define la query key).
 * @returns El objeto de mutación de React Query.
 */
export function useUpsertTeamColumnConfig(teamId: number) {
  const qc = useQueryClient();
  const qk = keys.config(teamId);

  return useMutation({
    mutationFn: (d: {
      columnId:         number;
      isVisible:        boolean;
      evidenceRequired: boolean;
      evidenceLabel:    string | null;
      isCloseColumn?:   boolean;
      teamColor?:       string | null;
      teamTitleColor?:  string | null;
    }) => apiClient.call('upsertTeamColumnConfig', { teamId, ...d }),

    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<ColumnWithConfig[]>(qk);
      qc.setQueryData<ColumnWithConfig[]>(qk, (prev) =>
        prev?.map((col) =>
          col.Board_Column_ID === d.columnId
            ? {
                ...col,
                Is_Visible:        d.isVisible,
                Evidence_Required: d.evidenceRequired,
                Evidence_Label:    d.evidenceLabel,
                Is_Close_Column:   d.isCloseColumn  !== undefined ? d.isCloseColumn  : col.Is_Close_Column,
                Team_Column_Color:       d.teamColor      !== undefined ? d.teamColor      : col.Team_Column_Color,
                Team_Column_Title_Color: d.teamTitleColor !== undefined ? d.teamTitleColor : col.Team_Column_Title_Color,
              }
            : col
        ) ?? []
      );
      return { snapshot };
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<ColumnWithConfig[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
      qc.invalidateQueries({ queryKey: ['teamColumnConfig'] });
    },
  });
}

/* ============================================================
   Marcar columna de inicio de estadísticas (radio: una por equipo)
   ============================================================ */

/**
 * Marca la columna de inicio de estadísticas de un equipo (comportamiento tipo radio).
 *
 * @remarks
 * Solo una columna por equipo puede ser inicio de stats: `onMutate` pone
 * `Is_Stats_Start` en `true` únicamente en la seleccionada (o en ninguna si
 * `columnId` es `null`). `onError` restaura el snapshot; `onSettled` invalida la
 * config del equipo y la config de stats-start del board.
 *
 * @param boardId - Board de contexto.
 * @param teamId - Equipo cuya columna de stats se marca.
 * @returns El objeto de mutación de React Query. Variables: `columnId` o `null`.
 */
export function useSetStatsStartColumn(boardId: number, teamId: number) {
  const qc = useQueryClient();
  const qk = keys.config(teamId);

  return useMutation({
    mutationFn: (columnId: number | null) =>
      apiClient.call('setStatsStartColumn', { boardId, teamId, columnId }),

    onMutate: async (columnId) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<ColumnWithConfig[]>(qk);
      qc.setQueryData<ColumnWithConfig[]>(qk, (prev) =>
        prev?.map((col) => ({
          ...col,
          Is_Stats_Start: columnId === null ? false : col.Board_Column_ID === columnId,
        })) ?? []
      );
      return { snapshot };
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<ColumnWithConfig[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
      qc.invalidateQueries({ queryKey: keys.statsStart(boardId) });
    },
  });
}

/* ============================================================
   Actualizar columna global (nombre, color, límite)
   ============================================================ */

/**
 * Actualiza una columna global del board (nombre, color, límite).
 *
 * @remarks
 * En `onSuccess` invalida `teamColumnConfig` y el `columnMap` del board.
 *
 * @param boardId - Board de contexto.
 * @returns El objeto de mutación de React Query.
 */
export function useUpdateBoardColumn(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { columnId: number; name: string; color: string; limit: number }) =>
      apiClient.call('updateBoardColumn', d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teamColumnConfig'] });
      qc.invalidateQueries({ queryKey: ['columnMap', boardId] });
    },
  });
}

/* ============================================================
   Crear columna global
   ============================================================ */

/**
 * Crea una columna global en el board.
 *
 * @remarks
 * En `onSuccess` invalida `teamColumnConfig` y el `columnMap` del board.
 *
 * @param boardId - Board al que se añade la columna.
 * @returns El objeto de mutación de React Query.
 */
export function useCreateBoardColumn(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { name: string; color: string; limit: number }) =>
      apiClient.call('createBoardColumn', { boardId, ...d }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teamColumnConfig'] });
      qc.invalidateQueries({ queryKey: ['columnMap', boardId] });
    },
  });
}

/* ============================================================
   Reordenar columna (optimistic swap)
   ============================================================ */

/**
 * Reordena una columna una posición arriba o abajo (optimista).
 *
 * @remarks
 * `onMutate` hace un swap con la columna vecina en la dirección indicada
 * (aborta si ya está en el borde); `onError` restaura el snapshot; `onSettled`
 * invalida la config del equipo y el `columnMap` del board.
 *
 * @param boardId - Board de contexto.
 * @param teamId - Equipo cuya vista de columnas se reordena (define la query key).
 * @returns El objeto de mutación de React Query. Variables: `{ columnId, direction }`.
 */
export function useReorderBoardColumn(boardId: number, teamId: number) {
  const qc = useQueryClient();
  const qk = keys.config(teamId);

  return useMutation({
    mutationFn: (d: { columnId: number; direction: 'up' | 'down' }) =>
      apiClient.call('reorderBoardColumn', { ...d, boardId }),

    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<ColumnWithConfig[]>(qk);
      qc.setQueryData<ColumnWithConfig[]>(qk, (prev) => {
        if (!prev) return prev;
        const arr = [...prev];
        const idx = arr.findIndex((c) => c.Board_Column_ID === d.columnId);
        if (idx === -1) return prev;
        const si = d.direction === 'up' ? idx - 1 : idx + 1;
        if (si < 0 || si >= arr.length) return prev;
        [arr[idx], arr[si]] = [arr[si], arr[idx]];
        return arr;
      });
      return { snapshot };
    },

    onError: (_e, _v, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<ColumnWithConfig[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
      qc.invalidateQueries({ queryKey: ['columnMap', boardId] });
    },
    
  });
  
}

/* ============================================================
   Reordenar equipo kanban (optimistic swap)
   ============================================================ */

/**
 * Reordena un equipo/board una posición arriba o abajo.
 *
 * @remarks
 * No usa optimistic: el reordenamiento está *scoped* por departamento en el
 * backend (permuta `Sort_Order` entre vecinos del grupo). Como las listas de
 * equipos usan `staleTime: Infinity`, invalidar no basta: en `onSettled` se
 * fuerza el refetch de `boardTeams` y `myBoardTeams` para mostrar el orden real
 * de inmediato (de lo contrario operaría sobre caché viejo y habría saltos).
 *
 * @returns El objeto de mutación de React Query. Variables: `{ teamId, direction }`.
 */
export function useReorderBoardTeam() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (d: { teamId: number; direction: 'up' | 'down' }) =>
      apiClient.call('reorderBoardTeam', d),

    // Sin optimistic: el reorder es scoped por departamento en el back
    // (permuta Sort_Order entre vecinos del grupo). Con staleTime: Infinity,
    // invalidar no basta — hay que forzar el refetch para que la UI muestre
    // el orden real de inmediato (si no, opera sobre cache viejo → saltos).
    onSettled: async () => {
      await qc.refetchQueries({ queryKey: ['boardTeams'], exact: false });
      await qc.refetchQueries({ queryKey: ['myBoardTeams'], exact: false });
    },
  });
}

/* ============================================================
   Config de inicio de stats — consumida por useStatsData
   ============================================================ */

/**
 * Configuración de inicio de estadísticas de un board.
 *
 * @remarks
 * `columnPositions` mapea columna → posición; `statsStartByTeam` mapea equipo →
 * columna de inicio de stats. La consume `useStatsData`.
 */
export type StatsStartConfig = {
  columnPositions:  Record<string, number>;
  statsStartByTeam: Record<string, number>;
};

/**
 * Lee la configuración de inicio de estadísticas de un board.
 *
 * @remarks
 * `staleTime` de 60s.
 *
 * @param boardId - Board cuya configuración se lee.
 * @returns El resultado de `useQuery` con la {@link StatsStartConfig}.
 */
export function useStatsStartConfig(boardId: number) {
  return useQuery<StatsStartConfig>({
    queryKey: keys.statsStart(boardId),
    queryFn:  () => apiClient.call<StatsStartConfig>('fetchStatsStartConfig', { boardId }),
    staleTime: 60_000,
  });
}