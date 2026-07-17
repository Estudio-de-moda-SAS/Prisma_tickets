import { useMemo } from 'react';
import { useFilterStore } from '@/store/filterStore';
import type { BoardData, Request } from '../types';
import type { FilterCondition, FilterField, FilterOperator } from '@/store/filterStore';
import type { TemplateExtraField, ConditionalField } from '../templates/types';
import { isConditionalField } from '../templates/types';

/* ============================================================
   Aplana recursivamente todas las keys de un schema de template.
   ============================================================ */
function collectSchemaKeys(fields: unknown[], result: Set<string>): void {
  for (const f of fields as TemplateExtraField[]) {
    if (!f || typeof f !== 'object') continue;
    if (f.key) result.add(f.key);
    if (isConditionalField(f)) {
      const cf = f as ConditionalField;
      if (Array.isArray(cf.trueBranch))  collectSchemaKeys(cf.trueBranch,  result);
      if (Array.isArray(cf.falseBranch)) collectSchemaKeys(cf.falseBranch, result);
    }
  }
}

/* ============================================================
   Extrae valores del campo como string[] normalizado
   ============================================================ */
function extractValues(request: Request, cond: FilterCondition): string[] {
  const norm = (v: unknown) => String(v ?? '').toLowerCase().trim();
  const field = cond.field as FilterField;

  switch (field) {
    case 'equipo':
      return (request.subTeamNames ?? []).map(norm);

    case 'etiqueta':
      return (request.categoria ?? []).map(norm);

    case 'assignee':
      return (request.assignees ?? []).map((a) => norm(a.userName));

    case 'sprint':
      return request.sprintName ? [norm(request.sprintName)] : [];

    case 'confidencial':
      return [String(request.isConfidential)];

    case 'tiene_hijos':
      return [String((request.childCount ?? 0) > 0)];

    case 'es_hijo':
      return [String(request.parentId !== null)];
      
    case 'progreso':
      return [String(request.progreso ?? 0)];

    case 'horas_estimadas':
      return request.estimatedHours != null
        ? [String(request.estimatedHours)]
        : [];

    case 'template_field': {
      const key = cond.templateFieldKey;
      if (!key) return [];
      const val = request.formData?.[key];
      // Valor ausente: para campos boolean (valor del filtro es 'true'/'false')
      // lo tratamos como false. Para el resto, como vacío.
      if (val === undefined || val === null) {
        if (cond.value === 'true' || cond.value === 'false') return ['false'];
        return [];
      }
      if (val === '') return [];
      return [norm(val)];
    }

    case 'desactualizado': {
      const formKeys = Object.keys(request.formData ?? {});
      if (formKeys.length === 0) return ['false'];
      const schema = request.templateFormSchema;
      if (!schema || !Array.isArray(schema) || schema.length === 0) return ['false'];
      const schemaKeys = new Set<string>();
      collectSchemaKeys(schema, schemaKeys);
      const hasOrphans = formKeys.some((k) => !schemaKeys.has(k));
      return [String(hasOrphans)];
    }

    case 'titulo':
    case 'prioridad':
    case 'columna':
    case 'solicitante': {
      const raw = request[field as keyof Request];
      return [norm(raw)];
    }

    default:
      return [''];
  }
}

function isEmpty(values: string[]): boolean {
  return values.length === 0 || values.every((v) => v === '' || v === 'null' || v === 'undefined');
}
function needsValue(operator: FilterOperator): boolean {
  return operator !== 'esta_vacio' && operator !== 'no_esta_vacio';
}
/* ============================================================
   Evalúa una condición contra un request
   ============================================================ */
