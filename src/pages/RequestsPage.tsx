import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X, ExternalLink, ChevronRight } from 'lucide-react';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { useMoveRequest } from '@/features/requests/hooks/useMoveRequests';
import { config } from '@/config';
import { MOCK_BOARD } from '@/features/requests/mock/Mockboard';
import { KANBAN_COLUMNAS, EQUIPOS, PRIORIDADES } from '@/features/requests/types';
import type { Request, KanbanColumna, Equipo, Prioridad } from '@/features/requests/types';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useBoardStore } from '@/store/boardStore';

/* ── Colores ─────────────────────────────────────────────────── */
const COL_COLOR: Record<KanbanColumna, string> = {
  sin_categorizar: 'var(--txt-muted)',
  icebox:          '#60a5fa',
  backlog:         'var(--info)',
  todo:            'var(--warn)',
  en_progreso:     'var(--accent)',
  hecho:           'var(--success)',
};

const PRI_COLOR: Record<Prioridad, string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

/* ── Página principal ────────────────────────────────────────── */
export function RequestsPage() {
  const { Requests }            = useGraphServices();
  const navigate                = useNavigate();
  const { setEquipoActivo }     = useBoardStore();

  const [search,    setSearch]   = useState('');
  const [colFilter, setColFilter] = useState<KanbanColumna | ''>('');
  const [priFilter, setPriFilter] = useState<Prioridad | ''>('');
  const [eqFilter,  setEqFilter]  = useState<Equipo | ''>('');
  const [selected,  setSelected]  = useState<Request | null>(null);

  /* Query */
  const { data: all = [], isLoading } = useQuery<Request[]>({
    queryKey: ['requests-all'],
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(Object.values(MOCK_BOARD).flat())
      : () => Requests.getAllPlain({ orderby: 'fields/FechaApertura desc' }),
    staleTime:            config.USE_MOCK ? Infinity : 15_000,
    refetchInterval:      config.USE_MOCK ? false    : 20_000,
    refetchOnWindowFocus: !config.USE_MOCK,
    retry:                config.USE_MOCK ? false    : 1,
  });

  /* Filtrado */
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return all.filter((r) => {
      if (q && ![r.titulo, r.solicitante, r.resolutor ?? '', r.descripcion]
        .some((f) => f.toLowerCase().includes(q))) return false;
      if (colFilter && r.columna   !== colFilter) return false;
      if (priFilter && r.prioridad !== priFilter) return false;
if (eqFilter && !r.equipo.includes(eqFilter)) return false;      return true;
    });
  }, [all, search, colFilter, priFilter, eqFilter]);

