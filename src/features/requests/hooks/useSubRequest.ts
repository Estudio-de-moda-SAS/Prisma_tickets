// src/features/requests/hooks/useSubRequests.ts
import { useQuery } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import type { Request } from '../types';

/* ── Query key ── */
export const subRequestKeys = {
  byParent: (parentId: number) => ['requests', 'children', parentId] as const,
};

/* ── Hook: listar requests hijas de una request padre ── */
export function useChildRequests(parentId: number) {
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