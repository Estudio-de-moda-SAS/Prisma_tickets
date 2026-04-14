import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { KanbanColumna } from '@/features/requests/types';

/* ============================================================
   Tipos
   ============================================================ */
export type CardDensity  = 'compact' | 'normal' | 'expanded';
export type CardStyle    = 'default' | 'bordered' | 'flat' | 'glass';
export type BoardTheme   = 'dark' | 'midnight' | 'slate' | 'forest' | 'aurora';

export type PriorityColors = {
  baja:    string;
  media:   string;
  alta:    string;
  critica: string;
};

export type ColumnCustomization = {
  headerColor: string;
  accent:      string;
  emoji:       string;
  hidden:      boolean;
  width:       number;
};

export type CardCustomization = {
  density:       CardDensity;
  style:         CardStyle;
  cardOpacity:   number;
  showDesc:      boolean;
  showProgress:  boolean;
  showAvatars:   boolean;
  showCategory:  boolean;
  roundedCorner: boolean;
};

export type BoardCustomization = {
  theme:          BoardTheme;
  columnGap:      number;
  columns:        Partial<Record<KanbanColumna, ColumnCustomization>>;
  card:           CardCustomization;
  showBoardBg:    boolean;
  priorityColors: PriorityColors;
};

/* ============================================================
   Defaults
   ============================================================ */
export const PRIORITY_DEFAULTS: PriorityColors = {
  baja:    '#5a6a8a',
  media:   '#a78bfa',
  alta:    '#ffa502',
  critica: '#ff4757',
};

export const COLUMN_DEFAULTS: Record<KanbanColumna, ColumnCustomization> = {
  sin_categorizar: { headerColor: '#5a6a8a', accent: 'rgba(90,106,138,0.3)',   emoji: '', hidden: false, width: 240 },
  icebox:          { headerColor: '#60a5fa', accent: 'rgba(96,165,250,0.15)',  emoji: '', hidden: false, width: 280 },
  backlog:         { headerColor: '#a78bfa', accent: 'rgba(167,139,250,0.15)', emoji: '', hidden: false, width: 280 },
  todo:            { headerColor: '#ffa502', accent: 'rgba(255,165,2,0.15)',   emoji: '', hidden: false, width: 280 },
  en_progreso:     { headerColor: '#00c8ff', accent: 'rgba(0,200,255,0.15)',   emoji: '', hidden: false, width: 280 },
  hecho:           { headerColor: '#00e5a0', accent: 'rgba(0,229,160,0.15)',   emoji: '', hidden: false, width: 280 },
};

export const CARD_DEFAULTS: CardCustomization = {
  density:       'normal',
  style:         'default',
  cardOpacity:   100,
  showDesc:      true,
  showProgress:  true,
  showAvatars:   true,
  showCategory:  true,
  roundedCorner: true,
};

type BoardLocalCustomization = Omit<BoardCustomization, 'theme'>;

const BOARD_LOCAL_DEFAULTS: BoardLocalCustomization = {
  columnGap:      12,
  columns:        {},
  card:           CARD_DEFAULTS,
  showBoardBg:    true,
  priorityColors: PRIORITY_DEFAULTS,
};

type GlobalCustomization = { theme: BoardTheme };
const GLOBAL_DEFAULTS: GlobalCustomization = { theme: 'dark' };

export type BoardCustomizationView = BoardCustomization;

/* ============================================================
   Temas
   ============================================================ */
export type ThemePreset = {
  label:   string;
  preview: [string, string, string];
  vars: {
    '--bg-deep':       string;
    '--bg-panel':      string;
    '--bg-card':       string;
    '--bg-surface':    string;
    '--bg-hover':      string;
    '--accent':        string;
    '--accent-2':      string;
    '--accent-glow':   string;
    '--accent-border': string;
    '--border':        string;
    '--border-subtle': string;
  };
};

