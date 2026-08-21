// src/features/requests/hooks/useSolviParticipants.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * Hooks de TanStack Query para los participantes de un ticket de Solvi.
 *
 * Expone la query de listado ({@link useSolviParticipants}) y la mutación para
 * quitar un participante ({@link useRemoveSolviParticipant}), que invalida la
 * lista al terminar. Es el equivalente de `useRequestParticipants` para tickets de
 * Solvi, identificados por `ticketId` numérico.
 *
 * @module useSolviParticipants
 */

/** Un participante de un ticket de Solvi, con cómo y quién lo agregó. */
export type SolviParticipant = {
  User_ID: number; User_Name: string; User_Avatar_url: string;
  Added_Via: string; Added_By: number | null;
};

/**
 * Lista los participantes de un ticket de Solvi.
 *
 * @remarks
 * `staleTime` de 30s.
 *
 * @param ticketId - ID del ticket cuyos participantes se listan.
 * @returns El resultado de `useQuery` con los participantes.
 */
export function useSolviParticipants(ticketId: number) {
  return useQuery<SolviParticipant[]>({
    queryKey:  ['solvi-participants', ticketId],
    queryFn:   () => apiClient.call<SolviParticipant[]>('fetchSolviParticipants', { ticketId }),
    staleTime: 30_000,
  });
}

/**
 * Quita un participante de un ticket de Solvi.
 *
 * @remarks
 * En `onSuccess` invalida la lista de participantes del ticket.
 *
 * @returns El objeto de mutación de React Query. Variables: `{ ticketId, userId, actorId }`.
 */
export function useRemoveSolviParticipant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, userId, actorId }: { ticketId: number; userId: number; actorId: number }) =>
      apiClient.call('removeSolviParticipant', { ticketId, userId, actorId }),
    onSuccess: (_d, { ticketId }) => qc.invalidateQueries({ queryKey: ['solvi-participants', ticketId] }),
  });
}