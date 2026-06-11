import { useState } from 'react';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import { AddBtn, SmBtn, FieldLabel, FormActions } from '../ConfigPanel';

export function SprintList({ sprints, onAdd, onUpdate, onRemove }: {
  sprints: Sprint[];
  onAdd: (s: { text: string; startDate: string; endDate: string }) => void;
  onUpdate: (id: number, s: { text: string; startDate: string; endDate: string }) => void;
  onRemove: (id: number) => void;
}) {
  const [editId,      setEditId]      = useState<number | null>(null);
  const [showNew,     setShowNew]     = useState(false);
  const [showOthers,  setShowOthers]  = useState(false);

  const currentYear                    = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

  const now = new Date();
  const statusOrder = (sp: Sprint) => {
    const start = new Date(sp.Sprint_Start_Date); const end = new Date(sp.Sprint_End_Date);
    if (now >= start && now <= end) return 0; if (now < start) return 1; return 2;
  };

  // ── Años disponibles (desc), siempre incluye el año actual ──
  const allYears = [
    ...new Set(sprints.map((sp) => new Date(sp.Sprint_Start_Date).getFullYear())),
  ].sort((a, b) => b - a);
  if (!allYears.includes(currentYear)) allYears.unshift(currentYear);

  // ── Sprints del año seleccionado ──
  const yearSprints = sprints.filter(
    (sp) => new Date(sp.Sprint_Start_Date).getFullYear() === selectedYear,
  );
  const sorted = [...yearSprints].sort((a, b) => {
    const diff = statusOrder(a) - statusOrder(b);
    if (diff !== 0) return diff;
    return new Date(a.Sprint_Start_Date).getTime() - new Date(b.Sprint_Start_Date).getTime();
  });

  // ── Sprints de otros años ──
  const otherSprints = sprints
    .filter((sp) => new Date(sp.Sprint_Start_Date).getFullYear() !== selectedYear)
    .sort((a, b) => new Date(b.Sprint_Start_Date).getTime() - new Date(a.Sprint_Start_Date).getTime());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

      {/* ── Filtro por año (solo si hay más de uno) ── */}
      {allYears.length > 1 && (
        <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
          {allYears.map((year) => (
            <button
              key={year}
              onClick={() => setSelectedYear(year)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                fontWeight: selectedYear === year ? 700 : 400,
                border: `1px solid ${selectedYear === year ? 'rgba(0,200,255,0.4)' : 'var(--border-subtle)'}`,
                background: selectedYear === year ? 'rgba(0,200,255,0.08)' : 'transparent',
                color: selectedYear === year ? 'var(--accent)' : 'var(--txt-muted)',
                transition: 'all 0.12s',
              }}
            >
              {year}
              {year === currentYear && (
                <span style={{ marginLeft: 4, fontSize: 7, opacity: 0.55 }}>●</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* ── Lista del año seleccionado ── */}
      {sorted.length === 0 && !showNew && (
        <div className="cpanel__empty">
          <span style={{ fontSize: 28, opacity: 0.4 }}>⚡</span>
          <p>No hay sprints en {selectedYear}.</p>
        </div>
      )}
      {sorted.map((sp) => editId === sp.Sprint_ID
        ? <SprintForm key={sp.Sprint_ID} initial={{ text: sp.Sprint_Text, startDate: sp.Sprint_Start_Date, endDate: sp.Sprint_End_Date }} onSave={(d) => { onUpdate(sp.Sprint_ID, d); setEditId(null); }} onCancel={() => setEditId(null)} />
        : <SprintRow key={sp.Sprint_ID} sprint={sp} onEdit={() => { setShowNew(false); setEditId(sp.Sprint_ID); }} onRemove={() => onRemove(sp.Sprint_ID)} />
      )}

      {showNew
        ? <SprintForm onSave={(d) => { onAdd(d); setShowNew(false); }} onCancel={() => setShowNew(false)} />
        : <AddBtn label="Nuevo sprint" onClick={() => { setEditId(null); setShowNew(true); }} />
      }

      {/* ── Otros años (colapsable) ── */}
      {otherSprints.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setShowOthers((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              padding: '5px 2px', background: 'transparent', border: 'none', cursor: 'pointer',
            }}
          >
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase',
              color: 'var(--txt-muted)', opacity: 0.55, flexShrink: 0,
            }}>
              Otros años ({otherSprints.length})
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="var(--txt-muted)"
              strokeWidth="1.6" strokeLinecap="round"
              style={{ flexShrink: 0, opacity: 0.45, transform: showOthers ? 'rotate(180deg)' : undefined, transition: 'transform 0.18s' }}>
              <path d="M1 3l3.5 3.5L8 3"/>
            </svg>
          </button>
          {showOthers && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {otherSprints.map((sp) => editId === sp.Sprint_ID
                ? <SprintForm key={sp.Sprint_ID} initial={{ text: sp.Sprint_Text, startDate: sp.Sprint_Start_Date, endDate: sp.Sprint_End_Date }} onSave={(d) => { onUpdate(sp.Sprint_ID, d); setEditId(null); }} onCancel={() => setEditId(null)} />
                : <SprintRow key={sp.Sprint_ID} sprint={sp} onEdit={() => { setShowNew(false); setEditId(sp.Sprint_ID); }} onRemove={() => onRemove(sp.Sprint_ID)} />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
function SprintRow({ sprint, onEdit, onRemove }: { sprint: Sprint; onEdit: () => void; onRemove: () => void }) {
  const [hov, setHov] = useState(false);
  const now = new Date(); const start = new Date(sprint.Sprint_Start_Date); const end = new Date(sprint.Sprint_End_Date);
  const isActive = now >= start && now <= end; const isPast = now > end;
  const statusColor = isActive ? '#00e5a0' : isPast ? '#b2bec3' : '#fdcb6e';
  const statusLabel = isActive ? 'activo' : isPast ? 'pasado' : 'futuro';
  const fmt = (iso: string) => { const [y, m, d] = iso.split('T')[0].split('-'); return `${d}/${m}/${y.slice(2)}`; };
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '8px 12px', borderRadius: 8, border: `1px solid ${hov ? 'var(--border)' : 'var(--border-subtle)'}`, background: hov ? 'var(--bg-hover)' : 'var(--bg-surface)', transition: 'all 0.12s' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--txt)' }}>{sprint.Sprint_Text}</span>
        <span style={{ fontSize: 9, color: statusColor, textTransform: 'uppercase', letterSpacing: 1 }}>{statusLabel}</span>
        <div style={{ display: 'flex', gap: 3, opacity: hov ? 1 : 0, transition: 'opacity 0.12s' }}>
          <SmBtn color="#00c8ff" onClick={onEdit} title="Editar"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/></svg></SmBtn>
          <SmBtn color="#ff4757" onClick={onRemove} title="Eliminar"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/></svg></SmBtn>
        </div>
      </div>
      <span style={{ fontSize: 10, color: 'var(--txt-muted)', paddingLeft: 15 }}>{fmt(sprint.Sprint_Start_Date)} → {fmt(sprint.Sprint_End_Date)}</span>
    </div>
  );
}

function SprintForm({ initial, onSave, onCancel }: {
  initial?: { text: string; startDate: string; endDate: string };
  onSave: (d: { text: string; startDate: string; endDate: string }) => void; onCancel: () => void;
}) {
  const [text,      setText]  = useState(initial?.text      ?? '');
  const [startDate, setStart] = useState(initial?.startDate ?? '');
  const [endDate,   setEnd]   = useState(initial?.endDate   ?? '');
  const dateError = endDate && startDate && endDate < startDate;
  const canSave   = !!(text.trim() && startDate && endDate && !dateError);
  return (
    <div className="cpop-form">
      <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') onCancel(); }} placeholder="Nombre del sprint..." className="cpop-input" />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div><FieldLabel>Inicio</FieldLabel><input type="date" value={startDate} onChange={(e) => setStart(e.target.value)} className="cpop-input cpop-input--date" style={{ width: '100%', boxSizing: 'border-box', paddingRight: 8 }} /></div>
        <div><FieldLabel>Fin</FieldLabel><input type="date" value={endDate} min={startDate} onChange={(e) => setEnd(e.target.value)} className="cpop-input cpop-input--date" style={{ width: '100%', boxSizing: 'border-box', paddingRight: 8 }} /></div>
      </div>
      {dateError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 6, background: '#ff475715', border: '1px solid #ff475740' }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ff4757" strokeWidth="1.3"/><path d="M6 3.5v3M6 8.5v.5" stroke="#ff4757" strokeWidth="1.4" strokeLinecap="round"/></svg>
          <span style={{ fontSize: 10, color: '#ff4757' }}>La fecha fin debe ser posterior al inicio.</span>
        </div>
      )}
      <FormActions canSave={canSave} onSave={() => canSave && onSave({ text: text.trim(), startDate, endDate })} onCancel={onCancel} />
    </div>
  );
}
