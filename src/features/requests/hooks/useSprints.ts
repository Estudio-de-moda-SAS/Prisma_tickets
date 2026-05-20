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

const QK = ['sprints'] as const;

export function useSprints() {
  return useQuery<Sprint[]>({
    queryKey: QK,
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
      apiClient.call<Sprint>('createSprint', { text: s.text, startDate: s.startDate, endDate: s.endDate }),

    onMutate: async (s) => {
      await qc.cancelQueries({ queryKey: QK });
      const snapshot = qc.getQueryData<Sprint[]>(QK);

      const tempSprint: Sprint = {
        Sprint_ID:         -Date.now(),
        Sprint_Text:       s.text,
        Sprint_Start_Date: s.startDate,
        Sprint_End_Date:   s.endDate,
      };
      qc.setQueryData<Sprint[]>(QK, (prev) => [...(prev ?? []), tempSprint]);

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<Sprint[]>(QK, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

export function useUpdateSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: { id: number; text: string; startDate: string; endDate: string }) =>
      apiClient.call('updateSprint', s),

    onMutate: async (s) => {
      await qc.cancelQueries({ queryKey: QK });
      const snapshot = qc.getQueryData<Sprint[]>(QK);

      qc.setQueryData<Sprint[]>(QK, (prev) =>
        prev?.map((sp) => sp.Sprint_ID === s.id
          ? { ...sp, Sprint_Text: s.text, Sprint_Start_Date: s.startDate, Sprint_End_Date: s.endDate }
          : sp
        ) ?? []
      );

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<Sprint[]>(QK, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

export function useDeleteSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteSprint', { id }),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QK });
      const snapshot = qc.getQueryData<Sprint[]>(QK);

      qc.setQueryData<Sprint[]>(QK, (prev) =>
        prev?.filter((sp) => sp.Sprint_ID !== id) ?? []
      );

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<Sprint[]>(QK, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}