// src/features/requests/components/BoardSearch.tsx
import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import type { BoardData, Request } from '../types';
import { useSearchStore } from '@/store/searchStore';
import { useSearchRequests } from '../hooks/useRequests';
/* ============================================================
   Helpers
   ============================================================ */
function normalize(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const nText = normalize(text);
  const nQuery = normalize(query.trim());
  const idx = nText.indexOf(nQuery);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{
        background: 'rgba(0,200,255,0.22)',
        color: 'var(--accent)',
        padding: 0,
        borderRadius: 2,
        fontWeight: 700,
      }}>
        {text.slice(idx, idx + nQuery.length)}
      </mark>
      {text.slice(idx + nQuery.length)}
    </>
  );
}

const PRIORITY_COLOR: Record<Request['prioridad'], string> = {
  baja:    'var(--txt-muted)',
  media:   'var(--info)',
  alta:    'var(--warn)',
  critica: 'var(--danger)',
};

const RECENT_KEY = 'prisma-search-recent-v1';
const MAX_RECENT = 5;

function loadRecent(equipo: string): string[] {
  try {
    const raw = localStorage.getItem(`${RECENT_KEY}-${equipo}`);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveRecent(equipo: string, items: string[]) {
  try {
    localStorage.setItem(`${RECENT_KEY}-${equipo}`, JSON.stringify(items.slice(0, MAX_RECENT)));
  } catch { /* noop */ }
}

/* ============================================================
   BoardSearch
   ============================================================ */
export function BoardSearch({
  board,
  equipo,
  onSelectTicket,
}: {
  board:          BoardData;
  equipo:         string;
  onSelectTicket: (id: string) => void;
}) {
  const [open,     setOpen]     = useState(false);
  const query     = useSearchStore((s) => s.query);
  const setQuery  = useSearchStore((s) => s.setQuery);
  const [hoverIdx, setHoverIdx] = useState(0);
  const [pos,      setPos]      = useState({ top: 0, left: 0, width: 360 });
  const [recent,   setRecent]   = useState<string[]>(() => loadRecent(equipo));

  const wrapRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef  = useRef<HTMLDivElement>(null);

  // Recarga recientes cuando cambia el equipo + limpia query previa
  useEffect(() => {
    setRecent(loadRecent(equipo));
    useSearchStore.getState().clear();
  }, [equipo]);

  // Al desmontar (salir del board), limpia el query para no atenuar tarjetas en otras vistas
  useEffect(() => {
    return () => { useSearchStore.getState().clear(); };
  }, []);

  // Aplana board → lista plana para búsqueda
  const allRequests = useMemo(() => Object.values(board).flat(), [board]);

  // Filtra resultados
const { data: searchData = [], isFetching: searchLoading } = useSearchRequests(equipo, query);

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    const nq = normalize(q);
    return searchData.map((req) => {
      const idMatch = normalize(req.id).includes(nq);
      return { req, matchType: (idMatch ? 'id' : 'title') as 'id' | 'title' };
    });
  }, [searchData, query]);

  // Tickets recientes (resueltos contra board actual)
  const recentRequests = useMemo(() => {
    if (query.trim()) return [];
    return recent
      .map((id) => allRequests.find((r) => r.id === id))
      .filter((r): r is Request => !!r)
      .slice(0, MAX_RECENT);
  }, [recent, allRequests, query]);

  /* ── Atajos de teclado globales ── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 30);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  /* ── Reposicionar dropdown ── */
  useEffect(() => {
    if (!open) return;
    function calc() {
      if (!wrapRef.current) return;
      const r = wrapRef.current.getBoundingClientRect();
      const width = Math.max(360, r.width);
      const left  = Math.min(r.left, window.innerWidth - width - 12);
      setPos({ top: r.bottom + 6, left: Math.max(8, left), width });
    }
    calc();
    window.addEventListener('resize', calc);
    window.addEventListener('scroll', calc, true);
    return () => {
      window.removeEventListener('resize', calc);
      window.removeEventListener('scroll', calc, true);
    };
  }, [open]);

  /* ── Click fuera cierra ── */
  useEffect(() => {
    if (!open) return;
    function onOut(e: MouseEvent) {
      if (
        wrapRef.current?.contains(e.target as Node) ||
        dropRef.current?.contains(e.target as Node)
      ) return;
      handleClose();
    }
    document.addEventListener('mousedown', onOut);
    return () => document.removeEventListener('mousedown', onOut);
  }, [open]);

  useEffect(() => { setHoverIdx(0); }, [results.length, query]);

  function handleClose() {
    setOpen(false);
    setQuery('');
  }

  function handleSelect(id: string) {
    const next = [id, ...recent.filter((r) => r !== id)].slice(0, MAX_RECENT);
    setRecent(next);
    saveRecent(equipo, next);
    onSelectTicket(id);
    handleClose();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const list = results.length ? results.map((r) => r.req) : recentRequests;
    if (e.key === 'Escape') {
      e.preventDefault();
      handleClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHoverIdx((i) => Math.min(i + 1, list.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHoverIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && list[hoverIdx]) {
      e.preventDefault();
      handleSelect(list[hoverIdx].id);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
      {!open ? (
        <button
          onClick={() => {
            setOpen(true);
            setTimeout(() => inputRef.current?.focus(), 30);
          }}
          title="Buscar tickets (Ctrl+K)"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            gap: 5, height: 26, padding: '0 9px',
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 6,
            color: 'var(--txt-muted)',
            cursor: 'pointer',
            fontSize: 11, fontFamily: 'var(--font-body)', fontWeight: 500,
            transition: 'color 0.15s, border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--accent)';
            e.currentTarget.style.borderColor = 'rgba(0,200,255,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--txt-muted)';
            e.currentTarget.style.borderColor = 'var(--border-subtle)';
          }}
        >
          <Search size={13} strokeWidth={2} />
        </button>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 26, padding: '0 8px', width: 300,
          background: 'var(--bg-surface)',
          border: '1px solid var(--accent)',
          borderRadius: 6,
          boxShadow: '0 0 0 3px rgba(0,200,255,0.1)',
          animation: 'search-expand 0.18s ease-out',
        }}>
          <Search size={12} strokeWidth={2} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar por título o ID…"
            style={{
              flex: 1, minWidth: 0,
              background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--txt)',
              fontSize: 12, fontFamily: 'var(--font-body)',
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              title="Limpiar"
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--txt-muted)', padding: 2, flexShrink: 0, borderRadius: 3,
              }}
            >
              <X size={11} />
            </button>
          )}
          <kbd style={{
            fontSize: 9, color: 'var(--txt-muted)',
            background: 'var(--bg-panel)', border: '1px solid var(--border-subtle)',
            padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace',
            flexShrink: 0,
          }}>ESC</kbd>
          <style>{`
            @keyframes search-expand {
              from { width: 32px; opacity: 0.6; }
              to { width: 300px; opacity: 1; }
            }
          `}</style>
        </div>
      )}

      {open && createPortal(
        <div
          ref={dropRef}
          style={{
            position: 'fixed',
            top:   pos.top,
            left:  pos.left,
            width: pos.width,
            background: 'var(--bg-panel)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            maxHeight: 420,
            overflowY: 'auto',
            zIndex: 9999,
            fontFamily: 'var(--font-body)',
          }}
        >
          {/* Sin query → muestra recientes */}
          {!query.trim() && recentRequests.length > 0 && (
            <>
              <div style={{
                padding: '8px 12px',
                fontSize: 9, color: 'var(--txt-muted)',
                letterSpacing: 0.5, textTransform: 'uppercase',
                borderBottom: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-display)',
              }}>
                Recientes
              </div>
              {recentRequests.map((req, i) => (
                <ResultRow
                  key={req.id}
                  request={req}
                  query=""
                  isHovered={i === hoverIdx}
                  onHover={() => setHoverIdx(i)}
                  onSelect={() => handleSelect(req.id)}
                />
              ))}
            </>
          )}

          {/* Sin query y sin recientes → mensaje guía */}
          {!query.trim() && recentRequests.length === 0 && (
            <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--txt-muted)', fontSize: 11 }}>
              Empieza a escribir para buscar
              <div style={{ marginTop: 6, fontSize: 10, opacity: 0.7 }}>
                Por título o ID del ticket
              </div>
            </div>
          )}

          {/* Con query → resultados */}
{query.trim() && results.length === 0 && (
            <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--txt-muted)', fontSize: 11 }}>
              {searchLoading
                ? 'Buscando…'
                : <>Sin resultados para <span style={{ color: 'var(--txt)' }}>"{query}"</span></>}
            </div>
          )}
          
          {query.trim() && results.length > 0 && (
            <>
              <div style={{
                padding: '8px 12px',
                fontSize: 9, color: 'var(--txt-muted)',
                letterSpacing: 0.5, textTransform: 'uppercase',
                borderBottom: '1px solid var(--border-subtle)',
                fontFamily: 'var(--font-display)',
              }}>
                {results.length} resultado{results.length !== 1 ? 's' : ''}
              </div>
              {results.map((r, i) => (
                <ResultRow
                  key={r.req.id}
                  request={r.req}
                  query={query}
                  isHovered={i === hoverIdx}
                  onHover={() => setHoverIdx(i)}
                  onSelect={() => handleSelect(r.req.id)}
                />
              ))}
            </>
          )}
        </div>,
        document.getElementById('portal-root') ?? document.body,
      )}
    </div>
  );
}

