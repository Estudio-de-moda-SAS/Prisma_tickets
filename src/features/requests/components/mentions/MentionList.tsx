// src/features/requests/components/mentions/MentionList.tsx
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState, type CSSProperties } from 'react';
import type { AppUser } from '@/features/requests/hooks/useUsers';
import { groupByDepartment } from '@/features/requests/lib/mentions';

export type MentionListRef = { onKeyDown: (p: { event: KeyboardEvent }) => boolean };
type Props = { items: AppUser[]; command: (attrs: { id: number; label: string }) => void };

const ini = (n: string) => { const p = n.trim().split(/\s+/); return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase(); };

export const MentionList = forwardRef<MentionListRef, Props>(({ items, command }, ref) => {
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [items]);

  // Lista aplanada en el mismo orden visual (por grupo) → el índice de teclado
  // recorre esta secuencia, cruzando headers sin problema.
  const groups = useMemo(() => groupByDepartment(items), [items]);
  const flat   = useMemo(() => groups.flatMap((g) => g.users), [groups]);

  const pick = (i: number) => { const u = flat[i]; if (u) command({ id: u.User_ID, label: u.User_Name }); };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (flat.length === 0) return false;
      if (event.key === 'ArrowUp')   { setIdx((i) => (i + flat.length - 1) % flat.length); return true; }
      if (event.key === 'ArrowDown') { setIdx((i) => (i + 1) % flat.length); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') { pick(idx); return true; }
      return false;
    },
  }));

  if (flat.length === 0) return null;

  let running = -1; // índice global mientras recorremos grupos
  return (
    <div style={panel}>
      {groups.map((g) => (
        <div key={g.deptId ?? 'none'}>
          <div style={header}>{g.deptName}</div>
          {g.users.map((u) => {
            running += 1;
            const active = running === idx;
            return (
              <button key={u.User_ID} onMouseDown={(e) => { e.preventDefault(); pick(flat.indexOf(u)); }} onMouseEnter={() => setIdx(flat.indexOf(u))}
                style={{ ...row, background: active ? 'rgba(0,200,255,0.1)' : 'transparent' }}>
                <span style={avatar}>{ini(u.User_Name)}</span>
                <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, textAlign: 'left' }}>
                  <span style={{ fontSize: 12, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Name}</span>
                  <span style={{ fontSize: 9, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Email}</span>
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
});

const panel: CSSProperties = { width: 240, maxHeight: 240, overflowY: 'auto', boxSizing: 'border-box', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 12px 40px rgba(0,0,0,0.45)', padding: 4, display: 'flex', flexDirection: 'column', gap: 2 };
const header: CSSProperties = { fontSize: 8, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--txt-muted)', padding: '6px 8px 3px', position: 'sticky', top: 0, background: 'var(--bg-panel)' };
const row: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', width: '100%' };
const avatar: CSSProperties = { width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'white' };