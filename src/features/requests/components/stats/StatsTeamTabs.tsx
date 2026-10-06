import { Globe } from 'lucide-react';
import type { BoardTeam } from '@/features/requests/hooks/useBoardMetadata';

/** Tabs primarios de equipo (multiselección) + tab Global. */
export function StatsTeamTabs({ teams, selectedTeams, isGlobal, canSeeGlobal, teamColorMap, onToggleTeam, onSelectGlobal }: {
  teams:          BoardTeam[];
  selectedTeams:  string[];
  isGlobal:       boolean;
  canSeeGlobal:   boolean;
  teamColorMap:   Record<string, string>;
  onToggleTeam:   (code: string) => void;
  onSelectGlobal: () => void;
}) {
  return (
    <div className="stats-primary-tabs">
      {teams.map(t => {
        const isSel = !isGlobal && selectedTeams.includes(t.Board_Team_Code);
        return (
          <button key={t.Board_Team_Code}
            className={['stats-primary-tab', isSel ? 'stats-primary-tab--active' : ''].join(' ')}
            style={{ '--tab-color': teamColorMap[t.Board_Team_Code] ?? 'var(--accent)' } as React.CSSProperties}
            onClick={() => onToggleTeam(t.Board_Team_Code)}>
            <span className="stats-primary-tab__dot" style={{ background: teamColorMap[t.Board_Team_Code] ?? '#888' }} />
            {t.Board_Team_Name}
          </button>
        );
      })}
      {canSeeGlobal && (
        <button
          className={['stats-primary-tab', isGlobal ? 'stats-primary-tab--active' : ''].join(' ')}
          style={{ '--tab-color': 'var(--txt-muted)' } as React.CSSProperties}
          onClick={onSelectGlobal}>
          <Globe size={12} />
          Global
        </button>
      )}
    </div>
  );
}
