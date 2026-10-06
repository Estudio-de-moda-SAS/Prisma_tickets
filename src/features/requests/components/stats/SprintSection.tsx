import { useMemo, useState } from 'react';
import {
  CheckCircle2, Clock, Layers, PlusCircle, XCircle, Star, Target, History, ChevronDown, Minus,
} from 'lucide-react';
import { useLabelsByTeamId } from '@/features/requests/hooks/useLabels';
import { isBlockedLabelName, PENALIZACION_ACTIVA } from '@/features/requests/hooks/useStatsData';
import type { BoardStatsReal, SprintStats } from '@/features/requests/hooks/useStatsData';
import { config } from '@/config';
import { ScoreDonut, SectionDivider, SprintCard } from './StatsAtoms';
import { fmtHoras } from './statsFormat';
import React from 'react';

/* ─── Tarjetas del sprint ─────────────────────────────────── */

function SprintCards({ sp, boardData, blockedNotConfigured, otrosOpen, onToggleOtros }: {
  sp:                   SprintStats;
  boardData:            BoardStatsReal | null | undefined;
  blockedNotConfigured: boolean;
  otrosOpen:            boolean;
  onToggleOtros:        () => void;
}) {
  
  React.useEffect(() => {
    console.log(boardData)
  }, [boardData])
  
  return (
    <div className="scard-grid scard-grid--6">
      <SprintCard label="Planeadas"     value={sp.planeadas}   color="#378ADD" icon={Layers} />
      <SprintCard label="Post-planning" value={sp.postPlanning} sub="Fuera del scope original" color="#EF9F27" icon={PlusCircle} />
      <SprintCard label="Activas"       value={sp.activas}     color="#00c8ff" icon={Clock} pulse />

      {blockedNotConfigured ? (
        <SprintCard label="Bloqueadas" value="—" sub="Categoría no configurada"
          color="#5a6a8a" icon={Minus} />
      ) : (
        <SprintCard label="Bloqueadas" value={sp.bloqueadas} sub="Con label bloqueada/pausada"
          color={sp.bloqueadas > 0 ? '#ff4757' : '#1D9E75'}
          icon={sp.bloqueadas > 0 ? XCircle : CheckCircle2} />
      )}
      <SprintCard label="Completadas"
        value={sp.completadas + (boardData?.otrosSprintsCount ?? 0)}
        sub={boardData && boardData.otrosSprintsCount > 0
          ? `${sp.completadas} de este sprint + ${boardData.otrosSprintsCount} de otros`
          : 'Terminadas en este sprint'}
        color="#1D9E75" icon={CheckCircle2} />
      <SprintCard label="De otros sprints"
        value={boardData ? boardData.otrosSprintsCount : '—'}
        sub="Terminadas aquí, planeadas antes"
        color="#7f77dd" icon={History}
        onClick={boardData && boardData.otrosSprintsDetalle.length > 0 ? onToggleOtros : undefined}
        expanded={otrosOpen} />
    </div>
  );
}

/* ─── Detalle "De otros sprints" ──────────────────────────── */

