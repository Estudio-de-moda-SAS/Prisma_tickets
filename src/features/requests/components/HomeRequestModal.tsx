// src/features/requests/components/HomeRequestModal.tsx
import React, { useEffect, useRef } from 'react';
import { X, ShieldAlert } from 'lucide-react';
import { PRIORIDADES } from '../types';
import type { Request, Prioridad } from '../types';
import { useLabelsByTeamId } from '@/features/requests/hooks/useBoardMetadata';
import { useSubTeams } from '@/features/requests/hooks/useSubTeams';
import { useSprints } from '@/features/requests/hooks/useSprints';
import { useAcceptanceCriteria } from '@/features/requests/hooks/useAcceptanceCriteria';
import { config } from '@/config';

const PRI_COLOR: Record<Prioridad, string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

function fmtColombia(iso: string) {
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
    .toLocaleDateString('es-CO', { timeZone: 'America/Bogota', day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtD(iso: string) {
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function fmtHours(h: number): string {
  const hrs  = Math.floor(h);
  const mins = Math.round((h % 1) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

function sprintDotColor(sp: { Sprint_Start_Date: string; Sprint_End_Date: string }) {
  const now = new Date();
  if (now >= new Date(sp.Sprint_Start_Date) && now <= new Date(sp.Sprint_End_Date)) return '#00e5a0';
  if (now > new Date(sp.Sprint_End_Date)) return '#b2bec3';
  return '#fdcb6e';
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 7 }}>{children}</span>;
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}

function ReadChip({ color, icon, label }: { color: string; icon?: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4, color, background: `${color}18`, border: `1px solid ${color}35` }}>
      {icon && <span>{icon}</span>}{label}
    </span>
  );
}

function FieldValue({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div style={{ minHeight: 34, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6, padding: '4px 0' }}>
      <span style={{ fontSize: 13, color: muted ? 'var(--txt-muted)' : 'var(--txt)' }}>{children}</span>
    </div>
  );
}

/* ── CriteriaReadonly ── */
function CriteriaReadonly({ requestId }: { requestId: string }) {
  const { data: criteria = [], isLoading } = useAcceptanceCriteria(requestId);

  if (isLoading) return <div style={{ fontSize: 11, color: 'var(--txt-muted)', opacity: 0.6 }}>Cargando…</div>;
  if (criteria.length === 0) return <div style={{ fontSize: 11, color: 'var(--txt-muted)', fontStyle: 'italic' }}>Sin criterios definidos.</div>;

  const accepted = criteria.filter((c) => c.status === 'accepted').length;
  const rejected = criteria.filter((c) => c.status === 'rejected').length;
  const total    = criteria.length;

  const STATUS_COLOR: Record<string, string> = { pending: 'var(--txt-muted)', accepted: 'var(--success)', rejected: 'var(--danger)' };
  const STATUS_BG:    Record<string, string> = { pending: 'rgba(255,255,255,0.04)', accepted: 'rgba(0,229,160,0.06)', rejected: 'rgba(255,71,87,0.06)' };
  const STATUS_BORDER:Record<string, string> = { pending: 'var(--border-subtle)', accepted: 'rgba(0,229,160,0.22)', rejected: 'rgba(255,71,87,0.22)' };
  const STATUS_LABEL: Record<string, string> = { pending: 'Pendiente', accepted: 'Aceptado', rejected: 'Rechazado' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <div style={{ flex: 1, height: 4, borderRadius: 3, background: 'var(--bg-surface)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
          <div style={{ height: '100%', width: `${Math.round((accepted / total) * 100)}%`, borderRadius: 3, background: rejected > 0 ? 'var(--danger)' : 'var(--success)', transition: 'width 0.3s ease' }} />
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: rejected > 0 ? 'var(--danger)' : accepted === total ? 'var(--success)' : 'var(--txt-muted)', minWidth: 40, textAlign: 'right' }}>
          {accepted}/{total}
        </span>
        {rejected > 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 3, background: 'rgba(255,71,87,0.1)', color: 'var(--danger)', border: '1px solid rgba(255,71,87,0.25)' }}>
            {rejected} rechazado{rejected > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {criteria.map((c) => (
        <div key={c.criteriaId} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 11px', borderRadius: 7, background: STATUS_BG[c.status], border: `1px solid ${STATUS_BORDER[c.status]}` }}>
          <div style={{ width: 18, height: 18, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${STATUS_COLOR[c.status]}12`, border: `1.5px solid ${STATUS_COLOR[c.status]}35` }}>
            {c.status === 'accepted' && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><polyline points="1.5 5 4 7.5 8.5 2" stroke="var(--success)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            {c.status === 'rejected' && <svg width="8" height="8" viewBox="0 0 10 10" fill="none"><line x1="2" y1="2" x2="8" y2="8" stroke="var(--danger)" strokeWidth="1.8" strokeLinecap="round"/><line x1="8" y1="2" x2="2" y2="8" stroke="var(--danger)" strokeWidth="1.8" strokeLinecap="round"/></svg>}
            {c.status === 'pending' && <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--txt-muted)' }} />}
          </div>
          <span style={{ flex: 1, fontSize: 12, color: c.status === 'rejected' ? 'var(--danger)' : c.status === 'accepted' ? 'var(--txt-muted)' : 'var(--txt)', textDecoration: c.status === 'accepted' ? 'line-through' : 'none', lineHeight: 1.4 }}>
            {c.title}
          </span>
          <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', padding: '2px 5px', borderRadius: 3, color: STATUS_COLOR[c.status], background: `${STATUS_COLOR[c.status]}10`, border: `1px solid ${STATUS_COLOR[c.status]}25`, flexShrink: 0, whiteSpace: 'nowrap' }}>
            {STATUS_LABEL[c.status]}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   HomeRequestModal — solo lectura
   ══════════════════════════════════════════════════════════════ */
type Props = {
  request: Request;
  onClose: () => void;
};

export function HomeRequestModal({ request, onClose }: Props) {
  const equipo      = request.equipo[0] ?? 'desarrollo';
  const boardId     = config.DEFAULT_BOARD_ID;
  const boardTeamId = request.boardTeamId ?? null;

  const { data: subTeams = [] } = useSubTeams(boardTeamId);
  const { data: labels   = [] } = useLabelsByTeamId(boardId, boardTeamId);
  const { data: sprints  = [] } = useSprints();

  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [onClose]);

  const selectedSprint   = sprints.find((s) => s.Sprint_ID === request.sprintId) ?? null;
  const selectedLabels   = labels.filter((l) => (request.labelIds ?? []).includes(l.Label_ID));
  const selectedSubTeams = subTeams.filter((s) => (request.subTeamIds ?? []).includes(s.Sub_Team_ID));

  void equipo;

  return (
    <div ref={overlayRef} onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 620, maxHeight: '88vh', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)' }} />

        {/* Header */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-muted)', letterSpacing: 1, userSelect: 'all' }}>{request.id}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.05)', color: 'var(--txt-muted)', border: '1px solid rgba(255,255,255,0.08)' }}>Solo lectura</span>
          {/* ── Badge confidencial ── */}
          {request.isConfidential && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 4, color: '#fdcb6e', background: 'rgba(253,203,110,0.1)', border: '1px solid rgba(253,203,110,0.35)' }}>
              <ShieldAlert size={9} />Confidencial
            </span>
          )}
          <div style={{ marginLeft: 'auto' }}>
            <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}><X size={14} /></button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Banner confidencial ── */}
          {request.isConfidential && (
            <div style={{ display: 'flex', gap: 10, padding: '11px 14px', borderRadius: 8, background: 'rgba(253,203,110,0.06)', border: '1px solid rgba(253,203,110,0.3)' }}>
              <ShieldAlert size={14} style={{ color: '#fdcb6e', flexShrink: 0, marginTop: 1 }} />
              <p style={{ margin: 0, fontSize: 12, color: '#fdcb6e', lineHeight: 1.55 }}>
                Esta solicitud contiene información confidencial. Recuerda validar el manejo de estos datos con el área de jurídica.
              </p>
            </div>
          )}

          <FieldBlock label="Nombre de la solicitud">
            <div style={{ padding: '9px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', fontFamily: 'var(--font-body)' }}>{request.titulo}</span>
            </div>
          </FieldBlock>

          <FieldBlock label="Descripción">
            <div style={{ padding: '10px 12px', borderRadius: 7, border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', minHeight: 72 }}>
              {request.descripcion ? (
                <span style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>{request.descripcion}</span>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--txt-muted)', fontStyle: 'italic' }}>Sin descripción</span>
              )}
            </div>
          </FieldBlock>

          <FieldBlock label="Criterios de aceptación">
            <CriteriaReadonly requestId={request.id} />
          </FieldBlock>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            <FieldBlock label="Prioridad">
              <FieldValue><ReadChip color={PRI_COLOR[request.prioridad]} label={PRIORIDADES[request.prioridad]} /></FieldValue>
            </FieldBlock>

            <FieldBlock label="Horas estimadas">
              <FieldValue muted={request.estimatedHours == null}>
                {request.estimatedHours != null ? fmtHours(request.estimatedHours) : 'Sin estimado'}
              </FieldValue>
            </FieldBlock>

            <FieldBlock label="Equipo">
              <FieldValue muted={selectedSubTeams.length === 0}>
                {selectedSubTeams.length === 0 ? 'Sin equipo' : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {selectedSubTeams.map((sub) => <ReadChip key={sub.Sub_Team_ID} color={sub.Sub_Team_Color} label={sub.Sub_Team_Name} />)}
                  </div>
                )}
              </FieldValue>
            </FieldBlock>

            <FieldBlock label="Etiquetas">
              <FieldValue muted={selectedLabels.length === 0}>
                {selectedLabels.length === 0 ? 'Sin etiquetas' : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {selectedLabels.map((lbl) => <ReadChip key={lbl.Label_ID} color={lbl.Label_Color} icon={lbl.Label_Icon} label={lbl.Label_Name} />)}
                  </div>
                )}
              </FieldValue>
            </FieldBlock>

            <FieldBlock label="Sprint">
              <FieldValue muted={!selectedSprint}>
                {selectedSprint ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--txt)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: sprintDotColor(selectedSprint), flexShrink: 0, display: 'inline-block' }} />
                    {selectedSprint.Sprint_Text}
                    <span style={{ fontSize: 10, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>{fmtD(selectedSprint.Sprint_Start_Date)} → {fmtD(selectedSprint.Sprint_End_Date)}</span>
                  </span>
                ) : 'Sin sprint'}
              </FieldValue>
            </FieldBlock>

            <FieldBlock label="Fecha de apertura">
              <FieldValue>{fmtColombia(request.fechaApertura)}</FieldValue>
            </FieldBlock>

          </div>
        </div>
      </div>
    </div>
  );
}