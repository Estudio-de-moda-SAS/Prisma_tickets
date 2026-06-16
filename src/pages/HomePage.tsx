import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, CalendarDays, Zap, Search, X, Clock } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useRole, canSeeBoard } from '@/auth/roles';
import { teamColors, getTeamIcon } from '@/components/layout/siderbarConstants';
import { useBoardTeams } from '@/features/requests/hooks/useBoardMetadata';
import { useBoardEquipo } from '@/features/requests/hooks/useRequests';
import { useSprints } from '@/features/requests/hooks/useSprints';
import { useUsers } from '@/features/requests/hooks/useUsers';
import { useSubTeams } from '@/features/requests/hooks/useSubTeams';
import { useLabelsByTeamId } from '@/features/requests/hooks/useLabels';
import { useFilteredBoard } from '@/features/requests/hooks/useFilteredBoard';
import { BoardFilters, type FilterDynamicOptions } from '@/features/requests/components/BoardFilters';
import { HomeRequestModal } from '@/features/requests/components/HomeRequestModal';
import type { Equipo, Request, BoardData } from '@/features/requests/types';
import type { Sprint } from '@/features/requests/hooks/useSprints';
import { config } from '@/config';
import { useBoardTemplates } from '@/features/requests/hooks/useBoardMetadata';
import type { TemplateFilterOption, TemplateFieldOption } from '@/features/requests/components/BoardFilters';
import type { TemplateExtraField, ConditionalField } from '@/features/requests/templates/types';
import { isConditionalField } from '@/features/requests/templates/types';
import { HomeAnnouncementsSection } from '@/components/layout/AnnouncementBanner';

/* ══════════════════════════════════════════════════════════════
   Constantes de presentación
   ══════════════════════════════════════════════════════════════ */
const DONE_COLUMNS = new Set(['ready_to_deploy', 'hecho', 'historial']);
   const PRIORIDAD_COLOR: Record<string, string> = {
  baja:    '#4EA8DE',
  media:   '#F4C542',
  alta:    '#EF9F27',
  critica: '#E05C5C',
};
const COLUMNA_LABEL: Record<string, string> = {
  sin_categorizar: 'Sin categorizar', icebox: 'Icebox',    backlog: 'Backlog',
  todo:            'To Do',           en_progreso: 'En Progreso',
  en_revision_qas: 'En revisión',     ready_to_deploy: 'Ready',
  hecho:           'Hecho',           historial: 'Historial',
};
const COLUMNA_COLOR: Record<string, string> = {
  sin_categorizar: 'var(--txt-muted)', icebox: '#4EA8DE',   backlog: '#9B8AFF',
  todo:            '#F4C542',          en_progreso: '#1D9E75',
  en_revision_qas: '#f59e0b',          ready_to_deploy: '#a78bfa',
  hecho:           '#4CAF50',          historial: 'var(--txt-muted)',
};

