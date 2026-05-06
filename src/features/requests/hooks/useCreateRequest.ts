// src/features/requests/hooks/useCreateRequest.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { requestKeys } from './useRequests';
import { subRequestKeys } from './useSubRequest';
import type { CrearRequestPayload, Request } from '../types';

export function useCreateRequest() {
  const qc           = useQueryClient();
  const { Requests } = useGraphServices();

  return useMutation<Request, Error, CrearRequestPayload>({
    mutationFn: (payload) => Requests.createRequest(payload),

    onSuccess: (newRequest) => {
      qc.invalidateQueries({ queryKey: requestKeys.all });

      if (newRequest.parentId !== null) {
        qc.invalidateQueries({
          queryKey: subRequestKeys.byParent(newRequest.parentId),
        });
      }
    },
  });
}