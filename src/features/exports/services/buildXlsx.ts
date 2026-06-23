// src/features/exports/services/buildXlsx.ts
import writeXlsxFile from 'write-excel-file/browser';
import { saveAs } from 'file-saver';
import type {
  ExportColumn,
  ExportConfig,
  ExportDataset,
  ExportTicket,
} from '../types';
import { SCORE_TO_PRIORIDAD } from '@/features/requests/types';

/* ============================================================
   Builder XLSX con write-excel-file v4
   - Tipos locales: el tipado oficial de la librería es estricto y
     omite props que el runtime sí soporta (color de texto, span).
     Usamos shapes propios y casteamos al llamar.
   ============================================================ */

type Cell = {
  value?:           string | number | Date;
  type?:            typeof String | typeof Number | typeof Date | typeof Boolean;
  format?:          string;
  fontWeight?:      'bold';
  fontSize?:        number;
  fontColor?:       string;
  backgroundColor?: string;
  align?:           'left' | 'center' | 'right';
  wrap?:            boolean;
  span?:            number;
};
type Row       = Array<Cell | null>;
type SheetData = Row[];

const HEADER_BG      = '#94effd';  // slate-300 — gris medio
const ALT_ROW_BG     = '#f8fafc';  // slate-50 — gris muy sutil
const SUMMARY_HEADER = '#94effd';  // slate-400 — gris medio para sections

const PRIORITY_BG: Record<string, string> = {
  baja:    '#e2e8f0',
  media:   '#fef3c7',
  alta:    '#fed7aa',
  critica: '#fecaca',
};

/* ── Helpers ─────────────────────────────────────────────── */

