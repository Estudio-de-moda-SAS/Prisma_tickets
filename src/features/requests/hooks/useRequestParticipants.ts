// src/features/requests/hooks/useRequestParticipants.ts
import { apiClient } from '@/lib/apiClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

/**
 * Hooks de TanStack Query para los participantes de un request.
 *
 * Expone la query de listado ({@link useRequestParticipants}) y la mutación para
 * quitar un participante ({@link useRemoveParticipant}), que invalida la lista al
 * terminar.
 *
 * @module useRequestParticipants
 */

/** Un participante de un request, con cómo y quién lo agregó. */
export type RequestParticipant = {
  User_ID: number; User_Name: string; User_Avatar_url: string;
  Added_Via: string; Added_By: number | null;
};

/**
 * Lista los participantes de un request.
 *
 * @remarks
 * `staleTime` de 30s.
 *
 * @param requestId - ID del request cuyos participantes se listan.
 * @returns El resultado de `useQuery` con los participantes.
 */
export function useRequestParticipants(requestId: string) {
  return useQuery<RequestParticipant[]>({
    queryKey:  ['requestParticipants', requestId],
    queryFn:   () => apiClient.call<RequestParticipant[]>('fetchRequestParticipants', { requestId }),
    staleTime: 30_000,
  });
}

/**
 * Quita un participante de un request.
 *
 * @remarks
 * En `onSuccess` invalida la lista de participantes del request.
 *
 * @returns El objeto de mutación de React Query. Variables: `{ requestId, userId, actorId }`.
 */
export function useRemoveParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ requestId, userId, actorId }: { requestId: string; userId: number; actorId: number }) =>
      apiClient.call('removeParticipant', { requestId, userId, actorId }),
    onSuccess: (_d, { requestId }) => {
      qc.invalidateQueries({ queryKey: ['requestParticipants', requestId] });
    },
  });
}