/* ════════════════════════════════════════════════════════════
   Átomos UI del dashboard de estadísticas
════════════════════════════════════════════════════════════ */

import { TrendingUp, TrendingDown, Minus, ChevronDown } from 'lucide-react';

export function KPICard({ label, value, sub, trend, accent, trendGood = 'up' }: {
  label: string; value: string | number; sub: string;
  trend: 'up' | 'down' | 'neutral'; accent: string; trendGood?: 'up' | 'down';
}) {
  const isPos = (trend === 'up' && trendGood === 'up') || (trend === 'down' && trendGood === 'down');
  const color = trend === 'neutral' ? 'var(--txt-muted)' : isPos ? 'var(--success)' : 'var(--danger)';
  const Icon  = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  return (
    <div className="stats-kpi-card">
      <div className="stats-kpi-card__accent" style={{ background: accent }} />
      <span className="stats-kpi-card__label">{label}</span>
      <span className="stats-kpi-card__value">{value}</span>
      <div className="stats-kpi-card__sub" style={{ color }}><Icon size={10} /><span>{sub}</span></div>
    </div>
  );
}

export function SprintCard({ label, value, sub, color, icon: Icon, pulse = false, onClick, expanded }: {
  label: string; value: string | number; sub?: string; color: string; icon: React.ElementType;
  pulse?: boolean; onClick?: () => void; expanded?: boolean;
}) {
  const clickable = !!onClick;
  return (
    <div
      className={['scard', clickable ? 'scard--clickable' : '', expanded ? 'scard--expanded' : ''].join(' ')}
      style={{ '--scard-color': color } as React.CSSProperties}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick!(); } } : undefined}
    >
      <div className="scard__icon-wrap"><Icon size={16} className={pulse ? 'scard__icon--pulse' : ''} /></div>
      <div className="scard__body">
        <span className="scard__label">{label}</span>
        <span className="scard__value">{value}</span>
        {sub && <span className="scard__sub">{sub}</span>}
      </div>
      {clickable && <ChevronDown size={14} className="scard__chevron" />}
      <div className="scard__glow" />
    </div>
  );
}

export function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="stats-bar-row">
      <span className="stats-bar-row__label">{label}</span>
      <div className="stats-bar-row__track"><div className="stats-bar-row__fill" style={{ width: `${pct}%`, background: color }} /></div>
      <span className="stats-bar-row__val">{value}</span>
    </div>
  );
}

export function ScoreDonut({ realizado, total, label = 'velocidad' }: { realizado: number; total: number; label?: string }) {
  const pct = total > 0 ? Math.round((realizado / total) * 100) : 0;
  const r = 36, circ = 2 * Math.PI * r, dash = (pct / 100) * circ;
  return (
    <div className="score-donut">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--bg-surface)" strokeWidth="8" />
        <circle cx="44" cy="44" r={r} fill="none" stroke="var(--accent)" strokeWidth="8"
          strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
          strokeDashoffset={circ * 0.25} style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        <text x="44" y="40" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--txt)">{pct}%</text>
        <text x="44" y="54" textAnchor="middle" fontSize="9" fill="var(--txt-muted)">{label}</text>
      </svg>
      <div className="score-donut__labels">
        <div className="score-donut__row"><span className="score-donut__dot" style={{ background: 'var(--accent)' }} /><span>Realizado <strong>{realizado}</strong></span></div>
        <div className="score-donut__row"><span className="score-donut__dot" style={{ background: 'var(--bg-surface)' }} /><span>Total <strong>{total}</strong></span></div>
      </div>
    </div>
  );
}

export function SectionDivider({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="stats-section-divider">
      <span className="stats-section-divider__label"><Icon size={10} />{label}</span>
      <div className="stats-section-divider__line" />
    </div>
  );
}

/** Mini-gráfico de barras dobles (creadas vs resueltas) por semana. Sin
 *  Chart.js — barras con divs para no montar otra instancia de canvas. */
export function ThroughputMini({ data }: { data: { periodLabel: string; created: number; resolved: number }[] }) {
  const max = Math.max(1, ...data.flatMap(d => [d.created, d.resolved]));
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, padding: '8px 4px 0' }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 3, width: '100%', justifyContent: 'center' }}>
            <div title={`${d.created} creadas`}
              style={{ width: '42%', height: `${(d.created / max) * 100}%`, minHeight: d.created > 0 ? 3 : 0, background: 'var(--warn)', borderRadius: '3px 3px 0 0', transition: 'height .3s' }} />
            <div title={`${d.resolved} resueltas`}
              style={{ width: '42%', height: `${(d.resolved / max) * 100}%`, minHeight: d.resolved > 0 ? 3 : 0, background: 'var(--success)', borderRadius: '3px 3px 0 0', transition: 'height .3s' }} />
          </div>
          <span style={{ fontSize: 9, color: 'var(--txt-muted)' }}>{d.periodLabel}</span>
        </div>
      ))}
    </div>
  );
}
