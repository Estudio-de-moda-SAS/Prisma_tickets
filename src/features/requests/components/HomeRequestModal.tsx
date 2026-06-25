// src/features/requests/components/HomeRequestModal.tsx
import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ShieldAlert, Send, Trash2 } from 'lucide-react';
import { PRIORIDADES, KANBAN_COLUMNAS } from '../types';
import type { Request, Prioridad, KanbanColumna } from '../types';
import { useSprints } from '@/features/requests/hooks/useSprints';
import { useAcceptanceCriteria } from '@/features/requests/hooks/useAcceptanceCriteria';
import { useComments, useCreateComment, useDeleteComment } from '@/features/requests/hooks/useComments';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useClientFeedback } from '@/features/requests/hooks/useClientFeedback';
import { useColumnMap } from '@/features/requests/hooks/useColumnMap';
import { ClientReviewBanner } from './ClientReviewBanner';
import { config } from '@/config';
import { CierreTimeline, FeedbackTimeline} from '@/features/requests/components/RequestTimelines';
import { useGraphServices } from '@/graph/GraphServicesProvider';
const PRI_COLOR: Record<Prioridad, string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

const COL_COLOR: Record<KanbanColumna, string> = {
  sin_categorizar: 'var(--txt-muted)',
  icebox:          '#60a5fa',
  backlog:         'var(--info)',
  todo:            'var(--warn)',
  en_progreso:     'var(--accent)',
  en_revision_qas: '#f59e0b',
  cliente_review:  '#34d399',
  ready_to_deploy: '#a78bfa',
  hecho:           'var(--success)',
  historial:       'var(--txt-muted)',
};

