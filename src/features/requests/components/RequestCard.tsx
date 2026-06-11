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
import { useAcceptanceCriteria } from '@/features/requests/hooks/useAcceptanceCriteria';
import { config } from '@/config';
import type { Request } from '../types';
import type { Notification } from '@/types/commons';

type Props = {
  request:               Request;
  isDragging?:           boolean;
  onClick?:              () => void;
  unreadNotifications?:  Notification[];
  templateSchemaSnapshot?: SchemaField[];
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

const ACTIVITY_TYPE_COLOR: Record<string, string> = {
  comment:             '#a78bfa',
  assignment:          'var(--accent)',
  column_move:         '#60a5fa',
  closure:             '#34d399',
  criteria_reviewed:   '#fbbf24',
  sub_request_created: '#f472b6',
  mention:             'var(--accent)',
};

const ACTIVITY_TYPE_LABEL: Record<string, string> = {
  comment:             'Nuevo comentario',
  assignment:          'Asignación',
  column_move:         'Movido de columna',
  closure:             'Cerrado',
  criteria_reviewed:   'Criterio revisado',
  sub_request_created: 'Sub-solicitud creada',
  mention:             'Mención',
};

function ActivityDot({ notifications }: { notifications: Notification[] }) {
  if (notifications.length === 0) return null;
  const priority = ['mention', 'comment', 'assignment', 'criteria_reviewed', 'column_move', 'closure', 'sub_request_created'];
  const sorted   = [...notifications].sort((a, b) => priority.indexOf(a.type) - priority.indexOf(b.type));
  const top   = sorted[0];
  const color = ACTIVITY_TYPE_COLOR[top.type] ?? 'var(--accent)';
  const label = notifications.length === 1
    ? ACTIVITY_TYPE_LABEL[top.type] ?? 'Actividad'
    : `${notifications.length} novedades sin leer`;
  return (
    <div className="request-card__activity-dot" title={label} style={{ '--dot-color': color } as React.CSSProperties}>
      <span className="request-card__activity-dot-inner" />
      {notifications.length > 1 && (
        <span className="request-card__activity-count">{notifications.length > 9 ? '9+' : notifications.length}</span>
      )}
    </div>
  );
}

function MetaRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
      <span style={{ color: 'var(--txt-muted)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{ color: 'var(--txt-muted)', flexShrink: 0, minWidth: 68, fontSize: 10, letterSpacing: 0.3 }}>{label}</span>
      <span style={{ color: 'var(--txt)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{children}</span>
    </div>
  );
}

function AvatarChip({ name, color, team }: { name: string; color: string; team?: string | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 700, color: 'white', flexShrink: 0 }}>
        {initials(name)}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
        <span style={{ fontSize: 11, color: 'var(--txt)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>
          {name}
        </span>
        {team && (
          <span style={{ fontSize: 9, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120, lineHeight: 1.3 }}>
            {team}
          </span>
        )}
      </div>
    </div>
  );
}

const IconUser   = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
const IconUsers  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;
const IconCal    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
const IconZap    = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
const IconSprint = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>;
const IconCheck  = () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

const IconShield = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
    <line x1="12" y1="8" x2="12" y2="12"/>
    <line x1="12" y1="16" x2="12.01" y2="16"/>
  </svg>
);

const IconBranch = () => (
  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="6" y1="3" x2="6" y2="15"/>
    <circle cx="18" cy="6" r="3"/>
    <circle cx="6" cy="18" r="3"/>
    <path d="M18 9a9 9 0 0 1-9 9"/>
  </svg>
);

function CriteriaBadge({ requestId }: { requestId: string; accent: string }) {
  const { data: criteria = [] } = useAcceptanceCriteria(requestId);
  if (criteria.length === 0) return null;
  const accepted  = criteria.filter((c) => c.status === 'accepted').length;
  const rejected  = criteria.filter((c) => c.status === 'rejected').length;
  const total     = criteria.length;
  const allDone   = accepted === total;
  const hasReject = rejected > 0;
  const color  = allDone ? 'var(--success)' : hasReject ? 'var(--danger)' : 'var(--txt-muted)';
  const bg     = allDone ? 'rgba(0,229,160,0.1)' : hasReject ? 'rgba(255,71,87,0.1)' : 'rgba(255,255,255,0.05)';
  const border = allDone ? 'rgba(0,229,160,0.3)' : hasReject ? 'rgba(255,71,87,0.3)' : 'var(--border-subtle)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: 0.3, padding: '2px 6px', borderRadius: 3, background: bg, border: `1px solid ${border}`, color, flexShrink: 0 }}>
      <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      {accepted}/{total}
      {hasReject && <span style={{ color: 'var(--danger)', marginLeft: 1 }}> · {rejected}✗</span>}
    </span>
  );
}

function ChildCountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span title={`${count} sub-solicitud${count !== 1 ? 'es' : ''}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, letterSpacing: 0.3, padding: '2px 6px', borderRadius: 3, background: 'rgba(0,200,255,0.08)', border: '1px solid rgba(0,200,255,0.22)', color: 'var(--accent)', flexShrink: 0 }}>
      <IconBranch />{count}
    </span>
  );
}

/* ============================================================
   ExtraFieldsInCard — muestra campos con showInCard === true
   usando el snapshot guardado en la solicitud
   ============================================================ */
type SchemaField = Record<string, unknown>;

type FlatCardField = {
  key:        string;
  label:      string;
  showInCard: boolean;
};

// Colecta todos los keys de un schema (para lookup en snapshot)
function collectAllKeysFromSchema(fields: SchemaField[]): Map<string, FlatCardField> {
  const map = new Map<string, FlatCardField>();
  for (const field of fields) {
    if (!field.key || !field.label) continue;
    const showInCard = (field.showInCard as boolean | undefined) ?? false;
    map.set(field.key as string, {
      key:        field.key as string,
      label:      field.label as string,
      showInCard,
    });
    if (field.type === 'conditional') {
      for (const [k, v] of collectAllKeysFromSchema((field.trueBranch  as SchemaField[]) ?? [])) map.set(k, v);
      for (const [k, v] of collectAllKeysFromSchema((field.falseBranch as SchemaField[]) ?? [])) map.set(k, v);
    }
  }
  return map;
}

// Recorre solo la rama activa, respetando showInCard
function flattenSchemaForCard(
  fields:   SchemaField[],
  formData: Record<string, unknown>,
): FlatCardField[] {
  const result: FlatCardField[] = [];
  for (const field of fields) {
    if (!field.key) continue;
    const showInCard = (field.showInCard as boolean | undefined) ?? false;
    if (field.type === 'conditional') {
      if (showInCard && field.label) {
        result.push({ key: field.key as string, label: field.label as string, showInCard });
      }
      const val       = formData[field.key as string];
      const effective = (val === undefined || val === null || val === '') ? 'false' : String(val);
      const branch    = effective === 'true'
        ? (field.trueBranch  as SchemaField[]) ?? []
        : (field.falseBranch as SchemaField[]) ?? [];
      result.push(...flattenSchemaForCard(branch, formData));
    } else {
      if (showInCard && field.label) {
        result.push({ key: field.key as string, label: field.label as string, showInCard });
      }
    }
  }
  return result;
}

const IconForm = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

function ExtraFieldsInCard({ formData, liveSchema, snapshotSchema, accent }: {
  formData:        Record<string, unknown>;
  liveSchema:      SchemaField[];
  snapshotSchema:  SchemaField[];
  accent:          string;
}) {
  // 1. Campos visibles según el schema live (rama activa, showInCard: true)
  const liveFields    = flattenSchemaForCard(liveSchema, formData);
  const liveKeySet    = new Set(liveFields.map((f) => f.key));

  // 2. Lookup completo del snapshot (todos los keys, sin filtrar rama)
  const snapshotLookup = collectAllKeysFromSchema(snapshotSchema);

  // 3. Keys en formData que no están en el schema live → buscar en snapshot
// Lookup del live schema para verificar si el key existe con showInCard: false
const liveAllKeys = collectAllKeysFromSchema(liveSchema);

const orphanFields: FlatCardField[] = Object.keys(formData)
  .filter((k) => !liveKeySet.has(k))
  .map((k) => {
    // Si el key existe en el live schema con showInCard: false → ocultarlo
    const liveEntry = liveAllKeys.get(k);
    if (liveEntry) return null; // existe en live pero no es visible → respetar eso

    // No existe en live → buscar en snapshot para label
    const snap = snapshotLookup.get(k);
    if (!snap || !snap.showInCard) return null;
    return snap;
  })
  .filter((f): f is FlatCardField => f !== null);
  
  // 4. Unir: primero los del schema live, luego los huérfanos del snapshot
  const visible = [...liveFields, ...orphanFields].filter(({ key }) => {
    const val = formData[key];
    return val !== undefined && val !== null && val !== '';
  });

  if (visible.length === 0) return null;

  function formatValue(key: string): React.ReactNode {
    const val = formData[key];
    if (val === 'true')  return <span style={{ color: 'var(--success)', fontWeight: 700 }}>Sí</span>;
    if (val === 'false') return <span style={{ color: 'var(--txt-muted)' }}>No</span>;
    const str = String(val);
    return str.length > 22 ? str.slice(0, 22) + '…' : str;
  }

  return (
    <>
      <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0 8px' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {visible.map(({ key, label }) => (
          <MetaRow key={key} icon={<IconForm />} label={label}>
            <span style={{
              fontSize: 11,
              color: formData[key] === 'true' ? 'var(--success)' : formData[key] === 'false' ? 'var(--txt-muted)' : accent,
              fontWeight: 500,
            }}>
              {formatValue(key)}
            </span>
          </MetaRow>
        ))}
      </div>
    </>
  );
}

/* ============================================================
   RequestCard
   ============================================================ */
export function RequestCard({ request, isDragging = false, onClick, unreadNotifications = [] }: Props) {
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
  const primerAsignado = request.assignees?.[0] ?? null;
  const isCerrada = !!request.fechaCierre;
  const isConfidential = request.isConfidential ?? false;

  const hasActivity = unreadNotifications.length > 0;

  // ── Datos para campos en card ──────────────────────────────────────────────
  // Usamos el snapshot guardado al momento de creación para que los cambios
  // posteriores al template no afecten la visualización de cards existentes.
const cardFormData      = (request.formData ?? {}) as Record<string, unknown>;
const cardLiveSchema    = (request.templateFormSchema    ?? []) as SchemaField[];
const cardSnapshotSchema = (request.templateSchemaSnapshot ?? []) as SchemaField[];
const hasCardFields     = (cardLiveSchema.length > 0 || cardSnapshotSchema.length > 0) && Object.keys(cardFormData).length > 0;

  function handleClick(e: React.MouseEvent) {
    if (isSortableDragging) return;
    e.stopPropagation();
    onClick?.();
  }

const closureBorderStyle = isCerrada
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
        ...(hasActivity && !isBeingDragged
          ? { outline: '1px solid rgba(167,139,250,0.35)' }
          : {}),
      }}
      className={[cardClasses, isBeingDragged ? 'request-card--dragging' : ''].filter(Boolean).join(' ')}
      {...attributes}
      {...listeners}
      onClick={handleClick}
    >
      {/* Dot de actividad */}
      {hasActivity && <ActivityDot notifications={unreadNotifications} />}

      {/* Header: ID + badge tipo (izquierda) | badges pequeños (derecha) */}
      <div className="request-card__header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6, marginBottom: 6 }}>

        {/* Izquierda: ID + badge de tipo */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: 'monospace', fontSize: 9, color: 'var(--txt-muted)', letterSpacing: '0.5px', opacity: 0.55, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {request.id}
          </div>
          {isCerrada ? (
            <span style={{ alignSelf: 'flex-start', background: 'rgba(0,229,160,0.1)', color: 'var(--success)', border: '1px solid rgba(0,229,160,0.3)', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: '2px 6px', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <IconCheck /> Cerrada
            </span>
          ) : isSubRequest ? (
            <span style={{ alignSelf: 'flex-start', background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.3)', fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: '2px 6px', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              ↳ Sub-Solicitud
            </span>
          ) : isNonDefault ? (
            <span style={{ alignSelf: 'flex-start', background: `${accent}15`, color: accent, border: `1px solid ${accent}35`, fontSize: 9, fontWeight: 700, letterSpacing: 0.5, padding: '2px 6px', borderRadius: 3, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <span style={{ fontSize: 10 }}>{template.visual.icon}</span>
              {template.visual.badgeLabel}
            </span>
          ) : null}
        </div>

        {/* Derecha: childCount + confidencial + criteria */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0, paddingTop: 1 }}>
          <ChildCountBadge count={childCount} />
          {isConfidential && (
            <span title="Información confidencial" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 4, background: 'rgba(253,203,110,0.12)', border: '1px solid rgba(253,203,110,0.35)', color: '#fdcb6e', flexShrink: 0 }}>
              <IconShield />
            </span>
          )}
          <CriteriaBadge requestId={request.id} accent={accent} />
        </div>
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
  <AvatarChip
    name={request.solicitante}
    color="linear-gradient(135deg,#0055cc,#00c8ff)"
    team={request.requesterTeamName}
  />
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

        {request.sprintName && (
          <MetaRow icon={<IconSprint />} label="Sprint">
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 3, background: 'rgba(162,155,254,0.1)', border: '1px solid rgba(162,155,254,0.25)', color: '#a29bfe', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 110 }}>
              {request.sprintName}
            </span>
          </MetaRow>
        )}

        {isCerrada && request.fechaCierre && (
          <MetaRow icon={<IconCal />} label="Cerrada el">
            <span style={{ color: 'var(--success)', fontSize: 11 }}>
              {new Date(request.fechaCierre).toLocaleDateString('es-CO', {
                timeZone: 'America/Bogota', day: 'numeric', month: 'short', year: 'numeric',
              })}
            </span>
          </MetaRow>
        )}
      </div>

      {/* Campos extra del template con showInCard === true */}
{hasCardFields && (
  <ExtraFieldsInCard
    formData={cardFormData}
    liveSchema={cardLiveSchema}
    snapshotSchema={cardSnapshotSchema}
    accent={accent}
  />
)}

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
