// src/features/requests/hooks/useSolviComments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * Hooks de TanStack Query para los comentarios de un ticket de Solvi.
 *
 * Expone la query de listado ({@link useSolviComments}) y las mutaciones de crear
 * ({@link useCreateSolviComment}, con soporte de menciones) y borrar
 * ({@link useDeleteSolviComment}). Es el equivalente de `useComments` pero para
 * tickets de Solvi, identificados por `ticketId` numérico.
 *
 * @module useSolviComments
 */

/** Un comentario de un ticket de Solvi, con datos de su autor. */
export type SolviComment = {
  Comment_ID:         number;
  Comment_Text:       string;
  Comment_Created_At: string;
  author: { User_ID: number; User_Name: string; User_Avatar_url: string } | null;
};

/**
 * Lista los comentarios de un ticket de Solvi.
 *
 * @remarks
 * `staleTime: 0` (siempre obsoleto, para reflejar altas/bajas al instante) y un
 * reintento en caso de error.
 *
 * @param ticketId - ID del ticket cuyos comentarios se listan.
 * @returns El resultado de `useQuery` con la lista de comentarios.
 */
export function useSolviComments(ticketId: number) {
  return useQuery<SolviComment[]>({
    queryKey:  ['solvi-comments', ticketId],
    queryFn:   () => apiClient.call<SolviComment[]>('fetchSolviComments', { ticketId }),
    staleTime: 0,
    retry:     1,
  });
}

/**
 * Crea un comentario en un ticket de Solvi.
 *
 * @remarks
 * Envía `mentionedUserIds` (o `[]` si no se pasan) para las menciones. En
 * `onSuccess` invalida la lista de comentarios del ticket.
 *
 * @returns El objeto de mutación de React Query. Variables:
 *   `{ ticketId, userId, text, mentionedUserIds? }`.
 */
export function useCreateSolviComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ ticketId, userId, text, mentionedUserIds }: { ticketId: number; userId: number; text: string; mentionedUserIds?: number[] }) =>
      apiClient.call<SolviComment>('createSolviComment', { ticketId, userId, text, mentionedUserIds: mentionedUserIds ?? [] }),
    onSuccess: (_d, { ticketId }) => qc.invalidateQueries({ queryKey: ['solvi-comments', ticketId] }),
  });
}

/**
 * Elimina un comentario de un ticket de Solvi.
 *
 * @remarks
 * En `onSuccess` invalida la lista de comentarios del ticket. El `ticketId` viaja
 * en las variables solo para saber qué caché invalidar (no se envía al backend,
 * que borra por `commentId`).
 *
 * @returns El objeto de mutación de React Query. Variables: `{ commentId, ticketId }`.
 */
export function useDeleteSolviComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }: { commentId: number; ticketId: number }) =>
      apiClient.call('deleteSolviComment', { commentId }),
    onSuccess: (_d, { ticketId }) => qc.invalidateQueries({ queryKey: ['solvi-comments', ticketId] }),
  });
}