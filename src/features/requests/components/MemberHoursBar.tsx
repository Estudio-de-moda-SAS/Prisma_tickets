// src/features/requests/components/MemberHoursBar.tsx
import { useMemo, useState } from 'react';
import type { BoardData } from '../types';
import { useCustomizationStore } from '@/store/customizationStore';

/* ============================================================
   Tipos locales
   ============================================================ */
type SubTeamGroup = {
  subTeam:   { Sub_Team_ID: number; Sub_Team_Name: string; Sub_Team_Color: string };
  members:   { User_Name: string; User_Email?: string }[];
  isLoading: boolean;
};

type MemberStat = {
  userName:       string;
  initials:       string;
  displayName:    string;
  subTeamName:    string;
  subTeamColor:   string;
  estimatedHours: number;
  loggedHours:    number;
  requestCount:   number;
};

/* ============================================================
   Helpers
   ============================================================ */
const MAX_VISIBLE = 5;

/** Paleta vibrante — cada persona obtiene un color consistente por nombre */
const PALETTE = [
  '#F97316', // naranja
  '#EC4899', // rosa
  '#8B5CF6', // violeta
  '#10B981', // verde esmeralda
  '#3B82F6', // azul
  '#EF4444', // rojo
  '#F59E0B', // ámbar
  '#06B6D4', // cyan
  '#6366F1', // índigo
  '#14B8A6', // teal
  '#F43F5E', // rosa fuerte
  '#84CC16', // lima
];

function colorForName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 3) return (parts[0][0] + parts[2][0]).toUpperCase();
  if (parts.length === 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/**
 * Formato colombiano: Nombre1 Nombre2 Apellido1 Apellido2
 * Muestra: "Nombre1 Apellido2"  (4 partes)
 *          "Nombre1 Apellido1"  (3 partes)
 *          "Nombre1 Apellido1"  (2 partes)
 *          "Nombre1"            (1 parte)
 */
function getDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 4) return `${parts[0]} ${parts[2]}`;
  if (parts.length === 3) return `${parts[0]} ${parts[1]}`;
  if (parts.length === 2) return `${parts[0]} ${parts[1]}`;
  return parts[0];
}

function formatHours(h: number): string {
  if (h === 0) return '—';
  if (h < 1)   return `${Math.round(h * 60)}m`;
  return `${Number.isInteger(h) ? h : h.toFixed(1)}h`;
}

/* ============================================================
   MemberChip
   ============================================================ */
