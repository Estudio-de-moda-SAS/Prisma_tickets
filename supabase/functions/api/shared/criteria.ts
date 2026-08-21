import type { DB } from '../lib/supabase.ts';

/**
 * Enriquecimiento de requests con el resumen de sus criterios de aceptación.
 *
 * Expone {@link attachCriteriaSummary}, que agrega a cada fila un conteo de
 * criterios (total, aceptados, rechazados) sin mutar las filas originales.
 *
 * @module criteria
 */

/**
 * Añade a cada request un `criteria_summary` con el conteo de sus criterios de aceptación.
 *
 * @remarks
 * Hace una sola consulta a `TBL_Acceptance_Criteria` para todos los `Request_ID`
 * recibidos y agrega en memoria por request. Es tolerante a fallos: si la
 * consulta falla o no hay datos, devuelve las filas sin modificar. Los requests
 * sin criterios quedan con `criteria_summary: null`. No muta las filas de
 * entrada; devuelve copias con la propiedad añadida.
 *
 * @param rows - Filas de requests a enriquecer (deben incluir `Request_ID`).
 * @param supabase - Cliente de Supabase.
 * @returns Las filas con `criteria_summary` (`{ total, accepted, rejected }` o
 *   `null`). Devuelve el arreglo tal cual si viene vacío o si la consulta falla.
 */
export async function attachCriteriaSummary(
  rows: Record<string, unknown>[],
  supabase: DB,
): Promise<Record<string, unknown>[]> {
  if (rows.length === 0) return rows;
  const ids = rows.map((r) => r['Request_ID'] as string);
  const { data, error } = await supabase
    .from('TBL_Acceptance_Criteria')
    .select('Request_ID, Status')
    .in('Request_ID', ids);
  if (error || !data) return rows;

  const map: Record<string, { total: number; accepted: number; rejected: number }> = {};
  for (const c of data as { Request_ID: string; Status: string }[]) {
    if (!map[c.Request_ID]) map[c.Request_ID] = { total: 0, accepted: 0, rejected: 0 };
    map[c.Request_ID].total++;
    if (c.Status === 'accepted') map[c.Request_ID].accepted++;
    if (c.Status === 'rejected') map[c.Request_ID].rejected++;
  }

  return rows.map((r) => ({
    ...r,
    criteria_summary: map[r['Request_ID'] as string] ?? null,
  }));
}