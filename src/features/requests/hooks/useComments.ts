// src/features/requests/hooks/useComments.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * Hooks de TanStack Query para los comentarios de un request.
 *
 * Expone la query de listado ({@link useComments}) y las mutaciones de crear
 * ({@link useCreateComment}, con soporte de menciones) y borrar
 * ({@link useDeleteComment}). Ambas mutaciones invalidan la lista del request al
 * terminar.
 *
 * @module useComments
 */

/** Un comentario de un request, con datos de su autor. */
export type Comment = {
  /** ID del comentario. */
  Comment_ID:         number;
  /** Texto del comentario. */
  Comment_Text:       string;
  /** Fecha de creación (ISO). */
  Comment_Created_At: string;
  /** Autor del comentario, o `null`. */
  author: {
    User_ID:         number;
    User_Name:       string;
    User_Avatar_url: string;
  } | null;
};

/**
 * Lista los comentarios de un request.
 *
 * @remarks
 * `staleTime: 0` (siempre obsoleto, para reflejar altas/bajas al instante) y un
 * reintento en caso de error.
 *
 * @param requestId - ID del request cuyos comentarios se listan.
 * @returns El resultado de `useQuery` con la lista de comentarios.
 */
export function useComments(requestId: string) {
  return useQuery<Comment[]>({
    queryKey:  ['comments', requestId],
    queryFn:   () => apiClient.call<Comment[]>('fetchComments', { requestId }),
    staleTime: 0,
    retry:     1,
  });
}

/**
 * Crea un comentario en un request.
 *
 * @remarks
 * Envía `mentionedUserIds` (o `[]` si no se pasan) para las menciones. En
 * `onSuccess` invalida la lista de comentarios del request.
 *
 * @returns El objeto de mutación de React Query. Variables:
 *   `{ requestId, userId, text, mentionedUserIds? }`.
 */
export function useCreateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      requestId,
      userId,
      text,
      mentionedUserIds,
    }: {
      requestId:         string;
      userId:            number;
      text:              string;
      mentionedUserIds?: number[];
    }) => apiClient.call<Comment>('createComment', { requestId, userId, text, mentionedUserIds: mentionedUserIds ?? [] }),
    onSuccess: (_data, { requestId }) => {
      qc.invalidateQueries({ queryKey: ['comments', requestId] });
    },
  });
}

/**
 * Elimina un comentario de un request.
 *
 * @remarks
 * En `onSuccess` invalida la lista de comentarios del request. El `requestId`
 * viaja en las variables solo para saber qué caché invalidar (no se envía al
 * backend, que borra por `commentId`).
 *
 * @returns El objeto de mutación de React Query. Variables: `{ commentId, requestId }`.
 */
export function useDeleteComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      commentId,
    }: {
      commentId:  number;
      requestId:  string;
    }) => apiClient.call('deleteComment', { commentId }),
    onSuccess: (_data, { requestId }) => {
      qc.invalidateQueries({ queryKey: ['comments', requestId] });
    },
  });
}