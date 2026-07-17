// src/components/layout/ConfigPanelComponents/SprintsConfig.tsx
import { useState } from 'react';
import { useBoardTeams, type BoardTeam }    from '@/features/requests/hooks/useBoardMetadata';
import type { Sprint, SprintTeamCapacity, SprintCapacityInput } from '@/features/requests/hooks/useSprints';
import { config }                           from '@/config';
import { AddBtn, SmBtn, FieldLabel, FormActions } from '../ConfigPanel';
import { apiClient } from '@/lib/apiClient';
// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const clean = iso.split('T')[0];
  const [y, m, d] = clean.split('-');
  if (!y || !m || !d) return '—';
  return `${d}/${m}/${y.slice(2)}`;
};

type SprintStatus = 'activo' | 'futuro' | 'pasado' | 'historico';

/** true solo si ambas fechas existen y son parseables. */
function hasValidDates(sp: Sprint): boolean {
  if (!sp.Sprint_Start_Date || !sp.Sprint_End_Date) return false;
  const s = new Date(sp.Sprint_Start_Date).getTime();
  const e = new Date(sp.Sprint_End_Date).getTime();
  return !Number.isNaN(s) && !Number.isNaN(e);
}

function getStatus(sp: Sprint): SprintStatus {
  if (!hasValidDates(sp)) return 'historico';   // sprints migrados sin fechas
  const now   = Date.now();
  const start = new Date(sp.Sprint_Start_Date).getTime();
  const end   = new Date(sp.Sprint_End_Date).getTime();
  if (now >= start && now <= end) return 'activo';
  if (now < start)                return 'futuro';
  return 'pasado';
}

const STATUS_COLOR: Record<SprintStatus, string> = {
  activo:    '#00e5a0',
  futuro:    '#fdcb6e',
  pasado:    '#636e72',
  historico: '#7f77dd',
};

// ── SprintRow ─────────────────────────────────────────────────────────────────

