// src/features/requests/hooks/useAcceptanceCriteria.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { AcceptanceCriteria } from '@/types/commons';
import type { Request } from '../types';

export const criteriaKeys = {
  byRequest: (requestId: string) => ['acceptance-criteria', requestId] as const,
};

type CriteriaSummary = { total: number; accepted: number; rejected: number } | null;

type SnapshotContext = { snapshot: AcceptanceCriteria[] | undefined };
type DeleteVars      = { criteriaId: number };
type UpdateTitleVars = { criteriaId: number; title: string };

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
 * Recorre todas las cachés bajo ['requests'] tolerando las dos formas que
 * existen: BoardData (objeto columna → Request[]) y Request[] plano.
 * Las cachés que no son ninguna de las dos (ej. historial-count) se dejan intactas.
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

/** Escribe la lista de criterios y mantiene el badge del board en sync. */
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

export function useAcceptanceCriteria(requestId: string | null | undefined) {
  return useQuery<AcceptanceCriteria[]>({
    queryKey: criteriaKeys.byRequest(requestId ?? ''),
    queryFn:  () => apiClient.call('fetchAcceptanceCriteria', { requestId }),
    enabled:  !!requestId,
    staleTime: 30_000,
  });
}

/* ── Crear ─────────────────────────────────────────────────── */

type CreateContext = { snapshot: AcceptanceCriteria[] | undefined; tempId: number };

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

type UpdateStatusPayload = {
  criteriaId:    number;
  status:        'accepted' | 'rejected' | 'pending';
  reviewedBy:    number;
  reviewerNotes?: string;
};

type UpdateStatusContext = { snapshot: AcceptanceCriteria[] | undefined };

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