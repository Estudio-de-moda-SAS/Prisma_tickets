// src/store/useTheme.ts — light como default

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',                              // ← default claro
      toggle: () => {
        const next = get().theme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        set({ theme: next });
      },
      setTheme: (t) => {
        document.documentElement.setAttribute('data-theme', t);
        set({ theme: t });
      },
    }),
    {
      name: 'prisma-theme',
      onRehydrateStorage: () => (state) => {
        const theme = state?.theme ?? 'light';
        document.documentElement.setAttribute('data-theme', theme);
      },
    }
  )
);