import { useState, useEffect, useRef, startTransition } from 'react';
import { useSubTeamMembers, useSubTeamMembersGrouped, useAddSubTeamMember, useRemoveSubTeamMember } from '@/features/requests/hooks/useSubTeamMembers';import { useUsers } from '@/features/requests/hooks/useUsers';
import type { SubTeam } from '@/features/requests/hooks/useSubTeams';
import { AddBtn, SmBtn, SimpleColorForm } from '../ConfigPanel';
import { createPortal } from 'react-dom';

export function SubTeamList({ subTeams, onAdd, onUpdate, onRemove }: {
  subTeams: SubTeam[]; teamId: number;
  onAdd: (d: { name: string; color: string }) => void;
  onUpdate: (id: number, d: { name: string; color: string }) => void;
  onRemove: (id: number) => void;
}) {
  const [editId,     setEditId]     = useState<number | null>(null);
  const [showNew,    setShowNew]    = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useSubTeamMembersGrouped(subTeams);
  useUsers();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {subTeams.length === 0 && !showNew && (
        <div className="cpanel__empty"><span style={{ fontSize: 28, opacity: 0.4 }}>👥</span><p>No hay sub-equipos para este equipo.</p></div>
      )}
      {subTeams.map((st) => (
        <div key={st.Sub_Team_ID} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-surface)' }}>
          {editId === st.Sub_Team_ID ? (
            <div style={{ padding: '10px 12px' }}>
              <SimpleColorForm initial={{ name: st.Sub_Team_Name, color: st.Sub_Team_Color }} onSave={(d) => { onUpdate(st.Sub_Team_ID, d); setEditId(null); }} onCancel={() => setEditId(null)} />
            </div>
          ) : (
            <SubTeamRow st={st} expanded={expandedId === st.Sub_Team_ID} onToggle={() => setExpandedId(expandedId === st.Sub_Team_ID ? null : st.Sub_Team_ID)} onEdit={() => { setShowNew(false); setEditId(st.Sub_Team_ID); setExpandedId(null); }} onDelete={() => onRemove(st.Sub_Team_ID)} />
          )}
          {expandedId === st.Sub_Team_ID && editId !== st.Sub_Team_ID && (
            <SubTeamMembersSectionWrapper subTeamId={st.Sub_Team_ID} subTeamColor={st.Sub_Team_Color} />
          )}
        </div>
      ))}
      {showNew ? (
        <div style={{ padding: '10px 12px', border: '1px solid var(--border-subtle)', borderRadius: 10, background: 'var(--bg-surface)' }}>
          <SimpleColorForm onSave={(d) => { onAdd(d); setShowNew(false); }} onCancel={() => setShowNew(false)} />
        </div>
      ) : (
        <AddBtn label="Nuevo sub-equipo" onClick={() => { setEditId(null); setShowNew(true); }} />
      )}
    </div>
  );
}

function SubTeamRow({ st, expanded, onToggle, onEdit, onDelete }: {
  st: SubTeam; expanded: boolean; onToggle: () => void; onEdit: () => void; onDelete: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: expanded || hov ? 'var(--bg-hover)' : 'transparent', transition: 'background 0.12s', borderBottom: expanded ? '1px solid var(--border-subtle)' : 'none' }}>
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: st.Sub_Team_Color, flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{st.Sub_Team_Name}</span>
      <div style={{ display: 'flex', gap: 4, opacity: hov || expanded ? 1 : 0, transition: 'opacity 0.12s' }}>
        <SmBtn color="#00c8ff" onClick={onEdit} title="Editar"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg></SmBtn>
        <SmBtn color="#ff4757" onClick={onDelete} title="Eliminar"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg></SmBtn>
      </div>
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: `1px solid ${expanded ? st.Sub_Team_Color + '60' : 'var(--border-subtle)'}`, background: expanded ? `${st.Sub_Team_Color}15` : 'transparent', color: expanded ? st.Sub_Team_Color : 'var(--txt-muted)', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}>
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none"><circle cx="5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.5"/><circle cx="10" cy="4.5" r="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 11c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><path d="M10 8c1.66 0 3 1.12 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
        Integrantes
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.18s' }}><path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
    </div>
  );
}

