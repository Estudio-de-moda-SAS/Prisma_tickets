import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronDown as ChevDown, Calendar } from 'lucide-react';
import { useUpdateRequest } from '@/features/requests/hooks/UseUpdateRequest';
import { PRIORIDADES } from '../types';
import type { Request, Prioridad } from '../types';
import { useLabelsByTeamId } from '@/features/requests/hooks/useBoardMetadata';
import { useSubTeams } from '@/features/requests/hooks/useSubTeams';
import { useSprints } from '@/features/requests/hooks/useSprints';
import { config } from '@/config';

/* ── Colores ── */
const PRI_COLOR: Record<Prioridad, string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

const PRIORIDAD_ORDER: Prioridad[] = ['baja', 'media', 'alta', 'critica'];

/* ── Helpers ── */
function fmtColombia(iso: string) {
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
    .toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      day: 'numeric', month: 'long', year: 'numeric',
    });
}

function fmtD(iso: string) {
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function sprintDotColor(sp: { Sprint_Start_Date: string; Sprint_End_Date: string }) {
  const now = new Date();
  if (now >= new Date(sp.Sprint_Start_Date) && now <= new Date(sp.Sprint_End_Date)) return '#00e5a0';
  if (now > new Date(sp.Sprint_End_Date)) return '#b2bec3';
  return '#fdcb6e';
}

/* ── useDropdown ── */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);
  return { open, setOpen, ref };
}

/* ── Primitivos ── */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'block', fontSize: 9, fontWeight: 700,
      letterSpacing: 2, textTransform: 'uppercase',
      color: 'var(--txt-muted)', marginBottom: 7,
    }}>
      {children}
    </span>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}

function DropdownPanel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
      zIndex: 300, background: 'var(--bg-panel)',
      border: '1px solid var(--border)', borderRadius: 8,
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)', overflow: 'hidden', minWidth: 180,
    }}>
      {children}
    </div>
  );
}

function DropdownItem({ children, selected, onClick }: {
  children: React.ReactNode; selected: boolean; onClick: () => void;
}) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px', fontSize: 12, cursor: 'pointer',
        background: hover ? 'rgba(0,200,255,0.06)' : selected ? 'rgba(0,200,255,0.04)' : 'transparent',
        color: selected ? 'var(--txt)' : 'var(--txt-muted)',
        fontWeight: selected ? 600 : 400, transition: 'background 0.1s',
      }}
    >
      {children}
    </div>
  );
}

function Checkmark() {
  return (
    <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}>
      <path d="M1.5 5.5l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function triggerBase(open: boolean, accentRgb: string): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    minHeight: 34, width: '100%', padding: '4px 10px', borderRadius: 6,
    border: `1px solid ${open ? `rgba(${accentRgb},0.45)` : 'var(--border-subtle)'}`,
    background: open ? `rgba(${accentRgb},0.07)` : 'transparent',
    cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s',
    textAlign: 'left',
  };
}

/* ══════════════════════════════════════════════════════════════
   HomeRequestModal
   ══════════════════════════════════════════════════════════════ */
type Props = {
  request: Request;
  onClose: () => void;
};

