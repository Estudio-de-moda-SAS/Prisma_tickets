// src/components/layout/NotificationBell.tsx
import { useState, useRef, useEffect, useCallback, forwardRef } from 'react';
import { createPortal } from 'react-dom';
import { Bell, BellRing, Check, CheckCheck, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNotifications } from '@/features/requests/hooks/useNotifications';
import {
  useBrowserNotifications,
  type BrowserPermission,
} from '@/features/requests/hooks/useBrowserNotifications';
import type { Notification } from '@/types/commons';

const TYPE_ICON: Record<string, string> = {
  assignment:          '👤',
  comment:             '💬',
  column_move:         '📋',
  closure:             '✅',
  criteria_reviewed:   '🔍',
  sub_request_created: '🔗',
  mention:             '@',
  export_ready:        '📤',
  new_external_request:'📥',
};

const TYPE_COLOR: Record<string, string> = {
  assignment:          'var(--accent)',
  comment:             '#a78bfa',
  column_move:         '#60a5fa',
  closure:             '#34d399',
  criteria_reviewed:   '#fbbf24',
  sub_request_created: '#f472b6',
  mention:             'var(--accent)',
  export_ready:        '#38bdf8',
  new_external_request:'#f59e0b',
};

type Props = { userId: number | null };

export function NotificationBell({ userId }: Props) {
  const [open, setOpen]     = useState(false);
  const bellRef             = useRef<HTMLButtonElement>(null);
  const panelRef            = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  const navigate            = useNavigate();

  const { notifications, unreadCount, isLoading, markRead, markAllRead } =
    useNotifications(userId);

  // Acción al hacer click en la notificación nativa del SO (reutiliza tu lógica)
  const activateNotification = useCallback((n: Notification) => {
    if (!n.isRead) markRead(n.notificationId);
    if (n.type === 'export_ready') {
      window.dispatchEvent(new CustomEvent('prisma:open-exports-history'));
      return;
    }
    if (n.requestId) navigate(`/ticket/${n.requestId}`);
  }, [markRead, navigate]);

  const { permission, requestPermission } = useBrowserNotifications(notifications, {
    icon:       '/favicon.ico', // cámbialo por el logo de PRISMA en /public si quieres
    onActivate: activateNotification,
  });

  const handleOpen = () => {
    if (!open && bellRef.current) {
      const rect = bellRef.current.getBoundingClientRect();
      setCoords({
        top:   rect.bottom + 8,
        right: window.innerWidth - rect.right,
      });
    }
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        bellRef.current  && !bellRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <>
      <button
        ref={bellRef}
        className="notif-bell"
        onClick={handleOpen}
        aria-label={`Notificaciones${unreadCount > 0 ? ` (${unreadCount} sin leer)` : ''}`}
      >
        {isLoading
          ? <Loader2 size={18} className="notif-bell__loader" />
          : <Bell size={18} />
        }
        {unreadCount > 0 && (
          <span className="notif-bell__badge">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && createPortal(
        <NotificationPanel
          ref={panelRef}
          notifications={notifications}
          coords={coords}
          browserPermission={permission}
          onEnableBrowser={requestPermission}
          onClose={() => setOpen(false)}
          onMarkRead={markRead}
          onMarkAllRead={markAllRead}
        />,
        document.body,
      )}
    </>
  );
}

/* ── Panel ── */
type PanelProps = {
  notifications:     Notification[];
  coords:            { top: number; right: number };
  browserPermission: BrowserPermission;
  onEnableBrowser:   () => void;
  onClose:           () => void;
  onMarkRead:        (id: number) => void;
  onMarkAllRead:     () => void;
};

const NotificationPanel = forwardRef<HTMLDivElement, PanelProps>(
  ({ notifications, coords, browserPermission, onEnableBrowser, onClose, onMarkRead, onMarkAllRead }, ref) => {
    const navigate  = useNavigate();
    const hasUnread = notifications.some((n) => !n.isRead);

    const handleClick = (n: Notification) => {
      if (!n.isRead) onMarkRead(n.notificationId);

      // Notificaciones de export → abrir ConfigPanel en pestaña Historial
      if (n.type === 'export_ready') {
        window.dispatchEvent(new CustomEvent('prisma:open-exports-history'));
        onClose();
        return;
      }

      if (n.requestId) {
        navigate(`/ticket/${n.requestId}`);
        onClose();
      }
    };

    return (
      <div
        ref={ref}
        className="notif-panel"
        style={{ top: coords.top, right: coords.right }}
      >
        <div className="notif-panel__header">
          <span className="notif-panel__title">Notificaciones</span>
          {hasUnread && (
            <button
              className="notif-panel__mark-all"
              onClick={onMarkAllRead}
              title="Marcar todas como leídas"
            >
              <CheckCheck size={14} />
              <span>Marcar todas</span>
            </button>
          )}
        </div>

        {/* Banner de permiso del navegador */}
        {browserPermission === 'default' && (
          <div className="notif-panel__enable">
            <BellRing size={16} className="notif-panel__enable-icon" />
            <span className="notif-panel__enable-text">
              Recibe avisos en el escritorio aunque estés en otra ventana.
            </span>
            <button className="notif-panel__enable-btn" onClick={onEnableBrowser}>
              Activar
            </button>
          </div>
        )}
        {browserPermission === 'denied' && (
          <div className="notif-panel__denied">
            Las notificaciones del navegador están bloqueadas. Habilítalas desde
            los ajustes del sitio en tu navegador.
          </div>
        )}

        <div className="notif-panel__list">
          {notifications.length === 0 ? (
            <div className="notif-panel__empty">
              <Bell size={28} />
              <span>Sin notificaciones</span>
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationItem
                key={n.notificationId}
                notification={n}
                onClick={() => handleClick(n)}
                onMarkRead={() => onMarkRead(n.notificationId)}
              />
            ))
          )}
        </div>
      </div>
    );
  }
);

NotificationPanel.displayName = 'NotificationPanel';

/* ── Item ── */
type ItemProps = {
  notification: Notification;
  onClick:      () => void;
  onMarkRead:   () => void;
};

function NotificationItem({ notification: n, onClick, onMarkRead }: ItemProps) {
  const icon    = TYPE_ICON[n.type]  ?? '🔔';
  const color   = TYPE_COLOR[n.type] ?? 'var(--accent)';
  const timeAgo = formatDistanceToNow(new Date(n.createdAt), { locale: es, addSuffix: true });

  return (
    <div
      className={`notif-item${n.isRead ? ' notif-item--read' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick(); }}
    >
      {!n.isRead && <span className="notif-item__dot" />}

      <div className="notif-item__icon" style={{ background: `${color}18`, color }}>
        {icon}
      </div>

      <div className="notif-item__content">
        <p className="notif-item__title">{n.title}</p>
        {n.body && <p className="notif-item__body">{n.body}</p>}
        <div className="notif-item__meta">
          {n.actor && <span className="notif-item__actor">{n.actor.userName}</span>}
          <span className="notif-item__time">{timeAgo}</span>
        </div>
      </div>

      {!n.isRead && (
        <button
          className="notif-item__read-btn"
          onClick={(e) => { e.stopPropagation(); onMarkRead(); }}
          title="Marcar como leída"
        >
          <Check size={12} />
        </button>
      )}
    </div>
  );
}