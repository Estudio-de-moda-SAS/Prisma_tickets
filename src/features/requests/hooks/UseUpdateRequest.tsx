import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import { requestKeys } from './useRequests';
import type { BoardData, Equipo, KanbanColumna, Request } from '../types';

type UpdatePayload = {
  id:    string;
  patch: Partial<Pick<
    Request,
    | 'titulo'
    | 'descripcion'
    | 'categoria'
    | 'labelIds'
    | 'equipo'
    | 'equipoIds'
    | 'subTeamIds'
    | 'prioridad'
    | 'assignees'
    | 'progreso'
    | 'sprintId'
    | 'deadline'
  >>;
};

type MutationContext = { snapshot: BoardData | undefined };

export function useUpdateRequest(equipo: Equipo) {
  const queryClient  = useQueryClient();
  const { Requests } = useGraphServices();
  const queryKey     = requestKeys.byEquipo(equipo);

  return useMutation<void, Error, UpdatePayload, MutationContext>({
    mutationFn: async ({ id, patch }) => {
      if (config.USE_MOCK) return;
      await Requests.updateRequest({
        id,
        titulo:      patch.titulo,
        descripcion: patch.descripcion,
        prioridad:   patch.prioridad,
        progreso:    patch.progreso,
        equipoIds:   patch.equipoIds,
        subTeamIds:  patch.subTeamIds,
        labelIds:    patch.labelIds,
        sprintId:    patch.sprintId,
        deadline:    patch.deadline,
      });
    },

    onMutate: async ({ id, patch }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<BoardData>(queryKey);

      queryClient.setQueryData<BoardData>(queryKey, (prev) => {
        if (!prev) return prev;
        const next = {} as BoardData;
        for (const col of Object.keys(prev) as KanbanColumna[]) {
          next[col] = prev[col].map((r) =>
            r.id === id ? { ...r, ...patch } : r,
          );
        }
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
        queryClient.invalidateQueries({ queryKey: requestKeys.all });
      }
    },
  });
}