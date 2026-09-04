// src/features/requests/hooks/useMySolviTickets.ts
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

/**
 * Hooks de solo lectura para los tickets de Solvi del usuario.
 *
 * Expone {@link useMySolviTickets} (tickets del usuario por correo) y
 * {@link useMySolviMentions} (tickets donde el usuario fue mencionado).
 *
 * @module useMySolviTickets
 */

/** Un ticket de Solvi tal como viene de la base. */
export type MySolviTicket = {
  ticket_solvi_id:            number;
  ticket_solvi_titulo:        string;
  ticket_solvi_estado:        string | null;
  ticket_solvi_categoria:     string | null;
  ticket_solvi_resolutor:     string | null;
  ticket_solvi_fechaapertura: string | null;
};

/**
 * Lista los tickets de Solvi del usuario, identificados por su correo.
 *
 * @remarks
 * Se deshabilita si no hay `email`. `staleTime` de 30s.
 *
 * @param email - Correo del usuario, o `null`/`undefined` para no consultar.
 * @returns El resultado de `useQuery` con los tickets del usuario.
 */
export function useMySolviTickets(email: string | null | undefined) {
  return useQuery<MySolviTicket[]>({
    queryKey:  ['my-solvi-tickets', email],
    queryFn:   () => apiClient.call<MySolviTicket[]>('fetchMySolviTickets', { email }),
    enabled:   !!email,
    staleTime: 30_000,
  });
}

/**
 * Lista los tickets de Solvi donde el usuario fue mencionado.
 *
 * @remarks
 * Se deshabilita si no hay `userId`. `staleTime` de 15s (más corto que el de
 * tickets propios, para reflejar menciones nuevas antes).
 *
 * @param userId - ID del usuario, o `null`/`undefined` para no consultar.
 * @returns El resultado de `useQuery` con los tickets donde se le mencionó.
 */
export function useMySolviMentions(userId: number | null | undefined) {
  return useQuery<MySolviTicket[]>({
    queryKey:  ['my-solvi-mentions', userId],
    queryFn:   () => apiClient.call<MySolviTicket[]>('fetchMySolviMentions', { userId }),
    enabled:   !!userId,
    staleTime: 15_000,
  });
}