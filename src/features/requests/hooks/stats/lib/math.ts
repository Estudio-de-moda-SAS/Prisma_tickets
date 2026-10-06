/**
 * Utilidades numéricas y de fechas para las métricas de estadísticas.
 *
 * @module stats/lib/math
 */

import type { Request } from '@/features/requests/types';

const DAY_MS = 86_400_000;

/**
 * Días absolutos entre dos fechas ISO.
 *
 * @param a - Primera fecha.
 * @param b - Segunda fecha.
 * @returns La diferencia en días (sin signo).
 */
export function daysBetween(a: string, b: string) {
  return Math.abs(new Date(b).getTime() - new Date(a).getTime()) / DAY_MS;
}

/**
 * Indica si una fecha ISO cae en el mes y año actuales.
 *
 * @param iso - Fecha ISO, o `null`.
 * @returns `true` si es del mes actual; `false` si es `null` u otro mes.
 */
export function isThisMonth(iso: string | null) {
  if (!iso) return false;
  const d = new Date(iso), now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

/**
 * Convierte un timestamp ISO a epoch ms, normalizándolo a UTC.
 *
 * @remarks
 * Supabase devuelve timestamps sin 'Z'; se les añade para compararlos contra
 * `Date.now()` sin desfase de zona horaria.
 *
 * @param iso - Timestamp ISO.
 * @returns Epoch en ms (UTC).
 */
export function toUtcMs(iso: string): number {
  const clean = iso.endsWith('Z') ? iso : `${iso.replace(' ', 'T')}Z`;
  return new Date(clean).getTime();
}

/**
 * Antigüedad en días desde una fecha ISO hasta ahora.
 *
 * @param iso - Fecha ISO.
 * @returns Días transcurridos (mínimo 0).
 */
export function ageInDays(iso: string): number {
  return Math.max(0, (Date.now() - toUtcMs(iso)) / DAY_MS);
}

/**
 * Promedio de una métrica de horas, excluyendo `null`.
 *
 * @remarks
 * Sin redondear — el formateo a "Xh Ym" se hace en la vista. Devuelve `null` si
 * ninguna solicitud tiene el dato (para mostrar "—").
 *
 * @param requests - Solicitudes.
 * @param pick - Extractor del valor de horas de cada solicitud.
 * @returns El promedio, o `null` si no hay valores.
 */
export function avgHoras(requests: Request[], pick: (r: Request) => number | null): number | null {
  const vals = requests.map(pick).filter((v): v is number => v != null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Percentil por interpolación lineal sobre un array ya ordenado ascendente.
 *
 * @param sorted - Valores ordenados ascendentemente.
 * @param p - Percentil (0–100).
 * @returns El valor del percentil, o `null` si el array está vacío.
 */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
