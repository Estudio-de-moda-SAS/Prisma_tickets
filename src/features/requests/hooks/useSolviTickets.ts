// src/features/requests/hooks/useSolviTickets.ts
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

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

type SolviCursor = { fecha: string | null; id: number };
type SolviPage = { items: SolviTicket[]; nextCursor: SolviCursor | null };

// search: término de búsqueda global (se resuelve en backend sobre toda la tabla).
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
export type SolviSeguimiento = {
  seguimientos_solvi_id:             number;
  seguimientos_solvi_id_ticket:      number;
  seguimientos_solvi_tipo_de_accion: string | null;
  seguimientos_solvi_action_date:    string | null;
  seguimientos_solvi_descripcion:    string | null;
  seguimientos_solvi_correo_actor:   string | null;
  seguimientos_solvi_actor:          string | null;
};

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

// Ticket completo: todos los campos de TBL_Ticket_Solvi (record abierto).
export type SolviTicketFull = Record<string, unknown> & { ticket_solvi_id: number };

export type SolviTicketDetail = {
  ticket:       SolviTicketFull;
  seguimientos: SolviSeguimiento[];
  attachments:  SolviAttachment[];
};

export function useSolviTicketDetail(id: number | null) {
  return useQuery<SolviTicketDetail>({
    queryKey: ['solviTicketDetail', id],
    queryFn:  () => apiClient.call<SolviTicketDetail>('fetchSolviTicketDetail', { id }),
    enabled:  id != null,
    staleTime: 30_000,
  });
}