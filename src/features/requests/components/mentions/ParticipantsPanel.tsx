// src/features/requests/components/mentions/ParticipantsPanel.tsx
import { useMemo, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Users, X } from 'lucide-react';
import type { AppUser } from '@/features/requests/hooks/useUsers';
import { shortName } from '@/features/requests/lib/mentions';

const ini = (n: string) => { const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase(); };


type Role = 'solicitante' | 'resolutor' | 'mencionado';
// key: userId si existe, o un id sintético (ej. "solvi-sol") para filas solo-texto
type Row = { key: string; userId: number | null; name: string; role: Role; canRevoke: boolean };
type Assignee = { userId: number; userName: string };
type GenericParticipant = { User_ID: number; User_Name?: string };

// Persona "extra" que puede o no tener User_ID (solicitante/resolutor SOLVI)
export type ExtraPerson = { userId: number | null; name: string; role: 'solicitante' | 'resolutor' };

type Props = {
  participants:  GenericParticipant[];
  solicitanteId?: number;
  solicitante?:   string;
  assignees?:     Assignee[];
  extraPeople?:   ExtraPerson[];   // ← para SOLVI: solicitante/resolutor resueltos o texto
  allUsers:      AppUser[];
  canRevoke:     boolean;
  onRevoke:      (userId: number) => void;
  revokingId?:   number | null;
};

const ROLE_META: Record<Role, { label: string; color: string }> = {
  solicitante: { label: 'Solicitante', color: 'var(--accent-2)' },
  resolutor:   { label: 'Resolutor',   color: '#00c8ff' },
  mencionado:  { label: 'Mencionado',  color: '#a78bfa' },
};

type TipState = { name: string; role: Role; x: number; y: number } | null;

export function ParticipantsPanel({
  participants, solicitanteId, solicitante, assignees = [], extraPeople = [], allUsers, canRevoke, onRevoke, revokingId = null,
}: Props) {
  const [tip, setTip] = useState<TipState>(null);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);

  const rows = useMemo<Row[]>(() => {
    const map = new Map<string, Row>();
    const seenUserIds = new Set<number>();

    // 1. Solicitante PRISMA (por User_ID)
    if (solicitanteId) {
      map.set(`u${solicitanteId}`, { key: `u${solicitanteId}`, userId: solicitanteId, name: solicitante || `Usuario ${solicitanteId}`, role: 'solicitante', canRevoke: false });
      seenUserIds.add(solicitanteId);
    }
    // 2. Resolutores PRISMA (por User_ID)
    for (const a of assignees) {
      if (!seenUserIds.has(a.userId)) {
        map.set(`u${a.userId}`, { key: `u${a.userId}`, userId: a.userId, name: a.userName, role: 'resolutor', canRevoke: false });
        seenUserIds.add(a.userId);
      }
    }
    // 3. Extra people (SOLVI): pueden tener userId (matcheó correo) o no (solo texto)
    for (const p of extraPeople) {
      if (p.userId != null) {
        if (seenUserIds.has(p.userId)) continue;
        seenUserIds.add(p.userId);
        map.set(`u${p.userId}`, { key: `u${p.userId}`, userId: p.userId, name: p.name, role: p.role, canRevoke: false });
      } else {
        // sin User_ID → fila solo-texto, key sintético por rol
        map.set(`x-${p.role}`, { key: `x-${p.role}`, userId: null, name: p.name, role: p.role, canRevoke: false });
      }
    }
    // 4. Mencionados
    for (const p of participants) {
      if (seenUserIds.has(p.User_ID)) continue;
      seenUserIds.add(p.User_ID);
      const u = allUsers.find((x) => x.User_ID === p.User_ID);
      map.set(`u${p.User_ID}`, { key: `u${p.User_ID}`, userId: p.User_ID, name: u?.User_Name ?? p.User_Name ?? `Usuario ${p.User_ID}`, role: 'mencionado', canRevoke: true });
    }

    const order: Record<Role, number> = { solicitante: 0, resolutor: 1, mencionado: 2 };
    return [...map.values()].sort((a, b) => order[a.role] - order[b.role]);
  }, [participants, solicitanteId, solicitante, assignees, extraPeople, allUsers]);

  if (rows.length === 0) return null;

  const enter = (e: React.MouseEvent, r: Row) => {
    setHoveredKey(r.key);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setTip({ name: r.name, role: r.role, x: rect.left + rect.width / 2, y: rect.top });
  };
  const leave = () => { setHoveredKey(null); setTip(null); };

  return (
    <div style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Users size={11} style={{ color: 'var(--txt-muted)', flexShrink: 0 }} />
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: 'var(--txt-muted)', flex: 1 }}>EN LA CONVERSACIÓN</span>
        <span style={countBadge}>{rows.length}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {rows.map((r) => {
          const meta = ROLE_META[r.role];
          const busy = r.userId != null && revokingId === r.userId;
          const showX = canRevoke && r.canRevoke && r.userId != null && hoveredKey === r.key;
          return (
            <div key={r.key} onMouseEnter={(e) => enter(e, r)} onMouseLeave={leave} style={{ position: 'relative', display: 'inline-flex' }}>
              <span style={{ ...avatar, background: meta.color, opacity: busy ? 0.5 : 1, border: `1.5px solid ${meta.color}` }}>{ini(r.name)}</span>
              {showX && r.userId != null && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRevoke(r.userId!); }}
                  disabled={busy}
                  title="Revocar acceso"
                  style={xBtn}
                >
                  <X size={9} />
                </button>
              )}
            </div>
          );
        })}
      </div>

      {tip && createPortal(
        <div style={{ ...tooltip, left: tip.x, top: tip.y - 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', whiteSpace: 'nowrap' }}>{shortName(tip.name)}</span>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: ROLE_META[tip.role].color, whiteSpace: 'nowrap' }}>{ROLE_META[tip.role].label}</span>
        </div>,
        document.body,
      )}
    </div>
  );
}

const panel: CSSProperties = { padding: '10px 14px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 7, flexShrink: 0 };
const countBadge: CSSProperties = { fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', color: 'var(--txt-muted)', border: '1px solid var(--border-subtle)' };
const avatar: CSSProperties = { width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: 'white', cursor: 'default', boxSizing: 'border-box' };
const xBtn: CSSProperties = { position: 'absolute', top: -4, right: -4, width: 14, height: 14, borderRadius: '50%', background: 'var(--danger)', border: '1.5px solid var(--bg-panel)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, zIndex: 1 };
const tooltip: CSSProperties = { position: 'fixed', transform: 'translate(-50%, -100%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, padding: '4px 8px', borderRadius: 6, background: 'var(--bg-panel)', border: '1px solid var(--border)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)', zIndex: 9999, pointerEvents: 'none' };