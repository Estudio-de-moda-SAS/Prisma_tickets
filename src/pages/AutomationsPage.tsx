import { useState } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  CheckCircle2,
  Clock,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { useAutomationStore } from '@/store/automationStore';
import {
  useAutomationRules,
  useToggleAutomationRule,
  useDeleteAutomationRule,
} from '@/features/automations/hooks/useAutomationRules';
import { CreateAutomationModal } from '@/features/automations/components/CreateAutomationModal';
import { TRIGGER_LABELS, ACTION_LABELS } from '@/features/automations/types';
import type { AutomationRule } from '@/features/automations/types';
import '@/styles/automations.css';

/* ── Badge ──────────────────────────────────────────────────── */
function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span className={`auto-badge ${isActive ? 'auto-badge--activa' : 'auto-badge--inactiva'}`}>
      {isActive ? <CheckCircle2 size={10} /> : <Clock size={10} />}
      {isActive ? 'Activa' : 'Inactiva'}
    </span>
  );
}

/* ── Tarjeta ────────────────────────────────────────────────── */
function AutomationCard({ rule }: { rule: AutomationRule }) {
  const toggle = useToggleAutomationRule();
  const remove = useDeleteAutomationRule();

  const lastRun = rule.lastExecAt
    ? new Intl.DateTimeFormat('es-CO', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      }).format(new Date(rule.lastExecAt))
    : 'Nunca';

  return (
    <div className="auto-card">
      <div className="auto-card__header">
        <div className="auto-card__icon-wrap">
          <Zap size={14} />
        </div>

        <div className="auto-card__meta">
          <span className="auto-card__name">{rule.ruleName}</span>
          {rule.teamName && (
            <span className="auto-card__equipo">{rule.teamName}</span>
          )}
        </div>

        <div className="auto-card__actions">
          <StatusBadge isActive={rule.isActive} />

          <button
            className="auto-card__toggle"
            title={rule.isActive ? 'Desactivar' : 'Activar'}
            disabled={toggle.isPending}
            onClick={() =>
              toggle.mutate({ ruleId: rule.ruleId, isActive: !rule.isActive })
            }
          >
            {rule.isActive
              ? <ToggleRight size={18} className="auto-card__toggle--on" />
              : <ToggleLeft  size={18} />
            }
          </button>

          <button
            className="auto-card__delete"
            title="Eliminar"
            disabled={remove.isPending}
            onClick={() => remove.mutate(rule.ruleId)}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {rule.ruleDescription && (
        <p className="auto-card__desc">{rule.ruleDescription}</p>
      )}

      <div className="auto-card__flow">
        <div className="auto-card__flow-step auto-card__flow-step--trigger">
          <span className="auto-card__flow-label">CUANDO</span>
          <span className="auto-card__flow-value">
            {TRIGGER_LABELS[rule.trigger]}
            {rule.triggerValue && (
              <span className="auto-card__flow-param">
                <ChevronRight size={10} />
                {rule.triggerValue}
              </span>
            )}
          </span>
        </div>

        <div className="auto-card__flow-arrow">→</div>

        <div className="auto-card__flow-step auto-card__flow-step--action">
          <span className="auto-card__flow-label">ENTONCES</span>
          <span className="auto-card__flow-value">
            {ACTION_LABELS[rule.action]}
            {(rule.actionValueLabel ?? rule.actionValue) && (
              <span className="auto-card__flow-param">
                <ChevronRight size={10} />
                {rule.actionValueLabel ?? rule.actionValue}
              </span>
            )}
          </span>
        </div>
      </div>

      <div className="auto-card__footer">
        <span className="auto-card__stat">
          <Zap size={10} />
          {rule.execCount} ejecuciones
        </span>
        <span className="auto-card__stat auto-card__stat--muted">
          Última: {lastRun}
        </span>
      </div>
    </div>
  );
}

/* ── Stats ──────────────────────────────────────────────────── */
function AutomationStats({ rules }: { rules: AutomationRule[] }) {
  const activas   = rules.filter((r) => r.isActive).length;
  const inactivas = rules.filter((r) => !r.isActive).length;
  const total     = rules.reduce((sum, r) => sum + r.execCount, 0);

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
        <span className="auto-stats__value auto-stats__value--accent">{total}</span>
        <span className="auto-stats__label">Ejecuciones</span>
      </div>
    </div>
  );
}

/* ── Página principal ───────────────────────────────────────── */
type FilterType = 'todas' | 'activa' | 'inactiva';

export function AutomationsPage() {
  const { isModalOpen, openModal } = useAutomationStore();
  const { data: rules = [], isLoading } = useAutomationRules();
  const [filter, setFilter] = useState<FilterType>('todas');

  const filtered =
    filter === 'todas'
      ? rules
      : rules.filter((r) => (filter === 'activa' ? r.isActive : !r.isActive));

  return (
    <div className="auto-page">

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

        <button className="auto-page__new-btn" onClick={openModal}>
          <Plus size={14} />
          Nueva automatización
        </button>
      </div>

      {!isLoading && <AutomationStats rules={rules} />}

      <div className="auto-filters">
        {(['todas', 'activa', 'inactiva'] as FilterType[]).map((f) => (
          <button
            key={f}
            className={['auto-filter-btn', filter === f ? 'auto-filter-btn--active' : ''].join(' ')}
            onClick={() => setFilter(f)}
          >
            {f === 'todas' ? 'Todas' : f === 'activa' ? 'Activas' : 'Inactivas'}
            <span className="auto-filter-btn__count">
              {f === 'todas'
                ? rules.length
                : rules.filter((r) => (f === 'activa' ? r.isActive : !r.isActive)).length}
            </span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="auto-empty">
          <Loader2 size={24} className="auto-empty__icon" style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="auto-empty">
          <Zap size={32} className="auto-empty__icon" />
          <p className="auto-empty__text">No hay reglas en este filtro.</p>
        </div>
      ) : (
        <div className="auto-grid">
          {filtered.map((r) => (
            <AutomationCard key={r.ruleId} rule={r} />
          ))}
        </div>
      )}

      {isModalOpen && <CreateAutomationModal />}
    </div>
  );
}