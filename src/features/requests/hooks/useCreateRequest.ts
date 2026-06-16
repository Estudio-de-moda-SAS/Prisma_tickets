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