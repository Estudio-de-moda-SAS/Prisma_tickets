import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, ChevronUp, ChevronDown, Clock, ChevronDown as ChevDown, Send, Trash2, Paperclip, Upload, FileText, Image, File, GitFork, Plus, ExternalLink } from 'lucide-react';
import { useMoveRequest } from '../hooks/useMoveRequests';
import { useUpdateRequest } from '../hooks/UseUpdateRequest';
import { KANBAN_COLUMNAS, PRIORIDADES } from '../types';
import type { Request, KanbanColumna, Prioridad, Equipo } from '../types';
import { useLabelsByTeamId } from '@/features/requests/hooks/useBoardMetadata';
import { useSubTeams } from '@/features/requests/hooks/useSubTeams';
import { useSprints } from '@/features/requests/hooks/useSprints';
import { useUsers, useAssignRequest, useUnassignRequest } from '@/features/requests/hooks/useUsers';
import { useComments, useCreateComment, useDeleteComment } from '@/features/requests/hooks/useComments';
import { useAttachments, useUploadAttachment, useDeleteAttachment } from '@/features/requests/hooks/useAttachments';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useColumnMap } from '@/features/requests/hooks/useColumnMap';
import { useChildRequests } from '@/features/requests/hooks/useSubRequest';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { CreateRequestModal } from './CreateRequestModal';
import { config } from '@/config';

const PUNTAJE: Record<Prioridad, number> = { baja: 1, media: 3, alta: 5, critica: 8 };

const COL_COLOR: Record<KanbanColumna, string> = {
  sin_categorizar: 'var(--txt-muted)',
  icebox:          '#60a5fa',
  backlog:         'var(--info)',
  todo:            'var(--warn)',
  en_progreso:     'var(--accent)',
  hecho:           'var(--success)',
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
  const date = new Date(isoString);
  const diff = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diff < 60)    return 'hace un momento';
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

function useTimer(requestId: string) {
  const key = `timer:${requestId}`;
  const saved = (() => {
    try { return JSON.parse(sessionStorage.getItem(key) ?? '{}'); }
    catch { return {}; }
  })();

  const [seconds,   setSeconds]   = useState<number>(saved.seconds ?? 0);
  const [running,   setRunning]   = useState(false);
  const [completed, setCompleted] = useState<boolean>(saved.completed ?? false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSeconds((s) => {
        const n = s + 1;
        sessionStorage.setItem(key, JSON.stringify({ seconds: n, completed }));
        return n;
      }), 1000);
    } else if (ref.current) {
      clearInterval(ref.current);
    }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running, completed, key]);

  const fmt = (s: number) =>
    [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map((v) => String(v).padStart(2, '0')).join(':');

  return {
    seconds, running, completed, fmt,
    toggle:   () => { if (!completed) setRunning((r) => !r); },
    complete: () => {
      setRunning(false); setCompleted(true);
      sessionStorage.setItem(key, JSON.stringify({ seconds, completed: true }));
    },
  };
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
  request:        Request;
  equipo:         Equipo;
  onClose:        () => void;
  onMove:         (id: string, columna: KanbanColumna) => void;
  onOpenRequest?: (requestId: string) => void;
  readOnly?:      boolean;
};

type RightTab = 'comments' | 'attachments';

/* ══════════════════════════════════════════════════════════════
   Sub-requests panel
   ══════════════════════════════════════════════════════════════ */
function SubRequestsPanel({
  parentId,
  parentTitle,
  onOpenChild,
}: {
  parentId:    number;
  parentTitle: string;
  onOpenChild: (requestId: string) => void;
}) {
  const { data: children = [], isLoading, refetch } = useChildRequests(parentId);
  const [showCreate, setShowCreate] = useState(false);

  const completed = children.filter((r) => r.columna === 'hecho').length;
  const total     = children.length;
  const pct       = total === 0 ? 0 : Math.round((completed / total) * 100);

  const colColorMap: Record<string, string> = {
    sin_categorizar: 'var(--txt-muted)',
    icebox:          '#60a5fa',
    backlog:         'var(--info)',
    todo:            'var(--warn)',
    en_progreso:     'var(--accent)',
    hecho:           'var(--success)',
  };

  const colLabel: Record<string, string> = {
    sin_categorizar: 'Sin cat.',
    icebox:          'Icebox',
    backlog:         'Backlog',
    todo:            'To do',
    en_progreso:     'En progreso',
    hecho:           'Hecho',
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
          {!isLoading && children.length === 0 && (
            <div style={{ padding: '8px 0 4px', fontSize: 11, color: 'var(--txt-muted)', opacity: 0.55, fontStyle: 'italic' }}>Sin sub-solicitudes aún.</div>
          )}
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
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, color: colColor, background: `${colColor}15`, border: `1px solid ${colColor}30`, flexShrink: 0 }}>
                  {colLabel[child.columna] ?? child.columna}
                </span>
                <ExternalLink size={10} style={{ color: 'var(--txt-muted)', flexShrink: 0, opacity: 0.4 }} />
              </div>
            );
          })}
        </div>

        <button onClick={() => setShowCreate(true)}
          style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 7, border: '1px dashed var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer', transition: 'all 0.15s', fontFamily: 'var(--font-body)', width: '100%' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--txt-muted)'; }}
        >
          <Plus size={12} />
          Nueva sub-solicitud
        </button>
      </div>

      {showCreate && (
        <CreateRequestModal
          parentId={parentId}
          parentTitle={parentTitle}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); void refetch(); }}
        />
      )}
    </>
  );
}

