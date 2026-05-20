// src/features/requests/hooks/useNotifications.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';
import type { Notification } from '@/types/commons';

type NotificationsResponse = {
  notifications: Notification[];
  unreadCount:   number;
};

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

const QUERY_KEY = (userId: number) => ['notifications', userId];
const POLL_INTERVAL_MS = 30_000;

export function useNotifications(userId: number | null) {
  const queryClient = useQueryClient();

  const query = useQuery<NotificationsResponse>({
    queryKey:    QUERY_KEY(userId ?? 0),
    enabled:     !!userId,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
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

