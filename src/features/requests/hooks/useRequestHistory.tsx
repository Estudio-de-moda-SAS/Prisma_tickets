import { useQuery } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import type { RequestHistoryEntry } from '../types';

/**
 * Hook de solo lectura para el historial de cambios de un request.
 *
 * Expone {@link historyKeys} (fábrica de query keys) y {@link useRequestHistory},
 * que lee las entradas de historial (auditoría) de un ticket.
 *
 * @module useRequestHistory
 */

/** Fábrica de query keys del historial, por request. */
export const historyKeys = {
  byRequest: (id: string) => ['request-history', id] as const,
};

/**
 * Lee el historial de cambios de un request.
 *
 * @remarks
 * Se deshabilita si falta `requestId` o `requesterId`, o en modo mock. Usa
 * `staleTime: 0` y `refetchOnMount: 'always'` para que el historial se refresque
 * siempre al abrir el detalle (el usuario espera ver los cambios más recientes).
 *
 * @param requestId - ID del request, o `null` para no consultar.
 * @param requesterId - Usuario que solicita el historial (para autorización), o
 *   `null`/`undefined` para no consultar.
 * @returns El resultado de `useQuery` con las entradas de historial.
 */
export function useRequestHistory(requestId: string | null, requesterId: number | null | undefined) {
  const { Requests } = useGraphServices();
  return useQuery<RequestHistoryEntry[]>({
    queryKey: historyKeys.byRequest(requestId ?? ''),
    queryFn:  () => Requests.fetchRequestHistory(requestId!, requesterId!),
    enabled:  !!requestId && !!requesterId && !config.USE_MOCK,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}