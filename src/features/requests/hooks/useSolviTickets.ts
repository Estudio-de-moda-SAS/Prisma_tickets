// src/features/requests/hooks/useSolviTickets.ts
import { useInfiniteQuery, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { compressImage } from '@/lib/compressImage';
import { apiClient } from '@/lib/apiClient';
import { supabase } from '@/lib/supabaseClient';

/**
 * Hooks de TanStack Query para los tickets de Solvi.
 *
 * Cubre el listado paginado por cursor con búsqueda global
 * ({@link useSolviTickets}), una vista previa acotada
 * ({@link useSolviTicketsPreview}), el detalle de un ticket con seguimientos y
 * adjuntos ({@link useSolviTicketDetail}), la subida de adjuntos con compresión
 * ({@link useUploadSolviAttachment}) y una lectura directa de adjuntos
 * ({@link fetchTicketAttachments}).
 *
 * @module useSolviTickets
 */

/** Un ticket de Solvi (campos principales). */
export type SolviTicket = {
  ticket_solvi_id:                 number;
  ticket_solvi_titulo:             string;
  ticket_solvi_estado:             string | null;
  ticket_solvi_fuente:             string | null;
  ticket_solvi_solicitante:        string | null;
  ticket_solvi_correo_solicitante: string | null;
  ticket_solvi_resolutor:          string | null;
  ticket_solvi_categoria:          string | null;
  ticket_solvi_subcategoria:       string | null;
  ticket_solvi_ans:                string | null;
  ticket_solvi_fechaapertura:      string | null;
  ticket_solvi_fechamaxima:        string | null;
  FechaCierreReal:                 string | null;
};

/** Cursor de paginación por fecha + id. */
type SolviCursor = { fecha: string | null; id: number };
/** Página de resultados con su cursor al siguiente bloque. */
type SolviPage = { items: SolviTicket[]; nextCursor: SolviCursor | null };

/**
 * Listado paginado (infinite) de tickets de Solvi, con búsqueda global.
 *
 * @remarks
 * La `search` se resuelve en el backend sobre toda la tabla. Pagina por cursor
 * (`nextCursor`) en bloques de 300. `staleTime` de 30s.
 *
 * @param search - Término de búsqueda global (vacío = sin filtro).
 * @returns El resultado de `useInfiniteQuery` con las páginas de tickets.
 */
export function useSolviTickets(search: string) {
  return useInfiniteQuery<SolviPage>({
    queryKey: ['solviTickets', search],
    queryFn: ({ pageParam }) =>
      apiClient.call<SolviPage>('fetchSolviTickets', {
        cursor: pageParam ?? null,
        limit: 300,
        search: search || undefined,
      }),
    initialPageParam: null as SolviCursor | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    staleTime: 30_000,
  });
}

/**
 * Vista previa acotada de tickets de Solvi (sin paginación).
 *
 * @remarks
 * Trae solo los `items` de la primera página hasta `limit`. `staleTime` de 30s.
 *
 * @param limit - Máximo de tickets a traer (por defecto 200).
 * @returns El resultado de `useQuery` con la lista de tickets.
 */
export function useSolviTicketsPreview(limit = 200) {
  return useQuery<SolviTicket[]>({
    queryKey: ['solviTicketsPreview', limit],
    queryFn: async () => {
      const page = await apiClient.call<{ items: SolviTicket[] }>('fetchSolviTickets', { limit });
      return page.items;
    },
    staleTime: 30_000,
  });
}

/** Un seguimiento (acción registrada) de un ticket de Solvi. */
export type SolviSeguimiento = {
  seguimientos_solvi_id:             number;
  seguimientos_solvi_id_ticket:      number;
  seguimientos_solvi_tipo_de_accion: string | null;
  seguimientos_solvi_action_date:    string | null;
  seguimientos_solvi_descripcion:    string | null;
  seguimientos_solvi_correo_actor:   string | null;
  seguimientos_solvi_actor:          string | null;
};

/** Un adjunto de un ticket de Solvi, con su URL firmada si aplica. */
export type SolviAttachment = {
  id:              number;
  created_at:      string;
  attachment_path: string | null;
  attachment_type: string | null;
  id_ticket:       number | null;
  seguimiento_id:  number | null;
  storage_bucket:  string | null;
  file_name:       string | null;
  signedUrl:       string | null;
};

/**
 * Ticket completo: todos los campos de `TBL_Ticket_Solvi` (record abierto).
 *
 * @remarks
 * Modelado como `Record<string, unknown>` porque trae todas las columnas; solo
 * `ticket_solvi_id` está garantizado.
 */
export type SolviTicketFull = Record<string, unknown> & { ticket_solvi_id: number };

/** Detalle de un ticket: el ticket completo, sus seguimientos y adjuntos. */
export type SolviTicketDetail = {
  ticket:       SolviTicketFull;
  seguimientos: SolviSeguimiento[];
  attachments:  SolviAttachment[];
};

/**
 * Lee el detalle completo de un ticket de Solvi.
 *
 * @remarks
 * Se deshabilita si `id` es `null`. `staleTime` de 30s.
 *
 * @param id - ID del ticket, o `null` para no consultar.
 * @returns El resultado de `useQuery` con el {@link SolviTicketDetail}.
 */
export function useSolviTicketDetail(id: number | null) {
  return useQuery<SolviTicketDetail>({
    queryKey: ['solviTicketDetail', id],
    queryFn:  () => apiClient.call<SolviTicketDetail>('fetchSolviTicketDetail', { id }),
    enabled:  id != null,
    staleTime: 30_000,
  });
}

/**
 * Sube un adjunto a un ticket de Solvi (con compresión de imágenes).
 *
 * @remarks
 * Comprime las imágenes antes de subir; PDF y video pasan sin cambios (y
 * `compressImage` lanza si superan 20 MB). Luego lee el archivo con `FileReader`
 * y lo envía como base64. En `onSuccess` invalida el detalle del ticket.
 *
 * @returns El objeto de mutación de React Query. Variables: `{ ticketId, userId, file }`.
 */
export function useUploadSolviAttachment() {
  const qc = useQueryClient();
  return useMutation<SolviAttachment, Error, { ticketId: number; userId: number; file: File }>({
    mutationFn: async ({ ticketId, userId, file }) => {
      const compressed = await compressImage(file); // imágenes se comprimen; PDF/video pasan derecho (throw si > 20 MB)
      return new Promise<SolviAttachment>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = (reader.result as string).split(',')[1];
            const result = await apiClient.call<SolviAttachment>('uploadSolviAttachment', {
              ticketId,
              userId,
              fileName:  compressed.name,
              mimeType:  compressed.type,
              sizeBytes: compressed.size,
              base64,
            });
            resolve(result);
          } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
          }
        };
        reader.onerror = () => reject(new Error('Error leyendo el archivo'));
        reader.readAsDataURL(compressed);
      });
    },
    onSuccess: (_data, { ticketId }) => {
      qc.invalidateQueries({ queryKey: ['solviTicketDetail', ticketId] });
    },
  });
}

/**
 * Lee directamente los adjuntos de un ticket desde Supabase (sin `apiClient`).
 *
 * @remarks
 * Consulta `TBL_Ticket_Attachments_Solvi` filtrando por `id_ticket`, ordenados
 * por fecha de creación ascendente. No es un hook: es una función suelta para
 * usos puntuales fuera del ciclo de React Query.
 *
 * @param id - ID del ticket.
 * @returns Los adjuntos del ticket.
 * @throws Si falta el `id` o si la consulta falla.
 */
export async function fetchTicketAttachments(id: number): Promise<SolviAttachment[]> {
    if (id == null) throw new Error('Falta el id del ticket.');

    const { data: attachments, error: aErr } = await supabase
      .from('TBL_Ticket_Attachments_Solvi')
      .select("*")
      .eq('id_ticket', id)
      .order('created_at', { ascending: true });
    if (aErr) throw new Error(aErr.message);

  return attachments
}