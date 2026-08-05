// src/features/requests/components/IntakeBadge.tsx
import { useMemo } from 'react';
import { Inbox } from 'lucide-react';
import type { Request } from '../types';
import { useIntakeStore } from '@/store/intakeStore';
import { useBoardStore } from '@/store/boardStore';
import { useFilterStore } from '@/store/filterStore';

const INTAKE_SLUG = 'sin_categorizar';

const PULSE_KEYFRAMES = `
@keyframes intakePulseRing {
  0%   { transform: scale(1);   opacity: 0.65; }
  100% { transform: scale(2.6); opacity: 0;    }
}`;

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return 'ahora';
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  const d = Math.floor(h / 24);
  return `hace ${d}d`;
}

interface Props {
  /** Tickets en sin_categorizar SIN filtrar — la alerta no debe ocultarse por filtros. */
  requests: Request[];
  boardId:  string;
}

export function IntakeBadge({ requests, boardId }: Props) {
  const seenList    = useIntakeStore((s) => s.seenByBoard[boardId]);
  const acknowledge = useIntakeStore((s) => s.acknowledge);
  const focusColumn = useBoardStore((s) => s.focusColumn);
  const clearFilters = useFilterStore((s) => s.clearAll);

  const { total, nuevos } = useMemo(() => {
    const seen = new Set(seenList ?? []);
    return {
      total:  requests.length,
      nuevos: requests.filter((r) => !seen.has(r.id)),
    };
  }, [requests, seenList]);

  if (total === 0) return null;

  const nuevosCount = nuevos.length;
  const hasNuevos   = nuevosCount > 0;

  const recientes = [...nuevos]
    .sort((a, b) => new Date(b.fechaApertura).getTime() - new Date(a.fechaApertura).getTime())
    .slice(0, 5);

  const tooltip = [
    hasNuevos
      ? `${nuevosCount} nueva${nuevosCount !== 1 ? 's' : ''} sin categorizar · click para ver`
      : `${total} sin categorizar · todo revisado`,
    ...recientes.map((r) => `${r.id} · ${timeAgo(r.fechaApertura)}`),
  ].join('\n');

  const handleClick = () => {
    // 1. Filtros: de golpe (instantáneo, sin animación).
    clearFilters(boardId);
    // 2. Visto: marca ya — no afecta layout.
    acknowledge(boardId, requests.map((r) => r.id));
    // 3. Scroll: en el próximo frame, cuando el board ya se re-pintó
    //    sin filtros. Así el scroll suave anima sobre un layout estable.
    requestAnimationFrame(() => focusColumn(INTAKE_SLUG));
  };

  return (
    <>
      <style>{PULSE_KEYFRAMES}</style>
      <button
        type="button"
        onClick={handleClick}
        title={tooltip}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:           6,
          height:        26,
          padding:      '0 10px',
          background:    hasNuevos
            ? 'color-mix(in srgb, var(--accent) 12%, transparent)'
            : 'var(--bg-surface)',
          border:       `1px solid ${hasNuevos ? 'var(--accent)' : 'var(--border-subtle)'}`,
          borderRadius:  20,
          cursor:       'pointer',
          flexShrink:    0,
          userSelect:   'none',
          boxShadow:     hasNuevos
            ? '0 0 0 1px color-mix(in srgb, var(--accent) 30%, transparent)'
            : 'none',
          transition:   'background 0.15s, border-color 0.15s, box-shadow 0.15s',
        }}
      >
        {/* Ícono bandeja + dot pulsante */}
        <span style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <Inbox
            size={14}
            strokeWidth={2}
            color={hasNuevos ? 'var(--accent)' : 'var(--txt-muted)'}
          />
          {hasNuevos && (
            <span style={{ position: 'absolute', top: -3, right: -3, width: 7, height: 7 }}>
              <span style={{
                position:     'absolute',
                inset:         0,
                borderRadius: '50%',
                background:   'var(--accent)',
                animation:    'intakePulseRing 1.8s ease-out infinite',
              }} />
              <span style={{
                position:     'absolute',
                inset:         0,
                borderRadius: '50%',
                background:   'var(--accent)',
              }} />
            </span>
          )}
        </span>

        {/* Total en intake */}
        <span style={{
          fontSize:      11,
          fontWeight:     600,
          color:          hasNuevos ? 'var(--txt)' : 'var(--txt-muted)',
          fontFamily:    'var(--font-display)',
          letterSpacing: '0.3px',
          lineHeight:     1,
        }}>
          {total}
        </span>

        {/* Nuevos sin ver */}
        {hasNuevos && (
          <span style={{
            fontSize:      11,
            fontWeight:     700,
            color:         'var(--accent)',
            fontFamily:    'var(--font-display)',
            letterSpacing: '0.3px',
            lineHeight:     1,
          }}>
            +{nuevosCount}
          </span>
        )}
      </button>
    </>
  );
}