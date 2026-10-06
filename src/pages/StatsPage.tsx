import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useStatsData }        from '@/features/requests/hooks/useStatsData';
import { useBoardTeams, useMyBoardTeams } from '@/features/requests/hooks/useBoardMetadata';
import { useCurrentUser }      from '@/features/requests/hooks/useCurrentUser';
import { useStatsStartConfig } from '@/features/requests/hooks/useKanbanAdmin';
import { useRole }             from '@/auth/roles';
import { config }              from '@/config';
import { useStatsUIStore }     from '@/store/statsStore';
import '@/styles/stats.css';
import { StatsSkeleton }       from '@/features/requests/components/StatsSkeleton';
import { StatsTeamTabs }       from '@/features/requests/components/stats/StatsTeamTabs';
import { StatsControlBar }     from '@/features/requests/components/stats/StatsControlBar';
import { SprintSection }       from '@/features/requests/components/stats/SprintSection';
import { GlobalSection }       from '@/features/requests/components/stats/GlobalSection';
import { TeamDetailSection }   from '@/features/requests/components/stats/TeamDetailSection';
import { FlowSection }         from '@/features/requests/components/stats/FlowSection';
import { GLOBAL_KEY, useStatsAutoSelection } from '@/features/requests/components/stats/useStatsAutoSelection';
import { scopeLabel }          from '@/features/requests/components/stats/statsFormat';

/** Equipos visibles para el usuario: admin ve todos; el resto solo los kanbans
 *  que tiene asignados. Se excluyen externos e integraciones (sin métricas). */
function useVisibleBoardTeams() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = useRole().role === 'admin';
  const { data: allTeams = [] } = useBoardTeams(config.DEFAULT_BOARD_ID);
  const { data: myTeams  = [] } = useMyBoardTeams(currentUser?.User_ID ?? null);
  return useMemo(
    () => (isAdmin ? allTeams : myTeams).filter(
      (t) => !t.Board_Team_Is_External && !t.Board_Team_Is_Integration,
    ),
    [isAdmin, allTeams, myTeams],
  );
}

/* ════════════════════════════════════════════════════════════
   StatsPage — Dashboard unificado
════════════════════════════════════════════════════════════ */
export function StatsPage() {
  const sprintIds     = useStatsUIStore(s => s.sprintIds);
  const userFilter    = useStatsUIStore(s => s.userFilter);
  const teamTab       = useStatsUIStore(s => s.teamTab);
  const selectedTeams = useStatsUIStore(s => s.selectedTeams);
  const selectedYear  = useStatsUIStore(s => s.selectedYear);

  const setSprintIds    = useStatsUIStore(s => s.setSprintIds);
  const setUserFilter   = useStatsUIStore(s => s.setUserFilter);
  const setTeamTab      = useStatsUIStore(s => s.setTeamTab);
  const toggleTeam      = useStatsUIStore(s => s.toggleTeam);
  const setSelectedYear = useStatsUIStore(s => s.setSelectedYear);

  const boardTeams = useVisibleBoardTeams();
  const { data: statsStartConfig } = useStatsStartConfig(config.DEFAULT_BOARD_ID);
  const teamColorMap = useMemo(() => Object.fromEntries(boardTeams.map(t => [t.Board_Team_Code, t.Board_Team_Color])), [boardTeams]);
  const teamNameMap  = useMemo(() => Object.fromEntries(boardTeams.map(t => [t.Board_Team_Code, t.Board_Team_Name])),  [boardTeams]);

  // Con un solo equipo la vista "global" (que agrega varios) no aporta: se oculta.
  const canSeeGlobal = boardTeams.length > 1;
  const isGlobal     = canSeeGlobal && teamTab === GLOBAL_KEY;
  const isCombined   = !isGlobal && selectedTeams.length >= 2;

  const stats = useStatsData(sprintIds, boardTeams, userFilter, isGlobal ? null : teamTab, statsStartConfig ?? undefined, isGlobal ? [] : selectedTeams);
  useStatsAutoSelection(stats.sprints, boardTeams);

  /** Board_Team_ID del tab seleccionado — null en Global */
  const selectedBoardTeamId = useMemo(
    () => isGlobal ? null : (boardTeams.find(t => t.Board_Team_Code === teamTab)?.Board_Team_ID ?? null),
    [isGlobal, boardTeams, teamTab],
  );
  // IDs de los equipos combinados, para el dropdown de usuario en modo multi.
  const combinedBoardTeamIds = useMemo(
    () => isGlobal ? [] : selectedTeams
      .map(code => boardTeams.find(t => t.Board_Team_Code === code)?.Board_Team_ID)
      .filter((id): id is number => id != null),
    [isGlobal, selectedTeams, boardTeams],
  );

  const boardData = isGlobal ? null : (isCombined ? stats.boardCombined : stats.boards[teamTab]);
  // El delta vs sprint anterior se oculta en modo combinado (acordado Fase 1).
  const boardPrev = (isGlobal || isCombined) ? undefined : stats.boardsPrev?.[teamTab];
  const teamColor = isGlobal ? 'var(--accent)' : (teamColorMap[teamTab] ?? 'var(--accent)');
  const scope     = scopeLabel(isGlobal, isCombined, selectedTeams, teamTab, teamNameMap);

  return (
    <div className="stats-page">
      <StatsTeamTabs
        teams={boardTeams}
        selectedTeams={selectedTeams}
        isGlobal={isGlobal}
        canSeeGlobal={canSeeGlobal}
        teamColorMap={teamColorMap}
        onToggleTeam={toggleTeam}
        onSelectGlobal={() => setTeamTab(GLOBAL_KEY)}
      />

      <StatsControlBar
        sprints={stats.sprints}
        sprintIds={sprintIds}
        onSprintIdsChange={setSprintIds}
        selectedYear={selectedYear}
        onYearChange={setSelectedYear}
        boardTeamId={selectedBoardTeamId}
        boardTeamIds={combinedBoardTeamIds}
        userFilter={userFilter}
        onUserFilterChange={setUserFilter}
      />

      {stats.isLoading && <StatsSkeleton />}
      {stats.isError   && <div className="stats-error"><AlertTriangle size={16} /><span>Error al cargar los datos.</span></div>}

      {!stats.isLoading && !stats.isError && (
        <>
          <SprintSection
            sp={stats.sprint}
            boardData={boardData}
            scope={scope}
            boardTeamId={selectedBoardTeamId}
            isSingleTeam={!isGlobal && !isCombined}
          />

          {isGlobal && (
            <GlobalSection gn={stats.general} boards={stats.boards} teamColorMap={teamColorMap} teamNameMap={teamNameMap} />
          )}

          {!isGlobal && boardData && (
            <TeamDetailSection
              boardData={boardData}
              boardPrev={boardPrev}
              scope={scope}
              isCombined={isCombined}
              teamTab={teamTab}
              teamName={teamNameMap[teamTab] ?? teamTab}
              teamColor={teamColor}
              userFilter={userFilter}
            />
          )}

          <FlowSection fl={stats.flow} scope={scope} />
        </>
      )}
    </div>
  );
}
