import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import { requestKeys } from './useRequests';
import type { BoardData, Equipo, KanbanColumna, Request } from '../types';

type UpdatePayload = {
  id:    string;
  patch: Partial<Pick<Request, 'categoria' | 'equipo' | 'prioridad' | 'resolutor'>>;
};

type MutationContext = { snapshot: BoardData | undefined };

function toSPFields(patch: UpdatePayload['patch']) {
  const sp: Record<string, unknown> = {};
  if ('categoria' in patch) sp['Categoria'] = patch.categoria ?? null;
  if ('equipo'    in patch) sp['Equipo']    = patch.equipo    ?? null;
  if ('prioridad' in patch) sp['Prioridad'] = patch.prioridad ?? null;
  if ('resolutor' in patch) sp['Resolutor'] = patch.resolutor ?? null;
  return sp;
}

export function useUpdateRequest(equipo: Equipo) {
  const queryClient  = useQueryClient();
  const { Requests } = useGraphServices();
  const queryKey     = requestKeys.byEquipo(equipo);

  return useMutation<void, Error, UpdatePayload, MutationContext>({
    mutationFn: async ({ id, patch }) => {
      if (!config.USE_MOCK) {
        await Requests.update(id, toSPFields(patch) as any);
      }
    },

    onMutate: async ({ id, patch }): Promise<MutationContext> => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<BoardData>(queryKey);

      queryClient.setQueryData<BoardData>(queryKey, (prev) => {
        if (!prev) return prev;
        const next = {} as BoardData;
        for (const col of Object.keys(prev) as KanbanColumna[]) {
          next[col] = prev[col].map((r) =>
            r.id === id ? { ...r, ...patch } : r
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
      }
    },
  });
}