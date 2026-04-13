import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import { requestKeys } from './useRequests';
import type { BoardData, Equipo, KanbanColumna } from '../types';

type MovePayload = {
  id:      string;
  columna: KanbanColumna;
  equipo?: Equipo;
};

export function useMoveRequest(equipo: Equipo) {
  const queryClient  = useQueryClient();
  const { Requests } = useGraphServices();
  const queryKey     = requestKeys.byEquipo(equipo);

  return useMutation({
    mutationFn: (payload: MovePayload) =>
      config.USE_MOCK
        ? Promise.resolve(undefined as any)
        : Requests.mover({ id: payload.id, columna: payload.columna, equipo: payload.equipo }),

    // 1. Mueve la tarjeta localmente de inmediato
    onMutate: async (payload) => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<BoardData>(queryKey);

      queryClient.setQueryData<BoardData>(queryKey, (prev) => {
        if (!prev) return prev;

        const card = Object.values(prev)
          .flat()
          .find((r) => r.id === payload.id);

        if (!card) return prev;

        const next: BoardData = {
          sin_categorizar: [...prev.sin_categorizar],
          icebox:          [...prev.icebox],
          backlog:         [...prev.backlog],
          todo:            [...prev.todo],
          en_progreso:     [...prev.en_progreso],
          hecho:           [...prev.hecho],
        };

        // Quita de todas las columnas
        for (const col of Object.keys(next) as KanbanColumna[]) {
          next[col] = next[col].filter((r) => r.id !== payload.id);
        }

        // Inserta en la columna destino
        next[payload.columna] = [
          ...next[payload.columna],
          { ...card, columna: payload.columna },
        ];

        return next;
      });

      return { snapshot };
    },

    // 2. Revertir si falla
    onError: (_err, _payload, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData<BoardData>(queryKey, context.snapshot);
      }
    },

    // 3. Solo revalida con SP real — en mock el estado local es la verdad
    onSettled: () => {
      if (!config.USE_MOCK) {
        queryClient.invalidateQueries({ queryKey });
      }
    },
  });
}