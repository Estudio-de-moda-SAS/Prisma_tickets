// supabase/functions/api/lib/history.ts
// @ts-ignore
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export type HistoryAction =
  | 'created' | 'field_update' | 'column_move'
  | 'closed' | 'reopened' | 'deleted'
  | 'criterion_added' | 'criterion_status' | 'criterion_removed' | 'criterion_edited';

export interface HistoryEntry {
  requestId:  string;
  changedBy:  number | null;
  action:     HistoryAction;
  field?:     string | null;
  oldValue?:  unknown;
  newValue?:  unknown;
  metadata?:  Record<string, unknown> | null;
}

export const TRACKED_REQUEST_FIELDS = [
  'titulo', 'descripcion', 'score', 'progreso',
  'estimatedHours', 'loggedHours', 'sprintId',
  'equipoIds', 'labelIds', 'subTeamIds',
] as const;

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try { return JSON.stringify(v); } catch { return String(v); }
}

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

// Inserta 1 o N entradas. Best-effort: nunca lanza.
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

// Diff de campos "planos" (before ya viene en claves lógicas) → una entrada por campo.
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

// Diff por-clave dentro de Form_Data.
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