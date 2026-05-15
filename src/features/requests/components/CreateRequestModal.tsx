// src/features/requests/components/CreateRequestModal.tsx
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronDown as ChevDown, GitFork, Plus, Trash2, ShieldAlert } from 'lucide-react';
import { PRIORIDADES } from '../types';
import type { Prioridad } from '../types';
import {
  useLabelsByTeamId,
  useBoardTeams,
  useBoardTemplates,
  getTemplateDefinition,
} from '@/features/requests/hooks/useBoardMetadata';
import { useSubTeams }    from '@/features/requests/hooks/useSubTeams';
import { useSprints }     from '@/features/requests/hooks/useSprints';
import { useUsers }       from '@/features/requests/hooks/useUsers';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useColumnMap }   from '@/features/requests/hooks/useColumnMap';
import { useCreateRequest } from '@/features/requests/hooks/useCreateRequest';
import { EQUIPO_COLORS, EQUIPO_ICONS } from '@/components/layout/siderbarConstants';
import { config } from '@/config';
import type { BoardTeam, BoardTemplate } from '@/features/requests/hooks/useBoardMetadata';

type Step = 'equipo' | 'template' | 'form';

const PRI_COLOR: Record<Prioridad, string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

/* ── Portal dropdown hook ── */
function usePortalDropdown() {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const triggerRef      = useRef<HTMLButtonElement>(null);

  const toggle = useCallback(() => {
    if (!open && triggerRef.current) setRect(triggerRef.current.getBoundingClientRect());
    setOpen((o) => !o);
  }, [open]);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current && !triggerRef.current.contains(target)) {
        const panel = document.querySelector('[data-portal-dropdown]');
        if (!panel || !panel.contains(target)) setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return { open, toggle, close, triggerRef, rect };
}

function PortalPanel({ rect, children }: { rect: DOMRect | null; children: React.ReactNode }) {
  if (!rect) return null;
  return createPortal(
    <div data-portal-dropdown style={{ position: 'fixed', top: rect.bottom + 4, left: rect.left, width: rect.width, zIndex: 99999, background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', overflow: 'hidden', minWidth: 180 }} onClick={(e) => e.stopPropagation()}>
      {children}
    </div>,
    document.body,
  );
}

/* ── Step indicator ── */
function StepIndicator({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'equipo',   label: 'Equipo'   },
    { key: 'template', label: 'Tipo'     },
    { key: 'form',     label: 'Detalles' },
  ];
  const currentIndex = steps.findIndex((s) => s.key === step);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24, flexShrink: 0 }}>
      {steps.map((s, i) => {
        const done   = i < currentIndex;
        const active = i === currentIndex;
        return (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', flex: i < steps.length - 1 ? 1 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--bg-surface)', border: `1.5px solid ${done ? 'var(--success)' : active ? 'var(--accent)' : 'var(--border-subtle)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: done || active ? 'white' : 'var(--txt-muted)', transition: 'all 0.2s' }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 400, color: active ? 'var(--txt)' : 'var(--txt-muted)' }}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <div style={{ flex: 1, height: 1, marginLeft: 8, background: done ? 'var(--success)' : 'var(--border-subtle)', transition: 'background 0.2s' }} />}
          </div>
        );
      })}
    </div>
  );
}

/* ── Step 1: Equipo ── */
function StepEquipo({ teams, selectedTeamId, onSelect, onNext }: {
  teams: BoardTeam[]; selectedTeamId: number | null; onSelect: (id: number) => void; onNext: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ marginBottom: 20, flexShrink: 0 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--txt)', marginBottom: 4 }}>¿A qué equipo va dirigida?</h3>
        <p style={{ fontSize: 12, color: 'var(--txt-muted)' }}>Seleccioná el equipo que va a atender esta solicitud.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, flex: 1, overflowY: 'auto' }}>
        {teams.map((team) => {
          const code     = team.Board_Team_Code as keyof typeof EQUIPO_COLORS;
          const colors   = EQUIPO_COLORS[code];
          const Icon     = EQUIPO_ICONS[code];
          const selected = selectedTeamId === team.Board_Team_ID;
          const dot      = colors?.dot    ?? team.Board_Team_Color;
          const glow     = colors?.glow   ?? `${team.Board_Team_Color}12`;
          const border   = colors?.border ?? `${team.Board_Team_Color}30`;
          return (
            <button key={team.Board_Team_ID} type="button" onClick={() => onSelect(team.Board_Team_ID)}
              style={{ padding: '16px', borderRadius: 8, border: `1.5px solid ${selected ? border : 'var(--border)'}`, background: selected ? glow : 'var(--bg-surface)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 8 }}
              onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.borderColor = border; e.currentTarget.style.background = glow; }}}
              onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-surface)'; }}}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: selected ? `linear-gradient(90deg, transparent, ${dot}, transparent)` : 'transparent', transition: 'background 0.2s' }} />
              {selected && (
                <div style={{ position: 'absolute', top: 10, right: 12, width: 18, height: 18, borderRadius: '50%', background: dot, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              )}
              <div style={{ width: 32, height: 32, borderRadius: 7, background: selected ? `${dot}20` : 'var(--bg-panel)', border: `1px solid ${selected ? border : 'var(--border-subtle)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {Icon ? <Icon size={14} style={{ color: selected ? dot : 'var(--txt-muted)', opacity: selected ? 1 : 0.6 }} /> : <span style={{ fontSize: 14 }}>🏢</span>}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 13, fontWeight: 700, color: selected ? dot : 'var(--txt)', marginBottom: 2 }}>{team.Board_Team_Name}</div>
                <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: dot, opacity: selected ? 1 : 0.45 }}>{team.Board_Team_Code}</div>
              </div>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16, flexShrink: 0 }}>
        <button type="button" onClick={onNext} disabled={selectedTeamId === null}
          style={{ padding: '8px 24px', borderRadius: 6, border: 'none', background: selectedTeamId !== null ? 'linear-gradient(135deg, var(--accent-2), var(--accent))' : 'var(--bg-surface)', color: selectedTeamId !== null ? 'white' : 'var(--txt-muted)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', cursor: selectedTeamId !== null ? 'pointer' : 'not-allowed' }}>
          Continuar →
        </button>
      </div>
    </div>
  );
}

