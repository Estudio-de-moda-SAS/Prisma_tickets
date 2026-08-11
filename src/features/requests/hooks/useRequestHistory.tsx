import { useQuery } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import type { RequestHistoryEntry } from '../types';

export const historyKeys = {
  byRequest: (id: string) => ['request-history', id] as const,
};

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