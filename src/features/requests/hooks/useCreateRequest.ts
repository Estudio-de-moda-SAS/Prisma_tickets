// src/features/requests/hooks/useCreateRequest.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { apiClient } from '@/lib/apiClient';
import { requestKeys } from './useRequests';
import { subRequestKeys } from './useSubRequest';
import { criteriaKeys } from './useAcceptanceCriteria';
import type { CrearRequestPayload, Request } from '../types';

/**
 * Hook de TanStack Query para crear un request.
 *
 * Expone {@link useCreateRequest}, que crea el request base y luego, en paralelo,
 * da de alta sus criterios de aceptación y sus asignaciones. Al terminar refresca
 * las cachés afectadas (listado, subrequests del padre y criterios del nuevo).
 *
 * @module useCreateRequest
 */

/**
 * Mutación para crear un request con sus criterios y asignaciones.
 *
 * @remarks
 * Flujo del `mutationFn`: separa `acceptanceCriteria` y `assigneeIds` del resto
 * del payload y crea primero el request base (sin criterios). Con el ID
 * resultante, lanza en paralelo (`Promise.all`) una llamada `createAcceptanceCriteria`
 * por cada título y una `assignRequest` por cada asignado (usando `requestedBy`
 * como `assignedBy`).
 *
 * En `onSuccess` fuerza un `refetchQueries` del listado (fetch inmediato, no solo
 * marcar stale); si el nuevo request tiene padre, invalida los subrequests de ese
 * padre; y siempre invalida los criterios del nuevo request.
 *
 * @returns El objeto de mutación de React Query. Variables: {@link CrearRequestPayload}.
 */
export function useCreateRequest() {
  const qc           = useQueryClient();
  const { Requests } = useGraphServices();

  return useMutation<Request, Error, CrearRequestPayload>({
    mutationFn: async (payload) => {
      const { acceptanceCriteria, assigneeIds = [], ...rest } = payload;

      const newRequest = await Requests.createRequest({ ...rest, acceptanceCriteria: [] });

      await Promise.all([
        ...acceptanceCriteria.map((title) =>
          apiClient.call('createAcceptanceCriteria', {
            requestId: newRequest.id,
            title,
          }),
        ),
        ...assigneeIds.map((userId) =>
          apiClient.call('assignRequest', {
            requestId:  newRequest.id,
            userId,
            assignedBy: payload.requestedBy,
          }),
        ),
      ]);

      return newRequest;
    },

    onSuccess: (newRequest) => {
      // refetchQueries fuerza el fetch inmediato, no solo marca stale
      qc.refetchQueries({ queryKey: requestKeys.all });

      if (newRequest.parentId !== null) {
        qc.invalidateQueries({
          queryKey: subRequestKeys.byParent(newRequest.parentId),
        });
      }

      qc.invalidateQueries({
        queryKey: criteriaKeys.byRequest(newRequest.id),
      });
    },
  });
}