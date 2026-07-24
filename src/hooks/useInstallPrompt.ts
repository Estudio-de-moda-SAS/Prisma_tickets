import * as React from 'react';

/* El evento no es estándar todavía, TypeScript no lo tipa. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

/* ------------------------------------------------------------------
   Captura a nivel de módulo, NO dentro de un efecto de React.
   Chrome dispara beforeinstallprompt apenas carga la página, muchas
   veces antes del primer render. Si esperáramos al useEffect, el
   evento ya se habría perdido.
   ------------------------------------------------------------------ */
let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();          // sin esto Chrome muestra su propia mini-barra
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    deferred = null;
    emit();
  });
}

/** Ya corriendo como app instalada (sin barra de direcciones). */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: window-controls-overlay)').matches
  );
}

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
};

const getSnapshot = () => deferred !== null && !isStandalone();

export function useInstallPrompt() {
  const canInstall = React.useSyncExternalStore(subscribe, getSnapshot, () => false);

  const promptInstall = React.useCallback(async () => {
    if (!deferred) return;
    const evt = deferred;
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    // El evento es de un solo uso: se consume acepte o rechace.
    deferred = null;
    emit();
    return outcome;
  }, []);

  return { canInstall, promptInstall };
}