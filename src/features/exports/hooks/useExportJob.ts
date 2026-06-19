// src/features/exports/hooks/useExportJob.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { ExportBackgroundJob } from '../types';

/**
 * Hook de polling para un job de export.
 * - Refetch cada 2s mientras esté pending o running
 * - Se detiene al llegar a done o failed
 */
export function useExportJob(jobId: string | null) {
  return useQuery<ExportBackgroundJob>({
    queryKey: ['export-job', jobId],
    queryFn:  () => apiClient.call('getBackgroundJob', { jobId }),
    enabled:  !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.Job_Status;
      if (status === 'done' || status === 'failed') return false;
      return 2000;
    },
    staleTime: 0,
  });
}