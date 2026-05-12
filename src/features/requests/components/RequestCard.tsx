// src/features/requests/components/RequestCard.tsx
import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useCardClasses,
  useCardVisibility,
  useCardStyle,
  usePriorityColor,
} from '../hooks/useCustomizationStyles';
import { useTheme } from '@/store/useTheme';
import { useBoardTemplates, getTemplateDefinition } from '@/features/requests/hooks/useBoardMetadata';
import { config } from '@/config';
import type { Request } from '../types';

type Props = {
  request:     Request;
  isDragging?: boolean;
  onClick?:    () => void;
};

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((n) => n[0] ?? '').join('').toUpperCase();
}

const PRIORIDAD_LABEL: Record<Request['prioridad'], string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

const PRIORIDAD_COLOR: Record<Request['prioridad'], string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

function MetaRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ color: 'var(--txt-muted)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{ color: 'var(--txt-muted)', flexShrink: 0, minWidth: 68, fontSize: 10, letterSpacing: 0.3 }}>{label}</span>
      <span style={{ color: 'var(--txt)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{children}</span>
    </div>
  );
}

function AvatarChip({ name, color }: { name: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'white', flexShrink: 0 }}>
        {initials(name)}
      </div>
      <span style={{ fontSize: 11, color: 'var(--txt)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
        {name}
      </span>
    </div>
  );
}

const IconUser   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconUsers  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IconCal    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IconTag    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
const IconZap    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IconSprint = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
const IconCheck  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

function Chips({ items, accent }: { items: string[]; accent?: string }) {
  if (items.length === 0) return null;
  const color  = accent ?? 'var(--accent)';
  const extras = items.length - 1;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden' }}>
      <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: `${color}12`, border: `1px solid ${color}30`, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>
        {items[0]}
      </span>
      {extras > 0 && (
        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', whiteSpace: 'nowrap', flexShrink: 0 }}>
          +{extras}
        </span>
      )}
    </div>
  );
}

