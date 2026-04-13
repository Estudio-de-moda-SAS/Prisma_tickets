import { create } from 'zustand';

/* ============================================================
   Tipos de filtro  (sin cambios)
   ============================================================ */
export type FilterField =
  | 'titulo'
  | 'prioridad'
  | 'categoria'
  | 'columna'
  | 'solicitante'
  | 'resolutor';

export type FilterOperator =
  | 'contiene'
  | 'no_contiene'
  | 'es'
  | 'no_es'
  | 'esta_vacio'
  | 'no_esta_vacio';

export type FilterCondition = {
  id:       string;
  field:    FilterField;
  operator: FilterOperator;
  value:    string; // serializado; para multi-select separado por ','
};

export type FilterConjunction = 'AND' | 'OR';

/* ============================================================
   Estado por board
   ============================================================ */
type BoardFilterState = {
  conditions:  FilterCondition[];
  conjunction: FilterConjunction;
  isOpen:      boolean;
};

const defaultBoardState = (): BoardFilterState => ({
  conditions:  [],
  conjunction: 'AND',
  isOpen:      false,
});

function newCondition(boardId: string): FilterCondition {
  return {
    id:       `${boardId}-${crypto.randomUUID()}`,
    field:    'titulo',
    operator: 'contiene',
    value:    '',
  };
}

/* ============================================================
   Store — todas las acciones reciben boardId como primer arg
   ============================================================ */
type FilterState = {
  byBoard: Record<string, BoardFilterState>;

  // Selectores
  getConditions:  (boardId: string) => FilterCondition[];
  getConjunction: (boardId: string) => FilterConjunction;
  isOpen:         (boardId: string) => boolean;
  activeCount:    (boardId: string) => number;

  // Mutaciones
  addCondition:    (boardId: string)                                              => void;
  removeCondition: (boardId: string, id: string)                                  => void;
  updateCondition: (boardId: string, id: string, patch: Partial<FilterCondition>) => void;
  clearAll:        (boardId: string)                                              => void;
  setConjunction:  (boardId: string, c: FilterConjunction)                        => void;
  togglePanel:     (boardId: string)                                              => void;
  setOpen:         (boardId: string, v: boolean)                                  => void;
};

/* ── Helper: actualiza un board sin tocar el resto ── */
function patchBoard(
  byBoard: Record<string, BoardFilterState>,
  boardId: string,
  updater: (prev: BoardFilterState) => Partial<BoardFilterState>,
): Record<string, BoardFilterState> {
  const prev = byBoard[boardId] ?? defaultBoardState();
  return { ...byBoard, [boardId]: { ...prev, ...updater(prev) } };
}

export const useFilterStore = create<FilterState>((set, get) => ({
  byBoard: {},

  /* ── Selectores ── */
  getConditions:  (boardId) => (get().byBoard[boardId] ?? defaultBoardState()).conditions,
  getConjunction: (boardId) => (get().byBoard[boardId] ?? defaultBoardState()).conjunction,
  isOpen:         (boardId) => (get().byBoard[boardId] ?? defaultBoardState()).isOpen,
  activeCount:    (boardId) =>
    (get().byBoard[boardId] ?? defaultBoardState()).conditions.filter((c) => {
      if (c.operator === 'esta_vacio' || c.operator === 'no_esta_vacio') return true;
      return c.value.trim() !== '';
    }).length,

  /* ── Mutaciones ── */
  addCondition: (boardId) =>
    set((s) => ({
      byBoard: patchBoard(s.byBoard, boardId, (prev) => ({
        conditions: [...prev.conditions, newCondition(boardId)],
      })),
    })),

  removeCondition: (boardId, id) =>
    set((s) => ({
      byBoard: patchBoard(s.byBoard, boardId, (prev) => ({
        conditions: prev.conditions.filter((c) => c.id !== id),
      })),
    })),

  updateCondition: (boardId, id, change) =>
    set((s) => ({
      byBoard: patchBoard(s.byBoard, boardId, (prev) => ({
        conditions: prev.conditions.map((c) => (c.id === id ? { ...c, ...change } : c)),
      })),
    })),

  clearAll: (boardId) =>
    set((s) => ({
      byBoard: patchBoard(s.byBoard, boardId, () => ({ conditions: [] })),
    })),

  setConjunction: (boardId, conjunction) =>
    set((s) => ({
      byBoard: patchBoard(s.byBoard, boardId, () => ({ conjunction })),
    })),

  togglePanel: (boardId) =>
    set((s) => ({
      byBoard: patchBoard(s.byBoard, boardId, (prev) => ({ isOpen: !prev.isOpen })),
    })),

  setOpen: (boardId, isOpen) =>
    set((s) => ({
      byBoard: patchBoard(s.byBoard, boardId, () => ({ isOpen })),
    })),
}));

/* ============================================================
   Labels para UI  (sin cambios)
   ============================================================ */
export const FIELD_LABELS: Record<FilterField, string> = {
  titulo:      'Título',
  prioridad:   'Prioridad',
  categoria:   'Categoría',
  columna:     'Columna',
  solicitante: 'Solicitante',
  resolutor:   'Resolutor',
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contiene:      'contiene',
  no_contiene:   'no contiene',
  es:            'es',
  no_es:         'no es',
  esta_vacio:    'está vacío',
  no_esta_vacio: 'no está vacío',
};

export const FIELD_OPERATORS: Record<FilterField, FilterOperator[]> = {
  titulo:      ['contiene', 'no_contiene', 'es', 'no_es', 'esta_vacio', 'no_esta_vacio'],
  prioridad:   ['es', 'no_es'],
  categoria:   ['es', 'no_es', 'contiene', 'esta_vacio', 'no_esta_vacio'],
  columna:     ['es', 'no_es'],
  solicitante: ['contiene', 'no_contiene', 'es', 'esta_vacio', 'no_esta_vacio'],
  resolutor:   ['contiene', 'no_contiene', 'es', 'esta_vacio', 'no_esta_vacio'],
};

export const FIELD_SELECT_OPTIONS: Partial<Record<FilterField, { value: string; label: string }[]>> = {
  prioridad: [
    { value: 'baja',    label: 'Baja'    },
    { value: 'media',   label: 'Media'   },
    { value: 'alta',    label: 'Alta'    },
    { value: 'critica', label: 'Crítica' },
  ],
  columna: [
    { value: 'sin_categorizar', label: 'Sin categorizar' },
    { value: 'icebox',          label: 'Icebox'          },
    { value: 'backlog',         label: 'Backlog'         },
    { value: 'todo',            label: 'To do'           },
    { value: 'en_progreso',     label: 'En progreso'     },
    { value: 'hecho',           label: 'Hecho'           },
  ],
};