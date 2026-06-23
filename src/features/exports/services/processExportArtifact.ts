// src/features/exports/services/processExportArtifact.ts
import { apiClient } from '@/lib/apiClient';
import { buildXlsx } from './buildXlsx';
import { buildCsv } from './buildCsv';
import { buildAvailableColumns, resolveSelectedColumns } from './columnRegistry';
import type {
  ExportArtifactUrls,
  ExportDataset,
  ExportTicket,
  ExportHistoryEntry,
} from '../types';

/* ============================================================
   Descarga y procesa los artifacts de un export terminado
   ============================================================ */

export type ProcessExportArtifactParams = {
  jobId:       string;
  exportId:    string;
  userId:      number;
  format:      'xlsx' | 'csv';
  selectedColumns: string[];
  sheetPerTemplate: boolean;
  /** Filtros usados — para reconstruir el ExportConfig que llevan los builders */
  filters:     ExportHistoryEntry['Export_Filters'];
};

/** Descarga un JSON desde signed URL */
async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fallo al descargar artifact (${res.status})`);
  return res.json();
}

/**
 * 1. Pide al backend las signed URLs (metadata + N chunks)
 * 2. Descarga metadata (catálogos del board)
 * 3. Descarga todos los chunks en paralelo y los concatena
 * 4. Reconstruye un ExportDataset compatible con buildXlsx/buildCsv
 * 5. Llama al builder correspondiente — dispara el download para el usuario
 * 6. Confirma al backend para que limpie Storage
 */
export async function processExportArtifact(params: ProcessExportArtifactParams): Promise<void> {
  const { jobId, exportId, userId, format, selectedColumns, sheetPerTemplate, filters } = params;

  // 1. Pedir URLs firmadas
  const urls = await apiClient.call<ExportArtifactUrls>('getExportArtifactUrls', { jobId, userId });

  if (!urls.metadataUrl) {
    throw new Error('Metadata no disponible — el export pudo haber expirado.');
  }

  // 2. Descargar metadata + chunks en paralelo
  const [metadata, ...chunkResults] = await Promise.all([
    fetchJson<{
      templates:    ExportDataset['templates'];
      boardTeams:   ExportDataset['boardTeams'];
      boardColumns: ExportDataset['boardColumns'];
      meta:         ExportDataset['meta'];
    }>(urls.metadataUrl),
    ...urls.chunkUrls.map((u) => fetchJson<{ tickets: ExportTicket[] }>(u)),
  ]);

  // 3. Concatenar tickets de todos los chunks (mantener orden)
  const tickets: ExportTicket[] = chunkResults.flatMap((c) => c.tickets);

  // 4. Reconstruir dataset
  const dataset: ExportDataset = {
    tickets,
    templates:    metadata.templates,
    boardTeams:   metadata.boardTeams,
    boardColumns: metadata.boardColumns,
    meta: {
      ...metadata.meta,
      returned:    tickets.length,
      totalMatched: metadata.meta.totalMatched,
    },
  };

  // 5. Resolver columnas y construir archivo
  const available = buildAvailableColumns(dataset.tickets, dataset.templates);
  const columns   = resolveSelectedColumns(selectedColumns, available, dataset.templates);

  if (columns.length === 0) {
    throw new Error(
      'No se pudo resolver ninguna columna válida. ' +
      'Es posible que los campos seleccionados ya no existan en los templates actuales. ' +
      'Volvé a crear el export con columnas frescas.',
    );
  }

  if (dataset.tickets.length === 0) {
    throw new Error('No se descargó ningún ticket del backend. Revisá si los archivos del Storage siguen disponibles.');
  }

  const exportConfig = {
    filters: { ...filters, boardId: filters.boardId ?? 1 },
    selectedColumns,
    format,
    sheetPerTemplate,
  };

  // 6. Construir el archivo (tira error si algo falla — saveAs no se ejecutó)
  if (format === 'xlsx') {
    await buildXlsx({ dataset, config: exportConfig, columns });
  } else {
    await buildCsv({ dataset, config: exportConfig, columns });
  }

  // 7. Solo confirmar (= limpiar storage) si el build realmente disparó el download
  await apiClient.call('confirmExportDownloaded', { jobId, exportId, userId });
}