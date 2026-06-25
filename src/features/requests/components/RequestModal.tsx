// src/features/requests/components/RequestModal.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  X, ChevronUp, ChevronDown, Clock, ChevronDown as ChevDown,
  Send, Trash2, Paperclip, Upload, FileText, Image, File,
  GitFork, Plus, ExternalLink, CheckCircle, Lock, ShieldAlert, Copy, Users
} from 'lucide-react';
import { useMoveRequest } from '../hooks/useMoveRequests';
import { useDeleteRequest } from '../hooks/useRequests';
import { useCreateRequest } from '../hooks/useCreateRequest';
import { useUpdateRequest } from '../hooks/UseUpdateRequest';
import { KANBAN_COLUMNAS, PRIORIDADES, COLUMNAS_CIERRE, PRIORIDAD_TO_SCORE } from '../types';
import type { Request, KanbanColumna, Prioridad, Equipo } from '../types';
import { useLabelsByTeamId } from '@/features/requests/hooks/useBoardMetadata';
import { useSubTeams } from '@/features/requests/hooks/useSubTeams';
import { useSprints } from '@/features/requests/hooks/useSprints';
import { useUsers, useAssignRequest, useUnassignRequest } from '@/features/requests/hooks/useUsers';
import { useComments, useCreateComment, useDeleteComment } from '@/features/requests/hooks/useComments';
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '@/features/requests/hooks/useAttachments';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useColumnMap } from '@/features/requests/hooks/useColumnMap';
import { useTeamColumnConfig } from '@/features/requests/hooks/useKanbanAdmin';
import { useChildRequests } from '@/features/requests/hooks/useSubRequest';
import { useAcceptanceCriteria, useUpdateCriteriaStatus, useCreateCriteria, useDeleteCriteria, useUpdateCriteriaTitle } from '@/features/requests/hooks/useAcceptanceCriteria';
import { useClientFeedback } from '@/features/requests/hooks/useClientFeedback';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { CreateRequestModal } from './CreateRequestModal';
import { ClosureModal } from './ClosureModal';
import { ClientReviewBanner } from './ClientReviewBanner';
import { config } from '@/config';
import type { AcceptanceCriteria } from '@/types/commons';
import { useSubTeamMembersGrouped } from '@/features/requests/hooks/useSubTeamMembers';
import type { SubTeamMember } from '@/features/requests/hooks/useSubTeamMembers';
import { CierreTimeline, FeedbackTimeline} from '@/features/requests/components/RequestTimelines';
import { useTimerStore } from '@/store/timerStore';

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

const PRI_COLOR: Record<Prioridad, string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
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

function fmtBytes(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <Image size={13} />;
  if (mime === 'application/pdf' || mime.includes('text')) return <FileText size={13} />;
  return <File size={13} />;
}

function fmtHours(h: number): string {
  const hrs  = Math.floor(h);
  const mins = Math.round((h % 1) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return { open, setOpen, ref };
}

type Props = {
  request:           Request;
  equipo:            Equipo;
  onClose:           () => void;
  onMove:            (id: string, columna: KanbanColumna) => void;
  onMoveWithClosure: (id: string, columna: KanbanColumna, note: string, attachments: File[], mode?: 'new' | 'reuse' | 'skip', reuseFromClosureId?: number | null) => void;
  onOpenRequest?:    (requestId: string) => void;
  readOnly?:         boolean;
  backLabel?:        string;  
  onBack?:           () => void;
  onDeleted?:        (id: string) => void;
};

type RightTab = 'comments' | 'attachments';

/* ─── SubRequestsPanel ─────────────────────────────────────── */
function SubRequestsPanel({
  parentId, parentTitle, parentIsConfidential, onOpenChild,
}: {
  request: Request;
  equipo: Equipo;
  parentId: string; parentTitle: string;
  parentIsConfidential: boolean; onOpenChild: (id: string) => void;
}) {
  const { data: children = [], isLoading, refetch } = useChildRequests(parentId);
  const [showCreate, setShowCreate] = useState(false);

  const completed = children.filter((r) => r.columna === 'hecho').length;
  const total     = children.length;
  const pct       = total === 0 ? 0 : Math.round((completed / total) * 100);

  const colColorMap: Record<string, string> = {
    sin_categorizar: 'var(--txt-muted)', icebox: '#60a5fa', backlog: 'var(--info)',
    todo: 'var(--warn)', en_progreso: 'var(--accent)', en_revision_qas: '#f59e0b',
    cliente_review: '#34d399', ready_to_deploy: '#a78bfa', hecho: 'var(--success)', historial: 'var(--txt-muted)',
  };
  const colLabel: Record<string, string> = {
    sin_categorizar: 'Sin cat.', icebox: 'Icebox', backlog: 'Backlog', todo: 'To do',
    en_progreso: 'En progreso', en_revision_qas: 'QAS', cliente_review: 'C Review',
    ready_to_deploy: 'Ready', hecho: 'Hecho', historial: 'Historial',
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'var(--bg-surface)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
            <div style={{ height: '100%', width: `${pct}%`, borderRadius: 4, background: pct === 100 ? 'var(--success)' : 'linear-gradient(90deg, var(--accent), var(--accent-2))', transition: 'width 0.35s ease' }} />
          </div>
          <span style={{ fontSize: 10, fontWeight: 700, color: pct === 100 ? 'var(--success)' : 'var(--txt-muted)', minWidth: 36, textAlign: 'right', fontFamily: 'var(--font-display)' }}>{pct}%</span>
          {total > 0 && <span style={{ fontSize: 9, color: 'var(--txt-muted)', whiteSpace: 'nowrap' }}>{completed}/{total} en Hecho</span>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {isLoading && <div style={{ padding: '8px 0', fontSize: 11, color: 'var(--txt-muted)', opacity: 0.6 }}>Cargando…</div>}
          {!isLoading && children.length === 0 && <div style={{ padding: '8px 0 4px', fontSize: 11, color: 'var(--txt-muted)', opacity: 0.55, fontStyle: 'italic' }}>Sin sub-solicitudes aún.</div>}
          {children.map((child) => {
            const isDone   = child.columna === 'hecho';
            const colColor = colColorMap[child.columna] ?? 'var(--txt-muted)';
            return (
              <div key={child.id} onClick={() => onOpenChild(child.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 7, background: isDone ? 'rgba(0,229,160,0.05)' : 'var(--bg-surface)', border: `1px solid ${isDone ? 'rgba(0,229,160,0.2)' : 'var(--border-subtle)'}`, transition: 'all 0.15s', cursor: 'pointer', opacity: isDone ? 0.75 : 1 }}
                onMouseEnter={(e) => { if (!isDone) e.currentTarget.style.borderColor = 'rgba(0,200,255,0.3)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = isDone ? 'rgba(0,229,160,0.2)' : 'var(--border-subtle)'; }}
              >
                <div style={{ width: 7, height: 7, borderRadius: '50%', background: colColor, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 12, color: isDone ? 'var(--txt-muted)' : 'var(--txt)', textDecoration: isDone ? 'line-through' : 'none', wordBreak: 'break-word', lineHeight: 1.4 }}>{child.titulo}</span>
                {child.assignees?.[0] && <span style={{ fontSize: 9, color: 'var(--txt-muted)', flexShrink: 0 }}>{child.assignees[0].userName.split(' ')[0]}</span>}
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, color: colColor, background: `${colColor}15`, border: `1px solid ${colColor}30`, flexShrink: 0 }}>{colLabel[child.columna] ?? child.columna}</span>
                <ExternalLink size={10} style={{ color: 'var(--txt-muted)', flexShrink: 0, opacity: 0.4 }} />
              </div>
            );
          })}
        </div>
        <button
          onClick={() => setShowCreate(true)}
          style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 7, border: '1px dashed var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-body)', width: '100%' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--txt-muted)'; }}
        >
          <Plus size={12} />Nueva sub-solicitud
        </button>
      </div>
      {showCreate && (
        <CreateRequestModal
          parentId={parentId}
          parentTitle={parentTitle}
          parentIsConfidential={parentIsConfidential}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void refetch(); }}
        />
      )}
    </>
  );
}