export const BOARD_THEMES: Record<BoardTheme, ThemePreset> = {
  dark: {
    label:   'Dark',
    preview: ['#0a0d14', '#141826', '#00c8ff'],
    vars: {
      '--bg-deep':       '#0a0d14',
      '--bg-panel':      '#0f1320',
      '--bg-card':       '#141826',
      '--bg-surface':    '#1a2035',
      '--bg-hover':      '#1e2540',
      '--accent':        '#00c8ff',
      '--accent-2':      '#0055cc',
      '--accent-glow':   'rgba(0,200,255,0.12)',
      '--accent-border': 'rgba(0,200,255,0.2)',
      '--border':        'rgba(0,200,255,0.14)',
      '--border-subtle': 'rgba(255,255,255,0.06)',
    },
  },
  midnight: {
    label:   'Midnight',
    preview: ['#0d0b1e', '#16132e', '#7c55ff'],
    vars: {
      '--bg-deep':       '#0d0b1e',
      '--bg-panel':      '#16132e',
      '--bg-card':       '#1c1840',
      '--bg-surface':    '#221e50',
      '--bg-hover':      '#282460',
      '--accent':        '#7c55ff',
      '--accent-2':      '#5533cc',
      '--accent-glow':   'rgba(124,85,255,0.12)',
      '--accent-border': 'rgba(124,85,255,0.25)',
      '--border':        'rgba(124,85,255,0.18)',
      '--border-subtle': 'rgba(255,255,255,0.06)',
    },
  },
  slate: {
    label:   'Slate',
    preview: ['#0d1117', '#1c2128', '#6496c8'],
    vars: {
      '--bg-deep':       '#0d1117',
      '--bg-panel':      '#161b22',
      '--bg-card':       '#1c2128',
      '--bg-surface':    '#21262d',
      '--bg-hover':      '#282e37',
      '--accent':        '#6496c8',
      '--accent-2':      '#3a6ea8',
      '--accent-glow':   'rgba(100,150,200,0.12)',
      '--accent-border': 'rgba(100,150,200,0.25)',
      '--border':        'rgba(100,150,200,0.18)',
      '--border-subtle': 'rgba(255,255,255,0.07)',
    },
  },
  forest: {
    label:   'Forest',
    preview: ['#0a100c', '#132018', '#00d46e'],
    vars: {
      '--bg-deep':       '#0a100c',
      '--bg-panel':      '#0f1a12',
      '--bg-card':       '#132018',
      '--bg-surface':    '#1a2e20',
      '--bg-hover':      '#1f3826',
      '--accent':        '#00d46e',
      '--accent-2':      '#00904a',
      '--accent-glow':   'rgba(0,212,110,0.12)',
      '--accent-border': 'rgba(0,212,110,0.25)',
      '--border':        'rgba(0,212,110,0.18)',
      '--border-subtle': 'rgba(255,255,255,0.06)',
    },
  },
  aurora: {
    label:   'Aurora',
    preview: ['#0a0814', '#16102a', '#d464ff'],
    vars: {
      '--bg-deep':       '#0a0814',
      '--bg-panel':      '#16102a',
      '--bg-card':       '#1e1640',
      '--bg-surface':    '#261d50',
      '--bg-hover':      '#2e2260',
      '--accent':        '#d464ff',
      '--accent-2':      '#a033cc',
      '--accent-glow':   'rgba(212,100,255,0.12)',
      '--accent-border': 'rgba(212,100,255,0.25)',
      '--border':        'rgba(212,100,255,0.18)',
      '--border-subtle': 'rgba(255,255,255,0.06)',
    },
  },
};

/* ============================================================
   Helpers
   ============================================================ */
export function getColumnConfig(
  col: KanbanColumna,
  overrides: Partial<Record<KanbanColumna, ColumnCustomization>>,
): ColumnCustomization {
  return { ...COLUMN_DEFAULTS[col], ...(overrides[col] ?? {}) };
}

function patchBoard(
  byBoard: Record<string, BoardLocalCustomization>,
  boardId: string,
  updater: (prev: BoardLocalCustomization) => Partial<BoardLocalCustomization>,
): Record<string, BoardLocalCustomization> {
  const prev = byBoard[boardId] ?? { ...BOARD_LOCAL_DEFAULTS, columns: {}, card: { ...CARD_DEFAULTS } };
  return { ...byBoard, [boardId]: { ...prev, ...updater(prev) } };
}

