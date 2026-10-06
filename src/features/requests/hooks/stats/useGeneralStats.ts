/**
 * Métricas generales del board (memoizadas).
 *
 * @module stats/useGeneralStats
 */

import { useMemo } from 'react';
import type { Request } from '@/features/requests/types';
import type { BoardTeam } from '@/features/requests/hooks/useBoardMetadata';
import { calcGeneral } from './lib/calcGeneral';
import type { GeneralStatsReal, StatsConfig } from './types';

/**
 * Calcula las métricas generales y su desglose por equipo.
 *
 * @param requests - Requests con filtro de usuario.
 * @param teams - Equipos del board.
 * @param statsConfig - Configuración de stats.
 * @returns Las métricas generales.
 */
export function useGeneralStats(requests: Request[], teams: BoardTeam[], statsConfig?: StatsConfig): GeneralStatsReal {
  return useMemo(() => calcGeneral(requests, teams, statsConfig), [requests, teams, statsConfig]);
}
