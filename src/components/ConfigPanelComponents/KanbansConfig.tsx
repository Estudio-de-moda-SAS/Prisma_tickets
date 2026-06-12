import { useState, useEffect, useRef } from 'react';
import { AddBtn, SmBtn, FieldLabel, ColorPicker} from '../ConfigPanel';
import {
  useCreateKanbanTeam, useUpdateKanbanTeam,
  useTeamColumnConfig, useUpsertTeamColumnConfig,
  useUpdateBoardColumn, useCreateBoardColumn, useReorderBoardColumn, useReorderBoardTeam,
  type KanbanTeam, type ColumnWithConfig,
} from '@/features/requests/hooks/useKanbanAdmin';
import { TEAM_ICON_MAP } from '@/components/layout/siderbarConstants';
import { config } from '@/config';
import {
  useBoardTeams
} from '@/features/requests/hooks/useBoardMetadata';

export function KanbanSection() {
  const boardId = config.DEFAULT_BOARD_ID;
  const { data: teams = [], isLoading } = useBoardTeams(boardId);
  const createKanbanTeam  = useCreateKanbanTeam();
  const updateKanbanTeam  = useUpdateKanbanTeam();
  const createBoardColumn = useCreateBoardColumn(boardId);
  const reorderTeam       = useReorderBoardTeam();

  const [editTeamId,    setEditTeamId]    = useState<number | null>(null);
  const [showNewTeam,   setShowNewTeam]   = useState(false);
  const [expandedId,    setExpandedId]    = useState<number | null>(null);
  const [showNewColumn, setShowNewColumn] = useState(false);

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[1, 2, 3].map((i) => (
          <div key={i} style={{ height: 52, borderRadius: 10, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }} />
        ))}
      </div>
    );
  }

  if (showNewTeam || editTeamId !== null) {
    const team = editTeamId !== null && editTeamId !== -1
      ? teams.find((t) => t.Board_Team_ID === editTeamId)
      : undefined;
    return (
      <KanbanTeamForm
        initial={team ? {
          name:        team.Board_Team_Name,
          code:        team.Board_Team_Code,
          color:       team.Board_Team_Color,
          description: team.Board_Team_Description ?? '',
          icon:        team.Board_Team_Icon ?? '🗂️',
          isAdminOnly: team.Board_Team_Is_Admin_Only ?? false
        } : undefined}
        saving={createKanbanTeam.isPending || updateKanbanTeam.isPending}
        onSave={(data) => {
          if (team) {
            updateKanbanTeam.mutate(
              { id: team.Board_Team_ID, ...data },
              { onSuccess: () => setEditTeamId(null) },
            );
          } else {
            createKanbanTeam.mutate(data, { onSuccess: () => setShowNewTeam(false) });
          }
        }}
        onCancel={() => { setShowNewTeam(false); setEditTeamId(null); }}
      />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
        display: 'flex', gap: 10, padding: '10px 13px', borderRadius: 8, marginBottom: 14,
        background: 'rgba(255,71,87,0.07)', border: '1px solid rgba(255,71,87,0.25)',
      }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fdcb6e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#ff4757', letterSpacing: 0.3 }}>
            Gestión de Kanbans
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,71,87,0.75)', lineHeight: 1.55 }}>            Los kanbans solo pueden eliminarse directamente desde la base de datos. Cada kanban representa un equipo del board. Los toggles de visibilidad y evidencia se aplican al instante. Editar una columna global afecta a todos los equipos.
          </span>
        </div>
      </div>
      {/* Banner */}
      <div style={{ padding: '8px 12px', borderRadius: 7, background: 'rgba(0,200,255,0.06)', border: '1px solid rgba(0,200,255,0.2)', fontSize: 11, color: 'var(--txt-muted)', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 4 }}>
        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
          <circle cx="7" cy="7" r="6" stroke="var(--accent)" strokeWidth="1.3"/>
          <path d="M7 5v4M7 3.5v.5" stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
        <span>Cada kanban es un equipo del board. Los toggles de visibilidad y evidencia se guardan inmediatamente. Editar una columna afecta a todos los equipos.</span>
      </div>

      {/* Lista de equipos */}
      {teams.length === 0 && (
        <div className="cpanel__empty">
          <span style={{ fontSize: 28, opacity: 0.4 }}>🗂️</span>
          <p>No hay kanbans configurados.</p>
        </div>
      )}
      {teams.map((team, idx) => (
        <KanbanTeamCard
          key={team.Board_Team_ID}
          team={team as KanbanTeam}
          boardId={boardId}
          expanded={expandedId === team.Board_Team_ID}
          onToggle={() => setExpandedId(expandedId === team.Board_Team_ID ? null : team.Board_Team_ID)}
          onEdit={() => { setExpandedId(null); setEditTeamId(team.Board_Team_ID); }}
          index={idx}
          total={teams.length}
          onMoveUp={() => reorderTeam.mutate({ teamId: team.Board_Team_ID, direction: 'up' })}
          onMoveDown={() => reorderTeam.mutate({ teamId: team.Board_Team_ID, direction: 'down' })}
        />
      ))}

      <AddBtn label="Nuevo kanban" onClick={() => { setEditTeamId(null); setShowNewTeam(true); }} />

      {/* Columnas globales */}
      <div style={{ marginTop: 10, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', opacity: 0.6 }}>
            Columnas globales
          </span>
          <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
        </div>
        <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: '0 0 8px', lineHeight: 1.5 }}>
          Las columnas nuevas se añaden a todos los equipos. Controlá su visibilidad desde el panel de cada kanban.
        </p>
        {showNewColumn ? (
          <ColumnCreateForm
            onSave={(d) => createBoardColumn.mutate(d, { onSuccess: () => setShowNewColumn(false) })}
            onCancel={() => setShowNewColumn(false)}
            saving={createBoardColumn.isPending}
          />
        ) : (
          <AddBtn label="Nueva columna" onClick={() => setShowNewColumn(true)} />
        )}
      </div>
    </div>
  );
}

