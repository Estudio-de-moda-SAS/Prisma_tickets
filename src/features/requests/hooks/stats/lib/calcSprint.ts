/**
 * Métricas de sprint (con o sin sprint(s) seleccionado(s)).
 *
 * @module stats/lib/calcSprint
 */

import type { Request } from '@/features/requests/types';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import { ACTIVE_COLUMNS, DONE_COLUMNS } from '../constants';
import type { SprintStats, StatsConfig } from '../types';
import { avgHoras, isThisMonth } from './math';
import { isBlocked, makeCountable } from './predicates';
import { calcMeta, calcPenalizacion, sumScore } from './scoring';
import { groupBySprint, makeCreditedIn, refSprintIdOf } from './sprints';

/**
 * Resuelve la columna de inicio de stats aplicable al cálculo de sprint.
 *
 * @param statsConfig - Configuración de stats.
 * @param teamCode - Equipo específico, o `null`.
 * @param combinedMinPos - `minPos` combinado en modo multiequipo.
 * @returns La posición mínima, o `undefined` si no aplica.
 */
function resolveMinPos(statsConfig?: StatsConfig, teamCode?: string | null, combinedMinPos?: number): number | undefined {
  if (!statsConfig || Object.keys(statsConfig.statsStartByTeam).length === 0) return undefined;
  // Modo combinado: usa el mínimo (más permisivo) de los equipos seleccionados.
  if (combinedMinPos !== undefined) return combinedMinPos;
  if (teamCode) return statsConfig.statsStartByTeam[teamCode];
  const vals = Object.values(statsConfig.statsStartByTeam);
  return vals.length > 0 ? Math.min(...vals) : undefined;
}

/**
 * Métricas de sprint sin selección: calcula sobre todos los activos.
 *
 * @param requests - Solicitudes con scope de usuario/equipo.
 * @param isCountable - Predicado de conteo.
 * @param allSprints - Todos los sprints (para penalización).
 * @returns Las métricas de sprint.
 */
function calcSprintUnselected(requests: Request[], isCountable: (r: Request) => boolean, allSprints: Sprint[]): SprintStats {
  const active           = requests.filter(isCountable);
  const doneActive       = active.filter(r => DONE_COLUMNS.has(r.columna));
  const puntajePlaneado  = sumScore(active);
  const puntajeRealizado = sumScore(doneActive);
  const meta             = calcMeta(puntajePlaneado);
  const penalizacion     = calcPenalizacion(active, allSprints, null);
  const puntajeReal      = Math.max(0, puntajeRealizado - penalizacion);
  const cumplimiento     = meta > 0 ? Math.round((puntajeReal / meta) * 100) : 0;
  return {
    sprint: null,
    planeadas:    active.length,
    activas:      active.filter(r => ACTIVE_COLUMNS.has(r.columna)).length,
    completadas:  doneActive.length,
    bloqueadas:   requests.filter(isBlocked).length,
    postPlanning: 0,
    puntajePlaneado, puntajeRealizado, puntajePostPlanning: 0,
    planeadasMes: active.filter(r => isThisMonth(r.fechaApertura)).length,
    cerradasMes:  doneActive.filter(r => isThisMonth(r.fechaCierre ?? r.fechaApertura)).length,
    tiempoEstimadoProm:  avgHoras(doneActive, r => r.estimatedHours),
    tiempoConsumidoProm: avgHoras(doneActive, r => r.loggedHours),
    otrosSprintsCerradas: null,
    otrosSprintsDetalle:  null,
    puntajeOtrosSprints:  0,
    meta, penalizacion, puntajeReal, cumplimiento,
  };
}

/**
 * Predicado "del mismo mes que el sprint más antiguo con fecha de la selección".
 *
 * @param sprints - Sprints seleccionados.
 * @returns Predicado sobre fechas ISO (siempre `false` si ninguno tiene fecha).
 */
