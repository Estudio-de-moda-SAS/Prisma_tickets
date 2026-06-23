// src/features/exports/hooks/useExportData.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { ExportFilters, ExportDataset } from '../types';

/**
 * Hook que ejecuta exportRequests en el Edge Function.
 *
 * - enabled: controlado externamente. El wizard solo lo activa cuando
 *   el usuario llega al paso de Preview o pide generar el archivo.
 * - staleTime: 0 — siempre fresh cuando se invoca (no cachear estados
 *   intermedios mientras el usuario tunea filtros).
 * - retry: false — los errores de validación de filtros deben mostrarse
 *   directo, no reintentarse.
 */
export function useExportData(filters: ExportFilters, enabled: boolean) {
  return useQuery<ExportDataset>({
    queryKey: ['export-requests', filters],
    queryFn:  () => apiClient.call('exportRequests', filters),
    enabled,
    staleTime: 0,
    gcTime:    1000 * 60 * 5,  // 5 min: si el usuario vuelve atrás en el wizard sin cambiar nada, no re-fetchear
    retry:     false,
  });
}