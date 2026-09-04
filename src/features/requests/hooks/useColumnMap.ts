// src/features/requests/hooks/useColumnMap.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';
import type { KanbanColumna } from '../types';

/**
 * Hook que resuelve el mapa `columna kanban → ID de columna` de un board.
 *
 * Traduce entre las claves lógicas del kanban ({@link KanbanColumna}) y los
 * `Board_Column_ID` reales de la base, para que el resto de la UI pueda mover
 * cards por su clave sin conocer los IDs concretos de cada board.
 *
 * @module useColumnMap
 */

/**
 * Mapa estático de columnas para el modo mock.
 *
 * @remarks
 * Los IDs coinciden con los del SQL de inserción de columnas.
 */
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
  cliente_review:   10,
};

/** Fila de columna tal como la devuelve `fetchBoardColumns`. */
type ColumnRow = {
  Board_Column_ID:    number;
  Board_Column_Name:  string;
  Board_Column_Slug:  string | null;
};

/**
 * Mapa de respaldo: nombre de columna (como en la BD) → clave de kanban.
 *
 * @remarks
 * Se usa como fallback cuando una columna no trae `Board_Column_Slug`. Los
 * nombres deben coincidir exactamente con los de la base (p. ej. "Client Review"
 * con R mayúscula).
 */
const KANBAN_NAME_TO_COLUMNA: Record<string, KanbanColumna> = {
  'Sin categorizar':  'sin_categorizar',
  'Icebox':           'icebox',
  'Backlog':          'backlog',
  'To do':            'todo',
  'En progreso':      'en_progreso',
  'En revisión QAS':  'en_revision_qas',
  'Ready to Deploy':  'ready_to_deploy',
  'Hecho':            'hecho',
  'Historial':        'historial',
  'Client Review':    'cliente_review',  // ← R mayúscula, igual que en la BD
};

/**
 * Devuelve el mapa `clave de columna → Board_Column_ID` de un board.
 *
 * @remarks
 * En modo mock devuelve {@link MOCK_COLUMN_MAP}. Si no, consulta las columnas del
 * board y arma el mapa usando preferentemente el `Board_Column_Slug` de la BD y,
 * como respaldo, la traducción por nombre ({@link KANBAN_NAME_TO_COLUMNA}); las
 * columnas sin slug ni nombre reconocido se omiten. `staleTime: Infinity` (la
 * configuración de columnas es estable).
 *
 * @param boardId - Board cuyas columnas se mapean.
 * @returns El mapa `clave → ID`, o `undefined` mientras la query no ha resuelto.
 */
export function useColumnMap(boardId: number): Record<string, number> | undefined {
  const { data } = useQuery<Record<KanbanColumna, number>>({
    queryKey: ['columnMap', boardId],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_COLUMN_MAP)
      : async () => {
          const rows = await apiClient.call<ColumnRow[]>('fetchBoardColumns', { boardId });
          const map = {} as Record<string, number>;
          for (const row of rows) {
            // Usar slug del DB directamente; fallback al mapeo por nombre
            const key = row.Board_Column_Slug || KANBAN_NAME_TO_COLUMNA[row.Board_Column_Name];
            if (key) map[key] = row.Board_Column_ID;
          }
          return map;
        },
    staleTime: Infinity,
    retry:     1,
  });

  return data;
}