import { useState } from 'react';
import { X, Zap } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAutomationStore } from '@/store/automationStore';
import { useCreateAutomationRule } from '@/features/automations/hooks/useAutomationRules';
import { apiClient } from '@/lib/apiClient';
import {
  TRIGGER_LABELS,
  ACTION_LABELS,
  KNOWN_COLUMNS,
  PRIORITY_OPTIONS,
  NOTIFY_TARGETS,
} from '@/features/automations/types';
import type { AutomationTriggerType, AutomationActionType } from '@/features/automations/types';

const TRIGGER_ACTIONS: Record<AutomationTriggerType, AutomationActionType[]> = {
  solicitud_creada: ['asignar_resolutor', 'notificar_usuario'],
  columna_cambiada: ['asignar_resolutor', 'asignar_prioridad', 'notificar_usuario'],
};

export function CreateAutomationModal() {
  const { closeModal } = useAutomationStore();
  const createRule     = useCreateAutomationRule();

  const [name,         setName]         = useState('');
  const [description,  setDescription]  = useState('');
  const [teamId,       setTeamId]       = useState<number | null>(null);
  const [trigger,      setTrigger]      = useState<AutomationTriggerType>('solicitud_creada');
  const [triggerValue, setTriggerValue] = useState('');
  const [action,       setAction]       = useState<AutomationActionType>('asignar_resolutor');
  const [actionValue,  setActionValue]  = useState('');

  const { data: teams = [] } = useQuery({
    queryKey: ['automation-board-teams'],
    queryFn: () =>
      apiClient.call<{ Board_Team_ID: number; Board_Team_Name: string }[]>(
        'fetchAllTeams', {},
      ),
    staleTime: Infinity,
  });

  // Necesario para asignar_resolutor Y notificar_usuario (usuario específico)
const { data: rawUsers = [] } = useQuery({
  queryKey: ['automation-users'],
  queryFn: () =>
    apiClient.call<{ User_ID: number; User_Name: string }[]>(
      'fetchAllUsers', {},
    ),
  staleTime: 1000 * 60 * 5,
  enabled: action === 'asignar_resolutor' || action === 'notificar_usuario',
});

// Pre-registrados tienen User_Name vacío — excluirlos del selector
const users = rawUsers.filter((u) => u.User_Name.trim() !== '');

  const handleTriggerChange = (t: AutomationTriggerType) => {
    setTrigger(t);
    setTriggerValue('');
    setAction(TRIGGER_ACTIONS[t][0]);
    setActionValue('');
  };

  const handleActionChange = (a: AutomationActionType) => {
    setAction(a);
    setActionValue('');
  };

  const handleSubmit = async () => {
    await createRule.mutateAsync({
      name:         name.trim(),
      description:  description.trim() || null,
      teamId,
      trigger,
      triggerValue: triggerValue || null,
      action,
      actionValue,
    });
    closeModal();
  };

  const isValid =
    name.trim().length > 0 &&
    actionValue !== '' &&
    (trigger !== 'columna_cambiada' || triggerValue !== '');

  return (
    <div className="auto-modal-overlay" onClick={closeModal}>
      <div className="auto-modal" onClick={(e) => e.stopPropagation()}>

        <div className="auto-modal__header">
          <div className="auto-modal__title-wrap">
            <div className="auto-modal__icon"><Zap size={14} /></div>
            <h2 className="auto-modal__title">Nueva automatización</h2>
          </div>
          <button className="auto-modal__close" onClick={closeModal}>
            <X size={16} />
          </button>
        </div>

        <div className="auto-modal__body">

          <div className="auto-modal__field">
            <label className="auto-modal__label">
              Nombre <span className="auto-modal__required">*</span>
            </label>
            <input
              className="auto-modal__input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Avisar al solicitante cuando entre a QAs"
            />
          </div>

          <div className="auto-modal__field">
            <label className="auto-modal__label">Descripción</label>
            <textarea
              className="auto-modal__textarea"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="¿Qué hace esta regla?"
            />
          </div>

          <div className="auto-modal__field">
            <label className="auto-modal__label">Equipo</label>
            <select
              className="auto-modal__select"
              value={teamId ?? ''}
              onChange={(e) =>
                setTeamId(e.target.value === '' ? null : Number(e.target.value))
              }
            >
              <option value="">Todos los equipos</option>
              {teams.map((t) => (
                <option key={t.Board_Team_ID} value={t.Board_Team_ID}>
                  {t.Board_Team_Name}
                </option>
              ))}
            </select>
          </div>

          <div className="auto-modal__divider" />
          <p className="auto-modal__section-label">Cuando…</p>

          <div className="auto-modal__row">
            <div className="auto-modal__field auto-modal__field--flex">
              <label className="auto-modal__label">Disparador</label>
              <select
                className="auto-modal__select"
                value={trigger}
                onChange={(e) => handleTriggerChange(e.target.value as AutomationTriggerType)}
              >
                {(Object.keys(TRIGGER_LABELS) as AutomationTriggerType[]).map((t) => (
                  <option key={t} value={t}>{TRIGGER_LABELS[t]}</option>
                ))}
              </select>
            </div>

            {trigger === 'columna_cambiada' && (
              <div className="auto-modal__field auto-modal__field--flex">
                <label className="auto-modal__label">
                  Columna <span className="auto-modal__required">*</span>
                </label>
                <select
                  className="auto-modal__select"
                  value={triggerValue}
                  onChange={(e) => setTriggerValue(e.target.value)}
                >
                  <option value="">Seleccionar columna…</option>
                  {KNOWN_COLUMNS.map((col) => (
                    <option key={col} value={col}>{col}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <p className="auto-modal__section-label">Entonces…</p>

          <div className="auto-modal__row">
            <div className="auto-modal__field auto-modal__field--flex">
              <label className="auto-modal__label">Acción</label>
              <select
                className="auto-modal__select"
                value={action}
                onChange={(e) => handleActionChange(e.target.value as AutomationActionType)}
              >
                {TRIGGER_ACTIONS[trigger].map((a) => (
                  <option key={a} value={a}>{ACTION_LABELS[a]}</option>
                ))}
              </select>
            </div>

            {/* Asignar resolutor */}
            {action === 'asignar_resolutor' && (
              <div className="auto-modal__field auto-modal__field--flex">
                <label className="auto-modal__label">
                  Resolutor <span className="auto-modal__required">*</span>
                </label>
                <select
                  className="auto-modal__select"
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                >
                  <option value="">Seleccionar usuario…</option>
                  {users.map((u) => (
                    <option key={u.User_ID} value={String(u.User_ID)}>
                      {u.User_Name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Asignar prioridad */}
            {action === 'asignar_prioridad' && (
              <div className="auto-modal__field auto-modal__field--flex">
                <label className="auto-modal__label">
                  Prioridad <span className="auto-modal__required">*</span>
                </label>
                <select
                  className="auto-modal__select"
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                >
                  <option value="">Seleccionar prioridad…</option>
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Notificar usuario */}
            {action === 'notificar_usuario' && (
              <div className="auto-modal__field auto-modal__field--flex">
                <label className="auto-modal__label">
                  Destinatario <span className="auto-modal__required">*</span>
                </label>
                <select
                  className="auto-modal__select"
                  value={actionValue}
                  onChange={(e) => setActionValue(e.target.value)}
                >
                  <option value="">Seleccionar destinatario…</option>
                  <optgroup label="Por rol en el ticket">
                    {NOTIFY_TARGETS[trigger].map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </optgroup>
                  {users.length > 0 && (
                    <optgroup label="Usuario específico">
                      {users.map((u) => (
                        <option key={u.User_ID} value={String(u.User_ID)}>
                          {u.User_Name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            )}
          </div>

        </div>

        <div className="auto-modal__footer">
          <button className="auto-modal__cancel-btn" onClick={closeModal}>
            Cancelar
          </button>
          <button
            className="auto-modal__submit-btn"
            onClick={handleSubmit}
            disabled={!isValid || createRule.isPending}
          >
            {createRule.isPending ? 'Creando…' : 'Crear regla'}
          </button>
        </div>

      </div>
    </div>
  );
}