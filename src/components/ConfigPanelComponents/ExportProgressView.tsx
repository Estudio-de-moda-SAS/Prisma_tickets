// src/components/layout/ConfigPanelComponents/ExportProgressView.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { Loader2, CheckCircle2, AlertCircle, Download, ArrowLeft, Clock } from 'lucide-react';
import { useExportJob } from '@/features/exports/hooks/useExportJob';
import { processExportArtifact } from '@/features/exports/services/processExportArtifact';
import type { ExportFilters, ExportFormat } from '@/features/exports/types';

type Stage = 'job' | 'downloading' | 'done' | 'error';

type Props = {
  jobId:            string;
  exportId:         string;
  userId:           number;
  format:           ExportFormat;
  selectedColumns:  string[];
  sheetPerTemplate: boolean;
  filters:          ExportFilters;
  /** Tickets esperados — para mostrar % cuando aún no llegan progress updates */
  totalExpected:    number;
  onBack:           () => void;
};

export function ExportProgressView(p: Props) {
  const [stage, setStage]       = useState<Stage>('job');
  const [downloadErr, setDlErr] = useState<string | null>(null);
  const startedAt               = useRef(Date.now());
  const autoTriggered           = useRef(false);

  const { data: job, error: jobError } = useExportJob(p.jobId);

  // Auto-disparar download cuando el job termine
  useEffect(() => {
    if (!job || autoTriggered.current) return;
    if (job.Job_Status === 'done') {
      autoTriggered.current = true;
      setStage('downloading');
      processExportArtifact({
        jobId:            p.jobId,
        exportId:         p.exportId,
        userId:           p.userId,
        format:           p.format,
        selectedColumns:  p.selectedColumns,
        sheetPerTemplate: p.sheetPerTemplate,
        filters:          p.filters,
      })
        .then(() => setStage('done'))
        .catch((err) => {
          setDlErr((err as Error).message);
          setStage('error');
        });
    } else if (job.Job_Status === 'failed') {
      autoTriggered.current = true;
      setDlErr(job.Job_Error ?? 'El procesamiento del job falló.');
      setStage('error');
    }
  }, [job, p]);

  // Métricas de progreso
  const { pct, elapsedSec, etaSec } = useMemo(() => {
    const current = job?.Job_Progress_Current ?? 0;
    const total   = job?.Job_Progress_Total   ?? p.totalExpected;
    const pct     = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
    const elapsed = Math.floor((Date.now() - startedAt.current) / 1000);
    let eta: number | null = null;
    if (current > 0 && current < total && elapsed > 2) {
      const ticketsPerSec = current / elapsed;
      eta = Math.ceil((total - current) / ticketsPerSec);
    }
    return { pct, elapsedSec: elapsed, etaSec: eta };
  }, [job, p.totalExpected]);

  /* ── Render ──────────────────────────────────────────── */

  if (jobError) {
    return (
      <div className="exports-progress">
        <ProgressHeader stage="error" onBack={p.onBack} />
        <div className="exports-progress__error">
          <AlertCircle size={28} />
          <p>Error al consultar el estado del job: {(jobError as Error).message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="exports-progress">
      <ProgressHeader stage={stage} onBack={p.onBack} canGoBack={stage !== 'downloading'} />

      <div className="exports-progress__body">
        <ProgressIcon stage={stage} />

        <div className="exports-progress__title">
          {stage === 'job'         && 'Procesando tu exportación…'}
          {stage === 'downloading' && 'Descargando y armando el archivo…'}
          {stage === 'done'        && '¡Listo! El archivo se descargó.'}
          {stage === 'error'       && 'No se pudo completar la exportación'}
        </div>

        {(stage === 'job' || stage === 'downloading') && (
          <>
            <div className="exports-progress__bar">
              <div className="exports-progress__bar-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="exports-progress__stats">
              <span>{job?.Job_Progress_Current ?? 0} / {job?.Job_Progress_Total ?? p.totalExpected} tickets</span>
              <span className="exports-progress__pct">{pct}%</span>
            </div>
            <div className="exports-progress__meta">
              <span><Clock size={11} /> {formatDuration(elapsedSec)} transcurridos</span>
              {etaSec !== null && stage === 'job' && (
                <span>~{formatDuration(etaSec)} restante</span>
              )}
            </div>
          </>
        )}

        {stage === 'done' && (
          <div className="exports-progress__success">
            <p>El archivo ya está en tu carpeta de descargas.</p>
            <p className="exports-progress__success-sub">
              Si necesitás generarlo de nuevo, podés repetirlo desde el historial.
            </p>
          </div>
        )}

        {stage === 'error' && (
          <div className="exports-progress__error-body">
            <p>{downloadErr}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressHeader({ stage, onBack, canGoBack = true }: { stage: Stage; onBack: () => void; canGoBack?: boolean }) {
  return (
    <div className="exports-progress__header">
      <button
        className="exports-btn exports-btn--ghost"
        onClick={onBack}
        disabled={!canGoBack}
      >
        <ArrowLeft size={14} /> {stage === 'done' || stage === 'error' ? 'Volver' : 'Mantener en segundo plano'}
      </button>
    </div>
  );
}

function ProgressIcon({ stage }: { stage: Stage }) {
  if (stage === 'done')  return <CheckCircle2 size={48} className="exports-progress__icon exports-progress__icon--ok" />;
  if (stage === 'error') return <AlertCircle   size={48} className="exports-progress__icon exports-progress__icon--err" />;
  if (stage === 'downloading') return <Download size={48} className="exports-progress__icon exports-spin" />;
  return <Loader2 size={48} className="exports-progress__icon exports-spin" />;
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}m ${s}s`;
}