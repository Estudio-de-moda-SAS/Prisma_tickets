import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type FilterField =
  | 'titulo'
  | 'prioridad'
  | 'columna'
  | 'equipo'
  | 'etiqueta'
  | 'solicitante'
  | 'assignee'
  | 'sprint'
  | 'confidencial'
  | 'tiene_hijos'
  | 'es_hijo'
  | 'progreso'
  | 'horas_estimadas'
  | 'template_field'
  | 'desactualizado';

export type FilterOperator =
  | 'contiene'
  | 'no_contiene'
  | 'es'
  | 'no_es'
  | 'mayor_que'
  | 'menor_que'
  | 'entre'
  | 'esta_vacio'
  | 'no_esta_vacio';

export type FilterCondition = {
  id:                string;
  field:             FilterField;
  operator:          FilterOperator;
  value:             string;
  value2?:           string;
  templateId?:       number;
  templateFieldKey?: string;
};

export type FilterConjunction = 'AND' | 'OR';

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

type FilterState = {
  byBoard: Record<string, BoardFilterState>;

  getConditions:  (boardId: string) => FilterCondition[];
  getConjunction: (boardId: string) => FilterConjunction;
  isOpen:         (boardId: string) => boolean;
  activeCount:    (boardId: string) => number;

  addCondition:    (boardId: string)                                              => void;
  removeCondition: (boardId: string, id: string)                                  => void;
  updateCondition: (boardId: string, id: string, patch: Partial<FilterCondition>) => void;
  clearAll:        (boardId: string)                                              => void;
  setConjunction:  (boardId: string, c: FilterConjunction)                        => void;
  togglePanel:     (boardId: string)                                              => void;
  setOpen:         (boardId: string, v: boolean)                                  => void;

  /** Toggle rápido de un resolutor (usado por la barra de horas). */
  toggleAssignee:     (boardId: string, userName: string) => void;
  /** Resolutores activos en filtros 'assignee es' (lowercased). */
  getActiveAssignees: (boardId: string) => string[];
};

function patchBoard(
  byBoard: Record<string, BoardFilterState>,
  boardId: string,
  updater: (prev: BoardFilterState) => Partial<BoardFilterState>,
): Record<string, BoardFilterState> {
  const prev = byBoard[boardId] ?? defaultBoardState();
  return { ...byBoard, [boardId]: { ...prev, ...updater(prev) } };
}

