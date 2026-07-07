// src/components/layout/NotificationPermissionPrompt.tsx
import { useState } from 'react';
import { BellRing, X } from 'lucide-react';
import {
  useBrowserNotifications,
  type BrowserPermission,
} from '@/features/requests/hooks/useBrowserNotifications';
import { useNotifPromptStore } from '@/store/notifPromptStore';

export function NotificationPermissionPrompt() {
  const { isSupported, permission, requestPermission } = useBrowserNotifications([], {
    enabled: false, // este componente solo gestiona el permiso, no dispara nativas
  });
  const dismissedForever = useNotifPromptStore((s) => s.dismissedForever);
  const dismissForever   = useNotifPromptStore((s) => s.dismissForever);

  // Cierre solo por esta sesión (X): reaparece al recargar
  const [dismissedSession, setDismissedSession] = useState(false);

  const shouldShow =
    isSupported &&
    permission === 'default' &&
    !dismissedForever &&
    !dismissedSession;

  if (!shouldShow) return null;

  const handleEnable = async () => {
    const result: BrowserPermission = await requestPermission();
    if (result === 'denied') setDismissedSession(true);
  };

  return (
    <div className="notif-prompt" role="alert">
      <BellRing size={18} className="notif-prompt__icon" />
      <div className="notif-prompt__text">
        <strong>Activa las notificaciones de escritorio</strong>
        <span>Te avisamos de nuevos tickets y asignaciones aunque estés en otra ventana.</span>
      </div>

      <button className="notif-prompt__btn" onClick={handleEnable}>
        Activar
      </button>

      <button className="notif-prompt__never" onClick={dismissForever}>
        No volver a mostrar
      </button>

      <button
        className="notif-prompt__close"
        onClick={() => setDismissedSession(true)}
        aria-label="Cerrar por ahora"
        title="Cerrar por ahora"
      >
        <X size={16} />
      </button>
    </div>
  );
}