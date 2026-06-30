// src/features/exports/services/processExportArtifact.ts
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { apiClient } from '@/lib/apiClient';
import { buildXlsx, buildXlsxSummaryBlob, buildXlsxTicketsBlob } from './buildXlsx';
import { buildCsv, ticketsToCsv, buildSummaryCsv } from './buildCsv';
import { buildAvailableColumns, resolveSelectedColumns } from './columnRegistry';
import type {
  ExportArtifactUrls,
  ExportColumn,
  ExportConfig,
  ExportDataset,
  ExportTicket,
  ExportHistoryEntry,
} from '../types';

/* ============================================================
   Descarga y procesa los artifacts de un export terminado
   ============================================================ */

// Máximo de filas por archivo antes de partir en varios (ZIP). Espejo de
// EXPORT_CHUNK_SIZE del backend. Si lo querés centralizar, movelo a @/config.
const MAX_ROWS_PER_FILE = 25_000;
// Descargas de chunks simultáneas. Acota el pico de memoria/red.
const DOWNLOAD_CONCURRENCY = 5;

export type ProcessExportArtifactParams = {
  jobId:            string;
  exportId:         string;
  userId:           number;
  format:           'xlsx' | 'csv';
  selectedColumns:  string[];
  sheetPerTemplate: boolean;
  filters:          ExportHistoryEntry['Export_Filters'];
};

function pad(n: number): string { return String(n).padStart(2, '0'); }

function fileStamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fallo al descargar artifact (${res.status})`);
  return res.json();
}

/** Descarga todos los chunks en orden, con concurrencia acotada. */
async function downloadAllTickets(chunkUrls: string[]): Promise<ExportTicket[]> {
  const all: ExportTicket[] = [];
  for (let i = 0; i < chunkUrls.length; i += DOWNLOAD_CONCURRENCY) {
    const batch   = chunkUrls.slice(i, i + DOWNLOAD_CONCURRENCY);
    const results = await Promise.all(batch.map((u) => fetchJson<{ tickets: ExportTicket[] }>(u)));
    for (const r of results) all.push(...r.tickets);
    // results sale de scope → GC entre lotes
  }
  return all;
}

/** Split XLSX: 00_Resumen.xlsx + partes de ≤ MAX_ROWS_PER_FILE, todo en un ZIP. */
async function buildXlsxZipSplit(dataset: ExportDataset, config: ExportConfig, columns: ExportColumn[]): Promise<void> {
  const zip       = new JSZip();
  const total     = dataset.tickets.length;
  const partCount = Math.ceil(total / MAX_ROWS_PER_FILE);

  // Resumen primero — usa el set completo de tickets (solo cuenta, barato).
  zip.file('00_Resumen.xlsx', await buildXlsxSummaryBlob({ dataset, config }));

  // Partes: voy sacando slices del frente con splice → libera memoria a medida que avanza.
  for (let i = 0; i < partCount; i++) {
    const slice = dataset.tickets.splice(0, MAX_ROWS_PER_FILE);
    const blob  = await buildXlsxTicketsBlob({ tickets: slice, dataset, config, columns });
    zip.file(`Tickets_parte_${pad(i + 1)}_de_${pad(partCount)}.xlsx`, blob);
    // slice y las celdas formateadas salen de scope → GC antes de la próxima parte
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  saveAs(zipBlob, `PRISMA_export_${fileStamp()}.zip`);
}

/** Split CSV: 00_Resumen.csv + partes de ≤ MAX_ROWS_PER_FILE, todo en un ZIP. */
async function buildCsvZipSplit(dataset: ExportDataset, config: ExportConfig, columns: ExportColumn[]): Promise<void> {
  const zip       = new JSZip();
  const total     = dataset.tickets.length;
  const partCount = Math.ceil(total / MAX_ROWS_PER_FILE);

  zip.file('00_Resumen.csv', buildSummaryCsv(dataset, config));

  for (let i = 0; i < partCount; i++) {
    const slice = dataset.tickets.splice(0, MAX_ROWS_PER_FILE);
    zip.file(`Tickets_parte_${pad(i + 1)}_de_${pad(partCount)}.csv`, ticketsToCsv(slice, columns));
  }

  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  saveAs(zipBlob, `PRISMA_export_${fileStamp()}.zip`);
}

export async function processExportArtifact(params: ProcessExportArtifactParams): Promise<void> {
  const { jobId, exportId, userId, format, selectedColumns, sheetPerTemplate, filters } = params;

  // 1. URLs firmadas
  const urls = await apiClient.call<ExportArtifactUrls>('getExportArtifactUrls', { jobId, userId });
  if (!urls.metadataUrl) {
    throw new Error('Metadata no disponible — el export pudo haber expirado.');
  }

  // 2. Metadata (catálogos) + 3. todos los chunks (concurrencia acotada, en orden)
  const metadata = await fetchJson<{
    templates:    ExportDataset['templates'];
    boardTeams:   ExportDataset['boardTeams'];
    boardColumns: ExportDataset['boardColumns'];
    meta:         ExportDataset['meta'];
  }>(urls.metadataUrl);

  const tickets = await downloadAllTickets(urls.chunkUrls);

  if (tickets.length === 0) {
    throw new Error('No se descargó ningún ticket del backend. Revisá si los archivos del Storage siguen disponibles.');
  }

  // 4. Dataset
  const dataset: ExportDataset = {
    tickets,
    templates:    metadata.templates,
    boardTeams:   metadata.boardTeams,
    boardColumns: metadata.boardColumns,
    meta: {
      ...metadata.meta,
      returned:     tickets.length,
      totalMatched: metadata.meta.totalMatched,
    },
  };

  // 5. Columnas (detectadas sobre el set completo → consistentes en todas las partes)
  const available = buildAvailableColumns(dataset.tickets, dataset.templates);
  const columns   = resolveSelectedColumns(selectedColumns, available, dataset.templates);
  if (columns.length === 0) {
    throw new Error(
      'No se pudo resolver ninguna columna válida. ' +
      'Es posible que los campos seleccionados ya no existan en los templates actuales. ' +
      'Volvé a crear el export con columnas frescas.',
    );
  }

  const exportConfig: ExportConfig = {
    filters: { ...filters, boardId: filters.boardId ?? 1 },
    selectedColumns,
    format,
    sheetPerTemplate,
  };

  // 6. Construir — un solo archivo si entra en el umbral, ZIP partido si lo supera.
  const needsSplit = tickets.length > MAX_ROWS_PER_FILE;

  if (format === 'xlsx') {
    if (needsSplit) await buildXlsxZipSplit(dataset, exportConfig, columns);
    else            await buildXlsx({ dataset, config: exportConfig, columns });
  } else {
    if (needsSplit) await buildCsvZipSplit(dataset, exportConfig, columns);
    else            await buildCsv({ dataset, config: exportConfig, columns });
  }

  // 7. Confirmar (= limpiar Storage) solo si el build disparó la descarga.
  await apiClient.call('confirmExportDownloaded', { jobId, exportId, userId });
}