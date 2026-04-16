import { useState, useEffect, useRef } from 'react';
import { X, ChevronUp, ChevronDown, Clock, ChevronDown as ChevDown } from 'lucide-react';
import { useMoveRequest } from '../hooks/useMoveRequests';
import { useUpdateRequest } from '../hooks/UseUpdateRequest';
import { KANBAN_COLUMNAS, PRIORIDADES } from '../types';
import type { Request, KanbanColumna, Prioridad, Equipo } from '../types';
import { useConfigStore } from '@/store/configStore';
import type { Sprint } from '@/store/configStore';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const PUNTAJE: Record<Prioridad, number> = { baja: 1, media: 3, alta: 5, critica: 8 };

const COL_COLOR: Record<KanbanColumna, string> = {
  sin_categorizar: 'var(--txt-muted)',
  icebox: '#60a5fa',
  backlog: 'var(--info)',
  todo: 'var(--warn)',
  en_progreso: 'var(--accent)',
  hecho: 'var(--success)',
};

const PRI_COLOR: Record<Prioridad, string> = {
  baja: 'var(--txt-muted)',
  media: 'var(--info)',
  alta: 'var(--warn)',
  critica: 'var(--danger)',
};

const COLORS = [
  '#ff4757', '#ff6b81', '#ff7f50', '#fdcb6e', '#f9ca24', '#a3cb38',
  '#00e5a0', '#00cec9', '#00c8ff', '#0984e3', '#6c5ce7', '#a29bfe',
  '#fd79a8', '#e84393', '#b2bec3',
];

const EMOJIS = ['🐛', '🎨', '🖼️', '📊', '⚙️', '🔧', '🚀', '💡', '📋', '🔒', '🌐', '📱', '💰', '🔔', '✅', '🧪', '🎯', '🏷️'];

/* ── Timer ── */
function useTimer(requestId: string) {
  const key = `timer:${requestId}`;
  const saved = (() => {
    try {
      return JSON.parse(sessionStorage.getItem(key) ?? '{}');
    } catch {
      return {};
    }
  })();

  const [seconds, setSeconds] = useState<number>(saved.seconds ?? 0);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState<boolean>(saved.completed ?? false);
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      ref.current = setInterval(() => setSeconds((s) => {
        const n = s + 1;
        sessionStorage.setItem(key, JSON.stringify({ seconds: n, completed }));
        return n;
      }), 1000);
    } else {
      if (ref.current) clearInterval(ref.current);
    }

    return () => {
      if (ref.current) clearInterval(ref.current);
    };
  }, [running, completed, key]);

  const fmt = (s: number) =>
    [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map((v) => String(v).padStart(2, '0'))
      .join(':');

  return {
    seconds,
    running,
    completed,
    fmt,
    toggle: () => { if (!completed) setRunning((r) => !r); },
    complete: () => {
      setRunning(false);
      setCompleted(true);
      sessionStorage.setItem(key, JSON.stringify({ seconds, completed: true }));
    },
  };
}

/* ── Dropdown con cierre exterior ── */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }

    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return { open, setOpen, ref };
}

type Props = {
  request: Request;
  equipo: Equipo;
  onClose: () => void;
  onMove: (id: string, columna: KanbanColumna) => void;
};

/* ============================================================
   Modal principal
   ============================================================ */
