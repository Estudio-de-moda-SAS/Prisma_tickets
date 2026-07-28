// src/features/requests/components/SolviTicketModal.tsx
import { useState } from 'react';
import { X, FileText, Paperclip, Clock, User, Download, Copy, Check } from 'lucide-react';
import { useSolviTicketDetail } from '@/features/requests/hooks/useSolviTickets';

/* ============================================================
   SolviTicketModal — detalle de solo lectura de un ticket SOLVI.
   Muestra todos los campos del ticket + seguimientos + adjuntos.
   Las descripciones de SOLVI vienen con HTML: se sanean y renderizan.
   Paleta alineada al resto de modales de PRISMA (var(--accent), etc.).
   ============================================================ */

/* ── Saneado básico de HTML (sin dependencias) ──
   Elimina scripts, estilos, iframes, y atributos de eventos on*.
   Suficiente para descripciones de SOLVI (span, br, p, b, i, ul, li, a…).
   NOTA: es una limpieza conservadora; si en el futuro se requiere robustez
   total frente a XSS, migrar a DOMPurify. */
function sanitizeHtml(raw: string): string {
  let html = raw;
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '');
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?>/gi, '');
  html = html.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  html = html.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  html = html.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
  html = html.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  return html;
}

// ¿El texto parece traer markup HTML? (para decidir render html vs texto)
function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(s);
}

function RichText({ value }: { value: string | null | undefined }) {
  if (!value || !value.trim()) {
    return <span style={{ fontSize: 13, color: 'var(--txt-muted)', fontStyle: 'italic' }}>—</span>;
  }
  if (looksLikeHtml(value)) {
    return (
      <div
        className="solvi-rich"
        style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.65, wordBreak: 'break-word' }}
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(value) }}
      />
    );
  }
  return <span style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{value}</span>;
}

function fmtDateTime(s: string | null | undefined) {
  if (!s) return '—';
  const iso = /Z|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  const iso = /Z|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function str(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  return String(v);
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--txt-muted)' }}>{label}</span>
      <span style={{ fontSize: 13, color: 'var(--txt)', wordBreak: 'break-word' }}>{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--accent)', background: 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.18)', padding: '3px 10px', borderRadius: 3 }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>
      {children}
    </div>
  );
}

function estadoChip(estado: unknown): React.CSSProperties {
  const e = String(estado ?? '').toLowerCase();
  let color = 'var(--txt-muted)';
  if (e.includes('cerrado') || e.includes('resuelto')) color = 'var(--success)';
  else if (e.includes('proceso') || e.includes('progreso') || e.includes('atenc')) color = '#f59e0b';
  else if (e.includes('abierto') || e.includes('nuevo')) color = 'var(--accent)';
  return { display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '2px 10px', borderRadius: 20, background: 'rgba(255,255,255,0.05)', color, border: `1px solid ${color}55` };
}

