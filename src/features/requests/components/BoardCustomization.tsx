import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCustomizationStore } from '@/store/customizationStore';

/* ============================================================
   Tipos
   ============================================================ */
export type HoursColumn = { slug: string; name: string; color: string };

type PanelTab = 'horas' | 'contadores' | 'columnas';

/* ============================================================
   Panel principal
   ============================================================ */
export function BoardCustomizationPanel({
  anchor,
  boardId,
  columns,
}: {
  anchor:  { top: number; left: number };
  boardId: string;
  columns: HoursColumn[];
}) {
  const {
    isPanelOpen,
    closePanel,
    getHoursColumns,
    toggleHoursColumn,
    resetHoursColumns,
    getEstimatedHoursColumns,
    toggleEstimatedHoursColumn,
    resetEstimatedHoursColumns,
getConsumedHoursColumns,
    toggleConsumedHoursColumn,
    resetConsumedHoursColumns,
    getCollapsedColumns,
    toggleCollapsedColumn,
    resetCollapsedColumns,
  } = useCustomizationStore();
    const ref = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<PanelTab>('horas');

  useEffect(() => {
    if (!isPanelOpen) return;
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') closePanel(); }
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        const trigger = document.querySelector('.cp-trigger');
        if (trigger && trigger.contains(e.target as Node)) return;
        closePanel();
      }
    }
    document.addEventListener('keydown', handleKey);
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('keydown', handleKey);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isPanelOpen, closePanel]);

  if (!isPanelOpen) return null;

  const availableSlugs = columns.map((c) => c.slug);
  const countedHours   = new Set(getHoursColumns(boardId, availableSlugs));
  const estimatedSet   = new Set(getEstimatedHoursColumns(boardId, availableSlugs));