export function RequestModal({ request, equipo, onClose, onMove }: Props) {
  const { mutate: mover } = useMoveRequest(equipo);
  const { mutate: update } = useUpdateRequest(equipo);
  const timer = useTimer(request.id);
  const overlayRef = useRef<HTMLDivElement>(null);
  const { getCategorias, getEquipos, getSprints, addCategoria, addEquipo } = useConfigStore();

  const catDD = useDropdown();
  const teamDD = useDropdown();
  const sprintDD = useDropdown();

  const categorias = getCategorias(equipo);
  const equipos = getEquipos(equipo);
  const sprints = getSprints(equipo);

  const categoriaActual: string[] = Array.isArray(request.categoria)
    ? request.categoria
    : request.categoria ? [request.categoria as unknown as string] : [];

  const equipoActual: string[] = Array.isArray(request.equipo)
    ? (request.equipo as unknown as string[])
    : request.equipo ? [request.equipo as unknown as string] : [];

  const catDefs = categorias.filter((c) => categoriaActual.includes(c.nombre));
  const sprintDef = sprints.find((s) => s.id === (request as any).sprintId);

  const [tiempoEstimado, setTiempoEstimado] = useState((request as any).tiempoEstimado || '0:00');
  const [tiempoConsumido, setTiempoConsumido] = useState((request as any).tiempoConsumido || '0:00');
  const [descripcion, setDescripcion] = useState(request.descripcion || '');

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  useEffect(() => {
    setDescripcion(request.descripcion || '');
  }, [request.id, request.descripcion]);

  useEffect(() => {
    setTiempoEstimado((request as any).tiempoEstimado || '0:00');
    setTiempoConsumido((request as any).tiempoConsumido || '0:00');
  }, [request.id, (request as any).tiempoEstimado, (request as any).tiempoConsumido]);

  function handleMover(columna: KanbanColumna) {
    if (request.columna === columna) return;
    mover({ id: request.id, columna }, { onSuccess: () => onMove(request.id, columna) });
  }

  function handleCategoria(nombre: string) {
    const next = categoriaActual.includes(nombre)
      ? categoriaActual.filter((c) => c !== nombre)
      : [...categoriaActual, nombre];
    update({ id: request.id, patch: { categoria: next } });
  }

  function handleEquipo(id: string) {
    const next = equipoActual.includes(id)
      ? equipoActual.filter((e) => e !== id)
      : [...equipoActual, id];
    update({ id: request.id, patch: { equipo: next as any } });
  }

  function handleSprint(sprintId: string | null) {
    update({ id: request.id, patch: { sprintId } as any });
    sprintDD.setOpen(false);
  }

  function sanitizeDurationInput(value: string) {
    const clean = value.replace(/[^\d:]/g, '');
    const parts = clean.split(':');
    const hours = (parts[0] ?? '').slice(0, 3);
    const minutes = parts.length > 1 ? parts.slice(1).join('').slice(0, 2) : '';
    return parts.length > 1 ? `${hours}:${minutes}` : hours;
  }

  function normalizeDurationInput(value: string) {
    const clean = sanitizeDurationInput(value);
    if (!clean) return '';
    if (!clean.includes(':')) return clean;

    const [rawHours, rawMinutes = ''] = clean.split(':');
    const hours = rawHours === '' ? '0' : String(Number(rawHours));
    const minutes = String(Math.min(59, Number(rawMinutes || '0'))).padStart(2, '0');

    return `${hours}:${minutes}`;
  }

  function handleDurationKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const allowedKeys = ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'Tab', 'Home', 'End'];

    if (allowedKeys.includes(e.key)) return;
    if (/^\d$/.test(e.key)) return;
    if (e.key === ':' && !e.currentTarget.value.includes(':')) return;

    e.preventDefault();
  }

  function handleGuardarTiempoEstimado() {
    const value = normalizeDurationInput(tiempoEstimado) || '0:00';
    setTiempoEstimado(value);
    update({
      id: request.id,
      patch: { tiempoEstimado: value } as any,
    });
  }

  function handleGuardarTiempoConsumido() {
    const value = normalizeDurationInput(tiempoConsumido) || '0:00';
    setTiempoConsumido(value);
    update({
      id: request.id,
      patch: { tiempoConsumido: value } as any,
    });
  }

  function handleDurationFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.currentTarget.select();
  }

  /* ── estilos de trigger compartidos ── */
  const triggerBase = (open: boolean, accentRgb: string): React.CSSProperties => ({
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    minHeight: 32,
    width: '100%',
    padding: '4px 8px',
    borderRadius: 6,
    border: `1px solid ${open ? `rgba(${accentRgb},0.45)` : 'var(--border-subtle)'}`,
    background: open ? `rgba(${accentRgb},0.07)` : 'transparent',
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
    textAlign: 'left',
  });

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 900,
          maxHeight: '90vh',
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {[ChevronUp, ChevronDown].map((Icon, i) => (
              <button
                key={i}
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 5,
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--txt-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  cursor: 'not-allowed',
                  opacity: 0.4,
                }}
              >
                <Icon size={13} />
              </button>
            ))}
          </div>

          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-muted)', letterSpacing: 1 }}>
            #{request.id.slice(-6).toUpperCase()}
          </span>

          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 1.5,
              textTransform: 'uppercase',
              padding: '3px 10px',
              borderRadius: 4,
              color: COL_COLOR[request.columna],
              background: `${COL_COLOR[request.columna]}15`,
              border: `1px solid ${COL_COLOR[request.columna]}35`,
            }}
          >
            {KANBAN_COLUMNAS[request.columna]}
          </span>

          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={onClose}
              style={{
                width: 30,
                height: 30,
                borderRadius: 6,
                border: '1px solid var(--border-subtle)',
                color: 'var(--txt-muted)',
                background: 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Cuerpo */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 24, borderRight: '1px solid var(--border-subtle)' }}>
            <div>
              <FieldLabel>Nombre de la solicitud</FieldLabel>
              <h2 style={{ fontSize: 22, fontWeight: 600, color: 'var(--txt)', lineHeight: 1.35, margin: 0 }}>
                {request.titulo}
              </h2>
            </div>

            <FieldBlock label="Descripción">
              <textarea
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
                onBlur={() => update({ id: request.id, patch: { descripcion } as any })}
                placeholder="Escribe una descripción..."
                rows={4}
                style={{
                  width: '100%',
                  minHeight: 100,
                  maxHeight: 180,
                  padding: '12px 14px',
                  borderRadius: 7,
                  border: '1px solid var(--border-subtle)',
                  background: 'var(--bg-surface)',
                  color: descripcion ? 'var(--txt)' : 'var(--txt-muted)',
                  fontSize: 13,
                  lineHeight: 1.65,
                  resize: 'none',
                  overflowY: 'auto',
                  outline: 'none',
                  fontFamily: 'var(--font-body)',
                  boxSizing: 'border-box',
                }}
              />
            </FieldBlock>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FieldBlock label="Solicitante">
                <PersonChip name={request.solicitante} color="var(--accent-2)" />
              </FieldBlock>

              <FieldBlock label="Resolutor">
                {request.resolutor
                  ? <PersonChip name={request.resolutor} color="#7c3aed" />
                  : <span style={{ fontSize: 13, color: 'var(--txt-muted)' }}>Sin asignar</span>}
              </FieldBlock>

              <FieldBlock label="Prioridad">
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: 0.5,
                    textTransform: 'uppercase',
                    padding: '5px 12px',
                    borderRadius: 5,
                    color: PRI_COLOR[request.prioridad],
                    background: `${PRI_COLOR[request.prioridad]}15`,
                    border: `1px solid ${PRI_COLOR[request.prioridad]}35`,
                  }}
                >
                  {PRIORIDADES[request.prioridad]}
                </span>
              </FieldBlock>

              {/* ── Equipo ── */}
              <FieldBlock label="Equipo">
                <div ref={teamDD.ref} style={{ position: 'relative' }}>
                  <button
                    onClick={() => teamDD.setOpen((o) => !o)}
                    style={triggerBase(teamDD.open, '0,200,255')}
                    onMouseEnter={(e) => { if (!teamDD.open) e.currentTarget.style.borderColor = 'rgba(0,200,255,0.3)'; }}
                    onMouseLeave={(e) => { if (!teamDD.open) e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                  >
                    {equipoActual.length === 0
                      ? <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1 }}>Sin equipo asignado</span>
                      : equipoActual.map((eqId) => {
                          const eq = equipos.find((e) => e.id === eqId || e.nombre === eqId);
                          if (!eq) return null;
                          return (
                            <span key={eqId} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: eq.color, background: `${eq.color}18`, border: `1px solid ${eq.color}35` }}>
                              <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 3px', borderRadius: 2, background: `${eq.color}25` }}>{eq.siglas}</span>
                              {eq.nombre}
                              <span onMouseDown={(e) => { e.stopPropagation(); handleEquipo(eqId); }} style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6, fontSize: 13, lineHeight: 1 }}>×</span>
                            </span>
                          );
                        })}
                    <ChevDown size={12} style={{ marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0, transform: teamDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>

                  {teamDD.open && (
                    <DropdownPanel>
                      {equipos.map((eq) => {
                        const sel = equipoActual.includes(eq.id) || equipoActual.includes(eq.nombre);
                        return (
                          <DropdownItem key={eq.id} selected={sel} onClick={() => handleEquipo(eq.id)}>
                            <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: `${eq.color}25`, color: eq.color, marginRight: 4 }}>{eq.siglas}</span>
                            <span style={{ flex: 1 }}>{eq.nombre}</span>
                            {sel && <Checkmark />}
                          </DropdownItem>
                        );
                      })}
                      <DropdownDivider />
                      <NewEquipoInline onAdd={(d) => { addEquipo(equipo, d); }} />
                    </DropdownPanel>
                  )}
                </div>
              </FieldBlock>

              {/* ── Categoría ── */}
              <FieldBlock label="Categoría">
                <div ref={catDD.ref} style={{ position: 'relative' }}>
                  <button
                    onClick={() => catDD.setOpen((o) => !o)}
                    style={triggerBase(catDD.open, '0,200,255')}
                    onMouseEnter={(e) => { if (!catDD.open) e.currentTarget.style.borderColor = 'rgba(0,200,255,0.3)'; }}
                    onMouseLeave={(e) => { if (!catDD.open) e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                  >
                    {catDefs.length === 0
                      ? <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1 }}>Sin categoría asignada</span>
                      : catDefs.map((cat) => (
                          <span key={cat.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: cat.color, background: `${cat.color}18`, border: `1px solid ${cat.color}35` }}>
                            {cat.icono && <span style={{ fontSize: 11 }}>{cat.icono}</span>}
                            {cat.nombre}
                            <span onMouseDown={(e) => { e.stopPropagation(); handleCategoria(cat.nombre); }} style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6, fontSize: 13, lineHeight: 1 }}>×</span>
                          </span>
                        ))}
                    <ChevDown size={12} style={{ marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0, transform: catDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>

                  {catDD.open && (
                    <DropdownPanel>
                      {categorias.map((cat) => {
                        const sel = categoriaActual.includes(cat.nombre);
                        return (
                          <DropdownItem key={cat.id} selected={sel} onClick={() => handleCategoria(cat.nombre)}>
                            {cat.icono && <span style={{ fontSize: 13, marginRight: 4 }}>{cat.icono}</span>}
                            <span style={{ flex: 1 }}>{cat.nombre}</span>
                            <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color, flexShrink: 0 }} />
                            {sel && <Checkmark />}
                          </DropdownItem>
                        );
                      })}
                      <DropdownDivider />
                      <NewCatInline onAdd={(d) => { addCategoria(equipo, d); }} />
                    </DropdownPanel>
                  )}
                </div>
              </FieldBlock>

              {/* ── Sprint ── */}
              <FieldBlock label="Sprint">
                <div ref={sprintDD.ref} style={{ position: 'relative' }}>
                  <button
                    onClick={() => sprintDD.setOpen((o) => !o)}
                    style={{ ...triggerBase(sprintDD.open, '162,155,254'), flexWrap: 'nowrap' }}
                    onMouseEnter={(e) => { if (!sprintDD.open) e.currentTarget.style.borderColor = 'rgba(162,155,254,0.3)'; }}
                    onMouseLeave={(e) => { if (!sprintDD.open) e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                  >
                    {sprintDef
                      ? <><SprintDot sprint={sprintDef} /><span style={{ fontSize: 12, color: 'var(--txt)', flex: 1, textAlign: 'left' }}>{sprintDef.nombre}</span></>
                      : <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1, textAlign: 'left' }}>Sin sprint asignado</span>}
                    <ChevDown size={12} style={{ color: 'var(--txt-muted)', flexShrink: 0, transform: sprintDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                  </button>

                  {sprintDD.open && (
                    <DropdownPanel>
                      {sprints.length === 0
                        ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>No hay sprints. Créalos en la configuración del board.</div>
                        : [...sprints]
                            .sort((a, b) => new Date(b.fechaInicio).getTime() - new Date(a.fechaInicio).getTime())
                            .map((sp) => {
                              const sel = (request as any).sprintId === sp.id;
                              const now = new Date();
                              const dotColor = now >= new Date(sp.fechaInicio) && now <= new Date(sp.fechaFin) ? '#00e5a0' : now > new Date(sp.fechaFin) ? '#b2bec3' : '#fdcb6e';
                              const fmtD = (iso: string) => {
                                const [y, m, d] = iso.split('-');
                                return `${d}/${m}/${y.slice(2)}`;
                              };

                              return (
                                <DropdownItem key={sp.id} selected={sel} onClick={() => handleSprint(sel ? null : sp.id)}>
                                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
                                  <span style={{ flex: 1 }}>{sp.nombre}</span>
                                  <span style={{ fontSize: 10, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>
                                    {fmtD(sp.fechaInicio)} → {fmtD(sp.fechaFin)}
                                  </span>
                                  {sel && <Checkmark />}
                                </DropdownItem>
                              );
                            })}
                    </DropdownPanel>
                  )}
                </div>
              </FieldBlock>

              <FieldBlock label="Puntaje">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-display)', color: PRI_COLOR[request.prioridad] }}>
                    {PUNTAJE[request.prioridad]}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--txt-muted)', letterSpacing: 1 }}>
                    pts · basado en prioridad
                  </span>
                </div>
              </FieldBlock>

              <FieldBlock label="Tiempo estimado">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth:260 }}>
                  <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box' }}>
                    <Clock size={15} style={{ color: 'var(--txt-muted)', flexShrink: 0 }} />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={tiempoEstimado}
                      onChange={(e) => setTiempoEstimado(sanitizeDurationInput(e.target.value))}
                      onFocus={handleDurationFocus}
                      onBlur={handleGuardarTiempoEstimado}
                      onKeyDown={handleDurationKeyDown}
                      placeholder="0:00"
                      maxLength={6}
                      style={durationInput}
                    />
                    <span style={{ fontSize: 10, color: 'var(--txt-muted)', letterSpacing: 1, fontFamily: 'monospace', flexShrink: 0 }}>
                      h:mm
                    </span>
                  </div>
                </div>
              </FieldBlock>

              <FieldBlock label="Tiempo consumido">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth:260 }}>
                   <div style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, width: '100%', boxSizing: 'border-box' }}>
                    <Clock size={15} style={{ color: 'var(--txt-muted)', flexShrink: 0 }} />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={tiempoConsumido}
                      onChange={(e) => setTiempoConsumido(sanitizeDurationInput(e.target.value))}
                      onFocus={handleDurationFocus}
                      onBlur={handleGuardarTiempoConsumido}
                      onKeyDown={handleDurationKeyDown}
                      placeholder="0:00"
                      maxLength={6}
                      style={durationInput}
                    />
                    <span style={{ fontSize: 10, color: 'var(--txt-muted)', letterSpacing: 1, fontFamily: 'monospace', flexShrink: 0 }}>
                      h:mm
                    </span>
                  </div>
                </div>
              </FieldBlock>
            </div>

            {/* Fechas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <FieldBlock label="Fecha de apertura">
                <span style={{ fontSize: 13, color: 'var(--txt)' }}>
                  {format(new Date(request.fechaApertura), "d 'de' MMMM yyyy", { locale: es })}
                </span>
              </FieldBlock>

              {request.fechaMaxima && (
                <FieldBlock label="Fecha límite">
                  <span style={{ fontSize: 13, color: 'var(--warn)' }}>
                    {format(new Date(request.fechaMaxima), "d 'de' MMMM yyyy", { locale: es })}
                  </span>
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
                    <button
                      key={col}
                      onClick={() => handleMover(col)}
                      style={{
                        padding: '6px 12px',
                        borderRadius: 6,
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: 1,
                        textTransform: 'uppercase',
                        border: `1px solid ${active ? COL_COLOR[col] + '60' : 'var(--border-subtle)'}`,
                        background: active ? `${COL_COLOR[col]}15` : 'transparent',
                        color: active ? COL_COLOR[col] : 'var(--txt-muted)',
                        cursor: active ? 'default' : 'pointer',
                        transition: 'all 0.12s',
                      }}
                      onMouseEnter={(e) => { if (!active) { e.currentTarget.style.borderColor = COL_COLOR[col] + '50'; e.currentTarget.style.color = COL_COLOR[col]; }}}
                      onMouseLeave={(e) => { if (!active) { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.color = 'var(--txt-muted)'; }}}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </FieldBlock>
          </div>

          {/* Comentarios */}
          <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', fontSize: 11, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)' }}>
              Comentarios
            </div>

            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path d="M10 2C5.58 2 2 5.13 2 9c0 1.9.8 3.63 2.1 4.9L3 18l4.5-1.4A8.27 8.27 0 0010 17c4.42 0 8-3.13 8-7s-3.58-7-8-7z" stroke="var(--txt-dim)" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
                </svg>
              </div>
              <p style={{ fontSize: 12, color: 'var(--txt-muted)', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>
                Los comentarios estarán disponibles cuando SharePoint esté configurado.
              </p>
            </div>

            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, opacity: 0.4, cursor: 'not-allowed' }}>
                <textarea
                  disabled
                  placeholder="Deja un comentario..."
                  rows={2}
                  style={{
                    flex: 1,
                    background: 'var(--bg-surface)',
                    border: '1px solid var(--border-subtle)',
                    borderRadius: 7,
                    padding: '8px 10px',
                    color: 'var(--txt)',
                    fontSize: 12,
                    resize: 'none',
                    outline: 'none',
                    fontFamily: 'var(--font-body)',
                    cursor: 'not-allowed',
                  }}
                />
                <button disabled style={{ padding: '8px 14px', borderRadius: 6, background: 'var(--accent-2)', border: 'none', color: 'white', fontSize: 11, fontWeight: 600, cursor: 'not-allowed' }}>
                  Enviar
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Dropdown primitives ── */
function DropdownPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute',
      top: 'calc(100% + 4px)',
      left: 0,
      right: 0,
      zIndex: 200,
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      overflow: 'hidden',
      minWidth: 180,
    }}>
      {children}
    </div>
  );
}

