// src/features/requests/hooks/useMySolviTickets.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

export type MySolviTicket = {
  ticket_solvi_id:            number;
  ticket_solvi_titulo:        string;
  ticket_solvi_estado:        string | null;
  ticket_solvi_categoria:     string | null;
  ticket_solvi_resolutor:     string | null;
  ticket_solvi_fechaapertura: string | null;
};

export function useMySolviTickets(email: string | null | undefined) {
  return useQuery<MySolviTicket[]>({
    queryKey:  ['my-solvi-tickets', email],
    queryFn:   () => apiClient.call<MySolviTicket[]>('fetchMySolviTickets', { email }),
    enabled:   !!email,
    staleTime: 30_000,
  });
}