// src/features/exports/services/buildCsv.ts
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type {
  ExportColumn,
  ExportConfig,
  ExportDataset,
  ExportTicket,
} from '../types';
import { SCORE_TO_PRIORIDAD } from '@/features/requests/types';

/* ============================================================
   Builder de CSV — un archivo por template dentro de un ZIP
   UTF-8 BOM para Excel español
   ============================================================ */

const BOM = '\uFEFF';

/** Escapa una celda según RFC 4180 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function parseIsoUtc(iso: string): Date | null {
  if (!iso) return null;
  const normalized = iso.endsWith('Z') || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`;
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function formatCell(col: ExportColumn, t: ExportTicket): string {
  const raw = col.accessor(t);
  if (raw === null || raw === undefined || raw === '') return '';

  switch (col.type) {
    case 'date': {
      const d = parseIsoUtc(String(raw));
      return d ? d.toLocaleDateString('es-CO', { timeZone: 'America/Bogota' }) : '';
    }
    case 'datetime': {
      const d = parseIsoUtc(String(raw));
      return d ? d.toLocaleString('es-CO', { timeZone: 'America/Bogota' }) : '';
    }
    case 'boolean':
      return raw ? 'Sí' : 'No';
    case 'priority':
      return String(raw);
    case 'number':
      return String(raw);
    default:
      return String(raw);
  }
}

function ticketsToCsv(tickets: ExportTicket[], cols: ExportColumn[]): string {
  const header = cols.map((c) => escapeCell(c.label)).join(',');
  const rows   = tickets.map((t) =>
    cols.map((c) => escapeCell(formatCell(c, t))).join(','),
  );
  return BOM + [header, ...rows].join('\r\n');
}

function emptyTeamCsv(cols: ExportColumn[]): string {
  const header = cols.map((c) => escapeCell(c.label)).join(',');
  const emptyCells = cols.length > 1 ? ',' + Array(cols.length - 1).fill('').join(',') : '';
  const messageRow = `${escapeCell('Sin tickets en este equipo')}${emptyCells}`;
  return BOM + [header, messageRow].join('\r\n');
}

function buildSummaryCsv(dataset: ExportDataset, config: ExportConfig): string {
  const lines: string[] = [];
  lines.push('PRISMA — Exportación de tickets');
  lines.push('');
  lines.push(['Fecha de generación', new Date(dataset.meta.generatedAt).toLocaleString('es-CO', { timeZone: 'America/Bogota' })].map(escapeCell).join(','));
  lines.push(['Tickets exportados', dataset.meta.returned].map(escapeCell).join(','));
  lines.push(['Tickets que coinciden con filtros', dataset.meta.totalMatched].map(escapeCell).join(','));
  if (dataset.meta.truncated) {
    lines.push(['Resultados truncados', `Se exportaron los ${dataset.meta.maxLimit} más recientes`].map(escapeCell).join(','));
  }
  lines.push('');
  lines.push('Conteo por template');
  const tplCount = new Map<number, number>();
  for (const t of dataset.tickets) tplCount.set(t.Request_Template_ID, (tplCount.get(t.Request_Template_ID) ?? 0) + 1);
  for (const tpl of dataset.templates) {
    if (tplCount.has(tpl.Request_Template_ID)) {
      lines.push([tpl.Request_Template_Name, tplCount.get(tpl.Request_Template_ID) ?? 0].map(escapeCell).join(','));
    }
  }
  lines.push('');
  lines.push('Conteo por prioridad');
  const priorityCount: Record<string, number> = { critica: 0, alta: 0, media: 0, baja: 0 };
  for (const t of dataset.tickets) {
    const key = SCORE_TO_PRIORIDAD[t.Request_Score ?? -1];
    if (key) priorityCount[key] = (priorityCount[key] ?? 0) + 1;
  }
  lines.push(['Crítica', priorityCount.critica].map(escapeCell).join(','));
  lines.push(['Alta',    priorityCount.alta].map(escapeCell).join(','));
  lines.push(['Media',   priorityCount.media].map(escapeCell).join(','));
  lines.push(['Baja',    priorityCount.baja].map(escapeCell).join(','));

  // Filtros aplicados
  void config; // referencia para futuros campos de filtro detallado

  return BOM + lines.join('\r\n');
}

function safeFileName(name: string): string {
  return name.replace(/[\\\/\?\*\[\]:<>|"]/g, '_').trim() || 'Archivo';
}

function pad(n: number): string { return String(n).padStart(2, '0'); }

/* ── Entrypoint ─────────────────────────────────────────── */

export type BuildCsvParams = {
  dataset: ExportDataset;
  config:  ExportConfig;
  columns: ExportColumn[];
};

export async function buildCsv(params: BuildCsvParams): Promise<void> {
  const { dataset, config, columns } = params;
  const zip = new JSZip();

  zip.file('00_Resumen.csv', buildSummaryCsv(dataset, config));

  if (config.sheetPerTemplate) {
    // Un CSV por equipo. Tickets multi-equipo aparecen en cada archivo correspondiente.
    const byTeam = new Map<string, { name: string; sortOrder: number; tickets: ExportTicket[] }>();
    for (const team of dataset.boardTeams) {
      byTeam.set(team.Board_Team_Code, {
        name:      team.Board_Team_Name,
        sortOrder: ('Board_Team_Sort_Order' in team ? (team as { Board_Team_Sort_Order?: number }).Board_Team_Sort_Order : 0) ?? 0,
        tickets:   [],
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

    let idx = 1;
    for (const { name, tickets } of sortedTeams) {
      const csv      = tickets.length === 0
        ? emptyTeamCsv(columns)
        : ticketsToCsv(tickets, columns);
      const fileName = `${String(idx).padStart(2, '0')}_${safeFileName(name)}.csv`;
      zip.file(fileName, csv);
      idx++;
    }
  } else {
    zip.file('01_Tickets.csv', ticketsToCsv(dataset.tickets, columns));
  }

  const blob  = await zip.generateAsync({ type: 'blob' });
  const now   = new Date();
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
  saveAs(blob, `PRISMA_export_${stamp}.zip`);
}