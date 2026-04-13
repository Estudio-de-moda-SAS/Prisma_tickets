import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/auth/AuthProvider';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { config } from '@/config';
import { MOCK_BOARD } from '@/features/requests/mock/Mockboard';
import { KANBAN_COLUMNAS } from '@/features/requests/types';
import type { Request, KanbanColumna } from '@/features/requests/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

/* ── Colores por estado ──────────────────────────────────────── */
const COL_COLOR: Record<KanbanColumna, string> = {
  sin_categorizar: 'var(--txt-muted)',
  icebox:          '#60a5fa',
  backlog:         'var(--info)',
  todo:            'var(--warn)',
  en_progreso:     'var(--accent)',
  hecho:           'var(--success)',
};

const PRIORIDAD_COLOR: Record<Request['prioridad'], string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

const PRIORIDAD_LABEL: Record<Request['prioridad'], string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

export function MisSolicitudesPage() {
  const { account }     = useAuth();
  const { Requests }    = useGraphServices();
  const nombre          = account?.name ?? '';

  const { data: todas, isLoading } = useQuery<Request[]>({
    queryKey: ['mis-solicitudes', nombre],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(
          Object.values(MOCK_BOARD).flat().filter((r) =>
            r.solicitante.toLowerCase().includes(nombre.split(' ')[0]?.toLowerCase() ?? '')
          )
        )
      : () => Requests.getAllPlain({ filter: `fields/Solicitante eq '${nombre}'`, orderby: 'fields/FechaApertura desc' }),
    staleTime:            config.USE_MOCK ? Infinity : 15_000,
    refetchInterval:      config.USE_MOCK ? false    : 20_000,
    refetchOnWindowFocus: !config.USE_MOCK,
    retry:                config.USE_MOCK ? false    : 1,
  });

  // En mock mostramos todas para que se vea el diseño
  const solicitudes = config.USE_MOCK
    ? Object.values(MOCK_BOARD).flat()
    : (todas ?? []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 900 }}>

      {/* Header de sección */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div>
          <p style={{ fontSize: 12, color: 'var(--txt-muted)', marginTop: 2 }}>
            {config.USE_MOCK ? 'Todas las solicitudes (modo demo)' : `Solicitudes de ${nombre}`}
          </p>
        </div>
        <span style={{
          marginLeft: 'auto',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 6,
          padding: '4px 12px',
          fontSize: 11,
          color: 'var(--txt-muted)',
        }}>
          {solicitudes.length} solicitud{solicitudes.length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Loading */}
      {isLoading && (
        <p style={{ color: 'var(--txt-muted)', fontSize: 12 }}>Cargando...</p>
      )}

      {/* Lista */}
      {!isLoading && solicitudes.length === 0 && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          padding: 40,
          textAlign: 'center',
          color: 'var(--txt-muted)',
          fontSize: 13,
        }}>
          No tienes solicitudes registradas.
        </div>
      )}

      {solicitudes.map((r) => (
        <RequestRow key={r.id} request={r} />
      ))}
    </div>
  );
}

/* ── Fila de solicitud ───────────────────────────────────────── */
function RequestRow({ request: r }: { request: Request }) {
  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border-subtle)',
      borderRadius: 8,
      padding: '14px 16px',
      display: 'grid',
      gridTemplateColumns: '3px 1fr auto',
      gap: 14,
      alignItems: 'start',
      transition: 'border-color 0.12s',
      cursor: 'pointer',
    }}
    onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--border)')}
    onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)')}
    >
      {/* Barra lateral de prioridad */}
      <div style={{
        width: 3,
        alignSelf: 'stretch',
        background: PRIORIDAD_COLOR[r.prioridad],
        borderRadius: 3,
      }} />

      {/* Contenido */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--txt-dim)', letterSpacing: 1 }}>
            #{r.id.slice(-6).toUpperCase()}
          </span>
          {r.categoria && (
            <span style={{
              fontSize: 9, color: 'var(--txt-muted)',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
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
            {r.descripcion.length > 100 ? r.descripcion.slice(0, 100) + '…' : r.descripcion}
          </p>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 }}>
          {/* Estado */}
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: 1,
            textTransform: 'uppercase', color: COL_COLOR[r.columna],
          }}>
            {KANBAN_COLUMNAS[r.columna]}
          </span>

          {/* Prioridad */}
          <span style={{
            fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
            textTransform: 'uppercase', padding: '2px 7px', borderRadius: 3,
            color: PRIORIDAD_COLOR[r.prioridad],
            background: `${PRIORIDAD_COLOR[r.prioridad]}18`,
            border: `1px solid ${PRIORIDAD_COLOR[r.prioridad]}30`,
          }}>
            {PRIORIDAD_LABEL[r.prioridad]}
          </span>

          {/* Resolutor */}
          {r.resolutor && (
            <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>
              → {r.resolutor}
            </span>
          )}
        </div>
      </div>

      {/* Fecha + equipo */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--txt-muted)', whiteSpace: 'nowrap' }}>
          {format(new Date(r.fechaApertura), 'd MMM yyyy', { locale: es })}
        </span>
        {r.equipo && (
          <span style={{
            fontSize: 9, fontWeight: 600, letterSpacing: 1,
            textTransform: 'uppercase', color: 'var(--accent)',
            background: 'rgba(0,200,255,0.08)',
            border: '1px solid rgba(0,200,255,0.15)',
            borderRadius: 3, padding: '2px 7px',
          }}>
            {r.equipo}
          </span>
        )}
      </div>
    </div>
  );
}