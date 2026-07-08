import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const GLOBAL_KEY = 'global';

interface StatsUIState {
  sprintIds:    number[];
  userFilter:   number | null;
  teamTab:      string;
  /** Equipos combinados (multi-selección). Vacío o 1 = comportamiento clásico. */
  selectedTeams: string[];
  selectedYear: number;
  /** Flags para que el auto-seleccionado solo corra la PRIMERA vez */
  teamPicked:   boolean;
  sprintPicked: boolean;

  setSprintIds:     (ids: number[]) => void;
  setUserFilter:    (id: number | null) => void;
  setTeamTab:       (code: string) => void;
  setSelectedTeams: (codes: string[]) => void;
  toggleTeam:       (code: string) => void;
  setSelectedYear:  (year: number) => void;
  markTeamPicked:   () => void;
  markSprintPicked: () => void;
}

export const useStatsUIStore = create<StatsUIState>()(
  persist(
    (set) => ({
      sprintIds:    [],
      userFilter:   null,
      teamTab:      GLOBAL_KEY,
      selectedTeams: [],
      selectedYear: new Date().getFullYear(),
      teamPicked:   false,
      sprintPicked: false,

      setSprintIds:     (ids)  => set({ sprintIds: ids }),
      setUserFilter:    (id)   => set({ userFilter: id }),
      // Al fijar un tab clásico (o Global), la multi-selección se resetea a ese equipo.
      setTeamTab:       (code) => set({
        teamTab: code,
        selectedTeams: code === GLOBAL_KEY ? [] : [code],
      }),
      setSelectedTeams: (codes) => set({ selectedTeams: codes }),
      // Suma/quita un equipo de la combinación. Nunca incluye 'global'.
      toggleTeam:       (code) => set((s) => {
        if (code === GLOBAL_KEY) return { teamTab: GLOBAL_KEY, selectedTeams: [] };
        const has  = s.selectedTeams.includes(code);
        const next = has ? s.selectedTeams.filter(c => c !== code) : [...s.selectedTeams, code];
        // Si quedó vacío, no dejamos la vista huérfana: volvemos a ese equipo solo.
        const safe = next.length === 0 ? [code] : next;
        return { selectedTeams: safe, teamTab: safe[0] };
      }),
      setSelectedYear:  (year) => set({ selectedYear: year }),
      markTeamPicked:   () => set({ teamPicked: true }),
      markSprintPicked: () => set({ sprintPicked: true }),
    }),
    {
      name: 'prisma-stats-ui',
      // Solo persistimos la SELECCIÓN de UI; nunca datos calculados
      partialize: (s) => ({
        sprintIds:    s.sprintIds,
        userFilter:   s.userFilter,
        teamTab:      s.teamTab,
        selectedTeams: s.selectedTeams,
        selectedYear: s.selectedYear,
        teamPicked:   s.teamPicked,
        sprintPicked: s.sprintPicked,
      }),
    },
  ),
);