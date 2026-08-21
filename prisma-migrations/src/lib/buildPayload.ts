// src/lib/buildPayload.ts
//
// Convierte UNA fila cruda del Excel en el payload de migrateRequest,
// aplicando mapping + transforms + mapas de resolución + asignados.
//
// Devuelve también las "incidencias" (issues) de esa fila, que el
// dry-run reporta. Filosofía: casi nada bloquea la migración; los
// datos faltantes/ambiguos se migran igual y se marcan para revisión.

import type { RawRow } from './excel.ts';
import type { UserResolver } from './users.ts';
import { COL, STATUS_TO_COLUMN, DEFAULT_COLUMN_ID } from '../config/mapping.ts';
import { BOARD_ID, TEMPLATE_ID, TARGET_TEAM_ID, EXTRA_DATA_COLS, EXTRA_DATA_FIELD_KEY } from '../config/runConfig.ts';
import {
  cleanText, normalizeKey, hoursToDecimal,
  colombianDateToUTC, siNoToBool, priorityToScore, deriveProgress,
} from './transforms.ts';

export type IssueLevel = 'warn' | 'info';

export interface Issue {
  level:   IssueLevel;
  field:   string;
  message: string;
}

export interface MigrateRequestPayload {
  sourceFile:      string;
  sourceRow:       number;
  boardId:         number;
  columnId:        number;
  templateId:      number;
  titulo:          string;
  descripcion:     string | null;
  score:           number | null;
  isConfidential:  boolean;
  createdAt:       string | null;
  finishedAt:      string | null;
  progress:        number;
  estimatedHours:  number | null;
  loggedHours:     number | null;
  legacyRequester: string | null;
  teamIds:         number[];
  labelIds:        number[];
  sprintId:        number | null;
  assigneeIds:     number[];
  note:            string | null;
  formData:        Record<string, unknown>;
}

export interface BuildContext {
  sprintMap:    Map<string, number>;  // normalizeKey(texto) → Sprint_ID
  labelMap:     Map<string, number>;  // normalizeKey(nombre) → Label_ID
  userResolver: UserResolver;
  sourceFile:   string;
}

export interface BuildResult {
  payload: MigrateRequestPayload;
  issues:  Issue[];
}

