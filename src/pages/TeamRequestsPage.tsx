import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CalendarDays, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '@/auth/AuthProvider';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import { MOCK_BOARD } from '@/features/requests/mock/Mockboard';
import { KANBAN_COLUMNAS, EQUIPOS } from '@/features/requests/types';
import { EQUIPO_COLORS, EQUIPO_ICONS } from '@/components/layout/siderbarConstants';
import type { Request, Equipo, KanbanColumna } from '@/features/requests/types';

/* ── helpers ──────────────────────────────────────────────────── */
const COL_COLOR: Record<KanbanColumna, string> = {
  sin_categorizar: 'var(--txt-muted)',
  icebox:          '#60a5fa',
  backlog:         'var(--info, #9B8AFF)',
  todo:            'var(--warn, #F4C542)',
  en_progreso:     'var(--accent)',
  hecho:           'var(--success, #4CAF50)',
};

const PRIORIDAD_COLOR: Record<Request['prioridad'], string> = {
  baja:    '#4EA8DE',
  media:   '#F4C542',
  alta:    '#EF9F27',
  critica: '#E05C5C',
};

const PRIORIDAD_LABEL: Record<Request['prioridad'], string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

/* Genera lista de meses disponibles desde el más antiguo hasta hoy */
function getMonthOptions(requests: Request[]): { label: string; value: string }[] {
  if (!requests.length) return [];
  const now   = new Date();
  const dates = requests.map((r) => new Date(r.fechaApertura));
  const min   = new Date(Math.min(...dates.map((d) => d.getTime())));

  const options: { label: string; value: string }[] = [];
  const cur = new Date(now.getFullYear(), now.getMonth(), 1);
  const stop = new Date(min.getFullYear(), min.getMonth(), 1);

  while (cur >= stop) {
    const value = format(cur, 'yyyy-MM');
    const label = format(cur, 'MMMM yyyy', { locale: es });
    options.push({ label: label.charAt(0).toUpperCase() + label.slice(1), value });
    cur.setMonth(cur.getMonth() - 1);
  }
  return options;
}

/* ── RequestRow ──────────────────────────────────────────────── */
function RequestRow({ r }: { r: Request }) {
  return (
    <div
      style={{
        background: 'var(--surface-1)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '14px 16px',
        display: 'grid',
        gridTemplateColumns: '3px 1fr auto',
        gap: 14,
        alignItems: 'start',
        transition: 'border-color 0.12s',
        cursor: 'pointer',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.12)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
    >
      {/* Barra prioridad */}
      <div style={{
        width: 3, alignSelf: 'stretch',
        background: PRIORIDAD_COLOR[r.prioridad], borderRadius: 3,
      }} />

      {/* Contenido */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--txt-muted)', letterSpacing: 1 }}>
            #{r.id.slice(-6).toUpperCase()}
          </span>
          {r.categoria && (
            <span style={{
              fontSize: 9, color: 'var(--txt-muted)',
              background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)',
              borderRadius: 3, padding: '1px 6px',
            }}>
              {r.categoria}
            </span>
          )}
        </div>

        <p style={{ fontSize: 14, fontWeight: 500, color: 'var(--txt)', margin: 0 }}>
          {r.titulo}
        </p>

        {r.descripcion && (
          <p style={{ fontSize: 12, color: 'var(--txt-muted)', margin: 0, lineHeight: 1.5 }}>
            {r.descripcion.length > 120 ? r.descripcion.slice(0, 120) + '…' : r.descripcion}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 1,
            textTransform: 'uppercase', color: COL_COLOR[r.columna],
          }}>
            {KANBAN_COLUMNAS[r.columna]}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
            textTransform: 'uppercase', padding: '2px 7px', borderRadius: 3,
            color: PRIORIDAD_COLOR[r.prioridad],
            background: `${PRIORIDAD_COLOR[r.prioridad]}18`,
            border: `1px solid ${PRIORIDAD_COLOR[r.prioridad]}30`,
          }}>
            {PRIORIDAD_LABEL[r.prioridad]}
          </span>
          {r.resolutor && (
            <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>
              → {r.resolutor}
            </span>
          )}
        </div>
      </div>

      {/* Fecha */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--txt-muted)', whiteSpace: 'nowrap' }}>
          {format(new Date(r.fechaApertura), 'd MMM yyyy', { locale: es })}
        </span>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   TeamRequestsPage
   ══════════════════════════════════════════════════════════════ */
