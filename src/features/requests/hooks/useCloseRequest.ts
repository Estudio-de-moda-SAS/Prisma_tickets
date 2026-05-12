// src/features/requests/hooks/useCloseRequest.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import { requestKeys } from './useRequests';
import type { BoardData, CierreInfo, CerrarRequestPayload, Equipo, KanbanColumna } from '../types';

type CloseContext = { snapshot: BoardData | undefined };

export function useCloseRequest(equipo: Equipo) {
  const queryClient  = useQueryClient();
  const { Requests } = useGraphServices();
  const queryKey     = requestKeys.byEquipo(equipo);

  return useMutation<CierreInfo, Error, CerrarRequestPayload, CloseContext>({
    mutationFn: async (payload) => {
      if (config.USE_MOCK) {
        // Mock: simular respuesta de cierre
        await new Promise((r) => setTimeout(r, 600));
        return {
          closureId:      Math.floor(Math.random() * 9000) + 1000,
          closureNote:    payload.closureNote,
          attachmentUrl:  payload.attachment ? URL.createObjectURL(payload.attachment) : null,
          attachmentName: payload.attachment?.name ?? null,
          attachmentMime: payload.attachment?.type ?? null,
          closedAt:       new Date().toISOString(),
          closedBy: {
            userId:   payload.closedBy,
            userName: 'Usuario Mock',
          },
        };
      }
      return Requests.closeRequest(payload);
    },

    // Actualización optimista
    onMutate: async (payload): Promise<CloseContext> => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<BoardData>(queryKey);

      const targetColumna = columnIdToKanban(payload.targetColumnId);

      queryClient.setQueryData<BoardData>(queryKey, (prev) => {
        if (!prev) return prev;

        const card = Object.values(prev).flat().find((r) => r.id === String(payload.requestId));
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

        // Quitar de columna origen
        for (const col of Object.keys(next) as KanbanColumna[]) {
          next[col] = next[col].filter((r) => r.id !== String(payload.requestId));
        }

        // Insertar en columna destino con datos optimistas de cierre
        next[targetColumna] = [
          ...next[targetColumna],
          {
            ...card,
            columna:    targetColumna,
            columnId:   payload.targetColumnId,
            fechaCierre: new Date().toISOString(),
            progreso:   100,
            cierreInfo: {
              closureId:      0, // se actualiza en onSuccess
              closureNote:    payload.closureNote,
              attachmentUrl:  null,
              attachmentName: null,
              attachmentMime: null,
              closedAt:       new Date().toISOString(),
              closedBy: {
                userId:   payload.closedBy,
                userName: '',
              },
            },
          },
        ];

        return next;
      });

      return { snapshot };
    },

    // Actualizar cache con datos reales del servidor (closureId real, url del adjunto, etc.)
    onSuccess: (cierreInfo, payload) => {
      const targetColumna = columnIdToKanban(payload.targetColumnId);

      queryClient.setQueryData<BoardData>(queryKey, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [targetColumna]: prev[targetColumna].map((r) =>
            r.id === String(payload.requestId)
              ? { ...r, cierreInfo, fechaCierre: cierreInfo.closedAt }
              : r,
          ),
        };
      });
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

// Board_Column_ID → KanbanColumna
// IDs según TBL_Board_Columns: 1=sin_cat, 2=icebox, 3=backlog, 4=todo, 5=en_progreso, 7=ready_to_deploy, 6=hecho
function columnIdToKanban(columnId: number): KanbanColumna {
  const map: Record<number, KanbanColumna> = {
    1: 'sin_categorizar',
    2: 'icebox',
    3: 'backlog',
    4: 'todo',
    5: 'en_progreso',
    7: 'ready_to_deploy',
    6: 'hecho',
  };
  return map[columnId] ?? 'hecho';
}