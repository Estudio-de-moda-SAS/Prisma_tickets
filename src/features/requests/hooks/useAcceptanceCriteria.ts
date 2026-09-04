// src/features/requests/hooks/useAcceptanceCriteria.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { AcceptanceCriteria } from '@/types/commons';
import type { Request } from '../types';

/**
 * Hooks de TanStack Query para los criterios de aceptación de un request.
 *
 * Expone la query de lectura ({@link useAcceptanceCriteria}) y las mutaciones de
 * crear, cambiar estado, eliminar y editar título, todas con actualización
 * optimista. Además mantiene sincronizado el `criteriaSummary` (badge del board y
 * detalle del ticket) al vuelo.
 *
 * @module useAcceptanceCriteria
 */

/** Fábrica de query keys de criterios, agrupadas por request. */
export const criteriaKeys = {
  byRequest: (requestId: string) => ['acceptance-criteria', requestId] as const,
};

/** Resumen de conteo de criterios, o `null` cuando no hay ninguno. */
type CriteriaSummary = { total: number; accepted: number; rejected: number } | null;

/** Contexto de rollback: snapshot de la lista previa a la mutación. */
type SnapshotContext = { snapshot: AcceptanceCriteria[] | undefined };
/** Variables de la mutación de borrado. */
type DeleteVars      = { criteriaId: number };
/** Variables de la mutación de edición de título. */
type UpdateTitleVars = { criteriaId: number; title: string };

/**
 * Recalcula el resumen de conteo a partir de la lista de criterios.
 *
 * @remarks
 * Sigue el mismo criterio que `mapRowToRequest`: 0 criterios → `null`.
 *
 * @param list - Lista de criterios.
 * @returns El resumen `{ total, accepted, rejected }`, o `null` si la lista está vacía.
 */
function recalcSummary(list: AcceptanceCriteria[]): CriteriaSummary {
  if (list.length === 0) return null; // mismo criterio que mapRowToRequest: 0 criterios → null
  return {
    total:    list.length,
    accepted: list.filter((c) => c.status === 'accepted').length,
    rejected: list.filter((c) => c.status === 'rejected').length,
  };
}

/**
 * Propaga el conteo de criterios al badge del board y al detalle del ticket.
 *
 * @remarks
 * Recorre todas las cachés bajo `['requests']` tolerando las dos formas que
 * existen: `BoardData` (objeto columna → `Request[]`) y `Request[]` plano. Las
 * cachés que no son ninguna de las dos (p. ej. historial-count) se dejan
 * intactas. También parchea la caché de detalle `['request', requestId]`. Solo
 * reemplaza referencias cuando realmente encuentra el request, para no invalidar
 * memos innecesariamente.
 *
 * @param qc - Cliente de React Query.
 * @param requestId - ID del request a actualizar.
 * @param list - Lista actual de criterios (de la que se recalcula el resumen).
 */
function syncCriteriaSummary(qc: QueryClient, requestId: string, list: AcceptanceCriteria[]): void {
  const criteriaSummary = recalcSummary(list);
  const patch = (r: Request): Request => (r?.id === requestId ? { ...r, criteriaSummary } : r);

  qc.setQueriesData<unknown>({ queryKey: ['requests'] }, (prev: unknown) => {
    if (!prev || typeof prev !== 'object') return prev;

    if (Array.isArray(prev)) {
      const arr = prev as Request[];
      return arr.some((r) => r?.id === requestId) ? arr.map(patch) : prev;
    }

    const board = prev as Record<string, unknown>;
    let touched = false;
    const next: Record<string, unknown> = {};
    for (const [col, val] of Object.entries(board)) {
      if (Array.isArray(val) && (val as Request[]).some((r) => r?.id === requestId)) {
        touched = true;
        next[col] = (val as Request[]).map(patch);
      } else {
        next[col] = val;
      }
    }
    return touched ? next : prev;
  });

  qc.setQueryData<Request>(['request', requestId], (prev) =>
    prev ? { ...prev, criteriaSummary } : prev,
  );
}

/**
 * Escribe la lista de criterios en caché y mantiene el badge del board en sync.
 *
 * @remarks
 * Aplica `updater` sobre la lista actual (o `[]`), guarda el resultado bajo la
 * key del request y dispara {@link syncCriteriaSummary}. Es la única vía usada
 * por las mutaciones para tocar la caché de criterios, de modo que el resumen
 * siempre quede consistente.
 *
 * @param qc - Cliente de React Query.
 * @param requestId - ID del request.
 * @param updater - Función que transforma la lista previa en la nueva.
 */
