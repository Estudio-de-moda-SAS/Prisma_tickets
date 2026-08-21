// src/features/requests/hooks/useNotifications.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { Notification } from '@/types/commons';

/**
 * Hook de notificaciones in-app del usuario.
 *
 * Expone {@link useNotifications}, que combina una query con polling adaptativo
 * (más lento cuando la pestaña está en segundo plano), el mapeo de la fila cruda
 * de DB a {@link Notification}, y las mutaciones optimistas de marcar una o todas
 * como leídas. Devuelve una API compacta con lista, contador y acciones.
 *
 * @module useNotifications
 */

/** Respuesta ya mapeada de la query de notificaciones. */
type NotificationsResponse = {
  notifications: Notification[];
  unreadCount:   number;
};

/** Fila cruda de notificación tal como viene de la base. */
type RawNotification = {
  Notification_ID:         number;
  Notification_Type:       string;
  Notification_Title:      string;
  Notification_Body:       string | null;
  Notification_Request_ID: string | null;
  Notification_Is_Read:    boolean;
  Notification_Created_At: string;
  actor: {
    User_ID:         number;
    User_Name:       string;
    User_Avatar_url: string;
  } | null;
};

/**
 * Mapea una fila cruda de notificación a su DTO camelCase.
 *
 * @param raw - Fila de notificación de la base.
 * @returns La {@link Notification} con claves camelCase; `actor` en `null` si no hay.
 */
function mapNotification(raw: RawNotification): Notification {
  return {
    notificationId: raw.Notification_ID,
    type:           raw.Notification_Type as Notification['type'],
    title:          raw.Notification_Title,
    body:           raw.Notification_Body ?? null,
    requestId:      raw.Notification_Request_ID ?? null,
    isRead:         raw.Notification_Is_Read,
    createdAt:      raw.Notification_Created_At,
    actor:          raw.actor
      ? {
          userId:    raw.actor.User_ID,
          userName:  raw.actor.User_Name,
          avatarUrl: raw.actor.User_Avatar_url,
        }
      : null,
  };
}

/** Fábrica de la query key de notificaciones, por usuario. */
const QUERY_KEY = (userId: number) => ['notifications', userId];
/** Intervalo de polling con la pestaña visible (30s). */
const POLL_ACTIVE_MS     = 30_000;   // pestaña visible
/** Intervalo de polling con la pestaña en segundo plano (2 min). */
const POLL_BACKGROUND_MS = 120_000;  // pestaña en segundo plano (2 min)

/**
 * Notificaciones del usuario, con polling adaptativo y acciones de lectura.
 *
 * @remarks
 * La query se deshabilita sin `userId`. El `refetchInterval` es adaptativo: más
 * lento ({@link POLL_BACKGROUND_MS}) cuando la pestaña está oculta y más rápido
 * ({@link POLL_ACTIVE_MS}) cuando está visible; sigue refrescando en segundo
 * plano. `staleTime` de 20s. La `queryFn` pide hasta 40 notificaciones y las mapea
 * con {@link mapNotification}.
 *
 * Las mutaciones `markRead` y `markAllRead` son optimistas: actualizan `isRead` y
 * recalculan `unreadCount` en caché, con rollback por snapshot en error.
 *
 * @param userId - ID del usuario, o `null` para no consultar.
 * @returns `{ notifications, unreadCount, isLoading, markRead, markAllRead }`.
 */
export function useNotifications(userId: number | null) {
  const queryClient = useQueryClient();

const query = useQuery<NotificationsResponse>({
    queryKey:    QUERY_KEY(userId ?? 0),
    enabled:     !!userId,
    refetchInterval: () =>
      typeof document !== 'undefined' && document.visibilityState === 'hidden'
        ? POLL_BACKGROUND_MS
        : POLL_ACTIVE_MS,
    refetchIntervalInBackground: true,
    staleTime:   20_000,
    queryFn:     async () => {
      const raw = await apiClient.call<{ notifications: RawNotification[]; unreadCount: number }>(
        'getNotifications',
        { userId, limit: 40 },
      );
      return {
        notifications: raw.notifications.map(mapNotification),
        unreadCount:   raw.unreadCount,
      };
    },
  });
  
  const markRead = useMutation({
    mutationFn: (notificationId: number) =>
      apiClient.call('markNotificationRead', { notificationId, userId }),
    onMutate: async (notificationId) => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY(userId ?? 0) });
      const prev = queryClient.getQueryData<NotificationsResponse>(QUERY_KEY(userId ?? 0));
      queryClient.setQueryData<NotificationsResponse>(QUERY_KEY(userId ?? 0), (old) => {
        if (!old) return old;
        const updated = old.notifications.map((n) =>
          n.notificationId === notificationId ? { ...n, isRead: true } : n,
        );
        return {
          notifications: updated,
          unreadCount:   updated.filter((n) => !n.isRead).length,
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY(userId ?? 0), ctx.prev);
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => apiClient.call('markAllNotificationsRead', { userId }),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: QUERY_KEY(userId ?? 0) });
      const prev = queryClient.getQueryData<NotificationsResponse>(QUERY_KEY(userId ?? 0));
      queryClient.setQueryData<NotificationsResponse>(QUERY_KEY(userId ?? 0), (old) => {
        if (!old) return old;
        return {
          notifications: old.notifications.map((n) => ({ ...n, isRead: true })),
          unreadCount:   0,
        };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(QUERY_KEY(userId ?? 0), ctx.prev);
    },
  });

  return {
    notifications: query.data?.notifications ?? [],
    unreadCount:   query.data?.unreadCount   ?? 0,
    isLoading:     query.isLoading,
    markRead:      (id: number) => markRead.mutate(id),
    markAllRead:   () => markAllRead.mutate(),
  };
}