export function TeamRequestsPage() {
  const { equipo: equipoParam } = useParams<{ equipo: string }>();
  const navigate                = useNavigate();
  const { account }             = useAuth();
  const { Requests }            = useGraphServices();

  const equipo = equipoParam as Equipo;
  const label  = EQUIPOS[equipo] ?? equipo;
  const c      = EQUIPO_COLORS[equipo] ?? { dot: 'var(--accent)' };
  const Icon   = EQUIPO_ICONS[equipo];
  const nombre = account?.name ?? '';

  /* ── Datos ──────────────────────────────────────────────── */
  const { data: todas = [], isLoading } = useQuery<Request[]>({
    queryKey: ['team-requests', equipo, nombre],
    queryFn: config.USE_MOCK
      ? () => Promise.resolve(
          Object.values(MOCK_BOARD)
            .flat()
            .filter((r) =>
              r.solicitante.toLowerCase().includes(nombre.split(' ')[0]?.toLowerCase() ?? '')
            )
        )
      : () => Requests.getAllPlain({
          filter: `fields/Equipo eq '${equipo}' and fields/Solicitante eq '${nombre}'`,
          orderby: 'fields/FechaApertura desc',
        }),
    staleTime:            config.USE_MOCK ? Infinity : 15_000,
    refetchInterval:      config.USE_MOCK ? false    : 20_000,
    refetchOnWindowFocus: !config.USE_MOCK,
  });

  // En mock mostramos todo el board para ver el diseño
  const allRequests: Request[] = config.USE_MOCK
    ? Object.values(MOCK_BOARD).flat()
    : todas;

  /* ── Filtro mes/año ─────────────────────────────────────── */
  const monthOptions = useMemo(() => getMonthOptions(allRequests), [allRequests]);
  const currentMonth = format(new Date(), 'yyyy-MM');
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [dropdownOpen, setDropdownOpen]   = useState(false);

  const filtered = useMemo(() => {
    if (!selectedMonth) return allRequests;
    return allRequests.filter((r) =>
      r.fechaApertura.startsWith(selectedMonth)
    );
  }, [allRequests, selectedMonth]);

  const selectedLabel = monthOptions.find((o) => o.value === selectedMonth)?.label
    ?? format(new Date(), 'MMMM yyyy', { locale: es });

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 24,
      maxWidth: 860, margin: '0 auto', width: '100%',
      padding: '4px 0 48px',
    }}>

      {/* ── Back + Header ──────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <button
          onClick={() => navigate('/home')}
          style={{
            alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', color: 'var(--txt-muted)',
            fontSize: 12, cursor: 'pointer', padding: '4px 0',
            transition: 'color 0.12s',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--txt)'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--txt-muted)'; }}
        >
          <ArrowLeft size={13} /> Volver al inicio
        </button>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Icono equipo */}
            <div style={{
              width: 36, height: 36, borderRadius: 9,
              background: c.dot + '18', border: `1px solid ${c.dot}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {Icon && <Icon size={16} style={{ color: c.dot }} />}
            </div>
            <div>
              <h1 style={{
                margin: 0, fontSize: 20, fontWeight: 700,
                color: 'var(--txt)', fontFamily: 'var(--font-display)',
                letterSpacing: '-0.3px',
              }}>
                Mis solicitudes —{' '}
                <span style={{ color: c.dot }}>{label}</span>
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--txt-muted)' }}>
                {isLoading ? 'Cargando…' : `${filtered.length} solicitud${filtered.length !== 1 ? 'es' : ''} en ${selectedLabel}`}
              </p>
            </div>
          </div>

          {/* Selector mes/año */}
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setDropdownOpen((o) => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 12px', borderRadius: 8,
                border: `1px solid ${dropdownOpen ? c.dot + '60' : 'var(--border)'}`,
                background: dropdownOpen ? c.dot + '0E' : 'var(--surface-1)',
                color: dropdownOpen ? c.dot : 'var(--txt)',
                fontSize: 12, fontWeight: 500, cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              <CalendarDays size={13} />
              {selectedLabel}
              <ChevronDown
                size={12}
                style={{
                  transition: 'transform 0.15s',
                  transform: dropdownOpen ? 'rotate(180deg)' : 'none',
                  color: 'var(--txt-muted)',
                }}
              />
            </button>

            {dropdownOpen && (
              <div
                style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  background: 'var(--surface-1)', border: '1px solid var(--border)',
                  borderRadius: 10, overflow: 'hidden', zIndex: 50,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                  minWidth: 180, maxHeight: 280, overflowY: 'auto',
                }}
              >
                {monthOptions.length === 0 && (
                  <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--txt-muted)' }}>
                    Sin datos
                  </div>
                )}
                {monthOptions.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSelectedMonth(opt.value); setDropdownOpen(false); }}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '9px 14px', fontSize: 12, fontWeight: 500,
                      background: selectedMonth === opt.value ? c.dot + '14' : 'transparent',
                      color: selectedMonth === opt.value ? c.dot : 'var(--txt)',
                      border: 'none', cursor: 'pointer',
                      borderLeft: selectedMonth === opt.value ? `2px solid ${c.dot}` : '2px solid transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedMonth !== opt.value)
                        (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                    }}
                    onMouseLeave={(e) => {
                      if (selectedMonth !== opt.value)
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Divider ─────────────────────────────────────────── */}
      <div style={{ height: 1, background: 'var(--border)' }} />

      {/* ── Lista ───────────────────────────────────────────── */}
      {isLoading ? (
        <p style={{ color: 'var(--txt-muted)', fontSize: 12 }}>Cargando...</p>
      ) : filtered.length === 0 ? (
        <div style={{
          background: 'var(--surface-1)', border: '1px solid var(--border)',
          borderRadius: 10, padding: '40px 24px', textAlign: 'center',
          color: 'var(--txt-muted)', fontSize: 13,
        }}>
          No tienes solicitudes en {selectedLabel}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((r) => <RequestRow key={r.id} r={r} />)}
        </div>
      )}
    </div>
  );
}