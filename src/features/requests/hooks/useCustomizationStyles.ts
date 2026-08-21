import React from 'react';
import {
  useCustomizationStore,
  BOARD_THEMES,
  PRIORITY_DEFAULTS,
  getColumnConfig,
} from '@/store/customizationStore';
import { useBoardStore } from '@/store/boardStore';
import type { KanbanColumna } from '@/features/requests/types';

/**
 * Hooks de personalización visual del board.
 *
 * Derivan estilos y flags de visibilidad a partir de la customización del equipo
 * activo (columnas, cards, tema, gaps) para que los componentes del kanban
 * apliquen la configuración del usuario sin leer el store directamente. Incluye
 * estilos de columna ({@link useColumnStyle}), clases y visibilidad de card
 * ({@link useCardClasses}, {@link useCardVisibility}), fondo de card
 * ({@link useCardStyle}), color de prioridad ({@link usePriorityColor}) y estilo
 * general del board ({@link useBoardStyle}).
 *
 * @module useBoardCustomization
 */

/**
 * Obtiene la customización del equipo activo.
 *
 * @remarks
 * Helper interno compartido por el resto de hooks del módulo: resuelve el equipo
 * activo desde `boardStore` y su customización desde `customizationStore`.
 *
 * @returns `{ customization, boardId }` del equipo activo.
 */
function useBoardCustomization() {
  const { equipoActivo }  = useBoardStore();
  const getCustomization  = useCustomizationStore((s) => s.getCustomization);
  return { customization: getCustomization(equipoActivo), boardId: equipoActivo };
}

/**
 * Estilos de una columna del kanban según su configuración.
 *
 * @param col - Columna del kanban.
 * @returns `containerStyle` (ancho fijo y `display: none` si está oculta),
 *   `titleStyle` (color del encabezado), `emoji` y `hidden`.
 */
export function useColumnStyle(col: KanbanColumna) {
  const { customization } = useBoardCustomization();
  const cfg               = getColumnConfig(col, customization.columns);
  return {
    containerStyle: {
      flex:    `0 0 ${cfg.width}px`,
      display: cfg.hidden ? 'none' : undefined,
    } as React.CSSProperties,
    titleStyle: { color: cfg.headerColor } as React.CSSProperties,
    emoji:  cfg.emoji,
    hidden: cfg.hidden,
  };
}

/**
 * Construye la lista de clases CSS de una card según la customización.
 *
 * @remarks
 * Combina la prioridad base con modificadores de densidad, estilo y esquinas
 * (solo se añaden cuando difieren del valor por defecto).
 *
 * @param basePrioridad - Prioridad base de la card (sufijo de la clase).
 * @returns La cadena de clases CSS lista para el `className`.
 */
export function useCardClasses(basePrioridad: string) {
  const { customization } = useBoardCustomization();
  const { density, style, roundedCorner } = customization.card;
  return [
    'request-card',
    `request-card--${basePrioridad}`,
    density  !== 'normal'  ? `request-card--${density}` : '',
    style    !== 'default' ? `request-card--${style}`   : '',
    !roundedCorner         ? 'request-card--square'     : '',
  ].filter(Boolean).join(' ');
}

/**
 * Flags de visibilidad de los elementos de una card.
 *
 * @remarks
 * En densidad `compact` se ocultan descripción, progreso, avatares, prioridad y
 * fecha, sin importar los toggles individuales. `showCategory` no depende de la
 * densidad. `showPriority` y `showDate` aplican defaults (`true`/`false`) si el
 * valor no está definido.
 *
 * @returns Objeto con los flags de visibilidad resueltos.
 */
export function useCardVisibility() {
  const { customization } = useBoardCustomization();
  const {
    showDesc, showProgress, showAvatars, showCategory,
    showPriority, showDate, density,
  } = customization.card;
  return {
    showDesc:     density !== 'compact' && showDesc,
    showProgress: density !== 'compact' && showProgress,
    showAvatars:  density !== 'compact' && showAvatars,
    showCategory,
    // Nuevos — se conectan en RequestCard cuando corresponda
    showPriority: density !== 'compact' && (showPriority ?? true),
    showDate:     density !== 'compact' && (showDate ?? false),
  };
}

/**
 * Estilo de fondo de una card según tema de UI y customización.
 *
 * @remarks
 * `uiTheme` se pasa como parámetro (el componente ya llamó `useTheme` arriba)
 * para no añadir un hook extra aquí y no romper el orden de hooks. En tema claro
 * aplica opacidad sobre blanco o la variable `--bg-card`. En oscuro, toma el
 * `--bg-card` del tema de board seleccionado (o el `dark` por defecto), lo
 * convierte de hex a RGB y aplica la opacidad configurada.
 *
 * @param uiTheme - Tema de UI actual (`'dark'` | `'light'`). Por defecto `'dark'`.
 * @returns Los estilos de fondo (`backgroundColor`) para la card.
 */
export function useCardStyle(uiTheme: 'dark' | 'light' = 'dark'): React.CSSProperties {
  const { customization } = useBoardCustomization();
  const { theme, card }   = customization;
  const cardOpacity       = card.cardOpacity ?? 100;

  if (uiTheme === 'light') {
    return cardOpacity < 100
      ? { backgroundColor: `rgba(255,255,255,${cardOpacity / 100})` }
      : { backgroundColor: 'var(--bg-card)' };
  }

  const themeVars = BOARD_THEMES[theme]?.vars ?? BOARD_THEMES.dark.vars;
  const hex       = themeVars['--bg-card'].replace('#', '');
  const r         = parseInt(hex.slice(0, 2), 16);
  const g         = parseInt(hex.slice(2, 4), 16);
  const b         = parseInt(hex.slice(4, 6), 16);
  return { backgroundColor: `rgba(${r},${g},${b},${cardOpacity / 100})` };
}

/**
 * Color de una prioridad.
 *
 * @remarks
 * Los colores de prioridad son del sistema y no editables por el usuario:
 * siempre usa {@link PRIORITY_DEFAULTS}, independientemente del store.
 *
 * @param prioridad - Clave de prioridad.
 * @returns El color asociado, o un gris por defecto si la prioridad no existe.
 */
export function usePriorityColor(prioridad: string): string {
  return PRIORITY_DEFAULTS[prioridad as keyof typeof PRIORITY_DEFAULTS] ?? '#5a6a8a';
}

/**
 * Estilo general del board y opciones de agrupación/orden.
 *
 * @returns `kanbanStyle` (gap entre columnas), `showBoardBg`, y `groupBy` /
 *   `sortBy` (disponibles para cuando el `KanbanBoard` implemente agrupación y
 *   ordenamiento).
 */
export function useBoardStyle() {
  const { customization } = useBoardCustomization();
  return {
    kanbanStyle: { gap: `${customization.columnGap}px` } as React.CSSProperties,
    showBoardBg: customization.showBoardBg,
    groupBy:     customization.groupBy,   // disponible para KanbanBoard cuando se implemente agrupación
    sortBy:      customization.sortBy,    // disponible para KanbanBoard cuando se implemente ordenamiento
  };
}