/* ─── AcceptanceCriteriaPanel ──────────────────────────────── */
/* ─── AcceptanceCriteriaPanel ──────────────────────────────── */
function AcceptanceCriteriaPanel({
  requestId, readOnly, currentUserId,
}: {
  requestId: string; readOnly: boolean; currentUserId: number | undefined;
}) {
  const { data: criteria = [], isLoading } = useAcceptanceCriteria(requestId);
  const { mutate: updateStatus, isPending: updatingStatus } = useUpdateCriteriaStatus(requestId);
  const { mutate: updateTitle,  isPending: updatingTitle  } = useUpdateCriteriaTitle(requestId);
  const { mutate: deleteCrit,   isPending: deleting       } = useDeleteCriteria(requestId);
  const { mutate: createCrit,   isPending: creating       } = useCreateCriteria(requestId);

  const [reviewNotes,  setReviewNotes]  = useState<Record<number, string>>({});
  const [expandedNote, setExpandedNote] = useState<number | null>(null);
  const [editingId,    setEditingId]    = useState<number | null>(null);
  const [editText,     setEditText]     = useState('');
  const [newTitle,     setNewTitle]     = useState('');
  const [showNew,      setShowNew]      = useState(false);

  const accepted = criteria.filter((c) => c.status === 'accepted').length;
  const rejected = criteria.filter((c) => c.status === 'rejected').length;
  const total    = criteria.length;

  function handleAction(c: AcceptanceCriteria, status: 'accepted' | 'rejected' | 'pending') {
    if (!currentUserId) return;
    updateStatus({ criteriaId: c.criteriaId, status, reviewedBy: currentUserId, reviewerNotes: reviewNotes[c.criteriaId] });
    if (status !== 'pending') setExpandedNote(null);
  }

  function handleStartEdit(c: AcceptanceCriteria) {
    setEditingId(c.criteriaId);
    setEditText(c.title);
    setExpandedNote(null);
    setShowNew(false);
  }

  function handleSaveEdit(criteriaId: number) {
    const title = editText.trim();
    if (!title) return;
    updateTitle({ criteriaId, title }, { onSuccess: () => setEditingId(null) });
  }

  function handleDelete(criteriaId: number) {
    deleteCrit({ criteriaId }, { onSuccess: () => { if (editingId === criteriaId) setEditingId(null); } });
  }

  function handleCreate() {
    const title = newTitle.trim();
    if (!title) return;
    createCrit({ title }, { onSuccess: () => { setNewTitle(''); setShowNew(false); } });
  }

  const STATUS_COLOR:  Record<string, string> = { pending: 'var(--txt-muted)', accepted: 'var(--success)', rejected: 'var(--danger)' };
  const STATUS_BG:     Record<string, string> = { pending: 'rgba(255,255,255,0.04)', accepted: 'rgba(0,229,160,0.06)', rejected: 'rgba(255,71,87,0.06)' };
  const STATUS_BORDER: Record<string, string> = { pending: 'var(--border-subtle)', accepted: 'rgba(0,229,160,0.25)', rejected: 'rgba(255,71,87,0.25)' };
  const STATUS_LABEL:  Record<string, string> = { pending: 'Pendiente', accepted: 'Aceptado', rejected: 'Rechazado' };

  if (isLoading) return <div style={{ padding: '8px 0', fontSize: 11, color: 'var(--txt-muted)', opacity: 0.6 }}>Cargando criterios…</div>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {/* ── Header: barra de progreso + botón Nuevo ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {total > 0 && (
          <>
            <div style={{ flex: 1, height: 4, borderRadius: 3, background: 'var(--bg-surface)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
              <div style={{ height: '100%', width: `${Math.round((accepted / total) * 100)}%`, borderRadius: 3, background: rejected > 0 ? 'var(--danger)' : 'var(--success)', transition: 'width 0.3s ease' }} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: rejected > 0 ? 'var(--danger)' : accepted === total ? 'var(--success)' : 'var(--txt-muted)', minWidth: 40, textAlign: 'right' }}>{accepted}/{total}</span>
          </>
        )}
        {!readOnly && (
          <button
            onClick={() => { setShowNew(true); setEditingId(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 5, fontSize: 10, fontWeight: 700, border: '1px solid rgba(0,200,255,0.3)', background: 'rgba(0,200,255,0.06)', color: 'var(--accent)', cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-body)', whiteSpace: 'nowrap' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,200,255,0.14)'; e.currentTarget.style.borderColor = 'rgba(0,200,255,0.5)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,200,255,0.06)'; e.currentTarget.style.borderColor = 'rgba(0,200,255,0.3)'; }}
          >
            <Plus size={9} />Nuevo
          </button>
        )}
      </div>

      {total === 0 && !showNew && (
        <div style={{ padding: '8px 12px', borderRadius: 6, background: 'rgba(255,71,87,0.05)', border: '1px solid rgba(255,71,87,0.2)', fontSize: 11, color: 'var(--danger)' }}>
          Esta solicitud no tiene criterios de aceptación definidos.
        </div>
      )}

      {/* ── Lista de criterios ── */}
      {criteria.map((c) => {
        const isEditing = editingId === c.criteriaId;
        return (
          <div key={c.criteriaId} style={{ borderRadius: 8, border: `1px solid ${isEditing ? 'rgba(0,200,255,0.3)' : STATUS_BORDER[c.status]}`, background: isEditing ? 'rgba(0,200,255,0.04)' : STATUS_BG[c.status], overflow: 'hidden', transition: 'all 0.15s' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px' }}>

              {/* Indicador de estado */}
              <div style={{ width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${STATUS_COLOR[c.status]}15`, border: `1.5px solid ${STATUS_COLOR[c.status]}40` }}>
                {c.status === 'accepted' && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                {c.status === 'rejected' && <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><line x1="2" y1="2" x2="8" y2="8" stroke="var(--danger)" strokeWidth="1.8" strokeLinecap="round"/><line x1="8" y1="2" x2="2" y2="8" stroke="var(--danger)" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                {c.status === 'pending' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--txt-muted)' }} />}
              </div>

              {/* Título o input de edición */}
              {isEditing ? (
                <textarea
                  autoFocus
                  value={editText}
                  rows={1}
                  ref={(el) => {
                    if (el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
                  }}
                  onChange={(e) => {
                    setEditText(e.target.value);
                    e.currentTarget.style.height = 'auto';
                    e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSaveEdit(c.criteriaId); }
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  style={{ flex: 1, padding: '4px 8px', borderRadius: 5, border: '1px solid rgba(0,200,255,0.35)', background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)', resize: 'none', overflow: 'hidden', lineHeight: 1.4 }}
                />
              ) : (
                <>
                  <span style={{ flex: 1, fontSize: 12, color: c.status === 'rejected' ? 'var(--danger)' : c.status === 'accepted' ? 'var(--txt-muted)' : 'var(--txt)', textDecoration: c.status === 'accepted' ? 'line-through' : 'none', lineHeight: 1.4, wordBreak: 'break-word' }}>{c.title}</span>
                  <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, color: STATUS_COLOR[c.status], background: `${STATUS_COLOR[c.status]}12`, border: `1px solid ${STATUS_COLOR[c.status]}30`, flexShrink: 0, whiteSpace: 'nowrap' }}>{STATUS_LABEL[c.status]}</span>
                </>
              )}

              {/* Botones */}
              {!readOnly && (
                isEditing ? (
                  /* Modo edición: Guardar + Eliminar + Cancelar */
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    <button
                      onClick={() => handleSaveEdit(c.criteriaId)}
                      disabled={updatingTitle || !editText.trim()}
                      style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(0,200,255,0.4)', background: 'rgba(0,200,255,0.1)', color: 'var(--accent)', cursor: updatingTitle ? 'not-allowed' : 'pointer', transition: 'all 0.12s' }}
                      onMouseEnter={(e) => { if (!updatingTitle) e.currentTarget.style.background = 'rgba(0,200,255,0.2)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,200,255,0.1)'; }}
                    >
                      <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      {updatingTitle ? 'Guardando…' : 'Guardar'}
                    </button>
                    <button
                      onClick={() => handleDelete(c.criteriaId)}
                      disabled={deleting}
                      style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(255,71,87,0.35)', background: 'rgba(255,71,87,0.08)', color: 'var(--danger)', cursor: deleting ? 'not-allowed' : 'pointer', transition: 'all 0.12s' }}
                      onMouseEnter={(e) => { if (!deleting) e.currentTarget.style.background = 'rgba(255,71,87,0.18)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,71,87,0.08)'; }}
                    >
                      <Trash2 size={9} />{deleting ? '…' : 'Eliminar'}
                    </button>
                    <button onClick={() => setEditingId(null)} style={{ fontSize: 11, padding: '2px 7px', borderRadius: 3, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', cursor: 'pointer' }}>×</button>
                  </div>
                ) : (
                  /* Modo normal: Aceptar / Rechazar / Reset + Lápiz */
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0, alignItems: 'center' }}>
                    {c.status === 'pending' && (
                      <>
                        <button onClick={() => handleAction(c, 'accepted')} disabled={updatingStatus} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(0,229,160,0.4)', background: 'rgba(0,229,160,0.1)', color: 'var(--success)', cursor: 'pointer', transition: 'all 0.12s' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,229,160,0.2)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,229,160,0.1)'; }}>
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>OK
                        </button>
                        <button onClick={() => setExpandedNote((p) => p === c.criteriaId ? null : c.criteriaId)} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(255,71,87,0.35)', background: expandedNote === c.criteriaId ? 'rgba(255,71,87,0.15)' : 'rgba(255,71,87,0.08)', color: 'var(--danger)', cursor: 'pointer', transition: 'all 0.12s' }}>
                          <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><line x1="2" y1="2" x2="8" y2="8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/><line x1="8" y1="2" x2="2" y2="8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>Rechazar
                        </button>
                      </>
                    )}
                    {c.status !== 'pending' && (
                      <button onClick={() => handleAction(c, 'pending')} disabled={updatingStatus} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 3, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', cursor: 'pointer', flexShrink: 0 }} title="Restablecer a pendiente">↩</button>
                    )}
                    {/* Lápiz */}
                    <button
                      onClick={() => handleStartEdit(c)}
                      title="Editar criterio"
                      style={{ width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0 }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.background = 'rgba(0,200,255,0.08)'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--txt-muted)'; e.currentTarget.style.background = 'transparent'; }}
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M8.5 1.5l2 2L4 10H2V8L8.5 1.5z"/>
                      </svg>
                    </button>
                  </div>
                )
              )}
            </div>

            {/* Input nota de rechazo */}
            {expandedNote === c.criteriaId && !readOnly && !isEditing && (
              <div style={{ padding: '0 12px 10px', display: 'flex', gap: 6 }}>
                <input autoFocus value={reviewNotes[c.criteriaId] ?? ''} onChange={(e) => setReviewNotes((p) => ({ ...p, [c.criteriaId]: e.target.value }))} placeholder="Nota opcional al rechazar…" style={{ flex: 1, padding: '6px 10px', borderRadius: 5, border: '1px solid rgba(255,71,87,0.3)', background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 11, outline: 'none', fontFamily: 'var(--font-body)' }} />
                <button onClick={() => handleAction(c, 'rejected')} disabled={updatingStatus} style={{ padding: '6px 12px', borderRadius: 5, border: 'none', background: 'var(--danger)', color: 'white', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Confirmar</button>
              </div>
            )}
            {c.reviewerNotes && c.status !== 'pending' && !isEditing && (
              <div style={{ padding: '0 12px 10px' }}>
                <div style={{ padding: '6px 10px', borderRadius: 5, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic' }}>"{c.reviewerNotes}"</div>
              </div>
            )}
          </div>
        );
      })}

      {/* ── Input nuevo criterio ── */}
      {showNew && !readOnly && (
        <div style={{ display: 'flex', gap: 6, padding: '8px 10px', borderRadius: 7, border: '1px dashed rgba(0,200,255,0.35)', background: 'rgba(0,200,255,0.04)' }}>
          <input
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
              if (e.key === 'Escape') { setShowNew(false); setNewTitle(''); }
            }}
            placeholder="Título del nuevo criterio…"
            style={{ flex: 1, padding: '6px 10px', borderRadius: 5, border: '1px solid rgba(0,200,255,0.3)', background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)' }}
          />
          <button
            onClick={handleCreate}
            disabled={creating || !newTitle.trim()}
            style={{ padding: '6px 12px', borderRadius: 5, border: 'none', background: creating || !newTitle.trim() ? 'var(--bg-surface)' : 'var(--accent-2)', color: creating || !newTitle.trim() ? 'var(--txt-muted)' : 'white', fontSize: 11, fontWeight: 700, cursor: creating || !newTitle.trim() ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', transition: 'all 0.15s' }}
          >
            {creating ? 'Guardando…' : 'Agregar'}
          </button>
          <button onClick={() => { setShowNew(false); setNewTitle(''); }} style={{ padding: '6px 8px', borderRadius: 5, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 13, cursor: 'pointer' }}>×</button>
        </div>
      )}
    </div>
  );
}
/* ══════════════════════════════════════════════════════════════
   Modal principal
   ══════════════════════════════════════════════════════════════ */
export function RequestModal({
  request, equipo, onClose, onMove, onMoveWithClosure, onOpenRequest, readOnly = false,
  backLabel, onBack, onDeleted,
}: Props) {
  const { Requests }     = useGraphServices();
  const { mutate: mover }    = useMoveRequest(equipo);
  const { mutate: update }   = useUpdateRequest(equipo);
  const { mutate: assign }   = useAssignRequest();
  const { mutate: unassign } = useUnassignRequest();
  const { mutate: createComment, isPending: sendingComment } = useCreateComment();
  const { mutate: deleteComment }   = useDeleteComment();
  const { mutate: uploadAttachment, isPending: uploading } = useUploadAttachment();
  const { mutate: deleteAttachment } = useDeleteAttachment();
  const { mutate: deleteRequest, isPending: deleting } = useDeleteRequest();
  const { mutate: createRequest, isPending: duplicating }  = useCreateRequest();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [duplicated,         setDuplicated]        = useState(false);
  const { data: currentUser } = useCurrentUser();
const overlayRef   = useRef<HTMLDivElement>(null);
const tituloRef    = useRef<HTMLTextAreaElement>(null);
const commentsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const boardId      = config.DEFAULT_BOARD_ID;
  const columnMap    = useColumnMap(boardId);

  const requestId    = request.id;
  const boardTeamId  = request.boardTeamId ?? null;
  const isSubRequest = request.parentId !== null;

  /* ── Fuente de verdad: config de columnas del equipo ── */
  const { data: teamColumns = [] } = useTeamColumnConfig(boardId, boardTeamId);

  const teamColMap = new Map(teamColumns.map((c) => [c.Board_Column_Slug, c]));

  /** Lista que alimenta el dropdown "Mover a": visibles + ordenadas + con
   *  evidencia dinámica. Si no hay config (boardTeamId null o todavía
   *  cargando), cae al listado global como fallback seguro. */
  const columnsForMove: { slug: KanbanColumna; name: string; evidenceRequired: boolean }[] =
    teamColumns.length > 0
      ? [...teamColumns]
          .filter((c) => c.Is_Visible)
          .sort((a, b) => a.Board_Column_Position - b.Board_Column_Position)
          .map((c) => ({
            slug:             c.Board_Column_Slug as KanbanColumna,
            name:             c.Board_Column_Name,
            evidenceRequired: c.Evidence_Required,
          }))
      : (Object.entries(KANBAN_COLUMNAS) as [KanbanColumna, string][]).map(([slug, name]) => ({
          slug,
          name,
          evidenceRequired: COLUMNAS_CIERRE.has(slug),
        }));

  /** Helpers de presentación — usan config del equipo con fallback a hardcoded */
  const labelFor      = (slug: KanbanColumna) => teamColMap.get(slug)?.Board_Column_Name ?? KANBAN_COLUMNAS[slug] ?? slug;
  const colorFor      = (slug: KanbanColumna) => teamColMap.get(slug)?.Team_Column_Color ?? teamColMap.get(slug)?.Board_Column_Color ?? COL_COLOR[slug] ?? 'var(--txt-muted)';
  const titleColorFor = (slug: KanbanColumna) => teamColMap.get(slug)?.Team_Column_Title_Color ?? colorFor(slug);
  const requiresEvidenceFor = (slug: KanbanColumna) => teamColMap.get(slug)?.Evidence_Required ?? COLUMNAS_CIERRE.has(slug);

  /* Fetch fresco al montar */
  const { data: freshRequest } = useQuery<Request>({
    queryKey: ['request', requestId],
    queryFn:  () => Requests.fetchById(requestId),
    enabled:  !config.USE_MOCK,
    staleTime: 0,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
  });

  const effectiveRequest = freshRequest ?? request;

  const isCerrada        = !!effectiveRequest.fechaCierre;
  const isClienteReview  = effectiveRequest.columna === 'cliente_review';

  /* Feedback del cliente */
const { data: feedbackHistorial = [] } = useClientFeedback(requestId);
  const cierreCount    = effectiveRequest.cierreHistorial?.length ?? 0;
  // Para ClientReviewBanner: mostrar feedback existente solo si ya se cubrió el ciclo actual
  const clientFeedback = cierreCount > 0 && feedbackHistorial.length >= cierreCount
    ? (feedbackHistorial[0] ?? null)
    : null;
  const [pendingClosureCol,   setPendingClosureCol]   = useState<KanbanColumna | null>(null);
  const [pendingClosureColId, setPendingClosureColId] = useState<number>(0);
  const [pendingSourceReqEv,  setPendingSourceReqEv]  = useState<boolean>(false);

  const { data: subTeams    = [] } = useSubTeams(boardTeamId);
  const { data: labels      = [] } = useLabelsByTeamId(boardId, boardTeamId);
  const { data: sprints     = [] } = useSprints();
const { data: allUsers    = [] } = useUsers();
const { data: comments    = [] } = useComments(requestId);  const { data: attachments = [] } = useAttachments(requestId);
  const { data: children    = [] } = useChildRequests(requestId);
  const { data: criteria    = [] } = useAcceptanceCriteria(requestId);
  const { data: parentRequest } = useQuery<Request>({
    queryKey: ['request', request.parentId],
    queryFn:  () => Requests.fetchById(request.parentId!),
    enabled:  isSubRequest && !config.USE_MOCK,
    staleTime: 30_000,
  });

  const catDD      = useDropdown();
  const sprintDD   = useDropdown();
  const assigneeDD = useDropdown();
  const priorDD    = useDropdown();
  const moverDD    = useDropdown();

  const [rightTab,         setRightTab]         = useState<RightTab>('comments');
const [showSubRequests,  setShowSubRequests]  = useState(false);  const [columnaActual,    setColumnaActual]    = useState<KanbanColumna>(request.columna);
  const [descripcion,      setDescripcion]      = useState(request.descripcion ?? '');
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>(request.labelIds ?? []);
  const [selectedSubIds,   setSelectedSubIds]   = useState<number[]>(request.subTeamIds ?? []);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(request.sprintId ?? null);
  const [assigneeIds,      setAssigneeIds]      = useState<number[]>(request.assignees?.map((a) => a.userId) ?? []);
  const [userSearch,       setUserSearch]       = useState('');
  const [labelSearch,      setLabelSearch]      = useState('');
  const [commentText,      setCommentText]      = useState('');
  const [dragOver,         setDragOver]         = useState(false);
const [tituloLocal,      setTituloLocal]      = useState(request.titulo ?? '');
const [formDataLocal,    setFormDataLocal]    = useState<Record<string, unknown>>(request.formData ?? {});
const groupedMembers = useSubTeamMembersGrouped(subTeams);

const assignedUsers  = allUsers.filter((u) => assigneeIds.includes(u.User_ID));

const [saveStatus, setSaveStatus]             = useState<'idle' | 'pending' | 'saving' | 'saved'>('idle');
const saveDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
// Solo corre al montar (request.id cambia = nuevo modal)
useEffect(() => {
  const r = request; // usar prop inicial, no freshRequest
  setDescripcion(r.descripcion ?? '');
  setSelectedLabelIds(r.labelIds ?? []);
  setSelectedSubIds(r.subTeamIds ?? []);
  setSelectedSprintId(r.sprintId ?? null);
  setAssigneeIds(r.assignees?.map((a) => a.userId) ?? []);
  setTituloLocal(r.titulo ?? '');
  setFormDataLocal(r.formData ?? {});
  setColumnaActual(r.columna);
}, [request.id]);

  useEffect(() => {
    const el = tituloRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }, [request.id]);
  useEffect(() => { commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [comments.length]);
function handleDuplicate() {
  if (!currentUser || duplicating) return;
  createRequest(
    {
      boardId:              boardId,
      columnId:             columnMap?.[columnaActual] ?? 1,
      requestedBy:          currentUser.User_ID,
      templateId:           (effectiveRequest as any).templateId ?? 0,
      titulo:               `${effectiveRequest.titulo} (copia)`,
      descripcion:          effectiveRequest.descripcion ?? '',
      prioridad:            effectiveRequest.prioridad,
      equipoIds:            boardTeamId ? [boardTeamId] : [],
      subTeamIds:           selectedSubIds,
      labelIds:             selectedLabelIds,
      sprintId:             selectedSprintId,
      estimatedHours:       effectiveRequest.estimatedHours ?? null,
      parentId:             null,
      requesterTeamId:      (effectiveRequest as any).requesterTeamId ?? null,
      requesterDepartmentId:(effectiveRequest as any).requesterDepartmentId ?? null,
      isConfidential:       effectiveRequest.isConfidential ?? false,
      formData:             formDataLocal,
      acceptanceCriteria:   criteria.map((c) => c.title),
      assigneeIds:          assigneeIds,
    },
    {
      onSuccess: (newRequest) => {
        setDuplicated(true);
        setTimeout(() => {
          setDuplicated(false);
          onOpenRequest?.(newRequest.id);
        });
      },
    },
  );
}

function handleDelete() {
    deleteRequest(requestId, {
    onSuccess: () => {
      setShowDeleteConfirm(false);
      onClose();
      onDeleted?.(requestId);
    },
  });
}

function handleClose() {
  onClose();
}

useEffect(() => {
  const fn = (e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  };
  window.addEventListener('keydown', fn);
  return () => window.removeEventListener('keydown', fn);
}, [onClose]);

  /* ── Lógica de movimiento ── */
  function handleMover(columna: KanbanColumna) {
    if (readOnly || columnaActual === columna) return;
    /* Si ya hay closure (evidencia subida al mover a QAS), no pedir de nuevo */
    const yaHayClosure = !!effectiveRequest.fechaCierre;
    if (requiresEvidenceFor(columna) && !yaHayClosure) {
      // ¿La columna de la que viene también requería evidencia?
      const sourceRequiresEvidence = requiresEvidenceFor(columnaActual);
      setPendingClosureCol(columna);
      setPendingClosureColId(columnMap?.[columna] ?? 0);
      setPendingSourceReqEv(sourceRequiresEvidence);
      return;
    }
    setColumnaActual(columna);
    mover(
      { id: requestId, columna, columnId: columnMap?.[columna], movedBy: currentUser?.User_ID },
      { onSuccess: () => onMove(requestId, columna) },
    );
  }

  function handleClosureFromModal(note: string, files: File[], mode: 'new' | 'reuse' | 'skip', reuseFromClosureId: number | null) {
    if (!pendingClosureCol) return;
    const targetCol = pendingClosureCol;
    setPendingClosureCol(null);
    setPendingSourceReqEv(false);
    setColumnaActual(targetCol);
    onMoveWithClosure(requestId, targetCol, note, files, mode, reuseFromClosureId);
  }

  function handleClientFeedbackSubmitted(targetColumna: 'ready_to_deploy' | 'en_revision_qas') {
    setColumnaActual(targetColumna);
    onMove(requestId, targetColumna);
  }

  /* ── Edición ── */
  function debouncedSave(patch: Parameters<typeof update>[0]['patch'], delay = 800) {
  setSaveStatus('pending');
  if (saveDebounceRef.current) clearTimeout(saveDebounceRef.current);
  saveDebounceRef.current = setTimeout(() => {
    setSaveStatus('saving');
    update(
      { id: requestId, patch },
      {
        onSuccess: () => {
          setSaveStatus('saved');
          setTimeout(() => setSaveStatus('idle'), 2000);
        },
        onError: () => setSaveStatus('idle'),
      },
    );
  }, delay);
}

function handleToggleLabel(labelId: number) {    if (readOnly) return;
    const next = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((l) => l !== labelId)
      : [...selectedLabelIds, labelId];
    setSelectedLabelIds(next);
    update({ id: requestId, patch: { labelIds: next } });
  }

function handleToggleSubTeam(subId: number, currentSubIds?: number[], currentAssigneeIds?: number[]) {
  if (readOnly) return;
  const base = currentSubIds ?? selectedSubIds;
  const next = base.includes(subId)
    ? base.filter((s) => s !== subId)
    : [...base, subId];
  setSelectedSubIds(next);

  // Si se remueve el sub-equipo, desasignar sus miembros
  if (base.includes(subId)) {
    const membersOfSub = groupedMembers
      .find((g) => g.subTeam.Sub_Team_ID === subId)
      ?.members ?? [];
    const memberIds = membersOfSub.map((m) => m.User_ID);
    const baseAssignees = currentAssigneeIds ?? assigneeIds;
    const toRemove = baseAssignees.filter((id) => memberIds.includes(id));
    toRemove.forEach((userId) => {
      setAssigneeIds((prev) => prev.filter((id) => id !== userId));
      unassign({ requestId, userId });
    });
  }

  update({ id: requestId, patch: { subTeamIds: next } });
}

function handleFormFieldChange(key: string, value: unknown) {
    if (readOnly) return;
    const next = { ...formDataLocal, [key]: value };
    setFormDataLocal(next);
    update({ id: requestId, patch: { formData: next } });
  }

  function handleSprint(sprintId: number | null) {    if (readOnly) return;
    setSelectedSprintId(sprintId);
    update({ id: requestId, patch: { sprintId } });
    sprintDD.setOpen(false);
  }

function handleToggleAssignee(userId: number) {
  if (readOnly) return;
  if (assigneeIds.includes(userId)) {
    setAssigneeIds((p) => p.filter((id) => id !== userId));
    unassign({ requestId, userId });
  } else {
    setAssigneeIds((p) => [...p, userId]);
    assign({ requestId, userId, assignedBy: currentUser?.User_ID });  // ← agregar esto
  }
}

  function handleSendComment() {
    const text = commentText.trim();
    if (!text || !currentUser) return;
    createComment({ requestId, userId: currentUser.User_ID, text }, { onSuccess: () => setCommentText('') });
  }

  function handleCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (readOnly) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSendComment(); }
  }

  function handleUploadFiles(files: FileList | null) {
    if (readOnly || !files || !currentUser) return;
    Array.from(files).forEach((file) => uploadAttachment({ requestId, userId: currentUser.User_ID, file }));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    if (!readOnly) handleUploadFiles(e.dataTransfer.files);
  }

  const triggerBase = (open: boolean, accentRgb: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    minHeight: 32, width: '100%', padding: '4px 8px', borderRadius: 6,
    border: `1px solid ${open ? `rgba(${accentRgb},0.45)` : 'var(--border-subtle)'}`,
    background: open ? `rgba(${accentRgb},0.07)` : 'transparent',
    cursor: readOnly ? 'default' : 'pointer',
    transition: 'border-color 0.15s, background 0.15s', textAlign: 'left',
  });

  const selectedSprint = sprints.find((s) => s.Sprint_ID === selectedSprintId) ?? null;
  const childCount = children.length;
  const childDone  = children.filter((r) => r.columna === 'hecho').length;

  function fmtColombia(iso: string) {
    return new Date(iso).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' });
  }

  const zIndex = readOnly ? 110 : 100;
  const readyToDeployColumnId = columnMap?.['ready_to_deploy'] ?? 7;
  const enRevisionQasColumnId = columnMap?.['en_revision_qas'] ?? 8;
const yaHayClosure = !!effectiveRequest.fechaCierre;


  /* ─────────────────────────────────────────────────────────── */
  return (
    <>
      <div
        ref={overlayRef}
onClick={(e) => { if (e.target === overlayRef.current) handleClose(); }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(59,130,246,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex, padding: 24 }}
      >
        <div style={{
          width: '100%', maxWidth: 900, maxHeight: '90vh',
          background: 'var(--bg-panel)',
          border: `1px solid ${
            isSubRequest      ? 'rgba(167,139,250,0.35)' :
            isCerrada         ? 'rgba(0,229,160,0.3)'    :
            isClienteReview   ? 'rgba(52,211,153,0.35)'  :
            'var(--border)'
          }`,
          borderRadius: 12, display: 'flex', flexDirection: 'column',
          overflow: 'hidden', position: 'relative',
        }}>
          {/* Barra de color superior */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background:
            isCerrada       ? 'linear-gradient(90deg, transparent, var(--success), transparent)' :
            isClienteReview ? 'linear-gradient(90deg, transparent, #34d399, transparent)'        :
            isSubRequest    ? 'linear-gradient(90deg, transparent, #a78bfa, transparent)'        :
            'linear-gradient(90deg, transparent, var(--accent), transparent)'
          }} />

          {/* ── Header ── */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
            {onBack && (
  <button 
    onClick={onBack}
    style={{
      display: 'flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 5,
      fontSize: 10, fontWeight: 700, letterSpacing: 0.5,
      border: '1px solid rgba(167,139,250,0.4)',
      background: 'rgba(167,139,250,0.1)',
      color: '#a78bfa', cursor: 'pointer',
      transition: 'all 0.15s', fontFamily: 'var(--font-body)',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(167,139,250,0.2)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(167,139,250,0.1)'; }}
  >
    <GitFork size={10} />
    {backLabel ?? '← Volver'}
  </button>
)}

            <div style={{ display: 'flex', gap: 2 }}>
              {/* Después de los botones ChevronUp/ChevronDown */}
              {[ChevronUp, ChevronDown].map((Icon, i) => (
                <button key={i} style={{ width: 26, height: 26, borderRadius: 5, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', cursor: 'not-allowed', opacity: 0.4 }}>
                  <Icon size={13} />
                </button>
              ))}
            </div>
            <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--txt-muted)', letterSpacing: '0.5px', opacity: 0.7, userSelect: 'all' }}>{effectiveRequest.id}</span>
            <CopyLinkButton ticketId={effectiveRequest.id} />
            {readOnly && <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 4, color: 'var(--txt-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>Solo lectura</span>}
            {isCerrada && !readOnly && <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 4, color: 'var(--success)', background: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)' }}><Lock size={10} />Cerrada</span>}
            {effectiveRequest.isConfidential && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, letterSpacing: 1, padding: '3px 10px', borderRadius: 4, color: '#fdcb6e', background: 'rgba(253,203,110,0.1)', border: '1px solid rgba(253,203,110,0.35)' }}>
                <ShieldAlert size={10} />Confidencial
              </span>
            )}
            {isSubRequest && !readOnly && (
              <span
                onClick={() => { if (onOpenRequest && request.parentId) onOpenRequest(request.parentId); }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 4, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', cursor: onOpenRequest ? 'pointer' : 'default' }}
              >
                <GitFork size={10} />Sub-solicitud
              </span>
            )}
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5,  padding: '3px 10px', borderRadius: 4, color: titleColorFor(columnaActual), background: `${colorFor(columnaActual)}15`, border: `1px solid ${colorFor(columnaActual)}35` }}>
              {labelFor(columnaActual)}
            </span>

            {/* Botón DIVIDIR */}
            {!isSubRequest && !readOnly && !isCerrada && (
              <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                <button
                  onClick={() => setShowSubRequests((v) => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '5px 13px 5px 10px', borderRadius: 6,
                    fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
                    border: showSubRequests ? '1px solid rgba(0,200,255,0.65)' : childCount > 0 ? '1px solid rgba(0,200,255,0.5)' : '1px solid rgba(0,200,255,0.32)',
                    background: showSubRequests ? 'rgba(0,200,255,0.16)' : childCount > 0 ? 'rgba(0,200,255,0.1)' : 'rgba(0,200,255,0.05)',
                    color: showSubRequests || childCount > 0 ? 'var(--accent)' : 'rgba(0,200,255,0.75)',
                    boxShadow: childCount > 0 ? '0 0 10px rgba(0,200,255,0.2), inset 0 0 0 1px rgba(0,200,255,0.06)' : 'none',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.75)'; e.currentTarget.style.background = 'rgba(0,200,255,0.2)'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.boxShadow = '0 0 14px rgba(0,200,255,0.28)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = showSubRequests ? 'rgba(0,200,255,0.65)' : childCount > 0 ? 'rgba(0,200,255,0.5)' : 'rgba(0,200,255,0.32)'; e.currentTarget.style.background = showSubRequests ? 'rgba(0,200,255,0.16)' : childCount > 0 ? 'rgba(0,200,255,0.1)' : 'rgba(0,200,255,0.05)'; e.currentTarget.style.color = showSubRequests || childCount > 0 ? 'var(--accent)' : 'rgba(0,200,255,0.75)'; e.currentTarget.style.boxShadow = childCount > 0 ? '0 0 10px rgba(0,200,255,0.2), inset 0 0 0 1px rgba(0,200,255,0.06)' : 'none'; }}
                >
                  <GitFork size={11} />Sub-Solicitudes
                  {childCount > 0 && (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: showSubRequests ? 'rgba(0,200,255,0.25)' : 'rgba(0,200,255,0.15)', color: 'var(--accent)', border: `1px solid ${showSubRequests ? 'rgba(0,200,255,0.45)' : 'rgba(0,200,255,0.3)'}` }}>
                      {childDone}/{childCount}
                    </span>
                  )}
                </button>
                <DividirTooltip />
              </div>
            )}

<div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>

  {/* ── Indicador de autosave ── */}
  <div style={{
    display: 'flex', alignItems: 'center', gap: 4,
    fontSize: 10, fontWeight: 600, letterSpacing: 0.3,
    minWidth: 80, justifyContent: 'flex-end',
    transition: 'opacity 0.3s',
    opacity: saveStatus === 'idle' ? 0 : 1,
    color: saveStatus === 'saved' ? 'var(--success)' : 'var(--txt-muted)',
    pointerEvents: 'none', userSelect: 'none',
  }}>
    {(saveStatus === 'pending' || saveStatus === 'saving') && (
      <>
        <svg
          width="10" height="10" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}
        >
          <path d="M12 2a10 10 0 0 1 10 10" />
        </svg>
        Guardando…
      </>
    )}
    {saveStatus === 'saved' && (
      <>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <polyline points="1.5 5 4 7.5 8.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Guardado
      </>
    )}
  </div>

  <button
    onClick={handleDuplicate}
                disabled={duplicating || !currentUser}
                title="Duplicar solicitud"
                style={{
                  width: 30, height: 30, borderRadius: 6,
                  border: `1px solid ${duplicated ? 'rgba(0,229,160,0.4)' : 'rgba(0,200,255,0.25)'}`,
                  color: duplicated ? 'var(--success)' : 'var(--txt-muted)',
                  background: duplicated ? 'rgba(0,229,160,0.1)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: duplicating ? 'wait' : 'pointer',
                  transition: 'all 0.15s', opacity: duplicating ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!duplicated) {
                    e.currentTarget.style.borderColor = 'rgba(0,200,255,0.5)';
                    e.currentTarget.style.color       = 'var(--accent)';
                    e.currentTarget.style.background  = 'rgba(0,200,255,0.08)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!duplicated) {
                    e.currentTarget.style.borderColor = 'rgba(0,200,255,0.25)';
                    e.currentTarget.style.color       = 'var(--txt-muted)';
                    e.currentTarget.style.background  = 'transparent';
                  }
                }}
              >
                {duplicating
                  ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
                      style={{ animation: 'spin 0.7s linear infinite' }}>
                      <path d="M12 2a10 10 0 0 1 10 10" />
                    </svg>
                  ) : duplicated
                  ? <svg width="14" height="14" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                  : <Copy size={14} />
                }
              </button>

              {!readOnly && currentUser?.User_Role === 'admin' && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  title="Eliminar solicitud"
                  style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid rgba(255,71,87,0.25)', color: 'var(--txt-muted)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,71,87,0.55)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.background = 'rgba(255,71,87,0.08)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,71,87,0.25)'; e.currentTarget.style.color = 'var(--txt-muted)'; e.currentTarget.style.background = 'transparent'; }}
                >
                  <Trash2 size={14} />
                </button>
              )}
              <button onClick={handleClose} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <X size={15} />
              </button>
            </div>
          </div>

          {/* ── ClientReviewBanner (arriba del cuerpo) ── */}
          {isClienteReview && (
            <ClientReviewBanner
              requestId={requestId}
              requestTitle={effectiveRequest.titulo}
              cierreInfo={effectiveRequest.cierreInfo}
              existingFeedback={clientFeedback}
              currentUserId={currentUser?.User_ID}
              solicitanteId={effectiveRequest.solicitanteId}
              equipo={equipo}
              readyToDeployColumnId={readyToDeployColumnId}
              enRevisionQasColumnId={enRevisionQasColumnId}
              onFeedbackSubmitted={handleClientFeedbackSubmitted}
            />
          )}

{/* ── Cuerpo + overlay sub-solicitudes ── */}
          <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Sub-solicitudes: panel flotante, no desplaza el contenido */}
            {showSubRequests && !isSubRequest && !readOnly && (
              <>
                <div
                  onClick={() => setShowSubRequests(false)}
                  style={{ position: 'absolute', inset: 0, zIndex: 40, cursor: 'pointer' }}
                />
                {/* Panel flotante */}
                <div style={{
                  position: 'absolute', top: 0, left: 0, right: 0,
                  zIndex: 50,
                  background: 'var(--bg-panel)',
                  borderBottom: '1px solid rgba(0,200,255,0.25)',
                  boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                  maxHeight: '62%',
                  overflowY: 'auto',
                }}>
                  <div style={{ padding: '14px 24px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                      <GitFork size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--accent)', flex: 1 }}>Sub-Solicitudes</span>
                      <button
                        onClick={() => setShowSubRequests(false)}
                        style={{ width: 22, height: 22, borderRadius: 5, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15, lineHeight: 1, transition: 'all 0.15s' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(255,71,87,0.4)'; e.currentTarget.style.color = 'var(--danger)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--txt-muted)'; }}
                      >×</button>
                    </div>
                    <SubRequestsPanel
                      request={request}
                      equipo={equipo}
                      parentId={requestId}
                      parentTitle={effectiveRequest.titulo}
                      parentIsConfidential={effectiveRequest.isConfidential ?? false}
                      onOpenChild={(childId) => onOpenRequest?.(childId)}
                    />
                  </div>
                </div>
              </>
            )}

            {/* ── Cuerpo ── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

            {/* Panel izquierdo */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24, borderRight: '1px solid var(--border-subtle)' }}>

              {/* Banner solicitud padre */}
              {isSubRequest && !readOnly && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 8, background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.2)' }}>
                  <GitFork size={13} style={{ color: '#a78bfa', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#a78bfa', display: 'block', marginBottom: 5 }}>Solicitud padre</span>
                    {parentRequest ? (
                      <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{parentRequest.titulo}</span>
                          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, color: COL_COLOR[parentRequest.columna], background: `${COL_COLOR[parentRequest.columna]}15`, border: `1px solid ${COL_COLOR[parentRequest.columna]}30`, flexShrink: 0 }}>{KANBAN_COLUMNAS[parentRequest.columna]}</span>
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>Solicitante: {parentRequest.solicitante}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--txt-muted)', fontStyle: 'italic' }}>{config.USE_MOCK ? `Solicitud #${request.parentId}` : 'Cargando…'}</span>
                    )}
                  </div>
                  {onOpenRequest && (
                    <button onClick={() => onOpenRequest(request.parentId!)} style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.08)', color: '#a78bfa', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s', whiteSpace: 'nowrap' }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(167,139,250,0.18)'; }} onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(167,139,250,0.08)'; }}>
                      Ver detalles →
                    </button>
                  )}
                </div>
              )}

              <FieldBlock label="Nombre de la solicitud">
                {readOnly
                  ? <h2 style={{ fontSize: 20, fontWeight: 600, color: 'var(--txt)', lineHeight: 1.35, margin: 0 }}>{effectiveRequest.titulo}</h2>
                  : (
<textarea
  ref={tituloRef}
  value={tituloLocal}
  onChange={(e) => {
    const val = e.target.value;
    setTituloLocal(val);
    e.currentTarget.style.height = 'auto';
    e.currentTarget.style.height = e.currentTarget.scrollHeight + 'px';
    const trimmed = val.trim();
    if (trimmed && trimmed !== effectiveRequest.titulo)
      debouncedSave({ titulo: trimmed });
  }}
  rows={1}
  style={{ width: '100%', padding: '10px 14px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 20, fontWeight: 600, lineHeight: 1.35, resize: 'none', outline: 'none', overflow: 'hidden', fontFamily: 'var(--font-body)', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
  onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; }}
  onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
/>
                  )
                }
              </FieldBlock>

              {effectiveRequest.isConfidential && (
                <div style={{ display: 'flex', gap: 12, padding: '12px 16px', borderRadius: 8, background: 'rgba(253,203,110,0.06)', border: '1px solid rgba(253,203,110,0.3)' }}>
                  <ShieldAlert size={15} style={{ color: '#fdcb6e', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: 12, color: '#fdcb6e', lineHeight: 1.6 }}>Esta solicitud contiene información confidencial. Recuerda validar el manejo de estos datos con el área de jurídica antes de proceder.</p>
                </div>
              )}

              <FieldBlock label="Descripción">
<textarea
  value={descripcion}
  onChange={(e) => {
    if (readOnly) return;
    const val = e.target.value;
    setDescripcion(val);
    debouncedSave({ descripcion: val });
  }}
  onBlur={() => {}}
  readOnly={readOnly}
  placeholder="Escribe una descripción..."
  rows={4}
  style={{ width: '100%', minHeight: 100, maxHeight: 180, padding: '12px 14px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: descripcion ? 'var(--txt)' : 'var(--txt-muted)', fontSize: 13, lineHeight: 1.65, resize: 'none', overflowY: 'auto', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box', cursor: readOnly ? 'default' : 'text' }}
/>
              </FieldBlock>

{((effectiveRequest.templateFormSchema?.length ?? 0) > 0 ||
  (effectiveRequest.templateSchemaSnapshot?.length ?? 0) > 0) && (
  <TemplateFormDataPanel
    formData={formDataLocal}
    schema={effectiveRequest.templateFormSchema ?? []}
    snapshotSchema={effectiveRequest.templateSchemaSnapshot ?? []}
    accentColor="var(--accent)"
    onFieldChange={!readOnly ? handleFormFieldChange : undefined}
  />
)}
              <FieldBlock label="Criterios de aceptación">
                <AcceptanceCriteriaPanel requestId={requestId} readOnly={readOnly} currentUserId={currentUser?.User_ID} />
              </FieldBlock>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
<FieldBlock label="Solicitante">
  {effectiveRequest.isLegacy && !effectiveRequest.solicitante
    ? <TeamChip teamName={effectiveRequest.legacyRequester ?? 'Equipo no especificado'} />
    : <PersonChip
        name={effectiveRequest.solicitante}
        teamName={effectiveRequest.requesterTeamName}
        color="var(--accent-2)"
      />
  }
</FieldBlock>

<FieldBlock label="Resolutor">
  <div ref={assigneeDD.ref} style={{ position: 'relative' }}>
    <button
      onClick={() => { if (!readOnly) { assigneeDD.setOpen((o) => !o); setUserSearch(''); } }}
      style={triggerBase(assigneeDD.open, '124,58,237')}
    >
      {assignedUsers.length === 0
        ? <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1 }}>Sin asignar</span>
        : assignedUsers.map((u) => {
            const p = u.User_Name.split(' ');
            const name = p.length >= 3 ? `${p[0]} ${p[2]}` : u.User_Name;
            return (
              <span key={u.User_ID} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: '#a78bfa', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)' }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials(u.User_Name)}</span>
                {name}
                {!readOnly && (
                  <span
                    onMouseDown={(e) => { e.stopPropagation(); handleToggleAssignee(u.User_ID); }}
                    style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6, fontSize: 13 }}
                  >×</span>
                )}
              </span>
            );
          })
      }
      {!readOnly && <ChevDown size={12} style={{ marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0, transform: assigneeDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />}
    </button>

    {assigneeDD.open && !readOnly && (
      <DropdownPanel>
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
          <input
            autoFocus
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Buscar usuario..."
            style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 5, padding: '5px 8px', fontSize: 11, color: 'var(--txt)', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ maxHeight: 260, overflowY: 'auto' }}>
          {groupedMembers.length === 0 ? (
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>No hay sub-equipos configurados.</div>
          ) : (
            groupedMembers.map(({ subTeam, members, isLoading }) => {
              const filtered = members.filter((u) =>
                u.User_Name.toLowerCase().includes(userSearch.toLowerCase()) ||
                u.User_Email.toLowerCase().includes(userSearch.toLowerCase())
              );
              if (!isLoading && filtered.length === 0 && userSearch) return null;
              return (
                <SubTeamGroup
                  key={subTeam.Sub_Team_ID}
                  subTeam={subTeam}
                  members={filtered}
                  isLoading={isLoading}
                  assigneeIds={assigneeIds}
                  selectedSubIds={selectedSubIds}
onToggleAssignee={(userId) => {
  const isRemoving = assigneeIds.includes(userId);
  handleToggleAssignee(userId);

  if (!isRemoving) {
    // Asignando → agregar sub-equipo si no está, en un solo patch junto con el assign
    if (!selectedSubIds.includes(subTeam.Sub_Team_ID)) {
      handleToggleSubTeam(subTeam.Sub_Team_ID, selectedSubIds, assigneeIds);
    }
  } else {
    // Desasignando → si era el único de este sub-equipo, removerlo
    const othersInSub = members.filter(
      (m) => m.User_ID !== userId && assigneeIds.includes(m.User_ID)
    );
    if (othersInSub.length === 0 && selectedSubIds.includes(subTeam.Sub_Team_ID)) {
      handleToggleSubTeam(subTeam.Sub_Team_ID, selectedSubIds, assigneeIds);
    }
  }
}}
                />
              );
            })
          )}
        </div>
      </DropdownPanel>
    )}
  </div>
