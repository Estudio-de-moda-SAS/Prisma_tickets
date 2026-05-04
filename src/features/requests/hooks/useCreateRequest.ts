// src/features/requests/hooks/useCreateRequest.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import { requestKeys } from './useRequests';
import { subRequestKeys } from './useSubRequest';
import type { CrearRequestPayload, Request } from '../types';

export function useCreateRequest() {
  const qc               = useQueryClient();
  const { Requests }     = useGraphServices();

  return useMutation<Request, Error, CrearRequestPayload>({
    mutationFn: async (payload) => {
      if (config.USE_MOCK) {
        // Devuelve un objeto mínimo para mock
        return {
          id:              `mock-${Date.now()}`,
          templateId:      payload.templateId,
          parentId:        payload.parentId,
          titulo:          payload.titulo,
          descripcion:     payload.descripcion,
          columna:         'sin_categorizar',
          columnId:        payload.columnId,
          prioridad:       payload.prioridad,
          score:           3,
          progreso:        0,
          solicitante:     '',
          solicitanteId:   payload.requestedBy,
          assignees:       [],
          equipo:          [],
          equipoIds:       payload.equipoIds,
          boardTeamId:     null,
          subTeamIds:      payload.subTeamIds,
          subTeamNames:    [],
          categoria:       [],
          labelIds:        payload.labelIds,
          sprintId:        payload.sprintId,
          sprintName:      null,
          fechaApertura:   new Date().toISOString(),
          deadline:        payload.deadline,
          fechaCierre:     null,
          tiempoConsuмido: null,
          extraFields:     null,
        } as Request;
      }
      return Requests.createRequest(payload);
    },

    onSuccess: (newRequest) => {
      // Invalida el board completo para que aparezca la nueva card
      qc.invalidateQueries({ queryKey: requestKeys.all });

      // Si es una sub-request, invalida también la lista de hijos del padre
      if (newRequest.parentId !== null) {
        qc.invalidateQueries({
          queryKey: subRequestKeys.byParent(newRequest.parentId),
        });
      }
    },
  });
}