import { useState }                    from 'react';
import {
  useAnnouncements,
  ANNOUNCEMENT_TYPE_STYLE,
  getDismissed,
  dismissAnnouncement,
  type Announcement,
} from '@/features/requests/hooks/useAnnouncements';

/* ── Strip horizontal (entre Topbar y contenido) ── */
export function AnnouncementBanner() {
  const { data: list = [] }             = useAnnouncements('banner');
  const [dismissed, setDismissed]       = useState<string[]>(() => getDismissed());

  const visible = list.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  function handleDismiss(id: string) {
    dismissAnnouncement(id);
    setDismissed((prev) => [...prev, id]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {visible.map((a) => {
        const s = ANNOUNCEMENT_TYPE_STYLE[a.type] ?? ANNOUNCEMENT_TYPE_STYLE.info;
        return (
          <div key={a.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 20px',
            background: s.bg,
            borderBottom: `1px solid ${s.border}`,
          }}>
            <span style={{ fontSize: 13, flexShrink: 0, lineHeight: 1 }}>{s.icon}</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: s.color, flexShrink: 0 }}>
                {a.title}
              </span>
              {a.body && (
                <span style={{ fontSize: 12, color: 'var(--txt-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 640 }}>
                  {a.body}
                </span>
              )}
            </div>
            <button
              onClick={() => handleDismiss(a.id)}
              title="Cerrar"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: '2px 4px', borderRadius: 4, display: 'flex', alignItems: 'center', opacity: 0.65, transition: 'opacity 0.12s', flexShrink: 0 }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.65'; }}
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M1 1l9 9M10 1L1 10"/>
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ── Card para HomePage ── */
export function HomeAnnouncementsSection() {
  const { data: list = [] }       = useAnnouncements('home');
  const [dismissed, setDismissed] = useState<string[]>(() => getDismissed());

  const visible = list.filter((a) => !dismissed.includes(a.id));
  if (visible.length === 0) return null;

  function handleDismiss(id: string) {
    dismissAnnouncement(id);
    setDismissed((prev) => [...prev, id]);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {visible.map((a) => <HomeAnnouncementCard key={a.id} a={a} onDismiss={handleDismiss} />)}
    </div>
  );
}

function HomeAnnouncementCard({ a, onDismiss }: { a: Announcement; onDismiss: (id: string) => void }) {
  const s = ANNOUNCEMENT_TYPE_STYLE[a.type] ?? ANNOUNCEMENT_TYPE_STYLE.info;
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 16px', borderRadius: 10,
      background: s.bg, border: `1px solid ${s.border}`,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 3, background: s.color, borderRadius: '10px 0 0 10px' }} />
      <span style={{ fontSize: 16, flexShrink: 0, marginLeft: 4, lineHeight: 1.4 }}>{s.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: s.color }}>{a.title}</p>
        {a.body && <p style={{ margin: '3px 0 0', fontSize: 12, color: 'var(--txt-muted)', lineHeight: 1.5 }}>{a.body}</p>}
      </div>
      <button
        onClick={() => onDismiss(a.id)}
        title="Cerrar"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--txt-muted)', padding: 2, opacity: 0.6, transition: 'opacity 0.12s', flexShrink: 0, display: 'flex', alignItems: 'center' }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.6'; }}
      >
        <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M1 1l9 9M10 1L1 10"/>
        </svg>
      </button>
    </div>
  );
}