// supabase/functions/api/lib/history.ts
// @ts-ignore
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Registro de historial (auditoría) de cambios en requests.
 *
 * Define el modelo de una entrada de historial ({@link HistoryEntry}), su
 * inserción best-effort ({@link logHistory}) y utilidades de *diff* que generan
 * entradas por campo: {@link diffFields} para campos "planos" y
 * {@link diffFormData} para las claves dentro de `Form_Data`.
 *
 * @module history
 */

/**
 * Acciones registrables en el historial de un request.
 *
 * @remarks
 * Incluye el ciclo de vida del ticket (creación, movimiento de columna, cierre,
 * reapertura, borrado), edición de campos y las operaciones sobre criterios.
 */
export type HistoryAction =
  | 'created' | 'field_update' | 'column_move'
  | 'closed' | 'reopened' | 'deleted'
  | 'criterion_added' | 'criterion_status' | 'criterion_removed' | 'criterion_edited';

/**
 * Una entrada de historial a persistir.
 *
 * @remarks
 * `field`, `oldValue`, `newValue` y `metadata` son opcionales porque no todas
 * las acciones los usan (p. ej. `created` no lleva diff de valores).
 */
export interface HistoryEntry {
  /** ID del request afectado. */
  requestId:  string;
  /** Usuario que originó el cambio, o `null` si es del sistema. */
  changedBy:  number | null;
  /** Tipo de acción registrada. */
  action:     HistoryAction;
  /** Campo afectado (para `field_update`); prefijado `form:` cuando viene de `Form_Data`. */
  field?:     string | null;
  /** Valor anterior (se serializa a texto al persistir). */
  oldValue?:  unknown;
  /** Valor nuevo (se serializa a texto al persistir). */
  newValue?:  unknown;
  /** Metadatos adicionales de la acción. */
  metadata?:  Record<string, unknown> | null;
}

/**
 * Campos "planos" del request que se rastrean por defecto en {@link diffFields}.
 */
export const TRACKED_REQUEST_FIELDS = [
  'titulo', 'descripcion', 'score', 'progreso',
  'estimatedHours', 'loggedHours', 'sprintId',
  'equipoIds', 'labelIds', 'subTeamIds',
] as const;

/**
 * Normaliza un valor a texto para almacenarlo en el historial.
 *
 * @param v - Valor de cualquier tipo.
 * @returns El valor como string; `null` si es `null`/`undefined`; JSON para
 *   objetos/arreglos (con `String(v)` como fallback si la serialización falla).
 */
function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

/**
 * Compara dos valores por igualdad "lógica" para decidir si hubo cambio.
 *
 * @remarks
 * Los arreglos se comparan sin importar el orden (se normalizan a string y se
 * ordenan). Los objetos se comparan por su serialización JSON. `null` y
 * `undefined` se consideran equivalentes.
 *
 * @param a - Primer valor.
 * @param b - Segundo valor.
 * @returns `true` si se consideran iguales.
 */
function isEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sa = [...a].map(String).sort();
    const sb = [...b].map(String).sort();
    return sa.every((x, i) => x === sb[i]);
  }
  if (typeof a === 'object' && typeof b === 'object' && a && b) {
    try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; }
  }
  return false;
}

/**
 * Inserta una o varias entradas de historial. Best-effort: nunca lanza.
 *
 * @remarks
 * Mapea cada {@link HistoryEntry} a su fila de `TBL_Requests_History`
 * (serializando valores con {@link toText}). Si la inserción falla, solo lo
 * registra en consola para no interrumpir el flujo principal.
 *
 * @param supabase - Cliente de Supabase.
 * @param entries - Una entrada o un arreglo de entradas. Un arreglo vacío no hace nada.
 */
export async function logHistory(
  supabase: SupabaseClient,
  entries: HistoryEntry | HistoryEntry[],
): Promise<void> {
  const list = Array.isArray(entries) ? entries : [entries];
  if (list.length === 0) return;
  const rows = list.map((e) => ({
    Request_History_Request_ID: e.requestId,
    Request_History_Changed_By: e.changedBy ?? null,
    Request_History_Action:     e.action,
    Request_History_Field:      e.field ?? null,
    Request_History_Old_Value:  toText(e.oldValue),
    Request_History_New_Value:  toText(e.newValue),
    Request_History_Metadata:   e.metadata ?? null,
  }));
  const { error } = await supabase.from('TBL_Requests_History').insert(rows);
  if (error) console.error('[logHistory] insert falló:', error.message);
}

/**
 * Calcula el diff de campos "planos" y genera una entrada por cada campo cambiado.
 *
 * @remarks
 * Espera que `before` y `after` usen las claves lógicas del request. Ignora los
 * campos que el patch no tocó (ausentes en `after`, es decir `undefined`) y los
 * que no cambiaron según {@link isEqual}.
 *
 * @param requestId - ID del request.
 * @param changedBy - Usuario que originó el cambio, o `null`.
 * @param before - Estado previo (por clave lógica).
 * @param after - Estado nuevo (por clave lógica).
 * @param fields - Campos a considerar; por defecto {@link TRACKED_REQUEST_FIELDS}.
 * @returns Entradas `field_update`, una por campo modificado.
 */
export function diffFields(
  requestId: string,
  changedBy: number | null,
  before: Record<string, unknown>,
  after:  Record<string, unknown>,
  fields: readonly string[] = TRACKED_REQUEST_FIELDS,
): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const key of fields) {
    if (after[key] === undefined) continue;           // el patch no tocó este campo
    if (isEqual(before[key], after[key])) continue;
    out.push({ requestId, changedBy, action: 'field_update', field: key, oldValue: before[key], newValue: after[key] });
  }
  return out;
}

/**
 * Calcula el diff por-clave dentro de `Form_Data` y genera una entrada por clave cambiada.
 *
 * @remarks
 * Reglas de exclusión para no ensuciar el timeline:
 * - Claves internas del template (prefijo `__`, p. ej. `__labels`) se ignoran:
 *   no son ediciones del usuario.
 * - Claves ausentes en `after` se ignoran: corresponden a ramas
 *   condicionales/multicondicionales que se ocultaron al cambiar de opción, no a
 *   un borrado del usuario (el patch simplemente no incluye esa key).
 *
 * Los campos resultantes se prefijan con `form:` para distinguirlos de los planos.
 *
 * @param requestId - ID del request.
 * @param changedBy - Usuario que originó el cambio, o `null`.
 * @param before - `Form_Data` previo (puede ser `null`/`undefined`).
 * @param after - `Form_Data` nuevo (puede ser `null`/`undefined`).
 * @returns Entradas `field_update` con `field` = `form:<clave>`, una por clave modificada.
 */
export function diffFormData(
  requestId: string,
  changedBy: number | null,
  before: Record<string, unknown> | null | undefined,
  after:  Record<string, unknown> | null | undefined,
): HistoryEntry[] {
  const b = before ?? {}; const a = after ?? {};
  const out: HistoryEntry[] = [];
  for (const k of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (k.startsWith('__')) continue;   // campos internos del template (ej. __labels), no son ediciones de usuario

    // Key ausente en `after` (no presente, no vacía) = rama condicional/multiconditional
    // que se ocultó al cambiar de opción, NO un borrado del usuario. No es una edición:
    // el patch simplemente no incluye esa key. Ignorar para no ensuciar el timeline.
    if (!(k in a)) continue;

    if (isEqual(b[k], a[k])) continue;
    out.push({ requestId, changedBy, action: 'field_update', field: `form:${k}`, oldValue: b[k], newValue: a[k] });
  }
  return out;
}