</FieldBlock>


                <FieldBlock label="Etiquetas">
                  <div ref={catDD.ref} style={{ position: 'relative' }}>
                    <button onClick={() => { if (!readOnly) { catDD.setOpen((o) => !o); setLabelSearch(''); } }} style={triggerBase(catDD.open, '0,200,255')}>
                      {selectedLabelIds.length === 0
                        ? <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1 }}>Sin etiquetas</span>
                        : labels.filter((l) => selectedLabelIds.includes(l.Label_ID)).map((label) => (
                          <span key={label.Label_ID} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: label.Label_Color, background: `${label.Label_Color}18`, border: `1px solid ${label.Label_Color}35` }}>
                            {label.Label_Icon && <span>{label.Label_Icon}</span>}{label.Label_Name}
                            {!readOnly && <span onMouseDown={(e) => { e.stopPropagation(); handleToggleLabel(label.Label_ID); }} style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6, fontSize: 13 }}>×</span>}
                          </span>
                        ))
                      }
                      {!readOnly && <ChevDown size={12} style={{ marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0, transform: catDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />}
                    </button>
{catDD.open && !readOnly && (
  <DropdownPanel>
    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
        <input
          autoFocus
          value={labelSearch}
          onChange={(e) => setLabelSearch(e.target.value)}
          placeholder="Buscar etiqueta..."
          style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 5, padding: '5px 8px', fontSize: 11, color: 'var(--txt)', outline: 'none', boxSizing: 'border-box' }}
        />
      </div>
      {labels.length === 0
        ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>Sin etiquetas para este equipo.</div>
        : (() => {
            const filtered = labels.filter((l) =>
              l.Label_Name.toLowerCase().includes(labelSearch.toLowerCase())
            ).sort((a, b) => a.Label_Name.localeCompare(b.Label_Name));
            if (filtered.length === 0) return (
              <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic' }}>Sin resultados.</div>
            );
            return filtered.map((label) => {
              const sel = selectedLabelIds.includes(label.Label_ID);
              return (
                <DropdownItem key={label.Label_ID} selected={sel} onClick={() => handleToggleLabel(label.Label_ID)}>
                  {label.Label_Icon && <span style={{ fontSize: 13 }}>{label.Label_Icon}</span>}
                  <span style={{ flex: 1 }}>{label.Label_Name}</span>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: label.Label_Color, flexShrink: 0 }} />
                  {sel && <Checkmark />}
                </DropdownItem>
              );
            });
          })()
        }
    </div>
  </DropdownPanel>
)}
                  </div>
                </FieldBlock>

                <FieldBlock label="Sprint">
                  <div ref={sprintDD.ref} style={{ position: 'relative' }}>
                    <button onClick={() => { if (!readOnly) sprintDD.setOpen((o) => !o); }} style={{ ...triggerBase(sprintDD.open, '162,155,254'), flexWrap: 'nowrap' }}>
                      {selectedSprint
                        ? <><SprintDot sprint={selectedSprint} /><span style={{ fontSize: 12, color: 'var(--txt)', flex: 1, textAlign: 'left' }}>{selectedSprint.Sprint_Text}</span></>
                        : <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1, textAlign: 'left' }}>Sin sprint</span>
                      }
                      {!readOnly && <ChevDown size={12} style={{ color: 'var(--txt-muted)', flexShrink: 0, transform: sprintDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />}
                    </button>
{sprintDD.open && !readOnly && (() => {
                      const now = new Date();
                      const selectables = sprints
                        .filter((sp) => {
                          // Solo activos o futuros: requieren ambas fechas válidas
                          if (!sp.Sprint_Start_Date || !sp.Sprint_End_Date) return false;
                          const end = new Date(sp.Sprint_End_Date);
                          if (Number.isNaN(end.getTime())) return false;
                          return now <= end; // futuro o en curso (descarta pasados)
                        })
                        .sort((a, b) => new Date(a.Sprint_Start_Date!).getTime() - new Date(b.Sprint_Start_Date!).getTime());

                      return (
                        <DropdownPanel>
                          {selectables.length === 0
                            ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>No hay sprints activos ni futuros.</div>
                            : selectables.map((sp) => {
                                const sel      = selectedSprintId === sp.Sprint_ID;
                                const now2     = new Date();
                                const dotColor = now2 >= new Date(sp.Sprint_Start_Date!) && now2 <= new Date(sp.Sprint_End_Date!) ? '#00e5a0' : '#fdcb6e';
                                const fmtD = (iso: string) => { const [y, m, d] = iso.split('T')[0].split('-'); return `${d}/${m}/${y.slice(2)}`; };
                                return (
                                  <DropdownItem key={sp.Sprint_ID} selected={sel} onClick={() => handleSprint(sel ? null : sp.Sprint_ID)}>
                                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                                    <span style={{ flex: 1 }}>{sp.Sprint_Text}</span>
                                    <span style={{ fontSize: 10, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>{fmtD(sp.Sprint_Start_Date!)} → {fmtD(sp.Sprint_End_Date!)}</span>
                                    {sel && <Checkmark />}
                                  </DropdownItem>
                                );
                              })
                          }
                        </DropdownPanel>
                      );
                    })()}
                  </div>
                </FieldBlock>

<FieldBlock label="Prioridad">
  <div ref={priorDD.ref} style={{ position: 'relative' }}>
    <button
      onClick={() => { if (!readOnly) priorDD.setOpen((o) => !o); }}
      style={{
        ...triggerBase(priorDD.open, '0,200,255'),
        flexWrap: 'nowrap',
      }}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: 12, fontWeight: 700, letterSpacing: 0.5,

        color: PRI_COLOR[effectiveRequest.prioridad],
      }}>
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: PRI_COLOR[effectiveRequest.prioridad],
        }} />
        {PRIORIDADES[effectiveRequest.prioridad]}
      </span>
      {!readOnly && (
        <ChevDown size={12} style={{
          marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0,
          transform: priorDD.open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.15s',
        }} />
      )}
    </button>

    {priorDD.open && !readOnly && (
      <DropdownPanel>
        {(Object.entries(PRIORIDADES) as [Prioridad, string][]).map(([pri, label]) => {
          const sel = effectiveRequest.prioridad === pri;
          return (
            <DropdownItem
              key={pri}
              selected={sel}
              onClick={() => {
                update({ id: requestId, patch: { prioridad: pri } });
                priorDD.setOpen(false);
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                background: PRI_COLOR[pri],
              }} />
              <span style={{
                flex: 1, fontSize: 12, fontWeight: 700,
                letterSpacing: 0.5,
                color: PRI_COLOR[pri],
              }}>
                {label}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-display)',
                color: PRI_COLOR[pri], opacity: 0.7,
              }}>
                {PRIORIDAD_TO_SCORE[pri]} pts
              </span>
              {sel && <Checkmark />}
            </DropdownItem>
          );
        })}
      </DropdownPanel>
    )}
  </div>
