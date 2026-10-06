/**
 * Estadísticas por board: actuales, del sprint anterior y combinadas.
 *
 * @module stats/useBoardStats
 */

import { useMemo } from 'react';
import type { Request } from '@/features/requests/types';
import type { BoardTeam } from '@/features/requests/hooks/useBoardMetadata';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import { calcBoard, calcBoardCombined } from './lib/calcBoard';
import { findPrevSprint } from './lib/sprints';
import type { BoardStatsReal, StatsConfig } from './types';

/**
 * Calcula el board de cada equipo para una selección de sprints.
 *
 * @param requests - Requests con filtro de usuario.
 * @param teams - Equipos del board.
 * @param statsConfig - Configuración de stats.
 * @param sprints - Todos los sprints.
 * @param selected - Sprints a los que acotar.
 * @returns Un registro `código de equipo → stats`.
 */
function calcBoardsByTeam(requests: Request[], teams: BoardTeam[], statsConfig: StatsConfig | undefined, sprints: Sprint[], selected: Sprint[]): Record<string, BoardStatsReal> {
  return Object.fromEntries(
    teams.map(t => [t.Board_Team_Code, calcBoard(requests, t.Board_Team_Code, statsConfig, sprints, selected)]),
  );
}

/**
 * Calcula los boards por equipo, los del sprint anterior y el combinado.
 *
 * @param requests - Requests con filtro de usuario.
 * @param teams - Equipos del board.
 * @param statsConfig - Configuración de stats.
 * @param sprints - Todos los sprints.
 * @param selectedSprints - Sprints seleccionados.
 * @param combinedTeams - Equipos combinados (2+ activa el board combinado).
 * @returns `boards`, `boardsPrev` (solo con exactamente 1 sprint y anterior del
 *   mismo linaje) y `boardCombined` (solo con 2+ equipos).
 */
export function useBoardStats(
  requests:        Request[],
  teams:           BoardTeam[],
  statsConfig:     StatsConfig | undefined,
  sprints:         Sprint[],
  selectedSprints: Sprint[],
  combinedTeams:   string[],
) {

  const boards = useMemo(
    () => calcBoardsByTeam(requests, teams, statsConfig, sprints, selectedSprints),
    [requests, teams, statsConfig, sprints, selectedSprints],
  );

  const boardsPrev = useMemo(() => {
    if (selectedSprints.length !== 1) return null;
    const prev = findPrevSprint(selectedSprints[0], sprints);
    if (!prev) return null;
    return calcBoardsByTeam(requests, teams, statsConfig, sprints, [prev]);
  }, [requests, teams, statsConfig, sprints, selectedSprints]);

  const boardCombined = useMemo(() => {
    if (combinedTeams.length < 2) return null;
    return calcBoardCombined(requests, combinedTeams, statsConfig, sprints, selectedSprints);
  }, [requests, combinedTeams, statsConfig, sprints, selectedSprints]);

  return { boards, boardsPrev, boardCombined };
}
