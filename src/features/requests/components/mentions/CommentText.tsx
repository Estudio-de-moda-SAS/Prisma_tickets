// src/features/requests/components/mentions/CommentText.tsx
import { type ReactNode, type CSSProperties } from 'react';
import type { AppUser } from '@/features/requests/hooks/useUsers';

const chip: CSSProperties = { color: '#a78bfa', background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 4, padding: '0 4px', fontWeight: 600 };

function shortName(full: string): string {
  const p = full.trim().split(/\s+/);
  if (p.length >= 4) return `${p[0]} ${p[2]}`;   // 1er nombre + 1er apellido
  if (p.length >= 2) return `${p[0]} ${p[1]}`;
  return full;
}

export function CommentText({ text, users }: { text: string; users: AppUser[] }) {
  const out: ReactNode[] = [];
  const re = /@\[(\d+)\]/g;
  let last = 0, i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const id = Number(m[1]);
    const u = users.find((x) => x.User_ID === id);
    out.push(<span key={`m${i++}`} style={chip}>@{u ? shortName(u.User_Name) : id}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return <>{out}</>;
}