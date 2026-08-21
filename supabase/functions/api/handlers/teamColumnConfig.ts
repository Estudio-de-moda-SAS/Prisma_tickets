/**
 * Handlers de configuración de columnas por equipo (`TBL_Team_Column_Config`).
 *
 * Registrados en {@link teamColumnConfigHandlers} y despachados desde el Edge
 * Function único vía el envelope `{ action, payload }`. Un board tiene columnas
 * globales (`TBL_Board_Columns`), pero cada equipo puede sobrescribir su
 * comportamiento por columna: visibilidad, requerimiento de evidencia, si cierra
 * el ticket, colores propios y cuál columna marca el inicio del conteo de
 * estadísticas. Los valores efectivos se resuelven combinando la columna global
 * con el override del equipo (con defaults cuando no hay config).
 *
 * @module
 */
import type { ActionHandler } from '../shared/types.ts';

/**
 * Mapa de handlers de configuración de columnas por equipo, indexado por acción.
 *
 * Consumido por el dispatcher del Edge Function; cada clave corresponde al
 * `action` recibido en el envelope `{ action, payload }`.
 */
export const teamColumnConfigHandlers: Record<string, ActionHandler> = {
  /**
   * Devuelve las columnas de un board con la config efectiva de un equipo.
   *
   * Trae las columnas globales del board y las combina con los overrides del
   * equipo (`TBL_Team_Column_Config`), aplicando defaults cuando el equipo no
   * tiene config para una columna (visible, sin evidencia, no cierra, colores
   * nulos, etc.).
   *
   * @param payload - `{ boardId, teamId }`.
   * @returns Las columnas del board con la config resuelta para el equipo.
   */
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

  /**
   * Crea o actualiza la config de una columna para un equipo (upsert).
   *
   * Upsert sobre la clave compuesta `(Team_ID, Column_ID)`. Los colores solo se
   * incluyen en el update si vienen definidos en el payload (permite tocar
   * visibilidad/evidencia sin pisar los colores existentes).
   *
   * @param payload - `{ teamId, columnId, isVisible, evidenceRequired, evidenceLabel, isCloseColumn?, teamColor?, teamTitleColor? }`.
   * @returns `{ ok: true }` tras el upsert.
   */
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

  /**
   * Fija (o alterna) la columna que marca el inicio del conteo de estadísticas.
   *
   * Solo puede haber una columna de inicio de stats por equipo. Comportamiento:
   * si se vuelve a fijar la que ya estaba, la desmarca (toggle off); si es otra,
   * desmarca la anterior y marca la nueva —creando la fila de config si el equipo
   * aún no tenía una para esa columna. Con `columnId` en null, solo desmarca la
   * actual.
   *
   * @param payload - `{ teamId, columnId }` (`columnId` null para limpiar).
   * @returns `{ ok: true }` tras aplicar el cambio.
   */
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

  /**
   * Resuelve, para todo el board, la columna de inicio de stats de cada equipo.
   *
   * Devuelve dos mapas: `columnPositions` (slug de columna → posición) y
   * `statsStartByTeam` (código de equipo → posición de su columna de inicio de
   * stats). El front usa estas posiciones para saber a partir de qué punto del
   * flujo empieza a contar cada equipo.
   *
   * @param payload - `{ boardId }`.
   * @returns `{ columnPositions, statsStartByTeam }`.
   */
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