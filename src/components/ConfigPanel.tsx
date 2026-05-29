// src/components/layout/ConfigPanel.tsx
import { useState, useEffect, useRef, startTransition } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '@/store/boardStore';
import {
  useBoardTeams, useLabelsByTeamId,
  useCreateLabel, useUpdateLabel, useDeleteLabel,
  useBoardTemplates, useCreateTemplate, useUpdateTemplate, useDeleteTemplate,
  type BoardTeam,
} from '@/features/requests/hooks/useBoardMetadata';
import { useSprints, useCreateSprint, useUpdateSprint, useDeleteSprint } from '@/features/requests/hooks/useSprints';
import { useSubTeams, useCreateSubTeam, useUpdateSubTeam, useDeleteSubTeam } from '@/features/requests/hooks/useSubTeams';
import { useSubTeamMembers, useSubTeamMembersGrouped, useAddSubTeamMember, useRemoveSubTeamMember } from '@/features/requests/hooks/useSubTeamMembers';import { useUsers } from '@/features/requests/hooks/useUsers';
import { apiClient } from '@/lib/apiClient';
import { useQueryClient } from '@tanstack/react-query';
import { config } from '@/config';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import type { SubTeam } from '@/features/requests/hooks/useSubTeams';
import type { BoardLabel, BoardTemplate } from '@/features/requests/hooks/useBoardMetadata';
import type { TemplateExtraField, FieldType, SimpleField, ConditionalField } from '@/features/requests/templates/types';
import {
  makeEmptySimpleField,
  makeEmptyConditionalField,
  MAX_CONDITIONAL_DEPTH,
} from '@/features/requests/templates/types';
import type { Equipo } from '@/features/requests/types';
import type { Department, Team } from '@/types/commons';
import { useAuth } from '@/auth/AuthProvider';
import {
  useEmailTemplates, useUpdateEmailTemplate, useToggleEmailTemplate,
  useCreateEmailTemplate, useDeleteEmailTemplate,
  useUpdateEmailTemplateMetadata,
  getTemplateVariables, type EmailTemplate,
} from '@/features/requests/hooks/useEmailTemplates';

/* ============================================================
   Constantes
   ============================================================ */
const COLORS = [
  '#ff4757','#ff6b81','#ff7f50','#fdcb6e','#f9ca24','#a3cb38',
  '#00e5a0','#00cec9','#00c8ff','#0984e3','#6c5ce7','#a29bfe',
  '#fd79a8','#e84393','#b2bec3',
];
const EMOJIS = ['🐛','🎨','🖼️','📊','⚙️','🔧','🚀','💡','📋','🔒','🌐','📱','💰','🔔','✅','🧪','🎯','🏷️','🛠️','🏪','📦','🔍','💬','🗂️'];

/** Tipos disponibles para un campo raíz (incluye condicional) */
const FIELD_TYPES_FULL: { value: FieldType; label: string; icon: string }[] = [
  { value: 'text',        label: 'Texto corto',  icon: '✏️' },
  { value: 'textarea',    label: 'Texto largo',   icon: '📝' },
  { value: 'select',      label: 'Desplegable',   icon: '▾'  },
  { value: 'radio',       label: 'Selección',     icon: '◉'  },
  { value: 'checkbox',    label: 'Casilla',       icon: '☑️' },
  { value: 'conditional', label: 'Condicional',   icon: '⑂'  },
];

/** Tipos disponibles para ramas de un campo condicional (sin condicional si ya se llegó al límite) */
function getBranchFieldTypes(currentDepth: number): { value: FieldType; label: string; icon: string }[] {
  if (currentDepth >= MAX_CONDITIONAL_DEPTH) {
    return FIELD_TYPES_FULL.filter((f) => f.value !== 'conditional');
  }
  return FIELD_TYPES_FULL;
}

const TEAM_CODE_COLORS: Record<string, string> = {
  desarrollo: '#378ADD',
  crm:        '#1D9E75',
  sistemas:   '#EF9F27',
  analisis:   '#7F77DD',
};

type Section = 'labels' | 'subteams' | 'sprints' | 'templates' | 'users' | 'emails';

const NAV_ITEMS: { key: Section; label: string; icon: string }[] = [
  { key: 'labels',    label: 'Etiquetas',   icon: '🏷️' },
  { key: 'subteams',  label: 'Sub-equipos', icon: '👥' },
  { key: 'sprints',   label: 'Sprints',     icon: '⚡' },
  { key: 'templates', label: 'Templates',   icon: '📋' },
  { key: 'users',     label: 'Usuarios',    icon: '👤' },
  { key: 'emails',    label: 'Correos',     icon: '✉️' },
];

/* ============================================================
   Tipos para la sección Usuarios
   ============================================================ */
type ManagedUser = {
  User_ID:       number;
  User_Name:     string;
  User_Email:    string;
  User_Role:     string;
  Department_ID: number | null;
  Team_ID:       number | null;
  Is_New:        boolean;
  Is_Active:     boolean;
  department: { Department_ID: number; Department_Name: string; Department_Code: string } | null;
  team:       { Team_ID: number; Team_Name: string; Team_Code: string } | null;
};