function SprintRow({
  sprint, teams, onEdit, onRemove,
}: {
  sprint:   Sprint;
  teams:    BoardTeam[];
  onEdit:   () => void;
  onRemove: () => void;
}) {
  const [hov, setHov] = useState(false);
  const status      = getStatus(sprint);
  const statusColor = STATUS_COLOR[status];

  const configuredCaps = (sprint.capacities ?? []).filter(
    (c) => teams.some((t) => t.Board_Team_ID === c.Board_Team_ID),
  );

  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', flexDirection: 'column', gap: 5,
        padding: '8px 12px', borderRadius: 8,
        border:      `1px solid ${hov ? 'var(--border)' : 'var(--border-subtle)'}`,
        background:  hov ? 'var(--bg-hover)' : 'var(--bg-surface)',
        transition:  'border-color 0.12s, background 0.12s',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 12, fontWeight: 500, color: 'var(--txt)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sprint.Sprint_Text}
        </span>
        <span style={{ fontSize: 9, color: statusColor, textTransform: 'uppercase', letterSpacing: 0.8, flexShrink: 0 }}>
          {status}
        </span>
        <div style={{ display: 'flex', gap: 3, opacity: hov ? 1 : 0, transition: 'opacity 0.12s', flexShrink: 0 }}>
          <SmBtn color="var(--accent)" onClick={onEdit} title="Editar">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M8.5 1.5l2 2L4 10H2v-2L8.5 1.5z"/>
            </svg>
          </SmBtn>
          <SmBtn color="#ff4757" onClick={onRemove} title="Eliminar">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M2 3h8M5 3V2h2v1M4 3v7h4V3"/>
            </svg>
          </SmBtn>
        </div>
      </div>

      {/* Dates */}
      <span style={{ fontSize: 10, color: 'var(--txt-muted)', paddingLeft: 15 }}>
        {fmtDate(sprint.Sprint_Start_Date)} → {fmtDate(sprint.Sprint_End_Date)}
      </span>

      {/* Capacity badges — only if at least one team is configured */}
      {configuredCaps.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, paddingLeft: 15, marginTop: 1 }}>
          {configuredCaps.map((cap) => {
            const team  = teams.find((t) => t.Board_Team_ID === cap.Board_Team_ID);
            if (!team) return null;
            const color = team.Board_Team_Color || '#00c8ff';
            return (
              <span
                key={cap.Board_Team_ID}
                title={`${team.Board_Team_Name}: ${cap.External_Capacity} solicitudes externas`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                  fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 4,
                  color, background: `${color}12`, border: `1px solid ${color}28`,
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                {team.Board_Team_Code}: {cap.External_Capacity}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── SprintForm ────────────────────────────────────────────────────────────────

function SprintForm({
  teams,
  initial,
  onSave,
  onCancel,
}: {
  teams:    BoardTeam[];
  initial?: { text: string; startDate: string; endDate: string; capacities?: SprintTeamCapacity[] };
  onSave:   (d: { text: string; startDate: string; endDate: string; teamCapacities: SprintCapacityInput[] }) => void;
  onCancel: () => void;
}) {
  const [text,      setText]  = useState(initial?.text      ?? '');
  const [startDate, setStart] = useState(() => (initial?.startDate ?? '').split('T')[0]);
  const [endDate,   setEnd]   = useState(() => (initial?.endDate   ?? '').split('T')[0]);

  // Pre-populate capacity per team from existing data, default 20
  const [caps, setCaps] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    for (const c of (initial?.capacities ?? [])) {
      map[c.Board_Team_ID] = c.External_Capacity;
    }
    return map;
  });

  const dateErr = !!(endDate && startDate && endDate < startDate);
  const canSave = !!(text.trim() && startDate && endDate && !dateErr);

  const handleCapChange = (teamId: number, raw: string) => {
    const n = parseInt(raw, 10);
    setCaps((prev) => ({ ...prev, [teamId]: isNaN(n) || n < 1 ? 1 : Math.min(n, 9999) }));
  };

  const handleSave = () => {
    if (!canSave) return;
    const teamCapacities: SprintCapacityInput[] = teams.map((t) => ({
      teamId:   t.Board_Team_ID,
      capacity: caps[t.Board_Team_ID] ?? 20,
    }));
    onSave({ text: text.trim(), startDate, endDate, teamCapacities });
  };

  return (
    <div className="cpop-form">
      {/* Sprint name */}
      <input
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') onCancel();
          if (e.key === 'Enter' && canSave) handleSave();
        }}
        placeholder="Nombre del sprint…"
        className="cpop-input"
      />

      {/* Date range */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div>
          <FieldLabel>Inicio</FieldLabel>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStart(e.target.value)}
            className="cpop-input cpop-input--date"
            style={{ width: '100%', boxSizing: 'border-box', paddingRight: 8 }}
          />
        </div>
        <div>
          <FieldLabel>Fin</FieldLabel>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(e) => setEnd(e.target.value)}
            className="cpop-input cpop-input--date"
            style={{ width: '100%', boxSizing: 'border-box', paddingRight: 8 }}
          />
        </div>
      </div>

      {/* Date error */}
      {dateErr && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 10px', borderRadius: 6,
          background: '#ff475710', border: '1px solid #ff475730',
        }}>
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <circle cx="6" cy="6" r="5" stroke="#ff4757" strokeWidth="1.3"/>
            <path d="M6 3.5v3M6 8.5v.5" stroke="#ff4757" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
          <span style={{ fontSize: 10, color: '#ff4757' }}>La fecha de fin debe ser posterior al inicio.</span>
        </div>
      )}

      {/* ── Capacidad externa por equipo ── */}
      {teams.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

          {/* Section divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 2,
              textTransform: 'uppercase', color: 'var(--txt-muted)',
              flexShrink: 0,
            }}>
              Capacidad externa por equipo
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
          </div>

          <p style={{ margin: 0, fontSize: 9, color: 'var(--txt-muted)', lineHeight: 1.6 }}>
            Máximo de solicitudes externas por equipo en este sprint. El sistema asigna automáticamente al primer sprint con cupo disponible.
          </p>

          {/* Team capacity inputs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {teams.map((team) => {
              const color = team.Board_Team_Color || '#00c8ff';
              const val   = caps[team.Board_Team_ID] ?? 20;
              return (
                <div
                  key={team.Board_Team_ID}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '5px 10px', borderRadius: 6,
                    background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                  <span style={{
                    flex: 1, fontSize: 11, fontWeight: 500, color: 'var(--txt)',
                    minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {team.Board_Team_Name}
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={9999}
                    value={val}
                    onChange={(e) => handleCapChange(team.Board_Team_ID, e.target.value)}
                    onFocus={(e)  => { e.currentTarget.style.borderColor = `${color}55`; }}
                    onBlur={(e)   => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; }}
                    style={{
                      width: 56, padding: '3px 6px', borderRadius: 5,
                      textAlign: 'center', border: '1px solid var(--border-subtle)',
                      background: 'var(--bg-panel)', color: 'var(--txt)',
                      fontSize: 12, fontWeight: 600, outline: 'none',
                      fontFamily: 'var(--font-display)', boxSizing: 'border-box',
                      transition: 'border-color 0.12s',
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--txt-muted)', flexShrink: 0 }}>tickets</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <FormActions canSave={canSave} onSave={handleSave} onCancel={onCancel} />
    </div>
  );
}

// ── SprintList ────────────────────────────────────────────────────────────────

export function SprintList({
  sprints,
  onAdd,
  onUpdate,
  onRemove,
}: {
  sprints:  Sprint[];
  onAdd:    (s: { text: string; startDate: string; endDate: string; teamCapacities?: SprintCapacityInput[] }) => void;
  onUpdate: (id: number, s: { text: string; startDate: string; endDate: string; teamCapacities?: SprintCapacityInput[] }) => void;
  onRemove: (id: number) => void;
}) {
  const [editId,     setEditId]     = useState<number | null>(null);
  const [showNew,    setShowNew]    = useState(false);
  const [showOthers, setShowOthers] = useState(false);
  const [showHistoric, setShowHistoric] = useState(false);

  // Teams fetched here — React Query deduplicates, no extra network call
  const { data: allTeams = [] } = useBoardTeams(config.DEFAULT_BOARD_ID);
  // Solo equipos con Kanban propio y activos: los externos no reciben solicitudes en el board,
  // y los inactivos ya no operan — no tiene sentido definirles capacidad.
  const teams = (allTeams as BoardTeam[]).filter((t) =>
    !t.Board_Team_Is_Admin_Only &&
    !t.Board_Team_Is_External &&
    t.Board_Team_Is_Active !== false
  );
const [activating, setActivating] = useState(false);
const [activateResult, setActivateResult] = useState<{ moved: number; destColumn?: string } | null>(null);

const handleActivateSprints = async () => {
  setActivating(true);
  setActivateResult(null);
  try {
    const res = await apiClient.call<{ ok: boolean; moved: number; destColumn?: string; message?: string }>(
      'triggerSprintStartMoves',
      { boardId: config.DEFAULT_BOARD_ID },
    );
    setActivateResult(res);
  } catch (err) {
    setActivateResult({ moved: -1 });
  } finally {
    setActivating(false);
  }
};
  // Year filter
  const currentYear                     = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);

const statusOrder: Record<string, number> = { activo: 0, futuro: 1, pasado: 2, historico: 3 };

  // Sprints con fecha válida vs. históricos (sin fecha)
  const datedSprints     = sprints.filter(hasValidDates);
  const historicSprints  = sprints.filter((sp) => !hasValidDates(sp));

  const allYears = [
    ...new Set(datedSprints.map((sp) => new Date(sp.Sprint_Start_Date).getFullYear())),
  ].sort((a, b) => b - a);
  if (!allYears.includes(currentYear)) allYears.unshift(currentYear);

  const yearSprints = datedSprints
    .filter((sp) => new Date(sp.Sprint_Start_Date).getFullYear() === selectedYear)
    .sort((a, b) => {
      const diff = statusOrder[getStatus(a)] - statusOrder[getStatus(b)];
      if (diff !== 0) return diff;
      return new Date(a.Sprint_Start_Date).getTime() - new Date(b.Sprint_Start_Date).getTime();
    });

  const otherSprints = datedSprints
    .filter((sp) => new Date(sp.Sprint_Start_Date).getFullYear() !== selectedYear)
    .sort((a, b) => new Date(b.Sprint_Start_Date).getTime() - new Date(a.Sprint_Start_Date).getTime());

  const handleEditOpen = (id: number) => { setShowNew(false); setEditId(id); };
  const handleNewOpen  = ()           => { setEditId(null);   setShowNew(true); };

  const renderRow = (sp: Sprint) =>
    editId === sp.Sprint_ID ? (
      <SprintForm
        key={sp.Sprint_ID}
        teams={teams}
        initial={{
          text:       sp.Sprint_Text,
          startDate:  sp.Sprint_Start_Date,
          endDate:    sp.Sprint_End_Date,
          capacities: sp.capacities ?? [],
        }}
        onSave={(d) => { onUpdate(sp.Sprint_ID, d); setEditId(null); }}
        onCancel={() => setEditId(null)}
      />
    ) : (
      <SprintRow
        key={sp.Sprint_ID}
        sprint={sp}
        teams={teams}
        onEdit={() => handleEditOpen(sp.Sprint_ID)}
        onRemove={() => onRemove(sp.Sprint_ID)}
      />
    );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>

      {/* ── Activar sprints del día ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
        borderRadius: 8, background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)', marginBottom: 4,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt)', marginBottom: 2 }}>
            Activar sprints del día
          </div>
          <div style={{ fontSize: 9, color: 'var(--txt-muted)' }}>
            Mueve a «Por hacer» las solicitudes de sprints que inician hoy.
          </div>
          {activateResult && (
            <div style={{
              marginTop: 5, fontSize: 10, fontWeight: 600,
              color: activateResult.moved === -1 ? '#ff4757'
                   : activateResult.moved === 0  ? 'var(--txt-muted)'
                   : '#00e5a0',
            }}>
              {activateResult.moved === -1
                ? '✕ Error al ejecutar'
                : activateResult.moved === 0
                ? '— No hay sprints que inicien hoy'
                : `✓ ${activateResult.moved} ticket${activateResult.moved !== 1 ? 's' : ''} movidos → ${activateResult.destColumn ?? 'Por hacer'}`}
            </div>
          )}
        </div>
        <button
          onClick={handleActivateSprints}
          disabled={activating}
          style={{
            padding: '6px 14px', borderRadius: 6, border: 'none',
            cursor: activating ? 'not-allowed' : 'pointer',
            background: activating ? 'var(--bg-panel)' : 'rgba(0,229,160,0.12)',
            color: activating ? 'var(--txt-muted)' : '#00e5a0',
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            outline: `1px solid ${activating ? 'var(--border-subtle)' : 'rgba(0,229,160,0.3)'}`,
            transition: 'all 0.12s', flexShrink: 0,
            opacity: activating ? 0.6 : 1,
          }}
        >
          {activating ? 'Ejecutando…' : '▶ Activar'}
        </button>
      </div>

      {/* Year tabs */}
      {allYears.length > 1 && (
        <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
          {allYears.map((yr) => (
            <button
              key={yr}
              onClick={() => setSelectedYear(yr)}
              style={{
                padding: '4px 11px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                fontWeight:  selectedYear === yr ? 700 : 400,
                border:      `1px solid ${selectedYear === yr ? 'rgba(0,200,255,0.4)' : 'var(--border-subtle)'}`,
                background:  selectedYear === yr ? 'rgba(0,200,255,0.08)' : 'transparent',
                color:       selectedYear === yr ? 'var(--accent)' : 'var(--txt-muted)',
                transition:  'all 0.12s',
                display:     'flex', alignItems: 'center', gap: 5,
              }}
            >
              {yr}
              {yr === currentYear && (
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--accent)', display: 'inline-block' }} />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Empty state */}
      {yearSprints.length === 0 && !showNew && (
        <div className="cpanel__empty">
          <span style={{ fontSize: 28, opacity: 0.35 }}>⚡</span>
          <p>No hay sprints en {selectedYear}.</p>
        </div>
      )}

      {/* Current-year sprints */}
      {yearSprints.map(renderRow)}

      {/* New sprint form / add button */}
      {showNew ? (
        <SprintForm
          teams={teams}
          onSave={(d) => { onAdd(d); setShowNew(false); }}
          onCancel={() => setShowNew(false)}
        />
      ) : (
        <AddBtn label="Nuevo sprint" onClick={handleNewOpen} />
      )}

{/* Other years — collapsible */}
      {otherSprints.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setShowOthers((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '4px 0',
              background: 'transparent', border: 'none', cursor: 'pointer',
            }}
          >
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 2,
              textTransform: 'uppercase', color: 'var(--txt-muted)',
              opacity: 0.5, flexShrink: 0,
            }}>
              Otros años ({otherSprints.length})
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <svg
              width="9" height="9" viewBox="0 0 9 9" fill="none"
              stroke="var(--txt-muted)" strokeWidth="1.6" strokeLinecap="round"
              style={{
                flexShrink: 0, opacity: 0.4,
                transform:  showOthers ? 'rotate(180deg)' : undefined,
                transition: 'transform 0.18s',
              }}
            >
              <path d="M1 3l3.5 3.5L8 3"/>
            </svg>
          </button>

          {showOthers && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {otherSprints.map(renderRow)}
            </div>
          )}
        </div>
      )}

      {/* Histórico — sprints migrados sin fechas */}
      {historicSprints.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <button
            onClick={() => setShowHistoric((v) => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              width: '100%', padding: '4px 0',
              background: 'transparent', border: 'none', cursor: 'pointer',
            }}
          >
            <span style={{
              fontSize: 9, fontWeight: 700, letterSpacing: 2,
              textTransform: 'uppercase', color: 'var(--txt-muted)',
              opacity: 0.5, flexShrink: 0,
            }}>
              Histórico ({historicSprints.length})
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
            <svg
              width="9" height="9" viewBox="0 0 9 9" fill="none"
              stroke="var(--txt-muted)" strokeWidth="1.6" strokeLinecap="round"
              style={{
                flexShrink: 0, opacity: 0.4,
                transform:  showHistoric ? 'rotate(180deg)' : undefined,
                transition: 'transform 0.18s',
              }}
            >
              <path d="M1 3l3.5 3.5L8 3"/>
            </svg>
          </button>

          {showHistoric && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
              {historicSprints.map(renderRow)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}