/**
 * Estadísticas de un board/equipo, individual o combinado (unión de equipos).
 *
 * @module stats/lib/calcBoard
 */

import type { Request } from '@/features/requests/types';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import { AVATAR_GRADIENTS, BOARD_COLUMN_ORDER, COL_META, DONE_COLUMNS, PRI_META } from '../constants';
import type { BoardStatsReal, ColStatReal, PriStatReal, Resolutor, ResolutorSolicitud, StatsConfig } from '../types';
import { makeCountable } from './predicates';
import { calcMeta, calcPenalizacion, sumScore } from './scoring';
import { groupBySprint, makeCreditedIn, refSprintIdOf } from './sprints';

/**
 * Iniciales (hasta 2) de un nombre.
 *
 * @param name - Nombre completo.
 * @returns Las iniciales en mayúscula.
 */
function inits(name: string) {
  return name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('');
}

/**
 * Top 5 de resolutores de un conjunto de solicitudes terminadas.
 *
 * @param done - Solicitudes terminadas (incluido el arrastre).
 * @returns Los resolutores ordenados por cantidad resuelta.
 */
function calcResolutores(done: Request[]): Resolutor[] {
  type ResolAcc = { name: string; count: number; idx: number; solicitudes: ResolutorSolicitud[] };
  const resolMap = new Map<number, ResolAcc>();
  let idx = 0;
  for (const r of done) {
    for (const a of r.assignees) {
      if (!resolMap.has(a.userId)) resolMap.set(a.userId, { name: a.userName, count: 0, idx: idx++, solicitudes: [] });
      const acc = resolMap.get(a.userId)!;
      acc.count++;
      acc.solicitudes.push({
        id: r.id, titulo: r.titulo, prioridad: r.prioridad,
        fechaCierre: r.fechaCierre, sprintName: r.sprintName,
        labelIds: r.labelIds,
      });
    }
  }
  return [...resolMap.entries()]
    .sort((a, b) => b[1].count - a[1].count).slice(0, 5)
    .map(([userId, { name, count, idx: i, solicitudes }]) => ({
      userId, nombre: name, initials: inits(name), resueltas: count,
      avatarBg: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length],
      solicitudes,
    }));
}

/**
 * Núcleo compartido de {@link calcBoard} y {@link calcBoardCombined}.
 *
 * @remarks
 * Si hay sprints seleccionados, todo el detalle se limita a ese/esos sprint(s) —
 * incluidos históricos en "historial" que conservan su `Sprint_ID`. Además
 * calcula el "arrastre" (solicitudes de otros sprints acreditadas al
 * seleccionado), que suma a resolutores y, en columna 'hecho', al puntaje de
 * otros sprints. La `meta` es el 83.334% del puntaje planeado; el `cumplimiento`
 * suma el arrastre y puede superar 100%.
 *
 * @param universe - Solicitudes del equipo/unión, sin filtro de posición.
 * @param equipo - Etiqueta del board resultante.
 * @param minPos - Columna de inicio de stats (ya resuelta para el/los equipo(s)).
 * @param statsConfig - Configuración de stats.
 * @param allSprints - Todos los sprints.
 * @param selectedSprints - Sprints seleccionados (vacío = acumulado).
 * @returns Las estadísticas del board.
 */
