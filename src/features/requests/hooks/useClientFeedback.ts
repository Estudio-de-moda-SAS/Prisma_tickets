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

/* ── Query key ── */
export const clientFeedbackKeys = {
  byRequest: (requestId: string) => ['clientFeedback', requestId] as const,
};

/* ── Fetch del historial completo de feedback ── */
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
type SubmitContext = { snapshot: BoardData | undefined };

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