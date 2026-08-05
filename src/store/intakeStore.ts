// src/store/intakeStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type IntakeState = {
  /** Por board: IDs de tickets en sin_categorizar ya reconocidos (vistos). */
  seenByBoard: Record<string, string[]>;

  getSeen:     (boardId: string) => string[];
  /** Fija los IDs presentes como vistos, podando los que ya salieron. */
  acknowledge: (boardId: string, presentIds: string[]) => void;
};

export const useIntakeStore = create<IntakeState>()(
  persist(
    (set, get) => ({
      seenByBoard: {},

      getSeen: (boardId) => get().seenByBoard[boardId] ?? [],

      acknowledge: (boardId, presentIds) =>
        set((s) => ({
          seenByBoard: { ...s.seenByBoard, [boardId]: [...presentIds] },
        })),
    }),
    { name: 'prisma-intake-v1' },
  ),
);