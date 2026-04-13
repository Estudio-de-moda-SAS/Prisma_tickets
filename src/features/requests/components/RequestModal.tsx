import { useState, useEffect, useRef } from 'react';
import { X, ChevronUp, ChevronDown, Clock } from 'lucide-react';
import { useMoveRequest } from '../hooks/useMoveRequests';
import { useUpdateRequest } from '../hooks/UseUpdateRequest';
import { KANBAN_COLUMNAS, EQUIPOS, PRIORIDADES } from '../types';
import type { Request, KanbanColumna, Prioridad, Equipo } from '../types';
import { useConfigStore } from '@/store/configStore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/* ── Puntaje ─────────────────────────────────────────────────── */
const PUNTAJE: Record<Prioridad, number> = { baja: 1, media: 3, alta: 5, critica: 8 };

const COL_COLOR: Record<KanbanColumna, string> = {
  sin_categorizar: 'var(--txt-muted)',
  icebox:   '#60a5fa', backlog: 'var(--info)',
  todo:     'var(--warn)', en_progreso: 'var(--accent)', hecho: 'var(--success)',
};

const PRI_COLOR: Record<Prioridad, string> = {
  baja: 'var(--txt-muted)', media: 'var(--info)',
  alta: 'var(--warn)', critica: 'var(--danger)',
};

const COLORS = [
  '#ff4757','#ff6b81','#ff7f50','#fdcb6e','#f9ca24','#a3cb38',
  '#00e5a0','#00cec9','#00c8ff','#0984e3','#6c5ce7','#a29bfe',
  '#fd79a8','#e84393','#b2bec3',
];
const EMOJIS = ['🐛','🎨','🖼️','📊','⚙️','🔧','🚀','💡','📋','🔒','🌐','📱','💰','🔔','✅','🧪','🎯','🏷️'];

/* ── Timer ───────────────────────────────────────────────────── */
function useTimer(requestId: string) {
  const key = `timer:${requestId}`;
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem(key) ?? '{}'); } catch { return {}; } })();
  const [seconds, setSeconds]     = useState<number>(saved.seconds ?? 0);
  const [running, setRunning]     = useState(false);
  const [completed, setCompleted] = useState<boolean>(saved.completed ?? false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSeconds((s) => {
        const n = s + 1;
        sessionStorage.setItem(key, JSON.stringify({ seconds: n, completed }));
        return n;
      }), 1000);
    } else { if (ref.current) clearInterval(ref.current); }
    return () => { if (ref.current) clearInterval(ref.current); };
  }, [running, completed, key]);

  const fmt = (s: number) => [
    Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60,
  ].map((v) => String(v).padStart(2, '0')).join(':');

  return {
    seconds, running, completed, fmt,
    toggle:   () => { if (!completed) setRunning((r) => !r); },
    complete: () => { setRunning(false); setCompleted(true); sessionStorage.setItem(key, JSON.stringify({ seconds, completed: true })); },
  };
}

/* ── Props ───────────────────────────────────────────────────── */
type Props = {
  request: Request;
  equipo:  Equipo;
  onClose: () => void;
  onMove:  (id: string, columna: KanbanColumna) => void;
};

/* ============================================================
   Modal principal
   ============================================================ */
