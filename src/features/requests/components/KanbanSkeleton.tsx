import React from 'react';
import '@/styles/kanbanSkeleton.css';

// Columnas en el mismo orden que el board real
const COLUMNS = [
  { key: 'sin',  colClass: 'sk-col--sin  sk-col--narrow', accent: 'sk-accent-sin',  cards: 2 },
  { key: 'ice',  colClass: 'sk-col--ice',                 accent: 'sk-accent-ice',  cards: 3 },
  { key: 'back', colClass: 'sk-col--back',                accent: 'sk-accent-back', cards: 3 },
  { key: 'todo', colClass: 'sk-col--todo',                accent: 'sk-accent-todo', cards: 2 },
  { key: 'prog', colClass: 'sk-col--prog',                accent: 'sk-accent-prog', cards: 3 },
  { key: 'done', colClass: 'sk-col--done',                accent: 'sk-accent-done', cards: 2 },
] as const;

interface SkCardProps {
  accent: string;
  showProgress?: boolean;
  progressPct?: number;
  titleW?: string;
  subtitleW?: string;
  avatars?: number;
}

function SkCard({ accent, showProgress, progressPct = 50, titleW = '85%', subtitleW, avatars = 1 }: SkCardProps) {
  return (
    <div className="sk-card">
      <div className="sk-card-top">
        <div className={`sk-tag sk-block sk-shine ${accent}`} />
        <div className="sk-prio sk-block sk-shine sk-bg-low" />
      </div>
      <div className="sk-title-lg sk-block sk-shine sk-bg-base" style={{ width: titleW }} />
      {subtitleW && (
        <div className="sk-title-sm sk-block sk-shine sk-bg-mid" style={{ width: subtitleW }} />
      )}
      {showProgress && (
        <div className="sk-progress">
          <div className={`sk-progress-inner ${accent}`} style={{ width: `${progressPct}%` }} />
        </div>
      )}
      <div className="sk-divider" />
      <div className="sk-card-footer">
        <div className="sk-avatar-row">
          {Array.from({ length: avatars }).map((_, i) => (
            <div key={i} className={`sk-avatar sk-shine ${i === 0 ? accent : 'sk-bg-mid'}`} />
          ))}
        </div>
        <div className="sk-date sk-block sk-shine sk-bg-mid" />
      </div>
    </div>
  );
}

// Variaciones por índice para que las cards no sean idénticas
const CARD_VARIANTS: SkCardProps[] = [
  { accent: '',  showProgress: true,  progressPct: 65, titleW: '88%', subtitleW: '60%', avatars: 2 },
  { accent: '',  showProgress: false,                  titleW: '74%',                   avatars: 1 },
  { accent: '',  showProgress: true,  progressPct: 30, titleW: '80%',                   avatars: 3 },
];

export interface KanbanSkeletonProps {
  /** Cuántas columnas mostrar (1-6). Por defecto muestra las 6. */
  columns?: number;
  style?: React.CSSProperties;   // ← nuevo
}

const KanbanSkeleton: React.FC<KanbanSkeletonProps> = ({ columns = 6, style }) => {
  const visible = COLUMNS.slice(0, columns);

  return (
    <div className="sk-board" aria-busy="true" aria-label="Cargando tablero…" style={style}>
      {visible.map((col, ci) => (
        <div
          key={col.key}
          className={`sk-col ${col.colClass}`}
          style={{ animationDelay: `${ci * 0.3}s` }}
        >
          {/* Header — imita .kanban__col-header */}
          <div className="sk-col-header">
            <div className="sk-col-header-left">
              <div className={`sk-col-title sk-block sk-shine ${col.accent}`} />
              <div className="sk-col-count sk-block sk-shine sk-bg-mid" />
            </div>
            <div className="sk-col-btn sk-block sk-shine sk-bg-mid" />
          </div>

          {/* Cards */}
          {Array.from({ length: col.cards }).map((_, ci2) => {
            const v = CARD_VARIANTS[ci2 % CARD_VARIANTS.length];
            return (
              <SkCard
                key={ci2}
                {...v}
                accent={col.accent}
                showProgress={ci2 === 0}
                progressPct={30 + ci * 12}
                avatars={ci2 === 0 ? 2 : 1}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

export default KanbanSkeleton;