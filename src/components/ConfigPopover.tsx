import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useBoardStore } from '@/store/boardStore';
import { useBoardTeams, useLabelsByTeamId } from '@/features/requests/hooks/useBoardMetadata';
import { useSprints, useCreateSprint, useUpdateSprint, useDeleteSprint } from '@/features/requests/hooks/useSprints';
import { useSubTeams, useCreateSubTeam, useUpdateSubTeam, useDeleteSubTeam } from '@/features/requests/hooks/useSubTeams';
import { apiClient } from '@/lib/apiClient';
import { useQueryClient } from '@tanstack/react-query';
import { config } from '@/config';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import type { SubTeam } from '@/features/requests/hooks/useSubTeams';
import type { BoardLabel } from '@/features/requests/hooks/useBoardMetadata';

const COLORS = [
  '#ff4757','#ff6b81','#ff7f50','#fdcb6e','#f9ca24','#a3cb38',
  '#00e5a0','#00cec9','#00c8ff','#0984e3','#6c5ce7','#a29bfe',
  '#fd79a8','#e84393','#b2bec3',
];
const EMOJIS = ['🐛','🎨','🖼️','📊','⚙️','🔧','🚀','💡','📋','🔒','🌐','📱','💰','🔔','✅','🧪','🎯','🏷️'];

function usePopoverPos(btnRef: React.RefObject<HTMLButtonElement | null>, open: boolean) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const calc = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const W = 330, H = 560;
    let left = r.right + 8;
    let top  = r.bottom - H;
    if (left + W > window.innerWidth - 8) left = r.left - W - 8;
    if (top < 8) top = 8;
    setPos({ top, left });
  }, [btnRef]);

  useEffect(() => {
    if (!open) return;
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [open, calc]);

  return pos;
}

