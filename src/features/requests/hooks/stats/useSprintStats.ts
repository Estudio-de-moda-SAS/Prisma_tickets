/**
 * Métricas de sprint (memoizadas).
 *
 * @module stats/useSprintStats
 */

import { useMemo } from 'react';
import type { Request } from '@/features/requests/types';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import { calcSprint } from './lib/calcSprint';
import type { SprintStats, StatsConfig } from './types';

/**
 * Calcula las métricas del/los sprint(s) seleccionado(s).
 *
 * @param requests - Requests con scope de usuario + equipo, sin filtro de sprint.
 * @param selectedSprints - Sprints seleccionados.
 * @param sprints - Todos los sprints.
 * @param teamCode - Equipo para resolver la columna de inicio (null en modo combinado).
 * @param statsConfig - Configuración de stats.
 * @param combinedMinPos - `minPos` combinado en modo multiequipo.
 * @returns Las métricas de sprint.
 */
export function useSprintStats(
  requests:        Request[],
  selectedSprints: Sprint[],
  sprints:         Sprint[],
  teamCode:        string | null,
  statsConfig?:    StatsConfig,
  combinedMinPos?: number,
): SprintStats {
  return useMemo(
    () => calcSprint(requests, selectedSprints, statsConfig, teamCode, sprints, combinedMinPos),
    [requests, selectedSprints, statsConfig, teamCode, sprints, combinedMinPos],
  );
}
