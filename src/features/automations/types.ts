/* ============================================================
   Automatizaciones — Tipos
   ============================================================ */

export type AutomationTriggerType =
  | 'solicitud_creada'
  | 'columna_cambiada'
  | 'prioridad_cambiada'
  | 'resolutor_asignado'
  | 'progreso_completado';

export type AutomationActionType =
  | 'notificar_email'
  | 'cambiar_columna'
  | 'asignar_prioridad'
  | 'asignar_resolutor'
  | 'webhook';

export type AutomationStatus = 'activa' | 'inactiva' | 'error';

export type AutomationTrigger = {
  type:  AutomationTriggerType;
  value: string | null; // valor contextual (ej: columna destino)
};

export type AutomationAction = {
  type:  AutomationActionType;
  value: string; // valor a aplicar
};

export type Automation = {
  id:           string;
  nombre:       string;
  descripcion:  string;
  equipo:       string | null; // null = todos los equipos
  trigger:      AutomationTrigger;
  action:       AutomationAction;
  status:       AutomationStatus;
  ejecutadas:   number;
  creadaEn:     string; // ISO date
  ultimaEjec:   string | null; // ISO date
};

/* ──── Labels ───────────────────────────────────────────────── */

export const TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  solicitud_creada:    'Solicitud creada',
  columna_cambiada:    'Columna cambiada',
  prioridad_cambiada:  'Prioridad cambiada',
  resolutor_asignado:  'Resolutor asignado',
  progreso_completado: 'Progreso al 100%',
};

export const ACTION_LABELS: Record<AutomationActionType, string> = {
  notificar_email:   'Enviar email',
  cambiar_columna:   'Cambiar columna',
  asignar_prioridad: 'Asignar prioridad',
  asignar_resolutor: 'Asignar resolutor',
  webhook:           'Llamar webhook',
};

export const STATUS_LABELS: Record<AutomationStatus, string> = {
  activa:   'Activa',
  inactiva: 'Inactiva',
  error:    'Error',
};

/* ──── Mock data ────────────────────────────────────────────── */

export const EQUIPOS_LABELS: Record<string, string> = {
  desarrollo: 'Desarrollo',
  crm:        'CRM',
  sistemas:   'Sistemas de Información',
  analisis:   'Análisis de Datos',
};

export const MOCK_AUTOMATIONS: Automation[] = [
  {
    id:          'auto-001',
    nombre:      'Notificar al crear solicitud crítica',
    descripcion: 'Envía un email cuando se crea una solicitud con prioridad crítica.',
    equipo:      null,
    trigger:     { type: 'solicitud_creada',   value: 'critica' },
    action:      { type: 'notificar_email',     value: 'equipo@empresa.com' },
    status:      'activa',
    ejecutadas:  42,
    creadaEn:    '2026-03-10T09:00:00Z',
    ultimaEjec:  '2026-04-11T14:22:00Z',
  },
  {
    id:          'auto-002',
    nombre:      'Asignar prioridad alta al mover a En progreso',
    descripcion: 'Cuando una tarjeta entra a "En progreso", sube la prioridad a alta.',
    equipo:      'desarrollo',
    trigger:     { type: 'columna_cambiada',    value: 'en_progreso' },
    action:      { type: 'asignar_prioridad',   value: 'alta' },
    status:      'activa',
    ejecutadas:  18,
    creadaEn:    '2026-03-15T11:30:00Z',
    ultimaEjec:  '2026-04-10T16:05:00Z',
  },
  {
    id:          'auto-003',
    nombre:      'Webhook al completar solicitud',
    descripcion: 'Llama al webhook externo cuando una solicitud llega a "Hecho".',
    equipo:      null,
    trigger:     { type: 'columna_cambiada',    value: 'hecho' },
    action:      { type: 'webhook',             value: 'https://hooks.empresa.com/done' },
    status:      'inactiva',
    ejecutadas:  7,
    creadaEn:    '2026-03-20T08:00:00Z',
    ultimaEjec:  '2026-04-05T10:11:00Z',
  },
  {
    id:          'auto-004',
    nombre:      'Auto-asignar resolutor CRM',
    descripcion: 'Asigna automáticamente un resolutor por defecto en el equipo CRM.',
    equipo:      'crm',
    trigger:     { type: 'solicitud_creada',    value: null },
    action:      { type: 'asignar_resolutor',   value: 'Carlos M.' },
    status:      'error',
    ejecutadas:  3,
    creadaEn:    '2026-04-01T13:00:00Z',
    ultimaEjec:  '2026-04-08T09:45:00Z',
  },
];