function makeIsSprintMonth(sprints: Sprint[]): (iso: string | null) => boolean {
  const datedSprints = sprints.filter(s => s.Sprint_Start_Date);
  const earliest = datedSprints.length > 0
    ? datedSprints.reduce((a, b) => a.Sprint_Start_Date! < b.Sprint_Start_Date! ? a : b)
    : null;
  const sy = earliest ? new Date(earliest.Sprint_Start_Date!).getFullYear() : null;
  const sm = earliest ? new Date(earliest.Sprint_Start_Date!).getMonth() : null;
  return (iso: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === sy && d.getMonth() === sm;
  };
}

/**
 * Métricas de sprint con uno o más sprints seleccionados.
 *
 * @param requests - Solicitudes con scope de usuario/equipo, SIN filtro de sprint.
 * @param sprints - Sprints seleccionados (no vacío).
 * @param isCountable - Predicado de conteo.
 * @param allSprints - Todos los sprints.
 * @returns Las métricas de sprint.
 */
function calcSprintSelected(requests: Request[], sprints: Sprint[], isCountable: (r: Request) => boolean, allSprints: Sprint[]): SprintStats {
  const sprintMap   = new Map(sprints.map(s => [s.Sprint_ID, s]));
  const sprintIdSet = new Set(sprints.map(s => s.Sprint_ID));

  const inSprint       = requests.filter(r => r.sprintId != null && sprintIdSet.has(r.sprintId));
  const activeInSprint = inSprint.filter(isCountable);
  // Las bloqueadas responden a los filtros de usuario/equipo (ya aplicados en `requests`)
  // pero NO al de columna: una bloqueada cuenta exista donde exista.
  const bloqueadas     = inSprint.filter(isBlocked);

  // Histórico sin fecha → no se puede distinguir planeada/post-planning, todas cuentan como planeadas.
  const planeadas = activeInSprint.filter(r => {
    const sp = sprintMap.get(r.sprintId!);
    if (!sp || !sp.Sprint_Start_Date) return true;
    return r.fechaApertura.slice(0, 10) <= sp.Sprint_Start_Date.slice(0, 10);
  });
  const postPlan = activeInSprint.filter(r => {
    const sp = sprintMap.get(r.sprintId!);
    if (!sp || !sp.Sprint_Start_Date) return false;
    return r.fechaApertura.slice(0, 10) > sp.Sprint_Start_Date.slice(0, 10);
  });
  const activas = activeInSprint.filter(r => ACTIVE_COLUMNS.has(r.columna));
  // Crédito único: solo cuenta como completada si su sprint de crédito está en
  // la selección. Una del #17 cerrada en el #18 no completa el #17 (sigue como
  // planeada) y suma como arrastre en el #18.
  const creditedInSel = makeCreditedIn(allSprints, sprintIdSet);
  const completadas   = activeInSprint.filter(r => DONE_COLUMNS.has(r.columna) && creditedInSel(r));

  const isSM = makeIsSprintMonth(sprints);

  const puntajePlaneado  = sumScore(activeInSprint);
  const puntajeRealizado = sumScore(completadas);
  const meta             = calcMeta(puntajePlaneado);
  // La penalización considera TODA la deuda del scope (equipo/usuario), no solo
  // las del sprint seleccionado. Una solicitud abierta del #12 penaliza al mirar
  // el #14 porque lleva ≥ SPRINT_LAG sprints de atraso respecto al ref.
  const penalizacion     = calcPenalizacion(requests, allSprints, refSprintIdOf(sprints));
  const puntajeReal      = Math.max(0, puntajeRealizado - penalizacion);

  /* ── Cerradas de OTROS sprints acreditadas al/los sprint(s) sel. ──
   *  Solicitudes cuyo sprintId pertenece a otro sprint (no seleccionado) pero
   *  que se terminaron tarde, dentro de la ventana temporal del/los sprint(s)
   *  seleccionado(s) (sprint de crédito, ver buildCreditSprint). `requests`
   *  llega con scope de equipo/usuario pero SIN filtro de sprint.
   *  Si ninguno de los seleccionados tiene fechas → sin ventana → null ("—"). */
  const datedSel = sprints.filter(s => s.Sprint_Start_Date && s.Sprint_End_Date);
  const otrosCerradas = datedSel.length === 0 ? null
    : requests.filter(r =>
        r.sprintId != null &&
        !sprintIdSet.has(r.sprintId) &&
        DONE_COLUMNS.has(r.columna) &&
        creditedInSel(r)
      );

  // El puntaje del arrastre suma al cumplimiento (meta intacta → puede pasar 100%).
  // Mismo límite que la card "De otros sprints": solo la columna 'hecho' cuenta.
  const puntajeOtrosSprints = sumScore((otrosCerradas ?? []).filter(r => r.columna === 'hecho'));
  const cumplimiento = meta > 0 ? Math.round(((puntajeReal + puntajeOtrosSprints) / meta) * 100) : 0;

  return {
    sprint: sprints.length === 1 ? sprints[0] : null,
    planeadas:    planeadas.length,
    activas:      activas.length,
    completadas:  completadas.length,
    bloqueadas:   bloqueadas.length,
    postPlanning: postPlan.length,
    puntajePlaneado, puntajeRealizado, puntajePostPlanning: 0,
    planeadasMes: requests.filter(r => isCountable(r) && isSM(r.fechaApertura)).length,
    cerradasMes:  requests.filter(r =>
      DONE_COLUMNS.has(r.columna) && isCountable(r) && isSM(r.fechaCierre ?? r.fechaApertura)
    ).length,
    tiempoEstimadoProm:  avgHoras(completadas, r => r.estimatedHours),
    tiempoConsumidoProm: avgHoras(completadas, r => r.loggedHours),
    otrosSprintsCerradas: otrosCerradas?.length ?? null,
    otrosSprintsDetalle:  otrosCerradas === null ? null : groupBySprint(otrosCerradas),
    puntajeOtrosSprints,
    meta, penalizacion, puntajeReal, cumplimiento,
  };
}