const consumedSet     = new Set(getConsumedHoursColumns(boardId, availableSlugs));
  const collapsedSet    = new Set(getCollapsedColumns(boardId, availableSlugs));

  const TABS: { id: PanelTab; label: string }[] = [
    { id: 'horas',      label: 'Suma de horas' },
    { id: 'contadores', label: 'Contadores' },
    { id: 'columnas',   label: 'Columnas' },
  ];

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    flex:          1,
    padding:       '7px 8px',
    fontSize:      11,
    fontFamily:    'var(--font-display)',
    letterSpacing: 0.3,
    background:    'transparent',
    border:        'none',
    borderBottom:  active ? '2px solid var(--accent)' : '2px solid transparent',
    color:         active ? 'var(--accent)' : 'var(--txt-muted)',
    cursor:        'pointer',
    transition:    'color 0.15s, border-color 0.15s',
    whiteSpace:    'nowrap',
  });

  return createPortal(
    <div
      className="cp-panel"
      ref={ref}
      role="dialog"
      aria-label="Personalización del board"
      style={{ top: anchor.top, left: anchor.left }}
    >
      <div className="cp-panel__header">
        <span className="cp-panel__title">Personalización</span>
        <button className="cp-panel__close" onClick={closePanel}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* ── Navegación entre secciones ── */}
      <div
        role="tablist"
        style={{
          display:      'flex',
          alignItems:   'stretch',
          borderBottom: '1px solid var(--border-subtle)',
          padding:      '0 4px',
        }}
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            style={tabBtnStyle(tab === t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="cp-panel__body">
        {/* ══════════════════════════════════════════════
            Tab 1 — Columnas que suman horas (MemberHoursBar)
            ══════════════════════════════════════════════ */}
        {tab === 'horas' && (
          <div className="cp-section">
            <p className="cp-section__label">
              Columnas que suman horas
              <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 4 }}>por equipo</span>
            </p>
            <p style={{ fontSize: 11, color: 'var(--txt-dim)', margin: '0 0 12px', lineHeight: 1.4 }}>
              Las horas de cada persona se suman solo desde las columnas activas.
              Por defecto: <b>To Do</b> y <b>En progreso</b>.
            </p>

            {columns.length === 0 && (
              <p style={{ fontSize: 11, color: 'var(--txt-dim)', fontStyle: 'italic' }}>
                Cargando columnas…
              </p>
            )}

            {columns.map((col) => {
              const on = countedHours.has(col.slug);
              return (
                <div key={col.slug} className="cp-toggle-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%',
                      background: col.color, flexShrink: 0,
                    }} />
                    <span
                      className="cp-toggle-row__label"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {col.name}
                    </span>
                  </span>
                  <button
                    className={`cp-toggle ${on ? 'cp-toggle--on' : ''}`}
                    onClick={() => toggleHoursColumn(boardId, col.slug)}
                    style={{ marginLeft: 'auto' }}
                  >
                    <span className="cp-toggle__thumb" />
                  </button>
                </div>
              );
            })}

            <button
              className="cp-panel__reset-btn"
              onClick={() => resetHoursColumns(boardId)}
              style={{ marginTop: 12, width: '100%' }}
            >
              Restablecer (To Do + En progreso)
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            Tab 2 — Contadores en el header de columna
            ══════════════════════════════════════════════ */}
        {tab === 'contadores' && (
          <div className="cp-section">
            <p className="cp-section__label">Contadores en el header</p>
            <p style={{ fontSize: 11, color: 'var(--txt-dim)', margin: '0 0 12px', lineHeight: 1.4 }}>
              Elige qué columnas muestran el total de horas estimadas <b>⏱</b> y
              las consumidas <b>🔥</b> en su encabezado.
            </p>

            {columns.length === 0 && (
              <p style={{ fontSize: 11, color: 'var(--txt-dim)', fontStyle: 'italic' }}>
                Cargando columnas…
              </p>
            )}

            {columns.length > 0 && (
              <>
                {/* Encabezado de las dos columnas de toggles */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '0 2px 6px',
                    fontSize: 10,
                    color: 'var(--txt-dim)',
                    letterSpacing: 0.3,
                  }}
                >
                  <span style={{ flex: 1 }} />
                  <span style={{ width: 44, textAlign: 'center' }} title="Horas estimadas">⏱</span>
                  <span style={{ width: 44, textAlign: 'center' }} title="Horas consumidas">🔥</span>
                </div>

                {columns.map((col) => {
                  const estOn = estimatedSet.has(col.slug);
                  const conOn = consumedSet.has(col.slug);
                  return (
                    <div key={col.slug} className="cp-toggle-row">
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                        <span style={{
                          width: 9, height: 9, borderRadius: '50%',
                          background: col.color, flexShrink: 0,
                        }} />
                        <span
                          className="cp-toggle-row__label"
                          style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        >
                          {col.name}
                        </span>
                      </span>

                      {/* Toggle ⏱ estimadas */}
                      <span style={{ width: 44, display: 'flex', justifyContent: 'center' }}>
                        <button
                          className={`cp-toggle ${estOn ? 'cp-toggle--on' : ''}`}
                          onClick={() => toggleEstimatedHoursColumn(boardId, col.slug)}
                          title={`Horas estimadas en ${col.name}`}
                        >
                          <span className="cp-toggle__thumb" />
                        </button>
                      </span>

                      {/* Toggle 🔥 consumidas */}
                      <span style={{ width: 44, display: 'flex', justifyContent: 'center' }}>
                        <button
                          className={`cp-toggle ${conOn ? 'cp-toggle--on' : ''}`}
                          onClick={() => toggleConsumedHoursColumn(boardId, col.slug)}
                          title={`Horas consumidas en ${col.name}`}
                        >
                          <span className="cp-toggle__thumb" />
                        </button>
                      </span>
                    </div>
                  );
                })}

                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button
                    className="cp-panel__reset-btn"
                    onClick={() => resetEstimatedHoursColumns(boardId)}
                    style={{ flex: 1 }}
                  >
                    Reset ⏱
                  </button>
                  <button
                    className="cp-panel__reset-btn"
                    onClick={() => resetConsumedHoursColumns(boardId)}
                    style={{ flex: 1 }}
                  >
                    Reset 🔥
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        {/* ══════════════════════════════════════════════
            Tab 3 — Columnas (colapsar)
            ══════════════════════════════════════════════ */}
        {tab === 'columnas' && (
          <div className="cp-section">
            <p className="cp-section__label">Columnas colapsadas</p>
            <p style={{ fontSize: 11, color: 'var(--txt-dim)', margin: '0 0 12px', lineHeight: 1.4 }}>
              Las columnas colapsadas se muestran como una barra delgada.
              Haz clic en la barra para expandirla de nuevo.
            </p>

            {columns.length === 0 && (
              <p style={{ fontSize: 11, color: 'var(--txt-dim)', fontStyle: 'italic' }}>
                Cargando columnas…
              </p>
            )}

            {columns.map((col) => {
              const on = collapsedSet.has(col.slug);
              return (
                <div key={col.slug} className="cp-toggle-row">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{
                      width: 9, height: 9, borderRadius: '50%',
                      background: col.color, flexShrink: 0,
                    }} />
                    <span
                      className="cp-toggle-row__label"
                      style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    >
                      {col.name}
                    </span>
                  </span>
                  <button
                    className={`cp-toggle ${on ? 'cp-toggle--on' : ''}`}
                    onClick={() => toggleCollapsedColumn(boardId, col.slug)}
                    style={{ marginLeft: 'auto' }}
                  >
                    <span className="cp-toggle__thumb" />
                  </button>
                </div>
              );
            })}

            <button
              className="cp-panel__reset-btn"
              onClick={() => resetCollapsedColumns(boardId)}
              style={{ marginTop: 12, width: '100%' }}
            >
              Expandir todas
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ============================================================
   Trigger
   ============================================================ */
export function BoardCustomizationTrigger({
  boardId,
  columns,
}: {
  boardId: string;
  columns: HoursColumn[];
}) {
  const { isPanelOpen, openPanel, closePanel } = useCustomizationStore();
  const btnRef = useRef<HTMLButtonElement>(null);
  const [anchor, setAnchor] = useState({ top: 108, left: 280 });

  function handleClick() {
    if (isPanelOpen) {
      closePanel();
    } else {
      if (btnRef.current) {
        const rect = btnRef.current.getBoundingClientRect();
        setAnchor({ top: rect.bottom + 8, left: rect.left });
      }
      openPanel();
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        className={`filter-trigger cp-trigger ${isPanelOpen ? 'filter-trigger--active' : ''}`}
        onClick={handleClick}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M10.01 3.99l-1.06 1.06M3.99 10.01l-1.06 1.06"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Personalizar
      </button>
      <BoardCustomizationPanel anchor={anchor} boardId={boardId} columns={columns} />
    </>
  );
}