// src/features/requests/hooks/useSubRequests.ts
import { useQuery } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import type { Request } from '../types';

/**
 * Hook de solo lectura para las sub-solicitudes (hijas) de un request padre.
 *
 * Expone {@link subRequestKeys} (fábrica de query keys) y {@link useChildRequests},
 * que lista las requests hijas de un padre dado.
 *
 * @module useSubRequests
 */

/* ── Query key ── */

/** Fábrica de query keys de sub-requests, por request padre. */
export const subRequestKeys = {
  byParent: (parentId: string) => ['requests', 'children', parentId] as const,
};

/* ── Hook: listar requests hijas de una request padre ── */

/**
 * Lista las requests hijas de un request padre.
 *
 * @remarks
 * En modo mock devuelve `[]`. Usa `staleTime: 0` y `refetchOnMount: true` para
 * reflejar altas/bajas de hijas al instante; sin refetch al enfocar la ventana.
 *
 * @param parentId - ID del request padre.
 * @returns El resultado de `useQuery` con las requests hijas.
 */
export function useChildRequests(parentId: string) {
  const { Requests } = useGraphServices();

  return useQuery<Request[]>({
    queryKey: subRequestKeys.byParent(parentId),
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve([])
      : () => Requests.fetchChildRequests(parentId),
    staleTime:            0,
    refetchOnMount:       true,
    refetchOnWindowFocus: false,
    retry:                config.USE_MOCK ? false : 1,
  });
}