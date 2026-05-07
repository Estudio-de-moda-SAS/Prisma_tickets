import React, { useEffect, useRef } from 'react';
import { X, Calendar } from 'lucide-react';
import { PRIORIDADES } from '../types';
import type { Request, Prioridad } from '../types';
import { useLabelsByTeamId } from '@/features/requests/hooks/useBoardMetadata';
import { useSubTeams } from '@/features/requests/hooks/useSubTeams';
import { useSprints } from '@/features/requests/hooks/useSprints';
import { config } from '@/config';

/* ── Colores ── */
const PRI_COLOR: Record<Prioridad, string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

/* ── Helpers ── */
function fmtColombia(iso: string) {
  return new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z')
    .toLocaleDateString('es-CO', {
      timeZone: 'America/Bogota',
      day: 'numeric', month: 'long', year: 'numeric',
    });
}

function fmtD(iso: string) {
  const [y, m, d] = iso.split('T')[0].split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function sprintDotColor(sp: { Sprint_Start_Date: string; Sprint_End_Date: string }) {
  const now = new Date();
  if (now >= new Date(sp.Sprint_Start_Date) && now <= new Date(sp.Sprint_End_Date)) return '#00e5a0';
  if (now > new Date(sp.Sprint_End_Date)) return '#b2bec3';
  return '#fdcb6e';
}

/* ── Primitivos ── */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: 'block', fontSize: 9, fontWeight: 700,
      letterSpacing: 2, textTransform: 'uppercase',
      color: 'var(--txt-muted)', marginBottom: 7,
    }}>
      {children}
    </span>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><FieldLabel>{label}</FieldLabel>{children}</div>;
}

/* ── Chip de solo lectura ── */
function ReadChip({ color, icon, label }: { color: string; icon?: string; label: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
      color, background: `${color}18`, border: `1px solid ${color}35`,
    }}>
      {icon && <span>{icon}</span>}
      {label}
    </span>
  );
}

/* ── Valor de campo genérico ── */
function FieldValue({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div style={{
      minHeight: 34, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
      padding: '4px 0',
    }}>
      <span style={{ fontSize: 13, color: muted ? 'var(--txt-muted)' : 'var(--txt)' }}>
        {children}
      </span>
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

  const selectedSprint  = sprints.find((s) => s.Sprint_ID === request.sprintId) ?? null;
  const selectedLabels  = labels.filter((l) => (request.labelIds ?? []).includes(l.Label_ID));
  const selectedSubTeams = subTeams.filter((s) => (request.subTeamIds ?? []).includes(s.Sub_Team_ID));

  // Suprime el warning de equipo no usado — se mantiene por si se necesita en el futuro
  void equipo;

  return (
    <div
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 200, padding: 24,
      }}
    >
      <div style={{
        width: '100%', maxWidth: 620, maxHeight: '88vh',
        background: 'var(--bg-panel)', border: '1px solid var(--border)',
        borderRadius: 12, display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative',
      }}>
        {/* Accent line */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 2,
          background: 'linear-gradient(90deg, transparent, var(--accent), transparent)',
        }} />

        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border-subtle)',
          display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0,
        }}>
          <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-muted)', letterSpacing: 1 }}>
            #{request.id.slice(-6).toUpperCase()}
          </span>
          {/* Badge "Solo lectura" */}
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase',
            padding: '2px 7px', borderRadius: 4,
            background: 'rgba(255,255,255,0.05)', color: 'var(--txt-muted)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}>
            Solo lectura
          </span>
          <div style={{ marginLeft: 'auto' }}>
            <button
              onClick={onClose}
              style={{
                width: 28, height: 28, borderRadius: 6,
                border: '1px solid var(--border-subtle)', color: 'var(--txt-muted)',
                background: 'transparent', display: 'flex', alignItems: 'center',
                justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Título */}
          <FieldBlock label="Nombre de la solicitud">
            <div style={{
              padding: '9px 12px', borderRadius: 7,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
            }}>
              <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', fontFamily: 'var(--font-body)' }}>
                {request.titulo}
              </span>
            </div>
          </FieldBlock>

          {/* Descripción */}
          <FieldBlock label="Descripción">
            <div style={{
              padding: '10px 12px', borderRadius: 7,
              border: '1px solid var(--border-subtle)',
              background: 'var(--bg-surface)',
              minHeight: 72,
            }}>
              {request.descripcion ? (
                <span style={{ fontSize: 13, color: 'var(--txt)', lineHeight: 1.65, whiteSpace: 'pre-wrap' }}>
                  {request.descripcion}
                </span>
              ) : (
                <span style={{ fontSize: 13, color: 'var(--txt-muted)', fontStyle: 'italic' }}>
                  Sin descripción
                </span>
              )}
            </div>
          </FieldBlock>

          {/* Grid 2 cols */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

            {/* Prioridad */}
            <FieldBlock label="Prioridad">
              <FieldValue>
                <ReadChip
                  color={PRI_COLOR[request.prioridad]}
                  label={PRIORIDADES[request.prioridad]}
                />
              </FieldValue>
            </FieldBlock>

            {/* Fecha límite */}
            <FieldBlock label="Fecha límite">
              <FieldValue muted={!request.deadline}>
                {request.deadline ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--warn)', fontSize: 13 }}>
                    <Calendar size={12} style={{ color: 'var(--warn)', flexShrink: 0 }} />
                    {fmtD(request.deadline)}
                  </span>
                ) : (
                  'Sin fecha límite'
                )}
              </FieldValue>
            </FieldBlock>

            {/* Sub-equipos */}
            <FieldBlock label="Equipo">
              <FieldValue muted={selectedSubTeams.length === 0}>
                {selectedSubTeams.length === 0 ? (
                  'Sin equipo'
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {selectedSubTeams.map((sub) => (
                      <ReadChip
                        key={sub.Sub_Team_ID}
                        color={sub.Sub_Team_Color}
                        label={sub.Sub_Team_Name}
                      />
                    ))}
                  </div>
                )}
              </FieldValue>
            </FieldBlock>

            {/* Etiquetas */}
            <FieldBlock label="Etiquetas">
              <FieldValue muted={selectedLabels.length === 0}>
                {selectedLabels.length === 0 ? (
                  'Sin etiquetas'
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {selectedLabels.map((lbl) => (
                      <ReadChip
                        key={lbl.Label_ID}
                        color={lbl.Label_Color}
                        icon={lbl.Label_Icon}
                        label={lbl.Label_Name}
                      />
                    ))}
                  </div>
                )}
              </FieldValue>
            </FieldBlock>

            {/* Sprint */}
            <FieldBlock label="Sprint">
              <FieldValue muted={!selectedSprint}>
                {selectedSprint ? (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--txt)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: sprintDotColor(selectedSprint), flexShrink: 0, display: 'inline-block' }} />
                    {selectedSprint.Sprint_Text}
                    <span style={{ fontSize: 10, color: 'var(--txt-muted)', fontFamily: 'monospace' }}>
                      {fmtD(selectedSprint.Sprint_Start_Date)} → {fmtD(selectedSprint.Sprint_End_Date)}
                    </span>
                  </span>
                ) : (
                  'Sin sprint'
                )}
              </FieldValue>
            </FieldBlock>

            {/* Fecha apertura */}
            <FieldBlock label="Fecha de apertura">
              <FieldValue>
                {fmtColombia(request.fechaApertura)}
              </FieldValue>
            </FieldBlock>

          </div>
        </div>
      </div>
    </div>
  );
}