/* ============================================================
   Store
   ============================================================ */

type CustomizationState = {
  /* ── Estado ── */
  global:        GlobalCustomization;
  byBoard:       Record<string, BoardLocalCustomization>;
  isPanelOpen:   boolean;
  activeSection: 'theme' | 'columns' | 'cards';

  /* ── Selector unificado ── */
  getCustomization: (boardId: string) => BoardCustomizationView;

  /* ── Panel ── */
  openPanel:        () => void;
  closePanel:       () => void;
  setActiveSection: (s: CustomizationState['activeSection']) => void;

  /* ── Theme (global) ── */
  setTheme: (theme: BoardTheme) => void;

  /* ── Por board ── */
  setColumnGap:        (boardId: string, gap: number) => void;
  setShowBoardBg:      (boardId: string, v: boolean) => void;
  updateColumn:        (boardId: string, col: KanbanColumna, patch: Partial<ColumnCustomization>) => void;
  resetColumn:         (boardId: string, col: KanbanColumna) => void;
  updateCard:          (boardId: string, patch: Partial<CardCustomization>) => void;
  updatePriorityColor: (boardId: string, prioridad: keyof PriorityColors, color: string) => void;
  resetPriorityColors: (boardId: string) => void;
  resetAll:            (boardId: string) => void;
};

export const useCustomizationStore = create<CustomizationState>()(
  persist(
    (set, get) => ({
      global:        GLOBAL_DEFAULTS,
      byBoard:       {},
      isPanelOpen:   false,
      activeSection: 'theme',

      /* ── Selector unificado ── */
      getCustomization: (boardId) => {
        const local = get().byBoard[boardId] ?? BOARD_LOCAL_DEFAULTS;
        return { ...local, theme: get().global.theme };
      },

      /* ── Panel ── */
      openPanel:        () => set({ isPanelOpen: true }),
      closePanel:       () => set({ isPanelOpen: false }),
      setActiveSection: (s) => set({ activeSection: s }),

      /* ── Theme global ── */
      setTheme: (theme) =>
        set((s) => ({ global: { ...s.global, theme } })),

      /* ── Por board ── */
      setColumnGap: (boardId, columnGap) =>
        set((s) => ({ byBoard: patchBoard(s.byBoard, boardId, () => ({ columnGap })) })),

      setShowBoardBg: (boardId, showBoardBg) =>
        set((s) => ({ byBoard: patchBoard(s.byBoard, boardId, () => ({ showBoardBg })) })),

      updateColumn: (boardId, col, patch) =>
        set((s) => ({
          byBoard: patchBoard(s.byBoard, boardId, (prev) => ({
            columns: {
              ...prev.columns,
              [col]: {
                ...COLUMN_DEFAULTS[col],
                ...(prev.columns[col] ?? {}),
                ...patch,
              },
            },
          })),
        })),

      resetColumn: (boardId, col) =>
        set((s) => ({
          byBoard: patchBoard(s.byBoard, boardId, (prev) => {
            const cols = { ...prev.columns };
            delete cols[col];
            return { columns: cols };
          }),
        })),

      updateCard: (boardId, patch) =>
        set((s) => ({
          byBoard: patchBoard(s.byBoard, boardId, (prev) => ({
            card: { ...prev.card, ...patch },
          })),
        })),

      updatePriorityColor: (boardId, prioridad, color) =>
        set((s) => ({
          byBoard: patchBoard(s.byBoard, boardId, (prev) => ({
            priorityColors: { ...(prev.priorityColors ?? PRIORITY_DEFAULTS), [prioridad]: color },
          })),
        })),

      resetPriorityColors: (boardId) =>
        set((s) => ({
          byBoard: patchBoard(s.byBoard, boardId, () => ({
            priorityColors: PRIORITY_DEFAULTS,
          })),
        })),

      resetAll: (boardId) =>
        set((s) => ({
          byBoard: {
            ...s.byBoard,
            [boardId]: { ...BOARD_LOCAL_DEFAULTS, columns: {}, card: { ...CARD_DEFAULTS } },
          },
        })),
    }),
    { name: 'prisma-board-customization-v2' },
  ),
);