// src/components/layout/ConfigPanelComponents/ExportHistoryList.tsx
import { useState } from 'react';
import {
  FileSpreadsheet, FileText, RotateCw, Trash2, AlertCircle,
  CheckCircle2, Loader2, Clock, Download as DownloadIcon, ArchiveX,
} from 'lucide-react';
import { useExportHistory, useDeleteExport, useRepeatExport } from '@/features/exports/hooks/useExportHistory';
import { processExportArtifact } from '@/features/exports/services/processExportArtifact';
import type { ExportHistoryEntry, CreateExportJobResponse } from '@/features/exports/types';

type Props = {
  userId: number;
  /** Cuando se repite un export, padre cambia a vista de progreso con el nuevo job */
  onJobCreated: (res: CreateExportJobResponse, entry: ExportHistoryEntry) => void;
};

export function ExportHistoryList({ userId, onJobCreated }: Props) {
  const { data: history = [], isLoading, isError, error } = useExportHistory(userId);
  const deleteMut = useDeleteExport(userId);
  const repeatMut = useRepeatExport(userId);
  const [reDownloading, setReDownloading] = useState<string | null>(null);
  const [reDownloadErr, setReDownloadErr] = useState<string | null>(null);

  async function handleReDownload(entry: ExportHistoryEntry) {
    if (!entry.Export_Storage_Prefix) return;
    setReDownloading(entry.Export_ID);
    setReDownloadErr(null);
    try {
      await processExportArtifact({
        jobId:            entry.Export_Job_ID,
        exportId:         entry.Export_ID,
        userId,
        format:           entry.Export_Format,
        selectedColumns:  entry.Export_Columns,
        sheetPerTemplate: entry.Export_Sheet_Per_Tpl,
        filters:          entry.Export_Filters,
      });
    } catch (err) {
      setReDownloadErr((err as Error).message);
    } finally {
      setReDownloading(null);
    }
  }

  async function handleRepeat(entry: ExportHistoryEntry) {
    try {
      const res = await repeatMut.mutateAsync(entry.Export_ID);
      onJobCreated(res, entry);
    } catch { /* error visible via mutation state */ }
  }

  async function handleDelete(entry: ExportHistoryEntry) {
    if (!confirm(`¿Eliminar este export del historial?`)) return;
    deleteMut.mutate(entry.Export_ID);
  }

  if (isLoading) {
    return <div className="exports-status"><Loader2 size={14} className="exports-spin" /> Cargando historial…</div>;
  }
  if (isError) {
    return <div className="exports-status exports-status--error"><AlertCircle size={14} /> {(error as Error)?.message}</div>;
  }
  if (history.length === 0) {
    return (
      <div className="exports-empty">
        <p>Aún no hay exportaciones registradas.</p>
        <p style={{ fontSize: 11, marginTop: 8, opacity: 0.7 }}>
          Cuando crees uno desde la pestaña <strong>Nueva exportación</strong>, aparecerá acá.
        </p>
      </div>
    );
  }

  return (
    <div className="exports-history">
      {reDownloadErr && (
        <div className="exports-status exports-status--error">
          <AlertCircle size={14} /> {reDownloadErr}
        </div>
      )}

      {history.map((entry) => (
        <ExportHistoryRow
          key={entry.Export_ID}
          entry={entry}
          isReDownloading={reDownloading === entry.Export_ID}
          isRepeating={repeatMut.isPending && repeatMut.variables === entry.Export_ID}
          isDeleting={deleteMut.isPending && deleteMut.variables === entry.Export_ID}
          onReDownload={() => handleReDownload(entry)}
          onRepeat={() => handleRepeat(entry)}
          onDelete={() => handleDelete(entry)}
        />
      ))}
    </div>
  );
}

/* ── Row ─────────────────────────────────────────────────── */

