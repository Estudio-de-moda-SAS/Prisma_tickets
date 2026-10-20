// src/features/requests/hooks/useTransferTicket.ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import { requestKeys } from './useRequests';

/**
 * Hook de TanStack Query para transferir un ticket (solicitud PRISMA o ticket
 * SOLVI) a otro equipo vía la acción `transferTicket` de la Edge Function.
 *
 * @module useTransferTicket
 */

/** Payload de la acción `transferTicket` (espejo del backend). */
export type TransferTicketPayload = {
  source:   'request' | 'solvi';
  ticketId: string | number;
  /** `Board_Team_ID` del equipo destino. */
  toTeamId: number;
  reason:   string;
  notify:   boolean;
  actorId:  number;
};

/** Respuesta de la acción `transferTicket`. */
export type TransferTicketResult = {
  ok:         true;
  source:     TransferTicketPayload['source'];
  ticketId:   string | number;
  fromTeamId: number | null;
  toTeamId:   number;
  createdRequestId?: string | null;
  createdSolviTicketId?: number | null;
};

/**
 * Mutación de transferencia. Al terminar invalida los tableros de solicitudes
 * y las consultas de SOLVI para que el ticket aparezca en su nuevo equipo.
 */
export function useTransferTicket() {
  const queryClient = useQueryClient();
  return useMutation<TransferTicketResult, Error, TransferTicketPayload>({
    mutationFn: (payload) => apiClient.call<TransferTicketResult>('transferTicket', payload),
    onSuccess: (result, payload) => {
      queryClient.invalidateQueries({ queryKey: requestKeys.all });
      if (payload.source === 'solvi' || result.createdSolviTicketId != null) {
        queryClient.invalidateQueries({ queryKey: ['solviTickets'] });
        queryClient.invalidateQueries({ queryKey: ['solviTicketsPreview'] });
        queryClient.invalidateQueries({ queryKey: ['solviTicketDetail', payload.ticketId] });
      }
    },
  });
}