export function RequestModal({ request, equipo, onClose, onMove }: Props) {
  const { mutate: mover }   = useMoveRequest(equipo);
  const { mutate: update }  = useUpdateRequest(equipo);
  const timer               = useTimer(request.id);
  const overlayRef          = useRef<HTMLDivElement>(null);
  const { getCategorias, getEquipos, addCategoria, addEquipo } = useConfigStore();

  const [editCat,  setEditCat]  = useState(false);
  const [editTeam, setEditTeam] = useState(false);

  const categorias = getCategorias(equipo);
  const equipos    = getEquipos(equipo);
  const catDef     = categorias.find((c) => c.nombre === request.categoria);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (editCat) { setEditCat(false); return; } if (editTeam) { setEditTeam(false); return; } onClose(); }};
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose, editCat, editTeam]);

  function handleMover(columna: KanbanColumna) {
    if (request.columna === columna) return;
    mover({ id: request.id, columna }, { onSuccess: () => onMove(request.id, columna) });
  }

  function handleCategoria(nombre: string | null) {
    update({ id: request.id, patch: { categoria: nombre } });
    setEditCat(false);
  }

  function handleEquipo(eq: Equipo | null) {
    update({ id: request.id, patch: { equipo: eq } });
    setEditTeam(false);
  }

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }}
    >
      <div style={{
        width: '100%', maxWidth: 900, maxHeight: '90vh',
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 12, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />

        {/* ── Header ── */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {[ChevronUp, ChevronDown].map((Icon, i) => (
              <button key={i} style={{ width: 26, height: 26, borderRadius: 5, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', cursor: 'not-allowed', opacity: 0.4 }}>
                <Icon size={13} />
              </button>
            ))}
          </div>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-muted)', letterSpacing: 1 }}>
            #{request.id.slice(-6).toUpperCase()}
          </span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 4, color: COL_COLOR[request.columna], background: `${COL_COLOR[request.columna]}15`, border: `1px solid ${COL_COLOR[request.columna]}35` }}>
            {KANBAN_COLUMNAS[request.columna]}
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* ── Cuerpo ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24, borderRight: '1px solid var(--border-subtle)' }}>

            {/* Título */}
            <div>
              <FieldLabel>Nombre de la solicitud</FieldLabel>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--txt)', lineHeight: 1.35, margin: 0 }}>{request.titulo}</h2>
            </div>

            {/* Descripción */}
            <FieldBlock label="Descripción">
              <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '12px 14px', fontSize: 13, lineHeight: 1.65, minHeight: 80, color: request.descripcion ? 'var(--txt)' : 'var(--txt-muted)' }}>
                {request.descripcion || 'Sin descripción.'}
              </div>
            </FieldBlock>

            {/* Grid metadata */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FieldBlock label="Solicitante">
                <PersonChip name={request.solicitante} color="var(--accent-2)" />
              </FieldBlock>

              <FieldBlock label="Resolutor">
                {request.resolutor
                  ? <PersonChip name={request.resolutor} color="#7c3aed" />
                  : <span style={{ fontSize: 13, color: 'var(--txt-muted)' }}>Sin asignar</span>
                }
              </FieldBlock>

              <FieldBlock label="Prioridad">
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '5px 12px', borderRadius: 5, color: PRI_COLOR[request.prioridad], background: `${PRI_COLOR[request.prioridad]}15`, border: `1px solid ${PRI_COLOR[request.prioridad]}35` }}>
                  {PRIORIDADES[request.prioridad]}
                </span>
              </FieldBlock>

              {/* ── Equipo ── */}
              <FieldBlock label="Equipo">
                {editTeam ? (
                  <TeamSelector
                    boardId={equipo}
                    equipos={equipos}
                    value={request.equipo}
                    onSelect={handleEquipo}
                    onCancel={() => setEditTeam(false)}
                    onAddEquipo={(d) => addEquipo(equipo, d)}
                  />
                ) : (
                  <EditableChip
                    onClick={() => setEditTeam(true)}
                    color="#00c8ff"
                    empty="+ Asignar equipo"
                  >
                    {request.equipo ? EQUIPOS[request.equipo] : null}
                  </EditableChip>
                )}
              </FieldBlock>

              {/* ── Categoría ── */}
              <FieldBlock label="Categoría">
                {editCat ? (
                  <CatSelector
                    boardId={equipo}
                    categorias={categorias}
                    value={request.categoria}
                    onSelect={handleCategoria}
                    onCancel={() => setEditCat(false)}
                    onAddCat={(d) => addCategoria(equipo, d)}
                  />
                ) : (
                  <EditableChip
                    onClick={() => setEditCat(true)}
                    color={catDef?.color ?? '#00c8ff'}
                    empty="+ Asignar categoría"
                  >
                    {request.categoria ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                        {catDef?.icono && <span>{catDef.icono}</span>}
                        {request.categoria}
                      </span>
                    ) : null}
                  </EditableChip>
                )}
              </FieldBlock>

              <FieldBlock label="Puntaje">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: PRI_COLOR[request.prioridad] }}>{PUNTAJE[request.prioridad]}</span>
                  <span style={{ fontSize: 10, color: 'var(--txt-muted)', letterSpacing: 1 }}>pts · basado en prioridad</span>
                </div>
              </FieldBlock>
            </div>

            {/* Fechas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FieldBlock label="Fecha de apertura">
                <span style={{ fontSize: 13, color: 'var(--txt)' }}>{format(new Date(request.fechaApertura), "d 'de' MMMM yyyy", { locale: es })}</span>
              </FieldBlock>
              {request.fechaMaxima && (
                <FieldBlock label="Fecha límite">
                  <span style={{ fontSize: 13, color: 'var(--warn)' }}>{format(new Date(request.fechaMaxima), "d 'de' MMMM yyyy", { locale: es })}</span>
                </FieldBlock>
              )}
            </div>

            {/* Timer */}
            <FieldBlock label="Contador de tiempo">
              <div style={{ background: 'var(--bg-surface)', border: `1px solid ${timer.running ? 'rgba(0,200,255,0.3)' : timer.completed ? 'rgba(0,229,160,0.3)' : 'var(--border-subtle)'}`, borderRadius: 8, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.2s' }}>
                <Clock size={16} style={{ color: timer.completed ? 'var(--success)' : timer.running ? 'var(--accent)' : 'var(--txt-muted)', flexShrink: 0 }} />
                <span style={{ fontFamily: 'monospace', fontSize: 22, fontWeight: 600, letterSpacing: 2, minWidth: 90, color: timer.completed ? 'var(--success)' : timer.running ? 'var(--accent)' : 'var(--txt)' }}>
                  {timer.fmt(timer.seconds)}
                </span>
                {timer.completed && <span style={{ fontSize: 10, color: 'var(--success)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>Completado</span>}
                <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
                  {!timer.completed && (
                    <button onClick={timer.toggle} style={{ padding: '6px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: timer.running ? 'rgba(255,71,87,0.15)' : 'rgba(0,200,255,0.15)', color: timer.running ? 'var(--danger)' : 'var(--accent)', fontFamily: 'var(--font-display)', letterSpacing: 0.5 }}>
                      {timer.running ? 'Pausar' : timer.seconds > 0 ? 'Reanudar' : 'Iniciar'}
                    </button>
                  )}
                  {!timer.running && timer.seconds > 0 && !timer.completed && (
                    <button onClick={timer.complete} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: 'rgba(0,229,160,0.15)', color: 'var(--success)', fontFamily: 'var(--font-display)', letterSpacing: 0.5 }}>
                      Completar
                    </button>
                  )}
                </div>
              </div>
              {timer.completed && (
                <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: '8px 0 0', letterSpacing: 0.3 }}>
                  Tiempo registrado: <span style={{ color: 'var(--success)', fontWeight: 600 }}>{timer.fmt(timer.seconds)}</span> · guardado en esta sesión
                </p>
              )}
            </FieldBlock>

            {/* Mover columna */}
            <FieldBlock label="Mover a">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                {(Object.entries(KANBAN_COLUMNAS) as [KanbanColumna, string][]).map(([col, label]) => {
                  const active = request.columna === col;
                  return (
                    <button key={col} onClick={() => handleMover(col)} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', border: `1px solid ${active ? COL_COLOR[col] + '60' : 'var(--border-subtle)'}`, background: active ? `${COL_COLOR[col]}15` : 'transparent', color: active ? COL_COLOR[col] : 'var(--txt-muted)', cursor: active ? 'default' : 'pointer', transition: 'all 0.12s' }}
                      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = COL_COLOR[col] + '50'; e.currentTarget.style.color = COL_COLOR[col]; }}}
                      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--txt-muted)'; }}}
                    >{label}</button>
                  );
                })}
              </div>
            </FieldBlock>
          </div>

          {/* Comentarios */}
          <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)' }}>Comentarios</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2C5.58 2 2 5.13 2 9c0 1.9.8 3.63 2.1 4.9L3 18l4.5-1.4A8.27 8.27 0 0010 17c4.42 0 8-3.13 8-7s-3.58-7-8-7z" stroke="var(--txt-dim)" strokeWidth="1.5" fill="none" strokeLinejoin="round"/></svg>
              </div>
              <p style={{ fontSize: 12, color: 'var(--txt-muted)', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>Los comentarios estarán disponibles cuando SharePoint esté configurado.</p>
            </div>
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, opacity: 0.4, cursor: 'not-allowed' }}>
                <textarea disabled placeholder="Deja un comentario..." rows={2} style={{ flex: 1, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 7, padding: '8px 10px', color: 'var(--txt)', fontSize: 12, resize: 'none', outline: 'none', fontFamily: 'var(--font-body)', cursor: 'not-allowed' }} />
                <button disabled style={{ padding: '8px 14px', borderRadius: 6, background: 'var(--accent-2)', border: 'none', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'not-allowed' }}>Enviar</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Selector de Categoría inline
   ============================================================ */