function calcBoardFromUniverse(
  universe: Request[], equipo: string, minPos: number | undefined,
  statsConfig: StatsConfig | undefined, allSprints: Sprint[], selectedSprints: Sprint[],
): BoardStatsReal {
  const countable = makeCountable(minPos, statsConfig);
  const allMine   = universe;
  const mine      = universe.filter(countable);
  // Sin sprint seleccionado → acumulado total del equipo.
  const hasSel      = selectedSprints.length > 0;
  const sprintSet   = new Set(selectedSprints.map(s => s.Sprint_ID));
  const inSelSprint = (r: Request) => !hasSel || (r.sprintId != null && sprintSet.has(r.sprintId));

  const allMineInSprint = allMine.filter(inSelSprint);
  const mineScoped      = mine.filter(inSelSprint);

  // Crédito único: una terminada cuenta como resuelta solo en su sprint de
  // crédito (ver buildCreditSprint). Una del #17 cerrada en el #18 sale de las
  // resueltas del #17 (sigue como planeada) y entra como arrastre en el #18.
  const creditedInSel = makeCreditedIn(allSprints, sprintSet);

  const done     = mineScoped.filter(r => DONE_COLUMNS.has(r.columna) && (!hasSel || creditedInSel(r)));
  const criticas = mineScoped.filter(r => r.prioridad === 'critica' && !DONE_COLUMNS.has(r.columna)).length;

  // ── Arrastre completado: solicitudes de OTROS sprints cuyo sprint de
  //    crédito es el/los seleccionado(s). Sin sprint seleccionado → []. ──
  const arrastre = !hasSel ? []
    : allMine.filter(r =>
        r.sprintId != null && !sprintSet.has(r.sprintId) &&
        DONE_COLUMNS.has(r.columna) && creditedInSel(r)
      );
  const doneResol = arrastre.length > 0 ? [...done, ...arrastre] : done;
  // La card "De otros sprints" cuenta SOLO 'hecho' (no ready_to_deploy ni
  // historial). El puntaje usa el MISMO límite para que card y puntaje coincidan.
  const arrastreHecho       = arrastre.filter(r => r.columna === 'hecho');
  const puntajeOtrosSprints = sumScore(arrastreHecho);

  const meta         = calcMeta(sumScore(mineScoped));
  const penalizacion = calcPenalizacion(mine, allSprints, refSprintIdOf(selectedSprints));
  const puntajeReal  = Math.max(0, sumScore(done) - penalizacion);
  // El arrastre suma al cumplimiento (meta intacta → puede pasar 100%).
  const cumplimiento = meta > 0 ? Math.round(((puntajeReal + puntajeOtrosSprints) / meta) * 100) : 0;

  const porColumna: ColStatReal[] = BOARD_COLUMN_ORDER.map(col => ({
    label: COL_META[col].label,
    value: allMineInSprint.filter(r => r.columna === col).length,
    color: COL_META[col].color,
  }));
  const porPrioridad: PriStatReal[] = PRI_META.map(p => ({
    label: p.label,
    value: mineScoped.filter(r => r.prioridad === p.key).length,
    color: p.color,
  }));

  return {
    equipo,
    creadas: mineScoped.length, resueltas: done.length, criticas,
    meta, penalizacion, puntajeReal, cumplimiento, puntajeOtrosSprints,
    otrosSprintsCount:   arrastreHecho.length,
    otrosSprintsDetalle: groupBySprint(arrastreHecho),
    porColumna, porPrioridad,
    resolutores: calcResolutores(doneResol),
  };
}

/**
 * Calcula las estadísticas de un board/equipo, opcionalmente acotadas a sprint(s).
 *
 * @param requests - Solicitudes (ya filtradas por usuario si aplica).
 * @param equipo - Código del equipo.
 * @param statsConfig - Configuración de stats.
 * @param allSprints - Todos los sprints (para crédito y penalización).
 * @param selectedSprints - Sprints seleccionados (vacío = acumulado del equipo).
 * @returns Las estadísticas del board ({@link BoardStatsReal}).
 */
export function calcBoard(requests: Request[], equipo: string, statsConfig?: StatsConfig, allSprints: Sprint[] = [], selectedSprints: Sprint[] = []): BoardStatsReal {
  const universe = requests.filter(r => r.equipo.includes(equipo));
  return calcBoardFromUniverse(universe, equipo, statsConfig?.statsStartByTeam[equipo], statsConfig, allSprints, selectedSprints);
}

/**
 * Mínimo`statsStartByTeam` (el más permisivo) entre varios equipos, para no
 * ocultar columnas que un equipo cuenta y otro no.
 *
 * @param equipos - Códigos de equipo.
 * @param statsConfig - Configuración de stats.
 * @returns La posición mínima, o `undefined` si ningún equipo la define.
 */
export function combinedMinPosOf(equipos: string[], statsConfig?: StatsConfig): number | undefined {
  const vals = equipos
    .map(eq => statsConfig?.statsStartByTeam[eq])
    .filter((v): v is number => v !== undefined);
  return vals.length > 0 ? Math.min(...vals) : undefined;
}

/**
 * Igual que {@link calcBoard} pero para varios equipos combinados por unión deduplicada.
 *
 * @remarks
 * Una solicitud que pertenece a más de un equipo seleccionado se cuenta una sola
 * vez: se prefiltra el universo a las que tocan cualquiera de los equipos. El
 * `minPos` combinado es el más permisivo ({@link combinedMinPosOf}).
 *
 * @param requests - Solicitudes (ya filtradas por usuario si aplica).
 * @param equipos - Códigos de los equipos a combinar.
 * @param statsConfig - Configuración de stats.
 * @param allSprints - Todos los sprints.
 * @param selectedSprints - Sprints seleccionados.
 * @returns Las estadísticas combinadas; `equipo` es la unión de códigos con `+`.
 */
export function calcBoardCombined(requests: Request[], equipos: string[], statsConfig?: StatsConfig, allSprints: Sprint[] = [], selectedSprints: Sprint[] = []): BoardStatsReal {
  const teamSet = new Set(equipos);
  const union   = requests.filter(r => r.equipo.some(eq => teamSet.has(eq)));
  return calcBoardFromUniverse(union, equipos.join('+'), combinedMinPosOf(equipos, statsConfig), statsConfig, allSprints, selectedSprints);
}
