// src/features/requests/hooks/useAcceptanceCriteria.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { AcceptanceCriteria } from '@/types/commons';

export const criteriaKeys = {
  byRequest: (requestId: string) => ['acceptance-criteria', requestId] as const,
};

export function useAcceptanceCriteria(requestId: string | null | undefined) {
  return useQuery<AcceptanceCriteria[]>({
    queryKey: criteriaKeys.byRequest(requestId ?? ''),
    queryFn:  () => apiClient.call('fetchAcceptanceCriteria', { requestId }),
    enabled:  !!requestId,
    staleTime: 30_000,
  });
}

export function useCreateCriteria(requestId: string) {
  const qc = useQueryClient();
  return useMutation<AcceptanceCriteria, Error, { title: string }>({
    mutationFn: ({ title }) =>
      apiClient.call('createAcceptanceCriteria', { requestId, title }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: criteriaKeys.byRequest(requestId) });
    },
  });
}

type UpdateStatusPayload = {
  criteriaId:    number;
  status:        'accepted' | 'rejected' | 'pending';
  reviewedBy:    number;
  reviewerNotes?: string;
};

type UpdateStatusContext = { snapshot: AcceptanceCriteria[] | undefined };

export function useUpdateCriteriaStatus(requestId: string) {
  const qc = useQueryClient();
  const queryKey = criteriaKeys.byRequest(requestId);

  return useMutation<AcceptanceCriteria, Error, UpdateStatusPayload, UpdateStatusContext>({
    mutationFn: ({ criteriaId, status, reviewedBy, reviewerNotes }) =>
      apiClient.call('updateAcceptanceCriteriaStatus', {
        criteriaId,
        status,
        reviewedBy,
        reviewerNotes: reviewerNotes ?? null,
      }),

    onMutate: async ({ criteriaId, status, reviewerNotes }): Promise<UpdateStatusContext> => {
      await qc.cancelQueries({ queryKey });
      const snapshot = qc.getQueryData<AcceptanceCriteria[]>(queryKey);

      qc.setQueryData<AcceptanceCriteria[]>(queryKey, (prev) =>
        prev?.map((c) =>
          c.criteriaId === criteriaId
            ? { ...c, status, reviewerNotes: reviewerNotes ?? c.reviewerNotes }
            : c,
        ),
      );

      return { snapshot };
    },

    onError: (_err, _payload, context) => {
      if (context?.snapshot) {
        qc.setQueryData<AcceptanceCriteria[]>(queryKey, context.snapshot);
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey });
    },
  });
}

export function useDeleteCriteria(requestId: string) {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, { criteriaId: number }>({
    mutationFn: ({ criteriaId }) =>
      apiClient.call('deleteAcceptanceCriteria', { criteriaId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: criteriaKeys.byRequest(requestId) });
    },
  });
}