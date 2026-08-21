// src/features/requests/hooks/useClientFeedback.ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import { requestKeys } from './useRequests';
import type {
  BoardData,
  ClientFeedback,
  Equipo,
  KanbanColumna,
  SubmitClientFeedbackPayload,
} from '../types';

/**
 * Hooks de TanStack Query para el feedback del cliente sobre un request.
 *
 * Expone la query del historial de feedback ({@link useClientFeedback}) y la
 * mutación para enviarlo ({@link useSubmitClientFeedback}), que además mueve la
 * card entre columnas del board de forma optimista según la decisión del cliente.
 *
 * @module useClientFeedback
 */

/* ── Query key ── */

/** Fábrica de query keys del feedback del cliente, por request. */
export const clientFeedbackKeys = {
  byRequest: (requestId: string) => ['clientFeedback', requestId] as const,
};

/* ── Fetch del historial completo de feedback ── */

/**
 * Lee el historial completo de feedback del cliente para un request.
 *
 * @remarks
 * Se deshabilita en modo mock (`config.USE_MOCK`). `staleTime` de 30s y sin
 * refetch al enfocar la ventana.
 *
 * @param requestId - ID del request cuyo feedback se consulta.
 * @returns El resultado de `useQuery` con la lista de feedback.
 */
export function useClientFeedback(requestId: string) {
  const { Requests } = useGraphServices();
  return useQuery<ClientFeedback[]>({
    queryKey: clientFeedbackKeys.byRequest(requestId),
    queryFn:  () => Requests.fetchClientFeedback(requestId),
    enabled:  !config.USE_MOCK,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}

/* ── Mutation: enviar feedback del cliente ── */

/** Contexto de rollback: snapshot del board previo a la mutación. */
type SubmitContext = { snapshot: BoardData | undefined };

/**
 * Mutación para enviar el feedback del cliente y mover la card en el board (optimista).
 *
 * @remarks
 * En modo mock devuelve un `ClientFeedback` simulado tras un breve retardo. En
 * `onMutate` mueve la card, dentro de la caché del board del equipo, a la columna
 * destino según la decisión: `ready_to_deploy` si `approved`, o `en_revision_qas`
 * si se pidieron ajustes. Para ello reconstruye el `BoardData` (copiando todas las
 * columnas), quita la card de cualquier columna donde estuviera y la reinserta en
 * la destino con la columna y `columnId` actualizados. `onError` restaura el
 * snapshot; `onSettled` (fuera de mock) invalida el board, el feedback del request
 * y su detalle.
 *
 * @param equipo - Equipo cuyo board se actualiza (define la query key).
 * @returns El objeto de mutación de React Query.
 */
export function useSubmitClientFeedback(equipo: Equipo) {
  const queryClient  = useQueryClient();
  const { Requests } = useGraphServices();
  const queryKey     = requestKeys.byEquipo(equipo);

  return useMutation<ClientFeedback, Error, SubmitClientFeedbackPayload, SubmitContext>({
    mutationFn: async (payload): Promise<ClientFeedback> => {
      if (config.USE_MOCK) {
        await new Promise((r) => setTimeout(r, 500));
        return {
          feedbackId:    Math.floor(Math.random() * 9000) + 1000,
          requestId:     payload.requestId,
          submittedBy:   payload.submittedBy,
          submitterName: 'Usuario Mock',
          decision:      payload.decision,
          feedbackNote:  payload.feedbackNote,
          submittedAt:   new Date().toISOString(),
        };
      }
      return Requests.submitClientFeedback(payload);
    },

    onMutate: async (payload): Promise<SubmitContext> => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<BoardData>(queryKey);

      const targetColumna = payload.decision === 'approved' ? 'ready_to_deploy' : 'en_revision_qas';

      queryClient.setQueryData<BoardData>(queryKey, (prev) => {
        if (!prev) return prev;

        const card = Object.values(prev).flat().find((r) => r.id === payload.requestId);
        if (!card) return prev;

        const next: BoardData = {
          sin_categorizar:  [...(prev.sin_categorizar  ?? [])],
          icebox:           [...(prev.icebox           ?? [])],
          backlog:          [...(prev.backlog          ?? [])],
          todo:             [...(prev.todo             ?? [])],
          en_progreso:      [...(prev.en_progreso      ?? [])],
          en_revision_qas:  [...(prev.en_revision_qas  ?? [])],
          cliente_review:   [...(prev.cliente_review   ?? [])],
          ready_to_deploy:  [...(prev.ready_to_deploy  ?? [])],
          hecho:            [...(prev.hecho            ?? [])],
          historial:        [...(prev.historial        ?? [])],
        };

        for (const col of Object.keys(next) as KanbanColumna[]) {
          next[col] = next[col].filter((r) => r.id !== payload.requestId);
        }

        next[targetColumna] = [
          ...next[targetColumna],
          { ...card, columna: targetColumna, columnId: payload.targetColumnId },
        ];

        return next;
      });

      return { snapshot };
    },

    onError: (_err, _payload, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData<BoardData>(queryKey, context.snapshot);
      }
    },

    onSettled: (_data, _err, payload) => {
      if (!config.USE_MOCK) {
        queryClient.invalidateQueries({ queryKey });
        queryClient.invalidateQueries({
          queryKey: clientFeedbackKeys.byRequest(payload.requestId),
        });
        queryClient.invalidateQueries({ queryKey: ['request', payload.requestId] });
      }
    },
  });
}