export function HomeRequestModal({ request, onClose }: Props) {
  // El equipo se extrae del request — siempre disponible
  const equipo      = request.equipo[0] ?? 'desarrollo';
  const boardId     = config.DEFAULT_BOARD_ID;
  const boardTeamId = request.boardTeamId ?? null;

  const { mutate: update, isPending } = useUpdateRequest(equipo);

  const { data: subTeams = [] } = useSubTeams(boardTeamId);
  const { data: labels   = [] } = useLabelsByTeamId(boardId, boardTeamId);
  const { data: sprints  = [] } = useSprints();

  const priDD    = useDropdown();
  const subDD    = useDropdown();
  const labelDD  = useDropdown();
  const sprintDD = useDropdown();

  const [titulo,           setTitulo]          = useState(request.titulo);
  const [descripcion,      setDescripcion]      = useState(request.descripcion ?? '');
  const [prioridad,        setPrioridad]        = useState<Prioridad>(request.prioridad);
  const [selectedLabelIds, setSelectedLabelIds] = useState<number[]>(request.labelIds ?? []);
  const [selectedSubIds,   setSelectedSubIds]   = useState<number[]>(request.subTeamIds ?? []);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(request.sprintId ?? null);
  const [deadline,         setDeadline]         = useState<string>(
    request.deadline ? request.deadline.split('T')[0] : '',
  );
  const [saved, setSaved] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  /* ── Helpers de guardado ── */
  function flash() {
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  }

  function save(patch: Parameters<typeof update>[0]['patch']) {
    update({ id: request.id, patch }, { onSuccess: flash });
  }

  function handleBlurTitulo() {
    if (titulo.trim() && titulo !== request.titulo)
      save({ titulo: titulo.trim() });
  }

  function handleBlurDesc() {
    if (descripcion !== request.descripcion)
      save({ descripcion });
  }

  function handlePrioridad(p: Prioridad) {
    setPrioridad(p);
    priDD.setOpen(false);
    save({ prioridad: p });
  }

  function handleToggleLabel(labelId: number) {
    const next = selectedLabelIds.includes(labelId)
      ? selectedLabelIds.filter((l) => l !== labelId)
      : [...selectedLabelIds, labelId];
    setSelectedLabelIds(next);
    save({ labelIds: next });
  }

  function handleToggleSub(subId: number) {
    const next = selectedSubIds.includes(subId)
      ? selectedSubIds.filter((s) => s !== subId)
      : [...selectedSubIds, subId];
    setSelectedSubIds(next);
    save({ subTeamIds: next });
  }

  function handleSprint(sprintId: number | null) {
    setSelectedSprintId(sprintId);
    sprintDD.setOpen(false);
    save({ sprintId });
  }

  function handleDeadline(val: string) {
    setDeadline(val);
    save({ deadline: val ? val + 'T00:00:00' : null });
  }

  const selectedSprint = sprints.find((s) => s.Sprint_ID === selectedSprintId) ?? null;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, padding: 24,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 620, maxHeight: '88vh',
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 12, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative',
      }}>
        {/* Accent line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
        }} />

        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-muted)', letterSpacing: 1 }}>
            #{request.id.slice(-6).toUpperCase()}
          </span>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
              color: saved ? 'var(--success)' : 'transparent',
              transition: 'color 0.3s',
            }}>
              ✓ Guardado
            </span>
            {isPending && (
              <span style={{ fontSize: 10, color: 'var(--txt-muted)' }}>Guardando…</span>
            )}
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 6,
                border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)',
                background: 'transparent', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Título */}
          <FieldBlock label="Nombre de la solicitud">
            <input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              onBlur={handleBlurTitulo}
              style={{
                width: '100%', padding: '9px 12px', borderRadius: 7,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)', color: 'var(--txt)',
                fontSize: 15, fontWeight: 600, outline: 'none',
                fontFamily: 'var(--font-body)', boxSizing: 'border-box',
                transition: 'border-color 0.15s',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; }}
              onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
            />
          </FieldBlock>

          {/* Descripción */}
          <FieldBlock label="Descripción">
            <textarea
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              onBlur={handleBlurDesc}
              placeholder="Escribe una descripción..."
              rows={3}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 7,
                border: '1px solid var(--border-subtle)',
                background: 'var(--bg-surface)',
                color: descripcion ? 'var(--txt)' : 'var(--txt-muted)',
                fontSize: 13, lineHeight: 1.65, resize: 'none',
                outline: 'none', fontFamily: 'var(--font-body)',
                boxSizing: 'border-box', transition: 'border-color 0.15s',
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; }}
              onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
            />
          </FieldBlock>

          {/* Grid 2 cols */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Prioridad */}
            <FieldBlock label="Prioridad">
              <div ref={priDD.ref} style={{ position: 'relative' }}>
                <button onClick={() => priDD.setOpen((o) => !o)} style={triggerBase(priDD.open, '255,160,50')}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                    textTransform: 'uppercase', color: PRI_COLOR[prioridad], flex: 1,
                  }}>
                    {PRIORIDADES[prioridad]}
                  </span>
                  <ChevDown size={12} style={{
                    color: 'var(--txt-muted)', flexShrink: 0,
                    transform: priDD.open ? 'rotate(180deg)' : 'none',
                    transition: 'transform 0.15s',
                  }} />
                </button>
                {priDD.open && (
                  <DropdownPanel>
                    {PRIORIDAD_ORDER.map((p) => (
                      <DropdownItem key={p} selected={prioridad === p} onClick={() => handlePrioridad(p)}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRI_COLOR[p], flexShrink: 0 }} />
                        <span style={{ flex: 1, color: PRI_COLOR[p], fontWeight: 600 }}>{PRIORIDADES[p]}</span>
                        {prioridad === p && <Checkmark />}
                      </DropdownItem>
                    ))}
                  </DropdownPanel>
                )}
              </div>
            </FieldBlock>

            {/* Deadline */}
            <FieldBlock label="Fecha límite">
              <div style={{ position: 'relative' }}>
                <input
                  type="date"
                  value={deadline}
                  onChange={(e) => handleDeadline(e.target.value)}
                  style={{
                    width: '100%', padding: '5px 10px', borderRadius: 6,
                    border: '1px solid var(--border-subtle)',
                    background: 'var(--bg-surface)',
                    color: deadline ? 'var(--warn)' : 'var(--txt-muted)',
                    fontSize: 12, outline: 'none',
                    fontFamily: 'var(--font-body)', boxSizing: 'border-box',
                    cursor: 'pointer', height: 34,
                  }}
                />
                {!deadline && (
                  <Calendar size={12} style={{
                    position: 'absolute', right: 10, top: '50%',
                    transform: 'translateY(-50%)', color: 'var(--txt-muted)',
                    pointerEvents: 'none',
                  }} />
                )}
              </div>
            </FieldBlock>

            {/* Sub-equipos */}
            <FieldBlock label="Equipo">
              <div ref={subDD.ref} style={{ position: 'relative' }}>
                <button onClick={() => subDD.setOpen((o) => !o)} style={triggerBase(subDD.open, '0,200,255')}>
                  {selectedSubIds.length === 0
                    ? <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1 }}>Sin equipo</span>
                    : selectedSubIds.map((sid) => {
                        const sub = subTeams.find((s) => s.Sub_Team_ID === sid);
                        if (!sub) return null;
                        return (
                          <span key={sid} style={{
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                            fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                            color: sub.Sub_Team_Color, background: `${sub.Sub_Team_Color}18`,
                            border: `1px solid ${sub.Sub_Team_Color}35`,
                          }}>
                            {sub.Sub_Team_Name}
                            <span
                              onMouseDown={(e) => { e.stopPropagation(); handleToggleSub(sid); }}
                              style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6, fontSize: 13 }}
                            >×</span>
                          </span>
                        );
                      })}
                  <ChevDown size={12} style={{
                    marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0,
                    transform: subDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
                  }} />
                </button>
                {subDD.open && (
                  <DropdownPanel>
                    {subTeams.length === 0
                      ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>No hay equipos configurados.</div>
                      : subTeams.map((sub) => {
                          const sel = selectedSubIds.includes(sub.Sub_Team_ID);
                          return (
                            <DropdownItem key={sub.Sub_Team_ID} selected={sel} onClick={() => handleToggleSub(sub.Sub_Team_ID)}>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: sub.Sub_Team_Color, flexShrink: 0 }} />
                              <span style={{ flex: 1 }}>{sub.Sub_Team_Name}</span>
                              {sel && <Checkmark />}
                            </DropdownItem>
                          );
                        })}
                  </DropdownPanel>
                )}
              </div>
            </FieldBlock>

            {/* Etiquetas */}
            <FieldBlock label="Etiquetas">
              <div ref={labelDD.ref} style={{ position: 'relative' }}>
                <button onClick={() => labelDD.setOpen((o) => !o)} style={triggerBase(labelDD.open, '0,200,255')}>
                  {selectedLabelIds.length === 0
                    ? <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1 }}>Sin etiquetas</span>
                    : labels.filter((l) => selectedLabelIds.includes(l.Label_ID)).map((label) => (
                        <span key={label.Label_ID} style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
                          color: label.Label_Color, background: `${label.Label_Color}18`,
                          border: `1px solid ${label.Label_Color}35`,
                        }}>
                          {label.Label_Icon && <span>{label.Label_Icon}</span>}
                          {label.Label_Name}
                          <span
                            onMouseDown={(e) => { e.stopPropagation(); handleToggleLabel(label.Label_ID); }}
                            style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6, fontSize: 13 }}
                          >×</span>
                        </span>
                      ))}
                  <ChevDown size={12} style={{
                    marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0,
                    transform: labelDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
                  }} />
                </button>
                {labelDD.open && (
                  <DropdownPanel>
                    {labels.length === 0
                      ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>Sin etiquetas disponibles.</div>
                      : labels.map((label) => {
                          const sel = selectedLabelIds.includes(label.Label_ID);
                          return (
                            <DropdownItem key={label.Label_ID} selected={sel} onClick={() => handleToggleLabel(label.Label_ID)}>
                              {label.Label_Icon && <span style={{ fontSize: 13 }}>{label.Label_Icon}</span>}
                              <span style={{ flex: 1 }}>{label.Label_Name}</span>
                              <span style={{ width: 8, height: 8, borderRadius: '50%', background: label.Label_Color, flexShrink: 0 }} />
                              {sel && <Checkmark />}
                            </DropdownItem>
                          );
                        })}
                  </DropdownPanel>
                )}
              </div>
            </FieldBlock>

            {/* Sprint */}
            <FieldBlock label="Sprint">
              <div ref={sprintDD.ref} style={{ position: 'relative' }}>
                <button onClick={() => sprintDD.setOpen((o) => !o)} style={{ ...triggerBase(sprintDD.open, '162,155,254'), flexWrap: 'nowrap' }}>
                  {selectedSprint ? (
                    <>
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: sprintDotColor(selectedSprint), flexShrink: 0 }} />
                      <span style={{ fontSize: 12, color: 'var(--txt)', flex: 1, textAlign: 'left' }}>{selectedSprint.Sprint_Text}</span>
                    </>
                  ) : (
                    <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1, textAlign: 'left' }}>Sin sprint</span>
                  )}
                  <ChevDown size={12} style={{
                    color: 'var(--txt-muted)', flexShrink: 0,
                    transform: sprintDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s',
                  }} />
                </button>
                {sprintDD.open && (
                  <DropdownPanel>
                    {sprints.length === 0
                      ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>No hay sprints.</div>
                      : [...sprints]
                          .sort((a, b) => new Date(b.Sprint_Start_Date).getTime() - new Date(a.Sprint_Start_Date).getTime())
                          .map((sp) => {
                            const sel = selectedSprintId === sp.Sprint_ID;
                            return (
                              <DropdownItem key={sp.Sprint_ID} selected={sel} onClick={() => handleSprint(sel ? null : sp.Sprint_ID)}>
                                <div style={{ width: 7, height: 7, borderRadius: '50%', background: sprintDotColor(sp), flexShrink: 0 }} />
                                <span style={{ flex: 1 }}>{sp.Sprint_Text}</span>
                                <span style={{ fontSize: 10, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>
                                  {fmtD(sp.Sprint_Start_Date)} → {fmtD(sp.Sprint_End_Date)}
                                </span>
                                {sel && <Checkmark />}
                              </DropdownItem>
                            );
                          })}
                  </DropdownPanel>
                )}
              </div>
            </FieldBlock>

            {/* Fecha apertura — solo lectura */}
            <FieldBlock label="Fecha de apertura">
              <span style={{ fontSize: 13, color: 'var(--txt)', display: 'block', paddingTop: 6 }}>
                {fmtColombia(request.fechaApertura)}
              </span>
            </FieldBlock>

          </div>
        </div>
      </div>
    </div>
  );
}