</FieldBlock>

<FieldBlock label="Puntaje">
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: PRI_COLOR[effectiveRequest.prioridad] }}>{PRIORIDAD_TO_SCORE[effectiveRequest.prioridad]}</span>
    <span style={{ fontSize: 10, color: 'var(--txt-muted)', letterSpacing: 1 }}>pts · basado en prioridad</span>
  </div>
</FieldBlock>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <FieldBlock label="Fecha de apertura">
                  <span style={{ fontSize: 13, color: 'var(--txt)' }}>{fmtColombia(effectiveRequest.fechaApertura)}</span>
                </FieldBlock>
                <FieldBlock label="Horas estimadas">
                  {readOnly
                    ? <span style={{ fontSize: 13, color: effectiveRequest.estimatedHours != null ? 'var(--txt)' : 'var(--txt-muted)' }}>{effectiveRequest.estimatedHours != null ? fmtHours(effectiveRequest.estimatedHours) : 'Sin estimado'}</span>
                    : <HorasInput value={effectiveRequest.estimatedHours} onChange={(val) => update({ id: requestId, patch: { estimatedHours: val } })} />
                  }
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

{!readOnly && (
<TimerOrInputBlock
  requestId={requestId}
  titulo={effectiveRequest.titulo}
  equipo={equipo}
  loggedHours={effectiveRequest.loggedHours}
  onSave={(val) => update({ id: requestId, patch: { loggedHours: val } })}
/>
)}

