import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import type { KanbanColumna } from '../types';

// Mapa estático para mock — los IDs coinciden con el SQL de inserción
const MOCK_COLUMN_MAP: Record<KanbanColumna, number> = {
  sin_categorizar:  1,
  icebox:           2,
  backlog:          3,
  todo:             4,
  en_progreso:      5,
  en_revision_qas:  8,
  ready_to_deploy:  7,
  hecho:            6,
  historial:        9,
};

type ColumnRow = {
  Board_Column_ID:   number;
  Board_Column_Name: string;
};

const KANBAN_NAME_TO_COLUMNA: Record<string, KanbanColumna> = {
  'Sin categorizar':  'sin_categorizar',
  'Icebox':           'icebox',
  'Backlog':          'backlog',
  'To do':            'todo',
  'En progreso':      'en_progreso',
  'En revisión QAS':  'en_revision_qas',
  'Ready to deploy':  'ready_to_deploy',
  'Hecho':            'hecho',
  'Historial':        'historial',
};

export function useColumnMap(boardId: number): Record<KanbanColumna, number> | undefined {
  const { data } = useQuery<Record<KanbanColumna, number>>({
    queryKey: ['columnMap', boardId],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_COLUMN_MAP)
      : async () => {
          const rows = await apiClient.call<ColumnRow[]>('fetchBoardColumns', { boardId });
          const map = {} as Record<KanbanColumna, number>;
          for (const row of rows) {
            const columna = KANBAN_NAME_TO_COLUMNA[row.Board_Column_Name];
            if (columna) map[columna] = row.Board_Column_ID;
          }
          return map;
        },
    staleTime: Infinity, // las columnas no cambian en runtime
    retry:     1,
  });

  return data;
}