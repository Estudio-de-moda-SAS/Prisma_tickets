// src/pages/MyRequestsPage.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useBoardStore } from '@/store/boardStore';
import { config } from '@/config';
import { MOCK_BOARD } from '@/features/requests/mock/Mockboard';
import { KANBAN_COLUMNAS } from '@/features/requests/types';
import type { Request, KanbanColumna, Prioridad } from '@/features/requests/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const COL_COLOR: Record<KanbanColumna, string> = {
  sin_categorizar:  'var(--txt-muted)',
  icebox:           '#60a5fa',
  backlog:          'var(--info)',
  todo:             'var(--warn)',
  en_progreso:      'var(--accent)',
  en_revision_qas:  '#f59e0b',
  ready_to_deploy:  '#a78bfa',
  hecho:            'var(--success)',
  historial:        'var(--txt-muted)',
};

const COL_BG: Record<KanbanColumna, string> = {
  sin_categorizar:  'rgba(90,106,138,0.08)',
  icebox:           'rgba(96,165,250,0.08)',
  backlog:          'rgba(167,139,250,0.08)',
  todo:             'rgba(255,165,2,0.08)',
  en_progreso:      'rgba(0,200,255,0.08)',
  en_revision_qas:  'rgba(245,158,11,0.08)',
  ready_to_deploy:  'rgba(167,139,250,0.08)',
  hecho:            'rgba(0,229,160,0.08)',
  historial:        'rgba(90,106,138,0.08)',
};

const PRIORIDAD_COLOR: Record<Prioridad, string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

function fmtHours(h: number): string {
  const hrs  = Math.floor(h);
  const mins = Math.round((h % 1) * 60);
  if (mins === 0) return `${hrs}h`;
  return `${hrs}h ${mins}m`;
}

const IconClock = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
  </svg>
);

const IconUser = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
  </svg>
);

type FilterColumna = KanbanColumna | 'todas';

