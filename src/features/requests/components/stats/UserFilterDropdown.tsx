import { useCallback, useMemo, useRef, useState } from 'react';
import { ChevronDown, Users, Search, Check, X } from 'lucide-react';
import { useUsers }                  from '@/features/requests/hooks/useUsers';
import { useSubTeams, useSubTeamsMulti } from '@/features/requests/hooks/useSubTeams';
import { useSubTeamMembersGrouped }  from '@/features/requests/hooks/useSubTeamMembers';
import { avatarBg, fmtInits } from './statsFormat';
import { useClickOutside } from './useClickOutside';

type FilterUserRow = { User_ID: number; User_Name: string; User_Email: string; Is_Active?: boolean | null };

/** Fila de usuario seleccionable del menú. */
function UserOption({ user, active, onClick }: { user: FilterUserRow; active: boolean; onClick: () => void }) {
  return (
    <button
      className={['user-filter__item', active ? 'user-filter__item--active' : ''].join(' ')}
      onClick={onClick}>
      <div className="user-filter__avatar" style={{ background: avatarBg(user.User_ID) }}>
        {fmtInits(user.User_Name)}
      </div>
      <div className="user-filter__info">
        <span className="user-filter__name">{user.User_Name}</span>
        <span className="user-filter__email">{user.User_Email ?? ''}</span>
      </div>
      {active && <Check size={12} className="user-filter__check" />}
    </button>
  );
}

/** Filtro por miembro: agrupado por sub-equipo con equipo(s) activo(s), plano en global. */
export function UserFilterDropdown({
  boardTeamId, boardTeamIds, selectedUserId, onSelect,
}: {
  boardTeamId:    number | null;
  /** Modo combinado: varios equipos. Si tiene 2+, tiene prioridad sobre boardTeamId. */
  boardTeamIds?:  number[];
  selectedUserId: number | null;
  onSelect:       (id: number | null) => void;
}) {
  const [open, setOpen]     = useState(false);
  const [search, setSearch] = useState('');
  const ref                 = useRef<HTMLDivElement>(null);

  const close = useCallback(() => { setOpen(false); setSearch(''); }, []);
  useClickOutside(ref, open, close);

  const isMulti = (boardTeamIds?.length ?? 0) >= 2;

  // Sub-equipos: en modo combinado, de todos los equipos; si no, del único.
  const multiTeams   = useSubTeamsMulti(isMulti ? boardTeamIds! : []);
  const { data: singleSubTeams = [] } = useSubTeams(isMulti ? null : boardTeamId);

  // Lista unificada de sub-equipos para alimentar useSubTeamMembersGrouped.
  // En multi se concatenan preservando el orden por equipo.
  const subTeams = useMemo(
    () => isMulti ? multiTeams.flatMap(t => t.subTeams) : singleSubTeams,
    [isMulti, multiTeams, singleSubTeams],
  );

  const groupedMembers = useSubTeamMembersGrouped(subTeams);
  const { data: rawUsers = [] }   = useUsers() as { data: FilterUserRow[] };

  const hasTeamScope = isMulti || boardTeamId !== null;

  const allFlat = useMemo(() =>
    hasTeamScope
      ? groupedMembers.flatMap(g => g.members)
      : rawUsers.filter(u => u.Is_Active !== false),
    [hasTeamScope, groupedMembers, rawUsers],
  );

  const selUser  = allFlat.find(u => u.User_ID === selectedUserId);
  const selName  = selUser?.User_Name ?? '';
  const matches  = (name: string, email = '') =>
    !search ||
    name.toLowerCase().includes(search.toLowerCase()) ||
    email.toLowerCase().includes(search.toLowerCase());

  const pick = (id: number | null) => { onSelect(id); close(); };

  return (
    <div className="user-filter" ref={ref}>
      <button className="user-filter__btn" onClick={() => setOpen(o => !o)}>
        {selectedUserId ? (
          <>
            <div className="user-filter__avatar-mini" style={{ background: avatarBg(selectedUserId) }}>
              {fmtInits(selName)}
            </div>
            <span className="user-filter__btn-name">{selName.split(' ').slice(0, 2).join(' ')}</span>
            <span
              role="button"
              tabIndex={0}
              className="user-filter__clear"
              title="Ver todo el equipo"
              onClick={e => { e.stopPropagation(); onSelect(null); }}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onSelect(null); }
              }}
            >
              <X size={10} />
            </span>
          </>
        ) : (
          <><Users size={12} /><span>Todo el equipo</span><ChevronDown size={10} style={{ opacity: 0.5, marginLeft: 2 }} /></>
        )}
      </button>

      {open && (
        <div className="user-filter__menu">
          <div className="user-filter__search">
            <Search size={11} />
            <input placeholder="Buscar miembro…" value={search} onChange={e => setSearch(e.target.value)} autoFocus />
          </div>

          {selectedUserId !== null && (
            <button className="user-filter__item user-filter__item--reset" onClick={() => pick(null)}>
              <div className="user-filter__avatar"
                style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={13} style={{ color: 'var(--txt-muted)' }} />
              </div>
              <div className="user-filter__info">
                <span className="user-filter__name" style={{ color: 'var(--txt-muted)' }}>Todo el equipo</span>
              </div>
            </button>
          )}

          {/* ── Vista por equipo: sub-equipos (uno o varios combinados) ── */}
          {hasTeamScope && (
            <>
              {groupedMembers.length === 0 && (
                <div className="user-filter__empty">No hay sub-equipos configurados para este equipo</div>
              )}
              {groupedMembers.map(({ subTeam, members, isLoading }) => {
                const filtered = members.filter(m => matches(m.User_Name, m.User_Email));
                if (search && !isLoading && filtered.length === 0) return null;
                return (
                  <div key={subTeam.Sub_Team_ID} className="user-filter__group">
                    <div className="user-filter__group-label">
                      <span className="user-filter__team-dot" style={{ background: subTeam.Sub_Team_Color }} />
                      {subTeam.Sub_Team_Name}
                    </div>
                    {isLoading && (
                      <div className="user-filter__sub-msg">Cargando…</div>
                    )}
                    {!isLoading && filtered.length === 0 && !search && (
                      <div className="user-filter__sub-msg">
                        Sin integrantes en este sub-equipo
                      </div>
                    )}
                    {filtered.map(member => (
                      <UserOption key={member.User_ID} user={member}
                        active={selectedUserId === member.User_ID}
                        onClick={() => pick(member.User_ID)} />
                    ))}
                  </div>
                );
              })}
            </>
          )}

          {/* ── Vista global: todos los usuarios plano ─────── */}
          {!hasTeamScope && (() => {
            const visible = rawUsers.filter(u => u.Is_Active !== false && matches(u.User_Name));
            if (visible.length === 0) return <div className="user-filter__empty">Sin resultados</div>;
            return visible.map(user => (
              <UserOption key={user.User_ID} user={user}
                active={selectedUserId === user.User_ID}
                onClick={() => pick(user.User_ID)} />
            ));
          })()}
        </div>
      )}
    </div>
  );
}
