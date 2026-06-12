// src/features/requests/hooks/useKanbanAdmin.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/* ============================================================
   Tipos
   ============================================================ */
export type KanbanTeam = {
  Board_Team_ID:            number;
  Board_Team_Name:          string;
  Board_Team_Code:          string;
  Board_Team_Color:         string;
  Board_Team_Description:   string | null;
  Board_Team_Icon:          string;
  Board_Team_Is_Admin_Only: boolean;
  Board_Team_Sort_Order:    number;
};

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
  Is_Close_Column:       boolean;
  Team_Column_Color:     string | null;
  Team_Column_Title_Color: string | null;
};

/* ── Query keys ── */
const keys = {
  teams:   ()                 => ['boardTeams']                    as const,
  columns: (boardId: number)  => ['boardColumns',      boardId]    as const,
  config:  (teamId:  number)  => ['teamColumnConfig',  teamId]     as const,
};

/* ============================================================
   Crear equipo kanban
   ============================================================ */
export function useCreateKanbanTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { name: string; code: string; color: string; description: string; icon: string; isAdminOnly: boolean }) =>
      apiClient.call<KanbanTeam>('createKanbanTeam', d),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.teams() }),
  });
}

/* ============================================================
   Actualizar equipo kanban
   ============================================================ */
export function useUpdateKanbanTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (d: { id: number; name: string; code: string; color: string; description: string; icon: string; isAdminOnly: boolean }) =>
      apiClient.call('updateKanbanTeam', d),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.teams() }),
  });
}

/* ============================================================
   Config de columnas para un equipo (columnas + config por equipo)
   ============================================================ */
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
   Actualizar columna global (nombre, color, límite)
   ============================================================ */
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
export function useReorderBoardTeam() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (d: { teamId: number; direction: 'up' | 'down' }) =>
      apiClient.call('reorderBoardTeam', d),

    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: ['boardTeams'] });
      qc.setQueriesData<KanbanTeam[]>(
        { queryKey: ['boardTeams'], exact: false },
        (prev) => {
          if (!prev) return prev;
          const arr = [...prev];
          const idx = arr.findIndex((t) => t.Board_Team_ID === d.teamId);
          if (idx === -1) return prev;
          const si = d.direction === 'up' ? idx - 1 : idx + 1;
          if (si < 0 || si >= arr.length) return prev;
          [arr[idx], arr[si]] = [arr[si], arr[idx]];
          return arr;
        },
      );
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['boardTeams'] });
    },
  });
}