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
   Chip de filtro activo (barra superior)
   ============================================================ */
function ActiveFilterChip({
  condition,
  onRemove,
}: {
  condition: FilterCondition;
  onRemove: () => void;
}) {
  const needsValue =
    condition.operator !== 'esta_vacio' && condition.operator !== 'no_esta_vacio';

  const valueLabel = (() => {
    if (!needsValue) return '';
    const opts = FIELD_SELECT_OPTIONS[condition.field];
    if (opts) {
      const found = opts.find((o) => o.value === condition.value);
      return found?.label ?? condition.value;
    }
    return condition.value;
  })();

  return (
    <div className="filter-chip">
      <span className="filter-chip__field">{FIELD_LABELS[condition.field]}</span>
      <span className="filter-chip__op">{OPERATOR_LABELS[condition.operator]}</span>
      {needsValue && valueLabel && (
        <span className="filter-chip__val">{valueLabel}</span>
      )}
      <button className="filter-chip__remove" onClick={onRemove} title="Eliminar filtro">
        ×
      </button>
    </div>
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
}: {
  boardId:     string;
  condition:   FilterCondition;
  index:       number;
  conjunction: 'AND' | 'OR';
  totalConditions: number;
}) {
  const { updateCondition, removeCondition, setConjunction } = useFilterStore();
  const needsValue    = condition.operator !== 'esta_vacio' && condition.operator !== 'no_esta_vacio';
  const selectOptions = FIELD_SELECT_OPTIONS[condition.field];
  const availableOps  = FIELD_OPERATORS[condition.field];

  function handleFieldChange(field: FilterField) {
    const defaultOp = FIELD_OPERATORS[field][0];
    updateCondition(boardId, condition.id, { field, operator: defaultOp, value: '' });
  }

  return (
    <div className="filter-row">
      {/* Etiqueta de conjunción */}
      <div className="filter-row__conjunction">
        {index === 0 ? (
          <span className="filter-row__where">Donde</span>
        ) : index === 1 ? (
          <button
            className="filter-row__conj-btn"
            onClick={() => setConjunction(boardId, conjunction === 'AND' ? 'OR' : 'AND')}
            title="Click para cambiar AND/OR"
          >
            {conjunction}
          </button>
        ) : (
          <span className="filter-row__conj-fixed">{conjunction}</span>
        )}
      </div>

      {/* Campo */}
      <select
        className="filter-select"
        value={condition.field}
        onChange={(e) => handleFieldChange(e.target.value as FilterField)}
      >
        {(Object.keys(FIELD_LABELS) as FilterField[]).map((f) => (
          <option key={f} value={f}>{FIELD_LABELS[f]}</option>
        ))}
      </select>

      {/* Operador */}
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

      {/* Valor */}
      {needsValue &&
        (selectOptions ? (
          <select
            className="filter-select filter-select--value"
            value={condition.value}
            onChange={(e) => updateCondition(boardId, condition.id, { value: e.target.value })}
          >
            <option value="">Seleccionar…</option>
            {selectOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        ) : (
          <input
            className="filter-input"
            type="text"
            placeholder="Introduce un valor"
            value={condition.value}
            onChange={(e) => updateCondition(boardId, condition.id, { value: e.target.value })}
          />
        ))}

      {/* Eliminar fila */}
      <button
        className="filter-row__delete"
        onClick={() => removeCondition(boardId, condition.id)}
        title="Eliminar condición"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M2 2l10 10M12 2L2 12"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
    </div>
  );
}

/* ============================================================
   Panel desplegable
   ============================================================ */
function FilterPanel({ boardId, onClose }: { boardId: string; onClose: () => void }) {
  const { getConditions, getConjunction, addCondition, clearAll } = useFilterStore();
  const conditions  = getConditions(boardId);
  const conjunction = getConjunction(boardId);
  const ref         = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        const trigger = document.querySelector('.filter-trigger');
        if (trigger && trigger.contains(e.target as Node)) return;
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  return (
    <div className="filter-panel" ref={ref}>
      <div className="filter-panel__header">
        <span className="filter-panel__title">Filtros</span>
        {conditions.length > 0 && (
          <button className="filter-panel__clear" onClick={() => clearAll(boardId)}>
            Limpiar todo
          </button>
        )}
      </div>

      {conditions.length === 0 ? (
        <p className="filter-panel__empty">
          En esta vista, se muestran todos los tickets
        </p>
      ) : (
        <div className="filter-panel__conditions">
          {conditions.map((cond, i) => (
            <ConditionRow
              key={cond.id}
              boardId={boardId}
              condition={cond}
              index={i}
              conjunction={conjunction}
              totalConditions={conditions.length}
            />
          ))}
        </div>
      )}

      <button className="filter-panel__add" onClick={() => addCondition(boardId)}>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path
            d="M6 1v10M1 6h10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        Añadir condición
      </button>
    </div>
  );
}

/* ============================================================
   Componente principal exportado — recibe boardId como prop
   ============================================================ */
export function BoardFilters({ boardId }: { boardId: string }) {
  const { getConditions, isOpen, togglePanel, setOpen, removeCondition, activeCount } =
    useFilterStore();

  const conditions = getConditions(boardId);
  const panelOpen  = isOpen(boardId);
  const count      = activeCount(boardId);

  return (
    <div className="board-filters">
      {/* Chips de filtros activos */}
      {conditions.length > 0 && (
        <div className="board-filters__chips">
          {conditions.map((c) => (
            <ActiveFilterChip
              key={c.id}
              condition={c}
              onRemove={() => removeCondition(boardId, c.id)}
            />
          ))}
        </div>
      )}

      {/* Botón trigger */}
      <button
        className={`filter-trigger ${count > 0 ? 'filter-trigger--active' : ''}`}
        onClick={() => togglePanel(boardId)}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path
            d="M1 3h12M3 7h8M5 11h4"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
        Filtro
        {count > 0 && <span className="filter-trigger__badge">{count}</span>}
      </button>

      {/* Panel desplegable */}
      {panelOpen && <FilterPanel boardId={boardId} onClose={() => setOpen(boardId, false)} />}
    </div>
  );
}