function fmtColombia(iso: string) {
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
    .toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtD(iso: string | null) {
  if (!iso) return '—';
  const parts = iso.split('T')[0].split('-');
  if (parts.length < 3) return '—';
  const [y, m, d] = parts;
  return `${d}/${m}/${y.slice(2)}`;
}

function fmtRelative(isoString: string) {
  const now  = new Date();
  // Si PostgREST devuelve el timestamp sin zona (ej: "2024-01-15T10:30:00"),
  // JS lo interpreta como hora local → diff negativo → siempre "hace un momento".
  // Forzamos UTC añadiendo 'Z' cuando no hay indicador de zona.
  const normalized = /Z|[+-]\d{2}:\d{2}$/.test(isoString) ? isoString : isoString + 'Z';
  const date = new Date(normalized);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);  if (diff < 60)    return 'hace un momento';
  if (diff < 3600)  return `hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `hace ${Math.floor(diff / 3600)} h`;
  return date.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short' });
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
}

function sprintDotColor(sp: { Sprint_Start_Date: string | null; Sprint_End_Date: string | null }) {
  if (!sp.Sprint_Start_Date || !sp.Sprint_End_Date) return '#7f77dd'; // histórico
  const now = new Date();
  if (now >= new Date(sp.Sprint_Start_Date) && now <= new Date(sp.Sprint_End_Date)) return '#00e5a0';
  if (now > new Date(sp.Sprint_End_Date)) return '#b2bec3';
  return '#fdcb6e';
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--txt-muted)', marginBottom: 7 }}>{children}</span>;
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}

function ReadChip({ color, icon, label }: { color: string; icon?: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color, background: `${color}18`, border: `1px solid ${color}35` }}>
      {icon && <span>{icon}</span>}{label}
    </span>
  );
}

function FieldValue({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div style={{ minHeight: 34, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '4px 0' }}>
      <span style={{ fontSize: 13, color: muted ? 'var(--txt-muted)' : 'var(--txt)' }}>{children}</span>
    </div>
  );
}

/* ── TemplateFormDataPanel ── */
function TemplateFormDataPanel({
  formData, schema, snapshotSchema,
}: {
  formData:        Record<string, unknown>;
  schema:          unknown[];
  snapshotSchema?: unknown[];
  accentColor:     string;
}) {

  type FlatField = { key: string; label: string; showInModal: boolean };

  function collectAllKeys(fields: unknown[]): Set<string> {
    const keys = new Set<string>();
    for (const f of fields) {
      const field = f as Record<string, unknown>;
      if (!field.key) continue;
      keys.add(field.key as string);
      if (field.type === 'conditional') {
        for (const k of collectAllKeys((field.trueBranch as unknown[]) ?? [])) keys.add(k);
        for (const k of collectAllKeys((field.falseBranch as unknown[]) ?? [])) keys.add(k);
      }
    }
    return keys;
  }

  function collectAllWithMeta(fields: unknown[]): Map<string, { label: string; showInModal: boolean }> {
    const map = new Map<string, { label: string; showInModal: boolean }>();
    for (const f of fields) {
      const field = f as Record<string, unknown>;
      if (!field.key || !field.label) continue;
      const showInModal = (field.showInModal as boolean | undefined) ?? true;
      map.set(field.key as string, { label: field.label as string, showInModal });
      if (field.type === 'conditional') {
        for (const [k, v] of collectAllWithMeta((field.trueBranch  as unknown[]) ?? [])) map.set(k, v);
        for (const [k, v] of collectAllWithMeta((field.falseBranch as unknown[]) ?? [])) map.set(k, v);
      }
    }
    return map;
  }

  function collectVisibleLevel(fields: unknown[]): FlatField[] {
    const result: FlatField[] = [];
    for (const f of fields) {
      const field = f as Record<string, unknown>;
      if (!field.key) continue;
      const showInModal = (field.showInModal as boolean | undefined) ?? true;
      if (field.type === 'conditional') {
        if (showInModal && field.label) {
          result.push({ key: field.key as string, label: field.label as string, showInModal });
        }
        const val = formData[field.key as string];
        const effective = (val === undefined || val === null || val === '') ? 'false' : String(val);
        const activeBranch = effective === 'true'
          ? (field.trueBranch as unknown[]) ?? []
          : (field.falseBranch as unknown[]) ?? [];
        result.push(...collectVisibleLevel(activeBranch));
      } else {
        if (showInModal && field.label) {
          result.push({ key: field.key as string, label: field.label as string, showInModal });
        }
      }
    }
    return result;
  }

  const schemaFields  = collectVisibleLevel(schema);
  const allLiveKeys   = collectAllKeys(schema);
  const snapshotMeta  = collectAllWithMeta(snapshotSchema ?? []);

  const orphanFields: FlatField[] = Object.keys(formData)
    .filter((k) => !allLiveKeys.has(k) && k !== '__labels')
    .map((k) => {
      // live wins: si existe en live con showInModal: false → ocultar
      // (ya está excluido de schemaFields por collectVisibleLevel)
      // si no existe en live → buscar en snapshot
      const snap = snapshotMeta.get(k);
      if (!snap || !snap.showInModal) return null;
      return { key: k, label: snap.label, showInModal: true };
    })
    .filter((f): f is FlatField => f !== null);

  const entries = [...schemaFields, ...orphanFields].filter(({ key }) => {
    if (key === '__labels') return false;
    const val = formData[key];
    if (val === 'true' || val === 'false') return true;
    return val !== undefined && val !== '' && val !== null;
  });

  if (entries.length === 0) return null;

  function renderValue(key: string): React.ReactNode {
    const val = formData[key];
    if (val === undefined || val === null) return <span style={{ color: 'var(--danger)' }}>No</span>;
    if (val === 'true')  return <span style={{ color: 'var(--success)', fontWeight: 600 }}>Sí</span>;
    if (val === 'false') return <span style={{ color: 'var(--danger)' }}>No</span>;
    // Respetar saltos de línea (campos textarea, datos migrados multilínea)
    return <span style={{ color: 'var(--txt)', whiteSpace: 'pre-wrap' }}>{String(val)}</span>;
  }

  return (
    <div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map(({ key, label }) => (
          <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--txt-muted)', flexShrink: 0, minWidth: 110 }}>{label}</span>
            <span style={{ flex: 1, height: 1, borderBottom: '1px dashed var(--border-subtle)', alignSelf: 'center' }} />
            <span style={{ fontSize: 12, fontWeight: 500, textAlign: 'right' }}>{renderValue(key)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
/* ── CriteriaReadonly ── */
function CriteriaReadonly({ requestId }: { requestId: string }) {
  const { data: criteria = [], isLoading } = useAcceptanceCriteria(requestId);
  if (isLoading) return <div style={{ fontSize: 11, color: 'var(--txt-muted)', opacity: 0.6 }}>Cargando…</div>;
  if (criteria.length === 0) return <div style={{ fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic' }}>Sin criterios definidos.</div>;

  const accepted = criteria.filter((c) => c.status === 'accepted').length;
  const rejected = criteria.filter((c) => c.status === 'rejected').length;
  const total    = criteria.length;

  const STATUS_COLOR:  Record<string, string> = { pending: 'var(--txt-muted)', accepted: 'var(--success)', rejected: 'var(--danger)' };
  const STATUS_BG:     Record<string, string> = { pending: 'rgba(255,255,255,0.04)', accepted: 'rgba(0,229,160,0.06)', rejected: 'rgba(255,71,87,0.06)' };
  const STATUS_BORDER: Record<string, string> = { pending: 'var(--border-subtle)', accepted: 'rgba(0,229,160,0.22)', rejected: 'rgba(255,71,87,0.22)' };
  const STATUS_LABEL:  Record<string, string> = { pending: 'Pendiente', accepted: 'Aceptado', rejected: 'Rechazado' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 3, background: 'var(--bg-surface)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
          <div style={{ height: '100%', width: `${Math.round((accepted / total) * 100)}%`, borderRadius: 3, background: rejected > 0 ? 'var(--danger)' : 'var(--success)', transition: 'width 0.3s ease' }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: rejected > 0 ? 'var(--danger)' : accepted === total ? 'var(--success)' : 'var(--txt-muted)', minWidth: 40, textAlign: 'right' }}>{accepted}/{total}</span>
        {rejected > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,71,87,0.1)', color: 'var(--danger)', border: '1px solid rgba(255,71,87,0.25)' }}>{rejected} rechazado{rejected > 1 ? 's' : ''}</span>}
      </div>
      {criteria.map((c) => (
        <div key={c.criteriaId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', borderRadius: 7, background: STATUS_BG[c.status], border: `1px solid ${STATUS_BORDER[c.status]}` }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${STATUS_COLOR[c.status]}12`, border: `1.5px solid ${STATUS_COLOR[c.status]}35` }}>
            {c.status === 'accepted' && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            {c.status === 'rejected' && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><line x1="2" y1="2" x2="8" y2="8" stroke="var(--danger)" strokeWidth="1.8" strokeLinecap="round"/><line x1="8" y1="2" x2="2" y2="8" stroke="var(--danger)" strokeWidth="1.8" strokeLinecap="round"/></svg>}
            {c.status === 'pending' && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--txt-muted)' }} />}
          </div>
          <span style={{ flex: 1, fontSize: 12, color: c.status === 'rejected' ? 'var(--danger)' : c.status === 'accepted' ? 'var(--txt-muted)' : 'var(--txt)', textDecoration: c.status === 'accepted' ? 'line-through' : 'none', lineHeight: 1.4 }}>{c.title}</span>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 5px', borderRadius: 3, color: STATUS_COLOR[c.status], background: `${STATUS_COLOR[c.status]}10`, border: `1px solid ${STATUS_COLOR[c.status]}25`, flexShrink: 0, whiteSpace: 'nowrap' }}>{STATUS_LABEL[c.status]}</span>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   HomeRequestModal
   ══════════════════════════════════════════════════════════════ */
type Props = {
  request: Request;
  onClose: () => void;
};

export function HomeRequestModal({ request, onClose }: Props) {
  const boardId     = config.DEFAULT_BOARD_ID;
  const equipo      = request.equipo[0] ?? 'desarrollo';

  const { data: sprints  = [] } = useSprints();

  const { data: comments = [] }                                    = useComments(request.id);
  const { mutate: createComment, isPending: sending }              = useCreateComment();
  const { mutate: deleteComment }                                  = useDeleteComment();
  const { data: currentUser }                                      = useCurrentUser();
  const { data: feedbackHistorial = [] }                           = useClientFeedback(request.id);
  const cierreCount    = (request.cierreHistorial?.length ?? 0);
  const clientFeedback = cierreCount > 0 && feedbackHistorial.length >= cierreCount
    ? (feedbackHistorial[0] ?? null)
    : null;

  const columnMap = useColumnMap(boardId);
  const readyToDeployColumnId = columnMap?.['ready_to_deploy'] ?? 7;
  const enRevisionQasColumnId = columnMap?.['en_revision_qas'] ?? 8;

  const isClienteReview = request.columna === 'cliente_review';

  const [_commentText, setCommentText] = useState('');

  const canComment = !!currentUser && (
    currentUser.User_ID === request.solicitanteId ||
    request.assignees.some((a) => a.userId === currentUser.User_ID)
  );

  const overlayRef     = useRef<HTMLDivElement>(null);
  const commentsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  function handleSendComment() {
    const text = _commentText.trim();
    if (!text || !currentUser) return;
    createComment({ requestId: request.id, userId: currentUser.User_ID, text }, { onSuccess: () => setCommentText('') });
  }

  function handleCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSendComment(); }
  }

  /* Cuando el cliente aprueba/rechaza desde este modal, simplemente cerramos
     porque el board (si está abierto en otra pestaña/vista) se actualizará
     solo vía invalidateQueries en el hook. */
  function handleFeedbackSubmitted() {
    // Cerrar el modal tras 1.2s para que el usuario vea el mensaje de confirmación
    setTimeout(onClose, 1200);
  }
    const { Requests }     = useGraphServices();
    const requestId    = request.id;
    const { data: freshRequest } = useQuery<Request>({
      queryKey: ['request', requestId],
      queryFn:  () => Requests.fetchById(requestId),
      enabled:  !config.USE_MOCK,
      staleTime: 0,
      refetchOnMount: true,
      refetchOnWindowFocus: false,
    });
  const effectiveRequest = freshRequest ?? request;
  const selectedSprint   = sprints.find((s) => s.Sprint_ID === request.sprintId) ?? null;
  const colColor         = COL_COLOR[request.columna] ?? 'var(--txt-muted)';
