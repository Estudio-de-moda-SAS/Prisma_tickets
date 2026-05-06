// src/store/configStore.ts
// Store simplificado — solo persiste preferencias de UI locales.
// Sprints, labels y equipos ahora viven en Supabase.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ConfigState = {
  // Preferencias locales que no necesitan ir a la DB
  preferencias: Record<string, unknown>;
  setPreferencia: (key: string, value: unknown) => void;
};

export const useConfigStore = create<ConfigState>()(
  persist(
    (set) => ({
      preferencias: {},
      setPreferencia: (key, value) =>
        set((s) => ({ preferencias: { ...s.preferencias, [key]: value } })),
    }),
    { name: 'prisma-config-v4' },
  ),
);