{!readOnly && (
  <FieldBlock label="Mover a">
          <div ref={moverDD.ref} style={{ position: 'relative' }}>
        {/* Trigger — muestra la columna actual */}
        <button
          onClick={() => moverDD.setOpen((o) => !o)}
          style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '6px 12px', borderRadius: 6, width: '100%',
            border: `1px solid ${moverDD.open ? colorFor(columnaActual) + '60' : colorFor(columnaActual) + '35'}`,
            background: moverDD.open ? `${colorFor(columnaActual)}18` : `${colorFor(columnaActual)}0d`,
            cursor: 'pointer', transition: 'all 0.15s',
          }}
        >
          <span style={{
            width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
            background: colorFor(columnaActual),
          }} />
<span style={{
  flex: 1, fontSize: 12, fontWeight: 700, letterSpacing: 1,
   color: titleColorFor(columnaActual),
  textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
}}>
  {labelFor(columnaActual)}
  <span style={{
    fontSize: 8, fontWeight: 600, letterSpacing: 0.5,
    padding: '1px 5px', borderRadius: 3,
    border: `1px solid ${colorFor(columnaActual)}35`,
    background: `${colorFor(columnaActual)}12`,
    color: titleColorFor(columnaActual), opacity: 0.75,
    textTransform: 'uppercase',
  }}>
    Mover
  </span>
