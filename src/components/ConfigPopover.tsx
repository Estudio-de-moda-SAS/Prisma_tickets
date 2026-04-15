import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useConfigStore } from '@/store/configStore';
import { useBoardStore } from '@/store/boardStore';
import type { Sprint} from '@/store/configStore';

const COLORS = [
  '#ff4757','#ff6b81','#ff7f50','#fdcb6e','#f9ca24','#a3cb38',
  '#00e5a0','#00cec9','#00c8ff','#0984e3','#6c5ce7','#a29bfe',
  '#fd79a8','#e84393','#b2bec3',
];
const EMOJIS = ['🐛','🎨','🖼️','📊','⚙️','🔧','🚀','💡','📋','🔒','🌐','📱','💰','🔔','✅','🧪','🎯','🏷️'];

function usePopoverPos(
  btnRef: React.RefObject<HTMLButtonElement | null>,
  open: boolean,
) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const calc = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const W = 330, H = 520;
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

/* ============================================================
   Botón + Panel
   ============================================================ */
export function ConfigPopover() {
  const [open, setOpen] = useState(false);
  const [tab,  setTab]  = useState<'categorias' | 'equipos' | 'sprints'>('categorias');
  const btnRef   = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const pos      = usePopoverPos(btnRef, open);
  const { equipoActivo } = useBoardStore();
  const store = useConfigStore();

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

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => setOpen((v) => !v)}
        title="Configurar categorías, equipos y sprints"
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
            {(['categorias', 'equipos', 'sprints'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`cpop-tab${tab === t ? ' cpop-tab--active' : ''}`}
              >
                {t === 'categorias' ? 'Categorías' : t === 'equipos' ? 'Equipos' : 'Sprints'}
              </button>
            ))}
          </div>

          <div className="cpop-body">
            {tab === 'categorias' && (
              <ItemList
                items={store.getCategorias(equipoActivo).map((c) => ({
                  id: c.id, nombre: c.nombre, color: c.color, extra: c.icono,
                }))}
                onAdd={(d)        => store.addCategoria(equipoActivo, { nombre: d.nombre, color: d.color, icono: d.extra })}
                onUpdate={(id, d) => store.updateCategoria(equipoActivo, id, { nombre: d.nombre, color: d.color, icono: d.extra })}
                onRemove={(id)    => store.removeCategoria(equipoActivo, id)}
                tipo="categoria"
                addLabel="Nueva categoría"
              />
            )}

            {tab === 'equipos' && (
              <ItemList
                items={store.getEquipos(equipoActivo).map((e) => ({
                  id: e.id, nombre: e.nombre, color: e.color, extra: e.siglas,
                }))}
                onAdd={(d)        => store.addEquipo(equipoActivo, { nombre: d.nombre, color: d.color, siglas: d.extra ?? '' })}
                onUpdate={(id, d) => store.updateEquipo(equipoActivo, id, { nombre: d.nombre, color: d.color, siglas: d.extra })}
                onRemove={(id)    => store.removeEquipo(equipoActivo, id)}
                tipo="equipo"
                addLabel="Nuevo equipo"
              />
            )}

            {tab === 'sprints' && (
              <SprintList 
                sprints={store.getSprints(equipoActivo)}
                onAdd={(s)        => store.addSprint(equipoActivo, s)}
                onUpdate={(id, s) => store.updateSprint(equipoActivo, id, s)}
                onRemove={(id)    => store.removeSprint(equipoActivo, id)}
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
   Lista genérica (categorías + equipos — sin cambios)
   ============================================================ */
type FlatItem = { id: string; nombre: string; color: string; extra?: string };

function ItemList({ items, onAdd, onUpdate, onRemove, tipo, addLabel }: {
  items:    FlatItem[];
  onAdd:    (d: Omit<FlatItem, 'id'>) => void;
  onUpdate: (id: string, d: Omit<FlatItem, 'id'>) => void;
  onRemove: (id: string) => void;
  tipo:     'categoria' | 'equipo';
  addLabel: string;
}) {
  const [editId,  setEditId]  = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {items.length === 0 && !showNew && (
        <p className="cpop-empty">
          No hay {tipo === 'categoria' ? 'categorías' : 'equipos'} aún.
        </p>
      )}

      {items.map((item) =>
        editId === item.id ? (
          <ItemForm key={item.id} initial={item} tipo={tipo}
            onSave={(d) => { onUpdate(item.id, d); setEditId(null); }}
            onCancel={() => setEditId(null)}
          />
        ) : (
          <ItemRow key={item.id} item={item} tipo={tipo}
            onEdit={() => { setShowNew(false); setEditId(item.id); }}
            onRemove={() => onRemove(item.id)}
          />
        )
      )}

      {showNew ? (
        <ItemForm tipo={tipo}
          onSave={(d) => { onAdd(d); setShowNew(false); }}
          onCancel={() => setShowNew(false)}
        />
      ) : (
        <AddBtn label={addLabel} onClick={() => { setEditId(null); setShowNew(true); }} />
      )}
    </div>
  );
}

function ItemRow({ item, tipo, onEdit, onRemove }: {
  item: FlatItem; tipo: 'categoria' | 'equipo';
  onEdit: () => void; onRemove: () => void;
}) {
  const [hov, setHov] = useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`cpop-row${hov ? ' cpop-row--hov' : ''}`}
    >
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
      {tipo === 'categoria' && item.extra && <span style={{ fontSize: 13, lineHeight: 1 }}>{item.extra}</span>}
      <span className="cpop-row__name">{item.nombre}</span>
      {tipo === 'equipo' && item.extra && (
        <span className="cpop-row__siglas" style={{ background: `${item.color}18`, color: item.color }}>
          {item.extra}
        </span>
      )}
      <div style={{ display: 'flex', gap: 3, opacity: hov ? 1 : 0, transition: 'opacity 0.12s' }}>
        <SmBtn color="#00c8ff" onClick={onEdit} title="Editar">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg>
        </SmBtn>
        <SmBtn color="#ff4757" onClick={onRemove} title="Eliminar">
          <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg>
        </SmBtn>
      </div>
    </div>
  );
}

