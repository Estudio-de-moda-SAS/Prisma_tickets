// src/components/layout/ConfigPanel.tsx
import { useState, useEffect, useRef } from 'react';
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
import { config } from '@/config';
import {
  useEmailTemplates, useUpdateEmailTemplate, useToggleEmailTemplate,
  useCreateEmailTemplate, useDeleteEmailTemplate,
  useUpdateEmailTemplateMetadata,
} from '@/features/requests/hooks/useEmailTemplates';
import { OrgSection} from './ConfigPanelComponents/OrgConfig';
import { UserList } from './ConfigPanelComponents/UsersConfig';
import { LabelList } from './ConfigPanelComponents/LabelsConfig';
import { SubTeamList } from './ConfigPanelComponents/SubTeamConfig';
import { SprintList } from './ConfigPanelComponents/SprintsConfig';
import { EmailTemplateList } from './ConfigPanelComponents/EmailsTemplatesConfig';
import { KanbanSection } from './ConfigPanelComponents/KanbansConfig';
import { TemplateList } from './ConfigPanelComponents/RequestsTemplates';
import { AnnouncementsConfig } from './ConfigPanelComponents/AnnouncementsConfig';
import { ExportsConfig } from './ConfigPanelComponents/ExportsConfig';
/* ============================================================

   Constantes
   ============================================================ */
const COLORS = [
  // Rojos y rosas
  '#ff4757','#ff6b81','#ff7675','#e84393','#fd79a8','#c44569',
  // Naranjas y ámbar
  '#ff7f50','#e17055','#ef9f27','#f0932b','#fdcb6e','#f9ca24',
  // Verdes
  '#a3cb38','#6ab04c','#1d9e75','#00b894','#00e5a0','#55efc4',
  // Turquesas y cian
  '#00cec9','#22a6b3','#00c8ff','#378add','#0984e3','#4834d4',
  // Púrpuras
  '#6c5ce7','#7f77dd','#a29bfe','#a55eea',
  // Neutros
  '#b2bec3','#808e9b','#57606f','#000000',
];
export const EMOJIS = [
  '🐛','🎨','🖼️','📊','⚙️','🔧','🚀','💡',
  '📋','🔒','🌐','📱','💰','🔔','✅','🧪',
  '🎯','🏷️','🛠️','🏪','📦','🔍','💬','🗂️',
  '📝','📌','⭐','🔥','⏰','📅','👤','👥',
  '💻','🖥️','📧','📞','🔗','📎','🎫','🚨',
  '⚠️','❗','❓','♻️','🧩','📁','🔓','🏠',
];

const TEAM_CODE_COLORS: Record<string, string> = {
  desarrollo: '#378ADD',
  crm:        '#1D9E75',
  sistemas:   '#EF9F27',
  analisis:   '#7F77DD',
};

type Section = 'labels' | 'subteams' | 'sprints' | 'templates' | 'users' | 'emails' | 'org' | 'kanbans' | 'announcements' | 'exports';

const NAV_ITEMS: { key: Section; label: string; icon: string; description: string }[] = [
  { key: 'labels',    label: 'Etiquetas',   icon: '🏷️', description: 'Crea y edita las etiquetas de color para clasificar tickets dentro del equipo seleccionado.' },
  { key: 'subteams',  label: 'Sub-equipos', icon: '👥', description: 'Organiza los integrantes del equipo en sub-equipos para asignación y reportes.' },
  { key: 'sprints',   label: 'Sprints',     icon: '⚡', description: 'Define los sprints activos e históricos usados para planificación y estadísticas.' },
  { key: 'kanbans',   label: 'Kanbans',     icon: '🗂️', description: 'Configura los equipos del board, sus columnas y reglas de evidencia.' },
  { key: 'templates', label: 'Plantillas',   icon: '📋', description: 'Diseña los formularios que ven los usuarios al crear una solicitud.' },
  { key: 'users',     label: 'Usuarios',    icon: '👤', description: 'Gestiona roles, departamentos y permisos de cada usuario del sistema.' },
  { key: 'emails',    label: 'Correos',     icon: '✉️', description: 'Edita las plantillas HTML que se envían automáticamente en cada evento.' },
  { key: 'announcements', label: 'Avisos', icon: '📢', description: 'Publica avisos visibles para todos los usuarios de la plataforma.' },
  { key: 'exports',   label: 'Exportar',    icon: '📤', description: 'Genera y descarga reportes en Excel o CSV con los tickets del board.' },
  { key: 'org',       label: 'Organización',  icon: '🏢', description: 'Administra los departamentos y equipos corporativos de la empresa.' },
];