</span>
          <ChevDown size={12} style={{
            color: colorFor(columnaActual), opacity: 0.7, flexShrink: 0,
            transform: moverDD.open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.15s',
          }} />
        </button>

        {moverDD.open && (
          <div style={{
            position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
            zIndex: 200, background: 'var(--bg-panel)',
            border: '1px solid var(--border)', borderRadius: 8,
            boxShadow: '0 -8px 32px rgba(0,0,0,0.4)',
            overflow: 'hidden', minWidth: 180,
          }}>
            <div style={{ padding: '8px 10px', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {columnsForMove.map(({ slug: col, name: label, evidenceRequired }) => {
                const active    = columnaActual === col;
                const showBadge = evidenceRequired && !yaHayClosure;
                const c         = colorFor(col);
                const tc        = titleColorFor(col);
                return (
                  <button
                    key={col}
                    onClick={() => { handleMover(col); if (!evidenceRequired || yaHayClosure) moverDD.setOpen(false); }}
                    style={{
                      padding: '5px 11px', borderRadius: 6,
                      fontSize: 11, fontWeight: 700, letterSpacing: 1,
                      transition: 'all 0.12s',
                      display: 'flex', alignItems: 'center', gap: 5,
                      cursor: active ? 'default' : 'pointer',
                      border: `1px solid ${active ? c + '60' : showBadge ? c + '30' : 'var(--border-subtle)'}`,
                      background: active ? `${c}18` : 'transparent',
                      color: active ? tc : showBadge ? tc + 'cc' : 'var(--txt-muted)',
                    }}
                    onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = c + '55'; e.currentTarget.style.color = tc; e.currentTarget.style.background = `${c}10`; } }}
                    onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = showBadge ? c + '30' : 'var(--border-subtle)'; e.currentTarget.style.color = showBadge ? tc + 'cc' : 'var(--txt-muted)'; e.currentTarget.style.background = 'transparent'; } }}
                  >
                    {showBadge && <CheckCircle size={9} />}{label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

  </FieldBlock>
)}            
</div>

            {/* Panel derecho */}
            <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
                {([
                  { key: 'comments',    label: 'Comentarios', icon: null,                   count: comments.length },
                  { key: 'attachments', label: 'Adjuntos',    icon: <Paperclip size={11} />, count: attachments.length },
                ] as { key: RightTab; label: string; icon: React.ReactNode; count: number }[]).map((tab) => {
                  const active = rightTab === tab.key;
                  return (
                    <button key={tab.key} onClick={() => setRightTab(tab.key)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '12px 8px', fontSize: 11, fontWeight: 700, letterSpacing: 1, background: 'transparent', border: 'none', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, color: active ? 'var(--accent)' : 'var(--txt-muted)', cursor: 'pointer', transition: 'all 0.15s' }}>
                      {tab.icon}{tab.label}
                      {tab.count > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: active ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.06)', color: active ? 'var(--accent)' : 'var(--txt-muted)', border: `1px solid ${active ? 'rgba(0,200,255,0.25)' : 'var(--border-subtle)'}` }}>{tab.count}</span>}
                    </button>
                  );
                })}
              </div>

              {rightTab === 'comments' && (
                <>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {comments.length === 0
                      ? <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.5, paddingTop: 40 }}>
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="var(--txt-muted)" strokeWidth="1.5" fill="none" strokeLinejoin="round" /></svg>
                          <p style={{ fontSize: 11, color: 'var(--txt-muted)', textAlign: 'center', margin: 0 }}>Sin comentarios aún.</p>
                        </div>
                      : comments.map((c) => {
                          const isOwn = c.author?.User_ID === currentUser?.User_ID;
                          return (
                            <div key={c.Comment_ID} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: isOwn ? 'linear-gradient(135deg,#0055cc,#00c8ff)' : 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials(c.author?.User_Name ?? '?')}</div>
                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.author?.User_Name ?? 'Desconocido'}</span>
                                <span style={{ fontSize: 9, color: 'var(--txt-muted)', flexShrink: 0 }}>{fmtRelative(c.Comment_Created_At)}</span>
                                {isOwn && !readOnly && <button onClick={() => deleteComment({ commentId: c.Comment_ID, requestId })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 2, display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0 }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--txt-muted)'; }}><Trash2 size={11} /></button>}
                              </div>
                              <div style={{ marginLeft: 26, fontSize: 12, color: 'var(--txt)', lineHeight: 1.55, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '7px 10px', wordBreak: 'break-word' }}>{c.Comment_Text}</div>
                            </div>
                          );
                        })
                    }
                    <div ref={commentsEndRef} />
                  </div>
                  <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={handleCommentKeyDown} placeholder="Escribe un comentario… (Ctrl+Enter)" rows={2} style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '8px 10px', color: 'var(--txt)', fontSize: 12, resize: 'none', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box', transition: 'border-color 0.15s' }} onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; }} onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }} />
                    <button onClick={handleSendComment} disabled={!commentText.trim() || sendingComment || !currentUser} style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, background: commentText.trim() ? 'var(--accent-2)' : 'var(--bg-surface)', border: `1px solid ${commentText.trim() ? 'transparent' : 'var(--border-subtle)'}`, color: commentText.trim() ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 600, cursor: commentText.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s', fontFamily: 'var(--font-display)' }}>
                      <Send size={11} />{sendingComment ? 'Enviando…' : 'Enviar'}
                    </button>
                  </div>
                </>
              )}

              {rightTab === 'attachments' && (
                <>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {attachments.length === 0 && !dragOver
                      ? <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.5, paddingTop: 40 }}><Paperclip size={26} style={{ color: 'var(--txt-muted)' }} /><p style={{ fontSize: 11, color: 'var(--txt-muted)', textAlign: 'center', margin: 0 }}>Sin adjuntos aún.</p></div>
                      : attachments.map((a) => {
                          const isOwn   = a.uploader?.User_ID === currentUser?.User_ID;
                          const isImage = a.Attachment_Mime_Type.startsWith('image/');
                          return (
                            <div key={a.Attachment_ID} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', transition: 'border-color 0.12s' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.25)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}>
                              {isImage && a.Attachment_Url ? <img src={a.Attachment_Url} alt={a.Attachment_Name} style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-subtle)' }} /> : <div style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>{fileIcon(a.Attachment_Mime_Type)}</div>}
                              <div style={{ flex: 1, minWidth: 0 }}>
                                {a.Attachment_Url ? <a href={a.Attachment_Url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }} onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--txt)'; }}>{a.Attachment_Name}</a> : <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.Attachment_Name}</span>}
                                <div style={{ fontSize: 9, color: 'var(--txt-muted)', display: 'flex', gap: 6, marginTop: 1 }}><span>{fmtBytes(a.Attachment_Size)}</span><span>·</span><span>{fmtRelative(a.Attachment_Created_At)}</span>{a.uploader && <><span>·</span><span>{a.uploader.User_Name.split(' ')[0]}</span></>}</div>
                              </div>
                              {isOwn && !readOnly && <button onClick={() => deleteAttachment({ attachmentId: a.Attachment_ID, requestId })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 3, display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0 }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--txt-muted)'; }}><Trash2 size={11} /></button>}
                            </div>
                          );
                        })
                    }
                  </div>
                  {!readOnly && (
                    <div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={handleDrop} onClick={() => fileInputRef.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '14px 10px', borderRadius: 8, border: `1.5px dashed ${dragOver ? 'var(--accent)' : 'var(--border-subtle)'}`, background: dragOver ? 'rgba(0,200,255,0.06)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
                        <Upload size={15} style={{ color: dragOver ? 'var(--accent)' : 'var(--txt-muted)' }} />
                        <span style={{ fontSize: 10, color: dragOver ? 'var(--accent)' : 'var(--txt-muted)', textAlign: 'center', lineHeight: 1.4 }}>{uploading ? 'Subiendo…' : 'Arrastra archivos o haz clic para subir'}</span>
                      </div>
                      <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => handleUploadFiles(e.target.files)} />
                    </div>
                  )}
                </>
              )}