/* ── Step 2: Template ── */
function StepTemplate({ templates, selectedBoardTeamId, selectedTemplateId, onSelect, onNext, onBack }: {
  templates:           BoardTemplate[];
  selectedBoardTeamId: number | null;
  selectedTemplateId:  number | null;
  onSelect:            (id: number) => void;
  onNext:              () => void;
  onBack:              () => void;
}) {
  const filtered = templates.filter((t) =>
    t.Request_Template_Is_Active &&
    (t.Request_Template_Teams?.length === 0 ||
     (selectedBoardTeamId !== null && t.Request_Template_Teams?.includes(selectedBoardTeamId)))
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      <div style={{ marginBottom: 20, flexShrink: 0 }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--txt)', marginBottom: 4 }}>¿Qué tipo de solicitud es?</h3>
        <p style={{ fontSize: 12, color: 'var(--txt-muted)' }}>El tipo determina qué información adicional se necesita.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: filtered.length <= 2 ? `repeat(${filtered.length}, 1fr)` : 'repeat(3, 1fr)', gap: 10, flex: 1, overflowY: 'auto' }}>
        {filtered.map((t) => {
          const selected   = selectedTemplateId === t.Request_Template_ID;
          const accent     = t.Request_Template_Color ?? '#00c8ff';
          const icon       = t.Request_Template_Icon  ?? '📋';
          const fieldCount = t.Request_Template_Form_Schema?.length ?? 0;
          return (
            <button key={t.Request_Template_ID} type="button" onClick={() => onSelect(t.Request_Template_ID)}
              style={{ padding: '20px 16px', borderRadius: 8, border: `1.5px solid ${selected ? accent + '70' : 'var(--border)'}`, background: selected ? `linear-gradient(135deg, ${accent}12, ${accent}06)` : 'var(--bg-surface)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', position: 'relative', overflow: 'hidden' }}
              onMouseEnter={(e) => { if (!selected) { e.currentTarget.style.borderColor = accent + '40'; e.currentTarget.style.background = `${accent}06`; }}}
              onMouseLeave={(e) => { if (!selected) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--bg-surface)'; }}}
            >
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: selected ? `linear-gradient(90deg, transparent, ${accent}, transparent)` : 'transparent', transition: 'background 0.2s' }} />
              {selected && (
                <div style={{ position: 'absolute', top: 10, right: 12, width: 18, height: 18, borderRadius: '50%', background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><path d="M1.5 5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
              )}
              <div style={{ fontSize: 24, marginBottom: 8 }}>{icon}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, fontWeight: 700, color: selected ? accent : 'var(--txt)', marginBottom: 6 }}>{t.Request_Template_Name}</div>
              <div style={{ fontSize: 11, color: 'var(--txt-muted)', lineHeight: 1.5 }}>{t.Request_Template_Description}</div>
              {fieldCount > 0 && (
                <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {t.Request_Template_Form_Schema.map((f) => (
                    <span key={f.key} style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 3, background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>+ {f.label}</span>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, flexShrink: 0 }}>
        <button type="button" onClick={onBack} style={{ padding: '8px 18px', borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', fontSize: 12, background: 'transparent', cursor: 'pointer' }}>← Volver</button>
        <button type="button" onClick={onNext} disabled={selectedTemplateId === null}
          style={{ padding: '8px 24px', borderRadius: 6, border: 'none', background: selectedTemplateId !== null ? 'linear-gradient(135deg, var(--accent-2), var(--accent))' : 'var(--bg-surface)', color: selectedTemplateId !== null ? 'white' : 'var(--txt-muted)', fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', cursor: selectedTemplateId !== null ? 'pointer' : 'not-allowed' }}>
          Continuar →
        </button>
      </div>
    </div>
  );
}

/* ── Primitivos ── */
function DropdownItem({ children, selected, onClick }: { children: React.ReactNode; selected: boolean; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', fontSize: 12, cursor: 'pointer', background: hover ? 'rgba(0,200,255,0.06)' : selected ? 'rgba(0,200,255,0.04)' : 'transparent', color: selected ? 'var(--txt)' : 'var(--txt-muted)', fontWeight: selected ? 600 : 400, transition: 'background 0.1s' }}>
      {children}
    </div>
  );
}

function Checkmark() {
  return <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M1.5 5.5l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function SprintDot({ sprint }: { sprint: { Sprint_Start_Date: string; Sprint_End_Date: string } }) {
  const now   = new Date();
  const color = now >= new Date(sprint.Sprint_Start_Date) && now <= new Date(sprint.Sprint_End_Date)
    ? '#00e5a0'
    : now > new Date(sprint.Sprint_End_Date) ? '#b2bec3' : '#fdcb6e';
  return <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 8 }}>{children}</span>;
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
}

/* ── ExtraField renderer ── */
function ExtraFieldRenderer({ field, value, onChange, accent }: {
  field:    import('@/features/requests/templates/types').TemplateExtraField;
  value:    string;
  onChange: (v: string) => void;
  accent:   string;
}) {
  const [collapsed, setCollapsed] = useState(field.collapsible ?? false);

  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: collapsed ? 0 : 8 }}>
        <FieldLabel>{field.label}{field.required && ' *'}</FieldLabel>
        {field.collapsible && (
          <button type="button" onClick={() => setCollapsed((v) => !v)}
            style={{ marginLeft: 'auto', marginBottom: 8, fontSize: 9, color: accent, background: 'none', border: 'none', cursor: 'pointer', opacity: 0.7 }}>
            {collapsed ? '▼ mostrar' : '▲ ocultar'}
          </button>
        )}
      </div>
      {!collapsed && (
        <>
          {field.type === 'textarea' && <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} rows={3} style={{ width: '100%', minHeight: 80, padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 12, resize: 'none', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />}
          {field.type === 'text' && <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />}
          {field.type === 'select' && <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: value ? 'var(--txt)' : 'var(--txt-muted)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box', cursor: 'pointer' }}><option value="">Seleccioná una opción…</option>{(field.options ?? []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}</select>}
          {field.type === 'radio' && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{(field.options ?? []).map((opt) => { const active = value === opt; return <button key={opt} type="button" onClick={() => onChange(opt)} style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 5, border: `1px solid ${active ? accent + '60' : 'var(--border-subtle)'}`, background: active ? `${accent}15` : 'transparent', color: active ? accent : 'var(--txt-muted)', cursor: 'pointer', transition: 'all 0.12s' }}>{opt}</button>; })}</div>}
          {field.type === 'checkbox' && <button type="button" onClick={() => onChange(value === 'true' ? 'false' : 'true')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 8, width: '100%', border: `1px solid ${value === 'true' ? accent + '50' : 'var(--border-subtle)'}`, background: value === 'true' ? `${accent}0d` : 'var(--bg-surface)', cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left' }}><div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `2px solid ${value === 'true' ? accent : 'var(--border)'}`, background: value === 'true' ? accent : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>{value === 'true' && <svg width="11" height="11" viewBox="0 0 11 11" fill="none"><path d="M1.5 5.5l3 3 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}</div><span style={{ fontSize: 13, color: value === 'true' ? 'var(--txt)' : 'var(--txt-muted)', fontWeight: value === 'true' ? 600 : 400, transition: 'color 0.15s' }}>{field.label}{field.required && <span style={{ color: accent, marginLeft: 3 }}>*</span>}</span></button>}
        </>
      )}
    </div>
  );
}

/* ── AcceptanceCriteriaEditor ── */
function AcceptanceCriteriaEditor({ criteria, onChange, accent, showError = false }: {
  criteria: string[]; onChange: (criteria: string[]) => void; accent: string; showError?: boolean;
}) {
  const [newText, setNewText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  function addCriteria() {
    const trimmed = newText.trim();
    if (!trimmed) return;
    onChange([...criteria, trimmed]);
    setNewText('');
    inputRef.current?.focus();
  }

  const hasError = showError && criteria.length === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {criteria.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {criteria.map((c, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 6, background: `${accent}08`, border: `1px solid ${accent}20` }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: `${accent}15`, border: `1px solid ${accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <input value={c} onChange={(e) => { const next = [...criteria]; next[idx] = e.target.value; onChange(next); }} style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--txt)', fontFamily: 'var(--font-body)' }} />
              <button type="button" onClick={() => onChange(criteria.filter((_, i) => i !== idx))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 2, display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0 }} onMouseEnter={(e) => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = 'var(--danger)'; }} onMouseLeave={(e) => { e.currentTarget.style.opacity = '0.5'; e.currentTarget.style.color = 'var(--txt-muted)'; }}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input ref={inputRef} value={newText} onChange={(e) => setNewText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCriteria(); } }} placeholder="Ej: El usuario puede iniciar sesión con Azure AD…" style={{ flex: 1, padding: '7px 11px', borderRadius: 6, border: `1px solid ${hasError ? 'rgba(255,71,87,0.4)' : 'var(--border-subtle)'}`, background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 12, outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box', transition: 'border-color 0.15s' }} onFocus={(e) => { e.currentTarget.style.borderColor = `${accent}50`; }} onBlur={(e) => { e.currentTarget.style.borderColor = hasError ? 'rgba(255,71,87,0.4)' : 'var(--border-subtle)'; }} />
        <button type="button" onClick={addCriteria} disabled={!newText.trim()} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 6, border: `1px solid ${newText.trim() ? accent + '50' : 'var(--border-subtle)'}`, background: newText.trim() ? `${accent}15` : 'transparent', color: newText.trim() ? accent : 'var(--txt-muted)', fontSize: 11, fontWeight: 700, cursor: newText.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}>
          <Plus size={12} /> Añadir
        </button>
      </div>
      {hasError && <span style={{ fontSize: 10, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 5 }}><svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4.5" stroke="currentColor" strokeWidth="1.2"/><line x1="5" y1="2.5" x2="5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="5" cy="7" r="0.5" fill="currentColor"/></svg>Se requiere al menos un criterio de aceptación.</span>}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   CreateRequestModal
   ══════════════════════════════════════════════════════════════ */
type Props = {
  onClose:               () => void;
  onCreated?:            () => void;
  parentId?:             string | null;
  parentTitle?:          string;
  parentIsConfidential?: boolean;
};

export function CreateRequestModal({ onClose, onCreated, parentId = null, parentTitle, parentIsConfidential = false }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const boardId    = config.DEFAULT_BOARD_ID;

  const { data: currentUser }      = useCurrentUser();
  const { data: users        = [] } = useUsers();
  const { data: sprints      = [] } = useSprints();
  const { data: teams        = [] } = useBoardTeams(boardId);
  const { data: allTemplates = [] } = useBoardTemplates(boardId);
  const columnMap                   = useColumnMap(boardId);
  const { mutate: createRequest, isPending: creating } = useCreateRequest();

  const [step,                setStep]               = useState<Step>('equipo');
  const [selectedBoardTeamId, setSelectedBoardTeamId] = useState<number | null>(null);
  const [selectedTemplateId,  setSelectedTemplateId]  = useState<number | null>(null);

  const { data: subTeams = [] } = useSubTeams(selectedBoardTeamId);
  const { data: labels   = [] } = useLabelsByTeamId(boardId, selectedBoardTeamId);

  const [titulo,             setTitulo]             = useState('');
  const [descripcion,        setDescripcion]        = useState('');
  const [prioridad,          setPrioridad]          = useState<Prioridad>('media');
  const [selectedLabelIds,   setSelectedLabelIds]   = useState<number[]>([]);
  const [selectedSubIds,     setSelectedSubIds]     = useState<number[]>([]);
  const [selectedSprintId,   setSelectedSprintId]   = useState<number | null>(null);
  const [assigneeIds,        setAssigneeIds]        = useState<number[]>([]);
  const [estimatedHours,     setEstimatedHours]     = useState<number | null>(null);
  const [userSearch,         setUserSearch]         = useState('');
  const [extraValues,        setExtraValues]        = useState<Record<string, string>>({});
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>([]);
  const [createAttempted,    setCreateAttempted]    = useState(false);

  const subDD      = usePortalDropdown();
  const catDD      = usePortalDropdown();
  const sprintDD   = usePortalDropdown();
  const assigneeDD = usePortalDropdown();

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  useEffect(() => { setSelectedLabelIds([]); setSelectedSubIds([]); }, [selectedBoardTeamId]);

  const triggerStyle = (open: boolean, accentRgb: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
    minHeight: 32, width: '100%', padding: '4px 8px', borderRadius: 6,
    border: `1px solid ${open ? `rgba(${accentRgb},0.45)` : 'var(--border-subtle)'}`,
    background: open ? `rgba(${accentRgb},0.07)` : 'transparent',
    cursor: 'pointer', transition: 'border-color 0.15s, background 0.15s', textAlign: 'left',
  });

  const templateDef   = selectedTemplateId !== null ? getTemplateDefinition(selectedTemplateId, allTemplates) : null;
  const accent        = templateDef?.visual.accentColor ?? 'var(--accent)';
  const assignedUsers = users.filter((u) => assigneeIds.includes(u.User_ID));
  const filteredUsers = users.filter((u) =>
    u.User_Name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.User_Email.toLowerCase().includes(userSearch.toLowerCase())
  );
  const selectedSprint = sprints.find((s) => s.Sprint_ID === selectedSprintId) ?? null;

  function handleToggleAssignee(userId: number) {
    setAssigneeIds((prev) => prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]);
  }

  function selectTeam(id: number) {
    setSelectedBoardTeamId(id);
    setSelectedTemplateId(null);
    setExtraValues({});
  }

  function handleCreate() {
    if (!titulo.trim() || !currentUser || !selectedTemplateId) return;
    if (acceptanceCriteria.length === 0) { setCreateAttempted(true); return; }
    const columnId = columnMap?.['sin_categorizar'] ?? 1;

    if (templateDef) {
      for (const field of templateDef.extraFields) {
        if (field.required && !extraValues[field.key]?.trim()) return;
      }
    }

    createRequest(
      {
        boardId,
        columnId,
        requestedBy:      currentUser.User_ID,
        templateId:       selectedTemplateId,
        titulo:           titulo.trim(),
        descripcion:      descripcion.trim(),
        prioridad,
        equipoIds:        selectedBoardTeamId ? [selectedBoardTeamId] : [],
        subTeamIds:       selectedSubIds,
        labelIds:         selectedLabelIds,
        sprintId:         selectedSprintId,
        estimatedHours,
        parentId,
        requesterTeamId:  null,
        isConfidential:   parentIsConfidential,
        acceptanceCriteria,
      },
      { onSuccess: () => { onCreated?.(); onClose(); } },
    );
  }

  const extraFieldsReady = templateDef?.extraFields.filter((f) => f.required).every((f) => {
    if (f.type === 'checkbox') return extraValues[f.key] === 'true';
    return !!extraValues[f.key]?.trim();
  }) ?? true;

  const isFormReady = !!titulo.trim() && !!currentUser && !!selectedTemplateId &&
    extraFieldsReady && acceptanceCriteria.length > 0;

  const headerTitle = step === 'equipo' ? 'Nueva solicitud' : step === 'template' ? 'Tipo de solicitud' : 'Detalles';

  function HorasInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
    const initH = value != null ? Math.floor(value) : 0;
    const initM = value != null ? Math.round((value % 1) * 60) : 0;
    const [hrs, setHrs] = useState<string>(value != null ? String(initH) : '');
    const [mins, setMins] = useState<string>(value != null ? String(initM) : '');
    function commit(h: string, m: string) {
      const hVal = parseInt(h) || 0; const mVal = parseInt(m) || 0;
      if (h === '' && m === '') { onChange(null); return; }
      onChange(parseFloat((hVal + mVal / 60).toFixed(4)));
    }
    const inputStyle: React.CSSProperties = { width: 52, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 14, fontWeight: 600, fontFamily: 'var(--font-display)', outline: 'none', textAlign: 'center', boxSizing: 'border-box', transition: 'border-color 0.15s' };
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="number" min={0} max={999} placeholder="0" value={hrs} onChange={(e) => setHrs(e.target.value)} onBlur={() => { const m2 = String(Math.min(59, parseInt(mins) || 0)); setMins(m2); commit(hrs, m2); }} style={inputStyle} onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; }} onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }} />
        <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>h</span>
        <input type="number" min={0} max={59} placeholder="00" value={mins} onChange={(e) => setMins(e.target.value)} onBlur={() => { const m2 = String(Math.min(59, parseInt(mins) || 0)); setMins(m2); commit(hrs, m2); }} style={inputStyle} onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)'; }} onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }} />
        <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>m</span>
      </div>
    );
  }

  return (
    <div ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: step === 'form' ? 780 : 680, maxHeight: '90vh', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: parentId ? 'linear-gradient(90deg, transparent, #a78bfa, transparent)' : 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {parentId !== null && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 4, color: '#a78bfa', background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.3)' }}>
              <GitFork size={10} />Sub-solicitud
              {parentTitle && <span style={{ fontWeight: 400, opacity: 0.7 }}>de: {parentTitle.slice(0, 24)}{parentTitle.length > 24 ? '…' : ''}</span>}
            </span>
          )}
          {/* Badge confidencial heredado del padre */}
          {parentIsConfidential && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 4, color: '#fdcb6e', background: 'rgba(253,203,110,0.1)', border: '1px solid rgba(253,203,110,0.35)' }}>
              <ShieldAlert size={10} />Confidencial
            </span>
          )}
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, color: 'var(--txt-muted)' }}>{headerTitle}</span>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {step === 'form' && (
              <button onClick={handleCreate} disabled={!isFormReady || creating}
                style={{ padding: '7px 14px', borderRadius: 6, border: 'none', background: isFormReady ? (parentId !== null ? '#7c3aed' : 'var(--accent)') : 'var(--bg-surface)', color: isFormReady ? 'white' : 'var(--txt-muted)', fontSize: 12, fontWeight: 600, cursor: isFormReady ? 'pointer' : 'not-allowed', opacity: creating ? 0.7 : 1, fontFamily: 'var(--font-display)' }}>
                {creating ? 'Creando…' : parentId !== null ? 'Crear sub-solicitud' : 'Crear solicitud'}
              </button>
            )}
            <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Cuerpo */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column' }}>
          <StepIndicator step={step} />

          {step === 'equipo' && <StepEquipo teams={teams} selectedTeamId={selectedBoardTeamId} onSelect={selectTeam} onNext={() => setStep('template')} />}

          {step === 'template' && (
            <StepTemplate templates={allTemplates} selectedBoardTeamId={selectedBoardTeamId} selectedTemplateId={selectedTemplateId} onSelect={setSelectedTemplateId} onNext={() => setStep('form')} onBack={() => setStep('equipo')} />
          )}

          {step === 'form' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

              {templateDef && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16 }}>{templateDef.visual.icon}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', padding: '3px 10px', borderRadius: 4, color: accent, background: `${accent}10`, border: `1px solid ${accent}30` }}>{templateDef.visual.badgeLabel}</span>
                  <button type="button" onClick={() => setStep('template')} style={{ fontSize: 10, color: 'var(--txt-muted)', background: 'none', border: 'none', cursor: 'pointer', marginLeft: 4, textDecoration: 'underline' }}>cambiar</button>
                </div>
              )}

              {/* Banner confidencial en el form si aplica */}
              {parentIsConfidential && (
                <div style={{ display: 'flex', gap: 10, padding: '11px 14px', borderRadius: 8, background: 'rgba(253,203,110,0.06)', border: '1px solid rgba(253,203,110,0.3)' }}>
                  <ShieldAlert size={14} style={{ color: '#fdcb6e', flexShrink: 0, marginTop: 1 }} />
                  <p style={{ margin: 0, fontSize: 12, color: '#fdcb6e', lineHeight: 1.55 }}>
                    La solicitud padre es confidencial. Esta sub-solicitud heredará esa clasificación.
                  </p>
                </div>
              )}

              <div>
                <FieldLabel>Nombre de la solicitud *</FieldLabel>
                <input autoFocus value={titulo} onChange={(e) => setTitulo(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && isFormReady) handleCreate(); }}
                  placeholder={parentId !== null ? 'Nombre de la sub-solicitud…' : 'Nombre de la solicitud…'}
                  style={{ width: '100%', border: `1px solid ${titulo ? `${accent}40` : 'var(--border-subtle)'}`, background: 'var(--bg-surface)', borderRadius: 8, padding: '12px 14px', fontSize: 18, fontWeight: 600, color: 'var(--txt)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--font-body)', transition: 'border-color 0.15s' }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = parentId !== null ? 'rgba(167,139,250,0.45)' : 'rgba(0,200,255,0.4)'; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                />
              </div>

              <FieldBlock label="Descripción">
                <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Describe el problema con detalle..." rows={3}
                  style={{ width: '100%', minHeight: 80, padding: '10px 14px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 13, lineHeight: 1.6, resize: 'none', outline: 'none', fontFamily: 'var(--font-body)', boxSizing: 'border-box' }} />
              </FieldBlock>

              <div style={{ padding: '16px', borderRadius: 8, border: `1px solid ${acceptanceCriteria.length > 0 ? accent + '30' : 'var(--border-subtle)'}`, background: acceptanceCriteria.length > 0 ? `${accent}05` : 'transparent', transition: 'border-color 0.2s, background 0.2s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: acceptanceCriteria.length > 0 ? accent : 'var(--danger)' }}>Criterios de aceptación *</span>
                  {acceptanceCriteria.length > 0 && <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: `${accent}15`, color: accent, border: `1px solid ${accent}30` }}>{acceptanceCriteria.length}</span>}
                  <span style={{ fontSize: 9, color: 'var(--txt-muted)', marginLeft: 'auto' }}>Mínimo 1 requerido</span>
                </div>
                <AcceptanceCriteriaEditor criteria={acceptanceCriteria} onChange={setAcceptanceCriteria} accent={accent} showError={createAttempted && acceptanceCriteria.length === 0} />
              </div>

              {templateDef && templateDef.extraFields.length > 0 && (
                <div style={{ padding: '16px', borderRadius: 8, border: `1px solid ${accent}20`, background: `${accent}05` }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: accent, marginBottom: 14 }}>{templateDef.nombre} — Datos adicionales</div>
                  {templateDef.extraFields.map((field) => (
                    <ExtraFieldRenderer key={field.key} field={field} value={extraValues[field.key] ?? ''} onChange={(v) => setExtraValues((p) => ({ ...p, [field.key]: v }))} accent={accent} />
                  ))}
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <FieldBlock label="Prioridad">
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(Object.keys(PRIORIDADES) as Prioridad[]).map((p) => {
                      const active = prioridad === p;
                      return <button key={p} onClick={() => setPrioridad(p)} style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '5px 10px', borderRadius: 5, color: PRI_COLOR[p], background: active ? `${PRI_COLOR[p]}15` : 'transparent', border: `1px solid ${active ? `${PRI_COLOR[p]}35` : 'var(--border-subtle)'}`, cursor: 'pointer', transition: 'all 0.12s' }}>{PRIORIDADES[p]}</button>;
                    })}
                  </div>
                </FieldBlock>

                <FieldBlock label="Resolutor">
                  <div style={{ position: 'relative' }}>
                    <button ref={assigneeDD.triggerRef} onClick={() => { assigneeDD.toggle(); setUserSearch(''); }} style={triggerStyle(assigneeDD.open, '124,58,237')}>
                      {assignedUsers.length === 0
                        ? <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1 }}>Sin asignar</span>
                        : assignedUsers.map((u) => (
                            <span key={u.User_ID} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: '#a78bfa', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)' }}>
                              <span style={{ width: 14, height: 14, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials(u.User_Name)}</span>
                              {u.User_Name.split(' ')[0]}
                              <span onMouseDown={(e) => { e.stopPropagation(); handleToggleAssignee(u.User_ID); }} style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6, fontSize: 13 }}>×</span>
                            </span>
                          ))}
                      <ChevDown size={12} style={{ marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0, transform: assigneeDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>
                    {assigneeDD.open && (
                      <PortalPanel rect={assigneeDD.rect}>
                        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border-subtle)' }}>
                          <input autoFocus value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Buscar usuario…" style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 5, padding: '5px 8px', fontSize: 11, color: 'var(--txt)', outline: 'none', boxSizing: 'border-box' }} />
                        </div>
                        <div style={{ maxHeight: 180, overflowY: 'auto' }}>
                          {filteredUsers.map((u) => {
                            const sel = assigneeIds.includes(u.User_ID);
                            return (
                              <DropdownItem key={u.User_ID} selected={sel} onClick={() => handleToggleAssignee(u.User_ID)}>
                                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials(u.User_Name)}</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: 12, fontWeight: sel ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Name}</div>
                                  <div style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Email}</div>
                                </div>
                                {sel && <Checkmark />}
                              </DropdownItem>
                            );
                          })}
                        </div>
                      </PortalPanel>
                    )}
                  </div>
                </FieldBlock>

                <FieldBlock label="Sub-equipo">
                  <div style={{ position: 'relative' }}>
                    <button ref={subDD.triggerRef} onClick={subDD.toggle} disabled={!selectedBoardTeamId} style={{ ...triggerStyle(subDD.open, '0,200,255'), opacity: selectedBoardTeamId ? 1 : 0.5 }}>
                      {selectedSubIds.length === 0
                        ? <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1 }}>Sin sub-equipo</span>
                        : selectedSubIds.map((sid) => { const sub = subTeams.find((s) => s.Sub_Team_ID === sid); if (!sub) return null; return <span key={sid} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: sub.Sub_Team_Color, background: `${sub.Sub_Team_Color}18`, border: `1px solid ${sub.Sub_Team_Color}35` }}>{sub.Sub_Team_Name}<span onMouseDown={(e) => { e.stopPropagation(); setSelectedSubIds((p) => p.filter((x) => x !== sid)); }} style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6, fontSize: 13 }}>×</span></span>; })}
                      <ChevDown size={12} style={{ marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0, transform: subDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>
                    {subDD.open && selectedBoardTeamId && (
                      <PortalPanel rect={subDD.rect}>
                        {subTeams.length === 0 ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>Sin sub-equipos.</div>
                          : subTeams.map((sub) => { const sel = selectedSubIds.includes(sub.Sub_Team_ID); return <DropdownItem key={sub.Sub_Team_ID} selected={sel} onClick={() => setSelectedSubIds((p) => sel ? p.filter((x) => x !== sub.Sub_Team_ID) : [...p, sub.Sub_Team_ID])}><span style={{ width: 8, height: 8, borderRadius: '50%', background: sub.Sub_Team_Color, flexShrink: 0 }} /><span style={{ flex: 1 }}>{sub.Sub_Team_Name}</span>{sel && <Checkmark />}</DropdownItem>; })}
                      </PortalPanel>
                    )}
                  </div>
                </FieldBlock>

                <FieldBlock label="Etiquetas">
                  <div style={{ position: 'relative' }}>
                    <button ref={catDD.triggerRef} onClick={catDD.toggle} disabled={!selectedBoardTeamId} style={{ ...triggerStyle(catDD.open, '0,200,255'), opacity: selectedBoardTeamId ? 1 : 0.5 }}>
                      {selectedLabelIds.length === 0
                        ? <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1 }}>Sin etiquetas</span>
                        : labels.filter((l) => selectedLabelIds.includes(l.Label_ID)).map((label) => <span key={label.Label_ID} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color: label.Label_Color, background: `${label.Label_Color}18`, border: `1px solid ${label.Label_Color}35` }}>{label.Label_Icon && <span>{label.Label_Icon}</span>}{label.Label_Name}<span onMouseDown={(e) => { e.stopPropagation(); setSelectedLabelIds((p) => p.filter((x) => x !== label.Label_ID)); }} style={{ marginLeft: 2, cursor: 'pointer', opacity: 0.6, fontSize: 13 }}>×</span></span>)}
                      <ChevDown size={12} style={{ marginLeft: 'auto', color: 'var(--txt-muted)', flexShrink: 0, transform: catDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>
                    {catDD.open && selectedBoardTeamId && (
                      <PortalPanel rect={catDD.rect}>
                        {labels.length === 0 ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>Sin etiquetas.</div>
                          : labels.map((label) => { const sel = selectedLabelIds.includes(label.Label_ID); return <DropdownItem key={label.Label_ID} selected={sel} onClick={() => setSelectedLabelIds((p) => sel ? p.filter((x) => x !== label.Label_ID) : [...p, label.Label_ID])}>{label.Label_Icon && <span style={{ fontSize: 13 }}>{label.Label_Icon}</span>}<span style={{ flex: 1 }}>{label.Label_Name}</span><span style={{ width: 8, height: 8, borderRadius: '50%', background: label.Label_Color, flexShrink: 0 }} />{sel && <Checkmark />}</DropdownItem>; })}
                      </PortalPanel>
                    )}
                  </div>
                </FieldBlock>

                <FieldBlock label="Sprint">
                  <div style={{ position: 'relative' }}>
                    <button ref={sprintDD.triggerRef} onClick={sprintDD.toggle} style={{ ...triggerStyle(sprintDD.open, '162,155,254'), flexWrap: 'nowrap' }}>
                      {selectedSprint ? <><SprintDot sprint={selectedSprint} /><span style={{ fontSize: 12, color: 'var(--txt)', flex: 1, textAlign: 'left' }}>{selectedSprint.Sprint_Text}</span></> : <span style={{ fontSize: 12, color: 'var(--txt-muted)', flex: 1, textAlign: 'left' }}>Sin sprint</span>}
                      <ChevDown size={12} style={{ color: 'var(--txt-muted)', flexShrink: 0, transform: sprintDD.open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>
                    {sprintDD.open && (
                      <PortalPanel rect={sprintDD.rect}>
                        {sprints.length === 0 ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>No hay sprints.</div>
                          : [...sprints].sort((a, b) => new Date(b.Sprint_Start_Date).getTime() - new Date(a.Sprint_Start_Date).getTime()).map((sp) => {
                              const sel  = selectedSprintId === sp.Sprint_ID;
                              const fmtD = (iso: string) => { const [y, m, d] = iso.split('T')[0].split('-'); return `${d}/${m}/${y.slice(2)}`; };
                              return <DropdownItem key={sp.Sprint_ID} selected={sel} onClick={() => { setSelectedSprintId(sel ? null : sp.Sprint_ID); sprintDD.close(); }}><SprintDot sprint={sp} /><span style={{ flex: 1 }}>{sp.Sprint_Text}</span><span style={{ fontSize: 10, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>{fmtD(sp.Sprint_Start_Date)} → {fmtD(sp.Sprint_End_Date)}</span>{sel && <Checkmark />}</DropdownItem>;
                            })}
                      </PortalPanel>
                    )}
                  </div>
                </FieldBlock>

                <FieldBlock label="Horas estimadas">
                  <HorasInput value={estimatedHours} onChange={setEstimatedHours} />
                </FieldBlock>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-start', paddingTop: 4 }}>
                <button type="button" onClick={() => setStep('template')} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', fontSize: 12, background: 'transparent', cursor: 'pointer' }}>← Volver</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}