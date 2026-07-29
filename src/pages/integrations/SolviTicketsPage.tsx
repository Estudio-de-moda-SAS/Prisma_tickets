// src/pages/integrations/SolviTicketsPage.tsx
import { useMemo, useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router';
import { LayoutList, Search } from 'lucide-react';
import { useBoardTeams } from '@/features/requests/hooks/useBoardMetadata';
import { useSolviTickets, type SolviTicket } from '@/features/requests/hooks/useSolviTickets';
import { config } from '@/config';
import { SolviTicketModal } from '@/features/requests/components/SolviTicketModal';
import '@/styles/solvi.css';

/* ============================================================
   SOLVI — Listado de tickets (integración externa)
   ────────────────────────────────────────────────────────────
   Lee de TBL_Ticket_Solvi vía useSolviTickets (paginado, keyset).
   - Scroll infinito: carga de a 300 al llegar al fondo.
   - Búsqueda global: el término se resuelve en backend sobre TODA
     la tabla (+6000 registros), no solo los cargados.
   Estilos en solvi.css (calcan tasks.css, namespace solvi-*).
   ============================================================ */

type ColKey =
  | 'seq' | 'id' | 'titulo' | 'estado' | 'solicitante' | 'resolutor'
  | 'categoria' | 'subcategoria' | 'ans' | 'fuente'
  | 'apertura' | 'maxima' | 'cierre';

type ColDef = { key: ColKey; label: string; width: number; min: number; align?: 'center' };

const COLUMNS: ColDef[] = [
  { key: 'seq',          label: '#',            width: 48,  min: 40,  align: 'center' },
  { key: 'id',           label: 'ID',           width: 90,  min: 70 },
  { key: 'titulo',       label: 'Título',       width: 340, min: 160 },
  { key: 'estado',       label: 'Estado',       width: 130, min: 90,  align: 'center' },
  { key: 'solicitante',  label: 'Solicitante',  width: 170, min: 110 },
  { key: 'resolutor',    label: 'Resolutor',    width: 170, min: 110 },
  { key: 'categoria',    label: 'Categoría',    width: 150, min: 100 },
  { key: 'subcategoria', label: 'Subcategoría', width: 150, min: 100 },
  { key: 'ans',          label: 'ANS',          width: 90,  min: 60 },
  { key: 'fuente',       label: 'Fuente',       width: 120, min: 80 },
  { key: 'apertura',     label: 'Apertura',     width: 130, min: 100 },
  { key: 'maxima',       label: 'F. Máxima',    width: 130, min: 100 },
  { key: 'cierre',       label: 'Cierre real',  width: 130, min: 100 },
];

// Columnas congeladas a la izquierda (como en TasksTable)
const FROZEN: ColKey[] = ['seq', 'id', 'titulo'];

function fmtDate(s: string | null | undefined) {
  if (!s) return '\u2014';
  const d = new Date(/Z|[+-]\d{2}:\d{2}$/.test(s) ? s : `${s}Z`);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** Color del estado (string libre de la tabla externa). Devuelve hex para
 *  poder concatenar alfa (color+'18' / color+'40') sin romper el estilo. */
function estadoColor(estado: string | null, accent: string): string {
  const e = (estado ?? '').toLowerCase();
  if (e.includes('cerrado') || e.includes('resuelto')) return '#00b894';
  if (e.includes('proceso') || e.includes('progreso')) return '#fdcb6e';
  if (e.includes('abierto') || e.includes('nuevo'))     return accent;
  return '#7a7a88';
}

export function SolviTicketsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { ticketId } = useParams();
  const deepLinkId =
    ticketId != null && ticketId !== '' && Number.isFinite(Number(ticketId))
      ? Number(ticketId)
      : null;

  const { data: teams = [] } = useBoardTeams(config.DEFAULT_BOARD_ID);
  const solviTeam = teams.find((t) => t.Board_Team_Integration_Key === 'solvi') ?? null;
  const accent = solviTeam?.Board_Team_Color ?? '#00b894';

  const openTicket = (id: number) =>
    navigate(`/integracion/solvi/tickets/${id}`, { state: { backgroundLocation: location } });

  // ── Búsqueda con debounce: q es lo que se tipea, search es lo que va al back ──
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setSearch(q.trim()), 350);
    return () => clearTimeout(id);
  }, [q]);

  const {
    data, isLoading, isError, error: fetchError,
    fetchNextPage, hasNextPage, isFetchingNextPage,
  } = useSolviTickets(search);

  // Aplanar las páginas en una sola lista.
  const tickets: SolviTicket[] = useMemo(
    () => (data?.pages ?? []).flatMap((p) => p.items),
    [data],
  );

  // ── Anchos de columna redimensionables ──
  const [widths, setWidths] = useState<Record<ColKey, number>>(
    () => Object.fromEntries(COLUMNS.map((c) => [c.key, c.width])) as Record<ColKey, number>,
  );
  const resizing = useRef<{ key: ColKey; startX: number; startW: number } | null>(null);

  const onResizeMove = useCallback((e: MouseEvent) => {
    const r = resizing.current;
    if (!r) return;
    const col = COLUMNS.find((c) => c.key === r.key)!;
    const next = Math.max(col.min, r.startW + (e.clientX - r.startX));
    setWidths((w) => ({ ...w, [r.key]: next }));
  }, []);
  const onResizeEnd = useCallback(() => {
    resizing.current = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    window.removeEventListener('mousemove', onResizeMove);
    window.removeEventListener('mouseup', onResizeEnd);
  }, [onResizeMove]);
  const onResizeStart = useCallback((key: ColKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    resizing.current = { key, startX: e.clientX, startW: widths[key] };
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', onResizeMove);
    window.addEventListener('mouseup', onResizeEnd);
  }, [widths, onResizeMove, onResizeEnd]);

  // ── Offset izquierdo acumulado para las columnas congeladas ──
  const frozenLeft = useMemo(() => {
    const map: Partial<Record<ColKey, number>> = {};
    let acc = 0;
    for (const key of FROZEN) { map[key] = acc; acc += widths[key]; }
    return map;
  }, [widths]);

  // ── Scroll infinito + detección de scroll horizontal ──
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setScrolled(el.scrollLeft > 0);
    if (!hasNextPage || isFetchingNextPage) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 400) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const totalWidth = COLUMNS.reduce((sum, c) => sum + widths[c.key], 0);

  // Clases + estilo (left dinámico) para celdas congeladas
  function freezeProps(key: ColKey, base: 'th' | 'td') {
    if (!FROZEN.includes(key)) return { className: '', style: undefined as React.CSSProperties | undefined };
    const isEdge = key === FROZEN[FROZEN.length - 1];
    const cls = `solvi-${base}--freeze${isEdge ? ` solvi-${base}--freeze-edge` : ''}`;
    return { className: cls, style: { left: frozenLeft[key] } as React.CSSProperties };
  }

  function cellValue(t: SolviTicket, key: ColKey, idx: number): React.ReactNode {
    switch (key) {
      case 'seq':          return idx + 1;
      case 'id':           return <span className="solvi-ticket-id">{t.ticket_solvi_id}</span>;
      case 'titulo':       return <span className="solvi-title">{t.ticket_solvi_titulo || '(Sin título)'}</span>;
      case 'estado': {
        if (!t.ticket_solvi_estado) return <span className="solvi-empty-cell">{'\u2014'}</span>;
        const c = estadoColor(t.ticket_solvi_estado, accent);
        return <span className="solvi-status" style={{ color: c, background: c + '18', borderColor: c + '40' }}>{t.ticket_solvi_estado}</span>;
      }
      case 'solicitante':  return t.ticket_solvi_solicitante ? <span className="solvi-cell-text">{t.ticket_solvi_solicitante}</span> : <span className="solvi-empty-cell">{'\u2014'}</span>;
      case 'resolutor':    return t.ticket_solvi_resolutor ? <span className="solvi-cell-text">{t.ticket_solvi_resolutor}</span> : <span className="solvi-empty-cell">{'\u2014'}</span>;
      case 'categoria':    return t.ticket_solvi_categoria ? <span className="solvi-cell-text">{t.ticket_solvi_categoria}</span> : <span className="solvi-empty-cell">{'\u2014'}</span>;
      case 'subcategoria': return t.ticket_solvi_subcategoria ? <span className="solvi-cell-text">{t.ticket_solvi_subcategoria}</span> : <span className="solvi-empty-cell">{'\u2014'}</span>;
      case 'ans':          return t.ticket_solvi_ans ? <span className="solvi-cell-text">{t.ticket_solvi_ans}</span> : <span className="solvi-empty-cell">{'\u2014'}</span>;
      case 'fuente':       return t.ticket_solvi_fuente ? <span className="solvi-cell-text">{t.ticket_solvi_fuente}</span> : <span className="solvi-empty-cell">{'\u2014'}</span>;
      case 'apertura':     return <span className="solvi-num">{fmtDate(t.ticket_solvi_fechaapertura)}</span>;
      case 'maxima':       return <span className="solvi-num">{fmtDate(t.ticket_solvi_fechamaxima)}</span>;
      case 'cierre':       return t.FechaCierreReal
        ? <span className="solvi-num">{fmtDate(t.FechaCierreReal)}</span>
        : <span className="solvi-open-pill">Abierto</span>;
    }
  }

  if (isLoading) return <SolviTicketsSkeleton accent={accent} />;

  return (
    <div className="solvi-page" style={{ ['--solvi-accent' as string]: accent }}>
      {/* Toolbar */}
      <div className="solvi-toolbar">
        <div className="solvi-toolbar__left">
          <LayoutList size={16} className="solvi-toolbar__icon" />
          <h1 className="solvi-toolbar__title">Tickets SOLVI</h1>
          <span className="solvi-toolbar__badge">
            {tickets.length}{hasNextPage ? '+' : ''} {search ? 'resultados' : 'cargados'}
          </span>
        </div>
        <div className="solvi-toolbar__right">
          <div className="solvi-search">
            <Search size={12} className="solvi-search__icon" />
            <input
              className="solvi-search__input"
              placeholder={'Buscar en todos los tickets\u2026'}
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q && <button className="solvi-search__clear" onClick={() => setQ('')}>{'\u2715'}</button>}
          </div>
        </div>
      </div>

      {isError && (
        <div className="solvi-error">
          No se pudieron cargar los tickets: {fetchError instanceof Error ? fetchError.message : 'error desconocido'}
        </div>
      )}

      {/* Tabla con scroll horizontal + vertical (infinito) */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className={`solvi-table-wrap${scrolled ? ' solvi-table-wrap--scrolled' : ''}`}
      >
        <table className="solvi-table" style={{ width: totalWidth }}>
          <colgroup>
            {COLUMNS.map((c) => <col key={c.key} style={{ width: widths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const fp = freezeProps(c.key, 'th');
                return (
                  <th
                    key={c.key}
                    className={`solvi-th${c.align === 'center' ? ' solvi-th--c' : ''} ${fp.className}`}
                    style={{ ...fp.style, position: fp.className ? 'sticky' : undefined }}
                  >
                    {c.label}
                    <span className="solvi-resizer" onMouseDown={(e) => onResizeStart(c.key, e)} />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="solvi-td solvi-td--empty">
                  {search ? `Sin resultados para "${search}"` : 'No hay tickets SOLVI.'}
                </td>
              </tr>
            ) : tickets.map((t, i) => (
             <tr key={t.ticket_solvi_id} className="solvi-tr" onClick={() => openTicket(t.ticket_solvi_id)}>
                {COLUMNS.map((c) => {
                  const fp = freezeProps(c.key, 'td');
                  return (
                    <td
                      key={c.key}
                      className={`solvi-td${c.align === 'center' ? ' solvi-td--c' : ''}${c.key === 'seq' ? ' solvi-td--seq' : ''} ${fp.className}`}
                      style={fp.style}
                    >
                      {cellValue(t, c.key, i)}
                    </td>
                  );
                })}
              </tr>
            ))}
            {isFetchingNextPage && (
              <tr>
                <td colSpan={COLUMNS.length} className="solvi-td solvi-td--loadmore">Cargando más{'\u2026'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

            {deepLinkId != null && (
        <SolviTicketModal
          ticketId={deepLinkId}
          onClose={() => navigate('/integracion/solvi/tickets', { replace: true })}
        />
      )}
    </div>
  );
}

/* ─── Skeleton (shimmer + stagger, mismo patrón que TasksTableSkeleton) ─── */

const SKEL_ROWS = Math.max(12, Math.ceil((window.innerHeight - 200) / 44));
const SKEL_DOT  = <div className="solvi-skel solvi-skel--dot" />;
const TITLE_W   = ['62%', '78%', '55%', '70%', '84%', '60%', '73%', '66%'];

function SolviTicketsSkeleton({ accent }: { accent: string }) {
  const widths = Object.fromEntries(COLUMNS.map((c) => [c.key, c.width])) as Record<ColKey, number>;
  const totalWidth = COLUMNS.reduce((sum, c) => sum + widths[c.key], 0);

  return (
    <div className="solvi-page" style={{ ['--solvi-accent' as string]: accent }}>
      {/* Toolbar */}
      <div className="solvi-toolbar">
        <div className="solvi-toolbar__left">
          <div className="solvi-skel" style={{ width: 16, height: 16, borderRadius: 3 }} />
          <div className="solvi-skel" style={{ width: 130, height: 17 }} />
          <div className="solvi-skel" style={{ width: 84, height: 20, borderRadius: 10 }} />
        </div>
        <div className="solvi-toolbar__right">
          <div className="solvi-skel" style={{ width: 260, height: 30, borderRadius: 6 }} />
        </div>
      </div>

      {/* Tabla */}
      <div className="solvi-table-wrap">
        <table className="solvi-table" style={{ width: totalWidth }}>
          <colgroup>
            {COLUMNS.map((c) => <col key={c.key} style={{ width: widths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={`solvi-th${c.align === 'center' ? ' solvi-th--c' : ''}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: SKEL_ROWS }, (_, i) => (
              <tr key={i} className="solvi-tr solvi-tr--skel" style={{ ['--skel-delay' as string]: `${i * 0.08}s` }}>
                {/* # */}
                <td className="solvi-td solvi-td--seq">
                  <div className="solvi-skel" style={{ width: 14, height: 11, margin: '0 auto' }} />
                </td>
                {/* ID */}
                <td className="solvi-td">
                  <div className="solvi-skel" style={{ width: 64, height: 13 }} />
                </td>
                {/* Título */}
                <td className="solvi-td">
                  <div className="solvi-skel" style={{ width: TITLE_W[i % TITLE_W.length], height: 13 }} />
                </td>
                {/* Estado */}
                <td className="solvi-td">
                  <div className="solvi-skel" style={{ width: 84, height: 20, borderRadius: 3 }} />
                </td>
                {/* Solicitante */}
                <td className="solvi-td">
                  <div className="solvi-skel" style={{ width: 110, height: 12 }} />
                </td>
                {/* Resolutor */}
                <td className="solvi-td">
                  {i % 4 !== 1
                    ? <div className="solvi-skel" style={{ width: 100, height: 12 }} />
                    : SKEL_DOT}
                </td>
                {/* Categoría */}
                <td className="solvi-td">
                  <div className="solvi-skel" style={{ width: 90, height: 12 }} />
                </td>
                {/* Subcategoría */}
                <td className="solvi-td">
                  {i % 3 !== 0
                    ? <div className="solvi-skel" style={{ width: 88, height: 12 }} />
                    : SKEL_DOT}
                </td>
                {/* ANS */}
                <td className="solvi-td">
                  <div className="solvi-skel" style={{ width: 40, height: 12 }} />
                </td>
                {/* Fuente */}
                <td className="solvi-td">
                  <div className="solvi-skel" style={{ width: 60, height: 12 }} />
                </td>
                {/* Apertura */}
                <td className="solvi-td">
                  <div className="solvi-skel" style={{ width: 72, height: 11 }} />
                </td>
                {/* F. Máxima */}
                <td className="solvi-td">
                  <div className="solvi-skel" style={{ width: 72, height: 11 }} />
                </td>
                {/* Cierre real */}
                <td className="solvi-td">
                  {i % 2 === 0
                    ? <div className="solvi-skel" style={{ width: 60, height: 20, borderRadius: 3 }} />
                    : <div className="solvi-skel" style={{ width: 72, height: 11 }} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}