</div>
          </div>
          </div>
        </div>
      </div>
      {showDeleteConfirm && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(59,130,246,0.04)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 210,
        }}>
          <div style={{
            background: 'var(--bg-panel)', border: '1px solid rgba(255,71,87,0.35)',
            borderRadius: 12, padding: '24px 28px', width: 380,
            display: 'flex', flexDirection: 'column', gap: 16,
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
              background: 'linear-gradient(90deg, transparent, var(--danger), transparent)' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Trash2 size={17} style={{ color: 'var(--danger)' }} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--font-display)' }}>
                  Eliminar solicitud
                </div>
                <div style={{ fontSize: 11, color: 'var(--txt-muted)', marginTop: 2 }}>
                  Esta acción no se puede deshacer
                </div>
              </div>
            </div>

            <p style={{ margin: 0, fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.65 }}>
              Se eliminarán permanentemente la solicitud <strong style={{ color: 'var(--txt)' }}>"{effectiveRequest.titulo}"</strong>, junto con sus comentarios, adjuntos, criterios y asignaciones.
            </p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; e.currentTarget.style.color = 'var(--txt)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--txt-muted)'; }}
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 600, border: '1px solid rgba(255,71,87,0.45)', background: 'rgba(255,71,87,0.15)', color: 'var(--danger)', cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-body)', transition: 'all 0.15s', opacity: deleting ? 0.6 : 1 }}
                onMouseEnter={(e) => { if (!deleting) e.currentTarget.style.background = 'rgba(255,71,87,0.28)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,71,87,0.15)'; }}
              >
                {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingClosureCol && (
        <ClosureModal
          request={effectiveRequest}
          targetColumna={pendingClosureCol}
          targetColumnId={pendingClosureColId}
          canReuseEvidence={pendingSourceReqEv}
          previousClosure={effectiveRequest.cierreInfo}
          onConfirm={handleClosureFromModal}
          onCancel={() => { setPendingClosureCol(null); setPendingSourceReqEv(false); }}
          isPending={false}
        />
      )}
    </>
  );
}

/* ─── Primitivos ────────────────────────────────────────────── */
function SubTeamGroup({ subTeam, members, isLoading, assigneeIds, selectedSubIds, onToggleAssignee }: {
  subTeam:        { Sub_Team_ID: number; Sub_Team_Name: string; Sub_Team_Color: string };
  members:        SubTeamMember[];
  isLoading:      boolean;
  assigneeIds:    number[];
  selectedSubIds: number[];
  onToggleAssignee: (userId: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const hasAssigned = members.some((m) => assigneeIds.includes(m.User_ID));
  const isSubAssigned = selectedSubIds.includes(subTeam.Sub_Team_ID);

  return (
    <div>
      {/* Header del sub-equipo */}
      <div
        onClick={() => setCollapsed((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)', userSelect: 'none' }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,200,255,0.04)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-surface)'; }}
      >
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: subTeam.Sub_Team_Color, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: isSubAssigned ? subTeam.Sub_Team_Color : 'var(--txt)', letterSpacing: 0.3 }}>
          {subTeam.Sub_Team_Name}
        </span>
        {hasAssigned && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: `${subTeam.Sub_Team_Color}20`, color: subTeam.Sub_Team_Color, border: `1px solid ${subTeam.Sub_Team_Color}40` }}>
            asignado
          </span>
        )}
        <svg width="9" height="9" viewBox="0 0 8 8" fill="none" style={{ color: 'var(--txt-muted)', flexShrink: 0, transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>

      {/* Miembros */}
      {!collapsed && (
        <div>
          {isLoading && (
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)', opacity: 0.6 }}>Cargando…</div>
          )}
          {!isLoading && members.length === 0 && (
            <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic' }}>Sin integrantes.</div>
          )}
          {members.map((u) => {
            const sel = assigneeIds.includes(u.User_ID);
            return (
              <DropdownItem key={u.User_ID} selected={sel} onClick={() => onToggleAssignee(u.User_ID)}>
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: sel ? `linear-gradient(135deg,${subTeam.Sub_Team_Color},${subTeam.Sub_Team_Color}99)` : 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'white', flexShrink: 0 }}>
                  {initials(u.User_Name)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: sel ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Name}</div>
                  <div style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Email}</div>
                </div>
                {sel && <Checkmark />}
              </DropdownItem>
            );
          })}
        </div>
      )}
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

function TemplateFormDataPanel({ formData, schema, snapshotSchema, onFieldChange }: {
  formData:        Record<string, unknown>;
  schema:          unknown[];
  snapshotSchema?: unknown[];
  accentColor:     string;
  onFieldChange?:  (key: string, value: unknown) => void;
}) {
  // ── Tipos internos ──────────────────────────────────────────────────────────
type FlatField = {
    key:         string;
    label:       string;
    guards:      { parentKey: string; requiredValue: string }[];
    showInModal: boolean;
    fieldType?:  string;
    options?:    string[];
  };

    const savedLabels: Record<string, string> = (() => {
    try { return JSON.parse(formData['__labels'] as string ?? '{}'); }
    catch { return {}; }
  })();
  // ── flattenSchemaDeep ───────────────────────────────────────────────────────
  // Aplana el schema completo, acumulando la cadena de guards padre → hijo.
  // Fix del bug: antes solo se registraba 1 nivel de condicional. Ahora cada
  // campo condicional agrega su guard a TODOS sus descendientes, sin importar
  // cuántos niveles de profundidad haya.
// Colecta TODOS los keys del schema (para excluirlos de orphans si son invisibles)
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

function collectVisibleLevel(fields: unknown[]): FlatField[] {
  const result: FlatField[] = [];

  for (const f of fields) {
    const field = f as Record<string, unknown>;
    if (!field.key) continue;
    const showInModal = (field.showInModal as boolean | undefined) ?? true;

    if (field.type === 'conditional') {
      // Mostrar el campo condicional en sí solo si showInModal: true
      if (showInModal && field.label) {
        result.push({ key: field.key as string, label: field.label as string, guards: [], showInModal, fieldType: 'conditional' });
      }
      // SIEMPRE explorar la rama activa (independientemente de showInModal del padre)
      // para recolectar hijos que sí sean visibles
      const val = formData[field.key as string];
      const effective = (val === undefined || val === null || val === '') ? 'false' : String(val);
      const activeBranch = effective === 'true'
        ? (field.trueBranch as unknown[]) ?? []
        : (field.falseBranch as unknown[]) ?? [];
      result.push(...collectVisibleLevel(activeBranch));
    } else {
      if (showInModal && field.label) {
        result.push({
          key:       field.key as string,
          label:     field.label as string,
          guards:    [],
          showInModal,
          fieldType: field.type as string | undefined,
          options:   Array.isArray(field.options) ? field.options as string[] : undefined,
        });
      }
    }
  }
  return result;
}

const schemaFields  = collectVisibleLevel(schema);
const allLiveKeys   = collectAllKeys(schema);

// Lookup del snapshot para recuperar label+showInModal de keys huérfanos
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

const snapshotMeta = collectAllWithMeta(snapshotSchema ?? []);

const orphanFields: FlatField[] = Object.keys(formData)
  .filter((k) => !allLiveKeys.has(k) && k !== '__labels')
  .map((k) => {
    const snap = snapshotMeta.get(k);
    const showInModal = snap?.showInModal ?? true;
    const label = snap?.label
      ?? savedLabels[k]
      ?? k.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    return { key: k, label, guards: [], showInModal };
  })
  .filter((f) => f.showInModal); // respetar showInModal del snapshot

  const entries = [...schemaFields, ...orphanFields].filter(({ key, showInModal }) => {
  if (key === '__labels') return false;
  if (!showInModal) return false;
  const val = formData[key];
  if (val === 'true' || val === 'false') return true;
  return val !== undefined && val !== '' && val !== null;
});
  if (entries.length === 0) return null;

  // ── Renderizado del valor ───────────────────────────────────────────────────
  function renderValue(key: string): React.ReactNode {
    const val = formData[key];
    if (val === undefined || val === null) return <span style={{ color: 'var(--danger)' }}>No</span>;
    if (val === 'true')  return <span style={{ color: 'var(--success)', fontWeight: 600 }}>Sí</span>;
    if (val === 'false') return <span style={{ color: 'var(--danger)' }}>No</span>;
    // Respetar saltos de línea (campos textarea, datos migrados multilínea)
    return <span style={{ color: 'var(--txt)', whiteSpace: 'pre-wrap' }}>{String(val)}</span>;
  }

function renderEditor(key: string, fieldType?: string, options?: string[]): React.ReactNode {
    // Orphan (sin fieldType) o tipo no soportado → solo lectura
    if (!fieldType) return renderValue(key);

    const val     = formData[key];
    const current = val !== undefined && val !== null ? String(val) : '';

    /* ── Condicional → Sí / No ── */
    if (fieldType === 'conditional') {
      return (
        <div style={{ display: 'flex', gap: 6 }}>
          {(['true', 'false'] as const).map((v) => (
            <button
              key={v}
              onClick={() => onFieldChange!(key, v)}
              style={{
                padding: '4px 12px', borderRadius: 5, fontSize: 11, fontWeight: 700,
                cursor: 'pointer', transition: 'all 0.12s', fontFamily: 'var(--font-body)',
                border: `1px solid ${current === v
                  ? (v === 'true' ? 'rgba(0,229,160,0.5)' : 'rgba(255,71,87,0.5)')
                  : 'var(--border-subtle)'}`,
                background: current === v
                  ? (v === 'true' ? 'rgba(0,229,160,0.12)' : 'rgba(255,71,87,0.1)')
                  : 'transparent',
                color: current === v
                  ? (v === 'true' ? 'var(--success)' : 'var(--danger)')
                  : 'var(--txt-muted)',
              }}
            >
              {v === 'true' ? 'Sí' : 'No'}
            </button>
          ))}
        </div>
      );
    }

    /* ── Radio → select con las opciones del schema ── */
    if (fieldType === 'radio') {
      if (!options || options.length === 0) return renderValue(key); // sin opciones → solo lectura
      return (
        <select
          value={current}
          onChange={(e) => onFieldChange!(key, e.target.value)}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; }}
          onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
          style={{
            width: '100%', padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
            color: current ? 'var(--txt)' : 'var(--txt-muted)',
            fontSize: 12, cursor: 'pointer', outline: 'none',
            fontFamily: 'var(--font-body)', boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
        >
          {!current && <option value="" disabled>Seleccionar…</option>}
          {options.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );
    }

    /* ── Text → input libre ── */
    if (fieldType === 'text') {
      return (
        <input
          type="text"
          defaultValue={current}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
            const newVal = e.target.value;
            if (newVal !== current) onFieldChange!(key, newVal);
          }}
          style={{
            width: '100%', padding: '6px 10px', borderRadius: 6,
            border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
            color: 'var(--txt)', fontSize: 12, outline: 'none',
            fontFamily: 'var(--font-body)', boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
        />
      );
    }

    /* ── Tipo no reconocido → solo lectura ── */
    return renderValue(key);
  }

  return (
    <div>
<div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
  {entries.map(({ key, label, fieldType, options }) => (
    <div key={key} style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: '6px 16px', alignItems: 'start', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)' }}>
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: 'var(--txt-muted)', lineHeight: 1.5, paddingTop: 1 }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, wordBreak: 'break-word', lineHeight: 1.6, color: 'var(--txt)' }}>
        {onFieldChange ? renderEditor(key, fieldType, options) : renderValue(key)}
      </span>
    </div>
  ))}
