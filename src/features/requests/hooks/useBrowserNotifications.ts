// src/features/requests/hooks/useBrowserNotifications.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import type { Notification as AppNotification } from '@/types/commons';

export type BrowserPermission = 'default' | 'granted' | 'denied' | 'unsupported';

const IS_SUPPORTED = typeof window !== 'undefined' && 'Notification' in window;

type Options = {
  enabled?:    boolean;
  icon?:       string;
  onActivate?: (n: AppNotification) => void;
};

export function useBrowserNotifications(
  notifications: AppNotification[],
  { enabled = true, icon = '/favicon.ico', onActivate }: Options = {},
) {
  const [permission, setPermission] = useState<BrowserPermission>(
    IS_SUPPORTED ? (Notification.permission as BrowserPermission) : 'unsupported',
  );

  // Mantiene la referencia fresca sin re-ejecutar el efecto
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  const lastSeenId  = useRef<number | null>(null);
  const initialized = useRef(false);

  const requestPermission = useCallback(async (): Promise<BrowserPermission> => {
    if (!IS_SUPPORTED) return 'unsupported';
    try {
      const result = (await Notification.requestPermission()) as BrowserPermission;
      setPermission(result);
      return result;
    } catch {
      // Safari viejo usa callback en vez de promise
      const current = Notification.permission as BrowserPermission;
      setPermission(current);
      return current;
    }
  }, []);

  useEffect(() => {
    if (!IS_SUPPORTED || !enabled || permission !== 'granted') return;
    if (notifications.length === 0) return;

    const maxId = Math.max(...notifications.map((n) => n.notificationId));

    // Primera corrida: fija la línea base y NO dispara nada de lo ya existente
    if (!initialized.current) {
      initialized.current = true;
      lastSeenId.current  = maxId;
      return;
    }

    const baseline = lastSeenId.current ?? 0;
    const fresh = notifications
      .filter((n) => n.notificationId > baseline && !n.isRead)
      .sort((a, b) => a.notificationId - b.notificationId); // más viejas primero

    for (const n of fresh) {
      try {
        const native = new Notification(n.title, {
          body: n.body ?? undefined,
          icon,
          tag:  `prisma-notif-${n.notificationId}`, // evita duplicados del SO
        });
        native.onclick = () => {
          window.focus();
          onActivateRef.current?.(n);
          native.close();
        };
      } catch {
        /* algunos navegadores lanzan si se abusa; se ignora en silencio */
      }
    }

    // Avanzamos la base a TODO lo visto (leído o no) para no re-evaluar
    lastSeenId.current = maxId;
  }, [notifications, permission, enabled, icon]);

  return { isSupported: IS_SUPPORTED, permission, requestPermission };
}