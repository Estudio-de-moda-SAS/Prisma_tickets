// src/features/requests/components/RequestTimelines.tsx
import { CheckCircle, Paperclip, Image, FileText } from 'lucide-react';
import type { Request, ClientFeedback } from '../types';

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
}

function fmtColombia(iso: string) {
  return new Date(iso).toLocaleDateString('es-CO', {
    timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric',
  });
}

/* ─── CierreBanner ─────────────────────────────────────────── */
export function CierreBanner({ cierreInfo }: { cierreInfo: NonNullable<Request['cierreInfo']> }) {
  const allAttachments = [
    ...(cierreInfo.attachments ?? []).map((a) => ({ url: a.signedUrl, name: a.fileName, mime: a.mimeType })),
    ...((cierreInfo.attachments ?? []).length === 0 && cierreInfo.attachmentUrl
      ? [{ url: cierreInfo.attachmentUrl, name: cierreInfo.attachmentName, mime: cierreInfo.attachmentMime }]
      : []),
  ];
  return (
    <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(0,229,160,0.25)', background: 'rgba(0,229,160,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 14px', borderBottom: '1px solid rgba(0,229,160,0.15)', background: 'rgba(0,229,160,0.06)' }}>
        <CheckCircle size={14} style={{ color: 'var(--success)', flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--success)', flex: 1 }}>Evidencia de avance</span>
        <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{fmtColombia(cierreInfo.closedAt)}</span>
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#00b894,#00e5a0)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'white', flexShrink: 0 }}>
            {initials(cierreInfo.closedBy.userName || 'U')}
          </div>
          <span style={{ fontSize: 11, color: 'var(--txt)', fontWeight: 500 }}>{cierreInfo.closedBy.userName || 'Usuario desconocido'}</span>
          <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>adjuntó evidencia</span>
        </div>
        <div style={{ padding: '9px 12px', borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--txt)', lineHeight: 1.6, wordBreak: 'break-word' }}>
          {cierreInfo.closureNote}
        </div>
        {allAttachments.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {allAttachments.map((att, idx) => {
              if (!att.url) return null;
              const isImage = att.mime?.startsWith('image/');
              return (
                <a key={idx} href={att.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 12px', borderRadius: 7, background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)', textDecoration: 'none', transition: 'border-color 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,229,160,0.4)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,229,160,0.2)'; }}
                >
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--success)', flexShrink: 0 }}>
                    {isImage ? <Image size={13} /> : <FileText size={13} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name ?? 'Evidencia adjunta'}</div>
                    <div style={{ fontSize: 9, color: 'var(--txt-muted)', marginTop: 1 }}>Ver evidencia →</div>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── CierreBannerCompact ─────────────────────────────────── */
export function CierreBannerCompact({ cierreInfo }: { cierreInfo: NonNullable<Request['cierreInfo']> }) {
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--bg-panel)', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: 'var(--txt-muted)', flexShrink: 0 }}>
          {initials(cierreInfo.closedBy.userName || 'U')}
        </div>
        <span style={{ fontSize: 11, color: 'var(--txt)', fontWeight: 500, flex: 1 }}>{cierreInfo.closedBy.userName}</span>
        <span style={{ fontSize: 10, color: 'var(--txt-muted)', flexShrink: 0 }}>{fmtColombia(cierreInfo.closedAt)}</span>
      </div>
      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.5, wordBreak: 'break-word', fontStyle: 'italic' }}>
          "{cierreInfo.closureNote}"
        </div>
        {cierreInfo.attachments.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {cierreInfo.attachments.map((a, idx) =>
              a.signedUrl ? (
                <a key={idx} href={a.signedUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', color: 'var(--accent)', textDecoration: 'none' }}>
                  <Paperclip size={9} />{a.fileName}
                </a>
              ) : (
                <span key={idx} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)' }}>
                  <Paperclip size={9} />{a.fileName}
                </span>
              )
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── CierreTimeline ───────────────────────────────────────── */
export function CierreTimeline({ historial }: { historial: NonNullable<Request['cierreHistorial']> }) {
  if (historial.length === 1) return <CierreBanner cierreInfo={historial[0]} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {historial.map((cierre, idx) => {
        const isLatest = idx === 0;
        return (
          <div key={cierre.closureId} style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0, paddingTop: 13 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: isLatest ? 'var(--success)' : 'var(--border)',
                border: `2px solid ${isLatest ? 'rgba(0,229,160,0.5)' : 'var(--border-subtle)'}`,
                boxShadow: isLatest ? '0 0 6px rgba(0,229,160,0.35)' : 'none',
              }} />
              {idx < historial.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 12, background: 'var(--border-subtle)', marginTop: 3 }} />
              )}
            </div>
            <div style={{ flex: 1, paddingBottom: idx < historial.length - 1 ? 14 : 0 }}>
              {isLatest ? <CierreBanner cierreInfo={cierre} /> : <CierreBannerCompact cierreInfo={cierre} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── FeedbackEntryFull ────────────────────────────────────── */
export function FeedbackEntryFull({ fb }: { fb: ClientFeedback }) {
  const isApproved = fb.decision === 'approved';
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${isApproved ? 'rgba(0,229,160,0.25)' : 'rgba(255,71,87,0.25)'}`, background: isApproved ? 'rgba(0,229,160,0.04)' : 'rgba(255,71,87,0.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${isApproved ? 'rgba(0,229,160,0.15)' : 'rgba(255,71,87,0.15)'}`, background: isApproved ? 'rgba(0,229,160,0.07)' : 'rgba(255,71,87,0.07)' }}>
        {isApproved
          ? <CheckCircle size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
          : <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
        }
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: isApproved ? 'var(--success)' : 'var(--danger)', flex: 1 }}>
          {isApproved ? 'Aprobado por el cliente' : 'Rechazado por el cliente'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--txt-muted)', flexShrink: 0 }}>
          {new Date(fb.submittedAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', background: isApproved ? 'linear-gradient(135deg,#00b894,#00e5a0)' : 'linear-gradient(135deg,#ff4757,#ff6b81)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: 'white', flexShrink: 0 }}>
            {fb.submitterName.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase()}
          </div>
          <span style={{ fontSize: 11, color: 'var(--txt)', fontWeight: 500 }}>{fb.submitterName}</span>
        </div>
        {fb.feedbackNote && (
          <div style={{ padding: '7px 10px', borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontSize: 12, color: 'var(--txt)', lineHeight: 1.55, wordBreak: 'break-word', fontStyle: 'italic' }}>
            "{fb.feedbackNote}"
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── FeedbackEntryCompact ─────────────────────────────────── */
export function FeedbackEntryCompact({ fb }: { fb: ClientFeedback }) {
  const isApproved = fb.decision === 'approved';
  return (
    <div style={{ borderRadius: 8, overflow: 'hidden', border: `1px solid ${isApproved ? 'rgba(0,229,160,0.15)' : 'rgba(255,71,87,0.15)'}`, background: 'var(--bg-surface)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px' }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4, color: isApproved ? 'var(--success)' : 'var(--danger)', background: isApproved ? 'rgba(0,229,160,0.1)' : 'rgba(255,71,87,0.1)', border: `1px solid ${isApproved ? 'rgba(0,229,160,0.3)' : 'rgba(255,71,87,0.3)'}`, flexShrink: 0 }}>
          {isApproved ? '✓ Aprobado' : '✗ Rechazado'}
        </span>
        <span style={{ fontSize: 11, color: 'var(--txt)', fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fb.submitterName}</span>
        <span style={{ fontSize: 10, color: 'var(--txt-muted)', flexShrink: 0 }}>
          {new Date(fb.submittedAt).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>
      {fb.feedbackNote && (
        <div style={{ padding: '0 12px 8px', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic', lineHeight: 1.5, wordBreak: 'break-word' }}>
          "{fb.feedbackNote}"
        </div>
      )}
    </div>
  );
}

/* ─── FeedbackTimeline ─────────────────────────────────────── */
export function FeedbackTimeline({ historial }: { historial: ClientFeedback[] }) {
  if (historial.length === 1) return <FeedbackEntryFull fb={historial[0]} />;
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {historial.map((fb, idx) => {
        const isLatest   = idx === 0;
        const isApproved = fb.decision === 'approved';
        return (
          <div key={fb.feedbackId} style={{ display: 'flex', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 16, flexShrink: 0, paddingTop: 13 }}>
              <div style={{
                width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                background: isLatest ? (isApproved ? 'var(--success)' : 'var(--danger)') : 'var(--border)',
                border: `2px solid ${isLatest ? (isApproved ? 'rgba(0,229,160,0.5)' : 'rgba(255,71,87,0.5)') : 'var(--border-subtle)'}`,
                boxShadow: isLatest ? `0 0 6px ${isApproved ? 'rgba(0,229,160,0.35)' : 'rgba(255,71,87,0.35)'}` : 'none',
              }} />
              {idx < historial.length - 1 && (
                <div style={{ width: 2, flex: 1, minHeight: 12, background: 'var(--border-subtle)', marginTop: 3 }} />
              )}
            </div>
            <div style={{ flex: 1, paddingBottom: idx < historial.length - 1 ? 14 : 0 }}>
              {isLatest ? <FeedbackEntryFull fb={fb} /> : <FeedbackEntryCompact fb={fb} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}
