// src/features/requests/components/RequestHistoryModal.tsx
import { useEffect, useRef } from 'react';
import { X, History, Plus, Pencil, ArrowRightLeft, CheckCircle, RotateCcw, Trash2 } from 'lucide-react';
import { useRequestHistory } from '../hooks/useRequestHistory';
import { SCORE_TO_PRIORIDAD, PRIORIDADES } from '../types';
import type { HistoryAction, RequestHistoryEntry } from '../types';
import { useIsMobile } from '@/components/hooks/useMediaQuery';
import { fmtRelative } from './RequestModalComponents';

type Label   = { Label_ID: number; Label_Name: string };
type Sprint  = { Sprint_ID: number; Sprint_Text: string };
type SubTeam = { Sub_Team_ID: number; Sub_Team_Name: string };

type Props = {
  requestId:   string;
  requesterId: number;
  labels:      Label[];
  sprints:     Sprint[];
  subTeams:    SubTeam[];
  onClose:     () => void;
};

const FIELD_LABEL: Record<string, string> = {
  titulo: 'Título', descripcion: 'Descripción', score: 'Prioridad',
  progreso: 'Progreso', estimatedHours: 'Horas estimadas', loggedHours: 'Horas registradas',
  sprintId: 'Sprint', labelIds: 'Etiquetas', subTeamIds: 'Sub-equipos',
  equipoIds: 'Equipos', columna: 'Columna',
};

const CRIT_STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', accepted: 'Aceptado', rejected: 'Rechazado',
};

const ACTION_META: Record<HistoryAction, { icon: any; color: string; verb: string }> = {
  created:           { icon: Plus,           color: 'var(--success)', verb: 'creó la solicitud' },
  field_update:      { icon: Pencil,         color: 'var(--accent)',  verb: 'editó' },
  column_move:       { icon: ArrowRightLeft, color: '#f59e0b',        verb: 'movió' },
  closed:            { icon: CheckCircle,    color: 'var(--success)', verb: 'cerró' },
  reopened:          { icon: RotateCcw,      color: '#fdcb6e',        verb: 'reabrió' },
  deleted:           { icon: Trash2,         color: 'var(--danger)',  verb: 'eliminó la solicitud' },
  criterion_added:   { icon: Plus,           color: 'var(--accent)',  verb: 'agregó un criterio' },
  criterion_status:  { icon: CheckCircle,    color: 'var(--accent)',  verb: 'revisó un criterio' },
  criterion_removed: { icon: Trash2,         color: 'var(--danger)',  verb: 'eliminó un criterio' },
  criterion_edited:  { icon: Pencil,         color: 'var(--accent)',  verb: 'editó un criterio' },
};

