import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { useBoardStore } from '@/store/boardStore';
import { EQUIPO_COLORS, EQUIPO_ICONS } from '@/components/layout/Sidebar';
import { EQUIPOS } from '@/features/requests/types';
import { useBoardEquipo } from '@/features/requests/hooks/useRequests';
import type { Equipo, Request } from '@/features/requests/types';

/* ── helpers ──────────────────────────────────────────────────── */
const PRIORIDAD_COLOR: Record<string, string> = {
  baja:    '#4EA8DE',
  media:   '#F4C542',
  alta:    '#EF9F27',
  critica: '#E05C5C',
};

const COLUMNA_LABEL: Record<string, string> = {
  sin_categorizar: 'Sin categorizar',
  icebox:          'Icebox',
  backlog:         'Backlog',
  todo:            'To Do',
  en_progreso:     'En Progreso',
  hecho:           'Hecho',
};

const COLUMNA_COLOR: Record<string, string> = {
  sin_categorizar: 'var(--txt-muted)',
  icebox:          '#4EA8DE',
  backlog:         '#9B8AFF',
  todo:            '#F4C542',
  en_progreso:     '#1D9E75',
  hecho:           '#4CAF50',
};

const EQUIPO_DESCRIPTIONS: Record<Equipo, string> = {
  desarrollo: 'Interfaces de usuario, experiencia y desarrollo de productos digitales.',
  crm:        'Gestión de relaciones con clientes y automatizaciones comerciales.',
  sistemas:   'Infraestructura, integraciones, APIs y bases de datos corporativos.',
  analisis:   'Analítica avanzada, modelos predictivos y dashboards de inteligencia.',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/* ── TicketRow ───────────────────────────────────────────────── */
function TicketRow({ r, isLast }: { r: Request; isLast: boolean }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 18px',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.035)',
        transition: 'background 0.12s',
        cursor: 'default',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{
        width: 60, fontSize: 10, fontWeight: 700,
        color: 'var(--accent)', opacity: 0.65,
        fontFamily: 'monospace', flexShrink: 0,
      }}>
        #{r.id.slice(-4).toUpperCase()}
      </span>
      <span style={{
        flex: 1, fontSize: 13, color: 'var(--txt)', fontWeight: 400,
        overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis',
      }}>
        {r.titulo}
      </span>
      <div style={{ width: 88, display: 'flex', justifyContent: 'center' }}>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
          letterSpacing: '0.3px', textTransform: 'uppercase', whiteSpace: 'nowrap',
          background: PRIORIDAD_COLOR[r.prioridad] + '18',
          color:      PRIORIDAD_COLOR[r.prioridad],
          border:     `1px solid ${PRIORIDAD_COLOR[r.prioridad]}35`,
        }}>
          {r.prioridad.charAt(0).toUpperCase() + r.prioridad.slice(1)}
        </span>
      </div>
      <div style={{ width: 108, display: 'flex', justifyContent: 'center' }}>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4,
          letterSpacing: '0.3px', textTransform: 'uppercase', whiteSpace: 'nowrap',
          background: (COLUMNA_COLOR[r.columna] ?? '#888') + '18',
          color:      COLUMNA_COLOR[r.columna] ?? '#888',
          border:     `1px solid ${(COLUMNA_COLOR[r.columna] ?? '#888')}35`,
        }}>
          {COLUMNA_LABEL[r.columna] ?? r.columna}
        </span>
      </div>
      <span style={{
        width: 44, fontSize: 11, color: 'var(--txt-muted)',
        flexShrink: 0, textAlign: 'right',
      }}>
        {timeAgo(r.fechaApertura)}
      </span>
    </div>
  );
}

