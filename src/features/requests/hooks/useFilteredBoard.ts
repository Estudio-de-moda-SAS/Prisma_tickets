import { useMemo } from 'react';
import { useFilterStore } from '@/store/filterStore';
import type { BoardData, Request } from '../types';
import type { FilterCondition, FilterOperator } from '@/store/filterStore';

/* ============================================================
   Evaluador de una condición individual
   ============================================================ */
function evaluate(request: Request, cond: FilterCondition): boolean {
  const raw        = request[cond.field as keyof Request];
  const fieldValue = raw == null ? '' : String(raw).toLowerCase();
  const condValue  = cond.value.toLowerCase().trim();

  switch (cond.operator as FilterOperator) {
    case 'contiene':
      return fieldValue.includes(condValue);
    case 'no_contiene':
      return !fieldValue.includes(condValue);
    case 'es':
      return condValue.split(',').map((v) => v.trim()).some((v) => fieldValue === v);
    case 'no_es':
      return condValue.split(',').map((v) => v.trim()).every((v) => fieldValue !== v);
    case 'esta_vacio':
      return fieldValue === '' || fieldValue === 'null' || fieldValue === 'undefined';
    case 'no_esta_vacio':
      return fieldValue !== '' && fieldValue !== 'null' && fieldValue !== 'undefined';
    default:
      return true;
  }
}

/* ============================================================
   Hook principal — ahora recibe boardId
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

    const activeConditions = conditions.filter((c) => {
      if (c.operator === 'esta_vacio' || c.operator === 'no_esta_vacio') return true;
      return c.value.trim() !== '';
    });

    if (activeConditions.length === 0) return board;

    function matches(request: Request): boolean {
      if (conjunction === 'AND') {
        return activeConditions.every((c) => evaluate(request, c));
      } else {
        return activeConditions.some((c) => evaluate(request, c));
      }
    }

    const filtered: BoardData = {} as BoardData;
    for (const [col, items] of Object.entries(board)) {
      (filtered as Record<string, Request[]>)[col] = items.filter(matches);
    }
    return filtered;
  }, [board, conditions, conjunction]);
}