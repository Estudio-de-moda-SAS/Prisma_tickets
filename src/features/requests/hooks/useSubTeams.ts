// src/features/requests/hooks/useSubTeams.ts
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export type SubTeam = {
  Sub_Team_ID:    number;
  Sub_Team_Name:  string;
  Sub_Team_Color: string;
  supervisorIds?: number[];
};

export function useSubTeams(teamId: number | null) {
  return useQuery<SubTeam[]>({
    queryKey:  ['subTeams', teamId],
    queryFn:   () => apiClient.call<SubTeam[]>('fetchSubTeamsByTeamId', { teamId }),
    enabled:   !!teamId,
    staleTime: 0,
    retry:     1,
  });
}

/** Sub-equipos de VARIOS equipos a la vez (para el filtro combinado).
 *  Devuelve, por cada teamId, sus sub-equipos — preservando el orden de
 *  entrada para que los grupos salgan agrupados por equipo. */
export function useSubTeamsMulti(teamIds: number[]) {
  const results = useQueries({
    queries: teamIds.map((id) => ({
      queryKey:  ['subTeams', id],
      queryFn:   () => apiClient.call<SubTeam[]>('fetchSubTeamsByTeamId', { teamId: id }),
      staleTime: 0,
      retry:     1,
    })),
  });
  return teamIds.map((teamId, i) => ({
    teamId,
    subTeams:  (results[i]?.data ?? []) as SubTeam[],
    isLoading: results[i]?.isLoading ?? false,
  }));
}

export function useCreateSubTeam(teamId: number | null) {
  const qc = useQueryClient();
  const qk = ['subTeams', teamId] as const;

  return useMutation({
    mutationFn: (d: { name: string; color: string }) =>
      apiClient.call<SubTeam>('createSubTeam', { teamId, name: d.name, color: d.color }),

    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<SubTeam[]>(qk);

      const tempSubTeam: SubTeam = {
        Sub_Team_ID:    -Date.now(),
        Sub_Team_Name:  d.name,
        Sub_Team_Color: d.color,
      };
      qc.setQueryData<SubTeam[]>(qk, (prev) => [...(prev ?? []), tempSubTeam]);

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<SubTeam[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

export function useUpdateSubTeam(teamId: number | null) {
  const qc = useQueryClient();
  const qk = ['subTeams', teamId] as const;

  return useMutation({
    mutationFn: (d: { id: number; name: string; color: string }) =>
      apiClient.call('updateSubTeam', d),

    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<SubTeam[]>(qk);

      qc.setQueryData<SubTeam[]>(qk, (prev) =>
        prev?.map((st) => st.Sub_Team_ID === d.id
          ? { ...st, Sub_Team_Name: d.name, Sub_Team_Color: d.color }
          : st
        ) ?? []
      );

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<SubTeam[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

export function useDeleteSubTeam(teamId: number | null) {
  const qc = useQueryClient();
  const qk = ['subTeams', teamId] as const;

  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteSubTeam', { id }),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<SubTeam[]>(qk);

      qc.setQueryData<SubTeam[]>(qk, (prev) =>
        prev?.filter((st) => st.Sub_Team_ID !== id) ?? []
      );

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<SubTeam[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

export function useSubTeamSupervisors(subTeamId: number | null) {
  return useQuery<number[]>({
    queryKey: ['subTeamSupervisors', subTeamId],
    queryFn:  () => apiClient.call<number[]>('fetchSubTeamSupervisors', { subTeamId }),
    enabled:  subTeamId !== null,
    staleTime: 60_000,
  });
}
export function useAddSubTeamSupervisor(subTeamId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => apiClient.call('addSubTeamSupervisor', { subTeamId, userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subTeamSupervisors', subTeamId] });
      qc.invalidateQueries({ queryKey: ['subTeams'] });
    },
  });
}
export function useRemoveSubTeamSupervisor(subTeamId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => apiClient.call('removeSubTeamSupervisor', { subTeamId, userId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['subTeamSupervisors', subTeamId] });
      qc.invalidateQueries({ queryKey: ['subTeams'] });
    },
  });
}