function ExportHistoryRow({
  entry, isReDownloading, isRepeating, isDeleting,
  onReDownload, onRepeat, onDelete,
}: {
  entry: ExportHistoryEntry;
  isReDownloading: boolean;
  isRepeating:     boolean;
  isDeleting:      boolean;
  onReDownload:    () => void;
  onRepeat:        () => void;
  onDelete:        () => void;
}) {
  const isAvailable = entry.Export_Status === 'done' && !!entry.Export_Storage_Prefix;
  const isExpired   = entry.Export_Status === 'done' && !entry.Export_Storage_Prefix;
  const isFailed    = entry.Export_Status === 'failed';
  const isWorking   = entry.Export_Status === 'pending' || entry.Export_Status === 'running';

  const filterSummary = summarizeFilters(entry.Export_Filters);

  return (
    <div className={`exports-history__row exports-history__row--${entry.Export_Status}`}>
      <div className="exports-history__icon">
        {entry.Export_Format === 'xlsx'
          ? <FileSpreadsheet size={18} />
          : <FileText size={18} />}
      </div>

      <div className="exports-history__info">
        <div className="exports-history__title-row">
          <span className="exports-history__title">
            {entry.Export_File_Name ?? `Export ${entry.Export_Format.toUpperCase()}`}
          </span>
          <StatusBadge status={entry.Export_Status} hasArtifact={!!entry.Export_Storage_Prefix} />
        </div>
        <div className="exports-history__meta-row">
          <span title={new Date(entry.Export_Created_At).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}>
            <Clock size={10} /> {relativeTime(entry.Export_Created_At)}
          </span>
          <span>{entry.Export_Total.toLocaleString('es-CO')} tickets</span>
          <span>{entry.Export_Columns.length} columnas</span>
        </div>
        <div className="exports-history__filters">{filterSummary}</div>
      </div>

      <div className="exports-history__actions">
        {isAvailable && (
          <button
            className="exports-btn exports-btn--primary exports-btn--sm"
            onClick={onReDownload}
            disabled={isReDownloading}
            title="Volver a descargar"
          >
            {isReDownloading
              ? <Loader2 size={11} className="exports-spin" />
              : <DownloadIcon size={11} />}
            Descargar
          </button>
        )}
        {isWorking && (
          <span className="exports-history__working">
            <Loader2 size={12} className="exports-spin" />
            Procesando…
          </span>
        )}
        <button
          className="exports-btn exports-btn--ghost exports-btn--sm"
          onClick={onRepeat}
          disabled={isRepeating || isWorking}
          title="Repetir export con los mismos filtros"
        >
          {isRepeating ? <Loader2 size={11} className="exports-spin" /> : <RotateCw size={11} />}
          Repetir
        </button>
        <button
          className="exports-icon-btn exports-icon-btn--danger"
          onClick={onDelete}
          disabled={isDeleting}
          title="Eliminar del historial"
        >
          {isDeleting ? <Loader2 size={11} className="exports-spin" /> : <Trash2 size={11} />}
        </button>
      </div>

      {isFailed && entry.Export_Error && (
        <div className="exports-history__error">
          <AlertCircle size={11} /> {entry.Export_Error}
        </div>
      )}
      {isExpired && (
        <div className="exports-history__expired">
          <ArchiveX size={11} /> Archivo eliminado (ya fue descargado o expiró). Usá <strong>Repetir</strong> para generarlo de nuevo.
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status, hasArtifact }: { status: ExportHistoryEntry['Export_Status']; hasArtifact: boolean }) {
  if (status === 'done' && !hasArtifact) return <span className="exports-history__badge exports-history__badge--expired">Sin archivo</span>;
  if (status === 'done')    return <span className="exports-history__badge exports-history__badge--done"><CheckCircle2 size={9} /> Listo</span>;
  if (status === 'failed')  return <span className="exports-history__badge exports-history__badge--failed"><AlertCircle size={9} /> Fallido</span>;
  if (status === 'running') return <span className="exports-history__badge exports-history__badge--running"><Loader2 size={9} className="exports-spin" /> En progreso</span>;
  if (status === 'pending') return <span className="exports-history__badge exports-history__badge--pending"><Clock size={9} /> En cola</span>;
  return <span className="exports-history__badge">{status}</span>;
}

function relativeTime(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1)        return 'hace instantes';
  if (m < 60)       return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24)       return `hace ${h} h`;
  const days = Math.floor(h / 24);
  if (days < 30)    return `hace ${days} d`;
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
}

function summarizeFilters(f: ExportHistoryEntry['Export_Filters']): string {
  const parts: string[] = [];
  if (f.teamIds?.length)        parts.push(`${f.teamIds.length} equipo(s)`);
  if (f.sprintIds?.length)      parts.push(`${f.sprintIds.length} sprint(s)`);
  if (f.columnIds?.length)      parts.push(`${f.columnIds.length} columna(s)`);
  if (f.templateIds?.length)    parts.push(`${f.templateIds.length} template(s)`);
  if (f.priorityScores?.length) parts.push(`${f.priorityScores.length} prioridad(es)`);
  if (f.dateFrom || f.dateTo)   parts.push('rango de fechas');
  if (f.isConfidential === true)  parts.push('solo confidenciales');
  if (f.isConfidential === false) parts.push('sin confidenciales');
  return parts.length === 0 ? 'Sin filtros — todos los tickets' : parts.join(' · ');
}