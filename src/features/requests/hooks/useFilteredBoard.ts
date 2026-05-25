import { useMemo } from 'react';
import { useFilterStore } from '@/store/filterStore';
import type { BoardData, Request } from '../types';
import type { FilterCondition, FilterField, FilterOperator } from '@/store/filterStore';
import type { TemplateExtraField, ConditionalField } from '../templates/types';
import { isConditionalField } from '../templates/types';

/* ============================================================
   Aplana recursivamente todas las keys de un schema de template.
   Usado para detectar campos que ya no existen en el schema
   actual comparando con las keys del formData del ticket.
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
    case 'subequipo':
      return (request.subTeamNames ?? []).map(norm);

    case 'etiqueta':
      return (request.categoria ?? []).map(norm);

    case 'assignee':
      return (request.assignees ?? []).map((a) => norm(a.userName));

    case 'equipo':
      return (request.equipo ?? []).map(norm);

    case 'sprint':
      return request.sprintName ? [norm(request.sprintName)] : [];

    case 'confidencial':
      return [String(request.isConfidential)];

    case 'tiene_hijos':
      return [String((request.childCount ?? 0) > 0)];

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
      if (val === undefined || val === null || val === '') return [];
      return [norm(val)];
    }

    case 'desactualizado': {
      const formKeys = Object.keys(request.formData ?? {});
      // Sin formData → no está desactualizado
      if (formKeys.length === 0) return ['false'];
      // Sin schema → no podemos determinar → consideramos no desactualizado
      const schema = request.templateFormSchema;
      if (!schema || !Array.isArray(schema) || schema.length === 0) return ['false'];
      // Aplanar todas las keys del schema
      const schemaKeys = new Set<string>();
      collectSchemaKeys(schema, schemaKeys);
      // Está desactualizado si alguna key del formData ya no existe en el schema
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

/* ============================================================
   Evalúa una condición contra un request
   ============================================================ */
function evaluate(request: Request, cond: FilterCondition): boolean {
  // template_field sin key seleccionada → no filtra (deja pasar todo)
  if (cond.field === 'template_field' && !cond.templateFieldKey) return true;

  const values  = extractValues(request, cond);
  const empty   = isEmpty(values);
  const condVal = cond.value.toLowerCase().trim();

  switch (cond.operator as FilterOperator) {
    case 'esta_vacio':    return empty;
    case 'no_esta_vacio': return !empty;

    case 'es':    return values.includes(condVal);
    case 'no_es': return !values.includes(condVal);

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
  if (c.field === 'template_field' && (!c.templateId || !c.templateFieldKey)) return false;
  if (c.operator === 'entre') return c.value.trim() !== '' && (c.value2 ?? '').trim() !== '';
  return c.value.trim() !== '';
}
/* ============================================================
   Hook para BoardData (Kanban)
   ============================================================ */
export function useFilteredBoard(
  boardId: string,
  board: BoardData | undefined,
): BoardData | undefined {
  const { getConditions, getConjunction } = useFilterStore();

  const conditions  = getConditions(boardId);
  const conjunction = getConjunction(boardId);

  return useMemo(() => {
    if (!board) return undefined;

    const active = conditions.filter(isActive);
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
  }, [board, conditions, conjunction]);
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