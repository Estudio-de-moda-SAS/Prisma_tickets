import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const GLOBAL_KEY = 'global';

interface StatsUIState {
  sprintIds:    number[];
  userFilter:   number | null;
  teamTab:      string;
  selectedYear: number;
  /** Flags para que el auto-seleccionado solo corra la PRIMERA vez */
  teamPicked:   boolean;
  sprintPicked: boolean;

  setSprintIds:     (ids: number[]) => void;
  setUserFilter:    (id: number | null) => void;
  setTeamTab:       (code: string) => void;
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
      selectedYear: new Date().getFullYear(),
      teamPicked:   false,
      sprintPicked: false,

      setSprintIds:     (ids)  => set({ sprintIds: ids }),
      setUserFilter:    (id)   => set({ userFilter: id }),
      setTeamTab:       (code) => set({ teamTab: code }),
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
        selectedYear: s.selectedYear,
        teamPicked:   s.teamPicked,
        sprintPicked: s.sprintPicked,
      }),
    },
  ),
);