function SubTeamMembersSectionWrapper(props: { subTeamId: number; subTeamColor: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => { startTransition(() => setShow(true)); }, 50);
    return () => clearTimeout(t);
  }, []);
  if (!show) return (
    <div style={{ padding: '12px 14px', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[1,2,3].map((i) => <div key={i} style={{ height: 42, borderRadius: 7, background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-hover) 50%, var(--bg-surface) 75%)', backgroundSize: '200% 100%', animation: 'skeleton-sweep 1.4s ease infinite', border: '1px solid var(--border-subtle)' }} />)}
    </div>
  );
  return <SubTeamMembersSection {...props} />;
}

function SubTeamMembersSection({ subTeamId, subTeamColor }: { subTeamId: number; subTeamColor: string }) {
  const { data: members  = [], isLoading: loadingM } = useSubTeamMembers(subTeamId);
  const { data: allUsers = [], isLoading: loadingU } = useUsers();
  const addMember    = useAddSubTeamMember(subTeamId);
  const removeMember = useRemoveSubTeamMember(subTeamId);
  const [search,   setSearch]   = useState('');
  const [dropOpen, setDropOpen] = useState(false);
  const [dropPos,  setDropPos]  = useState({ top: 0, left: 0, width: 0 });
  const btnRef  = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const memberIds = new Set(members.map((m) => m.User_ID));
  const available = allUsers.filter((u) => !memberIds.has(u.User_ID) && (u.User_Name.toLowerCase().includes(search.toLowerCase()) || u.User_Email.toLowerCase().includes(search.toLowerCase())));

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) && btnRef.current && !btnRef.current.contains(e.target as Node)) { setDropOpen(false); setSearch(''); }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function handleToggleDrop() {
    if (!dropOpen && btnRef.current) { const r = btnRef.current.getBoundingClientRect(); setDropPos({ top: r.bottom + 4, left: r.left, width: r.width }); }
    setDropOpen((o) => !o); setSearch('');
  }

  if (loadingM || loadingU) return (
    <div style={{ padding: '12px 14px', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {[1,2,3].map((i) => <div key={i} style={{ height: 42, borderRadius: 7, background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-hover) 50%, var(--bg-surface) 75%)', backgroundSize: '200% 100%', animation: 'skeleton-sweep 1.4s ease infinite', border: '1px solid var(--border-subtle)' }} />)}
    </div>
  );

  return (
    <div style={{ padding: '12px 14px 14px', background: 'var(--bg-panel)' }}>
      {members.length === 0 ? <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: '0 0 10px' }}>Sin integrantes aún.</p> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
          {members.map((m) => (
            <div key={m.User_ID} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <UserAvatar name={m.User_Name} avatarUrl={m.User_Avatar_url} />
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.User_Name}</div><div style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.User_Email}</div></div>
              <SmBtn color="#ff4757" onClick={() => removeMember.mutate(m.User_ID)} title="Quitar"><svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l7 7M8 1L1 8" strokeLinecap="round"/></svg></SmBtn>
            </div>
          ))}
        </div>
      )}
      <button ref={btnRef} onClick={handleToggleDrop} style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', padding: '7px 10px', borderRadius: 7, border: `1px dashed ${dropOpen ? subTeamColor : 'var(--border)'}`, background: dropOpen ? `${subTeamColor}0d` : 'transparent', color: dropOpen ? subTeamColor : 'var(--txt-muted)', fontSize: 12, cursor: 'pointer', transition: 'all 0.15s' }}>
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M5.5 1v9M1 5.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
        Agregar integrante
      </button>
      {dropOpen && createPortal(
        <div ref={dropRef} style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, width: dropPos.width, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 9, boxShadow: '0 8px 28px rgba(0,0,0,0.4)', zIndex: 9999, overflow: 'hidden' }}>
          <input autoFocus placeholder="Buscar por nombre o correo…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'var(--bg-surface)', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--txt)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ maxHeight: 200, overflowY: 'auto', padding: '4px' }}>
            {available.length === 0 ? <p style={{ fontSize: 11, color: 'var(--txt-muted)', textAlign: 'center', padding: '10px 0', margin: 0 }}>{search ? 'Sin resultados' : 'Todos ya son integrantes'}</p>
              : available.map((u) => (
                <button key={u.User_ID} onClick={() => { addMember.mutate(u.User_ID); setDropOpen(false); setSearch(''); }} disabled={addMember.isPending}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--txt)', cursor: 'pointer', textAlign: 'left' }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                  <UserAvatar name={u.User_Name} avatarUrl={u.User_Avatar_url} />
                  <div style={{ minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Name}</div><div style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Email}</div></div>
                </button>
              ))
            }
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

function UserAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string }) {
  const initials = name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  if (avatarUrl) return <img src={avatarUrl} alt={name} style={{ width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--accent)', color: '#000', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{initials}</div>;
}
