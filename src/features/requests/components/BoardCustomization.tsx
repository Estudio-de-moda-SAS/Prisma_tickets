import { useRef, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCustomizationStore } from '@/store/customizationStore';

/* ============================================================
   Tipos
   ============================================================ */
export type HoursColumn = { slug: string; name: string; color: string };

/* ============================================================
   Panel principal
   Por ahora solo expone: ¿qué columnas suman horas en la barra
   de miembros? (default: To Do + En progreso)
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
  } = useCustomizationStore();
  const ref = useRef<HTMLDivElement>(null);

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
  const counted        = new Set(getHoursColumns(boardId, availableSlugs));

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

      <div className="cp-panel__body">
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
            const on = counted.has(col.slug);
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
        </div>
      </div>

      <div className="cp-panel__footer">
        <button className="cp-panel__reset-btn" onClick={() => resetHoursColumns(boardId)}>
          Restablecer (To Do + En progreso)
        </button>
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