/* ══════════════════════════════════════════════════════════════
   Modal principal
   ══════════════════════════════════════════════════════════════ */
export function RequestModal({ request, equipo, onClose, onMove, onOpenRequest, readOnly = false }: Props) {
  const { Requests }     = useGraphServices();
  const { mutate: mover }    = useMoveRequest(equipo);
  const { mutate: update }   = useUpdateRequest(equipo);
  const { mutate: assign }   = useAssignRequest();
  const { mutate: unassign } = useUnassignRequest();
  const { mutate: createComment, isPending: sendingComment } = useCreateComment();
  const { mutate: deleteComment }  = useDeleteComment();
  const { mutate: uploadAttachment, isPending: uploading } = useUploadAttachment();
  const { mutate: deleteAttachment } = useDeleteAttachment();
  const { data: currentUser }  = useCurrentUser();
  const timer                  = useTimer(request.id);
  const overlayRef             = useRef<HTMLDivElement>(null);
  const commentsEndRef         = useRef<HTMLDivElement>(null);
  const fileInputRef           = useRef<HTMLInputElement>(null);
  const boardId                = config.DEFAULT_BOARD_ID;
  const columnMap              = useColumnMap(boardId);
  const requestIdNum           = Number(request.id);
  const boardTeamId            = request.boardTeamId ?? null;
  const isSubRequest           = request.parentId !== null;

  const { data: subTeams    = [] } = useSubTeams(boardTeamId);
  const { data: labels      = [] } = useLabelsByTeamId(boardId, boardTeamId);
  const { data: sprints     = [] } = useSprints();
  const { data: users       = [] } = useUsers();
  const { data: comments    = [] } = useComments(requestIdNum);
  const { data: attachments = [] } = useAttachments(requestIdNum);
  const { data: children    = [] } = useChildRequests(requestIdNum);

  const { data: parentRequest } = useQuery<Request>({
    queryKey: ['request', request.parentId],
    queryFn:  () => Requests.fetchById(request.parentId!),
    enabled:  isSubRequest && !config.USE_MOCK,
    staleTime: 30_000,
  });

  const catDD      = useDropdown();
  const subDD      = useDropdown();
  const sprintDD   = useDropdown();
  const assigneeDD = useDropdown();

  const [rightTab,         setRightTab]         = useState<RightTab>('comments');
  const [showSubRequests,  setShowSubRequests]  = useState(false);
  const [columnaActual,    setColumnaActual]    = useState<KanbanColumna>(request.columna);
  const [descripcion,      setDescripcion]      = useState(request.descripcion ?? '');
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>(request.labelIds ?? []);
  const [selectedSubIds,   setSelectedSubIds]   = useState<number[]>(request.subTeamIds ?? []);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(request.sprintId ?? null);
  const [assigneeIds,      setAssigneeIds]      = useState<number[]>(request.assignees?.map((a) => a.userId) ?? []);
  const [userSearch,       setUserSearch]       = useState('');
  const [commentText,      setCommentText]      = useState('');
  const [dragOver,         setDragOver]         = useState(false);

  useEffect(() => {
    setDescripcion(request.descripcion ?? '');
    setSelectedLabelIds(request.labelIds ?? []);
    setSelectedSubIds(request.subTeamIds ?? []);
    setSelectedSprintId(request.sprintId ?? null);
    setAssigneeIds(request.assignees?.map((a) => a.userId) ?? []);
  }, [request.id]);

  useEffect(() => {
    commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments.length]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  // Handlers — todos bloqueados en readOnly
  function handleMover(columna: KanbanColumna) {
    if (readOnly || columnaActual === columna) return;
    setColumnaActual(columna);
    mover(
      { id: request.id, columna, columnId: columnMap?.[columna] },
      { onSuccess: () => onMove(request.id, columna) },
    );
  }

  function handleToggleLabel(labelId: number) {
    if (readOnly) return;
    const next = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((l) => l !== labelId)
      : [...selectedLabelIds, labelId];
    setSelectedLabelIds(next);
    update({ id: request.id, patch: { labelIds: next } });
  }

  function handleToggleSubTeam(subId: number) {
    if (readOnly) return;
    const next = selectedSubIds.includes(subId)
      ? selectedSubIds.filter((s) => s !== subId)
      : [...selectedSubIds, subId];
    setSelectedSubIds(next);
    update({ id: request.id, patch: { subTeamIds: next } });
  }

  function handleSprint(sprintId: number | null) {
    if (readOnly) return;
    setSelectedSprintId(sprintId);
    update({ id: request.id, patch: { sprintId } });
    sprintDD.setOpen(false);
  }

  function handleToggleAssignee(userId: number) {
    if (readOnly) return;
    const isAssigned = assigneeIds.includes(userId);
    if (isAssigned) {
      setAssigneeIds((prev) => prev.filter((id) => id !== userId));
      unassign({ requestId: requestIdNum, userId });
    } else {
      setAssigneeIds((prev) => [...prev, userId]);
      assign({ requestId: requestIdNum, userId });
    }
  }

  function handleSendComment() {
    const text = commentText.trim();
    if (!text || !currentUser) return;
    createComment(
      { requestId: requestIdNum, userId: currentUser.User_ID, text },
      { onSuccess: () => setCommentText('') },
    );
  }

  function handleCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (readOnly) return;
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleSendComment();
    }
  }

  function handleUploadFiles(files: FileList | null) {
    if (readOnly || !files || !currentUser) return;
    Array.from(files).forEach((file) => {
      uploadAttachment({ requestId: requestIdNum, userId: currentUser.User_ID, file });
    });
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!readOnly) handleUploadFiles(e.dataTransfer.files);
  }

  const triggerBase = (open: boolean, accentRgb: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    minHeight: 32, width: '100%', padding: '4px 8px', borderRadius: 6,
    border: `1px solid ${open ? `rgba(${accentRgb},0.45)` : 'var(--border-subtle)'}`,
    background: open ? `rgba(${accentRgb},0.07)` : 'transparent',
    // En readOnly no mostramos cursor pointer en dropdowns
    cursor: readOnly ? 'default' : 'pointer',
    transition: 'border-color 0.15s, background 0.15s', textAlign: 'left',
  });

  const selectedSprint = sprints.find((s) => s.Sprint_ID === selectedSprintId) ?? null;
  const assignedUsers  = users.filter((u) => assigneeIds.includes(u.User_ID));
  const filteredUsers  = users.filter((u) =>
    u.User_Name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.User_Email.toLowerCase().includes(userSearch.toLowerCase()),
  );

  const childCount = children.length;
  const childDone  = children.filter((r) => r.columna === 'hecho').length;

  function fmtColombia(isoString: string) {
    return new Date(isoString).toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  // zIndex más alto cuando es readOnly (apilado encima)
  const zIndex = readOnly ? 110 : 100;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex, padding: 24 }}
    >
      <div style={{ width: '100%', maxWidth: 900, maxHeight: '90vh', background: 'var(--bg-panel)', border: `1px solid ${isSubRequest ? 'rgba(167,139,250,0.35)' : 'var(--border)'}`, borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: isSubRequest ? 'linear-gradient(90deg, transparent, #a78bfa, transparent)' : 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {[ChevronUp, ChevronDown].map((Icon, i) => (
              <button key={i} style={{ width: 26, height: 26, borderRadius: 5, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', cursor: 'not-allowed', opacity: 0.4 }}>
                <Icon size={13} />
              </button>
            ))}
          </div>

          {/* Badge solo lectura */}
          {readOnly && (
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 4, color: 'var(--txt-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              Solo lectura
            </span>
          )}

          {isSubRequest && !readOnly && (
            <span
              onClick={() => { if (onOpenRequest && request.parentId) onOpenRequest(String(request.parentId)); }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 4, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)', cursor: onOpenRequest ? 'pointer' : 'default' }}
            >
              <GitFork size={10} />
              Sub-solicitud
            </span>
          )}

          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 4, color: COL_COLOR[columnaActual], background: `${COL_COLOR[columnaActual]}15`, border: `1px solid ${COL_COLOR[columnaActual]}35` }}>
            {KANBAN_COLUMNAS[columnaActual]}
          </span>

          {!isSubRequest && !readOnly && (
            <button
              onClick={() => setShowSubRequests((v) => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', border: `1px solid ${showSubRequests ? 'rgba(0,200,255,0.45)' : 'var(--border-subtle)'}`, background: showSubRequests ? 'rgba(0,200,255,0.1)' : 'transparent', color: showSubRequests ? 'var(--accent)' : 'var(--txt-muted)', cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { if (!showSubRequests) { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.3)'; e.currentTarget.style.color = 'var(--accent)'; }}}
              onMouseLeave={(e) => { if (!showSubRequests) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--txt-muted)'; }}}
            >
              <GitFork size={11} />
              Dividir
              {childCount > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: showSubRequests ? 'rgba(0,200,255,0.18)' : 'rgba(255,255,255,0.07)', color: showSubRequests ? 'var(--accent)' : 'var(--txt-muted)', border: `1px solid ${showSubRequests ? 'rgba(0,200,255,0.3)' : 'var(--border-subtle)'}` }}>
                  {childDone}/{childCount}
                </span>
              )}
            </button>
          )}

          <div style={{ marginLeft: 'auto' }}>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Panel sub-requests expandible */}
        {showSubRequests && !isSubRequest && !readOnly && (
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--border-subtle)', background: 'rgba(0,200,255,0.02)', flexShrink: 0, maxHeight: 360, overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <GitFork size={13} style={{ color: 'var(--accent)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--accent)' }}>Sub-solicitudes</span>
              <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>— cada una es una solicitud independiente en el board</span>
            </div>
            <SubRequestsPanel
              parentId={requestIdNum}
              parentTitle={request.titulo}
              onOpenChild={(childId) => onOpenRequest?.(childId)}
            />
          </div>
        )}

        {/* Cuerpo */}
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
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, color: COL_COLOR[parentRequest.columna], background: `${COL_COLOR[parentRequest.columna]}15`, border: `1px solid ${COL_COLOR[parentRequest.columna]}30`, flexShrink: 0 }}>
                          {KANBAN_COLUMNAS[parentRequest.columna]}
                        </span>
                      </div>
                      <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>Solicitante: {parentRequest.solicitante}</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--txt-muted)', fontStyle: 'italic' }}>
                      {config.USE_MOCK ? `Solicitud #${request.parentId}` : 'Cargando…'}
                    </span>
                  )}
                </div>
                {onOpenRequest && (
                  <button
                    onClick={() => onOpenRequest(String(request.parentId))}
                    style={{ fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 5, border: '1px solid rgba(167,139,250,0.3)', background: 'rgba(167,139,250,0.08)', color: '#a78bfa', cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s', whiteSpace: 'nowrap' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(167,139,250,0.18)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(167,139,250,0.08)'; }}
                  >
                    Ver detalles →
                  </button>
                )}
              </div>
            )}

            <div>
              <FieldLabel>Nombre de la solicitud</FieldLabel>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--txt)', lineHeight: 1.35, margin: 0 }}>{request.titulo}</h2>
            </div>

            <FieldBlock label="Descripción">
              <textarea
                value={descripcion}
                onChange={(e) => { if (!readOnly) setDescripcion(e.target.value); }}
                onBlur={() => { if (!readOnly) update({ id: request.id, patch: { descripcion } }); }}
                readOnly={readOnly}
                placeholder="Escribe una descripción..."
                rows={4}
                style={{ width: '100%', minHeight: 100, maxHeight: 180, padding: '12px 14px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: descripcion ? 'var(--txt)' : 'var(--txt-muted)', fontSize: 13, lineHeight: 1.65, resize: 'none', overflowY: 'auto', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box', cursor: readOnly ? 'default' : 'text' }}
              />
            </FieldBlock>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

              <FieldBlock label="Solicitante">
                <PersonChip name={request.solicitante} color="var(--accent-2)" />
              </FieldBlock>

              <FieldBlock label="Resolutor">
                <div ref={assigneeDD.ref} style={{ position: 'relative' }}>
                  <button
                    onClick={() => { if (!readOnly) { assigneeDD.setOpen((o) => !o); setUserSearch(''); } }}
                    style={triggerBase(assigneeDD.open, '124,58,237')}
                  >
                    {assignedUsers.length === 0
                      ? <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1 }}>Sin asignar</span>
                      : assignedUsers.map((u) => (
                          <span key={u.User_ID} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: '#a78bfa', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)' }}>
                            <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials(u.User_Name)}</span>
                            {u.User_Name.split(' ')[0]}
                            {!readOnly && <span onMouseDown={(e) => { e.stopPropagation(); handleToggleAssignee(u.User_ID); }} style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6, fontSize: 13 }}>×</span>}
                          </span>
                        ))}
                    {!readOnly && <ChevDown size={12} style={{ marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0, transform: assigneeDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />}
                  </button>
                  {assigneeDD.open && !readOnly && (
                    <DropdownPanel>
                      <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                        <input autoFocus value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Buscar usuario..." style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 5, padding: '5px 8px', fontSize: 11, color: 'var(--txt)', outline: 'none', boxSizing: 'border-box' }} />
                      </div>
                      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {filteredUsers.length === 0
                          ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>Sin resultados.</div>
                          : filteredUsers.map((u) => {
                              const sel = assigneeIds.includes(u.User_ID);
                              return (
                                <DropdownItem key={u.User_ID} selected={sel} onClick={() => handleToggleAssignee(u.User_ID)}>
                                  <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials(u.User_Name)}</div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 12, fontWeight: sel ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Name}</div>
                                    <div style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Email}</div>
                                  </div>
                                  {sel && <Checkmark />}
                                </DropdownItem>
                              );
                            })}
                      </div>
                    </DropdownPanel>
                  )}
                </div>
              </FieldBlock>

              <FieldBlock label="Prioridad">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '5px 12px', borderRadius: 5, color: PRI_COLOR[request.prioridad], background: `${PRI_COLOR[request.prioridad]}15`, border: `1px solid ${PRI_COLOR[request.prioridad]}35` }}>
                  {PRIORIDADES[request.prioridad]}
                </span>
              </FieldBlock>

              <FieldBlock label="Equipo">
                <div ref={subDD.ref} style={{ position: 'relative' }}>
                  <button onClick={() => { if (!readOnly) subDD.setOpen((o) => !o); }} style={triggerBase(subDD.open, '0,200,255')}>
                    {selectedSubIds.length === 0
                      ? <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1 }}>Sin equipo</span>
                      : selectedSubIds.map((sid) => {
                          const sub = subTeams.find((s) => s.Sub_Team_ID === sid);
                          if (!sub) return null;
                          return (
                            <span key={sid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: sub.Sub_Team_Color, background: `${sub.Sub_Team_Color}18`, border: `1px solid ${sub.Sub_Team_Color}35` }}>
                              {sub.Sub_Team_Name}
                              {!readOnly && <span onMouseDown={(e) => { e.stopPropagation(); handleToggleSubTeam(sid); }} style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6, fontSize: 13 }}>×</span>}
                            </span>
                          );
                        })}
                    {!readOnly && <ChevDown size={12} style={{ marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0, transform: subDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />}
                  </button>
                  {subDD.open && !readOnly && (
                    <DropdownPanel>
                      {subTeams.length === 0
                        ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>No hay equipos configurados.</div>
                        : subTeams.map((sub) => {
                            const sel = selectedSubIds.includes(sub.Sub_Team_ID);
                            return (
                              <DropdownItem key={sub.Sub_Team_ID} selected={sel} onClick={() => handleToggleSubTeam(sub.Sub_Team_ID)}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: sub.Sub_Team_Color, flexShrink: 0 }} />
                                <span style={{ flex: 1 }}>{sub.Sub_Team_Name}</span>
                                {sel && <Checkmark />}
                              </DropdownItem>
                            );
                          })}
                    </DropdownPanel>
                  )}
                </div>
              </FieldBlock>

              <FieldBlock label="Etiquetas">
                <div ref={catDD.ref} style={{ position: 'relative' }}>
                  <button onClick={() => { if (!readOnly) catDD.setOpen((o) => !o); }} style={triggerBase(catDD.open, '0,200,255')}>
                    {selectedLabelIds.length === 0
                      ? <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1 }}>Sin etiquetas</span>
                      : labels.filter((l) => selectedLabelIds.includes(l.Label_ID)).map((label) => (
                          <span key={label.Label_ID} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: label.Label_Color, background: `${label.Label_Color}18`, border: `1px solid ${label.Label_Color}35` }}>
                            {label.Label_Icon && <span>{label.Label_Icon}</span>}
                            {label.Label_Name}
                            {!readOnly && <span onMouseDown={(e) => { e.stopPropagation(); handleToggleLabel(label.Label_ID); }} style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6, fontSize: 13 }}>×</span>}
                          </span>
                        ))}
                    {!readOnly && <ChevDown size={12} style={{ marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0, transform: catDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />}
                  </button>
                  {catDD.open && !readOnly && (
                    <DropdownPanel>
                      {labels.length === 0
                        ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>Sin etiquetas para este equipo.</div>
                        : labels.map((label) => {
                            const sel = selectedLabelIds.includes(label.Label_ID);
                            return (
                              <DropdownItem key={label.Label_ID} selected={sel} onClick={() => handleToggleLabel(label.Label_ID)}>
                                {label.Label_Icon && <span style={{ fontSize: 13 }}>{label.Label_Icon}</span>}
                                <span style={{ flex: 1 }}>{label.Label_Name}</span>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: label.Label_Color, flexShrink: 0 }} />
                                {sel && <Checkmark />}
                              </DropdownItem>
                            );
                          })}
                    </DropdownPanel>
                  )}
                </div>
              </FieldBlock>

              <FieldBlock label="Sprint">
                <div ref={sprintDD.ref} style={{ position: 'relative' }}>
                  <button onClick={() => { if (!readOnly) sprintDD.setOpen((o) => !o); }} style={{ ...triggerBase(sprintDD.open, '162,155,254'), flexWrap: 'nowrap' }}>
                    {selectedSprint
                      ? <><SprintDot sprint={selectedSprint} /><span style={{ fontSize: 12, color: 'var(--txt)', flex: 1, textAlign: 'left' }}>{selectedSprint.Sprint_Text}</span></>
                      : <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1, textAlign: 'left' }}>Sin sprint</span>}
                    {!readOnly && <ChevDown size={12} style={{ color: 'var(--txt-muted)', flexShrink: 0, transform: sprintDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />}
                  </button>
                  {sprintDD.open && !readOnly && (
                    <DropdownPanel>
                      {sprints.length === 0
                        ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>No hay sprints.</div>
                        : [...sprints]
                            .sort((a, b) => new Date(b.Sprint_Start_Date).getTime() - new Date(a.Sprint_Start_Date).getTime())
                            .map((sp) => {
                              const sel = selectedSprintId === sp.Sprint_ID;
                              const now = new Date();
                              const dotColor = now >= new Date(sp.Sprint_Start_Date) && now <= new Date(sp.Sprint_End_Date) ? '#00e5a0' : now > new Date(sp.Sprint_End_Date) ? '#b2bec3' : '#fdcb6e';
                              const fmtD = (iso: string) => { const [y, m, d] = iso.split('T')[0].split('-'); return `${d}/${m}/${y.slice(2)}`; };
                              return (
                                <DropdownItem key={sp.Sprint_ID} selected={sel} onClick={() => handleSprint(sel ? null : sp.Sprint_ID)}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                                  <span style={{ flex: 1 }}>{sp.Sprint_Text}</span>
                                  <span style={{ fontSize: 10, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>{fmtD(sp.Sprint_Start_Date)} → {fmtD(sp.Sprint_End_Date)}</span>
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
                  <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: PRI_COLOR[request.prioridad] }}>{PUNTAJE[request.prioridad]}</span>
                  <span style={{ fontSize: 10, color: 'var(--txt-muted)', letterSpacing: 1 }}>pts · basado en prioridad</span>
                </div>
              </FieldBlock>
            </div>

{/* Fechas */}
<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
  <FieldBlock label="Fecha de apertura">
    <span style={{ fontSize: 13, color: 'var(--txt)' }}>{fmtColombia(request.fechaApertura)}</span>
  </FieldBlock>

  <FieldBlock label="Fecha límite">
    {readOnly ? (
      <span style={{ fontSize: 13, color: request.deadline ? 'var(--warn)' : 'var(--txt-muted)' }}>
        {request.deadline ? fmtColombia(request.deadline) : 'Sin fecha límite'}
      </span>
    ) : (
      <input
        type="date"
        defaultValue={request.deadline ? request.deadline.split('T')[0] : ''}
        onChange={(e) => {
          update({
            id: request.id,
            patch: { deadline: e.target.value ? e.target.value + 'T00:00:00' : null },
          });
        }}
        style={{
          width: '100%', padding: '5px 10px', borderRadius: 6,
          border: '1px solid var(--border-subtle)',
background: 'transparent',
          color: 'var(--warn)',
          fontSize: 12, outline: 'none',
          fontFamily: 'var(--font-body)', boxSizing: 'border-box',
          cursor: 'pointer', height: 34,
        }}
      />
    )}
  </FieldBlock>
</div>
            {/* Timer — oculto en readOnly */}
            {!readOnly && (
              <FieldBlock label="Contador de tiempo">
                <div style={{ background: 'var(--bg-surface)', border: `1px solid ${timer.running ? 'rgba(0,200,255,0.3)' : timer.completed ? 'rgba(0,229,160,0.3)' : 'var(--border-subtle)'}`, borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.2s' }}>
                  <Clock size={16} style={{ color: timer.completed ? 'var(--success)' : timer.running ? 'var(--accent)' : 'var(--txt-muted)', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 600, letterSpacing: 2, minWidth: 90, color: timer.completed ? 'var(--success)' : timer.running ? 'var(--accent)' : 'var(--txt)' }}>{timer.fmt(timer.seconds)}</span>
                  {timer.completed && <span style={{ fontSize: 10, color: 'var(--success)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>Completado</span>}
                  <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                    {!timer.completed && (
                      <button onClick={timer.toggle} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: timer.running ? 'rgba(255,71,87,0.15)' : 'rgba(0,200,255,0.15)', color: timer.running ? 'var(--danger)' : 'var(--accent)', fontFamily: 'var(--font-display)', letterSpacing: 0.5 }}>
                        {timer.running ? 'Pausar' : timer.seconds > 0 ? 'Reanudar' : 'Iniciar'}
                      </button>
                    )}
                    {!timer.running && timer.seconds > 0 && !timer.completed && (
                      <button onClick={timer.complete} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: 'rgba(0,229,160,0.15)', color: 'var(--success)', fontFamily: 'var(--font-display)', letterSpacing: 0.5 }}>
                        Completar
                      </button>
                    )}
                  </div>
                </div>
              </FieldBlock>
            )}

            {/* Mover columna — oculto en readOnly */}
            {!readOnly && (
              <FieldBlock label="Mover a">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {(Object.entries(KANBAN_COLUMNAS) as [KanbanColumna, string][]).map(([col, label]) => {
                    const active = columnaActual === col;
                    return (
                      <button key={col} onClick={() => handleMover(col)}
                        style={{ padding: '6px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', border: `1px solid ${active ? COL_COLOR[col] + '60' : 'var(--border-subtle)'}`, background: active ? `${COL_COLOR[col]}15` : 'transparent', color: active ? COL_COLOR[col] : 'var(--txt-muted)', cursor: active ? 'default' : 'pointer', transition: 'all 0.12s' }}
                        onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = COL_COLOR[col] + '50'; e.currentTarget.style.color = COL_COLOR[col]; }}}
                        onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--txt-muted)'; }}}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </FieldBlock>
            )}
          </div>

          {/* Panel derecho */}
          <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ display: 'flex', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
              {([
                { key: 'comments',    label: 'Comentarios', icon: null,                    count: comments.length    },
                { key: 'attachments', label: 'Adjuntos',    icon: <Paperclip size={11} />, count: attachments.length },
              ] as { key: RightTab; label: string; icon: React.ReactNode; count: number }[]).map((tab) => {
                const active = rightTab === tab.key;
                return (
                  <button key={tab.key} onClick={() => setRightTab(tab.key)}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '12px 8px', fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', background: 'transparent', border: 'none', borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`, color: active ? 'var(--accent)' : 'var(--txt-muted)', cursor: 'pointer', transition: 'all 0.15s' }}
                  >
                    {tab.icon}{tab.label}
                    {tab.count > 0 && (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 10, background: active ? 'rgba(0,200,255,0.15)' : 'rgba(255,255,255,0.06)', color: active ? 'var(--accent)' : 'var(--txt-muted)', border: `1px solid ${active ? 'rgba(0,200,255,0.25)' : 'var(--border-subtle)'}` }}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {rightTab === 'comments' && (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {comments.length === 0 ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.5, paddingTop: 40 }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="var(--txt-muted)" strokeWidth="1.5" fill="none" strokeLinejoin="round" /></svg>
                      <p style={{ fontSize: 11, color: 'var(--txt-muted)', textAlign: 'center', margin: 0 }}>Sin comentarios aún.</p>
                    </div>
                  ) : (
                    comments.map((c) => {
                      const isOwn = c.author?.User_ID === currentUser?.User_ID;
                      return (
                        <div key={c.Comment_ID} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 20, height: 20, borderRadius: '50%', background: isOwn ? 'linear-gradient(135deg,#0055cc,#00c8ff)' : 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials(c.author?.User_Name ?? '?')}</div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.author?.User_Name ?? 'Desconocido'}</span>
                            <span style={{ fontSize: 9, color: 'var(--txt-muted)', flexShrink: 0 }}>{fmtRelative(c.Comment_Created_At)}</span>
                            {isOwn && !readOnly && (
                              <button onClick={() => deleteComment({ commentId: c.Comment_ID, requestId: requestIdNum })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 2, display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0 }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--txt-muted)'; }}>
                                <Trash2 size={11} />
                              </button>
                            )}
                          </div>
                          <div style={{ marginLeft: 26, fontSize: 12, color: 'var(--txt)', lineHeight: 1.55, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '7px 10px', wordBreak: 'break-word' }}>{c.Comment_Text}</div>
                        </div>
                      );
                    })
                  )}
                  <div ref={commentsEndRef} />
                </div>
<div style={{ padding: '10px 14px', borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
  <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} onKeyDown={handleCommentKeyDown} placeholder="Escribe un comentario… (Ctrl+Enter)" rows={2} style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '8px 10px', color: 'var(--txt)', fontSize: 12, resize: 'none', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box', transition: 'border-color 0.15s' }} onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; }} onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }} />
  <button onClick={handleSendComment} disabled={!commentText.trim() || sendingComment || !currentUser} style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, background: commentText.trim() ? 'var(--accent-2)' : 'var(--bg-surface)', border: `1px solid ${commentText.trim() ? 'transparent' : 'var(--border-subtle)'}`, color: commentText.trim() ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 600, cursor: commentText.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s', fontFamily: 'var(--font-display)' }}>
    <Send size={11} />{sendingComment ? 'Enviando…' : 'Enviar'}
  </button>
</div>              </>
            )}

            {rightTab === 'attachments' && (
              <>
                <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {attachments.length === 0 && !dragOver ? (
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: 0.5, paddingTop: 40 }}>
                      <Paperclip size={26} style={{ color: 'var(--txt-muted)' }} />
                      <p style={{ fontSize: 11, color: 'var(--txt-muted)', textAlign: 'center', margin: 0 }}>Sin adjuntos aún.</p>
                    </div>
                  ) : (
                    attachments.map((a) => {
                      const isOwn   = a.uploader?.User_ID === currentUser?.User_ID;
                      const isImage = a.Attachment_Mime_Type.startsWith('image/');
                      return (
                        <div key={a.Attachment_ID} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', transition: 'border-color 0.12s' }} onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.25)'; }} onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}>
                          {isImage ? <img src={a.Attachment_Url} alt={a.Attachment_Name} style={{ width: 32, height: 32, borderRadius: 4, objectFit: 'cover', flexShrink: 0, border: '1px solid var(--border-subtle)' }} /> : <div style={{ width: 32, height: 32, borderRadius: 6, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>{fileIcon(a.Attachment_Mime_Type)}</div>}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <a href={a.Attachment_Url} target="_blank" rel="noopener noreferrer" style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }} onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }} onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--txt)'; }}>{a.Attachment_Name}</a>
                            <div style={{ fontSize: 9, color: 'var(--txt-muted)', display: 'flex', gap: 6, marginTop: 1 }}>
                              <span>{fmtBytes(a.Attachment_Size)}</span><span>·</span><span>{fmtRelative(a.Attachment_Created_At)}</span>
                              {a.uploader && <><span>·</span><span>{a.uploader.User_Name.split(' ')[0]}</span></>}
                            </div>
                          </div>
                          {isOwn && !readOnly && <button onClick={() => deleteAttachment({ attachmentId: a.Attachment_ID, requestId: requestIdNum })} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 3, display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0 }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--txt-muted)'; }}><Trash2 size={11} /></button>}
                        </div>
                      );
                    })
                  )}
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
  );
}

/* ── Primitivos ── */
function DropdownPanel({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden', minWidth: 180 }}>{children}</div>;
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
  return <span style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 8 }}>{children}</span>;
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}

function PersonChip({ name, color }: { name: string; color: string }) {
  const ini = name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg, ${color}, ${color}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>{ini}</div>
      <span style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{name}</span>
    </div>
  );
}