export function RequestCard({ request, isDragging = false, onClick }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({ id: request.id });

  const { data: allTemplates = [] } = useBoardTemplates(config.DEFAULT_BOARD_ID);

  const { theme: uiTheme }         = useTheme();
  const isBeingDragged             = isSortableDragging || isDragging;
  const progreso                   = request.progreso ?? 0;
  const showProgressCol            = request.columna === 'en_progreso' || request.columna === 'hecho' || request.columna === 'ready_to_deploy';

  const cardClasses                = useCardClasses(request.prioridad);
  const { showDesc, showProgress } = useCardVisibility();
  const cardStyle                  = useCardStyle(uiTheme);
  const priorityColor              = usePriorityColor(request.prioridad);
  const shouldShowProgress         = showProgressCol && showProgress;

  const templateId   = request.templateId ?? 1;
  const template     = getTemplateDefinition(templateId, allTemplates);
  const isNonDefault = templateId !== 1;
  const accent       = template.visual.accentColor;

  const isSubRequest   = (request.parentId ?? null) !== null;
  const childCount     = request.childCount ?? 0;
  const hasDeadline    = !!request.deadline;
  const isVencida      = hasDeadline && new Date(request.deadline!) < new Date();
  const primerAsignado = request.assignees?.[0] ?? null;
  const allLabels      = request.categoria    ?? [];
  const allSubTeams    = request.subTeamNames ?? [];
  const isCerrada      = !!request.cierreInfo || !!request.fechaCierre;

  function handleClick(e: React.MouseEvent) {
    if (isSortableDragging) return;
    e.stopPropagation();
    onClick?.();
  }

  // Borde izquierdo para tarjetas cerradas en ready_to_deploy
  const closureBorderStyle = isCerrada && request.columna === 'ready_to_deploy'
    ? { boxShadow: 'inset 3px 0 0 #a78bfa', borderColor: 'rgba(167,139,250,0.3)' }
    : isCerrada && request.columna === 'hecho'
      ? { boxShadow: 'inset 3px 0 0 var(--success)', borderColor: 'rgba(0,229,160,0.3)' }
      : {};

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        ...cardStyle,
        ...({ '--priority-color': priorityColor } as React.CSSProperties),
        ...(isSubRequest
          ? { boxShadow: 'inset 3px 0 0 #a78bfa', borderColor: 'rgba(167,139,250,0.3)' }
          : isNonDefault
            ? { boxShadow: `inset 3px 0 0 ${accent}`, borderColor: `${accent}30` }
            : isCerrada
              ? closureBorderStyle
              : {}),
      }}
      className={[cardClasses, isBeingDragged ? 'request-card--dragging' : ''].filter(Boolean).join(' ')}
      {...attributes}
      {...listeners}
      onClick={handleClick}
    >
      {/* Header */}
      <div className="request-card__header">
        {isCerrada ? (
          <span style={{
            background: request.columna === 'hecho' ? 'rgba(0,229,160,0.1)' : 'rgba(167,139,250,0.1)',
            color: request.columna === 'hecho' ? 'var(--success)' : '#a78bfa',
            border: `1px solid ${request.columna === 'hecho' ? 'rgba(0,229,160,0.3)' : 'rgba(167,139,250,0.3)'}`,
            fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: '2px 6px',
            borderRadius: 3, display: 'flex', alignItems: 'center', gap: 3,
          }}>
            <IconCheck /> Cerrada
          </span>
        ) : isSubRequest ? (
          <span style={{ background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: '2px 6px', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
            ↳ Sub-solicitud
          </span>
        ) : isNonDefault ? (
          <span style={{ background: `${accent}15`, color: accent, border: `1px solid ${accent}35`, fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: '2px 6px', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
            <span style={{ fontSize: 10 }}>{template.visual.icon}</span>
            {template.visual.badgeLabel}
          </span>
        ) : childCount > 0 ? (
          <span style={{ background: 'rgba(0,200,255,0.08)', color: 'var(--accent)', border: '1px solid rgba(0,200,255,0.2)', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: '2px 6px', borderRadius: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
            ⌥ {childCount} sub
          </span>
        ) : null}
      </div>

      {/* Título */}
      <p className="request-card__title" style={{ marginBottom: 10, opacity: isCerrada ? 0.8 : 1 }}>{request.titulo}</p>

      {/* Descripción */}
      {showDesc && request.descripcion && (
        <p className="request-card__desc" style={{ marginBottom: 10 }}>
          {request.descripcion.length > 80 ? request.descripcion.slice(0, 80) + '…' : request.descripcion}
        </p>
      )}

      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0 10px' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>

        <MetaRow icon={<IconUser />} label="Solicitante">
          <AvatarChip name={request.solicitante} color="linear-gradient(135deg,#0055cc,#00c8ff)" />
        </MetaRow>

        {primerAsignado && (
          <MetaRow icon={<IconUsers />} label="Asignado">
            <AvatarChip
              name={primerAsignado.userName}
              color={isSubRequest ? '#7c3aed' : isNonDefault ? accent : 'linear-gradient(135deg,#7c3aed,#a78bfa)'}
            />
          </MetaRow>
        )}

        <MetaRow icon={<IconZap />} label="Prioridad">
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: PRIORIDAD_COLOR[request.prioridad], background: `${PRIORIDAD_COLOR[request.prioridad]}15`, border: `1px solid ${PRIORIDAD_COLOR[request.prioridad]}35`, borderRadius: 4, padding: '1px 7px' }}>
            {PRIORIDAD_LABEL[request.prioridad]}
          </span>
        </MetaRow>

        {allSubTeams.length > 0 && (
          <MetaRow icon={<IconUsers />} label="Equipo">
            <Chips items={allSubTeams} accent="var(--accent)" />
          </MetaRow>
        )}

        {allLabels.length > 0 && (
          <MetaRow icon={<IconTag />} label="Etiqueta">
            <Chips items={allLabels} accent="var(--accent)" />
          </MetaRow>
        )}

        {request.sprintName && (
          <MetaRow icon={<IconSprint />} label="Sprint">
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: 'rgba(162,155,254,0.1)', border: '1px solid rgba(162,155,254,0.25)', color: '#a29bfe', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>
              {request.sprintName}
            </span>
          </MetaRow>
        )}

        {/* Fecha de cierre si está cerrada */}
        {isCerrada && request.fechaCierre && (
          <MetaRow icon={<IconCal />} label="Cerrada el">
            <span style={{ color: 'var(--success)', fontSize: 11 }}>
              {new Date(request.fechaCierre).toLocaleDateString('es-CO', {
                timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric',
              })}
            </span>
          </MetaRow>
        )}

        {/* Deadline solo si no está cerrada */}
        {!isCerrada && hasDeadline && (
          <MetaRow icon={<IconCal />} label="Fecha límite">
            <span style={{ color: isVencida ? 'var(--danger)' : 'var(--txt)', fontSize: 11 }}>
              {new Date(request.deadline!).toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric' })}
              {isVencida && (
                <span style={{ marginLeft: 5, fontSize: 8, fontWeight: 700, color: 'var(--danger)', background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.25)', borderRadius: 3, padding: '1px 4px' }}>
                  VENCIDA
                </span>
              )}
            </span>
          </MetaRow>
        )}
      </div>

      {shouldShowProgress && progreso > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 9, color: 'var(--txt-muted)' }}>
            <span>Progreso</span>
            <span>{progreso >= 100 ? '✓ Completado' : `${progreso}%`}</span>
          </div>
          <div style={{ height: 3, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${progreso}%`, height: '100%', borderRadius: 2, background: progreso >= 100 ? 'var(--success)' : isSubRequest ? '#a78bfa' : isNonDefault ? accent : 'var(--accent)', transition: 'width 0.3s ease' }} />
          </div>
        </div>
      )}
    </div>
  );
}