import * as React from 'react';
import { RefreshCw, X, Zap } from 'lucide-react';
import { useVersionCheck } from '../hooks/useVersionCheck';

export function VersionUpdateBanner() {
  const updateAvailable = useVersionCheck();
  const [dismissed, setDismissed] = React.useState(false);

  if (!updateAvailable || dismissed) return null;

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
        onClick={() => window.location.reload()}
      >
        <RefreshCw size={12} />
        Recargar ahora
      </button>
    </div>
  );
}