export function ConfigPopover() {
  const [open, setOpen] = useState(false);
  const [tab,  setTab]  = useState<'labels' | 'subteams' | 'sprints'>('labels');
  const btnRef   = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pos      = usePopoverPos(btnRef, open);
  const { equipoActivo } = useBoardStore();
  const boardId  = config.DEFAULT_BOARD_ID;

  const { data: teams = [] } = useBoardTeams(boardId);
  const activeTeam = teams.find((t) => t.Board_Team_Code === equipoActivo);
  const teamId = activeTeam?.Board_Team_ID ?? null;

  const { data: labels   = [] } = useLabelsByTeamId(boardId, teamId);
  const { data: sprints  = [] } = useSprints();
  const { data: subTeams = [] } = useSubTeams(teamId);

  const createSprint   = useCreateSprint();
  const updateSprint   = useUpdateSprint();
  const deleteSprint   = useDeleteSprint();
  const createSubTeam  = useCreateSubTeam(teamId);
  const updateSubTeam  = useUpdateSubTeam(teamId);
  const deleteSubTeam  = useDeleteSubTeam(teamId);
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', fn);
    return () => document.removeEventListener('keydown', fn);
  }, [open]);

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

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Configurar etiquetas, sub-equipos y sprints"
        className={`cpop-trigger${open ? ' cpop-trigger--open' : ''}`}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="2.5"/>
          <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" strokeLinecap="round"/>
        </svg>
      </button>

      {open && createPortal(
        <div ref={panelRef} className="cpop-panel" style={{ top: pos.top, left: pos.left }}>
          <div className="cpop-accent-line" />

          <div className="cpop-header">
            <span className="cpop-header__title">Config · {equipoActivo}</span>
            <button onClick={() => setOpen(false)} className="cpop-header__close">×</button>
          </div>

          <div className="cpop-tabs">
            {(['labels', 'subteams', 'sprints'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`cpop-tab${tab === t ? ' cpop-tab--active' : ''}`}>
                {t === 'labels' ? 'Etiquetas' : t === 'subteams' ? 'Sub-equipos' : 'Sprints'}
              </button>
            ))}
          </div>

          <div className="cpop-body">
            {/* ── Etiquetas ── */}
            {tab === 'labels' && teamId && (
              <LabelList
                labels={labels}
                onAdd={handleCreateLabel}
                onUpdate={handleUpdateLabel}
                onDelete={handleDeleteLabel}
              />
            )}
            {tab === 'labels' && !teamId && (
              <p className="cpop-empty">Seleccioná un equipo en el board para ver sus etiquetas.</p>
            )}

            {/* ── Sub-equipos ── */}
            {tab === 'subteams' && teamId && (
              <SubTeamList
                subTeams={subTeams}
                onAdd={(d) => createSubTeam.mutate(d)}
                onUpdate={(id, d) => updateSubTeam.mutate({ id, ...d })}
                onRemove={(id) => deleteSubTeam.mutate(id)}
              />
            )}
            {tab === 'subteams' && !teamId && (
              <p className="cpop-empty">Seleccioná un equipo en el board para ver sus sub-equipos.</p>
            )}

            {/* ── Sprints ── */}
            {tab === 'sprints' && (
              <SprintList
                sprints={sprints}
                onAdd={(s) => createSprint.mutate(s)}
                onUpdate={(id, s) => updateSprint.mutate({ id, ...s })}
                onRemove={(id) => deleteSprint.mutate(id)}
              />
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ============================================================
   Lista de etiquetas
   ============================================================ */
function LabelList({ labels, onAdd, onUpdate, onDelete }: {
  labels:   BoardLabel[];
  onAdd:    (d: { name: string; color: string; icon: string }) => void;
  onUpdate: (id: number, d: { name: string; color: string; icon: string }) => void;
  onDelete: (id: number) => void;
}) {
  const [editId,  setEditId]  = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {labels.length === 0 && !showNew && (
        <p className="cpop-empty">No hay etiquetas para este equipo.</p>
      )}
      {labels.map((label) =>
        editId === label.Label_ID ? (
          <LabelForm key={label.Label_ID}
            initial={{ name: label.Label_Name, color: label.Label_Color, icon: label.Label_Icon }}
            onSave={(d) => { onUpdate(label.Label_ID, d); setEditId(null); }}
            onCancel={() => setEditId(null)}
          />
        ) : (
          <ColorRow key={label.Label_ID}
            color={label.Label_Color} icon={label.Label_Icon} name={label.Label_Name}
            onEdit={() => { setShowNew(false); setEditId(label.Label_ID); }}
            onDelete={() => onDelete(label.Label_ID)}
          />
        )
      )}
      {showNew ? (
        <LabelForm onSave={(d) => { onAdd(d); setShowNew(false); }} onCancel={() => setShowNew(false)} />
      ) : (
        <AddBtn label="Nueva etiqueta" onClick={() => { setEditId(null); setShowNew(true); }} />
      )}
    </div>
  );
}

/* ============================================================
   Lista de sub-equipos
   ============================================================ */
function SubTeamList({ subTeams, onAdd, onUpdate, onRemove }: {
  subTeams: SubTeam[];
  onAdd:    (d: { name: string; color: string }) => void;
  onUpdate: (id: number, d: { name: string; color: string }) => void;
  onRemove: (id: number) => void;
}) {
  const [editId,  setEditId]  = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {subTeams.length === 0 && !showNew && (
        <p className="cpop-empty">No hay sub-equipos para este equipo.</p>
      )}
      {subTeams.map((st) =>
        editId === st.Sub_Team_ID ? (
          <SimpleColorForm key={st.Sub_Team_ID}
            initial={{ name: st.Sub_Team_Name, color: st.Sub_Team_Color }}
            onSave={(d) => { onUpdate(st.Sub_Team_ID, d); setEditId(null); }}
            onCancel={() => setEditId(null)}
          />
        ) : (
          <ColorRow key={st.Sub_Team_ID}
            color={st.Sub_Team_Color} name={st.Sub_Team_Name}
            onEdit={() => { setShowNew(false); setEditId(st.Sub_Team_ID); }}
            onDelete={() => onRemove(st.Sub_Team_ID)}
          />
        )
      )}
      {showNew ? (
        <SimpleColorForm onSave={(d) => { onAdd(d); setShowNew(false); }} onCancel={() => setShowNew(false)} />
      ) : (
        <AddBtn label="Nuevo sub-equipo" onClick={() => { setEditId(null); setShowNew(true); }} />
      )}
    </div>
  );
}

/* ============================================================
   Lista de sprints
   ============================================================ */
function SprintList({ sprints, onAdd, onUpdate, onRemove }: {
  sprints:  Sprint[];
  onAdd:    (s: { text: string; startDate: string; endDate: string }) => void;
  onUpdate: (id: number, s: { text: string; startDate: string; endDate: string }) => void;
  onRemove: (id: number) => void;
}) {
  const [editId,  setEditId]  = useState<number | null>(null);
  const [showNew, setShowNew] = useState(false);

  const sorted = [...sprints].sort(
    (a, b) => new Date(b.Sprint_Start_Date).getTime() - new Date(a.Sprint_Start_Date).getTime()
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {sorted.length === 0 && !showNew && (
        <p className="cpop-empty">No hay sprints definidos aún.</p>
      )}
      {sorted.map((sp) =>
        editId === sp.Sprint_ID ? (
          <SprintForm key={sp.Sprint_ID}
            initial={{ text: sp.Sprint_Text, startDate: sp.Sprint_Start_Date, endDate: sp.Sprint_End_Date }}
            onSave={(d) => { onUpdate(sp.Sprint_ID, d); setEditId(null); }}
            onCancel={() => setEditId(null)}
          />
        ) : (
          <SprintRow key={sp.Sprint_ID} sprint={sp}
            onEdit={() => { setShowNew(false); setEditId(sp.Sprint_ID); }}
            onRemove={() => onRemove(sp.Sprint_ID)}
          />
        )
      )}
      {showNew ? (
        <SprintForm onSave={(d) => { onAdd(d); setShowNew(false); }} onCancel={() => setShowNew(false)} />
      ) : (
        <AddBtn label="Nuevo sprint" onClick={() => { setEditId(null); setShowNew(true); }} />
      )}
    </div>
  );
}

/* ============================================================
   Componentes compartidos
   ============================================================ */
function ColorRow({ color, icon, name, onEdit, onDelete }: {
  color: string; icon?: string; name: string; onEdit: () => void; onDelete: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className={`cpop-row${hov ? ' cpop-row--hov' : ''}`}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {icon && <span style={{ fontSize: 13 }}>{icon}</span>}
      <span className="cpop-row__name">{name}</span>
      <div style={{ display: 'flex', gap: 3, opacity: hov ? 1 : 0, transition: 'opacity 0.12s', marginLeft: 'auto' }}>
        <SmBtn color="#00c8ff" onClick={onEdit} title="Editar">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg>
        </SmBtn>
        <SmBtn color="#ff4757" onClick={onDelete} title="Eliminar">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg>
        </SmBtn>
      </div>
    </div>
  );
}

function LabelForm({ initial, onSave, onCancel }: {
  initial?:  { name: string; color: string; icon: string };
  onSave:    (d: { name: string; color: string; icon: string }) => void;
  onCancel:  () => void;
}) {
  const [name,  setName]  = useState(initial?.name  ?? '');
  const [color, setColor] = useState(initial?.color ?? '#00c8ff');
  const [icon,  setIcon]  = useState(initial?.icon  ?? '');
  const canSave = name.trim().length > 0;

  return (
    <div className="cpop-form">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSave) onSave({ name: name.trim(), color, icon });
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Nombre de la etiqueta..." className="cpop-input"
      />
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' as const }}>
        {EMOJIS.map((e) => (
          <button key={e} type="button" onClick={() => setIcon(icon === e ? '' : e)}
            className={`cpop-emoji${icon === e ? ' cpop-emoji--active' : ''}`}>{e}</button>
        ))}
      </div>
      <ColorPicker color={color} onChange={setColor} />
      <FormActions canSave={canSave} onSave={() => onSave({ name: name.trim(), color, icon })} onCancel={onCancel} />
    </div>
  );
}

