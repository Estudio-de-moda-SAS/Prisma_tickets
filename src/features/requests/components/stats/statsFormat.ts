/* ─── Helpers visuales del dashboard de estadísticas ──────── */

import type { Sprint } from '@/features/requests/hooks/useSprints';

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#0055cc,#00c8ff)',
  'linear-gradient(135deg,#7c3aed,#a78bfa)',
  'linear-gradient(135deg,#0f6e56,#00e5a0)',
  'linear-gradient(135deg,#854F0B,#EF9F27)',
  'linear-gradient(135deg,#185FA5,#378ADD)',
  'linear-gradient(135deg,#3B6D11,#97C459)',
  'linear-gradient(135deg,#534AB7,#a78bfa)',
  'linear-gradient(135deg,#8B1A1A,#ff6b6b)',
];
export const avatarBg = (id: number)   => AVATAR_GRADIENTS[id % AVATAR_GRADIENTS.length];
export const fmtInits = (name: string) => name.split(' ').slice(0, 2).map(n => n[0]?.toUpperCase() ?? '').join('');
export const fmtDate  = (d: Date)      => new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short' }).format(d);

export const PRI_COLOR: Record<string, string> = {
  critica: '#ff4757', alta: '#ffa502', media: '#a78bfa', baja: '#5a6a8a',
};
export const PRIORIDADES_LABEL: Record<string, string> = {
  critica: 'Crítica', alta: 'Alta', media: 'Media', baja: 'Baja',
};

/** Convierte horas decimales a "Xh Ym". null → "—". Ej: 2.5 → "2h 30m", 0.75 → "45m", 3 → "3h". */
export const fmtHoras = (h: number | null): string => {
  if (h == null) return '—';
  const totalMin = Math.round(h * 60);
  const horas = Math.floor(totalMin / 60);
  const mins  = totalMin % 60;
  if (horas === 0) return `${mins}m`;
  if (mins === 0)  return `${horas}h`;
  return `${horas}h ${mins}m`;
};
export const fmtDays = (d: number | null): string => (d == null ? '—' : `${d.toFixed(1)}d`);

/** Delta de una métrica vs sprint anterior.
 *  mode 'pct' → variación porcentual (creadas/resueltas/críticas).
 *  mode 'pts' → diferencia en puntos (cumplimiento, que ya es %). */
export type DeltaInfo = { trend: 'up' | 'down' | 'neutral'; sub: string };
export function calcDelta(actual: number, prev: number | undefined, mode: 'pct' | 'pts'): DeltaInfo | null {
  if (prev === undefined) return null;
  const diff = actual - prev;
  const trend: DeltaInfo['trend'] = diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral';
  const arrow = diff > 0 ? '+' : ''; // el signo − ya viene en el número negativo
  if (mode === 'pts') {
    if (diff === 0) return { trend, sub: 'sin cambio vs anterior' };
    return { trend, sub: `${arrow}${diff} pts vs anterior` };
  }
  // pct
  if (prev === 0) {
    if (actual === 0) return { trend: 'neutral', sub: 'sin cambio vs anterior' };
    return { trend: 'up', sub: 'nuevo vs anterior' };
  }
  const pct = Math.round((diff / prev) * 100);
  if (pct === 0) return { trend: 'neutral', sub: 'sin cambio vs anterior' };
  return { trend, sub: `${arrow}${pct}% vs anterior` };
}

/** Extrae el año de un sprint: de la fecha si existe, o del patrón (YYYY) del nombre. */
export function getSprintYear(s: Sprint): number | null {
  if (s.Sprint_Start_Date) {
    const y = Number(s.Sprint_Start_Date.slice(0, 4));
    if (!Number.isNaN(y)) return y;
  }
  // Histórico sin fecha → buscar (YYYY) en el texto
  const m = s.Sprint_Text.match(/\((\d{4})\)/);
  if (m) return Number(m[1]);
  return null;
}

/** Extrae el número de sprint del texto: "Sprint #5 (2025)" → 5. Null si no hay patrón. */
export function getSprintNumber(s: Sprint): number | null {
  const m = s.Sprint_Text.match(/#\s*(\d+)/);
  return m ? Number(m[1]) : null;
}

/** Etiqueta de la selección de equipos: todos, combinación o uno solo. */
export function scopeLabel(isGlobal: boolean, isCombined: boolean, selectedTeams: string[], teamTab: string, teamNameMap: Record<string, string>): string {
  if (isGlobal)   return 'todos los equipos';
  if (isCombined) return selectedTeams.map(c => teamNameMap[c] ?? c).join(' + ');
  return teamNameMap[teamTab] ?? teamTab;
}