function OtrosSprintsDetail({ boardData }: { boardData: BoardStatsReal }) {
  return (
    <div className="otros-sprints-detail">
      <div className="otros-sprints-detail__head">
        <span className="otros-sprints-detail__title">
          <History size={12} /> Origen de las solicitudes terminadas aquí
        </span>
        <span className="otros-sprints-detail__total">{boardData.otrosSprintsCount}</span>
      </div>
      <div className="otros-sprints-detail__chips">
        {boardData.otrosSprintsDetalle.map(d => (
          <span key={d.sprintId} className="otros-sprints-chip">
            <span className="otros-sprints-chip__name">{d.sprintName}</span>
            <span className="otros-sprints-chip__count">{d.count}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ─── Puntaje & cumplimiento ──────────────────────────────── */

/** Pts. realizados: incluye arrastre de otros sprints; desplegable para ver el desglose. */
function RealizadosRow({ sp }: { sp: SprintStats }) {
  const [open, setOpen]  = useState(false);
  const hayOtros         = sp.puntajeOtrosSprints > 0;
  const realizadosTotal  = sp.puntajeRealizado + sp.puntajeOtrosSprints;
  const toggle           = () => setOpen(o => !o);
  return (
    <>
      <div
        className={['score-detail-row', hayOtros ? 'score-detail-row--clickable' : ''].join(' ')}
        onClick={hayOtros ? toggle : undefined}
        role={hayOtros ? 'button' : undefined}
        tabIndex={hayOtros ? 0 : undefined}
        onKeyDown={hayOtros ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } : undefined}
        title={hayOtros ? 'Incluye puntos de solicitudes de otros sprints terminadas en esta ventana' : undefined}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          Pts. realizados
          {hayOtros && (
            <ChevronDown size={11} className="score-detail-row__chevron"
              style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
          )}
        </span>
        <strong style={{ color: 'var(--accent)' }}>{realizadosTotal}</strong>
      </div>
      {hayOtros && open && (
        <>
          <div className="score-detail-row score-detail-row--sub">
            <span>De este sprint</span><strong>{sp.puntajeRealizado}</strong>
          </div>
          <div className="score-detail-row score-detail-row--sub">
            <span>De otros sprints</span>
            <strong style={{ color: '#7f77dd' }}>+{sp.puntajeOtrosSprints}</strong>
          </div>
        </>
      )}
    </>
  );
}

function ScorePanel({ sp }: { sp: SprintStats }) {
  return (
    <div className="stats-panel">
      <div className="stats-panel__header">
        <span className="stats-panel__title"><Star size={12} /> Puntaje &amp; Cumplimiento</span>
        <span className="stats-velocity-badge" style={{ color: sp.cumplimiento >= 80 ? 'var(--success)' : sp.cumplimiento >= 50 ? 'var(--warn)' : 'var(--danger)' }}>
          {sp.cumplimiento}% cumplimiento
        </span>
      </div>
      <div className="score-panel">
        <ScoreDonut
          realizado={sp.puntajeReal + sp.puntajeOtrosSprints}
          total={sp.meta}
          label="cumplimiento" />
        <div className="score-panel__detail">
          <div className="score-detail-row"><span>Pts. planeados</span><strong>{sp.puntajePlaneado}</strong></div>
          <div className="score-detail-row"><span>Meta (83.3%)</span><strong>{sp.meta}</strong></div>
          <RealizadosRow sp={sp} />
          <div className="score-detail-row">
            <span>Penalización</span>
            <strong style={{ color: 'var(--danger)' }}>
              {!PENALIZACION_ACTIVA ? 'N/A' : sp.penalizacion > 0 ? `−${sp.penalizacion}` : '—'}
            </strong>
          </div>
          <div className="score-detail-row" style={{ borderTop: '1px solid var(--border)', paddingTop: 4, marginTop: 4 }}>
            <span>Pts. reales</span>
            <strong style={{ color: 'var(--accent)' }}>{sp.puntajeReal + sp.puntajeOtrosSprints}</strong>
          </div>
          <p className="score-detail-note">Puntos: Baja 1 · Media 2 · Alta 4 · Crítica 6</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Tiempos promedio ────────────────────────────────────── */

function AverageTimesPanel({ sp }: { sp: SprintStats }) {
  return (
    <div className="stats-panel">
      <div className="stats-panel__header"><span className="stats-panel__title"><Clock size={12} /> Tiempos promedio</span></div>
      <div className="month-stats">
        <div className="month-stat">
          <span className="month-stat__num" style={{ color: 'var(--accent)' }}>
            {fmtHoras(sp.tiempoEstimadoProm)}
          </span>
          <span className="month-stat__label">Tiempo estimado promedio</span>
          <p className="month-stat__note">Sobre solicitudes con estimación cargada</p>
        </div>
        <div className="month-stat-divider" />
        <div className="month-stat">
          <span className="month-stat__num" style={{ color: 'var(--success)' }}>
            {fmtHoras(sp.tiempoConsumidoProm)}
          </span>
          <span className="month-stat__label">Tiempo consumido promedio</span>
          <p className="month-stat__note">Sobre solicitudes cerradas</p>
        </div>
      </div>
    </div>
  );
}

/* ─── Sección completa ────────────────────────────────────── */

/** Sección "Sprint activo": tarjetas, origen del arrastre, puntaje y tiempos. */
export function SprintSection({ sp, boardData, scope, boardTeamId, isSingleTeam }: {
  sp:           SprintStats;
  boardData:    BoardStatsReal | null | undefined;
  /** Etiqueta del alcance (equipo, combinación o todos). */
  scope:        string;
  /** Board_Team_ID del equipo activo — null en Global. */
  boardTeamId:  number | null;
  /** Solo con un único equipo se avisa si falta la categoría "bloqueada". */
  isSingleTeam: boolean;
}) {
  const [otrosOpen, setOtrosOpen] = useState(false);

  // ¿El equipo activo tiene configurada la categoría "bloqueada"?
  const { data: teamLabels = [], isLoading: labelsLoading } = useLabelsByTeamId(config.DEFAULT_BOARD_ID, boardTeamId);
  const tieneCategoriaBloqueada = useMemo(
    () => teamLabels.some(l => isBlockedLabelName(l.Label_Name)),
    [teamLabels],
  );

  return (
    <>
      <SectionDivider icon={Target} label={`Sprint activo — ${scope}`} />

      <SprintCards
        sp={sp}
        boardData={boardData}
        blockedNotConfigured={isSingleTeam && !labelsLoading && !tieneCategoriaBloqueada}
        otrosOpen={otrosOpen}
        onToggleOtros={() => setOtrosOpen(o => !o)}
      />

      {otrosOpen && boardData && boardData.otrosSprintsDetalle.length > 0 && (
        <OtrosSprintsDetail boardData={boardData} />
      )}

      <div className="stats-mid-grid">
        <ScorePanel sp={sp} />
        <AverageTimesPanel sp={sp} />
      </div>
    </>
  );
}
