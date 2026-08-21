// src/features/requests/hooks/useSubTeams.ts
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * Hooks de TanStack Query para los subequipos.
 *
 * Cubre las lecturas de subequipos por equipo (individual {@link useSubTeams} y
 * multi {@link useSubTeamsMulti}), el CRUD optimista (crear, actualizar, eliminar)
 * y las lecturas/mutaciones de supervisores.
 *
 * @module useSubTeams
 */

/** Un subequipo, con sus supervisores (opcionales). */
export type SubTeam = {
  Sub_Team_ID:    number;
  Sub_Team_Name:  string;
  Sub_Team_Color: string;
  supervisorIds?: number[];
};

/**
 * Lista los subequipos de un equipo.
 *
 * @remarks
 * Se deshabilita si no hay `teamId`. `staleTime: 0`.
 *
 * @param teamId - ID del equipo, o `null` para no consultar.
 * @returns El resultado de `useQuery` con los subequipos.
 */
export function useSubTeams(teamId: number | null) {
  return useQuery<SubTeam[]>({
    queryKey:  ['subTeams', teamId],
    queryFn:   () => apiClient.call<SubTeam[]>('fetchSubTeamsByTeamId', { teamId }),
    enabled:   !!teamId,
    staleTime: 0,
    retry:     1,
  });
}

/**
 * Lista los subequipos de varios equipos a la vez (para el filtro combinado).
 *
 * @remarks
 * Usa `useQueries` (una query por equipo, compartiendo la key `['subTeams', id]`
 * con {@link useSubTeams}) y preserva el orden de entrada para que los grupos
 * salgan agrupados por equipo.
 *
 * @param teamIds - IDs de los equipos.
 * @returns Un arreglo de `{ teamId, subTeams, isLoading }`, alineado con la entrada.
 */
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

/**
 * Crea un subequipo (optimista).
 *
 * @remarks
 * `onMutate` inserta un subequipo temporal con `Sub_Team_ID` negativo; `onError`
 * restaura el snapshot; `onSettled` invalida los subequipos del equipo.
 *
 * @param teamId - Equipo al que pertenece el subequipo (define la query key).
 * @returns El objeto de mutación de React Query. Variables: `{ name, color }`.
 */
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

/**
 * Actualiza un subequipo (optimista).
 *
 * @remarks
 * `onMutate` aplica nombre y color en caché; `onError` restaura el snapshot;
 * `onSettled` invalida los subequipos del equipo.
 *
 * @param teamId - Equipo de contexto (define la query key).
 * @returns El objeto de mutación de React Query. Variables: `{ id, name, color }`.
 */
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

/**
 * Elimina un subequipo (optimista).
 *
 * @remarks
 * `onMutate` quita el subequipo de la caché; `onError` restaura el snapshot;
 * `onSettled` invalida los subequipos del equipo.
 *
 * @param teamId - Equipo de contexto (define la query key).
 * @returns El objeto de mutación de React Query. Variables: `id` del subequipo.
 */
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

/**
 * Lista los IDs de los supervisores de un subequipo.
 *
 * @remarks
 * Se deshabilita si `subTeamId` es `null`. `staleTime` de 60s.
 *
 * @param subTeamId - ID del subequipo, o `null` para no consultar.
 * @returns El resultado de `useQuery` con los IDs de supervisores.
 */
export function useSubTeamSupervisors(subTeamId: number | null) {
  return useQuery<number[]>({
    queryKey: ['subTeamSupervisors', subTeamId],
    queryFn:  () => apiClient.call<number[]>('fetchSubTeamSupervisors', { subTeamId }),
    enabled:  subTeamId !== null,
    staleTime: 60_000,
  });
}

/**
 * Agrega un supervisor a un subequipo.
 *
 * @remarks
 * En `onSuccess` invalida los supervisores del subequipo y la lista de subequipos.
 *
 * @param subTeamId - Subequipo al que se agrega (define la query key a invalidar).
 * @returns El objeto de mutación de React Query. Variables: `userId`.
 */
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

/**
 * Quita un supervisor de un subequipo.
 *
 * @remarks
 * En `onSuccess` invalida los supervisores del subequipo y la lista de subequipos.
 *
 * @param subTeamId - Subequipo del que se quita (define la query key a invalidar).
 * @returns El objeto de mutación de React Query. Variables: `userId`.
 */
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