function parseIsoUtc(iso: string): Date | undefined {
  if (!iso) return undefined;
  const normalized = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? undefined : d;
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

function safeSheetName(name: string): string {
  return name.replace(/[\\\/\?\*\[\]:]/g, '_').slice(0, 31).trim() || 'Hoja';
}

/* ── Cell builder por tipo de columna ────────────────────── */

function buildCell(col: ExportColumn, ticket: ExportTicket, rowIndex: number): Cell {
  const raw = col.accessor(ticket);
  const altBg = rowIndex % 2 === 1 ? ALT_ROW_BG : undefined;

  switch (col.type) {
    case 'number': {
      const n = raw === '' || raw == null ? undefined : Number(raw);
      const safe = Number.isFinite(n as number) ? (n as number) : undefined;
      return safe === undefined
        ? { value: undefined, backgroundColor: altBg }
        : { type: Number, value: safe, backgroundColor: altBg };
    }
    case 'date': {
      const d = raw ? parseIsoUtc(String(raw)) : undefined;
      return d
        ? { type: Date, value: d, format: 'dd/mm/yyyy', backgroundColor: altBg }
        : { value: undefined, backgroundColor: altBg };
    }
    case 'datetime': {
      const d = raw ? parseIsoUtc(String(raw)) : undefined;
      return d
        ? { type: Date, value: d, format: 'dd/mm/yyyy hh:mm', backgroundColor: altBg }
        : { value: undefined, backgroundColor: altBg };
    }
    case 'boolean':
      return {
        type:            String,
        value:           raw ? 'Sí' : 'No',
        backgroundColor: altBg,
        align:           'center',
      };
    case 'priority': {
      const key = SCORE_TO_PRIORIDAD[ticket.Request_Score ?? -1] ?? '';
      return {
        type:            String,
        value:           String(raw ?? ''),
        backgroundColor: PRIORITY_BG[key] ?? altBg,
        fontWeight:      key === 'critica' ? 'bold' : undefined,
        align:           'center',
      };
    }
    default:
      return {
        type:            String,
        value:           raw == null ? '' : String(raw),
        backgroundColor: altBg,
        wrap:            true,
      };
  }
}

function buildHeaderRow(cols: ExportColumn[]): Row {
  return cols.map((c) => ({
    value:           c.label,
    type:            String,
    fontWeight:      'bold' as const,
    backgroundColor: HEADER_BG,
    align:           'center' as const,
    wrap:            true,
  }));
}

function buildColumnWidths(cols: ExportColumn[]) {
  return cols.map((c) => ({ width: c.width ?? 18 }));
}

/* ── Hoja "Resumen" ──────────────────────────────────────── */

function buildSummarySheet(
  dataset: ExportDataset,
  config:  ExportConfig,
): SheetData {
  const { tickets, templates, boardTeams, boardColumns, meta } = dataset;

  const sectionHeader = (text: string): Row => [
    { value: text, type: String, fontWeight: 'bold', backgroundColor: SUMMARY_HEADER },
    { value: '',   backgroundColor: SUMMARY_HEADER },
  ];

  const kv = (k: string, v: string | number): Row => [
    { value: k,         type: String, fontWeight: 'bold', backgroundColor: '#f1f5f9' },
    { value: String(v), type: String },
  ];

  const rows: SheetData = [];

  rows.push([
    { value: 'PRISMA — Exportación de tickets', type: String, fontSize: 16, fontWeight: 'bold' },
    null,
  ]);
  rows.push([]);

  rows.push(sectionHeader('Información general'));
  rows.push(kv('Fecha de generación', new Date(meta.generatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })));
  rows.push(kv('Tickets exportados',  String(meta.returned)));
  rows.push(kv('Tickets que coinciden con filtros', String(meta.totalMatched)));
  if (meta.truncated) {
    rows.push(kv('⚠ Resultados truncados', `Se exportaron los ${meta.maxLimit} más recientes`));
  }
  rows.push([]);

  rows.push(sectionHeader('Filtros aplicados'));
  const f = config.filters;
  const fmtIds = (arr?: number[] | null) =>
    !arr || arr.length === 0 ? 'Todos' : arr.join(', ');

  rows.push(kv('Equipos',     namesByIds(boardTeams.map((t) => [t.Board_Team_ID, t.Board_Team_Name]), f.teamIds)));
  rows.push(kv('Columnas',    namesByIds(boardColumns.map((c) => [c.Board_Column_ID, c.Board_Column_Name]), f.columnIds)));
  rows.push(kv('Sprints',     fmtIds(f.sprintIds)));
  rows.push(kv('Templates',   namesByIds(templates.map((t) => [t.Request_Template_ID, t.Request_Template_Name]), f.templateIds)));
  rows.push(kv('Prioridades', priorityNames(f.priorityScores)));
  rows.push(kv('Confidencial',
    f.isConfidential === true  ? 'Solo confidenciales'
    : f.isConfidential === false ? 'Solo no confidenciales'
    : 'Todos'));
  rows.push(kv('Desde', f.dateFrom ?? 'Sin límite'));
  rows.push(kv('Hasta', f.dateTo   ?? 'Sin límite'));
  rows.push([]);

  rows.push(sectionHeader('Tickets por equipo'));
  const teamCount = new Map<string, number>();
  for (const t of tickets) {
    for (const tm of t.teams ?? []) {
      const code = tm.team?.Board_Team_Code ?? 'sin_equipo';
      teamCount.set(code, (teamCount.get(code) ?? 0) + 1);
    }
  }
  for (const team of boardTeams) {
    rows.push(kv(team.Board_Team_Name, teamCount.get(team.Board_Team_Code) ?? 0));
  }
  rows.push([]);

  rows.push(sectionHeader('Tickets por template'));
  const tplCount = new Map<number, number>();
  for (const t of tickets) tplCount.set(t.Request_Template_ID, (tplCount.get(t.Request_Template_ID) ?? 0) + 1);
  for (const tpl of templates) {
    if (tplCount.has(tpl.Request_Template_ID)) {
      rows.push(kv(tpl.Request_Template_Name, tplCount.get(tpl.Request_Template_ID) ?? 0));
    }
  }
  rows.push([]);

  rows.push(sectionHeader('Tickets por prioridad'));
  const priorityCount: Record<string, number> = { critica: 0, alta: 0, media: 0, baja: 0, sin_definir: 0 };
  for (const t of tickets) {
    const key = SCORE_TO_PRIORIDAD[t.Request_Score ?? -1] ?? 'sin_definir';
    priorityCount[key] = (priorityCount[key] ?? 0) + 1;
  }
  rows.push(kv('Crítica', priorityCount.critica));
  rows.push(kv('Alta',    priorityCount.alta));
  rows.push(kv('Media',   priorityCount.media));
  rows.push(kv('Baja',    priorityCount.baja));
  if (priorityCount.sin_definir > 0) rows.push(kv('Sin definir', priorityCount.sin_definir));
  rows.push([]);

  rows.push(sectionHeader('Tickets por estado (columna)'));
  const colCount = new Map<string, number>();
  for (const t of tickets) {
    const name = t.column?.Board_Column_Name ?? 'Sin columna';
    colCount.set(name, (colCount.get(name) ?? 0) + 1);
  }
  for (const [name, count] of colCount) rows.push(kv(name, count));

  return rows;
}

function namesByIds(pairs: Array<[number, string]>, ids?: number[] | null): string {
  if (!ids || ids.length === 0) return 'Todos';
  const map = new Map(pairs);
  return ids.map((id) => map.get(id) ?? `#${id}`).join(', ');
}

function priorityNames(scores?: number[] | null): string {
  if (!scores || scores.length === 0) return 'Todas';
  return scores
    .map((s) => SCORE_TO_PRIORIDAD[s] ?? `score:${s}`)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(', ');
}

/* ── Hoja de tickets ─────────────────────────────────────── */

function buildTicketsSheet(tickets: ExportTicket[], cols: ExportColumn[]): SheetData {
  const rows: SheetData = [buildHeaderRow(cols)];
  tickets.forEach((t, idx) => {
    rows.push(cols.map((c) => buildCell(c, t, idx)));
  });
  return rows;
}