function DropdownItem({ children, selected, onClick }: { children: React.ReactNode; selected: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 12px',
        fontSize: 12,
        cursor: 'pointer',
        background: hover ? 'rgba(0,200,255,0.06)' : selected ? 'rgba(0,200,255,0.04)' : 'transparent',
        color: selected ? 'var(--txt)' : 'var(--txt-muted)',
        fontWeight: selected ? 600 : 400,
        transition: 'background 0.1s',
      }}
    >
      {children}
    </div>
  );
}

function DropdownDivider() {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />;
}

function Checkmark() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}>
      <path d="M1.5 5.5l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Nueva categoría inline ── */
function NewCatInline({ onAdd }: { onAdd: (d: { nombre: string; color: string; icono: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('#00c8ff');
  const [icono, setIcono] = useState('');

  function save() {
    if (!nombre.trim()) return;
    onAdd({ nombre: nombre.trim(), color, icono });
    setNombre('');
    setIcono('');
    setOpen(false);
  }

  if (!open) return (
    <div
      onClick={() => setOpen(true)}
      style={{ padding: '7px 12px', fontSize: 11, color: 'rgba(0,200,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#00c8ff')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(0,200,255,0.6)')}
    >
      <span style={{ fontSize: 14 }}>+</span> Nueva categoría
    </div>
  );

  return (
    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false); }}
        placeholder="Nombre de categoría..."
        style={inp}
      />

      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {EMOJIS.slice(0, 9).map((em) => (
          <button
            key={em}
            type="button"
            onClick={() => setIcono(icono === em ? '' : em)}
            style={{ width: 22, height: 22, borderRadius: 4, fontSize: 12, cursor: 'pointer', border: icono === em ? '1px solid rgba(0,200,255,0.5)' : '1px solid transparent', background: icono === em ? 'rgba(0,200,255,0.1)' : 'rgba(255,255,255,0.04)' }}
          >
            {em}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {COLORS.slice(0, 8).map((c) => (
          <div
            key={c}
            onClick={() => setColor(c)}
            style={{ width: 13, height: 13, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid #fff' : '2px solid transparent', transform: color === c ? 'scale(1.25)' : 'scale(1)', flexShrink: 0 }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setOpen(false)} style={{ flex: 1, padding: '4px', borderRadius: 4, fontSize: 11, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--txt-muted)', cursor: 'pointer' }}>
          Cancelar
        </button>
        <button onClick={save} style={{ flex: 1, padding: '4px', borderRadius: 4, fontSize: 11, fontWeight: 700, border: 'none', cursor: nombre.trim() ? 'pointer' : 'not-allowed', background: nombre.trim() ? 'linear-gradient(135deg,#0055cc,#00c8ff)' : 'rgba(255,255,255,0.06)', color: nombre.trim() ? 'white' : 'var(--txt-muted)' }}>
          Crear
        </button>
      </div>
    </div>
  );
}

/* ── Nuevo equipo inline ── */
function NewEquipoInline({ onAdd }: { onAdd: (d: { nombre: string; color: string; siglas: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [nombre, setNombre] = useState('');
  const [color, setColor] = useState('#00c8ff');
  const [siglas, setSiglas] = useState('');

  function save() {
    if (!nombre.trim() || !siglas.trim()) return;
    onAdd({ nombre: nombre.trim(), color, siglas: siglas.trim() });
    setNombre('');
    setSiglas('');
    setOpen(false);
  }

  if (!open) return (
    <div
      onClick={() => setOpen(true)}
      style={{ padding: '7px 12px', fontSize: 11, color: 'rgba(0,200,255,0.6)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
      onMouseEnter={(e) => (e.currentTarget.style.color = '#00c8ff')}
      onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(0,200,255,0.6)')}
    >
      <span style={{ fontSize: 14 }}>+</span> Nuevo equipo
    </div>
  );

  return (
    <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setOpen(false); }}
          placeholder="Nombre del equipo..."
          style={{ ...inp, flex: 1 }}
        />
        <input
          value={siglas}
          onChange={(e) => setSiglas(e.target.value.toUpperCase().slice(0, 3))}
          placeholder="AB"
          style={{ ...inp, width: 42, textAlign: 'center', fontWeight: 700, flex: 'none' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {COLORS.slice(0, 8).map((c) => (
          <div
            key={c}
            onClick={() => setColor(c)}
            style={{ width: 13, height: 13, borderRadius: '50%', background: c, cursor: 'pointer', border: color === c ? '2px solid #fff' : '2px solid transparent', transform: color === c ? 'scale(1.25)' : 'scale(1)', flexShrink: 0 }}
          />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={() => setOpen(false)} style={{ flex: 1, padding: '4px', borderRadius: 4, fontSize: 11, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'var(--txt-muted)', cursor: 'pointer' }}>
          Cancelar
        </button>
        <button onClick={save} style={{ flex: 1, padding: '4px', borderRadius: 4, fontSize: 11, fontWeight: 700, border: 'none', cursor: (nombre.trim() && siglas.trim()) ? 'pointer' : 'not-allowed', background: (nombre.trim() && siglas.trim()) ? 'linear-gradient(135deg,#0055cc,#00c8ff)' : 'rgba(255,255,255,0.06)', color: (nombre.trim() && siglas.trim()) ? 'white' : 'var(--txt-muted)' }}>
          Crear
        </button>
      </div>
    </div>
  );
}

/* ── Sprint dot ── */
function SprintDot({ sprint }: { sprint: Sprint }) {
  const now = new Date();
  const color = now >= new Date(sprint.fechaInicio) && now <= new Date(sprint.fechaFin)
    ? '#00e5a0'
    : now > new Date(sprint.fechaFin)
      ? '#b2bec3'
      : '#fdcb6e';

  return <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

/* ── Helpers ── */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 8 }}>
      {children}
    </span>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}

function PersonChip({ name, color }: { name: string; color: string }) {
  const ini = name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 26, height: 26, borderRadius: '50%', background: `linear-gradient(135deg, ${color}, ${color}cc)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'white', flexShrink: 0 }}>
        {ini}
      </div>
      <span style={{ fontSize: 13, color: 'var(--txt)', fontWeight: 500 }}>{name}</span>
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: '6px 9px',
  borderRadius: 5,
  fontSize: 12,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  color: '#e8ecf4',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const durationInput: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: 0,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: 'var(--txt)',
  fontSize: 18,
  fontWeight: 600,
  fontFamily: 'monospace',
  letterSpacing: 1,
};