/* ============================================================
   NavTeamSwitcher
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

  const createLabel = useCreateLabel(boardId, teamId);
  const updateLabel = useUpdateLabel(boardId, teamId);
  const deleteLabel = useDeleteLabel(boardId, teamId);

  const createSprint   = useCreateSprint();
  const updateSprint   = useUpdateSprint();
  const deleteSprint   = useDeleteSprint();
  const createSubTeam  = useCreateSubTeam(teamId);
  const updateSubTeam  = useUpdateSubTeam(teamId);
  const deleteSubTeam  = useDeleteSubTeam(teamId);
  const createTemplate = useCreateTemplate(boardId);
  const updateTemplate = useUpdateTemplate(boardId);
  const deleteTemplate = useDeleteTemplate(boardId);
  const { data: emailTemplates = [] } = useEmailTemplates(boardId);
  const updateEmailTemplate         = useUpdateEmailTemplate(boardId);
  const toggleEmailTemplate         = useToggleEmailTemplate(boardId);
  const createEmailTemplate         = useCreateEmailTemplate(boardId);
  const deleteEmailTemplate         = useDeleteEmailTemplate(boardId);
  const updateEmailTemplateMetadata = useUpdateEmailTemplateMetadata(boardId);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [onClose]);

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const activeNav = NAV_ITEMS.find((n) => n.key === section)!;
  const showTeamSwitcher = section !== 'users' && section !== 'sprints' && section !== 'templates' && section !== 'emails';

  return createPortal(
    <div className="cpanel-backdrop" onClick={handleBackdrop}>
      <div ref={panelRef} className="cpanel">
        <div className="cpanel__accent-line" />
        <div className="cpanel__layout">

          {/* ── Nav lateral ── */}
          <aside className="cpanel__nav">
            <div className="cpanel__nav-header">
              <span className="cpanel__nav-title">Config</span>
              {showTeamSwitcher && (
                <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', opacity: 0.6, paddingLeft: 2 }}>
                    Equipo
                  </span>
                  <NavTeamSwitcher teams={teams} equipoActivo={equipoActivo} />
                </div>
              )}
            </div>

            <div className="cpanel__nav-group">
              <span className="cpanel__nav-group-label">Board</span>
              {NAV_ITEMS.filter((n) => n.key !== 'templates' && n.key !== 'users' && n.key !== 'emails').map((item) => (
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
              <button onClick={() => setSection('emails')}
                className={`cpanel__nav-item${section === 'emails' ? ' cpanel__nav-item--active' : ''}`}>
                <span className="cpanel__nav-item-icon">✉️</span>
                <span>Correos</span>
              </button>
              <button onClick={() => setSection('users')}
                className={`cpanel__nav-item${section === 'users' ? ' cpanel__nav-item--active' : ''}`}>
                <span className="cpanel__nav-item-icon">👤</span>
                <span>Usuarios</span>
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
                  {section === 'users' && (
                    <p className="cpanel__content-subtitle">Gestión de roles y asignación de equipos</p>
                  )}
                  {section !== 'templates' && section !== 'users' && !teamId && (
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
                  {section === 'emails' && (
                    <p className="cpanel__content-subtitle">Templates HTML por evento</p>
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
                <LabelList
                  labels={labels}
                  onAdd={(d) => createLabel.mutate(d)}
                  onUpdate={(id, d) => updateLabel.mutate({ id, ...d })}
                  onDelete={(id) => deleteLabel.mutate(id)}
                />
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

              {section === 'users' && <UserList />}
              {section === 'emails' && (
                <EmailTemplateList
                  templates={emailTemplates}
                  onUpdate={(id, d) => updateEmailTemplate.mutate({ id, ...d })}
                  onToggle={(id, isActive) => toggleEmailTemplate.mutate({ id, isActive })}
                  onCreate={(d) => createEmailTemplate.mutate(d)}
                  onDelete={(id) => deleteEmailTemplate.mutate(id)}
                  onUpdateMetadata={(id, d) => updateEmailTemplateMetadata.mutate({ id, ...d })}
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
   UserList
   ============================================================ */
function UserList() {
  const qc = useQueryClient();
  const { dbUser, refreshDbUser } = useAuth();
  const [users,       setUsers]       = useState<ManagedUser[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [editId,      setEditId]      = useState<number | null>(null);
  const [search,      setSearch]      = useState('');
  const [showPreReg,  setShowPreReg]  = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await apiClient.call<ManagedUser[]>('fetchAllUsers', {});
        setUsers(data);
      } catch {
        // fallo silencioso
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleUpdate(updated: ManagedUser) {
    setUsers((prev) => prev.map((u) => u.User_ID === updated.User_ID ? updated : u));
    setEditId(null);
    qc.invalidateQueries({ queryKey: ['allUsers'] });
    if (dbUser && updated.User_ID === dbUser.User_ID) {
      await refreshDbUser();
    }
  }

  async function handlePreRegister(newUser: ManagedUser) {
    setUsers((prev) => [...prev, newUser]);
    setShowPreReg(false);
  }

  async function handleDeactivate(userId: number) {
    try {
      await apiClient.call('deactivateUser', { userId });
      setUsers((prev) => prev.map((u) => u.User_ID === userId ? { ...u, Is_Active: false } : u));
      qc.invalidateQueries({ queryKey: ['allUsers'] });
    } catch {
      // fallo silencioso
    }
  }

  async function handleReactivate(userId: number) {
    try {
      await apiClient.call('reactivateUser', { userId });
      setUsers((prev) => prev.map((u) => u.User_ID === userId ? { ...u, Is_Active: true } : u));
      qc.invalidateQueries({ queryKey: ['allUsers'] });
    } catch {
      // fallo silencioso
    }
  }

  const visibleUsers = users.filter((u) => showInactive ? !u.Is_Active : (u.Is_Active !== false));

  const filtered = visibleUsers.filter((u) =>
    u.User_Name.toLowerCase().includes(search.toLowerCase()) ||
    u.User_Email.toLowerCase().includes(search.toLowerCase())
  );

  const groups = filtered.reduce<Record<string, ManagedUser[]>>((acc, user) => {
    const key = user.department?.Department_Name ?? '__sin_equipo__';
    if (!acc[key]) acc[key] = [];
    acc[key].push(user);
    return acc;
  }, {});

  const sortedKeys = Object.keys(groups).sort((a, b) => {
    if (a === '__sin_equipo__') return -1;
    if (b === '__sin_equipo__') return  1;
    return a.localeCompare(b);
  });

  const inactiveCount = users.filter((u) => u.Is_Active === false).length;

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 64, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
        ))}
      </div>
    );
  }

  if (editId !== null) {
    const user = users.find((u) => u.User_ID === editId);
    if (user) return <UserEditForm user={user} onSave={handleUpdate} onCancel={() => setEditId(null)} />;
  }

  if (showPreReg) {
    return <PreRegisterForm onSave={handlePreRegister} onCancel={() => setShowPreReg(false)} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre o correo…"
          className="cpop-input"
          style={{ flex: 1 }}
        />
        <button
          onClick={() => setShowPreReg(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 14px', borderRadius: 7, border: '1px solid rgba(0,200,255,0.3)',
            background: 'rgba(0,200,255,0.08)', color: 'var(--accent)',
            fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            transition: 'all 0.15s', flexShrink: 0,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,200,255,0.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,200,255,0.08)'; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M5 1v8M1 5h8" strokeLinecap="round"/>
          </svg>
          Pre-registrar
        </button>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => setShowInactive(false)}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${!showInactive ? 'rgba(0,229,160,0.4)' : 'var(--border-subtle)'}`,
            background: !showInactive ? 'rgba(0,229,160,0.08)' : 'transparent',
            color: !showInactive ? '#00e5a0' : 'var(--txt-muted)', transition: 'all 0.12s',
          }}
        >
          Activos ({users.filter((u) => u.Is_Active !== false).length})
        </button>
        <button
          onClick={() => setShowInactive(true)}
          style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${showInactive ? 'rgba(255,71,87,0.4)' : 'var(--border-subtle)'}`,
            background: showInactive ? 'rgba(255,71,87,0.08)' : 'transparent',
            color: showInactive ? '#ff4757' : 'var(--txt-muted)', transition: 'all 0.12s',
          }}
        >
          Inactivos ({inactiveCount})
        </button>
      </div>

      {filtered.length === 0 && (
        <div className="cpanel__empty">
          <span style={{ fontSize: 28, opacity: 0.4 }}>👤</span>
          <p>{search ? 'Sin resultados.' : showInactive ? 'No hay usuarios inactivos.' : 'No hay usuarios registrados.'}</p>
        </div>
      )}

      {sortedKeys.map((key) => (
        <div key={key}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
              color: key === '__sin_equipo__' ? 'var(--txt-muted)' : 'var(--accent)', flexShrink: 0,
            }}>
              {key === '__sin_equipo__' ? 'Sin equipo' : key}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              color: 'var(--txt-muted)', flexShrink: 0,
            }}>
              {groups[key].length}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {groups[key].map((user) => (
              <UserRow
                key={user.User_ID}
                user={user}
                onEdit={() => setEditId(user.User_ID)}
                onDeactivate={() => handleDeactivate(user.User_ID)}
                onReactivate={() => handleReactivate(user.User_ID)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   UserRow
   ============================================================ */
function UserRow({ user, onEdit, onDeactivate, onReactivate }: {
  user:         ManagedUser;
  onEdit:       () => void;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  const [hov,     setHov]     = useState(false);
  const [confirm, setConfirm] = useState(false);

  const isAdmin    = user.User_Role === 'admin';
  const isPreReg   = user.User_Name === '';
  const isInactive = user.Is_Active === false;
  const initials   = isPreReg
    ? '?'
    : user.User_Name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  function handleDeactivateClick() {
    if (!confirm) { setConfirm(true); return; }
    setConfirm(false);
    onDeactivate();
  }

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => { setHov(false); setConfirm(false); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 14px', borderRadius: 10,
        border: `1px solid ${hov ? 'var(--border)' : isInactive ? 'rgba(255,71,87,0.15)' : isPreReg ? 'rgba(162,155,254,0.2)' : 'var(--border-subtle)'}`,
        background: hov ? 'var(--bg-hover)' : isInactive ? 'rgba(255,71,87,0.03)' : isPreReg ? 'rgba(162,155,254,0.03)' : 'var(--bg-surface)',
        transition: 'all 0.12s',
        opacity: isInactive ? 0.6 : 1,
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
        background: isInactive ? 'rgba(255,71,87,0.08)' : isPreReg ? 'rgba(162,155,254,0.1)' : isAdmin ? 'rgba(0,200,255,0.15)' : 'var(--bg-panel)',
        border: `1px solid ${isInactive ? 'rgba(255,71,87,0.25)' : isPreReg ? 'rgba(162,155,254,0.3)' : isAdmin ? 'rgba(0,200,255,0.3)' : 'var(--border-subtle)'}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: isPreReg ? 16 : 12, fontWeight: 700,
        color: isInactive ? '#ff4757' : isPreReg ? '#a29bfe' : isAdmin ? 'var(--accent)' : 'var(--txt-muted)',
        textDecoration: isInactive ? 'line-through' : 'none',
      }}>
        {isInactive ? '🚫' : isPreReg ? '⏳' : initials}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{
            fontSize: 13, fontWeight: 600,
            color: isInactive ? 'var(--txt-muted)' : isPreReg ? 'var(--txt-muted)' : 'var(--txt)',
            fontStyle: isPreReg ? 'italic' : 'normal',
            textDecoration: isInactive ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {isPreReg ? user.User_Email : user.User_Name}
          </span>
          {isInactive && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, flexShrink: 0, background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757' }}>Inactivo</span>
          )}
          {!isInactive && !isPreReg && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, flexShrink: 0, background: isAdmin ? 'rgba(0,200,255,0.12)' : 'var(--bg-panel)', border: `1px solid ${isAdmin ? 'rgba(0,200,255,0.3)' : 'var(--border-subtle)'}`, color: isAdmin ? 'var(--accent)' : 'var(--txt-muted)' }}>
              {isAdmin ? 'Admin' : 'Member'}
            </span>
          )}
          {!isInactive && isPreReg && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, flexShrink: 0, background: 'rgba(162,155,254,0.12)', border: '1px solid rgba(162,155,254,0.3)', color: '#a29bfe' }}>Pre-reg</span>
          )}
          {!isInactive && !isPreReg && user.Is_New && (
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4, flexShrink: 0, background: 'rgba(253,203,110,0.12)', border: '1px solid rgba(253,203,110,0.35)', color: '#fdcb6e' }}>Onboarding</span>
          )}
        </div>
        {!isPreReg && (
          <div style={{ fontSize: 11, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.User_Email}</div>
        )}
        <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: isPreReg ? 0 : 2, opacity: 0.7 }}>
          {user.department?.Department_Name ?? '—'}{user.team ? ` · ${user.team.Team_Name}` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        {isInactive ? (
          <button onClick={onReactivate} title="Reactivar usuario"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: '1px solid rgba(0,229,160,0.35)', background: 'rgba(0,229,160,0.08)', color: '#00e5a0', fontSize: 10, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,229,160,0.18)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,229,160,0.08)'; }}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1.5 5l2.5 2.5L8.5 2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Reactivar
          </button>
        ) : (
          <>
            <SmBtn color="#00c8ff" onClick={onEdit} title="Editar usuario">
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg>
            </SmBtn>
            <button onClick={handleDeactivateClick} title={confirm ? 'Click para confirmar' : 'Desactivar usuario'}
              style={{ display: 'flex', alignItems: 'center', gap: confirm ? 5 : 0, padding: confirm ? '4px 10px' : '4px 6px', borderRadius: 6, border: `1px solid ${confirm ? 'rgba(255,71,87,0.5)' : 'rgba(255,71,87,0.2)'}`, background: confirm ? 'rgba(255,71,87,0.15)' : 'rgba(255,71,87,0.06)', color: '#ff4757', fontSize: 10, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap' }}>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="6" cy="4" r="2.5"/><path d="M1 11c0-2.76 2.24-5 5-5s5 2.24 5 5" strokeLinecap="round"/><path d="M9 1l3 3M12 1L9 4" strokeLinecap="round"/></svg>
              {confirm && <span>¿Confirmar?</span>}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   UserEditForm
   ============================================================ */
function UserEditForm({ user, onSave, onCancel }: {
  user: ManagedUser; onSave: (updated: ManagedUser) => void; onCancel: () => void;
}) {
  const [role,         setRole]         = useState<'admin' | 'member'>(user.User_Role === 'admin' ? 'admin' : 'member');
  const [departmentId, setDepartmentId] = useState<number | null>(user.Department_ID);
  const [teamId,       setTeamId]       = useState<number | null>(user.Team_ID);
  const [isNew,        setIsNew]        = useState<boolean>(user.Is_New);
  const [departments,  setDepartments]  = useState<Department[]>([]);
  const [teams,        setTeams]        = useState<Team[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState(false);

  useEffect(() => {
    apiClient.call<Department[]>('getDepartments', {}).then(setDepartments).catch(() => {}).finally(() => setLoadingDepts(false));
  }, []);

  useEffect(() => {
    if (departmentId === null) { setTeams([]); return; }
    setLoadingTeams(true);
    apiClient.call<Team[]>('getTeamsByDepartment', { departmentId }).then(setTeams).catch(() => setTeams([])).finally(() => setLoadingTeams(false));
  }, [departmentId]);

  async function handleSave() {
    setSaving(true); setError(false);
    try {
      const updated = await apiClient.call<ManagedUser>('updateUser', { userId: user.User_ID, role, departmentId, teamId, isNew });
      onSave(updated);
    } catch { setError(true); } finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <div style={{ flex: 1 }}><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>{user.User_Name}</span><div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{user.User_Email}</div></div>
      </div>
      <div>
        <FieldLabel>Rol de acceso</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['member', 'admin'] as const).map((r) => (
            <button key={r} onClick={() => setRole(r)} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${role === r ? (r === 'admin' ? 'rgba(0,200,255,0.4)' : 'rgba(162,155,254,0.4)') : 'var(--border-subtle)'}`, background: role === r ? (r === 'admin' ? 'rgba(0,200,255,0.08)' : 'rgba(162,155,254,0.08)') : 'transparent', transition: 'all 0.15s' }}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{r === 'admin' ? '🔑' : '👤'}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: role === r ? (r === 'admin' ? 'var(--accent)' : '#a29bfe') : 'var(--txt-muted)' }}>{r === 'admin' ? 'Administrador' : 'Member'}</div>
              <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: 2 }}>{r === 'admin' ? 'Acceso completo (TI)' : 'Solo puede enviar solicitudes'}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <FieldLabel>Departamento</FieldLabel>
        {loadingDepts ? <div style={{ height: 36, borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} /> : (
          <select className="cpop-input" value={departmentId ?? ''} onChange={(e) => { setDepartmentId(e.target.value ? Number(e.target.value) : null); setTeamId(null); }}>
            <option value="">Sin departamento</option>
            {departments.map((d) => <option key={d.Department_ID} value={d.Department_ID}>{d.Department_Name}</option>)}
          </select>
        )}
      </div>
      <div>
        <FieldLabel>Equipo</FieldLabel>
        {loadingTeams ? <div style={{ height: 36, borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} /> : (
          <select className="cpop-input" value={teamId ?? ''} disabled={departmentId === null} onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{departmentId === null ? 'Primero selecciona departamento' : 'Sin equipo'}</option>
            {teams.map((t) => <option key={t.Team_ID} value={t.Team_ID}>{t.Team_Name}</option>)}
          </select>
        )}
      </div>
      <div>
        <FieldLabel>Estado de registro</FieldLabel>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${isNew ? 'rgba(253,203,110,0.35)' : 'var(--border-subtle)'}`, background: isNew ? 'rgba(253,203,110,0.06)' : 'transparent', transition: 'all 0.15s' }}>
          <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} style={{ accentColor: '#fdcb6e', width: 14, height: 14 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: isNew ? '#fdcb6e' : 'var(--txt-muted)' }}>{isNew ? 'Pendiente de onboarding' : 'Onboarding completado'}</div>
            <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>Activar para que el usuario vea el selector de área al próximo login</div>
          </div>
        </label>
      </div>
      {error && <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', fontSize: 12, color: '#ff4757' }}>Error al guardar. Intenta de nuevo.</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
        <button onClick={handleSave} disabled={saving} className={`cpop-btn-save${saving ? ' cpop-btn-save--disabled' : ''}`}>{saving ? 'Guardando…' : 'GUARDAR'}</button>
      </div>
    </div>
  );
}

/* ============================================================
   PreRegisterForm
   ============================================================ */
function PreRegisterForm({ onSave, onCancel }: {
  onSave: (user: ManagedUser) => void; onCancel: () => void;
}) {
  const [email,        setEmail]        = useState('');
  const [role,         setRole]         = useState<'admin' | 'member'>('member');
  const [departmentId, setDepartmentId] = useState<number | null>(null);
  const [teamId,       setTeamId]       = useState<number | null>(null);
  const [isNew,        setIsNew]        = useState(false);
  const [departments,  setDepartments]  = useState<Department[]>([]);
  const [teams,        setTeams]        = useState<Team[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [loadingTeams, setLoadingTeams] = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSave    = emailValid && !saving;

  useEffect(() => {
    apiClient.call<Department[]>('getDepartments', {}).then(setDepartments).catch(() => {}).finally(() => setLoadingDepts(false));
  }, []);

  useEffect(() => {
    if (departmentId === null) { setTeams([]); setTeamId(null); return; }
    setLoadingTeams(true);
    apiClient.call<Team[]>('getTeamsByDepartment', { departmentId }).then(setTeams).catch(() => setTeams([])).finally(() => setLoadingTeams(false));
  }, [departmentId]);

  async function handleSave() {
    if (!canSave) return;
    setSaving(true); setError(null);
    try {
      const newUser = await apiClient.call<ManagedUser>('preRegisterUser', { email: email.trim(), role, departmentId, teamId, isNew });
      onSave(newUser);
    } catch (err) { setError((err as Error).message ?? 'Error al pre-registrar.'); } finally { setSaving(false); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <div style={{ flex: 1 }}><span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)' }}>Pre-registrar usuario</span><div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>El usuario se vinculará al entrar por primera vez con este correo</div></div>
      </div>
      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="7" cy="7" r="6" stroke="var(--accent)" strokeWidth="1.3"/><path d="M7 5v4M7 3.5v.5" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round"/></svg>
        <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: 0, lineHeight: 1.5 }}>Cuando este usuario inicie sesión con Microsoft, el sistema lo detectará por su correo y le asignará automáticamente el rol y equipo configurados acá.</p>
      </div>
      <div>
        <FieldLabel>Correo corporativo *</FieldLabel>
        <input autoFocus type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="usuario@empresa.com" className="cpop-input" />
        {email && !emailValid && <p style={{ fontSize: 10, color: '#ff4757', margin: '4px 0 0', paddingLeft: 2 }}>Ingresá un correo válido.</p>}
      </div>
      <div>
        <FieldLabel>Rol de acceso</FieldLabel>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['member', 'admin'] as const).map((r) => (
            <button key={r} onClick={() => setRole(r)} style={{ flex: 1, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${role === r ? (r === 'admin' ? 'rgba(0,200,255,0.4)' : 'rgba(162,155,254,0.4)') : 'var(--border-subtle)'}`, background: role === r ? (r === 'admin' ? 'rgba(0,200,255,0.08)' : 'rgba(162,155,254,0.08)') : 'transparent', transition: 'all 0.15s' }}>
              <div style={{ fontSize: 16, marginBottom: 4 }}>{r === 'admin' ? '🔑' : '👤'}</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: role === r ? (r === 'admin' ? 'var(--accent)' : '#a29bfe') : 'var(--txt-muted)' }}>{r === 'admin' ? 'Administrador' : 'Member'}</div>
              <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: 2 }}>{r === 'admin' ? 'Acceso completo (TI)' : 'Solo puede enviar solicitudes'}</div>
            </button>
          ))}
        </div>
      </div>
      <div>
        <FieldLabel>Departamento</FieldLabel>
        {loadingDepts ? <div style={{ height: 36, borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} /> : (
          <select className="cpop-input" value={departmentId ?? ''} onChange={(e) => { setDepartmentId(e.target.value ? Number(e.target.value) : null); setTeamId(null); }}>
            <option value="">Sin departamento</option>
            {departments.map((d) => <option key={d.Department_ID} value={d.Department_ID}>{d.Department_Name}</option>)}
          </select>
        )}
      </div>
      <div>
        <FieldLabel>Equipo</FieldLabel>
        {loadingTeams ? <div style={{ height: 36, borderRadius: 7, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} /> : (
          <select className="cpop-input" value={teamId ?? ''} disabled={departmentId === null} onChange={(e) => setTeamId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">{departmentId === null ? 'Primero selecciona departamento' : 'Sin equipo'}</option>
            {teams.map((t) => <option key={t.Team_ID} value={t.Team_ID}>{t.Team_Name}</option>)}
          </select>
        )}
      </div>
      <div>
        <FieldLabel>Estado de registro</FieldLabel>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${isNew ? 'rgba(253,203,110,0.35)' : 'var(--border-subtle)'}`, background: isNew ? 'rgba(253,203,110,0.06)' : 'transparent', transition: 'all 0.15s' }}>
          <input type="checkbox" checked={isNew} onChange={(e) => setIsNew(e.target.checked)} style={{ accentColor: '#fdcb6e', width: 14, height: 14 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: isNew ? '#fdcb6e' : 'var(--txt-muted)' }}>{isNew ? 'Pendiente de onboarding' : 'Onboarding completado'}</div>
            <div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>{isNew ? 'El usuario verá el selector de área al primer login' : 'El usuario entrará directo al sistema con el equipo pre-asignado'}</div>
          </div>
        </label>
      </div>
      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(162,155,254,0.06)', border: '1px solid rgba(162,155,254,0.2)', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: 'rgba(162,155,254,0.1)', border: '1px solid rgba(162,155,254,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>⏳</div>
        <div><div style={{ fontSize: 12, fontWeight: 600, color: '#a29bfe' }}>{email.trim() || 'usuario@empresa.com'}</div><div style={{ fontSize: 10, color: 'var(--txt-muted)' }}>Pendiente de primer login</div></div>
        <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: 'rgba(162,155,254,0.12)', border: '1px solid rgba(162,155,254,0.3)', color: '#a29bfe', flexShrink: 0 }}>PRE-REG</span>
      </div>
      {error && <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', fontSize: 12, color: '#ff4757' }}>{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
        <button onClick={handleSave} disabled={!canSave} className={`cpop-btn-save${!canSave ? ' cpop-btn-save--disabled' : ''}`}>{saving ? 'Registrando…' : 'PRE-REGISTRAR'}</button>
      </div>
    </div>
  );
}

/* ============================================================
   SubTeamList
   ============================================================ */
function SubTeamList({ subTeams, onAdd, onUpdate, onRemove }: {
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

/* ============================================================
   TemplateList
   ============================================================ */
type TemplateMutationPayload = {
  name: string; description: string; icon: string; color: string;
  badge: string; formSchema: TemplateExtraField[]; teamIds: number[]; isActive: boolean;
};

function TemplateList({ templates, teams, onAdd, onUpdate, onDelete }: {
  templates: BoardTemplate[];
  teams: { Board_Team_ID: number; Board_Team_Name: string }[];
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
function normalizeBranches(field: TemplateExtraField): TemplateExtraField {
  if (field.type !== 'conditional') return field;
  const cf = field as ConditionalField;
  const toArray = (v: unknown): TemplateExtraField[] => {
    if (Array.isArray(v)) return (v as TemplateExtraField[]).map(normalizeBranches);
    if (v && typeof v === 'object') return [normalizeBranches(v as TemplateExtraField)];
    return [makeEmptySimpleField(0)];
  };
  return { ...cf, trueBranch: toArray(cf.trueBranch), falseBranch: toArray(cf.falseBranch) };
}

function normalizeSchema(schema: TemplateExtraField[]): TemplateExtraField[] {
  return (schema ?? []).map(normalizeBranches);
}

function TemplateForm({ initial, teams, onSave, onCancel }: {
  initial?: TemplateMutationPayload;
  teams: { Board_Team_ID: number; Board_Team_Name: string }[];
  onSave: (d: TemplateMutationPayload) => void; onCancel: () => void;
}) {
  const [name,        setName]        = useState(initial?.name        ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [icon,        setIcon]        = useState(initial?.icon        ?? '📋');
  const [color,       setColor]       = useState(initial?.color       ?? '#00c8ff');
  const [badge,       setBadge]       = useState(initial?.badge       ?? '');
  const [teamIds,     setTeamIds]     = useState<number[]>(initial?.teamIds ?? []);
  const [isActive,    setIsActive]    = useState(initial?.isActive    ?? true);
  const [fields,      setFields]      = useState<TemplateExtraField[]>(normalizeSchema(initial?.formSchema ?? []));
  const [tab,         setTab]         = useState<'info' | 'fields'>('info');
  const canSave = name.trim().length > 0;

  function handleSave() {
    if (!canSave) return;
    onSave({ name: name.trim(), description: description.trim(), icon, color, badge: badge.trim() || name.trim(), formSchema: fields, teamIds, isActive });
  }

  function addField() { setFields((p) => [...p, makeEmptySimpleField(p.length + 1)]); }
  function updateField(idx: number, patch: Partial<TemplateExtraField>) {
    setFields((p) => p.map((f, i) => i === idx ? { ...f, ...patch } as TemplateExtraField : f));
  }
  function removeField(idx: number) { setFields((p) => p.filter((_, i) => i !== idx)); }
  function moveField(idx: number, dir: -1 | 1) {
    setFields((p) => { const n = [...p]; const s = idx + dir; if (s < 0 || s >= n.length) return p; [n[idx], n[s]] = [n[s], n[idx]]; return n; });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', flex: 1 }}>{initial ? `Editar: ${initial.name}` : 'Nuevo template'}</span>
        <button onClick={handleSave} disabled={!canSave} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: canSave ? `linear-gradient(135deg, var(--accent-2), ${color})` : 'var(--bg-surface)', color: canSave ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', letterSpacing: 1 }}>GUARDAR</button>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', gap: 4, marginBottom: 12, padding: '4px', background: 'var(--bg-surface)', borderRadius: 8 }}>
        {(['info', 'fields'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', cursor: 'pointer', background: tab === t ? color : 'transparent', color: tab === t ? 'white' : 'var(--txt-muted)', transition: 'all 0.15s' }}>
            {t === 'info' ? '⚙️ Info' : `🔧 Campos (${fields.length})`}
          </button>
        ))}
      </div>
      {tab === 'info' && (
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 20, paddingRight: 2 }}>
          <FormSection title="Identidad">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div><FieldLabel>Nombre *</FieldLabel><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Soporte Dev" className="cpop-input" /></div>
              <div><FieldLabel>Badge corto</FieldLabel><input value={badge} onChange={(e) => setBadge(e.target.value)} placeholder="Ej: Dev" className="cpop-input" /></div>
            </div>
            <div><FieldLabel>Descripción</FieldLabel><textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="¿Para qué sirve este template?" rows={2} style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '7px 9px', fontSize: 12, color: 'var(--txt)', resize: 'none', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} /></div>
          </FormSection>
          <FormSection title="Visual">
            <div><FieldLabel>Icono</FieldLabel><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, 32px)', gap: 4 }}>{EMOJIS.map((e) => <button key={e} type="button" onClick={() => setIcon(icon === e ? '📋' : e)} className={`cpop-emoji${icon === e ? ' cpop-emoji--active' : ''}`}>{e}</button>)}</div></div>
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
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 2, paddingBottom: 8 }}>
            {fields.length === 0 && <div className="cpanel__empty"><span style={{ fontSize: 32, opacity: 0.3 }}>🔧</span><p>Sin campos adicionales.</p><p style={{ fontSize: 11 }}>El formulario solo tendrá título y descripción.</p></div>}
            {fields.map((field, idx) => (
              <FieldEditor key={idx} field={field} index={idx} total={fields.length} accentColor={color} depth={0}
                onChange={(patch) => updateField(idx, patch)} onRemove={() => removeField(idx)} onMove={(dir) => moveField(idx, dir)} />
            ))}
          </div>
          <div style={{ flexShrink: 0, paddingTop: 8, borderTop: `1px solid var(--border-subtle)` }}>
            <button onClick={addField} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', width: '100%', borderRadius: 8, border: `2px dashed ${color}40`, background: `${color}05`, color, fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = `${color}10`; e.currentTarget.style.borderColor = `${color}70`; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = `${color}05`; e.currentTarget.style.borderColor = `${color}40`; }}>
              + Agregar campo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   FieldEditor — con showInModal y showInCard
   ============================================================ */
function FieldEditor({ field, index, total, accentColor, depth, onChange, onRemove, onMove }: {
  field: TemplateExtraField; index: number; total: number; accentColor: string; depth: number;
  onChange: (patch: Partial<TemplateExtraField>) => void; onRemove: () => void; onMove: (dir: -1 | 1) => void;
}) {
  const [expanded,    setExpanded]    = useState(true);
  const [optionInput, setOptionInput] = useState('');

  const isConditional  = field.type === 'conditional';
  const needsOptions   = field.type === 'select' || field.type === 'radio';
  const availableTypes = getBranchFieldTypes(depth);

  const depthColors  = ['#00c8ff', '#a29bfe', '#00e5a0', '#fdcb6e', '#fd79a8'];
  const depthColor   = depthColors[Math.min(depth, depthColors.length - 1)];
  const effectiveAccent = depth === 0 ? accentColor : depthColor;

  // Leer flags con defaults retrocompatibles
  const showInModal = (field as { showInModal?: boolean }).showInModal ?? true;
  const showInCard  = (field as { showInCard?: boolean }).showInCard  ?? false;

  function addOption() {
    const v = optionInput.trim();
    if (!v || isConditional) return;
    onChange({ options: [...((field as SimpleField).options ?? []), v] });
    setOptionInput('');
  }

  function updateBranchField(branch: 'trueBranch' | 'falseBranch', idx: number, patch: Partial<TemplateExtraField>) {
    if (!isConditional) return;
    const current = [...(field as ConditionalField)[branch]];
    current[idx] = { ...current[idx], ...patch } as TemplateExtraField;
    onChange({ [branch]: current });
  }

  function addBranchField(branch: 'trueBranch' | 'falseBranch') {
    if (!isConditional) return;
    const current = (field as ConditionalField)[branch];
    onChange({ [branch]: [...current, makeEmptySimpleField(current.length + 1)] });
  }

  function removeBranchField(branch: 'trueBranch' | 'falseBranch', idx: number) {
    if (!isConditional) return;
    const current = (field as ConditionalField)[branch];
    if (current.length <= 1) return;
    onChange({ [branch]: current.filter((_, i) => i !== idx) });
  }

  function moveBranchField(branch: 'trueBranch' | 'falseBranch', idx: number, dir: -1 | 1) {
    if (!isConditional) return;
    const current = [...(field as ConditionalField)[branch]];
    const s = idx + dir;
    if (s < 0 || s >= current.length) return;
    [current[idx], current[s]] = [current[s], current[idx]];
    onChange({ [branch]: current });
  }

  function handleTypeChange(newType: FieldType) {
    // Preservar showInModal y showInCard al cambiar tipo
    const keepFlags = { showInModal, showInCard };
    if (newType === 'conditional') {
      const emptyConditional = makeEmptyConditionalField(index);
      onChange({ ...emptyConditional, key: field.key || emptyConditional.key, label: field.label || emptyConditional.label, ...keepFlags } as Partial<TemplateExtraField>);
    } else {
      const patch: Partial<SimpleField> = { type: newType as SimpleField['type'], key: field.key, label: field.label, required: field.required, collapsible: field.collapsible ?? false, placeholder: undefined, options: undefined, ...keepFlags };
      if (newType === 'checkbox') delete patch.placeholder;
      onChange(patch as Partial<TemplateExtraField>);
    }
  }

  const typeLabel = FIELD_TYPES_FULL.find((f) => f.value === field.type)?.label ?? field.type;
  const typeIcon  = FIELD_TYPES_FULL.find((f) => f.value === field.type)?.icon  ?? '';

  return (
    <div style={{ borderRadius: 10, border: `1px solid ${expanded ? effectiveAccent + '35' : 'var(--border-subtle)'}`, background: 'var(--bg-surface)', transition: 'border-color 0.15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', background: expanded ? `${effectiveAccent}06` : 'transparent', borderBottom: expanded ? `1px solid ${effectiveAccent}15` : 'none' }}>
        <div style={{ width: 22, height: 22, borderRadius: 5, background: `${effectiveAccent}20`, border: `1px solid ${effectiveAccent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: effectiveAccent, flexShrink: 0 }}>{index + 1}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.label || <span style={{ color: 'var(--txt-muted)', fontWeight: 400 }}>Sin nombre</span>}</div>
          <div style={{ fontSize: 10, color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <span>{typeIcon}</span><span>{typeLabel}</span>
            {field.required    && <span>· requerido</span>}
            {field.collapsible && <span>· colapsable</span>}
            {/* Indicadores de visibilidad en el header colapsado */}
            {!showInModal && <span style={{ color: '#ff4757' }}>· oculto modal</span>}
            {showInCard   && <span style={{ color: '#00e5a0' }}>· en card</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 3 }}>
          {index > 0 && depth === 0 && <SmBtn color="var(--txt-muted)" onClick={() => onMove(-1)} title="Subir"><svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 5l3-3 3 3" strokeLinecap="round"/></svg></SmBtn>}
          {index < total - 1 && depth === 0 && <SmBtn color="var(--txt-muted)" onClick={() => onMove(1)} title="Bajar"><svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 3l3 3 3-3" strokeLinecap="round"/></svg></SmBtn>}
          <SmBtn color={effectiveAccent} onClick={() => setExpanded((v) => !v)} title={expanded ? 'Colapsar' : 'Expandir'}>
            <svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8">{expanded ? <path d="M1 5l3-3 3 3" strokeLinecap="round"/> : <path d="M1 3l3 3 3-3" strokeLinecap="round"/>}</svg>
          </SmBtn>
          <SmBtn color="#ff4757" onClick={onRemove} title="Eliminar campo"><svg width="9" height="9" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l6 6M7 1L1 7"/></svg></SmBtn>
        </div>
      </div>
      {expanded && (
        <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <FieldLabel>Tipo de campo</FieldLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5 }}>
              {availableTypes.map((ft) => (
                <button key={ft.value} onClick={() => handleTypeChange(ft.value)}
                  style={{ padding: '6px 4px', borderRadius: 6, cursor: 'pointer', textAlign: 'center', border: `1px solid ${field.type === ft.value ? effectiveAccent : 'var(--border-subtle)'}`, background: field.type === ft.value ? `${effectiveAccent}15` : 'transparent', color: field.type === ft.value ? effectiveAccent : 'var(--txt-muted)', fontSize: 10, fontWeight: field.type === ft.value ? 700 : 400, transition: 'all 0.12s' }}>
                  <div style={{ fontSize: 13, marginBottom: 2 }}>{ft.icon}</div>
                  <div>{ft.label}</div>
                </button>
              ))}
            </div>
            {depth >= MAX_CONDITIONAL_DEPTH && (
              <div style={{ marginTop: 6, padding: '5px 8px', borderRadius: 5, background: 'rgba(253,203,110,0.08)', border: '1px solid rgba(253,203,110,0.3)', fontSize: 10, color: '#fdcb6e' }}>
                ⚠️ Límite de anidamiento alcanzado ({MAX_CONDITIONAL_DEPTH} niveles).
              </div>
            )}
          </div>
          <div>
            <FieldLabel>{isConditional ? 'Pregunta (label del checkbox disparador) *' : 'Etiqueta *'}</FieldLabel>
            <input value={field.label} onChange={(e) => onChange({ label: e.target.value })} onBlur={(e) => {
              const label = e.target.value;
              const key = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
              onChange({ key: key || field.key });
            }} placeholder={isConditional ? 'Ej: ¿Pertenece a CRM?' : 'Ej: Repositorio'} className="cpop-input" />
          </div>
          {!isConditional && (field.type === 'text' || field.type === 'textarea') && (
            <div>
              <FieldLabel>Texto de ayuda</FieldLabel>
              <input value={(field as SimpleField).placeholder ?? ''} onChange={(e) => onChange({ placeholder: e.target.value })} placeholder="Ej: Pegá el nombre del repositorio..." className="cpop-input" />
            </div>
          )}
          {!isConditional && field.type === 'checkbox' && (
            <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${effectiveAccent}`, background: `${effectiveAccent}15`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5L8.5 2" stroke={effectiveAccent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>{field.label || 'Etiqueta de la casilla'}</span>
            </div>
          )}
          {!isConditional && needsOptions && (
            <div>
              <FieldLabel>Opciones</FieldLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 6 }}>
                {((field as SimpleField).options ?? []).map((opt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: effectiveAccent, flexShrink: 0 }} />
                    <span style={{ flex: 1, fontSize: 12, color: 'var(--txt)' }}>{opt}</span>
                    <SmBtn color="#ff4757" onClick={() => onChange({ options: ((field as SimpleField).options ?? []).filter((_, idx) => idx !== i) })} title="Quitar">
                      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l6 6M7 1L1 7"/></svg>
                    </SmBtn>
                  </div>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={optionInput} onChange={(e) => setOptionInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }} placeholder="Nueva opción… (Enter para agregar)" className="cpop-input" style={{ flex: 1 }} />
                <button onClick={addOption} style={{ padding: '6px 12px', borderRadius: 6, border: `1px solid ${effectiveAccent}40`, background: `${effectiveAccent}12`, color: effectiveAccent, fontSize: 12, cursor: 'pointer', fontWeight: 700, flexShrink: 0 }}>+</button>
              </div>
            </div>
          )}

          {/* ── Opciones de comportamiento (Requerido, Colapsable, Mostrar en modal, Mostrar en card) ── */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '10px 12px', borderRadius: 7, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)' }}>
            {/* Requerido */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input type="checkbox" checked={field.required} onChange={(e) => onChange({ required: e.target.checked })} style={{ accentColor: effectiveAccent, width: 13, height: 13 }} />
              <span style={{ color: field.required ? effectiveAccent : 'var(--txt-muted)', fontWeight: field.required ? 600 : 400 }}>Requerido</span>
            </label>

            {/* Colapsable — solo para campos no-condicionales y no-checkbox */}
            {!isConditional && field.type !== 'checkbox' && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
                <input type="checkbox" checked={(field as SimpleField).collapsible ?? false} onChange={(e) => onChange({ collapsible: e.target.checked })} style={{ accentColor: effectiveAccent, width: 13, height: 13 }} />
                <span style={{ color: ((field as SimpleField).collapsible ?? false) ? effectiveAccent : 'var(--txt-muted)', fontWeight: ((field as SimpleField).collapsible ?? false) ? 600 : 400 }}>Colapsable</span>
              </label>
            )}

            {/* Separador visual */}
            <div style={{ width: '100%', height: 1, background: 'var(--border-subtle)', margin: '2px 0' }} />

            {/* Mostrar en modal */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input
                type="checkbox"
                checked={showInModal}
                onChange={(e) => onChange({ showInModal: e.target.checked } as Partial<TemplateExtraField>)}
                style={{ accentColor: effectiveAccent, width: 13, height: 13 }}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: showInModal ? effectiveAccent : 'var(--txt-muted)', fontWeight: showInModal ? 600 : 400 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 10h8M8 14h5"/></svg>
                Visible en modal
              </span>
            </label>

            {/* Mostrar en card */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 11 }}>
              <input
                type="checkbox"
                checked={showInCard}
                onChange={(e) => onChange({ showInCard: e.target.checked } as Partial<TemplateExtraField>)}
                style={{ accentColor: effectiveAccent, width: 13, height: 13 }}
              />
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: showInCard ? '#00e5a0' : 'var(--txt-muted)', fontWeight: showInCard ? 600 : 400 }}>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M8 10h8M8 14h4"/></svg>
                Visible en card
              </span>
            </label>
          </div>

          {isConditional && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <BranchEditor label="SÍ" color="#00e5a0"
                icon={<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="#00e5a0" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                fields={(field as ConditionalField).trueBranch} depth={depth} accentColor={accentColor}
                onUpdate={(idx, patch) => updateBranchField('trueBranch', idx, patch)}
                onAdd={() => addBranchField('trueBranch')}
                onRemove={(idx) => removeBranchField('trueBranch', idx)}
                onMove={(idx, dir) => moveBranchField('trueBranch', idx, dir)} />
              <BranchEditor label="NO" color="#ff4757"
                icon={<svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="#ff4757" strokeWidth="1.8" strokeLinecap="round"/></svg>}
                fields={(field as ConditionalField).falseBranch} depth={depth} accentColor={accentColor}
                onUpdate={(idx, patch) => updateBranchField('falseBranch', idx, patch)}
                onAdd={() => addBranchField('falseBranch')}
                onRemove={(idx) => removeBranchField('falseBranch', idx)}
                onMove={(idx, dir) => moveBranchField('falseBranch', idx, dir)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ============================================================
   BranchEditor
   ============================================================ */
function BranchEditor({ label, color, icon, fields, depth, onUpdate, onAdd, onRemove, onMove }: {
  label: string; color: string; icon: React.ReactNode; fields: TemplateExtraField[]; depth: number; accentColor: string;
  onUpdate: (idx: number, patch: Partial<TemplateExtraField>) => void; onAdd: () => void;
  onRemove: (idx: number) => void; onMove: (idx: number, dir: -1 | 1) => void;
}) {
  return (
    <div style={{ borderRadius: 8, border: `1px solid ${color}30` }}>
      <div style={{ padding: '8px 12px', background: `${color}08`, borderBottom: `1px solid ${color}20`, display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 18, height: 18, borderRadius: 4, background: `${color}20`, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color }}>Si respondió {label}</span>
        <span style={{ marginLeft: 'auto', fontSize: 9, padding: '1px 6px', borderRadius: 3, background: `${color}15`, color, border: `1px solid ${color}30`, fontWeight: 700 }}>{fields.length} campo{fields.length !== 1 ? 's' : ''}</span>
      </div>
      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {fields.map((f, idx) => (
          <FieldEditor key={`${idx}-${f.key}`} field={f} index={idx} total={fields.length} accentColor={color} depth={depth + 1}
            onChange={(patch) => onUpdate(idx, patch)} onRemove={() => onRemove(idx)} onMove={(dir) => onMove(idx, dir)} />
        ))}
        <button onClick={onAdd}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px', borderRadius: 7, width: '100%', border: `1px dashed ${color}40`, background: `${color}05`, color, fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.borderColor = `${color}70`; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = `${color}05`; e.currentTarget.style.borderColor = `${color}40`; }}>
          <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 1v7M1 4.5h7" strokeLinecap="round"/></svg>
          + campo en rama {label}
        </button>
      </div>
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
  const [editId,  setEditId]  = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {labels.length === 0 && !showNew && <div className="cpanel__empty"><span style={{ fontSize: 28, opacity: 0.4 }}>🏷️</span><p>No hay etiquetas para este equipo.</p></div>}
      {labels.map((label) => editId === label.Label_ID
        ? <LabelForm key={label.Label_ID} initial={{ name: label.Label_Name, color: label.Label_Color, icon: label.Label_Icon }} onSave={(d) => { onUpdate(label.Label_ID, d); setEditId(null); }} onCancel={() => setEditId(null)} />
        : <ItemRow key={label.Label_ID} color={label.Label_Color} icon={label.Label_Icon} name={label.Label_Name} onEdit={() => { setShowNew(false); setEditId(label.Label_ID); }} onDelete={() => onDelete(label.Label_ID)} />
      )}
      {showNew
        ? <LabelForm onSave={(d) => { onAdd(d); setShowNew(false); }} onCancel={() => setShowNew(false)} />
        : <AddBtn label="Nueva etiqueta" onClick={() => { setEditId(null); setShowNew(true); }} />
      }
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
  const [editId,  setEditId]  = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);
  const now = new Date();
  const statusOrder = (sp: Sprint) => {
    const start = new Date(sp.Sprint_Start_Date); const end = new Date(sp.Sprint_End_Date);
    if (now >= start && now <= end) return 0; if (now < start) return 1; return 2;
  };
  const sorted = [...sprints].sort((a, b) => { const diff = statusOrder(a) - statusOrder(b); if (diff !== 0) return diff; return new Date(b.Sprint_Start_Date).getTime() - new Date(a.Sprint_Start_Date).getTime(); });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {sorted.length === 0 && !showNew && <div className="cpanel__empty"><span style={{ fontSize: 28, opacity: 0.4 }}>⚡</span><p>No hay sprints definidos.</p></div>}
      {sorted.map((sp) => editId === sp.Sprint_ID
        ? <SprintForm key={sp.Sprint_ID} initial={{ text: sp.Sprint_Text, startDate: sp.Sprint_Start_Date, endDate: sp.Sprint_End_Date }} onSave={(d) => { onUpdate(sp.Sprint_ID, d); setEditId(null); }} onCancel={() => setEditId(null)} />
        : <SprintRow key={sp.Sprint_ID} sprint={sp} onEdit={() => { setShowNew(false); setEditId(sp.Sprint_ID); }} onRemove={() => onRemove(sp.Sprint_ID)} />
      )}
      {showNew
        ? <SprintForm onSave={(d) => { onAdd(d); setShowNew(false); }} onCancel={() => setShowNew(false)} />
        : <AddBtn label="Nuevo sprint" onClick={() => { setEditId(null); setShowNew(true); }} />
      }
    </div>
  );
}

/* ============================================================
   Formularios reutilizables
   ============================================================ */
function LabelForm({ initial, onSave, onCancel }: {
  initial?: { name: string; color: string; icon: string };
  onSave: (d: { name: string; color: string; icon: string }) => void; onCancel: () => void;
}) {
  const [name,  setName]  = useState(initial?.name  ?? '');
  const [color, setColor] = useState(initial?.color ?? '#00c8ff');
  const [icon,  setIcon]  = useState(initial?.icon  ?? '');
  const canSave = name.trim().length > 0;
  return (
    <div className="cpop-form">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canSave) onSave({ name: name.trim(), color, icon }); if (e.key === 'Escape') onCancel(); }} placeholder="Nombre de la etiqueta..." className="cpop-input" />
      <EmojiPicker value={icon} onChange={setIcon} />
      <ColorPicker color={color} onChange={setColor} />
      <FormActions canSave={canSave} onSave={() => onSave({ name: name.trim(), color, icon })} onCancel={onCancel} />
    </div>
  );
}

function SimpleColorForm({ initial, onSave, onCancel }: {
  initial?: { name: string; color: string };
  onSave: (d: { name: string; color: string }) => void; onCancel: () => void;
}) {
  const [name,  setName]  = useState(initial?.name  ?? '');
  const [color, setColor] = useState(initial?.color ?? '#00c8ff');
  const canSave = name.trim().length > 0;
  return (
    <div className="cpop-form">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canSave) onSave({ name: name.trim(), color }); if (e.key === 'Escape') onCancel(); }} placeholder="Nombre..." className="cpop-input" />
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

function SprintForm({ initial, onSave, onCancel }: {
  initial?: { text: string; startDate: string; endDate: string };
  onSave: (d: { text: string; startDate: string; endDate: string }) => void; onCancel: () => void;
}) {
  const [text,      setText]  = useState(initial?.text      ?? '');
  const [startDate, setStart] = useState(initial?.startDate ?? '');
  const [endDate,   setEnd]   = useState(initial?.endDate   ?? '');
  const dateError = endDate && startDate && endDate < startDate;
  const canSave   = !!(text.trim() && startDate && endDate && !dateError);
  return (
    <div className="cpop-form">
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }} placeholder="Nombre del sprint..." className="cpop-input" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><FieldLabel>Inicio</FieldLabel><input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className="cpop-input cpop-input--date" style={{ width: '100%', boxSizing: 'border-box', paddingRight: 8 }} /></div>
        <div><FieldLabel>Fin</FieldLabel><input type="date" value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} className="cpop-input cpop-input--date" style={{ width: '100%', boxSizing: 'border-box', paddingRight: 8 }} /></div>
      </div>
      {dateError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, background: '#ff475715', border: '1px solid #ff475740' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ff4757" strokeWidth="1.3"/><path d="M6 3.5v3M6 8.5v.5" stroke="#ff4757" strokeWidth="1.4" strokeLinecap="round"/></svg>
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

function EmojiPicker({ value, onChange }: { value: string; onChange: (e: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 3, padding: '8px', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, maxHeight: 96, overflowY: 'auto' }}>
      {EMOJIS.map((e) => (
        <button key={e} type="button" onClick={() => onChange(value === e ? '' : e)}
          style={{ width: '100%', aspectRatio: '1', borderRadius: 6, border: 'none', fontSize: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s', background: value === e ? 'var(--accent)22' : 'transparent', outline: value === e ? '2px solid var(--accent)' : '2px solid transparent', transform: value === e ? 'scale(1.15)' : 'scale(1)' }}
        >{e}</button>
      ))}
    </div>
  );
}

function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 5, padding: '8px', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
      {COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} title={c}
          style={{ width: '100%', aspectRatio: '1', borderRadius: 5, border: 'none', background: c, cursor: 'pointer', transition: 'transform 0.14s ease, outline 0.1s', outline: color === c ? `2px solid var(--txt)` : `2px solid transparent`, outlineOffset: 1, transform: color === c ? 'scale(1.12)' : 'scale(1)' }}
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

/* ============================================================
   EmailTemplateList — sin cambios, copiada íntegra
   ============================================================ */
function EmailTemplateList({ templates, onUpdate, onToggle, onCreate, onDelete, onUpdateMetadata }: {
  templates: EmailTemplate[];
  onUpdate: (id: number, d: { subject: string; html: string; text: string }) => void;
  onToggle: (id: number, isActive: boolean) => void;
  onCreate: (d: { name: string; eventKey: string; subject: string; variables: string[] }) => void;
  onDelete: (id: number) => void;
  onUpdateMetadata: (id: number, d: { name: string; subject: string; variables: string[] }) => void;
}) {
  const [editId,     setEditId]     = useState<number | null>(null);
  const [editMetaId, setEditMetaId] = useState<number | null>(null);
  const [showNew,    setShowNew]    = useState(false);

  if (editId !== null) {
    const t = templates.find((t) => t.Email_Template_ID === editId);
    if (t) return <EmailTemplateForm template={t} onSave={(d) => { onUpdate(t.Email_Template_ID, d); setEditId(null); }} onCancel={() => setEditId(null)} />;
  }
  if (editMetaId !== null) {
    const t = templates.find((t) => t.Email_Template_ID === editMetaId);
    if (t) return <EmailTemplateMetaForm template={t} onSave={(d) => { onUpdateMetadata(t.Email_Template_ID, d); setEditMetaId(null); }} onCancel={() => setEditMetaId(null)} />;
  }
  if (showNew) return <EmailTemplateNewForm onSave={(d) => { onCreate(d); setShowNew(false); }} onCancel={() => setShowNew(false)} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}><circle cx="7" cy="7" r="6" stroke="var(--accent)" strokeWidth="1.3"/><path d="M7 5v4M7 3.5v.5" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round"/></svg>
        <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: 0, lineHeight: 1.5 }}>Usá <code style={{ background: 'var(--bg-panel)', padding: '1px 5px', borderRadius: 3, fontSize: 10 }}>{'{{variable}}'}</code> en el subject y el HTML.</p>
      </div>
      {templates.length === 0 && <div className="cpanel__empty"><span style={{ fontSize: 28, opacity: 0.4 }}>✉️</span><p>No hay templates de correo.</p></div>}
      {templates.map((t) => (
        <EmailTemplateRow key={t.Email_Template_ID} template={t}
          onEdit={() => setEditId(t.Email_Template_ID)}
          onEditMeta={() => setEditMetaId(t.Email_Template_ID)}
          onToggle={(isActive) => onToggle(t.Email_Template_ID, isActive)}
          onDelete={() => onDelete(t.Email_Template_ID)} />
      ))}
      <AddBtn label="Nuevo evento de correo" onClick={() => setShowNew(true)} />
    </div>
  );
}

function EmailTemplateRow({ template, onEdit, onEditMeta, onToggle, onDelete }: {
  template: EmailTemplate; onEdit: () => void; onEditMeta: () => void;
  onToggle: (isActive: boolean) => void; onDelete: () => void;
}) {
  const [hov, setHov] = useState(false);
  const isActive = template.Email_Template_Is_Active;
  const vars     = getTemplateVariables(template);
  const fmt      = (iso: string) => { const d = new Date(iso); return `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`; };
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding: '10px 14px', borderRadius: 10, border: `1px solid ${hov ? 'var(--border)' : 'var(--border-subtle)'}`, background: hov ? 'var(--bg-hover)' : 'var(--bg-surface)', transition: 'all 0.12s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 7, flexShrink: 0, background: isActive ? 'rgba(0,200,255,0.12)' : 'var(--bg-panel)', border: `1px solid ${isActive ? 'rgba(0,200,255,0.3)' : 'var(--border-subtle)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>✉️</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.Email_Template_Name}</span>
            <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, flexShrink: 0, background: isActive ? 'rgba(0,229,160,0.12)' : 'var(--bg-panel)', border: `1px solid ${isActive ? 'rgba(0,229,160,0.35)' : 'var(--border-subtle)'}`, color: isActive ? '#00e5a0' : 'var(--txt-muted)' }}>{isActive ? 'activo' : 'inactivo'}</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{template.Email_Template_Subject || <span style={{ fontStyle: 'italic' }}>Sin subject</span>}</div>
          <div style={{ fontSize: 9, color: 'var(--txt-muted)', marginTop: 2, opacity: 0.6 }}>{template.Email_Template_Event_Key} · {fmt(template.Email_Template_Updated_At)}</div>
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button onClick={() => onToggle(!isActive)} style={{ width: 22, height: 22, borderRadius: 5, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isActive ? 'rgba(0,229,160,0.12)' : 'rgba(255,71,87,0.1)', color: isActive ? '#00e5a0' : '#ff4757', transition: 'background 0.12s' }}>
            {isActive ? <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5L8.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      : <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>}
          </button>
          <SmBtn color="#a29bfe" onClick={onEditMeta} title="Editar nombre y variables"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M6 2H3a1 1 0 00-1 1v6a1 1 0 001 1h6a1 1 0 001-1V6M10 1l1 1-5 5H5V6l5-5z"/></svg></SmBtn>
          <SmBtn color="#00c8ff" onClick={onEdit} title="Editar HTML"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg></SmBtn>
          <SmBtn color="#ff4757" onClick={onDelete} title="Eliminar"><svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg></SmBtn>
        </div>
      </div>
      {hov && vars.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-subtle)' }}>
          {vars.map((v) => <span key={v} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)' }}>{`{{${v}}}`}</span>)}
        </div>
      )}
    </div>
  );
}

function EmailTemplateNewForm({ onSave, onCancel }: {
  onSave: (d: { name: string; eventKey: string; subject: string; variables: string[] }) => void; onCancel: () => void;
}) {
  const [name,      setName]      = useState('');
  const [eventKey,  setEventKey]  = useState('');
  const [subject,   setSubject]   = useState('');
  const [varInput,  setVarInput]  = useState('');
  const [variables, setVariables] = useState<string[]>(['ticket_id', 'ticket_title', 'ticket_url']);
  const [error,     setError]     = useState('');
  const canSave = name.trim().length > 0 && eventKey.trim().length > 0;

  function handleNameChange(val: string) {
    setName(val);
    const key = val.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '').toLowerCase();
    setEventKey(key);
  }
  function addVar() { const v = varInput.trim().replace(/\s+/g, '_').toLowerCase(); if (!v || variables.includes(v)) return; setVariables((p) => [...p, v]); setVarInput(''); }
  function removeVar(v: string) { setVariables((p) => p.filter((x) => x !== v)); }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', flex: 1 }}>Nuevo evento de correo</span>
        <button onClick={() => { if (!canSave) return; setError(''); onSave({ name: name.trim(), eventKey: eventKey.trim(), subject: subject.trim(), variables }); }} disabled={!canSave} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: canSave ? 'linear-gradient(135deg, var(--accent-2), var(--accent))' : 'var(--bg-surface)', color: canSave ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', letterSpacing: 1 }}>CREAR</button>
      </div>
      <div><FieldLabel>Nombre legible *</FieldLabel><input autoFocus value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Ej: Solicitud creada" className="cpop-input" /></div>
      <div><FieldLabel>Event Key *</FieldLabel><input value={eventKey} onChange={(e) => setEventKey(e.target.value.replace(/\s/g, '_').toLowerCase())} placeholder="Ej: createRequest" className="cpop-input" style={{ fontFamily: 'monospace', fontSize: 11 }} /></div>
      <div><FieldLabel>Subject por defecto</FieldLabel><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ej: Solicitud {{ticket_id}} creada" className="cpop-input" /></div>
      <div>
        <FieldLabel>Variables disponibles</FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {variables.map((v) => (
            <span key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 5, fontFamily: 'monospace', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: 'var(--accent)' }}>
              {`{{${v}}}`}
              <button onClick={() => removeVar(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 0, display: 'flex', lineHeight: 1 }}><svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l6 6M7 1L1 7"/></svg></button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={varInput} onChange={(e) => setVarInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVar(); } }} placeholder="Nueva variable…" className="cpop-input" style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} />
          <button onClick={addVar} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(0,200,255,0.3)', background: 'rgba(0,200,255,0.08)', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>+</button>
        </div>
      </div>
      {error && <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', fontSize: 12, color: '#ff4757' }}>{error}</div>}
    </div>
  );
}

function EmailTemplateMetaForm({ template, onSave, onCancel }: {
  template: EmailTemplate; onSave: (d: { name: string; subject: string; variables: string[] }) => void; onCancel: () => void;
}) {
  const [name,      setName]      = useState(template.Email_Template_Name);
  const [subject,   setSubject]   = useState(template.Email_Template_Subject);
  const [variables, setVariables] = useState<string[]>(getTemplateVariables(template));
  const [varInput,  setVarInput]  = useState('');
  const canSave = name.trim().length > 0;
  function addVar() { const v = varInput.trim().replace(/\s+/g, '_').toLowerCase(); if (!v || variables.includes(v)) return; setVariables((p) => [...p, v]); setVarInput(''); }
  function removeVar(v: string) { setVariables((p) => p.filter((x) => x !== v)); }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', flex: 1 }}>Editar metadata</span>
        <button onClick={() => canSave && onSave({ name: name.trim(), subject: subject.trim(), variables })} disabled={!canSave} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: canSave ? 'linear-gradient(135deg, var(--accent-2), var(--accent))' : 'var(--bg-surface)', color: canSave ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', letterSpacing: 1 }}>GUARDAR</button>
      </div>
      <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', fontSize: 10, color: 'var(--txt-muted)' }}>Event Key: <code style={{ fontFamily: 'monospace', color: 'var(--accent)' }}>{template.Email_Template_Event_Key}</code> — no editable</div>
      <div><FieldLabel>Nombre legible *</FieldLabel><input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="cpop-input" /></div>
      <div><FieldLabel>Subject por defecto</FieldLabel><input value={subject} onChange={(e) => setSubject(e.target.value)} className="cpop-input" /></div>
      <div>
        <FieldLabel>Variables disponibles</FieldLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
          {variables.map((v) => (
            <span key={v} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, padding: '2px 8px', borderRadius: 5, fontFamily: 'monospace', background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: 'var(--accent)' }}>
              {`{{${v}}}`}
              <button onClick={() => removeVar(v)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 0, display: 'flex', lineHeight: 1 }}><svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 1l6 6M7 1L1 7"/></svg></button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={varInput} onChange={(e) => setVarInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVar(); } }} placeholder="Nueva variable…" className="cpop-input" style={{ flex: 1, fontFamily: 'monospace', fontSize: 11 }} />
          <button onClick={addVar} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(0,200,255,0.3)', background: 'rgba(0,200,255,0.08)', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontWeight: 700 }}>+</button>
        </div>
      </div>
    </div>
  );
}

function EmailTemplateForm({ template, onSave, onCancel }: {
  template: EmailTemplate; onSave: (d: { subject: string; html: string; text: string }) => void; onCancel: () => void;
}) {
  const [subject, setSubject] = useState(template.Email_Template_Subject);
  const [html,    setHtml]    = useState(template.Email_Template_Body_html);
  const [tab,     setTab]     = useState<'editor' | 'preview'>('editor');
  const [copied,  setCopied]  = useState<string | null>(null);
  const vars    = getTemplateVariables(template);
  const canSave = subject.trim().length > 0;
  function copyVar(v: string) { navigator.clipboard.writeText(`{{${v}}}`); setCopied(v); setTimeout(() => setCopied(null), 1500); }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>← Volver</button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', flex: 1 }}>{template.Email_Template_Name}</span>
        <button onClick={() => canSave && onSave({ subject: subject.trim(), html, text: '' })} disabled={!canSave} style={{ padding: '6px 16px', borderRadius: 6, border: 'none', background: canSave ? 'linear-gradient(135deg, var(--accent-2), var(--accent))' : 'var(--bg-surface)', color: canSave ? 'white' : 'var(--txt-muted)', fontSize: 11, fontWeight: 700, cursor: canSave ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-display)', letterSpacing: 1 }}>GUARDAR</button>
      </div>
      <div style={{ flexShrink: 0, marginBottom: 12 }}><span style={{ fontSize: 9, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.25)', color: 'var(--accent)', fontFamily: 'monospace' }}>{template.Email_Template_Event_Key}</span></div>
      {vars.length > 0 && (
        <div style={{ flexShrink: 0, marginBottom: 12 }}>
          <FieldLabel>Variables — click para copiar</FieldLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {vars.map((v) => <button key={v} onClick={() => copyVar(v)} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontFamily: 'monospace', border: '1px solid var(--border)', background: copied === v ? 'rgba(0,229,160,0.15)' : 'var(--bg-panel)', color: copied === v ? '#00e5a0' : 'var(--accent)', transition: 'all 0.15s' }}>{copied === v ? '✓ copiado' : `{{${v}}}`}</button>)}
          </div>
        </div>
      )}
      <div style={{ flexShrink: 0, marginBottom: 12 }}><FieldLabel>Subject *</FieldLabel><input value={subject} onChange={(e) => setSubject(e.target.value)} className="cpop-input" /></div>
      <div style={{ flexShrink: 0, display: 'flex', gap: 4, marginBottom: 8, padding: '4px', background: 'var(--bg-surface)', borderRadius: 8 }}>
        {(['editor', 'preview'] as const).map((t) => <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: '7px', borderRadius: 6, border: 'none', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', cursor: 'pointer', background: tab === t ? 'var(--accent)' : 'transparent', color: tab === t ? 'white' : 'var(--txt-muted)', transition: 'all 0.15s' }}>{t === 'editor' ? '✏️ Editor' : '👁 Preview'}</button>)}
      </div>
      {tab === 'editor' && (
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <FieldLabel>HTML del correo</FieldLabel>
          <textarea value={html} onChange={(e) => setHtml(e.target.value)} placeholder="Pegá el HTML del correo acá..." style={{ flex: 1, minHeight: 0, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px', fontSize: 11, color: 'var(--txt)', fontFamily: 'monospace', lineHeight: 1.6, resize: 'none', outline: 'none', boxSizing: 'border-box', width: '100%' }} />
        </div>
      )}
      {tab === 'preview' && (
        <div style={{ flex: 1, minHeight: 0, borderRadius: 8, overflow: 'auto', border: '1px solid var(--border-subtle)', background: '#fff' }}>
          {html.trim() ? <div dangerouslySetInnerHTML={{ __html: html }} /> : <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#999', fontSize: 12 }}>Sin HTML para previsualizar</div>}
        </div>
      )}
    </div>
  );
}
