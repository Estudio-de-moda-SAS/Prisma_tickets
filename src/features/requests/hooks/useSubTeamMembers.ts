// src/features/requests/hooks/useSubTeamMembers.ts
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { AppUser } from './useUsers';

/**
 * Hooks de TanStack Query para miembros y supervisores de subequipos.
 *
 * Cubre las lecturas de miembros (individual {@link useSubTeamMembers}, agrupada
 * por subequipo {@link useSubTeamMembersGrouped}, y en bloque
 * {@link useSubTeamMembersBulk}), las mutaciones para agregar/quitar miembros, y
 * las lecturas y mutaciones de supervisores.
 *
 * @module useSubTeamMembers
 */

/** Un miembro de subequipo (alias de {@link AppUser}). */
export type SubTeamMember = AppUser;

/**
 * Lista los miembros de un subequipo.
 *
 * @remarks
 * Se deshabilita si `subTeamId` es `null`. `staleTime` de 2 minutos.
 *
 * @param subTeamId - ID del subequipo, o `null` para no consultar.
 * @returns El resultado de `useQuery` con los miembros.
 */
export function useSubTeamMembers(subTeamId: number | null) {
  return useQuery<SubTeamMember[]>({
    queryKey: ['subTeamMembers', subTeamId],
    queryFn:  () => apiClient.call<SubTeamMember[]>('fetchSubTeamMembers', { subTeamId }),
    enabled:  subTeamId !== null,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

/**
 * Lista los miembros de varios subequipos, uno por query (agrupado).
 *
 * @remarks
 * Usa `useQueries` (una query por subequipo, compartiendo la key
 * `['subTeamMembers', id]` con {@link useSubTeamMembers}) y devuelve un arreglo
 * paralelo al de entrada con el subequipo, sus miembros y su estado de carga.
 *
 * @param subTeams - Subequipos a consultar (id, nombre y color).
 * @returns Un arreglo de `{ subTeam, members, isLoading }`, alineado con la entrada.
 */
export function useSubTeamMembersGrouped(subTeams: { Sub_Team_ID: number; Sub_Team_Name: string; Sub_Team_Color: string }[]) {
  const results = useQueries({
    queries: subTeams.map((st) => ({
      queryKey:  ['subTeamMembers', st.Sub_Team_ID],
      queryFn:   () => apiClient.call<SubTeamMember[]>('fetchSubTeamMembers', { subTeamId: st.Sub_Team_ID }),
      staleTime: 2 * 60 * 1000,
      retry:     1,
    })),
  });

  return subTeams.map((st, i) => ({
    subTeam:  st,
    members:  (results[i]?.data ?? []) as SubTeamMember[],
    isLoading: results[i]?.isLoading ?? false,
  }));
}

/**
 * Lista los miembros de varios subequipos en una sola llamada (bulk).
 *
 * @remarks
 * Se deshabilita si `subTeamIds` está vacío. `staleTime: 0`.
 *
 * @param subTeamIds - IDs de los subequipos.
 * @returns El resultado de `useQuery` con los miembros combinados.
 */
export function useSubTeamMembersBulk(subTeamIds: number[]) {
  return useQuery<SubTeamMember[]>({
    queryKey:  ['subTeamMembers', 'bulk', subTeamIds],
    queryFn:   () => apiClient.call<SubTeamMember[]>('fetchMembersBySubTeams', { subTeamIds }),
    enabled:   subTeamIds.length > 0,
    staleTime: 0,
    retry:     1,
  });
}

/**
 * Agrega un miembro a un subequipo.
 *
 * @remarks
 * En `onSuccess` invalida los miembros del subequipo.
 *
 * @param subTeamId - Subequipo al que se agrega (define la query key a invalidar).
 * @returns El objeto de mutación de React Query. Variables: `userId`.
 */
export function useAddSubTeamMember(subTeamId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.call('addSubTeamMember', { subTeamId, userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subTeamMembers', subTeamId] }),
  });
}

/**
 * Quita un miembro de un subequipo.
 *
 * @remarks
 * En `onSuccess` invalida los miembros del subequipo.
 *
 * @param subTeamId - Subequipo del que se quita (define la query key a invalidar).
 * @returns El objeto de mutación de React Query. Variables: `userId`.
 */
export function useRemoveSubTeamMember(subTeamId: number | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) =>
      apiClient.call('removeSubTeamMember', { subTeamId, userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subTeamMembers', subTeamId] }),
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
 * En `onSuccess` invalida los supervisores del subequipo y la lista de subequipos
 * (`subTeams`).
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
 * En `onSuccess` invalida los supervisores del subequipo y la lista de subequipos
 * (`subTeams`).
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