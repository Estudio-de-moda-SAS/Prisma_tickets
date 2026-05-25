// src/features/requests/components/KanbanSkeleton.tsx
import React from 'react';
import '@/styles/kanbanSkeleton.css';

// 1:1 con KanbanBoard: ['sin_categorizar', ...COLUMNAS_BOARD]
const COLUMNS = [
  { key: 'sin',     colClass: 'sk-col--sin-categorizar', narrow: true,  cards: 3 },
  { key: 'ice',     colClass: 'sk-col--icebox',          narrow: false, cards: 2 },
  { key: 'back',    colClass: 'sk-col--backlog',         narrow: false, cards: 3 },
  { key: 'todo',    colClass: 'sk-col--todo',            narrow: false, cards: 2 },
  { key: 'prog',    colClass: 'sk-col--en-progreso',     narrow: false, cards: 2 },
  { key: 'qas',     colClass: 'sk-col--en-revision-qas', narrow: false, cards: 1 },
  { key: 'cli',     colClass: 'sk-col--cliente-review',  narrow: false, cards: 1 },
  { key: 'deploy',  colClass: 'sk-col--ready-to-deploy', narrow: false, cards: 2 },
  { key: 'hecho',   colClass: 'sk-col--hecho',           narrow: false, cards: 2 },
  { key: 'hist',    colClass: 'sk-col--historial',       narrow: false, cards: 1 },
] as const;

interface CardVariant {
  titleW: string;
  showDesc: boolean;
  showAssignee: boolean;
  showLabel: boolean;
  showProgress: boolean;
  progressPct: number;
}

const VARIANTS: CardVariant[] = [
  { titleW: '85%', showDesc: true,  showAssignee: true,  showLabel: true,  showProgress: false, progressPct: 0  },
  { titleW: '72%', showDesc: false, showAssignee: false, showLabel: false, showProgress: false, progressPct: 0  },
  { titleW: '90%', showDesc: true,  showAssignee: true,  showLabel: false, showProgress: true,  progressPct: 55 },
];

function SkMetaRow({ labelW = 68, valueW = '55%' }: { labelW?: number; valueW?: string | number }) {
  return (
    <div className="sk-meta-row">
      <div className="sk-meta-icon sk-block sk-shine sk-bg-mid" />
      <div className="sk-meta-label sk-block sk-shine sk-bg-mid" style={{ width: labelW }} />
      <div className="sk-meta-value sk-block sk-shine sk-bg-base" style={{ width: valueW }} />
    </div>
  );
}

function SkCard({ variant }: { variant: CardVariant }) {
  return (
    <div className="sk-card">
      <div className="sk-card-header">
        <div className="sk-id sk-block sk-shine sk-bg-mid" />
        <div className="sk-badge sk-block sk-shine sk-bg-low" />
      </div>

      <div className="sk-title sk-block sk-shine sk-bg-base" style={{ width: variant.titleW }} />
      {variant.showDesc && (
        <div className="sk-desc sk-block sk-shine sk-bg-mid" style={{ width: '65%' }} />
      )}

      <div className="sk-divider" />

      <div className="sk-meta-rows">
        <SkMetaRow labelW={60} valueW="52%" />
        {variant.showAssignee && <SkMetaRow labelW={55} valueW="58%" />}
        <SkMetaRow labelW={52} valueW={72} />
        {variant.showLabel && <SkMetaRow labelW={50} valueW={80} />}
      </div>

      {variant.showProgress && (
        <div className="sk-progress">
          <div className="sk-progress-inner sk-bg-mid" style={{ width: `${variant.progressPct}%` }} />
        </div>
      )}
    </div>
  );
}

export interface KanbanSkeletonProps {
  columns?: number;
  style?: React.CSSProperties;
}

const KanbanSkeleton: React.FC<KanbanSkeletonProps> = ({ columns = 10, style }) => {
  const visible = COLUMNS.slice(0, columns);

  return (
    <div className="sk-board" aria-busy="true" aria-label="Cargando tablero…" style={style}>
      {visible.map((col, ci) => (
        <div
          key={col.key}
          className={`sk-col ${col.narrow ? 'sk-col--narrow' : ''}`}
          style={{ animationDelay: `${ci * 0.15}s` }}
        >
          <div className="sk-col-header">
            <div className="sk-col-header-left">
              <div className={`sk-col-title sk-block sk-shine sk-col-title--${col.key}`} />
              <div className="sk-col-count sk-block sk-shine sk-bg-mid" />
            </div>
            <div className="sk-col-btn sk-block sk-shine sk-bg-mid" />
          </div>

          {Array.from({ length: col.cards }).map((_, i) => (
            <SkCard key={i} variant={VARIANTS[i % VARIANTS.length]} />
          ))}
        </div>
      ))}
    </div>
  );
};

export default KanbanSkeleton;
