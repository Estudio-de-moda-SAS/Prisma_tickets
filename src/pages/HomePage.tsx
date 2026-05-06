import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { EQUIPO_COLORS, EQUIPO_ICONS } from '@/components/layout/siderbarConstants';
import { EQUIPOS } from '@/features/requests/types';
import { useBoardEquipo } from '@/features/requests/hooks/useRequests';
import { HomeRequestModal } from '@/features/requests/components/HomeRequestModal';
import type { Equipo, Request } from '@/features/requests/types';
import { config } from '@/config';

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
  const normalized = iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z';
  const diff = Date.now() - new Date(normalized).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'ahora';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

/* ── useMyRequests ───────────────────────────────────────────── */
function useMyRequests(equipo: Equipo, userName: string) {
  const { data: board, isLoading } = useBoardEquipo(equipo);
  const effectiveName = config.USE_MOCK ? 'Juan Esteban' : userName;
  const firstName = effectiveName.split(' ')[0]?.toLowerCase() ?? '';
  const requests: Request[] = board
    ? Object.values(board).flat().filter((r) =>
        firstName ? r.solicitante.toLowerCase().includes(firstName) : true
      )
    : [];
  return { requests, isLoading };
}

/* ── EquipoSummaryCard ───────────────────────────────────────── */
function EquipoSummaryCard({ equipo, label, userName, onClick }: {
  equipo: Equipo;
  label: string;
  userName: string;
  onClick: () => void;
}) {
  const c    = EQUIPO_COLORS[equipo];
  const Icon = EQUIPO_ICONS[equipo];
  const { requests, isLoading } = useMyRequests(equipo, userName);

  const active = requests.filter((r) => r.columna !== 'hecho').length;
  const done   = requests.filter((r) => r.columna === 'hecho').length;

  return (
    <button
      onClick={onClick}
      style={{
        flex: '1 1 0', minWidth: 0, textAlign: 'left',
        background: 'var(--surface-1)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 18px', cursor: 'pointer',
        transition: 'all 0.18s', position: 'relative', overflow: 'hidden', boxShadow: 'none',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = c.dot + '55';
        el.style.background  = c.glow;
        el.style.transform   = 'translateY(-2px)';
        el.style.boxShadow   = `0 8px 24px ${c.dot}1A`;
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement;
        el.style.borderColor = 'var(--border)';
        el.style.background  = 'var(--surface-1)';
        el.style.transform   = 'translateY(0)';
        el.style.boxShadow   = 'none';
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${c.dot}, ${c.dot}00)` }} />
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, background: c.dot + '18', border: `1px solid ${c.dot}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={15} style={{ color: c.dot }} />
        </div>
        <ArrowRight size={12} style={{ color: c.dot, opacity: 0.45, marginTop: 3, flexShrink: 0 }} />
      </div>
      <div style={{ marginTop: 12 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: c.dot, fontFamily: 'var(--font-display)', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block' }}>{label}</span>
        <span style={{ fontSize: 11, color: 'var(--txt-muted)', display: 'block', marginTop: 4, lineHeight: 1.45 }}>{EQUIPO_DESCRIPTIONS[equipo]}</span>
      </div>
      <div style={{ display: 'flex', gap: 14, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        {isLoading ? (
          <Loader2 size={11} style={{ color: 'var(--txt-muted)', animation: 'spin 1s linear infinite' }} />
        ) : (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: c.dot, lineHeight: 1, fontFamily: 'var(--font-display)' }}>{active}</span>
              <span style={{ fontSize: 10, color: 'var(--txt-muted)', letterSpacing: '0.3px' }}>activas</span>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', alignSelf: 'stretch' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 20, fontWeight: 700, color: '#4CAF50', lineHeight: 1, fontFamily: 'var(--font-display)' }}>{done}</span>
              <span style={{ fontSize: 10, color: 'var(--txt-muted)', letterSpacing: '0.3px' }}>resueltas</span>
            </div>
          </>
        )}
      </div>
    </button>
  );
}

/* ── TicketRow ───────────────────────────────────────────────── */
function TicketRow({ r, isLast, onClick }: { r: Request; isLast: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '8px 18px',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.035)',
        transition: 'background 0.12s', cursor: 'pointer',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.025)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <span style={{ width: 60, fontSize: 10, fontWeight: 700, color: 'var(--accent)', opacity: 0.65, fontFamily: 'monospace', flexShrink: 0 }}>
        #{r.id.slice(-4).toUpperCase()}
      </span>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--txt)', fontWeight: 400, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
        {r.titulo}
      </span>
      <div style={{ width: 88, display: 'flex', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.3px', textTransform: 'uppercase', whiteSpace: 'nowrap', background: PRIORIDAD_COLOR[r.prioridad] + '18', color: PRIORIDAD_COLOR[r.prioridad], border: `1px solid ${PRIORIDAD_COLOR[r.prioridad]}35` }}>
          {r.prioridad.charAt(0).toUpperCase() + r.prioridad.slice(1)}
        </span>
      </div>
      <div style={{ width: 108, display: 'flex', justifyContent: 'center' }}>
        <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, letterSpacing: '0.3px', textTransform: 'uppercase', whiteSpace: 'nowrap', background: (COLUMNA_COLOR[r.columna] ?? '#888') + '18', color: COLUMNA_COLOR[r.columna] ?? '#888', border: `1px solid ${(COLUMNA_COLOR[r.columna] ?? '#888')}35` }}>
          {COLUMNA_LABEL[r.columna] ?? r.columna}
        </span>
      </div>
      <span style={{ width: 44, fontSize: 11, color: 'var(--txt-muted)', flexShrink: 0, textAlign: 'right' }}>
        {timeAgo(r.fechaApertura)}
      </span>
    </div>
  );
}

