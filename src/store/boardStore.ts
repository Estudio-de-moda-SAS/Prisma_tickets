// src/store/boardStore.ts
import { create } from 'zustand';
import type { Equipo } from '@/features/requests/types';

const ZOOM_MIN  = 0.5;
const ZOOM_MAX  = 1.3;
const ZOOM_STEP = 0.1;

type BoardUIState = {
  equipoActivo:    Equipo;
  sidebarAbierto:  boolean;
  kanbanZoom:      number;

  setEquipoActivo: (equipo: Equipo) => void;
  toggleSidebar:   () => void;
  setKanbanZoom:   (zoom: number) => void;
  stepKanbanZoom:  (dir: 1 | -1) => void;
  resetKanbanZoom: () => void;
};

export const useBoardStore = create<BoardUIState>((set, get) => ({
  equipoActivo:   'desarrollo',
  sidebarAbierto: true,
  kanbanZoom:     1,

  setEquipoActivo: (equipo) => set({ equipoActivo: equipo }),
  toggleSidebar:   ()       => set((s) => ({ sidebarAbierto: !s.sidebarAbierto })),

  setKanbanZoom: (zoom) =>
    set({ kanbanZoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)) }),

  stepKanbanZoom: (dir) => {
    const next = Math.round((get().kanbanZoom + dir * ZOOM_STEP) * 10) / 10;
    set({ kanbanZoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) });
  },

  resetKanbanZoom: () => set({ kanbanZoom: 1 }),
}));

export { ZOOM_MIN, ZOOM_MAX };