/* ══════════════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════════════ */
function timeAgo(iso: string): string {
  const n = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
  const d = Date.now() - new Date(n).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function getActiveSprint(sprints: Sprint[]): Sprint | null {
  const now = Date.now();
  return sprints.find((s) => {
    const start = new Date(s.Sprint_Start_Date).getTime();
    const end   = new Date(s.Sprint_End_Date).getTime() + 86_400_000;
    return now >= start && now <= end;
  }) ?? null;
}
function sprintProgress(s: Sprint) {
  const start = new Date(s.Sprint_Start_Date).getTime();
  const end   = new Date(s.Sprint_End_Date).getTime() + 86_400_000;
  return Math.min(100, Math.max(0, Math.round(((Date.now() - start) / (end - start)) * 100)));
}
function sprintDaysLeft(s: Sprint) {
  return Math.max(0, Math.ceil((new Date(s.Sprint_End_Date).getTime() + 86_400_000 - Date.now()) / 86_400_000));
}
function getNextSprint(sprints: Sprint[]): Sprint | null {
  const now = Date.now();
  const upcoming = sprints
    .filter((s) => new Date(s.Sprint_Start_Date).getTime() > now)
    .sort((a, b) => new Date(a.Sprint_Start_Date).getTime() - new Date(b.Sprint_Start_Date).getTime());
  return upcoming[0] ?? null;
}
function sprintDaysUntilStart(s: Sprint): number {
  return Math.max(1, Math.ceil((new Date(s.Sprint_Start_Date).getTime() - Date.now()) / 86_400_000));
}
function boardToFlat(board: BoardData): Request[] {
  return Object.values(board).flat();
}

/* ══════════════════════════════════════════════════════════════
   CriteriaBadge
   ══════════════════════════════════════════════════════════════ */
function CriteriaBadge({ summary }: { summary: Request['criteriaSummary'] }) {
  if (!summary || summary.total === 0) return null;
  const allDone = summary.accepted === summary.total;
  const hasRej  = summary.rejected > 0;
  const color   = allDone ? '#4CAF50' : hasRej ? '#E05C5C' : 'var(--txt-muted)';
  const bg      = allDone ? 'rgba(76,175,80,0.1)' : hasRej ? 'rgba(224,92,92,0.1)' : 'rgba(255,255,255,0.05)';
  const border  = allDone ? 'rgba(76,175,80,0.3)' : hasRej ? 'rgba(224,92,92,0.3)' : 'rgba(255,255,255,0.1)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 700, letterSpacing: 0.3, padding: '2px 6px', borderRadius: 3, flexShrink: 0, background: bg, border: `1px solid ${border}`, color }}>
      <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
      {summary.accepted}/{summary.total}
      {hasRej && !allDone && <span style={{ opacity: 0.75 }}> · {summary.rejected}✗</span>}
    </span>
  );
}

/* ══════════════════════════════════════════════════════════════
   SprintBanner
   ══════════════════════════════════════════════════════════════ */
function SprintBanner() {
  const { data: sprints = [], isLoading } = useSprints();
  const activeSprint = useMemo(() => getActiveSprint(sprints), [sprints]);
  const nextSprint   = useMemo(() => (activeSprint ? null : getNextSprint(sprints)), [sprints, activeSprint]);

  if (isLoading || (!activeSprint && !nextSprint)) return null;

  /* ── Próximo sprint (sin activo) ── */
  if (!activeSprint && nextSprint) {
    const daysUntil = sprintDaysUntilStart(nextSprint);
    const startFmt  = new Date(nextSprint.Sprint_Start_Date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
    const endFmt    = new Date(nextSprint.Sprint_End_Date).toLocaleDateString('es-CO',   { day: 'numeric', month: 'short' });
    const upColor   = '#a78bfa';
    const startsLabel = daysUntil === 1 ? 'Inicia mañana' : `Inicia en ${daysUntil}d`;
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', borderRadius: 10, background: 'var(--surface-1)', border: '1px solid rgba(167,139,250,0.18)', boxShadow: '0 0 20px rgba(167,139,250,0.06)', position: 'relative', overflow: 'hidden', height: '100%', boxSizing: 'border-box' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, #a78bfa, #a78bfa00)' }} />
        <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(167,139,250,0.10)', border: '1px solid rgba(167,139,250,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Clock size={15} style={{ color: upColor }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-muted)', letterSpacing: '0.9px', textTransform: 'uppercase' }}>Próximo sprint</span>
            <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: 'rgba(167,139,250,0.12)', color: upColor, border: '1px solid rgba(167,139,250,0.28)' }}>Próximo</span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--font-display)', letterSpacing: '0.3px' }}>{nextSprint.Sprint_Text}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <CalendarDays size={11} style={{ color: 'var(--txt-muted)' }} />
              <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{startFmt} — {endFmt}</span>
            </div>
            <span style={{ fontSize: 11, fontWeight: 600, color: upColor }}>{startsLabel}</span>
          </div>
          <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: '0%', borderRadius: 3, background: `linear-gradient(90deg, ${upColor}, ${upColor}88)` }} />
          </div>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: upColor, fontFamily: 'var(--font-display)', flexShrink: 0, minWidth: 36, textAlign: 'right' }}>{daysUntil}d</span>
      </div>
    );
  }

  /* ── Sprint activo ── */
  const pct      = sprintProgress(activeSprint!);
  const daysLeft = sprintDaysLeft(activeSprint!);
  const startFmt = new Date(activeSprint!.Sprint_Start_Date).toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  const endFmt   = new Date(activeSprint!.Sprint_End_Date).toLocaleDateString('es-CO',   { day: 'numeric', month: 'short' });
  const uc = daysLeft <= 2 ? '#E05C5C' : daysLeft <= 4 ? '#EF9F27' : 'var(--accent)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 18px', borderRadius: 10, background: 'var(--surface-1)', border: '1px solid rgba(0,200,255,0.18)', boxShadow: '0 0 20px rgba(0,200,255,0.06)', position: 'relative', overflow: 'hidden', height: '100%', boxSizing: 'border-box' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, var(--accent), var(--accent)00)' }} />
      <div style={{ width: 34, height: 34, borderRadius: 8, background: 'rgba(0,200,255,0.10)', border: '1px solid rgba(0,200,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Zap size={15} style={{ color: 'var(--accent)' }} />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt-muted)', letterSpacing: '0.9px', textTransform: 'uppercase' }}>Sprint activo</span>
          <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: 'rgba(0,200,255,0.12)', color: 'var(--accent)', border: '1px solid rgba(0,200,255,0.28)' }}>En curso</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--font-display)', letterSpacing: '0.3px' }}>{activeSprint!.Sprint_Text}</span>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <CalendarDays size={11} style={{ color: 'var(--txt-muted)' }} />
            <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{startFmt} — {endFmt}</span>
          </div>
          <span style={{ fontSize: 11, fontWeight: 600, color: uc }}>{daysLeft === 0 ? 'Último día' : `${daysLeft}d restantes`}</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: `linear-gradient(90deg, var(--accent), ${uc})`, transition: 'width 0.6s ease' }} />
        </div>
      </div>
      <span style={{ fontSize: 13, fontWeight: 700, color: uc, fontFamily: 'var(--font-display)', flexShrink: 0, minWidth: 36, textAlign: 'right' }}>{pct}%</span>
    </div>
  );
}
/* ══════════════════════════════════════════════════════════════
   EquipoTab
   ══════════════════════════════════════════════════════════════ */
