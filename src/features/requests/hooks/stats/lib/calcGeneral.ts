/**
 * Métricas generales del board y su desglose por equipo.
 *
 * @module stats/lib/calcGeneral
 */

import type { Request } from '@/features/requests/types';
import type { BoardTeam } from '@/features/requests/hooks/useBoardMetadata';
import { DONE_COLUMNS } from '../constants';
import type { EquipoStatsReal, GeneralStatsReal, StatsConfig } from '../types';
import { daysBetween } from './math';
import { isBlocked, makeCountable } from './predicates';
import { sumScore } from './scoring';

/**
 * Calcula las métricas generales del board y su desglose por equipo.
 *
 * @remarks
 * Las columnas done siempre cuentan (ya pasaron cualquier columna de inicio de
 * stats), sin importar `minPos`; esto evita que históricos en "historial" caigan
 * a 0. Las bloqueadas se excluyen salvo que ya estén en done.
 *
 * @param requests - Solicitudes (ya filtradas por usuario si aplica).
 * @param teams - Equipos del board.
 * @param statsConfig - Configuración de stats (posiciones e inicio por equipo).
 * @returns Las métricas generales ({@link GeneralStatsReal}).
 */
export function calcGeneral(requests: Request[], teams: BoardTeam[], statsConfig?: StatsConfig): GeneralStatsReal {
  const activeRequests = statsConfig
    ? requests.filter(r => DONE_COLUMNS.has(r.columna) || (!isBlocked(r) && r.equipo.some(eq => {
        const minPos = statsConfig.statsStartByTeam[eq];
        if (minPos === undefined) return true;
        return (statsConfig.columnPositions[r.columna] ?? 0) >= minPos;
      })))
    : requests.filter(r => DONE_COLUMNS.has(r.columna) || !isBlocked(r));

  const total      = activeRequests.length;
  const resueltas  = activeRequests.filter(r => DONE_COLUMNS.has(r.columna)).length;
  const tasaGlobal = total > 0 ? Math.round((resueltas / total) * 100) : 0;

  const conCierre = activeRequests.filter(r => DONE_COLUMNS.has(r.columna) && r.fechaCierre && r.fechaApertura);
  const tiempoPromedio = conCierre.length > 0
    ? parseFloat((conCierre.reduce((a, r) => a + daysBetween(r.fechaApertura, r.fechaCierre!), 0) / conCierre.length).toFixed(1))
    : 0;

  const porEquipo: EquipoStatsReal[] = teams.map(team => {
    const eq        = team.Board_Team_Code;
    const countable = makeCountable(statsConfig?.statsStartByTeam[eq], statsConfig);
    const mine      = requests.filter(r => r.equipo.includes(eq) && countable(r));
    const done      = mine.filter(r => DONE_COLUMNS.has(r.columna));
    const criticas  = mine.filter(r => r.prioridad === 'critica' && !DONE_COLUMNS.has(r.columna)).length;
    return { equipo: eq, creadas: mine.length, resueltas: done.length, criticas, score: sumScore(mine) };
  });

  return { total, resueltas, tasaGlobal, tiempoPromedio, porEquipo };
}
