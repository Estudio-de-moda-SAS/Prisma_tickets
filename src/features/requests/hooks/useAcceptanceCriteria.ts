// src/features/requests/hooks/useAcceptanceCriteria.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { AcceptanceCriteria } from '@/types/commons';

/* ── Query keys ── */
export const criteriaKeys = {
  byRequest: (requestId: string) => ['acceptance-criteria', requestId] as const,
};

/* ── Fetch ── */
export function useAcceptanceCriteria(requestId: string | null | undefined) {
  return useQuery<AcceptanceCriteria[]>({
    queryKey: criteriaKeys.byRequest(requestId ?? ''),
    queryFn:  () => apiClient.call('fetchAcceptanceCriteria', { requestId }),
    enabled:  !!requestId,
    staleTime: 30_000,
  });
}

/* ── Crear ── */
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

/* ── Actualizar estado ── */
export function useUpdateCriteriaStatus(requestId: string) {
  const qc = useQueryClient();
  return useMutation<
    AcceptanceCriteria,
    Error,
    { criteriaId: number; status: 'accepted' | 'rejected' | 'pending'; reviewedBy: number; reviewerNotes?: string }
  >({
    mutationFn: ({ criteriaId, status, reviewedBy, reviewerNotes }) =>
      apiClient.call('updateAcceptanceCriteriaStatus', {
        criteriaId,
        status,
        reviewedBy,
        reviewerNotes: reviewerNotes ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: criteriaKeys.byRequest(requestId) });
    },
  });
}

/* ── Eliminar ── */
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