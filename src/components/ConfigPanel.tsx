// src/components/layout/ConfigPanel.tsx
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '@/store/boardStore';
import {
  useBoardTeams, useLabelsByTeamId,
  useBoardTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate,
  type BoardTeam,
} from '@/features/requests/hooks/useBoardMetadata';
import { useSprints, useCreateSprint, useUpdateSprint, useDeleteSprint } from '@/features/requests/hooks/useSprints';
import { useSubTeams, useCreateSubTeam, useUpdateSubTeam, useDeleteSubTeam } from '@/features/requests/hooks/useSubTeams';
import { useSubTeamMembers, useAddSubTeamMember, useRemoveSubTeamMember } from '@/features/requests/hooks/useSubTeamMembers';
import { useUsers } from '@/features/requests/hooks/useUsers';
import { apiClient } from '@/lib/apiClient';
import { useQueryClient } from '@tanstack/react-query';
import { config } from '@/config';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import type { SubTeam } from '@/features/requests/hooks/useSubTeams';
import type { BoardLabel, BoardTemplate } from '@/features/requests/hooks/useBoardMetadata';
import type { TemplateExtraField, FieldType } from '@/features/requests/templates/types';
import type { Equipo } from '@/features/requests/types';

/* ============================================================
   Constantes
   ============================================================ */
const COLORS = [
  '#ff4757','#ff6b81','#ff7f50','#fdcb6e','#f9ca24','#a3cb38',
  '#00e5a0','#00cec9','#00c8ff','#0984e3','#6c5ce7','#a29bfe',
  '#fd79a8','#e84393','#b2bec3',
];
const EMOJIS = ['🐛','🎨','🖼️','📊','⚙️','🔧','🚀','💡','📋','🔒','🌐','📱','💰','🔔','✅','🧪','🎯','🏷️','🛠️','🏪','📦','🔍','💬','🗂️'];
const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: 'text',     label: 'Texto corto' },
  { value: 'textarea', label: 'Texto largo'  },
  { value: 'select',   label: 'Desplegable'  },
  { value: 'radio',    label: 'Selección'    },
  { value: 'checkbox', label: 'Casilla'      },
];
// Colores canónicos por Board_Team_Code — fallback si la DB no trae color
const TEAM_CODE_COLORS: Record<string, string> = {
  desarrollo: '#378ADD',
  crm:        '#1D9E75',
  sistemas:   '#EF9F27',
  analisis:   '#7F77DD',
};

type Section = 'labels' | 'subteams' | 'sprints' | 'templates';

const NAV_ITEMS: { key: Section; label: string; icon: string }[] = [
  { key: 'labels',    label: 'Etiquetas',   icon: '🏷️' },
  { key: 'subteams',  label: 'Sub-equipos', icon: '👥' },
  { key: 'sprints',   label: 'Sprints',     icon: '⚡' },
  { key: 'templates', label: 'Templates',   icon: '📋' },
];

/* ============================================================
   NavTeamSwitcher — selector de equipo usando datos de la DB
   DEBE estar definido ANTES de ConfigPanelTrigger y ConfigPanel
   ============================================================ */
function NavTeamSwitcher({ teams, equipoActivo }: {
  teams:        BoardTeam[];
  equipoActivo: string;
}) {
  const setEquipoActivo = useBoardStore((s) => s.setEquipoActivo);

  if (teams.length === 0) {
    return <span style={{ fontSize: 10, color: 'var(--txt-muted)', paddingLeft: 2 }}>Cargando…</span>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {teams.map((team) => {
        const active = team.Board_Team_Code === equipoActivo;
        const color  = team.Board_Team_Color || TEAM_CODE_COLORS[team.Board_Team_Code] || '#00c8ff';
        return (
          <button
            key={team.Board_Team_ID}
            onClick={() => setEquipoActivo(team.Board_Team_Code as Equipo)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '7px 8px', borderRadius: 7, border: 'none',
              background: active ? `${color}18` : 'transparent',
              outline: active ? `1px solid ${color}35` : 'none',
              cursor: 'pointer', transition: 'all 0.12s', width: '100%', textAlign: 'left',
            }}
            onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-hover)'; }}
            onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = active ? `${color}18` : 'transparent'; }}
          >
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0,
              boxShadow: active ? `0 0 7px ${color}` : 'none', transition: 'box-shadow 0.2s',
            }} />
            <span style={{
              flex: 1, fontSize: 11.5, fontWeight: active ? 700 : 400,
              color: active ? color : 'var(--txt-muted)', transition: 'color 0.12s', lineHeight: 1.3,
            }}>
              {team.Board_Team_Name}
            </span>
            {active && (
              <svg width="9" height="9" viewBox="0 0 9 9" fill="none" style={{ flexShrink: 0 }}>
                <path d="M1 4.5l2.5 2.5L8 1.5" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ============================================================
   Trigger
   ============================================================ */
export function ConfigPanelTrigger({ collapsed }: { collapsed?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title="Configuración del board"
        className={`cpop-trigger${open ? ' cpop-trigger--open' : ''}`}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="2.5"/>
          <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" strokeLinecap="round"/>
        </svg>
        {!collapsed && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 4 }}>Config</span>}
      </button>
      {open && <ConfigPanel onClose={() => setOpen(false)} />}
    </>
  );
}

/* ============================================================
   Panel principal
   ============================================================ */
