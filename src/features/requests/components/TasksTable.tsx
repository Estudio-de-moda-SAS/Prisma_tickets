// src/features/requests/components/TasksTable.tsx
import { useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutList, Search, ChevronUp, ChevronDown, ChevronsUpDown,
} from 'lucide-react';
import { useTasksData, type TaskRow } from '../hooks/useTasksData';
import { useAcceptanceCriteria } from '../hooks/useAcceptanceCriteria';
import { BoardFilters, type FilterDynamicOptions } from './BoardFilters';
import {
  useFilterStore,
  type FilterCondition,
  type FilterConjunction,
} from '@/store/filterStore';
import { SCORE_TO_PRIORIDAD } from '@/features/requests/types';
import '@/styles/tasks.css';

// Referencia estable para evitar re-renders cuando no hay condiciones
const EMPTY_CONDITIONS: FilterCondition[] = [];
// ─── Priority ─────────────────────────────────────────────────────────────────

const PRIORITY: Record<number, { label: string; cls: string }> = {
  1: { label: 'Baja',    cls: 'tasks-priority--low'      },
  2: { label: 'Media',   cls: 'tasks-priority--medium'   },
  4: { label: 'Alta',    cls: 'tasks-priority--high'     },
  6: { label: 'Crítica', cls: 'tasks-priority--critical' },
};