function getNavDescription(key: Section): string {
  return NAV_ITEMS.find((n) => n.key === key)?.description ?? '';
}/* ============================================================
   NavTeamSwitcher
   ============================================================ */function NavTeamSwitcher({ teams, equipoActivo, onSelect }: {
  teams:        BoardTeam[];
  equipoActivo: string;
  onSelect:     (code: string) => void;
}) {

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
            onClick={() => onSelect(team.Board_Team_Code)}            style={{
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
  const [initialSection,  setInitialSection]  = useState<Section | undefined>(undefined);
  const [initialExpTab,   setInitialExpTab]   = useState<'new' | 'history' | undefined>(undefined);

  // Permite abrir el panel desde otros componentes (ej: NotificationBell)
  useEffect(() => {
    const handler = () => {
      setInitialSection('exports');
      setInitialExpTab('history');
      setOpen(true);
    };
    window.addEventListener('prisma:open-exports-history', handler);
    return () => window.removeEventListener('prisma:open-exports-history', handler);
  }, []);

  const openFromButton = () => {
    setInitialSection(undefined);
    setInitialExpTab(undefined);
    setOpen(true);
  };

  return (
    <>
      <button onClick={openFromButton} title="Configuración del board"
        className={`cpop-trigger${open ? ' cpop-trigger--open' : ''}`}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="2.5"/>
          <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" strokeLinecap="round"/>
        </svg>
        {!collapsed && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 4 }}>Config</span>}
      </button>
      {open && (
        <ConfigPanel
          onClose={() => setOpen(false)}
          initialSection={initialSection}
          initialExportsTab={initialExpTab}
        />
      )}
    </>
  );
}

/* ============================================================
   Panel principal
   ============================================================ */
