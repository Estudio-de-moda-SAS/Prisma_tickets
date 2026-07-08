// src/store/notifPromptStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type NotifPromptState = {
  dismissedForever: boolean;
  dismissForever:   () => void;
};

export const useNotifPromptStore = create<NotifPromptState>()(
  persist(
    (set) => ({
      dismissedForever: false,
      dismissForever:   () => set({ dismissedForever: true }),
    }),
    { name: 'prisma-notif-prompt' },
  ),
);