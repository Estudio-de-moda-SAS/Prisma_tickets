import { useEffect, useRef } from 'react';
import type { BoardTeam } from '@/features/requests/hooks/useBoardMetadata';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import { useStatsUIStore } from '@/store/statsStore';
import { getSprintYear } from './statsFormat';

export const GLOBAL_KEY = 'global';

/** Auto-selecciona el sprint activo; si no hay ninguno activo, el más reciente con fecha. */
function useAutoSelectSprint(sprints: Sprint[]) {
  const sprintPicked     = useStatsUIStore(s => s.sprintPicked);
  const markSprintPicked = useStatsUIStore(s => s.markSprintPicked);
  const setSprintIds     = useStatsUIStore(s => s.setSprintIds);
  const setSelectedYear  = useStatsUIStore(s => s.setSelectedYear);

  useEffect(() => {
    if (sprints.length === 0 || sprintPicked) return;
    markSprintPicked();
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dated = sprints.filter(s => s.Sprint_Start_Date && s.Sprint_End_Date);
    const active = dated.find(s =>
      s.Sprint_Start_Date.slice(0, 10) <= today && today <= s.Sprint_End_Date.slice(0, 10)
    );
    const fallback = [...dated].sort((a, b) => b.Sprint_ID - a.Sprint_ID)[0];
    const chosen = active ?? fallback;
    if (chosen) {
      setSprintIds([chosen.Sprint_ID]);
      const y = getSprintYear(chosen);
      if (y !== null) setSelectedYear(y);
    }
  }, [sprints, sprintPicked, markSprintPicked, setSprintIds, setSelectedYear]);
}

/** Garantiza un tab de equipo válido: el guardado puede apuntar a un equipo que
 *  el usuario ya no ve. 'global' solo es válido con 2+ equipos. */
function useValidTeamTab(boardTeams: BoardTeam[]) {
  const teamTab        = useStatsUIStore(s => s.teamTab);
  const teamPicked     = useStatsUIStore(s => s.teamPicked);
  const markTeamPicked = useStatsUIStore(s => s.markTeamPicked);
  const setTeamTab     = useStatsUIStore(s => s.setTeamTab);

  useEffect(() => {
    if (boardTeams.length === 0) return;
    const validCodes = boardTeams.map(t => t.Board_Team_Code);
    const tabIsValid =
      (teamTab === GLOBAL_KEY && boardTeams.length > 1) ||
      validCodes.includes(teamTab);
    if (!tabIsValid) {
      setTeamTab(boardTeams[0].Board_Team_Code);
    }
    if (!teamPicked) markTeamPicked();
  }, [boardTeams, teamTab, teamPicked, markTeamPicked, setTeamTab]);
}

/** Resetea el filtro de usuario al cambiar de equipo (evita filtros huérfanos). */
function useResetUserOnTeamChange() {
  const teamTab       = useStatsUIStore(s => s.teamTab);
  const setUserFilter = useStatsUIStore(s => s.setUserFilter);
  const prevTeamTab   = useRef(teamTab);

  useEffect(() => {
    if (prevTeamTab.current !== teamTab) {
      prevTeamTab.current = teamTab;
      setUserFilter(null);
    }
  }, [teamTab, setUserFilter]);
}

/** Sincronizaciones automáticas de la página de estadísticas. */
export function useStatsAutoSelection(sprints: Sprint[], boardTeams: BoardTeam[]) {
  useAutoSelectSprint(sprints);
  useValidTeamTab(boardTeams);
  useResetUserOnTeamChange();
}