function ConfigPanel({
  onClose,
  initialSection,
  initialExportsTab,
}: {
  onClose:            () => void;
  initialSection?:    Section;
  initialExportsTab?: 'new' | 'history';
}) {
  const [section, setSection] = useState<Section>(initialSection ?? 'labels');
  const panelRef = useRef<HTMLDivElement>(null);
  const { equipoActivo } = useBoardStore();
  const [localEquipo, setLocalEquipo] = useState<string>(equipoActivo);
  const boardId = config.DEFAULT_BOARD_ID;

  const { data: teams     = [] } = useBoardTeams(boardId);
  const { data: templates = [] } = useBoardTemplates(boardId);
  const activeTeam = teams.find((t) => t.Board_Team_Code === localEquipo);  const teamId     = activeTeam?.Board_Team_ID ?? null;
const activeTeamIsExternal = !!activeTeam?.Board_Team_Is_External;

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
const showTeamSwitcher = section !== 'users' && section !== 'sprints' && section !== 'templates' && section !== 'emails' && section !== 'org' && section !== 'kanbans' && section !== 'announcements' && section !== 'exports';

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
<NavTeamSwitcher teams={teams} equipoActivo={localEquipo} onSelect={setLocalEquipo} />
                </div>
              )}
            </div>

            <div className="cpanel__nav-group">
              <span className="cpanel__nav-group-label">Board</span>
              {NAV_ITEMS.filter((n) =>
                n.key !== 'templates' && n.key !== 'users' && n.key !== 'emails' &&
                n.key !== 'org' && n.key !== 'announcements' && n.key !== 'exports'
              ).map((item) => {
                const badge =
                  item.key === 'labels'   ? labels.length :
                  item.key === 'subteams' ? subTeams.length :
                  item.key === 'sprints'  ? sprints.length :
                  item.key === 'kanbans'  ? teams.length :
                  undefined;
                return (
                  <NavButton
                    key={item.key}
                    icon={item.icon}
                    label={item.label}
                    description={item.description}
                    badge={badge}
                    active={section === item.key}
                    onClick={() => setSection(item.key)}
                  />
                );
              })}
            </div>

            <div className="cpanel__nav-group cpanel__nav-group--separated">
              <span className="cpanel__nav-group-label">Sistema</span>
              <NavButton
                icon="📋" label="Plantillas"
                description={getNavDescription('templates')}
                badge={templates.length}
                active={section === 'templates'}
                onClick={() => setSection('templates')}
              />
              <NavButton
                icon="✉️" label="Correos"
                description={getNavDescription('emails')}
                active={section === 'emails'}
                onClick={() => setSection('emails')}
              />
              <NavButton
                icon="👤" label="Usuarios"
                description={getNavDescription('users')}
                active={section === 'users'}
                onClick={() => setSection('users')}
              />
              <NavButton
                icon="📢" label="Avisos"
                description={getNavDescription('announcements')}
                active={section === 'announcements'}
                onClick={() => setSection('announcements')}
              />
              <NavButton
                icon="📤" label="Exportar"
                description={getNavDescription('exports')}
                active={section === 'exports'}
                onClick={() => setSection('exports')}
              />
              <NavButton
                icon="🏢" label="Organización"
                description={getNavDescription('org')}
                active={section === 'org'}
                onClick={() => setSection('org')}
              />
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
                  {section === 'sprints' && (
                    <p className="cpanel__content-subtitle">Planificación y seguimiento de sprints por equipo</p>
                  )}
                  {section === 'templates' && (
                    <p className="cpanel__content-subtitle">Formularios de solicitudes</p>
                  )}
                  {section === 'emails' && (
                    <p className="cpanel__content-subtitle">Templates HTML por evento</p>
                  )}
                  {section === 'announcements' && (
  <p className="cpanel__content-subtitle">Avisos activos de la plataforma</p>
)}
                  {section === 'org' && (
                    <p className="cpanel__content-subtitle">Departamentos y equipos corporativos</p>
                  )}
                  {section === 'kanbans' && (
                    <p className="cpanel__content-subtitle">Equipos del board · columnas · evidencia</p>
                  )}
                  {section === 'exports' && (
                    <p className="cpanel__content-subtitle">Generar Excel o CSV con los tickets del board</p>
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
              {/* Equipo externo: no tiene config de Kanban, solo su URL */}
              {(section === 'labels' || section === 'subteams') && activeTeamIsExternal && (
                <ExternalTeamNotice team={activeTeam!} />
              )}

              {section === 'labels' && !activeTeamIsExternal && teamId && (
                <LabelList
                  labels={labels}
                  onAdd={(d) => createLabel.mutate(d)}
                  onUpdate={(id, d) => updateLabel.mutate({ id, ...d })}
                  onDelete={(id) => deleteLabel.mutate(id)}
                />
              )}
              {section === 'labels' && !activeTeamIsExternal && !teamId && <EmptyTeam />}

              {section === 'subteams' && !activeTeamIsExternal && teamId && (
                <SubTeamList
                  subTeams={subTeams}
                  teamId={teamId}
                  onAdd={(d) => createSubTeam.mutate(d)}
                  onUpdate={(id, d) => updateSubTeam.mutate({ id, ...d })}
                  onRemove={(id) => deleteSubTeam.mutate(id)}
                />
              )}
              {section === 'subteams' && !activeTeamIsExternal && !teamId && <EmptyTeam />}

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
                  teams={teams.filter((t) => !t.Board_Team_Is_External)}
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
                {section === 'announcements' && <AnnouncementsConfig />}
              {section === 'org' && <OrgSection />}
              {section === 'kanbans' && <KanbanSection />}
              {section === 'exports' && <ExportsConfig initialTab={initialExportsTab} />}
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
   Formularios reutilizables
   ============================================================ */
export function LabelForm({ initial, onSave, onCancel }: {
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
function ExternalTeamNotice({ team }: { team: BoardTeam }) {
  const [copied, setCopied] = useState(false);
  const url = team.Board_Team_External_URL ?? '';
  const color = team.Board_Team_Color || '#6c5ce7';

  function copy() {
    if (!url) return;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 460 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 10, background: `${color}0d`, border: `1px solid ${color}30` }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}18`, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 18 }}>
          {'\uD83D\uDD17'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>{team.Board_Team_Name}</div>
          <div style={{ fontSize: 11, color: color, fontWeight: 600, marginTop: 1 }}>Equipo externo - sin Kanban</div>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.65, margin: 0 }}>
        Este equipo no tiene tablero dentro de PRISMA, por lo que no maneja etiquetas, sub-equipos, sprints ni columnas. Al seleccionarlo en el sidebar o al crear una solicitud, se abre directamente su herramienta propia en una pestaña nueva.
      </p>

      <div>
        <FieldLabel>Herramienta externa</FieldLabel>
        {url ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}>
            <span title={url} style={{ flex: 1, minWidth: 0, fontSize: 12, fontFamily: 'monospace', color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {url}
            </span>
            <button type="button" onClick={copy} title="Copiar link" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: `1px solid ${copied ? 'rgba(0,229,160,0.4)' : 'var(--border-subtle)'}`, background: copied ? 'rgba(0,229,160,0.1)' : 'transparent', color: copied ? '#00e5a0' : 'var(--txt-muted)', fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0, transition: 'all 0.15s' }}>
              {copied ? 'Copiado' : 'Copiar'}
            </button>
            <a href={url} target="_blank" rel="noopener noreferrer" title="Abrir en pestaña nueva" style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: `1px solid ${color}40`, background: `${color}12`, color, fontSize: 10, fontWeight: 700, cursor: 'pointer', flexShrink: 0, textDecoration: 'none' }}>
              Abrir
            </a>
          </div>
        ) : (
          <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,71,87,0.06)', border: '1px solid rgba(255,71,87,0.25)', fontSize: 11, color: '#ff4757', lineHeight: 1.5 }}>
            Este equipo externo no tiene URL configurada. Editalo en la sección Kanbans para agregar el link.
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: 0, opacity: 0.75, lineHeight: 1.5 }}>
        Para cambiar el nombre, el link o el ícono, andá a la sección Kanbans en el panel izquierdo.
      </p>
    </div>
  );
}

export function SimpleColorForm({ initial, onSave, onCancel }: {
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


/* ============================================================
   Primitivos compartidos
   ============================================================ */
export function ItemRow({ color, icon, name, onEdit, onDelete }: { color: string; icon?: string; name: string; onEdit: () => void; onDelete: () => void }) {
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

export function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 5, padding: '8px', background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 8, maxHeight: 132, overflowY: 'auto' }}>
      {COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} title={c}
          style={{ width: '100%', aspectRatio: '1', borderRadius: 5, border: 'none', background: c, cursor: 'pointer', transition: 'transform 0.14s ease, outline 0.1s', outline: color === c ? `2px solid var(--txt)` : `2px solid transparent`, outlineOffset: 1, transform: color === c ? 'scale(1.12)' : 'scale(1)' }}
        />
      ))}
    </div>
  );
}

export function FormActions({ canSave, onSave, onCancel }: { canSave: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
      <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
      <button onClick={() => canSave && onSave()} className={`cpop-btn-save${canSave ? '' : ' cpop-btn-save--disabled'}`}>GUARDAR</button>
    </div>
  );
}

export function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="cpop-add-btn" style={{ marginTop: 4 }}>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 1v7M1 4.5h7" strokeLinecap="round"/></svg>
      {label}
    </button>
  );
}

export function SmBtn({ color, onClick, title, children }: { color: string; onClick: () => void; title: string; children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: 22, height: 22, borderRadius: 5, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hov ? `${color}28` : `${color}12`, color, transition: 'background 0.12s' }}>
      {children}
    </button>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 5 }}>{children}</label>;
}
/* ============================================================
   NavTooltip — descripción al hover, vía portal
   ============================================================ */
function NavTooltip({
  text, anchorRef, visible,
}: {
  text:      string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  visible:   boolean;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!visible || !anchorRef.current) { setPos(null); return; }
    const rect = anchorRef.current.getBoundingClientRect();
    setPos({ top: rect.top + rect.height / 2, left: rect.right + 10 });
  }, [visible, anchorRef]);

  if (!visible || !pos) return null;

  return createPortal(
    <div className="cpanel-tooltip" style={{ top: pos.top, left: pos.left }} role="tooltip">
      {text}
      <span className="cpanel-tooltip__arrow" />
    </div>,
    document.body,
  );
}

/* ============================================================
   NavButton — item de nav con tooltip de descripción
   ============================================================ */
function NavButton({
  icon, label, description, badge, active, onClick,
}: {
  icon:        string;
  label:       string;
  description: string;
  badge?:      number;
  active:      boolean;
  onClick:     () => void;
}) {
  const [hov, setHov] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  return (
    <div
      className="cpanel-nav-item-wrap"
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
    >
      <button
        ref={btnRef}
        onClick={onClick}
        className={`cpanel__nav-item${active ? ' cpanel__nav-item--active' : ''}`}
      >
        <span className="cpanel__nav-item-icon">{icon}</span>
        <span>{label}</span>
        {typeof badge === 'number' && <span className="cpanel__nav-badge">{badge}</span>}
      </button>
      <NavTooltip text={description} anchorRef={btnRef} visible={hov} />
    </div>
  );
}