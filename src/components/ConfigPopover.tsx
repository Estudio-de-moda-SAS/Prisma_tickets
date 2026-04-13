import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useConfigStore } from '@/store/configStore';
import { useBoardStore } from '@/store/boardStore';

const COLORS = [
  '#ff4757','#ff6b81','#ff7f50','#fdcb6e','#f9ca24','#a3cb38',
  '#00e5a0','#00cec9','#00c8ff','#0984e3','#6c5ce7','#a29bfe',
  '#fd79a8','#e84393','#b2bec3',
];
const EMOJIS = ['🐛','🎨','🖼️','📊','⚙️','🔧','🚀','💡','📋','🔒','🌐','📱','💰','🔔','✅','🧪','🎯','🏷️'];

// Fix: usar HTMLButtonElement | null explícitamente en el tipo del ref
function usePopoverPos(
  btnRef: React.RefObject<HTMLButtonElement | null>,
  open: boolean,
) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const calc = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const W = 330, H = 480;
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
  const [tab,  setTab]  = useState<'categorias' | 'equipos'>('categorias');
  // Fix: tipo explícito HTMLButtonElement | null
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
        title="Configurar categorías y equipos"
        style={{
          width: 32, height: 32, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 6, cursor: 'pointer',
          border:     open ? '1px solid rgba(0,200,255,0.45)' : '1px solid rgba(255,255,255,0.08)',
          background: open ? 'rgba(0,200,255,0.12)' : 'transparent',
          color:      open ? '#00c8ff' : '#5a6a8a',
          transition: 'all 0.15s',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="8" cy="8" r="2.5"/>
          <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.05 3.05l1.06 1.06M11.89 11.89l1.06 1.06M3.05 12.95l1.06-1.06M11.89 4.11l1.06-1.06" strokeLinecap="round"/>
        </svg>
      </button>

      {open && createPortal(
        <div ref={panelRef} style={{
          position: 'fixed', top: pos.top, left: pos.left,
          width: 330, background: '#0d1117',
          border: '1px solid rgba(0,200,255,0.18)', borderRadius: 10,
          boxShadow: '0 16px 48px rgba(0,0,0,0.75), inset 0 1px 0 rgba(255,255,255,0.04)',
          zIndex: 99999, overflow: 'hidden', fontFamily: "'Exo 2', sans-serif",
        }}>
          {/* Acento */}
          <div style={{ height: 2, background: 'linear-gradient(90deg, transparent, #00c8ff, transparent)' }} />

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px 0' }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#00c8ff', fontFamily: "'Rajdhani', sans-serif" }}>
              Config · {equipoActivo}
            </span>
            <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', color: '#5a6a8a', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '1px 3px' }}>×</button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', padding: '8px 14px 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            {(['categorias', 'equipos'] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '5px 14px 7px', border: 'none', background: 'none',
                borderBottom: tab === t ? '2px solid #00c8ff' : '2px solid transparent',
                color: tab === t ? '#00c8ff' : '#5a6a8a',
                fontSize: 11, fontWeight: 600, letterSpacing: 0.8,
                cursor: 'pointer', transition: 'color 0.15s',
              }}>
                {t === 'categorias' ? 'Categorías' : 'Equipos'}
              </button>
            ))}
          </div>

          {/* Contenido */}
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: '8px 10px 12px' }}>
            {tab === 'categorias' ? (
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
            ) : (
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
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

/* ============================================================
   Lista genérica
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
        <div style={{ padding: '14px 8px', textAlign: 'center', color: '#5a6a8a', fontSize: 11 }}>
          No hay {tipo === 'categoria' ? 'categorías' : 'equipos'} aún.
        </div>
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
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{
      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 7,
      background: hov ? 'rgba(255,255,255,0.04)' : 'transparent',
      border: `1px solid ${hov ? 'rgba(255,255,255,0.07)' : 'transparent'}`,
      transition: 'all 0.12s',
    }}>
      <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
      {tipo === 'categoria' && item.extra && <span style={{ fontSize: 13, lineHeight: 1 }}>{item.extra}</span>}
      <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: '#d4dae8' }}>{item.nombre}</span>
      {tipo === 'equipo' && item.extra && (
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, padding: '1px 6px', borderRadius: 4, background: `${item.color}18`, color: item.color, fontFamily: "'Rajdhani', sans-serif" }}>
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
    <div style={{ padding: '10px', marginTop: 2, background: 'rgba(0,200,255,0.04)', border: '1px solid rgba(0,200,255,0.16)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && canSave) onSave({ nombre: nombre.trim(), color, extra }); if (e.key === 'Escape') onCancel(); }}
          placeholder={tipo === 'categoria' ? 'Nombre de la categoría...' : 'Nombre del equipo...'}
          style={inpStyle}
        />
        {tipo === 'equipo' && (
          <input value={extra} onChange={(e) => setExtra(e.target.value.toUpperCase().slice(0, 3))}
            placeholder="AB" style={{ ...inpStyle, width: 48, textAlign: 'center', fontWeight: 700, letterSpacing: 1, flex: 'none' }}
          />
        )}
      </div>

      {tipo === 'categoria' && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' as const }}>
          {EMOJIS.map((e) => (
            <button key={e} type="button" onClick={() => setExtra(extra === e ? '' : e)} style={{ width: 22, height: 22, borderRadius: 4, fontSize: 12, cursor: 'pointer', border: extra === e ? '1px solid rgba(0,200,255,0.5)' : '1px solid transparent', background: extra === e ? 'rgba(0,200,255,0.1)' : 'rgba(255,255,255,0.04)' }}>{e}</button>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
        {COLORS.map((c) => (
          <div key={c} onClick={() => setColor(c)} style={{ width: 15, height: 15, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid #fff' : '2px solid transparent', transform: color === c ? 'scale(1.25)' : 'scale(1)', transition: 'transform 0.1s', flexShrink: 0 }} />
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button onClick={onCancel} style={{ padding: '4px 11px', borderRadius: 4, fontSize: 11, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#5a6a8a', cursor: 'pointer' }}>Cancelar</button>
        <button onClick={() => canSave && onSave({ nombre: nombre.trim(), color, extra })} style={{ padding: '4px 14px', borderRadius: 4, fontSize: 11, fontWeight: 700, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed', background: canSave ? 'linear-gradient(135deg,#0055cc,#00c8ff)' : 'rgba(255,255,255,0.06)', color: canSave ? 'white' : '#5a6a8a', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 0.5 }}>GUARDAR</button>
      </div>
    </div>
  );
}

function AddBtn({ label, onClick }: { label: string; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ marginTop: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '7px', width: '100%', border: `1px dashed ${hov ? 'rgba(0,200,255,0.5)' : 'rgba(0,200,255,0.22)'}`, borderRadius: 7, background: 'transparent', color: hov ? '#00c8ff' : 'rgba(0,200,255,0.55)', fontSize: 11, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
      <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4.5 1v7M1 4.5h7" strokeLinecap="round"/></svg>
      {label}
    </button>
  );
}

function SmBtn({ color, onClick, title, children }: { color: string; onClick: () => void; title: string; children: React.ReactNode }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ width: 20, height: 20, borderRadius: 4, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hov ? `${color}28` : `${color}12`, color, transition: 'background 0.12s' }}>
      {children}
    </button>
  );
}

const inpStyle: React.CSSProperties = {
  padding: '6px 9px', borderRadius: 5, fontSize: 12,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#e8ecf4', outline: 'none',
  width: '100%', boxSizing: 'border-box',
};