export const useFilterStore = create<FilterState>()(
  persist(
    (set, get) => ({
      byBoard: {},

      getConditions:  (id) => (get().byBoard[id] ?? defaultBoardState()).conditions,
      getConjunction: (id) => (get().byBoard[id] ?? defaultBoardState()).conjunction,
      isOpen:         (id) => (get().byBoard[id] ?? defaultBoardState()).isOpen,
activeCount: (id) =>
  (get().byBoard[id] ?? defaultBoardState()).conditions.filter((c) => {
    if (c.operator === 'esta_vacio' || c.operator === 'no_esta_vacio') return true;
    if (c.field === 'template_field') {
      if (!c.templateId || !c.templateFieldKey) return false;
    }
    return c.value.trim() !== '';   // ← quitar las dos condiciones redundantes
  }).length,
  
      addCondition: (boardId) =>
        set((s) => ({ byBoard: patchBoard(s.byBoard, boardId, (prev) => ({
          conditions: [...prev.conditions, newCondition(boardId)],
        })) })),

      removeCondition: (boardId, id) =>
        set((s) => ({ byBoard: patchBoard(s.byBoard, boardId, (prev) => ({
          conditions: prev.conditions.filter((c) => c.id !== id),
        })) })),

      updateCondition: (boardId, id, change) =>
        set((s) => ({ byBoard: patchBoard(s.byBoard, boardId, (prev) => ({
          conditions: prev.conditions.map((c) =>
            c.id === id ? { ...c, ...change } : c
          ),
        })) })),

      clearAll: (boardId) =>
        set((s) => ({ byBoard: patchBoard(s.byBoard, boardId, () => ({ conditions: [] })) })),

      setConjunction: (boardId, conjunction) =>
        set((s) => ({ byBoard: patchBoard(s.byBoard, boardId, () => ({ conjunction })) })),

      togglePanel: (boardId) =>
        set((s) => ({ byBoard: patchBoard(s.byBoard, boardId, (prev) => ({ isOpen: !prev.isOpen })) })),

      setOpen: (boardId, isOpen) =>
        set((s) => ({ byBoard: patchBoard(s.byBoard, boardId, () => ({ isOpen })) })),

      toggleAssignee: (boardId, userName) =>
        set((s) => ({ byBoard: patchBoard(s.byBoard, boardId, (prev) => {
          const target = userName.trim();
          if (!target) return {};

          // Busca una condición 'assignee es' existente para togglear dentro
          const cur = prev.conditions.find(
            (c) => c.field === 'assignee' && c.operator === 'es',
          );

          if (!cur) {
            // No existe → crea una nueva con este resolutor
            const cond: FilterCondition = {
              id:       `${boardId}-${crypto.randomUUID()}`,
              field:    'assignee',
              operator: 'es',
              value:    target,
            };
            return { conditions: [...prev.conditions, cond] };
          }

          // Existe → toggle dentro de su value multi-valor ('A|B|C')
          const parts = cur.value.split('|').map((v) => v.trim()).filter(Boolean);
          const has   = parts.some((p) => p.toLowerCase() === target.toLowerCase());
          const next  = has
            ? parts.filter((p) => p.toLowerCase() !== target.toLowerCase())
            : [...parts, target];

          if (next.length === 0) {
            // Quedó vacío → elimina la condición para no dejar chip huérfano
            return { conditions: prev.conditions.filter((c) => c.id !== cur.id) };
          }
          return {
            conditions: prev.conditions.map((c) =>
              c.id === cur.id ? { ...c, value: next.join('|') } : c,
            ),
          };
          // ↓ Para SINGLE-SELECT (click en B reemplaza a A) cambiá el bloque
          //   de arriba por:  return { conditions: prev.conditions.map((c) =>
          //     c.id === cur.id ? { ...c, value: has ? '' : target } : c)
          //     .filter((c) => !(c.field === 'assignee' && c.operator === 'es' && !c.value.trim())) };
        }) })),

      getActiveAssignees: (id) => {
        const conds = (get().byBoard[id] ?? defaultBoardState()).conditions;
        const out: string[] = [];
        for (const c of conds) {
          if (c.field === 'assignee' && c.operator === 'es' && c.value.trim()) {
            for (const v of c.value.split('|')) {
              const t = v.trim().toLowerCase();
              if (t) out.push(t);
            }
          }
        }
        return out;
      },
    }),
    {
      name: 'prisma-filters-v3',
      partialize: (state) => ({
        byBoard: Object.fromEntries(
          Object.entries(state.byBoard).map(([boardId, boardState]) => [
            boardId,
            { conditions: boardState.conditions, conjunction: boardState.conjunction, isOpen: false },
          ])
        ),
      }),
    },
  )
);

/* ============================================================
   Metadatos de UI
   ============================================================ */
export const FIELD_LABELS: Record<FilterField, string> = {
  titulo:          'Título',
  prioridad:       'Prioridad',
  columna:         'Columna',
  equipo:          'Equipo',
  etiqueta:        'Etiqueta',
  solicitante:     'Solicitante',
  assignee:        'Resolutor',
  sprint:          'Sprint',
  confidencial:    'Confidencial',
  tiene_hijos:     'Tiene sub-tickets',
  es_hijo:         'Es sub-ticket',
  progreso:        'Progreso',
  horas_estimadas: 'Horas estimadas',
  template_field:  'Plantilla',
  desactualizado:  'Datos desactualizados',
};

