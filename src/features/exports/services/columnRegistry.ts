// src/features/exports/services/columnRegistry.ts
import { SCORE_TO_PRIORIDAD } from '@/features/requests/types';
import type {
  ExportColumn,
  ExportTicket,
  ExportTemplate,
} from '../types';

/* ============================================================
   Registro de columnas
   - Fijas: estructurales, siempre disponibles
   - Dinámicas: derivadas del Request_Template_Schema_Snapshot,
                detectadas en runtime sobre los tickets devueltos.
   ============================================================ */

/* ── Helpers de accessors ─────────────────────────────────── */

function joinNames(items: string[]): string {
  return items.filter(Boolean).join(', ');
}

function getAssigneeNames(t: ExportTicket): string {
  return joinNames((t.assignments ?? []).map((a) => a.assignee?.User_Name ?? ''));
}

function getLabelNames(t: ExportTicket): string {
  return joinNames((t.labels ?? []).map((l) => l.label?.Label_Name ?? ''));
}

function getTeamCodes(t: ExportTicket): string {
  return joinNames((t.teams ?? []).map((tm) => tm.team?.Board_Team_Code ?? ''));
}

function getSprintNames(t: ExportTicket): string {
  return joinNames((t.sprints ?? []).map((s) => s.sprint?.Sprint_Text ?? ''));
}

function getSubTeamNames(t: ExportTicket): string {
  return joinNames((t.sub_teams ?? []).map((s) => s.sub_team?.Sub_Team_Name ?? ''));
}

/** Última fecha de cierre — la columna `closure` puede traer múltiples */
function getLatestClosure(t: ExportTicket): ExportTicket['closure'] extends Array<infer U> ? U | null : null {
  const arr = t.closure ?? [];
  if (arr.length === 0) return null as never;
  const sorted = [...arr].sort((a, b) => b.Closed_At.localeCompare(a.Closed_At));
  return sorted[0] as never;
}

function getClosedAt(t: ExportTicket): string | null {
  // Preferimos Request_Finished_At si existe (sellado); si no, último closure
  if (t.Request_Finished_At) return t.Request_Finished_At;
  const last = getLatestClosure(t) as { Closed_At?: string } | null;
  return last?.Closed_At ?? null;
}

function getClosureNote(t: ExportTicket): string {
  const last = getLatestClosure(t) as { Closure_Note?: string } | null;
  return last?.Closure_Note ?? '';
}

function getClosedBy(t: ExportTicket): string {
  const last = getLatestClosure(t) as { closer?: { User_Name?: string } | null } | null;
  return last?.closer?.User_Name ?? '';
}

function getPriorityLabel(t: ExportTicket): string {
  if (t.Request_Score == null) return '';
  const key = SCORE_TO_PRIORIDAD[t.Request_Score] ?? '';
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
}

/* ── Definición de columnas FIJAS ─────────────────────────── */

export const FIXED_COLUMNS: ExportColumn[] = [
  {
    id: 'request_id', label: 'ID Ticket', type: 'text', source: 'fixed', width: 18,
    accessor: (t) => t.Request_ID,
  },
  {
    id: 'title', label: 'Título', type: 'text', source: 'fixed', width: 40,
    accessor: (t) => t.Request_Title ?? '',
  },
  {
    id: 'description', label: 'Descripción', type: 'text', source: 'fixed', width: 60,
    accessor: (t) => t.Request_Description ?? '',
  },
  {
    id: 'teams', label: 'Equipos', type: 'text', source: 'fixed', width: 24,
    accessor: getTeamCodes,
  },
  {
    id: 'sub_teams', label: 'Sub-equipos', type: 'text', source: 'fixed', width: 24,
    accessor: getSubTeamNames,
  },
  {
    id: 'sprint', label: 'Sprint', type: 'text', source: 'fixed', width: 18,
    accessor: getSprintNames,
  },
  {
    id: 'labels', label: 'Épica (etiquetas)', type: 'text', source: 'fixed', width: 28,
    accessor: getLabelNames,
  },
  {
    id: 'priority', label: 'Prioridad', type: 'priority', source: 'fixed', width: 12,
    accessor: getPriorityLabel,
  },
  {
    id: 'score', label: 'Puntaje', type: 'number', source: 'fixed', width: 10,
    accessor: (t) => t.Request_Score,
  },
  {
    id: 'progress', label: 'Progreso (%)', type: 'number', source: 'fixed', width: 12,
    accessor: (t) => t.Request_Progress ?? 0,
  },
  {
    id: 'estimated_hours', label: 'Tiempo estimado (h)', type: 'number', source: 'fixed', width: 16,
    accessor: (t) => t.Request_Estimated_Hours,
  },
  {
    id: 'logged_hours', label: 'Tiempo real (h)', type: 'number', source: 'fixed', width: 14,
    accessor: (t) => t.Request_Logged_Hours,
  },
  {
    id: 'column', label: 'Estado (columna)', type: 'text', source: 'fixed', width: 18,
    accessor: (t) => t.column?.Board_Column_Name ?? '',
  },
  {
    id: 'is_confidential', label: 'Confidencial', type: 'boolean', source: 'fixed', width: 12,
    accessor: (t) => !!t.Request_Is_Confidential,
  },
  {
    id: 'requester', label: 'Solicitante', type: 'text', source: 'fixed', width: 22,
    accessor: (t) => t.requester?.User_Name ?? '',
  },
  {
    id: 'requester_email', label: 'Email solicitante', type: 'text', source: 'fixed', width: 26,
    accessor: (t) => t.requester?.User_Email ?? '',
  },
  {
    id: 'requester_department', label: 'Departamento solicitante', type: 'text', source: 'fixed', width: 24,
    accessor: (t) =>
      t.requester_department?.Department_Name ?? t.requester?.department?.Department_Name ?? '',
  },
  {
    id: 'requester_team', label: 'Equipo solicitante', type: 'text', source: 'fixed', width: 20,
    accessor: (t) => t.requester_team?.Team_Name ?? '',
  },
  {
    id: 'assignees', label: 'Asignados', type: 'text', source: 'fixed', width: 30,
    accessor: getAssigneeNames,
  },
  {
    id: 'created_at', label: 'Fecha creación', type: 'datetime', source: 'fixed', width: 18,
    accessor: (t) => t.Request_Created_At,
  },
  {
    id: 'finished_at', label: 'Fecha cierre', type: 'datetime', source: 'fixed', width: 18,
    accessor: getClosedAt,
  },
  {
    id: 'closure_note', label: 'Nota de cierre', type: 'text', source: 'fixed', width: 50,
    accessor: getClosureNote,
  },
  {
    id: 'closed_by', label: 'Cerrado por', type: 'text', source: 'fixed', width: 22,
    accessor: getClosedBy,
  },
  {
    id: 'parent_id', label: 'Ticket padre', type: 'text', source: 'fixed', width: 16,
    accessor: (t) => t.Request_Parent_ID ?? '',
  },
];