/**
 * Calcula las métricas de sprint (con o sin sprint(s) seleccionado(s)).
 *
 * @remarks
 * Sin sprints seleccionados calcula sobre todos los activos. Con uno o más,
 * acota al conjunto de sprints y distingue planeadas vs post-planning por la
 * fecha de apertura respecto al inicio del sprint (los históricos sin fecha se
 * cuentan como planeadas). Incluye "cerradas de otros sprints" (arrastre), cuyo
 * puntaje —solo columna 'hecho'— suma al cumplimiento. `planeadasMes`/`cerradasMes`
 * usan el mes del sprint más antiguo seleccionado. Las columnas done siempre
 * cuentan; las bloqueadas se omiten salvo done.
 *
 * @param requests - Solicitudes con scope de usuario/equipo, SIN filtro de sprint.
 * @param sprints - Sprints seleccionados (vacío = todos los activos).
 * @param statsConfig - Configuración de stats.
 * @param teamCode - Código de equipo para resolver `minPos`, o `null`.
 * @param allSprints - Todos los sprints (para crédito y penalización).
 * @param combinedMinPos - `minPos` combinado en modo multiequipo.
 * @returns Las métricas de sprint ({@link SprintStats}).
 */
export function calcSprint(requests: Request[], sprints: Sprint[], statsConfig?: StatsConfig, teamCode?: string | null, allSprints: Sprint[] = [], combinedMinPos?: number): SprintStats {
  const isCountable = makeCountable(resolveMinPos(statsConfig, teamCode, combinedMinPos), statsConfig);
  return sprints.length === 0
    ? calcSprintUnselected(requests, isCountable, allSprints)
    : calcSprintSelected(requests, sprints, isCountable, allSprints);
}
