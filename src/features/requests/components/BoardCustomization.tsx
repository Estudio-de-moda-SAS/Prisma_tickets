import { useRef, useEffect, useState, useCallback } from 'react';
import {
  useCustomizationStore,
  BOARD_THEMES,
  COLUMN_DEFAULTS,
  PRIORITY_DEFAULTS,
  getColumnConfig,
  type BoardTheme,
  type CardDensity,
  type CardStyle,
  type PriorityColors,
} from '@/store/customizationStore';
import { useBoardStore } from '@/store/boardStore';
import { KANBAN_COLUMNAS, COLUMNAS_BOARD } from '@/features/requests/types';
import type { KanbanColumna } from '@/features/requests/types';

/* ============================================================
   Utilidades de color  (sin cambios)
   ============================================================ */
function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, max === 0 ? 0 : d / max, max];
}

function hsvToHex(h: number, s: number, v: number): string {
  h = h / 360;
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r = 0, g = 0, b = 0;
  switch (i % 6) {
    case 0: r = v; g = t; b = p; break;
    case 1: r = q; g = v; b = p; break;
    case 2: r = p; g = v; b = t; break;
    case 3: r = p; g = q; b = v; break;
    case 4: r = t; g = p; b = v; break;
    case 5: r = v; g = p; b = q; break;
  }
  return '#' + [r, g, b].map((x) =>
    Math.round(x * 255).toString(16).padStart(2, '0')
  ).join('');
}

function isValidHex(hex: string) {
  return /^#[0-9a-fA-F]{6}$/.test(hex);
}

/* ============================================================
   ColorPicker  (sin cambios)
   ============================================================ */
type ColorPickerProps = { value: string; onChange: (hex: string) => void; onClose: () => void };

