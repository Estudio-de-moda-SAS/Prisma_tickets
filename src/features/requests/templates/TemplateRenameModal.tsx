import { useEffect, useState } from 'react';
import type { Rename } from './renameUtils';

type Phase = 'confirm' | 'processing' | 'done' | 'error';

const PROCESSING_MESSAGES = [
  'Actualizando esquema del template…',
  'Procesando solicitudes existentes…',
  'Sincronizando snapshots…',
  'Casi listo…',
];

export function TemplateRenameModal({
  isOpen,
  renames,
  requestsCount,
  accentColor = '#00c8ff',
  phase,
  progressCurrent = 0,
  progressTotal   = 0,
  resultCount     = 0,
  errorMessage    = null,
  onConfirm,
  onCancel,
  onClose,
}: {
  isOpen:           boolean;
  renames:          Rename[];
  requestsCount:    number;
  accentColor?:     string;
  phase:            Phase;
  progressCurrent?: number;
  progressTotal?:   number;
  resultCount?:     number;
  errorMessage?:    string | null;
  onConfirm:        () => void;
  onCancel:         () => void;
  onClose:          () => void;
}) {
  const [msgIdx, setMsgIdx] = useState(0);
  useEffect(() => {
    if (phase !== 'processing') return;
    const t = setInterval(() => setMsgIdx((i) => (i + 1) % PROCESSING_MESSAGES.length), 1600);
    return () => clearInterval(t);
  }, [phase]);

  if (!isOpen) return null;

  const pct = progressTotal > 0 ? Math.min(100, Math.round((progressCurrent / progressTotal) * 100)) : 0;

  return (
    <div className="trename-backdrop" role="dialog" aria-modal="true">
      <div className="trename-panel" style={{ ['--trename-accent' as string]: accentColor }}>
        <div className="trename-accent-line" />

        {phase === 'confirm' && (
          <>
            <div className="trename-header">
              <span className="trename-eyebrow">Confirmar cambios estructurales</span>
              <h3 className="trename-title">Renombre de campos detectado</h3>
              <p className="trename-subtitle">
                Estos cambios sincronizarán <strong>{requestsCount}</strong> solicitud
                {requestsCount === 1 ? '' : 'es'} existente{requestsCount === 1 ? '' : 's'} de este template.
              </p>
            </div>

            <div className="trename-body">
              <div className="trename-list">
                {renames.map((r, i) => (
                  <div key={i} className="trename-row">
                    <code className="trename-old">{r.oldKey}</code>
                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                      <path d="M2 7h9M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                    <code className="trename-new">{r.newKey}</code>
                  </div>
                ))}
              </div>

              <div className="trename-warning">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
                  <path d="M7 1.5L12.5 11h-11L7 1.5z M7 6v2.5 M7 10v.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <span>
                  Cada solicitud actualizará su <code>Form_Data</code> y su snapshot histórico.
                  El proceso corre en background y puedes seguir el progreso aquí. La operación queda registrada en la auditoría y <strong>no es reversible</strong> automáticamente.
                </span>
              </div>
            </div>

            <div className="trename-footer">
              <button className="trename-btn trename-btn--ghost" onClick={onCancel}>Cancelar</button>
              <button className="trename-btn trename-btn--primary" onClick={onConfirm}>
                Aplicar y sincronizar
              </button>
            </div>
          </>
        )}

        {phase === 'processing' && (
          <div className="trename-processing">
            <div className="trename-spinner" />
            <div className="trename-processing-text">
              <span className="trename-processing-title">Procesando</span>
              <span className="trename-processing-msg">{PROCESSING_MESSAGES[msgIdx]}</span>
            </div>

            <div className="trename-progress">
              <div className="trename-progress-bar">
                <div className="trename-progress-fill" style={{ width: `${pct}%` }} />
              </div>
              <div className="trename-progress-meta">
                <span>
                  <strong>{progressCurrent.toLocaleString('es-CO')}</strong>
                  {' '}/{' '}
                  {progressTotal.toLocaleString('es-CO')} solicitudes
                </span>
                <span className="trename-progress-pct">{pct}%</span>
              </div>
            </div>

            <p className="trename-processing-hint">
              Podés cerrar esta ventana — el proceso seguirá en background.
              Al volver a editar el template verás el resultado.
            </p>
          </div>
        )}

        {phase === 'done' && (
          <div className="trename-result">
            <div className="trename-result-icon trename-result-icon--ok">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M7 14.5l4.5 4.5L21 9.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3 className="trename-result-title">Sincronización completada</h3>
            <p className="trename-result-subtitle">
              {resultCount.toLocaleString('es-CO')} solicitud{resultCount === 1 ? '' : 'es'} actualizada{resultCount === 1 ? '' : 's'} correctamente.
            </p>
            <div className="trename-footer trename-footer--center">
              <button className="trename-btn trename-btn--primary" onClick={onClose}>Listo</button>
            </div>
          </div>
        )}

        {phase === 'error' && (
          <div className="trename-result">
            <div className="trename-result-icon trename-result-icon--err">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M9 9l10 10M19 9L9 19" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
              </svg>
            </div>
            <h3 className="trename-result-title">No se pudo completar</h3>
            <p className="trename-result-subtitle">{errorMessage ?? 'Error desconocido al sincronizar.'}</p>
            <div className="trename-footer trename-footer--center">
              <button className="trename-btn trename-btn--ghost" onClick={onClose}>Cerrar</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}