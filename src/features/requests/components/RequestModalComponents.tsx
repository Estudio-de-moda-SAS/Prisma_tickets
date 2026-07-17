import React, { useState, useEffect, useRef } from 'react';
import type { SubTeamMember } from '@/features/requests/hooks/useSubTeamMembers';
import { useTimerStore } from '@/store/timerStore';
import {
CheckCircle, Clock, Users, FileText, Image, File, Plus, Trash2
} from 'lucide-react';
import type { Equipo } from '../types';
import { useAcceptanceCriteria, useUpdateCriteriaStatus, useCreateCriteria, useDeleteCriteria, useUpdateCriteriaTitle } from '@/features/requests/hooks/useAcceptanceCriteria';
import type { AcceptanceCriteria } from '@/types/commons';

export function initials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
}

export function fmtRelative(isoString: string) {
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

export function fmtBytes(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function fmtHours(h: number): string {
  const hrs  = Math.floor(h);
  const mins = Math.round((h % 1) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

export function fileIcon(mime: string) {
  if (mime.startsWith('image/')) return <Image size={13} />;
  if (mime === 'application/pdf' || mime.includes('text')) return <FileText size={13} />;
  return <File size={13} />;
}

export function useDropdown() {
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

/* ─── AcceptanceCriteriaPanel ──────────────────────────────── */
export function AcceptanceCriteriaPanel({
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

/* ─── Primitivos ────────────────────────────────────────────── */
export function SubTeamGroup({ subTeam, members, isLoading, assigneeIds, selectedSubIds, onToggleAssignee }: {
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
export function CopyLinkButton({ ticketId }: { ticketId: string }) {
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

export function TemplateFormDataPanel({ formData, schema, snapshotSchema, onFieldChange }: {
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


export function DividirTooltip() {
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

export function HorasInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
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

export function DropdownPanel({ children }: { children: React.ReactNode }) {
  return <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 200, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflowY: 'auto', maxHeight: 260, minWidth: 180 }}>{children}</div>;
}

export function DropdownItem({ children, selected, onClick }: { children: React.ReactNode; selected: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer', background: hover ? 'rgba(0,200,255,0.06)' : selected ? 'rgba(0,200,255,0.04)' : 'transparent', color: selected ? 'var(--txt)' : 'var(--txt-muted)', fontWeight: selected ? 600 : 400, transition: 'background 0.1s' }}>{children}</div>;
}

export function Checkmark() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M1.5 5.5l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

export function SprintDot({ sprint }: { sprint: { Sprint_Start_Date: string; Sprint_End_Date: string } }) {
  const now = new Date(); const start = new Date(sprint.Sprint_Start_Date); const end = new Date(sprint.Sprint_End_Date);
  const color = now >= start && now <= end ? '#00e5a0' : now > end ? '#b2bec3' : '#fdcb6e';
  return <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'block', fontSize: 10, fontWeight: 700, letterSpacing: 1, color: 'var(--txt-muted)', marginBottom: 8 }}>{children}</span>;
}

export function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}

export function PersonChip({ name, teamName}: { name: string; teamName?: string | null; color: string }) {
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
export function TimerOrInputBlock({
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
export function TeamChip({ teamName }: { teamName: string }) {
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