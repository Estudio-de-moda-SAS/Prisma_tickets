import type { ActionHandler } from '../shared/types.ts';

export const columnHandlers: Record<string, ActionHandler> = {
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
