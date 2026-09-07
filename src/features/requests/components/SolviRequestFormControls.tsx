// src/features/requests/components/SolviRequestFormControls.tsx
// Piezas de UI genéricas y sin estado, reusadas por las distintas secciones
// de SolviRequestPage (ver SolviRequestPageComponents.tsx).
import React from 'react';
import { FileText, Image, File as FileIcon2 } from 'lucide-react';

export function fmtBytes(bytes: number) {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function AttachmentIcon({ mime }: { mime: string }) {
  if (mime.startsWith('image/')) return <Image size={13} />;
  if (mime === 'application/pdf' || mime.includes('text')) return <FileText size={13} />;
  return <FileIcon2 size={13} />;
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', color: 'var(--txt-muted)', marginBottom: 7 }}>{children}</label>;
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
      <span style={{ fontFamily: 'var(--font-display)', fontSize: 9, fontWeight: 700, letterSpacing: 3, textTransform: 'uppercase', color: 'var(--accent)', background: 'rgba(0,200,255,0.07)', border: '1px solid rgba(0,200,255,0.18)', padding: '3px 10px', borderRadius: 3, flexShrink: 0 }}>{children}</span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  );
}

export function inputStyle(focused: boolean, error = false): React.CSSProperties {
  const borderColor = error ? 'rgba(255,71,87,0.55)' : focused ? 'rgba(0,200,255,0.4)' : 'var(--border-subtle)';
  return { width: '100%', background: 'transparent', border: `1px solid ${borderColor}`, borderRadius: 6, padding: '10px 13px', color: 'var(--txt)', fontFamily: 'var(--font-body)', fontSize: 13, outline: 'none', boxSizing: 'border-box', transition: 'border-color 0.15s' };
}

export function FieldError({ show, text = 'Este campo es obligatorio.' }: { show: boolean; text?: string }) {
  if (!show) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 10, color: 'var(--danger)' }}>
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4.5" stroke="currentColor" strokeWidth="1.2"/><line x1="5" y1="2.5" x2="5" y2="5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="5" cy="7" r="0.5" fill="currentColor"/></svg>
      {text}
    </span>
  );
}

export function cardStyle(accent: string): React.CSSProperties {
  return { background: 'var(--bg-panel)', border: `1px solid ${accent}20`, borderRadius: 10, padding: '20px 22px', position: 'relative', overflow: 'hidden' };
}
