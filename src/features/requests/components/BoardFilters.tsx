import { useRef, useEffect, useCallback, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, Plus, X, Trash2 } from 'lucide-react';
import {
  useFilterStore,
  FIELD_LABELS,
  FIELD_CATEGORY,
  OPERATOR_LABELS,
  FIELD_OPERATORS,
  FIELD_SELECT_OPTIONS,
  type FilterField,
  type FilterOperator,
  type FilterCondition,
} from '@/store/filterStore';

/* ============================================================
   Tipo para un campo de template aplanado
   ============================================================ */
export type TemplateFieldOption = {
  key:       string;
  label:     string;
  // Determina operadores disponibles y tipo de input de valor
  fieldType: 'text' | 'select_radio' | 'boolean';
  options?:  string[]; // solo para select_radio
};

/* ============================================================
   Tipo para una plantilla en el filtro
   ============================================================ */
export type TemplateFilterOption = {
  id:     number;
  label:  string;
  icon?:  string;
  color?: string;
  fields: TemplateFieldOption[];
};

/* ============================================================
   Opciones dinámicas que el padre debe proveer
   ============================================================ */
export type FilterDynamicOptions = {
  subequipo?:       { value: string; label: string }[];
  etiqueta?:        { value: string; label: string }[];
  assignee?:        { value: string; label: string }[];
  assigneeGrouped?: {
    subTeamId:    string;
    subTeamName:  string;
    subTeamColor: string;
    members:      { value: string; label: string; email: string }[];
  }[];
  sprint?:     { value: string; label: string }[];
  categoria?:  { value: string; label: string }[];
  /** Plantillas del board con sus campos ya tipados */
  templates?:  TemplateFilterOption[];
};

/* ============================================================
   Operadores disponibles según fieldType del campo de template
   ============================================================ */
const TEMPLATE_FIELD_OPERATORS: Record<TemplateFieldOption['fieldType'], FilterOperator[]> = {
  text:        ['contiene', 'no_contiene', 'esta_vacio', 'no_esta_vacio'],
  select_radio: ['es', 'no_es', 'esta_vacio', 'no_esta_vacio'],
  boolean:     ['es'],
};

const BOOLEAN_OPTIONS = [
  { value: 'true',  label: 'Sí' },
  { value: 'false', label: 'No' },
];

/* ============================================================
   Colores semánticos por categoría de campo
   ============================================================ */
const CATEGORY_COLORS = {
  text:    { bg: 'rgba(96,165,250,0.11)',  border: 'rgba(96,165,250,0.30)',  dot: '#60a5fa' },
  enum:    { bg: 'rgba(167,139,250,0.11)', border: 'rgba(167,139,250,0.30)', dot: '#a78bfa' },
  dynamic: { bg: 'rgba(0,200,255,0.09)',   border: 'rgba(0,200,255,0.28)',   dot: 'var(--accent)' },
  numeric: { bg: 'rgba(251,146,60,0.11)',  border: 'rgba(251,146,60,0.30)',  dot: '#fb923c' },
  boolean: { bg: 'rgba(52,211,153,0.11)',  border: 'rgba(52,211,153,0.30)',  dot: '#34d399' },
} as const;

/* ============================================================
   Helpers
   ============================================================ */
function getTemplateById(id: number | undefined, templates: TemplateFilterOption[]): TemplateFilterOption | undefined {
  if (!id) return undefined;
  return templates.find((t) => t.id === id);
}

function getTemplateFieldByKey(key: string | undefined, tpl: TemplateFilterOption | undefined): TemplateFieldOption | undefined {
  if (!key || !tpl) return undefined;
  return tpl.fields.find((f) => f.key === key);
}

function getOperatorsForTemplateField(tf: TemplateFieldOption | undefined): FilterOperator[] {
  if (!tf) return FIELD_OPERATORS['template_field'];
  return TEMPLATE_FIELD_OPERATORS[tf.fieldType];
}

