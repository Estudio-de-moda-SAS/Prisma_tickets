/* ============================================================
   useStatsData — compone todas las métricas de estadísticas
   ============================================================ */

/**
 * Punto de entrada de las métricas de estadísticas del board.
 *
 * Compone los subhooks de `./stats/`: fuente de datos, selección de sprints,
 * filtros (scope), métricas generales, por board/equipo (actual, sprint anterior
 * y combinado), de sprint, de flujo/salud y el equipo principal por usuario. El
 * cálculo puro vive en `./stats/lib/`. Todo se deriva en cliente sobre los
 * requests ya cargados, sin llamadas extra al backend.
 *
 * @remarks
 * Conceptos transversales:
 * - **Columnas done** (`DONE_COLUMNS`) siempre cuentan como resueltas,
 *   ignorando la columna de inicio de stats (arregla históricos en "historial").
 * - **Linaje de sprint**: con fecha (PRISMA) vs sin fecha (histórico migrado); no
 *   se cruzan al comparar contra el sprint anterior.
 * - **Crédito único** (`buildCreditSprint`): cada solicitud terminada cuenta
 *   como finalizada en un solo sprint. Si se cierra después del fin de su sprint,
 *   se acredita al sprint en cuya ventana se cerró, no al original.
 * - **Arrastre**: solicitudes de otros sprints acreditadas al sprint seleccionado;
 *   suman a resolutores y (en columna 'hecho') al puntaje.
 * - **Penalización**: actualmente desactivada ({@link PENALIZACION_ACTIVA}).
 *
 * @module useStatsData
 */

import type { BoardTeam } from '@/features/requests/hooks/useBoardMetadata';
import { useStatsSource }     from './stats/useStatsSource';
import { useSelectedSprints } from './stats/useSelectedSprints';
import { useStatsScope }      from './stats/useStatsScope';
import { usePrimaryTeamMap }  from './stats/usePrimaryTeamMap';
import { useGeneralStats }    from './stats/useGeneralStats';
import { useBoardStats }      from './stats/useBoardStats';
import { useSprintStats }     from './stats/useSprintStats';
import { useFlowStats }       from './stats/useFlowStats';
import type { StatsConfig, StatsData } from './stats/types';

export type * from './stats/types';
export { PENALIZACION_ACTIVA } from './stats/constants';
export { isBlockedLabelName }  from './stats/lib/predicates';
export { calcFlowMetrics }     from './stats/lib/calcFlowMetrics';

/**
 * Hook principal: calcula todas las métricas de estadísticas según los filtros.
 *
 * @remarks
 * Los filtros por usuario y por equipo/combinación se aplican en cascada antes
 * de cada cálculo; cada bloque se memoiza en su subhook.
 *
 * @param selectedSprintIds - IDs de sprints seleccionados.
 * @param teams - Equipos del board.
 * @param userFilter - Usuario por el que filtrar, o `null`.
 * @param teamCodeFilter - Equipo específico al que acotar el sprint, o `null`.
 * @param statsConfig - Configuración de stats (posiciones e inicio por equipo).
 * @param combinedTeams - Equipos combinados; con 2+ la vista de detalle usa la unión.
 * @returns El paquete completo de {@link StatsData}.
 */
export function useStatsData(
  selectedSprintIds: number[],
  teams:            BoardTeam[]    = [],
  userFilter:       number | null  = null,
  /** Cuando se elige un equipo específico, el sprint se filtra a ese equipo */
  teamCodeFilter:   string | null  = null,
  statsConfig?:     StatsConfig,
  /** Equipos combinados (Fase 1). Si tiene 2+, la vista de detalle usa la unión. */
  combinedTeams:    string[]       = [],
): StatsData {
  const { allRequests, sprints, isLoading, isError } = useStatsSource();
  const selectedSprints = useSelectedSprints(sprints, selectedSprintIds);
  const primaryTeamMap  = usePrimaryTeamMap(allRequests);

  const { userScopedRequests, teamScopedRequests, combinedMinPos } =
    useStatsScope(allRequests, userFilter, teamCodeFilter, combinedTeams, statsConfig);

  const general = useGeneralStats(userScopedRequests, teams, statsConfig);
  const { boards, boardsPrev, boardCombined } =
    useBoardStats(userScopedRequests, teams, statsConfig, sprints, selectedSprints, combinedTeams);
  const sprint = useSprintStats(
    teamScopedRequests, selectedSprints, sprints,
    combinedTeams.length >= 2 ? null : teamCodeFilter,
    statsConfig, combinedMinPos,
  );
  /** Flujo/salud — mismo universo que el sprint (usuario + equipo), sin filtro de sprint. */
  const flow = useFlowStats(teamScopedRequests);

  return {
    general, boards, boardsPrev, boardCombined, sprint, flow,
    allRequests, primaryTeamMap, sprints,
    isLoading, isError,
  };
}
