import { create } from 'zustand';

type AutomationUIState = {
  selectedId:  number | null;
  isModalOpen: boolean;
  selectItem:  (id: number | null) => void;
  openModal:   () => void;
  closeModal:  () => void;
};

export const useAutomationStore = create<AutomationUIState>((set) => ({
  selectedId:  null,
  isModalOpen: false,
  selectItem:  (selectedId) => set({ selectedId }),
  openModal:   () => set({ isModalOpen: true }),
  closeModal:  () => set({ isModalOpen: false, selectedId: null }),
}));