export function RequestHistoryModal({ requestId, requesterId, labels, sprints, subTeams, onClose }: Props) {
  const isMobile = useIsMobile();
  const overlayRef = useRef<HTMLDivElement>(null);
  const { data: entries = [], isLoading, isError, error } = useRequestHistory(requestId, requesterId);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const labelById   = new Map(labels.map((l) => [l.Label_ID, l.Label_Name]));
  const sprintById  = new Map(sprints.map((s) => [s.Sprint_ID, s.Sprint_Text]));
  const subTeamById = new Map(subTeams.map((s) => [s.Sub_Team_ID, s.Sub_Team_Name]));

  function renderVal(field: string | null, raw: string | null): string {
    if (raw === null || raw === '') return '∅';
    if (field === 'score') {
      const p = SCORE_TO_PRIORIDAD[Number(raw)];
      return p ? PRIORIDADES[p] : raw;
    }
    if (field === 'sprintId') return sprintById.get(Number(raw)) ?? `Sprint #${raw}`;
    if (field === 'labelIds' || field === 'subTeamIds' || field === 'equipoIds') {
      let ids: number[] = [];
      try { ids = JSON.parse(raw); } catch { return raw; }
      if (ids.length === 0) return '∅';
      const map = field === 'labelIds' ? labelById : field === 'subTeamIds' ? subTeamById : null;
      return ids.map((id) => (map?.get(id) ?? `#${id}`)).join(', ');
    }
    if (field?.startsWith('form:')) {
      try { const v = JSON.parse(raw); return Array.isArray(v) ? v.join(', ') : String(v); } catch { return raw; }
    }
    return raw.length > 120 ? raw.slice(0, 120) + '…' : raw;
  }

  function describe(e: RequestHistoryEntry) {
    const meta = ACTION_META[e.action];
    if (e.action === 'field_update') {
      const fname = e.field?.startsWith('form:') ? e.field.slice(5) : FIELD_LABEL[e.field ?? ''] ?? e.field;
      return { verb: `editó ${fname}`, from: renderVal(e.field, e.oldValue), to: renderVal(e.field, e.newValue), meta };
    }
    if (e.action === 'column_move')
      return { verb: 'movió de', from: e.oldValue ?? '?', to: e.newValue ?? '?', meta };
    if (e.action === 'closed')   return { verb: `cerró en ${e.newValue ?? ''}`, from: null, to: null, meta };
    if (e.action === 'reopened') return { verb: `reabrió desde ${e.newValue ?? ''}`, from: null, to: null, meta };
    if (e.action === 'criterion_added')
      return { verb: `agregó el criterio "${renderVal(null, e.newValue)}"`, from: null, to: null, meta };
    if (e.action === 'criterion_removed')
      return { verb: `eliminó el criterio "${renderVal(null, e.oldValue)}"`, from: null, to: null, meta };
    if (e.action === 'criterion_edited')
      return { verb: 'renombró un criterio', from: renderVal(null, e.oldValue), to: renderVal(null, e.newValue), meta };
    if (e.action === 'criterion_status') {
      const critTitle = (e.metadata?.title as string | undefined) ?? '';
      return {
        verb: critTitle ? `revisó el criterio "${critTitle}"` : 'revisó un criterio',
        from: CRIT_STATUS_LABEL[e.oldValue ?? ''] ?? e.oldValue ?? '∅',
        to:   CRIT_STATUS_LABEL[e.newValue ?? ''] ?? e.newValue ?? '∅',
        meta,
      };
    }
    return { verb: meta.verb, from: null, to: null, meta };
  }

  return (
    <div ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(59,130,246,0.04)', display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 160, padding: isMobile ? 0 : 24 }}>
      <div style={{ width: '100%', maxWidth: 560, maxHeight: isMobile ? '94dvh' : '86vh', overflowY: 'auto', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: isMobile ? '16px 16px 0 0' : 14, position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />

        <div style={{ padding: '18px 22px 16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, background: 'var(--bg-panel)', zIndex: 1 }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(0,200,255,0.12)', border: '1px solid rgba(0,200,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <History size={18} style={{ color: 'var(--accent)' }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--font-display)' }}>Historial de cambios</div>
            <div style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{entries.length} evento{entries.length === 1 ? '' : 's'} registrado{entries.length === 1 ? '' : 's'}</div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-subtle)', background: 'transparent', color: 'var(--txt-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={14} />
          </button>
        </div>

        <div style={{ padding: '16px 22px 22px' }}>
          {isLoading && <div style={{ fontSize: 12, color: 'var(--txt-muted)', padding: '20px 0', textAlign: 'center' }}>Cargando historial…</div>}
          {isError && <div style={{ fontSize: 12, color: 'var(--danger)', padding: '16px', borderRadius: 8, background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.25)' }}>{(error as Error)?.message?.includes('FORBIDDEN') ? 'No tenés permiso para ver el historial de esta solicitud.' : 'No se pudo cargar el historial.'}</div>}
          {!isLoading && !isError && entries.length === 0 && <div style={{ fontSize: 12, color: 'var(--txt-muted)', padding: '20px 0', textAlign: 'center', opacity: 0.7 }}>Sin cambios registrados todavía.</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {entries.map((e, i) => {
              const d = describe(e);
              const Icon = d.meta.icon;
              const who = e.actor ? e.actor.userName : 'Sistema';
              return (
                <div key={e.id} style={{ display: 'flex', gap: 12, position: 'relative', paddingBottom: i === entries.length - 1 ? 0 : 14 }}>
                  {/* Línea vertical */}
                  {i !== entries.length - 1 && <div style={{ position: 'absolute', left: 15, top: 32, bottom: 0, width: 1, background: 'var(--border-subtle)' }} />}
                  <div style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: `${d.meta.color}18`, border: `1px solid ${d.meta.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: d.meta.color, zIndex: 1 }}>
                    <Icon size={14} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
                    <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.5 }}>
                      <span style={{ fontWeight: 700 }}>{who}</span>{' '}
                      <span style={{ color: 'var(--txt-muted)' }}>{d.verb}</span>
                    </div>
                    {(d.from !== null || d.to !== null) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', textDecoration: 'line-through', opacity: 0.75 }}>{d.from}</span>
                        <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>→</span>
                        <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 4, background: `${d.meta.color}12`, border: `1px solid ${d.meta.color}30`, color: 'var(--txt)' }}>{d.to}</span>
                      </div>
                    )}
                    <div style={{ fontSize: 10, color: 'var(--txt-muted)', marginTop: 3, opacity: 0.7 }}>{fmtRelative(e.changedAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}