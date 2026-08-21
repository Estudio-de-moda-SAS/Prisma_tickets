// src/features/requests/hooks/useBoardMetadata.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { TemplateExtraField, TemplateDefinition, TemplateVisual } from '@/features/requests/templates/types';

/**
 * Metadata de un board: equipos, etiquetas y plantillas.
 *
 * Reúne los tipos de DB (equipos, labels, templates), helpers para mapear una
 * plantilla de DB a su definición de UI ({@link mapBoardTemplateToDefinition} y
 * derivados, que reemplazan por completo al antiguo `registry.ts`), y los hooks
 * de TanStack Query de lectura y CRUD. Las mutaciones de labels y templates usan
 * actualización optimista con rollback por snapshot.
 *
 * @module useBoardMetadata
 */

/* ============================================================
   Tipos de DB
   ============================================================ */

/** Equipo/board tal como viene de la base (`TBL_Board_Teams`). */
export type BoardTeam = {
  Board_Team_ID:            number;
  Board_Team_Name:          string;
  Board_Team_Code:          string;
  Board_Team_Color:         string;
  Board_Team_Description:   string | null;
  Board_Team_Icon:          string;
  Board_Team_Is_Admin_Only: boolean;
  Board_Team_Is_External:   boolean;
  Board_Team_External_URL:  string | null;
  Board_Team_Is_Integration: boolean;
  Board_Team_Integration_Key: string | null;
  Board_Team_Sort_Order:    number;
  Board_Team_Is_Active:     boolean;
  Department_ID:            number | null;
  department?: { Department_ID: number; Department_Name: string } | null;
};

/**
 * `BoardTeam` junto con su departamento, tal como lo devuelve `fetchMyBoardTeams`
 * para armar los grupos del sidebar.
 *
 * @remarks
 * El join `department` puede venir `null`: representa un kanban sin departamento.
 */
export type MyBoardTeam = BoardTeam & {
  department: { Department_ID: number; Department_Name: string } | null;
};

/** Etiqueta de un board (`TBL_Labels`). */
export type BoardLabel = {
  Label_ID:    number;
  Label_Name:  string;
  Label_Color: string;
  Label_Icon:  string;
};

/** Plantilla de solicitud tal como viene de la base. */
export type BoardTemplate = {
  Request_Template_ID:          number;
  Request_Template_Name:        string;
  Request_Template_Description: string;
  Request_Template_Icon:        string;
  Request_Template_Color:       string;
  Request_Template_Badge:       string;
  Request_Template_Form_Schema: TemplateExtraField[];
  Request_Template_Teams:       number[];
  Request_Template_Is_Active:   boolean;
};

/** Payload para crear/actualizar una plantilla desde la UI (claves camelCase). */
export type TemplatePayload = {
  boardId:     number;
  name:        string;
  description: string;
  icon:        string;
  color:       string;
  badge:       string;
  formSchema:  TemplateExtraField[];
  teamIds:     number[];
  isActive:    boolean;
};

/* ============================================================
   Fallback
   ============================================================ */

/**
 * Definición de plantilla por defecto ("General").
 *
 * @remarks
 * La usa {@link getTemplateDefinition} cuando no se encuentra la plantilla
 * solicitada, para que la UI siempre tenga algo válido que renderizar.
 */
const FALLBACK_TEMPLATE: TemplateDefinition = {
  id:          0,
  nombre:      'General',
  descripcion: 'Solicitud general.',
  visual: {
    accentColor: '#00c8ff',
    icon:        '📋',
    badgeLabel:  'General',
  },
  extraFields: [],
  teamIds:     [],
  isActive:    true,
};

/* ============================================================
   Helpers — reemplazan registry.ts por completo
   ============================================================ */

/**
 * Mapea una plantilla de DB ({@link BoardTemplate}) a su definición de UI
 * ({@link TemplateDefinition}).
 *
 * @remarks
 * Aplica valores por defecto para color, ícono y badge si faltan.
 *
 * @param t - Plantilla cruda de la base.
 * @returns La definición de plantilla lista para la UI.
 */
