import { useEffect } from 'react';
import { useCustomizationStore, BOARD_THEMES } from '@/store/customizationStore';

/* ============================================================
   useTheme
   ─────────────────────────────────────────────────────────────
   Llama este hook UNA SOLA VEZ en App.tsx.
   El tema es global — no depende del board activo.
   Escribe las variables CSS directamente en :root para que
   todo el layout (sidebar, topbar, columnas, tarjetas) herede
   los colores sin props ni wrappers.
   ============================================================ */
export function useTheme() {
  // Lee directamente de global.theme — no de customization
  const theme = useCustomizationStore((s) => s.global.theme);

  useEffect(() => {
    const preset = BOARD_THEMES[theme] ?? BOARD_THEMES.dark;
    const root   = document.documentElement;

    for (const [key, value] of Object.entries(preset.vars)) {
      root.style.setProperty(key, value);
    }
  }, [theme]);
}