function writeCriteria(
  qc: QueryClient,
  requestId: string,
  updater: (prev: AcceptanceCriteria[]) => AcceptanceCriteria[],
): void {
  const key  = criteriaKeys.byRequest(requestId);
  const next = updater(qc.getQueryData<AcceptanceCriteria[]>(key) ?? []);
  qc.setQueryData<AcceptanceCriteria[]>(key, next);
  syncCriteriaSummary(qc, requestId, next);
}

/**
 * Lee los criterios de aceptación de un request.
 *
 * @remarks
 * La query se deshabilita si `requestId` es falsy. `staleTime` de 30s.
 *
 * @param requestId - ID del request, o `null`/`undefined` para no consultar.
 * @returns El resultado de `useQuery` con la lista de criterios.
 */
export function useAcceptanceCriteria(requestId: string | null | undefined) {
  return useQuery<AcceptanceCriteria[]>({
    queryKey: criteriaKeys.byRequest(requestId ?? ''),
    queryFn:  () => apiClient.call('fetchAcceptanceCriteria', { requestId }),
    enabled:  !!requestId,
    staleTime: 30_000,
  });
}

/* ── Crear ─────────────────────────────────────────────────── */

/** Contexto de la creación optimista: snapshot previo + id temporal insertado. */
type CreateContext = { snapshot: AcceptanceCriteria[] | undefined; tempId: number };

/**
 * Mutación para crear un criterio de aceptación (optimista).
 *
 * @remarks
 * En `onMutate` inserta un criterio temporal con `tempId` negativo (para no
 * chocar con un `Criteria_ID` real) y estado `pending`. En `onSuccess` reemplaza
 * el temporal por el registro real devuelto por el servidor. En `onError`
 * restaura el snapshot.
 *
 * @param requestId - ID del request al que pertenece el criterio.
 * @param actorId - Usuario que realiza la acción (opcional).
 * @returns El objeto de mutación de React Query.
 */
export function useCreateCriteria(requestId: string, actorId?: number) {
  const qc = useQueryClient();

  return useMutation<AcceptanceCriteria, Error, { title: string }, CreateContext>({
    mutationFn: ({ title }) =>
      apiClient.call('createAcceptanceCriteria', { requestId, title, actorId }),

    onMutate: async ({ title }): Promise<CreateContext> => {
      const key = criteriaKeys.byRequest(requestId);
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<AcceptanceCriteria[]>(key);
      const tempId   = -Date.now(); // negativo → nunca choca con un Criteria_ID real
      const nowIso   = new Date().toISOString();

      writeCriteria(qc, requestId, (prev) => [
        ...prev,
        {
          criteriaId:    tempId,
          requestId,
          title:         title.trim(),
          status:        'pending',
          reviewerNotes: null,
          reviewedBy:    null,
          reviewedAt:    null,
          createdAt:     nowIso,
          updatedAt:     nowIso,
        } as AcceptanceCriteria,
      ]);

      return { snapshot, tempId };
    },

    onSuccess: (created, _vars, ctx) => {
      writeCriteria(qc, requestId, (prev) =>
        prev.map((c) => (c.criteriaId === ctx?.tempId ? created : c)),
      );
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) writeCriteria(qc, requestId, () => ctx.snapshot!);
    },
  });
}

/* ── Cambiar estado ────────────────────────────────────────── */

/** Payload para cambiar el estado de un criterio. */
type UpdateStatusPayload = {
  criteriaId:    number;
  status:        'accepted' | 'rejected' | 'pending';
  reviewedBy:    number;
  reviewerNotes?: string;
};

/** Contexto de rollback para el cambio de estado. */
type UpdateStatusContext = { snapshot: AcceptanceCriteria[] | undefined };

/**
 * Mutación para cambiar el estado (accepted/rejected/pending) de un criterio (optimista).
 *
 * @remarks
 * `onMutate` aplica el nuevo estado y notas en caché; `onSuccess` reemplaza con
 * el registro del servidor; `onError` restaura el snapshot. El `requestId` se
 * envía en el payload al backend: sin él no se dispara ni la notificación ni el
 * registro de historial.
 *
 * @param requestId - ID del request al que pertenecen los criterios.
 * @returns El objeto de mutación de React Query.
 */
