/**
 * Resolución de los sprints seleccionados a partir de sus IDs.
 *
 * @module stats/useSelectedSprints
 */

import { useMemo } from 'react';
import type { Sprint } from '@/features/requests/hooks/useSprints';

/**
 * Filtra los sprints seleccionados.
 *
 * @param sprints - Todos los sprints.
 * @param selectedSprintIds - IDs seleccionados.
 * @returns Los sprints seleccionados.
 */
export function useSelectedSprints(sprints: Sprint[], selectedSprintIds: number[]): Sprint[] {
  return useMemo(
    () => sprints.filter(s => selectedSprintIds.includes(s.Sprint_ID)),
    [sprints, selectedSprintIds],
  );
}
