/**
 * Puntaje por prioridad, meta y penalización.
 *
 * @module stats/lib/scoring
 */

import { PRIORIDAD_TO_SCORE } from '@/features/requests/types';
import type { Request } from '@/features/requests/types';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import {
  DONE_COLUMNS, META_RATIO, PENALIZACION_ACTIVA, PENALIZATION_EXEMPT_COLUMNS, SPRINT_LAG,
} from '../constants';
import { isBlocked } from './predicates';
import { sprintOrder } from './sprints';

/**
 * Suma de puntaje por prioridad de un conjunto de solicitudes.
 *
 * @param requests - Solicitudes.
 * @returns El puntaje total.
 */
export function sumScore(requests: Request[]): number {
  return requests.reduce((a, r) => a + (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0), 0);
}

/**
 * Meta de puntaje a partir del puntaje planeado ({@link META_RATIO}).
 *
 * @param puntajePlaneado - Puntaje planeado.
 * @returns La meta redondeada.
 */
export function calcMeta(puntajePlaneado: number): number {
  return Math.round(puntajePlaneado * META_RATIO);
}

/**
 * Penalización: doble de puntos de solicitudes sin resolver con atraso.
 *
 * @remarks
 * Penaliza las solicitudes abiertas (no done, no icebox, no bloqueadas, con
 * sprint) que llevan ≥ {@link SPRINT_LAG} sprints de atraso respecto al sprint de
 * referencia (el indicado, o el activo hoy, o el más reciente iniciado). Devuelve
 * 0 si {@link PENALIZACION_ACTIVA} es `false`.
 *
 * @param requests - Solicitudes a evaluar.
 * @param allSprints - Todos los sprints (para ordenar y ubicar el atraso).
 * @param refSprintId - Sprint de referencia, o `null` para autodetectarlo.
 * @returns La penalización total en puntos.
 */
export function calcPenalizacion(requests: Request[], allSprints: Sprint[], refSprintId: number | null = null): number {
  if (!PENALIZACION_ACTIVA) return 0;   // ← desactivada: no penaliza. Flip a true para reactivar.
  const sorted = [...allSprints].sort((a, b) => sprintOrder(a) - sprintOrder(b));
  if (sorted.length === 0) return 0;

  // Referencia = sprint indicado; si no, sprint activo hoy; si no hay activo, el más reciente iniciado
  let refIdx: number;
  if (refSprintId != null) {
    refIdx = sorted.findIndex(s => s.Sprint_ID === refSprintId);
  } else {
    const today = new Date().toISOString().slice(0, 10);
    const active = sorted.find(s =>
      s.Sprint_Start_Date && s.Sprint_End_Date &&
      s.Sprint_Start_Date.slice(0, 10) <= today && today <= s.Sprint_End_Date.slice(0, 10)
    ) ?? [...sorted].reverse().find(s => s.Sprint_Start_Date && s.Sprint_Start_Date.slice(0, 10) <= today) ?? sorted[sorted.length - 1];
    refIdx = sorted.findIndex(s => s.Sprint_ID === active.Sprint_ID);
  }
  if (refIdx === -1) return 0;

  return requests
    .filter(r => !DONE_COLUMNS.has(r.columna) && !PENALIZATION_EXEMPT_COLUMNS.has(r.columna) && !isBlocked(r) && r.sprintId != null)
    .reduce((acc, r) => {
      const reqIdx = sorted.findIndex(s => s.Sprint_ID === r.sprintId);
      if (reqIdx === -1) return acc;
      if (refIdx - reqIdx >= SPRINT_LAG) {
        return acc + 2 * (PRIORIDAD_TO_SCORE[r.prioridad] ?? 0);
      }
      return acc;
    }, 0);
}