function CatSelector({ categorias, value, onSelect, onCancel, onAddCat }: {
  boardId: string;
  categorias: { id: string; nombre: string; color: string; icono?: string }[];
  value: string | null;
  onSelect: (v: string | null) => void;
  onCancel: () => void;
  onAddCat: (d: { nombre: string; color: string; icono: string }) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [nombre,  setNombre]  = useState('');
  const [color,   setColor]   = useState('#00c8ff');
  const [icono,   setIcono]   = useState('');

  function crear() {
    if (!nombre.trim()) return;
    onAddCat({ nombre: nombre.trim(), color, icono });
    onSelect(nombre.trim());
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {categorias.map((cat) => {
          const sel = value === cat.nombre;
          return (
            <button key={cat.id} type="button" onClick={() => onSelect(sel ? null : cat.nombre)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${sel ? cat.color : 'rgba(255,255,255,0.1)'}`, background: sel ? `${cat.color}20` : 'rgba(255,255,255,0.03)', color: sel ? cat.color : '#7a8ba8', transition: 'all 0.12s' }}>
              {cat.icono && <span style={{ fontSize: 12 }}>{cat.icono}</span>}
              {cat.nombre}
              {sel && <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1.5 4l2 2 3-3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </button>
          );
        })}
        {!showNew && (
          <button type="button" onClick={() => setShowNew(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px dashed rgba(0,200,255,0.25)', background: 'transparent', color: 'rgba(0,200,255,0.5)', transition: 'all 0.12s' }}>
            + Nueva
          </button>
        )}
      </div>

      {/* Form nueva categoría */}
      {showNew && (
        <InlineCreateForm
          tipo="categoria"
          nombre={nombre} setNombre={setNombre}
          color={color}   setColor={setColor}
          extra={icono}   setExtra={setIcono}
          onSave={crear}
          onCancel={() => setShowNew(false)}
        />
      )}

      <button onClick={onCancel} style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--txt-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Cerrar</button>
    </div>
  );
}

/* ============================================================
   Selector de Equipo inline
   ============================================================ */
function TeamSelector({ equipos, value, onSelect, onCancel, onAddEquipo }: {
  boardId: string;
  equipos: { id: string; nombre: string; color: string; siglas: string }[];
  value: string | null;
  onSelect: (v: any) => void;
  onCancel: () => void;
  onAddEquipo: (d: { nombre: string; color: string; siglas: string }) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [nombre,  setNombre]  = useState('');
  const [color,   setColor]   = useState('#00c8ff');
  const [siglas,  setSiglas]  = useState('');

  function crear() {
    if (!nombre.trim() || !siglas.trim()) return;
    onAddEquipo({ nombre: nombre.trim(), color, siglas: siglas.trim() });
    onSelect(nombre.trim());
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {equipos.map((eq) => {
          const sel = value === eq.id || value === eq.nombre;
          return (
            <button key={eq.id} type="button" onClick={() => onSelect(sel ? null : eq.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: `1px solid ${sel ? eq.color : 'rgba(255,255,255,0.1)'}`, background: sel ? `${eq.color}20` : 'rgba(255,255,255,0.03)', color: sel ? eq.color : '#7a8ba8', transition: 'all 0.12s' }}>
              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: `${eq.color}25`, color: eq.color }}>{eq.siglas}</span>
              {eq.nombre}
              {sel && <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1.5 4l2 2 3-3" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </button>
          );
        })}
        {!showNew && (
          <button type="button" onClick={() => setShowNew(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: '1px dashed rgba(0,200,255,0.25)', background: 'transparent', color: 'rgba(0,200,255,0.5)', transition: 'all 0.12s' }}>
            + Nuevo
          </button>
        )}
      </div>

      {showNew && (
        <InlineCreateForm
          tipo="equipo"
          nombre={nombre} setNombre={setNombre}
          color={color}   setColor={setColor}
          extra={siglas}  setExtra={setSiglas}
          onSave={crear}
          onCancel={() => setShowNew(false)}
        />
      )}

      <button onClick={onCancel} style={{ alignSelf: 'flex-start', fontSize: 11, color: 'var(--txt-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>← Cerrar</button>
    </div>
  );
}

/* ── Formulario de creación inline reutilizable ── */
function InlineCreateForm({ tipo, nombre, setNombre, color, setColor, extra, setExtra, onSave, onCancel }: {
  tipo: 'categoria' | 'equipo';
  nombre: string; setNombre: (v: string) => void;
  color: string;  setColor:  (v: string) => void;
  extra: string;  setExtra:  (v: string) => void;
  onSave: () => void; onCancel: () => void;
}) {
  const canSave = nombre.trim() && (tipo === 'categoria' || extra.trim());
  return (
    <div style={{ padding: '10px 12px', background: 'rgba(0,200,255,0.04)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#00c8ff' }}>
        {tipo === 'categoria' ? 'Nueva categoría' : 'Nuevo equipo'}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input autoFocus value={nombre} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && canSave) onSave(); if (e.key === 'Escape') onCancel(); }} placeholder={tipo === 'categoria' ? 'Nombre...' : 'Nombre del equipo...'} style={{ ...inp, flex: 1 }} />
        {tipo === 'equipo' && <input value={extra} onChange={(e) => setExtra(e.target.value.toUpperCase().slice(0,3))} placeholder="AB" style={{ ...inp, width: 46, textAlign: 'center', fontWeight: 700, flex: 'none' }} />}
      </div>
      {tipo === 'categoria' && (
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' as const }}>
          {EMOJIS.map((e) => <button key={e} type="button" onClick={() => setExtra(extra === e ? '' : e)} style={{ width: 22, height: 22, borderRadius: 4, fontSize: 12, cursor: 'pointer', border: extra === e ? '1px solid rgba(0,200,255,0.5)' : '1px solid transparent', background: extra === e ? 'rgba(0,200,255,0.1)' : 'rgba(255,255,255,0.04)' }}>{e}</button>)}
        </div>
      )}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
        {COLORS.map((c) => <div key={c} onClick={() => setColor(c)} style={{ width: 14, height: 14, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid #fff' : '2px solid transparent', transform: color === c ? 'scale(1.25)' : 'scale(1)', transition: 'transform 0.1s', flexShrink: 0 }} />)}
      </div>
      {nombre.trim() && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: '#5a6a8a', letterSpacing: 1, textTransform: 'uppercase' }}>Preview:</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: 600, background: `${color}20`, border: `1px solid ${color}50`, color }}>
            {tipo === 'categoria' && extra && <span>{extra}</span>}
            {tipo === 'equipo' && extra && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 4px', borderRadius: 3, background: `${color}25` }}>{extra}</span>}
            {nombre.trim()}
          </span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
        <button onClick={onCancel} style={{ padding: '4px 11px', borderRadius: 4, fontSize: 11, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#5a6a8a', cursor: 'pointer' }}>Cancelar</button>
        <button onClick={onSave} style={{ padding: '4px 14px', borderRadius: 4, fontSize: 11, fontWeight: 700, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed', background: canSave ? 'linear-gradient(135deg,#0055cc,#00c8ff)' : 'rgba(255,255,255,0.06)', color: canSave ? 'white' : '#5a6a8a', fontFamily: "'Rajdhani', sans-serif", letterSpacing: 0.5 }}>
          CREAR Y SELECCIONAR
        </button>
      </div>
    </div>
  );
}

/* ── Chip clicable genérico ── */
function EditableChip({ onClick, color, empty, children }: { onClick: () => void; color: string; empty: string; children: React.ReactNode }) {
  return (
    <div onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
      {children ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 5, color, background: `${color}18`, border: `1px solid ${color}35`, transition: 'opacity 0.12s' }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.75')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          {children}
          <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" style={{ opacity: 0.45, marginLeft: 2 }}><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg>
        </span>
      ) : (
        <span style={{ fontSize: 12, padding: '4px 10px', borderRadius: 5, border: '1px dashed rgba(0,200,255,0.22)', color: 'rgba(0,200,255,0.5)', transition: 'all 0.12s' }}
          onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.5)'; e.currentTarget.style.color = '#00c8ff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.22)'; e.currentTarget.style.color = 'rgba(0,200,255,0.5)'; }}
        >{empty}</span>
      )}
    </div>
  );
}

/* ── Helpers ── */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 8 }}>{children}</span>;
}
function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}
function PersonChip({ name, color }: { name: string; color: string }) {
  const ini = name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg, ${color}, ${color}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>{ini}</div>
      <span style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{name}</span>
    </div>
  );
}

const inp: React.CSSProperties = { padding: '6px 9px', borderRadius: 5, fontSize: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#e8ecf4', outline: 'none', width: '100%', boxSizing: 'border-box' };