import { useState}    from 'react';
import { createPortal }           from 'react-dom';
import {
  useAnnouncements,
  confirmAnnouncement,
  getConfirmed,
} from '@/features/requests/hooks/useAnnouncements';

export function AnnouncementModal() {
const { data: list = [] } = useAnnouncements('home');
  const [confirmed, setConfirmed] = useState<string[]>(() => getConfirmed());


  // Solo el aviso crítico más reciente sin confirmar
  const toShow = list.find((a) => a.type === 'critical' && !confirmed.includes(a.id)) ?? null;
  if (!toShow) return null;

  function handleConfirm() {
    confirmAnnouncement(toShow!.id);
    setConfirmed((prev) => [...prev, toShow!.id]);
  }

  return createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(59,130,246,0.04)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      backdropFilter: 'blur(5px)',
    }}>
      <div style={{
        background: 'var(--bg-panel)',
        border: '1px solid rgba(255,71,87,0.3)',
        borderRadius: 14, padding: '28px 32px',
        maxWidth: 440, width: '90%',
        boxShadow: '0 0 40px rgba(255,71,87,0.12), 0 20px 60px rgba(0,0,0,0.45)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#ff4757' }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 9,
            background: 'rgba(255,71,87,0.12)', border: '1px solid rgba(255,71,87,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff4757" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: '#ff4757' }}>
              Aviso importante
            </p>
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--txt)', lineHeight: 1.3 }}>
              {toShow.title}
            </h3>
          </div>
        </div>

        {toShow.body && (
          <p style={{ margin: '0 0 22px', fontSize: 13, color: 'var(--txt-muted)', lineHeight: 1.6 }}>
            {toShow.body}
          </p>
        )}

        <button
          onClick={handleConfirm}
          style={{
            width: '100%', padding: '10px 20px', borderRadius: 8,
            border: '1px solid rgba(255,71,87,0.45)',
            background: 'rgba(255,71,87,0.10)',
            color: '#ff4757', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', transition: 'all 0.15s', letterSpacing: '0.4px',
          }}
          onMouseEnter={(e) => Object.assign((e.currentTarget as HTMLElement).style, { background: 'rgba(255,71,87,0.22)', borderColor: 'rgba(255,71,87,0.70)' })}
          onMouseLeave={(e) => Object.assign((e.currentTarget as HTMLElement).style, { background: 'rgba(255,71,87,0.10)', borderColor: 'rgba(255,71,87,0.45)' })}
        >
          Entendido
        </button>
      </div>
    </div>,
    document.body,
  );
}