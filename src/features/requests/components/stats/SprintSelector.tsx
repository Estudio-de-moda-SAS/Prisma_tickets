import { useCallback, useRef, useState } from 'react';
import { Target, ChevronDown, Check, X } from 'lucide-react';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import { fmtDate, getSprintNumber, getSprintYear } from './statsFormat';
import { useClickOutside } from './useClickOutside';

/** Orden del menú: con fecha arriba (cronológico), históricos abajo (por número). */
function compareSprints(a: Sprint, b: Sprint): number {
  const aHasDates = !!a.Sprint_Start_Date && !!a.Sprint_End_Date;
  const bHasDates = !!b.Sprint_Start_Date && !!b.Sprint_End_Date;
  // 1) Los que tienen fecha van arriba; los históricos siempre abajo
  if (aHasDates !== bHasDates) return aHasDates ? -1 : 1;
  // 2) Ambos con fecha → cronológico
  if (aHasDates && bHasDates) {
    return a.Sprint_Start_Date!.localeCompare(b.Sprint_Start_Date!);
  }
  // 3) Ambos históricos → por número de sprint del nombre
  const na = getSprintNumber(a);
  const nb = getSprintNumber(b);
  if (na !== null && nb !== null) return na - nb;
  return a.Sprint_ID - b.Sprint_ID; // último recurso
}

function YearPicker({ years, selected, onChange }: { years: number[]; selected: number; onChange: (y: number) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '8px 10px', borderBottom: '1px solid var(--border-subtle)', flexWrap: 'wrap' }}>
      {years.map(yr => (
        <button
          key={yr}
          onClick={() => onChange(yr)}
          style={{
            padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
            fontWeight: selected === yr ? 700 : 400,
            border: `1px solid ${selected === yr ? 'var(--accent)' : 'var(--border-subtle)'}`,
            background: selected === yr ? 'rgba(0,200,255,0.1)' : 'transparent',
            color: selected === yr ? 'var(--accent)' : 'var(--txt-muted)',
            transition: 'all 0.12s',
          }}
        >
          {yr}
        </button>
      ))}
    </div>
  );
}

function SprintOption({ sprint: s, isSelected, onToggle }: { sprint: Sprint; isSelected: boolean; onToggle: () => void }) {
  const hasDates = !!s.Sprint_Start_Date && !!s.Sprint_End_Date;
  return (
    <button
      className={['sprint-selector__item', isSelected ? 'sprint-selector__item--active' : ''].join(' ')}
      onClick={onToggle}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        <span style={{
          width: 12, height: 12, borderRadius: 3,
          border: `1.5px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
          background: isSelected ? 'var(--accent)' : 'transparent',
          flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s, border-color 0.15s',
        }}>
          {isSelected && <Check size={8} style={{ color: 'var(--bg)' }} />}
        </span>
        {s.Sprint_Text}
      </span>
      <span className="sprint-selector__dates">
        {hasDates
          ? <>{fmtDate(new Date(s.Sprint_Start_Date!))} → {fmtDate(new Date(s.Sprint_End_Date!))}</>
          : <span style={{ color: '#7f77dd', fontWeight: 700 }}>Histórico</span>
        }
      </span>
    </button>
  );
}

/** Selector multi-sprint filtrado por año. */
export function SprintSelector({ sprints, selectedIds, onChange, selectedYear, onYearChange, availableYears }: {
  sprints:        Sprint[];
  selectedIds:    number[];
  onChange:       (ids: number[]) => void;
  selectedYear:   number;
  onYearChange:   (year: number) => void;
  availableYears: number[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutside(ref, open, useCallback(() => setOpen(false), []));

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id]);
  };

  // Solo sprints del año seleccionado
  const sprintsDelAnyo = sprints.filter(s => getSprintYear(s) === selectedYear);

  const label =
    selectedIds.length === 0
      ? 'Todos los sprints'
      : selectedIds.length === 1
      ? (sprints.find(s => s.Sprint_ID === selectedIds[0])?.Sprint_Text ?? 'Sprint')
      : `${selectedIds.length} sprints`;

  return (
    <div className="sprint-selector" ref={ref}>
      <button className="sprint-selector__btn" onClick={() => setOpen(o => !o)}>
        <Target size={12} />
        <span>{label}</span>
        {selectedIds.length > 0 && (
          <span
            role="button"
            tabIndex={0}
            className="sprint-selector__clear-btn"
            title="Ver todos los sprints"
            onClick={e => { e.stopPropagation(); onChange([]); }}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onChange([]); }
            }}
          >
            <X size={9} />
          </span>
        )}
        <ChevronDown size={11} style={{ marginLeft: 'auto', opacity: 0.5 }} />
      </button>

      {open && (
        <div className="sprint-selector__menu">
          {availableYears.length > 1 && (
            <YearPicker years={availableYears} selected={selectedYear} onChange={onYearChange} />
          )}

          <button
            className={['sprint-selector__item', selectedIds.length === 0 ? 'sprint-selector__item--active' : ''].join(' ')}
            onClick={() => onChange([])}
          >
            Todos los sprints
          </button>

          {sprintsDelAnyo.length === 0
            ? <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>Sin sprints en {selectedYear}.</div>
            : [...sprintsDelAnyo].sort(compareSprints).map(s => (
                <SprintOption
                  key={s.Sprint_ID}
                  sprint={s}
                  isSelected={selectedIds.includes(s.Sprint_ID)}
                  onToggle={() => toggle(s.Sprint_ID)}
                />
              ))
          }
        </div>
      )}
    </div>
  );
}