function EquipoTab({ equipo, teamColor, teamIcon, description, label, isActive, isAdminOnly, onClick }: {
  equipo: string; teamColor: string; teamIcon: string; description: string;
  label: string; isActive: boolean; isAdminOnly?: boolean; onClick: () => void;
}) {
  const c    = teamColors(teamColor);
  const Icon = getTeamIcon(teamIcon);
  const { data: board } = useBoardEquipo(equipo);
  const all    = board ? boardToFlat(board) : [];
  const active = all.filter((r) => !DONE_COLUMNS.has(r.columna)).length;
  const done   = all.filter((r) =>  DONE_COLUMNS.has(r.columna)).length;

  return (
    <button onClick={onClick} style={{
      flexShrink: 0, width: 200,
      background: isActive ? `linear-gradient(145deg, ${c.dot}16 0%, ${c.dot}07 100%)` : 'var(--surface-1)',
      border: `1px solid ${isActive ? c.dot + '55' : 'var(--border)'}`,
      borderRadius: 12, padding: '14px 16px', cursor: 'pointer',
      transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)', position: 'relative', overflow: 'hidden',
      boxShadow: isActive ? `0 0 0 1px ${c.dot}18, 0 6px 20px ${c.dot}18` : 'none',
    }}
      onMouseEnter={(e) => { if (!isActive) { const el = e.currentTarget as HTMLElement; el.style.borderColor = c.dot + '40'; el.style.background = `linear-gradient(145deg, ${c.dot}0A 0%, ${c.dot}03 100%)`; el.style.transform = 'translateY(-1px)'; }}}
      onMouseLeave={(e) => { if (!isActive) { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--border)'; el.style.background = 'var(--surface-1)'; el.style.transform = 'translateY(0)'; }}}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: isActive ? 3 : 2, background: isActive ? `linear-gradient(90deg, ${c.dot}, ${c.dot}88)` : `linear-gradient(90deg, ${c.dot}00, ${c.dot}35, ${c.dot}00)`, transition: 'height 0.2s' }} />
      {isActive && <div style={{ position: 'absolute', top: -40, right: -20, width: 90, height: 90, borderRadius: '50%', background: `radial-gradient(circle, ${c.dot}20 0%, transparent 70%)`, pointerEvents: 'none' }} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: isActive ? c.dot + '22' : c.dot + '14', border: `1px solid ${c.dot + (isActive ? '40' : '25')}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.2s' }}>
            <Icon size={14} style={{ color: c.dot }} />
          </div>
          <span style={{ fontSize: 11, fontWeight: 700, color: isActive ? c.dot : 'var(--txt)', fontFamily: 'var(--font-display)', letterSpacing: '0.5px', textTransform: 'uppercase', transition: 'color 0.2s' }}>{label}</span>
          {isAdminOnly && (
            <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)', color: '#ff4757', letterSpacing: '0.5px', flexShrink: 0 }}>🔒 Admin</span>
          )}
        </div>
        {isActive && <div style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot, boxShadow: `0 0 8px ${c.dot}`, flexShrink: 0 }} />}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 11, color: 'var(--txt-muted)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 33 }}>
        {description}
      </p>
      <div style={{ display: 'flex', paddingTop: 10, borderTop: `1px solid ${isActive ? c.dot + '20' : 'rgba(255,255,255,0.05)'}`, transition: 'border-color 0.2s' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: c.dot, lineHeight: 1, fontFamily: 'var(--font-display)' }}>{active}</span>
          <span style={{ fontSize: 9, color: 'var(--txt-muted)', letterSpacing: '0.4px', textTransform: 'uppercase' }}>activas</span>
        </div>
        <div style={{ width: 1, background: isActive ? c.dot + '25' : 'rgba(255,255,255,0.06)', alignSelf: 'stretch', transition: 'background 0.2s' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, paddingLeft: 14 }}>
          <span style={{ fontSize: 20, fontWeight: 700, color: '#4CAF50', lineHeight: 1, fontFamily: 'var(--font-display)' }}>{done}</span>
          <span style={{ fontSize: 9, color: 'var(--txt-muted)', letterSpacing: '0.4px', textTransform: 'uppercase' }}>resueltas</span>
        </div>
      </div>
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════
   TicketRow
   ══════════════════════════════════════════════════════════════ */
function TicketRow({ r, isLast, onClick, activeSprint, sprints }: {
  r: Request; isLast: boolean; onClick: () => void; activeSprint: Sprint | null; sprints: Sprint[];
}) {
  const inSprint = activeSprint && r.sprintId === activeSprint.Sprint_ID;
  const futureSprint = !inSprint && r.sprintId
    ? sprints.find(s =>
        s.Sprint_ID === r.sprintId &&
        new Date(s.Sprint_Start_Date).getTime() > Date.now()
      ) ?? null
    : null;
  const pastSprint = !inSprint && !futureSprint && r.sprintId
    ? sprints.find(s =>
        s.Sprint_ID === r.sprintId &&
        new Date(s.Sprint_End_Date).getTime() + 86_400_000 < Date.now()
      ) ?? null
    : null;
  return (
    <div
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.035)', transition: 'background 0.12s', cursor: 'pointer' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{ width: 150, fontSize: 10, fontWeight: 700, color: 'var(--accent)', opacity: 0.85, fontFamily: 'monospace', flexShrink: 0, letterSpacing: '0.3px' }}>{r.id}</span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, overflow: 'hidden' }}>
        <span style={{ fontSize: 13, color: 'var(--txt)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{r.titulo}</span>
        <CriteriaBadge summary={r.criteriaSummary} />
      </div>
      {inSprint && (
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.4px', textTransform: 'uppercase', background: 'rgba(0,200,255,0.12)', color: 'var(--accent)', border: '1px solid rgba(0,200,255,0.28)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <Zap size={8} />{activeSprint!.Sprint_Text}
        </span>
      )}
{futureSprint && (
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.4px', textTransform: 'uppercase', background: 'rgba(167,139,250,0.12)', color: '#a78bfa', border: '1px solid rgba(167,139,250,0.28)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <Clock size={8} />{futureSprint.Sprint_Text}
        </span>
      )}
      {pastSprint && (
        <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, letterSpacing: '0.4px', textTransform: 'uppercase', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.28)', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>
          <Clock size={8} />{pastSprint.Sprint_Text}
        </span>
      )}
      <span style={{ width: 110, fontSize: 11, color: 'var(--txt-muted)', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.solicitante}</span>
      <div style={{ width: 80, display: 'flex', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.3px', textTransform: 'uppercase', whiteSpace: 'nowrap', background: PRIORIDAD_COLOR[r.prioridad] + '18', color: PRIORIDAD_COLOR[r.prioridad], border: `1px solid ${PRIORIDAD_COLOR[r.prioridad]}35` }}>
          {r.prioridad.charAt(0).toUpperCase() + r.prioridad.slice(1)}
        </span>
      </div>
      <div style={{ width: 110, display: 'flex', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.3px', textTransform: 'uppercase', whiteSpace: 'nowrap', background: (COLUMNA_COLOR[r.columna] ?? '#888') + '18', color: COLUMNA_COLOR[r.columna] ?? '#888', border: `1px solid ${(COLUMNA_COLOR[r.columna] ?? '#888')}35` }}>
          {COLUMNA_LABEL[r.columna] ?? r.columna}
        </span>
      </div>
      <span style={{ width: 40, fontSize: 11, color: 'var(--txt-muted)', flexShrink: 0, textAlign: 'right' }}>{timeAgo(r.fechaApertura)}</span>
    </div>
  );
}
function flattenTemplateFields(
  fields: TemplateExtraField[],
  seen:   Set<string>,
  result: TemplateFieldOption[],
): void {
  for (const f of fields) {
    if (isConditionalField(f)) {
      const cf = f as ConditionalField;
      // El disparador del condicional es un checkbox → boolean
      if (cf.key && cf.label?.trim() && !seen.has(cf.key)) {
        seen.add(cf.key);
        result.push({ key: cf.key, label: cf.label, fieldType: 'boolean' });
      }
      flattenTemplateFields(cf.trueBranch,  seen, result);
      flattenTemplateFields(cf.falseBranch, seen, result);
    } else {
      if (!f.key || f.key === '__labels') continue;
      if (seen.has(f.key)) continue;
      seen.add(f.key);

      const label = f.label?.trim()
        ? f.label
        : f.key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

      // Determinar fieldType
      let fieldType: TemplateFieldOption['fieldType'];
      if (f.type === 'select' || f.type === 'radio') {
        fieldType = 'select_radio';
      } else if (f.type === 'checkbox') {
        fieldType = 'boolean';
      } else {
        fieldType = 'text';
      }

      result.push({
        key:      f.key,
        label,
        fieldType,
        options: (f.type === 'select' || f.type === 'radio') ? (f.options ?? []) : undefined,
      });
    }
  }
}
/* ══════════════════════════════════════════════════════════════
   TabsScroller — scroll horizontal con fades y flechas
   ══════════════════════════════════════════════════════════════ */
import { useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

function TabsScroller({ children }: { children: React.ReactNode }) {
  const scrollRef   = useRef<HTMLDivElement>(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 4);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    update();
    el.addEventListener('scroll', update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => { el.removeEventListener('scroll', update); ro.disconnect(); };
  }, [update]);

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -240 : 240, behavior: 'smooth' });
  };

  const btnStyle = (visible: boolean, side: 'left' | 'right'): React.CSSProperties => ({
    position: 'absolute', top: '50%', [side]: 0,
    transform: 'translateY(-50%)',
    zIndex: 2,
    width: 28, height: 28, borderRadius: '50%',
    background: 'var(--surface-1)',
    border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', color: 'var(--txt-muted)',
    opacity: visible ? 1 : 0,
    pointerEvents: visible ? 'auto' : 'none',
    transition: 'opacity 0.2s, color 0.15s',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  });

  return (
    <div style={{ position: 'relative' }}>

      {/* Fade izquierdo */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 60, zIndex: 1,
        background: 'linear-gradient(to right, var(--bg) 30%, transparent)',
        opacity: canLeft ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: 'none',
      }} />

      {/* Fade derecho */}
      <div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: 60, zIndex: 1,
        background: 'linear-gradient(to left, var(--bg) 30%, transparent)',
        opacity: canRight ? 1 : 0, transition: 'opacity 0.2s', pointerEvents: 'none',
      }} />

      {/* Flecha izquierda */}
      <button
        onClick={() => scroll('left')}
        style={btnStyle(canLeft, 'left')}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--txt)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--txt-muted)'; }}
      >
        <ChevronLeft size={14} />
      </button>

      {/* Flecha derecha */}
      <button
        onClick={() => scroll('right')}
        style={btnStyle(canRight, 'right')}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--txt)'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--txt-muted)'; }}
      >
        <ChevronRight size={14} />
      </button>

      {/* Contenedor scrollable (sin scrollbar) */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex', gap: 10,
          overflowX: 'auto', scrollbarWidth: 'none',
          padding: '2px 4px',         /* espacio para el box-shadow de los tabs */
        }}
        /* webkit */
        onScroll={update}
      >
        <style>{`#tabs-scroll::-webkit-scrollbar{display:none}`}</style>
        {children}
      </div>
    </div>
  );
}
/* ══════════════════════════════════════════════════════════════
   EquipoPanel
   ─────────────────────────────────────────────────────────────
   Deriva dynamicOptions igual que BoardPage para que BoardFilters
   muestre las listas reales de la DB en cada campo dinámico.
   ══════════════════════════════════════════════════════════════ */
function EquipoPanel({ equipo, teamColor, label, activeSprint, onRowClick }: {
  equipo:         string;
  teamColor:      string;
  label:          string;
  activeSprint:   Sprint | null;
  onRowClick:     (r: Request) => void;
  onVerMas:       () => void;
  canAccessBoard: boolean;
}) {
  const c = teamColors(teamColor);
  const boardId = `home-${equipo}`;

  const { data: rawBoard, isLoading } = useBoardEquipo(equipo);

  const boardTeamId = useMemo(() => {
    const first = rawBoard ? boardToFlat(rawBoard)[0] : undefined;
    return first?.boardTeamId ?? null;
  }, [rawBoard]);

  const { data: users     = [] } = useUsers();
  const { data: subTeams  = [] } = useSubTeams(boardTeamId);
  const { data: sprints   = [] } = useSprints();
  const { data: labels    = [] } = useLabelsByTeamId(config.DEFAULT_BOARD_ID, boardTeamId);
  // ← NUEVO: templates del board
  const { data: templates = [] } = useBoardTemplates(config.DEFAULT_BOARD_ID);

  // Construir lista de plantillas con sus campos tipados (igual que BoardPage)
const templateOptions = useMemo((): TemplateFilterOption[] => {
  return templates
    .filter((t) => {
      if (!t.Request_Template_Is_Active) return false;
      // Sin restricción de equipos → disponible para todos
      if (!t.Request_Template_Teams || t.Request_Template_Teams.length === 0) return true;
      // Con restricción → solo si el equipo activo está en la lista
      if (boardTeamId === null) return true;
      return t.Request_Template_Teams.includes(boardTeamId);
        })
    .map((t) => {
      const seen:   Set<string>          = new Set();
      const fields: TemplateFieldOption[] = [];
      flattenTemplateFields(
        t.Request_Template_Form_Schema as TemplateExtraField[],
        seen,
        fields,
      );
      return {
        id:     t.Request_Template_ID,
        label:  t.Request_Template_Name,
        icon:   t.Request_Template_Icon ?? '📋',
        color:  t.Request_Template_Color ?? undefined,
        fields,
      };
    })
    .filter((t) => t.fields.length > 0);
}, [templates, boardTeamId]); // ← agregar boardTeamId a las deps
  const dynamicOptions = useMemo((): FilterDynamicOptions => ({
    assignee: users.map((u) => ({
      value: u.User_Name,
      label: u.User_Name,
    })),
    subequipo: subTeams.map((s) => ({
      value: s.Sub_Team_Name,
      label: s.Sub_Team_Name,
    })),
    sprint: sprints.map((s) => ({
      value: s.Sprint_Text,
      label: s.Sprint_Text,
    })),
    etiqueta: labels.map((l) => ({
      value: l.Label_Name,
      label: l.Label_Name,
    })),
    // ← NUEVO
    templates: templateOptions,
  }), [users, subTeams, sprints, labels, templateOptions]);

  const filteredBoard  = useFilteredBoard(boardId, rawBoard);
  const [search, setSearch] = useState('');

  const allRequests = useMemo(
    () => (filteredBoard ? boardToFlat(filteredBoard) : []),
    [filteredBoard],
  );
  const visible = useMemo(() => {
    if (!search.trim()) return allRequests;
    const q = search.toLowerCase();
    return allRequests.filter((r) =>
      r.titulo.toLowerCase().includes(q) ||
      r.id.toLowerCase().includes(q) ||
      r.solicitante.toLowerCase().includes(q)
    );
  }, [allRequests, search]);

  const totalRaw   = rawBoard ? boardToFlat(rawBoard).length : 0;
  const isFiltered = visible.length !== totalRaw;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, position: 'relative' }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${c.dot}, ${c.dot}00)`, borderRadius: '12px 12px 0 0', pointerEvents: 'none' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 12px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', background: `linear-gradient(90deg, ${c.dot}07 0%, transparent 55%)`, borderRadius: '12px 12px 0 0' }}>
        <BoardFilters
          boardId={boardId}
          dynamicOptions={dynamicOptions}
          usePortal
        />

        <div style={{ position: 'relative', flex: '1 1 200px', minWidth: 0 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--txt-muted)', pointerEvents: 'none' }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por título, ID o solicitante…"
            style={{ width: '100%', paddingLeft: 32, paddingRight: search ? 30 : 12, paddingTop: 7, paddingBottom: 7, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--txt)', fontSize: 12, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' }}
            onFocus={(e)  => { e.currentTarget.style.borderColor = c.dot + '60'; }}
            onBlur={(e)   => { e.currentTarget.style.borderColor = 'var(--border)'; }}
          />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--txt-muted)', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center' }}>
              <X size={11} />
            </button>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {!isLoading && totalRaw > 0 && (
            <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>
              {isFiltered
                ? <><strong style={{ color: c.dot }}>{visible.length}</strong> de {totalRaw}</>
                : <><strong style={{ color: c.dot }}>{totalRaw}</strong> solicitudes</>}
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 18px', fontSize: 10, fontWeight: 600, color: 'var(--txt-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.012)' }}>
        <span style={{ width: 150, flexShrink: 0 }}>ID</span>
        <span style={{ flex: 1 }}>Asunto</span>
        <span style={{ width: 110, flexShrink: 0 }}>Solicitante</span>
        <span style={{ width: 80, textAlign: 'center' }}>Prioridad</span>
        <span style={{ width: 110, textAlign: 'center' }}>Estado</span>
        <span style={{ width: 40, textAlign: 'right' }}>Hace</span>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '36px 18px', fontSize: 12, color: 'var(--txt-muted)' }}>
          <svg style={{ animation: 'spin 1s linear infinite' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          Cargando solicitudes de {label}…
        </div>
      ) : visible.length === 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '36px 18px' }}>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3, color: 'var(--txt-muted)' }}>
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <span style={{ fontSize: 12, color: 'var(--txt-muted)' }}>
            {search || isFiltered ? 'Sin resultados para los filtros aplicados' : `No hay solicitudes en ${label}`}
          </span>
          {(search || isFiltered) && (
            <button onClick={() => setSearch('')} style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : (
        <div style={{ maxHeight: 440, overflowY: 'auto', borderRadius: '0 0 12px 12px' }}>
          {visible.map((r, i) => (
            <TicketRow key={r.id} r={r} isLast={i === visible.length - 1} onClick={() => onRowClick(r)} activeSprint={activeSprint} sprints={sprints} />
          ))}
        </div>
      )}
    </div>
  );
}


/* ══════════════════════════════════════════════════════════════
   HomePage
   ══════════════════════════════════════════════════════════════ */
export function HomePage() {
  const { account } = useAuth();
  const navigate    = useNavigate();
  const role        = useRole();
  const userCanSeeBoard = canSeeBoard(role);

  const [activeEquipo,    setActiveEquipo]    = useState<Equipo>('desarrollo');
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);

  const { data: boardTeams = [] } = useBoardTeams(config.DEFAULT_BOARD_ID);
  const { data: sprints    = [] } = useSprints();
  const visibleTeams = boardTeams.filter((t) => role.role === 'admin' || !t.Board_Team_Is_Admin_Only);

  const activeSprint = useMemo(() => getActiveSprint(sprints), [sprints]);

  const userName  = account?.name ?? '';
  const firstName = config.USE_MOCK ? 'Juan' : (userName.split(' ')[0] ?? 'Usuario');

  function handleRowClick(r: Request) {
    setSelectedRequest(r);
    history.replaceState(null, '', `/ticket/${r.id}`);
  }
  function handleModalClose() {
    setSelectedRequest(null);
    history.replaceState(null, '', '/home');
  }

  const now = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, padding: '4px 0 48px', maxWidth: 1060, margin: '0 auto', width: '100%' }}>

      {/* Encabezado */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--font-display)', letterSpacing: '-0.5px', lineHeight: 1.15 }}>
            Bienvenido,{' '}
            <span style={{ color: 'var(--accent)', textShadow: '0 0 28px rgba(0,200,255,0.35)' }}>{firstName}</span>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--txt-muted)' }}>
            {now.charAt(0).toUpperCase() + now.slice(1)}
          </p>
        </div>
              <HomeAnnouncementsSection />
        <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
          <button
            onClick={() => navigate('/new')}
            style={{ alignSelf: 'stretch', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 32px', border: '1.5px solid rgba(0,200,255,0.55)', borderRadius: 12, background: 'rgba(0,200,255,0.12)', color: 'var(--accent)', cursor: 'pointer', fontSize: 16, fontWeight: 700, letterSpacing: '0.4px', boxShadow: '0 0 28px rgba(0,200,255,0.18), 0 0 0 4px rgba(0,200,255,0.06)', transition: 'all 0.18s ease', fontFamily: 'var(--font-display)', flexShrink: 0, whiteSpace: 'nowrap' }}
            onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, { background: 'rgba(0,200,255,0.20)', borderColor: 'rgba(0,200,255,0.80)', transform: 'translateY(-2px)' })}
            onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, { background: 'rgba(0,200,255,0.12)', borderColor: 'rgba(0,200,255,0.55)', transform: 'translateY(0)' })}
          >
            <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(0,200,255,0.18)', border: '1.5px solid rgba(0,200,255,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={21} strokeWidth={2.5} />
            </div>
            Crear nueva solicitud
          </button>
          <div style={{ flex: 1, minWidth: 0 }}><SprintBanner /></div>
        </div>
      </div>
      {/* Tabs de equipo */}
<TabsScroller>
          {visibleTeams.map((team) => (
          <EquipoTab
            key={team.Board_Team_Code}
            equipo={team.Board_Team_Code}
            label={team.Board_Team_Name}
            teamColor={team.Board_Team_Color}
            teamIcon={team.Board_Team_Icon ?? '🗂️'}
            description={team.Board_Team_Description ?? ''}
            isActive={activeEquipo === team.Board_Team_Code}
            isAdminOnly={team.Board_Team_Is_Admin_Only ?? false}
            onClick={() => setActiveEquipo(team.Board_Team_Code)}
          />
        ))}
      </TabsScroller>

      {/* Panel principal */}
      <EquipoPanel
        key={activeEquipo}
        equipo={activeEquipo}
teamColor={visibleTeams.find((t) => t.Board_Team_Code === activeEquipo)?.Board_Team_Color ?? '#00c8ff'}
  label={visibleTeams.find((t) => t.Board_Team_Code === activeEquipo)?.Board_Team_Name ?? activeEquipo}        activeSprint={activeSprint}
        onRowClick={handleRowClick}
        onVerMas={() => navigate(`/requests/team/${activeEquipo}`)}
        canAccessBoard={userCanSeeBoard}
      />

      {selectedRequest && (
        <HomeRequestModal request={selectedRequest} onClose={handleModalClose} />
      )}
    </div>
  );
}