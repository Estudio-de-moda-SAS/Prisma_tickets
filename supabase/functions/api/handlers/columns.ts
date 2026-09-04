/**
 * Handlers CRUD de columnas de un board Kanban (`TBL_Board_Columns`).
 *
 * Registrados en {@link columnHandlers} y despachados desde el Edge Function
 * único vía el envelope `{ action, payload }`. Cubre listar, crear, actualizar
 * y reordenar columnas dentro de un board.
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';

/**
 * Mapa de handlers de columnas indexado por nombre de acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const columnHandlers: Record<string, ActionHandler> = {
  /**
   * Lista las columnas de un board ordenadas por posición.
   *
   * @param payload - `{ boardId }`.
   * @returns Las columnas del board en orden ascendente de posición.
   */
  fetchBoardColumns: async (payload, { supabase }) => {
    const { boardId } = payload as { boardId: number };
    const { data, error } = await supabase
      .from('TBL_Board_Columns')
      .select('Board_Column_ID, Board_Column_Name, Board_Column_Slug, Board_Column_Position, Board_Column_Color, Board_Column_Limit')
      .eq('Board_Column_Board_ID', boardId)
      .order('Board_Column_Position', { ascending: true });
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Actualiza nombre, color y límite (WIP) de una columna.
   *
   * @param payload - `{ columnId, name, color, limit }`.
   * @returns `{ ok: true }` tras actualizar.
   */
  updateBoardColumn: async (payload, { supabase }) => {
    const { columnId, name, color, limit } = payload as {
      columnId: number; name: string; color: string; limit: number;
    };
    const { error } = await supabase
      .from('TBL_Board_Columns')
      .update({
        Board_Column_Name:  name.trim(),
        Board_Column_Color: color,
        Board_Column_Limit: limit,
      })
      .eq('Board_Column_ID', columnId);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  /**
   * Crea una columna nueva al final del board.
   *
   * Deriva el `slug` a partir del nombre: quita acentos (normalización NFD),
   * pasa a minúsculas, reemplaza espacios por guiones bajos y descarta todo
   * carácter que no sea alfanumérico o `_`. La posición es la máxima actual + 1
   * (o 0 si es la primera columna del board).
   *
   * @param payload - `{ boardId, name, color, limit }`.
   * @returns La columna creada.
   */
  createBoardColumn: async (payload, { supabase }) => {
    const { boardId, name, color, limit } = payload as {
      boardId: number; name: string; color: string; limit: number;
    };
    const slug = name
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');

    const { data: maxData } = await supabase
      .from('TBL_Board_Columns')
      .select('Board_Column_Position')
      .eq('Board_Column_Board_ID', boardId)
      .order('Board_Column_Position', { ascending: false })
      .limit(1).maybeSingle();
    const nextPos = maxData ? ((maxData as any).Board_Column_Position + 1) : 0;

    const { data, error } = await supabase
      .from('TBL_Board_Columns')
      .insert({
        Board_Column_Board_ID: boardId,
        Board_Column_Name:     name.trim(),
        Board_Column_Slug:     slug,
        Board_Column_Color:    color,
        Board_Column_Limit:    limit ?? 0,
        Board_Column_Position: nextPos,
      })
      .select('Board_Column_ID, Board_Column_Name, Board_Column_Slug, Board_Column_Position, Board_Column_Color, Board_Column_Limit')
      .single();
    if (error) throw new Error(error.message);
    return data;
  },

  /**
   * Mueve una columna una posición hacia arriba o abajo dentro de su board.
   *
   * Intercambia el `Board_Column_Position` con la columna vecina inmediata. Si
   * la columna ya está en el extremo del board, no hace nada.
   *
   * @param payload - `{ columnId, direction: 'up' | 'down', boardId }`.
   * @returns `{ ok: true }` (idempotente aunque no haya movimiento).
   */
  reorderBoardColumn: async (payload, { supabase }) => {
    const { columnId, direction, boardId } = payload as {
      columnId: number; direction: 'up' | 'down'; boardId: number;
    };
    const { data: cols, error: colsErr } = await supabase
      .from('TBL_Board_Columns')
      .select('Board_Column_ID, Board_Column_Position')
      .eq('Board_Column_Board_ID', boardId)
      .order('Board_Column_Position', { ascending: true });
    if (colsErr) throw new Error(colsErr.message);
    const sorted = cols as { Board_Column_ID: number; Board_Column_Position: number }[];
    const idx = sorted.findIndex((c) => c.Board_Column_ID === columnId);
    if (idx === -1) return { ok: true };
    const si = direction === 'up' ? idx - 1 : idx + 1;
    if (si < 0 || si >= sorted.length) return { ok: true };
    const posA = sorted[idx].Board_Column_Position;
    const posB = sorted[si].Board_Column_Position;
    const idB  = sorted[si].Board_Column_ID;
    await Promise.all([
      supabase.from('TBL_Board_Columns').update({ Board_Column_Position: posB }).eq('Board_Column_ID', columnId),
      supabase.from('TBL_Board_Columns').update({ Board_Column_Position: posA }).eq('Board_Column_ID', idB),
    ]);
    return { ok: true };
  },
};