function ItemForm({ initial, tipo, onSave, onCancel }: {
  initial?:  Partial<FlatItem>;
  tipo:      'categoria' | 'equipo';
  onSave:    (d: Omit<FlatItem, 'id'>) => void;
  onCancel:  () => void;
}) {
  const [nombre, setNombre] = useState(initial?.nombre ?? '');
  const [color,  setColor]  = useState(initial?.color  ?? '#00c8ff');
  const [extra,  setExtra]  = useState(initial?.extra  ?? '');
  const canSave = nombre.trim() && (tipo === 'categoria' || extra.trim());

  return (
    <div className="cpop-form">
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && canSave) onSave({ nombre: nombre.trim(), color, extra });
            if (e.key === 'Escape') onCancel();
          }}
          placeholder={tipo === 'categoria' ? 'Nombre de la categoría...' : 'Nombre del equipo...'}
          className="cpop-input"
        />
        {tipo === 'equipo' && (
          <input
            value={extra}
            onChange={(e) => setExtra(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="AB"
            className="cpop-input cpop-input--siglas"
          />
        )}
      </div>

      {tipo === 'categoria' && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' as const }}>
          {EMOJIS.map((e) => (
            <button
              key={e} type="button"
              onClick={() => setExtra(extra === e ? '' : e)}
              className={`cpop-emoji${extra === e ? ' cpop-emoji--active' : ''}`}
            >{e}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
        {COLORS.map((c) => (
          <div
            key={c} onClick={() => setColor(c)}
            className="cpop-swatch"
            style={{
              background: c,
              border: color === c ? '2px solid var(--txt)' : '2px solid transparent',
              transform: color === c ? 'scale(1.25)' : 'scale(1)',
            }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
        <button
          onClick={() => canSave && onSave({ nombre: nombre.trim(), color, extra })}
          className={`cpop-btn-save${canSave ? '' : ' cpop-btn-save--disabled'}`}
        >GUARDAR</button>
      </div>
    </div>
  );
}

/* ============================================================
   Sprints — lista + CRUD
   ============================================================ */

function SprintList({ sprints, onAdd, onUpdate, onRemove }: {
  sprints:  Sprint[];
  onAdd:    (s: Omit<Sprint, 'id'>) => void;
  onUpdate: (id: string, patch: Partial<Omit<Sprint, 'id'>>) => void;
  onRemove: (id: string) => void;
}) {
  const [editId,  setEditId]  = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  /* Ordena por fechaInicio desc — el más reciente primero */
  const sorted = [...sprints].sort(
    (a, b) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime()
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      {sorted.length === 0 && !showNew && (
        <p className="cpop-empty">No hay sprints definidos aún.</p>
      )}

      {sorted.map((sp) =>
        editId === sp.id ? (
          <SprintForm key={sp.id} initial={sp}
            onSave={(d) => { onUpdate(sp.id, d); setEditId(null); }}
            onCancel={() => setEditId(null)}
          />
        ) : (
          <SprintRow key={sp.id} sprint ={sp}
            onEdit={() => { setShowNew(false); setEditId(sp.id); }}
            onRemove={() => onRemove(sp.id)}
          />
        )
      )}

      {showNew ? (
        <SprintForm
          onSave={(d) => { onAdd(d); setShowNew(false); }}
          onCancel={() => setShowNew(false)}
        />
      ) : (
        <AddBtn label="Nuevo sprint" onClick={() => { setEditId(null); setShowNew(true); }} />
      )}
    </div>
  );
}

function SprintRow({ sprint, onEdit, onRemove }: {
  sprint: Sprint; onEdit: () => void; onRemove: () => void;
}) {
  const [hov, setHov] = useState(false);

  const fmt = (iso: string) => {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  };

  /* Estado visual del sprint */
  const now   = new Date();
  const start = new Date(sprint.fechaInicio);
  const end   = new Date(sprint.fechaFin);
  const isActive  = now >= start && now <= end;
  const isPast    = now > end;
  const statusColor = isActive ? '#00e5a0' : isPast ? '#b2bec3' : '#fdcb6e';
  const statusLabel = isActive ? 'activo' : isPast ? 'pasado' : 'futuro';

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      className={`cpop-row${hov ? ' cpop-row--hov' : ''}`}
      style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '6px 8px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
        {/* Dot de estado */}
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        <span className="cpop-row__name" style={{ flex: 1 }}>{sprint.nombre}</span>
        <span style={{ fontSize: 9, color: statusColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {statusLabel}
        </span>
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
        {fmt(sprint.fechaInicio)} → {fmt(sprint.fechaFin)}
      </span>
    </div>
  );
}

function SprintForm({ initial, onSave, onCancel }: {
  initial?:  Partial<Sprint>;
  onSave:    (d: Omit<Sprint, 'id'>) => void;
  onCancel:  () => void;
}) {
  const [nombre,      setNombre]      = useState(initial?.nombre      ?? '');
  const [fechaInicio, setFechaInicio] = useState(initial?.fechaInicio ?? '');
  const [fechaFin,    setFechaFin]    = useState(initial?.fechaFin    ?? '');

  const canSave = nombre.trim() && fechaInicio && fechaFin && fechaFin >= fechaInicio;

  return (
    <div className="cpop-form">
      <input
        autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && canSave) onSave({ nombre: nombre.trim(), fechaInicio, fechaFin });
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Nombre del sprint..."
        className="cpop-input"
      />

      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          <label style={{ fontSize: 9, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Inicio
          </label>
          <input
            type="date"
            value={fechaInicio}
            onChange={(e) => setFechaInicio(e.target.value)}
            className="cpop-input cpop-input--date"
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
          <label style={{ fontSize: 9, color: 'var(--txt-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Fin
          </label>
          <input
            type="date"
            value={fechaFin}
            min={fechaInicio}
            onChange={(e) => setFechaFin(e.target.value)}
            className="cpop-input cpop-input--date"
          />
        </div>
      </div>

      {fechaFin && fechaInicio && fechaFin < fechaInicio && (
        <p style={{ fontSize: 10, color: '#ff4757', margin: 0 }}>
          La fecha de fin debe ser posterior al inicio.
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button onClick={onCancel} className="cpop-btn-cancel">Cancelar</button>
        <button
          onClick={() => canSave && onSave({ nombre: nombre.trim(), fechaInicio, fechaFin })}
          className={`cpop-btn-save${canSave ? '' : ' cpop-btn-save--disabled'}`}
        >GUARDAR</button>
      </div>
    </div>
  );
}

/* ============================================================
   Helpers compartidos
   ============================================================ */
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

function SmBtn({ color, onClick, title, children }: {
  color: string; onClick: () => void; title: string; children: React.ReactNode;
}) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick} title={title}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        width: 20, height: 20, borderRadius: 4, border: 'none', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hov ? `${color}28` : `${color}12`,
        color, transition: 'background 0.12s',
      }}
    >
      {children}
    </button>
  );
}