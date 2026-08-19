import * as React from 'react';
import { RefreshCw, X, Zap } from 'lucide-react';
import { registerSW } from 'virtual:pwa-register';
import { useVersionCheck } from '../hooks/useVersionCheck';

/* ------------------------------------------------------------------
   Registro del service worker a nivel de modulo:
   corre una sola vez por carga de pagina, no por render.
   ------------------------------------------------------------------ */
let updateSW: ((reloadPage?: boolean) => Promise<void>) | null = null;
let swRegistration: ServiceWorkerRegistration | undefined;

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      swRegistration = registration;
    },
    onRegisterError() {
      /* silencioso: si falla el SW, la app sigue funcionando normal */
    },
  });
}

export function VersionUpdateBanner() {
  const updateAvailable = useVersionCheck();
  const [dismissed, setDismissed] = React.useState(false);
  const [reloading, setReloading] = React.useState(false);

  /* version.json detecto un deploy nuevo -> empujamos al SW a buscarlo
     para que ya este en waiting cuando el usuario haga clic. */
  React.useEffect(() => {
    if (!updateAvailable) return;
    swRegistration?.update().catch(() => {
      /* silencioso */
    });
  }, [updateAvailable]);

  if (!updateAvailable || dismissed) return null;

  const handleReload = () => {
    setReloading(true);

    // Red de seguridad: si el SW no toma el control en 3s, recargamos igual.
    window.setTimeout(() => window.location.reload(), );

    if (updateSW) {
      updateSW(true).catch(() => window.location.reload());
    } else {
      window.location.reload();
    }
  };

  return (
    <div className="version-toast" role="status" aria-live="polite">
      <div className="version-toast__header">
        <span className="version-toast__icon"><Zap size={13} /></span>
        <span className="version-toast__title">Actualización disponible</span>
        <button
          className="version-toast__dismiss"
          onClick={() => setDismissed(true)}
          aria-label="Cerrar"
        >
          <X size={13} />
        </button>
      </div>
      <p className="version-toast__body">
        Hay una nueva versión de PRISMA lista para cargar.
      </p>
      <button
        className="version-toast__reload"
        onClick={handleReload}
        disabled={reloading}
      >
        <RefreshCw
          size={12}
          style={reloading ? { animation: 'spin 0.8s linear infinite' } : undefined}
        />
        {reloading ? 'Cargando…' : 'Recargar ahora'}
      </button>
    </div>
  );
}