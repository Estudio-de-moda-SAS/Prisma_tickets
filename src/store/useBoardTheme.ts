// src/store/useBoardTheme.ts
// Hook que aplica las CSS vars del board theme al :root
// Úsalo UNA VEZ en AppLayout o App.tsx

import { useEffect } from 'react';
import { useCustomizationStore, BOARD_THEMES } from '@/store/customizationStore';
import { useTheme } from '@/store/useTheme';

export function useBoardTheme() {
  const theme    = useCustomizationStore((s) => s.global.theme);
  const { theme: uiTheme } = useTheme();

  useEffect(() => {
    // En modo claro no aplicamos el board theme al fondo —
    // las vars de light-theme.css mandan sobre bg/surface.
    // Solo aplicamos accent y border del board theme en modo oscuro.
    const vars = BOARD_THEMES[theme]?.vars ?? BOARD_THEMES.dark.vars;
    const root = document.documentElement;

    if (uiTheme === 'dark') {
      // Aplicar todas las vars del board theme
      Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
    } else {
      // En modo claro: solo el acento del board theme, los bg los pone light-theme.css
      root.style.setProperty('--accent',        vars['--accent']);
      root.style.setProperty('--accent-2',      vars['--accent-2']);
      root.style.setProperty('--accent-glow',   vars['--accent-glow']);
      root.style.setProperty('--accent-border', vars['--accent-border']);
      root.style.setProperty('--border',        vars['--border']);
      // bg vars: limpiar inline para que las del CSS tomen control
      ['--bg-deep','--bg-panel','--bg-card','--bg-surface','--bg-hover','--border-subtle']
        .forEach((k) => root.style.removeProperty(k));
    }
  }, [theme, uiTheme]);
}