export function mapBoardTemplateToDefinition(t: BoardTemplate): TemplateDefinition {
  return {
    id:          t.Request_Template_ID,
    nombre:      t.Request_Template_Name,
    descripcion: t.Request_Template_Description,
    visual: {
      accentColor: t.Request_Template_Color ?? '#00c8ff',
      icon:        t.Request_Template_Icon  ?? '📋',
      badgeLabel:  t.Request_Template_Badge ?? t.Request_Template_Name,
    } satisfies TemplateVisual,
    extraFields: t.Request_Template_Form_Schema ?? [],
    teamIds:     t.Request_Template_Teams       ?? [],
    isActive:    t.Request_Template_Is_Active   ?? true,
  };
}

/**
 * Resuelve la definición de una plantilla por ID dentro de una lista.
 *
 * @param templateId - ID de la plantilla buscada.
 * @param templates - Lista de plantillas disponibles.
 * @returns La definición encontrada, o {@link FALLBACK_TEMPLATE} si no existe.
 */
export function getTemplateDefinition(
  templateId: number,
  templates:  BoardTemplate[],
): TemplateDefinition {
  const found = templates.find((t) => t.Request_Template_ID === templateId);
  return found ? mapBoardTemplateToDefinition(found) : FALLBACK_TEMPLATE;
}

/**
 * Devuelve el color de acento de una plantilla.
 *
 * @param templateId - ID de la plantilla.
 * @param templates - Lista de plantillas disponibles.
 * @returns El `accentColor` de la definición (o el del fallback).
 */
export function getTemplateAccent(templateId: number, templates: BoardTemplate[]): string {
  return getTemplateDefinition(templateId, templates).visual.accentColor;
}

/**
 * Devuelve la etiqueta de badge de una plantilla.
 *
 * @param templateId - ID de la plantilla.
 * @param templates - Lista de plantillas disponibles.
 * @returns El `badgeLabel` de la definición (o el del fallback).
 */
export function getTemplateBadge(templateId: number, templates: BoardTemplate[]): string {
  return getTemplateDefinition(templateId, templates).visual.badgeLabel;
}

/* ============================================================
   Query keys
   ============================================================ */

/** Fábrica de query keys de plantillas, por board. */
const templateKeys = {
  all: (boardId: number) => ['boardTemplates', boardId] as const,
};

/** Fábrica de query keys de etiquetas, por board o por equipo. */
const labelKeys = {
  byTeam:  (boardId: number, teamId: number | null) => ['boardLabels', boardId, teamId] as const,
  byBoard: (boardId: number)                         => ['boardLabels', boardId]         as const,
};

/* ============================================================
   Hooks — Equipos
   ============================================================ */

/**
 * Lista todos los equipos/boards.
 *
 * @remarks
 * `staleTime: Infinity` (metadata estable; se invalida manualmente al mutar).
 *
 * @param boardId - Board de contexto (parte de la query key).
 * @returns El resultado de `useQuery` con los equipos.
 */
export function useBoardTeams(boardId: number) {
  return useQuery<BoardTeam[]>({
    queryKey:  ['boardTeams', boardId],
    queryFn:   () => apiClient.call<BoardTeam[]>('fetchAllTeams', {}),
    staleTime: Infinity,
    retry:     1,
  });
}

/**
 * Boards visibles para un usuario, ya filtrados server-side por su nivel de acceso.
 *
 * @remarks
 * El filtrado ocurre en el backend (admin → todos; grants → esos; TI sin grants
 * → todos; cliente → los de su departamento). Lo consume el sidebar. Devuelve
 * `[]` cuando el usuario no tiene ningún board visible, en cuyo caso el sidebar
 * cae a la vista limpia (solo Home / Nueva Solicitud / Mis Solicitudes). La query
 * se deshabilita si `userId` es `null`/`undefined`.
 *
 * @param userId - Usuario cuyos boards visibles se piden.
 * @returns El resultado de `useQuery` con los boards visibles.
 */
export function useMyBoardTeams(userId: number | null | undefined) {
  return useQuery<MyBoardTeam[]>({
    queryKey:  ['myBoardTeams', userId ?? null],
    queryFn:   () => apiClient.call<MyBoardTeam[]>('fetchMyBoardTeams', { userId }),
    enabled:   userId != null,
    staleTime: Infinity,
    retry:     1,
  });
}

/* ============================================================
   Hooks — Labels lectura
   ============================================================ */

/**
 * Lista las etiquetas de un board.
 *
 * @param boardId - Board cuyas etiquetas se listan.
 * @returns El resultado de `useQuery` con las etiquetas del board.
 */