/* ── EquipoSection ───────────────────────────────────────────── */
function EquipoSection({ equipo, label, onVerMas }: {
  equipo: Equipo; label: string; onVerMas: () => void;
}) {
  const c    = EQUIPO_COLORS[equipo];
  const Icon = EQUIPO_ICONS[equipo];
  const { data: board, isLoading } = useBoardEquipo(equipo);

  const requests: Request[] = board
    ? Object.entries(board).filter(([col]) => col !== 'hecho').flatMap(([, rows]) => rows)
    : [];
  const visible = requests.slice(0, 4);

  return (
    <div
      style={{
        position: 'relative', background: 'var(--surface-1)',
        border: '1px solid var(--border)', borderRadius: 12,
        overflow: 'hidden', transition: 'border-color 0.2s',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = c.dot + '50'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
    >
      {/* Accent top line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 2,
        background: `linear-gradient(90deg, ${c.dot}, ${c.dot}00)`,
      }} />

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 18px',
        borderBottom: '1px solid var(--border)',
        background: `linear-gradient(90deg, ${c.dot}08 0%, transparent 60%)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 30, height: 30, borderRadius: 7,
            background: c.dot + '18', border: `1px solid ${c.dot}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <Icon size={14} style={{ color: c.dot }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 12, fontWeight: 700, color: c.dot,
                letterSpacing: '0.4px', fontFamily: 'var(--font-display)', textTransform: 'uppercase',
              }}>
                {label}
              </span>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10,
                background: c.dot + '18', color: c.dot, border: `1px solid ${c.dot}30`,
              }}>
                {isLoading ? '…' : requests.length}
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--txt-muted)', display: 'block', marginTop: 1 }}>
              {EQUIPO_DESCRIPTIONS[equipo]}
            </span>
          </div>
        </div>

        <button
          onClick={onVerMas}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 500, padding: '5px 11px',
            borderRadius: 6, border: `1px solid ${c.dot}35`,
            background: c.dot + '0C', color: c.dot,
            cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0,
          }}
          onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, { background: c.dot + '20', borderColor: c.dot + '60' })}
          onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, { background: c.dot + '0C', borderColor: c.dot + '35' })}
        >
          Ver board <ArrowRight size={11} />
        </button>
      </div>

      {/* Body */}
      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '20px 18px', fontSize: 12, color: 'var(--txt-muted)' }}>
          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Cargando...</span>
        </div>
      ) : requests.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '18px 18px', fontSize: 12, color: 'var(--txt-muted)' }}>
          <CheckCircle2 size={13} style={{ color: '#4CAF50' }} />
          <span>Sin solicitudes activas</span>
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '7px 18px',
            fontSize: 10, fontWeight: 600, color: 'var(--txt-muted)',
            letterSpacing: '0.8px', textTransform: 'uppercase',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <span style={{ width: 60 }}>ID</span>
            <span style={{ flex: 1 }}>Asunto</span>
            <span style={{ width: 88, textAlign: 'center' }}>Prioridad</span>
            <span style={{ width: 108, textAlign: 'center' }}>Estado</span>
            <span style={{ width: 44, textAlign: 'right' }}>Hace</span>
          </div>

          {visible.map((r, i) => (
            <TicketRow key={r.id} r={r} isLast={i === visible.length - 1 && requests.length <= 4} />
          ))}

          {requests.length > 4 && (
            <button
              onClick={onVerMas}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '9px 18px', width: '100%',
                background: 'transparent', border: 'none',
                borderTop: '1px solid rgba(255,255,255,0.04)',
                color: c.dot, fontSize: 12, cursor: 'pointer',
                opacity: 0.75, transition: 'opacity 0.12s',
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.75'; }}
            >
              <span>Ver {requests.length - 4} más en el board</span>
              <ArrowRight size={11} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   HomePage
   ══════════════════════════════════════════════════════════════════ */
export function HomePage() {
  const { account }         = useAuth();
  const { setEquipoActivo } = useBoardStore();
  const navigate            = useNavigate();

  const firstName = account?.name?.split(' ')[0] ?? 'Usuario';

  function handleVerMas(eq: Equipo) {
    setEquipoActivo(eq);
    navigate('/');
  }

  const now = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 28,
      padding: '4px 0 48px', maxWidth: 1060, margin: '0 auto', width: '100%',
    }}>

      {/* ── Hero ─────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Saludo */}
        <div>
          <h1 style={{
            margin: 0, fontSize: 32, fontWeight: 700,
            color: 'var(--txt)', fontFamily: 'var(--font-display)',
            letterSpacing: '-0.5px', lineHeight: 1.15,
          }}>
            Bienvenido,{' '}
            <span style={{
              color: 'var(--accent)',
              textShadow: '0 0 28px rgba(0,200,255,0.35)',
            }}>
              {firstName}
            </span>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--txt-muted)' }}>
            {now.charAt(0).toUpperCase() + now.slice(1)}
          </p>
        </div>

        {/* CTA — debajo del saludo, alineado a la izquierda */}
        <button
          onClick={() => navigate('/new')}
          style={{
            alignSelf: 'flex-start',
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 24px',
            border: '1px solid rgba(0,200,255,0.35)',
            borderRadius: 10,
            background: 'rgba(0,200,255,0.07)',
            color: 'var(--accent)',
            cursor: 'pointer', fontSize: 14, fontWeight: 600,
            letterSpacing: '0.3px',
            boxShadow: '0 0 20px rgba(0,200,255,0.10), inset 0 1px 0 rgba(0,200,255,0.08)',
            transition: 'all 0.18s ease',
            fontFamily: 'var(--font-display)',
          }}
          onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, {
            background: 'rgba(0,200,255,0.13)',
            boxShadow: '0 0 32px rgba(0,200,255,0.22), inset 0 1px 0 rgba(0,200,255,0.15)',
            borderColor: 'rgba(0,200,255,0.55)',
            transform: 'translateY(-1px)',
          })}
          onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, {
            background: 'rgba(0,200,255,0.07)',
            boxShadow: '0 0 20px rgba(0,200,255,0.10), inset 0 1px 0 rgba(0,200,255,0.08)',
            borderColor: 'rgba(0,200,255,0.35)',
            transform: 'translateY(0)',
          })}
        >
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(0,200,255,0.14)',
            border: '1px solid rgba(0,200,255,0.28)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Plus size={17} strokeWidth={2.5} />
          </div>
          Crear nueva solicitud
        </button>
      </div>

      {/* ── Divisor ───────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{
          fontSize: 10, fontWeight: 600, color: 'var(--txt-muted)',
          letterSpacing: '1.2px', textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>
          Solicitudes por área
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* ── Equipos ───────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(Object.entries(EQUIPOS) as [Equipo, string][]).map(([eq, label]) => (
          <EquipoSection key={eq} equipo={eq} label={label} onVerMas={() => handleVerMas(eq)} />
        ))}
      </div>
    </div>
  );
}