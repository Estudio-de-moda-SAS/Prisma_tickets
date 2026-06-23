import type { ActionHandler } from '../shared/types.ts';

export const teamColumnConfigHandlers: Record<string, ActionHandler> = {
  fetchTeamColumnConfig: async (payload, { supabase }) => {
    const { boardId, teamId } = payload as { boardId: number; teamId: number };
    const { data: cols, error: colsErr } = await supabase
      .from('TBL_Board_Columns')
      .select('Board_Column_ID, Board_Column_Name, Board_Column_Slug, Board_Column_Position, Board_Column_Color, Board_Column_Limit')
      .eq('Board_Column_Board_ID', boardId)
      .order('Board_Column_Position', { ascending: true });
    if (colsErr) throw new Error(colsErr.message);

    const columnIds = (cols as any[]).map((c) => c.Board_Column_ID);
    const { data: configs, error: configsErr } = await supabase
      .from('TBL_Team_Column_Config')
      .select('Config_ID, Column_ID, Is_Visible, Evidence_Required, Evidence_Label, Is_Close_Column, Is_Stats_Start, Team_Column_Color, Team_Column_Title_Color')
      .eq('Team_ID', teamId)
      .in('Column_ID', columnIds.length > 0 ? columnIds : [-1]);
    if (configsErr) throw new Error(configsErr.message);

    const configMap = new Map<number, any>();
    for (const c of (configs ?? []) as any[]) configMap.set(c.Column_ID, c);

    return (cols as any[]).map((col) => {
      const cfg = configMap.get(col.Board_Column_ID);
      return {
        Board_Column_ID:       col.Board_Column_ID,
        Board_Column_Name:     col.Board_Column_Name,
        Board_Column_Slug:     col.Board_Column_Slug ?? '',
        Board_Column_Position: col.Board_Column_Position,
        Board_Column_Color:    col.Board_Column_Color,
        Board_Column_Limit:    col.Board_Column_Limit,
        Config_ID:             cfg?.Config_ID         ?? null,
        Is_Visible:            cfg?.Is_Visible         ?? true,
        Evidence_Required:     cfg?.Evidence_Required  ?? false,
        Evidence_Label:        cfg?.Evidence_Label      ?? null,
        Is_Close_Column:         cfg?.Is_Close_Column         ?? false,
        Is_Stats_Start:          cfg?.Is_Stats_Start           ?? false,
        Team_Column_Color:       cfg?.Team_Column_Color        ?? null,
        Team_Column_Title_Color: cfg?.Team_Column_Title_Color  ?? null,
      };
    });
  },

  upsertTeamColumnConfig: async (payload, { supabase }) => {
    const { teamId, columnId, isVisible, evidenceRequired, evidenceLabel, isCloseColumn, teamColor, teamTitleColor } = payload as {
      teamId: number; columnId: number;
      isVisible: boolean; evidenceRequired: boolean;
      evidenceLabel: string | null; isCloseColumn?: boolean;
      teamColor?: string | null; teamTitleColor?: string | null;
    };
    const row: Record<string, unknown> = {
      Team_ID:           teamId,
      Column_ID:         columnId,
      Is_Visible:        isVisible,
      Evidence_Required: evidenceRequired,
      Evidence_Label:    evidenceLabel ?? null,
      Is_Close_Column:   isCloseColumn ?? false,
    };
    if (teamColor      !== undefined) row['Team_Column_Color']       = teamColor;
    if (teamTitleColor !== undefined) row['Team_Column_Title_Color'] = teamTitleColor;
    const { error } = await supabase
      .from('TBL_Team_Column_Config')
      .upsert(row, { onConflict: 'Team_ID,Column_ID' });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  setStatsStartColumn: async (payload, { supabase }) => {
    const { teamId, columnId } = payload as { teamId: number; columnId: number | null };

    const { data: current } = await supabase
      .from('TBL_Team_Column_Config')
      .select('Config_ID, Column_ID')
      .eq('Team_ID', teamId)
      .eq('Is_Stats_Start', true)
      .maybeSingle();

    if (current && columnId !== null && (current as any).Column_ID === columnId) {
      await supabase
        .from('TBL_Team_Column_Config')
        .update({ Is_Stats_Start: false })
        .eq('Config_ID', (current as any).Config_ID);
      return { ok: true };
    }

    if (current) {
      await supabase
        .from('TBL_Team_Column_Config')
        .update({ Is_Stats_Start: false })
        .eq('Config_ID', (current as any).Config_ID);
    }

    if (columnId !== null) {
      const { data: targetRow } = await supabase
        .from('TBL_Team_Column_Config')
        .select('Config_ID')
        .eq('Team_ID', teamId)
        .eq('Column_ID', columnId)
        .maybeSingle();

      if (targetRow) {
        await supabase
          .from('TBL_Team_Column_Config')
          .update({ Is_Stats_Start: true })
          .eq('Config_ID', (targetRow as any).Config_ID);
      } else {
        await supabase
          .from('TBL_Team_Column_Config')
          .insert({
            Team_ID:           teamId,
            Column_ID:         columnId,
            Is_Visible:        true,
            Evidence_Required: false,
            Evidence_Label:    null,
            Is_Close_Column:   false,
            Is_Stats_Start:    true,
          });
      }
    }
    return { ok: true };
  },

  fetchStatsStartConfig: async (payload, { supabase }) => {
    const { boardId } = payload as { boardId: number };

    const { data: cols, error: colsErr } = await supabase
      .from('TBL_Board_Columns')
      .select('Board_Column_ID, Board_Column_Slug, Board_Column_Position')
      .eq('Board_Column_Board_ID', boardId)
      .order('Board_Column_Position', { ascending: true });
    if (colsErr) throw new Error(colsErr.message);

    const { data: allTeams, error: teamsErr } = await supabase
      .from('TBL_Board_Teams')
      .select('Board_Team_ID, Board_Team_Code');
    if (teamsErr) throw new Error(teamsErr.message);

    const teamIds = (allTeams as any[]).map((t) => t.Board_Team_ID);

    const { data: statsConfigs } = await supabase
      .from('TBL_Team_Column_Config')
      .select('Team_ID, Column_ID, Is_Stats_Start')
      .in('Team_ID', teamIds.length > 0 ? teamIds : [-1])
      .eq('Is_Stats_Start', true);

    const columnPositions:  Record<string, number> = {};
    const colIdToPos:       Record<number, number> = {};
    for (const col of (cols as any[])) {
      columnPositions[col.Board_Column_Slug] = col.Board_Column_Position;
      colIdToPos[col.Board_Column_ID]        = col.Board_Column_Position;
    }

    const statsStartByTeam: Record<string, number> = {};
    for (const cfg of ((statsConfigs ?? []) as any[])) {
      const team = (allTeams as any[]).find((t) => t.Board_Team_ID === cfg.Team_ID);
      if (team) {
        const pos = colIdToPos[cfg.Column_ID];
        if (pos !== undefined) statsStartByTeam[team.Board_Team_Code] = pos;
      }
    }

    return { columnPositions, statsStartByTeam };
  },
};
