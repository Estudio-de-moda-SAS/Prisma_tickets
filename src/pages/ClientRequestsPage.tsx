// src/pages/ClientRequestsPage.tsx
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Inbox, Search, Filter, Clock, AlertCircle, ChevronRight, Plus, X,
  CheckCircle2, Loader2,
} from 'lucide-react';

import { useGraphServices } from '@/graph/GraphServicesProvider';
import { useCurrentUser } from '@/features/requests/hooks/useCurrentUser';
import { useBoardTeams } from '@/features/requests/hooks/useBoardMetadata';
import { config } from '@/config';
import type { Request, KanbanColumna, Prioridad } from '@/features/requests/types';

import '@/styles/clientRequests.css';

// ─── Estados simplificados para el cliente ──────────────────────────────

type Estado = 'todas' | 'pendiente_revision' | 'en_proceso' | 'sin_clasificar' | 'completada';

const ESTADO_LABEL: Record<Estado, string> = {
  todas:              'Todas',
  pendiente_revision: 'Esperando tu revisión',
  en_proceso:         'En proceso',
  sin_clasificar:     'Recibidas',
  completada:         'Completadas',
};

const COLUMNAS_POR_ESTADO: Record<Exclude<Estado, 'todas'>, KanbanColumna[]> = {
  pendiente_revision: ['cliente_review'],
  en_proceso:         ['icebox', 'backlog', 'todo', 'en_progreso', 'en_revision_qas', 'ready_to_deploy'],
  sin_clasificar:     ['sin_categorizar'],
  completada:         ['hecho', 'historial'],
};

function estadoDeColumna(col: KanbanColumna): Estado {
  for (const [estado, cols] of Object.entries(COLUMNAS_POR_ESTADO)) {
    if (cols.includes(col)) return estado as Estado;
  }
  return 'todas';
}

// ─── Labels amigables para el cliente (no jerga TI) ─────────────────────

const COLUMNA_LABEL_CLIENTE: Record<KanbanColumna, string> = {
  sin_categorizar:  'Recibida',
  icebox:           'En espera',
  backlog:          'En cola',
  todo:             'Pendiente',
  en_progreso:      'En progreso',
  en_revision_qas:  'En revisión técnica',
  cliente_review:   'Esperando tu aprobación',
  ready_to_deploy:  'Lista para entrega',
  hecho:            'Completada',
  historial:        'Archivada',
};

const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function normalizeDate(s: string): Date {
  // Supabase devuelve datetimes sin 'Z' → normalizar a UTC antes de parsear
  return new Date(s.endsWith('Z') ? s : `${s}Z`);
}

