// src/features/requests/hooks/useBrowserNotifications.ts
import { useEffect, useRef, useCallback, useSyncExternalStore } from 'react';
import type { Notification as AppNotification } from '@/types/commons';

/**
 * Hook para disparar notificaciones nativas del navegador desde las notificaciones
 * de la app.
 *
 * @remarks
 * Resuelve varios problemas de plataforma:
 * - El permiso se mantiene en un store externo compartido, de modo que varias
 *   instancias del hook (p. ej. `NotificationBell` y `NotificationPermissionPrompt`)
 *   vean el mismo valor sin recargar.
 * - En Chrome Android `new Notification(...)` está prohibido; se usa
 *   `ServiceWorkerRegistration.showNotification()` cuando hay SW, con el
 *   constructor solo como fallback de desarrollo.
 * - El click de una notificación mostrada por el SW llega por `postMessage` y se
 *   reutiliza la misma lógica de activación del panel.
 *
 * @module useBrowserNotifications
 */

/** Estado del permiso de notificaciones; `'unsupported'` si el navegador no lo soporta. */
export type BrowserPermission = 'default' | 'granted' | 'denied' | 'unsupported';

/** `true` si la API de `Notification` está disponible en este entorno. */
const IS_SUPPORTED = typeof window !== 'undefined' && 'Notification' in window;
/** `true` si hay soporte de Service Worker. */
const HAS_SW = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;

/* ── Permiso compartido entre instancias del hook ────────────────────────
   NotificationBell y NotificationPermissionPrompt montan este hook por
   separado. Con estado local, conceder el permiso en uno deja al otro con
   el valor viejo hasta recargar -> las nativas no se disparan. */

/** Listeners suscritos al store de permiso (patrón `useSyncExternalStore`). */
const permListeners = new Set<() => void>();
/** Valor actual del permiso, compartido entre todas las instancias del hook. */
let permValue: BrowserPermission = IS_SUPPORTED
  ? (Notification.permission as BrowserPermission)
  : 'unsupported';

/**
 * Actualiza el permiso compartido y notifica a los suscriptores.
 *
 * @param next - Nuevo valor de permiso. No hace nada si no cambió.
 */
function setSharedPermission(next: BrowserPermission) {
  if (next === permValue) return;
  permValue = next;
  permListeners.forEach((l) => l());
}

/**
 * Suscribe un callback a los cambios del permiso compartido.
 *
 * @param cb - Callback a invocar cuando cambia el permiso.
 * @returns Función para cancelar la suscripción.
 */
const subscribePerm = (cb: () => void) => {
  permListeners.add(cb);
  return () => { permListeners.delete(cb); };
};

/** Devuelve el snapshot actual del permiso (para `useSyncExternalStore`). */
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

/** Opciones del hook {@link useBrowserNotifications}. */
type Options = {
  /** Si el disparo de notificaciones está activo. Por defecto `true`. */
  enabled?:    boolean;
  /** Ícono a mostrar en la notificación nativa. */
  icon?:       string;
  /** Callback al activar (click) una notificación; recibe la notificación de la app. */
  onActivate?: (n: AppNotification) => void;
};

/**
 * Calcula la URL destino para el click desde el SO cuando no hay ventana abierta.
 *
 * @param n - Notificación de la app.
 * @returns `/` para `export_ready`; en otro caso `/ticket/<requestId>` si hay
 *   request, o `/`.
 */
function targetUrlFor(n: AppNotification): string {
  if (n.type === 'export_ready') return '/';
  return n.requestId ? `/ticket/${n.requestId}` : '/';
}

/**
 * Muestra una notificación nativa.
 *
 * @remarks
 * Chrome Android PROHÍBE `new Notification(...)` (lanza *Illegal constructor*). El
 * único camino que funciona en ambas plataformas es
 * `ServiceWorkerRegistration.showNotification()`. El constructor queda solo como
 * fallback para desarrollo, donde no hay SW registrado.
 *
 * @param n - Notificación de la app a mostrar.
 * @param icon - Ícono de la notificación.
 * @param onActivate - Callback al hacer click (solo en el camino de fallback).
 * @returns `true` si se logró mostrar por alguno de los dos caminos; `false` si no.
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

/**
 * Observa la lista de notificaciones y dispara las nuevas como notificaciones nativas.
 *
 * @remarks
 * Lee el permiso desde el store compartido con `useSyncExternalStore`. Usa refs
 * para tener `onActivate` y la lista frescas sin re-ejecutar efectos. En la
 * primera corrida fija una línea base (`lastSeenId`) para no disparar lo ya
 * existente; luego, solo muestra las notificaciones con id mayor a la base y no
 * leídas, en orden ascendente, avanzando la base tras intentar mostrarlas todas.
 * También escucha el `postMessage` `prisma:notification-click` del SW para activar
 * la notificación correspondiente. Solo dispara si está soportado, `enabled` y el
 * permiso es `granted`.
 *
 * @param notifications - Lista actual de notificaciones de la app.
 * @param options - Opciones ({@link Options}): `enabled`, `icon`, `onActivate`.
 * @returns `{ isSupported, permission, requestPermission }`, donde
 *   `requestPermission` solicita el permiso al usuario y actualiza el store compartido.
 */
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