function SimpleColorForm({ initial, onSave, onCancel }: {
  initial?:  { name: string; color: string };
  onSave:    (d: { name: string; color: string }) => void;
  onCancel:  () => void;
}) {
  const [name,  setName]  = useState(initial?.name  ?? '');
  const [color, setColor] = useState(initial?.color ?? '#00c8ff');
  const canSave = name.trim().length > 0;

  return (
    <div className="cpop-form">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSave) onSave({ name: name.trim(), color });
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Nombre del sub-equipo..." className="cpop-input"
      />
      <ColorPicker color={color} onChange={setColor} />
      <FormActions canSave={canSave} onSave={() => onSave({ name: name.trim(), color })} onCancel={onCancel} />
    </div>
  );
}

function SprintRow({ sprint, onEdit, onRemove }: { sprint: Sprint; onEdit: () => void; onRemove: () => void }) {
  const [hov, setHov] = useState(false);
  const now   = new Date();
  const start = new Date(sprint.Sprint_Start_Date);
  const end   = new Date(sprint.Sprint_End_Date);
  const isActive = now >= start && now <= end;
  const isPast   = now > end;
  const statusColor = isActive ? '#00e5a0' : isPast ? '#b2bec3' : '#fdcb6e';
  const statusLabel = isActive ? 'activo' : isPast ? 'pasado' : 'futuro';
  const fmt = (iso: string) => { const [y, m, d] = iso.split('T')[0].split('-'); return `${d}/${m}/${y}`; };

  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      className={`cpop-row${hov ? ' cpop-row--hov' : ''}`}
      style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '6px 8px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        <span className="cpop-row__name" style={{ flex: 1 }}>{sprint.Sprint_Text}</span>
        <span style={{ fontSize: 9, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{statusLabel}</span>
        <div style={{ display: 'flex', gap: 3, opacity: hov ? 1 : 0, transition: 'opacity 0.12s' }}>
          <SmBtn color="#00c8ff" onClick={onEdit} title="Editar">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg>
          </SmBtn>
          <SmBtn color="#ff4757" onClick={onRemove} title="Eliminar">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg>
          </SmBtn>
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--txt-muted)', paddingLeft: 13 }}>
        {fmt(sprint.Sprint_Start_Date)} → {fmt(sprint.Sprint_End_Date)}
      </span>
    </div>
  );
}

