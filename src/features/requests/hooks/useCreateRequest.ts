// src/features/requests/hooks/useCreateRequest.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { apiClient } from '@/lib/apiClient';
import { requestKeys } from './useRequests';
import { subRequestKeys } from './useSubRequest';
import { criteriaKeys } from './useAcceptanceCriteria';
import type { CrearRequestPayload, Request } from '../types';

export function useCreateRequest() {
  const qc           = useQueryClient();
  const { Requests } = useGraphServices();

  return useMutation<Request, Error, CrearRequestPayload>({
    mutationFn: async (payload) => {
      const { acceptanceCriteria, ...rest } = payload;

      // 1. Crear el ticket — acceptanceCriteria no va al service, se maneja aparte
      const newRequest = await Requests.createRequest({ ...rest, acceptanceCriteria: [] });

      // 2. Crear los criterios en paralelo
      if (acceptanceCriteria.length > 0) {
        await Promise.all(
          acceptanceCriteria.map((title) =>
            apiClient.call('createAcceptanceCriteria', {
              requestId: newRequest.id,
              title,
            }),
          ),
        );
      }

      return newRequest;
    },

    onSuccess: (newRequest) => {
      qc.invalidateQueries({ queryKey: requestKeys.all });

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