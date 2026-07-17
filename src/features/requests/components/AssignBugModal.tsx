// src/features/requests/components/AssignBugModal.tsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Plus, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import { useBoardTeams, useLabelsByTeamId } from '@/features/requests/hooks/useBoardMetadata';
import { useSprints } from '@/features/requests/hooks/useSprints';
import { useSubTeams } from '@/features/requests/hooks/useSubTeams';
import { useSubTeamMembersGrouped } from '@/features/requests/hooks/useSubTeamMembers';

type BugLite = { Report_ID: string; Title: string; Severity: 'bajo' | 'medio' | 'alto' | 'critico' | null};

const SEV_TO_PRIORITY: Record<'bajo' | 'medio' | 'alto' | 'critico', { label: string; color: string; score: number }> = {  bajo:    { label: 'Baja',    color: '#b2bec3', score: 1 },
  medio:   { label: 'Media',   color: '#74b9ff', score: 2 },
  alto:    { label: 'Alta',    color: '#fdcb6e', score: 4 },
  critico: { label: 'Crítica', color: '#ff4757', score: 6 },
};

function initials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
}

export function AssignBugModal({ bug, assignedBy, onClose, onAssigned }: {
  bug: BugLite;
  assignedBy: number;
  onClose: () => void;
  onAssigned: () => void;
}) {
  const boardId = config.DEFAULT_BOARD_ID;
  const { data: teams = [] }   = useBoardTeams(boardId);
  const { data: sprints = [] } = useSprints();

  const [teamId,     setTeamId]     = useState<number | null>(null);
  const [resolverId, setResolverId] = useState<number | null>(null);
  const [sprintId,   setSprintId]   = useState<number | null>(null);
  const [estimatedHours, setEstimatedHours] = useState<number | null>(null);
const [score, setScore] = useState<number | null>(null);
  const [labelIds, setLabelIds] = useState<number[]>([]);
  const [acceptanceCriteria, setAcceptanceCriteria] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const { data: subTeams = [] } = useSubTeams(teamId);
  const groupedMembers = useSubTeamMembersGrouped(subTeams);
  const { data: labels = [] } = useLabelsByTeamId(boardId, teamId);

  const visibleTeams = teams.filter((t: any) => t.Board_Team_Is_Active !== false && !t.Board_Team_Is_External);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  useEffect(() => { setResolverId(null); setLabelIds([]); }, [teamId]);

  const selectableSprints = (() => {
    const now = new Date();
    return sprints
      .filter((sp: any) => {
        if (!sp.Sprint_Start_Date || !sp.Sprint_End_Date) return false;
        const end = new Date(sp.Sprint_End_Date);
        if (Number.isNaN(end.getTime())) return false;
        return now <= end;
      })
      .sort((a: any, b: any) => new Date(a.Sprint_Start_Date).getTime() - new Date(b.Sprint_Start_Date).getTime());
  })();

  const canSubmit = teamId !== null && resolverId !== null && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true); setError(null);
    try {
      const res = await apiClient.call<{ ok: boolean; requestId: string }>('assignBugToRequest', {
        reportId: bug.Report_ID, boardId, teamId, resolverId, assignedBy, sprintId, estimatedHours, score, labelIds,
      });
      // Criterios: se persisten contra el ticket recién creado (mismo patrón que useCreateRequest)
      if (acceptanceCriteria.length > 0 && res?.requestId) {
        await apiClient.call('createAcceptanceCriteria', { requestId: res.requestId, criteria: acceptanceCriteria });
      }
      onAssigned();
    } catch (e) {
      setError((e as Error).message);
      setSubmitting(false);
    }
  }

  return createPortal(
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 520, maxHeight: '88vh', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, #ff4757, transparent)' }} />

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <span style={{ fontSize: 18 }}>🚨</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)' }}>Asignar y crear ticket</div>
            <div style={{ fontSize: 11, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bug.Title}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Prioridad del ticket — pre-cargada desde la severidad, editable por el admin */}
          <Field label="Prioridad del ticket">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
{(Object.keys(SEV_TO_PRIORITY) as ('bajo' | 'medio' | 'alto' | 'critico')[]).map((k) => {                const opt    = SEV_TO_PRIORITY[k];
                const active = score === opt.score;
                return (
                  <button key={k} type="button" onClick={() => setScore(opt.score)}
                    style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '6px 12px', borderRadius: 5, cursor: 'pointer', transition: 'all 0.12s',
                      color: opt.color,
                      background: active ? `${opt.color}18` : 'transparent',
                      border: `1px solid ${active ? `${opt.color}45` : 'var(--border-subtle)'}` }}>
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <span style={{ display: 'block', marginTop: 6, fontSize: 10, color: score === null ? '#ff4757' : 'var(--txt-muted)' }}>
              {score === null ? 'Elegí una prioridad para poder crear el ticket.' : 'Definí la prioridad según el impacto real del fallo.'}
            </span>
          </Field>

          {/* Categorías (dependen del equipo) */}
          {teamId !== null && (
            <Field label="Categorías">
              {labels.length === 0 ? (
                <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>Este equipo no tiene categorías.</span>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {labels.map((l: any) => {
                    const sel = labelIds.includes(l.Label_ID);
                    return (
                      <button key={l.Label_ID} type="button"
                        onClick={() => setLabelIds((p) => sel ? p.filter((x) => x !== l.Label_ID) : [...p, l.Label_ID])}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, padding: '5px 10px', borderRadius: 5, cursor: 'pointer',
                          color: sel ? l.Label_Color : 'var(--txt-muted)',
                          background: sel ? `${l.Label_Color}18` : 'transparent',
                          border: `1px solid ${sel ? `${l.Label_Color}45` : 'var(--border-subtle)'}` }}>
                        {l.Label_Icon && <span>{l.Label_Icon}</span>}
                        {l.Label_Name}
                      </button>
                    );
                  })}
                </div>
              )}
            </Field>
          )}

          {/* Criterios de aceptación (opcional) */}
          <Field label="Criterios de aceptación">
            <AcceptanceCriteriaEditor criteria={acceptanceCriteria} onChange={setAcceptanceCriteria} accent="var(--accent)" />
          </Field>

          {/* Equipo */}
          <Field label="Equipo que atiende *">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {visibleTeams.map((t: any) => {
                const sel = teamId === t.Board_Team_ID;
                return (
                  <button key={t.Board_Team_ID} type="button" onClick={() => setTeamId(t.Board_Team_ID)}
                    style={{ padding: '10px 12px', borderRadius: 8, textAlign: 'left', cursor: 'pointer',
                      border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border-subtle)'}`,
                      background: sel ? 'rgba(0,200,255,0.06)' : 'var(--bg-surface)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: sel ? 'var(--accent)' : 'var(--txt)' }}>{t.Board_Team_Name}</div>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--txt-muted)', marginTop: 2 }}>{t.Board_Team_Code}</div>
                  </button>
                );
              })}
            </div>
          </Field>

          {/* Resolutor (según el equipo elegido) */}
          {teamId !== null && (
            <Field label="Resolutor *">
              <div style={{ borderRadius: 8, border: '1px solid var(--border-subtle)', overflow: 'hidden', maxHeight: 240, overflowY: 'auto' }}>
                {groupedMembers.length === 0 ? (
                  <div style={{ padding: '10px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>Este equipo no tiene sub-equipos configurados.</div>
                ) : (
                  groupedMembers.map(({ subTeam, members, isLoading }: any) => (
                    <div key={subTeam.Sub_Team_ID}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: subTeam.Sub_Team_Color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt)' }}>{subTeam.Sub_Team_Name}</span>
                      </div>
                      {isLoading && <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>Cargando…</div>}
                      {!isLoading && members.length === 0 && <div style={{ padding: '8px 16px', fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic' }}>Sin integrantes.</div>}
                      {members.map((u: any) => {
                        const sel = resolverId === u.User_ID;
                        return (
                          <div key={u.User_ID} onClick={() => setResolverId(u.User_ID)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', background: sel ? 'rgba(0,200,255,0.06)' : 'transparent' }}>
                            <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'white', flexShrink: 0 }}>{initials(u.User_Name)}</div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 12, fontWeight: sel ? 600 : 400, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Name}</div>
                              <div style={{ fontSize: 10, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.User_Email}</div>
                            </div>
                            {sel && <svg width="12" height="12" viewBox="0 0 11 11" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}><path d="M1.5 5.5l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </Field>
          )}

{/* Sprint */}
          <Field label="Sprint">
            <select value={sprintId ?? ''} onChange={(e) => setSprintId(e.target.value ? Number(e.target.value) : null)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: sprintId ? 'var(--txt)' : 'var(--txt-muted)', fontSize: 12, outline: 'none', cursor: 'pointer' }}>
              <option value="">Sin sprint</option>
              {selectableSprints.map((sp: any) => <option key={sp.Sprint_ID} value={sp.Sprint_ID}>{sp.Sprint_Text}</option>)}
            </select>
          </Field>

          {/* Horas estimadas (opcional) */}
          <Field label="Horas estimadas (opcional)">
            <HorasInput value={estimatedHours} onChange={setEstimatedHours} />
          </Field>

          {error && <div style={{ fontSize: 11, color: '#ff4757', padding: '8px 12px', borderRadius: 7, background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)' }}>{error}</div>}
        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', fontSize: 12, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={!canSubmit}
            style={{ padding: '8px 18px', borderRadius: 6, border: 'none', background: canSubmit ? 'var(--accent)' : 'var(--bg-surface)', color: canSubmit ? '#000' : 'var(--txt-muted)', fontSize: 12, fontWeight: 700, cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
            {submitting ? 'Creando…' : 'Asignar y crear'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 8 }}>{label}</span>
      {children}
    </div>
  );
}

function AutoTextarea({ value, onChange, style }: { value: string; onChange: (v: string) => void; style?: React.CSSProperties }) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '1px';
    el.style.height = el.scrollHeight + 'px';
  });
  return <textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={1} style={{ resize: 'none', overflow: 'hidden', ...style }} />;
}

function AcceptanceCriteriaEditor({ criteria, onChange, accent }: { criteria: string[]; onChange: (c: string[]) => void; accent: string }) {
  const [newText, setNewText] = useState('');
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  function add() {
    const t = newText.trim();
    if (!t) return;
    onChange([...criteria, t]); setNewText(''); inputRef.current?.focus();
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {criteria.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {criteria.map((c, idx) => (
            <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 10px', borderRadius: 6, background: `${accent}08`, border: `1px solid ${accent}20` }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, background: `${accent}15`, border: `1px solid ${accent}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2" stroke={accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </div>
              <AutoTextarea value={c} onChange={(v) => { const next = [...criteria]; next[idx] = v; onChange(next); }}
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 12, color: 'var(--txt)', lineHeight: 1.5, padding: 0 }} />
              <button type="button" onClick={() => onChange(criteria.filter((_, i) => i !== idx))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 2, display: 'flex', alignItems: 'center', opacity: 0.5, flexShrink: 0, marginTop: 2 }}>
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <textarea ref={inputRef} value={newText} rows={1}
          onChange={(e) => setNewText(e.target.value)}
          onInput={(e) => { const t = e.currentTarget; t.style.height = '1px'; t.style.height = t.scrollHeight + 'px'; }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); add(); } }}
          placeholder="Ej: El fallo ya no se reproduce en la pantalla reportada…"
          style={{ flex: 1, padding: '7px 11px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 12, outline: 'none', boxSizing: 'border-box', resize: 'none', overflow: 'hidden', lineHeight: 1.5 }} />
        <button type="button" onClick={add} disabled={!newText.trim()}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 6, border: `1px solid ${newText.trim() ? 'var(--accent)' : 'var(--border-subtle)'}`, background: newText.trim() ? 'rgba(0,200,255,0.12)' : 'transparent', color: newText.trim() ? 'var(--accent)' : 'var(--txt-muted)', fontSize: 11, fontWeight: 700, cursor: newText.trim() ? 'pointer' : 'not-allowed' }}>
          <Plus size={12} /> Añadir
        </button>
      </div>
    </div>
  );
}

function HorasInput({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {  const initH = value != null ? Math.floor(value) : 0;
  const initM = value != null ? Math.round((value % 1) * 60) : 0;
  const [hrs, setHrs]   = useState<string>(value != null ? String(initH) : '');
  const [mins, setMins] = useState<string>(value != null ? String(initM) : '');
  function commit(h: string, m: string) {
    const hVal = parseInt(h) || 0; const mVal = parseInt(m) || 0;
    if (h === '' && m === '') { onChange(null); return; }
    onChange(parseFloat((hVal + mVal / 60).toFixed(4)));
  }
  const inputStyle: React.CSSProperties = { width: 52, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 14, fontWeight: 600, outline: 'none', textAlign: 'center', boxSizing: 'border-box' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input type="number" min={0} max={999} placeholder="0" value={hrs} onChange={(e) => setHrs(e.target.value)} onBlur={() => { const m2 = String(Math.min(59, parseInt(mins) || 0)); setMins(m2); commit(hrs, m2); }} style={inputStyle} />
      <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>h</span>
      <input type="number" min={0} max={59} placeholder="00" value={mins} onChange={(e) => setMins(e.target.value)} onBlur={() => { const m2 = String(Math.min(59, parseInt(mins) || 0)); setMins(m2); commit(hrs, m2); }} style={inputStyle} />
      <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>m</span>
    </div>
  );
}