function SprintForm({ initial, onSave, onCancel }: {
  initial?:  { text: string; startDate: string; endDate: string };
  onSave:    (d: { text: string; startDate: string; endDate: string }) => void;
  onCancel:  () => void;
}) {
  const [text,      setText]      = useState(initial?.text      ?? '');
  const [startDate, setStartDate] = useState(initial?.startDate ?? '');
  const [endDate,   setEndDate]   = useState(initial?.endDate   ?? '');
  const canSave = text.trim() && startDate && endDate && endDate >= startDate;

  return (
    <div className="cpop-form">
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSave) onSave({ text: text.trim(), startDate, endDate });
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Nombre del sprint..." className="cpop-input"
      />
      <div style={{ display: 'flex', gap: 6 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          <label style={{ fontSize: 9, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Inicio</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="cpop-input cpop-input--date" />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          <label style={{ fontSize: 9, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Fin</label>
          <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="cpop-input cpop-input--date" />
        </div>
      </div>
      {endDate && startDate && endDate < startDate && (
        <p style={{ fontSize: 10, color: '#ff4757', margin: 0 }}>La fecha de fin debe ser posterior al inicio.</p>
      )}
      <FormActions canSave={!!canSave} onSave={() => canSave && onSave({ text: text.trim(), startDate, endDate })} onCancel={onCancel} />
    </div>
  );
}

/* ============================================================
   Helpers compartidos
   ============================================================ */
function ColorPicker({ color, onChange }: { color: string; onChange: (c: string) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
      {COLORS.map((c) => (
        <div key={c} onClick={() => onChange(c)} className="cpop-swatch"
          style={{ background: c, border: color === c ? '2px solid var(--txt)' : '2px solid transparent', transform: color === c ? 'scale(1.25)' : 'scale(1)' }}
        />
      ))}
    </div>
  );
}

function FormActions({ canSave, onSave, onCancel }: { canSave: boolean; onSave: () => void; onCancel: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
      <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
      <button onClick={() => canSave && onSave()} className={`cpop-btn-save${canSave ? '' : ' cpop-btn-save--disabled'}`}>
        GUARDAR
      </button>
    </div>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="cpop-add-btn">
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M4.5 1v7M1 4.5h7" strokeLinecap="round"/>
      </svg>
      {label}
    </button>
  );
}

function SmBtn({ color, onClick, title, children }: { color: string; onClick: () => void; title: string; children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width: 20, height: 20, borderRadius: 4, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hov ? `${color}28` : `${color}12`, color, transition: 'background 0.12s' }}
    >
      {children}
    </button>
  );
}