function ConfigPanel({ onClose }: { onClose: () => void }) {
  const [section, setSection] = useState<Section>('labels');
  const panelRef = useRef<HTMLDivElement>(null);
  const { equipoActivo } = useBoardStore();
  const boardId = config.DEFAULT_BOARD_ID;

  const { data: teams     = [] } = useBoardTeams(boardId);
  const { data: templates = [] } = useBoardTemplates(boardId);
  const activeTeam = teams.find((t) => t.Board_Team_Code === equipoActivo);
  const teamId     = activeTeam?.Board_Team_ID ?? null;

  const { data: labels   = [] } = useLabelsByTeamId(boardId, teamId);
  const { data: sprints  = [] } = useSprints();
  const { data: subTeams = [] } = useSubTeams(teamId);

  const createSprint   = useCreateSprint();
  const updateSprint   = useUpdateSprint();
  const deleteSprint   = useDeleteSprint();
  const createSubTeam  = useCreateSubTeam(teamId);
  const updateSubTeam  = useUpdateSubTeam(teamId);
  const deleteSubTeam  = useDeleteSubTeam(teamId);
  const createTemplate = useCreateTemplate(boardId);
  const updateTemplate = useUpdateTemplate(boardId);
  const deleteTemplate = useDeleteTemplate(boardId);
  const qc = useQueryClient();

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  async function handleCreateLabel(d: { name: string; color: string; icon: string }) {
    if (!teamId) return;
    await apiClient.call('createLabel', { boardId, teamId, name: d.name, color: d.color, icon: d.icon });
    qc.invalidateQueries({ queryKey: ['boardLabels', boardId, teamId] });
  }
  async function handleUpdateLabel(id: number, d: { name: string; color: string; icon: string }) {
    await apiClient.call('updateLabel', { id, name: d.name, color: d.color, icon: d.icon });
    qc.invalidateQueries({ queryKey: ['boardLabels', boardId, teamId] });
  }
  async function handleDeleteLabel(id: number) {
    await apiClient.call('deleteLabel', { id });
    qc.invalidateQueries({ queryKey: ['boardLabels', boardId, teamId] });
  }

  const activeNav = NAV_ITEMS.find((n) => n.key === section)!;

  return createPortal(
    <div className="cpanel-backdrop" onClick={handleBackdrop}>
      <div ref={panelRef} className="cpanel">
        <div className="cpanel__accent-line" />
        <div className="cpanel__layout">

          {/* ── Nav lateral ── */}
          <aside className="cpanel__nav">
            <div className="cpanel__nav-header">
              <span className="cpanel__nav-title">Config</span>
              {/* Selector de equipo desde DB */}
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', opacity: 0.6, paddingLeft: 2 }}>
                  Equipo
                </span>
                <NavTeamSwitcher teams={teams} equipoActivo={equipoActivo} />
              </div>
            </div>

            <div className="cpanel__nav-group">
              <span className="cpanel__nav-group-label">Board</span>
              {NAV_ITEMS.filter((n) => n.key !== 'templates').map((item) => (
                <button key={item.key} onClick={() => setSection(item.key)}
                  className={`cpanel__nav-item${section === item.key ? ' cpanel__nav-item--active' : ''}`}>
                  <span className="cpanel__nav-item-icon">{item.icon}</span>
                  <span>{item.label}</span>
                  {item.key === 'labels'   && <span className="cpanel__nav-badge">{labels.length}</span>}
                  {item.key === 'subteams' && <span className="cpanel__nav-badge">{subTeams.length}</span>}
                  {item.key === 'sprints'  && <span className="cpanel__nav-badge">{sprints.length}</span>}
                </button>
              ))}
            </div>

            <div className="cpanel__nav-group cpanel__nav-group--separated">
              <span className="cpanel__nav-group-label">Sistema</span>
              <button onClick={() => setSection('templates')}
                className={`cpanel__nav-item${section === 'templates' ? ' cpanel__nav-item--active' : ''}`}>
                <span className="cpanel__nav-item-icon">📋</span>
                <span>Templates</span>
                <span className="cpanel__nav-badge">{templates.length}</span>
              </button>
            </div>
          </aside>

          {/* ── Contenido ── */}
          <div className="cpanel__content">
            <div className="cpanel__content-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>{activeNav.icon}</span>
                <div>
                  <h2 className="cpanel__content-title">{activeNav.label}</h2>
                  {section !== 'templates' && !teamId && (
                    <p className="cpanel__content-subtitle">Seleccioná un equipo en el panel izquierdo</p>
                  )}
                  {section === 'subteams' && teamId && (
                    <p className="cpanel__content-subtitle">{activeTeam?.Board_Team_Name} · integrantes por sub-equipo</p>
                  )}
                  {section === 'labels' && teamId && (
                    <p className="cpanel__content-subtitle">{activeTeam?.Board_Team_Name}</p>
                  )}
                  {section === 'templates' && (
                    <p className="cpanel__content-subtitle">Formularios de solicitudes</p>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="cpanel__close">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M1 1l12 12M13 1L1 13"/>
                </svg>
              </button>
            </div>

            <div className="cpanel__content-body">
              {section === 'labels' && teamId && (
                <LabelList labels={labels} onAdd={handleCreateLabel} onUpdate={handleUpdateLabel} onDelete={handleDeleteLabel} />
              )}
              {section === 'labels' && !teamId && <EmptyTeam />}

              {section === 'subteams' && teamId && (
                <SubTeamList
                  subTeams={subTeams}
                  teamId={teamId}
                  onAdd={(d) => createSubTeam.mutate(d)}
                  onUpdate={(id, d) => updateSubTeam.mutate({ id, ...d })}
                  onRemove={(id) => deleteSubTeam.mutate(id)}
                />
              )}
              {section === 'subteams' && !teamId && <EmptyTeam />}

              {section === 'sprints' && (
                <SprintList
                  sprints={sprints}
                  onAdd={(s) => createSprint.mutate(s)}
                  onUpdate={(id, s) => updateSprint.mutate({ id, ...s })}
                  onRemove={(id) => deleteSprint.mutate(id)}
                />
              )}

              {section === 'templates' && (
                <TemplateList
                  templates={templates}
                  teams={teams}
                  onAdd={(d) => createTemplate.mutate(d)}
                  onUpdate={(id, d) => updateTemplate.mutate({ id, ...d })}
                  onDelete={(id) => deleteTemplate.mutate(id)}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function EmptyTeam() {
  return (
    <div className="cpanel__empty">
      <span style={{ fontSize: 28, opacity: 0.4 }}>🎯</span>
      <p>Seleccioná un equipo en el panel izquierdo.</p>
    </div>
  );
}

/* ============================================================
   SubTeamList
   ============================================================ */
function SubTeamList({ subTeams, onAdd, onUpdate, onRemove }: {
  subTeams: SubTeam[];
  teamId:   number;
  onAdd:    (d: { name: string; color: string }) => void;
  onUpdate: (id: number, d: { name: string; color: string }) => void;
  onRemove: (id: number) => void;
}) {
  const [editId,     setEditId]     = useState<number | null>(null);
  const [showNew,    setShowNew]    = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {subTeams.length === 0 && !showNew && (
        <div className="cpanel__empty">
          <span style={{ fontSize: 28, opacity: 0.4 }}>👥</span>
          <p>No hay sub-equipos para este equipo.</p>
        </div>
      )}
      {subTeams.map((st) => (
        <div key={st.Sub_Team_ID} style={{ border: '1px solid var(--border-subtle)', borderRadius: 10, overflow: 'hidden', background: 'var(--bg-surface)' }}>
          {editId === st.Sub_Team_ID ? (
            <div style={{ padding: '10px 12px' }}>
              <SimpleColorForm
                initial={{ name: st.Sub_Team_Name, color: st.Sub_Team_Color }}
                onSave={(d) => { onUpdate(st.Sub_Team_ID, d); setEditId(null); }}
                onCancel={() => setEditId(null)}
              />
            </div>
          ) : (
            <SubTeamRow
              st={st}
              expanded={expandedId === st.Sub_Team_ID}
              onToggle={() => setExpandedId(expandedId === st.Sub_Team_ID ? null : st.Sub_Team_ID)}
              onEdit={() => { setShowNew(false); setEditId(st.Sub_Team_ID); setExpandedId(null); }}
              onDelete={() => onRemove(st.Sub_Team_ID)}
            />
          )}
          {expandedId === st.Sub_Team_ID && editId !== st.Sub_Team_ID && (
            <SubTeamMembersSection subTeamId={st.Sub_Team_ID} subTeamColor={st.Sub_Team_Color} />
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
        <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
          <circle cx="5" cy="4.5" r="2" stroke="currentColor" strokeWidth="1.5"/>
          <circle cx="10" cy="4.5" r="1.5" stroke="currentColor" strokeWidth="1.3"/>
          <path d="M1 11c0-2.21 1.79-4 4-4s4 1.79 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M10 8c1.66 0 3 1.12 3 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
        </svg>
        Integrantes
        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.18s' }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>
    </div>
  );
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
  const available = allUsers.filter(
    (u) => !memberIds.has(u.User_ID) &&
      (u.User_Name.toLowerCase().includes(search.toLowerCase()) ||
       u.User_Email.toLowerCase().includes(search.toLowerCase()))
  );

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (dropRef.current && !dropRef.current.contains(e.target as Node) &&
          btnRef.current  && !btnRef.current.contains(e.target as Node)) {
        setDropOpen(false); setSearch('');
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  function handleToggleDrop() {
    if (!dropOpen && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setDropPos({ top: r.bottom + 4, left: r.left, width: r.width });
    }
    setDropOpen((o) => !o); setSearch('');
  }

  if (loadingM || loadingU) return <div style={{ padding: '12px 14px', background: 'var(--bg-panel)' }}><p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: 0 }}>Cargando…</p></div>;

  return (
    <div style={{ padding: '12px 14px 14px', background: 'var(--bg-panel)' }}>
      {members.length === 0 ? (
        <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: '0 0 10px' }}>Sin integrantes aún.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
          {members.map((m) => (
            <div key={m.User_ID} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
              <UserAvatar name={m.User_Name} avatarUrl={m.User_Avatar_url} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.User_Name}</div>
                <div style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.User_Email}</div>
              </div>
              <SmBtn color="#ff4757" onClick={() => removeMember.mutate(m.User_ID)} title="Quitar">
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l7 7M8 1L1 8" strokeLinecap="round"/></svg>
              </SmBtn>
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
          <input autoFocus placeholder="Buscar por nombre o correo…" value={search} onChange={(e) => setSearch(e.target.value)}
            style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'var(--bg-surface)', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--txt)', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          <div style={{ maxHeight: 200, overflowY: 'auto', padding: '4px' }}>
            {available.length === 0 ? (
              <p style={{ fontSize: 11, color: 'var(--txt-muted)', textAlign: 'center', padding: '10px 0', margin: 0 }}>{search ? 'Sin resultados' : 'Todos ya son integrantes'}</p>
            ) : available.map((u) => (
              <button key={u.User_ID} onClick={() => { addMember.mutate(u.User_ID); setDropOpen(false); setSearch(''); }} disabled={addMember.isPending}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--txt)', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                <UserAvatar name={u.User_Name} avatarUrl={u.User_Avatar_url} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Name}</div>
                  <div style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Email}</div>
                </div>
              </button>
            ))}
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

/* ============================================================
   TemplateList
   ============================================================ */
type TemplateMutationPayload = {
  name: string; description: string; icon: string; color: string;
  badge: string; formSchema: TemplateExtraField[]; teamIds: number[]; isActive: boolean;
};

function TemplateList({ templates, teams, onAdd, onUpdate, onDelete }: {
  templates: BoardTemplate[];
  teams:     { Board_Team_ID: number; Board_Team_Name: string }[];
  onAdd: (d: TemplateMutationPayload) => void;
  onUpdate: (id: number, d: TemplateMutationPayload) => void;
  onDelete: (id: number) => void;
}) {
  const [editKey, setEditKey] = useState<number | null>(null);
  if (editKey === -1) return <TemplateForm key="form-new" teams={teams} onSave={(d) => { onAdd(d); setEditKey(null); }} onCancel={() => setEditKey(null)} />;
  if (editKey !== null) {
    const t = templates.find((t) => t.Request_Template_ID === editKey);
    if (t) return <TemplateForm key={`form-edit-${editKey}`} teams={teams} initial={{ name: t.Request_Template_Name, description: t.Request_Template_Description, icon: t.Request_Template_Icon ?? '📋', color: t.Request_Template_Color ?? '#00c8ff', badge: t.Request_Template_Badge ?? t.Request_Template_Name, formSchema: t.Request_Template_Form_Schema ?? [], teamIds: t.Request_Template_Teams ?? [], isActive: t.Request_Template_Is_Active ?? true }} onSave={(d) => { onUpdate(editKey, d); setEditKey(null); }} onCancel={() => setEditKey(null)} />;
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {templates.length === 0 && <div className="cpanel__empty"><span style={{ fontSize: 28, opacity: 0.4 }}>📋</span><p>No hay templates definidos.</p></div>}
      {templates.map((t) => <TemplateRow key={t.Request_Template_ID} template={t} onEdit={() => setEditKey(t.Request_Template_ID)} onDelete={() => onDelete(t.Request_Template_ID)} />)}
      <AddBtn label="Nuevo template" onClick={() => setEditKey(-1)} />
    </div>
  );
}

function TemplateRow({ template, onEdit, onDelete }: { template: BoardTemplate; onEdit: () => void; onDelete: () => void }) {
  const [hov, setHov] = useState(false);
  const color = template.Request_Template_Color ?? '#00c8ff';
  const icon  = template.Request_Template_Icon  ?? '📋';
  const fieldCount = template.Request_Template_Form_Schema?.length ?? 0;
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: `1px solid ${hov ? color + '40' : 'var(--border-subtle)'}`, background: hov ? `${color}06` : 'var(--bg-surface)', transition: 'all 0.15s' }}>
      <div style={{ width: 32, height: 32, borderRadius: 7, background: `${color}15`, border: `1px solid ${color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.Request_Template_Name}</span>
          {!template.Request_Template_Is_Active && <span style={{ fontSize: 9, color: 'var(--txt-muted)', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '1px 5px', flexShrink: 0 }}>inactivo</span>}
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {fieldCount > 0 && <span style={{ fontSize: 10, color, background: `${color}12`, border: `1px solid ${color}25`, borderRadius: 3, padding: '1px 6px' }}>{fieldCount} campo{fieldCount !== 1 ? 's' : ''}</span>}
          {(template.Request_Template_Teams?.length ?? 0) > 0 && <span style={{ fontSize: 10, color: 'var(--txt-muted)', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '1px 6px' }}>{template.Request_Template_Teams.length} equipo{template.Request_Template_Teams.length !== 1 ? 's' : ''}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, opacity: hov ? 1 : 0, transition: 'opacity 0.12s', flexShrink: 0 }}>
        <SmBtn color="#00c8ff" onClick={onEdit} title="Editar"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg></SmBtn>
        <SmBtn color="#ff4757" onClick={onDelete} title="Eliminar"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg></SmBtn>
      </div>
    </div>
  );
}

/* ============================================================
   TemplateForm
   ============================================================ */
function TemplateForm({ initial, teams, onSave, onCancel }: {
  initial?: TemplateMutationPayload;
  teams: { Board_Team_ID: number; Board_Team_Name: string }[];
  onSave: (d: TemplateMutationPayload) => void; onCancel: () => void;
}) {
  const [name, setName]               = useState(initial?.name        ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon, setIcon]               = useState(initial?.icon        ?? '📋');
  const [color, setColor]             = useState(initial?.color       ?? '#00c8ff');
  const [badge, setBadge]             = useState(initial?.badge       ?? '');
  const [teamIds, setTeamIds]         = useState<number[]>(initial?.teamIds ?? []);
  const [isActive, setIsActive]       = useState(initial?.isActive    ?? true);
  const [fields, setFields]           = useState<TemplateExtraField[]>(initial?.formSchema ?? []);
  const [tab, setTab]                 = useState<'info' | 'fields'>('info');
  const canSave = name.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    onSave({ name: name.trim(), description: description.trim(), icon, color, badge: badge.trim() || name.trim(), formSchema: fields, teamIds, isActive });
  }
  function addField() { setFields((p) => [...p, { key: `campo_${p.length + 1}`, label: '', placeholder: '', required: false, type: 'text', collapsible: false }]); }
  function updateField(idx: number, patch: Partial<TemplateExtraField>) { setFields((p) => p.map((f, i) => i === idx ? { ...f, ...patch } : f)); }
  function removeField(idx: number) { setFields((p) => p.filter((_, i) => i !== idx)); }
  function moveField(idx: number, dir: -1 | 1) { setFields((p) => { const n = [...p]; const s = idx + dir; if (s < 0 || s >= n.length) return p; [n[idx], n[s]] = [n[s], n[idx]]; return n; }); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', flex: 1 }}>{initial ? `Editar: ${initial.name}` : 'Nuevo template'}</span>
        <button onClick={handleSave} disabled={!canSave} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: canSave ? `linear-gradient(135deg, var(--accent-2), ${color})` : 'var(--bg-surface)', color: canSave ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', letterSpacing: 1 }}>GUARDAR</button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, padding: '4px', background: 'var(--bg-surface)', borderRadius: 8 }}>
        {(['info', 'fields'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer', background: tab === t ? color : 'transparent', color: tab === t ? 'white' : 'var(--txt-muted)', transition: 'all 0.15s' }}>
            {t === 'info' ? '⚙️ Info' : `🔧 Campos (${fields.length})`}
          </button>
        ))}
      </div>
      {tab === 'info' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', flex: 1 }}>
          <FormSection title="Identidad">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><FieldLabel>Nombre *</FieldLabel><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Soporte Dev" className="cpop-input" /></div>
              <div><FieldLabel>Badge corto</FieldLabel><input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="Ej: Dev" className="cpop-input" /></div>
            </div>
            <div><FieldLabel>Descripción</FieldLabel><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿Para qué sirve este template?" rows={2} style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '7px 9px', fontSize: 12, color: 'var(--txt)', resize: 'none', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} /></div>
          </FormSection>
          <FormSection title="Visual">
            <div><FieldLabel>Icono</FieldLabel><div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{EMOJIS.map((e) => <button key={e} type="button" onClick={() => setIcon(icon === e ? '📋' : e)} className={`cpop-emoji${icon === e ? ' cpop-emoji--active' : ''}`}>{e}</button>)}</div></div>
            <div><FieldLabel>Color de acento</FieldLabel><ColorPicker color={color} onChange={setColor} /></div>
            <div style={{ padding: '10px 12px', borderRadius: 8, background: `${color}08`, border: `1px solid ${color}20`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 20 }}>{icon}</span>
              <div><div style={{ fontSize: 12, fontWeight: 700, color }}>{name || 'Nombre del template'}</div><div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{description || 'Descripción del template'}</div></div>
              <span style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: `${color}18`, border: `1px solid ${color}35`, color, flexShrink: 0 }}>{badge || name || 'Badge'}</span>
            </div>
          </FormSection>
          <FormSection title="Equipos que lo usan">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {teams.map((t) => { const sel = teamIds.includes(t.Board_Team_ID); return (
                <button key={t.Board_Team_ID} onClick={() => setTeamIds((p) => p.includes(t.Board_Team_ID) ? p.filter((x) => x !== t.Board_Team_ID) : [...p, t.Board_Team_ID])}
                  style={{ padding: '5px 12px', borderRadius: 6, border: `1px solid ${sel ? color + '60' : 'var(--border-subtle)'}`, background: sel ? `${color}15` : 'transparent', color: sel ? color : 'var(--txt-muted)', fontSize: 11, fontWeight: sel ? 700 : 400, cursor: 'pointer', transition: 'all 0.12s' }}>
                  {sel ? '✓ ' : ''}{t.Board_Team_Name}
                </button>
              ); })}
            </div>
            <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: 0 }}>Sin selección = disponible para todos los equipos.</p>
          </FormSection>
          <FormSection title="Estado">
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '8px 12px', borderRadius: 7, border: `1px solid ${isActive ? color + '40' : 'var(--border-subtle)'}`, background: isActive ? `${color}08` : 'transparent', transition: 'all 0.15s' }}>
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ accentColor: color, width: 14, height: 14 }} />
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: isActive ? color : 'var(--txt-muted)' }}>{isActive ? 'Activo' : 'Inactivo'}</div>
                <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{isActive ? 'Visible en el modal de nueva solicitud' : 'Oculto en el modal de nueva solicitud'}</div>
              </div>
            </label>
          </FormSection>
        </div>
      )}
      {tab === 'fields' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto', flex: 1 }}>
          {fields.length === 0 && <div className="cpanel__empty"><span style={{ fontSize: 32, opacity: 0.3 }}>🔧</span><p>Sin campos adicionales.</p><p style={{ fontSize: 11 }}>El formulario solo tendrá título y descripción.</p></div>}
          {fields.map((field, idx) => <FieldEditor key={idx} field={field} index={idx} total={fields.length} accentColor={color} onChange={(patch) => updateField(idx, patch)} onRemove={() => removeField(idx)} onMove={(dir) => moveField(idx, dir)} />)}
          <button onClick={addField} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', borderRadius: 8, border: `2px dashed ${color}40`, background: `${color}05`, color, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = `${color}10`; e.currentTarget.style.borderColor = `${color}70`; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = `${color}05`; e.currentTarget.style.borderColor = `${color}40`; }}>+ Agregar campo</button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   FieldEditor
   ============================================================ */
function FieldEditor({ field, index, total, accentColor, onChange, onRemove, onMove }: {
  field: TemplateExtraField; index: number; total: number; accentColor: string;
  onChange: (patch: Partial<TemplateExtraField>) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const [expanded, setExpanded]       = useState(true);
  const [optionInput, setOptionInput] = useState('');
  const needsOptions = field.type === 'select' || field.type === 'radio';
  function addOption() { const v = optionInput.trim(); if (!v) return; onChange({ options: [...(field.options ?? []), v] }); setOptionInput(''); }

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${expanded ? accentColor + '30' : 'var(--border-subtle)'}`, background: 'var(--bg-surface)', overflow: 'hidden', transition: 'border-color 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: expanded ? `${accentColor}06` : 'transparent', borderBottom: expanded ? `1px solid ${accentColor}15` : 'none' }}>
        <div style={{ width: 22, height: 22, borderRadius: 5, background: `${accentColor}20`, border: `1px solid ${accentColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: accentColor, flexShrink: 0 }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.label || <span style={{ color: 'var(--txt-muted)', fontWeight: 400 }}>Sin nombre</span>}</div>
          <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{FIELD_TYPES.find((f) => f.value === field.type)?.label}{field.required && ' · requerido'}{field.collapsible && ' · colapsable'}</div>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {index > 0 && <SmBtn color="var(--txt-muted)" onClick={() => onMove(-1)} title="Subir"><svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 5l3-3 3 3" strokeLinecap="round"/></svg></SmBtn>}
          {index < total - 1 && <SmBtn color="var(--txt-muted)" onClick={() => onMove(1)} title="Bajar"><svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 3l3 3 3-3" strokeLinecap="round"/></svg></SmBtn>}
          <SmBtn color="#00c8ff" onClick={() => setExpanded((v) => !v)} title={expanded ? 'Colapsar' : 'Expandir'}><svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8">{expanded ? <path d="M1 5l3-3 3 3" strokeLinecap="round"/> : <path d="M1 3l3 3 3-3" strokeLinecap="round"/>}</svg></SmBtn>
          <SmBtn color="#ff4757" onClick={onRemove} title="Eliminar campo"><svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l6 6M7 1L1 7"/></svg></SmBtn>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><FieldLabel>Tipo de campo</FieldLabel>
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
              {FIELD_TYPES.map((ft) => <button key={ft.value} onClick={() => {
  const patch: Partial<TemplateExtraField> = { type: ft.value };
  if (ft.value === 'checkbox') patch.placeholder = undefined;
  onChange(patch);
}}
                style={{ padding: '6px 4px', borderRadius: 6, border: `1px solid ${field.type === ft.value ? accentColor : 'var(--border-subtle)'}`, background: field.type === ft.value ? `${accentColor}15` : 'transparent', color: field.type === ft.value ? accentColor : 'var(--txt-muted)', fontSize: 10, fontWeight: field.type === ft.value ? 700 : 400, cursor: 'pointer', transition: 'all 0.12s', textAlign: 'center' }}>{ft.label}</button>)}
            </div>
          </div>
<div>
  <FieldLabel>Etiqueta *</FieldLabel>
  <input
    value={field.label}
    onChange={(e) => {
      const label = e.target.value;
      const key = label
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '')
        .toLowerCase();
      onChange({ label, key });
    }}
    placeholder="Ej: Repositorio"
    className="cpop-input"
  />
</div>         
          {(field.type === 'text' || field.type === 'textarea') && (
            <div>
              <FieldLabel>Texto de ayuda</FieldLabel>
              <input value={field.placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value })} placeholder="Ej: Pegá el nombre del repositorio..." className="cpop-input" />
            </div>
          )}
          {field.type === 'checkbox' && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${accentColor}`, background: `${accentColor}15`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5L8.5 2" stroke={accentColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>{field.label || 'Etiqueta de la casilla'}</span>
            </div>
          )}
          {needsOptions && (
            <div><FieldLabel>Opciones</FieldLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 6 }}>
                {(field.options ?? []).map((opt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: accentColor, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--txt)' }}>{opt}</span>
                    <SmBtn color="#ff4757" onClick={() => onChange({ options: (field.options ?? []).filter((_, idx) => idx !== i) })} title="Quitar"><svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l6 6M7 1L1 7"/></svg></SmBtn>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={optionInput} onChange={(e) => setOptionInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }} placeholder="Nueva opción… (Enter para agregar)" className="cpop-input" style={{ flex: 1 }} />
                <button onClick={addOption} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${accentColor}40`, background: `${accentColor}12`, color: accentColor, fontSize: 12, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>+</button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: 12, padding: '8px 10px', borderRadius: 7, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}><input type="checkbox" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} style={{ accentColor, width: 13, height: 13 }} /><span style={{ color: field.required ? accentColor : 'var(--txt-muted)', fontWeight: field.required ? 600 : 400 }}>Requerido</span></label>
            {field.type !== 'checkbox' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}><input type="checkbox" checked={field.collapsible ?? false} onChange={(e) => onChange({ collapsible: e.target.checked })} style={{ accentColor, width: 13, height: 13 }} /><span style={{ color: (field.collapsible ?? false) ? accentColor : 'var(--txt-muted)', fontWeight: (field.collapsible ?? false) ? 600 : 400 }}>Colapsable</span></label>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
/* ============================================================
   LabelList
   ============================================================ */
function LabelList({ labels, onAdd, onUpdate, onDelete }: {
  labels: BoardLabel[];
  onAdd: (d: { name: string; color: string; icon: string }) => void;
  onUpdate: (id: number, d: { name: string; color: string; icon: string }) => void;
  onDelete: (id: number) => void;
}) {
  const [editId, setEditId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {labels.length === 0 && !showNew && <div className="cpanel__empty"><span style={{ fontSize: 28, opacity: 0.4 }}>🏷️</span><p>No hay etiquetas para este equipo.</p></div>}
      {labels.map((label) => editId === label.Label_ID
        ? <LabelForm key={label.Label_ID} initial={{ name: label.Label_Name, color: label.Label_Color, icon: label.Label_Icon }} onSave={(d) => { onUpdate(label.Label_ID, d); setEditId(null); }} onCancel={() => setEditId(null)} />
        : <ItemRow key={label.Label_ID} color={label.Label_Color} icon={label.Label_Icon} name={label.Label_Name} onEdit={() => { setShowNew(false); setEditId(label.Label_ID); }} onDelete={() => onDelete(label.Label_ID)} />
      )}
      {showNew ? <LabelForm onSave={(d) => { onAdd(d); setShowNew(false); }} onCancel={() => setShowNew(false)} /> : <AddBtn label="Nueva etiqueta" onClick={() => { setEditId(null); setShowNew(true); }} />}
    </div>
  );
}

/* ============================================================
   SprintList
   ============================================================ */
function SprintList({ sprints, onAdd, onUpdate, onRemove }: {
  sprints: Sprint[];
  onAdd: (s: { text: string; startDate: string; endDate: string }) => void;
  onUpdate: (id: number, s: { text: string; startDate: string; endDate: string }) => void;
  onRemove: (id: number) => void;
}) {
  const [editId, setEditId] = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const sorted = [...sprints].sort((a, b) => new Date(b.Sprint_Start_Date).getTime() - new Date(a.Sprint_Start_Date).getTime());
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.length === 0 && !showNew && <div className="cpanel__empty"><span style={{ fontSize: 28, opacity: 0.4 }}>⚡</span><p>No hay sprints definidos.</p></div>}
      {sorted.map((sp) => editId === sp.Sprint_ID
        ? <SprintForm key={sp.Sprint_ID} initial={{ text: sp.Sprint_Text, startDate: sp.Sprint_Start_Date, endDate: sp.Sprint_End_Date }} onSave={(d) => { onUpdate(sp.Sprint_ID, d); setEditId(null); }} onCancel={() => setEditId(null)} />
        : <SprintRow key={sp.Sprint_ID} sprint={sp} onEdit={() => { setShowNew(false); setEditId(sp.Sprint_ID); }} onRemove={() => onRemove(sp.Sprint_ID)} />
      )}
      {showNew ? <SprintForm onSave={(d) => { onAdd(d); setShowNew(false); }} onCancel={() => setShowNew(false)} /> : <AddBtn label="Nuevo sprint" onClick={() => { setEditId(null); setShowNew(true); }} />}
    </div>
  );
}

/* ============================================================
   Formularios reutilizables
   ============================================================ */
function LabelForm({ initial, onSave, onCancel }: {
  initial?: { name: string; color: string; icon: string };
  onSave: (d: { name: string; color: string; icon: string }) => void;
  onCancel: () => void;
}) {
  const [name,  setName]  = useState(initial?.name  ?? '');
  const [color, setColor] = useState(initial?.color ?? '#00c8ff');
  const [icon,  setIcon]  = useState(initial?.icon  ?? '');
  const canSave = name.trim().length > 0;
  return (
    <div className="cpop-form">
      <input
        autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSave) onSave({ name: name.trim(), color, icon });
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Nombre de la etiqueta..." className="cpop-input"
      />
      <EmojiPicker value={icon} onChange={setIcon} />
      <ColorPicker color={color} onChange={setColor} />
      <FormActions canSave={canSave} onSave={() => onSave({ name: name.trim(), color, icon })} onCancel={onCancel} />
    </div>
  );
}
/* ============================================================
   SimpleColorForm — mejorado (sub-equipos)
   ============================================================ */
function SimpleColorForm({ initial, onSave, onCancel }: {
  initial?: { name: string; color: string };
  onSave: (d: { name: string; color: string }) => void;
  onCancel: () => void;
}) {
  const [name, setName]   = useState(initial?.name  ?? '');
  const [color, setColor] = useState(initial?.color ?? '#00c8ff');
  const canSave = name.trim().length > 0;
  return (
    <div className="cpop-form">
      <input
        autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSave) onSave({ name: name.trim(), color });
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Nombre..." className="cpop-input"
      />
      <ColorPicker color={color} onChange={setColor} />
      <FormActions canSave={canSave} onSave={() => onSave({ name: name.trim(), color })} onCancel={onCancel} />
    </div>
  );
}

function SprintRow({ sprint, onEdit, onRemove }: { sprint: Sprint; onEdit: () => void; onRemove: () => void }) {
  const [hov, setHov] = useState(false);
  const now = new Date(); const start = new Date(sprint.Sprint_Start_Date); const end = new Date(sprint.Sprint_End_Date);
  const isActive = now >= start && now <= end; const isPast = now > end;
  const statusColor = isActive ? '#00e5a0' : isPast ? '#b2bec3' : '#fdcb6e';
  const statusLabel = isActive ? 'activo' : isPast ? 'pasado' : 'futuro';
  const fmt = (iso: string) => { const [y, m, d] = iso.split('T')[0].split('-'); return `${d}/${m}/${y.slice(2)}`; };
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 12px', borderRadius: 8, border: `1px solid ${hov ? 'var(--border)' : 'var(--border-subtle)'}`, background: hov ? 'var(--bg-hover)' : 'var(--bg-surface)', transition: 'all 0.12s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--txt)' }}>{sprint.Sprint_Text}</span>
        <span style={{ fontSize: 9, color: statusColor, textTransform: 'uppercase', letterSpacing: 1 }}>{statusLabel}</span>
        <div style={{ display: 'flex', gap: 3, opacity: hov ? 1 : 0, transition: 'opacity 0.12s' }}>
          <SmBtn color="#00c8ff" onClick={onEdit} title="Editar"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg></SmBtn>
          <SmBtn color="#ff4757" onClick={onRemove} title="Eliminar"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg></SmBtn>
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--txt-muted)', paddingLeft: 15 }}>{fmt(sprint.Sprint_Start_Date)} → {fmt(sprint.Sprint_End_Date)}</span>
    </div>
  );
}

/* ============================================================
   SprintForm — mejorado
   ============================================================ */
function SprintForm({ initial, onSave, onCancel }: {
  initial?: { text: string; startDate: string; endDate: string };
  onSave: (d: { text: string; startDate: string; endDate: string }) => void;
  onCancel: () => void;
}) {
  const [text, setText]         = useState(initial?.text      ?? '');
  const [startDate, setStart]   = useState(initial?.startDate ?? '');
  const [endDate, setEnd]       = useState(initial?.endDate   ?? '');
  const dateError = endDate && startDate && endDate < startDate;
  const canSave   = !!(text.trim() && startDate && endDate && !dateError);

  return (
    <div className="cpop-form">
      <input
        autoFocus value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }}
        placeholder="Nombre del sprint..." className="cpop-input"
      />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <FieldLabel>Inicio</FieldLabel>
          <div style={{ position: 'relative' }}>
            <input
              type="date" value={startDate} onChange={(e) => setStart(e.target.value)}
              className="cpop-input cpop-input--date"
              style={{ width: '100%', boxSizing: 'border-box', paddingRight: 8 }}
            />
          </div>
        </div>
        <div>
          <FieldLabel>Fin</FieldLabel>
          <div style={{ position: 'relative' }}>
            <input
              type="date" value={endDate} min={startDate}
              onChange={(e) => setEnd(e.target.value)}
              className="cpop-input cpop-input--date"
              style={{ width: '100%', boxSizing: 'border-box', paddingRight: 8 }}
            />
          </div>
        </div>
      </div>
      {dateError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 6,
          background: '#ff475715', border: '1px solid #ff475740',
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="#ff4757" strokeWidth="1.3"/>
            <path d="M6 3.5v3M6 8.5v.5" stroke="#ff4757" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 10, color: '#ff4757' }}>La fecha fin debe ser posterior al inicio.</span>
        </div>
      )}
      <FormActions canSave={canSave} onSave={() => canSave && onSave({ text: text.trim(), startDate, endDate })} onCancel={onCancel} />
    </div>
  );
}
/* ============================================================
   Primitivos compartidos
   ============================================================ */
function ItemRow({ color, icon, name, onEdit, onDelete }: { color: string; icon?: string; name: string; onEdit: () => void; onDelete: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, border: `1px solid ${hov ? 'var(--border)' : 'var(--border-subtle)'}`, background: hov ? 'var(--bg-hover)' : 'var(--bg-surface)', transition: 'all 0.12s' }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
      <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--txt)' }}>{name}</span>
      <div style={{ display: 'flex', gap: 3, opacity: hov ? 1 : 0, transition: 'opacity 0.12s' }}>
        <SmBtn color="#00c8ff" onClick={onEdit} title="Editar"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg></SmBtn>
        <SmBtn color="#ff4757" onClick={onDelete} title="Eliminar"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg></SmBtn>
      </div>
    </div>
  );
}

/* ============================================================
   EmojiPicker — nuevo componente
   ============================================================ */
function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(8, 1fr)',
      gap: 3,
      padding: '8px',
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      maxHeight: 96,
      overflowY: 'auto',
    }}>
      {EMOJIS.map((e) => (
        <button
          key={e} type="button"
          onClick={() => onChange(value === e ? '' : e)}
          style={{
            width: '100%', aspectRatio: '1', borderRadius: 6, border: 'none',
            fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center',
            justifyContent: 'center', transition: 'all 0.12s',
            background: value === e ? 'var(--accent)22' : 'transparent',
            outline: value === e ? '2px solid var(--accent)' : '2px solid transparent',
            transform: value === e ? 'scale(1.15)' : 'scale(1)',
          }}
        >{e}</button>
      ))}
    </div>
  );
}

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(8, 1fr)',
      gap: 5,
      padding: '8px',
      background: 'var(--bg-panel)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
    }}>
      {COLORS.map((c) => (
        <button
          key={c} type="button" onClick={() => onChange(c)}
          title={c}
          style={{
            width: '100%',
            aspectRatio: '1',
            borderRadius: 5,
            border: 'none',
            background: c,
            cursor: 'pointer',
            transition: 'transform 0.14s ease, outline 0.1s',
            outline: color === c ? `2px solid var(--txt)` : `2px solid transparent`,
            outlineOffset: 1,
            transform: color === c ? 'scale(1.12)' : 'scale(1)',
          }}
        />
      ))}
    </div>
  );
}
function FormActions({ canSave, onSave, onCancel }: { canSave: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
      <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
      <button onClick={() => canSave && onSave()} className={`cpop-btn-save${canSave ? '' : ' cpop-btn-save--disabled'}`}>GUARDAR</button>
    </div>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="cpop-add-btn" style={{ marginTop: 4 }}>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 1v7M1 4.5h7" strokeLinecap="round"/></svg>
      {label}
    </button>
  );
}

function SmBtn({ color, onClick, title, children }: { color: string; onClick: () => void; title: string; children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: 22, height: 22, borderRadius: 5, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hov ? `${color}28` : `${color}12`, color, transition: 'background 0.12s' }}>
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 5 }}>{children}</label>;
}

function FormSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--accent)', flexShrink: 0 }}>{title}</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      </div>
      {children}
    </div>
  );
}