/* ── KanbanTeamCard ── */
function KanbanTeamCard({ team, boardId, expanded, onToggle, onEdit, index, total, onMoveUp, onMoveDown }: {
  team:       KanbanTeam;
  boardId:    number;
  expanded:   boolean;
  onToggle:   () => void;
  onEdit:     () => void;
  index:      number;
  total:      number;
  onMoveUp:   () => void;
  onMoveDown: () => void;
}) {
  const [hov, setHov] = useState(false);
  const color = team.Board_Team_Color;

  return (
    <div style={{
      border:       `1px solid ${expanded ? 'var(--border)' : 'var(--border-subtle)'}`,
      borderRadius: 10,
      overflow:     'hidden',
      background:   'var(--bg-surface)',
      transition:   'border-color 0.15s',
    }}>
      {/* Header */}
      <div
        onClick={onToggle}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          padding:      '11px 14px',
          background:   hov || expanded ? 'var(--bg-hover)' : 'transparent',
          transition:   'background 0.12s',
          cursor:       'pointer',
          borderBottom: expanded ? '1px solid var(--border-subtle)' : 'none',
        }}
      >
        <div style={{
          width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0,
          boxShadow: expanded ? `0 0 7px ${color}` : 'none', transition: 'box-shadow 0.2s',
        }} />

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {team.Board_Team_Name}
          </div>
          {team.Board_Team_Description && (
            <div style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
              {team.Board_Team_Description}
            </div>
          )}
        </div>

        <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--txt-muted)', flexShrink: 0, opacity: 0.7, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', borderRadius: 4, padding: '2px 6px' }}>
          {team.Board_Team_Code}
        </span>

        {team.Board_Team_Is_Admin_Only && (
          <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757', flexShrink: 0 }}>
            🔒 Solo admins
          </span>
        )}

        <div
          style={{ display: 'flex', gap: 3, opacity: hov || expanded ? 1 : 0,
           transition: 'opacity 0.12s', flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <SmBtn color="#00c8ff" onClick={onEdit} title="Editar kanban">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/>
            </svg>
          </SmBtn>
        </div>

        <div
          style={{ display: 'flex', flexDirection: 'column', gap: 1, opacity: hov || expanded ? 1 : 0, transition: 'opacity 0.12s', flexShrink: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            title="Subir kanban"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 12, borderRadius: 3, border: 'none', background: 'transparent', color: index === 0 ? 'var(--border)' : 'var(--txt-muted)', cursor: index === 0 ? 'default' : 'pointer' }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 5l3-3 3 3"/></svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="Bajar kanban"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 12, borderRadius: 3, border: 'none', background: 'transparent', color: index === total - 1 ? 'var(--border)' : 'var(--txt-muted)', cursor: index === total - 1 ? 'default' : 'pointer' }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 3l3 3 3-3"/></svg>
          </button>
        </div>

        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round"
          style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : undefined, transition: 'transform 0.18s', opacity: 0.4 }}>
          <path d="M1 3l4 4 4-4"/>
        </svg>
      </div>

      {/* Panel expandido */}
      {expanded && <ColumnConfigPanel teamId={team.Board_Team_ID} boardId={boardId} teamColor={color} />}
    </div>
  );
}
function IconPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const icons = Object.keys(TEAM_ICON_MAP);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {icons.map((name) => {
        const Icon    = TEAM_ICON_MAP[name];
        const active  = value === name;
        return (
          <button
            key={name}
            type="button"
            title={name}
            onClick={() => onChange(name)}
            style={{
              width: 32, height: 32, borderRadius: 6, display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border-subtle)'}`,
              background: active ? 'rgba(0,200,255,0.12)' : 'var(--bg-surface)',
              color: active ? 'var(--accent)' : 'var(--txt-muted)',
              cursor: 'pointer', transition: 'all 0.12s',
            }}
          >
            <Icon size={14} />
          </button>
        );
      })}
    </div>
  );
}
/* ── KanbanTeamForm ── */
function KanbanTeamForm({ initial, saving, onSave, onCancel }: {
  initial?: { name: string; code: string; color: string; description: string; icon: string; isAdminOnly: boolean };
  saving?:  boolean;
  onSave:   (d: { name: string; code: string; color: string; description: string; icon: string; isAdminOnly: boolean }) => void;
  onCancel: () => void;
}) {
  const [name,        setName]        = useState(initial?.name        ?? '');
  const [code,        setCode]        = useState(initial?.code        ?? '');
  const [color,       setColor]       = useState(initial?.color       ?? '#00c8ff');
  const [description, setDescription] = useState(initial?.description ?? '');
const [icon,        setIcon]        = useState(initial?.icon        ?? '🗂️');
  const [isAdminOnly, setIsAdminOnly] = useState(initial?.isAdminOnly ?? false);
  const canSave = name.trim().length > 0 && code.trim().length > 0;

  function handleNameChange(val: string) {
    setName(val);
    if (!initial) {
      setCode(val.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <button onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 11, cursor: 'pointer' }}>
          ← Volver
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt)', flex: 1 }}>
          {initial ? `Editar: ${initial.name}` : 'Nuevo kanban'}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <FieldLabel>Nombre *</FieldLabel>
          <input autoFocus value={name} onChange={(e) => handleNameChange(e.target.value)} placeholder="Ej: Desarrollo" className="cpop-input" />
        </div>
        <div>
          <FieldLabel>Código *</FieldLabel>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
            placeholder="Ej: desarrollo"
            className="cpop-input"
            style={{ fontFamily: 'monospace' }}
          />
        </div>
      </div>

      <div>
        <FieldLabel>Descripción</FieldLabel>
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descripción breve del equipo…" className="cpop-input" />
      </div>

      <div>
        <FieldLabel>Ícono del equipo</FieldLabel>
        <IconPicker value={icon} onChange={setIcon} />
      </div>

      <div>
        <FieldLabel>Color del equipo</FieldLabel>
        <ColorPicker color={color} onChange={setColor} />
      </div>

      <div>
        <FieldLabel>Visibilidad</FieldLabel>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: `1px solid ${isAdminOnly ? 'rgba(255,71,87,0.3)' : 'var(--border-subtle)'}`, background: isAdminOnly ? 'rgba(255,71,87,0.04)' : 'transparent', transition: 'all 0.15s' }}>
          <input type="checkbox" checked={isAdminOnly} onChange={(e) => setIsAdminOnly(e.target.checked)} style={{ accentColor: '#ff4757', width: 14, height: 14 }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: isAdminOnly ? '#ff4757' : 'var(--txt-muted)' }}>
              {isAdminOnly ? '🔒 Solo visible para admins' : '👁 Visible para todos los miembros de TI'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: 2 }}>
              {isAdminOnly ? 'Los miembros de TI no verán este kanban en el sidebar' : 'Todos los miembros del equipo TI pueden acceder'}
            </div>
          </div>
        </label>
      </div>

      {/* Preview */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, background: `${color}08`, border: `1px solid ${color}20` }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0, boxShadow: `0 0 7px ${color}` }} />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--txt)' }}>{name || 'Nombre del kanban'}</div>
          <div style={{ fontSize: 10, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>{code || 'codigo'}</div>
        </div>
        {description && (
          <span style={{ fontSize: 10, color: 'var(--txt-muted)', marginLeft: 4, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{description}</span>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
        <button
          onClick={() => canSave && !saving && onSave({ name: name.trim(), code: code.trim(), color, description: description.trim(), icon, isAdminOnly })}
          disabled={!canSave || saving}
          className={`cpop-btn-save${!canSave || saving ? ' cpop-btn-save--disabled' : ''}`}
        >
          {saving ? 'Guardando…' : 'GUARDAR'}
        </button>
      </div>
    </div>
  );
}

/* ── ColumnConfigPanel ── */
function ColumnConfigPanel({ teamId, boardId, teamColor }: {
  teamId:    number;
  boardId:   number;
  teamColor: string;
}) {
  const { data: columns = [], isLoading } = useTeamColumnConfig(boardId, teamId);
  const upsertConfig = useUpsertTeamColumnConfig(teamId);
  const updateColumn = useUpdateBoardColumn(boardId);
  const reorderColumn = useReorderBoardColumn(boardId, teamId);
  const [editColId, setEditColId] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={{ padding: '12px 14px', background: 'var(--bg-panel)', display: 'flex', flexDirection: 'column', gap: 5 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ height: 38, borderRadius: 7, background: 'linear-gradient(90deg, var(--bg-surface) 25%, var(--bg-hover) 50%, var(--bg-surface) 75%)', backgroundSize: '200% 100%', animation: 'skeleton-sweep 1.4s ease infinite', border: '1px solid var(--border-subtle)' }} />
        ))}
      </div>
    );
  }

  return (
    <div style={{ padding: '10px 12px 12px', background: 'var(--bg-panel)' }}>
      {/* Leyenda */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, padding: '4px 2px' }}>
        <span style={{ fontSize: 9, color: 'var(--txt-muted)', opacity: 0.5 }}>columna</span>
