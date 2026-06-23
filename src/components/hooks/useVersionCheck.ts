import { useEffect, useState } from 'react';

declare const __APP_VERSION__: string;

const POLL_INTERVAL = 5 * 60 * 1000;

export function useVersionCheck(): boolean {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (import.meta.env.DEV) return;

    const check = async () => {
      try {
        const res = await fetch(`/version.json?_=${Date.now()}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const { v } = await res.json();
        if (v && v !== __APP_VERSION__) {
          setUpdateAvailable(true);
        }
      } catch {
        // silencioso
      }
    };

    // 1. Al montar el componente (tab recién abierta, F5, etc.)
    check();

    // 2. Al volver de suspensión o al enfocar la tab
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    // 3. Polling de respaldo cada 5 min (usuario navegando sin cambiar tab)
    const interval = setInterval(check, POLL_INTERVAL);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      clearInterval(interval);
    };
  }, []);

  return updateAvailable;
}