function evaluate(request: Request, cond: FilterCondition): boolean {
  if (cond.field === 'template_field') {
    // Filtrar por templateId siempre
    if (cond.templateId && request.templateId !== cond.templateId) return false;

    // Sin campo seleccionado → solo filtra por template
    if (!cond.templateFieldKey) return true;

    // Con campo pero sin valor → mostrar los que tengan ese campo con algún valor
    if (needsValue(cond.operator) && cond.value.trim() === '') {
      const val = request.formData?.[cond.templateFieldKey];
      return val !== undefined && val !== null && val !== '';
    }
  }

  // ... resto igual

  const values  = extractValues(request, cond);
  const empty   = isEmpty(values);
  const condVal = cond.value.toLowerCase().trim();

  switch (cond.operator as FilterOperator) {
    case 'esta_vacio':    return empty;
    case 'no_esta_vacio': return !empty;

case 'es': {
      // Sprint y assignee soportan multi-valor separado por '|'
      if (cond.field === 'sprint' || cond.field === 'assignee') {
        const wanted = condVal.split('|').map((v) => v.trim()).filter(Boolean);
        return wanted.some((w) => values.includes(w));
      }
      return values.includes(condVal);
    }
    case 'no_es': {
      if (cond.field === 'sprint' || cond.field === 'assignee') {
        const wanted = condVal.split('|').map((v) => v.trim()).filter(Boolean);
        return !wanted.some((w) => values.includes(w));
      }
      return !values.includes(condVal);
    }
    
    case 'contiene':    return values.some((v) => v.includes(condVal));
    case 'no_contiene': return values.every((v) => !v.includes(condVal));

    case 'mayor_que': {
      const n = parseFloat(condVal);
      if (isNaN(n)) return true;
      return values.some((v) => parseFloat(v) > n);
    }

    case 'menor_que': {
      const n = parseFloat(condVal);
      if (isNaN(n)) return true;
      return values.some((v) => parseFloat(v) < n);
    }

    case 'entre': {
      const lo = parseFloat(condVal);
      const hi = parseFloat((cond.value2 ?? '').trim());
      if (isNaN(lo) || isNaN(hi)) return true;
      return values.some((v) => {
        const n = parseFloat(v);
        return n >= lo && n <= hi;
      });
    }

    default: return true;
  }
}

/* ============================================================
   Determina si una condición está activa (tiene valor útil)
   ============================================================ */
function isActive(c: FilterCondition): boolean {
  if (c.operator === 'esta_vacio' || c.operator === 'no_esta_vacio') return true;
  if (c.field === 'template_field') {
    if (!c.templateId) return false;
    return true;
  }
  if (c.operator === 'entre') return c.value.trim() !== '' && (c.value2 ?? '').trim() !== '';
  return c.value.trim() !== '';
}
/* ============================================================
   Hook para BoardData (Kanban)
   ============================================================ */
export function useFilteredBoard(
  boardId: string,
  board: BoardData | undefined,
  excludeFields?: FilterField[],
): BoardData | undefined {
  const { getConditions, getConjunction } = useFilterStore();

  const conditions  = getConditions(boardId);
  const conjunction = getConjunction(boardId);

  const excludeKey = excludeFields?.join('|') ?? '';

  return useMemo(() => {
    if (!board) return undefined;

    const excluded = excludeKey ? new Set(excludeKey.split('|')) : null;
    const active = conditions
      .filter(isActive)
      .filter((c) => !excluded || !excluded.has(c.field));

    if (active.length === 0) return board;

    const matches = (req: Request): boolean =>
      conjunction === 'AND'
        ? active.every((c) => evaluate(req, c))
        : active.some((c) => evaluate(req, c));

    const filtered = {} as BoardData;
    for (const [col, items] of Object.entries(board) as [keyof BoardData, Request[]][]) {
      filtered[col] = items.filter(matches);
    }
    return filtered;
  }, [board, conditions, conjunction, excludeKey]);
}

/* ============================================================
   Hook para listas planas (HomePage, MyRequestsPage, etc.)
   ============================================================ */
export function useFilteredRequests(
  boardId: string,
  requests: Request[] | undefined,
): Request[] | undefined {
  const { getConditions, getConjunction } = useFilterStore();

  const conditions  = getConditions(boardId);
  const conjunction = getConjunction(boardId);

  return useMemo(() => {
    if (!requests) return undefined;

    const active = conditions.filter(isActive);
    if (active.length === 0) return requests;

    const matches = (req: Request): boolean =>
      conjunction === 'AND'
        ? active.every((c) => evaluate(req, c))
        : active.some((c) => evaluate(req, c));

    return requests.filter(matches);
  }, [requests, conditions, conjunction]);
}