<span style={{ marginLeft: 'auto', fontSize: 9, color: 'var(--txt-muted)', opacity: 0.5 }}>visible</span>
        <span style={{ fontSize: 9, color: 'var(--txt-muted)', opacity: 0.5 }}>evidencia</span>
        <span style={{ fontSize: 9, color: 'var(--txt-muted)', opacity: 0.5 }}>cierre</span>
        <span style={{ fontSize: 9, color: 'var(--txt-muted)', opacity: 0.5 }}>editar</span>
        <span style={{ fontSize: 9, color: 'var(--txt-muted)', opacity: 0.5 }}>orden</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {columns.map((col, idx) =>
          editColId === col.Board_Column_ID ? (
            <ColumnEditForm
              key={col.Board_Column_ID}
              col={col}
              onSave={(d) => {
                updateColumn.mutate({ columnId: col.Board_Column_ID, name: d.name, color: col.Board_Column_Color, limit: d.limit });
                upsertConfig.mutate({ columnId: col.Board_Column_ID, isVisible: col.Is_Visible, evidenceRequired: col.Evidence_Required, evidenceLabel: col.Evidence_Label, isCloseColumn: col.Is_Close_Column, teamColor: d.color, teamTitleColor: d.titleColor });
                setEditColId(null);
              }}
              onCancel={() => setEditColId(null)}
              saving={updateColumn.isPending || upsertConfig.isPending}
              />
          ) : (
            <ColumnConfigRow
              key={col.Board_Column_ID}
              col={col}
              index={idx}
              total={columns.length}
              teamColor={teamColor}
              saving={upsertConfig.isPending}
onToggleVisible={(val) => upsertConfig.mutate({
                columnId: col.Board_Column_ID, isVisible: val,
                evidenceRequired: col.Evidence_Required, evidenceLabel: col.Evidence_Label,
                isCloseColumn: col.Is_Close_Column,
              })}
              onToggleEvidence={(val) => upsertConfig.mutate({
                columnId: col.Board_Column_ID, isVisible: col.Is_Visible,
                evidenceRequired: val, evidenceLabel: col.Evidence_Label,
                isCloseColumn: col.Is_Close_Column,
              })}
              onToggleCloseColumn={(val) => upsertConfig.mutate({
                columnId: col.Board_Column_ID, isVisible: col.Is_Visible,
                evidenceRequired: col.Evidence_Required, evidenceLabel: col.Evidence_Label,
                isCloseColumn: val,
              })}
              onUpdateLabel={(label) => upsertConfig.mutate({
                columnId: col.Board_Column_ID, isVisible: col.Is_Visible,
                evidenceRequired: col.Evidence_Required, evidenceLabel: label || null,
                isCloseColumn: col.Is_Close_Column,
              })}
              onEdit={() => setEditColId(col.Board_Column_ID)}
              onMoveUp={() => reorderColumn.mutate({ columnId: col.Board_Column_ID, direction: 'up' })}
              onMoveDown={() => reorderColumn.mutate({ columnId: col.Board_Column_ID, direction: 'down' })}
            />
          )
        )}
      </div>

      {columns.length === 0 && (
        <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: 0, opacity: 0.6 }}>No hay columnas en el board.</p>
      )}
    </div>
  );
}

