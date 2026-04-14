import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight, Clock, AlertCircle, CheckCircle2, Loader2, TrendingUp } from 'lucide-react';
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/* ── EquipoSection ──────────────────────────────────────────────── */
function EquipoSection({
  equipo,
  label,
  onVerMas,
}: {
  equipo: Equipo;
  label: string;
  onVerMas: () => void;
}) {
  const c    = EQUIPO_COLORS[equipo];
  const Icon = EQUIPO_ICONS[equipo];
  const { data: board, isLoading } = useBoardEquipo(equipo);

  // Aplanar todas las columnas excepto "hecho"
  const requests: Request[] = board
    ? Object.entries(board)
        .filter(([col]) => col !== 'hecho')
        .flatMap(([, rows]) => rows)
    : [];

  const visible = requests.slice(0, 4);

  return (
    <div style={S.equipoSection}>
      {/* Barra de color del equipo */}
      <div style={{ ...S.equipoAccent, background: `linear-gradient(90deg, ${c.dot}40, transparent)` }} />

      {/* Header */}
      <div style={S.equipoHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ ...S.equipoDot, background: c.dot, boxShadow: `0 0 8px ${c.dot}80` }} />
          <Icon size={13} style={{ color: c.dot }} />
          <span style={{ ...S.equipoTitle, color: c.dot }}>{label}</span>
          <span style={{
            ...S.chip,
            background: c.dot + '18',
            color: c.dot,
            border: `1px solid ${c.dot}30`,
          }}>
            {isLoading ? '…' : requests.length}
          </span>
        </div>
        <button
          onClick={onVerMas}
          style={{ ...S.verMasBtn, color: c.dot, borderColor: c.dot + '40' }}
        >
          Ver board <ArrowRight size={11} />
        </button>
      </div>

      {/* Tabla */}
      {isLoading ? (
        <div style={S.loadingRow}>
          <Loader2 size={13} style={{ color: 'var(--txt-muted)', animation: 'spin 1s linear infinite' }} />
          <span>Cargando...</span>
        </div>
      ) : requests.length === 0 ? (
        <div style={S.emptyRow}>
          <CheckCircle2 size={13} style={{ color: '#4CAF50' }} />
          <span>Sin solicitudes activas</span>
        </div>
      ) : (
        <>
          {/* Cabecera tabla */}
          <div style={S.tableHead}>
            <span style={{ width: 64 }}>ID</span>
            <span style={{ flex: 1 }}>Asunto</span>
            <span style={{ width: 90, textAlign: 'center' as const }}>Prioridad</span>
            <span style={{ width: 110, textAlign: 'center' as const }}>Estado</span>
            <span style={{ width: 50, textAlign: 'right' as const }}>Hace</span>
          </div>

          {visible.map((r) => (
            <div key={r.id} style={S.ticketRow}>
              <span style={S.ticketId}>#{r.id.slice(-4).toUpperCase()}</span>

              <span style={S.ticketTitle}>{r.titulo}</span>

              <div style={{ width: 90, display: 'flex', justifyContent: 'center' }}>
                <span style={{
                  ...S.badge,
                  background: PRIORIDAD_COLOR[r.prioridad] + '18',
                  color:      PRIORIDAD_COLOR[r.prioridad],
                  border:     `1px solid ${PRIORIDAD_COLOR[r.prioridad]}35`,
                }}>
                  {r.prioridad.charAt(0).toUpperCase() + r.prioridad.slice(1)}
                </span>
              </div>

              <div style={{ width: 110, display: 'flex', justifyContent: 'center' }}>
                <span style={{
                  ...S.badge,
                  background: (COLUMNA_COLOR[r.columna] ?? '#888') + '18',
                  color:      COLUMNA_COLOR[r.columna] ?? '#888',
                  border:     `1px solid ${COLUMNA_COLOR[r.columna] ?? '#888'}35`,
                }}>
                  {COLUMNA_LABEL[r.columna] ?? r.columna}
                </span>
              </div>

              <span style={{ ...S.ticketDate, width: 50 }}>
                {timeAgo(r.fechaApertura)}
              </span>
            </div>
          ))}

          {requests.length > 4 && (
            <button onClick={onVerMas} style={S.verMasRow}>
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

  // Cargamos el board del primer equipo para los KPIs globales
  // (en producción habría un endpoint de resumen; en mock usamos desarrollo)
  const { data: boardDemo } = useBoardEquipo('desarrollo');
  const allDemo = boardDemo ? Object.values(boardDemo).flat() : [];
  const enProgreso = allDemo.filter((r) => r.columna === 'en_progreso').length;
  const criticas   = allDemo.filter((r) => r.prioridad === 'critica').length;

  function handleVerMas(eq: Equipo) {
    setEquipoActivo(eq);
    navigate('/');
  }

  const now = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div style={S.page}>

      {/* ── Hero ───────────────────────────────────────────── */}
      <div style={S.hero}>
        <div>
          <h1 style={S.heroTitle}>
            Bienvenido, <span style={{ color: 'var(--accent)' }}>{firstName}</span>
          </h1>
          <p style={S.heroSub}>{now.charAt(0).toUpperCase() + now.slice(1)}</p>
        </div>

        <button
          onClick={() => navigate('/new')}
          style={S.ctaBtn}
          onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, {
            background: 'rgba(0,200,255,0.16)',
            boxShadow: '0 0 28px rgba(0,200,255,0.30), inset 0 0 0 1px rgba(0,200,255,0.5)',
          })}
          onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, {
            background: 'rgba(0,200,255,0.08)',
            boxShadow: '0 0 16px rgba(0,200,255,0.12)',
          })}
        >
          <div style={S.ctaIcon}><Plus size={15} strokeWidth={2.5} /></div>
          Crear nueva solicitud
        </button>
      </div>

      {/* ── KPIs ───────────────────────────────────────────── */}
      <div style={S.kpiRow}>
        {[
          { label: 'Equipos activos',  value: Object.keys(EQUIPOS).length, icon: <TrendingUp size={14} />, color: 'var(--accent)' },
          { label: 'En progreso',      value: enProgreso,                  icon: <Loader2 size={14} />,    color: '#1D9E75'       },
          { label: 'Críticas',         value: criticas,                    icon: <AlertCircle size={14} />,color: '#E05C5C'       },
          { label: 'Áreas de soporte', value: 4,                           icon: <CheckCircle2 size={14} />,color: '#7F77DD'      },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={S.kpiCard}>
            <div style={{ ...S.kpiIcon, color, background: color + '18', border: `1px solid ${color}30` }}>
              {icon}
            </div>
            <div>
              <div style={{ ...S.kpiValue, color }}>{value}</div>
              <div style={S.kpiLabel}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Divisor ────────────────────────────────────────── */}
      <div style={S.divider}>
        <div style={S.dividerLine} />
        <span style={S.dividerText}>Solicitudes por área</span>
        <div style={S.dividerLine} />
      </div>

      {/* ── Secciones por equipo ───────────────────────────── */}
      <div style={S.equipoGrid}>
        {(Object.entries(EQUIPOS) as [Equipo, string][]).map(([eq, label]) => (
          <EquipoSection
            key={eq}
            equipo={eq}
            label={label}
            onVerMas={() => handleVerMas(eq)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── Estilos ───────────────────────────────────────────────────── */
const S = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 24,
    padding: '4px 0 48px',
    maxWidth: 1060,
    margin: '0 auto',
    width: '100%',
  },

  /* Hero */
  hero: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    flexWrap: 'wrap' as const,
  },
  heroTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--txt)',
    fontFamily: 'var(--font-display)',
    letterSpacing: '-0.3px',
  },
  heroSub: {
    margin: '4px 0 0',
    fontSize: 12,
    color: 'var(--txt-muted)',
  },

  /* CTA */
  ctaBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    padding: '9px 18px',
    border: '1px solid rgba(0,200,255,0.35)',
    borderRadius: 8,
    background: 'rgba(0,200,255,0.08)',
    color: 'var(--accent)',
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.3px',
    boxShadow: '0 0 16px rgba(0,200,255,0.12)',
    transition: 'all 0.15s ease',
    fontFamily: 'var(--font-display)',
  },
  ctaIcon: {
    width: 26,
    height: 26,
    borderRadius: 6,
    background: 'rgba(0,200,255,0.15)',
    border: '1px solid rgba(0,200,255,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* KPIs */
  kpiRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 10,
  },
  kpiCard: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '14px 16px',
    background: 'var(--surface-1)',
    border: '1px solid var(--border)',
    borderRadius: 10,
  },
  kpiIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  kpiValue: {
    fontSize: 22,
    fontWeight: 700,
    fontFamily: 'var(--font-display)',
    lineHeight: 1,
  },
  kpiLabel: {
    fontSize: 11,
    color: 'var(--txt-muted)',
    marginTop: 3,
  },

  /* Divisor */
  divider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    background: 'var(--border)',
  },
  dividerText: {
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--txt-muted)',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  },

  /* Grid equipos */
  equipoGrid: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 14,
  },

  /* Sección equipo */
  equipoSection: {
    position: 'relative' as const,
    background: 'var(--surface-1)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    overflow: 'hidden',
  },
  equipoAccent: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    right: 0,
    height: 1,
  },
  equipoHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '11px 16px',
    borderBottom: '1px solid var(--border)',
  },
  equipoDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    flexShrink: 0,
  },
  equipoTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.7px',
    textTransform: 'uppercase' as const,
    fontFamily: 'var(--font-display)',
  },
  chip: {
    fontSize: 10,
    fontWeight: 600,
    padding: '1px 7px',
    borderRadius: 10,
  },
  verMasBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    fontSize: 11,
    fontWeight: 500,
    padding: '4px 10px',
    borderRadius: 5,
    border: '1px solid',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'opacity 0.12s',
  },

  /* Tabla */
  tableHead: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '6px 16px',
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--txt-muted)',
    letterSpacing: '0.7px',
    textTransform: 'uppercase' as const,
    borderBottom: '1px solid rgba(255,255,255,0.03)',
  },
  ticketRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '8px 16px',
    borderBottom: '1px solid rgba(255,255,255,0.03)',
    transition: 'background 0.1s',
  },
  ticketId: {
    width: 64,
    fontSize: 10,
    fontWeight: 600,
    color: 'var(--accent)',
    opacity: 0.7,
    fontFamily: 'monospace',
    flexShrink: 0,
  },
  ticketTitle: {
    flex: 1,
    fontSize: 13,
    color: 'var(--txt)',
    fontWeight: 400,
    overflow: 'hidden',
    whiteSpace: 'nowrap' as const,
    textOverflow: 'ellipsis',
  },
  badge: {
    fontSize: 10,
    fontWeight: 600,
    padding: '2px 7px',
    borderRadius: 4,
    letterSpacing: '0.3px',
    textTransform: 'uppercase' as const,
    whiteSpace: 'nowrap' as const,
  },
  ticketDate: {
    fontSize: 11,
    color: 'var(--txt-muted)',
    flexShrink: 0,
    textAlign: 'right' as const,
  },
  loadingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '20px 16px',
    fontSize: 12,
    color: 'var(--txt-muted)',
  },
  emptyRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '18px 16px',
    fontSize: 12,
    color: 'var(--txt-muted)',
  },
  verMasRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '9px 16px',
    width: '100%',
    background: 'transparent',
    border: 'none',
    borderTop: '1px solid rgba(255,255,255,0.04)',
    color: 'var(--accent)',
    fontSize: 12,
    cursor: 'pointer',
    opacity: 0.8,
    transition: 'opacity 0.12s',
  },
} as const;