export function SolviTicketModal({ ticketId, onClose }: { ticketId: number; onClose: () => void }) {
  const { data, isLoading, isError } = useSolviTicketDetail(ticketId);
  const t = data?.ticket as Record<string, unknown> | undefined;
  const [copied, setCopied] = useState(false);

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/integracion/solvi/tickets/${ticketId}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0)',  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 820, maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', position: 'relative' }}
      >
        {/* Línea superior de acento, como los otros modales */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', pointerEvents: 'none' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-muted)', letterSpacing: 1, userSelect: 'all', flexShrink: 0 }}>#{ticketId}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {isLoading ? 'Cargando…' : str(t?.ticket_solvi_titulo)}
            </span>
            {!isLoading && t?.ticket_solvi_estado ? <span style={estadoChip(t.ticket_solvi_estado)}>{String(t.ticket_solvi_estado)}</span> : null}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              onClick={handleCopyLink}
              title="Copiar enlace del ticket"
              style={{ display: 'flex', alignItems: 'center', gap: 6, height: 28, padding: '0 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: copied ? 'rgba(0,184,148,0.12)' : 'transparent', color: copied ? 'var(--success)' : 'var(--txt-muted)', cursor: 'pointer', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap', transition: 'all .15s' }}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copiado' : 'Copiar enlace'}
            </button>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 26 }}>
          {isLoading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--txt-muted)', fontSize: 13 }}>Cargando detalle…</div>
          ) : isError || !t ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>No se pudo cargar el detalle del ticket.</div>
          ) : (
            <>
              <Section title="Información">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                  <Field label="Estado"     value={t.ticket_solvi_estado ? <span style={estadoChip(t.ticket_solvi_estado)}>{String(t.ticket_solvi_estado)}</span> : '—'} />
                  <Field label="Fuente"     value={str(t.ticket_solvi_fuente)} />
                  <Field label="ANS"        value={str(t.ticket_solvi_ans)} />
                  <Field label="Caso padre" value={str(t.ticket_solvi_id_casopadre)} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--txt-muted)' }}>Descripción</span>
                  <RichText value={t.ticket_solvi_descripcion as string} />
                </div>
              </Section>

              <Section title="Clasificación">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                  <Field label="Categoría"    value={str(t.ticket_solvi_categoria)} />
                  <Field label="Subcategoría" value={str(t.ticket_solvi_subcategoria)} />
                  <Field label="Artículo"     value={str(t.ticket_solvi_articulo)} />
                </div>
              </Section>

              <Section title="Personas">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                  <Field label="Solicitante"        value={str(t.ticket_solvi_solicitante)} />
                  <Field label="Correo solicitante" value={str(t.ticket_solvi_correo_solicitante)} />
                  <Field label="Resolutor"          value={str(t.ticket_solvi_resolutor)} />
                  <Field label="Correo resolutor"   value={str(t.ticket_solvi_correo_resolutor)} />
                  <Field label="Observador"         value={str(t.ticket_solvi_observador)} />
                  <Field label="Correo observador"  value={str(t.ticket_solvi_correo_observador)} />
                </div>
              </Section>

              <Section title="Fechas y SLA">
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16 }}>
                  <Field label="Apertura"         value={fmtDateTime(t.ticket_solvi_fechaapertura as string)} />
                  <Field label="Fecha máxima"     value={fmtDateTime(t.ticket_solvi_fechamaxima as string)} />
                  <Field label="Cierre real"      value={fmtDateTime(t.FechaCierreReal as string)} />
                  <Field label="Min. totales"     value={str(t.MinutosTotales)} />
                  <Field label="Min. nocturnos"   value={str(t.MinutosNocturnos)} />
                  <Field label="Min. festivos"    value={str(t.MinutosFestivos)} />
                  <Field label="Min. dominicales" value={str(t.MinutosDominicales)} />
                </div>
              </Section>

              <Section title={`Seguimientos (${data?.seguimientos.length ?? 0})`}>
                {(data?.seguimientos.length ?? 0) === 0 ? (
                  <span style={{ fontSize: 12, color: 'var(--txt-muted)', fontStyle: 'italic' }}>Sin seguimientos registrados.</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                    {data!.seguimientos.map((s, i) => (
                      <div key={s.seguimientos_solvi_id} style={{ display: 'flex', gap: 12, paddingBottom: i === data!.seguimientos.length - 1 ? 0 : 16 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(0,200,255,0.10)', border: '1px solid rgba(0,200,255,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)' }}>
                            <Clock size={13} />
                          </div>
                          {i !== data!.seguimientos.length - 1 && <div style={{ flex: 1, width: 1, background: 'var(--border-subtle)', marginTop: 4 }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>{str(s.seguimientos_solvi_tipo_de_accion)}</span>
                            <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{fmtDate(s.seguimientos_solvi_action_date)}</span>
                          </div>
                          {s.seguimientos_solvi_descripcion && (
                            <div style={{ margin: '0 0 6px' }}>
                              <RichText value={s.seguimientos_solvi_descripcion} />
                            </div>
                          )}
                          {(s.seguimientos_solvi_actor || s.seguimientos_solvi_correo_actor) && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--txt-muted)' }}>
                              <User size={10} />
                              {str(s.seguimientos_solvi_actor)}{s.seguimientos_solvi_correo_actor ? ` · ${s.seguimientos_solvi_correo_actor}` : ''}
                            </div>
                          )}
                          {data!.attachments.filter((a) => a.seguimiento_id === s.seguimientos_solvi_id).map((a) => (
                            <AttachmentRow key={a.id} a={a} />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>

              {(() => {
                const ticketAtts = (data?.attachments ?? []).filter((a) => a.seguimiento_id == null);
                if (ticketAtts.length === 0) return null;
                return (
                  <Section title={`Adjuntos (${ticketAtts.length})`}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {ticketAtts.map((a) => <AttachmentRow key={a.id} a={a} />)}
                    </div>
                  </Section>
                );
              })()}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function AttachmentRow({ a }: { a: import('@/features/requests/hooks/useSolviTickets').SolviAttachment }) {
  const name = a.file_name ?? a.attachment_path?.split('/').pop() ?? 'archivo';
  const inner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', marginTop: 6 }}>
      <FileText size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <span style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {a.signedUrl ? <Download size={12} style={{ color: 'var(--accent)', flexShrink: 0 }} /> : <Paperclip size={11} style={{ color: 'var(--txt-muted)', flexShrink: 0 }} />}
    </div>
  );
  return a.signedUrl
    ? <a href={a.signedUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{inner}</a>
    : inner;
}