function goToBoard(r: Request) {
  if (r.equipo.length > 0) setEquipoActivo(r.equipo[0]);
  navigate('/');
}

  /* Estilos reutilizables */
  const selectStyle: React.CSSProperties = {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 6,
    padding: '7px 10px',
    color: 'var(--txt)',
    fontSize: 12,
    outline: 'none',
    cursor: 'pointer',
    minWidth: 130,
  };

  return (
    <div style={{ display: 'flex', gap: 0, height: '100%', overflow: 'hidden' }}>

      {/* ── Panel izquierdo: lista ────────────────────────────── */}
      <div style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 14,
        overflow: 'hidden',
        paddingRight: selected ? 16 : 0,
        transition: 'padding 0.2s',
      }}>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

          {/* Búsqueda */}
          <div style={{ position: 'relative', flex: '1 1 200px' }}>
            <Search size={13} style={{
              position: 'absolute', left: 10, top: '50%',
              transform: 'translateY(-50%)', color: 'var(--txt-muted)',
            }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por título, solicitante, resolutor..."
              style={{
                width: '100%',
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 6,
                padding: '7px 10px 7px 30px',
                color: 'var(--txt)',
                fontSize: 12,
                outline: 'none',
              }}
            />
            {search && (
              <button onClick={() => setSearch('')} style={{
                position: 'absolute', right: 8, top: '50%',
                transform: 'translateY(-50%)', color: 'var(--txt-muted)',
              }}>
                <X size={12} />
              </button>
            )}
          </div>

          <select style={selectStyle} value={colFilter} onChange={(e) => setColFilter(e.target.value as KanbanColumna | '')}>
            <option value="">Todos los estados</option>
            {(Object.entries(KANBAN_COLUMNAS) as [KanbanColumna, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select style={selectStyle} value={priFilter} onChange={(e) => setPriFilter(e.target.value as Prioridad | '')}>
            <option value="">Toda prioridad</option>
            {(Object.entries(PRIORIDADES) as [Prioridad, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <select style={selectStyle} value={eqFilter} onChange={(e) => setEqFilter(e.target.value as Equipo | '')}>
            <option value="">Todos los equipos</option>
            {(Object.entries(EQUIPOS) as [Equipo, string][]).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>

          <span style={{ fontSize: 11, color: 'var(--txt-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
            {filtered.length} de {all.length}
          </span>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isLoading && (
            <p style={{ color: 'var(--txt-muted)', fontSize: 12 }}>Cargando...</p>
          )}

          {!isLoading && filtered.length === 0 && (
            <div style={{
              background: 'var(--bg-card)', border: '1px solid var(--border-subtle)',
              borderRadius: 8, padding: 40, textAlign: 'center',
              color: 'var(--txt-muted)', fontSize: 13,
            }}>
              No hay requests que coincidan con los filtros.
            </div>
          )}

          {filtered.map((r) => (
            <RequestRow
              key={r.id}
              request={r}
              isSelected={selected?.id === r.id}
              onClick={() => setSelected(selected?.id === r.id ? null : r)}
            />
          ))}
        </div>
      </div>

      {/* ── Panel derecho: detalle ────────────────────────────── */}
      {selected && (
        <RequestDetail
          request={selected}
          onClose={() => setSelected(null)}
          onGoToBoard={goToBoard}
          onUpdate={(updated) => setSelected(updated)}
        />
      )}
    </div>
  );
}

/* ── Fila de la lista ────────────────────────────────────────── */
function RequestRow({ request: r, isSelected, onClick }: {
  request:    Request;
  isSelected: boolean;
  onClick:    () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: isSelected ? 'rgba(0,200,255,0.06)' : 'var(--bg-card)',
        border: `1px solid ${isSelected ? 'rgba(0,200,255,0.25)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 7,
        padding: '12px 14px',
        cursor: 'pointer',
        display: 'grid',
        gridTemplateColumns: '3px 1fr auto',
        gap: 12,
        alignItems: 'center',
        transition: 'border-color 0.1s, background 0.1s',
      }}
      onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)'; }}
      onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; }}
    >
      {/* Barra de prioridad */}
      <div style={{ width: 3, alignSelf: 'stretch', background: PRI_COLOR[r.prioridad], borderRadius: 3 }} />

      {/* Contenido */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'monospace', fontSize: 10, color: 'var(--txt-dim)', letterSpacing: 1 }}>
            #{r.id.slice(-6).toUpperCase()}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            color: COL_COLOR[r.columna],
          }}>
            {KANBAN_COLUMNAS[r.columna]}
          </span>
          {r.categoria && (
            <span style={{
              fontSize: 9, color: 'var(--txt-muted)', background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)', borderRadius: 3, padding: '1px 6px',
            }}>
              {r.categoria}
            </span>
          )}
        </div>

        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--txt)', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {r.titulo}
        </p>

        <div style={{ display: 'flex', gap: 10, fontSize: 11, color: 'var(--txt-muted)' }}>
          <span>{r.solicitante}</span>
          {r.resolutor && <><span>→</span><span>{r.resolutor}</span></>}
{r.equipo.length > 0 && (
  <span style={{ color: 'var(--accent)', fontWeight: 500 }}>
    {EQUIPOS[r.equipo[0]]}
  </span>
)}

        </div>
      </div>

      {/* Fecha + chevron */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--txt-muted)', whiteSpace: 'nowrap' }}>
          {format(new Date(r.fechaApertura), 'd MMM', { locale: es })}
        </span>
        <ChevronRight size={14} style={{ color: 'var(--txt-dim)', flexShrink: 0 }} />
      </div>
    </div>
  );
}

/* ── Panel de detalle ────────────────────────────────────────── */
function RequestDetail({ request, onClose, onGoToBoard, onUpdate }: {
  request:     Request;
  onClose:     () => void;
  onGoToBoard: (r: Request) => void;
  onUpdate:    (r: Request) => void;
}) {
const { mutate: mover } = useMoveRequest(request.equipo[0] ?? 'desarrollo');

  function handleMover(columna: KanbanColumna) {
    mover(
      { id: request.id, columna },
      { onSuccess: () => onUpdate({ ...request, columna }) },
    );
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: 2,
    textTransform: 'uppercase', color: 'var(--txt-muted)',
    marginBottom: 6, display: 'block',
  };

  const sectionStyle: React.CSSProperties = {
    paddingBottom: 16,
    borderBottom: '1px solid var(--border-subtle)',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  };

  return (
    <div style={{
      width: 320,
      flexShrink: 0,
      background: 'var(--bg-panel)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header del panel */}
      <div style={{
        padding: '12px 16px',
        borderBottom: '1px solid var(--border-subtle)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
      }}>
        <span style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--txt-muted)', letterSpacing: 1 }}>
          #{request.id.slice(-6).toUpperCase()}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {request.equipo && (
            <button
              onClick={() => onGoToBoard(request)}
              title="Ver en board"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '4px 10px', borderRadius: 5, fontSize: 11,
                border: '1px solid var(--border-subtle)',
                color: 'var(--accent)', background: 'rgba(0,200,255,0.08)',
                cursor: 'pointer',
              }}
            >
              <ExternalLink size={12} />
              Ver en board
            </button>
          )}
          <button onClick={onClose} style={{ color: 'var(--txt-muted)', padding: 4, borderRadius: 4 }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Contenido scrolleable */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Título */}
        <div style={sectionStyle}>
          <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--txt)', lineHeight: 1.4, margin: 0 }}>
            {request.titulo}
          </p>
        </div>

        {/* Descripción */}
        {request.descripcion && (
          <div style={sectionStyle}>
            <span style={labelStyle}>Descripción</span>
            <p style={{ fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.6, margin: 0 }}>
              {request.descripcion}
            </p>
          </div>
        )}

        {/* Personas */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Personas</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <InfoRow label="Solicitante" value={request.solicitante} />
            <InfoRow label="Resolutor"   value={request.resolutor ?? '—'} />
{request.equipo.length > 0 && (
  <InfoRow label="Equipo" value={EQUIPOS[request.equipo[0]]} accent />
)}
          </div>
        </div>

        {/* Prioridad */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Prioridad</span>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            textTransform: 'uppercase', padding: '4px 10px',
            borderRadius: 4, width: 'fit-content',
            color: PRI_COLOR[request.prioridad],
            background: `${PRI_COLOR[request.prioridad]}18`,
            border: `1px solid ${PRI_COLOR[request.prioridad]}35`,
          }}>
            {PRIORIDADES[request.prioridad]}
          </span>
        </div>

        {/* Mover a columna */}
        <div style={sectionStyle}>
          <span style={labelStyle}>Mover a</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(Object.entries(KANBAN_COLUMNAS) as [KanbanColumna, string][]).map(([col, label]) => (
              <button
                key={col}
                onClick={() => handleMover(col)}
                disabled={request.columna === col}
                style={{
                  padding: '5px 10px',
                  borderRadius: 5,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  border: `1px solid ${request.columna === col ? COL_COLOR[col] + '60' : 'var(--border-subtle)'}`,
                  background: request.columna === col ? `${COL_COLOR[col]}18` : 'transparent',
                  color: request.columna === col ? COL_COLOR[col] : 'var(--txt-muted)',
                  cursor: request.columna === col ? 'default' : 'pointer',
                  transition: 'all 0.1s',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Fechas */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={labelStyle}>Fechas</span>
          <InfoRow
            label="Apertura"
            value={format(new Date(request.fechaApertura), "d 'de' MMMM yyyy", { locale: es })}
          />
          {request.fechaMaxima && (
            <InfoRow
              label="Límite"
              value={format(new Date(request.fechaMaxima), "d 'de' MMMM yyyy", { locale: es })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Info row helper ─────────────────────────────────────────── */
function InfoRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 11, color: 'var(--txt-muted)' }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: accent ? 'var(--accent)' : 'var(--txt)' }}>
        {value}
      </span>
    </div>
  );
}