/**
 * Filtros en cascada (usuario → equipo/combinación) sobre los requests de stats.
 *
 * @module stats/useStatsScope
 */

import { useMemo } from 'react';
import type { Request } from '@/features/requests/types';
import { combinedMinPosOf } from './lib/calcBoard';
import type { StatsConfig } from './types';
/**
 * Aplica los filtros de usuario y de equipo/combinación.
 *
 * @param allRequests - Todos los requests.
 * @param userFilter - Usuario por el que filtrar, o `null`.
 * @param teamCodeFilter - Equipo específico, o `null`.
 * @param combinedTeams - Equipos combinados (2+ activa el modo unión).
 * @param statsConfig - Configuración de stats.
 * @returns `userScopedRequests` (solo usuario), `teamScopedRequests` (usuario + equipo)
 *   y `combinedMinPos` (undefined si no hay combinación o config).
 */
export function useStatsScope(
  allRequests:    Request[],
  userFilter:     number | null,
  teamCodeFilter: string | null,
  combinedTeams:  string[],
  statsConfig?:   StatsConfig,
) {
  /** Requests filtrados solo por assignee */
  const userScopedRequests = useMemo(() => {
    if (!userFilter) return allRequests;
    return allRequests.filter(r => r.assignees.some(a => a.userId === userFilter));
  }, [allRequests, userFilter]);

  /** Requests filtrados por usuario + equipo (sin filtro de sprint) — para sprint y flujo.
   *  Modo combinado (2+ equipos): unión deduplicada de los seleccionados.
   *  Modo clásico: el único teamCodeFilter. */
  const teamScopedRequests = useMemo(() => {
    if (combinedTeams.length >= 2) {
      const teamSet = new Set(combinedTeams);
      return userScopedRequests.filter(r => r.equipo.some(eq => teamSet.has(eq)));
    }
    if (!teamCodeFilter) return userScopedRequests;
    return userScopedRequests.filter(r => r.equipo.includes(teamCodeFilter));
  }, [userScopedRequests, teamCodeFilter, combinedTeams]);

  /** minPos combinado: mínimo de los statsStartByTeam de los equipos seleccionados. */
  const combinedMinPos = useMemo(() => {
    if (combinedTeams.length < 2 || !statsConfig) return undefined;
    return combinedMinPosOf(combinedTeams, statsConfig);
  }, [combinedTeams, statsConfig]);

  return { userScopedRequests, teamScopedRequests, combinedMinPos };
}
