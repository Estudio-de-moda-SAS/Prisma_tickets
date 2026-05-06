import { useMemo } from 'react';
import { useFilterStore } from '@/store/filterStore';
import type { BoardData, Request } from '../types';
import type { FilterCondition, FilterField, FilterOperator } from '@/store/filterStore';

/* ============================================================
   Extrae valores del campo como string[] normalizado.
   Cada campo mapea al campo real del modelo Request.
   ============================================================ */
function extractValues(request: Request, field: FilterField): string[] {
  const norm = (v: unknown) => String(v ?? '').toLowerCase().trim();

  switch (field) {
    // string[] directo
    case 'subequipo':
      return (request.subTeamNames ?? []).map(norm);

    case 'categoria':
      return (request.categoria ?? []).map(norm);

    // array de objetos → extraer userName
    case 'assignee':
      return (request.assignees ?? []).map((a) => norm(a.userName));

    // escalares
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
   Evaluador de una condición
   ============================================================ */
function evaluate(request: Request, cond: FilterCondition): boolean {
  const values  = extractValues(request, cond.field);
  const empty   = isEmpty(values);
  const condVal = cond.value.toLowerCase().trim();

  switch (cond.operator as FilterOperator) {
    case 'esta_vacio':    return empty;
    case 'no_esta_vacio': return !empty;

    // Coincidencia exacta con algún elemento del campo
    case 'es':    return values.includes(condVal);
    case 'no_es': return !values.includes(condVal);

    // Texto libre — algún elemento contiene el substring
    case 'contiene':    return values.some((v) => v.includes(condVal));
    case 'no_contiene': return values.every((v) => !v.includes(condVal));

    default: return true;
  }
}

/* ============================================================
   Hook principal
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

    const active = conditions.filter((c) => {
      if (c.operator === 'esta_vacio' || c.operator === 'no_esta_vacio') return true;
      return c.value.trim() !== '';
    });

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