function getOptionsForTemplateField(tf: TemplateFieldOption | undefined): { value: string; label: string }[] {
  if (!tf) return [];
  if (tf.fieldType === 'boolean') return BOOLEAN_OPTIONS;
  if (tf.fieldType === 'select_radio') return (tf.options ?? []).map((o) => ({ value: o, label: o }));
  return [];
}

function getOptions(
  field: FilterField,
  dynamic: FilterDynamicOptions,
  tf?: TemplateFieldOption,
): { value: string; label: string }[] {
  if (field === 'template_field') return getOptionsForTemplateField(tf);
  if (FIELD_SELECT_OPTIONS[field]) return FIELD_SELECT_OPTIONS[field]!;
  if (field === 'etiqueta') return dynamic.etiqueta ?? dynamic.categoria ?? [];
  if (field === 'equipo')   return dynamic.subequipo ?? [];
  return dynamic[field as keyof FilterDynamicOptions] as { value: string; label: string }[] ?? [];
}

function needsValue(operator: FilterOperator): boolean {
  return operator !== 'esta_vacio' && operator !== 'no_esta_vacio';
}

function isNumericField(field: FilterField): boolean {
  return field === 'progreso' || field === 'horas_estimadas';
}

/* ============================================================
   Chip de filtro activo
   ============================================================ */
function ActiveChip({
  condition,
  dynamicOptions,
  onRemove,
}: {
  condition:      FilterCondition;
  dynamicOptions: FilterDynamicOptions;
  onRemove:       () => void;
}) {
  const colors     = CATEGORY_COLORS[FIELD_CATEGORY[condition.field]];
  const showVal    = needsValue(condition.operator);
  const isTemplate = condition.field === 'template_field';

  const tpl = isTemplate ? getTemplateById(condition.templateId, dynamicOptions.templates ?? []) : undefined;
  const tf  = isTemplate ? getTemplateFieldByKey(condition.templateFieldKey, tpl) : undefined;
  const options = getOptions(condition.field, dynamicOptions, tf);

  // Label del campo: para template_field mostramos "NombrePlantilla / NombreCampo"
  const fieldDisplayLabel = isTemplate
    ? [
        tpl ? `${tpl.icon ?? '📋'} ${tpl.label}` : '⚠ Plantilla eliminada',
        tf  ? tf.label : condition.templateFieldKey ? '⚠ Campo eliminado' : null,
      ].filter(Boolean).join(' / ')
    : FIELD_LABELS[condition.field];

  const valLabel = (() => {
    if (!showVal) return '';
    if (condition.operator === 'entre') return `${condition.value} – ${condition.value2 ?? '?'}`;
    if (options.length) return options.find((o) => o.value === condition.value)?.label ?? condition.value;
    return condition.value;
  })();

  return (
    <div
      className="filter-chip"
      style={{ background: colors.bg, borderColor: colors.border }}
    >
      <span className="filter-chip__field" style={{ color: colors.dot }}>
        {fieldDisplayLabel}
      </span>
      <span className="filter-chip__sep" />
      <span className="filter-chip__op">{OPERATOR_LABELS[condition.operator]}</span>
      {showVal && valLabel && (
        <>
          <span className="filter-chip__sep" />
          <span className="filter-chip__val">{valLabel}</span>
        </>
      )}
      <button className="filter-chip__remove" onClick={onRemove} title="Eliminar filtro">
        <X size={9} strokeWidth={2.5} />
      </button>
    </div>
  );
}

/* ============================================================
   AssigneeFilterPicker
   ============================================================ */

type AssigneeGroupData = NonNullable<FilterDynamicOptions['assigneeGrouped']>[number];

function pickerInitials(name: string) {
  return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
}