/* ── Detección de columnas DINÁMICAS ──────────────────────── */

/**
 * Recorre el snapshot y devuelve los pares { key, label } encontrados,
 * aplanando los conditionals (true/false branches).
 */
/** Tipos del schema que son puramente visuales (no aportan datos al ticket) */
const NON_DATA_TYPES = new Set([
  'section', 'divider', 'heading', 'info', 'text-block', 'spacer', 'separator', 'label-only',
]);

function collectSnapshotFields(
  schema: unknown[],
): Array<{ key: string; label: string; type: string }> {
  const out: Array<{ key: string; label: string; type: string }> = [];
  const seen = new Set<string>();

  const walk = (arr: unknown[]) => {
    for (const f of arr ?? []) {
      if (!f || typeof f !== 'object') continue;
      const node = f as {
        key?: string;
        label?: string;
        title?: string;
        name?: string;
        type?: string;
        trueBranch?:  unknown[];
        falseBranch?: unknown[];
        children?:    unknown[];
        fields?:      unknown[];
      };

      // 1. Conditionals: detectar por type, o por presencia de branches.
      //    El campo conditional en sí no se añade (no tiene valor de dato),
      //    pero sí recorremos sus ramas.
      const isConditional =
        node.type === 'conditional' ||
        node.type === 'if' ||
        'trueBranch' in node ||
        'falseBranch' in node;

      if (isConditional) {
        walk(node.trueBranch  ?? []);
        walk(node.falseBranch ?? []);
        continue;
      }

      // 2. Si tiene children/fields anidados (grupos no condicionales), recursión
      if (Array.isArray(node.children)) walk(node.children);
      if (Array.isArray(node.fields))   walk(node.fields);

      // 3. Saltar tipos visuales que no son datos
      if (node.type && NON_DATA_TYPES.has(node.type)) continue;

      // 4. Saltar campos sin key real
      const key = typeof node.key === 'string' ? node.key.trim() : '';
      if (!key) continue;

      // 5. Deduplicar por key (puede pasar si el schema tiene errores)
      if (seen.has(key)) continue;
      seen.add(key);

      // 6. Resolver label SOLO si el usuario lo definió.
      //    Si no hay label real (todos vacíos), saltar el campo —
      //    son drafts del template builder sin nombrar.
      const humanLabel =
        (typeof node.label === 'string' && node.label.trim()) ||
        (typeof node.title === 'string' && node.title.trim()) ||
        (typeof node.name  === 'string' && node.name.trim())  ||
        '';

      if (!humanLabel) continue;

      out.push({
        key,
        label: humanLabel,
        type:  node.type ?? 'text',
      });
    }
  };

  walk(schema);
  return out;
}

function mapFieldTypeToColumnType(t: string): ExportColumn['type'] {
  switch (t) {
    case 'number':   return 'number';
    case 'date':     return 'date';
    case 'datetime': return 'datetime';
    case 'checkbox':
    case 'boolean':  return 'boolean';
    default:         return 'text';
  }
}