const hasFormData = (request.templateFormSchema?.length ?? 0) > 0;
  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(59,130,246,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}
    >
      <div style={{
        width: '100%', maxWidth: 900, maxHeight: '90vh',
        background: 'var(--bg-panel)',
        border: `1px solid ${isClienteReview ? 'rgba(52,211,153,0.35)' : 'var(--border)'}`,
        borderRadius: 12, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: isClienteReview ? 'linear-gradient(90deg, transparent, #34d399, transparent)' : 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />

        {/* ── Header ── */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-muted)', letterSpacing: 1, userSelect: 'all' }}>{request.id}</span>
          <CopyLinkButton ticketId={request.id} />
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: 'var(--txt-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>
            Solo lectura
          </span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, padding: '2px 8px', borderRadius: 4, color: colColor, background: `${colColor}18`, border: `1px solid ${colColor}35` }}>
            {KANBAN_COLUMNAS[request.columna]}
          </span>
          {request.isConfidential && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 700, letterSpacing: 0.8, padding: '2px 8px', borderRadius: 4, color: '#fdcb6e', background: 'rgba(253,203,110,0.1)', border: '1px solid rgba(253,203,110,0.35)' }}>
              <ShieldAlert size={9} />Confidencial
            </span>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={14} />
            </button>
          </div>
        </div>

        {/* ── ClientReviewBanner (arriba del cuerpo) ── */}
        {isClienteReview && (
          <ClientReviewBanner
            requestId={request.id}
            requestTitle={request.titulo}
            cierreInfo={request.cierreInfo}
            existingFeedback={clientFeedback}
            currentUserId={currentUser?.User_ID}
            solicitanteId={request.solicitanteId}
            equipo={equipo}
            readyToDeployColumnId={readyToDeployColumnId}
            enRevisionQasColumnId={enRevisionQasColumnId}
            onFeedbackSubmitted={handleFeedbackSubmitted}
          />
        )}

        {/* ── Cuerpo ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Panel izquierdo */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 20, borderRight: '1px solid var(--border-subtle)' }}>

            {request.isConfidential && (
              <div style={{ display: 'flex', gap: 10, padding: '11px 14px', borderRadius: 8, background: 'rgba(253,203,110,0.06)', border: '1px solid rgba(253,203,110,0.3)' }}>
                <ShieldAlert size={14} style={{ color: '#fdcb6e', flexShrink: 0, marginTop: 1 }} />
                <p style={{ margin: 0, fontSize: 12, color: '#fdcb6e', lineHeight: 1.55 }}>Esta solicitud contiene información confidencial. Recuerda validar el manejo de estos datos con el área de jurídica.</p>
              </div>
            )}

            <FieldBlock label="Nombre de la solicitud">
              <div style={{ padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', fontFamily: 'var(--font-body)' }}>{request.titulo}</span>
              </div>
            </FieldBlock>

            <FieldBlock label="Descripción">
<div style={{ padding: '10px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', minHeight: 72, overflow: 'hidden' }}>
  {request.descripcion
    ? <span style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.65, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{request.descripcion}</span>                  : <span style={{ fontSize: 13, color: 'var(--txt-muted)', fontStyle: 'italic' }}>Sin descripción</span>
                }
              </div>
            </FieldBlock>

            {hasFormData && (
              <TemplateFormDataPanel
                formData={request.formData ?? {}}
                schema={request.templateFormSchema ?? []}
                accentColor="var(--accent)"
              />
            )}

            <FieldBlock label="Criterios de aceptación">
              <CriteriaReadonly requestId={request.id} />
            </FieldBlock>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
<FieldBlock label="Solicitante">
  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', minHeight: 32, borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxSizing: 'border-box' }}>
    <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg, #0055cc, #00c8ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials(request.solicitante)}</div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: 12, color: 'var(--txt)', fontWeight: 600, lineHeight: 1.2 }}>{request.solicitante}</span>
      {request.requesterTeamName && <span style={{ fontSize: 9, color: 'var(--txt-muted)', letterSpacing: 0.5, fontWeight: 600 }}>{request.requesterTeamName}</span>}
    </div>
  </div>
</FieldBlock>
              <FieldBlock label="Resolutor(es)">
                <FieldValue muted={request.assignees.length === 0}>
                  {request.assignees.length === 0 ? 'Sin asignar' : (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--txt)' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,#0055cc,#00c8ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                        {initials(request.assignees[0].userName)}
                      </div>
                      {request.assignees[0].userName}
                      {request.assignees.length > 1 && (
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', color: 'var(--txt-muted)', border: '1px solid var(--border-subtle)' }}>+{request.assignees.length - 1}</span>
                      )}
                    </span>
                  )}
                </FieldValue>
              </FieldBlock>

              <FieldBlock label="Prioridad">
                <FieldValue><ReadChip color={PRI_COLOR[request.prioridad]} label={PRIORIDADES[request.prioridad]} /></FieldValue>
              </FieldBlock>
              

              <FieldBlock label="Sprint">
                <FieldValue muted={!selectedSprint}>
                  {selectedSprint ? (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--txt)' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: sprintDotColor(selectedSprint), flexShrink: 0, display: 'inline-block' }} />
                      {selectedSprint.Sprint_Text}
                      {selectedSprint.Sprint_Start_Date && selectedSprint.Sprint_End_Date
                        ? <span style={{ fontSize: 10, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>{fmtD(selectedSprint.Sprint_Start_Date)} → {fmtD(selectedSprint.Sprint_End_Date)}</span>
                        : <span style={{ fontSize: 9, color: '#7f77dd', fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Histórico</span>
                      }
                    </span>
                  ) : 'Sin sprint'}
                </FieldValue>
              </FieldBlock>

              <FieldBlock label="Fecha de apertura">
                <FieldValue>{fmtColombia(request.fechaApertura)}</FieldValue>
              </FieldBlock>
            </div>
{(effectiveRequest.cierreHistorial?.length ?? 0) > 0 && (
  <FieldBlock label={
    (effectiveRequest.cierreHistorial?.length ?? 0) > 1
      ? `Historial de evidencia · ${effectiveRequest.cierreHistorial!.length} registros`
      : 'Evidencia de avance'
  }>
    <CierreTimeline historial={effectiveRequest.cierreHistorial!} />
  </FieldBlock>
)}
{feedbackHistorial.length > 0 && (
  <FieldBlock label={
    feedbackHistorial.length > 1
      ? `Historial de feedback · ${feedbackHistorial.length} respuestas`
      : 'Feedback del cliente'
  }>
    <FeedbackTimeline historial={feedbackHistorial} />
  </FieldBlock>
)}

          </div>

          {/* Panel derecho — comentarios */}
          <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              <button style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '12px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 1, background: 'transparent', border: 'none', borderBottom: '2px solid var(--accent)', color: 'var(--accent)', cursor: 'default' }}>
                Comentarios
                {comments.length > 0 && (
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: 'rgba(0,200,255,0.15)', color: 'var(--accent)', border: '1px solid rgba(0,200,255,0.25)' }}>
                    {comments.length}
                  </span>
                )}
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {comments.length === 0
                ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.5, paddingTop: 40 }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="var(--txt-muted)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
                    </svg>
                    <p style={{ fontSize: 11, color: 'var(--txt-muted)', textAlign: 'center', margin: 0 }}>Sin comentarios aún.</p>
                  </div>
                )
                : comments.map((c) => {
                  const isOwn = c.author?.User_ID === currentUser?.User_ID;
                  return (
                    <div key={c.Comment_ID} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ width: 20, height: 20, borderRadius: '50%', background: isOwn ? 'linear-gradient(135deg,#0055cc,#00c8ff)' : 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                          {initials(c.author?.User_Name ?? '?')}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.author?.User_Name ?? 'Desconocido'}</span>
                        <span style={{ fontSize: 9, color: 'var(--txt-muted)', flexShrink: 0 }}>{fmtRelative(c.Comment_Created_At)}</span>
                        {isOwn && (
                          <button
                            onClick={() => deleteComment({ commentId: c.Comment_ID, requestId: request.id })}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 2, display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0 }}
                            onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--txt-muted)'; }}
                          >
                            <Trash2 size={11} />
                          </button>
                        )}
                      </div>
                      <div style={{ marginLeft: 26, fontSize: 12, color: 'var(--txt)', lineHeight: 1.55, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '7px 10px', wordBreak: 'break-word' }}>
                        {c.Comment_Text}
                      </div>
                    </div>
                  );
                })
              }
              <div ref={commentsEndRef} />
            </div>

            <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {canComment ? (
                <>
                  <textarea
                    value={_commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={handleCommentKeyDown}
                    placeholder="Escribe un comentario… (Ctrl+Enter)"
                    rows={2}
                    style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '8px 10px', color: 'var(--txt)', fontSize: 12, resize: 'none', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; }}
                    onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                  />
                  <button
                    onClick={handleSendComment}
                    disabled={!_commentText.trim() || sending}
                    style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, background: _commentText.trim() ? 'var(--accent-2)' : 'var(--bg-surface)', border: `1px solid ${_commentText.trim() ? 'transparent' : 'var(--border-subtle)'}`, color: _commentText.trim() ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 600, cursor: _commentText.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s', fontFamily: 'var(--font-display)' }}
                  >
                    <Send size={11} />{sending ? 'Enviando…' : 'Enviar'}
                  </button>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic', textAlign: 'center', padding: '4px 0' }}>
                  Solo el solicitante o los responsables pueden comentar.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function CopyLinkButton({ ticketId }: { ticketId: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(`${window.location.origin}/ticket/${ticketId}`)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <button onClick={handleCopy} title="Copiar link del ticket"
      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700, letterSpacing: 0.5, border: `1px solid ${copied ? 'rgba(0,229,160,0.4)' : 'var(--border-subtle)'}`, background: copied ? 'rgba(0,229,160,0.1)' : 'transparent', color: copied ? 'var(--success)' : 'var(--txt-muted)', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-body)' }}>
      {copied
        ? <svg width="11" height="11" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
      }
      {copied ? 'Copiado' : 'Copiar link'}
    </button>
  );
}