/* ── EquipoSection ───────────────────────────────────────────── */
function EquipoSection({ equipo, label, userName, onVerMas, onRowClick }: {
  equipo: Equipo;
  label: string;
  userName: string;
  onVerMas: () => void;
  onRowClick: (r: Request) => void;
}) {
  const c    = EQUIPO_COLORS[equipo];
  const Icon = EQUIPO_ICONS[equipo];
  const { requests: myRequests, isLoading } = useMyRequests(equipo, userName);

  const visible = myRequests.slice(0, 4);
  const extra   = myRequests.length - 4;

  return (
    <div
      id={`equipo-${equipo}`}
      style={{ position: 'relative', background: 'var(--surface-1)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', transition: 'border-color 0.2s' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = c.dot + '50'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${c.dot}, ${c.dot}00)` }} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 18px', borderBottom: '1px solid var(--border)', background: `linear-gradient(90deg, ${c.dot}08 0%, transparent 60%)` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, borderRadius: 7, background: c.dot + '18', border: `1px solid ${c.dot}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Icon size={14} style={{ color: c.dot }} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: c.dot, letterSpacing: '0.4px', fontFamily: 'var(--font-display)', textTransform: 'uppercase' }}>{label}</span>
              <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 7px', borderRadius: 10, background: c.dot + '18', color: c.dot, border: `1px solid ${c.dot}30` }}>
                {isLoading ? '…' : myRequests.length}
              </span>
            </div>
            <span style={{ fontSize: 11, color: 'var(--txt-muted)', display: 'block', marginTop: 1 }}>{EQUIPO_DESCRIPTIONS[equipo]}</span>
          </div>
        </div>
        <button
          onClick={onVerMas}
          style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 500, padding: '5px 11px', borderRadius: 6, border: `1px solid ${c.dot}35`, background: c.dot + '0C', color: c.dot, cursor: 'pointer', transition: 'all 0.15s', flexShrink: 0 }}
          onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, { background: c.dot + '20', borderColor: c.dot + '60' })}
          onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, { background: c.dot + '0C', borderColor: c.dot + '35' })}
        >
          Ver más <ArrowRight size={11} />
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '20px 18px', fontSize: 12, color: 'var(--txt-muted)' }}>
          <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
          <span>Cargando...</span>
        </div>
      ) : myRequests.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '18px 18px', fontSize: 12, color: 'var(--txt-muted)' }}>
          <CheckCircle2 size={13} style={{ color: '#4CAF50' }} />
          <span>No tienes solicitudes en este equipo</span>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 18px', fontSize: 10, fontWeight: 600, color: 'var(--txt-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span style={{ width: 60 }}>ID</span>
            <span style={{ flex: 1 }}>Asunto</span>
            <span style={{ width: 88, textAlign: 'center' }}>Prioridad</span>
            <span style={{ width: 108, textAlign: 'center' }}>Estado</span>
            <span style={{ width: 44, textAlign: 'right' }}>Hace</span>
          </div>
          {visible.map((r, i) => (
            <TicketRow
              key={r.id}
              r={r}
              isLast={i === visible.length - 1 && extra <= 0}
              onClick={() => onRowClick(r)}
            />
          ))}
          {extra > 0 && (
            <button
              onClick={onVerMas}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '9px 18px', width: '100%', background: 'transparent', border: 'none', borderTop: '1px solid rgba(255,255,255,0.04)', color: c.dot, fontSize: 12, cursor: 'pointer', opacity: 0.75, transition: 'opacity 0.12s' }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.75'; }}
            >
              <span>Ver {extra} más</span>
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
  const { account } = useAuth();
  const navigate    = useNavigate();

  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);

  const userName  = account?.name ?? '';
  const firstName = userName.split(' ')[0] ?? 'Usuario';

  function handleVerMas(eq: Equipo) {
    navigate(`/requests/team/${eq}`);
  }

  function handleCardClick(eq: Equipo) {
    const el = document.getElementById(`equipo-${eq}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const c = EQUIPO_COLORS[eq];
      el.style.transition = 'box-shadow 0.3s, border-color 0.2s';
      el.style.boxShadow  = `0 0 0 2px ${c.dot}60`;
      setTimeout(() => { el.style.boxShadow = ''; el.style.transition = ''; }, 1200);
    }
  }

  const now = new Date().toLocaleDateString('es-CO', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28, padding: '4px 0 48px', maxWidth: 1060, margin: '0 auto', width: '100%' }}>

      {/* Hero */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700, color: 'var(--txt)', fontFamily: 'var(--font-display)', letterSpacing: '-0.5px', lineHeight: 1.15 }}>
            Bienvenido,{' '}
            <span style={{ color: 'var(--accent)', textShadow: '0 0 28px rgba(0,200,255,0.35)' }}>{firstName}</span>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--txt-muted)' }}>
            {now.charAt(0).toUpperCase() + now.slice(1)}
          </p>
        </div>

        <button
          onClick={() => navigate('/new')}
          style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 32px', border: '1.5px solid rgba(0,200,255,0.55)', borderRadius: 12, background: 'rgba(0,200,255,0.12)', color: 'var(--accent)', cursor: 'pointer', fontSize: 16, fontWeight: 700, letterSpacing: '0.4px', boxShadow: '0 0 28px rgba(0,200,255,0.18), 0 0 0 4px rgba(0,200,255,0.06), inset 0 1px 0 rgba(0,200,255,0.12)', transition: 'all 0.18s ease', fontFamily: 'var(--font-display)' }}
          onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, { background: 'rgba(0,200,255,0.20)', boxShadow: '0 0 44px rgba(0,200,255,0.32), 0 0 0 5px rgba(0,200,255,0.10), inset 0 1px 0 rgba(0,200,255,0.20)', borderColor: 'rgba(0,200,255,0.80)', transform: 'translateY(-2px)' })}
          onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, { background: 'rgba(0,200,255,0.12)', boxShadow: '0 0 28px rgba(0,200,255,0.18), 0 0 0 4px rgba(0,200,255,0.06), inset 0 1px 0 rgba(0,200,255,0.12)', borderColor: 'rgba(0,200,255,0.55)', transform: 'translateY(0)' })}
        >
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(0,200,255,0.18)', border: '1.5px solid rgba(0,200,255,0.40)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={21} strokeWidth={2.5} />
          </div>
          Crear nueva solicitud
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: 12 }}>
        {(Object.entries(EQUIPOS) as [Equipo, string][]).map(([eq, label]) => (
          <EquipoSummaryCard key={eq} equipo={eq} label={label} userName={userName} onClick={() => handleCardClick(eq)} />
        ))}
      </div>

      {/* Divisor */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--txt-muted)', letterSpacing: '1.2px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
          Solicitudes por área
        </span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>

      {/* Secciones por equipo */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {(Object.entries(EQUIPOS) as [Equipo, string][]).map(([eq, label]) => (
          <EquipoSection
            key={eq}
            equipo={eq}
            label={label}
            userName={userName}
            onVerMas={() => handleVerMas(eq)}
            onRowClick={(r) => setSelectedRequest(r)}
          />
        ))}
      </div>

      {/* Modal */}
      {selectedRequest && (
        <HomeRequestModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
        />
      )}
    </div>
  );
}