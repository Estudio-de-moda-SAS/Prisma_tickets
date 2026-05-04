import { useRef, useEffect } from 'react';
import {
  useFilterStore,
  FIELD_LABELS,
  OPERATOR_LABELS,
  FIELD_OPERATORS,
  FIELD_SELECT_OPTIONS, 
  type FilterField,
  type FilterOperator,
  type FilterCondition,
} from '@/store/filterStore';

/* ============================================================
   Opciones dinámicas que el padre debe proveer
   ============================================================ */
export type FilterDynamicOptions = {
  /** Sub-equipos del board actual (de useSubTeams) */
  subequipo?: { value: string; label: string }[];
  /** Labels disponibles (derivadas de los requests cargados o de useLabelsByTeamId) */
  categoria?: { value: string; label: string }[];
  /** Usuarios asignables (de useUsers) */
  assignee?:  { value: string; label: string }[];
};

/* ============================================================
   Icono SVG inline
   ============================================================ */
function Icon({ path, size = 14 }: { path: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d={path} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
const ICONS = {
  filter: 'M1 3h12M3 7h8M5 11h4',
  plus:   'M7 1v12M1 7h12',
  close:  'M2 2l10 10M12 2L2 12',
  trash:  'M2 4h10M5 4V2h4v2M4 4l.5 8h5l.5-8',
};

/* ============================================================
   Chip de filtro activo (barra superior)
   ============================================================ */
function ActiveFilterChip({
  condition,
  dynamicOptions,
  onRemove,
}: {
  condition:      FilterCondition;
  dynamicOptions: FilterDynamicOptions;
  onRemove:       () => void;
}) {
  const needsValue =
    condition.operator !== 'esta_vacio' && condition.operator !== 'no_esta_vacio';

  const allOptions = getOptions(condition.field, dynamicOptions);

  const valueLabel = (() => {
    if (!needsValue) return '';
    if (allOptions.length) {
      return allOptions.find((o) => o.value === condition.value)?.label ?? condition.value;
    }
    return condition.value;
  })();

  return (
    <div className="filter-chip">
      <span className="filter-chip__field">{FIELD_LABELS[condition.field]}</span>
      <span className="filter-chip__sep" />
      <span className="filter-chip__op">{OPERATOR_LABELS[condition.operator]}</span>
      {needsValue && valueLabel && (
        <>
          <span className="filter-chip__sep" />
          <span className="filter-chip__val">{valueLabel}</span>
        </>
      )}
      <button className="filter-chip__remove" onClick={onRemove} title="Eliminar filtro">
        <Icon path={ICONS.close} size={10} />
      </button>
    </div>
  );
}

/* ============================================================
   Utilidad: devuelve las opciones del campo
   (estáticas para enums, dinámicas para el resto)
   ============================================================ */
function getOptions(
  field: FilterField,
  dynamic: FilterDynamicOptions,
): { value: string; label: string }[] {
  return (
    FIELD_SELECT_OPTIONS[field] ??
    dynamic[field as keyof FilterDynamicOptions] ??
    []
  );
}

/* ============================================================
   Fila de condición dentro del panel
   ============================================================ */
function ConditionRow({
  boardId,
  condition,
  index,
  conjunction,
  isLast,
  dynamicOptions,
}: {
  boardId:        string;
  condition:      FilterCondition;
  index:          number;
  conjunction:    'AND' | 'OR';
  isLast:         boolean;
  dynamicOptions: FilterDynamicOptions;
}) {
  const { updateCondition, removeCondition, setConjunction } = useFilterStore();

  const needsValue  = condition.operator !== 'esta_vacio' && condition.operator !== 'no_esta_vacio';
  const availableOps = FIELD_OPERATORS[condition.field];
  const options      = getOptions(condition.field, dynamicOptions);
  const hasOptions   = options.length > 0;

  function handleFieldChange(field: FilterField) {
    updateCondition(boardId, condition.id, {
      field,
      operator: FIELD_OPERATORS[field][0],
      value:    '',
    });
  }

  return (
    <div className={`filter-row${!isLast ? ' filter-row--divided' : ''}`}>

      {/* Conjunción */}
      <div className="filter-row__conj">
        {index === 0 ? (
          <span className="filter-row__where">donde</span>
        ) : index === 1 ? (
          <button
            className="filter-row__conj-btn"
            onClick={() => setConjunction(boardId, conjunction === 'AND' ? 'OR' : 'AND')}
            title="Alternar AND / OR"
          >
            {conjunction}
          </button>
        ) : (
          <span className="filter-row__conj-fixed">{conjunction}</span>
        )}
      </div>

      {/* Campo */}
      <div className="filter-select-wrap">
        <select
          className="filter-select filter-select--field"
          value={condition.field}
          onChange={(e) => handleFieldChange(e.target.value as FilterField)}
        >
          {(Object.keys(FIELD_LABELS) as FilterField[]).map((f) => (
            <option key={f} value={f}>{FIELD_LABELS[f]}</option>
          ))}
        </select>
      </div>

      {/* Operador */}
      <div className="filter-select-wrap">
        <select
          className="filter-select filter-select--operator"
          value={condition.operator}
          onChange={(e) =>
            updateCondition(boardId, condition.id, {
              operator: e.target.value as FilterOperator,
              value:    '',
            })
          }
        >
          {availableOps.map((op) => (
            <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
          ))}
        </select>
      </div>

      {/* Valor */}
      {needsValue && (
        <div className="filter-value-wrap">
          {hasOptions ? (
            /* Select con opciones (enum o dinámicas) */
            <select
              className="filter-select filter-select--value"
              value={condition.value}
              onChange={(e) => updateCondition(boardId, condition.id, { value: e.target.value })}
            >
              <option value="">Seleccionar…</option>
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : (
            /* Input de texto libre */
            <input
              className="filter-input"
              type="text"
              placeholder="Introduce un valor…"
              value={condition.value}
              onChange={(e) => updateCondition(boardId, condition.id, { value: e.target.value })}
            />
          )}
        </div>
      )}

      {/* Eliminar fila */}
      <button
        className="filter-row__delete"
        onClick={() => removeCondition(boardId, condition.id)}
        title="Eliminar condición"
      >
        <Icon path={ICONS.close} size={12} />
      </button>
    </div>
  );
}

/* ============================================================
   Panel desplegable
   ============================================================ */
function FilterPanel({
  boardId,
  dynamicOptions,
  onClose,
}: {
  boardId:        string;
  dynamicOptions: FilterDynamicOptions;
  onClose:        () => void;
}) {
  const { getConditions, getConjunction, addCondition, clearAll } = useFilterStore();
  const conditions  = getConditions(boardId);
  const conjunction = getConjunction(boardId);
  const ref         = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        const trigger = document.querySelector('.filter-trigger');
        if (trigger?.contains(e.target as Node)) return;
        onClose();
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [onClose]);

  return (
    <div className="filter-panel" ref={ref}>
      {/* Header */}
      <div className="filter-panel__header">
        <div className="filter-panel__title-group">
          <span className="filter-panel__dot" />
          <span className="filter-panel__title">Filtros</span>
          {conditions.length > 0 && (
            <span className="filter-panel__count">{conditions.length}</span>
          )}
        </div>
        {conditions.length > 0 && (
          <button className="filter-panel__clear" onClick={() => clearAll(boardId)}>
            <Icon path={ICONS.trash} size={12} />
            Limpiar
          </button>
        )}
      </div>

      <div className="filter-panel__divider" />

      {/* Condiciones */}
      {conditions.length === 0 ? (
        <div className="filter-panel__empty">
          <span className="filter-panel__empty-icon">◈</span>
          <p>Sin filtros activos — se muestran todos los tickets</p>
        </div>
      ) : (
        <div className="filter-panel__conditions">
          {conditions.map((cond, i) => (
            <ConditionRow
              key={cond.id}
              boardId={boardId}
              condition={cond}
              index={i}
              conjunction={conjunction}
              isLast={i === conditions.length - 1}
              dynamicOptions={dynamicOptions}
            />
          ))}
        </div>
      )}

      {/* Añadir */}
      <button className="filter-panel__add" onClick={() => addCondition(boardId)}>
        <Icon path={ICONS.plus} size={11} />
        Añadir condición
      </button>
    </div>
  );
}

/* ============================================================
   Componente principal exportado
   ============================================================ */
export function BoardFilters({
  boardId,
  dynamicOptions = {},
}: {
  boardId:         string;
  dynamicOptions?: FilterDynamicOptions;
}) {
  const { getConditions, isOpen, togglePanel, setOpen, removeCondition, activeCount } =
    useFilterStore();

  const conditions = getConditions(boardId);
  const panelOpen  = isOpen(boardId);
  const count      = activeCount(boardId);

  return (
    <div className="board-filters">
      {/* Chips activos */}
      {conditions.length > 0 && (
        <div className="board-filters__chips">
          {conditions.map((c) => (
            <ActiveFilterChip
              key={c.id}
              condition={c}
              dynamicOptions={dynamicOptions}
              onRemove={() => removeCondition(boardId, c.id)}
            />
          ))}
        </div>
      )}

      {/* Trigger */}
      <button
        className={`filter-trigger${count > 0 ? ' filter-trigger--active' : ''}`}
        onClick={() => togglePanel(boardId)}
      >
        <Icon path={ICONS.filter} size={13} />
        Filtro
        {count > 0 && <span className="filter-trigger__badge">{count}</span>}
      </button>

      {/* Panel */}
      {panelOpen && (
        <FilterPanel
          boardId={boardId}
          dynamicOptions={dynamicOptions}
          onClose={() => setOpen(boardId, false)}
        />
      )}
    </div>
  );
}