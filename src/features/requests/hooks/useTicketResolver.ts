// src/features/requests/hooks/useTicketResolver.ts
import { useQuery } from '@tanstack/react-query';
import { useGraphServices } from '@/graph/GraphServicesProvider';
import { useRole, canSeeBoard } from '@/auth/roles';
import { config } from '@/config';
import type { Request } from '../types';

export type TicketModalKind = 'kanban' | 'home' | 'loading' | 'not_found';

export type TicketResolverResult =
  | { kind: 'loading' }
  | { kind: 'not_found' }
  | { kind: 'kanban'; request: Request }
  | { kind: 'home';   request: Request };

export function useTicketResolver(ticketId: string | undefined): TicketResolverResult {
  const { Requests } = useGraphServices();
  const role         = useRole();

  const { data, isLoading, isError } = useQuery<Request>({
    queryKey: ['request', ticketId],
    queryFn:  () => Requests.fetchById(ticketId!),
    enabled:  !!ticketId && !config.USE_MOCK,
    staleTime: 0,
    retry: 1,
  });

  if (!ticketId)   return { kind: 'not_found' };
  if (isLoading)   return { kind: 'loading' };
  if (isError || !data) return { kind: 'not_found' };

  // Regla de seguridad: si el usuario no puede ver el board,
  // siempre ve el modal de solo lectura, sin importar desde qué link llegó.
  if (!canSeeBoard(role)) return { kind: 'home', request: data };

  return { kind: 'kanban', request: data };
}