/* ============================================================
   ResultRow
   ============================================================ */
function ResultRow({
  request, query, isHovered, onHover, onSelect,
}: {
  request:   Request;
  query:     string;
  isHovered: boolean;
  onHover:   () => void;
  onSelect:  () => void;
}) {
  const isCerrada = !!request.fechaCierre;
  return (
    <div
      onMouseEnter={onHover}
      onMouseDown={(e) => { e.preventDefault(); onSelect(); }}
      style={{
        padding: '8px 12px',
        cursor: 'pointer',
        background: isHovered ? 'rgba(0,200,255,0.08)' : 'transparent',
        borderLeft: isHovered ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.1s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3, flexWrap: 'wrap' }}>
        <span style={{
          fontFamily: 'monospace', fontSize: 9,
          color: 'var(--txt-muted)', letterSpacing: 0.3,
        }}>
          <HighlightMatch text={request.id} query={query} />
        </span>
        <span style={{
          fontSize: 9, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase',
          padding: '1px 5px', borderRadius: 3,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-subtle)',
          color: 'var(--txt-muted)',
        }}>
          {request.columna.replace(/_/g, ' ')}
        </span>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: 0.3, textTransform: 'uppercase',
          padding: '1px 5px', borderRadius: 3,
          background: `${PRIORITY_COLOR[request.prioridad]}15`,
          border: `1px solid ${PRIORITY_COLOR[request.prioridad]}35`,
          color: PRIORITY_COLOR[request.prioridad],
        }}>
          {request.prioridad}
        </span>
        {isCerrada && (
          <span style={{
            fontSize: 9, fontWeight: 700,
            padding: '1px 5px', borderRadius: 3,
            background: 'rgba(0,229,160,0.1)',
            border: '1px solid rgba(0,229,160,0.3)',
            color: 'var(--success)',
          }}>
            ✓ Cerrada
          </span>
        )}
      </div>
      <div style={{
        fontSize: 12, color: 'var(--txt)', fontWeight: 500,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        <HighlightMatch text={request.titulo} query={query} />
      </div>
    </div>
  );
}