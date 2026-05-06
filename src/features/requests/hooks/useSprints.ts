// src/features/requests/hooks/useSprints.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';

export type Sprint = {
  Sprint_ID:         number;
  Sprint_Text:       string;
  Sprint_Start_Date: string;
  Sprint_End_Date:   string;
};

const MOCK_SPRINTS: Sprint[] = [
  { Sprint_ID: 1, Sprint_Text: 'Sprint 1', Sprint_Start_Date: '2026-04-01', Sprint_End_Date: '2026-04-14' },
  { Sprint_ID: 2, Sprint_Text: 'Sprint 2', Sprint_Start_Date: '2026-04-15', Sprint_End_Date: '2026-04-30' },
];

export function useSprints() {
  return useQuery<Sprint[]>({
    queryKey: ['sprints'],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_SPRINTS)
      : () => apiClient.call<Sprint[]>('fetchSprints', {}),
    staleTime: 60_000,
    retry:     1,
  });
}

export function useCreateSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: { text: string; startDate: string; endDate: string }) =>
      apiClient.call('createSprint', { text: s.text, startDate: s.startDate, endDate: s.endDate }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints'] }),
  });
}

export function useUpdateSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: { id: number; text: string; startDate: string; endDate: string }) =>
      apiClient.call('updateSprint', s),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprints'] }),
  });
}

export function useDeleteSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteSprint', { id }),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['sprints'] }),
  });
}