function statusCls(slug?: string) {
  switch (slug) {
    case 'sin_categorizar': return 'tasks-status--uncategorized';
    case 'icebox':          return 'tasks-status--icebox';
    case 'backlog':         return 'tasks-status--backlog';
    case 'todo':            return 'tasks-status--todo';
    case 'en_progreso':     return 'tasks-status--inprogress';
    case 'en_revision_qas': return 'tasks-status--review';
    case 'cliente_review':  return 'tasks-status--client';
    case 'ready_to_deploy': return 'tasks-status--deploy';
    case 'hecho':           return 'tasks-status--done';
    case 'historial':       return 'tasks-status--history';
    default:                return 'tasks-status--default';
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtHours(h: number | null | undefined) {
  if (!h) return '—';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return '—';
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

const SCORE_POINTS: Record<number, number> = { 1: 1, 2: 2, 4: 4, 6: 6 };
function scoreToPoints(score: number | null | undefined): number {
  return SCORE_POINTS[score ?? 0] ?? 0;
}
function isCompleted(slug?: string | null, finishedAt?: string | null): boolean {
  if (slug) return ['hecho', 'historial', 'ready_to_deploy'].includes(slug);
  return !!finishedAt;
}
// ─── Campos dinámicos del template ────────────────────────────────────────────

const TASK_COL_WIDTH = 130;

function flattenTaskListFields(schema: unknown[]): Array<{ key: string; label: string }> {
  const result: Array<{ key: string; label: string }> = [];
  for (const f of schema as Record<string, unknown>[]) {
    if (!f || typeof f !== 'object') continue;
    if (f['showInTaskList'] && f['key'] && f['label'] && f['type'] !== 'conditional')
      result.push({ key: f['key'] as string, label: f['label'] as string });
    if (f['type'] === 'conditional') {
      if (Array.isArray(f['trueBranch']))  result.push(...flattenTaskListFields(f['trueBranch']));
      if (Array.isArray(f['falseBranch'])) result.push(...flattenTaskListFields(f['falseBranch']));
    }
  }
  return result;
}

function fmtFieldValue(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (Array.isArray(value)) { const s = (value as unknown[]).filter(Boolean).join(', '); return s || null; }
  const s = String(value).trim();
  return s || null;
}
// ─── Filter logic ─────────────────────────────────────────────────────────────

function matchCondition(row: TaskRow, cond: FilterCondition): boolean {
  const { field, operator, value, value2 } = cond;

  switch (field) {
    case 'titulo': {
      const title = row.Request_Title?.toLowerCase() ?? '';
      if (operator === 'esta_vacio')    return !row.Request_Title?.trim();
      if (operator === 'no_esta_vacio') return !!row.Request_Title?.trim();
      if (operator === 'contiene')      return title.includes(value.toLowerCase());
      if (operator === 'no_contiene')   return !title.includes(value.toLowerCase());
      return true;
    }
    case 'prioridad': {
      const key = SCORE_TO_PRIORIDAD[row.Request_Score ?? 0] ?? '';
      if (operator === 'es')    return key === value;
      if (operator === 'no_es') return key !== value;
      return true;
    }
    case 'columna': {
      const slug = row.column?.Board_Column_Slug ?? '';
      if (operator === 'es')    return slug === value;
      if (operator === 'no_es') return slug !== value;
      return true;
    }
    case 'assignee': {
      const ids = row.assignments.map(a => String(a.assignee.User_ID));
      if (operator === 'esta_vacio')    return ids.length === 0;
      if (operator === 'no_esta_vacio') return ids.length > 0;
      if (operator === 'es')    return ids.includes(value);
      if (operator === 'no_es') return !ids.includes(value);
      return true;
    }
    case 'etiqueta': {
      const ids = row.labels.map(l => String(l.label.Label_ID));
      if (operator === 'esta_vacio')    return ids.length === 0;
      if (operator === 'no_esta_vacio') return ids.length > 0;
      if (operator === 'es')    return ids.includes(value);
      if (operator === 'no_es') return !ids.includes(value);
      return true;
    }
    case 'sprint': {
      const texts = row.sprints
        .map(s => s.sprint?.Sprint_Text ?? '')
        .filter(Boolean);
      if (operator === 'esta_vacio')    return texts.length === 0;
      if (operator === 'no_esta_vacio') return texts.length > 0;
      if (operator === 'es')    return texts.includes(value);
      if (operator === 'no_es') return !texts.includes(value);
      return true;
    }
    case 'equipo': {
      const code = row.requester_team?.Team_Code ?? '';
      if (operator === 'es')    return code === value;
      if (operator === 'no_es') return code !== value;
      return true;
    }
    case 'solicitante': {
      const name = (
        row.requester_team?.Team_Name ??
        row.requester_department?.Department_Name ??
        ''
      ).toLowerCase();
      if (operator === 'esta_vacio')    return !row.requester_team && !row.requester_department;
      if (operator === 'no_esta_vacio') return !!(row.requester_team || row.requester_department);
      if (operator === 'contiene')      return name.includes(value.toLowerCase());
      if (operator === 'no_contiene')   return !name.includes(value.toLowerCase());
      return true;
    }
    case 'confidencial': {
      if (operator === 'es') return String(row.Request_Is_Confidential) === value;
      return true;
    }
    case 'progreso': {
      const prog = row.Request_Progress ?? 0;
      const v1   = parseFloat(value);
      const v2   = parseFloat(value2 ?? '');
      if (operator === 'es')        return prog === v1;
      if (operator === 'mayor_que') return prog > v1;
      if (operator === 'menor_que') return prog < v1;
      if (operator === 'entre')     return !isNaN(v1) && !isNaN(v2) && prog >= v1 && prog <= v2;
      return true;
    }
    case 'horas_estimadas': {
      const hrs = row.Request_Estimated_Hours;
      if (operator === 'esta_vacio')    return hrs == null || hrs === 0;
      if (operator === 'no_esta_vacio') return hrs != null && hrs > 0;
      const v1 = parseFloat(value);
      const v2 = parseFloat(value2 ?? '');
      const h  = hrs ?? 0;
      if (operator === 'mayor_que') return h > v1;
      if (operator === 'menor_que') return h < v1;
      if (operator === 'entre')     return !isNaN(v1) && !isNaN(v2) && h >= v1 && h <= v2;
      return true;
    }
    // Campos sin equivalente en TaskRow — no tienen efecto
    default:
      return true;
  }
}

function applyTaskFilters(
  rows:        TaskRow[],
  conditions:  FilterCondition[],
  conjunction: FilterConjunction,
): TaskRow[] {
  const active = conditions.filter(
    c =>
      c.operator === 'esta_vacio' ||
      c.operator === 'no_esta_vacio' ||
      c.value.trim() !== '',
  );
  if (!active.length) return rows;
  return rows.filter(row =>
    conjunction === 'AND'
      ? active.every(c => matchCondition(row, c))
      : active.some(c  => matchCondition(row, c)),
  );
}

// ─── Assignee cell ────────────────────────────────────────────────────────────

function AssigneeCell({ assignments }: {
  assignments?: Array<{ assignee: { User_ID: number; User_Name: string; User_Avatar_url: string | null } }>;
}) {
  if (!assignments?.length) return <span className="tasks-empty-cell">—</span>;
  const { assignee } = assignments[0];
  const initials = assignee.User_Name.split(' ').slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase();
  const parts = assignee.User_Name.split(' ');
  const displayName = parts.length >= 3
    ? `${parts[0]} ${parts[2]}`
    : parts.join(' ');
  const extra = assignments.length - 1;
  return (
    <div className="tasks-assignee">
      <div className="tasks-assignee__av">
        {assignee.User_Avatar_url
          ? <img src={assignee.User_Avatar_url} alt={assignee.User_Name} />
          : <span>{initials}</span>}
      </div>
      <span className="tasks-assignee__name" title={assignee.User_Name}>{displayName}</span>
      {extra > 0 && <span className="tasks-assignee__extra">+{extra}</span>}
    </div>
  );
}

// ─── Sort ─────────────────────────────────────────────────────────────────────

type SK =
  | 'Request_Title' | 'Request_Score' | 'Request_Estimated_Hours'
  | 'Request_Logged_Hours' | 'Request_Progress' | 'Request_Created_At'
  | 'Request_Finished_At'  | 'status' | 'score_realized';

function SortIco({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  if (!active) return <ChevronsUpDown size={10} className="tasks-sort-icon tasks-sort-icon--idle" />;
  return dir === 'asc'
    ? <ChevronUp   size={10} className="tasks-sort-icon tasks-sort-icon--on" />
    : <ChevronDown size={10} className="tasks-sort-icon tasks-sort-icon--on" />;
}

// ─── Row (extraído para poder llamar useAcceptanceCriteria por fila) ──────────

function TaskTableRow({ row, index, teamCode, taskListFields }: {
  row:            TaskRow;
  index:          number;
  teamCode:       string;
  taskListFields: Array<{ key: string; label: string }>;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const { data: criteria = [] } = useAcceptanceCriteria(row.Request_ID);

  const prio      = PRIORITY[row.Request_Score ?? 0] ?? null;
  const total     = criteria.length;
  const accepted  = criteria.filter(c => c.status === 'accepted').length;
  const rejected  = criteria.filter(c => c.status === 'rejected').length;
  const allDone   = total > 0 && accepted === total;
  const hasReject = rejected > 0;

  return (
    <tr
      className="tasks-tr"
      onClick={() => navigate(`/tasks/${teamCode}/ticket/${row.Request_ID}`, {
        state: { backgroundLocation: location },
      })}
    >
      {/* # */}
      <td className="tasks-td tasks-td--seq tasks-td--freeze-seq">{index + 1}</td>

      {/* ID */}
      <td className="tasks-td tasks-td--freeze-id">
        <span className="tasks-ticket-id">{row.Request_ID}</span>
      </td>

      {/* Nombre */}
      <td className="tasks-td tasks-td--name tasks-td--freeze-name">
        <span className="tasks-title-text">{row.Request_Title ?? '(Sin título)'}</span>
      </td>

      {/* Asignado */}
      <td className="tasks-td">
        <AssigneeCell assignments={row.assignments} />
      </td>

      {/* Estado */}
      <td className="tasks-td">
        {row.column
          ? <span className={`tasks-status ${statusCls(row.column.Board_Column_Slug)}`}>{row.column.Board_Column_Name}</span>
          : <span className="tasks-empty-cell">—</span>}
      </td>

      {/* Etiquetas */}
      <td className="tasks-td">
        <div className="tasks-tags">
          {row.labels?.slice(0, 2).map(l => (
            <span
              key={l.label.Label_ID}
              className="tasks-label"
              style={{
                backgroundColor: `${l.label.Label_Color}18`,
                color:            l.label.Label_Color,
                borderColor:      `${l.label.Label_Color}38`,
              }}
            >
              {l.label.Label_Icon && (
                <span className="tasks-label__icon">{l.label.Label_Icon}</span>
              )}
              {l.label.Label_Name}
            </span>
          ))}
          {(row.labels?.length ?? 0) > 2 && (
            <span className="tasks-label tasks-label--more">+{row.labels.length - 2}</span>
          )}
          {!(row.labels?.length) && <span className="tasks-empty-cell">—</span>}
        </div>
      </td>

      {/* Sprint */}
      <td className="tasks-td">
        <div className="tasks-tags">
          {row.sprints?.map(s => s.sprint && (
            <span key={s.Request_Sprint_ID} className="tasks-sprint">
              {s.sprint.Sprint_Text}
            </span>
          ))}
          {!(row.sprints?.length) && <span className="tasks-empty-cell">—</span>}
        </div>
      </td>

      {/* Equipo sol. */}
      <td className="tasks-td">
        {(row.requester_team?.Team_Name || row.requester_department?.Department_Name)
          ? <span className="tasks-team-tag">
              {row.requester_team?.Team_Name ?? row.requester_department?.Department_Name}
            </span>
          : <span className="tasks-empty-cell">—</span>}
      </td>

      {/* Prioridad */}
      <td className="tasks-td">
        {prio
          ? <span className={`tasks-priority ${prio.cls}`}>{prio.label}</span>
          : <span className="tasks-empty-cell">—</span>}
      </td>

      {/* H. Est. */}
      <td className="tasks-td tasks-td--r tasks-num">{fmtHours(row.Request_Estimated_Hours)}</td>

      {/* H. Real */}
      <td className="tasks-td tasks-td--r tasks-num">{fmtHours(row.Request_Logged_Hours)}</td>

      {/* Progreso */}
      <td className="tasks-td tasks-td--r">
        {row.Request_Progress != null ? (
          <div className="tasks-progress">
            <div className="tasks-progress__track">
              <div
                className="tasks-progress__fill"
                style={{ width: `${Math.min(100, row.Request_Progress)}%` }}
              />
            </div>
            <span className="tasks-progress__pct">{row.Request_Progress}%</span>
          </div>
        ) : <span className="tasks-empty-cell">—</span>}
      </td>

      {/* Criterios */}
      <td className="tasks-td">
        {total === 0 ? (
          <span className="tasks-empty-cell">—</span>
        ) : (
          <span
            className="tasks-criteria-badge"
            style={{
              color:       allDone ? 'var(--success)' : hasReject ? 'var(--danger)' : 'var(--txt-muted)',
              background:  allDone ? 'rgba(0,229,160,0.1)' : hasReject ? 'rgba(255,71,87,0.1)' : 'rgba(255,255,255,0.05)',
              borderColor: allDone ? 'rgba(0,229,160,0.3)' : hasReject ? 'rgba(255,71,87,0.3)' : 'var(--border-subtle)',
            }}
          >
            <svg width="8" height="8" viewBox="0 0 10 10" fill="none">
              <polyline points="1.5 5 4 7.5 8.5 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {accepted}/{total}
            {hasReject && <span className="tasks-criteria-badge__reject">· {rejected}✗</span>}
          </span>
        )}
      </td>

      {/* Pts. Total */}
      <td className="tasks-td tasks-td--r tasks-num">
        {scoreToPoints(row.Request_Score) > 0
          ? scoreToPoints(row.Request_Score)
          : <span className="tasks-empty-cell">—</span>}
      </td>

      {/* Pts. Realizado */}
      <td className="tasks-td tasks-td--r tasks-num">
        {isCompleted(row.column?.Board_Column_Slug, row.Request_Finished_At)
          ? <span style={{ color: 'var(--success)' }}>{scoreToPoints(row.Request_Score)}</span>
          : <span className="tasks-empty-cell">—</span>}
      </td>

      {/* Creado */}
      <td className="tasks-td tasks-num">{fmtDate(row.Request_Created_At)}</td>

      {/* Cerrado */}
      <td className="tasks-td tasks-td--date">
        {row.Request_Finished_At ? (
          <span className="tasks-num">{fmtDate(row.Request_Finished_At)}</span>
        ) : isCompleted(row.column?.Board_Column_Slug) ? (
          <span className="tasks-done-pill">Cerrado</span>
        ) : (
          <span className="tasks-open-pill">Abierto</span>
        )}
      </td>
      {/* Campos dinámicos del template */}
{taskListFields.map(f => {
  const val = fmtFieldValue(row.Request_Form_Data?.[f.key]);
  return (
    <td key={f.key} className="tasks-td">
      {val
        ? <span style={{ fontSize: 12, color: 'var(--txt)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: TASK_COL_WIDTH - 16 }} title={val}>{val}</span>
        : <span className="tasks-empty-cell">—</span>}
    </td>
  );
})}
    </tr>
  );
}
// ─── Skeleton ─────────────────────────────────────────────────────────────────

const SKEL_ROWS  = 8;
const NAME_W     = ['55%','72%','65%','80%','58%','70%','62%','75%'];
const SKEL_DOT   = <div className="tasks-skel tasks-skel--dot" />;

function TasksTableSkeleton() {
  return (
    <div className="tasks-page">
      {/* Toolbar */}
      <div className="tasks-toolbar">
        <div className="tasks-toolbar__left">
          <div className="tasks-skel" style={{ width: 16, height: 16, borderRadius: 3 }} />
          <div className="tasks-skel" style={{ width: 150, height: 17 }} />
          <div className="tasks-skel" style={{ width: 72, height: 20, borderRadius: 10 }} />
        </div>
        <div className="tasks-toolbar__right">
          <div className="tasks-skel" style={{ width: 100, height: 30, borderRadius: 6 }} />
          <div className="tasks-skel" style={{ width: 208, height: 30, borderRadius: 6 }} />
        </div>
      </div>

      {/* Tabla */}
      <div className="tasks-table-wrap">
        <table className="tasks-table">
          <colgroup>
            <col className="tasks-col--seq"    />
            <col className="tasks-col--id"     />
            <col className="tasks-col--name"   />
            <col className="tasks-col--assign" />
            <col className="tasks-col--status" />
            <col className="tasks-col--labels" />
            <col className="tasks-col--sprint" />
            <col className="tasks-col--team"   />
            <col className="tasks-col--prio"   />
            <col className="tasks-col--hest"   />
            <col className="tasks-col--hreal"  />
            <col className="tasks-col--prog"   />
            <col className="tasks-col--crit"   />
            <col className="tasks-col--pts"    />
            <col className="tasks-col--pts"    />
            <col className="tasks-col--crea"   />
            <col className="tasks-col--cerr"   />
          </colgroup>
          <thead>
            <tr>
              <th className="tasks-th tasks-th--nosort tasks-th--freeze-seq">#</th>
              <th className="tasks-th tasks-th--freeze-id">ID</th>
              <th className="tasks-th tasks-th--freeze-name">Nombre</th>
              <th className="tasks-th tasks-th--nosort">Asignado</th>
              <th className="tasks-th">Estado</th>
              <th className="tasks-th tasks-th--nosort">Etiquetas</th>
              <th className="tasks-th tasks-th--nosort">Sprint</th>
              <th className="tasks-th tasks-th--nosort">Equipo sol.</th>
              <th className="tasks-th">Prioridad</th>
              <th className="tasks-th tasks-th--r">H. Est.</th>
              <th className="tasks-th tasks-th--r">H. Real</th>
              <th className="tasks-th tasks-th--r">Progreso</th>
              <th className="tasks-th tasks-th--nosort">Criterios</th>
              <th className="tasks-th tasks-th--r">Pts. Total</th>
              <th className="tasks-th tasks-th--r">Pts. Real.</th>
              <th className="tasks-th">Creado</th>
              <th className="tasks-th">Cerrado</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SKEL_ROWS }, (_, i) => (
              <tr key={i} className="tasks-tr tasks-tr--skel">
                {/* # */}
                <td className="tasks-td tasks-td--seq tasks-td--freeze-seq">
                  <div className="tasks-skel" style={{ width: 14, height: 11, margin: '0 auto' }} />
                </td>
                {/* ID */}
                <td className="tasks-td tasks-td--freeze-id">
                  <div className="tasks-skel" style={{ width: 96, height: 20, borderRadius: 4 }} />
                </td>
                {/* Nombre */}
                <td className="tasks-td tasks-td--freeze-name">
                  <div className="tasks-skel" style={{ width: NAME_W[i % NAME_W.length], height: 13 }} />
                </td>
                {/* Asignado */}
                <td className="tasks-td">
                  <div className="tasks-skel" style={{ width: 110, height: 26, borderRadius: 20 }} />
                </td>
                {/* Estado */}
                <td className="tasks-td">
                  <div className="tasks-skel" style={{ width: 88, height: 22, borderRadius: 20 }} />
                </td>
                {/* Etiquetas */}
                <td className="tasks-td">
                  {i % 3 !== 1
                    ? <div className="tasks-skel" style={{ width: 68, height: 20, borderRadius: 20 }} />
                    : SKEL_DOT}
                </td>
                {/* Sprint */}
                <td className="tasks-td">
                  {i % 3 === 0
                    ? <div className="tasks-skel" style={{ width: 60, height: 20, borderRadius: 20 }} />
                    : SKEL_DOT}
                </td>
                {/* Equipo sol. */}
                <td className="tasks-td">
                  <div className="tasks-skel" style={{ width: 90, height: 20, borderRadius: 20 }} />
                </td>
                {/* Prioridad */}
                <td className="tasks-td">
                  <div className="tasks-skel" style={{ width: 52, height: 20, borderRadius: 20 }} />
                </td>
                {/* H. Est. */}
                <td className="tasks-td tasks-td--r">
                  <div className="tasks-skel" style={{ width: 36, height: 12, marginLeft: 'auto' }} />
                </td>
                {/* H. Real */}
                <td className="tasks-td tasks-td--r">
                  {i % 2 === 0
                    ? <div className="tasks-skel" style={{ width: 36, height: 12, marginLeft: 'auto' }} />
                    : SKEL_DOT}
                </td>
                {/* Progreso */}
                <td className="tasks-td tasks-td--r">
                  {i % 2 !== 0
                    ? <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifyContent: 'flex-end' }}>
                        <div className="tasks-skel" style={{ width: 50, height: 5, borderRadius: 3 }} />
                        <div className="tasks-skel" style={{ width: 26, height: 11 }} />
                      </div>
                    : SKEL_DOT}
                </td>
                {/* Criterios */}
                <td className="tasks-td">
                  {i % 2 === 0
                    ? <div className="tasks-skel" style={{ width: 42, height: 20, borderRadius: 20 }} />
                    : SKEL_DOT}
                </td>
                {/* Pts. Total */}
                <td className="tasks-td tasks-td--r">
                  <div className="tasks-skel" style={{ width: 18, height: 12, marginLeft: 'auto' }} />
                </td>
                {/* Pts. Real. */}
                <td className="tasks-td tasks-td--r">
                  {i % 3 === 0
                    ? <div className="tasks-skel" style={{ width: 18, height: 12, marginLeft: 'auto' }} />
                    : SKEL_DOT}
                </td>
                {/* Creado */}
                <td className="tasks-td">
                  <div className="tasks-skel" style={{ width: 80, height: 12 }} />
                </td>
                {/* Cerrado */}
                <td className="tasks-td">
                  <div className="tasks-skel" style={{ width: 58, height: 20, borderRadius: 20 }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Summary bar */}
      <div className="tasks-summary">
        <div className="tasks-summary__frozen">
          <div className="tasks-skel" style={{ width: 110, height: 12 }} />
        </div>
        <div className="tasks-summary__right">
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '0 16px' }}>
            {[72, 72, 64, 64].map((w, i) => (
              <div key={i} className="tasks-skel" style={{ width: w, height: 28, borderRadius: 4 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
// ─── Component ────────────────────────────────────────────────────────────────

export function TasksTable({ teamCode }: { teamCode: string }) {
  const { data = [], isLoading } = useTasksData(teamCode);
const taskListFields = useMemo(() => {
  const seen = new Set<string>();
  const result: Array<{ key: string; label: string }> = [];
  data.forEach(row => {
    const schema = row.template_schema?.Request_Template_Form_Schema;
    if (!Array.isArray(schema)) return;
    flattenTaskListFields(schema).forEach(f => {
      if (!seen.has(f.key)) { seen.add(f.key); result.push(f); }
    });
  });
  return result;
}, [data]);
  // Namespace propio para filtros, separado de los boards kanban
  const boardId     = `tasks-${teamCode}`;
  const conditions  = useFilterStore(s => s.byBoard[boardId]?.conditions  ?? EMPTY_CONDITIONS);
  const conjunction = useFilterStore(s => s.byBoard[boardId]?.conjunction ?? 'AND');
  const [q,   setQ]      = useState('');
  const [sk,  setSk]     = useState<SK>('Request_Created_At');
  const [dir, setDir]    = useState<'asc' | 'desc'>('desc');
  const [scrolled, setScrolled] = useState(false);
  const summaryTrackRef = useRef<HTMLDivElement>(null);
const wrapRef       = useRef<HTMLDivElement>(null);
const isDragging    = useRef(false);
const dragStartX    = useRef(0);
const dragScrollL   = useRef(0);
const dragMoved     = useRef(false);
const [grabbing, setGrabbing] = useState(false);

  // ── Opciones dinámicas derivadas del dataset cargado
  const dynamicOptions = useMemo((): FilterDynamicOptions => {
    const assigneeMap = new Map<number, string>();
    const labelMap    = new Map<number, string>();
    const sprintSet   = new Set<string>();

    data.forEach(row => {
      row.assignments.forEach(a => {
        if (!assigneeMap.has(a.assignee.User_ID))
          assigneeMap.set(a.assignee.User_ID, a.assignee.User_Name);
      });
      row.labels.forEach(l => {
        if (!labelMap.has(l.label.Label_ID))
          labelMap.set(l.label.Label_ID, l.label.Label_Name);
      });
      row.sprints.forEach(s => {
        if (s.sprint?.Sprint_Text) sprintSet.add(s.sprint.Sprint_Text);
      });
    });

    return {
      assignee: Array.from(assigneeMap, ([id, name]) => ({ value: String(id), label: name })),
      etiqueta: Array.from(labelMap,    ([id, name]) => ({ value: String(id), label: name })),
      sprint:   Array.from(sprintSet,   t            => ({ value: t, label: t })),
    };
  }, [data]);

  // ── Paso 1: aplicar condiciones del filterStore
  const afterFilters = useMemo(
    () => applyTaskFilters(data, conditions, conjunction),
    [data, conditions, conjunction],
  );

  // ── Paso 2: búsqueda de texto encima del resultado filtrado
  const filtered = useMemo(() => {
    if (!q.trim()) return afterFilters;
    const lq = q.toLowerCase();
    return afterFilters.filter(r =>
      r.Request_Title?.toLowerCase().includes(lq) ||
      r.Request_ID?.toLowerCase().includes(lq),
    );
  }, [afterFilters, q]);

  // ── Ordenamiento
  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let va: string | number = '', vb: string | number = '';
      if      (sk === 'Request_Title')           { va = a.Request_Title           ?? ''; vb = b.Request_Title           ?? ''; }
      else if (sk === 'Request_Score')           { va = a.Request_Score           ?? 0;  vb = b.Request_Score           ?? 0;  }
      else if (sk === 'Request_Estimated_Hours') { va = a.Request_Estimated_Hours ?? 0;  vb = b.Request_Estimated_Hours ?? 0;  }
      else if (sk === 'Request_Logged_Hours')    { va = a.Request_Logged_Hours    ?? 0;  vb = b.Request_Logged_Hours    ?? 0;  }
      else if (sk === 'Request_Progress')        { va = a.Request_Progress        ?? 0;  vb = b.Request_Progress        ?? 0;  }
      else if (sk === 'Request_Created_At')      { va = a.Request_Created_At      ?? ''; vb = b.Request_Created_At      ?? ''; }
      else if (sk === 'Request_Finished_At')     { va = a.Request_Finished_At     ?? ''; vb = b.Request_Finished_At     ?? ''; }
      else if (sk === 'status')         { va = a.column?.Board_Column_Name ?? ''; vb = b.column?.Board_Column_Name ?? ''; }
      else if (sk === 'score_realized') {
        va = isCompleted(a.column?.Board_Column_Slug, a.Request_Finished_At) ? scoreToPoints(a.Request_Score) : 0;
        vb = isCompleted(b.column?.Board_Column_Slug, b.Request_Finished_At) ? scoreToPoints(b.Request_Score) : 0;
      }
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ?  1 : -1;
      return 0;
    });
  }, [filtered, sk, dir]);

  function sort(key: SK) {
    setSk(prev => {
      if (prev === key) { setDir(d => d === 'asc' ? 'desc' : 'asc'); return prev; }
      setDir('asc');
      return key;
    });
  }

  // ── Totales (sobre el conjunto filtrado + buscado)
  const totEst     = filtered.reduce((s, r) => s + (r.Request_Estimated_Hours ?? 0), 0);
  const totReal    = filtered.reduce((s, r) => s + (r.Request_Logged_Hours    ?? 0), 0);
  const totPts     = filtered.reduce((s, r) => s + scoreToPoints(r.Request_Score), 0);
  const totPtsReal = filtered.reduce((s, r) => s + (isCompleted(r.column?.Board_Column_Slug, r.Request_Finished_At) ? scoreToPoints(r.Request_Score) : 0), 0);

  // ── Helper de encabezado ordenable
  function Th({ k, label, cls = '', nosort = false }: { k: SK; label: string; cls?: string; nosort?: boolean }) {
    return (
      <th
        className={`tasks-th ${cls} ${nosort ? 'tasks-th--nosort' : ''}`}
        onClick={nosort ? undefined : () => sort(k)}
      >
        {label}
        {!nosort && <SortIco active={sk === k} dir={dir} />}
      </th>
    );
  }

  // ── Mensaje vacío contextual
  function emptyMsg() {
    if (q) return `Sin resultados para "${q}"`;
    if (afterFilters.length < data.length) return 'Ninguna tarea coincide con los filtros aplicados.';
    return 'No hay tareas registradas para este equipo.';
  }

  // ── Loading
if (isLoading) return <TasksTableSkeleton />;
  // ── Render
  return (
    <div className="tasks-page">

      {/* Toolbar */}
      <div className="tasks-toolbar">
        <div className="tasks-toolbar__left">
          <LayoutList size={16} className="tasks-toolbar__icon" />
          <h1 className="tasks-toolbar__title">Listado de Tareas</h1>
          <span className="tasks-toolbar__badge">{filtered.length} registros</span>
        </div>
        <div className="tasks-toolbar__right">
          <BoardFilters
            boardId={boardId}
            dynamicOptions={dynamicOptions}
            usePortal
          />
          <div className="tasks-search">
            <Search size={12} className="tasks-search__icon" />
            <input
              className="tasks-search__input"
              placeholder="Buscar por título o ID…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
            {q && <button className="tasks-search__clear" onClick={() => setQ('')}>✕</button>}
          </div>
        </div>
      </div>

      {/* Tabla */}
<div
  ref={wrapRef}
  className={`tasks-table-wrap${scrolled ? ' tasks-table-wrap--scrolled' : ''}`}
  style={{ cursor: grabbing ? 'grabbing' : 'grab', userSelect: grabbing ? 'none' : undefined }}
  onScroll={e => {
    const sl = e.currentTarget.scrollLeft;
    setScrolled(sl > 0);
    if (summaryTrackRef.current) {
      summaryTrackRef.current.style.transform = `translateX(-${sl}px)`;
    }
  }}
  onMouseDown={e => {
    if (!wrapRef.current) return;
    isDragging.current  = true;
    dragMoved.current   = false;
    dragStartX.current  = e.pageX;
    dragScrollL.current = wrapRef.current.scrollLeft;
    setGrabbing(true);
  }}
  onMouseMove={e => {
    if (!isDragging.current || !wrapRef.current) return;
    const dx = e.pageX - dragStartX.current;
    if (Math.abs(dx) > 3) dragMoved.current = true;
    wrapRef.current.scrollLeft = dragScrollL.current - dx;
  }}
  onMouseUp={()    => { isDragging.current = false; setGrabbing(false); }}
  onMouseLeave={()  => { isDragging.current = false; setGrabbing(false); }}
  onClickCapture={e => {
    if (dragMoved.current) { e.stopPropagation(); dragMoved.current = false; }
  }}
>        <table className="tasks-table">

          <colgroup>
            <col className="tasks-col--seq"    />
            <col className="tasks-col--id"     />
            <col className="tasks-col--name"   />
            <col className="tasks-col--assign" />
            <col className="tasks-col--status" />
            <col className="tasks-col--labels" />
            <col className="tasks-col--sprint" />
            <col className="tasks-col--team"   />
            <col className="tasks-col--prio"   />
            <col className="tasks-col--hest"   />
            <col className="tasks-col--hreal"  />
            <col className="tasks-col--prog"   />
            <col className="tasks-col--crit"   />
            <col className="tasks-col--pts"    />
            <col className="tasks-col--pts"    />
            <col className="tasks-col--crea"   />
            <col className="tasks-col--cerr"   />
            {taskListFields.map(f => <col key={f.key} style={{ minWidth: TASK_COL_WIDTH, width: TASK_COL_WIDTH }} />)}
          </colgroup>

          <thead>
            <tr>
              <th className="tasks-th tasks-th--r tasks-th--nosort tasks-th--freeze-seq">#</th>
              <th className="tasks-th tasks-th--freeze-id">
                ID <SortIco active={false} dir="asc" />
              </th>
              <Th k="Request_Title"           label="Nombre"      cls="tasks-th--freeze-name" />
              <th className="tasks-th tasks-th--nosort">Asignado</th>
              <Th k="status"                  label="Estado"      />
              <th className="tasks-th tasks-th--nosort">Etiquetas</th>
              <th className="tasks-th tasks-th--nosort">Sprint</th>
              <th className="tasks-th tasks-th--nosort">Equipo sol.</th>
              <Th k="Request_Score"           label="Prioridad"   />
              <Th k="Request_Estimated_Hours" label="H. Est."     cls="tasks-th--r" />
              <Th k="Request_Logged_Hours"    label="H. Real"     cls="tasks-th--r" />
              <Th k="Request_Progress"        label="Progreso"    cls="tasks-th--r" />
              <th className="tasks-th tasks-th--nosort">Criterios</th>
              <Th k="Request_Score"           label="Pts. Total"  cls="tasks-th--r" />
              <Th k="score_realized"          label="Pts. Real."  cls="tasks-th--r" />
              <Th k="Request_Created_At"      label="Creado"      />
              <Th k="Request_Finished_At"     label="Cerrado"     />
              {taskListFields.map(f => (
  <th key={f.key} className="tasks-th tasks-th--nosort">{f.label}</th>
))}
            </tr>
          </thead>

          <tbody>
            {sorted.length === 0 ? (
              <tr>
<td colSpan={17 + taskListFields.length} className="tasks-td tasks-td--empty">                  {emptyMsg()}
                </td>
              </tr>
            ) : sorted.map((row, i) => (
              <TaskTableRow key={row.Request_ID} row={row} index={i} teamCode={teamCode} taskListFields={taskListFields} />
            ))}
          </tbody>

        </table>
      </div>

      {/* Summary bar — siempre al fondo, sincronizada con el scroll horizontal */}
      <div className="tasks-summary">
        <div className="tasks-summary__frozen">
          <span className="tasks-summary__label">
            Suma — {filtered.length} registro{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="tasks-summary__right">
          <div className="tasks-summary__track" ref={summaryTrackRef}>
            {/* spacer: assign+status+labels+sprint+team+prio = 790px */}
            <div className="tasks-summary__gap" style={{ width: 790 }} />
            <div className="tasks-summary__cell" style={{ width: 80 }}>
              <span className="tasks-summary__key">H. Est.</span>
              <span className="tasks-summary__val">{fmtHours(totEst)}</span>
            </div>
            <div className="tasks-summary__cell" style={{ width: 80 }}>
              <span className="tasks-summary__key">H. Real</span>
              <span className="tasks-summary__val">{fmtHours(totReal)}</span>
            </div>
            {/* gap cubre Progreso (95px) + Criterios (90px) = 185px */}
            <div className="tasks-summary__gap" style={{ width: 185 }} />
            <div className="tasks-summary__cell" style={{ width: 72 }}>
              <span className="tasks-summary__key">Pts. Total</span>
              <span className="tasks-summary__val">{totPts > 0 ? totPts : '—'}</span>
            </div>
            <div className="tasks-summary__cell" style={{ width: 72 }}>
              <span className="tasks-summary__key">Pts. Real.</span>
              <span
                className="tasks-summary__val"
                style={{ color: totPtsReal > 0 ? 'var(--success)' : undefined }}
              >
                {totPtsReal > 0 ? totPtsReal : '—'}
              </span>
            </div>
            <div className="tasks-summary__gap" style={{ width: 210 + taskListFields.length * TASK_COL_WIDTH }} />          </div>
        </div>
      </div>

    </div>
  );
}