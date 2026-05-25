// src/features/requests/components/ClientReviewBanner.tsx
import React, { useState } from 'react';
import {
  CheckCircle, XCircle, FileText, Image, File,
  ThumbsUp, ThumbsDown, Clock, AlertCircle,
} from 'lucide-react';
import type { CierreInfo, ClientFeedback, Equipo, SubmitClientFeedbackPayload } from '../types';
import { useSubmitClientFeedback } from '../hooks/useClientFeedback';

const ACCENT = '#34d399'; // verde de cliente_review

function fmtColombia(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
}

function AttachmentIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <Image size={13} />;
  if (mime === 'application/pdf' || mime.includes('text')) return <FileText size={13} />;
  return <File size={13} />;
}

/* ─────────────────────────────────────────────────────────────
   Sub-componente: evidencia del closure (solo lectura)
───────────────────────────────────────────────────────────── */
function EvidenceBlock({ cierreInfo }: { cierreInfo: CierreInfo }) {
  const allAttachments = [
    ...(cierreInfo.attachments ?? []).map((a) => ({
      url:  a.signedUrl,
      name: a.fileName,
      mime: a.mimeType,
    })),
    ...(
      (cierreInfo.attachments ?? []).length === 0 && cierreInfo.attachmentUrl
        ? [{ url: cierreInfo.attachmentUrl, name: cierreInfo.attachmentName, mime: cierreInfo.attachmentMime ?? '' }]
        : []
    ),
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Quién subió la evidencia */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{
          width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
          background: `linear-gradient(135deg, ${ACCENT}80, ${ACCENT})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 8, fontWeight: 700, color: 'white',
        }}>
          {initials(cierreInfo.closedBy.userName || 'U')}
        </div>
        <span style={{ fontSize: 12, color: 'var(--txt)', fontWeight: 500 }}>
          {cierreInfo.closedBy.userName || 'Usuario'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>
          subió evidencia el {fmtColombia(cierreInfo.closedAt)}
        </span>
      </div>

      {/* Nota de evidencia */}
      <div style={{
        padding: '10px 13px', borderRadius: 8,
        background: 'var(--bg-surface)',
        border: `1px solid ${ACCENT}25`,
        fontSize: 13, color: 'var(--txt)', lineHeight: 1.65,
        wordBreak: 'break-word',
      }}>
        {cierreInfo.closureNote}
      </div>

      {/* Adjuntos */}
      {allAttachments.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 2,
            textTransform: 'uppercase', color: 'var(--txt-muted)',
          }}>
            Archivos adjuntos
          </span>
          {allAttachments.map((att, idx) => {
            if (!att.url) return null;
            const isImage = att.mime?.startsWith('image/');
            return (
              <a
                key={idx}
                href={att.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 9,
                  padding: '8px 11px', borderRadius: 7, textDecoration: 'none',
                  background: `${ACCENT}06`,
                  border: `1px solid ${ACCENT}22`,
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${ACCENT}55`; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${ACCENT}22`; }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                  background: `${ACCENT}12`, border: `1px solid ${ACCENT}25`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: ACCENT,
                }}>
                  {isImage ? <Image size={13} /> : <AttachmentIcon mime={att.mime ?? ''} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {att.name ?? 'Evidencia adjunta'}
                  </div>
                  <div style={{ fontSize: 9, color: ACCENT, marginTop: 1 }}>Ver evidencia →</div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Sub-componente: historial de feedback previo (solo lectura)
───────────────────────────────────────────────────────────── */
function FeedbackHistory({ feedback }: { feedback: ClientFeedback }) {
  const isApproved = feedback.decision === 'approved';
  const color      = isApproved ? 'var(--success)' : 'var(--danger)';
  const bg         = isApproved ? 'rgba(0,229,160,0.06)' : 'rgba(255,71,87,0.06)';
  const border     = isApproved ? 'rgba(0,229,160,0.25)' : 'rgba(255,71,87,0.25)';

  return (
    <div style={{
      borderRadius: 8, overflow: 'hidden',
      border: `1px solid ${border}`,
      background: bg,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 12px',
        borderBottom: `1px solid ${border}`,
        background: isApproved ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)',
      }}>
        {isApproved
          ? <CheckCircle size={13} style={{ color, flexShrink: 0 }} />
          : <XCircle    size={13} style={{ color, flexShrink: 0 }} />
        }
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color, flex: 1 }}>
          {isApproved ? 'Aprobado anteriormente' : 'Rechazado anteriormente'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>
          {fmtColombia(feedback.submittedAt)}
        </span>
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{
            width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
            background: `linear-gradient(135deg, ${color}80, ${color})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 7, fontWeight: 700, color: 'white',
          }}>
            {initials(feedback.submitterName || 'U')}
          </div>
          <span style={{ fontSize: 11, color: 'var(--txt)', fontWeight: 500 }}>
            {feedback.submitterName}
          </span>
        </div>
        {feedback.feedbackNote && (
          <div style={{
            padding: '7px 10px', borderRadius: 6,
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            fontSize: 12, color: 'var(--txt)', lineHeight: 1.55,
            wordBreak: 'break-word', fontStyle: 'italic',
          }}>
            "{feedback.feedbackNote}"
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Props principales
───────────────────────────────────────────────────────────── */
type Props = {
  requestId:       string;
  requestTitle:    string;
  cierreInfo:      CierreInfo | null | undefined;
  existingFeedback: ClientFeedback | null | undefined;
  currentUserId:   number | undefined;
  solicitanteId:   number;
  equipo:          Equipo;
  readyToDeployColumnId: number;
  enRevisionQasColumnId: number;
  onFeedbackSubmitted: (targetColumna: 'ready_to_deploy' | 'en_revision_qas') => void;
};

/* ─────────────────────────────────────────────────────────────
   ClientReviewBanner — componente principal
───────────────────────────────────────────────────────────── */
export function ClientReviewBanner({
  requestId,
  requestTitle,
  cierreInfo,
  existingFeedback,
  currentUserId,
  solicitanteId,
  equipo,
  readyToDeployColumnId,
  enRevisionQasColumnId,
  onFeedbackSubmitted,
}: Props) {
  const [decision,      setDecision]      = useState<'approved' | 'rejected' | null>(null);
  const [feedbackNote,  setFeedbackNote]  = useState('');
  const [submitted,     setSubmitted]     = useState(false);
  const [error,         setError]         = useState('');

  const { mutate: submitFeedback, isPending } = useSubmitClientFeedback(equipo);

  const isRequester = currentUserId === solicitanteId;
  const canReview   = isRequester && !existingFeedback && !submitted;

  function handleSubmit() {
    if (!decision) {
      setError('Debes seleccionar Aprobar o Rechazar.');
      return;
    }
    if (!currentUserId) return;
    setError('');

    const targetColumnId = decision === 'approved' ? readyToDeployColumnId : enRevisionQasColumnId;
    const payload: SubmitClientFeedbackPayload = {
      requestId,
      submittedBy:    currentUserId,
      decision,
      feedbackNote:   feedbackNote.trim() || null,
      targetColumnId,
    };

    submitFeedback(payload, {
      onSuccess: () => {
        setSubmitted(true);
        onFeedbackSubmitted(decision === 'approved' ? 'ready_to_deploy' : 'en_revision_qas');
      },
    });
  }

  return (
    <div style={{
      margin: '0 0 0 0',
      borderBottom: `1px solid ${ACCENT}30`,
      background: `linear-gradient(180deg, ${ACCENT}08 0%, transparent 100%)`,
    }}>
      {/* Barra superior de identificación */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9,
        padding: '10px 24px',
        borderBottom: `1px solid ${ACCENT}20`,
        background: `${ACCENT}08`,
      }}>
        <Clock size={13} style={{ color: ACCENT, flexShrink: 0 }} />
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 2,
          textTransform: 'uppercase', color: ACCENT, flex: 1,
        }}>
          Pendiente de revisión del cliente
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
          textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4,
          color: ACCENT, background: `${ACCENT}15`, border: `1px solid ${ACCENT}35`,
        }}>
          Cliente Review
        </span>
      </div>

      <div style={{ padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Título de la solicitud */}
        <div style={{ fontSize: 11, color: 'var(--txt-muted)', lineHeight: 1.4 }}>
          <span style={{ color: 'var(--txt-muted)', fontWeight: 600 }}>{requestTitle}</span>
          {' '}está esperando tu revisión antes de continuar.
        </div>

        {/* Evidencia adjuntada por el equipo */}
        {cierreInfo ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 2,
              textTransform: 'uppercase', color: 'var(--txt-muted)',
            }}>
              Evidencia del equipo
            </span>
            <EvidenceBlock cierreInfo={cierreInfo} />
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 13px', borderRadius: 7,
            background: 'rgba(253,203,110,0.06)',
            border: '1px solid rgba(253,203,110,0.25)',
            fontSize: 11, color: '#fdcb6e',
          }}>
            <AlertCircle size={13} style={{ flexShrink: 0 }} />
            El equipo aún no ha adjuntado evidencia de avance.
          </div>
        )}

        {/* Feedback previo (si existe) */}
        {existingFeedback && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 2,
              textTransform: 'uppercase', color: 'var(--txt-muted)',
            }}>
              Tu respuesta anterior
            </span>
            <FeedbackHistory feedback={existingFeedback} />
          </div>
        )}

        {/* Formulario de decisión — solo para el solicitante y si no hay feedback aún */}
        {canReview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{
              height: 1, background: `linear-gradient(90deg, ${ACCENT}30, transparent)`,
            }} />

            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 2,
              textTransform: 'uppercase', color: ACCENT,
            }}>
              Tu decisión
            </span>

            {/* Botones Aprobar / Rechazar */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setDecision('approved'); setError(''); }}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8, padding: '10px 16px', borderRadius: 8,
                  border: `1.5px solid ${decision === 'approved' ? 'rgba(0,229,160,0.65)' : 'rgba(0,229,160,0.25)'}`,
                  background: decision === 'approved' ? 'rgba(0,229,160,0.14)' : 'rgba(0,229,160,0.04)',
                  color: decision === 'approved' ? 'var(--success)' : 'rgba(0,229,160,0.7)',
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)',
                  letterSpacing: 0.5, cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: decision === 'approved' ? '0 0 16px rgba(0,229,160,0.15)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (decision !== 'approved') {
                    e.currentTarget.style.borderColor = 'rgba(0,229,160,0.5)';
                    e.currentTarget.style.background  = 'rgba(0,229,160,0.08)';
                    e.currentTarget.style.color       = 'var(--success)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (decision !== 'approved') {
                    e.currentTarget.style.borderColor = 'rgba(0,229,160,0.25)';
                    e.currentTarget.style.background  = 'rgba(0,229,160,0.04)';
                    e.currentTarget.style.color       = 'rgba(0,229,160,0.7)';
                  }
                }}
              >
                <ThumbsUp size={14} />
                Aprobar
              </button>

              <button
                onClick={() => { setDecision('rejected'); setError(''); }}
                style={{
                  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: 8, padding: '10px 16px', borderRadius: 8,
                  border: `1.5px solid ${decision === 'rejected' ? 'rgba(255,71,87,0.65)' : 'rgba(255,71,87,0.25)'}`,
                  background: decision === 'rejected' ? 'rgba(255,71,87,0.12)' : 'rgba(255,71,87,0.04)',
                  color: decision === 'rejected' ? 'var(--danger)' : 'rgba(255,71,87,0.7)',
                  fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)',
                  letterSpacing: 0.5, cursor: 'pointer', transition: 'all 0.15s',
                  boxShadow: decision === 'rejected' ? '0 0 16px rgba(255,71,87,0.12)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (decision !== 'rejected') {
                    e.currentTarget.style.borderColor = 'rgba(255,71,87,0.5)';
                    e.currentTarget.style.background  = 'rgba(255,71,87,0.08)';
                    e.currentTarget.style.color       = 'var(--danger)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (decision !== 'rejected') {
                    e.currentTarget.style.borderColor = 'rgba(255,71,87,0.25)';
                    e.currentTarget.style.background  = 'rgba(255,71,87,0.04)';
                    e.currentTarget.style.color       = 'rgba(255,71,87,0.7)';
                  }
                }}
              >
                <ThumbsDown size={14} />
                Rechazar
              </button>
            </div>

            {/* Nota opcional */}
            {decision && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 2,
                  textTransform: 'uppercase', color: 'var(--txt-muted)',
                }}>
                  Nota {decision === 'rejected' ? '(recomendada)' : '(opcional)'}
                </label>
                <textarea
                  autoFocus
                  value={feedbackNote}
                  onChange={(e) => setFeedbackNote(e.target.value)}
                  placeholder={
                    decision === 'approved'
                      ? 'Puedes dejar un comentario de aprobación…'
                      : 'Explica qué debe corregirse o mejorarse…'
                  }
                  rows={3}
                  style={{
                    width: '100%', padding: '9px 12px', borderRadius: 7,
                    border: `1px solid ${decision === 'rejected' ? 'rgba(255,71,87,0.3)' : `${ACCENT}30`}`,
                    background: 'var(--bg-surface)', color: 'var(--txt)',
                    fontSize: 12, lineHeight: 1.6, resize: 'vertical',
                    outline: 'none', fontFamily: 'var(--font-body)',
                    boxSizing: 'border-box', transition: 'border-color 0.15s',
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor =
                      decision === 'rejected' ? 'rgba(255,71,87,0.55)' : `${ACCENT}60`;
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor =
                      decision === 'rejected' ? 'rgba(255,71,87,0.3)' : `${ACCENT}30`;
                  }}
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 11, color: 'var(--danger)',
              }}>
                <AlertCircle size={12} />{error}
              </div>
            )}

            {/* Botón confirmar */}
            <button
              onClick={handleSubmit}
              disabled={isPending || !decision}
              style={{
                alignSelf: 'flex-end',
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '8px 20px', borderRadius: 7,
                border: 'none',
                background: !decision || isPending
                  ? 'var(--bg-surface)'
                  : decision === 'approved'
                    ? 'linear-gradient(135deg, #00b894, #00e5a0)'
                    : 'var(--danger)',
                color: !decision || isPending ? 'var(--txt-muted)' : 'white',
                fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-display)',
                letterSpacing: 0.5, cursor: !decision || isPending ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s', opacity: isPending ? 0.7 : 1,
              }}
            >
              {decision === 'approved'
                ? <CheckCircle size={13} />
                : decision === 'rejected'
                  ? <XCircle size={13} />
                  : null
              }
              {isPending
                ? 'Enviando…'
                : decision === 'approved'
                  ? 'Confirmar aprobación'
                  : decision === 'rejected'
                    ? 'Confirmar rechazo'
                    : 'Selecciona una opción'
              }
            </button>
          </div>
        )}

        {/* Estado: feedback ya enviado en esta sesión */}
        {submitted && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 13px', borderRadius: 7,
            background: decision === 'approved' ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)',
            border: `1px solid ${decision === 'approved' ? 'rgba(0,229,160,0.3)' : 'rgba(255,71,87,0.3)'}`,
            fontSize: 12,
            color: decision === 'approved' ? 'var(--success)' : 'var(--danger)',
          }}>
            {decision === 'approved'
              ? <CheckCircle size={14} style={{ flexShrink: 0 }} />
              : <XCircle     size={14} style={{ flexShrink: 0 }} />
            }
            {decision === 'approved'
              ? 'Aprobado — la solicitud avanzó a Ready to Deploy.'
              : 'Rechazado — la solicitud regresó a En revisión QAS.'
            }
          </div>
        )}

        {/* Mensaje para no solicitantes */}
        {!isRequester && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '9px 12px', borderRadius: 7,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid var(--border-subtle)',
            fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic',
          }}>
            <AlertCircle size={12} style={{ flexShrink: 0, opacity: 0.5 }} />
            Solo el solicitante puede aprobar o rechazar esta revisión.
          </div>
        )}
      </div>
    </div>
  );
}