function AssigneeGroupBlock({
  group, filtered, selected, onSelect,
}: {
  group:    AssigneeGroupData;
  filtered: AssigneeGroupData['members'];
  selected: string;
  onSelect: (val: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (!filtered.length) return null;
  return (
    <div>
      <div className="filter-ag-header" onClick={() => setCollapsed((v) => !v)}>
        <div className="filter-ag-header__dot" style={{ background: group.subTeamColor }} />
        <span className="filter-ag-header__name">{group.subTeamName}</span>
        <svg width="9" height="9" viewBox="0 0 8 8" fill="none"
          style={{ color: 'var(--txt-muted)', flexShrink: 0, transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      {!collapsed && filtered.map((m) => {
        const sel = m.value === selected;
        return (
          <div key={m.value} className={`filter-ag-item${sel ? ' filter-ag-item--sel' : ''}`} onMouseDown={(e) => { e.stopPropagation(); onSelect(m.value); }}>
            <div className="filter-ag-item__av" style={sel ? { background: group.subTeamColor } : undefined}>
              {pickerInitials(m.label)}
            </div>
            <div className="filter-ag-item__info">
              <div className="filter-ag-item__name">{m.label}</div>
              <div className="filter-ag-item__email">{m.email}</div>
            </div>
            {sel && (
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}>
                <path d="M1.5 5.5l3 3 5-5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}

function AssigneeFilterPicker({
  value, groups, flat, onChange,
}: {
  value:    string;
  groups?:  FilterDynamicOptions['assigneeGrouped'];
  flat:     { value: string; label: string }[];
  onChange: (val: string) => void;
}) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const [pos,    setPos]    = useState({ top: 0, left: 0, width: 260 });
  const triggerRef          = useRef<HTMLButtonElement>(null);
  const dropRef             = useRef<HTMLDivElement>(null);

  const selectedLabel = flat.find((o) => o.value === value)?.label ?? '';

  useEffect(() => {
    if (!open) return;
    function out(e: MouseEvent) {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
      setSearch('');
    }
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [open]);

  function openPicker() {
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(260, r.width) });
    }
    setOpen((o) => !o);
    setSearch('');
  }

  function handleSelect(val: string) {
    onChange(val === value ? '' : val);
    setOpen(false);
    setSearch('');
  }

  const hasGroups = (groups?.length ?? 0) > 0;

  const noResults = hasGroups && groups!.every((g) =>
    g.members.filter(
      (m) => !search ||
        m.label.toLowerCase().includes(search.toLowerCase()) ||
        m.email.toLowerCase().includes(search.toLowerCase()),
    ).length === 0,
  );

  return (
    <div className="filter-assignee-wrap">
      <button ref={triggerRef} className="filter-assignee-trigger" onClick={openPicker}>
        {value && selectedLabel ? (
          <>
            <div className="filter-assignee-trigger__av">{pickerInitials(selectedLabel)}</div>
            <span className="filter-assignee-trigger__name">{selectedLabel}</span>
          </>
        ) : (
          <span className="filter-assignee-trigger__placeholder">Seleccionar…</span>
        )}
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"
          style={{ marginLeft: 'auto', flexShrink: 0, color: 'var(--txt-muted)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      </button>

      {open && createPortal(
        <div ref={dropRef} className="filter-assignee-drop" style={{ top: pos.top, left: pos.left, width: pos.width }}>
          <div className="filter-assignee-search">
            <input
              autoFocus
              className="filter-assignee-search__input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar usuario…"
            />
          </div>
          <div className="filter-assignee-list">
            {hasGroups
              ? groups!.map((g) => (
                  <AssigneeGroupBlock
                    key={g.subTeamId}
                    group={g}
                    filtered={g.members.filter(
                      (m) => !search ||
                        m.label.toLowerCase().includes(search.toLowerCase()) ||
                        m.email.toLowerCase().includes(search.toLowerCase()),
                    )}
                    selected={value}
                    onSelect={handleSelect}
                  />
                ))
              : flat
                  .filter((o) => !search || o.label.toLowerCase().includes(search.toLowerCase()))
                  .map((o) => (
                    <div key={o.value} className={`filter-ag-item${o.value === value ? ' filter-ag-item--sel' : ''}`} onMouseDown={(e) => { e.stopPropagation(); handleSelect(o.value); }}>
                      <div className="filter-ag-item__av">{pickerInitials(o.label)}</div>
                      <div className="filter-ag-item__info">
                        <div className="filter-ag-item__name">{o.label}</div>
                      </div>
                      {o.value === value && (
                        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="var(--accent)" strokeWidth="2" style={{ flexShrink: 0 }}>
                          <path d="M1.5 5.5l3 3 5-5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                  ))
            }
            {noResults && <div className="filter-assignee-empty">Sin resultados</div>}
          </div>
        </div>,
        document.getElementById('portal-root') ?? document.body,
      )}
    </div>
  );
}

/* ============================================================
   ConditionRow
   ============================================================ */function ConditionRow({
  boardId,
  condition,
  index,
  conjunction,
  dynamicOptions,
}: {
  boardId:        string;
  condition:      FilterCondition;
  index:          number;
  conjunction:    'AND' | 'OR';
  dynamicOptions: FilterDynamicOptions;
}) {
  const { updateCondition, removeCondition, setConjunction } = useFilterStore();

  const isTemplateField = condition.field === 'template_field';
  const templates       = dynamicOptions.templates ?? [];

  // Template seleccionado actualmente
  const selectedTpl = isTemplateField
    ? getTemplateById(condition.templateId, templates)
    : undefined;

  // Campo de template seleccionado actualmente
  const selectedTf = isTemplateField
    ? getTemplateFieldByKey(condition.templateFieldKey, selectedTpl)
    : undefined;

  // Estados huérfanos
  const isOrphanTemplate = isTemplateField && !!condition.templateId && !selectedTpl;
  const isOrphanField    = isTemplateField && !!condition.templateFieldKey && !!selectedTpl && !selectedTf;

  // El valor guardado ya no existe en las opciones actuales del campo
  const tfOptions    = getOptionsForTemplateField(selectedTf);
  const isOrphanVal  = isTemplateField && selectedTf && needsValue(condition.operator) &&
    tfOptions.length > 0 && condition.value !== '' &&
    !tfOptions.find((o) => o.value === condition.value);

  const showVal    = needsValue(condition.operator);
  const isNumeric  = isNumericField(condition.field);
  const isBetween  = condition.operator === 'entre';
  const dotColor   = CATEGORY_COLORS[FIELD_CATEGORY[condition.field]].dot;

  // Operadores disponibles: para template_field dependen del fieldType del campo elegido
  const availOps = isTemplateField
    ? getOperatorsForTemplateField(selectedTf)
    : FIELD_OPERATORS[condition.field];

  // Opciones de valor
  const options    = getOptions(condition.field, dynamicOptions, selectedTf);
  const hasOptions = options.length > 0;

  // Paso 3 (operador) visible solo si template_field tiene templateId + templateFieldKey
  const showOperator = !isTemplateField || (!!condition.templateId && !!condition.templateFieldKey);
  // Paso 4 (valor) visible solo si además el operador requiere valor
  const showValue    = showOperator && showVal;

  function handleFieldChange(field: FilterField) {
    updateCondition(boardId, condition.id, {
      field,
      operator:         FIELD_OPERATORS[field][0],
      value:            '',
      value2:           undefined,
      templateId:       undefined,
      templateFieldKey: undefined,
    });
  }

  function handleTemplateChange(idStr: string) {
    const id = idStr ? Number(idStr) : undefined;
    const tpl = id ? getTemplateById(id, templates) : undefined;
    const defaultOp = tpl?.fields[0]
      ? getOperatorsForTemplateField(tpl.fields[0])[0]
      : 'contiene';
    updateCondition(boardId, condition.id, {
      templateId:       id,
      templateFieldKey: undefined,
      operator:         defaultOp,
      value:            '',
      value2:           undefined,
    });
  }

  function handleTemplateFieldKeyChange(key: string) {
    const tpl = getTemplateById(condition.templateId, templates);
    const tf  = getTemplateFieldByKey(key, tpl);
    const newOp = tf ? getOperatorsForTemplateField(tf)[0] : 'contiene';
    updateCondition(boardId, condition.id, {
      templateFieldKey: key || undefined,
      operator:         newOp,
      value:            '',
      value2:           undefined,
    });
  }

  return (
    <div className="filter-row">
      {/* Conjunción */}
      <div className="filter-row__conj">
        {index === 0 ? (
          <span className="filter-row__where">donde</span>
        ) : index === 1 ? (
          <button
            className="filter-row__conj-btn"
            onClick={() => setConjunction(boardId, conjunction === 'AND' ? 'OR' : 'AND')}
            title="Click para alternar AND / OR"
          >
            {conjunction}
          </button>
        ) : (
          <span className="filter-row__conj-fixed">{conjunction}</span>
        )}
      </div>

      {/* Dot de categoría */}
      <div className="filter-row__cat-dot" style={{ background: dotColor }} />

      {/* Campo principal */}
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

      {/* Paso 1 — selector de plantilla */}
      {isTemplateField && (
        <div className="filter-select-wrap">
          {isOrphanTemplate ? (
            <select
              className="filter-select filter-select--subfield"
              value={String(condition.templateId ?? '')}
              onChange={(e) => handleTemplateChange(e.target.value)}
              style={{ color: 'var(--warn)', borderColor: 'rgba(251,146,60,0.4)' }}
            >
              <option value={String(condition.templateId ?? '')} disabled>
                ⚠ Plantilla eliminada
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.icon ?? '📋'} {t.label}</option>
              ))}
            </select>
          ) : (
            <select
              className="filter-select filter-select--subfield"
              value={String(condition.templateId ?? '')}
              onChange={(e) => handleTemplateChange(e.target.value)}
            >
              <option value="">Seleccionar plantilla…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.icon ?? '📋'} {t.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Paso 2 — selector de campo (solo si hay plantilla elegida) */}
      {isTemplateField && condition.templateId && (
        <div className="filter-select-wrap">
          {isOrphanField ? (
            <select
              className="filter-select filter-select--subfield"
              value={condition.templateFieldKey ?? ''}
              onChange={(e) => handleTemplateFieldKeyChange(e.target.value)}
              style={{ color: 'var(--warn)', borderColor: 'rgba(251,146,60,0.4)' }}
            >
              <option value={condition.templateFieldKey ?? ''} disabled>
                ⚠ Campo eliminado
              </option>
              {(selectedTpl?.fields ?? []).map((tf) => (
                <option key={tf.key} value={tf.key}>{tf.label}</option>
              ))}
            </select>
          ) : (
            <select
              className="filter-select filter-select--subfield"
              value={condition.templateFieldKey ?? ''}
              onChange={(e) => handleTemplateFieldKeyChange(e.target.value)}
            >
              <option value="">Seleccionar campo…</option>
              {(selectedTpl?.fields ?? []).map((tf) => (
                <option key={tf.key} value={tf.key}>{tf.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Paso 3 — operador */}
      {showOperator && (
        <div className="filter-select-wrap">
          <select
            className="filter-select filter-select--operator"
            value={condition.operator}
            onChange={(e) =>
              updateCondition(boardId, condition.id, {
                operator: e.target.value as FilterOperator,
                value:    '',
                value2:   undefined,
              })
            }
          >
            {availOps.map((op) => (
              <option key={op} value={op}>{OPERATOR_LABELS[op]}</option>
            ))}
          </select>
        </div>
      )}

      {/* Paso 4 — valor */}
      {showValue && (
        <div className="filter-value-wrap">
          {isBetween ? (
            <div className="filter-between">
              <input
                className="filter-input filter-input--numeric"
                type="number"
                placeholder="Mín"
                value={condition.value}
                onChange={(e) => updateCondition(boardId, condition.id, { value: e.target.value })}
              />
              <span className="filter-between__sep">–</span>
              <input
                className="filter-input filter-input--numeric"
                type="number"
                placeholder="Máx"
                value={condition.value2 ?? ''}
                onChange={(e) => updateCondition(boardId, condition.id, { value2: e.target.value })}
              />
            </div>
          ) : condition.field === 'assignee' ? (
            <AssigneeFilterPicker
              value={condition.value}
              groups={dynamicOptions.assigneeGrouped}
              flat={dynamicOptions.assignee ?? []}
              onChange={(val) => updateCondition(boardId, condition.id, { value: val })}
            />
          ) : hasOptions ? (
            <select
              className="filter-select filter-select--value"
              value={condition.value}
              onChange={(e) => updateCondition(boardId, condition.id, { value: e.target.value })}
              style={isOrphanVal ? { color: 'var(--warn)', borderColor: 'rgba(251,146,60,0.4)' } : undefined}
            >
              {/* Valor huérfano: la opción ya no existe en el template actualizado */}
              {isOrphanVal && (
                <option value={condition.value} style={{ color: 'var(--warn)' }}>
                  ⚠ {condition.value}
                </option>
              )}
              <option value="">Seleccionar…</option>
              {options.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : isNumeric ? (
            <input
              className="filter-input filter-input--numeric"
              type="number"
              placeholder="Valor numérico…"
              value={condition.value}
              onChange={(e) => updateCondition(boardId, condition.id, { value: e.target.value })}
            />
          ) : (
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

      {/* Eliminar */}
      <button
        className="filter-row__delete"
        onClick={() => removeCondition(boardId, condition.id)}
        title="Eliminar condición"
      >
        <X size={12} strokeWidth={2} />
      </button>
    </div>
  );
}

/* ============================================================
   FilterPanelContent
   ============================================================ */
function FilterPanelContent({
  boardId,
  dynamicOptions,
  panelRef,
}: {
  boardId:        string;
  dynamicOptions: FilterDynamicOptions;
  panelRef:       RefObject<HTMLDivElement | null>;
}) {
  const { getConditions, getConjunction, addCondition, clearAll } = useFilterStore();
  const conditions  = getConditions(boardId);
  const conjunction = getConjunction(boardId);

  return (
    <div className="filter-panel" ref={panelRef}>
      <div className="filter-panel__header">
        <div className="filter-panel__title-group">
          <div className="filter-panel__dot-pulse" />
          <span className="filter-panel__title">Filtros</span>
          {conditions.length > 0 && (
            <span className="filter-panel__count">{conditions.length}</span>
          )}
          {conditions.length > 0 && (
            <span className="filter-panel__conj-badge">
              {conjunction === 'AND' ? 'Todas las condiciones' : 'Cualquier condición'}
            </span>
          )}
        </div>
        {conditions.length > 0 && (
          <button className="filter-panel__clear" onClick={() => clearAll(boardId)}>
            <Trash2 size={11} />
            Limpiar todo
          </button>
        )}
      </div>

      <div className="filter-panel__divider" />

      {conditions.length === 0 ? (
        <div className="filter-panel__empty">
          <div className="filter-panel__empty-icon">
            <SlidersHorizontal size={22} strokeWidth={1.2} />
          </div>
          <p>Sin filtros activos</p>
          <span>Se muestran todos los tickets del board</span>
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
              dynamicOptions={dynamicOptions}
            />
          ))}
        </div>
      )}

      <button className="filter-panel__add" onClick={() => addCondition(boardId)}>
        <Plus size={11} strokeWidth={2.5} />
        Añadir condición
      </button>
    </div>
  );
}

/* ============================================================
   FilterPanelAbsolute
   ============================================================ */
function FilterPanelAbsolute({
  boardId,
  dynamicOptions,
  triggerRef,
  onClose,
}: {
  boardId:        string;
  dynamicOptions: FilterDynamicOptions;
  triggerRef:     RefObject<HTMLButtonElement | null>;
  onClose:        () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);

  const handleOutside = useCallback((e: MouseEvent) => {
    if (
      panelRef.current?.contains(e.target as Node) ||
      triggerRef.current?.contains(e.target as Node)
    ) return;
    onClose();
  }, [onClose, triggerRef]);

  useEffect(() => {
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [handleOutside]);

  return <FilterPanelContent boardId={boardId} dynamicOptions={dynamicOptions} panelRef={panelRef} />;
}

/* ============================================================
   FilterPanelPortal
   ============================================================ */
function FilterPanelPortal({
  boardId,
  dynamicOptions,
  triggerRef,
  onClose,
}: {
  boardId:        string;
  dynamicOptions: FilterDynamicOptions;
  triggerRef:     RefObject<HTMLButtonElement | null>;
  onClose:        () => void;
}) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 620 });

  useEffect(() => {
    function calc() {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      const panelWidth = Math.max(620, r.width);
      const left = Math.min(r.left, window.innerWidth - panelWidth - 12);
      setPos({ top: r.bottom + 8, left: Math.max(8, left), width: panelWidth });
    }
    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('scroll', calc, true);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('scroll', calc, true);
    };
  }, [triggerRef]);

  useEffect(() => {
    function out(e: MouseEvent) {
      if (
        panelRef.current?.contains(e.target as Node) ||
        triggerRef.current?.contains(e.target as Node)
      ) return;
      onClose();
    }
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [onClose, triggerRef]);

  return createPortal(
    <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999 }}>
      <FilterPanelContent boardId={boardId} dynamicOptions={dynamicOptions} panelRef={panelRef} />
    </div>,
    document.getElementById('portal-root') ?? document.body,
  );
}

/* ============================================================
   BoardFilters — componente principal exportado
   ============================================================ */
export function BoardFilters({
  boardId,
  dynamicOptions = {},
  usePortal = false,
}: {
  boardId:         string;
  dynamicOptions?: FilterDynamicOptions;
  usePortal?:      boolean;
}) {
  const { getConditions, isOpen, togglePanel, setOpen, removeCondition, activeCount } =
    useFilterStore();

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const conditions = getConditions(boardId);
  const panelOpen  = isOpen(boardId);
  const count      = activeCount(boardId);

  return (
    <div className="board-filters">
      {conditions.length > 0 && (
        <div className="board-filters__chips">
          {conditions.map((c) => (
            <ActiveChip
              key={c.id}
              condition={c}
              dynamicOptions={dynamicOptions}
              onRemove={() => removeCondition(boardId, c.id)}
            />
          ))}
        </div>
      )}

      <button
        ref={triggerRef}
        className={`filter-trigger${count > 0 ? ' filter-trigger--active' : ''}`}
        onClick={() => togglePanel(boardId)}
      >
        <SlidersHorizontal size={13} strokeWidth={2} />
        Filtros
        {count > 0 && <span className="filter-trigger__badge">{count}</span>}
      </button>

      {panelOpen && (
        usePortal ? (
          <FilterPanelPortal
            boardId={boardId}
            dynamicOptions={dynamicOptions}
            triggerRef={triggerRef}
            onClose={() => setOpen(boardId, false)}
          />
        ) : (
          <FilterPanelAbsolute
            boardId={boardId}
            dynamicOptions={dynamicOptions}
            triggerRef={triggerRef}
            onClose={() => setOpen(boardId, false)}
          />
        )
      )}
    </div>
  );
}