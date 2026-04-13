import { create } from 'zustand';
import type { Equipo } from '@/features/requests/types';

type BoardUIState = {
  equipoActivo:    Equipo;
  sidebarAbierto:  boolean;
  setEquipoActivo: (equipo: Equipo) => void;
  toggleSidebar:   () => void;
};

export const useBoardStore = create<BoardUIState>((set) => ({
  equipoActivo:   'desarrollo',
  sidebarAbierto: true,

  setEquipoActivo: (equipo) => set({ equipoActivo: equipo }),
  toggleSidebar:   ()       => set((s) => ({ sidebarAbierto: !s.sidebarAbierto })),
}));