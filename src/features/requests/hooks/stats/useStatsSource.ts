/**
 * Fuente de datos de estadísticas: board completo (variante stats) y sprints.
 *
 * @module stats/useStatsSource
 */

import { useMemo } from 'react';
import { useBoardCompletoStats } from '@/features/requests/hooks/useRequests';
import { useSprints } from '@/features/requests/hooks/useSprints';
import type { Request } from '@/features/requests/types';
import type { Sprint } from '@/features/requests/hooks/useSprints';

/**
 * Carga el board completo y los sprints, y aplana los requests.
 *
 * @returns Todos los requests, los sprints y el estado de carga/error combinado.
 */
export function useStatsSource() {
  const boardQuery   = useBoardCompletoStats();
  const sprintsQuery = useSprints();

  const allRequests: Request[] = useMemo(() => {
    if (!boardQuery.data) return [];
    return Object.values(boardQuery.data).flat();
  }, [boardQuery.data]);
  
  const sprints: Sprint[] = useMemo(() => sprintsQuery.data ?? [], [sprintsQuery.data]);

  return {
    allRequests,
    sprints,
    isLoading: boardQuery.isLoading || sprintsQuery.isLoading,
    isError:   boardQuery.isError   || sprintsQuery.isError,
  };
}