</div>
    </div>
  );
}


function DividirTooltip() {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <div onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)} style={{ width: 16, height: 16, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, cursor: 'default', border: `1px solid ${visible ? 'rgba(0,200,255,0.55)' : 'rgba(0,200,255,0.35)'}`, color: visible ? 'var(--accent)' : 'rgba(0,200,255,0.7)', background: visible ? 'rgba(0,200,255,0.15)' : 'rgba(0,200,255,0.07)', userSelect: 'none', flexShrink: 0, transition: 'all 0.15s' }}>?</div>
      {visible && (
        <div style={{ position: 'absolute', top: 'calc(100% + 7px)', left: '50%', transform: 'translateX(-50%)', zIndex: 400, background: 'var(--bg-panel)', border: '1px solid rgba(0,200,255,0.25)', borderRadius: 8, padding: '10px 13px', width: 230, boxShadow: '0 10px 30px rgba(0,0,0,0.55)', pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', top: -5, left: '50%', transform: 'translateX(-50%) rotate(45deg)', width: 8, height: 8, background: 'var(--bg-panel)', borderLeft: '1px solid rgba(0,200,255,0.25)', borderTop: '1px solid rgba(0,200,255,0.25)' }} />
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 6 }}>¿Qué es dividir?</div>
          <div style={{ fontSize: 11, color: 'var(--txt-muted)', lineHeight: 1.65 }}>Divide esta solicitud en <strong style={{ color: 'var(--txt)' }}>sub-solicitudes</strong> más pequeñas, cada una con su propio estado y resolutor. El progreso se consolida aquí.</div>
        </div>
      )}
    </div>
  );
}

function HorasInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  const toHrs  = (v: number | null) => v != null ? String(Math.floor(v)) : '';
  const toMins = (v: number | null) => v != null ? String(Math.round((v % 1) * 60)) : '';
  const [hrs,  setHrs]  = useState<string>(toHrs(value));
  const [mins, setMins] = useState<string>(toMins(value));
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setHrs(toHrs(value)); setMins(toMins(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function scheduleCommit(h: string, m: string) {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      const hVal = parseInt(h) || 0;
      const mVal = Math.min(59, parseInt(m) || 0);
      if (h === '' && m === '') { onChange(null); return; }
      onChange(parseFloat((hVal + mVal / 60).toFixed(4)));
    }, 150); // 150ms — suficiente para que el foco salte al otro input
  }

  const inputStyle: React.CSSProperties = {
    width: 52, padding: '6px 8px', borderRadius: 6,
    border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)',
    color: 'var(--txt)', fontSize: 14, fontWeight: 600,
    fontFamily: 'var(--font-display)', outline: 'none',
    textAlign: 'center', boxSizing: 'border-box', transition: 'border-color 0.15s',
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number" min={0} max={999} placeholder="0"
        value={hrs}
        onChange={(e) => setHrs(e.target.value)}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-subtle)';
          scheduleCommit(hrs, mins);
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)';
          if (commitTimer.current) clearTimeout(commitTimer.current); // cancelar si volvemos
        }}
        style={inputStyle}
      />
      <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>h</span>
      <input
        type="number" min={0} max={59} placeholder="00"
        value={mins}
        onChange={(e) => setMins(e.target.value)}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = 'var(--border-subtle)';
          const m2 = String(Math.min(59, parseInt(mins) || 0));
          setMins(m2);
          scheduleCommit(hrs, m2);
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)';
          if (commitTimer.current) clearTimeout(commitTimer.current); // cancelar si volvemos
        }}
        style={inputStyle}
      />
      <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>m</span>
    </div>
  );
}

function DropdownPanel({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflowY: 'auto', maxHeight: 260, minWidth: 180 }}>{children}</div>;
}

function DropdownItem({ children, selected, onClick }: { children: React.ReactNode; selected: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer', background: hover ? 'rgba(0,200,255,0.06)' : selected ? 'rgba(0,200,255,0.04)' : 'transparent', color: selected ? 'var(--txt)' : 'var(--txt-muted)', fontWeight: selected ? 600 : 400, transition: 'background 0.1s' }}>{children}</div>;
}

function Checkmark() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M1.5 5.5l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SprintDot({ sprint }: { sprint: { Sprint_Start_Date: string; Sprint_End_Date: string } }) {
  const now = new Date(); const start = new Date(sprint.Sprint_Start_Date); const end = new Date(sprint.Sprint_End_Date);
  const color = now >= start && now <= end ? '#00e5a0' : now > end ? '#b2bec3' : '#fdcb6e';
  return <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--txt-muted)', marginBottom: 8 }}>{children}</span>;
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}

function PersonChip({ name, teamName}: { name: string; teamName?: string | null; color: string }) {
  const ini = name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', minHeight: 32, borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxSizing: 'border-box' }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg, #0055cc, #00c8ff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', flexShrink: 0 }}>{ini}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        <span style={{ fontSize: 12, color: 'var(--txt)', fontWeight: 600, lineHeight: 1.2 }}>{name}</span>
        {teamName && <span style={{ fontSize: 9, color: 'var(--txt-muted)',  letterSpacing: 0.5, fontWeight: 600 }}>{teamName}</span>}
      </div>
    </div>
  );
}

/* ─── TimerOrInputBlock ─────────────────────────────────── */
function TimerOrInputBlock({
  requestId, titulo, equipo, loggedHours, onSave,
}: {
  requestId:   string;
  titulo:      string;
  equipo:      Equipo;
  loggedHours: number | null;
  onSave:      (val: number | null) => void;
}) {
  const [mode, setMode] = useState<'timer' | 'input'>('timer');

  const entry      = useTimerStore((s) => s.entries[requestId]);
  const start      = useTimerStore((s) => s.start);
  const pause      = useTimerStore((s) => s.pause);
  const resetTimer = useTimerStore((s) => s.reset);
  const surface    = useTimerStore((s) => s.surface);

  // Al abrir un ticket que ya tiene cronómetro (p. ej. ocultado con la X),
  // el widget flotante reaparece mostrando su progreso.
  useEffect(() => {
    if (entry) surface(requestId);
  }, [requestId]); // eslint-disable-line react-hooks/exhaustive-deps
  
  const running = !!entry?.startedAt;

  // tick solo para refrescar la UI; el valor real se deriva de timestamps
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const elapsedMs = (entry?.accumulatedMs ?? 0) + (entry?.startedAt ? Date.now() - entry.startedAt : 0);
  const seconds   = Math.floor(elapsedMs / 1000);

  const fmt = (s: number) =>
    [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map((v) => String(v).padStart(2, '0')).join(':');

  function handleToggle() {
    if (running) pause(requestId);
    else start(requestId, { titulo, equipo });
  }

  function handleSave() {
    const totalHours = parseFloat((seconds / 3600).toFixed(4));
    if (totalHours <= 0) { resetTimer(requestId); return; }
    const combined = parseFloat(((loggedHours ?? 0) + totalHours).toFixed(4));
    onSave(combined);
    resetTimer(requestId);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Toggle modo */}
      <div style={{ display: 'flex', gap: 0, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, overflow: 'hidden', alignSelf: 'flex-start' }}>
        {(['timer', 'input'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            style={{
              padding: '4px 14px', fontSize: 10, fontWeight: 700, letterSpacing: 0.8,
              border: 'none', cursor: 'pointer',
              background: mode === m ? 'var(--accent-2)' : 'transparent',
              color:      mode === m ? 'white' : 'var(--txt-muted)',
              transition: 'all 0.15s', fontFamily: 'var(--font-display)',
            }}
          >
            {m === 'timer' ? '⏱ Cronómetro' : '✏ Manual'}
          </button>
        ))}
      </div>

      {/* Horas ya guardadas */}
      {loggedHours != null && loggedHours > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(0,229,160,0.06)', border: '1px solid rgba(0,229,160,0.2)' }}>
          <CheckCircle size={12} style={{ color: 'var(--success)', flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>
            {fmtHours(loggedHours)} registradas
          </span>
          <button
            onClick={() => onSave(null)}
            title="Borrar horas registradas"
            style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', fontSize: 11, padding: '1px 4px', opacity: 0.6 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.opacity = '1'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--txt-muted)'; e.currentTarget.style.opacity = '0.6'; }}
          >×</button>
        </div>
      )}

      {/* Modo cronómetro */}
      {mode === 'timer' && (
        <div style={{
          background: 'var(--bg-surface)',
          border: `1px solid ${running ? 'rgba(0,200,255,0.3)' : 'var(--border-subtle)'}`,
          borderRadius: 8, padding: '14px 16px',
          display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.2s',
        }}>
          <Clock size={16} style={{ color: running ? 'var(--accent)' : 'var(--txt-muted)', flexShrink: 0 }} />
          <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 600, letterSpacing: 2, minWidth: 90, color: running ? 'var(--accent)' : 'var(--txt)' }}>
            {fmt(seconds)}
          </span>
          {!running && seconds > 0 && (
            <span style={{ fontSize: 10, color: 'var(--txt-muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>En pausa</span>
          )}
          <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
            <button onClick={handleToggle} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: running ? 'rgba(255,71,87,0.15)' : 'rgba(0,200,255,0.15)', color: running ? 'var(--danger)' : 'var(--accent)', fontFamily: 'var(--font-display)', letterSpacing: 0.5 }}>
              {running ? 'Pausar' : seconds > 0 ? 'Reanudar' : 'Iniciar'}
            </button>
            {seconds > 0 && (
              <button onClick={handleSave} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: 'rgba(0,229,160,0.15)', color: 'var(--success)', fontFamily: 'var(--font-display)', letterSpacing: 0.5 }}>
                Guardar
              </button>
            )}
          </div>
        </div>
      )}

      {/* Modo input manual */}
      {mode === 'input' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <HorasInput
            value={loggedHours}
            onChange={(val) => onSave(val)}
          />
          <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>horas totales consumidas</span>
        </div>
      )}
    </div>
  );
}
function TeamChip({ teamName }: { teamName: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', minHeight: 32, borderRadius: 6, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', boxSizing: 'border-box' }}>
      <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg, #6b7280, #9ca3af)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Users size={11} color="white" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0 }}>
        <span style={{ fontSize: 12, color: 'var(--txt)', fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{teamName}</span>
        <span style={{ fontSize: 9, color: 'var(--txt-muted)', letterSpacing: 0.5, fontWeight: 600, textTransform: 'uppercase' }}>Solicitud migrada</span>
      </div>
    </div>
  );
}