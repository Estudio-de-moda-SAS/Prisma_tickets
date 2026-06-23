import type { ActionHandler } from '../shared/types.ts';

export const sprintHandlers: Record<string, ActionHandler> = {
  fetchSprints: async (_payload, { supabase }) => {
    const { data, error } = await supabase
      .from('TBL_Sprint')
      .select(`
        Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date,
        capacities:TBL_Sprint_Team_Capacity (
          Capacity_ID, Board_Team_ID, External_Capacity
        )
      `)
      .order('Sprint_Start_Date', { ascending: false });
    if (error) throw new Error(error.message);
    return data;
  },

  createSprint: async (payload, { supabase }) => {
    const { text, startDate, endDate, teamCapacities } = payload as {
      text: string; startDate: string; endDate: string;
      teamCapacities?: { teamId: number; capacity: number }[];
    };
    const { data, error } = await supabase
      .from('TBL_Sprint')
      .insert({ Sprint_Text: text, Sprint_Start_Date: startDate, Sprint_End_Date: endDate })
      .select('Sprint_ID, Sprint_Text, Sprint_Start_Date, Sprint_End_Date').single();
    if (error) throw new Error(error.message);
    const sprint = data as { Sprint_ID: number; Sprint_Text: string; Sprint_Start_Date: string; Sprint_End_Date: string };
    if (teamCapacities && teamCapacities.length > 0) {
      await supabase.from('TBL_Sprint_Team_Capacity').insert(
        teamCapacities.map((tc) => ({
          Sprint_ID:         sprint.Sprint_ID,
          Board_Team_ID:     tc.teamId,
          External_Capacity: tc.capacity,
        }))
      );
    }
    return {
      ...sprint,
      capacities: (teamCapacities ?? []).map((tc) => ({
        Capacity_ID: null, Board_Team_ID: tc.teamId, External_Capacity: tc.capacity,
      })),
    };
  },

  updateSprint: async (payload, { supabase }) => {
    const { id, text, startDate, endDate, teamCapacities } = payload as {
      id: number; text: string; startDate: string; endDate: string;
      teamCapacities?: { teamId: number; capacity: number }[];
    };
    const { error } = await supabase
      .from('TBL_Sprint').update({ Sprint_Text: text, Sprint_Start_Date: startDate, Sprint_End_Date: endDate }).eq('Sprint_ID', id);
    if (error) throw new Error(error.message);
    if (teamCapacities && teamCapacities.length > 0) {
      await Promise.all(
        teamCapacities.map((tc) =>
          supabase.from('TBL_Sprint_Team_Capacity').upsert(
            { Sprint_ID: id, Board_Team_ID: tc.teamId, External_Capacity: tc.capacity },
            { onConflict: 'Sprint_ID,Board_Team_ID' }
          )
        )
      );
    }
    return { ok: true };
  },

  deleteSprint: async (payload, { supabase }) => {
    const { id } = payload as { id: number };
    const { error } = await supabase.from('TBL_Sprint').delete().eq('Sprint_ID', id);
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  triggerSprintStartMoves: async (payload, { supabase }) => {
    const { boardId: trigBoardId } = payload as { boardId?: number };
    const bId = trigBoardId ?? 1;

    const { data: sinCatCol } = await supabase
      .from('TBL_Board_Columns').select('Board_Column_ID')
      .eq('Board_Column_Board_ID', bId).eq('Board_Column_Slug', 'sin_categorizar').maybeSingle();

    const { data: todoCol } = await supabase
      .from('TBL_Board_Columns')
      .select('Board_Column_ID, Board_Column_Name')
      .eq('Board_Column_Board_ID', bId)
      .neq('Board_Column_Slug', 'sin_categorizar')
      .order('Board_Column_Position', { ascending: true })
      .limit(1).maybeSingle();

    if (!sinCatCol || !todoCol) throw new Error('triggerSprintStartMoves: columnas origen/destino no encontradas.');

    const today = new Date().toISOString().split('T')[0];

    const { data: startingSprints } = await supabase
      .from('TBL_Sprint').select('Sprint_ID')
      .gte('Sprint_Start_Date', `${today}T00:00:00.000Z`)
      .lte('Sprint_Start_Date', `${today}T23:59:59.999Z`);

    if (!startingSprints || (startingSprints as any[]).length === 0)
      return { ok: true, moved: 0, message: 'No hay sprints que inicien hoy.' };

    const sprintIds = (startingSprints as any[]).map((s: any) => s.Sprint_ID);

    const { data: sprintLinks } = await supabase
      .from('TBL_Request_Sprint').select('Request_Sprint_Request_ID')
      .in('Request_Sprint_ID', sprintIds);

    const reqIds = [...new Set((sprintLinks ?? []).map((l: any) => l.Request_Sprint_Request_ID))];
    if (reqIds.length === 0) return { ok: true, moved: 0 };

    const { data: toMove } = await supabase
      .from('TBL_Requests').select('Request_ID')
      .in('Request_ID', reqIds)
      .eq('Request_Board_Column_ID', (sinCatCol as any).Board_Column_ID)
      .is('Request_Finished_At', null);

    if (!toMove || (toMove as any[]).length === 0) return { ok: true, moved: 0 };

    const moveIds = (toMove as any[]).map((r: any) => r.Request_ID);
    const { error: moveErr } = await supabase
      .from('TBL_Requests').update({ Request_Board_Column_ID: (todoCol as any).Board_Column_ID })
      .in('Request_ID', moveIds);

    if (moveErr) throw new Error(moveErr.message);
    return { ok: true, moved: moveIds.length, destColumn: (todoCol as any).Board_Column_Name };
  },
};