export function buildPayload(
  row: RawRow,
  sourceRow: number,
  ctx: BuildContext,
): BuildResult {
  const issues: Issue[] = [];

  // ── Escalares directos ────────────────────────────────────
  const titulo = cleanText(row[COL.titulo]);
  if (titulo === null)
    issues.push({ level: 'warn', field: COL.titulo, message: 'Sin título (Actividad vacía)' });

  const descripcion = cleanText(row[COL.descripcion]);

  // Score desde Prioridad
  const prioridadRaw = cleanText(row[COL.prioridad]);
  const score = priorityToScore(row[COL.prioridad]);
  if (prioridadRaw !== null && score === null)
    issues.push({ level: 'warn', field: COL.prioridad, message: `Prioridad desconocida: "${prioridadRaw}" → score nulo` });

  const isConfidential = siNoToBool(row[COL.confidencial]);

  // ── Fechas ────────────────────────────────────────────────
  const creadaRaw  = cleanText(row[COL.creada]);
  const createdAt  = colombianDateToUTC(row[COL.creada]);
  if (creadaRaw !== null && createdAt === null)
    issues.push({ level: 'warn', field: COL.creada, message: `Fecha no interpretable: "${creadaRaw}"` });

  const cerradaRaw = cleanText(row[COL.cerrada]);
  const finishedAt = colombianDateToUTC(row[COL.cerrada]);
  if (cerradaRaw !== null && finishedAt === null)
    issues.push({ level: 'warn', field: COL.cerrada, message: `Fecha no interpretable: "${cerradaRaw}"` });

  const progress = deriveProgress(finishedAt);

  // ── Horas ─────────────────────────────────────────────────
  const estimatedHours = hoursToDecimal(row[COL.tiempoEstimado]);
  const loggedHours    = hoursToDecimal(row[COL.tiempoReal]);

  // ── Legacy / equipo solicitante ───────────────────────────
  const legacyRequester = cleanText(row[COL.equipoSolicitante]);

  // ── Columna (status → columna; hoy todo a Historial) ──────
  const statusKey = normalizeKey(row[COL.status]);
  const columnId  = STATUS_TO_COLUMN[statusKey] ?? DEFAULT_COLUMN_ID;

  // ── Sprint (solo el primero; si hay coma, se ignora el resto) ─
  let sprintId: number | null = null;
  const sprintRaw = cleanText(row[COL.sprint]);
  if (sprintRaw !== null) {
    const primero = sprintRaw.split(',')[0].trim();
    if (primero.length > 0) {
      const id = ctx.sprintMap.get(normalizeKey(primero));
      if (id !== undefined) sprintId = id;
      else issues.push({ level: 'info', field: COL.sprint, message: `Sprint "${primero}" se creará/resolverá en commit` });
    }
  }

  // ── Label(s) / Epica — separadas por coma ─────────────────
  const labelIds: number[] = [];
  const epicaRaw = cleanText(row[COL.epica]);
  if (epicaRaw !== null) {
    const nombres = epicaRaw.split(',').map((n) => n.trim()).filter((n) => n.length > 0);
    for (const nombre of nombres) {
      const id = ctx.labelMap.get(normalizeKey(nombre));
      if (id !== undefined) {
        if (!labelIds.includes(id)) labelIds.push(id);
      } else {
        issues.push({ level: 'info', field: COL.epica, message: `Etiqueta "${nombre}" se creará/resolverá en commit` });
      }
    }
  }

  // ── Asignado(s) ───────────────────────────────────────────
  // El Excel separa múltiples resolutores con coma: "Carlos,Monica".
  // Se parte y se resuelve cada nombre por separado.
  const assigneeIds: number[] = [];
  const asignadaRaw = cleanText(row[COL.asignada]);
  if (asignadaRaw !== null) {
    const nombres = asignadaRaw
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0);

    for (const nombre of nombres) {
      const r = ctx.userResolver.resolve(nombre);
      if (r.status === 'ok') {
        if (!assigneeIds.includes(r.userId)) assigneeIds.push(r.userId);
      } else if (r.status === 'not_found') {
        issues.push({ level: 'warn', field: COL.asignada, message: `Asignado no encontrado: "${nombre}" → sin asignar` });
      } else {
        issues.push({ level: 'warn', field: COL.asignada, message: `Asignado ambiguo: "${nombre}" → ${r.candidates.join(' / ')} → sin asignar` });
      }
    }
  }

  // ── Nota → comentario ─────────────────────────────────────
  const note = cleanText(row[COL.notas]);

  // ── Datos adicionales → formData (campo del template de Migraciones) ──
  // Junta cada columna extra con valor como "Etiqueta: valor", separadas
  // por salto de línea. Si ninguna tiene valor → formData queda en {}.
  const formData: Record<string, unknown> = {};
  if (EXTRA_DATA_COLS.length > 0) {
    const partes: string[] = [];
    for (const { excelHeader, label } of EXTRA_DATA_COLS) {
      const valor = cleanText(row[excelHeader]);
      if (valor !== null) partes.push(`${label}: ${valor}`);
    }
    if (partes.length > 0) {
      formData[EXTRA_DATA_FIELD_KEY] = partes.join('\n');
    }
  }

  const payload: MigrateRequestPayload = {
    sourceFile:      ctx.sourceFile,
    sourceRow,
    boardId:         BOARD_ID,
    columnId,
    templateId:      TEMPLATE_ID,
    titulo:          titulo ?? '',
    descripcion,
    score,
    isConfidential,
    createdAt,
    finishedAt,
    progress,
    estimatedHours,
    loggedHours,
    legacyRequester,
    teamIds:         [TARGET_TEAM_ID],
    labelIds,
    sprintId,
    assigneeIds,
    note,
    formData,
  };

  return { payload, issues };
}