function ColorPicker({ value, onChange, onClose }: ColorPickerProps) {
  const safeHex         = isValidHex(value) ? value : '#00c8ff';
  const [h, s, v]       = hexToHsv(safeHex);
  const [hue, setHue]   = useState(h);
  const [sat, setSat]   = useState(s);
  const [val, setVal]   = useState(v);
  const [hex, setHex]   = useState(safeHex);
  const [hexInput, setHexInput] = useState(safeHex);

  const gradRef  = useRef<HTMLDivElement>(null);
  const hueRef   = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const newHex = hsvToHex(hue, sat, val);
    setHex(newHex);
    setHexInput(newHex);
    onChange(newHex);
  }, [hue, sat, val]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const handleGradientDrag = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!gradRef.current) return;
    const rect = gradRef.current.getBoundingClientRect();
    setSat(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)));
    setVal(1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)));
  }, []);

  function onGradMouseDown(e: React.MouseEvent) {
    handleGradientDrag(e);
    const onMove = (ev: MouseEvent) => handleGradientDrag(ev);
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  const handleHueDrag = useCallback((e: React.MouseEvent | MouseEvent) => {
    if (!hueRef.current) return;
    const rect = hueRef.current.getBoundingClientRect();
    setHue(Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * 360);
  }, []);

  function onHueMouseDown(e: React.MouseEvent) {
    handleHueDrag(e);
    const onMove = (ev: MouseEvent) => handleHueDrag(ev);
    const onUp   = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function handleHexInput(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setHexInput(v);
    const full = v.startsWith('#') ? v : '#' + v;
    if (isValidHex(full)) {
      const [nh, ns, nv] = hexToHsv(full);
      setHue(nh); setSat(ns); setVal(nv);
    }
  }

  const pureHue   = hsvToHex(hue, 1, 1);
  const presets   = ['#ff4757','#ff6b35','#ffa502','#ffdd59','#00e5a0','#00c8ff','#a78bfa','#ff6b81','#5a6a8a','#ffffff'];

  return (
    <div ref={panelRef} className="cp-colorpicker">
      <div ref={gradRef} className="cp-colorpicker__grad"
        style={{ background: `linear-gradient(to right, #fff, ${pureHue})` }}
        onMouseDown={onGradMouseDown}>
        <div className="cp-colorpicker__grad-dark" />
        <div className="cp-colorpicker__thumb" style={{ left: `${sat * 100}%`, top: `${(1 - val) * 100}%` }} />
      </div>
      <div className="cp-colorpicker__controls">
        <div ref={hueRef} className="cp-colorpicker__hue" onMouseDown={onHueMouseDown}>
          <div className="cp-colorpicker__hue-thumb" style={{ left: `${(hue / 360) * 100}%` }} />
        </div>
        <div className="cp-colorpicker__preview" style={{ background: hex }} />
      </div>
      <div className="cp-colorpicker__hex-row">
        <span className="cp-colorpicker__hex-label">HEX</span>
        <input className="cp-colorpicker__hex-input" value={hexInput} onChange={handleHexInput} maxLength={7} spellCheck={false} />
      </div>
      <div className="cp-colorpicker__presets">
        {presets.map((c) => (
          <button key={c} className="cp-colorpicker__preset"
            style={{ background: c, outline: hex === c ? `2px solid ${c}` : undefined }}
            onClick={() => { const [nh, ns, nv] = hexToHsv(c); setHue(nh); setSat(ns); setVal(nv); }} />
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   ColorField  (sin cambios)
   ============================================================ */
function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="cp-colorfield">
      <div className="cp-colorfield__trigger" onClick={() => setOpen((o) => !o)}>
        <span className="cp-colorfield__swatch" style={{ background: value }} />
        <span className="cp-colorfield__label">{label}</span>
        <span className="cp-colorfield__hex">{value}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s', marginLeft: 2, flexShrink: 0 }}>
          <path d="M2 3.5l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </div>
      {open && <ColorPicker value={value} onChange={onChange} onClose={() => setOpen(false)} />}
    </div>
  );
}

/* ============================================================
   Iconos de sección  (sin cambios)
   ============================================================ */
const SECTION_ICONS = {
  theme: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7 1v1M7 12v1M1 7h1M12 7h1M2.93 2.93l.7.7M10.37 10.37l.7.7M10.37 3.63l-.7.7M3.63 10.37l-.7.7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  columns: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="2" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="5.5" y="2" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="10" y="2" width="3" height="10" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  cards: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1" y="1" width="12" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="1" y="8" width="12" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
};

const EMOJI_OPTIONS = ['', '🔥', '⚡', '🎯', '📦', '🚀', '✅', '❄️', '📋', '⚙️', '🎨', '💡'];

const DENSITY_OPTIONS: { value: CardDensity; label: string; desc: string }[] = [
  { value: 'compact',  label: 'Compacto',  desc: 'Solo título y badge'    },
  { value: 'normal',   label: 'Normal',    desc: 'Descripción y avatares' },
  { value: 'expanded', label: 'Expandido', desc: 'Todo visible'           },
];

const STYLE_OPTIONS: { value: CardStyle; label: string }[] = [
  { value: 'default',  label: 'Default'  },
  { value: 'bordered', label: 'Bordered' },
  { value: 'flat',     label: 'Flat'     },
  { value: 'glass',    label: 'Glass'    },
];

const PRIORITY_LABELS: Record<keyof PriorityColors, string> = {
  baja: 'Baja', media: 'Media', alta: 'Alta', critica: 'Crítica',
};

/* ============================================================
   Sección: Tema — GLOBAL, no recibe boardId
   ============================================================ */
function ThemeSection() {
  const { getCustomization, setTheme, setColumnGap, setShowBoardBg } = useCustomizationStore();
  const { equipoActivo } = useBoardStore();
  const customization    = getCustomization(equipoActivo);

  return (
    <div className="cp-section">
      <p className="cp-section__label">Tema de color <span style={{ fontSize: 9, opacity: 0.5, marginLeft: 4 }}>global</span></p>
      <div className="cp-theme-grid">
        {(Object.entries(BOARD_THEMES) as [BoardTheme, typeof BOARD_THEMES[BoardTheme]][]).map(([key, t]) => (
          <button
            key={key}
            className={`cp-theme-card ${customization.theme === key ? 'cp-theme-card--active' : ''}`}
            onClick={() => setTheme(key)}
            title={t.label}
          >
            <span className="cp-theme-card__preview">
              {t.preview.map((c, i) => <span key={i} style={{ background: c }} />)}
            </span>
            <span className="cp-theme-card__name">{t.label}</span>
          </button>
        ))}
      </div>

      <p className="cp-section__label" style={{ marginTop: 20 }}>
        Separación entre columnas
        <span className="cp-section__label-val">{customization.columnGap}px</span>
      </p>
      <input type="range" min={6} max={28} step={2}
        value={customization.columnGap}
        onChange={(e) => setColumnGap(equipoActivo, Number(e.target.value))}
        className="cp-slider"
      />

      <div className="cp-toggle-row" style={{ marginTop: 16 }}>
        <span className="cp-toggle-row__label">Fondo de columnas</span>
        <button
          className={`cp-toggle ${customization.showBoardBg ? 'cp-toggle--on' : ''}`}
          onClick={() => setShowBoardBg(equipoActivo, !customization.showBoardBg)}
        >
          <span className="cp-toggle__thumb" />
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Sección: Columnas — por board
   ============================================================ */
function ColumnsSection({ boardId }: { boardId: string }) {
  const { getCustomization, updateColumn, resetColumn } = useCustomizationStore();
  const customization = getCustomization(boardId);
  const allCols: KanbanColumna[] = ['sin_categorizar', ...COLUMNAS_BOARD];

  return (
    <div className="cp-section">
      {allCols.map((col) => {
        const cfg        = getColumnConfig(col, customization.columns);
        const def        = COLUMN_DEFAULTS[col];
        const isModified =
          cfg.headerColor !== def.headerColor ||
          cfg.hidden      !== def.hidden      ||
          cfg.width       !== def.width       ||
          cfg.emoji       !== def.emoji;

        return (
          <div key={col} className="cp-col-row">
            <div className="cp-col-row__head">
              <span className="cp-col-row__dot" style={{ background: cfg.headerColor }} />
              <span className="cp-col-row__name">{KANBAN_COLUMNAS[col]}</span>
              {isModified && (
                <button className="cp-col-row__reset" onClick={() => resetColumn(boardId, col)}>↺</button>
              )}
              <button
                className={`cp-toggle cp-toggle--sm ${cfg.hidden ? '' : 'cp-toggle--on'}`}
                onClick={() => updateColumn(boardId, col, { hidden: !cfg.hidden })}
                style={{ marginLeft: 'auto' }}
              >
                <span className="cp-toggle__thumb" />
              </button>
            </div>

            {!cfg.hidden && (
              <div className="cp-col-row__body">
                <ColorField
                  label="Color título"
                  value={cfg.headerColor}
                  onChange={(c) => updateColumn(boardId, col, { headerColor: c })}
                />
                <div className="cp-field">
                  <label className="cp-field__label">Icono</label>
                  <div className="cp-emoji-grid">
                    {EMOJI_OPTIONS.map((em) => (
                      <button
                        key={em || 'none'}
                        className={`cp-emoji-btn ${cfg.emoji === em ? 'cp-emoji-btn--active' : ''}`}
                        onClick={() => updateColumn(boardId, col, { emoji: em })}
                      >
                        {em || '—'}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="cp-field">
                  <label className="cp-field__label">
                    Ancho <span className="cp-section__label-val">{cfg.width}px</span>
                  </label>
                  <input type="range" min={200} max={400} step={10}
                    value={cfg.width}
                    onChange={(e) => updateColumn(boardId, col, { width: Number(e.target.value) })}
                    className="cp-slider"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================
   Sección: Tarjetas — por board
   ============================================================ */
function CardsSection({ boardId }: { boardId: string }) {
  const { getCustomization, updateCard, updatePriorityColor, resetPriorityColors } =
    useCustomizationStore();
  const customization  = getCustomization(boardId);
  const card           = customization.card;
  const priorityColors = customization.priorityColors ?? PRIORITY_DEFAULTS;

  const isModifiedPriority =
    JSON.stringify(priorityColors) !== JSON.stringify(PRIORITY_DEFAULTS);

  const toggles: { key: keyof typeof card; label: string }[] = [
    { key: 'showDesc',      label: 'Descripción'        },
    { key: 'showProgress',  label: 'Barra de progreso'  },
    { key: 'showAvatars',   label: 'Avatares'           },
    { key: 'showCategory',  label: 'Categoría'          },
    { key: 'roundedCorner', label: 'Esquinas redondeadas' },
  ];

  return (
    <div className="cp-section">
      <p className="cp-section__label">Densidad</p>
      <div className="cp-density-grid">
        {DENSITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`cp-density-btn ${card.density === opt.value ? 'cp-density-btn--active' : ''}`}
            onClick={() => updateCard(boardId, { density: opt.value })}
          >
            <span className="cp-density-btn__name">{opt.label}</span>
            <span className="cp-density-btn__desc">{opt.desc}</span>
          </button>
        ))}
      </div>

      <p className="cp-section__label" style={{ marginTop: 20 }}>Estilo visual</p>
      <div className="cp-style-grid">
        {STYLE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            className={`cp-style-btn ${card.style === opt.value ? 'cp-style-btn--active' : ''}`}
            onClick={() => updateCard(boardId, { style: opt.value })}
          >
            <span className="cp-style-btn__preview" data-style={opt.value} />
            <span>{opt.label}</span>
          </button>
        ))}
      </div>

      <p className="cp-section__label" style={{ marginTop: 20 }}>
        Opacidad del fondo
        <span className="cp-section__label-val">{card.cardOpacity ?? 100}%</span>
      </p>
      <input type="range" min={10} max={100} step={5}
        value={card.cardOpacity ?? 100}
        onChange={(e) => updateCard(boardId, { cardOpacity: Number(e.target.value) })}
        className="cp-slider"
      />

      <div className="cp-section__label" style={{ marginTop: 20 }}>
        Colores por prioridad
        {isModifiedPriority && (
          <button className="cp-col-row__reset" onClick={() => resetPriorityColors(boardId)}>↺ Reset</button>
        )}
      </div>
      <div className="cp-priority-grid">
        {(Object.keys(PRIORITY_LABELS) as (keyof PriorityColors)[]).map((p) => (
          <ColorField
            key={p}
            label={PRIORITY_LABELS[p]}
            value={priorityColors[p]}
            onChange={(c) => updatePriorityColor(boardId, p, c)}
          />
        ))}
      </div>

      <p className="cp-section__label" style={{ marginTop: 20 }}>Campos visibles</p>
      {toggles.map(({ key, label }) => (
        <div key={key} className="cp-toggle-row">
          <span className="cp-toggle-row__label">{label}</span>
          <button
            className={`cp-toggle ${card[key as keyof typeof card] ? 'cp-toggle--on' : ''}`}
            onClick={() => updateCard(boardId, { [key]: !card[key as keyof typeof card] })}
          >
            <span className="cp-toggle__thumb" />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ============================================================
   Panel principal
   ============================================================ */
export function BoardCustomizationPanel() {
  const { isPanelOpen, closePanel, activeSection, setActiveSection, resetAll } =
    useCustomizationStore();
  const { equipoActivo } = useBoardStore();
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

  return (
    <div className="cp-panel" ref={ref} role="dialog" aria-label="Personalización del board">
      <div className="cp-panel__header">
        <span className="cp-panel__title">Personalización</span>
        <button className="cp-panel__close" onClick={closePanel}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M2 2l10 10M12 2L2 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      <div className="cp-tabs">
        {(['theme', 'columns', 'cards'] as const).map((s) => (
          <button
            key={s}
            className={`cp-tab ${activeSection === s ? 'cp-tab--active' : ''}`}
            onClick={() => setActiveSection(s)}
          >
            {SECTION_ICONS[s]}
            {s === 'theme' ? 'Tema' : s === 'columns' ? 'Columnas' : 'Tarjetas'}
          </button>
        ))}
      </div>

      <div className="cp-panel__body">
        {activeSection === 'theme'   && <ThemeSection />}
        {activeSection === 'columns' && <ColumnsSection boardId={equipoActivo} />}
        {activeSection === 'cards'   && <CardsSection   boardId={equipoActivo} />}
      </div>

      <div className="cp-panel__footer">
        <button className="cp-panel__reset-btn" onClick={() => resetAll(equipoActivo)}>
          Restablecer todo
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   Trigger  (sin cambios)
   ============================================================ */
export function BoardCustomizationTrigger() {
  const { isPanelOpen, openPanel, closePanel } = useCustomizationStore();

  return (
    <div style={{ position: 'relative' }}>
      <button
        className={`filter-trigger cp-trigger ${isPanelOpen ? 'filter-trigger--active' : ''}`}
        onClick={isPanelOpen ? closePanel : openPanel}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <circle cx="7" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
          <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M10.01 3.99l-1.06 1.06M3.99 10.01l-1.06 1.06"
                stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
        Personalizar
      </button>
      <BoardCustomizationPanel />
    </div>
  );
}