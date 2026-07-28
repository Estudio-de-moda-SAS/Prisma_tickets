import { create } from 'zustand';

type MobileNavState = {
  open: boolean;
  openNav: () => void;
  closeNav: () => void;
  toggleNav: () => void;
};

/**
 * Estado del drawer móvil. Aditivo: NO toca `sidebarAbierto` del boardStore
 * (ese sigue mandando en desktop). Solo controla el off-canvas en ≤768px.
 */
export const useMobileNav = create<MobileNavState>((set) => ({
  open: false,
  openNav:   () => set({ open: true }),
  closeNav:  () => set({ open: false }),
  toggleNav: () => set((s) => ({ open: !s.open })),
}));