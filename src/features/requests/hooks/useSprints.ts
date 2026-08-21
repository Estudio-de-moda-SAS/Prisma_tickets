// src/features/requests/hooks/useSprints.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { config } from '@/config';

/**
 * Hooks de TanStack Query para los sprints.
 *
 * Expone la query de listado ({@link useSprints}) y las mutaciones de crear,
 * actualizar y eliminar (todas optimistas, incluyendo las capacidades por
 * equipo), más el helper {@link sprintYear} para derivar el año de un sprint.
 *
 * @module useSprints
 */

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Capacidad externa de un equipo dentro de un sprint. */
export type SprintTeamCapacity = {
  Capacity_ID:       number | null;
  Board_Team_ID:     number;
  External_Capacity: number;
};

/** Entrada de capacidad por equipo al crear/actualizar un sprint. */
export type SprintCapacityInput = {
  teamId:   number;
  capacity: number;
};

/** Un sprint con sus capacidades por equipo (opcionales). */
export type Sprint = {
  Sprint_ID:         number;
  Sprint_Text:       string;
  Sprint_Start_Date: string;
  Sprint_End_Date:   string;
  capacities?:       SprintTeamCapacity[];
};

// ── Mock ─────────────────────────────────────────────────────────────────────

/** Sprints simulados para el modo mock. */
const MOCK_SPRINTS: Sprint[] = [
  {
    Sprint_ID:         1,
    Sprint_Text:       'Sprint 1',
    Sprint_Start_Date: '2026-04-01',
    Sprint_End_Date:   '2026-04-14',
    capacities:        [],
  },
  {
    Sprint_ID:         2,
    Sprint_Text:       'Sprint 2',
    Sprint_Start_Date: '2026-04-15',
    Sprint_End_Date:   '2026-04-30',
    capacities:        [],
  },
];

// ── Query key ────────────────────────────────────────────────────────────────

/** Query key de los sprints. */
const QK = ['sprints'] as const;

// ── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Lista los sprints.
 *
 * @remarks
 * En modo mock devuelve {@link MOCK_SPRINTS}. `staleTime` de 60s.
 *
 * @returns El resultado de `useQuery` con los sprints.
 */
export function useSprints() {
  return useQuery<Sprint[]>({
    queryKey: QK,
    queryFn:  config.USE_MOCK
      ? () => Promise.resolve(MOCK_SPRINTS)
      : () => apiClient.call<Sprint[]>('fetchSprints', {}),
    staleTime: 60_000,
    retry:     1,
  });
}

/**
 * Crea un sprint (optimista).
 *
 * @remarks
 * `onMutate` inserta un sprint temporal con `Sprint_ID` negativo, mapeando las
 * capacidades de entrada a filas con `Capacity_ID: null`; `onError` restaura el
 * snapshot; `onSettled` invalida la lista.
 *
 * @returns El objeto de mutación de React Query. Variables:
 *   `{ text, startDate, endDate, teamCapacities? }`.
 */
export function useCreateSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: { text: string; startDate: string; endDate: string; teamCapacities?: SprintCapacityInput[] }) =>
      apiClient.call<Sprint>('createSprint', {
        text:           s.text,
        startDate:      s.startDate,
        endDate:        s.endDate,
        teamCapacities: s.teamCapacities ?? [],
      }),

    onMutate: async (s) => {
      await qc.cancelQueries({ queryKey: QK });
      const snapshot = qc.getQueryData<Sprint[]>(QK);

      const tempSprint: Sprint = {
        Sprint_ID:         -Date.now(),
        Sprint_Text:       s.text,
        Sprint_Start_Date: s.startDate,
        Sprint_End_Date:   s.endDate,
        capacities:        (s.teamCapacities ?? []).map((tc) => ({
          Capacity_ID:       null,
          Board_Team_ID:     tc.teamId,
          External_Capacity: tc.capacity,
        })),
      };
      qc.setQueryData<Sprint[]>(QK, (prev) => [...(prev ?? []), tempSprint]);
      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<Sprint[]>(QK, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

/**
 * Actualiza un sprint (optimista).
 *
 * @remarks
 * `onMutate` aplica los nuevos valores en caché; al recomponer las capacidades,
 * conserva el `Capacity_ID` existente de cada equipo (si lo había) para no perder
 * la referencia; si no se envían `teamCapacities`, mantiene las actuales.
 * `onError` restaura el snapshot; `onSettled` invalida la lista.
 *
 * @returns El objeto de mutación de React Query. Variables:
 *   `{ id, text, startDate, endDate, teamCapacities? }`.
 */
export function useUpdateSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (s: { id: number; text: string; startDate: string; endDate: string; teamCapacities?: SprintCapacityInput[] }) =>
      apiClient.call('updateSprint', {
        id:             s.id,
        text:           s.text,
        startDate:      s.startDate,
        endDate:        s.endDate,
        teamCapacities: s.teamCapacities ?? [],
      }),

    onMutate: async (s) => {
      await qc.cancelQueries({ queryKey: QK });
      const snapshot = qc.getQueryData<Sprint[]>(QK);

      qc.setQueryData<Sprint[]>(QK, (prev) =>
        prev?.map((sp) =>
          sp.Sprint_ID === s.id
            ? {
                ...sp,
                Sprint_Text:       s.text,
                Sprint_Start_Date: s.startDate,
                Sprint_End_Date:   s.endDate,
                capacities: s.teamCapacities
                  ? s.teamCapacities.map((tc) => ({
                      Capacity_ID:       sp.capacities?.find((c) => c.Board_Team_ID === tc.teamId)?.Capacity_ID ?? null,
                      Board_Team_ID:     tc.teamId,
                      External_Capacity: tc.capacity,
                    }))
                  : sp.capacities,
              }
            : sp
        ) ?? []
      );
      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<Sprint[]>(QK, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

/**
 * Elimina un sprint (optimista).
 *
 * @remarks
 * `onMutate` quita el sprint de la caché; `onError` restaura el snapshot;
 * `onSettled` invalida la lista.
 *
 * @returns El objeto de mutación de React Query. Variables: `id` del sprint.
 */
export function useDeleteSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteSprint', { id }),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: QK });
      const snapshot = qc.getQueryData<Sprint[]>(QK);
      qc.setQueryData<Sprint[]>(QK, (prev) =>
        prev?.filter((sp) => sp.Sprint_ID !== id) ?? []
      );
      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<Sprint[]>(QK, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: QK });
    },
  });
}

/**
 * Deriva el año de un sprint.
 *
 * @remarks
 * Usa el año de `Sprint_Start_Date` si está presente; si no, busca un patrón
 * `(YYYY)` en el nombre (`Sprint_Text`).
 *
 * @param s - Sprint (fecha de inicio y texto).
 * @returns El año, o `null` si no se puede determinar.
 */
export function sprintYear(s: { Sprint_Start_Date: string | null; Sprint_Text: string }): number | null {
  if (s.Sprint_Start_Date) {
    const y = Number(s.Sprint_Start_Date.slice(0, 4));
    if (!Number.isNaN(y)) return y;
  }
  const m = s.Sprint_Text.match(/\((\d{4})\)/);
  return m ? Number(m[1]) : null;
}