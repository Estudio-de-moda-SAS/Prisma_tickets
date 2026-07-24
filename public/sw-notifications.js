/* Handler de click en notificaciones del SO.
   Se inyecta en el SW generado por Workbox via workbox.importScripts. */

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  const targetUrl = data.url || '/';

  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      // Si PRISMA ya esta abierto, enfocamos y delegamos en la app.
      for (const win of wins) {
        if ('focus' in win) {
          await win.focus();
          win.postMessage({
            type: 'prisma:notification-click',
            notificationId: data.notificationId ?? null,
            url: targetUrl,
          });
          return;
        }
      }

      // No hay ventana abierta: abrimos una en la URL destino.
      if (self.clients.openWindow) {
        await self.clients.openWindow(targetUrl);
      }
    })(),
  );
});