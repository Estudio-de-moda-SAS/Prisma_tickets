/**
 * Utilidades de sprint: orden, linaje, sprint anterior, sprint de crédito y
 * agrupación del arrastre.
 *
 * @module stats/lib/sprints
 */

import type { Request } from '@/features/requests/types';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import type { OtrosSprintsDetalle } from '../types';

/**
 * Número de sprint extraído del texto ("Sprint #12 ..." → 12).
 *
 * @param s - Sprint.
 * @returns El número, o `null` si no hay patrón `#N`.
 */
function sprintNum(s: Sprint): number | null {
  const m = s.Sprint_Text.match(/#\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * Año del sprint: de la fecha si existe, o del patrón `(YYYY)` del texto.
 *
 * @param s - Sprint.
 * @returns El año, o `null` si no se puede determinar.
 */
function sprintYearLocal(s: Sprint): number | null {
  if (s.Sprint_Start_Date) {
    const y = Number(s.Sprint_Start_Date.slice(0, 4));
    if (!Number.isNaN(y)) return y;
  }
  const m = s.Sprint_Text.match(/\((\d{4})\)/);
  return m ? Number(m[1]) : null;
}

/**
 * Clave de orden cronológico unificado de un sprint.
 *
 * @remarks
 * Ordena por número de sprint del texto ("#11" → 11); si no hay, respalda por
 * fecha o ID. Evita que los históricos sin fecha se desfasen al medir distancia
 * entre sprints.
 *
 * @param s - Sprint.
 * @returns Un número de orden comparable.
 */
export function sprintOrder(s: Sprint): number {
  const n = sprintNum(s);
  if (n != null) return n;
  if (s.Sprint_Start_Date) return new Date(s.Sprint_Start_Date).getTime() / 86_400_000;
  return s.Sprint_ID;
}

/**
 * ID del sprint de referencia de una selección (el de mayor `Sprint_ID`).
 *
 * @param sprints - Sprints seleccionados.
 * @returns El ID, o `null` si la selección está vacía.
 */
export function refSprintIdOf(sprints: Sprint[]): number | null {
  return sprints.length > 0
    ? [...sprints].sort((a, b) => b.Sprint_ID - a.Sprint_ID)[0].Sprint_ID
    : null;
}

/**
 * Encuentra el sprint inmediatamente anterior dentro del mismo linaje.
 *
 * @remarks
 * Linaje = con fecha (PRISMA) vs sin fecha (histórico migrado). Nunca se cruzan:
 * un sprint de PRISMA solo compara con otro de PRISMA, y un histórico solo con
 * otro histórico. Los PRISMA se ordenan por fecha; los históricos por (año,
 * número), con el año mandando sobre el número.
 *
 * @param current - Sprint actual.
 * @param all - Todos los sprints disponibles.
 * @returns El sprint anterior del mismo linaje, o `null` si no hay.
 */
export function findPrevSprint(current: Sprint, all: Sprint[]): Sprint | null {
  const currentHasDate = !!current.Sprint_Start_Date;
  const sameLineage = all.filter(s => (!!s.Sprint_Start_Date) === currentHasDate);

  if (currentHasDate) {
    // PRISMA → orden cronológico por fecha
    const sorted = [...sameLineage].sort(
      (a, b) => a.Sprint_Start_Date!.localeCompare(b.Sprint_Start_Date!),
    );
    const idx = sorted.findIndex(s => s.Sprint_ID === current.Sprint_ID);
    return idx > 0 ? sorted[idx - 1] : null;
  }

  // Histórico → orden por (año, número); año manda sobre número
  const sorted = [...sameLineage].sort((a, b) => {
    const ya = sprintYearLocal(a), yb = sprintYearLocal(b);
    if (ya !== yb) return (ya ?? Infinity) - (yb ?? Infinity);
    const na = sprintNum(a), nb = sprintNum(b);
    return (na ?? Infinity) - (nb ?? Infinity);
  });
  const idx = sorted.findIndex(s => s.Sprint_ID === current.Sprint_ID);
  return idx > 0 ? sorted[idx - 1] : null;
}

/**
 * Construye el resolvedor del "sprint de crédito" de una solicitud terminada:
 * el único sprint en el que cuenta como finalizada.
 *
 * @remarks
 * Una solicitud cerrada DESPUÉS del fin de su sprint (p. ej. del #17 cerrada
 * dentro de la ventana del #18) se acredita al sprint cuya ventana contiene la
 * fecha de cierre, y deja de contar como completada en su sprint original (allí
 * sigue contando como planeada). En cualquier otro caso —cerrada a tiempo o antes,
 * sin fecha de cierre, sprint propio sin fechas (histórico) o cierre fuera de
 * toda ventana— se acredita a su propio sprint. Así cada solicitud suma a un solo
 * sprint.
 *
 * @param allSprints - Todos los sprints.
 * @returns Función `request → Sprint_ID` de crédito (`null` si no tiene sprint).
 */
export function buildCreditSprint(allSprints: Sprint[]): (r: Request) => number | null {
  const byId  = new Map(allSprints.map(s => [s.Sprint_ID, s]));
  const dated = allSprints.filter(s => s.Sprint_Start_Date && s.Sprint_End_Date);
  return (r: Request) => {
    if (r.sprintId == null) return null;
    const own = byId.get(r.sprintId);
    if (!r.fechaCierre || !own?.Sprint_End_Date) return r.sprintId;
    const day = r.fechaCierre.slice(0, 10);
    if (day <= own.Sprint_End_Date.slice(0, 10)) return r.sprintId;
    const closing = dated.find(s =>
      s.Sprint_ID !== r.sprintId &&
      s.Sprint_Start_Date!.slice(0, 10) <= day && day <= s.Sprint_End_Date!.slice(0, 10)
    );
    return closing?.Sprint_ID ?? r.sprintId;
  };
}

/**
 * Predicado "acreditada a la selección": su sprint de crédito está en el set.
 *
 * @param allSprints - Todos los sprints.
 * @param sprintIds - IDs de los sprints seleccionados.
 * @returns Predicado `request → acreditada`.
 */
export function makeCreditedIn(allSprints: Sprint[], sprintIds: Set<number>): (r: Request) => boolean {
  const creditSprint = buildCreditSprint(allSprints);
  return (r: Request) => {
    const c = creditSprint(r);
    return c != null && sprintIds.has(c);
  };
}

/**
 * Agrupa solicitudes de arrastre por su sprint de origen, ordenado por conteo.
 *
 * @param requests - Solicitudes de arrastre (con `sprintId`).
 * @returns El desglose por sprint.
 */
export function groupBySprint(requests: Request[]): OtrosSprintsDetalle {
  const m = new Map<number, { sprintId: number; sprintName: string; count: number }>();
  for (const r of requests) {
    const id = r.sprintId!;
    if (!m.has(id)) m.set(id, { sprintId: id, sprintName: r.sprintName ?? `Sprint ${id}`, count: 0 });
    m.get(id)!.count++;
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}
