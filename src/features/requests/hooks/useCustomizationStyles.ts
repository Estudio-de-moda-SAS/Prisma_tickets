import React from 'react';
import {
  useCustomizationStore,
  BOARD_THEMES,
  PRIORITY_DEFAULTS,
  getColumnConfig,
} from '@/store/customizationStore';
import { useBoardStore } from '@/store/boardStore';
import type { KanbanColumna } from '@/features/requests/types';

function useBoardCustomization() {
  const { equipoActivo }  = useBoardStore();
  const getCustomization  = useCustomizationStore((s) => s.getCustomization);
  return { customization: getCustomization(equipoActivo), boardId: equipoActivo };
}

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

export function useCardVisibility() {
  const { customization } = useBoardCustomization();
  const { showDesc, showProgress, showAvatars, showCategory, density } = customization.card;
  return {
    showDesc:     density !== 'compact' && showDesc,
    showProgress: density !== 'compact' && showProgress,
    showAvatars:  density !== 'compact' && showAvatars,
    showCategory,
  };
}

// uiTheme se pasa como parámetro desde el componente (que ya llamó useTheme arriba)
// para no añadir un hook extra aquí y romper el orden de hooks.
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

export function usePriorityColor(prioridad: string): string {
  const { customization } = useBoardCustomization();
  const colors = customization.priorityColors ?? PRIORITY_DEFAULTS;
  return (colors as Record<string, string>)[prioridad]
    ?? PRIORITY_DEFAULTS[prioridad as keyof typeof PRIORITY_DEFAULTS]
    ?? '#5a6a8a';
}

export function useBoardStyle() {
  const { customization } = useBoardCustomization();
  return {
    kanbanStyle:  { gap: `${customization.columnGap}px` } as React.CSSProperties,
    showBoardBg:  customization.showBoardBg,
  };
}