export function useBoardLabels(boardId: number) {
  return useQuery<BoardLabel[]>({
    queryKey:  labelKeys.byBoard(boardId),
    queryFn:   () => apiClient.call<BoardLabel[]>('fetchLabelsByBoardId', { boardId }),
    staleTime: Infinity,
    retry:     1,
  });
}

/**
 * Lista las etiquetas de un equipo dentro de un board.
 *
 * @remarks
 * La query se deshabilita si `teamId` es `null`.
 *
 * @param boardId - Board de contexto.
 * @param teamId - Equipo cuyas etiquetas se listan, o `null` para no consultar.
 * @returns El resultado de `useQuery` con las etiquetas del equipo.
 */
export function useLabelsByTeamId(boardId: number, teamId: number | null) {
  return useQuery<BoardLabel[]>({
    queryKey: labelKeys.byTeam(boardId, teamId),
    queryFn:  () => apiClient.call<BoardLabel[]>('fetchLabelsByTeamId', { boardId, teamId }),
    enabled:  teamId !== null,
    staleTime: Infinity,
    retry:     1,
  });
}

/* ============================================================
   Hooks — Labels CRUD con optimistic updates
   ============================================================ */

/**
 * Crea una etiqueta (optimista).
 *
 * @remarks
 * `onMutate` inserta una etiqueta temporal con `Label_ID` negativo (para no
 * colisionar con IDs reales); `onError` restaura el snapshot; `onSettled`
 * invalida la caché del equipo para traer el registro real.
 *
 * @param boardId - Board de contexto.
 * @param teamId - Equipo al que pertenece la etiqueta (define la query key).
 * @returns El objeto de mutación de React Query.
 */