/* ── ColumnConfigRow ── */
function ColumnConfigRow({ col, index, total, teamColor, saving, onToggleVisible, onToggleEvidence, onToggleCloseColumn, onUpdateLabel, onEdit, onMoveUp, onMoveDown }: {
  col:              ColumnWithConfig;
  index:            number;
  total:            number;
  teamColor:        string;
  saving:           boolean;
  onToggleVisible:  (val: boolean) => void;
  onToggleEvidence:    (val: boolean) => void;
  onToggleCloseColumn: (val: boolean) => void;
  onUpdateLabel:       (label: string) => void;
  onEdit:              () => void;
  onMoveUp:         () => void;
  onMoveDown:       () => void;
}) {
  const [hov,        setHov]        = useState(false);
  const [labelInput, setLabelInput] = useState(col.Evidence_Label ?? '');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincronizar si el valor del servidor cambia
  useEffect(() => { setLabelInput(col.Evidence_Label ?? ''); }, [col.Evidence_Label]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  function handleLabelChange(val: string) {
    setLabelInput(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onUpdateLabel(val), 700);
  }

  const dotColor = col.Team_Column_Color ?? col.Board_Column_Color ?? '#b2bec3';

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        borderRadius: 8,
        border:       `1px solid ${hov ? 'var(--border)' : 'var(--border-subtle)'}`,
        background:   hov ? 'var(--bg-hover)' : 'var(--bg-surface)',
        transition:   'all 0.12s',
        overflow:     'hidden',
      }}
    >
      {/* Fila principal */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />

        <span style={{
          flex: 1, fontSize: 12, fontWeight: 500,
          color:          col.Is_Visible ? (col.Team_Column_Title_Color ?? 'var(--txt)') : 'var(--txt-muted)',
          textDecoration: col.Is_Visible ? 'none' : 'line-through',
          opacity:        col.Is_Visible ? 1 : 0.5,
          transition:     'all 0.15s',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {col.Board_Column_Name}
        </span>

        {col.Board_Column_Limit > 0 && (
          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', flexShrink: 0 }}>
            lím. {col.Board_Column_Limit}
          </span>
        )}

        {/* Toggle visible */}
        <button
          onClick={() => onToggleVisible(!col.Is_Visible)}
          disabled={saving}
          title={col.Is_Visible ? 'Ocultar para este equipo' : 'Mostrar'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 5, cursor: 'pointer', transition: 'all 0.12s',
            border:      `1px solid ${col.Is_Visible ? 'rgba(0,229,160,0.3)' : 'rgba(255,71,87,0.3)'}`,
            background:  col.Is_Visible ? 'rgba(0,229,160,0.08)' : 'rgba(255,71,87,0.08)',
            color:       col.Is_Visible ? '#00e5a0' : '#ff4757',
          }}
        >
          {col.Is_Visible
            ? <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
          }
        </button>

        {/* Toggle evidencia */}
        <button
          onClick={() => onToggleEvidence(!col.Evidence_Required)}
          disabled={saving}
          title={col.Evidence_Required ? 'Quitar evidencia requerida' : 'Requerir evidencia al mover aquí'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 5, cursor: 'pointer', transition: 'all 0.12s',
            border:     `1px solid ${col.Evidence_Required ? `${teamColor}50` : 'var(--border-subtle)'}`,
            background: col.Evidence_Required ? `${teamColor}15` : 'transparent',
            color:      col.Evidence_Required ? teamColor : 'var(--txt-muted)',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
          </svg>
        </button>

        {/* Toggle columna de cierre */}
        <button
          onClick={() => onToggleCloseColumn(!col.Is_Close_Column)}
          disabled={saving}
          title={col.Is_Close_Column ? 'Desmarcar como columna de cierre' : 'Marcar como columna de cierre (sella el ticket al llegar aquí)'}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, borderRadius: 5, cursor: 'pointer', transition: 'all 0.12s',
            border:     `1px solid ${col.Is_Close_Column ? 'rgba(253,203,110,0.5)' : 'var(--border-subtle)'}`,
            background: col.Is_Close_Column ? 'rgba(253,203,110,0.15)' : 'transparent',
            color:      col.Is_Close_Column ? '#fdcb6e' : 'var(--txt-muted)',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
          </svg>
        </button>

        {/* Editar columna global */}
        <SmBtn color="#a29bfe" onClick={onEdit} title="Editar nombre, color y límite">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/>
          </svg>
        </SmBtn>

        {/* Reordenar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, opacity: hov ? 1 : 0, transition: 'opacity 0.12s' }}>
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            title="Subir columna"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 12, borderRadius: 3, border: 'none', background: 'transparent', color: index === 0 ? 'var(--border)' : 'var(--txt-muted)', cursor: index === 0 ? 'default' : 'pointer' }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 5l3-3 3 3"/></svg>
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            title="Bajar columna"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 12, borderRadius: 3, border: 'none', background: 'transparent', color: index === total - 1 ? 'var(--border)' : 'var(--txt-muted)', cursor: index === total - 1 ? 'default' : 'pointer' }}
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M1 3l3 3 3-3"/></svg>
          </button>
        </div>
      </div>

      {/* Label de evidencia (visible solo si Evidence_Required) */}
      {col.Evidence_Required && (
        <div style={{ padding: '0 10px 8px 26px', borderTop: '1px dashed var(--border-subtle)', marginTop: 0 }}>
          <input
            value={labelInput}
            onChange={(e) => handleLabelChange(e.target.value)}
            placeholder="Descripción de la evidencia… Ej: Adjuntá el PR mergeado"
            className="cpop-input"
            style={{ fontSize: 11, marginTop: 6 }}
          />
        </div>
      )}
    </div>
  );
}

/* ── ColumnEditForm — edición inline de columna global ── */
function ColumnEditForm({ col, onSave, onCancel, saving }: {
  col:      ColumnWithConfig;
  onSave:   (d: { name: string; color: string; titleColor: string; limit: number }) => void;
  onCancel: () => void;
  saving?:  boolean;
}) {
  const [name,       setName]       = useState(col.Board_Column_Name);
  const [color,      setColor]      = useState(col.Team_Column_Color ?? col.Board_Column_Color);
  const [titleColor, setTitleColor] = useState(col.Team_Column_Title_Color ?? col.Team_Column_Color ?? col.Board_Column_Color);
  const [limit,      setLimit]      = useState(col.Board_Column_Limit);
  const canSave = name.trim().length > 0;

  return (
    <div style={{ borderRadius: 8, border: `1px solid var(--accent)35`, background: 'var(--bg-surface)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', flex: 1 }}>Editar columna</span>
       <span style={{ fontSize: 9, color: 'var(--txt-muted)', opacity: 0.6 }}>⚠ afecta todos los equipos</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
        <div>
          <FieldLabel>Nombre *</FieldLabel>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className="cpop-input" readOnly />
        </div>
        <div>
          <FieldLabel>Límite (0=∞)</FieldLabel>
          <input
            type="number" min={0} value={limit}
            onChange={(e) => setLimit(Math.max(0, parseInt(e.target.value) || 0))}
            className="cpop-input"
          />
        </div>
      </div>

      <div>
        <FieldLabel>Color — solo este equipo</FieldLabel>
        <ColorPicker color={color} onChange={setColor} />
        {col.Team_Column_Color && col.Team_Column_Color !== col.Board_Column_Color && (
          <button onClick={() => setColor(col.Board_Column_Color)} style={{ marginTop: 4, fontSize: 10, background: 'none', border: 'none', color: 'var(--txt-muted)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
            Restaurar color global
          </button>
        )}
      </div>

      <div>
        <FieldLabel>Color del título — solo este equipo</FieldLabel>
        <ColorPicker color={titleColor} onChange={setTitleColor} />
        {col.Team_Column_Title_Color && col.Team_Column_Title_Color !== (col.Team_Column_Color ?? col.Board_Column_Color) && (
          <button onClick={() => setTitleColor(col.Team_Column_Color ?? col.Board_Column_Color)} style={{ marginTop: 4, fontSize: 10, background: 'none', border: 'none', color: 'var(--txt-muted)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
            Usar mismo color que el fondo
          </button>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
        <button
onClick={() => canSave && !saving && onSave({ name: name.trim(), color, titleColor, limit })}          disabled={!canSave || saving}
          className={`cpop-btn-save${!canSave || saving ? ' cpop-btn-save--disabled' : ''}`}
        >
          {saving ? 'Guardando…' : 'GUARDAR'}
        </button>
      </div>
    </div>
  );
}

/* ── ColumnCreateForm — nueva columna global ── */
function ColumnCreateForm({ onSave, onCancel, saving }: {
  onSave:   (d: { name: string; color: string; titleColor: string; limit: number }) => void;
  onCancel: () => void;
  saving?:  boolean;
}) {
  const [name,  setName]  = useState('');
  const [color, setColor] = useState('#b2bec3');
  const [limit, setLimit] = useState(0);
  const [titleColor] = useState('#b2bec3');
  const canSave = name.trim().length > 0;

  return (
    <div style={{ borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-surface)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt-muted)' }}>Nueva columna global</span>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 100px', gap: 8 }}>
        <div>
          <FieldLabel>Nombre *</FieldLabel>
          <input
            autoFocus value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && canSave) onSave({ name: name.trim(), titleColor, color, limit });
             if (e.key === 'Escape') onCancel(); }}
            placeholder="Ej: En revisión"
            className="cpop-input"
          />
        </div>
        <div>
          <FieldLabel>Límite (0=∞)</FieldLabel>
          <input
            type="number" min={0} value={limit}
            onChange={(e) => setLimit(Math.max(0, parseInt(e.target.value) || 0))}
            className="cpop-input"
          />
        </div>
      </div>

      <div>
        <FieldLabel>Color</FieldLabel>
        <ColorPicker color={color} onChange={setColor} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
        <button
          onClick={() => canSave && !saving && onSave({ name: name.trim(), color, titleColor, limit })}
          disabled={!canSave || saving}
          className={`cpop-btn-save${!canSave || saving ? ' cpop-btn-save--disabled' : ''}`}
        >
          {saving ? 'Creando…' : 'CREAR'}
        </button>
      </div>
    </div>
  );
}
