// src/features/requests/hooks/useMoveRequests.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import { requestKeys } from './useRequests';
import type { BoardData, Equipo, KanbanColumna } from '../types';

type MovePayload = {
  id:        string;
  columna:   KanbanColumna;
  columnId?: number;
};

type MutationContext = { snapshot: BoardData | undefined };

export function useMoveRequest(equipo: Equipo) {
  const queryClient  = useQueryClient();
  const { Requests } = useGraphServices();
  const queryKey     = requestKeys.byEquipo(equipo);

  return useMutation<void, Error, MovePayload, MutationContext>({
    mutationFn: async (payload) => {
      if (config.USE_MOCK) return;
      if (!payload.columnId) {
        throw new Error('[useMoveRequest] columnId es requerido en modo real');
      }
      await Requests.moveToColumn({
        id:       payload.id,
        columna:  payload.columna,
        columnId: payload.columnId,
      });
    },

    onMutate: async (payload): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<BoardData>(queryKey);

      queryClient.setQueryData<BoardData>(queryKey, (prev) => {
        if (!prev) return prev;

        const card = Object.values(prev).flat().find((r) => r.id === payload.id);
        if (!card) return prev;

        const next: BoardData = {
          sin_categorizar: [...prev.sin_categorizar],
          icebox:          [...prev.icebox],
          backlog:         [...prev.backlog],
          todo:            [...prev.todo],
          en_progreso:     [...prev.en_progreso],
          ready_to_deploy: [...(prev.ready_to_deploy ?? [])],
          hecho:           [...prev.hecho],
        };

        for (const col of Object.keys(next) as KanbanColumna[]) {
          next[col] = next[col].filter((r) => r.id !== payload.id);
        }

        next[payload.columna] = [
          ...next[payload.columna],
          {
            ...card,
            columna:  payload.columna,
            columnId: payload.columnId ?? card.columnId,
          },
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

    onSettled: () => {
      if (!config.USE_MOCK) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}