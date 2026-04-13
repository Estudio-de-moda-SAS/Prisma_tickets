import { create } from 'zustand';
import type { Automation, AutomationStatus } from '@/features/automations/types';
import { MOCK_AUTOMATIONS } from '@/features/automations/types';

type AutomationState = {
  automations:    Automation[];
  selectedId:     string | null;
  isModalOpen:    boolean;

  /* Acciones */
  toggleStatus:   (id: string)                         => void;
  deleteItem:     (id: string)                         => void;
  selectItem:     (id: string | null)                  => void;
  openModal:      ()                                   => void;
  closeModal:     ()                                   => void;
  upsertItem:     (automation: Automation)             => void;
  setStatus:      (id: string, s: AutomationStatus)   => void;
};

export const useAutomationStore = create<AutomationState>((set) => ({
  automations: MOCK_AUTOMATIONS,
  selectedId:  null,
  isModalOpen: false,

  toggleStatus: (id) =>
    set((s) => ({
      automations: s.automations.map((a) =>
        a.id === id
          ? { ...a, status: a.status === 'activa' ? 'inactiva' : 'activa' }
          : a,
      ),
    })),

  deleteItem: (id) =>
    set((s) => ({
      automations: s.automations.filter((a) => a.id !== id),
    })),

  selectItem: (selectedId) => set({ selectedId }),

  openModal:  () => set({ isModalOpen: true }),
  closeModal: () => set({ isModalOpen: false, selectedId: null }),

  upsertItem: (automation) =>
    set((s) => {
      const exists = s.automations.some((a) => a.id === automation.id);
      return {
        automations: exists
          ? s.automations.map((a) => (a.id === automation.id ? automation : a))
          : [automation, ...s.automations],
        isModalOpen: false,
        selectedId:  null,
      };
    }),

  setStatus: (id, status) =>
    set((s) => ({
      automations: s.automations.map((a) => (a.id === id ? { ...a, status } : a)),
    })),
}));