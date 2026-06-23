// src/store/timerStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Equipo } from '@/features/requests/types';

export type TimerEntry = {
  requestId:     string;
  titulo:        string;
  equipo:        Equipo;
  accumulatedMs: number;        // tiempo de segmentos previos ya pausados
  startedAt:     number | null; // epoch ms del segmento activo; null = pausado
};

type TimerState = {
  entries:  Record<string, TimerEntry>;
  lastId:   string | null;  // último ticket con el que se interactuó (alimenta el widget)
  activeId: string | null;  // ticket corriendo ahora mismo (solo uno a la vez)

  start:      (requestId: string, meta: { titulo: string; equipo: Equipo }) => void;
  pause:      (requestId: string) => void;
  reset:      (requestId: string) => void;
  dismiss:    (requestId: string) => void;   
  surface:    (requestId: string) => void;   
  checkpoint: () => void;
  elapsedMs:  (requestId: string) => number;
};

export const useTimerStore = create<TimerState>()(
  persist(
    (set, get) => ({
      entries:  {},
      lastId:   null,
      activeId: null,

      start: (requestId, meta) => set((s) => {
        const entries = { ...s.entries };

        // Pausar el que esté corriendo → garantiza un solo timer activo
        if (s.activeId && s.activeId !== requestId) {
          const a = entries[s.activeId];
          if (a?.startedAt) {
            entries[s.activeId] = {
              ...a,
              accumulatedMs: a.accumulatedMs + (Date.now() - a.startedAt),
              startedAt: null,
            };
          }
        }

        const prev = entries[requestId];
        entries[requestId] = {
          requestId,
          titulo: meta.titulo,
          equipo: meta.equipo,
          accumulatedMs: prev?.accumulatedMs ?? 0,
          startedAt: Date.now(),
        };

        return { entries, activeId: requestId, lastId: requestId };
      }),

      pause: (requestId) => set((s) => {
        const e = s.entries[requestId];
        if (!e || !e.startedAt) return s;
        return {
          entries: {
            ...s.entries,
            [requestId]: {
              ...e,
              accumulatedMs: e.accumulatedMs + (Date.now() - e.startedAt),
              startedAt: null,
            },
          },
          activeId: s.activeId === requestId ? null : s.activeId,
        };
      }),

      reset: (requestId) => set((s) => {
        const entries = { ...s.entries };
        delete entries[requestId];
        return {
          entries,
          activeId: s.activeId === requestId ? null : s.activeId,
          lastId:   s.lastId   === requestId ? null : s.lastId,
        };
      }),
      dismiss: (requestId) => set((s) => {
        const e = s.entries[requestId];
        if (!e) return { lastId: s.lastId === requestId ? null : s.lastId };
        const accumulatedMs = e.startedAt
          ? e.accumulatedMs + (Date.now() - e.startedAt)
          : e.accumulatedMs;
        return {
          entries:  { ...s.entries, [requestId]: { ...e, accumulatedMs, startedAt: null } },
          activeId: s.activeId === requestId ? null : s.activeId,
          lastId:   s.lastId   === requestId ? null : s.lastId,
        };
      }),

      // Vuelve a mostrar el widget de un ticket que tenga cronómetro (corriendo o pausado)
      surface: (requestId) => set((s) => {
        if (!s.entries[requestId] || s.lastId === requestId) return s;
        return { lastId: requestId };
      }),
      // Heartbeat: persiste el progreso del timer activo cada pocos segundos
      checkpoint: () => set((s) => {
        if (!s.activeId) return s;
        const e = s.entries[s.activeId];
        if (!e?.startedAt) return s;
        const now = Date.now();
        return {
          entries: {
            ...s.entries,
            [s.activeId]: {
              ...e,
              accumulatedMs: e.accumulatedMs + (now - e.startedAt),
              startedAt: now,
            },
          },
        };
      }),

      elapsedMs: (requestId) => {
        const e = get().entries[requestId];
        if (!e) return 0;
        return e.accumulatedMs + (e.startedAt ? Date.now() - e.startedAt : 0);
      },
    }),
    {
      name: 'prisma-timer',
      // Al recargar: no contar el tiempo que el navegador estuvo cerrado.
      // Se conserva lo acumulado (gracias al heartbeat) y se deja en pausa.
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        Object.keys(state.entries).forEach((k) => {
          if (state.entries[k].startedAt) {
            state.entries[k] = { ...state.entries[k], startedAt: null };
          }
        });
        state.activeId = null;
      },
    },
  ),
);