export function MisSolicitudesPage() {
  const { Requests }          = useGraphServices();
  const { data: currentUser } = useCurrentUser();
  const { equipoActivo }      = useBoardStore();
  const [filtro, setFiltro]   = useState<FilterColumna>('todas');

  const { data: todas = [], isLoading } = useQuery<Request[]>({
    queryKey: ['mis-solicitudes', currentUser?.User_ID, equipoActivo],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(Object.values(MOCK_BOARD).flat())
      : () => Requests.fetchByRequestedBy(currentUser!.User_ID),
    enabled:              config.USE_MOCK || !!currentUser,
    staleTime:            config.USE_MOCK ? Infinity : 15_000,
    refetchInterval:      config.USE_MOCK ? false : 20_000,
    refetchOnWindowFocus: !config.USE_MOCK,
    retry:                config.USE_MOCK ? false : 1,
  });

  const todasFiltradas = config.USE_MOCK
    ? todas
    : todas.filter((r) => r.equipo.includes(equipoActivo));

  const filtradas = filtro === 'todas'
    ? todasFiltradas
    : todasFiltradas.filter((r) => r.columna === filtro);

  const conteos = todasFiltradas.reduce<Partial<Record<KanbanColumna, number>>>((acc, r) => {
    acc[r.columna] = (acc[r.columna] ?? 0) + 1;
    return acc;
  }, {});

  const tabColumnas: KanbanColumna[] = [
    'sin_categorizar', 'icebox', 'backlog', 'todo', 'en_progreso',
    'en_revision_qas', 'ready_to_deploy', 'hecho', 'historial',
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 960 }}>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <p style={{ fontSize: 12, color: 'var(--txt-muted)' }}>
          {config.USE_MOCK
            ? 'Todas las solicitudes (modo demo)'
            : `Mis solicitudes en ${equipoActivo} — ${currentUser?.User_Name ?? '...'}`}
        </p>
        <span style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '4px 12px', fontSize: 11, color: 'var(--txt-muted)' }}>
          {filtradas.length} de {todasFiltradas.length} solicitud{todasFiltradas.length !== 1 ? 'es' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
        <button onClick={() => setFiltro('todas')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: filtro === 'todas' ? 600 : 400, background: filtro === 'todas' ? 'var(--bg-surface)' : 'transparent', border: filtro === 'todas' ? '1px solid var(--border)' : '1px solid transparent', color: filtro === 'todas' ? 'var(--txt)' : 'var(--txt-muted)', transition: 'all 0.12s', cursor: 'pointer' }}>
          Todas
          <span style={{ fontSize: 10, fontWeight: 700, background: filtro === 'todas' ? 'var(--accent-glow)' : 'var(--bg-surface)', color: filtro === 'todas' ? 'var(--accent)' : 'var(--txt-muted)', padding: '1px 6px', borderRadius: 8 }}>
            {todasFiltradas.length}
          </span>
        </button>

        {tabColumnas.map((col) => {
          const count = conteos[col] ?? 0;
          if (count === 0) return null;
          const active = filtro === col;
          return (
            <button key={col} onClick={() => setFiltro(col)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 5, fontSize: 11, fontWeight: active ? 600 : 400, background: active ? COL_BG[col] : 'transparent', border: active ? `1px solid ${COL_COLOR[col]}40` : '1px solid transparent', color: active ? COL_COLOR[col] : 'var(--txt-muted)', transition: 'all 0.12s', cursor: 'pointer' }}>
              {KANBAN_COLUMNAS[col]}
              <span style={{ fontSize: 10, fontWeight: 700, background: active ? `${COL_COLOR[col]}20` : 'var(--bg-surface)', color: active ? COL_COLOR[col] : 'var(--txt-muted)', padding: '1px 6px', borderRadius: 8 }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {isLoading && <p style={{ color: 'var(--txt-muted)', fontSize: 12 }}>Cargando...</p>}

      {!isLoading && filtradas.length === 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, padding: 40, textAlign: 'center', color: 'var(--txt-muted)', fontSize: 13 }}>
          {filtro === 'todas'
            ? 'No tienes solicitudes registradas en este equipo.'
            : `No hay solicitudes en "${KANBAN_COLUMNAS[filtro]}".`}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {filtradas.map((r) => <RequestRow key={r.id} request={r} />)}
      </div>
    </div>
  );
}

function RequestRow({ request: r }: { request: Request }) {
  const prioColor      = PRIORIDAD_COLOR[r.prioridad];
  const colColor       = COL_COLOR[r.columna];
  const colBg          = COL_BG[r.columna];
  const primerAsignado = r.assignees?.[0] ?? null;

  return (
    <div
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = `${prioColor}50`; e.currentTarget.style.transform = 'translateX(2px)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)'; e.currentTarget.style.transform = 'translateX(0)'; }}
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 8, display: 'grid', gridTemplateColumns: '3px 1fr auto', overflow: 'hidden', transition: 'border-color 0.15s, transform 0.15s', cursor: 'pointer' }}
    >
      <div style={{ background: prioColor, minHeight: '100%' }} />

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--txt-dim)', letterSpacing: 1 }}>#{r.id.slice(-6).toUpperCase()}</span>
          {r.categoria.map((cat) => (
            <span key={cat} style={{ fontSize: 9, color: 'var(--txt-muted)', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '1px 6px' }}>{cat}</span>
          ))}
        </div>

        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--txt)', margin: 0, lineHeight: 1.4 }}>{r.titulo}</p>

        {r.descripcion && (
          <p style={{ fontSize: 11, color: 'var(--txt-muted)', margin: 0, lineHeight: 1.5 }}>
            {r.descripcion.length > 110 ? r.descripcion.slice(0, 110) + '…' : r.descripcion}
          </p>
        )}

        {r.progreso > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 3, background: 'var(--bg-surface)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${r.progreso}%`, height: '100%', background: r.progreso === 100 ? 'var(--success)' : 'var(--accent)', borderRadius: 2, transition: 'width 0.3s ease' }} />
            </div>
            <span style={{ fontSize: 10, color: 'var(--txt-muted)', minWidth: 28, textAlign: 'right' }}>{r.progreso}%</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: colColor, background: colBg, border: `1px solid ${colColor}30`, borderRadius: 4, padding: '2px 8px' }}>
            {KANBAN_COLUMNAS[r.columna]}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: prioColor, background: `${prioColor}15`, border: `1px solid ${prioColor}30`, borderRadius: 4, padding: '2px 8px' }}>
            {PRIORIDAD_LABEL[r.prioridad]}
          </span>
          {primerAsignado && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--txt-muted)' }}>
              <IconUser />{primerAsignado.userName}
            </span>
          )}
          {r.estimatedHours != null && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--txt-muted)' }}>
              <IconClock />{fmtHours(r.estimatedHours)}
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, minWidth: 110, borderLeft: '1px solid var(--border-subtle)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--txt-muted)' }}>
          <IconClock />{format(new Date(r.fechaApertura), 'd MMM yyyy', { locale: es })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--txt-muted)' }}>
          <IconUser /><span style={{ maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.solicitante}</span>
        </div>
        {r.equipo.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            {r.equipo.map((eq) => (
              <span key={eq} style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--accent)', background: 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.15)', borderRadius: 3, padding: '2px 7px' }}>{eq}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}