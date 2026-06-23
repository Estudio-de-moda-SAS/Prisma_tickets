// src/features/requests/hooks/useCloseRequest.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import { requestKeys } from './useRequests';
import { COLUMNAS_FINALES } from '../types';
import type { BoardData, CierreInfo, CerrarRequestPayload, Equipo, KanbanColumna } from '../types';

type CloseContext = { snapshot: BoardData | undefined };

export function useCloseRequest(equipo: Equipo) {
  const queryClient  = useQueryClient();
  const { Requests } = useGraphServices();
  const queryKey     = requestKeys.byEquipo(equipo);

  return useMutation<CierreInfo, Error, CerrarRequestPayload, CloseContext>({
    mutationFn: async (payload): Promise<CierreInfo> => {
      if (config.USE_MOCK) {
        await new Promise((r) => setTimeout(r, 600));
        return {
          closureId:      Math.floor(Math.random() * 9000) + 1000,
          closureNote:    payload.closureNote,
          attachments:    [],
          attachmentUrl:  null,
          attachmentName: null,
          attachmentMime: null,
          closedAt:       new Date().toISOString(),
          closedBy: {
            userId:   payload.closedBy,
            userName: 'Usuario Mock',
          },
        };
      }
      return Requests.closeRequest(payload);
    },

    onMutate: async (payload): Promise<CloseContext> => {
      await queryClient.cancelQueries({ queryKey });
      const snapshot = queryClient.getQueryData<BoardData>(queryKey);

      const targetColumna = columnIdToKanban(payload.targetColumnId);
      const esFinal       = COLUMNAS_FINALES.has(targetColumna);

      queryClient.setQueryData<BoardData>(queryKey, (prev) => {
        if (!prev) return prev;

        const card = Object.values(prev).flat().find((r) => r.id === String(payload.requestId));
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
          next[col] = next[col].filter((r) => r.id !== String(payload.requestId));
        }

        next[targetColumna] = [
          ...next[targetColumna],
          {
            ...card,
            columna:  targetColumna,
            columnId: payload.targetColumnId,
            // Solo sellar fechaCierre y progreso si es columna final (hecho/historial)
            ...(esFinal ? { fechaCierre: new Date().toISOString(), progreso: 100 } : {}),
            cierreInfo: {
              closureId:      0,
              closureNote:    payload.closureNote,
              closureType:    payload.evidenceMode ?? 'new',
              attachments:    [],
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

    onSuccess: (cierreInfo, payload) => {
      const targetColumna = columnIdToKanban(payload.targetColumnId);
      const esFinal       = COLUMNAS_FINALES.has(targetColumna);
      queryClient.setQueryData<BoardData>(queryKey, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          [targetColumna]: prev[targetColumna].map((r) =>
            r.id === String(payload.requestId)
              ? {
                  ...r,
                  cierreInfo,
                  ...(esFinal ? { fechaCierre: cierreInfo.closedAt } : {}),
                }
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

function columnIdToKanban(columnId: number): KanbanColumna {
  const map: Record<number, KanbanColumna> = {
    1:  'sin_categorizar',
    2:  'icebox',
    3:  'backlog',
    4:  'todo',
    5:  'en_progreso',
    8:  'en_revision_qas',
    10: 'cliente_review',   // ← faltaba este
    7:  'ready_to_deploy',
    6:  'hecho',
    9:  'historial',
  };
  return map[columnId] ?? 'sin_categorizar';
}