/**
 * Predicados sobre solicitudes: bloqueo y "contabilidad" según la columna de
 * inicio de stats.
 *
 * @module stats/lib/predicates
 */

import type { Request } from '@/features/requests/types';
import { DONE_COLUMNS } from '../constants';
import type { StatsConfig } from '../types';

/**
 * Indica si el nombre de una etiqueta denota bloqueo/pausa.
 *
 * @remarks
 * Match por subcadena: cubre "bloqueada", "bloqueada y/o pausada" y
 * "pausada y/o bloqueada" con cualquier variante de espaciado/orden.
 *
 * @param name - Nombre de la etiqueta.
 * @returns `true` si el nombre incluye "bloqueada" o "pausada".
 */
export function isBlockedLabelName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n.includes('bloqueada') || n.includes('pausada');
}

/**
 * Indica si una solicitud tiene alguna etiqueta de bloqueo.
 *
 * @param r - Solicitud a evaluar.
 * @returns `true` si alguna de sus etiquetas es de bloqueo/pausa.
 */
export function isBlocked(r: Request): boolean {
  return r.categoria.some(isBlockedLabelName);
}

/**
 * Construye el predicado de conteo para una columna de inicio de stats.
 *
 * @remarks
 * Las columnas done siempre entran (bypass de `minPos`; arregla históricos en
 * "historial"). Las bloqueadas/pausadas se omiten como el icebox, salvo que ya
 * estén en done.
 *
 * @param minPos - Posición mínima de columna, o `undefined` si no aplica.
 * @param statsConfig - Configuración de stats (posiciones de columna).
 * @returns Predicado `request → cuenta`.
 */
export function makeCountable(minPos: number | undefined, statsConfig?: StatsConfig): (r: Request) => boolean {
  return (r: Request) =>
    DONE_COLUMNS.has(r.columna) || (!isBlocked(r) && (minPos === undefined || (statsConfig!.columnPositions[r.columna] ?? 0) >= minPos));
}