export function useCreateLabel(boardId: number, teamId: number | null) {
  const qc = useQueryClient();
  const qk = labelKeys.byTeam(boardId, teamId);

  return useMutation({
    mutationFn: (d: { name: string; color: string; icon: string }) =>
      apiClient.call<BoardLabel>('createLabel', { boardId, teamId, ...d }),

    onMutate: async (d) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<BoardLabel[]>(qk);

      // ID temporal negativo para no colisionar con IDs reales
      const tempLabel: BoardLabel = {
        Label_ID:    -Date.now(),
        Label_Name:  d.name,
        Label_Color: d.color,
        Label_Icon:  d.icon,
      };
      qc.setQueryData<BoardLabel[]>(qk, (prev) => [...(prev ?? []), tempLabel]);

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<BoardLabel[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

/**
 * Actualiza una etiqueta (optimista).
 *
 * @remarks
 * `onMutate` aplica los nuevos valores en caché; `onError` restaura el snapshot;
 * `onSettled` invalida la caché del equipo.
 *
 * @param boardId - Board de contexto.
 * @param teamId - Equipo al que pertenece la etiqueta (define la query key).
 * @returns El objeto de mutación de React Query.
 */
export function useUpdateLabel(boardId: number, teamId: number | null) {
  const qc = useQueryClient();
  const qk = labelKeys.byTeam(boardId, teamId);

  return useMutation({
    mutationFn: ({ id, ...d }: { id: number; name: string; color: string; icon: string }) =>
      apiClient.call('updateLabel', { id, ...d }),

    onMutate: async ({ id, ...d }) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<BoardLabel[]>(qk);

      qc.setQueryData<BoardLabel[]>(qk, (prev) =>
        prev?.map((l) => l.Label_ID === id
          ? { ...l, Label_Name: d.name, Label_Color: d.color, Label_Icon: d.icon }
          : l
        ) ?? []
      );

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<BoardLabel[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

/**
 * Elimina una etiqueta (optimista).
 *
 * @remarks
 * `onMutate` quita la etiqueta de la caché; `onError` restaura el snapshot;
 * `onSettled` invalida la caché del equipo.
 *
 * @param boardId - Board de contexto.
 * @param teamId - Equipo al que pertenece la etiqueta (define la query key).
 * @returns El objeto de mutación de React Query.
 */
export function useDeleteLabel(boardId: number, teamId: number | null) {
  const qc = useQueryClient();
  const qk = labelKeys.byTeam(boardId, teamId);

  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteLabel', { id }),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<BoardLabel[]>(qk);

      qc.setQueryData<BoardLabel[]>(qk, (prev) =>
        prev?.filter((l) => l.Label_ID !== id) ?? []
      );

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<BoardLabel[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

/* ============================================================
   Hooks — Templates lectura
   ============================================================ */

/**
 * Lista las plantillas de un board.
 *
 * @param boardId - Board cuyas plantillas se listan.
 * @returns El resultado de `useQuery` con las plantillas del board.
 */
export function useBoardTemplates(boardId: number) {
  return useQuery<BoardTemplate[]>({
    queryKey:  templateKeys.all(boardId),
    queryFn:   () => apiClient.call<BoardTemplate[]>('fetchTemplatesByBoardId', { boardId }),
    staleTime: Infinity,
    retry:     1,
  });
}

/* ============================================================
   Hooks — Templates CRUD con optimistic updates
   ============================================================ */

/**
 * Crea una plantilla (optimista).
 *
 * @remarks
 * `onMutate` inserta una plantilla temporal con `Request_Template_ID` negativo;
 * `onError` restaura el snapshot; `onSettled` invalida la caché del board.
 *
 * @param boardId - Board al que pertenece la plantilla.
 * @returns El objeto de mutación de React Query.
 */
export function useCreateTemplate(boardId: number) {
  const qc = useQueryClient();
  const qk = templateKeys.all(boardId);

  return useMutation({
    mutationFn: (payload: Omit<TemplatePayload, 'boardId'>) =>
      apiClient.call<BoardTemplate>('createTemplate', { boardId, ...payload }),

    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<BoardTemplate[]>(qk);

      const tempTemplate: BoardTemplate = {
        Request_Template_ID:          -Date.now(),
        Request_Template_Name:        payload.name,
        Request_Template_Description: payload.description,
        Request_Template_Icon:        payload.icon,
        Request_Template_Color:       payload.color,
        Request_Template_Badge:       payload.badge,
        Request_Template_Form_Schema: payload.formSchema,
        Request_Template_Teams:       payload.teamIds,
        Request_Template_Is_Active:   payload.isActive,
      };
      qc.setQueryData<BoardTemplate[]>(qk, (prev) => [...(prev ?? []), tempTemplate]);

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<BoardTemplate[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

/**
 * Actualiza una plantilla (optimista).
 *
 * @remarks
 * `onMutate` aplica los nuevos valores en caché; `onError` restaura el snapshot;
 * `onSettled` invalida la caché del board.
 *
 * @param boardId - Board al que pertenece la plantilla.
 * @returns El objeto de mutación de React Query.
 */
export function useUpdateTemplate(boardId: number) {
  const qc = useQueryClient();
  const qk = templateKeys.all(boardId);

  return useMutation({
    mutationFn: ({ id, ...payload }: { id: number } & Omit<TemplatePayload, 'boardId'>) =>
      apiClient.call('updateTemplate', { id, boardId, ...payload }),

    onMutate: async ({ id, ...payload }) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<BoardTemplate[]>(qk);

      qc.setQueryData<BoardTemplate[]>(qk, (prev) =>
        prev?.map((t) => t.Request_Template_ID === id
          ? {
              ...t,
              Request_Template_Name:        payload.name,
              Request_Template_Description: payload.description,
              Request_Template_Icon:        payload.icon,
              Request_Template_Color:       payload.color,
              Request_Template_Badge:       payload.badge,
              Request_Template_Form_Schema: payload.formSchema,
              Request_Template_Teams:       payload.teamIds,
              Request_Template_Is_Active:   payload.isActive,
            }
          : t
        ) ?? []
      );

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<BoardTemplate[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}

/**
 * Elimina una plantilla (optimista).
 *
 * @remarks
 * `onMutate` quita la plantilla de la caché; `onError` restaura el snapshot;
 * `onSettled` invalida la caché del board.
 *
 * @param boardId - Board al que pertenece la plantilla.
 * @returns El objeto de mutación de React Query.
 */
export function useDeleteTemplate(boardId: number) {
  const qc = useQueryClient();
  const qk = templateKeys.all(boardId);

  return useMutation({
    mutationFn: (id: number) => apiClient.call('deleteTemplate', { id }),

    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk });
      const snapshot = qc.getQueryData<BoardTemplate[]>(qk);

      qc.setQueryData<BoardTemplate[]>(qk, (prev) =>
        prev?.filter((t) => t.Request_Template_ID !== id) ?? []
      );

      return { snapshot };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.snapshot) qc.setQueryData<BoardTemplate[]>(qk, ctx.snapshot);
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk });
    },
  });
}