// src/features/exports/hooks/useExportHistory.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { ExportHistoryEntry, CreateExportJobResponse } from '../types';

export function useExportHistory(userId: number | null, limit = 20) {
  return useQuery<ExportHistoryEntry[]>({
    queryKey: ['export-history', userId, limit],
    queryFn:  () => apiClient.call('fetchExportHistory', { userId, limit }),
    enabled:  !!userId,
    staleTime: 1000 * 30, // 30s — refresca rápido pero no spamea
  });
}

export function useDeleteExport(userId: number) {
  const qc = useQueryClient();
  return useMutation<{ ok: boolean }, Error, string>({
    mutationFn: (exportId) => apiClient.call('deleteExportHistoryEntry', { exportId, userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['export-history'] }),
  });
}

export function useRepeatExport(userId: number) {
  const qc = useQueryClient();
  return useMutation<CreateExportJobResponse, Error, string>({
    mutationFn: (exportId) => apiClient.call('repeatExport', { exportId, userId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['export-history'] }),
  });
}