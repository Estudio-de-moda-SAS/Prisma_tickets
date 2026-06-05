import type { Prioridad } from '@/features/requests/types';
import { PRIORIDADES, KANBAN_COLUMNAS } from '@/features/requests/types';

export type AutomationTriggerType =
  | 'solicitud_creada'
  | 'columna_cambiada';

export type AutomationActionType =
  | 'asignar_resolutor'
  | 'asignar_prioridad'
  | 'notificar_usuario';

export type AutomationRule = {
  ruleId:           number;
  ruleName:         string;
  ruleDescription:  string | null;
  teamId:           number | null;
  teamName:         string | null;
  trigger:          AutomationTriggerType;
  triggerValue:     string | null;
  action:           AutomationActionType;
  actionValue:      string;
  actionValueLabel: string | null;
  isActive:         boolean;
  execCount:        number;
  lastExecAt:       string | null;
  createdAt:        string;
};

export const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  solicitud_creada: 'Solicitud creada',
  columna_cambiada: 'Columna cambiada',
};

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  asignar_resolutor: 'Asignar resolutor',
  asignar_prioridad: 'Asignar prioridad',
  notificar_usuario: 'Notificar usuario',
};

// Fuente única de verdad: viene de requests/types.ts
export const KNOWN_COLUMNS = Object.values(KANBAN_COLUMNAS);

// value = Prioridad ('baja' | 'media' | 'alta' | 'critica'), label = display
export const PRIORITY_OPTIONS = (Object.entries(PRIORIDADES) as [Prioridad, string][]).map(
  ([value, label]) => ({ value, label }),
);

export const NOTIFY_TARGETS: Record<AutomationTriggerType, { value: string; label: string }[]> = {
  solicitud_creada: [
    { value: 'solicitante', label: 'Solicitante' },
  ],
  columna_cambiada: [
    { value: 'asignados',   label: 'Resolutores asignados'  },
    { value: 'solicitante', label: 'Solicitante'             },
    { value: 'todos',       label: 'Todos los participantes' },
  ],
};