// src/features/requests/components/SolviTicketModal.tsx
import { useState, useMemo, useRef } from 'react';
import { X, FileText, Paperclip, Clock, User, Download, Copy, Check, Trash2, Plus, Loader2 } from 'lucide-react';
import { useSolviTicketDetail, useUploadSolviAttachment } from '@/features/requests/hooks/useSolviTickets';
import { useSolviComments, useCreateSolviComment, useDeleteSolviComment } from '@/features/requests/hooks/useSolviComments';
import { useUsers } from '@/features/requests/hooks/useUsers';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { CommentComposer } from './mentions/CommentComposer';
import { CommentText } from './mentions/CommentText';
import { ParticipantsPanel } from './mentions/ParticipantsPanel';
import { useSolviParticipants, useRemoveSolviParticipant } from '@/features/requests/hooks/useSolviParticipants';

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
  const [activeTab, setActiveTab] = useState<'detalle' | 'comentarios' | 'adjuntos'>('detalle');
  const { data: comments = [] }              = useSolviComments(ticketId);
  const { mutate: createComment, isPending: sending } = useCreateSolviComment();
  const { mutate: deleteComment }            = useDeleteSolviComment();
  const { data: allUsers = [] }              = useUsers();
  const { data: currentUser }                = useCurrentUser();
  const { data: participants = [] }          = useSolviParticipants(ticketId);
  const { mutate: removeParticipant }        = useRemoveSolviParticipant();
  const [revokingId, setRevokingId]          = useState<number | null>(null);
  const canRevokeParticipant = currentUser?.User_Role === 'admin';

  // Gate de comentarios SOLVI: solicitante/resolutor (por correo) ∪ mencionados.
  const myEmail = (currentUser?.User_Email ?? '').toLowerCase().trim();
  const reqEmail = String(t?.ticket_solvi_correo_solicitante ?? '').toLowerCase().trim();
  const resEmail = String(t?.ticket_solvi_correo_resolutor ?? '').toLowerCase().trim();
  const estadoLower = String(t?.ticket_solvi_estado ?? '').toLowerCase();
  const isCerrado = estadoLower.includes('cerrado') || estadoLower.includes('resuelto');
  const canComment = !isCerrado && !!currentUser && (
    (myEmail !== '' && (myEmail === reqEmail || myEmail === resEmail)) ||
    participants.some((p) => p.User_ID === currentUser.User_ID)
  );
  // Resolver solicitante/resolutor SOLVI a usuarios PRISMA por correo (o dejar texto crudo)
  const extraPeople = useMemo(() => {
    const out: { userId: number | null; name: string; role: 'solicitante' | 'resolutor' }[] = [];
    const findByEmail = (email: string) => {
      const e = email.toLowerCase().trim();
      if (!e) return null;
      return allUsers.find((u) => u.User_Email.toLowerCase().trim() === e) ?? null;
    };
    const solNombre = String(t?.ticket_solvi_solicitante ?? '').trim();
    if (solNombre || reqEmail) {
      const u = findByEmail(reqEmail);
      out.push({ userId: u?.User_ID ?? null, name: u?.User_Name ?? solNombre ?? reqEmail, role: 'solicitante' });
    }
    const resNombre = String(t?.ticket_solvi_resolutor ?? '').trim();
    if (resNombre || resEmail) {
      const u = findByEmail(resEmail);
      out.push({ userId: u?.User_ID ?? null, name: u?.User_Name ?? resNombre ?? resEmail, role: 'resolutor' });
    }
    return out;
  }, [t, reqEmail, resEmail, allUsers]);

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
        style={{ width: '100%', maxWidth: 820, height: '88vh', maxHeight: '88vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.4)', position: 'relative' }}
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

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          {([
            { key: 'detalle',     label: 'Detalle' },
            { key: 'comentarios', label: `Comentarios${comments.length > 0 ? ` (${comments.length})` : ''}` },
            { key: 'adjuntos',    label: `Adjuntos${(data?.attachments.length ?? 0) > 0 ? ` (${data?.attachments.length})` : ''}` },
          ] as { key: 'detalle' | 'comentarios' | 'adjuntos'; label: string }[]).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{ flex: 1, padding: '12px 8px', fontSize: 12, fontWeight: 700, letterSpacing: 0.5, background: 'transparent', border: 'none', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, color: active ? 'var(--accent)' : 'var(--txt-muted)', cursor: 'pointer', transition: 'all 0.15s' }}>
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: activeTab === 'comentarios' ? 'hidden' : 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 26 }}>
          {isLoading ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--txt-muted)', fontSize: 13 }}>Cargando detalle…</div>
          ) : isError || !t ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--danger)', fontSize: 13 }}>No se pudo cargar el detalle del ticket.</div>
          ) : (
            <>
              {activeTab === 'detalle' && (
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
              </>
              )}

{activeTab === 'comentarios' && (
              <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, margin: '-20px -22px', height: 'calc(100% + 40px)' }}>
                {/* Participantes (fijo arriba) */}
                {currentUser && (
                  <ParticipantsPanel
                    participants={participants}
                    extraPeople={extraPeople}
                    allUsers={allUsers}
                    canRevoke={canRevokeParticipant}
                    onRevoke={(userId) => {
                      setRevokingId(userId);
                      removeParticipant({ ticketId, userId, actorId: currentUser.User_ID }, { onSettled: () => setRevokingId(null) });
                    }}
                    revokingId={revokingId}
                  />
                )}

                {/* Lista de comentarios (scroll) */}
                <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {comments.length === 0 && (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.5 }}>
                      <svg width="30" height="30" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="var(--txt-muted)" strokeWidth="1.5" fill="none" strokeLinejoin="round" /></svg>
                      <p style={{ fontSize: 12, color: 'var(--txt-muted)', textAlign: 'center', margin: 0 }}>Sin comentarios aún.</p>
                    </div>
                  )}
                  {comments.map((c) => {
                    const isOwn = c.author?.User_ID === currentUser?.User_ID;
                    const ini = (c.author?.User_Name ?? '?').split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
                    return (
                      <div key={c.Comment_ID} style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexDirection: isOwn ? 'row-reverse' : 'row' }}>
                          <div style={{ width: 22, height: 22, borderRadius: '50%', background: isOwn ? 'linear-gradient(135deg,#0055cc,#00c8ff)' : 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'white', flexShrink: 0 }}>{ini}</div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)' }}>{c.author?.User_Name ?? 'Desconocido'}</span>
                          <span style={{ fontSize: 9, color: 'var(--txt-muted)' }}>{fmtDateTime(c.Comment_Created_At)}</span>
                          {isOwn && (
                            <button onClick={() => deleteComment({ commentId: c.Comment_ID, ticketId })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 2, display: 'flex', opacity: 0.5 }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--txt-muted)'; }}><Trash2 size={11} /></button>
                          )}
                        </div>
                        <div style={{ maxWidth: '78%', fontSize: 12.5, color: 'var(--txt)', lineHeight: 1.55, background: isOwn ? 'rgba(0,200,255,0.08)' : 'var(--bg-surface)', border: `1px solid ${isOwn ? 'rgba(0,200,255,0.2)' : 'var(--border-subtle)'}`, borderRadius: isOwn ? '10px 10px 2px 10px' : '10px 10px 10px 2px', padding: '8px 12px', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}>
                          <CommentText text={c.Comment_Text} users={allUsers} />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Composer (fijo abajo) */}
                {currentUser && canComment ? (
                  <div style={{ borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                    <CommentComposer
                      users={allUsers}
                      mentioner={{ User_ID: currentUser.User_ID, User_Role: currentUser.User_Role, Department_ID: currentUser.Department_ID }}
                      isConfidential={false}
                      sending={sending}
                      onSubmit={(text, mentionedUserIds) =>
                        createComment({ ticketId, userId: currentUser.User_ID, text, mentionedUserIds })
                      }
                    />
                  </div>
                ) : (
                  <p style={{ margin: 0, padding: '14px 22px', borderTop: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic', textAlign: 'center', flexShrink: 0 }}>
                    {isCerrado
                      ? 'Este ticket está cerrado. No se pueden agregar comentarios.'
                      : 'Solo el solicitante, el resolutor o quienes fueron mencionados pueden comentar.'}
                  </p>
                )}
              </div>
              )}

              {activeTab === 'adjuntos' && (
                <SolviAttachmentsTab
                  ticketId={ticketId}
                  userId={currentUser?.User_ID ?? null}
                  canAttach={canComment}
                  isCerrado={isCerrado}
                  attachments={data?.attachments ?? []}
                  seguimientos={data?.seguimientos ?? []}
                />
              )}
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

function SolviAttachmentsTab({
  ticketId,
  userId,
  canAttach,
  isCerrado,
  attachments,
  seguimientos,
}: {
  ticketId: number;
  userId: number | null;
  canAttach: boolean;
  isCerrado: boolean;
  attachments: import('@/features/requests/hooks/useSolviTickets').SolviAttachment[];
  seguimientos: {
    seguimientos_solvi_id: number;
    seguimientos_solvi_tipo_de_accion: string | null;
    seguimientos_solvi_action_date: string | null;
  }[];
}) {
  const { mutate: upload, isPending } = useUploadSolviAttachment();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handlePick = () => { setError(null); inputRef.current?.click(); };
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite re-subir el mismo archivo
    if (!file || userId == null) return;
    upload({ ticketId, userId, file }, { onError: (err) => setError(err.message) });
  };

  const ticketLevel = attachments.filter((a) => a.seguimiento_id == null);
  const bySeguimiento = seguimientos
    .map((s) => ({ seg: s, items: attachments.filter((a) => a.seguimiento_id === s.seguimientos_solvi_id) }))
    .filter((g) => g.items.length > 0);
  const knownSegIds = new Set(seguimientos.map((s) => s.seguimientos_solvi_id));
  const orphan = attachments.filter((a) => a.seguimiento_id != null && !knownSegIds.has(a.seguimiento_id));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {/* Barra de acción: adjuntar (con guard de permiso + cerrado) */}
      {canAttach ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <button
            onClick={handlePick}
            disabled={isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 14px', borderRadius: 7, border: '1px solid var(--accent)', background: 'rgba(0,200,255,0.08)', color: 'var(--accent)', cursor: isPending ? 'default' : 'pointer', fontSize: 12, fontWeight: 700, opacity: isPending ? 0.6 : 1, transition: 'all .15s' }}
          >
            {isPending ? <Loader2 size={14} className="solvi-spin" /> : <Plus size={14} />}
            {isPending ? 'Subiendo…' : 'Adjuntar archivo'}
          </button>
          <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>Máx. 20 MB</span>
          <input ref={inputRef} type="file" onChange={handleFile} style={{ display: 'none' }} />
        </div>
      ) : (
        <p style={{ margin: 0, padding: '10px 12px', borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic', textAlign: 'center' }}>
          {isCerrado
            ? 'Este ticket está cerrado. No se pueden agregar adjuntos.'
            : 'Solo el solicitante, el resolutor o quienes fueron mencionados pueden adjuntar.'}
        </p>
      )}

      {error && (
        <div style={{ fontSize: 11, color: 'var(--danger)', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)', borderRadius: 6, padding: '8px 10px' }}>
          {error}
        </div>
      )}

      {attachments.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '40px 0', opacity: 0.55 }}>
          <Paperclip size={30} style={{ color: 'var(--txt-muted)' }} />
          <p style={{ fontSize: 12, color: 'var(--txt-muted)', textAlign: 'center', margin: 0 }}>Este ticket no tiene adjuntos.</p>
        </div>
      ) : (
        <>
          {ticketLevel.length > 0 && (
            <Section title={`Del ticket (${ticketLevel.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {ticketLevel.map((a) => <AttachmentRow key={a.id} a={a} />)}
              </div>
            </Section>
          )}

          {bySeguimiento.length > 0 && (
            <Section title="De seguimientos">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                {bySeguimiento.map(({ seg, items }) => (
                  <div key={seg.seguimientos_solvi_id} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--txt)' }}>{str(seg.seguimientos_solvi_tipo_de_accion)}</span>
                      <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{fmtDate(seg.seguimientos_solvi_action_date)}</span>
                    </div>
                    {items.map((a) => <AttachmentRow key={a.id} a={a} />)}
                  </div>
                ))}
              </div>
            </Section>
          )}

          {orphan.length > 0 && (
            <Section title={`Otros (${orphan.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                {orphan.map((a) => <AttachmentRow key={a.id} a={a} />)}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  );
}