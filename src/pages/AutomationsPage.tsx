import { useState } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { useAutomationStore } from '@/store/automationStore';
import {
  TRIGGER_LABELS,
  ACTION_LABELS,
  STATUS_LABELS,
  EQUIPOS_LABELS,
} from '@/features/automations/types';
import type { Automation, AutomationStatus } from '@/features/automations/types';
import '@/styles/automations.css';

/* ─────────────────────────────────────────────────────────────
   Badge de estado
───────────────────────────────────────────────────────────── */
function StatusBadge({ status }: { status: AutomationStatus }) {
  const icons: Record<AutomationStatus, React.ReactNode> = {
    activa:   <CheckCircle2 size={10} />,
    inactiva: <Clock        size={10} />,
    error:    <AlertCircle  size={10} />,
  };
  return (
    <span className={`auto-badge auto-badge--${status}`}>
      {icons[status]}
      {STATUS_LABELS[status]}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tarjeta de automatización
───────────────────────────────────────────────────────────── */
function AutomationCard({ automation }: { automation: Automation }) {
  const { toggleStatus, deleteItem } = useAutomationStore();
  const isActive = automation.status === 'activa';

  const lastRun = automation.ultimaEjec
    ? new Intl.DateTimeFormat('es-CO', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      }).format(new Date(automation.ultimaEjec))
    : 'Nunca';

  return (
    <div className={`auto-card ${automation.status === 'error' ? 'auto-card--error' : ''}`}>
      {/* Accent line arriba para error */}
      {automation.status === 'error' && <div className="auto-card__error-line" />}

      <div className="auto-card__header">
        <div className="auto-card__icon-wrap">
          <Zap size={14} />
        </div>

        <div className="auto-card__meta">
          <span className="auto-card__name">{automation.nombre}</span>
          {automation.equipo && (
            <span className="auto-card__equipo">
              {EQUIPOS_LABELS[automation.equipo] ?? automation.equipo}
            </span>
          )}
        </div>

        <div className="auto-card__actions">
          <StatusBadge status={automation.status} />

          <button
            className="auto-card__toggle"
            title={isActive ? 'Desactivar' : 'Activar'}
            onClick={() => toggleStatus(automation.id)}
          >
            {isActive
              ? <ToggleRight size={18} className="auto-card__toggle--on" />
              : <ToggleLeft  size={18} />
            }
          </button>

          <button
            className="auto-card__delete"
            title="Eliminar"
            onClick={() => deleteItem(automation.id)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <p className="auto-card__desc">{automation.descripcion}</p>

      {/* Trigger → Action flow */}
      <div className="auto-card__flow">
        <div className="auto-card__flow-step auto-card__flow-step--trigger">
          <span className="auto-card__flow-label">CUANDO</span>
          <span className="auto-card__flow-value">
            {TRIGGER_LABELS[automation.trigger.type]}
            {automation.trigger.value && (
              <span className="auto-card__flow-param">
                <ChevronRight size={10} />
                {automation.trigger.value}
              </span>
            )}
          </span>
        </div>

        <div className="auto-card__flow-arrow">→</div>

        <div className="auto-card__flow-step auto-card__flow-step--action">
          <span className="auto-card__flow-label">ENTONCES</span>
          <span className="auto-card__flow-value">
            {ACTION_LABELS[automation.action.type]}
            {automation.action.value && (
              <span className="auto-card__flow-param">
                <ChevronRight size={10} />
                {automation.action.value}
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Footer stats */}
      <div className="auto-card__footer">
        <span className="auto-card__stat">
          <Zap size={10} />
          {automation.ejecutadas} ejecuciones
        </span>
        <span className="auto-card__stat auto-card__stat--muted">
          Última: {lastRun}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Stats header
───────────────────────────────────────────────────────────── */
function AutomationStats({ automations }: { automations: Automation[] }) {
  const activas   = automations.filter((a) => a.status === 'activa').length;
  const inactivas = automations.filter((a) => a.status === 'inactiva').length;
  const errores   = automations.filter((a) => a.status === 'error').length;
  const total     = automations.reduce((sum, a) => sum + a.ejecutadas, 0);

  return (
    <div className="auto-stats">
      <div className="auto-stats__item">
        <span className="auto-stats__value auto-stats__value--active">{activas}</span>
        <span className="auto-stats__label">Activas</span>
      </div>
      <div className="auto-stats__divider" />
      <div className="auto-stats__item">
        <span className="auto-stats__value">{inactivas}</span>
        <span className="auto-stats__label">Inactivas</span>
      </div>
      <div className="auto-stats__divider" />
      <div className="auto-stats__item">
        <span className="auto-stats__value auto-stats__value--error">{errores}</span>
        <span className="auto-stats__label">Con error</span>
      </div>
      <div className="auto-stats__divider" />
      <div className="auto-stats__item">
        <span className="auto-stats__value auto-stats__value--accent">{total}</span>
        <span className="auto-stats__label">Ejecuciones</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Página principal
───────────────────────────────────────────────────────────── */
export function AutomationsPage() {
  const { automations } = useAutomationStore();
  const [filter, setFilter] = useState<'todas' | AutomationStatus>('todas');

  const filtered = filter === 'todas'
    ? automations
    : automations.filter((a) => a.status === filter);

  return (
    <div className="auto-page">

      {/* ── Header ─────────────────────────────────── */}
      <div className="auto-page__header">
        <div className="auto-page__header-left">
          <div className="auto-page__title-wrap">
            <Zap size={18} className="auto-page__title-icon" />
            <h1 className="auto-page__title">Automatizaciones</h1>
          </div>
          <p className="auto-page__subtitle">
            Reglas que se ejecutan automáticamente cuando ocurren eventos en tus solicitudes.
          </p>
        </div>

        <button className="auto-page__new-btn">
          <Plus size={14} />
          Nueva automatización
        </button>
      </div>

      {/* ── Stats ──────────────────────────────────── */}
      <AutomationStats automations={automations} />

      {/* ── Filtros ────────────────────────────────── */}
      <div className="auto-filters">
        {(['todas', 'activa', 'inactiva', 'error'] as const).map((f) => (
          <button
            key={f}
            className={['auto-filter-btn', filter === f ? 'auto-filter-btn--active' : ''].join(' ')}
            onClick={() => setFilter(f)}
          >
            {f === 'todas' ? 'Todas' : STATUS_LABELS[f as AutomationStatus]}
            <span className="auto-filter-btn__count">
              {f === 'todas'
                ? automations.length
                : automations.filter((a) => a.status === f).length}
            </span>
          </button>
        ))}
      </div>

      {/* ── Grid de tarjetas ───────────────────────── */}
      {filtered.length === 0 ? (
        <div className="auto-empty">
          <Zap size={32} className="auto-empty__icon" />
          <p className="auto-empty__text">No hay automatizaciones en este filtro.</p>
        </div>
      ) : (
        <div className="auto-grid">
          {filtered.map((a) => (
            <AutomationCard key={a.id} automation={a} />
          ))}
        </div>
      )}
    </div>
  );
}