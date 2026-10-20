// src/features/requests/components/TransferTicketModal.tsx
import { useMemo, useState } from 'react';
import { X, ArrowRightLeft, ArrowRight, Users, Search, Check, Loader2 } from 'lucide-react';
import { useBoardTeams, type BoardTeam } from '@/features/requests/hooks/useBoardMetadata';
import { useDepartments } from '@/features/requests/hooks/useDepartments';
import { config } from '@/config';
import React from 'react';

/* ============================================================
   TransferTicketModal — UI genérica para transferir un ticket
   (solicitud PRISMA o ticket SOLVI) a otro equipo de cualquier área.
   Solo presentación: entrega el borrador a `onConfirm`; quien lo
   monta ejecuta la transferencia (hook `useTransferTicket`).
   ============================================================ */

export type TransferTicketDraft = {
  toTeamId: number;
  reason: string;
  notify: boolean;
};

export function TransferTicketModal({
  ticketLabel,
  ticketTitle,
  currentTeamId = null,
  currentIntegrationKey,
  currentLabel,
  submitting = false,
  error = null,
  onClose,
  onConfirm,
}: {
  /** Identificador visible del ticket, p. ej. `#123`. */
  ticketLabel: string;
  ticketTitle: string;
  /** `Board_Team_ID` del equipo que atiende hoy el ticket; se excluye de los destinos. */
  currentTeamId?: number | null;
  /** Alternativa a `currentTeamId` para equipos de integración (p. ej. `solvi`). */
  currentIntegrationKey?: string;
  /** Texto del origen si no se encuentra el equipo. */
  currentLabel?: string;
  /** Deshabilita el panel mientras se ejecuta la transferencia. */
  submitting?: boolean;
  /** Mensaje de error de la última transferencia. */
  error?: string | null;
  onClose: () => void;
  onConfirm: (draft: TransferTicketDraft) => void;
}) {
  const { data: boardTeams = [], isLoading } = useBoardTeams(config.DEFAULT_BOARD_ID);
  const { data: departments = [] }           = useDepartments();
  const [query, setQuery]       = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const [reason, setReason]     = useState('');
  const [notify, setNotify]     = useState(true);

  const deptName = useMemo(() => {
    const names = new Map(departments.map((d) => [d.Department_ID, d.Department_Name]));
    return (t: BoardTeam) =>
      t.department?.Department_Name ?? (t.Department_ID != null ? names.get(t.Department_ID) : undefined) ?? 'Sin área';
  }, [departments]);

  const activeTeams = useMemo(() => boardTeams.filter((t) => t.Board_Team_Is_Active), [boardTeams]);

  const currentTeam = activeTeams.find((t) =>
    currentTeamId != null
      ? t.Board_Team_ID === currentTeamId
      : !!currentIntegrationKey && t.Board_Team_Integration_Key === currentIntegrationKey,
  ) ?? null;
  const targetTeam  = activeTeams.find((t) => t.Board_Team_ID === selected) ?? null;

  const current = currentTeam ? { teamName: currentTeam.Board_Team_Name, deptName: deptName(currentTeam) } : null;
  const target  = targetTeam  ? { teamName: targetTeam.Board_Team_Name,  deptName: deptName(targetTeam) }  : null;

  // Equipos agrupados por área y filtrados por búsqueda (coincide por equipo o por área).
  const groups = useMemo(() => {
    const q = query.toLowerCase().trim();
    const byDept = new Map<string, BoardTeam[]>();
    [...activeTeams]
      .sort((a, b) => a.Board_Team_Sort_Order - b.Board_Team_Sort_Order)
      .forEach((t) => {
        if (t.Board_Team_ID === currentTeam?.Board_Team_ID) return;
        const dept = deptName(t);
        if (q && !dept.toLowerCase().includes(q) && !t.Board_Team_Name.toLowerCase().includes(q)) return;
        byDept.set(dept, [...(byDept.get(dept) ?? []), t]);
      });
    return [...byDept.entries()].map(([dept, teams]) => ({ dept, teams }));
  }, [activeTeams, currentTeam, deptName, query]);

  const canConfirm = selected != null && reason.trim().length > 0 && !submitting;

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(2px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 540, maxHeight: '90vh', display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 12, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.45)', position: 'relative' }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', pointerEvents: 'none' }} />

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(0,200,255,0.10)', border: '1px solid rgba(0,200,255,0.30)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent)', flexShrink: 0 }}>
              <ArrowRightLeft size={15} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--txt)' }}>Transferir a otro equipo</span>
              <span style={{ fontSize: 11, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {ticketLabel} · {ticketTitle || '—'}
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Origen → destino */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10 }}>
            <TeamPill label="Equipo actual" name={current?.teamName ?? currentLabel ?? 'Sin equipo'} sub={current?.deptName} muted />
            <ArrowRight size={16} style={{ color: 'var(--txt-muted)' }} />
            <TeamPill label="Nuevo equipo" name={target?.teamName ?? 'Selecciona…'} sub={target?.deptName} highlight={!!target} muted={!target} />
          </div>

          {/* Selector de equipo, agrupado por área */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Label>Equipo destino</Label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 32, padding: '0 10px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
              <Search size={13} style={{ color: 'var(--txt-muted)', flexShrink: 0 }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar equipo o área…"
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--txt)', fontSize: 12 }}
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: 240, overflowY: 'auto', paddingRight: 2 }}>
              {isLoading && <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>Cargando equipos…</span>}
              {!isLoading && groups.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--txt-muted)', fontStyle: 'italic' }}>No hay equipos que coincidan.</span>
              )}
              {groups.map(({ dept, teams }) => (
                <div key={dept} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-muted)' }}>{dept}</span>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                    {teams.map((t) => {
                      const active = t.Board_Team_ID === selected;
                      return (
                        <button
                          key={t.Board_Team_ID}
                          onClick={() => setSelected(t.Board_Team_ID)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 8, border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`, background: active ? 'rgba(0,200,255,0.08)' : 'var(--bg-surface)', color: active ? 'var(--accent)' : 'var(--txt)', cursor: 'pointer', fontSize: 12, fontWeight: 600, textAlign: 'left', transition: 'all .15s' }}
                        >
                          <Users size={13} style={{ flexShrink: 0, opacity: active ? 1 : 0.6 }} />
                          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.Board_Team_Name}</span>
                          {active && <Check size={13} style={{ flexShrink: 0 }} />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Motivo */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Label>Motivo de la transferencia</Label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explica por qué este ticket debe atenderlo otro equipo…"
              style={{ resize: 'vertical', minHeight: 70, padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 12, lineHeight: 1.5, fontFamily: 'inherit', outline: 'none' }}
            />
          </div>

          {/* Notificar */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--txt)', cursor: 'pointer', userSelect: 'none' }}>
            <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
            Notificar al solicitante y al nuevo equipo
          </label>

          {error && (
            <div style={{ fontSize: 11, color: 'var(--danger)', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)', borderRadius: 6, padding: '8px 10px', wordBreak: 'break-word' }}>
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, padding: '12px 18px', borderTop: '1px solid var(--border-subtle)', flexShrink: 0 }}>
          <button
            onClick={onClose}
            style={{ height: 32, padding: '0 14px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
          >
            Cancelar
          </button>
          <button
            onClick={() => canConfirm && onConfirm({ toTeamId: selected!, reason: reason.trim(), notify })}
            disabled={!canConfirm}
            style={{ display: 'flex', alignItems: 'center', gap: 7, height: 32, padding: '0 14px', borderRadius: 7, border: '1px solid var(--accent)', background: 'rgba(0,200,255,0.12)', color: 'var(--accent)', cursor: canConfirm ? 'pointer' : 'default', fontSize: 12, fontWeight: 700, opacity: canConfirm ? 1 : 0.45, transition: 'all .15s' }}
          >
            {submitting ? <Loader2 size={14} className="solvi-spin" /> : <ArrowRightLeft size={14} />}
            {submitting ? 'Transfiriendo…' : 'Transferir ticket'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--txt-muted)' }}>{children}</span>;
}

function TeamPill({ label, name, sub, highlight, muted }: { label: string; name: string; sub?: string; highlight?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, padding: '10px 12px', borderRadius: 8, border: `1px solid ${highlight ? 'rgba(0,200,255,0.35)' : 'var(--border-subtle)'}`, background: highlight ? 'rgba(0,200,255,0.06)' : 'var(--bg-surface)' }}>
      <Label>{label}</Label>
      <span style={{ fontSize: 13, fontWeight: 600, color: highlight ? 'var(--accent)' : muted ? 'var(--txt-muted)' : 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
      {sub && <span style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
    </div>
  );
}