function buildEmptyTeamSheet(cols: ExportColumn[]): SheetData {
  const header = buildHeaderRow(cols);
  const messageRow: Row = [
    {
      value:           'Sin tickets en este equipo',
      type:            String,
      fontWeight:      'bold' as const,
      align:           'center' as const,
      backgroundColor: '#f1f5f9',
    },
    ...Array(Math.max(0, cols.length - 1)).fill(null),
  ];
  return [header, messageRow];
}

/* ── Entrypoint (API v4: Sheet[]) ────────────────────────── */

export type BuildXlsxParams = {
  dataset: ExportDataset;
  config:  ExportConfig;
  columns: ExportColumn[];
};

type SheetSpec = {
  sheet:            string;
  data:             SheetData;
  columns?:         Array<{ width?: number }>;
  stickyRowsCount?: number;
};

export async function buildXlsx(params: BuildXlsxParams): Promise<void> {
  const { dataset, config, columns } = params;

  const sheets: SheetSpec[] = [{
    sheet:   'Resumen',
    data:    buildSummarySheet(dataset, config),
    columns: [{ width: 36 }, { width: 60 }],
  }];

  if (config.sheetPerTemplate) {
    // Una hoja por equipo. Tickets multi-equipo aparecen en cada hoja correspondiente.
    const byTeam = new Map<string, { name: string; sortOrder: number; tickets: ExportTicket[] }>();
    for (const team of dataset.boardTeams) {
      byTeam.set(team.Board_Team_Code, {
        name:       team.Board_Team_Name,
        sortOrder:  ('Board_Team_Sort_Order' in team ? (team as { Board_Team_Sort_Order?: number }).Board_Team_Sort_Order : 0) ?? 0,
        tickets:    [],
      });
    }
    byTeam.set('__sin_equipo__', { name: 'Sin equipo', sortOrder: 9999, tickets: [] });

    for (const ticket of dataset.tickets) {
      const codes = (ticket.teams ?? [])
        .map((t) => t.team?.Board_Team_Code)
        .filter((c): c is string => !!c);
      if (codes.length === 0) {
        byTeam.get('__sin_equipo__')!.tickets.push(ticket);
      } else {
        for (const code of codes) {
          const bucket = byTeam.get(code);
          if (bucket) bucket.tickets.push(ticket);
        }
      }
    }

    // Ordenar por Board_Team_Sort_Order — incluimos todos los equipos,
    // los que no tienen tickets reciben una hoja con mensaje.
    // La hoja "Sin equipo" solo se incluye si efectivamente hay tickets sin asignar.
// Si el usuario filtró por equipos específicos en el wizard, solo
    // generamos hojas para esos equipos. Si no filtró, incluimos todos
    // (los vacíos con mensaje). "Sin equipo" solo aparece si hay tickets sin asignar.
    const filteredTeamIds = config.filters.teamIds;
    const isTeamFiltered  = Array.isArray(filteredTeamIds) && filteredTeamIds.length > 0;
    const allowedTeamCodes = isTeamFiltered
      ? new Set(
          dataset.boardTeams
            .filter((tm) => filteredTeamIds!.includes(tm.Board_Team_ID))
            .map((tm) => tm.Board_Team_Code),
        )
      : null;

    const sortedTeams = Array.from(byTeam.entries())
      .filter(([code, t]) => {
        if (code === '__sin_equipo__') return t.tickets.length > 0;
        if (allowedTeamCodes !== null)  return allowedTeamCodes.has(code);
        return true;
      })
      .map(([, t]) => t)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const { name, tickets } of sortedTeams) {
      sheets.push({
        sheet:           safeSheetName(name),
        data:            tickets.length === 0
                           ? buildEmptyTeamSheet(columns)
                           : buildTicketsSheet(tickets, columns),
        columns:         buildColumnWidths(columns),
        stickyRowsCount: 1,
      });
    }
    } else {
    sheets.push({
      sheet:           'Tickets',
      data:            buildTicketsSheet(dataset.tickets, columns),
      columns:         buildColumnWidths(columns),
      stickyRowsCount: 1,
    });
  }

  const now      = new Date();
  const stamp    = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  const fileName = `PRISMA_export_${stamp}.xlsx`;

  // write-excel-file v4 con multi-sheet acepta array de sheet objects
  // y devuelve un wrapper { toBlob, toFile } — no el Blob directo.
  const result = await (writeXlsxFile as unknown as (
    sheets: SheetSpec[],
  ) => Promise<{ toBlob: () => Blob | Promise<Blob> }>)(sheets);

  if (!result || typeof result.toBlob !== 'function') {
    throw new Error('write-excel-file no devolvió un wrapper válido (¿cambió la API?)');
  }

  const blob = await result.toBlob();

  if (!(blob instanceof Blob) || blob.size === 0) {
    throw new Error('No se pudo generar el archivo XLSX (blob vacío).');
  }

  saveAs(blob, fileName);
}