function timeAgo(s: string): string {
  const d     = normalizeDate(s);
  const diff  = Date.now() - d.getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return 'hace instantes';
  if (mins  < 60) return `hace ${mins} min`;
  if (hours < 24) return `hace ${hours} h`;
  if (days  < 7)  return `hace ${days} día${days === 1 ? '' : 's'}`;
  return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function displayName(full: string): string {
  const parts = full.trim().split(/\s+/);
  if (parts.length >= 3) return `${parts[0]} ${parts[2]}`;
  return full;
}

// ─── Componente principal ───────────────────────────────────────────────

export function ClientRequestsPage() {
  const { Requests }              = useGraphServices();
  const { data: currentUser }     = useCurrentUser();
  const { data: boardTeams = [] } = useBoardTeams(config.DEFAULT_BOARD_ID);

  const navigate = useNavigate();
  const location = useLocation();

  const [estado,    setEstado]    = useState<Estado>('todas');
  const [search,    setSearch]    = useState('');
  const [equipo,    setEquipo]    = useState<string>('todos');
  const [prioridad, setPrioridad] = useState<Prioridad | 'todas'>('todas');

  const { data: solicitudes = [], isLoading } = useQuery<Request[]>({
    queryKey: ['client-requests', currentUser?.User_ID],
    queryFn:  () => Requests.fetchByRequestedBy(currentUser!.User_ID),
    enabled:  !!currentUser,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  // Mapa code → name de equipos para labels legibles
  const teamNameByCode = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of boardTeams) m[t.Board_Team_Code] = t.Board_Team_Name;
    return m;
  }, [boardTeams]);

  // Solo equipos que aparecen en las solicitudes del usuario (filtro limpio)
  const equiposDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const r of solicitudes) for (const eq of r.equipo) set.add(eq);
    return Array.from(set).sort();
  }, [solicitudes]);

  // Conteos por estado
  const conteos = useMemo(() => {
    const c: Record<Estado, number> = {
      todas:              solicitudes.length,
      pendiente_revision: 0,
      en_proceso:         0,
      sin_clasificar:     0,
      completada:         0,
    };
    for (const r of solicitudes) {
      const e = estadoDeColumna(r.columna);
      if (e !== 'todas') c[e]++;
    }
    return c;
  }, [solicitudes]);

  // Aplicar filtros + búsqueda
  const filtradas = useMemo(() => {
    const q = search.trim().toLowerCase();
    let out = solicitudes;

    if (estado !== 'todas') {
      const cols = new Set(COLUMNAS_POR_ESTADO[estado as Exclude<Estado, 'todas'>]);
      out = out.filter((r) => cols.has(r.columna));
    }
    if (equipo !== 'todos') {
      out = out.filter((r) => r.equipo.includes(equipo));
    }
    if (prioridad !== 'todas') {
      out = out.filter((r) => r.prioridad === prioridad);
    }
    if (q) {
      out = out.filter((r) =>
        r.titulo.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.descripcion.toLowerCase().includes(q),
      );
    }
    return out;
  }, [solicitudes, estado, equipo, prioridad, search]);

  const filtrosActivos =
    equipo !== 'todos' || prioridad !== 'todas' || search.trim() !== '';

  const resetFiltros = () => {
    setSearch('');
    setEquipo('todos');
    setPrioridad('todas');
  };

  const abrirTicket = (id: string) => {
    navigate(`/ticket/${id}`, { state: { backgroundLocation: location } });
  };

  const pendientesRevision = conteos.pendiente_revision;

  return (
    <div className="client-requests">
      {/* ── Header ── */}
      <header className="client-requests__header">
        <div className="client-requests__header-main">
          <div className="client-requests__title-row">
            <Inbox className="client-requests__title-icon" size={20} />
            <h1 className="client-requests__title">Mis Solicitudes</h1>
          </div>
          <p className="client-requests__subtitle">
            Sigue el estado de cada solicitud que has creado.
          </p>
        </div>
        <button
          className="client-requests__cta"
          onClick={() => navigate('/new')}
          type="button"
        >
          <Plus size={14} />
          <span>Nueva solicitud</span>
        </button>
      </header>

      {/* ── Banner de atención (solo si hay pendientes y no está filtrando por ese estado) ── */}
      {pendientesRevision > 0 && estado !== 'pendiente_revision' && (
        <button
          type="button"
          className="client-requests__alert"
          onClick={() => setEstado('pendiente_revision')}
        >
          <AlertCircle size={16} className="client-requests__alert-icon" />
          <div className="client-requests__alert-content">
            <strong>
              {pendientesRevision} solicitud{pendientesRevision === 1 ? '' : 'es'} esperan tu revisión
            </strong>
            <span>Aprueba o rechaza el trabajo entregado por el equipo de TI.</span>
          </div>
          <ChevronRight size={16} />
        </button>
      )}

      {/* ── Tabs por estado simplificado ── */}
      <nav className="client-requests__tabs" role="tablist">
        {(['todas', 'pendiente_revision', 'en_proceso', 'sin_clasificar', 'completada'] as Estado[]).map((e) => {
          const count   = conteos[e];
          const active  = estado === e;
          const isAlert = e === 'pendiente_revision' && count > 0;
          return (
            <button
              key={e}
              role="tab"
              aria-selected={active}
              onClick={() => setEstado(e)}
              className={[
                'client-requests__tab',
                active  ? 'client-requests__tab--active' : '',
                isAlert ? 'client-requests__tab--alert'  : '',
              ].join(' ')}
            >
              <span>{ESTADO_LABEL[e]}</span>
              <span className="client-requests__tab-count">{count}</span>
            </button>
          );
        })}
      </nav>

      {/* ── Toolbar: búsqueda + filtros ── */}
      <div className="client-requests__toolbar">
        <div className="client-requests__search">
          <Search size={14} />
          <input
            type="text"
            placeholder="Buscar por título o ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch('')} type="button" aria-label="Limpiar búsqueda">
              <X size={12} />
            </button>
          )}
        </div>

        <div className="client-requests__filter-group">
          <Filter size={13} className="client-requests__filter-icon" />

          <select
            className="client-requests__select"
            value={equipo}
            onChange={(e) => setEquipo(e.target.value)}
            aria-label="Filtrar por equipo"
          >
            <option value="todos">Todos los equipos</option>
            {equiposDisponibles.map((code) => (
              <option key={code} value={code}>{teamNameByCode[code] ?? code}</option>
            ))}
          </select>

          <select
            className="client-requests__select"
            value={prioridad}
            onChange={(e) => setPrioridad(e.target.value as Prioridad | 'todas')}
            aria-label="Filtrar por prioridad"
          >
            <option value="todas">Cualquier prioridad</option>
            <option value="critica">Crítica</option>
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>

          {filtrosActivos && (
            <button type="button" className="client-requests__reset" onClick={resetFiltros}>
              <X size={11} />
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* ── Summary ── */}
      <div className="client-requests__summary">
        Mostrando {filtradas.length} de {solicitudes.length}
      </div>

      {/* ── Estados: loading / empty / lista ── */}
      {isLoading ? (
        <div className="client-requests__loading">
          <Loader2 className="client-requests__spinner" size={18} />
          <span>Cargando tus solicitudes...</span>
        </div>
      ) : filtradas.length === 0 ? (
        solicitudes.length === 0 ? (
          <EmptyState
            icon={<Inbox size={28} />}
            title="Aún no tienes solicitudes"
            description="Cuando crees tu primera solicitud aparecerá aquí."
            cta={{ label: 'Crear solicitud', onClick: () => navigate('/new') }}
          />
        ) : (
          <EmptyState
            icon={<Search size={28} />}
            title="Sin resultados"
            description="Ninguna solicitud coincide con los filtros actuales."
            cta={filtrosActivos ? { label: 'Limpiar filtros', onClick: resetFiltros } : undefined}
          />
        )
      ) : (
        <ul className="client-requests__list">
          {filtradas.map((r) => (
            <RequestCard
              key={r.id}
              request={r}
              teamNameByCode={teamNameByCode}
              onClick={() => abrirTicket(r.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ─── Card individual ─────────────────────────────────────────────────────

function RequestCard({
  request: r,
  teamNameByCode,
  onClick,
}: {
  request: Request;
  teamNameByCode: Record<string, string>;
  onClick: () => void;
}) {
  const esPendiente   = r.columna === 'cliente_review';
  const esCompletada  = r.columna === 'hecho' || r.columna === 'historial';
  const primerAsignado = r.assignees[0];

  return (
    <li>
      <button
        type="button"
        className={[
          'client-request-card',
          `client-request-card--prio-${r.prioridad}`,
          esPendiente  ? 'client-request-card--pending' : '',
          esCompletada ? 'client-request-card--done'    : '',
        ].join(' ')}
        onClick={onClick}
      >
        <div className="client-request-card__priority-bar" />

        <div className="client-request-card__body">
          <div className="client-request-card__head">
            <span className="client-request-card__id">{r.id}</span>
            {r.equipo.map((eq) => (
              <span key={eq} className="client-request-card__team">
                {teamNameByCode[eq] ?? eq}
              </span>
            ))}
            <span className={`client-request-card__status client-request-card__status--${r.columna}`}>
              {esCompletada && <CheckCircle2 size={11} />}
              {COLUMNA_LABEL_CLIENTE[r.columna] ?? r.columna}
            </span>
          </div>

          <h3 className="client-request-card__title">{r.titulo}</h3>

          {r.descripcion && (
            <p className="client-request-card__description">
              {r.descripcion.length > 140 ? r.descripcion.slice(0, 140) + '…' : r.descripcion}
            </p>
          )}

          <div className="client-request-card__meta">
            <span className={`client-request-card__priority client-request-card__priority--${r.prioridad}`}>
              {PRIORIDAD_LABEL[r.prioridad]}
            </span>
            {primerAsignado && (
              <span className="client-request-card__assignee">
                Atiende: {displayName(primerAsignado.userName)}
                {r.assignees.length > 1 && ` +${r.assignees.length - 1}`}
              </span>
            )}
            <span className="client-request-card__date">
              <Clock size={11} />
              {timeAgo(r.fechaApertura)}
            </span>
          </div>
        </div>

        <ChevronRight size={16} className="client-request-card__chevron" />
      </button>
    </li>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────

function EmptyState({
  icon, title, description, cta,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  cta?: { label: string; onClick: () => void };
}) {
  return (
    <div className="client-requests__empty">
      <div className="client-requests__empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{description}</p>
      {cta && (
        <button type="button" className="client-requests__cta" onClick={cta.onClick}>
          {cta.label}
        </button>
      )}
    </div>
  );
}