function MemberChip({ stat }: { stat: MemberStat }) {
  const [hovered, setHovered] = useState(false);
  const hasLogged = stat.loggedHours > 0;

  const tooltipLines = [
    stat.userName,
    stat.subTeamName,
    `${stat.requestCount} ticket${stat.requestCount !== 1 ? 's' : ''}`,
    `Estimadas: ${formatHours(stat.estimatedHours)}`,
    hasLogged ? `Registradas: ${formatHours(stat.loggedHours)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return (
    <div
      title={tooltipLines}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:     'flex',
        alignItems:  'center',
        gap:          5,
        height:       26,
        padding:     '0 8px 0 3px',
        background:   hovered ? 'var(--bg-hover)' : 'var(--bg-surface)',
        border:      `1px solid ${hovered ? stat.subTeamColor + '66' : 'var(--border-subtle)'}`,
        borderRadius: 20,
        cursor:      'default',
        flexShrink:   0,
        transition:  'background 0.15s, border-color 0.15s',
      }}
    >
      {/* Avatar con color único por persona */}
      <div style={{
        width:           20,
        height:          20,
        borderRadius:   '50%',
        background:      stat.subTeamColor + '22',
        border:         `1.5px solid ${stat.subTeamColor}`,
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        fontSize:        9,
        fontWeight:      700,
        color:           stat.subTeamColor,
        letterSpacing:  '0.3px',
        flexShrink:      0,
        fontFamily:     'var(--font-display)',
        userSelect:     'none',
      }}>
        {stat.initials}
      </div>

      {/* Nombre1 Apellido2 */}
      <span style={{
        fontSize:     11,
        color:       'var(--txt-muted)',
        maxWidth:     80,
        overflow:    'hidden',
        textOverflow:'ellipsis',
        whiteSpace:  'nowrap',
        lineHeight:   1,
      }}>
        {stat.displayName}
      </span>

      {/* Horas estimadas */}
      <span style={{
        fontSize:      11,
        fontWeight:     600,
        color:          stat.estimatedHours > 0 ? stat.subTeamColor : 'var(--txt-dim)',
        fontFamily:    'var(--font-display)',
        letterSpacing: '0.3px',
        lineHeight:     1,
        flexShrink:     0,
      }}>
        {formatHours(stat.estimatedHours)}
      </span>

      {/* Horas registradas (si existen) */}
      {hasLogged && (
        <span style={{
          fontSize:    9,
          color:      'var(--txt-dim)',
          lineHeight:  1,
          flexShrink:  0,
        }}>
          /{formatHours(stat.loggedHours)}
        </span>
      )}
    </div>
  );
}

/* ============================================================
   MemberHoursBar
   ============================================================ */
interface Props {
  filteredData:   BoardData | undefined;
  groupedMembers: SubTeamGroup[];
  /** Slug del equipo activo — clave de customización */
  boardId:        string;
  /** Slugs reales y visibles del board (para intersectar y mostrar opciones) */
  availableSlugs: string[];
}

export function MemberHoursBar({ filteredData, groupedMembers, boardId, availableSlugs }: Props) {
  const [expanded, setExpanded] = useState(false);
  const { getHoursColumns } = useCustomizationStore();

  // Fallback a las keys del board durante la carga de columnConfig
  const availableForCount = availableSlugs.length > 0
    ? availableSlugs
    : Object.keys(filteredData ?? {});

  const countedSlugs = getHoursColumns(boardId, availableForCount);
  const countedKey   = countedSlugs.join('|'); // dep estable para el memo

  const memberStats = useMemo((): MemberStat[] => {
    if (!filteredData) return [];

    const counted = countedKey ? new Set(countedKey.split('|')) : new Set<string>();

    // Lookup opcional: userName → subTeam (para nombre de subequipo en tooltip)
    const memberSubTeam = new Map<string, { name: string; color: string }>();
    for (const g of groupedMembers) {
      if (g.isLoading) continue;
      for (const m of g.members) {
        if (!memberSubTeam.has(m.User_Name)) {
          memberSubTeam.set(m.User_Name, {
            name:  g.subTeam.Sub_Team_Name,
            color: g.subTeam.Sub_Team_Color,
          });
        }
      }
    }

    // Acumular horas por asignado SOLO de las columnas marcadas
    const acc = new Map<string, { est: number; log: number; count: number }>();
    for (const slug of counted) {
      for (const req of filteredData[slug] ?? []) {
        for (const assignee of req.assignees ?? []) {
          const cur = acc.get(assignee.userName) ?? { est: 0, log: 0, count: 0 };
          cur.est   += req.estimatedHours ?? 0;
          cur.log   += req.loggedHours    ?? 0;
          cur.count += 1;
          acc.set(assignee.userName, cur);
        }
      }
    }

    if (acc.size === 0) return [];

    return [...acc.entries()]
      .map(([userName, { est, log, count }]) => {
        const st = memberSubTeam.get(userName);
        return {
          userName,
          initials:       getInitials(userName),
          displayName:    getDisplayName(userName),
          subTeamName:    st?.name ?? '',
          // Color: sub-equipo si existe, si no → color único por nombre
subTeamColor: colorForName(userName),
          estimatedHours: est,
          loggedHours:    log,
          requestCount:   count,
        };
      })
      .sort((a, b) => b.estimatedHours - a.estimatedHours || b.requestCount - a.requestCount);
  }, [filteredData, groupedMembers, countedKey]);

  if (memberStats.length === 0) return null;

  const visible = expanded ? memberStats : memberStats.slice(0, MAX_VISIBLE);
  const hidden  = memberStats.length - MAX_VISIBLE;

  return (
    <>
      {/* Separador vertical */}
      <div style={{
        width:      1,
        height:     20,
        background: 'var(--border-subtle)',
        flexShrink: 0,
        alignSelf:  'center',
      }} />

      {/* Chips */}
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:         4,
        flexWrap:   'wrap',
        flexShrink:  1,
        minWidth:    0,
      }}>
        {visible.map((m) => (
          <MemberChip key={m.userName} stat={m} />
        ))}

        {!expanded && hidden > 0 && (
          <button
            onClick={() => setExpanded(true)}
            title={`Ver ${hidden} miembro${hidden !== 1 ? 's' : ''} más`}
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              height:          26,
              padding:        '0 9px',
              background:     'var(--bg-surface)',
              border:         '1px solid var(--border-subtle)',
              borderRadius:    20,
              fontSize:        10,
              color:          'var(--txt-dim)',
              cursor:         'pointer',
              fontFamily:     'var(--font-display)',
              letterSpacing:  '0.4px',
              flexShrink:      0,
            }}
          >
            +{hidden}
          </button>
        )}

        {expanded && memberStats.length > MAX_VISIBLE && (
          <button
            onClick={() => setExpanded(false)}
            title="Colapsar"
            style={{
              display:        'flex',
              alignItems:     'center',
              justifyContent: 'center',
              height:          26,
              padding:        '0 9px',
              background:     'transparent',
              border:         '1px solid var(--border-subtle)',
              borderRadius:    20,
              fontSize:        10,
              color:          'var(--txt-dim)',
              cursor:         'pointer',
              flexShrink:      0,
            }}
          >
            ‹ menos
          </button>
        )}
      </div>
    </>
  );
}