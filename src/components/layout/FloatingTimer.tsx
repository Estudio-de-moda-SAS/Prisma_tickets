// src/components/layout/FloatingTimer.tsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { Clock, Play, Pause, Save, ExternalLink, X, GripHorizontal } from 'lucide-react';
import { useTimerStore, type TimerEntry } from '@/store/timerStore';
import { useUpdateRequest } from '@/features/requests/hooks/UseUpdateRequest';
import type { Request } from '@/features/requests/types';
import type { Location } from 'react-router-dom';
const POS_KEY = 'prisma-timer-pos';
const MARGIN  = 8;

function loadPos(): { x: number; y: number } | null {
  try {
    const raw = localStorage.getItem(POS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function savePos(p: { x: number; y: number } | null) {
  try { if (p) localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* noop */ }
}

function fmt(s: number) {
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((v) => String(v).padStart(2, '0')).join(':');
}

export function FloatingTimer() {
  const lastId     = useTimerStore((s) => s.lastId);
  const entry      = useTimerStore((s) => (lastId ? s.entries[lastId] : undefined));
  const checkpoint = useTimerStore((s) => s.checkpoint);

  const shellRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(loadPos);
  const posRef  = useRef(pos);
  const dragRef = useRef<{ offX: number; offY: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  // Heartbeat global: persiste el progreso aunque el modal esté cerrado
  useEffect(() => {
    if (!entry?.startedAt) return;
    const id = setInterval(() => checkpoint(), 5000);
    return () => clearInterval(id);
  }, [entry?.startedAt, checkpoint]);

  // Limita la posición al viewport menos el tamaño real del widget (sin cortes)
  const clamp = useCallback((x: number, y: number) => {
    const el = shellRef.current;
    const w  = el?.offsetWidth  ?? 280;
    const h  = el?.offsetHeight ?? 0;
    const maxX = Math.max(MARGIN, window.innerWidth  - w - MARGIN);
    const maxY = Math.max(MARGIN, window.innerHeight - h - MARGIN);
    return {
      x: Math.min(Math.max(x, MARGIN), maxX),
      y: Math.min(Math.max(y, MARGIN), maxY),
    };
  }, []);

  const applyPos = useCallback((next: { x: number; y: number } | null) => {
    posRef.current = next;
    setPos(next);
  }, []);

  // Re-clamp al redimensionar la ventana → nunca queda cortado en un borde
  useEffect(() => {
    function onResize() {
      if (posRef.current) applyPos(clamp(posRef.current.x, posRef.current.y));
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clamp, applyPos]);

  if (!entry) return null;

  function onPointerDown(e: React.PointerEvent) {
    const el = shellRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragRef.current = { offX: e.clientX - rect.left, offY: e.clientY - rect.top };
    // Si aún no se ha movido (estaba en bottom/right), inicializa desde su posición actual
    if (!posRef.current) applyPos({ x: rect.left, y: rect.top });
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
    e.preventDefault();
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    applyPos(clamp(e.clientX - dragRef.current.offX, e.clientY - dragRef.current.offY));
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    setDragging(false);
    savePos(posRef.current);
  }

  const running = !!entry.startedAt;
  const positionStyle: React.CSSProperties = pos
    ? { top: pos.y, left: pos.x }
    : { bottom: 20, right: 20 };

  return (
    <div
      ref={shellRef}
      style={{
        position: 'fixed', ...positionStyle, zIndex: 300, width: 280,
        background: 'var(--bg-panel)',
        border: `1px solid ${running ? 'rgba(0,200,255,0.4)' : 'var(--border)'}`,
        borderRadius: 12, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
        overflow: 'hidden', fontFamily: 'var(--font-body)',
        userSelect: dragging ? 'none' : undefined,
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: running
          ? 'linear-gradient(90deg, transparent, var(--accent), transparent)'
          : 'linear-gradient(90deg, transparent, var(--txt-muted), transparent)' }} />

      {/* Asa de arrastre */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        title="Arrastra para mover"
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: 18, cursor: dragging ? 'grabbing' : 'grab',
          color: 'var(--txt-muted)', opacity: 0.5, touchAction: 'none',
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        <GripHorizontal size={14} />
      </div>

      <TimerWidgetInner key={entry.requestId} entry={entry} />
    </div>
  );
}

function TimerWidgetInner({ entry }: { entry: TimerEntry }) {
  const navigate = useNavigate();
  const location = useLocation();
  const qc       = useQueryClient();
  const start    = useTimerStore((s) => s.start);
  const pause    = useTimerStore((s) => s.pause);
  const reset    = useTimerStore((s) => s.reset);
  const dismiss  = useTimerStore((s) => s.dismiss);
  const { mutate: update } = useUpdateRequest(entry.equipo);

  const running = !!entry.startedAt;

  // tick solo para refrescar la UI; el valor real se deriva de timestamps
  const [, force] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => force((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [running]);

  const elapsedMs = entry.accumulatedMs + (entry.startedAt ? Date.now() - entry.startedAt : 0);
  const seconds   = Math.floor(elapsedMs / 1000);
  const accent    = running ? 'var(--accent)' : 'var(--txt-muted)';

  function handleToggle() {
    if (running) pause(entry.requestId);
    else start(entry.requestId, { titulo: entry.titulo, equipo: entry.equipo });
  }

  function handleSave() {
    const hrs = parseFloat((seconds / 3600).toFixed(4));
    if (hrs <= 0) { reset(entry.requestId); return; }
    const fresh = qc.getQueryData<Request>(['request', entry.requestId]);
    const base  = fresh?.loggedHours ?? 0;
    update({ id: entry.requestId, patch: { loggedHours: parseFloat((base + hrs).toFixed(4)) } });
    reset(entry.requestId);
  }

  return (
    <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Título + descartar */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <Clock size={14} style={{ color: accent, flexShrink: 0, marginTop: 1 }} />
        <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--txt)', lineHeight: 1.4,
          overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {entry.titulo}
        </span>
        <button
          onClick={() => dismiss(entry.requestId)}
          title="Ocultar (conserva el progreso)"
          style={{ width: 20, height: 20, borderRadius: 5, border: '1px solid var(--border-subtle)',
            background: 'transparent', color: 'var(--txt-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
        ><X size={12} /></button>
      </div>

      {/* Tiempo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: 'monospace', fontSize: 24, fontWeight: 600, letterSpacing: 2, color: accent }}>
          {fmt(seconds)}
        </span>
        {!running && seconds > 0 && (
          <span style={{ fontSize: 9, color: 'var(--txt-muted)', letterSpacing: 1, textTransform: 'uppercase', fontWeight: 700 }}>En pausa</span>
        )}
      </div>

      {/* Botones */}
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={handleToggle}
          style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
            border: 'none', fontFamily: 'var(--font-display)',
            background: running ? 'rgba(255,71,87,0.15)' : 'rgba(0,200,255,0.15)',
            color: running ? 'var(--danger)' : 'var(--accent)' }}>
          {running ? <><Pause size={12} />Pausar</> : <><Play size={12} />Reanudar</>}
        </button>
        {seconds > 0 && (
          <button onClick={handleSave}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              padding: '6px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: 'pointer',
              border: 'none', fontFamily: 'var(--font-display)',
              background: 'rgba(0,229,160,0.15)', color: 'var(--success)' }}>
            <Save size={12} />Guardar
          </button>
        )}
        <button
          onClick={() => {
            const background =
              (location.state as { backgroundLocation?: Location } | null)?.backgroundLocation
              ?? location;
            navigate(`/ticket/${entry.requestId}`, { state: { backgroundLocation: background } });
          }}
          title="Abrir ticket"
          style={{ width: 32, borderRadius: 6, border: '1px solid var(--border-subtle)',
            background: 'transparent', color: 'var(--txt-muted)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <ExternalLink size={13} />
        </button>
      </div>
    </div>
  );
}