export function useUpdateCriteriaStatus(requestId: string) {
  const qc = useQueryClient();

  return useMutation<AcceptanceCriteria, Error, UpdateStatusPayload, UpdateStatusContext>({
    mutationFn: ({ criteriaId, status, reviewedBy, reviewerNotes }) =>
      apiClient.call('updateAcceptanceCriteriaStatus', {
        criteriaId,
        status,
        reviewedBy,
        reviewerNotes: reviewerNotes ?? null,
        requestId,   // ← faltaba: sin esto no dispara ni notificación ni historia
      }),

    onMutate: async ({ criteriaId, status, reviewerNotes }): Promise<UpdateStatusContext> => {
      const key = criteriaKeys.byRequest(requestId);
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<AcceptanceCriteria[]>(key);

      writeCriteria(qc, requestId, (prev) =>
        prev.map((c) =>
          c.criteriaId === criteriaId
            ? { ...c, status, reviewerNotes: reviewerNotes ?? c.reviewerNotes }
            : c,
        ),
      );

      return { snapshot };
    },

    onSuccess: (updated) => {
      writeCriteria(qc, requestId, (prev) =>
        prev.map((c) => (c.criteriaId === updated.criteriaId ? updated : c)),
      );
    },

    onError: (_err, _payload, ctx) => {
      if (ctx?.snapshot) writeCriteria(qc, requestId, () => ctx.snapshot!);
    },
  });
}

/* ── Eliminar ──────────────────────────────────────────────── */

/**
 * Mutación para eliminar un criterio (optimista).
 *
 * @remarks
 * `onMutate` quita el criterio de la caché; `onError` restaura el snapshot. No
 * define `onSuccess` porque la eliminación optimista ya deja la caché en el
 * estado final esperado.
 *
 * @param requestId - ID del request al que pertenece el criterio.
 * @param actorId - Usuario que realiza la acción (opcional).
 * @returns El objeto de mutación de React Query.
 */
export function useDeleteCriteria(requestId: string, actorId?: number) {
  const qc = useQueryClient();

  return useMutation<{ ok: boolean }, Error, DeleteVars, SnapshotContext>({
    mutationFn: ({ criteriaId }) =>
      apiClient.call('deleteAcceptanceCriteria', { criteriaId, actorId }),

    onMutate: async ({ criteriaId }) => {
      const key = criteriaKeys.byRequest(requestId);
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<AcceptanceCriteria[]>(key);

      writeCriteria(qc, requestId, (prev) =>
        prev.filter((c) => c.criteriaId !== criteriaId),
      );

      return { snapshot };
    },

    onError: (_err, _payload, ctx) => {
      if (ctx?.snapshot) writeCriteria(qc, requestId, () => ctx.snapshot!);
    },
  });
}

/* ── Editar título ─────────────────────────────────────────── */

/**
 * Mutación para editar el título de un criterio (optimista).
 *
 * @remarks
 * `onMutate` aplica el nuevo título en caché; `onSuccess` reemplaza con el
 * registro del servidor; `onError` restaura el snapshot.
 *
 * @param requestId - ID del request al que pertenece el criterio.
 * @param actorId - Usuario que realiza la acción (opcional).
 * @returns El objeto de mutación de React Query.
 */
export function useUpdateCriteriaTitle(requestId: string, actorId?: number) {
  const qc = useQueryClient();

  return useMutation<AcceptanceCriteria, Error, UpdateTitleVars, SnapshotContext>({
    mutationFn: ({ criteriaId, title }) =>
      apiClient.call('updateCriteriaTitle', { criteriaId, title, actorId }),

    onMutate: async ({ criteriaId, title }) => {
      const key = criteriaKeys.byRequest(requestId);
      await qc.cancelQueries({ queryKey: key });
      const snapshot = qc.getQueryData<AcceptanceCriteria[]>(key);

      writeCriteria(qc, requestId, (prev) =>
        prev.map((c) => (c.criteriaId === criteriaId ? { ...c, title } : c)),
      );

      return { snapshot };
    },

    onSuccess: (updated) => {
      writeCriteria(qc, requestId, (prev) =>
        prev.map((c) => (c.criteriaId === updated.criteriaId ? updated : c)),
      );
    },

    onError: (_err, _payload, ctx) => {
      if (ctx?.snapshot) writeCriteria(qc, requestId, () => ctx.snapshot!);
    },
  });
}