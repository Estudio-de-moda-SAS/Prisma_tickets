import { useMemo, useState } from 'react';
import { useLabelsByBoardId } from '@/features/requests/hooks/useLabels';
import type { Label } from '@/features/requests/hooks/useLabels';
import type { Resolutor, ResolutorSolicitud } from '@/features/requests/hooks/useStatsData';
import { config } from '@/config';
import { PRI_COLOR, PRIORIDADES_LABEL, fmtDate } from './statsFormat';

function SolicitudRow({ s, labelMap }: { s: ResolutorSolicitud; labelMap: Map<number, Label> }) {
  const sLabels = s.labelIds
    .map(id => labelMap.get(id))
    .filter((l): l is Label => l != null);
  return (
    <div className="resolutor-detail__row">
      <span className="resolutor-detail__id">{s.id}</span>
      <div className="resolutor-detail__titulo-cell">
        <span className="resolutor-detail__titulo" title={s.titulo}>{s.titulo || '—'}</span>
        {sLabels.length > 0 && (
          <div className="resolutor-detail__labels">
            {sLabels.map(l => (
              <span key={l.Label_ID} className="resolutor-detail__label-chip"
                style={{ background: `${l.Label_Color}15`, border: `1px solid ${l.Label_Color}35`, color: l.Label_Color }}>
                <span className="resolutor-detail__label-icon">{l.Label_Icon}</span>
                {l.Label_Name}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className="resolutor-detail__pri" style={{ color: PRI_COLOR[s.prioridad] }}>
        {PRIORIDADES_LABEL[s.prioridad]}
      </span>
      <span className="resolutor-detail__sprint">{s.sprintName ?? 'Sin sprint'}</span>
      <span className="resolutor-detail__fecha">
        {s.fechaCierre ? fmtDate(new Date(s.fechaCierre)) : '—'}
      </span>
    </div>
  );
}

/** Listado expandible de las solicitudes resueltas por un resolutor. */
function ResolutorDetail({ resolutor, labelMap }: { resolutor: Resolutor; labelMap: Map<number, Label> }) {
  return (
    <div className="resolutor-detail">
      <div className="resolutor-detail__head">
        <span className="resolutor-detail__title">
          Solicitudes resueltas por {resolutor.nombre}
        </span>
        <span className="resolutor-detail__count">{resolutor.resueltas}</span>
      </div>
      <div className="resolutor-detail__list">
        {resolutor.solicitudes.map(s => <SolicitudRow key={s.id} s={s} labelMap={labelMap} />)}
      </div>
    </div>
  );
}

/** Top resolutores del board, con detalle desplegable por persona. */
export function ResolutoresPanel({ resolutores, teamName, userFilter }: {
  resolutores: Resolutor[];
  teamName:    string;
  userFilter:  number | null;
}) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const { data: allBoardLabels = [] } = useLabelsByBoardId(config.DEFAULT_BOARD_ID);
  const labelMap = useMemo(() => new Map(allBoardLabels.map(l => [l.Label_ID, l])), [allBoardLabels]);
  const sel = expanded !== null ? resolutores.find(r => r.userId === expanded) : undefined;

  return (
    <div className="stats-panel">
      <div className="stats-panel__header">
        <span className="stats-panel__title">Top resolutores — {teamName}</span>
        {userFilter && <span style={{ fontSize: 11, color: 'var(--accent)' }}>· filtro activo</span>}
      </div>
      <div className="stats-resolutores">
        {resolutores.map(r => (
          <button key={r.userId}
            className={['stats-resolutor', userFilter === r.userId ? 'stats-resolutor--active' : '', expanded === r.userId ? 'stats-resolutor--expanded' : ''].join(' ')}
            onClick={() => setExpanded(expanded === r.userId ? null : r.userId)}
            title={expanded === r.userId ? 'Ocultar solicitudes' : `Ver solicitudes de ${r.nombre}`}>
            <div className="stats-resolutor__avatar" style={{ background: r.avatarBg }}>{r.initials}</div>
            <span className="stats-resolutor__name">{r.nombre}</span>
            <span className="stats-resolutor__count">{r.resueltas} res.</span>
          </button>
        ))}
      </div>

      {sel && <ResolutorDetail resolutor={sel} labelMap={labelMap} />}
    </div>
  );
}
