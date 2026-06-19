// src/features/exports/hooks/useCreateExportJob.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { CreateExportJobPayload, CreateExportJobResponse } from '../types';

export function useCreateExportJob() {
  const qc = useQueryClient();
  return useMutation<CreateExportJobResponse, Error, CreateExportJobPayload>({
    mutationFn: (payload) => apiClient.call('createExportJob', payload),
    onSuccess: () => {
      // Invalidar historial para que aparezca el nuevo job inmediatamente
      qc.invalidateQueries({ queryKey: ['export-history'] });
    },
  });
}