function dynamicAccessor(key: string) {
  return (t: ExportTicket): unknown => {
    const v = t.Request_Form_Data?.[key];
    if (v === undefined || v === null || v === '') return '';
    // Booleanos: salida legible en humano
    if (typeof v === 'boolean') return v ? 'Sí' : 'No';
    // Arrays: join legible (multi-select, tags, etc.)
    if (Array.isArray(v)) {
      return v
        .map((item) => (typeof item === 'object' ? JSON.stringify(item) : String(item)))
        .filter((s) => s.length > 0)
        .join(', ');
    }
    // String que parece JSON (algunos campos guardan JSON.stringify)
    if (typeof v === 'string') {
      const trimmed = v.trim();
      if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && trimmed.length < 5000) {
        try {
          const parsed = JSON.parse(trimmed);
          if (Array.isArray(parsed)) return parsed.map(String).join(', ');
          if (typeof parsed === 'object' && parsed !== null) {
            return Object.entries(parsed)
              .map(([k, val]) => `${k}: ${val}`)
              .join(' · ');
          }
        } catch { /* no era JSON, dejarlo como string */ }
      }
      return v;
    }
    // Objetos (raros pero por si acaso)
    if (typeof v === 'object') {
      return Object.entries(v as Record<string, unknown>)
        .map(([k, val]) => `${k}: ${val}`)
        .join(' · ');
    }
    return v;
  };
}

/**
 * Detecta los campos dinámicos disponibles agrupados por template.
 * Usa el schema VIVO del template como fuente para los labels
 * (más consistente que mirar snapshots desactualizados), pero las
 * keys presentes son la unión de lo que vive en los snapshots de
 * los tickets devueltos — así no aparecen campos que ningún ticket tiene.
 */
export function detectDynamicColumnsByTemplate(
  tickets:   ExportTicket[],
  templates: ExportTemplate[],
): Map<number, ExportColumn[]> {
  // 1) Unión de keys presentes en snapshots de los tickets, agrupados por templateId
  const keysByTemplate = new Map<number, Set<string>>();
  for (const t of tickets) {
    const tid = t.Request_Template_ID;
    if (!keysByTemplate.has(tid)) keysByTemplate.set(tid, new Set());
    const fields = collectSnapshotFields(t.Request_Template_Schema_Snapshot ?? []);
    for (const f of fields) keysByTemplate.get(tid)!.add(f.key);
  }

  // 2) Para cada template, resolver labels usando schema VIVO + fallback a snapshot
  const result = new Map<number, ExportColumn[]>();
  for (const [tid, keys] of keysByTemplate) {
    const tpl = templates.find((x) => x.Request_Template_ID === tid);
    const liveFields = tpl ? collectSnapshotFields(tpl.Request_Template_Form_Schema) : [];
    const liveMap = new Map(liveFields.map((f) => [f.key, f]));

    // fallback: cualquier snapshot del primer ticket que tenga ese template
    const snapTicket = tickets.find((t) => t.Request_Template_ID === tid);
    const snapFields = snapTicket
      ? collectSnapshotFields(snapTicket.Request_Template_Schema_Snapshot ?? [])
      : [];
    const snapMap = new Map(snapFields.map((f) => [f.key, f]));

    const cols: ExportColumn[] = [];
    for (const key of keys) {
      const meta = liveMap.get(key) ?? snapMap.get(key) ?? { key, label: key, type: 'text' };
      cols.push({
        id:         `dyn:${tid}:${key}`,
        label:      meta.label,
        type:       mapFieldTypeToColumnType(meta.type),
        source:     'dynamic',
        width:      24,
        templateId: tid,
        accessor:   dynamicAccessor(key),
      });
    }
    result.set(tid, cols);
  }

  return result;
}

/**
 * Genera el catálogo completo de columnas disponibles para el wizard.
 * Las fijas primero, luego las dinámicas agrupadas por template.
 */
export function buildAvailableColumns(
  tickets:   ExportTicket[],
  templates: ExportTemplate[],
): { fixed: ExportColumn[]; dynamicByTemplate: Map<number, ExportColumn[]> } {
  return {
    fixed:             FIXED_COLUMNS,
    dynamicByTemplate: detectDynamicColumnsByTemplate(tickets, templates),
  };
}

/** Resuelve un set de IDs seleccionados a ExportColumn[] reales */
export function resolveSelectedColumns(
  selectedIds: string[],
  available:   { fixed: ExportColumn[]; dynamicByTemplate: Map<number, ExportColumn[]> },
  templates:   ExportTemplate[],
): ExportColumn[] {
  const all: ExportColumn[] = [...available.fixed];
  for (const cols of available.dynamicByTemplate.values()) all.push(...cols);

  const byId = new Map(all.map((c) => [c.id, c]));

  return selectedIds
    .map((id) => {
      const col = byId.get(id);
      if (!col) return null;
      // Inyectar nombre de template en la columna template_name
      if (col.id === 'template_name') {
        return {
          ...col,
          accessor: (t: ExportTicket) =>
            templates.find((x) => x.Request_Template_ID === t.Request_Template_ID)?.Request_Template_Name ?? '',
        };
      }
      return col;
    })
    .filter((c): c is ExportColumn => c !== null);
}