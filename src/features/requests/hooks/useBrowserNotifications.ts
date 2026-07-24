// src/features/requests/hooks/useBrowserNotifications.ts
import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import type { Notification as AppNotification } from '@/types/commons';

export type BrowserPermission = 'default' | 'granted' | 'denied' | 'unsupported';

const IS_SUPPORTED = typeof window !== 'undefined' && 'Notification' in window;
const HAS_SW = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/* ── Permiso compartido entre instancias del hook ────────────────────────
   NotificationBell y NotificationPermissionPrompt montan este hook por
   separado. Con estado local, conceder el permiso en uno deja al otro con
   el valor viejo hasta recargar -> las nativas no se disparan. */
const permListeners = new Set<() => void>();
let permValue: BrowserPermission = IS_SUPPORTED
  ? (Notification.permission as BrowserPermission)
  : 'unsupported';

function setSharedPermission(next: BrowserPermission) {
  if (next === permValue) return;
  permValue = next;
  permListeners.forEach((l) => l());
}

const subscribePerm = (cb: () => void) => {
  permListeners.add(cb);
  return () => { permListeners.delete(cb); };
};

const getPermSnapshot = () => permValue;

/* Bonus: si el usuario cambia el permiso desde los ajustes del sitio,
   la UI se entera sin recargar. No todos los navegadores lo soportan. */
if (IS_SUPPORTED && typeof navigator !== 'undefined' && navigator.permissions?.query) {
  navigator.permissions
    .query({ name: 'notifications' as PermissionName })
    .then((status) => {
      status.onchange = () => {
        setSharedPermission(Notification.permission as BrowserPermission);
      };
    })
    .catch(() => { /* no soportado */ });
}

type Options = {
  enabled?:    boolean;
  icon?:       string;
  onActivate?: (n: AppNotification) => void;
};

/** URL destino para el click desde el SO cuando no hay ventana abierta. */
function targetUrlFor(n: AppNotification): string {
  if (n.type === 'export_ready') return '/';
  return n.requestId ? `/ticket/${n.requestId}` : '/';
}

/**
 * Muestra una notificacion nativa.
 *
 * Chrome Android PROHIBE `new Notification(...)` (tira Illegal constructor).
 * El unico camino que funciona en las dos plataformas es
 * ServiceWorkerRegistration.showNotification(). Dejamos el constructor solo
 * como fallback para dev, donde no hay SW registrado.
 */
async function showNative(
  n: AppNotification,
  icon: string,
  onActivate?: (n: AppNotification) => void,
): Promise<boolean> {
  const options: NotificationOptions = {
    body: n.body ?? undefined,
    icon,
    tag:  `prisma-notif-${n.notificationId}`,
    data: { notificationId: n.notificationId, url: targetUrlFor(n) },
  };

  if (HAS_SW) {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.active) {
        await reg.showNotification(n.title, options);
        return true;
      }
    } catch {
      /* cae al fallback */
    }
  }

  // Fallback: dev sin SW, o navegadores de escritorio antiguos.
  try {
    const native = new Notification(n.title, options);
    native.onclick = () => {
      window.focus();
      onActivate?.(n);
      native.close();
    };
    return true;
  } catch {
    return false;
  }
}

export function useBrowserNotifications(
  notifications: AppNotification[],
  { enabled = true, icon = '/prisma-192.png', onActivate }: Options = {},
) {
  const permission = useSyncExternalStore(
    subscribePerm,
    getPermSnapshot,
    () => 'unsupported' as BrowserPermission,
  );

  // Referencias frescas sin re-ejecutar efectos.
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  const notificationsRef = useRef(notifications);
  notificationsRef.current = notifications;

  const lastSeenId  = useRef<number | null>(null);
  const initialized = useRef(false);

  const requestPermission = useCallback(async (): Promise<BrowserPermission> => {
    if (!IS_SUPPORTED) return 'unsupported';
    try {
      const result = (await Notification.requestPermission()) as BrowserPermission;
      setSharedPermission(result);
      return result;
    } catch {
      // Safari viejo usa callback en vez de promise
      const current = Notification.permission as BrowserPermission;
      setSharedPermission(current);
      return current;
    }
  }, []);

  /* ── Click en la notificacion cuando la mostro el service worker ────────
     El SW no puede navegar la SPA por si mismo: nos avisa por postMessage
     y reusamos la misma logica de activacion que el panel. */
  useEffect(() => {
    if (!HAS_SW) return;

    const handler = (event: MessageEvent) => {
      if (event.data?.type !== 'prisma:notification-click') return;
      const id = event.data.notificationId as number | null;
      if (id == null) return;
      const found = notificationsRef.current.find((n) => n.notificationId === id);
      if (found) onActivateRef.current?.(found);
    };

    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, []);

  /* ── Disparo de notificaciones nuevas ─────────────────────────────────── */
  useEffect(() => {
    if (!IS_SUPPORTED || !enabled || permission !== 'granted') return;
    if (notifications.length === 0) return;

    const maxId = Math.max(...notifications.map((n) => n.notificationId));

    // Primera corrida: fija la linea base, no dispara lo ya existente.
    if (!initialized.current) {
      initialized.current = true;
      lastSeenId.current  = maxId;
      return;
    }

    const baseline = lastSeenId.current ?? 0;
    const fresh = notifications
      .filter((n) => n.notificationId > baseline && !n.isRead)
      .sort((a, b) => a.notificationId - b.notificationId); // mas viejas primero

    if (fresh.length === 0) {
      lastSeenId.current = maxId;
      return;
    }

    let cancelled = false;

    void (async () => {
      for (const n of fresh) {
        if (cancelled) return;
        await showNative(n, icon, onActivateRef.current);
      }
      // Solo avanzamos la base despues de intentar mostrarlas todas.
      if (!cancelled) lastSeenId.current = maxId;
    })();

    return () => { cancelled = true; };
  }, [notifications, permission, enabled, icon]);

  return { isSupported: IS_SUPPORTED, permission, requestPermission };
}