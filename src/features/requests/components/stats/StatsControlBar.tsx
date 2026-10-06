import { useMemo } from 'react';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import { SprintSelector } from './SprintSelector';
import { UserFilterDropdown } from './UserFilterDropdown';
import { fmtDate, getSprintYear } from './statsFormat';

/** Años disponibles entre todos los sprints (fecha o nombre), siempre con el actual. */
function useAvailableYears(sprints: Sprint[]): number[] {
  return useMemo(() => {
    const years = new Set<number>();
    for (const s of sprints) {
      const y = getSprintYear(s);
      if (y !== null) years.add(y);
    }
    years.add(new Date().getFullYear()); // siempre incluir el año actual
    return [...years].sort((a, b) => b - a);
  }, [sprints]);
}

/** Rango de fechas de los sprints seleccionados con fecha, o null. */
function useSprintDatesBadge(sprints: Sprint[], sprintIds: number[]): string | null {
  return useMemo(() => {
    const sel = sprints.filter(s => sprintIds.includes(s.Sprint_ID) && s.Sprint_Start_Date && s.Sprint_End_Date);
    if (sel.length === 0) return null;
    if (sel.length === 1)
      return `${fmtDate(new Date(sel[0].Sprint_Start_Date!))} — ${fmtDate(new Date(sel[0].Sprint_End_Date!))}`;
    const sorted = [...sel].sort((a, b) => a.Sprint_Start_Date!.localeCompare(b.Sprint_Start_Date!));
    return `${fmtDate(new Date(sorted[0].Sprint_Start_Date!))} — ${fmtDate(new Date(sorted[sorted.length - 1].Sprint_End_Date!))}`;
  }, [sprints, sprintIds]);
}

/** Barra de controles: selector de sprint + rango de fechas + filtro de usuario. */
export function StatsControlBar({
  sprints, sprintIds, onSprintIdsChange, selectedYear, onYearChange,
  boardTeamId, boardTeamIds, userFilter, onUserFilterChange,
}: {
  sprints:            Sprint[];
  sprintIds:          number[];
  onSprintIdsChange:  (ids: number[]) => void;
  selectedYear:       number;
  onYearChange:       (year: number) => void;
  boardTeamId:        number | null;
  boardTeamIds:       number[];
  userFilter:         number | null;
  onUserFilterChange: (id: number | null) => void;
}) {
  const availableYears   = useAvailableYears(sprints);
  const sprintDatesBadge = useSprintDatesBadge(sprints, sprintIds);

  return (
    <div className="stats-control-bar">
      <div className="stats-control-bar__left">
        <SprintSelector
          sprints={sprints}
          selectedIds={sprintIds}
          onChange={onSprintIdsChange}
          selectedYear={selectedYear}
          onYearChange={onYearChange}
          availableYears={availableYears}
        />
        {sprintDatesBadge && <span className="sprint-dates-badge">{sprintDatesBadge}</span>}
      </div>
      <div className="stats-control-bar__right">
        <UserFilterDropdown
          boardTeamId={boardTeamId}
          boardTeamIds={boardTeamIds}
          selectedUserId={userFilter}
          onSelect={onUserFilterChange}
        />
      </div>
    </div>
  );
}