export const FIELD_ICONS: Record<FilterField, string> = {
  titulo:          'T',
  prioridad:       '▲',
  columna:         '▦',
  equipo:       '⊞',
  etiqueta:        '◈',
  solicitante:     '◉',
  assignee:        '◎',
  sprint:          '⚡',
  confidencial:    '🛡',
  tiene_hijos:     '⊕',
  es_hijo:         '⊙',
  progreso:        '%',
  horas_estimadas: '⏱',
  template_field:  '📋',
  desactualizado:  '⚠',
};

export type FieldCategory = 'text' | 'enum' | 'dynamic' | 'numeric' | 'boolean';

export const FIELD_CATEGORY: Record<FilterField, FieldCategory> = {
  titulo:          'text',
  solicitante:     'text',
  prioridad:       'enum',
  columna:         'enum',
  confidencial:    'boolean',
  tiene_hijos:     'boolean',
  es_hijo:         'boolean',
  desactualizado:  'boolean',
  equipo:       'dynamic',
  etiqueta:        'dynamic',
  assignee:        'dynamic',
  sprint:          'dynamic',
  progreso:        'numeric',
  horas_estimadas: 'numeric',
  template_field:  'dynamic',
};

export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contiene:      'contiene',
  no_contiene:   'no contiene',
  es:            'es',
  no_es:         'no es',
  mayor_que:     'mayor que',
  menor_que:     'menor que',
  entre:         'entre',
  esta_vacio:    'está vacío',
  no_esta_vacio: 'no está vacío',
};

export const FIELD_OPERATORS: Record<FilterField, FilterOperator[]> = {
  titulo:          ['contiene', 'no_contiene', 'esta_vacio', 'no_esta_vacio'],
  prioridad:       ['es', 'no_es'],
  columna:         ['es', 'no_es'],
  equipo:       ['es', 'no_es', 'esta_vacio', 'no_esta_vacio'],
  etiqueta:        ['es', 'no_es', 'esta_vacio', 'no_esta_vacio'],
  solicitante:     ['contiene', 'no_contiene', 'esta_vacio', 'no_esta_vacio'],
  assignee:        ['es', 'no_es', 'esta_vacio', 'no_esta_vacio'],
  sprint:          ['es', 'no_es', 'esta_vacio', 'no_esta_vacio'],
  confidencial:    ['es'],
  tiene_hijos:     ['es'],
  es_hijo:         ['es'],
  desactualizado:  ['es'],
  progreso:        ['mayor_que', 'menor_que', 'entre', 'es'],
  horas_estimadas: ['mayor_que', 'menor_que', 'entre', 'esta_vacio', 'no_esta_vacio'],
  template_field:  ['contiene', 'no_contiene', 'es', 'no_es', 'esta_vacio', 'no_esta_vacio'],
};

export const FIELD_SELECT_OPTIONS: Partial<Record<FilterField, { value: string; label: string }[]>> = {
  prioridad: [
    { value: 'baja',    label: 'Baja'    },
    { value: 'media',   label: 'Media'   },
    { value: 'alta',    label: 'Alta'    },
    { value: 'critica', label: 'Crítica' },
  ],
  columna: [
    { value: 'sin_categorizar',  label: 'Sin categorizar'  },
    { value: 'icebox',           label: 'Icebox'           },
    { value: 'backlog',          label: 'Backlog'          },
    { value: 'todo',             label: 'To do'            },
    { value: 'en_progreso',      label: 'En progreso'      },
    { value: 'en_revision_qas',  label: 'En revisión QAS'  },
    { value: 'ready_to_deploy',  label: 'Ready to Deploy'  },
    { value: 'hecho',            label: 'Hecho'            },
    { value: 'historial',        label: 'Historial'        },
  ],
  confidencial: [
    { value: 'true',  label: 'Sí' },
    { value: 'false', label: 'No' },
  ],
  tiene_hijos: [
    { value: 'true',  label: 'Sí' },
    { value: 'false', label: 'No' },
  ],
  es_hijo: [
    { value: 'true',  label: 'Sí' },
    { value: 'false', label: 'No' },
  ],
  desactualizado: [
    { value: 'true',  label: 'Sí' },
    { value: 'false', label: 'No' },
  ],
};